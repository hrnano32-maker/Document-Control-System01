const { randomBytes } = require('node:crypto');
const { MAX_DAR_PDFS, MAX_PDF_BYTES, isDarAttachmentPath } = require('./darAttachments');
const revisionKey = value => String(value || '').trim().replace(/^rev[.\s]*/i, '').replace(/^0+(?=\d)/, '').toUpperCase();
const documentKey = value => encodeURIComponent(String(value || '').trim().toUpperCase()).replace(/%/g, '_');
const departmentKey = value => ['QA', 'QC', 'QA/QC'].includes(value) ? 'QA/QC' : value;
const isPreviousPath = (path, darId) => typeof path === 'string' && /^dcs\/dar-previous\/[^/]+\/[^/]+\/[^/]+$/.test(path) && path.split('/')[3] === darId;

function createDarRevisionWorkflow({ getFirestore, getStorage, HttpsError, loadPdf, normalizeSignature, safeSegment }) {
  const fail = (code, message) => { throw new HttpsError(code, message); };
  const activeProfile = async request => {
    if (!request.auth?.uid) fail('unauthenticated', 'กรุณาเข้าสู่ระบบ');
    const snap = await getFirestore().collection('users').doc(request.auth.uid).get();
    if (!snap.exists || snap.data().active !== true) fail('permission-denied', 'บัญชีไม่มีสิทธิ์ใช้งาน');
    return snap.data();
  };
  const readPdf = async (path, name) => {
    const file = getStorage().bucket().file(path);
    if (!(await file.exists())[0]) fail('not-found', `ไม่พบไฟล์ฉบับเดิม ${name} กรุณาแนบ PDF ฉบับเดิมจากเครื่อง`);
    const [metadata] = await file.getMetadata();
    if (!/\.pdf$/i.test(name) || metadata.contentType !== 'application/pdf' || !(Number(metadata.size) > 0 && Number(metadata.size) < MAX_PDF_BYTES)) fail('invalid-argument', 'ฉบับเดิมต้องเป็น PDF ขนาดน้อยกว่า 25 MB');
    await loadPdf(path);
    return { name, size: `${(Number(metadata.size) / 1048576).toFixed(2)} MB`, type: 'application/pdf', storagePath: path };
  };

  async function preparePreviousRevision(request) {
    const profile = await activeProfile(request), db = getFirestore();
    const { darId, docNo, revision, uploadedAttachments = [], useMaster = true } = request.data || {};
    if (typeof darId !== 'string' || darId.length > 80 || !/^DAR-\d{4}-\d+$/.test(darId) || typeof docNo !== 'string' || !docNo.trim() || docNo.length > 160 || typeof revision !== 'string' || !/^(?:Rev\.?\s*)?\d{1,4}$/i.test(revision)) fail('invalid-argument', 'กรุณาระบุรหัสเอกสารและ Rev. เดิมให้ถูกต้อง');
    if (!Array.isArray(uploadedAttachments) || uploadedAttachments.length > MAX_DAR_PDFS || typeof useMaster !== 'boolean') fail('invalid-argument', 'ไฟล์ฉบับเดิมไม่ถูกต้อง');
    const darRef = db.collection('dcs_dars').doc(darId);
    if ((await darRef.get()).exists) fail('already-exists', 'ใบ DAR นี้ถูกบันทึกแล้ว');
    const masterId = documentKey(docNo), masterRef = db.collection('dcs_documents').doc(masterId), masterSnap = await masterRef.get();
    const master = masterSnap.exists ? masterSnap.data() : null;
    if (master && profile.role !== 'DCC_ADMIN' && departmentKey(master.ownerDept) !== departmentKey(profile.department)) fail('permission-denied', 'ไม่มีสิทธิ์ใช้ต้นฉบับของหน่วยงานอื่น');
    if (master && revisionKey(master.currentRevision) !== revisionKey(revision)) fail('failed-precondition', `Rev. เดิมไม่ตรงกับ Master List ซึ่งเป็น Rev.${master.currentRevision}`);
    const paths = useMaster && master ? (master.currentFileStoragePaths?.length ? master.currentFileStoragePaths : [master.currentFileStoragePath].filter(Boolean)) : [];
    if (paths.length + uploadedAttachments.length < 1 || paths.length + uploadedAttachments.length > MAX_DAR_PDFS) fail('invalid-argument', 'กรุณาแนบ PDF ฉบับเดิม 1–20 ไฟล์ หรือเลือกใช้ฉบับเดิมจากระบบ');
    const sources = [];
    for (let index = 0; index < paths.length; index++) {
      const path = paths[index], prefix = `dcs/archive/${safeSegment(masterId)}/active/rev-${safeSegment(master.currentRevision)}/`;
      if (typeof path !== 'string' || !path.startsWith(prefix) || path.slice(prefix.length).includes('/')) fail('failed-precondition', 'ไฟล์ต้นฉบับในระบบไม่ตรงกับ Rev. เดิม กรุณาแนบ PDF ฉบับเดิมจากเครื่อง');
      sources.push({ ...await readPdf(path, master.fileNames?.[index] || (index === 0 && master.fileName) || `previous-${index + 1}.pdf`), source: 'MASTER' });
    }
    for (const item of uploadedAttachments) {
      if (!item || typeof item.name !== 'string' || item.name.length > 255 || !isDarAttachmentPath(item.storagePath, darId) || !item.storagePath.startsWith(`dcs/dar-attachments/${request.auth.uid}/${darId}/previous-upload-`)) fail('permission-denied', 'ตำแหน่งไฟล์ฉบับเดิมไม่ถูกต้อง');
      sources.push({ ...await readPdf(item.storagePath, item.name), source: 'UPLOAD' });
    }
    const copied = [], attachments = [], token = randomBytes(8).toString('hex');
    let committed = false;
    try {
      for (let index = 0; index < sources.length; index++) {
        const source = sources[index], path = `dcs/dar-previous/${request.auth.uid}/${darId}/${token}-${index + 1}-${safeSegment(source.name)}`;
        await getStorage().bucket().file(source.storagePath).copy(getStorage().bucket().file(path));
        copied.push(path); attachments.push({ ...source, storagePath: path });
      }
      const previous = { docNo: docNo.trim().toUpperCase(), docNameTh: master?.docNameTh || '', revision, sourceDocumentId: masterId, attachments, capturedAt: new Date().toISOString() };
      await db.runTransaction(async tx => {
        const ref = db.collection('dcs_dar_previous_files').doc(darId);
        const [prepared, existingDar, liveMaster] = await Promise.all([tx.get(ref), tx.get(darRef), tx.get(masterRef)]);
        if (existingDar.exists) fail('already-exists', 'ใบ DAR นี้ถูกบันทึกแล้ว');
        if (prepared.exists && prepared.data().uid !== request.auth.uid) fail('permission-denied', 'เลขที่ DAR นี้ถูกจองโดยบัญชีอื่น');
        if (liveMaster.exists && revisionKey(liveMaster.data().currentRevision) !== revisionKey(revision)) fail('failed-precondition', 'Rev. ใน Master List เปลี่ยนแล้ว กรุณาตรวจสอบอีกครั้ง');
        tx.set(ref, { uid: request.auth.uid, previous });
      });
      committed = true;
      await Promise.allSettled(uploadedAttachments.map(item => getStorage().bucket().file(item.storagePath).delete({ ignoreNotFound: true })));
      return previous;
    } finally {
      // Preserve any snapshot committed before an ambiguous transport error.
      if (!committed) {
        const saved = await db.collection('dcs_dar_previous_files').doc(darId).get();
        const retained = new Set((saved.data()?.previous?.attachments || []).map(item => item.storagePath));
        await Promise.allSettled(copied.filter(path => !retained.has(path)).map(path => getStorage().bucket().file(path).delete({ ignoreNotFound: true })));
      }
    }
  }

  async function ensureReturnsForDistribution(distributionId) {
    const db = getFirestore(), distRef = db.collection('dcs_distributions').doc(distributionId), snap = await distRef.get();
    if (!snap.exists) return;
    const dist = snap.data();
    if (dist.status === 'CANCELLED' || dist.stampStatus !== 'COMPLETED' || !dist.darReferenceId) return;
    const master = await db.collection('dcs_documents').doc(dist.docId).get();
    if (!master.exists || master.data().status !== 'ACTIVE' || revisionKey(master.data().currentRevision) !== revisionKey(dist.revision)) return;
    const darSnap = await db.collection('dcs_dars').doc(dist.darReferenceId).get();
    if (!darSnap.exists) return;
    const dar = darSnap.data();
    if (dar.requestType !== 'REVISION') return;
    const previousRevision = dar.previousRevision?.revision || dar.currentRevision;
    if (!previousRevision || revisionKey(previousRevision) === revisionKey(dist.revision)) return;
    const history = await db.collection('dcs_distributions').where('docId', '==', dist.docId).get();
    const recipients = new Map();
    for (const row of history.docs) {
      const prior = row.data();
      if (row.id === distributionId || revisionKey(prior.revision) !== revisionKey(previousRevision)) continue;
      for (const [dept, receipt] of Object.entries({ ...(prior.receipts || {}), ...(prior.firstReceipts || {}) })) {
        if (!receipt?.downloadedAt || !receipt.signatureStoragePath) continue;
        const key = departmentKey(dept), value = recipients.get(key) || { sourceDistributionIds: [], copies: Math.max(1, Math.min(100, Number(receipt.receivedCopies) || 1)) };
        if (!value.sourceDistributionIds.includes(row.id)) value.sourceDistributionIds.push(row.id);
        recipients.set(key, value);
      }
    }
    for (const [dept, prior] of recipients) {
      const id = `${dist.darReferenceId}__${encodeURIComponent(dept)}`, ref = db.collection('dcs_document_returns').doc(id);
      await db.runTransaction(async tx => {
        const [current, live] = await Promise.all([tx.get(ref), tx.get(distRef)]);
        if (!live.exists || live.data().status === 'CANCELLED' || live.data().departmentCancellations?.[dept]) return;
        if (current.exists && current.data().status !== 'CANCELLED') return;
        const task = { id, darId: dist.darReferenceId, distributionId, docId: dist.docId, docNo: dist.docNo, docNameTh: dist.docNameTh, previousRevision, newRevision: dist.revision, dept, status: 'PENDING', createdAt: new Date().toISOString(), ...prior };
        if (current.exists) tx.set(ref, task); else tx.create(ref, task);
      });
    }
  }

  async function confirmReturn(request) {
    const profile = await activeProfile(request), db = getFirestore(), id = request.data?.returnId;
    if (typeof id !== 'string' || !id || id.length > 240 || id.includes('/') || request.data?.consent !== true) fail('invalid-argument', 'กรุณายืนยันว่าได้คืนหรือเลิกใช้เอกสารฉบับเดิมแล้ว');
    const ref = db.collection('dcs_document_returns').doc(id), initial = await ref.get();
    if (!initial.exists || departmentKey(profile.department) !== initial.data().dept) fail('permission-denied', 'ยืนยันได้เฉพาะรายการของแผนกตนเอง');
    if (initial.data().status === 'CONFIRMED') return { confirmed: true, alreadyConfirmed: true };
    if (initial.data().status !== 'PENDING') fail('failed-precondition', 'รายการคืนนี้ถูกยกเลิกแล้ว');
    if (!profile.displayName?.trim() || !profile.signaturePath) fail('failed-precondition', 'กรุณาลงทะเบียนชื่อและลายเซ็นในโปรไฟล์ก่อนยืนยันคืน');
    const signatureFile = getStorage().bucket().file(profile.signaturePath), [metadata] = await signatureFile.getMetadata();
    if (!(Number(metadata.size) > 0 && Number(metadata.size) < 2 * 1024 * 1024) || !/^image\/(png|jpeg)$/.test(metadata.contentType)) fail('failed-precondition', 'ไฟล์ลายเซ็นในโปรไฟล์ไม่ถูกต้อง');
    const [bytes] = await signatureFile.download();
    const signatureStoragePath = `dcs/return-signatures/${id}/${request.auth.uid}-${randomBytes(8).toString('hex')}.png`;
    await getStorage().bucket().file(signatureStoragePath).save(await normalizeSignature(bytes), { resumable: false, contentType: 'image/png' });
    let used = false;
    try {
      const result = await db.runTransaction(async tx => {
        const latest = await tx.get(ref), liveUser = await tx.get(db.collection('users').doc(request.auth.uid));
        if (!liveUser.exists || liveUser.data().active !== true || !latest.exists || latest.data().dept !== departmentKey(liveUser.data().department)) fail('permission-denied', 'ไม่มีสิทธิ์ยืนยันรายการนี้');
        if (liveUser.data().signaturePath !== profile.signaturePath || liveUser.data().displayName !== profile.displayName) fail('aborted', 'ข้อมูลลายเซ็นเปลี่ยนแล้ว กรุณาลองใหม่');
        const task = latest.data(), distRef = db.collection('dcs_distributions').doc(task.distributionId), distSnap = await tx.get(distRef);
        if (task.status === 'CONFIRMED') return { confirmed: true, alreadyConfirmed: true };
        if (task.status !== 'PENDING' || !distSnap.exists || distSnap.data().status === 'CANCELLED' || distSnap.data().departmentCancellations?.[task.dept]) fail('failed-precondition', 'รายการแจกจ่ายที่อ้างอิงถูกยกเลิกแล้ว');
        const dist = distSnap.data();
        const isTarget = (dist.targetDepartments || []).some(dept => departmentKey(dept) === task.dept);
        const received = Object.entries({ ...(dist.receipts || {}), ...(dist.firstReceipts || {}) }).some(([dept, receipt]) => departmentKey(dept) === task.dept && receipt?.downloadedAt && receipt.signatureStoragePath);
        if (isTarget && !received) fail('failed-precondition', 'กรุณารับเอกสารฉบับใหม่ก่อนยืนยันเลิกใช้ฉบับเดิม');
        const confirmedAt = new Date().toISOString();
        const evidence = { confirmedAt, signerName: profile.displayName.trim().slice(0, 120), confirmerUid: request.auth.uid, signatureStoragePath, previousRevision: task.previousRevision, copies: task.copies };
        tx.update(ref, { ...evidence, status: 'CONFIRMED' });
        tx.update(distRef, { returnReceipts: { ...(dist.returnReceipts || {}), [task.dept]: evidence }, updatedAt: confirmedAt });
        tx.create(db.collection('dcs_audit_logs').doc(), { timestamp: confirmedAt, createdAt: confirmedAt, actor: evidence.signerName, actorUid: request.auth.uid, actorDept: task.dept, actionType: 'SIGNATURE_CAPTURED', docNo: task.docNo, revision: task.previousRevision, description: `ยืนยันคืน/เลิกใช้ Rev.${task.previousRevision} ตาม ${task.darId}`, details: { returnId: id, darId: task.darId, distributionId: task.distributionId } });
        return { confirmed: true, alreadyConfirmed: false };
      });
      used = !result.alreadyConfirmed;
      return result;
    } finally {
      if (!used) {
        const saved = await ref.get();
        if (saved.data()?.signatureStoragePath !== signatureStoragePath) await getStorage().bucket().file(signatureStoragePath).delete({ ignoreNotFound: true });
      }
    }
  }

  async function cancelReturns(distributionId, dept) {
    const db = getFirestore(), rows = await db.collection('dcs_document_returns').where('distributionId', '==', distributionId).get();
    for (const row of rows.docs) {
      if (dept && row.data().dept !== departmentKey(dept)) continue;
      await db.runTransaction(async tx => {
        const latest = await tx.get(row.ref);
        if (latest.exists && latest.data().status === 'PENDING') tx.update(row.ref, { status: 'CANCELLED', cancelledAt: new Date().toISOString() });
      });
    }
  }
  return { preparePreviousRevision, ensureReturnsForDistribution, confirmReturn, cancelReturns };
}
module.exports = { createDarRevisionWorkflow, revisionKey, isPreviousPath };
