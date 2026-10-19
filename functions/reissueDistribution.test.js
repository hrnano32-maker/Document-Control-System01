const test = require('node:test');
const assert = require('node:assert/strict');
const { createReissueHandler, buildReopenPatch } = require('./reissueDistribution');
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const receipt = dept => ({ dept, receivedCopies: 1, downloadedAt: '2026-10-16T01:00:00Z', downloaderName: dept, downloaderUid: dept, signatureStoragePath: `signatures/${dept}.png` });
const clone = value => structuredClone(value);
function fixture(options = {}) {
  const state = new Map(Object.entries({
    'dcs_distributions/DC-1': { id: 'DC-1', docId: 'WI-01', darReferenceId: 'DAR-1', revision: '01', status: 'EXPIRED', storageStatus: 'PURGED', stampStatus: 'COMPLETED', targetDepartments: ['HR', 'QA/QC'], targets: [{ dept: 'HR' }, { dept: 'QA/QC' }], allocationByDepartment: { HR: 1, 'QA/QC': 2 }, expirationEpoch: 100, receipts: { HR: receipt('HR'), 'QA/QC': receipt('QA/QC') }, fileNames: ['one.pdf', 'two.pdf'], departmentFileLists: { HR: ['expired-one.pdf', 'expired-two.pdf'] }, ...options.distribution },
    'dcs_documents/WI-01': { status: 'ACTIVE', darReferenceId: 'DAR-1', currentRevision: '01', currentFileStoragePaths: ['archive/one.pdf', 'archive/two.pdf'], distributionDepartments: [{ dept: 'Planning', copies: 3 }], ...options.master },
    ...(options.request ? { 'dcs_copy_requests/REQ-1': { distributionId: 'DC-1', dept: 'HR', status: 'PROCESSING' } } : {}),
  }));
  let transactions = 0;
  const snapshot = key => ({ exists: state.has(key), data: () => clone(state.get(key)) });
  const reference = key => ({ key, get: async () => snapshot(key), update: async patch => state.set(key, { ...state.get(key), ...clone(patch) }) });
  const db = { collection: name => ({ doc: id => reference(`${name}/${id}`) }), runTransaction: async callback => {
    transactions += 1;
    if (transactions === 2 && options.beforeCommit) options.beforeCommit(state);
    const writes = [];
    const result = await callback({ get: async ref => snapshot(ref.key), update: (ref, patch) => writes.push(() => state.set(ref.key, { ...state.get(ref.key), ...clone(patch) })), set: (ref, value) => writes.push(() => state.set(ref.key, clone(value))) });
    writes.forEach(write => write()); return result;
  } };
  const files = new Map([['archive/one.pdf', 'PDF1'], ['archive/two.pdf', 'PDF2']]);
  const deleted = [], notifications = [], loads = [];
  const file = path => ({ path, exists: async () => [files.has(path)], getMetadata: async () => [{ size: 1200 }], copy: async to => { if (!files.has(path)) throw new Error('source missing'); files.set(to.path, files.get(path)); }, delete: async () => { deleted.push(path); files.delete(path); } });
  const handler = createReissueHandler({ getFirestore: () => db, getStorage: () => ({ bucket: () => ({ file }) }), requireDcc: async req => { if (req.auth?.role !== 'DCC_ADMIN') throw new HttpsError('permission-denied', 'DCC only'); }, HttpsError, loadPdf: async path => { loads.push(path); if (!files.has(path)) throw new Error('source missing'); return { path }; }, savePdf: async (pdf, path) => { if (options.failStamp) throw new Error('PDF failed'); files.set(path, 'CONTROLLED'); }, controlledStamp: async () => {}, stampVersion: 2, safeSegment: value => value.replace(/[^a-zA-Z0-9._-]/g, '_'), validDepartments: new Set(['HR', 'QA/QC', 'Planning']), notify: async (id, data) => { notifications.push({ id, departments: data.targetDepartments }); } });
  const run = data => handler({ auth: { uid: 'dcc', role: 'DCC_ADMIN' }, data: { distributionId: 'DC-1', operationId: 'op-1', departments: ['HR', 'Planning'], ...data } });
  return { state, files, deleted, notifications, loads, run, handler, get distribution() { return state.get('dcs_distributions/DC-1'); } };
}
test('expired files regenerate in the same record; only selected departments reopen, preserving first signatures and other receipts', async () => {
  const f = fixture(); const qa = clone(f.distribution.receipts['QA/QC']);
  const result = await f.run();
  assert.equal(result.distributionId, 'DC-1');
  assert.equal([...f.state.keys()].filter(key => key.startsWith('dcs_distributions/')).length, 1);
  assert.equal(f.distribution.firstReceipts.HR.signatureStoragePath, 'signatures/HR.png');
  assert.equal(f.distribution.receipts.HR, undefined);
  assert.deepEqual(f.distribution.receipts['QA/QC'], qa);
  assert.equal(f.distribution.departmentExpirationEpoch['QA/QC'], 100);
  assert.ok(f.distribution.departmentExpirationEpoch.HR > Date.now() + 2 * 86400000);
  assert.equal(f.distribution.allocationByDepartment.Planning, 3);
  assert.equal(f.distribution.firstReceipts.Planning, undefined);
  assert.deepEqual(f.notifications[0].departments, ['HR', 'Planning']);
  assert.equal(f.distribution.departmentFileLists.HR.length, 2);
  assert.ok(f.distribution.departmentFileLists.HR.every(path => f.files.has(path)));
});
test('a duplicate operation does not reopen again or erase a subsequent receipt', async () => {
  const f = fixture(); await f.run();
  const second = { ...receipt('HR'), downloadedAt: '2026-10-22T01:00:00Z' };
  f.distribution.receipts.HR = second;
  await f.run();
  assert.deepEqual(f.distribution.receipts.HR, second);
  assert.equal(f.notifications.length, 1);
  assert.equal(f.distribution.copyReissueHistory.length, 2);
});
test('a receipt committed by another department during stamping survives the final transaction', async () => {
  const f = fixture({ beforeCommit: state => { state.get('dcs_distributions/DC-1').receipts['QA/QC'] = { ...receipt('QA/QC'), downloadedAt: '2026-10-19T01:00:00Z' }; } });
  await f.run(); assert.equal(f.distribution.receipts['QA/QC'].downloadedAt, '2026-10-19T01:00:00Z');
});
test('first signature persists through multiple reopenings and previous receipts are archived per operation', async () => {
  const f = fixture(); await f.run();
  f.distribution.receipts.HR = { ...receipt('HR'), signatureStoragePath: 'signatures/second.png', downloadedAt: '2026-10-22T01:00:00Z' };
  await f.run({ operationId: 'op-2', departments: ['HR'] });
  assert.equal(f.distribution.firstReceipts.HR.signatureStoragePath, 'signatures/HR.png');
  assert.equal(f.state.get('dcs_distribution_operations/DC-1_op-2').previousReceipts.HR.signatureStoragePath, 'signatures/second.png');
});
test('copy-request approval uses the same safe path and approves the existing request', async () => {
  const f = fixture({ request: true }); await f.run({ requestId: 'REQ-1' });
  assert.equal(f.state.get('dcs_copy_requests/REQ-1').status, 'APPROVED');
  assert.equal(f.distribution.firstReceipts.HR.signatureStoragePath, 'signatures/HR.png');
  assert.equal(f.distribution.targetDepartments.includes('Planning'), false);
});
test('a failed PDF operation leaves existing rights and receipts unchanged and releases the lock', async () => {
  const f = fixture({ failStamp: true }); const before = clone(f.distribution);
  await assert.rejects(f.run(), /PDF failed/);
  assert.deepEqual(f.distribution.receipts, before.receipts);
  assert.deepEqual(f.distribution.targetDepartments, before.targetDepartments);
  assert.equal(f.distribution.expirationEpoch, before.expirationEpoch);
  assert.equal(f.distribution.reissueLock, null);
});
test('non-DCC, cancelled sets, superseded revisions and concurrent operations are rejected', async () => {
  const f = fixture(); await assert.rejects(f.handler({ auth: { role: 'USER' }, data: {} }), { code: 'permission-denied' });
  for (const options of [{ distribution: { status: 'CANCELLED' } }, { master: { currentRevision: '02' } }, { distribution: { reissueLock: { id: 'busy', expiresAt: Date.now() + 10000 } } }]) {
    const blocked = fixture(options); await assert.rejects(blocked.run());
    assert.equal(blocked.distribution.receipts.HR.signatureStoragePath, 'signatures/HR.png');
  }
});
test('existing controlled files are reused and foreign PDF paths are rejected', async () => {
  const f = fixture({ distribution: { controlledStampVersions: { HR: 2 }, departmentFileLists: { HR: ['valid.pdf'] } } });
  f.files.set('valid.pdf', 'CONTROLLED'); await f.run({ departments: ['HR'] });
  assert.equal(f.loads.length, 0); assert.deepEqual(f.distribution.departmentFileLists.HR, ['valid.pdf']);
  await assert.rejects(f.run({ operationId: 'bad', sourceFiles: [{ path: 'dcs/archive/private.pdf', name: 'one.pdf' }] }), { code: 'invalid-argument' });
});
test('replacement PDFs are archived and a later reopening restores that exact file set after purge', async () => {
  const f = fixture(); const path = 'dcs/distributions/DC-1/source/op-1-replacement.pdf'; f.files.set(path, 'replacement');
  await f.run({ departments: ['HR'], sourceFiles: [{ path, name: 'replacement.pdf' }] });
  const archived = f.distribution.departmentSourceStoragePaths.HR[0];
  assert.ok(archived.startsWith('dcs/archive/')); assert.ok(f.files.has(archived));
  f.distribution.departmentFileLists.HR.forEach(path => f.files.delete(path));
  await f.run({ operationId: 'op-2', departments: ['HR'] });
  assert.equal(f.loads.at(-1), archived);
  assert.deepEqual(f.distribution.departmentFileNames.HR, ['replacement.pdf']);
});
test('legacy QA/QC aliases preserve the earliest signed evidence and reopen one canonical department', () => {
  const early = receipt('QA'); const later = { ...receipt('QA/QC'), downloadedAt: '2026-10-18T01:00:00Z' };
  const { patch } = buildReopenPatch({ targetDepartments: ['QA', 'QA/QC'], targets: [], receipts: { QA: early, 'QA/QC': later } }, ['QA/QC'], { 'QA/QC': { paths: ['pdf'], keys: ['pdf'], names: ['pdf'], sourcePaths: [], departmentKey: 'QA_QC' } }, {}, Date.now(), 'op', 'dcc', 2);
  assert.deepEqual(patch.targetDepartments, ['QA/QC']);
  assert.equal(patch.firstReceipts['QA/QC'].downloadedAt, early.downloadedAt);
  assert.deepEqual(patch.receipts, {});
});
