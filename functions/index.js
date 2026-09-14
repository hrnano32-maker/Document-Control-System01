const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { getAuth } = require('firebase-admin/auth');
const { randomBytes } = require('node:crypto');
const sharp = require('sharp');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');

initializeApp();

const REGION = 'asia-southeast1';
const RED = rgb(0.82, 0, 0);
const CONTROLLED_COPY_STAMP_PNG = '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';
const safeSegment = value => String(value).replace(/[^a-zA-Z0-9._-]/g, '_');
const REGISTRATION_DEPARTMENTS = new Set(['QA', 'QC', 'Production 1', 'Production 2/3', 'HR', 'Purchasing', 'Warehouse SP', 'Warehouse FG/DL', 'Planning', 'New Model', 'Marketing', 'R&D', 'Maintenance', 'QMR', 'Customer Rep']);

const cleanText = (value, maxLength) => String(value || '').trim().slice(0, maxLength);
const signatureExtension = contentType => contentType === 'image/png' ? 'png' : 'jpg';
const validSignatureMagic = (bytes, contentType) => contentType === 'image/png'
  ? bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
  : bytes.subarray(0, 3).toString('hex') === 'ffd8ff';

const normalizeSignature = async bytes => {
  const { data, info } = await sharp(bytes)
    .rotate()
    .ensureAlpha()
    .trim({ background: '#ffffff', threshold: 12 })
    .resize({ width: 900, height: 300, fit: 'inside', withoutEnlargement: false })
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let index = 0; index < data.length; index += info.channels) {
    if (data[index] > 242 && data[index + 1] > 242 && data[index + 2] > 242) data[index + 3] = 0;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png({ compressionLevel: 9 }).toBuffer();
};

exports.submitDepartmentRegistration = onCall({ region: REGION, timeoutSeconds: 60, memory: '256MiB' }, async request => {
  const department = cleanText(request.data?.department, 50);
  const username = cleanText(request.data?.username, 30).toLowerCase();
  const displayName = cleanText(request.data?.displayName, 120);
  const empId = cleanText(request.data?.empId, 30);
  const position = cleanText(request.data?.position, 120);
  const email = cleanText(request.data?.email, 160).toLowerCase();
  const phone = cleanText(request.data?.phone, 30);
  const recipientType = request.data?.recipientType === 'BACKUP' ? 'BACKUP' : 'PRIMARY';
  const contentType = cleanText(request.data?.signatureContentType, 30);
  const dataUrl = String(request.data?.signatureDataUrl || '');
  if (!REGISTRATION_DEPARTMENTS.has(department)) throw new HttpsError('invalid-argument', 'กรุณาเลือกแผนกที่ถูกต้อง');
  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username)) throw new HttpsError('invalid-argument', 'รูปแบบ Username ไม่ถูกต้อง');
  if (![displayName, empId, position].every(Boolean)) throw new HttpsError('invalid-argument', 'กรุณากรอกข้อมูลผู้รับผิดชอบให้ครบ');
  if (request.data?.authorized !== true) throw new HttpsError('failed-precondition', 'ต้องยืนยันการได้รับมอบหมายก่อนส่งข้อมูล');
  if (!['image/png', 'image/jpeg'].includes(contentType)) throw new HttpsError('invalid-argument', 'รองรับลายเซ็น PNG หรือ JPG เท่านั้น');
  const prefix = `data:${contentType};base64,`;
  if (!dataUrl.startsWith(prefix)) throw new HttpsError('invalid-argument', 'รูปแบบไฟล์ลายเซ็นไม่ถูกต้อง');
  const signatureBytes = Buffer.from(dataUrl.slice(prefix.length), 'base64');
  if (!signatureBytes.length || signatureBytes.length > 2 * 1024 * 1024 || !validSignatureMagic(signatureBytes, contentType)) {
    throw new HttpsError('invalid-argument', 'ไฟล์ลายเซ็นไม่ถูกต้องหรือมีขนาดเกิน 2 MB');
  }

  const db = getFirestore();
  const id = safeSegment(department).toLowerCase();
  const ref = db.collection('dcs_user_registrations').doc(id);
  const now = new Date();
  const registrationNo = `REG-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${id.toUpperCase()}`;
  await db.runTransaction(async transaction => {
    const existing = await transaction.get(ref);
    if (existing.exists && !['REJECTED', 'UPLOAD_FAILED'].includes(existing.data().status)) {
      throw new HttpsError('already-exists', 'แผนกนี้ส่งข้อมูลแล้ว กรุณาติดต่อ DCC หากต้องการแก้ไข');
    }
    transaction.set(ref, { registrationNo, department, username, displayName, empId, position, email, phone, recipientType, authorized: true, status: 'UPLOADING', createdAt: now.toISOString(), updatedAt: now.toISOString() });
  });
  const signaturePath = `dcs/onboarding/${id}/signature.png`;
  try {
    const normalizedBytes = await normalizeSignature(signatureBytes);
    await getStorage().bucket().file(signaturePath).save(normalizedBytes, { resumable: false, contentType: 'image/png', metadata: { cacheControl: 'private,no-store,max-age=0' } });
    await ref.update({ signaturePath, signatureContentType: 'image/png', status: 'PENDING', updatedAt: new Date().toISOString() });
  } catch (error) {
    await ref.update({ status: 'UPLOAD_FAILED', updatedAt: new Date().toISOString() });
    console.error('REGISTRATION_SIGNATURE_UPLOAD_FAILED', id, error);
    throw new HttpsError('internal', 'บันทึกไฟล์ลายเซ็นไม่สำเร็จ กรุณาลองใหม่');
  }
  return { registrationNo };
});

const temporaryPassword = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$';
  const bytes = randomBytes(14);
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
};

exports.reviewDepartmentRegistration = onCall({ region: REGION, timeoutSeconds: 60, memory: '256MiB' }, async request => {
  await requireDcc(request);
  const registrationId = cleanText(request.data?.registrationId, 80);
  const action = request.data?.action === 'REJECT' ? 'REJECT' : 'APPROVE';
  const reviewNote = cleanText(request.data?.reviewNote, 500);
  if (!registrationId) throw new HttpsError('invalid-argument', 'ไม่พบคำขอลงทะเบียน');
  const db = getFirestore();
  const ref = db.collection('dcs_user_registrations').doc(registrationId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'ไม่พบคำขอลงทะเบียน');
  const registration = snapshot.data();
  if (registration.status !== 'PENDING') throw new HttpsError('failed-precondition', 'คำขอนี้ถูกดำเนินการแล้ว');
  const reviewer = await db.collection('users').doc(request.auth.uid).get();
  const reviewedAt = new Date().toISOString();
  if (action === 'REJECT') {
    await ref.update({ status: 'REJECTED', reviewNote, reviewedAt, reviewedByUid: request.auth.uid, reviewedByName: reviewer.data()?.displayName || 'DCC' });
    return { status: 'REJECTED' };
  }

  const username = cleanText(registration.username, 30).toLowerCase();
  const internalEmail = `${username}@dar-online-form.app`;
  const password = temporaryPassword();
  let createdUser;
  try {
    createdUser = await getAuth().createUser({ email: internalEmail, password, displayName: registration.displayName, disabled: false });
  } catch (error) {
    if (error?.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'Username นี้มีบัญชีในระบบแล้ว');
    throw error;
  }
  try {
    const permanentSignaturePath = `dcs/signatures/${createdUser.uid}/profile-signature.png`;
    const [sourceSignature] = await getStorage().bucket().file(registration.signaturePath).download();
    const normalizedSignature = await normalizeSignature(sourceSignature);
    await getStorage().bucket().file(permanentSignaturePath).save(normalizedSignature, { resumable: false, contentType: 'image/png', metadata: { cacheControl: 'private,no-store,max-age=0' } });
    const profile = {
      username,
      department: registration.department,
      role: 'DEPT_CONTROLLER',
      roleName: 'Department User',
      active: true,
      displayName: registration.displayName,
      empId: registration.empId,
      position: registration.position,
      contactEmail: registration.email || '',
      phone: registration.phone || '',
      recipientType: registration.recipientType,
      signaturePath: permanentSignaturePath,
      mustChangePassword: true,
      createdAt: reviewedAt,
      createdByUid: request.auth.uid,
    };
    const batch = db.batch();
    batch.set(db.collection('users').doc(createdUser.uid), profile);
    batch.update(ref, { status: 'APPROVED', authUid: createdUser.uid, approvedUsername: username, permanentSignaturePath, reviewNote, reviewedAt, reviewedByUid: request.auth.uid, reviewedByName: reviewer.data()?.displayName || 'DCC' });
    await batch.commit();
  } catch (error) {
    await getAuth().deleteUser(createdUser.uid).catch(() => {});
    console.error('REGISTRATION_APPROVAL_FAILED', registrationId, error);
    throw new HttpsError('internal', 'สร้างบัญชีไม่สำเร็จ ระบบยกเลิกบัญชีชั่วคราวแล้ว กรุณาลองใหม่');
  }
  return { status: 'APPROVED', username, temporaryPassword: password, displayName: registration.displayName, department: registration.department };
});

exports.resetDepartmentTemporaryPassword = onCall({ region: REGION, timeoutSeconds: 30, memory: '256MiB' }, async request => {
  await requireDcc(request);
  const registrationId = cleanText(request.data?.registrationId, 80);
  if (!registrationId) throw new HttpsError('invalid-argument', 'ไม่พบข้อมูลบัญชีผู้ใช้');
  const db = getFirestore();
  const ref = db.collection('dcs_user_registrations').doc(registrationId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'ไม่พบข้อมูลบัญชีผู้ใช้');
  const registration = snapshot.data();
  if (registration.status !== 'APPROVED' || !registration.authUid) throw new HttpsError('failed-precondition', 'บัญชีนี้ยังไม่ได้รับอนุมัติ');
  const password = temporaryPassword();
  const changedAt = new Date().toISOString();
  await getAuth().updateUser(registration.authUid, { password, disabled: false });
  const batch = db.batch();
  batch.update(db.collection('users').doc(registration.authUid), { mustChangePassword: true, passwordResetAt: changedAt, passwordResetByUid: request.auth.uid });
  batch.update(ref, { passwordResetAt: changedAt, passwordResetByUid: request.auth.uid });
  await batch.commit();
  return { username: registration.approvedUsername || registration.username, temporaryPassword: password, displayName: registration.displayName, department: registration.department };
});

exports.deleteDarDraft = onCall({ region: REGION, timeoutSeconds: 30, memory: '256MiB' }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'กรุณาเข้าสู่ระบบ');
  const darId = cleanText(request.data?.darId, 80);
  if (!darId) throw new HttpsError('invalid-argument', 'ไม่พบเลขที่ DAR');
  const db = getFirestore();
  const [profileSnapshot, darSnapshot] = await Promise.all([
    db.collection('users').doc(request.auth.uid).get(),
    db.collection('dcs_dars').doc(darId).get(),
  ]);
  if (!profileSnapshot.exists || profileSnapshot.data().active !== true) throw new HttpsError('permission-denied', 'บัญชีไม่มีสิทธิ์ใช้งาน');
  if (!darSnapshot.exists) throw new HttpsError('not-found', 'ไม่พบใบ DAR');
  const profile = profileSnapshot.data();
  const dar = darSnapshot.data();
  if (!['PENDING_REVIEW', 'UNDER_REVIEW', 'REJECTED'].includes(dar.status)) throw new HttpsError('failed-precondition', 'DAR สถานะนี้ไม่สามารถลบได้');
  if (profile.role !== 'DCC_ADMIN' && profile.department !== dar.requestDept) throw new HttpsError('permission-denied', 'ไม่มีสิทธิ์ลบ DAR ของแผนกอื่น');
  if (dar.attachmentStoragePath) await getStorage().bucket().file(dar.attachmentStoragePath).delete({ ignoreNotFound: true });
  await darSnapshot.ref.delete();
  return { deleted: true, darId };
});

async function requireDcc(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'กรุณาเข้าสู่ระบบ');
  const profile = await getFirestore().collection('users').doc(request.auth.uid).get();
  if (!profile.exists || profile.data().active !== true || profile.data().role !== 'DCC_ADMIN') {
    throw new HttpsError('permission-denied', 'เฉพาะ DCC เท่านั้นที่ดำเนินการได้');
  }
}

async function loadPdf(path) {
  const [bytes] = await getStorage().bucket().file(path).download();
  try {
    return await PDFDocument.load(bytes);
  } catch {
    throw new HttpsError('invalid-argument', 'ไฟล์ที่อัปโหลดต้องเป็น PDF ที่เปิดอ่านได้และไม่ติดรหัสผ่าน');
  }
}

async function savePdf(pdf, path) {
  const bytes = await pdf.save();
  await getStorage().bucket().file(path).save(Buffer.from(bytes), {
    resumable: false,
    contentType: 'application/pdf',
    metadata: { cacheControl: 'private,no-store,max-age=0' },
  });
}

async function controlledStamp(pdf) {
  const stamp = await pdf.embedPng(Buffer.from(CONTROLLED_COPY_STAMP_PNG, 'base64'));
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const stampWidth = Math.min(150, width * 0.3);
    const stampHeight = stampWidth * (stamp.height / stamp.width);
    page.drawImage(stamp, {
      x: Math.max(12, width - stampWidth - 18),
      y: Math.max(12, height - stampHeight - 18),
      width: stampWidth,
      height: stampHeight,
    });
  }
}

async function cancelStamp(pdf) {
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const text = 'CANCEL';
    const size = Math.max(42, Math.min(90, width / 6));
    const textWidth = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - textWidth) / 2, y: height / 2, size, font, color: RED, rotate: degrees(35), opacity: 0.55 });
  }
}

exports.stampControlledCopies = onCall({ region: REGION, timeoutSeconds: 120, memory: '512MiB' }, async request => {
  await requireDcc(request);
  const distributionId = String(request.data?.distributionId || '');
  if (!distributionId) throw new HttpsError('invalid-argument', 'ไม่พบเลขที่ใบแจกจ่าย');
  const distRef = getFirestore().collection('dcs_distributions').doc(distributionId);
  const snapshot = await distRef.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'ไม่พบรายการแจกจ่าย');
  const data = snapshot.data();
  if (data.departmentFiles && Object.keys(data.departmentFiles).length) return { departmentFiles: data.departmentFiles };
  if (!data.sourceStoragePath || data.fileType !== 'application/pdf') throw new HttpsError('failed-precondition', 'ต้นฉบับแจกจ่ายต้องเป็น PDF');
  const masterRef = getFirestore().collection('dcs_documents').doc(data.docId);
  const master = await masterRef.get();
  if (!master.exists || master.data().currentRevision !== data.revision || master.data().status !== 'ACTIVE') {
    throw new HttpsError('failed-precondition', 'แจกจ่ายได้เฉพาะ Revision ล่าสุดที่ Active อยู่ใน Master List');
  }

  const sourcePdf = await loadPdf(data.sourceStoragePath);
  const sourceBytes = await sourcePdf.save();
  const departmentFiles = {};
  const departmentFileKeys = {};
  for (const department of data.targetDepartments || []) {
    const copy = await PDFDocument.load(sourceBytes);
    await controlledStamp(copy);
    const departmentKey = safeSegment(department);
    const path = `dcs/distributions/${distributionId}/controlled/${departmentKey}.pdf`;
    await savePdf(copy, path);
    departmentFiles[department] = path;
    departmentFileKeys[department] = departmentKey;
  }
  if (!Object.keys(departmentFiles).length) throw new HttpsError('failed-precondition', 'ไม่พบแผนกผู้รับเอกสาร');

  const archivePath = `dcs/archive/${safeSegment(data.docId)}/active/rev-${safeSegment(data.revision)}.pdf`;
  await getStorage().bucket().file(archivePath).save(Buffer.from(sourceBytes), { resumable: false, contentType: 'application/pdf', metadata: { cacheControl: 'private,no-store,max-age=0' } });
  await Promise.all([
    distRef.update({ departmentFiles, departmentFileKeys, fileStoragePath: departmentFiles[data.targetDepartments[0]], sourceStoragePath: null, storageStatus: 'AVAILABLE', stampStatus: 'COMPLETED', updatedAt: new Date().toISOString() }),
    masterRef.update({ currentFileStoragePath: archivePath, updatedAt: new Date().toISOString() }),
    getStorage().bucket().file(data.sourceStoragePath).delete({ ignoreNotFound: true }),
  ]);
  return { departmentFiles };
});

exports.cancelPreviousRevision = onCall({ region: REGION, timeoutSeconds: 120, memory: '512MiB' }, async request => {
  await requireDcc(request);
  const { docId, previousRevision, previousPath, newRevision } = request.data || {};
  if (![docId, previousRevision, previousPath, newRevision].every(value => typeof value === 'string' && value)) {
    throw new HttpsError('invalid-argument', 'ข้อมูล Revision เดิมไม่ครบ');
  }
  const masterRef = getFirestore().collection('dcs_documents').doc(docId);
  const master = await masterRef.get();
  if (!master.exists || master.data().currentRevision !== newRevision || master.data().currentFileStoragePath !== previousPath) {
    throw new HttpsError('failed-precondition', 'ข้อมูล Revision ปัจจุบันเปลี่ยนไปแล้ว กรุณารีเฟรช');
  }
  const pdf = await loadPdf(previousPath);
  await cancelStamp(pdf);
  const cancelledPath = `dcs/archive/${safeSegment(docId)}/cancelled/rev-${safeSegment(previousRevision)}.pdf`;
  await savePdf(pdf, cancelledPath);
  await Promise.all([
    masterRef.update({
      cancelledFileStoragePaths: { ...(master.data().cancelledFileStoragePaths || {}), [previousRevision]: cancelledPath },
      currentFileStoragePath: null,
      updatedAt: new Date().toISOString(),
    }),
    getStorage().bucket().file(previousPath).delete({ ignoreNotFound: true }),
  ]);
  return { cancelledPath };
});

async function purgeDistribution(snapshot, reason) {
  const data = snapshot.data();
  if (!data || data.storageStatus === 'PURGED') return;
  try {
    await getStorage().bucket().deleteFiles({ prefix: `dcs/distributions/${snapshot.id}/` });
    await snapshot.ref.update({
      storageStatus: 'PURGED',
      ...(reason === 'DOWNLOAD_WINDOW_EXPIRED' && data.status !== 'COMPLETED' ? { status: 'EXPIRED' } : {}),
      fileDeletedAt: new Date().toISOString(),
      purgeReason: reason,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('PURGE_FAILED', snapshot.id, error);
    await snapshot.ref.update({ storageStatus: 'PURGE_PENDING', purgeError: String(error), updatedAt: new Date().toISOString() });
  }
}

exports.purgeExpiredDistributions = onSchedule({
  schedule: 'every 15 minutes',
  timeZone: 'Asia/Bangkok',
  region: REGION,
}, async () => {
  const now = Date.now();
  const db = getFirestore();
  const [completed, expired] = await Promise.all([
    db.collection('dcs_distributions').where('storageStatus', '==', 'PURGE_PENDING').get(),
    db.collection('dcs_distributions')
    .where('expirationEpoch', '<=', now)
    .where('storageStatus', 'in', ['AVAILABLE', 'PURGE_PENDING'])
    .get(),
  ]);
  const completedIds = new Set(completed.docs.map(snapshot => snapshot.id));
  await Promise.all([
    ...completed.docs.map(snapshot => purgeDistribution(snapshot, 'ALL_DEPARTMENTS_DOWNLOADED')),
    ...expired.docs.filter(snapshot => !completedIds.has(snapshot.id)).map(snapshot => purgeDistribution(snapshot, 'DOWNLOAD_WINDOW_EXPIRED')),
  ]);
});
