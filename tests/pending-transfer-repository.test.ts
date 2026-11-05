import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';

async function fixture() {
  const h: any = { latest: { id: 'DC-1', docNo: 'WI-HR-1', revision: '01', status: 'IN_PROGRESS', expirationEpoch: Date.now() + 86400000,
    targetDepartments: ['HR'], targets: [{ dept: 'HR', isDownloaded: false }], allocationByDepartment: { HR: 1 }, departmentFileLists: { HR: ['file-1.pdf', 'file-2.pdf'] }, storageStatus: 'AVAILABLE', stampStatus: 'COMPLETED', receipts: {} }, updates: [], audits: [], subscriptions: [] };
  const mocks: Record<string, string> = {
    firestore: `const h=globalThis.__h;export const collection=(_,name)=>({name}); export const doc=(db,name,id)=>({name:id?name:db.name,id:id||name||'audit'});export const getDocFromServer=async()=>({exists:()=>true,data:()=>structuredClone(h.latest)});export const runTransaction=async(_,fn)=>fn({get:async()=>({data:()=>structuredClone(h.latest)}),update:(_,patch)=>{h.updates.push(patch);Object.assign(h.latest,patch)}});export const setDoc=async(_,entry)=>h.audits.push(entry); export const getDoc=()=>{};export const getDocs=()=>{};export const writeBatch=()=>{};export const onSnapshot=(query,options,next,error)=>{h.subscriptions.push({query,options,next,error});return ()=>{}};export const orderBy=(...args)=>({kind:'orderBy',args});export const query=(collection,...constraints)=>({collection,constraints});export const where=(...args)=>({kind:'where',args});export const Timestamp={};export const updateDoc=()=>{};`,
    storage: `export const ref=(_,path)=>path;export const getDownloadURL=async path=>'https://example.invalid/'+path;export const deleteObject=()=>{};export const uploadBytes=()=>{};export const uploadBytesResumable=()=>{};`,
    functions: `export const httpsCallable=()=>{};`,
    firebase: `export const db={};export const storage={};export const firebaseFunctions={};export const auth={};`,
  };
  const output = await build({ entryPoints: ['src/services/dcsRepository.ts'], bundle: true, platform: 'node', format: 'cjs', write: false, plugins: [{ name: 'firebase-mock', setup(b) {
    b.onResolve({ filter: /lib\/firebase$/ }, () => ({ path: 'firebase', namespace: 'mock' }));
    b.onResolve({ filter: /^firebase\// }, args => ({ path: args.path.split('/')[1], namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], loader: 'js' }));
  } }] });
  const context: any = { __h: h, module: { exports: {} }, structuredClone, Date, console, crypto: { randomUUID: () => 'test-attempt' }, setTimeout, clearTimeout };
  vm.runInNewContext(output.outputFiles[0].text, context);
  return { h, repo: context.module.exports };
}

test('signing records a resumable pending transfer rather than marking the last department completed', async () => {
  const { h, repo } = await fixture();
  const user = { uid: 'hr', currentDept: 'HR', userName: 'HR', signaturePath: 'hr.png' };
  const result = await repo.acknowledgeDownload(user, h.latest, 'HR', { name: 'HR', empId: '', position: 'HR', signatureDataUrl: 'signature' });
  assert.equal(result.transferId, 'test-attempt');
  assert.equal(result.downloadUrls.length, 2);
  assert.equal(h.latest.receipts.HR.transferStatus, 'PENDING');
  assert.equal(h.latest.status, 'IN_PROGRESS');
  assert.equal(h.latest.allDownloadedAt, null);
  await assert.rejects(repo.acknowledgeDownload(user, h.latest, 'HR', { name: 'HR', empId: '', position: 'HR', signatureDataUrl: 'signature' }), /ดาวน์โหลดฉบับนี้ไปแล้ว/);
});

test('subscriptions include old records without createdAt and distinguish cached from server data', async () => {
  const { h, repo } = await fixture();
  const user = { uid: 'hr', currentDept: 'HR', userRole: 'STAFF' };
  const received: any[] = [];
  repo.subscribeDistributions(user, (rows: any[], fromCache: boolean) => received.push({ rows, fromCache }));
  const sub = h.subscriptions[0];
  assert.equal(sub.query.constraints.some((value: any) => value.kind === 'orderBy'), false);
  assert.equal(sub.options.includeMetadataChanges, true);
  const old = { ...h.latest, id: 'OLD', distributedDate: '2025-01-01' };
  const recent = { ...h.latest, id: 'NEW', distributedDate: '2026-01-01', createdAt: '2026-01-01' };
  sub.next({ docs: [old, recent].map(row => ({ data: () => row })), metadata: { fromCache: true } });
  sub.next({ docs: [old, recent].map(row => ({ data: () => row })), metadata: { fromCache: false } });
  assert.deepEqual(Array.from(received[1].rows, (row: any) => row.id), ['NEW', 'OLD']);
  assert.equal(received[0].fromCache, true); assert.equal(received[1].fromCache, false);
});
