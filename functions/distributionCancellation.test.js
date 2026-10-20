const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { Readable, Writable } = require('node:stream');
const source = fs.readFileSync(require.resolve('./index.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const base = () => ({ status: 'IN_PROGRESS', stampStatus: 'COMPLETED', storageStatus: 'AVAILABLE', targetDepartments: ['HR', 'QA/QC'], targets: [{ dept: 'HR' }, { dept: 'QA/QC' }], expirationEpoch: Date.now() + 86400000, allocationByDepartment: { HR: 1, 'QA/QC': 1 }, departmentFileLists: { HR: ['dcs/distributions/DC-1/controlled/hr/a.pdf'], 'QA/QC': ['dcs/distributions/DC-1/controlled/qa/a.pdf'] }, receipts: { HR: { downloadedAt: '2026-10-19', downloaderUid: 'hr-user' } }, firstReceipts: { HR: { downloadedAt: '2026-10-18', downloaderUid: 'hr-user' } } });
function harness(initial = base(), options = {}) {
  let data = clone(initial), deletions = 0;
  const audits = [];
  const ref = { id: 'DC-1', get: async () => ({ exists: true, data: () => clone(data) }), update: async patch => { Object.assign(data, clone(patch)); } };
  const db = { collection: () => ({ doc: () => ref }), runTransaction: async callback => {
    options.beforeTransaction?.(data);
    return callback({ get: ref.get, update: (_, patch) => Object.assign(data, clone(patch)), set: (_, entry) => audits.push(clone(entry)) });
  } };
  const remove = async () => { deletions++; options.onDelete?.(data); if (options.failDelete) throw Error('Storage unavailable'); };
  const context = { exports: {}, onCall: (_, fn) => fn, REGION: 'test', requireDcc: async request => { if (request.auth.uid !== 'dcc') throw Error('permission-denied'); }, cleanText: value => String(value || ''), HttpsError: class extends Error { constructor(code, msg) { super(msg); this.code = code; } }, getFirestore: () => db, getStorage: () => ({ bucket: () => ({ deleteFiles: remove, file: () => ({ delete: remove }) }) }), console: { error() {} }, Date };
  vm.createContext(context);
  for (const [begin, end] of [['exports.manageDistributionRecord =', '\nconst QA_QC_ALIASES'], ['exports.cancelDistributionDepartment =', '\n // Canonicalize']]) vm.runInContext(source.slice(source.indexOf(begin), source.indexOf(end, source.indexOf(begin))), context);
  return { call: (action = 'CANCEL', uid = 'dcc') => context.exports.manageDistributionRecord({ auth: { uid }, data: { distributionId: 'DC-1', action, reason: 'ยกเลิกแจกจ่าย' } }), department: department => context.exports.cancelDistributionDepartment({ auth: { uid: 'dcc' }, data: { distributionId: 'DC-1', department, reason: 'ยกเลิกแผนก' } }), data: () => data, deletions: () => deletions, audits };
}
test('whole-set cancellation revokes before Storage I/O and preserves latest signed history', async () => {
  const h = harness(base(), { beforeTransaction: data => { data.receipts['QA/QC'] = { downloadedAt: '2026-10-20' }; }, onDelete: data => { assert.equal(data.status, 'CANCELLED'); assert.equal(data.storageStatus, 'PURGE_PENDING'); } });
  assert.equal((await h.call()).cancelled, true);
  assert.equal(h.data().storageStatus, 'PURGED');
  assert.equal(h.data().receipts['QA/QC'].downloadedAt, '2026-10-20');
  assert.equal(h.data().firstReceipts.HR.downloadedAt, '2026-10-18');
  assert.equal(h.data().targets.length, 2);
  await h.call(); assert.equal(h.deletions(), 1);
});
test('Storage failure leaves access cancelled and queues cleanup rather than reporting cancellation failure', async () => {
  const h = harness(base(), { failDelete: true });
  const result = await h.call();
  assert.equal(result.cancelled, true); assert.equal(result.cleanupPending, true);
  assert.equal(h.data().status, 'CANCELLED'); assert.equal(h.data().storageStatus, 'PURGE_PENDING');
});
test('retrying an older cancellation queues any remaining files for cleanup', async () => {
  const h = harness({ ...base(), status: 'CANCELLED' }, { failDelete: true });
  assert.equal((await h.call()).cleanupPending, true);
  assert.equal(h.data().storageStatus, 'PURGE_PENDING');
  assert.ok(h.data().firstReceipts.HR);
});
test('a late reopen lock prevents cancellation and non-DCC cannot cancel', async () => {
  const h = harness(base(), { beforeTransaction: data => { data.reissueLock = { expiresAt: Date.now() + 60000 }; } });
  await assert.rejects(h.call(), { code: 'aborted' }); assert.equal(h.deletions(), 0);
  await assert.rejects(harness().call('CANCEL', 'hr-user'), /permission-denied/);
});
test('per-department cancellation removes only that allocation and keeps signatures and other departments', async () => {
  const h = harness();
  await h.department('HR');
  assert.deepEqual(h.data().targetDepartments, ['QA/QC']);
  assert.ok(h.data().departmentCancellations.HR); assert.ok(h.data().receipts.HR); assert.ok(h.data().firstReceipts.HR);
  assert.equal(h.data().status, 'IN_PROGRESS'); assert.equal(h.audits.length, 1);
  await h.department('QA/QC'); assert.equal(h.data().status, 'CANCELLED');
});
async function download(distribution, department, all = false) {
  const uid = department === 'HR' ? 'hr-user' : 'qa-user';
  let reads = 0, code, payload, bytes = Buffer.alloc(0);
  const context = { exports: {}, onRequest: (_, fn) => fn, REGION: 'test', setDownloadCors() {}, cleanText: value => String(value || ''), safeSegment: value => value || 'file', getAuth: () => ({ verifyIdToken: async () => ({ uid }) }), getFirestore: () => ({ collection: name => ({ doc: () => ({ get: async () => ({ exists: true, data: () => name === 'users' ? { active: true, role: 'STAFF', department } : distribution }) }) }) }), getStorage: () => ({ bucket: () => ({ file: () => ({ exists: async () => [true], getMetadata: async () => [{ size: 8 }], createReadStream: () => { reads++; return Readable.from(Buffer.from('%PDF-1.7')); } }) }) }), console, Date };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('exports.downloadControlledCopyFile ='), source.indexOf('\nexports.downloadAnnouncementFile =')), context);
  const response = new Writable({ write(chunk, _, done) { bytes = Buffer.concat([bytes, chunk]); done(); } });
  response.set = () => response; response.status = value => { code = value; return response; }; response.json = value => { payload = value; return response; };
  await context.exports.downloadControlledCopyFile({ method: 'GET', get: () => 'Bearer token', query: { distributionId: 'DC-1', index: '0', ...(all ? { all: '1' } : {}) } }, response);
  return { code, payload, reads, bytes };
}
test('cancelled sets deny individual and ZIP downloads before any Storage read', async () => {
  for (const all of [false, true]) {
    const result = await download({ ...base(), status: 'CANCELLED' }, 'HR', all);
    assert.equal(result.code, 410); assert.equal(result.reads, 0);
  }
});
test('department cancellation wins even over a stale allocation; unaffected recipients can still get PDF bytes', async () => {
  const record = { ...base(), departmentCancellations: { HR: { reason: 'cancelled' } } };
  assert.equal((await download(record, 'HR')).code, 410);
  record.receipts['QA/QC'] = { downloadedAt: '2026-10-19', downloaderUid: 'qa-user' };
  const other = await download(record, 'QA/QC'); assert.equal(other.code, 200); assert.equal(other.bytes.toString(), '%PDF-1.7');
});
