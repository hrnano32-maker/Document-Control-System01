import test from 'node:test';
import assert from 'node:assert/strict';
import type { DistributionRecord, DistributionReceipt, CurrentUserSession, DocumentReturnRequest } from '../src/types';
import { getRecipientGate, getDepartmentReceiptState, isPendingDepartmentReceipt, isReceiptTransferComplete } from '../src/utils/distributionAccess';
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
  const complete = { ...receipt, transferStatus: 'COMPLETE' as const, transferCompletedAt:'2026-11-05T01:00:00Z', transferredIndexes: [0, 1] };
  assert.equal(isPendingDepartmentReceipt({ ...base, receipts: { HR: complete } }, 'HR'), false);
  assert.equal(isCombinedSheetComplete([{ ...base, receipts: { HR: receipt, 'QA/QC': { ...receipt, dept: 'QA/QC', transferStatus: 'COMPLETE' } } }]), false);
});

test('historical signatures remain available for audit but cannot release the gate without file evidence; QA aliases are one department', () => {
  const { transferStatus: _status, transferId: _transferId, ...legacy } = receipt;
  assert.equal(isReceiptTransferComplete(legacy), true);
  assert.equal(getDepartmentReceiptState({ ...base, receipts: { HR: legacy } }, 'HR'), 'NEEDS_REOPEN');
  assert.equal(isPendingDepartmentReceipt({ ...base, receipts: { QA: { ...receipt, dept: 'QA/QC' } } }, 'QA/QC'), true);
  assert.equal(isPendingDepartmentReceipt({ ...base, receipts: { QA: legacy, 'QA/QC': { ...receipt, dept: 'QA/QC' } } }, 'QA/QC'), true);
  assert.equal(isPendingDepartmentReceipt({ ...base, targets: [{ dept: 'HR', isDownloaded: true } as DistributionRecord['targets'][number]] }, 'HR'), true);
});


test('tracked transfers remain pending when the status or file evidence is incomplete', () => {
  const files={...base,departmentFileLists:{HR:['one.pdf','two.pdf']}} as DistributionRecord;
  const done={...receipt,transferStatus:'COMPLETE' as const,transferCompletedAt:'2026-11-05T01:00:00Z',transferredIndexes:[0,1]};
  for(const bad of [{transferStatus:'BROKEN'}, {transferStatus:undefined}, {transferCompletedAt:undefined}, {transferredIndexes:[0]}, {transferredIndexes:[0,0]}, {transferredIndexes:[0,2]}, {transferredIndexes:[]}]) {
    assert.equal(isPendingDepartmentReceipt({...files,receipts:{HR:{...done,...bad}}} as DistributionRecord,'HR'),true,JSON.stringify(bad));
  }
  assert.equal(isPendingDepartmentReceipt({...files,receipts:{HR:done}},'HR'),false);
  assert.equal(isPendingDepartmentReceipt({...files,departmentFileLists:{},storageStatus:'PURGED',receipts:{HR:done}},'HR'),false);
  assert.equal(isPendingDepartmentReceipt({...files,departmentFileLists:{},storageStatus:'PURGED',receipts:{HR:{...done,transferredIndexes:[1,2]}}},'HR'),true);
});

const department = { currentDept:'HR', userRole:'STAFF' } as CurrentUserSession;
const verified: DistributionReceipt = { ...receipt, transferStatus:'COMPLETE', transferCompletedAt:'2026-11-06T01:00:00Z', transferredIndexes:[0,1] };
test('a closed download window is history only for the department that saved every file', () => {
  const archived = { ...base, status:'EXPIRED' as const, storageStatus:'PURGED' as const, departmentFileNames:{HR:['a.pdf','b.pdf']}, receipts:{ HR:verified } };
  const other = { ...archived,id:'DC-2', firstReceipts:{HR:verified}, receipts:{} };
  assert.equal(getDepartmentReceiptState(archived,'HR'),'COMPLETE');
  assert.equal(getDepartmentReceiptState(archived,'QA/QC'),'DUE');
  assert.deepEqual(getRecipientGate(department,'ready',[archived,other],[]).pending.map(r=>r.id), ['DC-2']);
  assert.equal(getRecipientGate(department,'ready',[archived],[]).blocked,false);
  assert.equal(getRecipientGate(department,'ready',[{...archived, receipts:{ HR:{ ...verified, transferredIndexes:[0] } }}],[]).blocked,true);
});
test('reopening the original set requires the current transfer; partial files and pending returns independently block entry', () => {
  const dist = {...base, departmentFileLists:{HR:['new.pdf','extra.pdf']},receipts:{HR:verified}, copyReissueHistory:[{department:'HR' as const,requestId:'reopen',approvedAt:'2026-11-07T01:00:00Z',approvedBy:'DCC',fileCount:2}]};
  assert.equal(getDepartmentReceiptState(dist,'HR'),'NEEDS_REOPEN');
  const current = {...dist, receipts:{HR:{...verified,transferCompletedAt:'2026-11-08T01:00:00Z'}}};
  const ret={id:'return',dept:'HR',status:'PENDING'} as DocumentReturnRequest;
  assert.equal(getRecipientGate(department,'ready',[current],[ret]).blocked,true);
  assert.equal(getRecipientGate(department,'ready',[current],[{...ret,status:'CONFIRMED'}]).blocked,false);
  for(const sync of ['loading','error'] as const) assert.equal(getRecipientGate(department,sync,[],[]).blocked,true);
  assert.equal(getRecipientGate(department,'ready',[],[{...ret,dept:'Purchasing'}]).blocked,false);
  assert.equal(getRecipientGate({...department,currentDept:'DCC',userRole:'DCC_ADMIN'},'loading',[dist],[ret]).blocked,false);
});
