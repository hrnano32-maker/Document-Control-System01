const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync(require.resolve('./index.js'), 'utf8');
const start = code.indexOf('async function purgeDistribution(');
const end = code.indexOf('\nexports.purgeExpiredDistributions', start);
async function runPurge(fresh) {
  let data = structuredClone(fresh), deletes = 0;
  const ref = { update: async patch => { data = { ...data, ...patch }; } };
  const db = { runTransaction: async callback => callback({ get: async () => ({ data: () => structuredClone(data) }), update: (_, patch) => { data = { ...data, ...patch }; } }) };
  const context = { getFirestore: () => db, getStorage: () => ({ bucket: () => ({ deleteFiles: async () => { deletes += 1; } }) }), randomBytes: () => Buffer.from('purge'), console, Date };
  vm.createContext(context);
  vm.runInContext(code.slice(start, end) + '\nthis.purge = purgeDistribution;', context);
  await context.purge({ id: 'DC-1', ref, data: () => ({ expirationEpoch: 1, storageStatus: 'AVAILABLE' }) }, 'DOWNLOAD_WINDOW_EXPIRED');
  return { data, deletes };
}
test('a stale purge snapshot cannot delete files after a successful reopening', async () => {
  const result = await runPurge({ expirationEpoch: Date.now() + 86400000, storageStatus: 'AVAILABLE' });
  assert.equal(result.deletes, 0);
});
test('purging skips an in-progress reopen, but still removes actually expired files', async () => {
  const busy = await runPurge({ expirationEpoch: 1, storageStatus: 'AVAILABLE', reissueLock: { expiresAt: Date.now() + 10000 } });
  assert.equal(busy.deletes, 0);
  const expired = await runPurge({ expirationEpoch: 1, status: 'IN_PROGRESS', storageStatus: 'AVAILABLE' });
  assert.equal(expired.deletes, 1); assert.equal(expired.data.status, 'EXPIRED'); assert.equal(expired.data.reissueLock, null);
});

test('expired-file cleanup cannot change a cancelled set back to EXPIRED', async () => {
  const result = await runPurge({ expirationEpoch: 1, status: 'CANCELLED', storageStatus: 'AVAILABLE' });
  assert.equal(result.deletes, 1); assert.equal(result.data.status, 'CANCELLED');
});
