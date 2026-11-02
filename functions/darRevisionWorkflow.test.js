const test = require('node:test'), assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');
const { createDarRevisionWorkflow, isPreviousPath } = require('./darRevisionWorkflow');
const clone = value => value === undefined ? value : structuredClone(value);
async function setup() {
  const records = new Map(), files = new Map(); let seq = 0, beforeTransaction;
  const ref = path => ({ path, id: path.split('/').at(-1), get: async () => ({ exists: records.has(path), data: () => clone(records.get(path)), ref: ref(path), id: path.split('/').at(-1) }), set: async data => records.set(path, clone(data)), delete: async () => records.delete(path), update: async data => Object.assign(records.get(path), clone(data)) });
  const db = {
    collection: name => ({
      doc: id => ref(`${name}/${id || ++seq}`),
      where: (field, operator, value) => ({ get: async () => ({ docs: await Promise.all([...records].filter(([path, data]) => path.startsWith(name + '/') && data[field] === value).map(([path]) => ref(path).get())) }) }),
    }),
    runTransaction: async cb => {
      if (beforeTransaction) { const hook = beforeTransaction; beforeTransaction = null; hook(); }
      const writes = [];
      const value = await cb({
        get: r => r.get(), set: (r, data) => writes.push(() => records.set(r.path, clone(data))),
        create: (r, data) => { if (records.has(r.path)) throw Error('duplicate'); writes.push(() => records.set(r.path, clone(data))); },
        update: (r, data) => writes.push(() => Object.assign(records.get(r.path), clone(data))),
      });
      writes.forEach(write => write()); return value;
    },
  };
  const bucket = { file: path => ({ path, exists: async () => [files.has(path)], getMetadata: async () => { const file = files.get(path); if (!file) throw Error('missing'); return [{ contentType: file.type, size: file.bytes.length }]; }, download: async () => [Buffer.from(files.get(path).bytes)], copy: async target => files.set(target.path, { ...files.get(path), bytes: Buffer.from(files.get(path).bytes) }), save: async (bytes, options) => files.set(path, { bytes: Buffer.from(bytes), type: options.contentType }), delete: async () => files.delete(path) }) };
  const api = createDarRevisionWorkflow({ getFirestore: () => db, getStorage: () => ({ bucket: () => bucket }), HttpsError: class extends Error { constructor(code, message) { super(message); this.code = code; } }, loadPdf: async path => PDFDocument.load(files.get(path).bytes), normalizeSignature: async bytes => bytes, safeSegment: value => String(value).replace(/[^A-Za-z0-9._-]/g, '_') });
  for (const [uid, dept] of [['hr', 'HR'], ['qa', 'QA'], ['dcc', 'DCC'], ['planning', 'Planning']]) {
    records.set(`users/${uid}`, { active: true, role: uid === 'dcc' ? 'DCC_ADMIN' : 'STAFF', department: dept, displayName: dept, signaturePath: `signatures/${uid}.png` });
    files.set(`signatures/${uid}.png`, { type: 'image/png', bytes: Buffer.from('registered signature ' + dept) });
  }
  const master = { docNo: 'WI-HR-01', docNameTh: 'เอกสารทดสอบ', ownerDept: 'HR', currentRevision: '04', fileNames: ['old-one.pdf', 'old-two.pdf'], currentFileStoragePaths: ['dcs/archive/WI-HR-01/active/rev-04/1.pdf', 'dcs/archive/WI-HR-01/active/rev-04/2.pdf'] };
  master.currentFileStoragePath = master.currentFileStoragePaths[0]; records.set('dcs_documents/WI-HR-01', master);
  for (const [index, path] of master.currentFileStoragePaths.entries()) { const pdf = await PDFDocument.create(); pdf.addPage([595 + index, 842]); files.set(path, { bytes: Buffer.from(await pdf.save()), type: 'application/pdf' }); }
  const darId = 'DAR-2026-0002';
  const prepare = (data = {}, uid = 'hr') => api.preparePreviousRevision({ auth: uid ? { uid } : null, data: { darId, docNo: 'WI-HR-01', revision: '04', useMaster: true, ...data } });
  const receipt = dept => ({ dept, downloadedAt: '2026-10-01T00:00:00Z', signatureStoragePath: `received/${dept}`, receivedCopies: 1 });
  const distribution = { id: 'new', darReferenceId: darId, status: 'IN_PROGRESS', stampStatus: 'COMPLETED', docId: 'WI-HR-01', docNo: 'WI-HR-01', docNameTh: 'เอกสารทดสอบ', revision: '05', targetDepartments: ['HR'], receipts: { HR: receipt('HR') } };
  const seedReturns = () => {
    master.currentRevision = '05'; master.status = 'ACTIVE';
    records.set('dcs_dars/' + darId, { requestType: 'REVISION', currentRevision: '04' }); records.set('dcs_distributions/new', distribution);
    records.set('dcs_distributions/old', { docId: 'WI-HR-01', revision: '04', receipts: { HR: receipt('HR'), QA: receipt('QA'), QC: receipt('QC') } });
  };
  const confirm = (uid = 'hr', data = {}) => api.confirmReturn({ auth: uid ? { uid } : null, data: { returnId: `${darId}__${uid === 'qa' ? 'QA%2FQC' : 'HR'}`, consent: true, ...data } });
  return { api, records, files, master, darId, prepare, distribution, seedReturns, confirm, before: hook => { beforeTransaction = hook; } };
}

test('all previous PDFs become independent immutable snapshots that survive original cleanup', async () => {
  const h = await setup(), oldBytes = h.master.currentFileStoragePaths.map(path => h.files.get(path).bytes);
  const result = await h.prepare(); assert.equal(result.attachments.length, 2);
  h.master.currentFileStoragePaths.forEach(path => h.files.delete(path));
  result.attachments.forEach((file, index) => { assert.ok(isPreviousPath(file.storagePath, h.darId)); assert.deepEqual(h.files.get(file.storagePath).bytes, oldBytes[index]); assert.equal(file.source, 'MASTER'); });
  assert.deepEqual(h.records.get('dcs_dar_previous_files/' + h.darId).previous, result);
});
test('manual multiple PDFs work without archived originals and staging files are not retained as evidence', async () => {
  const h = await setup(), uploads = h.master.currentFileStoragePaths.map((path, index) => {
    const staged = `dcs/dar-attachments/hr/${h.darId}/previous-upload-${index}.pdf`; h.files.set(staged, h.files.get(path)); return { name: `old-${index}.pdf`, storagePath: staged };
  });
  const result = await h.prepare({ useMaster: false, uploadedAttachments: uploads });
  assert.equal(result.attachments.length, 2); assert.ok(result.attachments.every(file => file.source === 'UPLOAD'));
  assert.ok(uploads.every(file => !h.files.has(file.storagePath)));
});
test('wrong revision, wrong department, unauthenticated caller and foreign staging path are rejected before snapshot creation', async () => {
  for (const kind of ['revision', 'department', 'auth', 'path', 'empty', 'limit', 'corrupt']) {
    const h = await setup(); let data = {}, uid = 'hr';
    if (kind === 'revision') data.revision = '03'; if (kind === 'department') uid = 'qa'; if (kind === 'auth') uid = null;
    if (kind === 'path') data = { useMaster: false, uploadedAttachments: [{ name: 'old.pdf', storagePath: `dcs/dar-attachments/qa/${h.darId}/previous-upload-1.pdf` }] };
    if (kind === 'empty') data = { useMaster: false };
    if (kind === 'limit') data.uploadedAttachments = Array(21).fill({});
    if (kind === 'corrupt') h.files.get(h.master.currentFileStoragePath).bytes = Buffer.from('not a PDF');
    await assert.rejects(h.prepare(data, uid)); assert.equal([...h.files.keys()].filter(path => path.startsWith('dcs/dar-previous/')).length, 0, kind);
  }
});
test('a revision change during copying aborts and removes uncommitted snapshots', async () => {
  const h = await setup(); h.before(() => { h.master.currentRevision = '05'; });
  await assert.rejects(h.prepare(), /เปลี่ยนแล้ว/); assert.equal([...h.files.keys()].filter(path => path.startsWith('dcs/dar-previous/')).length, 0);
});
test('recall targets actual old holders, merges QA/QC and remains one request per DAR/department on retry', async () => {
  const h = await setup(); h.seedReturns();
  await h.api.ensureReturnsForDistribution('new'); await h.api.ensureReturnsForDistribution('new');
  const tasks = [...h.records].filter(([path]) => path.startsWith('dcs_document_returns/')).map(([, value]) => value);
  assert.deepEqual(tasks.map(task => task.dept).sort(), ['HR', 'QA/QC']); assert.equal(tasks[1].sourceDistributionIds.length, 1);
  assert.ok(tasks.every(task => task.previousRevision === '04' && task.newRevision === '05'));
});
test('unpublished/cancelled replacement or no actual old receipt does not issue recall tasks', async () => {
  for (const kind of ['processing', 'cancelled', 'unsigned']) {
    const h = await setup(); h.seedReturns();
    if (kind === 'processing') h.distribution.stampStatus = 'PROCESSING'; if (kind === 'cancelled') h.distribution.status = 'CANCELLED';
    if (kind === 'unsigned') h.records.get('dcs_distributions/old').receipts = { HR: { downloadedAt: '2026-10-01' } };
    await h.api.ensureReturnsForDistribution('new'); assert.equal([...h.records.keys()].filter(path => path.startsWith('dcs_document_returns/')).length, 0);
  }
});
test('confirmation uses registered identity and immutable signature, writes print evidence once and ignores spoofed names', async () => {
  const h = await setup(); h.seedReturns(); await h.api.ensureReturnsForDistribution('new');
  await h.confirm('hr', { signerName: 'DCC', signatureStoragePath: 'arbitrary' });
  const task = h.records.get('dcs_document_returns/' + h.darId + '__HR');
  assert.equal(task.status, 'CONFIRMED'); assert.equal(task.signerName, 'HR'); assert.equal(task.confirmerUid, 'hr');
  assert.deepEqual(h.files.get(task.signatureStoragePath).bytes, h.files.get('signatures/hr.png').bytes);
  assert.equal(h.distribution.returnReceipts.HR.signatureStoragePath, task.signatureStoragePath);
  h.files.get('signatures/hr.png').bytes = Buffer.from('changed'); assert.notDeepEqual(h.files.get(task.signatureStoragePath).bytes, h.files.get('signatures/hr.png').bytes);
  assert.equal((await h.confirm()).alreadyConfirmed, true);
  assert.equal([...h.records.keys()].filter(path => path.startsWith('dcs_audit_logs/')).length, 1);
});
test('QA legacy account can return an old copy even when not allocated a new copy', async () => {
  const h = await setup(); h.seedReturns(); await h.api.ensureReturnsForDistribution('new');
  await h.confirm('qa'); assert.equal(h.distribution.returnReceipts['QA/QC'].signerName, 'QA');
});
test('other departments, inactive users, missing consent/signature and missing replacement receipt cannot confirm', async () => {
  for (const kind of ['department', 'inactive', 'consent', 'signature', 'receipt', 'cancelled']) {
    const h = await setup(); h.seedReturns(); await h.api.ensureReturnsForDistribution('new'); let uid = 'hr', data = {};
    if (kind === 'department') uid = 'planning'; if (kind === 'inactive') h.records.get('users/hr').active = false;
    if (kind === 'consent') data.consent = false; if (kind === 'signature') delete h.records.get('users/hr').signaturePath;
    if (kind === 'receipt') h.distribution.receipts = {}; if (kind === 'cancelled') h.distribution.status = 'CANCELLED';
    await assert.rejects(h.confirm(uid, data)); assert.equal(h.records.get('dcs_document_returns/' + h.darId + '__HR').status, 'PENDING', kind);
    assert.equal([...h.files.keys()].filter(path => path.startsWith('dcs/return-signatures/')).length, 0, kind);
  }
});
test('cancellation while signing wins; cancelling pending tasks retains already confirmed evidence', async () => {
  const h = await setup(); h.seedReturns(); await h.api.ensureReturnsForDistribution('new');
  h.before(() => { h.distribution.status = 'CANCELLED'; }); await assert.rejects(h.confirm());
  h.distribution.status = 'IN_PROGRESS'; await h.confirm(); await h.api.cancelReturns('new');
  assert.equal(h.records.get('dcs_document_returns/' + h.darId + '__HR').status, 'CONFIRMED');
  assert.equal(h.records.get('dcs_document_returns/' + h.darId + '__QA%2FQC').status, 'CANCELLED');
});

test('DCC retry can reopen unsigned cancelled requests for a replacement set without duplicating confirmed history', async () => {
  const h=await setup();h.seedReturns();await h.api.ensureReturnsForDistribution('new');await h.confirm();await h.api.cancelReturns('new');
  h.records.set('dcs_distributions/replacement',{...h.distribution,id:'replacement'});
  await h.api.ensureReturnsForDistribution('replacement');
  const hr=h.records.get('dcs_document_returns/'+h.darId+'__HR'),qa=h.records.get('dcs_document_returns/'+h.darId+'__QA%2FQC');
  assert.equal(hr.status,'CONFIRMED');assert.equal(hr.distributionId,'new');assert.equal(qa.status,'PENDING');assert.equal(qa.distributionId,'replacement');
});
test('reconciliation never creates new recall tasks for an already superseded replacement revision', async () => {
  const h=await setup();h.seedReturns();h.master.currentRevision='06';await h.api.ensureReturnsForDistribution('new');
  assert.equal([...h.records.keys()].filter(path=>path.startsWith('dcs_document_returns/')).length,0);
});
