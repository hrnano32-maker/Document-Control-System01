const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { getAuth } = require('firebase-admin/auth');
const { getMessaging } = require('firebase-admin/messaging');
const { randomBytes, createHash } = require('node:crypto');
const sharp = require('sharp');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const { controlledStamp, CONTROLLED_STAMP_VERSION } = require('./controlledStamp');
const archiver = require('archiver');

initializeApp();

const REGION = 'asia-southeast1';
const RED = rgb(0.82, 0, 0);
const safeSegment = value => String(value).replace(/[^a-zA-Z0-9._-]/g, '_');
const REGISTRATION_DEPARTMENTS = new Set(['QA/QC', 'Production 1', 'Production 2/3', 'HR', 'Purchasing', 'Warehouse SP', 'Warehouse FG/DL', 'Planning', 'New Model', 'Marketing', 'R&D', 'Maintenance', 'QMR', 'Customer Rep']);

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

exports.updateOwnSignature = onCall({ region: REGION, timeoutSeconds: 60, memory: '256MiB' }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'กรุณาเข้าสู่ระบบใหม่');
  const dataUrl = String(request.data?.signatureDataUrl || '');
  const prefix = 'data:image/png;base64,';
  if (!dataUrl.startsWith(prefix)) throw new HttpsError('invalid-argument', 'รูปแบบลายเซ็นไม่ถูกต้อง');
  const bytes = Buffer.from(dataUrl.slice(prefix.length), 'base64');
  if (!bytes.length || bytes.length > 2 * 1024 * 1024 || !validSignatureMagic(bytes, 'image/png')) {
    throw new HttpsError('invalid-argument', 'ไฟล์ลายเซ็นไม่ถูกต้องหรือมีขนาดเกิน 2 MB');
  }
  const db = getFirestore();
  const profileRef = db.collection('users').doc(request.auth.uid);
  const profile = await profileRef.get();
  if (!profile.exists || profile.data().active !== true) throw new HttpsError('permission-denied', 'บัญชีไม่มีสิทธิ์ใช้งาน');
  const signaturePath = `dcs/signatures/${request.auth.uid}/profile-signature.png`;
  const normalized = await normalizeSignature(bytes);
  await getStorage().bucket().file(signaturePath).save(normalized, {
    resumable: false,
    contentType: 'image/png',
    metadata: { cacheControl: 'private,no-store,max-age=0' },
  });
  const updatedAt = new Date().toISOString();
  await profileRef.update({ signaturePath, signatureUpdatedAt: updatedAt, updatedAt });
  await db.collection('dcs_audit_logs').add({
    timestamp: updatedAt,
    createdAt: updatedAt,
    actor: `${profile.data().displayName || profile.data().username} (${profile.data().department})`,
    actorDept: profile.data().department,
    actorUid: request.auth.uid,
    actionType: 'USER_SIGNATURE_UPDATED',
    docNo: 'USER-PROFILE',
    revision: '-',
    description: 'ผู้ใช้งานเพิ่มหรือเปลี่ยนลายเซ็นประจำบัญชี',
    details: { signaturePath },
  });
  return { signaturePath, updatedAt };
});

exports.adminUpdateUserSignature = onCall({ region: REGION, timeoutSeconds: 60, memory: '256MiB' }, async request => {
  await requireDcc(request);
  const registrationId = cleanText(request.data?.registrationId, 80);
  const dataUrl = String(request.data?.signatureDataUrl || '');
  const prefix = 'data:image/png;base64,';
  if (!registrationId) throw new HttpsError('invalid-argument', 'ไม่พบข้อมูลแผนกผู้ใช้งาน');
  if (!dataUrl.startsWith(prefix)) throw new HttpsError('invalid-argument', 'รูปแบบลายเซ็นไม่ถูกต้อง');
  const bytes = Buffer.from(dataUrl.slice(prefix.length), 'base64');
  if (!bytes.length || bytes.length > 2 * 1024 * 1024 || !validSignatureMagic(bytes, 'image/png')) {
    throw new HttpsError('invalid-argument', 'ไฟล์ลายเซ็นไม่ถูกต้องหรือมีขนาดเกิน 2 MB');
  }
  const db = getFirestore();
  const registrationRef = db.collection('dcs_user_registrations').doc(registrationId);
  const [registration, reviewer] = await Promise.all([
    registrationRef.get(),
    db.collection('users').doc(request.auth.uid).get(),
  ]);
  if (!registration.exists) throw new HttpsError('not-found', 'ไม่พบข้อมูลลงทะเบียนของแผนกนี้');
  const row = registration.data();
  const normalized = await normalizeSignature(bytes);
  const updatedAt = new Date().toISOString();
  let signaturePath;
  if (row.status === 'APPROVED' && row.authUid) {
    signaturePath = `dcs/signatures/${row.authUid}/profile-signature.png`;
    await getStorage().bucket().file(signaturePath).save(normalized, { resumable: false, contentType: 'image/png', metadata: { cacheControl: 'private,no-store,max-age=0' } });
    await Promise.all([
      db.collection('users').doc(row.authUid).update({ signaturePath, signatureUpdatedAt: updatedAt, updatedAt }),
      registrationRef.update({ signaturePath, permanentSignaturePath: signaturePath, signatureUpdatedAt: updatedAt, signatureUpdatedByUid: request.auth.uid }),
    ]);
  } else {
    signaturePath = `dcs/onboarding/${safeSegment(registrationId)}/signature.png`;
    await getStorage().bucket().file(signaturePath).save(normalized, { resumable: false, contentType: 'image/png', metadata: { cacheControl: 'private,no-store,max-age=0' } });
    await registrationRef.update({ signaturePath, signatureContentType: 'image/png', signatureUpdatedAt: updatedAt, signatureUpdatedByUid: request.auth.uid });
  }
  await db.collection('dcs_audit_logs').add({
    timestamp: updatedAt,
    createdAt: updatedAt,
    actor: `${reviewer.data()?.displayName || 'DCC'} (${reviewer.data()?.department || 'DCC'})`,
    actorDept: reviewer.data()?.department || 'DCC',
    actorUid: request.auth.uid,
    actionType: 'ADMIN_SIGNATURE_UPDATED',
    docNo: 'USER-PROFILE',
    revision: '-',
    description: `DCC เพิ่มหรือเปลี่ยนลายเซ็นของ ${row.displayName} (${row.department})`,
    details: { registrationId, targetUid: row.authUid || null, department: row.department, signaturePath },
  });
  return { signaturePath, updatedAt };
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

exports.registerNotificationDevice = onCall({ region: REGION, timeoutSeconds: 30, memory: '256MiB' }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'กรุณาเข้าสู่ระบบ');
  const token = cleanText(request.data?.token, 4096);
  const requestedDepartment = cleanText(request.data?.department, 80);
  const platform = cleanText(request.data?.platform, 500);
  if (!token) throw new HttpsError('invalid-argument', 'ไม่พบรหัสอุปกรณ์สำหรับรับการแจ้งเตือน');
  const db = getFirestore();
  const profile = await db.collection('users').doc(request.auth.uid).get();
  if (!profile.exists || profile.data().active !== true) throw new HttpsError('permission-denied', 'บัญชีนี้ยังไม่พร้อมใช้งาน');
  const department = profile.data().department;
  if (requestedDepartment && requestedDepartment !== department) throw new HttpsError('permission-denied', 'ไม่สามารถลงทะเบียนแจ้งเตือนแทนหน่วยงานอื่นได้');
  const deviceId = createHash('sha256').update(token).digest('hex');
  await db.collection('dcs_notification_devices').doc(deviceId).set({
    uid: request.auth.uid,
    department,
    token,
    platform,
    active: true,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  }, { merge: true });
  return { registered: true, department };
});

const chunksOf = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

exports.notifyAnnouncement = onCall({ region: REGION, timeoutSeconds: 120, memory: '256MiB' }, async request => {
  await requireDcc(request);
  const announcementId = cleanText(request.data?.announcementId, 100);
  if (!announcementId) throw new HttpsError('invalid-argument', 'ไม่พบรหัสประกาศ');
  const db = getFirestore();
  const announcementRef = db.collection('dcs_announcements').doc(announcementId);
  const snapshot = await announcementRef.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'ไม่พบประกาศ');
  const announcement = snapshot.data();
  if (announcement.status !== 'PUBLISHED') throw new HttpsError('failed-precondition', 'ส่งแจ้งเตือนได้เฉพาะประกาศที่เผยแพร่แล้ว');
  if (announcement.notificationSentAt) return { alreadySent: true };
  const departments = [...new Set((announcement.targetDepartments || []).filter(Boolean))];
  const deviceDocs = [];
  for (const departmentChunk of chunksOf(departments, 10)) {
    const deviceSnapshot = await db.collection('dcs_notification_devices').where('department', 'in', departmentChunk).get();
    deviceDocs.push(...deviceSnapshot.docs.filter(row => row.data().active !== false && row.data().token));
  }
  const devices = [...new Map(deviceDocs.map(row => [row.data().token, row])).values()];
  const invalidRefs = [];
  let successCount = 0;
  let failureCount = 0;
  const url = `https://hrnano32-maker.github.io/Document-Control-System01/?view=announcements&announcementId=${encodeURIComponent(announcementId)}`;
  for (const deviceChunk of chunksOf(devices, 500)) {
    const result = await getMessaging().sendEachForMulticast({
      tokens: deviceChunk.map(row => row.data().token),
      notification: { title: announcement.priority === 'URGENT' ? 'ประกาศเร่งด่วนจาก DCC' : 'ประกาศส่วนกลางจาก DCC', body: cleanText(announcement.title, 180) },
      data: { announcementId, url },
      webpush: { fcmOptions: { link: url }, notification: { icon: 'https://hrnano32-maker.github.io/Document-Control-System01/dcs-app-icon.svg', badge: 'https://hrnano32-maker.github.io/Document-Control-System01/dcs-app-icon.svg', requireInteraction: announcement.priority !== 'NORMAL' } },
    });
    successCount += result.successCount;
    failureCount += result.failureCount;
    result.responses.forEach((response, index) => {
      if (!response.success && ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(response.error?.code)) invalidRefs.push(deviceChunk[index].ref);
    });
  }
  await Promise.all(invalidRefs.map(ref => ref.update({ active: false, updatedAt: new Date().toISOString() })));
  await announcementRef.update({ notificationSentAt: new Date().toISOString(), notificationSuccessCount: successCount, notificationFailureCount: failureCount, notificationDeviceCount: devices.length, updatedAt: new Date().toISOString() });
  return { successCount, failureCount, deviceCount: devices.length };
});

async function notifyDistributionReady(distributionId, distribution, distributionRef) {
  if (distribution.notificationSentAt || distribution.status === 'CANCELLED') return;
  const departments = [...new Set((distribution.targetDepartments || []).filter(Boolean))];
  if (!departments.length) return;
  const db = getFirestore();
  const deviceDocs = [];
  for (const departmentChunk of chunksOf(departments, 10)) {
    const snapshot = await db.collection('dcs_notification_devices').where('department', 'in', departmentChunk).get();
    deviceDocs.push(...snapshot.docs.filter(row => row.data().active !== false && row.data().token));
  }
  const uniqueDevices = [...new Map(deviceDocs.map(row => [row.data().token, row])).values()];
  const invalidDeviceRefs = [];
  let successCount = 0;
  let failureCount = 0;
  const url = `https://hrnano32-maker.github.io/Document-Control-System01/?view=distribution&distributionId=${encodeURIComponent(distributionId)}`;
  for (const deviceChunk of chunksOf(uniqueDevices, 500)) {
    const tokens = deviceChunk.map(row => row.data().token);
    const result = await getMessaging().sendEachForMulticast({
      tokens,
      notification: {
        title: 'มีเอกสารแจกจ่ายใหม่',
        body: `${distribution.docNo || ''} ${distribution.docNameTh || ''} Rev.${distribution.revision || ''}`.trim(),
      },
      data: {
        distributionId,
        distributionNo: String(distribution.distributionNo || ''),
        url,
      },
      webpush: {
        fcmOptions: { link: url },
        notification: {
          icon: 'https://hrnano32-maker.github.io/Document-Control-System01/dcs-app-icon.svg',
          badge: 'https://hrnano32-maker.github.io/Document-Control-System01/dcs-app-icon.svg',
          requireInteraction: true,
        },
      },
    });
    successCount += result.successCount;
    failureCount += result.failureCount;
    result.responses.forEach((response, index) => {
      if (response.success) return;
      if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(response.error?.code)) {
        invalidDeviceRefs.push(deviceChunk[index].ref);
      }
    });
  }
  await Promise.all(invalidDeviceRefs.map(ref => ref.update({ active: false, updatedAt: new Date().toISOString() })));
  await distributionRef.update({
    notificationSentAt: new Date().toISOString(),
    notificationTargetDepartments: departments,
    notificationDeviceCount: uniqueDevices.length,
    notificationSuccessCount: successCount,
    notificationFailureCount: failureCount,
    updatedAt: new Date().toISOString(),
  });
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

exports.stampControlledCopies = onCall({ region: REGION, timeoutSeconds: 540, memory: '1GiB' }, async request => {
  await requireDcc(request);
  const distributionId = String(request.data?.distributionId || '');
  if (!distributionId) throw new HttpsError('invalid-argument', 'ไม่พบเลขที่ใบแจกจ่าย');
  const distRef = getFirestore().collection('dcs_distributions').doc(distributionId);
  const snapshot = await distRef.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'ไม่พบรายการแจกจ่าย');
  const data = snapshot.data();
  const reportProgress = (processingStage, processingDetail, processingPercent) =>
    distRef.update({ processingStage, processingDetail, processingPercent, updatedAt: new Date().toISOString() });
  await reportProgress('VALIDATING', 'กำลังตรวจสอบข้อมูลเอกสารและ Revision ล่าสุด', 40);
  if (data.departmentFiles && Object.keys(data.departmentFiles).length) return { departmentFiles: data.departmentFiles };
  if (!data.sourceStoragePath || data.fileType !== 'application/pdf') throw new HttpsError('failed-precondition', 'ต้นฉบับแจกจ่ายต้องเป็น PDF');
  const masterRef = getFirestore().collection('dcs_documents').doc(data.docId);
  const master = await masterRef.get();
  if (!master.exists || master.data().currentRevision !== data.revision || master.data().status !== 'ACTIVE') {
    throw new HttpsError('failed-precondition', 'แจกจ่ายได้เฉพาะ Revision ล่าสุดที่ Active อยู่ใน Master List');
  }

  const sourcePaths = Array.isArray(data.sourceStoragePaths) && data.sourceStoragePaths.length
    ? data.sourceStoragePaths
    : [data.sourceStoragePath].filter(Boolean);
  if (!sourcePaths.length) throw new HttpsError('failed-precondition', 'ไม่พบไฟล์ PDF ต้นฉบับ');
  const fileNames = Array.isArray(data.fileNames) && data.fileNames.length
    ? data.fileNames
    : [data.fileName || 'document.pdf'];

  const sourceBytesList = [];
  for (let index = 0; index < sourcePaths.length; index += 1) {
    await reportProgress('READING_PDF', `กำลังตรวจสอบ PDF ต้นฉบับ ${index + 1}/${sourcePaths.length}`, 40 + Math.round(((index + 1) / sourcePaths.length) * 10));
    const sourcePdf = await loadPdf(sourcePaths[index]);
    sourceBytesList.push(await sourcePdf.save());
  }

  const departmentFiles = {};
  const departmentFileLists = {};
  const departmentFileKeys = {};
  const departmentFileKeyLists = {};
  const departments = data.targetDepartments || [];
  const totalStampJobs = Math.max(1, departments.length * sourceBytesList.length);
  let completedStampJobs = 0;
  for (const department of departments) {
    const departmentKey = safeSegment(department);
    const paths = [];
    const keys = [];
    for (let index = 0; index < sourceBytesList.length; index += 1) {
      const copy = await PDFDocument.load(sourceBytesList[index]);
      await controlledStamp(copy, department);
      const outputName = `${String(index + 1).padStart(2, '0')}-${safeSegment(fileNames[index] || `document-${index + 1}.pdf`)}`.replace(/\.pdf$/i, '') + '.pdf';
      const path = `dcs/distributions/${distributionId}/controlled/${departmentKey}/${outputName}`;
      await savePdf(copy, path);
      completedStampJobs += 1;
      await reportProgress(
        'STAMPING',
        `กำลังประทับตราแผนก ${department} — ไฟล์ ${index + 1}/${sourceBytesList.length} (รวม ${completedStampJobs}/${totalStampJobs})`,
        50 + Math.round((completedStampJobs / totalStampJobs) * 38),
      );
      paths.push(path);
      keys.push(outputName);
    }
    departmentFiles[department] = paths[0];
    departmentFileLists[department] = paths;
    departmentFileKeys[department] = departmentKey;
    departmentFileKeyLists[department] = keys;
  }
  if (!Object.keys(departmentFileLists).length) throw new HttpsError('failed-precondition', 'ไม่พบแผนกผู้รับเอกสาร');

  const archivePaths = [];
  await reportProgress('ARCHIVING', 'กำลังจัดเก็บต้นฉบับเข้าสู่แฟ้มเอกสารควบคุม', 90);
  for (let index = 0; index < sourceBytesList.length; index += 1) {
    const archivePath = `dcs/archive/${safeSegment(data.docId)}/active/rev-${safeSegment(data.revision)}/${String(index + 1).padStart(2, '0')}-${safeSegment(fileNames[index] || `document-${index + 1}.pdf`)}`.replace(/\.pdf$/i, '') + '.pdf';
    await getStorage().bucket().file(archivePath).save(Buffer.from(sourceBytesList[index]), { resumable: false, contentType: 'application/pdf', metadata: { cacheControl: 'private,no-store,max-age=0' } });
    archivePaths.push(archivePath);
  }
  await Promise.all([
    distRef.update({ departmentFiles, departmentFileLists, departmentFileKeys, departmentFileKeyLists, controlledStampVersions: Object.fromEntries(departments.map(department => [department, CONTROLLED_STAMP_VERSION])), processingStage: 'COMPLETED', processingDetail: 'ประทับตราและเตรียมไฟล์แจกจ่ายครบแล้ว', processingPercent: 100, fileStoragePath: departmentFileLists[data.targetDepartments[0]][0], fileStoragePaths: departmentFileLists[data.targetDepartments[0]], sourceStoragePath: null, sourceStoragePaths: [], storageStatus: 'AVAILABLE', stampStatus: 'COMPLETED', updatedAt: new Date().toISOString() }),
    masterRef.update({ currentFileStoragePath: archivePaths[0], currentFileStoragePaths: archivePaths, updatedAt: new Date().toISOString() }),
    ...sourcePaths.map(sourcePath => getStorage().bucket().file(sourcePath).delete({ ignoreNotFound: true })),
  ]);
  try {
    await notifyDistributionReady(distributionId, data, distRef);
  } catch (error) {
    console.error('DISTRIBUTION_NOTIFICATION_FAILED', distributionId, error);
    await distRef.update({ notificationError: String(error), updatedAt: new Date().toISOString() }).catch(() => undefined);
  }
  return { departmentFiles, departmentFileLists };
});

exports.createAutomaticDistributionFromDar = onCall({ region: REGION, timeoutSeconds: 120, memory: '512MiB' }, async request => {
  await requireDcc(request);
  const decoded = request.auth;
  const darId = cleanText(request.data?.darId, 100);
  if (!darId) throw new HttpsError('invalid-argument', 'ไม่พบเลขที่ DAR');
  const db = getFirestore();
  const darRef = db.collection('dcs_dars').doc(darId);
  const darSnapshot = await darRef.get();
  if (!darSnapshot.exists) throw new HttpsError('not-found', 'ไม่พบ DAR');
  const dar = darSnapshot.data();
  if (dar.status !== 'REGISTERED') throw new HttpsError('failed-precondition', 'ต้องขึ้นทะเบียน Master List ก่อนแจกจ่ายอัตโนมัติ');
  if (dar.requestType === 'OBSOLETE') return { skipped: true, reason: 'OBSOLETE' };

  const existing = await db.collection('dcs_distributions').where('darReferenceId', '==', darId).limit(1).get();
  if (!existing.empty) return { distributionId: existing.docs[0].id, existing: true };
  if (!dar.attachmentStoragePath) throw new HttpsError('failed-precondition', 'DAR ไม่มีไฟล์ PDF ต้นฉบับ');
  const masterId = encodeURIComponent(String(dar.docNo || '').trim().toUpperCase()).replace(/%/g, '_');
  const masterSnapshot = await db.collection('dcs_documents').doc(masterId).get();
  if (!masterSnapshot.exists || masterSnapshot.data().darReferenceId !== darId || masterSnapshot.data().status !== 'ACTIVE') {
    throw new HttpsError('failed-precondition', 'ไม่พบเอกสาร Revision ล่าสุดใน Master List');
  }
  const master = masterSnapshot.data();
  const allocation = (dar.distributionHolders || []).filter(item => item.checked).map(item => ({
    dept: item.dept,
    copies: Math.max(1, Number(item.copies) || 1),
    position: item.position || `ผู้รับผิดชอบเอกสารประจำ ${item.dept}`,
  }));
  if (!allocation.length) throw new HttpsError('failed-precondition', 'DAR ไม่ได้ระบุหน่วยงานผู้รับเอกสาร');

  const year = new Date().getFullYear();
  const counterRef = db.collection('dcs_counters').doc(`distribution-${year}`);
  const sequence = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(counterRef);
    const next = Number(snapshot.data()?.value || 0) + 1;
    transaction.set(counterRef, { value: next, kind: 'distribution', year, updatedAt: new Date().toISOString() });
    return next;
  });
  const id = `DC-DIS-${year}-${String(sequence).padStart(4, '0')}`;
  const sourceName = `01-${safeSegment(dar.attachmentFileName || `${dar.docNo}.pdf`)}`.replace(/\.pdf$/i, '') + '.pdf';
  const sourcePath = `dcs/distributions/${id}/source/${sourceName}`;
  const bucket = getStorage().bucket();
  const sourceFile = bucket.file(dar.attachmentStoragePath);
  const [sourceExists] = await sourceFile.exists();
  if (!sourceExists) throw new HttpsError('not-found', 'ไม่พบไฟล์ PDF ต้นฉบับของ DAR');
  await sourceFile.copy(bucket.file(sourcePath));

  const now = new Date();
  const expirationEpoch = now.getTime() + 3 * 24 * 60 * 60 * 1000;
  const targets = allocation.map(item => ({ dept: item.dept, allocatedCopies: item.copies, copyNo: `${item.copies} สำเนา`, isDownloaded: false, downloadTimestamp: null, downloaderName: null, downloaderEmpId: null, downloaderPosition: null, signatureDataUrl: null, status: 'PENDING' }));
  const record = {
    id, distributionNo: id, docId: masterId, docNo: master.docNo, docNameTh: master.docNameTh,
    docNameEn: master.docNameEn || '', docType: master.docType, revision: master.currentRevision,
    effectiveDate: master.effectiveDate, distributedBy: decoded.name || decoded.email || 'DCC',
    distributedDate: now.toISOString(), expirationDate: new Date(expirationEpoch).toISOString(), expirationEpoch,
    expirationAt: new Date(expirationEpoch), departmentExpirationEpoch: Object.fromEntries(targets.map(target => [target.dept, expirationEpoch])),
    status: 'IN_PROGRESS', darReferenceId: darId, targetDepartments: targets.map(target => target.dept),
    allocationByDepartment: Object.fromEntries(allocation.map(item => [item.dept, item.copies])), targets, receipts: {},
    instructions: `แจกจ่ายอัตโนมัติหลัง DCC อนุมัติ ${darId}: ${master.docNo} Rev.${master.currentRevision}`,
    fileName: dar.attachmentFileName || `${master.docNo}.pdf`, fileSize: dar.attachmentFileSize || '', fileType: 'application/pdf',
    fileNames: [dar.attachmentFileName || `${master.docNo}.pdf`], fileSizes: [dar.attachmentFileSize || ''], fileTypes: ['application/pdf'],
    sourceStoragePath: sourcePath, sourceStoragePaths: [sourcePath], storageStatus: 'PROCESSING', stampStatus: 'PROCESSING',
    processingStage: 'UPLOADED', processingDetail: 'คัดลอกไฟล์ต้นฉบับจาก DAR แล้ว กำลังประทับตรา', processingPercent: 38,
    allDownloadedAt: null, fileDeletedAt: null, createdAt: now.toISOString(), autoCreated: true, createdByUid: decoded.uid,
  };
  try {
    await db.collection('dcs_distributions').doc(id).create(record);
    await darRef.update({ automaticDistributionId: id, automaticDistributionCreatedAt: now.toISOString(), updatedAt: now.toISOString() });
  } catch (error) {
    await bucket.file(sourcePath).delete({ ignoreNotFound: true });
    throw error;
  }
  return { distributionId: id, existing: false };
});

// Re-issuing a copy belongs to the original distribution. It must never create
// another DC-DIS number. Only the requesting department's controlled files and
// receipt window are refreshed; every other department remains in the same set.
const { createReissueHandler } = require('./reissueDistribution');
exports.reissueControlledCopies = onCall({ region: REGION, timeoutSeconds: 540, memory: '1GiB' }, createReissueHandler({
  getFirestore, getStorage, requireDcc, HttpsError, loadPdf, savePdf, controlledStamp,
  stampVersion: CONTROLLED_STAMP_VERSION, safeSegment,
  validDepartments: REGISTRATION_DEPARTMENTS, notify: notifyDistributionReady,
}));

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

exports.manageDistributionRecord = onCall({ region: REGION, timeoutSeconds: 540, memory: '512MiB' }, async request => {
  await requireDcc(request);
  const distributionId = cleanText(request.data?.distributionId, 80);
  const action = cleanText(request.data?.action, 20).toUpperCase();
  const reason = cleanText(request.data?.reason, 500);
  if (!distributionId || !['CANCEL', 'DELETE'].includes(action)) {
    throw new HttpsError('invalid-argument', 'ข้อมูลคำสั่งจัดการรายการแจกจ่ายไม่ครบ');
  }

  const db = getFirestore();
  const distRef = db.collection('dcs_distributions').doc(distributionId);
  const snapshot = await distRef.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'ไม่พบรายการแจกจ่าย');
  const data = snapshot.data();
  if (data.reissueLock?.expiresAt > Date.now()) throw new HttpsError('aborted', 'กำลังเปิดสิทธิ์รับเอกสาร กรุณารอแล้วลองใหม่');
  const receiptCount = Object.keys({ ...(data.firstReceipts || {}), ...(data.receipts || {}) }).length;
  if (action === 'DELETE') {
    // A reissue can leave several PROCESSING records when a previous approval
    // failed after the record was created. Deleting any one of those records
    // intentionally resets the whole unreceived reissue batch so DCC can start
    // the request again from a clean state.
    const relatedSnapshot = data.reissueOf
      ? await db.collection('dcs_distributions').where('reissueOf', '==', data.reissueOf).get()
      : null;
    const relatedDocs = relatedSnapshot?.docs || [snapshot];
    const receivedRecord = relatedDocs.find(item => Object.keys({ ...(item.data().firstReceipts || {}), ...(item.data().receipts || {}) }).length > 0);
    if (receiptCount > 0 || receivedRecord) {
      throw new HttpsError('failed-precondition', 'ลบไม่ได้ เนื่องจากมีหน่วยงานรับเอกสารแล้ว กรุณาใช้คำสั่งยกเลิกเพื่อเก็บประวัติ');
    }
    await Promise.all(relatedDocs.map(item => getStorage().bucket().deleteFiles({ prefix: `dcs/distributions/${item.id}/` })));

    const originalDistributionId = data.reissueOf || distributionId;
    const requests = await db.collection('dcs_copy_requests').where('distributionId', '==', originalDistributionId).get();
    const now = new Date().toISOString();
    const writes = [];
    let batch = db.batch();
    let operationCount = 0;
    const flush = () => {
      if (!operationCount) return;
      writes.push(batch.commit());
      batch = db.batch();
      operationCount = 0;
    };
    relatedDocs.forEach(item => {
      batch.delete(item.ref);
      operationCount += 1;
      if (operationCount >= 400) flush();
    });
    requests.docs.forEach(item => {
      const requestData = item.data();
      if (!data.reissueOf && item.id !== distributionId) {
        batch.delete(item.ref);
      } else if (requestData.dept === data.targetDepartments?.[0]) {
        batch.set(item.ref, {
          status: 'PENDING',
          dccDecisionBy: null,
          dccDecisionDate: null,
          dccDecisionNote: null,
          reissuedDistributionId: null,
          processingError: null,
          updatedAt: now,
        }, { merge: true });
      }
      operationCount += 1;
      if (operationCount >= 400) flush();
    });
    flush();
    await Promise.all(writes);
    return { action, deleted: true, distributionId, deletedCount: relatedDocs.length, requestReset: Boolean(data.reissueOf) };
  }

  if (!reason) throw new HttpsError('invalid-argument', 'กรุณาระบุเหตุผลการยกเลิก');
  // Revoke in Firestore before touching Storage. A failed/slow deletion must
  // never leave recipients authorised or allow a late receipt to revive the set.
  const needsCleanup = await db.runTransaction(async tx => {
    const fresh = await tx.get(distRef);
    if (!fresh.exists) throw new HttpsError('not-found', 'ไม่พบรายการแจกจ่าย');
    const current = fresh.data();
    if (current.reissueLock?.expiresAt > Date.now()) throw new HttpsError('aborted', 'กำลังเปิดสิทธิ์รับเอกสาร กรุณารอแล้วลองใหม่');
    if (current.status === 'CANCELLED') {
      if (current.storageStatus === 'PURGED') return false;
      tx.update(distRef, { storageStatus: 'PURGE_PENDING', updatedAt: new Date().toISOString() });
      return true;
    }
    if (current.stampStatus === 'PROCESSING') throw new HttpsError('failed-precondition', 'ระบบกำลังประทับตรา กรุณารอให้เสร็จก่อนดำเนินการ');
    const cancelledAt = new Date().toISOString();
    tx.update(distRef, {
      status: 'CANCELLED', cancelledAt, cancelledBy: request.auth.uid,
      cancellationReason: reason, storageStatus: 'PURGE_PENDING', updatedAt: cancelledAt,
    });
    return true;
  });
  if (!needsCleanup) return { action, cancelled: true, distributionId };
  try {
    await getStorage().bucket().deleteFiles({ prefix: `dcs/distributions/${distributionId}/` });
    const now = new Date().toISOString();
    await distRef.update({ storageStatus: 'PURGED', fileDeletedAt: now, departmentFiles: {}, departmentFileLists: {}, purgeError: null, updatedAt: now });
  } catch (error) {
    console.error('CANCELLED_DISTRIBUTION_PURGE_FAILED', distributionId, error);
    // The scheduled purge retries PURGE_PENDING. The cancellation itself is done.
    return { action, cancelled: true, distributionId, cleanupPending: true };
  }
  return { action, cancelled: true, distributionId };
});

const QA_QC_ALIASES = new Set(['QA', 'QC', 'QA/QC']);
const canonicalDepartment = value => QA_QC_ALIASES.has(value) ? 'QA/QC' : value;

exports.normalizeQaQcDepartments = onCall({ region: REGION, timeoutSeconds: 540, memory: '512MiB' }, async request => {
  await requireDcc(request);
  const db = getFirestore();
  const distributionId = cleanText(request.data?.distributionId, 80);
  if (!distributionId) throw new HttpsError('invalid-argument', 'ไม่พบเลขที่ใบแจกจ่าย');
  const distRef = db.collection('dcs_distributions').doc(distributionId);
  const snapshot = await distRef.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'ไม่พบรายการแจกจ่าย');
  const data = snapshot.data();

  const aliases = (data.targetDepartments || []).filter(dept => QA_QC_ALIASES.has(dept));
  if (!aliases.length) return { normalized: false, distributionId };

  const targetDepartments = [...new Set((data.targetDepartments || []).map(canonicalDepartment))];
  const aliasTargets = (data.targets || []).filter(target => QA_QC_ALIASES.has(target.dept));
  const chosenTarget = aliasTargets.find(target => target.isDownloaded)
    || aliasTargets.find(target => target.dept === 'QA/QC')
    || aliasTargets[0];
  const targets = [];
  for (const target of data.targets || []) {
    const dept = canonicalDepartment(target.dept);
    if (dept === 'QA/QC') {
      if (!targets.some(item => item.dept === 'QA/QC')) targets.push({ ...chosenTarget, dept: 'QA/QC' });
    } else if (!targets.some(item => item.dept === dept)) targets.push({ ...target, dept });
  }

  const sourceReceipt = data.receipts?.['QA/QC'] || data.receipts?.QA || data.receipts?.QC;
  const receipts = Object.fromEntries(Object.entries(data.receipts || {}).filter(([dept]) => !QA_QC_ALIASES.has(dept)));
  if (sourceReceipt) receipts['QA/QC'] = { ...sourceReceipt, dept: 'QA/QC' };

  const normalizeMap = (source = {}, mode = 'first') => {
    const output = Object.fromEntries(Object.entries(source).filter(([dept]) => !QA_QC_ALIASES.has(dept)));
    const values = ['QA/QC', 'QA', 'QC'].map(key => source[key]).filter(value => value !== undefined && value !== null);
    if (values.length) output['QA/QC'] = mode === 'max' ? Math.max(...values.map(Number)) : values[0];
    return output;
  };

  const sheet = data.distributionSheet;
  let distributionSheet = sheet;
  if (sheet?.rows) {
    const normalizedRows = [];
    for (const row of sheet.rows) {
      const dept = canonicalDepartment(row.dept);
      const normalized = { ...row, dept, position: String(row.position || '').replace(/\b(?:QA|QC|QA\/QC)\b/g, 'QA/QC') };
      const existingIndex = normalizedRows.findIndex(item => item.dept === 'QA/QC');
      if (dept !== 'QA/QC' || existingIndex < 0) normalizedRows.push(normalized);
      else if (!normalizedRows[existingIndex].receiveSignatureStoragePath && normalized.receiveSignatureStoragePath) normalizedRows[existingIndex] = normalized;
    }
    distributionSheet = { ...sheet, rows: normalizedRows, updatedAt: new Date().toISOString(), updatedBy: request.auth.uid };
  }

  const allDownloaded = targetDepartments.every(dept => Boolean(receipts[dept]?.downloadedAt));
  const update = {
    targetDepartments,
    targets,
    receipts,
    allocationByDepartment: normalizeMap(data.allocationByDepartment, 'max'),
    departmentFiles: normalizeMap(data.departmentFiles),
    departmentFileLists: normalizeMap(data.departmentFileLists),
    departmentFileKeys: normalizeMap(data.departmentFileKeys),
    departmentFileKeyLists: normalizeMap(data.departmentFileKeyLists),
    departmentExpirationEpoch: normalizeMap(data.departmentExpirationEpoch, 'max'),
    distributionSheet,
    status: allDownloaded ? 'COMPLETED' : (data.status === 'CANCELLED' ? 'CANCELLED' : 'IN_PROGRESS'),
    allDownloadedAt: allDownloaded ? (data.allDownloadedAt || new Date().toISOString()) : null,
    qaQcNormalizedAt: new Date().toISOString(),
    qaQcNormalizedBy: request.auth.uid,
    updatedAt: new Date().toISOString(),
  };

  const batch = db.batch();
  batch.update(distRef, update);
  if (data.darReferenceId) {
    const darRef = db.collection('dcs_dars').doc(data.darReferenceId);
    const darSnapshot = await darRef.get();
    if (darSnapshot.exists && Array.isArray(darSnapshot.data().distributionHolders)) {
      const holders = [];
      for (const holder of darSnapshot.data().distributionHolders) {
        const dept = canonicalDepartment(holder.dept);
        const normalized = { ...holder, dept, position: String(holder.position || '').replace(/\b(?:QA|QC|QA\/QC)\b/g, 'QA/QC') };
        const existingIndex = holders.findIndex(item => item.dept === 'QA/QC');
        if (dept !== 'QA/QC' || existingIndex < 0) holders.push(normalized);
        else if (!holders[existingIndex].checked && normalized.checked) holders[existingIndex] = normalized;
      }
      batch.update(darRef, { distributionHolders: holders, updatedAt: new Date().toISOString() });
    }
  }
  await batch.commit();

  const users = await db.collection('users').where('department', 'in', ['QA', 'QC']).get();
  await Promise.all(users.docs.map(user => user.ref.update({ department: 'QA/QC', updatedAt: new Date().toISOString() })));
  return { normalized: true, distributionId, mergedAliases: aliases, targetCount: targetDepartments.length, keptReceipt: Boolean(sourceReceipt) };
});

async function purgeDistribution(snapshot, reason) {
  const db = getFirestore();
  const lockId = `purge-${randomBytes(12).toString('hex')}`;
  const claimed = await db.runTransaction(async tx => {
    const fresh = await tx.get(snapshot.ref);
    const data = fresh.data();
    if (!data || data.storageStatus === 'PURGED' || data.reissueLock?.expiresAt > Date.now()) return false;
    if (reason === 'DOWNLOAD_WINDOW_EXPIRED' && Number(data.expirationEpoch) > Date.now()) return false;
    if (reason === 'ALL_DEPARTMENTS_DOWNLOADED' && data.storageStatus !== 'PURGE_PENDING') return false;
    tx.update(snapshot.ref, { reissueLock: { id: lockId, expiresAt: Date.now() + 12 * 60000 } });
    return true;
  });
  if (!claimed) return;
  try {
    await getStorage().bucket().deleteFiles({ prefix: `dcs/distributions/${snapshot.id}/` });
    await db.runTransaction(async tx => {
      const fresh = await tx.get(snapshot.ref);
      const data = fresh.data();
      if (data?.reissueLock?.id !== lockId) return;
      tx.update(snapshot.ref, {
        storageStatus: 'PURGED', reissueLock: null,
        ...(reason === 'DOWNLOAD_WINDOW_EXPIRED' && !['COMPLETED', 'CANCELLED'].includes(data.status) ? { status: 'EXPIRED' } : {}),
        fileDeletedAt: new Date().toISOString(), purgeReason: reason, updatedAt: new Date().toISOString(),
      });
    });
  } catch (error) {
    console.error('PURGE_FAILED', snapshot.id, error);
    await snapshot.ref.update({ reissueLock: null, storageStatus: 'PURGE_PENDING', purgeError: String(error), updatedAt: new Date().toISOString() });
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

const setDownloadCors = response => {
  response.set('Access-Control-Allow-Origin', '*');
  response.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  response.set('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, X-File-Count');
  response.set('Cache-Control', 'private, no-store, max-age=0');
};

exports.downloadControlledCopyFile = onRequest({
  region: REGION,
  timeoutSeconds: 540,
  memory: '1GiB',
}, async (request, response) => {
  setDownloadCors(response);
  if (request.method === 'OPTIONS') return response.status(204).send('');
  if (request.method !== 'GET') return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const authorization = String(request.get('authorization') || '');
    if (!authorization.startsWith('Bearer ')) return response.status(401).json({ error: 'UNAUTHENTICATED' });
    const decoded = await getAuth().verifyIdToken(authorization.slice(7));
    const distributionId = cleanText(request.query.distributionId, 100);
    if (!distributionId) return response.status(400).json({ error: 'MISSING_DISTRIBUTION' });

    const db = getFirestore();
    const [profileSnapshot, distributionSnapshot] = await Promise.all([
      db.collection('users').doc(decoded.uid).get(),
      db.collection('dcs_distributions').doc(distributionId).get(),
    ]);
    if (!profileSnapshot.exists || profileSnapshot.data().active !== true) return response.status(403).json({ error: 'INACTIVE_USER' });
    if (!distributionSnapshot.exists) return response.status(404).json({ error: 'DISTRIBUTION_NOT_FOUND' });

    const profile = profileSnapshot.data();
    const distribution = distributionSnapshot.data();
    const department = profile.department;
    const receipt = distribution.receipts?.[department];
    if (profile.role !== 'DCC_ADMIN') {
      if (distribution.departmentCancellations?.[department]) return response.status(410).json({ error: 'FILE_NOT_AVAILABLE' });
      if (!distribution.targetDepartments?.includes(department)) return response.status(403).json({ error: 'NOT_A_RECIPIENT' });
      // Older receipts were created before downloaderUid was introduced. They
      // remain downloadable only by the active account of that same department.
      if (!receipt?.downloadedAt || (receipt.downloaderUid && receipt.downloaderUid !== decoded.uid)) {
        return response.status(403).json({ error: 'RECEIPT_REQUIRED' });
      }
    }
    if (distribution.status === 'CANCELLED' || ['PURGED', 'PURGE_PENDING'].includes(distribution.storageStatus)) return response.status(410).json({ error: 'FILE_NOT_AVAILABLE' });
    const deadlines = distribution.departmentExpirationEpoch || {};
    const departmentExpiry = Number(Object.prototype.hasOwnProperty.call(deadlines, department)
      ? deadlines[department] : (distribution.expirationEpoch ?? Date.parse(distribution.expirationDate)));
    if (!Number.isFinite(departmentExpiry) || departmentExpiry <= Date.now()) return response.status(410).json({ error: 'DOWNLOAD_EXPIRED' });

    const paths = distribution.departmentFileLists?.[department]
      || (distribution.departmentFiles?.[department] ? [distribution.departmentFiles[department]] : []);
    if (!paths.length) return response.status(404).json({ error: 'FILES_NOT_FOUND' });
    const sourceNames = distribution.departmentFileNames?.[department] || (Array.isArray(distribution.fileNames) ? distribution.fileNames : [distribution.fileName || 'document.pdf']);
    const outputNames = paths.map((_, index) => `CONTROLLED_${safeSegment(department)}_${safeSegment(sourceNames[index] || `document-${index + 1}.pdf`)}`);
    const bucket = getStorage().bucket();

    if (String(request.query.all || '') === '1') {
      const available = await Promise.all(paths.map(path => bucket.file(path).exists().then(([exists]) => exists)));
      if (available.some(exists => !exists)) return response.status(404).json({ error: 'FILES_NOT_FOUND' });
      const zipName = `CONTROLLED_${safeSegment(distribution.docNo)}_Rev${safeSegment(distribution.revision)}_${safeSegment(department)}.zip`;
      response.status(200);
      response.set('Content-Type', 'application/zip');
      response.set('Content-Disposition', `attachment; filename="${zipName}"`);
      response.set('X-File-Count', String(paths.length));
      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.on('warning', error => console.warn('CONTROLLED_ZIP_WARNING', distributionId, error));
      archive.on('error', error => response.destroy(error));
      const completed = new Promise((resolve, reject) => {
        response.once('finish', resolve);
        response.once('error', reject);
      });
      archive.pipe(response);
      paths.forEach((path, index) => archive.append(bucket.file(path).createReadStream(), { name: outputNames[index] }));
      await archive.finalize();
      await completed;
      return;
    }

    const index = Number(request.query.index);
    if (!Number.isInteger(index) || index < 0 || index >= paths.length) return response.status(400).json({ error: 'INVALID_FILE_INDEX' });
    const file = bucket.file(paths[index]);
    const [exists] = await file.exists();
    if (!exists) return response.status(404).json({ error: 'FILE_NOT_FOUND' });
    const [metadata] = await file.getMetadata();
    response.status(200);
    response.set('Content-Type', 'application/octet-stream');
    response.set('Content-Disposition', `attachment; filename="${outputNames[index]}"`);
    if (metadata.size) response.set('Content-Length', String(metadata.size));
    await new Promise((resolve, reject) => {
      const stream = file.createReadStream();
      stream.once('error', reject);
      response.once('finish', resolve);
      response.once('error', reject);
      stream.pipe(response);
    });
  } catch (error) {
    console.error('CONTROLLED_DOWNLOAD_FAILED', error);
    if (!response.headersSent) response.status(500).json({ error: 'DOWNLOAD_FAILED' });
    else response.destroy(error);
  }
});

exports.downloadAnnouncementFile = onRequest({
  region: REGION,
  timeoutSeconds: 120,
  memory: '512MiB',
}, async (request, response) => {
  setDownloadCors(response);
  if (request.method === 'OPTIONS') return response.status(204).send('');
  if (request.method !== 'GET') return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const authorization = String(request.get('authorization') || '');
    if (!authorization.startsWith('Bearer ')) return response.status(401).json({ error: 'UNAUTHENTICATED' });
    const decoded = await getAuth().verifyIdToken(authorization.slice(7));
    const announcementId = cleanText(request.query.announcementId, 100);
    const index = Number(request.query.index);
    if (!announcementId || !Number.isInteger(index) || index < 0) return response.status(400).json({ error: 'INVALID_REQUEST' });

    const db = getFirestore();
    const [profileSnapshot, announcementSnapshot] = await Promise.all([
      db.collection('users').doc(decoded.uid).get(),
      db.collection('dcs_announcements').doc(announcementId).get(),
    ]);
    if (!profileSnapshot.exists || profileSnapshot.data().active !== true) return response.status(403).json({ error: 'INACTIVE_USER' });
    if (!announcementSnapshot.exists) return response.status(404).json({ error: 'ANNOUNCEMENT_NOT_FOUND' });

    const profile = profileSnapshot.data();
    const announcement = announcementSnapshot.data();
    if (profile.role !== 'DCC_ADMIN' && !announcement.targetDepartments?.includes(profile.department)) {
      return response.status(403).json({ error: 'NOT_A_RECIPIENT' });
    }
    const attachment = announcement.attachments?.[index];
    if (!attachment?.storagePath || !attachment.storagePath.startsWith(`dcs/announcements/${announcementId}/`)) {
      return response.status(404).json({ error: 'FILE_NOT_FOUND' });
    }

    const file = getStorage().bucket().file(attachment.storagePath);
    const [exists] = await file.exists();
    if (!exists) return response.status(404).json({ error: 'FILE_NOT_FOUND' });
    const [metadata] = await file.getMetadata();
    const outputName = safeSegment(attachment.name || `announcement-${index + 1}.pdf`);
    response.status(200);
    response.set('Content-Type', 'application/pdf');
    response.set('Content-Disposition', `attachment; filename="${outputName}"`);
    if (metadata.size) response.set('Content-Length', String(metadata.size));
    await new Promise((resolve, reject) => {
      const stream = file.createReadStream();
      stream.once('error', reject);
      response.once('finish', resolve);
      response.once('error', reject);
      stream.pipe(response);
    });
  } catch (error) {
    console.error('ANNOUNCEMENT_DOWNLOAD_FAILED', error);
    if (!response.headersSent) response.status(500).json({ error: 'DOWNLOAD_FAILED' });
    else response.destroy(error);
  }
});

exports.cancelDistributionDepartment = onCall({ region: REGION, timeoutSeconds: 120, memory: '256MiB' }, async request => {
  await requireDcc(request);
  const distributionId = cleanText(request.data?.distributionId, 80);
  const department = cleanText(request.data?.department, 80);
  const reason = cleanText(request.data?.reason, 500);
  if (!distributionId || !department || !reason) throw new HttpsError('invalid-argument', 'กรุณาระบุรายการ แผนก และเหตุผลการยกเลิก');
  const db = getFirestore();
  const distRef = db.collection('dcs_distributions').doc(distributionId);
  const auditRef = db.collection('dcs_audit_logs').doc();
  const paths = await db.runTransaction(async tx => {
    const snap = await tx.get(distRef);
    if (!snap.exists) throw new HttpsError('not-found', 'ไม่พบรายการแจกจ่าย');
    const data = snap.data();
    if (data.reissueLock?.expiresAt > Date.now()) throw new HttpsError('aborted', 'กำลังเปิดสิทธิ์รับเอกสาร กรุณารอแล้วลองใหม่');
    const prior = data.departmentCancellations?.[department];
    if (prior) return prior.filePaths || [];
    if (data.status === 'CANCELLED') throw new HttpsError('failed-precondition', 'รายการนี้ยกเลิกทั้งชุดแล้ว');
    if (data.stampStatus === 'PROCESSING') throw new HttpsError('failed-precondition', 'กรุณารอประทับตราเสร็จก่อนยกเลิก');
    if (!data.targetDepartments?.includes(department)) throw new HttpsError('not-found', 'ไม่พบแผนกในรายการแจกจ่าย');
    const filePaths = data.departmentFileLists?.[department] || [data.departmentFiles?.[department]].filter(Boolean);
    const remaining = data.targetDepartments.filter(dept => dept !== department);
    const now = new Date().toISOString();
    const allReceived = remaining.length > 0 && remaining.every(dept => Boolean(data.receipts?.[dept]?.downloadedAt));
    const updates = {
      targetDepartments: remaining,
      departmentCancellations: { ...(data.departmentCancellations || {}), [department]: { reason, cancelledAt: now, cancelledBy: request.auth.uid, filePaths } },
      departmentExpirationEpoch: { ...(data.departmentExpirationEpoch || {}), [department]: 0 },
      status: remaining.length === 0 ? 'CANCELLED' : allReceived ? 'COMPLETED' : 'IN_PROGRESS',
      allDownloadedAt: allReceived ? (data.allDownloadedAt || now) : null,
      updatedAt: now,
    };
    if (!remaining.length) Object.assign(updates, { cancelledAt: now, cancelledBy: request.auth.uid, cancellationReason: 'ยกเลิกครบทุกแผนก' });
    tx.update(distRef, updates);
    tx.set(auditRef, { timestamp: now, createdAt: now, actor: 'DCC', actorDept: 'DCC', actorUid: request.auth.uid, actionType: 'DISTRIBUTION_DEPARTMENT_CANCELLED', docNo: data.docNo, revision: data.revision, description: 'ยกเลิกแจกจ่ายเฉพาะแผนก ' + department, details: { distributionId, department, reason } });
    return filePaths;
  });
  // Revoke access first; retain receipts and recipient rows as historical evidence.
  await Promise.all(paths.map(path => {
    if (!path.startsWith('dcs/distributions/' + distributionId + '/controlled/')) throw new HttpsError('failed-precondition', 'เส้นทางไฟล์ไม่ถูกต้อง');
    return getStorage().bucket().file(path).delete({ ignoreNotFound: true });
  }));
  return { cancelled: true, department, distributionId };
});

 // Canonicalize old QA/QC access without changing files, receipts, status or expiry.
exports.repairQaQcAccess = onCall({ region: REGION, timeoutSeconds: 540, memory: '512MiB' }, async request => {
  await requireDcc(request);
  const db = getFirestore();
  const counts = { distributions: 0, users: 0, registrations: 0 };
  const distributions = await db.collection('dcs_distributions').where('targetDepartments', 'array-contains-any', ['QA', 'QC']).get();
  for (const candidate of distributions.docs) {
    const changed = await db.runTransaction(async tx => {
      const snap = await tx.get(candidate.ref);
      if (!snap.exists) return false;
      const data = snap.data();
      if (!(data.targetDepartments || []).some(dept => dept === 'QA' || dept === 'QC')) return false;
      const patch = { targetDepartments: [...new Set(data.targetDepartments.map(canonicalDepartment))], updatedAt: new Date().toISOString() };
      const aliases = (data.targets || []).filter(row => QA_QC_ALIASES.has(row.dept));
      const receiptEntry = ['QA/QC', 'QA', 'QC'].find(dept => data.receipts?.[dept]?.downloadedAt);
      const chosen = aliases.find(row => row.dept === receiptEntry) || aliases.find(row => row.isDownloaded) || aliases.find(row => row.dept === 'QA/QC') || aliases[0];
      patch.targets = (data.targets || []).filter(row => !QA_QC_ALIASES.has(row.dept));
      if (chosen) patch.targets.push({ ...chosen, dept: 'QA/QC' });
      // Keep legacy map keys for historic links. Add the canonical key for current access.
      for (const field of ['receipts', 'allocationByDepartment', 'departmentFiles', 'departmentFileLists', 'departmentFileKeys', 'departmentFileKeyLists', 'departmentExpirationEpoch', 'departmentCancellations']) {
        const source = data[field];
        if (!source) continue;
        const key = field === 'receipts' ? receiptEntry : (source['QA/QC'] !== undefined ? 'QA/QC' : (chosen && source[chosen.dept] !== undefined ? chosen.dept : ['QA', 'QC'].find(dept => source[dept] !== undefined)));
        if (key) patch[field] = { ...source, 'QA/QC': field === 'receipts' ? { ...source[key], dept: 'QA/QC' } : source[key] };
      }
      tx.update(candidate.ref, patch);
      const auditRef = db.collection('dcs_audit_logs').doc();
      tx.set(auditRef, { id: auditRef.id, actionType: 'DEPARTMENT_NORMALIZED', actorUid: request.auth.uid, actorDept: 'DCC', timestamp: patch.updatedAt, createdAt: patch.updatedAt, description: 'ปรับสิทธิ์ QA/QC ในรายการแจกจ่ายเดิม', details: { distributionId: snap.id, oldDepartments: data.targetDepartments } });
      return true;
    });
    if (changed) counts.distributions++;
  }
  for (const [collectionName, counter] of [['users', 'users'], ['dcs_user_registrations', 'registrations']]) {
    const rows = await db.collection(collectionName).where('department', 'in', ['QA', 'QC']).get();
    for (const row of rows.docs) {
      await db.runTransaction(async tx => {
        const latest = await tx.get(row.ref);
        if (!latest.exists || !['QA', 'QC'].includes(latest.data().department)) return;
        tx.update(row.ref, { department: 'QA/QC', updatedAt: new Date().toISOString(), departmentCorrectedBy: request.auth.uid });
      });
      counts[counter]++;
    }
  }
  return counts;
});

