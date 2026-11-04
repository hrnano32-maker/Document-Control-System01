import test from 'node:test';
import assert from 'node:assert/strict';
import type { DarRecord, MasterDocument } from '../src/types';
import { getDarMasterRows, planDarMasterRegistration } from '../src/utils/darMasterRegistration';

const now = '2026-11-04T02:00:00.000Z';
const dar = {
  id: 'DAR-TEST-1', status: 'APPROVED', requestType: 'NEW', requestDept: 'Production 2/3',
  docNo: 'WI-PD2-037', docNameTh: 'เอกสารหลัก', docNameEn: '', docType: 'WI',
  proposedRevision: '00', currentRevision: 'N/A', reasonForChange: 'ขึ้นทะเบียนใหม่',
  targetEffectiveDate: '2026-11-03',
  distributionHolders: [{ dept: 'HR', checked: true, copies: '1', position: 'ผู้รับ HR' }],
  additionalDocuments: [
    { docNo: 'WI-PD2-038', docNameTh: 'เอกสารที่สอง', revision: '00', reason: 'ใหม่' },
    { docNo: 'WI-PD2-039', docNameTh: 'เอกสารที่สาม', revision: '00', reason: 'ใหม่' },
    { docNo: 'WI-PD2-040', docNameTh: 'เอกสารที่สี่', revision: '00', reason: 'ใหม่' },
  ],
} as DarRecord;

test('one approved DAR plans one Master document for each distinct document number', () => {
  const plan = planDarMasterRegistration(dar, {}, 'DCC', now, 'register');
  assert.deepEqual(plan.records.map(row => row.docNo), ['WI-PD2-037', 'WI-PD2-038', 'WI-PD2-039', 'WI-PD2-040']);
  for (const record of plan.records) {
    assert.equal(record.darReferenceId, dar.id);
    assert.equal(record.currentRevision, '00');
    assert.equal(record.revisionHistory[0].effectiveDate, '2026-11-03');
    assert.equal(record.distributionDepartments?.[0].dept, 'HR');
  }
  assert.equal(plan.records[1].distributionSetDocId, plan.records[0].id);
  assert.equal(plan.records[1].currentFileStoragePath, undefined);
});

test('recovery only creates missing rows, and running it twice creates no duplicates', () => {
  const original = planDarMasterRegistration(dar, {}, 'DCC', now, 'register').records[0];
  const registered = { ...dar, status: 'REGISTERED' } as DarRecord;
  const prior = { [original.id]: original };
  const recovered = planDarMasterRegistration(registered, prior, 'DCC', now, 'recover');
  assert.deepEqual(recovered.records.map(row => row.docNo), ['WI-PD2-038', 'WI-PD2-039', 'WI-PD2-040']);
  const all = Object.fromEntries([original, ...recovered.records].map(row => [row.id, row]));
  assert.equal(planDarMasterRegistration(registered, all, 'DCC', now, 'recover').records.length, 0);
});

test('recovery preserves conflicting existing Masters and requires a current primary', () => {
  const original = planDarMasterRegistration(dar, {}, 'DCC', now, 'register').records[0];
  const conflicting = { ...original, id: 'WI-PD2-038', docNo: 'WI-PD2-038', darReferenceId: 'DAR-OTHER' } as MasterDocument;
  const registered = { ...dar, status: 'REGISTERED' } as DarRecord;
  const result = planDarMasterRegistration(registered, { [original.id]: original, [conflicting.id]: conflicting }, 'DCC', now, 'recover');
  assert.deepEqual(result.conflicts, ['WI-PD2-038']);
  assert.deepEqual(result.records.map(row => row.docNo), ['WI-PD2-039', 'WI-PD2-040']);
  assert.throws(() => planDarMasterRegistration(registered, { [original.id]: { ...original, darReferenceId: 'DAR-LATER' } }, 'DCC', now, 'recover'));
  assert.throws(() => planDarMasterRegistration({ ...registered, requestType: 'REVISION' }, { [original.id]: original }, 'DCC', now, 'recover'));
});

test('duplicate and incomplete document rows fail before registration', () => {
  assert.throws(() => getDarMasterRows({ ...dar, additionalDocuments: [{ ...dar.additionalDocuments![0], docNo: ' wi-pd2-037 ' }] }), /ซ้ำ/);
  assert.throws(() => getDarMasterRows({ ...dar, additionalDocuments: [{ ...dar.additionalDocuments![0], docNameTh: '' }] }), /กรอก/);
  const old = planDarMasterRegistration(dar, {}, 'DCC', now, 'register').records[0];
  assert.throws(() => planDarMasterRegistration(dar, { [old.id]: { ...old, darReferenceId: 'DAR-OTHER' } }, 'DCC', now, 'register'), /มีใน Master List/);
});

test('a revision uses each document own history and retains old source paths without presenting them as new files', () => {
  const original = planDarMasterRegistration(dar, {}, 'DCC', now, 'register').records;
  const previousById = Object.fromEntries(original.map(row => [row.id, { ...row, currentFileStoragePath: `archive/${row.id}/old.pdf`, currentFileStoragePaths: [`archive/${row.id}/old.pdf`] }]));
  const revision = { ...dar, requestType: 'REVISION', currentRevision: '00', proposedRevision: '01', targetEffectiveDate: '2026-12-01', previousEffectiveDate: '2026-11-03', additionalDocuments: dar.additionalDocuments!.map(row => ({ ...row, revision: '01', previousEffectiveDate: '2026-11-03' })) } as DarRecord;
  const plan = planDarMasterRegistration(revision, previousById, 'DCC', now, 'register');
  const second = plan.records[1];
  assert.equal(second.currentRevision, '01');
  assert.deepEqual(second.revisionHistory.map(row => [row.rev, row.effectiveDate]), [['00', '2026-11-03'], ['01', '2026-12-01']]);
  assert.equal(second.currentFileStoragePath, undefined);
  assert.deepEqual(second.previousRevisionSourceFiles?.['00'], ['archive/WI-PD2-038/old.pdf']);
  assert.throws(() => planDarMasterRegistration({ ...revision, additionalDocuments: revision.additionalDocuments!.map(row => ({ ...row, revision: '00' })) }, previousById, 'DCC', now, 'register'), /ต้องใหม่กว่า/);
  assert.throws(() => planDarMasterRegistration({ ...revision, additionalDocuments: revision.additionalDocuments!.map(row => ({ ...row, previousEffectiveDate: '2026-01-01' })) }, previousById, 'DCC', now, 'register'), /ไม่ตรงกับ Master List/);
  delete previousById['WI-PD2-038'];
  assert.throws(() => planDarMasterRegistration(revision, previousById, 'DCC', now, 'register'), /ไม่พบ WI-PD2-038/);
});
