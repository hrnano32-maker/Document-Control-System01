import test from 'node:test';
import assert from 'node:assert/strict';
import type { DistributionRecord, DistributionReceipt } from '../src/types';
import { isPendingDepartmentReceipt, isReceiptTransferComplete } from '../src/utils/distributionAccess';
import { isCombinedSheetComplete } from '../src/utils/distributionSheetGroup';

const base = { id: 'DC-1', status: 'IN_PROGRESS', targetDepartments: ['HR', 'QA/QC'], targets: [{ dept: 'HR', isDownloaded: false }, { dept: 'QA/QC', isDownloaded: false }], receipts: {} } as DistributionRecord;
const receipt = { dept: 'HR', downloadedAt: '2026-11-05T00:00:00Z', downloaderUid: 'hr', transferStatus: 'PENDING', transferId: 'test-id' } as DistributionReceipt;

test('all allocated pending, expired and unavailable documents remain in the gate', () => {
  for (const patch of [{}, { status: 'EXPIRED' }, { storageStatus: 'PURGED' }, { stampStatus: 'PROCESSING' }]) {
    assert.equal(isPendingDepartmentReceipt({ ...base, ...patch } as DistributionRecord, 'HR'), true);
  }
  assert.equal(isPendingDepartmentReceipt(base, 'Planning'), false);
  assert.equal(isPendingDepartmentReceipt({ ...base, status: 'CANCELLED' }, 'HR'), false);
  assert.equal(isPendingDepartmentReceipt({ ...base, departmentCancellations: { HR: { reason: '', cancelledAt: '', cancelledBy: '' } } }, 'HR'), false);
});

test('signing alone does not complete a new transfer; all files complete releases it', () => {
  const signed = { ...base, receipts: { HR: receipt } };
  assert.equal(isReceiptTransferComplete(receipt), false);
  assert.equal(isPendingDepartmentReceipt(signed, 'HR'), true);
  const complete = { ...receipt, transferStatus: 'COMPLETE' as const, transferredIndexes: [0, 1] };
  assert.equal(isPendingDepartmentReceipt({ ...base, receipts: { HR: complete } }, 'HR'), false);
  assert.equal(isCombinedSheetComplete([{ ...base, receipts: { HR: receipt, 'QA/QC': { ...receipt, dept: 'QA/QC', transferStatus: 'COMPLETE' } } }]), false);
});

test('legacy completed records remain completed and QA aliases are one department', () => {
  const { transferStatus: _status, ...legacy } = receipt;
  assert.equal(isReceiptTransferComplete(legacy), true);
  assert.equal(isPendingDepartmentReceipt({ ...base, receipts: { HR: legacy } }, 'HR'), false);
  assert.equal(isPendingDepartmentReceipt({ ...base, receipts: { QA: { ...receipt, dept: 'QA/QC' } } }, 'QA/QC'), true);
  assert.equal(isPendingDepartmentReceipt({ ...base, receipts: { QA: legacy, 'QA/QC': { ...receipt, dept: 'QA/QC' } } }, 'QA/QC'), true);
  assert.equal(isPendingDepartmentReceipt({ ...base, targets: [{ dept: 'HR', isDownloaded: true } as DistributionRecord['targets'][number]] }, 'HR'), false);
});
