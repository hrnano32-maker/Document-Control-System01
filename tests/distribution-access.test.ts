import test from 'node:test';
import assert from 'node:assert/strict';
import type { DistributionRecord } from '../src/types';
import { hasDistributionAllocation, refreshDistributionSelection } from '../src/utils/distributionAccess';
const distribution = { id: 'DC-1', status: 'IN_PROGRESS', targetDepartments: ['HR', 'QA/QC'], targets: [{ dept: 'HR' }, { dept: 'QA/QC' }] } as DistributionRecord;
test('cancelled set, removed allocation and cancelled department do not grant access from historical targets', () => {
  assert.equal(hasDistributionAllocation({ ...distribution, status: 'CANCELLED' }, 'HR'), false);
  assert.equal(hasDistributionAllocation({ ...distribution, targetDepartments: ['QA/QC'] }, 'HR'), false);
  const cancelled = { ...distribution, departmentCancellations: { HR: { reason: 'ยกเลิก', cancelledAt: '2026-10-20', cancelledBy: 'DCC' } } };
  assert.equal(hasDistributionAllocation(cancelled, 'HR'), false);
  assert.equal(hasDistributionAllocation(cancelled, 'QA/QC'), true);
});
test('expired allocated departments retain the right to request a copy, including legacy QA/QC aliases', () => {
  assert.equal(hasDistributionAllocation({ ...distribution, status: 'EXPIRED' }, 'HR'), true);
  assert.equal(hasDistributionAllocation(distribution, 'QA'), true);
});
test('live snapshots close revoked selections and update retained ones without losing request details', () => {
  const selected = { distribution, dept: 'HR', reasonDetails: 'ขอสำเนา' };
  assert.equal(refreshDistributionSelection(selected, []), null);
  assert.equal(refreshDistributionSelection(selected, [{ ...distribution, status: 'CANCELLED' }]), null);
  const fresh = { ...distribution, status: 'COMPLETED' as const };
  assert.deepEqual(refreshDistributionSelection(selected, [fresh]), { ...selected, distribution: fresh });
});
