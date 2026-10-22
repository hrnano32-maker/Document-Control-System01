import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';
import { validateDarPdf, getDarAttachments, MAX_DAR_PDF_BYTES } from '../src/utils/darAttachments';
const pdf = (text = 'PDF') => new Blob([`%PDF-1.7\n${text}`], { type: 'application/pdf' });
const input = () => ({ requestType: 'NEW', requestDept: 'HR', requesterName: 'HR', requesterTitle: 'HR', requesterSignature: 'registered-signature', deptApproverName: 'HR', deptApproverTitle: 'Manager', deptApproverDate: '2026-10-22', deptApproverSignature: 'approved-signature', targetEffectiveDate: '2026-10-23', docNo: 'WI-HR-01', docNameTh: 'เอกสารทดสอบ', docNameEn: '', docType: 'WI', currentRevision: 'N/A', proposedRevision: '00', reasonForChange: 'ขึ้นทะเบียนเอกสาร', changeDetails: '', distributionHolders: [{ checked: true, dept: 'HR', copies: '1', position: 'HR' }] });
const user = { uid: 'hr', currentDept: 'HR', userName: 'HR', userRole: 'STAFF' };
const attachment = (name: string, file = pdf()) => ({ name, size: '0.1 KB', type: 'application/pdf', file });
test('only PDF extension, MIME and magic header pass; boundary sizes and renamed files fail', async () => {
  await validateDarPdf(pdf(), 'FILE.PDF');
  await validateDarPdf(new Blob(['%PDF-1.7']), 'mobile.pdf');
  for (const [file, name] of [[pdf(), 'file.zip'], [new Blob(['image'], { type: 'application/pdf' }), 'renamed.pdf'], [new Blob(['%PDF-1.7'], { type: 'image/png' }), 'wrong.pdf'], [new Blob([]), 'empty.pdf'], [new Blob([new Uint8Array(MAX_DAR_PDF_BYTES)]), 'large.pdf']] as const) await assert.rejects(validateDarPdf(file, name));
});
test('saved arrays win over compatibility fields and old single-file DARs still have one attachment', () => {
  const legacy = { attachmentStoragePath: 'old.pdf', attachmentFileName: 'old.pdf' };
  assert.equal(getDarAttachments(legacy).length, 1);
  assert.deepEqual(getDarAttachments({ ...legacy, attachments: [{ name: 'new.pdf', size: '', type: 'application/pdf', storagePath: 'new.pdf' }] }).map(x => x.name), ['new.pdf']);
  assert.deepEqual(getDarAttachments({}), []);
});

async function repository() {
  const h = { records: {} as Record<string, any>, uploads: [] as any[], failAt: 0, profile: { active: true, department: 'HR', role: 'STAFF' } };
  const firestore = `const h=globalThis.__h; export const collection=(_,name)=>({name}); export const doc=(db,name,id)=>({name:id?name:db.name,id:id||name||'audit'}); const snap=r=>({exists:()=>true,data:()=>r.name==='users'?h.profile:h.records[r.name+'/'+r.id]}); export const getDocFromServer=async r=>snap(r); export const runTransaction=async(_,cb)=>cb({get:async r=>snap(r),set:(r,v)=>h.records[r.name+'/'+r.id]=v}); export const writeBatch=()=>{const rows=[];return {set:(r,v)=>rows.push([r,v]),commit:async()=>{for(const[r,v]of rows)h.records[r.name+'/'+r.id]=v;}}}; export const getDoc=async()=>{};export const getDocs=async()=>{};export const onSnapshot=()=>()=>{};export const orderBy=()=>{};export const query=()=>{};export const where=()=>{};export const setDoc=()=>{};export const Timestamp={};export const updateDoc=()=>{};`;
  const mocks: Record<string, string> = {
    firestore,
    storage: `const h=globalThis.__h;export const ref=(_,path)=>path;export const uploadBytesResumable=(path,blob,metadata)=>({on:(_,progress,error,done)=>{if(h.failAt===h.uploads.length+1){error(new Error('Upload failed'));return;}h.uploads.push({path,blob,metadata});progress({bytesTransferred:blob.size});done();}});export const deleteObject=()=>{};export const getDownloadURL=()=>{};export const uploadBytes=()=>{};export const getBlob=()=>{};`,
    functions: `export const httpsCallable=()=>()=>{};`,
    firebase: `export const db={};export const storage={};export const firebaseFunctions={};export const auth={currentUser:{uid:'hr',getIdToken:async()=> 'test-token'}};`,
  };
  const bundle = await build({ entryPoints: ['src/services/dcsRepository.ts'], bundle: true, platform: 'node', format: 'cjs', write: false, plugins: [{ name: 'firebase-boundary', setup(b) {
    b.onResolve({ filter: /lib\/firebase$/ }, () => ({ path: 'firebase', namespace: 'fake' }));
    b.onResolve({ filter: /^firebase\// }, args => ({ path: args.path.split('/')[1], namespace: 'fake' }));
    b.onLoad({ filter: /.*/, namespace: 'fake' }, args => ({ contents: mocks[args.path], loader: 'js' }));
  } }] });
  const context: any = { __h: h, module: { exports: {} }, Blob, Uint8Array, URLSearchParams, Date, fetch, setTimeout, clearTimeout, console };
  vm.runInNewContext(bundle.outputFiles[0].text, context);
  return { h, repo: context.module.exports };
}
test('one DAR stores every same-named PDF separately without putting file bytes in Firestore', async () => {
  const { h, repo } = await repository(); const progress: number[] = [];
  const id = await repo.createDarRecord(user, { ...input(), attachments: [attachment('same.pdf', pdf('ONE')), attachment('same.pdf', pdf('TWO'))] }, (_: string, p: number) => progress.push(p));
  const dar = h.records['dcs_dars/' + id];
  assert.equal(Object.keys(h.records).filter(x => x.startsWith('dcs_dars/')).length, 1);
  assert.equal(dar.attachments.length, 2); assert.equal(new Set(h.uploads.map(x => x.path)).size, 2);
  assert.notEqual(await h.uploads[0].blob.text(), await h.uploads[1].blob.text());
  assert.equal(dar.attachmentStoragePath, dar.attachments[0].storagePath);
  assert.ok(!JSON.stringify(dar).includes('%PDF-')); assert.ok(!JSON.stringify(dar).includes('dataUrl'));
  assert.equal(progress.at(-1), 100);
});
test('invalid last file and more than 20 PDFs are rejected before any upload or DAR allocation', async () => {
  const { h, repo } = await repository();
  for (const attachments of [[attachment('good.pdf'), attachment('bad.pdf', new Blob(['not PDF']))], Array.from({ length: 21 }, () => attachment('file.pdf')), []]) await assert.rejects(repo.createDarRecord(user, { ...input(), attachments }));
  assert.equal(h.uploads.length, 0); assert.deepEqual(h.records, {});
});
test('upload failure does not publish a partial DAR or its audit; valid 20-file set is supported', async () => {
  const failed = await repository(); failed.h.failAt = 2;
  await assert.rejects(failed.repo.createDarRecord(user, { ...input(), attachments: [attachment('a.pdf'), attachment('b.pdf')] }));
  assert.ok(!Object.keys(failed.h.records).some(x => /dcs_dars|dcs_audit_logs/.test(x)));
  const full = await repository(); const id = await full.repo.createDarRecord(user, { ...input(), attachments: Array.from({ length: 20 }, (_, i) => attachment(`${i}.pdf`)) });
  assert.equal(full.h.records['dcs_dars/' + id].attachments.length, 20);
});
test('legacy single-PDF submission remains compatible', async () => {
  const { h, repo } = await repository(); const id = await repo.createDarRecord(user, { ...input(), attachmentFileName: 'legacy.pdf', attachmentFileType: 'application/pdf', attachmentFileDataUrl: 'data:application/pdf;base64,' + Buffer.from('%PDF-1.7').toString('base64') });
  assert.equal(h.records['dcs_dars/' + id].attachments.length, 1);
});
