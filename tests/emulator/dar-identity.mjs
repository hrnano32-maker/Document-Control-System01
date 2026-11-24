import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore, doc, setDoc, updateDoc, writeBatch, terminate } from 'firebase/firestore';

const host = process.env.FIRESTORE_EMULATOR_HOST;
const project = 'demo-dcs-identity';
if (!host || !/^(localhost|127\.0\.0\.1):\d+$/.test(host)) throw new Error('Run only against a local Firestore emulator');
const app = initializeApp({projectId:project, apiKey:'emulator-only'});
const db = getFirestore(app);
connectFirestoreEmulator(db, host.split(':')[0], Number(host.split(':')[1]), {mockUserToken:{sub:'dcc-test'}});
async function seed(path, fields) {
  const encode = value => typeof value === 'boolean' ? {booleanValue:value} : typeof value === 'string' ? {stringValue:value} : Array.isArray(value) ? {arrayValue:{values:value.map(encode)}} : {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]))}};
  const result=await fetch('http://'+host+'/v1/projects/'+project+'/databases/(default)/documents/'+path,{method:'PATCH',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify(encode(fields).mapValue)});
  assert.equal(result.ok,true,await result.text());
}
const denied = p => assert.rejects(p, e => e.code === 'permission-denied');
try {
  const rows = [{docNo:'DOC-B',previousEffectiveDate:'2026-01-01'}];
  await seed('users/dcc-test',{active:true,role:'DCC_ADMIN',department:'DCC'});
  await seed('dcs_dars/DAR-NEW',{requestType:'NEW'});
  await seed('dcs_dars/DAR-REV',{requestType:'REVISION',docNo:'DOC-A',additionalDocuments:rows,previousEffectiveDate:'2026-01-01',targetEffectiveDate:'2026-10-01'});
  const master = doc(db,'dcs_documents','DOC-A'), rev = doc(db,'dcs_dars','DAR-REV');
  await setDoc(master,{docNo:'DOC-A',docNameTh:'เอกสารเดิม',darReferenceId:'DAR-NEW'});
  await updateDoc(master,{docNameTh:'ชื่อใหม่',currentRevision:'01',darReferenceId:'DAR-REV'});
  await denied(updateDoc(master,{docNo:'DOC-OTHER'}));
  await denied(setDoc(doc(db,'dcs_documents','DOC-C'),{docNo:'DOC-C',darReferenceId:'DAR-REV'}));
  await denied(updateDoc(master,{supersededByDocumentId:'DOC-C'}));
  await denied(updateDoc(rev,{requestType:'NEW'}));
  await denied(updateDoc(rev,{docNo:'DOC-C'}));
  await denied(updateDoc(rev,{additionalDocuments:[{...rows[0],docNo:'DOC-C'}]}));
  await updateDoc(rev,{additionalDocuments:[{...rows[0],previousEffectiveDate:'2026-01-02'}]});
  const batch=writeBatch(db);
  batch.update(rev,{status:'REGISTERED'});batch.update(master,{currentRevision:'02'});await batch.commit();
  console.log('PASS: NEW creates a Master, revisions can update only the original, all DAR numbers remain unchanged');
} finally { await terminate(db); await deleteApp(app); }
