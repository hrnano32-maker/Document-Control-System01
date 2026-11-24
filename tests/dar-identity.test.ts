import test from 'node:test';
import assert from 'node:assert/strict';
import { identityWarnings, assertExistingDarMaster, type DarIdentity } from '../src/utils/darIdentity';
import type { MasterDocument } from '../src/types';

const master = { id:'BOM_API-006', docNo:'BOM_API-006', docNameTh:'วิธีตรวจสอบกระจก', docNameEn:'Mirror inspection procedure', ownerDept:'QA/QC', status:'ACTIVE', currentRevision:'00' } as MasterDocument;
const dar: DarIdentity = { requestType:'REVISION', requestDept:'QA/QC', docNo:master.docNo, docNameTh:master.docNameTh, docNameEn:master.docNameEn };
test('renamed revision shows the old and proposed names under the same number, including extra rows', () => {
  assert.deepEqual(identityWarnings(dar,[master]),[]);
  const warnings = identityWarnings({...dar, additionalDocuments:[{ ...dar, docNameTh:'การวัดกระจก', revision:'01', reason:'ปรับปรุง' }]},[master]);
  assert.equal(warnings.length,1);
  for (const text of ['รายการที่ 2',master.docNo,master.docNameTh,'Rev.00','การวัดกระจก']) assert.ok(warnings[0].includes(text));
});
test('new applications suggest existing numbers for similar Thai or English titles and code spelling; unrelated documents pass', () => {
  const fresh = {...dar,requestType:'NEW' as const, docNo:'WI-XYZ-17',docNameTh:'ควบคุมการจัดซื้อ',docNameEn:''};
  for (const row of [{...fresh,docNameTh:'วิธีตรวจสอบกระจก รุ่น A'}, {...fresh,docNameEn:'Mirror-inspection procedures'}, {...fresh,docNo:'BOM-API 006'}]) assert.match(identityWarnings(row,[master])[0],/BOM_API-006/);
  assert.deepEqual(identityWarnings(fresh,[master]),[]);
});
test('revisions must reference the registered active number and owning department, including historical QA aliases', () => {
  assert.doesNotThrow(()=>assertExistingDarMaster(dar,'QA',{...master,ownerDept:'QA/QC'}));
  assert.throws(()=>assertExistingDarMaster(dar,'Purchasing',master));
  assert.throws(()=>assertExistingDarMaster(dar,'QA/QC',{...master,status:'OBSOLETE'}));
  assert.throws(()=>assertExistingDarMaster({...dar,docNo:'NEW-NO'},'QA/QC',master));
});
