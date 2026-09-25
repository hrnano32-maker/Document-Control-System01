import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
  runTransaction,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { deleteObject, getBlob, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, firebaseFunctions, storage } from '../lib/firebase';
import type { AuditActionType, AuditLogEntry, CopyReRequest, CurrentUserSession, DarRecord, Department, DistributionRecord, MasterDocument } from '../types';
import { normalizeSignatureDataUrl } from '../utils/signatureImage';

const DAY_MS = 24 * 60 * 60 * 1000;
const clean = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const dataUrlBlob = async (dataUrl: string) => (await fetch(dataUrl)).blob();
const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

export const subscribeCollection = <T,>(name: string, callback: (rows: T[]) => void) =>
  onSnapshot(query(collection(db, name), orderBy('createdAt', 'desc')), snap => {
    callback(snap.docs.map(item => item.data() as T));
  });

export const subscribeAudit = (callback: (rows: AuditLogEntry[]) => void) =>
  onSnapshot(query(collection(db, 'dcs_audit_logs'), orderBy('timestamp', 'desc')), snap => {
    callback(snap.docs.map(item => item.data() as AuditLogEntry));
  });

export const subscribeDars = (user: CurrentUserSession, callback: (rows: DarRecord[]) => void) => {
  const constraints = user.userRole === 'DCC_ADMIN' ? [orderBy('createdAt', 'desc')] : [where('requestDept', '==', user.currentDept), orderBy('createdAt', 'desc')];
  return onSnapshot(query(collection(db, 'dcs_dars'), ...constraints), snap => callback(snap.docs.map(item => item.data() as DarRecord).filter(item => user.userRole === 'DCC_ADMIN' || item.status !== 'CANCELLED')));
};
export const subscribeDistributions = (user: CurrentUserSession, callback: (rows: DistributionRecord[]) => void) => {
  const constraints = user.userRole === 'DCC_ADMIN' ? [orderBy('createdAt', 'desc')] : [where('targetDepartments', 'array-contains', user.currentDept), orderBy('createdAt', 'desc')];
  return onSnapshot(query(collection(db, 'dcs_distributions'), ...constraints), snap => callback(snap.docs.map(item => item.data() as DistributionRecord)));
};
export const subscribeCopyRequests = (user: CurrentUserSession, callback: (rows: CopyReRequest[]) => void) => {
  const constraints = user.userRole === 'DCC_ADMIN' ? [orderBy('createdAt', 'desc')] : [where('dept', '==', user.currentDept), orderBy('createdAt', 'desc')];
  return onSnapshot(query(collection(db, 'dcs_copy_requests'), ...constraints), snap => callback(snap.docs.map(item => item.data() as CopyReRequest)));
};
export const subscribeAuditForUser = (user: CurrentUserSession, callback: (rows: AuditLogEntry[]) => void) => {
  const constraints = user.userRole === 'DCC_ADMIN' ? [orderBy('timestamp', 'desc')] : [where('actorDept', '==', user.currentDept), orderBy('timestamp', 'desc')];
  return onSnapshot(query(collection(db, 'dcs_audit_logs'), ...constraints), snap => callback(snap.docs.map(item => item.data() as AuditLogEntry)));
};

const actorFields = (user: CurrentUserSession) => ({
  actor: `${user.userName} (${user.currentDept})`,
  actorDept: user.currentDept,
  actorUid: user.uid,
});

export const writeAudit = async (
  user: CurrentUserSession,
  actionType: AuditActionType,
  docNo: string,
  revision: string,
  description: string,
  details?: Record<string, unknown>,
) => {
  const logRef = doc(collection(db, 'dcs_audit_logs'));
  const entry = clean({
    id: logRef.id,
    timestamp: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...actorFields(user),
    actionType,
    docNo,
    revision,
    description,
    details: details || {},
  });
  await setDoc(logRef, entry);
};

const nextNumber = async (kind: 'dar' | 'distribution' | 'request') => {
  const year = new Date().getFullYear();
  const counterRef = doc(db, 'dcs_counters', `${kind}-${year}`);
  return runTransaction(db, async tx => {
    const snapshot = await tx.get(counterRef);
    const next = (snapshot.data()?.value || 0) + 1;
    tx.set(counterRef, { value: next, kind, year, updatedAt: new Date().toISOString() });
    return next;
  });
};

export const createDarRecord = async (user: CurrentUserSession, input: Omit<DarRecord, 'id' | 'requestDate' | 'status'>) => {
  if (input.requestDept !== user.currentDept && user.userRole !== 'DCC_ADMIN') throw new Error('ไม่มีสิทธิ์สร้าง DAR แทนหน่วยงานอื่น');
  if (!input.distributionHolders?.some(item => item.checked)) throw new Error('ต้องระบุหน่วยงานผู้รับเอกสารอย่างน้อย 1 หน่วยงาน');
  if (!input.attachmentFileDataUrl || !input.attachmentFileName) throw new Error('ต้องแนบไฟล์ร่างเอกสารจริงก่อนส่ง DAR');
  const seq = await nextNumber('dar');
  const year = new Date().getFullYear();
  const id = `DAR-${year}-${String(seq).padStart(4, '0')}`;
  const createdAt = new Date().toISOString();
  const record: DarRecord & { createdAt: string; attachmentStoragePath?: string } = clean({
    ...input,
    id,
    requestDate: createdAt.slice(0, 10),
    status: 'PENDING_REVIEW',
    createdAt,
  });
  const dataUrl = record.attachmentFileDataUrl;
  delete record.attachmentFileDataUrl;
  if (dataUrl && record.attachmentFileName) {
    const path = `dcs/dar-attachments/${user.uid}/${id}/${safeName(record.attachmentFileName)}`;
    await uploadBytes(ref(storage, path), await dataUrlBlob(dataUrl), { contentType: record.attachmentFileType });
    record.attachmentStoragePath = path;
  }
  await setDoc(doc(db, 'dcs_dars', id), record);
  await writeAudit(user, 'DAR_CREATED', record.docNo, record.proposedRevision, `สร้างคำขอ ${id} และส่งถึง DCC`, { darId: id });
  return id;
};

export const patchDarRecord = async (id: string, updates: Partial<DarRecord>) => {
  await updateDoc(doc(db, 'dcs_dars', id), clean({ ...updates, updatedAt: new Date().toISOString() }));
};

export const reviewDarRecord = async (user: CurrentUserSession, dar: DarRecord, status: 'APPROVED' | 'REJECTED' | 'UNDER_REVIEW', remarks: string) => {
  if (user.userRole !== 'DCC_ADMIN') throw new Error('เฉพาะ DCC เท่านั้นที่ตรวจสอบ DAR ได้');
  await patchDarRecord(dar.id, { status, dccReviewer: user.userName, dccReviewDate: new Date().toISOString().slice(0, 10), dccRemarks: remarks });
  await writeAudit(user, 'DAR_REVIEWED', dar.docNo, dar.proposedRevision, `ตรวจสอบ ${dar.id}: ${status}`, { remarks });
};

export const cancelDarRecord = async (user: CurrentUserSession, dar: DarRecord, reason: string) => {
  if (user.userRole !== 'DCC_ADMIN') throw new Error('เฉพาะ DCC เท่านั้นที่ยกเลิก DAR ที่อนุมัติแล้วได้');
  if (dar.status !== 'APPROVED') throw new Error('ยกเลิกแบบเก็บประวัติได้เฉพาะ DAR ที่อนุมัติแล้ว');
  const cancellationReason = reason.trim();
  if (!cancellationReason) throw new Error('กรุณาระบุเหตุผลการยกเลิก');
  const cancelledAt = new Date().toISOString();
  await updateDoc(doc(db, 'dcs_dars', dar.id), clean({ status: 'CANCELLED', cancelledAt, cancelledBy: user.userName, cancelledByUid: user.uid, cancellationReason, updatedAt: cancelledAt }));
  await writeAudit(user, 'DAR_CANCELLED', dar.docNo, dar.proposedRevision, `ยกเลิกคำขอ ${dar.id}: ${cancellationReason}`, { darId: dar.id, previousStatus: dar.status });
};

export const deleteDarDraftRecord = async (user: CurrentUserSession, dar: DarRecord) => {
  if (!['PENDING_REVIEW', 'UNDER_REVIEW', 'REJECTED'].includes(dar.status)) throw new Error('DAR สถานะนี้ไม่สามารถลบได้');
  if (user.userRole !== 'DCC_ADMIN' && user.currentDept !== dar.requestDept) throw new Error('ไม่มีสิทธิ์ลบ DAR ของแผนกอื่น');
  await httpsCallable<{ darId: string }, { deleted: boolean }>(firebaseFunctions, 'deleteDarDraft')({ darId: dar.id });
};

const documentKey = (docNo: string) => encodeURIComponent(docNo.trim().toUpperCase()).replace(/%/g, '_');

export const registerDarRecord = async (user: CurrentUserSession, dar: DarRecord) => {
  if (user.userRole !== 'DCC_ADMIN') throw new Error('เฉพาะ DCC เท่านั้นที่ขึ้นทะเบียนเอกสารได้');
  const masterRef = doc(db, 'dcs_documents', documentKey(dar.docNo));
  const darRef = doc(db, 'dcs_dars', dar.id);
  const today = new Date().toISOString().slice(0, 10);
  const reviewDue = new Date(Date.now() + 365 * DAY_MS).toISOString().slice(0, 10);
  const previousFile = await runTransaction(db, async tx => {
    const [darSnap, masterSnap] = await Promise.all([tx.get(darRef), tx.get(masterRef)]);
    if (darSnap.data()?.status !== 'APPROVED') throw new Error('สถานะ DAR ถูกเปลี่ยน กรุณารีเฟรชและตรวจสอบใหม่');
    const previous = masterSnap.data() as MasterDocument | undefined;
    const history = previous?.revisionHistory || [];
    const revision = dar.proposedRevision || dar.currentRevision || '00';
    const distributionDepartments = (dar.distributionHolders || []).filter(x => x.checked).map(x => ({ dept: x.dept, copies: Math.max(1, Number(x.copies) || 1), position: x.position }));
    const next: MasterDocument = clean({
      ...(previous || {}),
      id: masterRef.id,
      docNo: dar.docNo,
      docNameTh: dar.docNameTh,
      docNameEn: dar.docNameEn,
      docType: dar.docType,
      ownerDept: dar.requestDept,
      currentRevision: revision,
      effectiveDate: dar.targetEffectiveDate || today,
      reviewDueDate: reviewDue,
      status: dar.requestType === 'OBSOLETE' ? 'OBSOLETE' : 'ACTIVE',
      darReferenceId: dar.id,
      createdAt: previous?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      retentionPeriodYears: previous?.retentionPeriodYears || 5,
      distributionDepartments,
      fileName: dar.attachmentFileName,
      fileSize: dar.attachmentFileSize,
      fileType: dar.attachmentFileType,
      revisionHistory: [
        ...history.map(item => ({ ...item, status: 'SUPERSEDED' as const })),
        { rev: revision, effectiveDate: dar.targetEffectiveDate || today, darNo: dar.id, reason: dar.reasonForChange, registeredBy: user.userName, registeredDate: today, status: dar.requestType === 'OBSOLETE' ? 'OBSOLETE' as const : 'ACTIVE' as const, controlledDriveLink: '' },
      ],
    });
    tx.set(masterRef, next);
    tx.update(darRef, { status: 'REGISTERED', updatedAt: new Date().toISOString() });
    return previous?.currentFileStoragePath ? { path: previous.currentFileStoragePath, revision: previous.currentRevision, newRevision: revision } : null;
  });
  if (previousFile && (previousFile.revision !== previousFile.newRevision || dar.requestType === 'OBSOLETE')) {
    await httpsCallable(firebaseFunctions, 'cancelPreviousRevision')({ docId: masterRef.id, previousPath: previousFile.path, previousRevision: previousFile.revision, newRevision: previousFile.newRevision });
  }
  await writeAudit(user, 'DOCUMENT_REGISTERED', dar.docNo, dar.proposedRevision, `ขึ้นทะเบียนจาก ${dar.id} เข้า Master List`, { darId: dar.id });
};

export const createDistributionRecord = async (user: CurrentUserSession, master: MasterDocument, selectedDepartments: Department[], instructions: string, files?: { name: string; size: string; type: string; dataUrl?: string }[], onProgress?: (message: string, percent: number) => void) => {
  if (user.userRole !== 'DCC_ADMIN') throw new Error('เฉพาะ DCC เท่านั้นที่แจกจ่ายเอกสารได้');
  const darAllocation = master.distributionDepartments || [];
  if (!darAllocation.length) throw new Error('DAR ต้นทางไม่ได้ระบุหน่วยงานแจกจ่าย');
  const requiredDepartments = darAllocation.map(item => item.dept);
  const finalDepartments = Array.from(new Set([...requiredDepartments, ...(selectedDepartments || [])]));
  const allocation = finalDepartments.map(dept => darAllocation.find(item => item.dept === dept) || ({ dept, copies: 1, position: `ผู้รับผิดชอบเอกสารประจำ ${dept} (DCC เพิ่ม)` }));
  if (!files?.length || files.some(file => !file.dataUrl)) throw new Error('ต้องอัปโหลดไฟล์ Controlled Copy ฉบับจริงอย่างน้อย 1 ไฟล์ก่อนแจกจ่าย');
  if (files.length > 20) throw new Error('อัปโหลดได้สูงสุด 20 ไฟล์ต่อชุดแจกจ่าย');
  if (files.some(file => file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))) throw new Error('ไฟล์ Controlled Copy ทุกไฟล์ต้องเป็น PDF เท่านั้น');
  onProgress?.('กำลังออกเลขที่ใบแจกจ่าย', 2);
  const seq = await nextNumber('distribution');
  const year = new Date().getFullYear();
  const distributionNo = `DC-DIS-${year}-${String(seq).padStart(4, '0')}`;
  const id = distributionNo;
  const now = new Date();
  const sourceStoragePaths: string[] = [];
  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      onProgress?.(`กำลังอัปโหลดไฟล์ ${index + 1}/${files.length}: ${file.name}`, 5 + Math.round(((index + 1) / files.length) * 30));
      const path = `dcs/distributions/${id}/source/${String(index + 1).padStart(2, '0')}-${safeName(file.name)}`;
      await uploadBytes(ref(storage, path), await dataUrlBlob(file.dataUrl!), { contentType: 'application/pdf' });
      sourceStoragePaths.push(path);
    }
  } catch (error) {
    await Promise.all(sourceStoragePaths.map(path => deleteObject(ref(storage, path)).catch(() => undefined)));
    throw error;
  }
  const targets = allocation.map(item => ({ dept: item.dept, allocatedCopies: item.copies, copyNo: `${item.copies} สำเนา`, isDownloaded: false, downloadTimestamp: null, downloaderName: null, downloaderEmpId: null, downloaderPosition: null, signatureDataUrl: null, status: 'PENDING' as const }));
  const allocationByDepartment = Object.fromEntries(allocation.map(item => [item.dept, item.copies]));
  const record: DistributionRecord & { createdAt: string; receipts: Record<string, unknown> } = clean({
    id, distributionNo, docId: master.id, docNo: master.docNo, docNameTh: master.docNameTh,
    docNameEn: master.docNameEn, docType: master.docType, revision: master.currentRevision,
    effectiveDate: master.effectiveDate, distributedBy: user.userName, distributedDate: now.toISOString(),
    expirationDate: new Date(now.getTime() + 3 * DAY_MS).toISOString(), expirationEpoch: now.getTime() + 3 * DAY_MS, status: 'IN_PROGRESS',
    darReferenceId: master.darReferenceId, targetDepartments: targets.map(t => t.dept), allocationByDepartment, targets, receipts: {},
    instructions, fileName: files[0].name, fileSize: files[0].size, fileType: 'application/pdf',
    fileNames: files.map(file => file.name), fileSizes: files.map(file => file.size), fileTypes: files.map(() => 'application/pdf'),
    sourceStoragePath: sourceStoragePaths[0], sourceStoragePaths, storageStatus: 'PROCESSING', stampStatus: 'PROCESSING', processingStage: 'UPLOADED', processingDetail: `อัปโหลดต้นฉบับครบ ${files.length} ไฟล์`, processingPercent: 38, allDownloadedAt: null, fileDeletedAt: null,
    createdAt: now.toISOString(),
  });
  const distributionRef = doc(db, 'dcs_distributions', id);
  await setDoc(distributionRef, { ...record, expirationAt: Timestamp.fromMillis(record.expirationEpoch) });
  onProgress?.('บันทึกรายการแล้ว กำลังเริ่มประทับตรา', 38);
  const stopProgress = onSnapshot(distributionRef, snapshot => {
    const progress = snapshot.data() as DistributionRecord | undefined;
    if (typeof progress?.processingPercent === 'number') {
      onProgress?.(progress.processingDetail || progress.processingStage || 'กำลังประมวลผล', progress.processingPercent);
    }
  });
  try {
    await httpsCallable(firebaseFunctions, 'stampControlledCopies', { timeout: 540000 })({ distributionId: id });
  } catch (error) {
    stopProgress();
    await updateDoc(doc(db, 'dcs_distributions', id), { stampStatus: 'FAILED', storageStatus: 'PURGE_PENDING', updatedAt: new Date().toISOString() });
    throw error;
  }
  stopProgress();
  onProgress?.('ประทับตราและจัดเตรียมไฟล์ครบแล้ว', 100);
  await writeAudit(user, 'DISTRIBUTION_INITIATED', master.docNo, master.currentRevision, `แจกจ่าย ${distributionNo} จำนวน ${files.length} ไฟล์ ตามรายชื่อหน่วยงานใน ${master.darReferenceId}`, { targets: record.targetDepartments, darTargets: requiredDepartments, dccAddedTargets: finalDepartments.filter(dept => !requiredDepartments.includes(dept)), fileCount: files.length });
  return distributionNo;
};

export const manageDistributionRecord = async (user: CurrentUserSession, distribution: DistributionRecord, action: 'CANCEL' | 'DELETE', reason = '') => {
  if (user.userRole !== 'DCC_ADMIN') throw new Error('เฉพาะ DCC เท่านั้นที่จัดการรายการแจกจ่ายได้');
  if (action === 'DELETE' && Object.keys(distribution.receipts || {}).length > 0) {
    throw new Error('ลบไม่ได้ เนื่องจากมีหน่วยงานรับเอกสารแล้ว กรุณาใช้ปุ่มยกเลิก');
  }
  await httpsCallable<{ distributionId: string; action: 'CANCEL' | 'DELETE'; reason: string }, unknown>(
    firebaseFunctions,
    'manageDistributionRecord',
    { timeout: 120000 },
  )({ distributionId: distribution.id, action, reason });
  await writeAudit(
    user,
    action === 'CANCEL' ? 'DISTRIBUTION_CANCELLED' : 'DISTRIBUTION_DELETED',
    distribution.docNo,
    distribution.revision,
    action === 'CANCEL'
      ? `ยกเลิกรายการแจกจ่าย ${distribution.distributionNo}: ${reason}`
      : `ลบรายการแจกจ่ายทดลอง ${distribution.distributionNo}`,
    { distributionNo: distribution.distributionNo, receiptCount: Object.keys(distribution.receipts || {}).length },
  );
};

export const acknowledgeDownload = async (
  user: CurrentUserSession,
  distribution: DistributionRecord,
  dept: Department,
  person: { name: string; empId: string; position: string; signatureDataUrl: string },
  onProgress?: (message: string, percent: number) => void,
) => {
  if (user.currentDept !== dept) throw new Error('บัญชีนี้ไม่ตรงกับหน่วยงานผู้รับเอกสาร');
  if (distribution.status === 'CANCELLED') throw new Error('รายการแจกจ่ายนี้ถูกยกเลิกแล้ว กรุณาติดต่อ DCC');
  const distRef = doc(db, 'dcs_distributions', distribution.id);
  const departmentPaths = distribution.departmentFileLists?.[dept] || (distribution.departmentFiles?.[dept] ? [distribution.departmentFiles[dept]] : []);
  if (!departmentPaths.length || distribution.stampStatus !== 'COMPLETED') throw new Error('ไฟล์ Controlled Copy ของหน่วยงานยังไม่พร้อม กรุณาติดต่อ DCC');

  const withTimeout = async <T,>(task: Promise<T>, milliseconds: number, message: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        task,
        new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const controlledFiles: Blob[] = [];
  for (let index = 0; index < departmentPaths.length; index += 1) {
    onProgress?.(`กำลังเตรียมไฟล์ ${index + 1}/${departmentPaths.length}`, 5 + Math.round(((index + 1) / departmentPaths.length) * 60));
    controlledFiles.push(await withTimeout(
      getBlob(ref(storage, departmentPaths[index])),
      120000,
      `ดาวน์โหลดไฟล์ที่ ${index + 1} ใช้เวลานานเกินไป กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่`,
    ));
  }

  onProgress?.('กำลังจัดเก็บลายเซ็นผู้รับเอกสาร', 75);
  const signaturePath = `dcs/signatures/${user.uid}/${distribution.id}/${Date.now()}.png`;
  const normalizedSignature = await normalizeSignatureDataUrl(person.signatureDataUrl);
  await withTimeout(
    uploadBytes(ref(storage, signaturePath), await dataUrlBlob(normalizedSignature), { contentType: 'image/png' }),
    60000,
    'อัปโหลดลายเซ็นใช้เวลานานเกินไป กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
  );

  onProgress?.('กำลังบันทึกหลักฐานการรับเอกสาร', 90);
  try {
    await withTimeout(runTransaction(db, async tx => {
      const snapshot = await tx.get(distRef);
      const current = snapshot.data() as DistributionRecord & { receipts?: Record<string, any> };
      if (!current) throw new Error('ไม่พบรายการแจกจ่าย');
      if (current.status === 'CANCELLED') throw new Error('รายการแจกจ่ายนี้ถูกยกเลิกแล้ว กรุณาติดต่อ DCC');
      if (!current.targetDepartments.includes(dept)) throw new Error('หน่วยงานนี้ไม่อยู่ในรายชื่อแจกจ่าย');
      if (Date.now() > new Date(current.expirationDate).getTime()) throw new Error('สิทธิ์ดาวน์โหลดหมดอายุ กรุณาขอไฟล์ใหม่จาก DCC');
      if (current.receipts?.[dept]?.downloadedAt) throw new Error('หน่วยงานนี้ดาวน์โหลดฉบับนี้ไปแล้ว');
      const receipt = { dept, receivedCopies: current.allocationByDepartment[dept], downloadedAt: new Date().toISOString(), downloaderName: person.name, downloaderEmpId: person.empId, downloaderPosition: person.position, signatureStoragePath: signaturePath };
      const receipts = { ...(current.receipts || {}), [dept]: receipt };
      const allDownloaded = current.targetDepartments.every(targetDept => Boolean(receipts[targetDept]?.downloadedAt));
      tx.update(distRef, clean({ receipts, status: allDownloaded ? 'COMPLETED' : 'IN_PROGRESS', allDownloadedAt: allDownloaded ? new Date().toISOString() : null, storageStatus: allDownloaded ? 'PURGE_PENDING' : 'AVAILABLE', updatedAt: new Date().toISOString() }));
    }), 60000, 'บันทึกหลักฐานใช้เวลานานเกินไป กรุณาลองใหม่');
  } catch (error) {
    await deleteObject(ref(storage, signaturePath)).catch(() => undefined);
    throw error;
  }
  onProgress?.('บันทึกสำเร็จ กรุณากดดาวน์โหลดไฟล์ด้านล่าง', 100);
  await writeAudit(user, 'CONTROLLED_COPY_DOWNLOADED', distribution.docNo, distribution.revision, `หน่วยงาน ${dept} รับและเตรียมดาวน์โหลด Controlled Copy จำนวน ${controlledFiles.length} ไฟล์`, { distributionNo: distribution.distributionNo, fileCount: controlledFiles.length });
  return controlledFiles.map(file => URL.createObjectURL(file));
};

export const createCopyRequestRecord = async (user: CurrentUserSession, distribution: DistributionRecord, dept: Department, requestedBy: string, empId: string, reasonType: CopyReRequest['reasonType'], reasonDetails: string) => {
  if (user.currentDept !== dept) throw new Error('ไม่มีสิทธิ์ยื่นคำขอแทนหน่วยงานอื่น');
  const seq = await nextNumber('request');
  const id = `REQ-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;
  const record: CopyReRequest & { createdAt: string } = { id, distributionId: distribution.id, distributionNo: distribution.distributionNo, docNo: distribution.docNo, docNameTh: distribution.docNameTh, revision: distribution.revision, dept, requestedBy, empId, reasonType, reasonDetails, requestDate: new Date().toISOString(), createdAt: new Date().toISOString(), status: 'PENDING' };
  await setDoc(doc(db, 'dcs_copy_requests', id), clean(record));
  await writeAudit(user, 'COPY_RE_REQUESTED', record.docNo, record.revision, `ยื่นคำขอไฟล์ใหม่ ${id}`, { distributionNo: record.distributionNo, dept });
};

export const decideCopyRequest = async (user: CurrentUserSession, request: CopyReRequest, approve: boolean, note: string, file?: { name: string; size: string; type: string; dataUrl: string }) => {
  if (user.userRole !== 'DCC_ADMIN') throw new Error('เฉพาะ DCC เท่านั้นที่พิจารณาคำขอได้');
  let reissuedDistributionId = '';
  if (approve) {
    if (!file?.dataUrl) throw new Error('กรุณาอัปโหลดไฟล์ Controlled Copy ฉบับใหม่ก่อนอนุมัติ');
    const oldSnap = await getDoc(doc(db, 'dcs_distributions', request.distributionId));
    if (!oldSnap.exists()) throw new Error('ไม่พบรายการแจกจ่ายต้นทาง');
    const old = oldSnap.data() as DistributionRecord;
    const seq = await nextNumber('distribution');
    const id = `DC-DIS-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) throw new Error('ไฟล์ Controlled Copy ต้องเป็น PDF เท่านั้น');
    const path = `dcs/distributions/${id}/source/${safeName(file.name)}`;
    await uploadBytes(ref(storage, path), await dataUrlBlob(file.dataUrl), { contentType: 'application/pdf' });
    const copies = old.allocationByDepartment?.[request.dept] || 1;
    const now = new Date();
    const reissued = clean({ ...old, id, distributionNo: id, distributedBy: user.userName, distributedDate: now.toISOString(), expirationDate: new Date(now.getTime() + 3 * DAY_MS).toISOString(), expirationEpoch: now.getTime() + 3 * DAY_MS, status: 'IN_PROGRESS', targetDepartments: [request.dept], allocationByDepartment: { [request.dept]: copies }, targets: [{ dept: request.dept, allocatedCopies: copies, copyNo: `${copies} สำเนา`, isDownloaded: false, downloadTimestamp: null, downloaderName: null, downloaderEmpId: null, downloaderPosition: null, signatureDataUrl: null, status: 'PENDING' }], receipts: {}, departmentFiles: {}, departmentFileKeys: {}, fileName: file.name, fileSize: file.size, fileType: 'application/pdf', fileStoragePath: null, sourceStoragePath: path, stampStatus: 'PROCESSING', storageStatus: 'PROCESSING', allDownloadedAt: null, fileDeletedAt: null, reissueOf: old.id, createdAt: now.toISOString(), updatedAt: now.toISOString() });
    await setDoc(doc(db, 'dcs_distributions', id), { ...reissued, expirationAt: Timestamp.fromMillis(now.getTime() + 3 * DAY_MS) });
    await httpsCallable(firebaseFunctions, 'stampControlledCopies')({ distributionId: id });
    reissuedDistributionId = id;
  }
  await updateDoc(doc(db, 'dcs_copy_requests', request.id), clean({ status: approve ? 'APPROVED' : 'REJECTED', dccDecisionBy: user.userName, dccDecisionDate: new Date().toISOString(), dccDecisionNote: note, reissuedDistributionId, updatedAt: new Date().toISOString() }));
  await writeAudit(user, 'RE_REQUEST_APPROVED', request.docNo, request.revision, `${approve ? 'อนุมัติ' : 'ปฏิเสธ'}คำขอ ${request.id}`, { note });
};

export const getStorageFileUrl = async (path: string) => getDownloadURL(ref(storage, path));

export const saveDistributionSheetRecord = async (
  user: CurrentUserSession,
  distribution: DistributionRecord,
  receiveRevision: string,
  returnRevision: string,
  rows: Array<{ id: string; dept?: string; position: string; copies: string; returnDate: string; returnSignerName?: string; returnSignature?: string; returnSignatureStoragePath?: string }>,
) => {
  if (user.userRole !== 'DCC_ADMIN') throw new Error('เฉพาะ DCC เท่านั้นที่บันทึกใบแจกจ่าย-เรียกคืนได้');
  if (!rows.length || rows.some(row => !row.position.trim() || !Number.isInteger(Number(row.copies)) || Number(row.copies) < 1)) throw new Error('กรุณาระบุตำแหน่งผู้ถือครองและจำนวนสำเนาเป็นจำนวนเต็มอย่างน้อย 1');
  if (rows.some(row => Boolean(row.returnDate) !== Boolean(row.returnSignature || row.returnSignatureStoragePath))) throw new Error('ข้อมูลเรียกคืนต้องมีลายเซ็นและวันที่คืนให้ครบทั้งสองรายการ');
  const storedRows = await Promise.all(rows.map(async row => {
    let returnSignatureStoragePath = row.returnSignatureStoragePath || distribution.distributionSheet?.rows.find(item => item.dept === row.dept && item.position === row.position)?.returnSignatureStoragePath;
    if (row.returnSignature?.startsWith('data:')) {
      returnSignatureStoragePath = `dcs/distribution-sheet-signatures/${user.uid}/${distribution.id}/${safeName(row.id)}.png`;
      await uploadBytes(ref(storage, returnSignatureStoragePath), await dataUrlBlob(row.returnSignature), { contentType: 'image/png' });
    }
    return clean({ dept: row.dept, position: row.position, copies: row.copies, returnDate: row.returnDate || '', returnSignerName: row.returnSignerName || '', returnSignatureStoragePath: returnSignatureStoragePath || '' });
  }));
  const retainedPaths = new Set(storedRows.map(row => row.returnSignatureStoragePath).filter(Boolean));
  const removedPaths = (distribution.distributionSheet?.rows || []).map(row => row.returnSignatureStoragePath).filter((path): path is string => Boolean(path) && !retainedPaths.has(path));
  await Promise.all(removedPaths.map(path => deleteObject(ref(storage, path)).catch(() => undefined)));
  const updatedAt = new Date().toISOString();
  await updateDoc(doc(db, 'dcs_distributions', distribution.id), clean({ distributionSheet: { receiveRevision, returnRevision, rows: storedRows, updatedAt, updatedBy: user.userName }, updatedAt }));
  await writeAudit(user, 'SIGNATURE_CAPTURED', distribution.docNo, distribution.revision, `บันทึกใบแจกจ่าย-เรียกคืน ${distribution.distributionNo}`, { distributionNo: distribution.distributionNo });
};

export const saveMasterDocument = async (user: CurrentUserSession, input: Omit<MasterDocument, 'id' | 'createdAt' | 'updatedAt' | 'revisionHistory'>) => {
  if (user.userRole !== 'DCC_ADMIN') throw new Error('เฉพาะ DCC เท่านั้นที่แก้ไข Master List ได้');
  const id = documentKey(input.docNo);
  const now = new Date().toISOString();
  const record: MasterDocument = clean({ ...input, id, createdAt: now, updatedAt: now, revisionHistory: [{ rev: input.currentRevision, effectiveDate: input.effectiveDate, darNo: input.darReferenceId, reason: 'ขึ้นทะเบียนโดย DCC', registeredBy: user.userName, registeredDate: now.slice(0, 10), status: 'ACTIVE', controlledDriveLink: input.controlledDriveLink || '' }] });
  await setDoc(doc(db, 'dcs_documents', id), record);
  await writeAudit(user, 'DOCUMENT_REGISTERED', record.docNo, record.currentRevision, 'ขึ้นทะเบียนเอกสารโดย DCC');
};

export const reviseMasterDocument = async (user: CurrentUserSession, master: MasterDocument, newRev: string, effectiveDate: string, darNo: string, reason: string, driveLink: string) => {
  if (user.userRole !== 'DCC_ADMIN') throw new Error('เฉพาะ DCC เท่านั้นที่แก้ไข Master List ได้');
  const history = [...master.revisionHistory.map(item => ({ ...item, status: 'SUPERSEDED' as const })), { rev: newRev, effectiveDate, darNo, reason, registeredBy: user.userName, registeredDate: new Date().toISOString().slice(0, 10), status: 'ACTIVE' as const, controlledDriveLink: driveLink }];
  await updateDoc(doc(db, 'dcs_documents', master.id), clean({ currentRevision: newRev, effectiveDate, controlledDriveLink: driveLink, revisionHistory: history, updatedAt: new Date().toISOString() }));
  if (master.currentFileStoragePath && master.currentRevision !== newRev) {
    await httpsCallable(firebaseFunctions, 'cancelPreviousRevision')({ docId: master.id, previousPath: master.currentFileStoragePath, previousRevision: master.currentRevision, newRevision: newRev });
  }
};
