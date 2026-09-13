const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');

initializeApp();

const REGION = 'asia-southeast1';
const RED = rgb(0.82, 0, 0);
const safeSegment = value => String(value).replace(/[^a-zA-Z0-9._-]/g, '_');

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

function controlledStamp(pdf, department) {
  const font = pdf.embedStandardFont(StandardFonts.HelveticaBold);
  return Promise.resolve(font).then(stampFont => {
    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize();
      const first = 'CONTROLLED COPY';
      const second = `DEPARTMENT: ${department}`;
      const fontSize = Math.max(9, Math.min(15, width / 42));
      const padding = 8;
      const boxWidth = Math.max(stampFont.widthOfTextAtSize(first, fontSize), stampFont.widthOfTextAtSize(second, fontSize - 2)) + padding * 2;
      const boxHeight = fontSize * 2.7;
      const x = Math.max(10, width - boxWidth - 18);
      const y = Math.max(10, height - boxHeight - 18);
      page.drawRectangle({ x, y, width: boxWidth, height: boxHeight, borderColor: RED, borderWidth: 1.5, opacity: 0.94, borderOpacity: 0.94 });
      page.drawText(first, { x: x + padding, y: y + boxHeight - fontSize - 5, size: fontSize, font: stampFont, color: RED, opacity: 0.94 });
      page.drawText(second, { x: x + padding, y: y + 7, size: fontSize - 2, font: stampFont, color: RED, opacity: 0.94 });
    }
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
    await controlledStamp(copy, department);
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
