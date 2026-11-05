const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

// Exercise the handler code with a Firestore and FCM boundary, not live users.
function fixture(profileDepartment = 'QA') {
  const source = fs.readFileSync(require.resolve('./index.js'), 'utf8');
  const devices = [
    { department: 'QA', token: 'old-qa' },
    { department: 'QC', token: 'old-qc' },
    { department: 'QA/QC', token: 'merged' },
    { department: 'QA/QC', token: 'old-qa' },
    { department: 'HR', token: 'hr' },
    { department: 'QA', token: 'inactive', active: false },
  ];
  const saved = [];
  const sent = [];
  const queries = [];
  const announcementUpdates = [];
  const announcement = { status: 'PUBLISHED', targetDepartments: ['QA/QC'], title: 'ประกาศคุณภาพ', priority: 'NORMAL' };
  const db = {
    collection(name) {
      if (name === 'users') return { doc: () => ({ get: async () => ({ exists: true, data: () => ({ active: true, department: profileDepartment }) }) }) };
      if (name === 'dcs_notification_devices') return {
        doc: id => ({ set: async data => saved.push({ id, data }) }),
        where: (_field, _op, departments) => ({ get: async () => {
          queries.push(Array.from(departments));
          return { docs: devices.filter(device => departments.includes(device.department)).map(device => ({ data: () => device, ref: { update: async () => {} } })) };
        } }),
      };
      if (name === 'dcs_announcements') return { doc: () => ({ get: async () => ({ exists: true, data: () => announcement }), update: async data => announcementUpdates.push(data) }) };
      throw new Error(`unexpected collection ${name}`);
    },
  };
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const context = vm.createContext({
    exports: {}, REGION: 'asia-southeast1', HttpsError, createHash,
    onCall: (_options, handler) => handler,
    cleanText: (value, maxLength) => String(value || '').trim().slice(0, maxLength),
    getFirestore: () => db,
    getMessaging: () => ({ sendEachForMulticast: async payload => {
      sent.push(Array.from(payload.tokens));
      return { successCount: payload.tokens.length, failureCount: 0, responses: payload.tokens.map(() => ({ success: true })) };
    } }),
    requireDcc: async () => {},
    QA_QC_ALIASES: new Set(['QA', 'QC', 'QA/QC']),
    canonicalDepartment: dept => ['QA', 'QC', 'QA/QC'].includes(dept) ? 'QA/QC' : dept,
  });
  const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
  vm.runInContext(between('exports.registerNotificationDevice =', '\nconst chunksOf ='), context);
  vm.runInContext(between('const chunksOf =', '\nasync function loadPdf'), context);
  return { context, saved, sent, queries, announcementUpdates, announcement };
}

test('legacy QA and QC registrations use the merged department without allowing another department', async () => {
  for (const department of ['QA', 'QC', 'QA/QC']) {
    const f = fixture(department);
    await f.context.exports.registerNotificationDevice({ auth: { uid: 'employee' }, data: { token: 'device', department: 'QA/QC' } });
    assert.equal(f.saved[0].data.department, 'QA/QC');
    await assert.rejects(f.context.exports.registerNotificationDevice({ auth: { uid: 'employee' }, data: { token: 'device', department: 'HR' } }), { code: 'permission-denied' });
  }
});

test('new distribution includes old QA and QC devices once and excludes other departments', async () => {
  for (const department of ['QA', 'QC', 'QA/QC']) {
    const f = fixture(); const updates = [];
    await f.context.notifyDistributionReady('distribution', { targetDepartments: [department], docNo: 'WI-01' }, { update: async data => updates.push(data) });
    assert.deepEqual(f.sent.flat().sort(), ['merged', 'old-qa', 'old-qc']);
    assert.deepEqual(f.queries.flat().sort(), ['QA', 'QA/QC', 'QC'].sort());
    assert.equal(updates[0].notificationDeviceCount, 3);
    assert.equal(updates[0].notificationSuccessCount, 3);
  }
});

test('announcements reach legacy QA devices while other departments remain excluded', async () => {
  const f = fixture();
  await f.context.exports.notifyAnnouncement({ data: { announcementId: 'announcement' } });
  assert.deepEqual(f.sent.flat().sort(), ['merged', 'old-qa', 'old-qc']);
  assert.equal(f.announcementUpdates[0].notificationDeviceCount, 3);
  const other = fixture(); other.announcement.targetDepartments = ['HR'];
  await other.context.exports.notifyAnnouncement({ data: { announcementId: 'announcement' } });
  assert.deepEqual(other.sent.flat(), ['hr']);
});
