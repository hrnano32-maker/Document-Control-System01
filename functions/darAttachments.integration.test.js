const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { Readable, Writable } = require('node:stream');
const { PDFDocument, PDFName, PDFString } = require('pdf-lib');
const helpers = require('./darAttachments');
const { controlledStamp, CONTROLLED_STAMP_VERSION } = require('./controlledStamp');
const source = fs.readFileSync(require.resolve('./index.js'), 'utf8');
async function setup(count = 2, legacy = false) {
  const darId = 'DAR-2026-0001', records = new Map(), files = new Map(), copied = [];
  const attachments = [];
  for (let i = 0; i < count; i++) {
    const pdf = await PDFDocument.create(); pdf.addPage([595 + i, 842]);
    const path = `dcs/dar-attachments/hr/${darId}/${i + 1}-same.pdf`;
    files.set(path, Buffer.from(await pdf.save())); attachments.push({ name: 'same.pdf', size: '1 KB', type: 'application/pdf', storagePath: path });
  }
  const dar = { id: darId, docNo: 'WI-HR-01', status: 'REGISTERED', requestType: 'NEW', requestDept: 'HR', attachments, distributionHolders: [{ checked: true, dept: 'HR', copies: '1' }, { checked: true, dept: 'QA/QC', copies: '1' }], attachmentFileName: attachments[0].name, attachmentFileSize: '1 KB', attachmentFileType: 'application/pdf', attachmentStoragePath: attachments[0].storagePath };
  if (legacy) delete dar.attachments;
  records.set('dcs_dars/' + darId, dar);
  records.set('dcs_documents/WI-HR-01', { darReferenceId: darId, status: 'ACTIVE', currentRevision: '00', docNo: 'WI-HR-01', docNameTh: 'เอกสารทดสอบ', docType: 'WI', effectiveDate: '2026-10-23' });
  for (const [uid, department] of [['dcc', 'DCC'], ['hr', 'HR'], ['qa', 'QA/QC']]) records.set('users/' + uid, { active: true, department, role: uid === 'dcc' ? 'DCC_ADMIN' : 'STAFF' });
  const refs = name => ({ id: name.split('/').at(-1), name,
    get: async () => ({ exists: records.has(name), data: () => structuredClone(records.get(name)), ref: refs(name) }),
    update: async patch => Object.assign(records.get(name), patch),
    create: async data => { if (records.has(name)) throw Error('already-exists'); records.set(name, data); }, delete: async () => records.delete(name),
  });
  const db = { collection: name => ({ doc: id => refs(`${name}/${id}`), where: (field, _op, value) => ({ limit: () => ({ get: async () => { const matches = [...records].filter(([key, data]) => key.startsWith(name + '/') && data[field] === value); return { empty: !matches.length, docs: matches.map(([key]) => ({ id: key.split('/').at(-1) })) }; } }) }) }), runTransaction: async cb => cb({ get: ref => ref.get(), set: (ref, data) => records.set(ref.name, data) }) };
  const bucket = { file: path => ({ path, exists: async () => [files.has(path)], getMetadata: async () => [{ size: files.get(path)?.length, contentType: 'application/pdf' }],
    copy: async target => { copied.push(target.path); if (!files.has(path)) throw Error('missing source'); files.set(target.path, files.get(path)); },
    save: async bytes => files.set(path, Buffer.from(bytes)), delete: async () => files.delete(path),
    createReadStream: () => Readable.from(files.get(path)),
  }) };
  const context = { ...helpers, exports: {}, REGION: 'test', Buffer, Date, PDFDocument, controlledStamp, CONTROLLED_STAMP_VERSION,
    onCall: (_, cb) => cb, onRequest: (_, cb) => cb, getAuth: () => ({ verifyIdToken: async token => ({ uid: token }) }),
    requireDcc: async req => { if (req.auth?.uid !== 'dcc') throw Error('DCC required'); },
    cleanText: value => String(value || ''), safeSegment: value => String(value).replace(/[^A-Za-z0-9_.-]/g, '_'),
    getFirestore: () => db, getStorage: () => ({ bucket: () => bucket }), setDownloadCors() {},
    loadPdf: async path => PDFDocument.load(files.get(path)), savePdf: async (pdf, path) => bucket.file(path).save(await pdf.save()), notifyDistributionReady: async () => {},
    HttpsError: class extends Error { constructor(code, message) { super(message); this.code = code; } }, console,
  };
  vm.createContext(context);
  for (const [startText, endText] of [['exports.createAutomaticDistributionFromDar =', '\n// Re-issuing'], ['exports.stampControlledCopies =', '\nexports.createAutomaticDistributionFromDar'], ['exports.deleteDarDraft =', '\nasync function requireDcc'], ['exports.downloadDarAttachmentFile =', null]]) {
    const start = source.indexOf(startText), end = endText ? source.indexOf(endText, start) : source.length;
    vm.runInContext(source.slice(start, end), context);
  }
  const invoke = () => context.exports.createAutomaticDistributionFromDar({ auth: { uid: 'dcc' }, data: { darId } });
  const download = async (uid, index) => {
    let bytes = Buffer.alloc(0), code = 200, payload; const headers = {};
    const response = new Writable({ write(chunk, _, done) { bytes = Buffer.concat([bytes, chunk]); done(); } });
    response.set = (key, value) => { headers[key] = value; return response; }; response.status = value => { code = value; return response; }; response.json = value => { payload = value; return response; };
    await context.exports.downloadDarAttachmentFile({ method: 'GET', query: { darId, index: String(index) }, get: () => 'Bearer ' + uid }, response);
    return { bytes, code, payload, headers };
  };
  return { dar, attachments, records, files, copied, invoke, download, handlers: context.exports };
}
test('multiple PDF sources produce one distribution, all stamped department files and all clean originals', async () => {
  const h = await setup(); const result = await h.invoke();
  const data = h.records.get('dcs_distributions/' + result.distributionId);
  assert.equal(data.sourceStoragePaths.length, 2); assert.equal(new Set(data.sourceStoragePaths).size, 2); assert.equal(data.fileNames.length, 2);
  await h.handlers.stampControlledCopies({ auth: { uid: 'dcc' }, data: { distributionId: result.distributionId } });
  for (const dept of ['HR', 'QA/QC']) {
    assert.equal(data.departmentFileLists[dept].length, 2);
    for (let i = 0; i < 2; i++) {
      const pdf = await PDFDocument.load(h.files.get(data.departmentFileLists[dept][i]));
      assert.equal(pdf.getPage(0).getWidth(), 595 + i);
      assert.equal(pdf.getPage(0).node.lookup(PDFName.of('DCSControlledCopyDepartment'), PDFString).decodeText(), dept);
    }
  }
  assert.equal(h.records.get('dcs_documents/WI-HR-01').currentFileStoragePaths.length, 2);
  assert.equal((await h.invoke()).distributionId, result.distributionId);
  assert.equal([...h.records.keys()].filter(key => key.startsWith('dcs_distributions/')).length, 1);
});
test('legacy single PDF remains supported and 20 sources retain their order', async () => {
  for (const [count, legacy] of [[1, true], [20, false]]) {
    const h = await setup(count, legacy); const result = await h.invoke();
    assert.equal(h.records.get('dcs_distributions/' + result.distributionId).sourceStoragePaths.length, count);
  }
});
test('missing, corrupt, non-PDF or foreign-DAR sources fail before publishing any distribution', async () => {
  for (const kind of ['missing', 'corrupt', 'non-pdf', 'foreign']) {
    const h = await setup(); const last = h.dar.attachments[1];
    if (kind === 'missing') h.files.delete(last.storagePath);
    if (kind === 'corrupt') h.files.set(last.storagePath, Buffer.from('not a pdf'));
    if (kind === 'non-pdf') last.name = 'archive.zip';
    if (kind === 'foreign') last.storagePath = 'dcs/dar-attachments/hr/DAR-other/file.pdf';
    await assert.rejects(h.invoke());
    assert.equal([...h.records.keys()].filter(key => key.startsWith('dcs_distributions/')).length, 0); assert.equal(h.copied.length, 0);
  }
});
test('DCC and requesting department download the selected original bytes; other departments are denied', async () => {
  const h = await setup();
  for (const uid of ['dcc', 'hr']) for (let index = 0; index < 2; index++) {
    const result = await h.download(uid, index);
    assert.equal(result.code, 200); assert.deepEqual(result.bytes, h.files.get(h.attachments[index].storagePath));
    assert.match(result.headers['Content-Disposition'], /^attachment;/);
  }
  assert.equal((await h.download('qa', 1)).code, 403);
  assert.equal((await h.download('hr', 8)).code, 404);
  h.files.delete(h.attachments[1].storagePath); assert.equal((await h.download('hr', 1)).code, 404);
});
test('deleting an unapproved DAR deletes all its attachments and retains unrelated files', async () => {
  const h = await setup(); h.dar.status = 'PENDING_REVIEW'; h.files.set('unrelated.pdf', Buffer.from('keep'));
  await h.handlers.deleteDarDraft({ auth: { uid: 'hr' }, data: { darId: h.dar.id } });
  for (const file of h.attachments) assert.equal(h.files.has(file.storagePath), false);
  assert.equal(h.files.has('unrelated.pdf'), true); assert.equal(h.records.has('dcs_dars/' + h.dar.id), false);
});
