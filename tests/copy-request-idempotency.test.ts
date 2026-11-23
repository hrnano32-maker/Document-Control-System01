import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';

async function fixture() {
  const h: any = { rows: new Map(), failAudit: false, race: false };
  h.rows.set('dcs_distributions/DC-1', { id: 'DC-1', distributionNo: 'DC-DIS-1', docNo: 'DOC-1', docNameTh: 'เอกสาร', revision: '00', status: 'IN_PROGRESS', targetDepartments: ['HR', 'Purchasing'], allocationByDepartment: { HR: 1, Purchasing: 1 }, targets: [] });
  const mocks: Record<string,string> = {
    firestore: `const h=globalThis.__h;
      export const collection=(_,name)=>({name});
      export const doc=(base,name,id)=>id!==undefined?({name,id}):({name:base.name,id:name||'auto'});
      const key=r=>r.name+'/'+r.id; const snap=r=>({exists:()=>h.rows.has(key(r)),data:()=>structuredClone(h.rows.get(key(r)))});
      export const getDocFromServer=async r=>snap(r);
      export const getDocsFromServer=async q=>{ const dept=q.constraints[0].args[2]; const docs=[...h.rows.entries()].filter(([k,v])=>k.startsWith('dcs_copy_requests/')&&v.dept===dept).map(([,v])=>({data:()=>structuredClone(v)})); if(h.race){h.race=false;h.rows.set('dcs_counters/copy-request-lock-DC-1-HR',{value:1,kind:'copyRequestLock',year:0});} return {docs}; };
      export const runTransaction=async (_,fn)=>{const changes=[];const tx={get:async r=>snap(r),set:(r,v)=>changes.push([key(r),structuredClone(v)])}; const result=await fn(tx);for(const [k,v] of changes)h.rows.set(k,v);return result};
      export const setDoc=async()=>{if(h.failAudit)throw Error('audit unavailable')}; export const query=(col,...constraints)=>({col,constraints}); export const where=(...args)=>({args});
      export const getDoc=()=>{};export const getDocs=()=>{};export const writeBatch=()=>{};export const onSnapshot=()=>{};export const orderBy=()=>{};export const Timestamp={};export const updateDoc=()=>{};`,
    storage:`export const ref=()=>{};export const getDownloadURL=()=>{};export const deleteObject=()=>{};export const uploadBytes=()=>{};export const uploadBytesResumable=()=>{};`,
    functions:`export const httpsCallable=()=>{};`,firebase:`export const db={};export const storage={};export const firebaseFunctions={};export const auth={};`,
  };
  const out=await build({entryPoints:['src/services/dcsRepository.ts'],bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'mock',setup(b){b.onResolve({filter:/lib\/firebase$/},()=>({path:'firebase',namespace:'mock'}));b.onResolve({filter:/^firebase\//},a=>({path:a.path.split('/')[1],namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'js'}));}}]});
  const context:any={__h:h,module:{exports:{}},structuredClone,Date,console,encodeURIComponent,setTimeout,clearTimeout};
  vm.runInNewContext(out.outputFiles[0].text,context);
  return {h,repo:context.module.exports, dist:h.rows.get('dcs_distributions/DC-1')};
}
const user={uid:'uid',currentDept:'HR',userName:'HR'};
const submit=(repo:any,dist:any)=>repo.createCopyRequestRecord(user,dist,'HR','HR','','OTHER','เหตุผล');

test('a pending or processing request blocks duplicates; resolved requests allow a new submission',async()=>{
  const {h,repo,dist}=await fixture();
  await submit(repo,dist);
  const first=[...h.rows.values()].find((x:any)=>x.distributionId==='DC-1') as any;
  assert.ok(first.id.startsWith('REQ-'));
  await assert.rejects(submit(repo,dist),/รอ DCC พิจารณา/);
  first.status='PROCESSING'; await assert.rejects(submit(repo,dist),/รอ DCC พิจารณา/);
  first.status='APPROVED'; await submit(repo,dist);
  assert.equal([...h.rows.values()].filter((x:any)=>x.distributionId==='DC-1').length,2);
});

test('a concurrent request version change aborts before creating a duplicate',async()=>{
  const {h,repo,dist}=await fixture();h.race=true;
  await assert.rejects(submit(repo,dist),/ส่งคำขอพร้อมกัน/);
  assert.equal([...h.rows.keys()].some((k:any)=>k.startsWith('dcs_copy_requests/')),false);
});

test('an audit failure does not report a successful request as failed',async()=>{
  const {h,repo,dist}=await fixture();h.failAudit=true;
  await submit(repo,dist);
  assert.equal([...h.rows.keys()].filter((k:any)=>k.startsWith('dcs_copy_requests/')).length,1);
  await assert.rejects(submit(repo,dist),/รอ DCC พิจารณา/);
});

test('cancelled distribution cannot produce a new request',async()=>{
  const {h,repo,dist}=await fixture();h.rows.get('dcs_distributions/DC-1').status='CANCELLED';
  await assert.rejects(submit(repo,dist),/ถูกยกเลิก/);
  assert.equal([...h.rows.keys()].some((k:any)=>k.startsWith('dcs_copy_requests/')),false);
});

test('a later approval blocks earlier duplicates but permits a genuinely new request',async()=>{
  const {findConflictingCopyRequest}=await import('../src/utils/copyRequests');
  const older:any={id:'REQ-1',distributionId:'DC-1',dept:'HR',requestDate:'2026-11-23T01:00:00Z',status:'PENDING'};
  const approved:any={id:'REQ-2',distributionId:'DC-1',dept:'HR',requestDate:'2026-11-23T02:00:00Z',status:'APPROVED',dccDecisionDate:'2026-11-23T03:00:00Z'};
  assert.equal(findConflictingCopyRequest(older,[approved])?.id,'REQ-2');
  assert.equal(findConflictingCopyRequest({...older,requestDate:'2026-11-23T04:00:00Z'},[approved]),undefined);
  assert.equal(findConflictingCopyRequest(older,[{...approved,distributionId:'DC-2'}]),undefined);
  assert.equal(findConflictingCopyRequest(older,[{...approved,dept:'Purchasing'}]),undefined);
  assert.equal(findConflictingCopyRequest(older,[{...approved,status:'REJECTED'}]),undefined);
});
