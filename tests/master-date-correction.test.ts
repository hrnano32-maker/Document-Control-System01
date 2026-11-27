import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';

const master = () => ({id:'BOM_API-006-26', docNo:'BOM_API-006-26', docNameTh:'เอกสาร K006', currentRevision:'00', effectiveDate:'2026-11-20', reviewDueDate:'2027-11-20', darReferenceId:'DAR-OLD', status:'ACTIVE', revisionHistory:[{rev:'00', effectiveDate:'2026-11-20', darNo:'DAR-OLD', reason:'จัดทำใหม่', registeredBy:'DCC', registeredDate:'2026-11-20', status:'ACTIVE', controlledDriveLink:''}]});
const user = {uid:'dcc', userRole:'DCC_ADMIN', currentDept:'DCC', userName:'DCC'};
let compiled='';
async function setup() {
  if(!compiled) {
    const mocks:Record<string,string> = {
      firestore:`const h=globalThis.__h;export const collection=(_,name)=>({name});export const doc=(db,name,id)=>id?({name,id}):({name:db.name,id:'audit'});export const runTransaction=async(_,fn)=>{const writes=[];const value=await fn({get:async ref=>({exists:()=>h.store.has(ref.name+'/'+ref.id),data:()=>structuredClone(h.store.get(ref.name+'/'+ref.id))}),update:(ref,data)=>writes.push(['update',ref,data]),set:(ref,data)=>writes.push(['set',ref,data])});for(const [kind,ref,data]of writes){h.writes.push({kind,ref,data});if(kind==='update')Object.assign(h.store.get(ref.name+'/'+ref.id),data);}return value;};`,
      firebase:`export const auth={currentUser:{uid:'dcc'}};export const db={};`,
    };
    const result=await build({entryPoints:['src/services/masterDateRepository.ts'],bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'mock',setup(b){b.onResolve({filter:/lib\/firebase$/},()=>({path:'firebase',namespace:'mock'}));b.onResolve({filter:/^firebase\/firestore$/},()=>({path:'firestore',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},args=>({loader:'js',contents:mocks[args.path]}));}}]});compiled=result.outputFiles[0].text;
  }
  const m=master(),h={store:new Map<string,any>([['dcs_documents/'+m.id,structuredClone(m)],['dcs_dars/DAR-OLD',{id:'DAR-OLD',docNo:m.docNo,status:'REGISTERED',requestType:'NEW',proposedRevision:'00',targetEffectiveDate:'2026-11-17'}]]),writes:[] as any[]};
  const context:any={__h:h,module:{exports:{}},structuredClone,Date,console};vm.runInNewContext(compiled,context);
  return {h,m,restore:(id:string)=>context.module.exports.restoreMasterRevisionDates(user,id),save:(opened=m,date='2026-11-17')=>context.module.exports.correctMasterRevisionDates(user,opened,{'00':date},m.reviewDueDate,'แก้วันที่ตามเอกสารอนุมัติ')};
}

test('DCC can correct the specific old Master date and matching revision history with an audit',async()=>{
  const {h,m,save}=await setup();await save();const changed=h.store.get('dcs_documents/'+m.id);
  assert.equal(changed.effectiveDate,'2026-11-17');assert.equal(changed.revisionHistory[0].effectiveDate,'2026-11-17');
  assert.equal(h.store.get('dcs_dars/DAR-OLD').targetEffectiveDate,'2026-11-17');
  assert.equal(h.writes.filter(row=>row.ref.name==='dcs_audit_logs').length,1);
});

test('a concurrent Master change blocks the correction without writing anything',async()=>{
  const {h,m,save}=await setup();h.store.get('dcs_documents/'+m.id).effectiveDate='2026-11-21';
  await assert.rejects(save(),/เปลี่ยนระหว่างแก้ไข/);assert.equal(h.writes.length,0);
});

test('DCC repair for a secondary renamed document is transactional, auditable and idempotent',async()=>{
  const {h,restore}=await setup();
  const old={...master(),id:'BOM_API-007-26',docNo:'BOM_API-007-26',status:'OBSOLETE',supersededByDocumentId:'BOM-K007-01_51',
    renumberedByDarId:'DAR-0033',effectiveDate:'2026-11-17',revisionHistory:[]};
  const next={...master(),id:old.supersededByDocumentId,docNo:old.supersededByDocumentId,currentRevision:'01',darReferenceId:'DAR-0033',
    previousDocumentId:old.id,previousDocNo:old.docNo,renumberedByDarId:'DAR-0033',revisionHistory:[{...master().revisionHistory[0],rev:'01'}]};
  h.store.set('dcs_documents/'+old.id,structuredClone(old));h.store.set('dcs_documents/'+next.id,structuredClone(next));
  h.store.set('dcs_dars/DAR-0033',{id:'DAR-0033',status:'REGISTERED',requestType:'REVISION',docNo:'BOM-K006-01_51',currentRevision:'00',proposedRevision:'01',previousEffectiveDate:'2026-11-15',additionalDocuments:[{docNo:next.docNo,revision:'01'}]});
  assert.equal(await restore(next.id),true);
  assert.deepEqual(Array.from(h.store.get('dcs_documents/'+next.id).revisionHistory,(r:any)=>r.effectiveDate),['2026-11-17','2026-11-20']);
  assert.equal(await restore(next.id),false);
  assert.deepEqual(h.writes.map(r=>[r.kind,r.ref.name]),[['update','dcs_documents'],['set','dcs_audit_logs']]);
  assert.deepEqual(h.store.get('dcs_documents/'+old.id),old);
});
