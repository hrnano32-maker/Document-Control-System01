const test = require('node:test');
const assert = require('node:assert/strict');
const { createCompleteControlledTransfer, createRecordControlledDelivery } = require('./controlledTransfer');

const CLOCK = Date.parse('2026-11-05T00:00:00Z');
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }

function fixture() {
  const state = new Map();
  state.set('users/hr', { active: true, department: 'HR' });
  state.set('users/other', { active: true, department: 'HR' });
  state.set('users/qa', { active: true, department: 'QA/QC' });
  state.set('dcs_distributions/DC-1', { status: 'IN_PROGRESS', storageStatus: 'AVAILABLE', expirationEpoch: CLOCK + 3600000,
    targetDepartments: ['HR', 'QA/QC'], departmentFileLists: { HR: ['hr/a.pdf', 'hr/b.pdf'], 'QA/QC': ['qa/a.pdf'] },
    receipts: { HR: { dept: 'HR', downloadedAt: '2026-11-05T00:00:00Z', downloaderUid: 'hr', transferId: 'attempt-1', transferStatus: 'PENDING', transferredIndexes: [] },
      'QA/QC': { dept: 'QA/QC', downloadedAt: '2026-11-04T00:00:00Z' } } });
  const db = { collection: name => ({ doc: id => ({ key: `${name}/${id}` }) }), runTransaction: async callback => callback({
    get: async ref => ({ exists: state.has(ref.key), data: () => structuredClone(state.get(ref.key)) }),
    set: (ref, value) => state.set(ref.key, structuredClone(value)),
    update: (ref, patch) => state.set(ref.key, { ...state.get(ref.key), ...structuredClone(patch) }),
  }) };
  const complete = createCompleteControlledTransfer({ getFirestore: () => db, HttpsError, now: () => CLOCK });
  const delivered = createRecordControlledDelivery({ getFirestore: () => db });
  const request = (file, patch = {}) => ({ auth: { uid: 'hr' }, data: { distributionId: 'DC-1', transferId: 'attempt-1', file, method: 'picker', ...patch } });
  const report = (file, patch = {}) => delivered({ distributionId: 'DC-1', dept: 'HR', uid: 'hr', transferId: 'attempt-1', file, expectedPaths: ['hr/a.pdf', 'hr/b.pdf'], ...patch });
  return { state, complete, report, request, data: () => state.get('dcs_distributions/DC-1') };
}

test('signed receipt stays pending until the server delivers and user saves every file', async () => {
  const f = fixture();
  await assert.rejects(f.complete(f.request('all')), /หลักฐานการส่งไฟล์/);
  await f.report(0);
  assert.equal((await f.complete(f.request(0))).complete, false);
  assert.equal(f.data().receipts.HR.transferStatus, 'PENDING');
  assert.equal(f.data().status, 'IN_PROGRESS');
  await assert.rejects(f.complete(f.request('all')), /หลักฐานการส่งไฟล์/);
  await f.report(1);
  assert.equal((await f.complete(f.request(1))).complete, true);
  assert.equal(f.data().receipts.HR.transferStatus, 'COMPLETE');
  assert.equal(f.data().status, 'COMPLETED');
  assert.deepEqual(f.data().receipts.HR.transferredIndexes, [0, 1]);
  assert.equal((await f.complete(f.request(1))).complete, true);
});

test('a complete ZIP can acknowledge all files and preserves legacy receipts', async () => {
  const f = fixture(); await f.report('all');
  const done = await f.complete(f.request('all', { method: 'confirmed' }));
  assert.equal(done.complete, true);
  assert.equal(f.data().receipts.HR.transferSaveMethod, 'confirmed');
  assert.equal(f.data().receipts['QA/QC'].downloadedAt, '2026-11-04T00:00:00Z');
});

test('an account cannot complete another account, another department, or a replaced attempt', async () => {
  const f = fixture(); await f.report('all');
  await assert.rejects(f.complete({ ...f.request('all'), auth: { uid: 'other' } }), /หลักฐานการรับเปลี่ยนแปลง/);
  await assert.rejects(f.complete({ ...f.request('all'), auth: { uid: 'qa' } }), /หลักฐานการรับเปลี่ยนแปลง/);
  await assert.rejects(f.complete(f.request('all', { transferId: 'new-attempt' })), /หลักฐานการรับเปลี่ยนแปลง/);
  assert.equal(f.data().receipts.HR.transferStatus, 'PENDING');
});

test('forged receipt fields are not proof of delivery; stale files, cancellation and expiry cannot complete', async () => {
  const f = fixture();
  f.data().receipts.HR.serverTransferredIndexes = [0, 1];
  await assert.rejects(f.complete(f.request('all')), /หลักฐานการส่งไฟล์/);
  await f.report('all', { expectedPaths: ['old.pdf'] });
  await assert.rejects(f.complete(f.request('all')), /หลักฐานการส่งไฟล์/);
  await f.report('all');
  f.data().departmentFileLists.HR = ['new.pdf'];
  await assert.rejects(f.complete(f.request('all')), /หลักฐานการส่งไฟล์/);
  f.data().departmentFileLists.HR = ['hr/a.pdf', 'hr/b.pdf'];
  f.data().status = 'CANCELLED';
  await assert.rejects(f.complete(f.request('all')), /ยกเลิก/);
  f.data().status = 'IN_PROGRESS'; f.data().expirationEpoch = CLOCK;
  await assert.rejects(f.complete(f.request('all')), /หมดอายุ/);
});

test('delivery evidence for an old attempt is not reused after reopening', async () => {
  const f = fixture(); await f.report('all');
  f.data().receipts.HR.transferId = 'attempt-2';
  await assert.rejects(f.complete(f.request('all', { transferId: 'attempt-2' })), /หลักฐานการส่งไฟล์/);
  await f.report('all', { transferId: 'attempt-2' });
  assert.equal((await f.complete(f.request('all', { transferId: 'attempt-2' }))).complete, true);
});
