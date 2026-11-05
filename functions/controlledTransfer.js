// A signed receipt is created before download authorization. Track file saving
// separately so a failed transfer never releases the department's pending gate.
const { createHash } = require('node:crypto');
const transferComplete = receipt => Boolean(receipt?.downloadedAt && receipt.transferStatus !== 'PENDING');
const evidenceId = (distributionId, dept, uid, transferId) => createHash('sha256').update(JSON.stringify([distributionId, dept, uid, transferId])).digest('hex');
const pathsHash = paths => createHash('sha256').update(JSON.stringify(paths)).digest('hex');

// Called only after the authenticated download endpoint finishes streaming.
// The attempt and paths must still match: a reopening must not inherit proof
// from an old download or let an in-flight download undo a cancellation.
function createRecordControlledDelivery({ getFirestore }) {
  return async ({ distributionId, dept, uid, transferId, file, expectedPaths }) => {
    if (!transferId) return;
    const db = getFirestore();
    const distRef = db.collection('dcs_distributions').doc(distributionId);
    const evidenceRef = db.collection('dcs_controlled_delivery_evidence').doc(evidenceId(distributionId, dept, uid, transferId));
    await db.runTransaction(async tx => {
      const [snap, evidenceSnap] = await Promise.all([tx.get(distRef), tx.get(evidenceRef)]);
      const data = snap.data();
      const receipt = data?.receipts?.[dept];
      const paths = data?.departmentFileLists?.[dept] || (data?.departmentFiles?.[dept] ? [data.departmentFiles[dept]] : []);
      if (!data || data.status === 'CANCELLED' || data.departmentCancellations?.[dept] || !data.targetDepartments?.includes(dept)
        || receipt?.transferStatus !== 'PENDING' || receipt.downloaderUid !== uid || receipt.transferId !== transferId
        || !Array.isArray(paths) || JSON.stringify(paths) !== JSON.stringify(expectedPaths)) return;
      const prior = evidenceSnap.data();
      const indexes = new Set((prior?.pathsHash === pathsHash(paths) ? prior.indexes : []).filter(index => Number.isInteger(index) && index >= 0 && index < paths.length));
      if (file === 'all') paths.forEach((_, index) => indexes.add(index));
      else if (Number.isInteger(file) && file >= 0 && file < paths.length) indexes.add(file);
      else return;
      tx.set(evidenceRef, { distributionId, dept, uid, transferId, pathsHash: pathsHash(paths), indexes: [...indexes].sort((a, b) => a - b), recordedAt: new Date().toISOString() });
    });
  };
}

function createCompleteControlledTransfer({ getFirestore, HttpsError, now = () => Date.now() }) {
  return async request => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'กรุณาเข้าสู่ระบบใหม่');
    const distributionId = String(request.data?.distributionId || '');
    const transferId = String(request.data?.transferId || '');
    const file = request.data?.file;
    const method = request.data?.method;
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(distributionId) || !/^[A-Za-z0-9-]{1,100}$/.test(transferId)
      || !(file === 'all' || (Number.isInteger(file) && file >= 0 && file < 20))
      || !['picker', 'confirmed'].includes(method)) {
      throw new HttpsError('invalid-argument', 'ข้อมูลการดาวน์โหลดไม่ถูกต้อง');
    }
    const db = getFirestore();
    const distRef = db.collection('dcs_distributions').doc(distributionId);
    const userRef = db.collection('users').doc(uid);
    return db.runTransaction(async tx => {
      const [profileSnap, distSnap] = await Promise.all([tx.get(userRef), tx.get(distRef)]);
      const profile = profileSnap.data();
      const data = distSnap.data();
      if (!profileSnap.exists || profile?.active !== true) throw new HttpsError('permission-denied', 'บัญชีนี้ไม่มีสิทธิ์ใช้งาน');
      if (!distSnap.exists || !data) throw new HttpsError('not-found', 'ไม่พบรายการแจกจ่าย');
      const dept = profile.department;
      const receipt = data.receipts?.[dept];
      if (data.status === 'CANCELLED' || data.departmentCancellations?.[dept] || !data.targetDepartments?.includes(dept)) {
        throw new HttpsError('permission-denied', 'รายการแจกจ่ายถูกยกเลิกหรือแผนกไม่มีสิทธิ์');
      }
      if (!receipt?.downloadedAt || receipt.downloaderUid !== uid || receipt.transferId !== transferId) {
        throw new HttpsError('failed-precondition', 'หลักฐานการรับเปลี่ยนแปลง กรุณาเปิดรายการอีกครั้ง');
      }
      if (receipt.transferStatus === 'COMPLETE') return { complete: true, transferredIndexes: receipt.transferredIndexes || [] };
      if (receipt.transferStatus !== 'PENDING') throw new HttpsError('failed-precondition', 'สถานะการรับไม่ถูกต้อง');
      const expiry = Number(Object.prototype.hasOwnProperty.call(data.departmentExpirationEpoch || {}, dept)
        ? data.departmentExpirationEpoch[dept] : (data.expirationEpoch ?? Date.parse(data.expirationDate)));
      if (!Number.isFinite(expiry) || expiry <= now() || ['PURGED', 'PURGE_PENDING'].includes(data.storageStatus)) {
        throw new HttpsError('failed-precondition', 'สิทธิ์รับเอกสารหมดอายุหรือไฟล์ไม่พร้อม กรุณาร้องขอ DCC');
      }
      const paths = data.departmentFileLists?.[dept] || (data.departmentFiles?.[dept] ? [data.departmentFiles[dept]] : []);
      if (!Array.isArray(paths) || !paths.length || paths.length > 20 || (file !== 'all' && file >= paths.length)) {
        throw new HttpsError('failed-precondition', 'รายการไฟล์เปลี่ยนไป กรุณาเปิดรายการอีกครั้ง');
      }
      const evidenceRef = db.collection('dcs_controlled_delivery_evidence').doc(evidenceId(distributionId, dept, uid, transferId));
      const evidence = (await tx.get(evidenceRef)).data();
      const served = new Set(evidence?.pathsHash === pathsHash(paths) && Array.isArray(evidence.indexes) ? evidence.indexes : []);
      const requestedIndexes = file === 'all' ? paths.map((_, index) => index) : [file];
      if (requestedIndexes.some(index => !served.has(index))) {
        throw new HttpsError('failed-precondition', 'กำลังบันทึกหลักฐานการส่งไฟล์ กรุณาลองอีกครั้ง');
      }
      const indexes = new Set((Array.isArray(receipt.transferredIndexes) ? receipt.transferredIndexes : [])
        .filter(index => Number.isInteger(index) && index >= 0 && index < paths.length));
      if (file === 'all') paths.forEach((_, index) => indexes.add(index)); else indexes.add(file);
      const transferredIndexes = [...indexes].sort((a, b) => a - b);
      const complete = transferredIndexes.length === paths.length;
      const timestamp = new Date(now()).toISOString();
      const updated = { ...receipt, transferredIndexes, ...(complete ? { transferStatus: 'COMPLETE', transferCompletedAt: timestamp, transferSaveMethod: method } : {}) };
      const receipts = { ...data.receipts, [dept]: updated };
      const allComplete = data.targetDepartments.length > 0 && data.targetDepartments.every(targetDept => transferComplete(receipts[targetDept]));
      tx.update(distRef, { receipts, status: allComplete ? 'COMPLETED' : 'IN_PROGRESS', allDownloadedAt: allComplete ? timestamp : null, updatedAt: timestamp });
      return { complete, transferredIndexes };
    });
  };
}

module.exports = { createCompleteControlledTransfer, createRecordControlledDelivery, transferComplete };
