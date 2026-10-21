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

import { getDistributionDownloadAccess, getDistributionExpiry } from '../src/utils/distributionAccess';
const now = Date.parse('2026-10-21T12:00:00Z');
const ready = { ...distribution, expirationDate: new Date(now + 26 * 3600000).toISOString(), expirationEpoch: now + 26 * 3600000,
  stampStatus: 'COMPLETED', storageStatus: 'AVAILABLE', departmentFileLists: { HR: ['hr.pdf'], 'QA/QC': ['qa.pdf'] },
  departmentExpirationEpoch: { HR: now - 1, 'QA/QC': now + 26 * 3600000 } } as DistributionRecord;
test('reopening one department never shows its extra time to an expired department', () => {
  const expired = getDistributionDownloadAccess(ready, 'HR', now);
  assert.equal(expired.state, 'EXPIRED'); assert.equal(expired.canDownload, false); assert.equal(expired.canRequest, true);
  const open = getDistributionDownloadAccess(ready, 'QA/QC', now);
  assert.equal(open.canDownload, true); assert.equal(open.message, 'เหลือเวลา 1 วัน 2 ชม.');
});
test('deadline is exclusive and a page crossing it becomes unavailable without a new record', () => {
  const record = { ...ready, departmentExpirationEpoch: { HR: now + 1000 } };
  assert.equal(getDistributionDownloadAccess(record, 'HR', now).canDownload, true);
  assert.equal(getDistributionDownloadAccess(record, 'HR', now + 1000).state, 'EXPIRED');
});
test('legacy dates and explicit department deadlines use one deterministic fallback', () => {
  const legacy = { ...ready, departmentExpirationEpoch: undefined, expirationEpoch: undefined };
  assert.equal(getDistributionExpiry(legacy, 'HR'), ready.expirationEpoch);
  for (const value of [0, -1, NaN, null, 'invalid']) {
    const record = { ...ready, departmentExpirationEpoch: { HR: value } } as unknown as DistributionRecord;
    assert.equal(getDistributionDownloadAccess(record, 'HR', now).canDownload, false);
    assert.equal(getDistributionExpiry(record, 'HR'), 0);
  }
});
test('purged, missing and processing files never offer a download even with time remaining', () => {
  for (const storageStatus of ['PURGED', 'PURGE_PENDING'] as const) {
    assert.equal(getDistributionDownloadAccess({ ...ready, storageStatus }, 'QA/QC', now).state, 'UNAVAILABLE');
  }
  const missing = { ...ready, departmentFileLists: {}, departmentFiles: {} };
  assert.equal(getDistributionDownloadAccess(missing, 'QA/QC', now).canRequest, true);
  const pending = getDistributionDownloadAccess({ ...ready, stampStatus: 'PROCESSING' }, 'QA/QC', now);
  assert.equal(pending.canDownload, false); assert.equal(pending.canRequest, false);
});
