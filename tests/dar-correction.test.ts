import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';
import type { DarRecord, CurrentUserSession } from '../src/types';

const dcc = { uid: 'dcc', currentDept: 'DCC', userName: 'DCC', userRole: 'DCC_ADMIN' } as CurrentUserSession;
const fixture = (): DarRecord => ({
  id: 'DAR-2026-0001', requestType: 'REVISION', status: 'PENDING_REVIEW', requestDept: 'HR',
  requesterName: 'HR', requesterTitle: 'HR', requestDate: '2026-10-22',
  docNo: 'WI-HR-01', docNameTh: 'เอกสารทดสอบ', docNameEn: '', docType: 'WI',
  currentRevision: '00', proposedRevision: '02', previousEffectiveDate: '2026-09-30', targetEffectiveDate: '2026-10-23',
  reasonForChange: 'แก้ไขเอกสาร', changeDetails: '',
  additionalDocuments: [{ docNo: 'WI-HR-02', docNameTh: 'รายการเพิ่มเติม', docNameEn: '', previousEffectiveDate: '2026-09-30', revision: '02', reason: 'แก้ไขเอกสาร' }],
});
const updates = (dar: DarRecord, patch: Partial<DarRecord> = {}) => ({
  docNo: dar.docNo, docNameTh: dar.docNameTh, docNameEn: dar.docNameEn || '',
  currentRevision: dar.currentRevision, proposedRevision: dar.proposedRevision,
  targetEffectiveDate: dar.targetEffectiveDate, previousEffectiveDate: dar.previousEffectiveDate || '',
  reasonForChange: dar.reasonForChange, changeDetails: dar.changeDetails || '',
  additionalDocuments: structuredClone(dar.additionalDocuments || []), ...patch,
});
const reversedKeys = (value: any): any => Array.isArray(value) ? value.map(reversedKeys)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reversedKeys(item)])) : value;
let compiled: string;
async function setup(base = fixture()) {
  if (!compiled) {
    const mocks: Record<string, string> = {
      firestore: `const h=globalThis.__h; export const collection=(_,name)=>({name}); export const doc=(db,name,id)=>({name:id?name:db.name,id:id||name||'audit'}); export const runTransaction=async(_,cb)=>{const writes=[];await cb({get:async()=>({exists:()=>h.exists,data:()=>structuredClone(h.latest)}),update:(ref,data)=>writes.push(['update',ref,data]),set:(ref,data)=>writes.push(['set',ref,data])});for(const[k,ref,data]of writes){h.writes.push({kind:k,ref,data});if(k==='update')Object.assign(h.latest,data);else h.audits.push(data);}};export const getDoc=()=>{};export const getDocs=()=>{};export const getDocFromServer=()=>{};export const writeBatch=()=>{};export const onSnapshot=()=>{};export const orderBy=()=>{};export const query=()=>{};export const where=()=>{};export const setDoc=()=>{};export const Timestamp={};export const updateDoc=()=>{};`,
      storage: `export const deleteObject=()=>{};export const getDownloadURL=()=>{};export const ref=()=>{};export const uploadBytes=()=>{};export const uploadBytesResumable=()=>{};`,
      functions: `export const httpsCallable=()=>{};`,
      firebase: `export const db={};export const auth={};export const firebaseFunctions={};export const storage={};`,
    };
    const output = await build({ entryPoints: ['src/services/dcsRepository.ts'], bundle: true, platform: 'node', format: 'cjs', write: false, plugins: [{ name: 'firestore-boundary', setup(b) {
      b.onResolve({ filter: /lib\/firebase$/ }, () => ({ path: 'firebase', namespace: 'mock' }));
      b.onResolve({ filter: /^firebase\// }, args => ({ path: args.path.split('/')[1], namespace: 'mock' }));
      b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], loader: 'js' }));
    } }] });
    compiled = output.outputFiles[0].text;
  }
  const h = { latest: reversedKeys(base), exists: true, writes: [] as any[], audits: [] as any[] };
  const context: any = { __h: h, module: { exports: {} }, structuredClone, Date, console };
  vm.runInNewContext(compiled, context);
  return { h, save: (patch: ReturnType<typeof updates>, user = dcc, reason = 'แก้ไขข้อมูลที่กรอกผิด') => context.module.exports.correctDarRecord(user, base, patch, reason) };
}

test('changing a row revision succeeds when Firestore returns the same maps in another key order', async () => {
  const base = fixture(), { h, save } = await setup(base), form = updates(base);
  form.additionalDocuments[0].revision = '01';
  await save(form);
  assert.equal(h.latest.additionalDocuments[0].revision, '01');
  assert.deepEqual(Object.keys(h.audits[0].details.changes), ['additionalDocuments']);
  assert.equal(h.audits[0].details.changes.additionalDocuments.before[0].revision, '02');
});
test('legacy absent and empty optional fields do not cause a false conflict', async () => {
  const base = fixture(); delete base.additionalDocuments[0].docNameEn; delete base.previousEffectiveDate;
  base.requestType = 'NEW'; base.currentRevision = 'N/A';
  const { h, save } = await setup(base); h.latest.previousEffectiveDate = ''; h.latest.additionalDocuments[0].docNameEn = '';
  await save(updates(base, { reasonForChange: 'แก้ไขเหตุผล' }));
  assert.equal(h.latest.reasonForChange, 'แก้ไขเหตุผล'); assert.equal(h.audits.length, 1);
});
test('a correction preserves unrelated concurrent edits and does not normalize untouched legacy text', async () => {
  const base = fixture(); base.docNo = 'wi-hr-01'; base.docNameTh = ' เอกสารทดสอบ ';
  const { h, save } = await setup(base); h.latest.reasonForChange = 'เหตุผลล่าสุดจาก DCC';
  await save(updates(base, { proposedRevision: '01' }));
  assert.equal(h.latest.proposedRevision, '01'); assert.equal(h.latest.reasonForChange, 'เหตุผลล่าสุดจาก DCC');
  assert.equal(h.latest.docNo, base.docNo); assert.equal(h.latest.docNameTh, base.docNameTh);
  assert.deepEqual(Object.keys(h.audits[0].details.changes), ['proposedRevision']);
  assert.equal(h.audits[0].revision, '01');
});
test('a real conflict in the same field is named and never overwritten', async () => {
  const base = fixture(), { h, save } = await setup(base); h.latest.proposedRevision = '03';
  await assert.rejects(save(updates(base, { proposedRevision: '01' })), /Rev\. ที่เสนอ/);
  assert.equal(h.latest.proposedRevision, '03'); assert.equal(h.writes.length, 0);
});
test('changed row order or row content still conflicts when correcting the additional rows', async () => {
  const base = fixture(); base.additionalDocuments.push({ ...base.additionalDocuments[0], docNo: 'WI-HR-03' });
  for (const change of ['order', 'content']) {
    const { h, save } = await setup(base), form = updates(base); form.additionalDocuments[0].revision = '01';
    if (change === 'order') h.latest.additionalDocuments.reverse(); else h.latest.additionalDocuments[0].reason = 'เหตุผลล่าสุด';
    await assert.rejects(save(form), /รายการเอกสารเพิ่มเติม/); assert.equal(h.writes.length, 0);
  }
});
test('approved DARs retain the dates-and-reasons restriction and preserve document identity', async () => {
  for (const status of ['APPROVED', 'REGISTERED'] as const) {
    const base = fixture(); base.status = status; base.docNo = 'wi-hr-01'; base.docNameTh = ' เอกสารทดสอบ ';
    const { h, save } = await setup(base);
    await save(updates(base, { targetEffectiveDate: '2026-10-24', reasonForChange: 'แก้ไขเหตุผล' }));
    assert.equal(h.latest.targetEffectiveDate, '2026-10-24'); assert.equal(h.latest.docNo, base.docNo); assert.equal(h.latest.docNameTh, base.docNameTh);
    await assert.rejects(save(updates(base, { proposedRevision: '01' })), /เฉพาะวันที่และเหตุผล/);
  }
});
test('latest dates are validated before committing a correction', async () => {
  const base = fixture(), { h, save } = await setup(base); h.latest.previousEffectiveDate = '2026-10-25';
  await assert.rejects(save(updates(base, { targetEffectiveDate: '2026-10-24' })), /วันที่ฉบับใหม่ต้องอยู่หลัง/);
  assert.equal(h.writes.length, 0);
});
test('role, reason, cancelled/deleted DAR, status and request-type checks still block invalid writes', async () => {
  const base = fixture();
  for (const kind of ['role', 'reason', 'cancelled', 'deleted', 'status', 'type']) {
    const { h, save } = await setup(base); let user = dcc, reason = 'แก้ไขข้อมูล';
    if (kind === 'role') user = { ...dcc, userRole: 'STAFF' };
    if (kind === 'reason') reason = '';
    if (kind === 'cancelled') h.latest.status = 'CANCELLED';
    if (kind === 'deleted') h.exists = false;
    if (kind === 'status') h.latest.status = 'APPROVED';
    if (kind === 'type') h.latest.requestType = 'NEW';
    await assert.rejects(save(updates(base, { proposedRevision: '01' }), user, reason)); assert.equal(h.writes.length, 0);
  }
});
test('already-saved identical changes do not create duplicate audit records; unchanged forms remain no-ops', async () => {
  const base = fixture(), { h, save } = await setup(base); h.latest.proposedRevision = '01';
  await save(updates(base, { proposedRevision: '01' })); assert.equal(h.writes.length, 0);
  await assert.rejects(save(updates(base)), /ไม่มีข้อมูลที่เปลี่ยนแปลง/);
});
