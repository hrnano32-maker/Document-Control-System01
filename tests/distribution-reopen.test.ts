import test from 'node:test';
import assert from 'node:assert/strict';
import type { MasterDocument, DistributionRecord } from '../src/types';
import { findExistingDistribution, initialDistributionSelection } from '../src/utils/distributionReopen';
const master = { id: 'WI-01', darReferenceId: 'DAR-1', currentRevision: '01', distributionDepartments: [{ dept: 'HR', copies: 1 }, { dept: 'QA/QC', copies: 1 }] } as MasterDocument;
const record = { id: 'DC-1', docId: 'WI-01', darReferenceId: 'DAR-1', revision: '01', distributedDate: '2026-10-16', status: 'EXPIRED', targetDepartments: ['HR', 'QA/QC'], receipts: { HR: { downloadedAt: '2026-10-16' }, 'QA/QC': { downloadedAt: '2026-10-16' } }, expirationEpoch: 200, departmentExpirationEpoch: { HR: 100, 'QA/QC': 300 } } as DistributionRecord;
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
