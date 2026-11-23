import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';

const dcc = { uid: 'dcc', currentDept: 'DCC', userName: 'DCC', userRole: 'DCC_ADMIN' };
const base = () => ({ id: 'DAR-TEST-1', status: 'APPROVED', requestType: 'NEW', requestDept: 'HR',
  docNo: 'WI-HR-01', docNameTh: 'เอกสารหลัก', docNameEn: '', docType: 'WI', currentRevision: 'N/A', proposedRevision: '00',
  targetEffectiveDate: '2026-11-03', reasonForChange: 'ขึ้นทะเบียนใหม่', distributionHolders: [{ dept: 'HR', checked: true, copies: '1', position: 'HR' }],
  additionalDocuments: [2, 3, 4].map(i => ({ docNo: `WI-HR-0${i}`, docNameTh: `รายการ ${i}`, revision: '00', reason: 'ใหม่' })) });
let compiled = '';
async function setup(dar = base()) {
  if (!compiled) {
    const mocks: Record<string, string> = {
      firestore: `const h=globalThis.__h; export const collection=(_,name)=>({name}); export const doc=(db,name,id)=>id?({name,id}):({name:db.name,id:'audit-'+(++h.next)}); const key=r=>r.name+'/'+r.id; export const runTransaction=async(_,cb)=>{const writes=[];const result=await cb({get:async r=>({exists:()=>h.store.has(key(r)),data:()=>structuredClone(h.store.get(key(r)))}),set:(r,v)=>writes.push(['set',r,v]),update:(r,v)=>writes.push(['update',r,v])});for(const [kind,r,v] of writes){const k=key(r);h.store.set(k,kind==='update'?{...h.store.get(k),...v}:v);h.writes.push({kind,key:k,data:v});}return result};export const setDoc=async(r,v)=>{h.store.set(key(r),v)}; export const getDoc=()=>{};export const getDocs=()=>{};export const getDocsFromServer=()=>{};export const getDocFromServer=()=>{};export const writeBatch=()=>{};export const onSnapshot=()=>{};export const orderBy=()=>{};export const query=()=>{};export const where=()=>{};export const Timestamp={};export const updateDoc=()=>{};`,
      storage: `export const deleteObject=()=>{};export const getDownloadURL=()=>{};export const ref=()=>{};export const uploadBytes=()=>{};export const uploadBytesResumable=()=>{};`,
      functions: `const h=globalThis.__h; export const httpsCallable=(_,name)=>async data=>{h.calls.push({name,data});return {data:name==='syncDocumentReturnRequests' && data?.capability ? {capability:h.capability} : name==='createAutomaticDistributionFromDar' && h.distributionId ? {distributionId:h.distributionId} : {skipped:true}}};`,
      firebase: `export const db={};export const auth={currentUser:{uid:'dcc'}};export const firebaseFunctions={};export const storage={};`,
    };
    const output = await build({ entryPoints: ['src/services/dcsRepository.ts'], bundle: true, platform: 'node', format: 'cjs', write: false, plugins: [{ name: 'firebase-boundary', setup(b) {
      b.onResolve({ filter: /lib\/firebase$/ }, () => ({ path: 'firebase', namespace: 'mock' }));
      b.onResolve({ filter: /^firebase\// }, args => ({ path: args.path.split('/')[1], namespace: 'mock' }));
      b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], loader: 'js' }));
    } }] });
    compiled = output.outputFiles[0].text;
  }
  const h = { store: new Map<string, any>([[`dcs_dars/${dar.id}`, structuredClone(dar)]]), writes: [] as any[], calls: [] as any[], capability: 'renumbered-returns-v1', distributionId: '', next: 0 };
  const context: any = { __h: h, module: { exports: {} }, structuredClone, Date, console };
  vm.runInNewContext(compiled, context);
  return { h, repo: context.module.exports };
}

test('registration commits four Master rows and a single DAR status update before one distribution attempt', async () => {
  const dar = base(), { h, repo } = await setup(dar);
  await repo.registerDarRecord(dcc, dar);
  for (let i = 1; i <= 4; i++) {
    const row = h.store.get(`dcs_documents/WI-HR-0${i}`);
    assert.equal(row?.darReferenceId, dar.id);
    assert.equal(row?.currentRevision, '00');
    if (i > 1) assert.equal(row?.distributionSetDocId, 'WI-HR-01');
  }
  assert.equal(h.store.get(`dcs_dars/${dar.id}`).status, 'REGISTERED');
  assert.equal(h.calls.filter(item => item.name === 'createAutomaticDistributionFromDar').length, 1);
});

test('recovery fills only missing rows, writes an audit, never starts distribution and is idempotent', async () => {
  const dar = { ...base(), status: 'REGISTERED' }, { h, repo } = await setup(dar);
  h.store.set('dcs_documents/WI-HR-01', { id: 'WI-HR-01', darReferenceId: dar.id, status: 'ACTIVE', currentRevision: '00' });
  const result = await repo.recoverDarMasterDocuments(dcc, dar);
  assert.equal(result.created.length, 3);
  assert.equal(h.calls.length, 0);
  assert.equal(h.writes.filter(row => row.key.startsWith('dcs_documents/')).length, 3);
  assert.equal(h.writes.filter(row => row.key.startsWith('dcs_audit_logs/')).length, 1);
  assert.equal((await repo.recoverDarMasterDocuments(dcc, dar)).created.length, 0);
  assert.equal(h.writes.filter(row => row.key.startsWith('dcs_audit_logs/')).length, 1);
});

test('a conflict or stale changed DAR does not partially write any Master documents', async () => {
  const dar = base(), { h, repo } = await setup(dar);
  h.store.set('dcs_documents/WI-HR-03', { id: 'WI-HR-03', darReferenceId: 'DAR-OTHER' });
  await assert.rejects(repo.registerDarRecord(dcc, dar), /มีใน Master List/);
  assert.equal(h.writes.length, 0);
  h.store.get(`dcs_dars/${dar.id}`).additionalDocuments[0].docNo = 'WI-OTHER';
  await assert.rejects(repo.registerDarRecord(dcc, dar), /เปลี่ยน/);
  assert.equal(h.writes.length, 0);
});


test('renumbering is an atomic linked registration, then reconciles the old holders', async () => {
  const dar = { ...base(), requestType: 'REVISION', currentRevision: '00', proposedRevision: '01', previousEffectiveDate: '2026-01-01', targetEffectiveDate: '2026-12-01', additionalDocuments: [{ docNo: 'NEW-CODE', docNameTh: 'รายการเดิมเปลี่ยนรหัส', currentRevision: '00', previousEffectiveDate: '2026-01-01', revision: '01', reason: 'เปลี่ยนรหัส' }] };
  const { h, repo } = await setup(dar); h.distributionId = 'DIST-NEW';
  const oldPrimary = { id: 'WI-HR-01', docNo: 'WI-HR-01', status: 'ACTIVE', ownerDept: 'HR', currentRevision: '00', effectiveDate: '2026-01-01', darReferenceId: 'DAR-OLD', revisionHistory: [], createdAt: '2026-01-01' };
  const old = { ...oldPrimary, id: 'OLD-CODE', docNo: 'OLD-CODE', distributionSetDocId: 'OLD-ANCHOR', currentFileStoragePath: 'old.pdf' };
  h.store.set('dcs_documents/WI-HR-01', oldPrimary); h.store.set('dcs_documents/OLD-CODE', old); h.store.set('dcs_documents/OLD-ANCHOR', { ...oldPrimary, id: 'OLD-ANCHOR' });
  await repo.registerDarRecord(dcc, dar, { 'NEW-CODE': 'OLD-CODE' });
  assert.equal(h.store.get('dcs_documents/OLD-CODE').status, 'OBSOLETE');
  assert.equal(h.store.get('dcs_documents/OLD-CODE').currentFileStoragePath, 'old.pdf');
  assert.equal(h.store.get('dcs_documents/NEW-CODE').previousDocumentId, 'OLD-CODE');
  assert.equal(h.store.get('dcs_dars/' + dar.id).linkedPreviousDocuments[0].previousDistributionAnchorId, 'OLD-ANCHOR');
  assert.equal(h.writes.filter(row => row.key.startsWith('dcs_audit_logs/')).length, 1);
  assert.ok(h.calls.some(call => call.name === 'syncDocumentReturnRequests' && call.data.distributionId === 'DIST-NEW'));
});

test('renumbering fails without server capability or with stale source before any write', async () => {
  const dar = { ...base(), requestType: 'REVISION', currentRevision: '00', proposedRevision: '01', additionalDocuments: [{ docNo: 'NEW-CODE', docNameTh: 'เอกสาร', currentRevision: '00', revision: '01', reason: 'เปลี่ยนรหัส' }] };
  const { h, repo } = await setup(dar); h.capability = '';
  await assert.rejects(repo.registerDarRecord(dcc, dar, { 'NEW-CODE': 'OLD-CODE' }), /เซิร์ฟเวอร์ยังไม่พร้อม/); assert.equal(h.writes.length, 0);
  h.capability = 'renumbered-returns-v1';
  h.store.set('dcs_documents/WI-HR-01', { id: 'WI-HR-01', docNo: 'WI-HR-01', status: 'ACTIVE', ownerDept: 'HR', currentRevision: '00', effectiveDate: '2026-01-01', darReferenceId: 'DAR-OLD', revisionHistory: [], createdAt: '2026-01-01' });
  await assert.rejects(repo.registerDarRecord(dcc, dar, { 'NEW-CODE': 'OLD-CODE' }), /ไม่พบรหัสเดิม/); assert.equal(h.writes.length, 0);
});
