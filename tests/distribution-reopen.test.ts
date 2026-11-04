import test from 'node:test';
import assert from 'node:assert/strict';
import type { MasterDocument, DistributionRecord } from '../src/types';
import { findExistingDistribution, initialDistributionSelection, resolveDistributionAnchor, isDistributedMasterForDepartment } from '../src/utils/distributionReopen';
const master = { id: 'WI-01', darReferenceId: 'DAR-1', currentRevision: '01', distributionDepartments: [{ dept: 'HR', copies: 1 }, { dept: 'QA/QC', copies: 1 }] } as MasterDocument;
const receipt = { receivedCopies: 1, downloadedAt: '2026-10-16', downloaderName: 'HR', downloaderEmpId: '', downloaderPosition: 'Manager', signatureStoragePath: 'signature.png' };
const record: DistributionRecord = { distributionNo: 'DC-1', docNo: 'WI-01', docNameTh: 'เอกสารทดสอบ', docNameEn: '', docType: 'WI', effectiveDate: '2026-10-16', distributedBy: 'DCC', expirationDate: '2026-10-19', allocationByDepartment: { HR: 1, 'QA/QC': 1 }, instructions: '', targets: [], id: 'DC-1', docId: 'WI-01', darReferenceId: 'DAR-1', revision: '01', distributedDate: '2026-10-16', status: 'EXPIRED', targetDepartments: ['HR', 'QA/QC'], receipts: { HR: { ...receipt, dept: 'HR' }, 'QA/QC': { ...receipt, dept: 'QA/QC' } }, expirationEpoch: 200, departmentExpirationEpoch: { HR: 100, 'QA/QC': 300 } };
test('expired/completed same-DAR distributions are reused, while another DAR/revision and cancelled sets are excluded', () => {
  assert.equal(findExistingDistribution(master, [record]), record);
  assert.equal(findExistingDistribution(master, [{ ...record, status: 'COMPLETED' }])?.id, 'DC-1');
  for (const changes of [{ status: 'CANCELLED' }, { darReferenceId: 'DAR-2' }, { revision: '02' }, { docId: 'WI-02' }]) assert.equal(findExistingDistribution(master, [{ ...record, ...changes } as DistributionRecord]), undefined);
});
test('prefer the original set even when a legacy reissue appears first in the list', () => {
  assert.equal(findExistingDistribution(master, [{ ...record, id: 'DC-2', distributedDate: '2026-10-18', reissueOf: 'DC-1' }, record])?.id, 'DC-1');
});
test('initial selection uses only expired/pending departments when reopening, and normalizes QA/QC', () => {
  assert.deepEqual(initialDistributionSelection(master, record, 150), ['HR']);
  assert.deepEqual(initialDistributionSelection(master), ['HR', 'QA/QC']);
  assert.deepEqual(initialDistributionSelection(master, { ...record, receipts: {} }, 150), ['HR', 'QA/QC']);
  assert.deepEqual(initialDistributionSelection({ ...master, distributionDepartments: [{ dept: 'QA', copies: 1 }, { dept: 'QC', copies: 1 }] } as any), ['QA/QC']);
});
test('additional Master documents use the same DAR distribution and recipients see each row', () => {
  const extra = { ...master, id: 'WI-02', distributionSetDocId: 'WI-01', currentRevision: '03' };
  assert.equal(resolveDistributionAnchor(extra, [master, extra]), master);
  assert.equal(findExistingDistribution(resolveDistributionAnchor(extra, [master, extra])!, [record]), record);
  assert.equal(isDistributedMasterForDepartment(extra, [record], 'HR'), true);
  assert.equal(isDistributedMasterForDepartment(extra, [{ ...record, darReferenceId: 'DAR-2' }], 'HR'), false);
  assert.equal(isDistributedMasterForDepartment(extra, [{ ...record, status: 'CANCELLED' }], 'HR'), false);
  assert.equal(resolveDistributionAnchor(extra, [{ ...master, darReferenceId: 'DAR-2' }]), undefined);
});

