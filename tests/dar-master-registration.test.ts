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

test('an explicit per-row renumbering preserves the old Master, its history and distribution anchor', () => {
  const oldRows = planDarMasterRegistration(dar, {}, 'DCC', now, 'register').records;
  const old = { ...oldRows[1], docNo: 'BOM_API-007-26', id: 'BOM_API-007-26', currentFileStoragePath: 'archive/old.pdf', darReferenceId: 'DAR-OLD', distributionSetDocId: oldRows[0].id };
  const revision = { ...dar, requestType: 'REVISION', currentRevision: '00', proposedRevision: '01', targetEffectiveDate: '2026-12-01', previousEffectiveDate: '2026-11-03', additionalDocuments: [{ ...dar.additionalDocuments![0], docNo: 'BOM-K007-01_51', currentRevision: '00', previousEffectiveDate: '2026-11-03', revision: '00' }] } as DarRecord;
  const prior = { [oldRows[0].id]: oldRows[0], [old.id]: old };
  const plan = planDarMasterRegistration(revision, prior, 'DCC', now, 'register', { 'BOM-K007-01_51': old.id });
  const renamed = plan.records[1];
  assert.equal(renamed.previousDocumentId, old.id);
  assert.equal(renamed.currentRevision, '00');
  assert.equal(renamed.revisionHistory.length, 1);
  assert.equal(renamed.currentFileStoragePath, undefined);
  assert.equal(plan.superseded[0].status, 'OBSOLETE');
  assert.equal(plan.superseded[0].currentFileStoragePath, 'archive/old.pdf');
  assert.equal(plan.superseded[0].supersededByDocumentId, renamed.id);
  assert.equal(plan.linkedPreviousDocuments[0].previousDistributionAnchorId, oldRows[0].id);
  assert.equal(plan.linkedPreviousDocuments[0].previousDarId, 'DAR-OLD');
});

test('renumbering rejects stale, wrong department, reused and conflicting targets', () => {
  const oldRows = planDarMasterRegistration(dar, {}, 'DCC', now, 'register').records;
  const old = { ...oldRows[1], id: 'OLD', docNo: 'OLD', distributionSetDocId: undefined };
  const revision = { ...dar, requestType: 'REVISION', currentRevision: '00', proposedRevision: '01', targetEffectiveDate: '2026-12-01', previousEffectiveDate: '2026-11-03', additionalDocuments: [{ ...dar.additionalDocuments![0], docNo: 'NEW-1', currentRevision: '00', previousEffectiveDate: '2026-11-03', revision: '01' }, { ...dar.additionalDocuments![1], docNo: 'NEW-2', currentRevision: '00', previousEffectiveDate: '2026-11-03', revision: '01' }] } as DarRecord;
  const base = { [oldRows[0].id]: oldRows[0], OLD: old };
  const run = (data: typeof base, links: Record<string, string>) => planDarMasterRegistration(revision, data, 'DCC', now, 'register', links);
  assert.throws(() => run(base, { 'NEW-1': 'OLD', 'NEW-2': 'OLD' }), /ใช้ซ้ำ/);
  assert.throws(() => run({ ...base, OLD: { ...old, status: 'OBSOLETE' } }, { 'NEW-1': 'OLD' }), /Active/);
  assert.throws(() => run({ ...base, OLD: { ...old, ownerDept: 'HR' } }, { 'NEW-1': 'OLD' }), /หน่วยงานอื่น/);
  assert.throws(() => run({ ...base, OLD: { ...old, currentRevision: '03' } }, { 'NEW-1': 'OLD' }), /Rev. เดิม/);
  assert.throws(() => run({ ...base, OLD: { ...old, effectiveDate: '2026-11-02' } }, { 'NEW-1': 'OLD' }), /วันที่เอกสารเดิม/);
  assert.throws(() => run({ ...base, 'NEW-1': { ...old, id: 'NEW-1' } }, { 'NEW-1': 'OLD' }), /มีใน Master List/);
  assert.throws(() => run(base, { 'NEW-1': 'MISSING' }), /ไม่พบรหัสเดิม/);
});


test('legacy Master records without a DAR reference can still be inspected', () => {
  const original = planDarMasterRegistration(dar, {}, 'DCC', now, 'register').records;
  const legacy = { ...original[0], darReferenceId: undefined } as unknown as MasterDocument;
  const revision = { ...dar, requestType: 'REVISION', currentRevision: '00', proposedRevision: '01', targetEffectiveDate: '2026-12-01', previousEffectiveDate: '2026-11-03', additionalDocuments: [] } as DarRecord;
  assert.doesNotThrow(() => planDarMasterRegistration(revision, { [legacy.id]: legacy }, 'DCC', now, 'register'));
});

test('a mismatched renamed revision reports both actual dates and the selected old Master code', () => {
  const original = planDarMasterRegistration(dar, {}, 'DCC', now, 'register').records;
  const old = { ...original[1], id:'BOM_API-006-26', docNo:'BOM_API-006-26', distributionSetDocId:undefined, effectiveDate:'2026-11-20' };
  const revision = { ...dar, requestType:'REVISION', currentRevision:'00', proposedRevision:'01', targetEffectiveDate:'2026-12-01', previousEffectiveDate:'2026-11-03', additionalDocuments:[{ ...dar.additionalDocuments![0], docNo:'BOM-K006-01_51', currentRevision:'00', previousEffectiveDate:'2026-11-17', revision:'01' }] } as DarRecord;
  assert.throws(() => planDarMasterRegistration(revision, { [original[0].id]:original[0], [old.id]:old }, 'DCC', now, 'register', { 'BOM-K006-01_51':old.id }), error => {
    const message=(error as Error).message;return message.includes('17/11/2026') && message.includes('20/11/2026') && message.includes('BOM_API-006-26');
  });
});
