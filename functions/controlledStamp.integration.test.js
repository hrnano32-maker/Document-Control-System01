// Real PDF processing with in-memory Firestore/Storage boundaries. No live writes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { PDFDocument, PDFName, PDFString } = require('pdf-lib');
const { controlledStamp, CONTROLLED_STAMP_VERSION } = require('./controlledStamp');
const source = fs.readFileSync(require('node:path').join(__dirname, 'index.js'), 'utf8');

async function setup(version, missing = false) {
  const original = await PDFDocument.create(); original.addPage([595, 842]);
  const originalBytes = await original.save();
  const records = new Map();
  const files = new Map([['archive/one.pdf', originalBytes], ['archive/two.pdf', originalBytes], ['upload/one.pdf', originalBytes], ['upload/two.pdf', originalBytes]]);
  if (!missing) { files.set('old/one.pdf', originalBytes); files.set('old/two.pdf', originalBytes); }
  const saved = [];
  const loaded = [];
  const refs = name => ({ name, get: async () => ({ exists: records.has(name), data: () => structuredClone(records.get(name)) }), update: async patch => Object.assign(records.get(name), patch) });
  const db = { collection: name => ({ doc: id => refs(`${name}/${id}`) }), batch: () => { const writes = []; return { update: (ref, patch) => writes.push([ref, patch]), commit: async () => { for (const [ref, patch] of writes) await ref.update(patch); } }; } };
  const bucket = { file: path => ({ exists: async () => [files.has(path)], save: async bytes => { saved.push(path); files.set(path, bytes); }, delete: async () => { files.delete(path); } }) };
  const data = { docId: 'WI-PD2-004', docNo: 'WI-PD2-004', revision: '05', targetDepartments: ['Production 2/3', 'HR'], targets: [{ dept: 'Production 2/3', isDownloaded: true }, { dept: 'HR', isDownloaded: true }], departmentFiles: { 'Production 2/3': 'old/one.pdf', HR: 'hr/unchanged.pdf' }, departmentFileLists: { 'Production 2/3': ['old/one.pdf', 'old/two.pdf'], HR: ['hr/unchanged.pdf'] }, fileNames: ['one.pdf', 'two.pdf'], receipts: { 'Production 2/3': { downloadedAt: 'old' }, HR: { downloadedAt: 'keep' } }, controlledStampVersions: { 'Production 2/3': version, HR: 'untouched' } };
  records.set('dcs_distributions/same-distribution', data);
  records.set('dcs_copy_requests/request', { distributionId: 'same-distribution', status: 'PROCESSING', dept: 'Production 2/3' });
  records.set('dcs_documents/WI-PD2-004', { currentRevision: '05', status: 'ACTIVE', currentFileStoragePaths: ['archive/one.pdf', 'archive/two.pdf'] });
  const context = { exports: {}, REGION: 'test', Buffer, PDFDocument, controlledStamp, CONTROLLED_STAMP_VERSION,
    onCall: (_, handler) => handler, requireDcc: async request => { if (request.auth?.uid !== 'dcc') throw Error('DCC required'); },
    cleanText: value => String(value || '').trim(), safeSegment: value => String(value).replace(/[^A-Za-z0-9_.-]/g, '_'),
    getFirestore: () => db, getStorage: () => ({ bucket: () => bucket }),
    loadPdf: async path => { loaded.push(path); assert.ok(files.has(path)); return PDFDocument.load(files.get(path)); },
    savePdf: async (pdf, path) => bucket.file(path).save(await pdf.save()), notifyDistributionReady: async () => {},
    HttpsError: class extends Error { constructor(code, message) { super(message); this.code = code; } },
    console,
  };
  for (const name of ['stampControlledCopies', 'reissueControlledCopies']) {
    const start = source.indexOf(`exports.${name} =`);
    const end = source.indexOf('\nexports.', start + 1);
    vm.runInNewContext(source.slice(start, end), context);
  }
  return { records, files, saved, loaded, handlers: context.exports, data };
}

test('first distribution stamps every PDF for each department and archives clean originals', async () => {
  const state = await setup();
  Object.assign(state.data, { departmentFiles: {}, sourceStoragePath: 'upload/one.pdf', sourceStoragePaths: ['upload/one.pdf', 'upload/two.pdf'], fileType: 'application/pdf' });
  await state.handlers.stampControlledCopies({ auth: { uid: 'dcc' }, data: { distributionId: 'same-distribution' } });
  for (const department of state.data.targetDepartments) {
    assert.equal(state.data.controlledStampVersions[department], CONTROLLED_STAMP_VERSION);
    assert.equal(state.data.departmentFileLists[department].length, 2);
    for (const path of state.data.departmentFileLists[department]) {
      const pdf = await PDFDocument.load(state.files.get(path));
      assert.equal(pdf.getPage(0).node.lookup(PDFName.of('DCSControlledCopyDepartment'), PDFString).decodeText(), department);
    }
  }
  const master = state.records.get('dcs_documents/WI-PD2-004');
  for (const path of master.currentFileStoragePaths) {
    const pdf = await PDFDocument.load(state.files.get(path));
    assert.equal(pdf.getPage(0).getHeight(), 842);
    assert.equal(pdf.getPage(0).node.get(PDFName.of('DCSControlledCopyVersion')), undefined);
  }
});

for (const [name, version, missing, regenerate] of [
  ['legacy files', undefined, false, true],
  ['current files', CONTROLLED_STAMP_VERSION, false, false],
  ['purged files', CONTROLLED_STAMP_VERSION, true, true],
]) test(`reissue ${name} in same distribution without touching other recipients`, async () => {
  const state = await setup(version, missing);
  const beforeHr = structuredClone(state.data.receipts.HR);
  const result = await state.handlers.reissueControlledCopies({ auth: { uid: 'dcc' }, data: { distributionId: 'same-distribution', requestId: 'request' } });
  assert.equal(result.distributionId, 'same-distribution');
  assert.equal(result.fileCount, 2);
  assert.equal(state.saved.length, regenerate ? 2 : 0);
  assert.deepEqual(state.loaded, regenerate ? ['archive/one.pdf', 'archive/two.pdf'] : []);
  assert.deepEqual(state.data.receipts.HR, beforeHr);
  assert.equal(state.data.departmentFiles.HR, 'hr/unchanged.pdf');
  assert.equal(state.data.controlledStampVersions.HR, 'untouched');
  assert.equal(state.data.controlledStampVersions['Production 2/3'], CONTROLLED_STAMP_VERSION);
  assert.equal(state.records.size, 3);
  if (regenerate) for (const path of state.data.departmentFileLists['Production 2/3']) {
    const pdf = await PDFDocument.load(state.files.get(path));
    assert.equal(pdf.getPage(0).getHeight(), 886);
  }
});

test('legacy refresh rejects obsolete revision or non-DCC before writing files', async () => {
  const state = await setup();
  const request = { auth: { uid: 'dcc' }, data: { distributionId: 'same-distribution', requestId: 'request' } };
  state.records.get('dcs_documents/WI-PD2-004').currentRevision = '06';
  await assert.rejects(state.handlers.reissueControlledCopies(request), /Revision/);
  await assert.rejects(state.handlers.reissueControlledCopies({ ...request, auth: { uid: 'department' } }), /DCC/);
  assert.equal(state.saved.length, 0);
});
