import type { DarRecord, MasterDocument } from '../types';
import { getMasterRevisionHistory, revisionKey } from './masterRevisions';

export const masterDocumentKey = (docNo: string) => encodeURIComponent(docNo.trim().toUpperCase()).replace(/%/g, '_');

// A DAR has one approval and one distribution set, but each row is a distinct document.
export function getDarMasterRows(dar: DarRecord) {
  const rows = [
    { docNo: dar.docNo, docNameTh: dar.docNameTh, docNameEn: dar.docNameEn, revision: dar.proposedRevision || dar.currentRevision || '00', reason: dar.reasonForChange, previousEffectiveDate: dar.previousEffectiveDate },
    ...(dar.additionalDocuments || []).map(row => ({ ...row, docNameEn: row.docNameEn || '' })),
  ];
  if (rows.length > 6) throw new Error('ใบ DAR มีรายการเอกสารเกิน 6 รายการ');
  const keys = new Set<string>();
  return rows.map((row, index) => {
    const docNo = String(row.docNo || '').trim().toUpperCase();
    const docNameTh = String(row.docNameTh || '').trim();
    const revision = String(row.revision || '').trim();
    const reason = String(row.reason || '').trim();
    if (!docNo || !docNameTh || !revision || !reason) throw new Error(`รายการที่ ${index + 1} กรอกรหัส ชื่อ Revision และเหตุผลให้ครบ`);
    const key = masterDocumentKey(docNo);
    if (keys.has(key)) throw new Error(`รหัสเอกสาร ${docNo} ซ้ำในใบ DAR`);
    keys.add(key);
    return { ...row, docNo, docNameTh, docNameEn: String(row.docNameEn || '').trim(), revision, reason, key };
  });
}

// Recovery deliberately creates only missing rows for a NEW DAR whose original
// Master is still linked to it. Existing records are never changed or replaced.
export function planDarMasterRegistration(
  dar: DarRecord, previousById: Record<string, MasterDocument | undefined>,
  actor: string, now: string, mode: 'register' | 'recover',
) {
  const rows = getDarMasterRows(dar);
  const primaryId = rows[0].key;
  if (mode === 'register' && dar.status !== 'APPROVED') throw new Error('สถานะ DAR เปลี่ยน กรุณารีเฟรชและตรวจสอบใหม่');
  if (mode === 'recover' && (dar.status !== 'REGISTERED' || dar.requestType !== 'NEW' || previousById[primaryId]?.darReferenceId !== dar.id || previousById[primaryId]?.status !== 'ACTIVE' || revisionKey(previousById[primaryId]?.currentRevision || '') !== revisionKey(rows[0].revision))) {
    throw new Error('ไม่สามารถเติมรายการอัตโนมัติได้: กรุณาตรวจสอบสถานะ DAR และเอกสารหลัก');
  }
  const today = now.slice(0, 10);
  const reviewDueDate = new Date(Date.parse(now) + 365 * 86400000).toISOString().slice(0, 10);
  const distributionDepartments = (dar.distributionHolders || []).filter(x => x.checked).map(x => ({ dept: x.dept, copies: Math.max(1, Number(x.copies) || 1), position: x.position }));
  const records: MasterDocument[] = [];
  const conflicts: string[] = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const previous = previousById[row.key];
    if (mode === 'recover' && (index === 0 || previous)) {
      if (index && previous && previous.darReferenceId !== dar.id) conflicts.push(row.docNo);
      continue;
    }
    if (mode === 'register' && dar.requestType === 'NEW' && previous && previous.darReferenceId !== dar.id) throw new Error(`รหัส ${row.docNo} มีใน Master List แล้ว กรุณาตรวจสอบก่อนขึ้นทะเบียน`);
    if (mode === 'register' && index > 0 && dar.requestType !== 'NEW' && !previous) throw new Error(`ไม่พบ ${row.docNo} ใน Master List กรุณาตรวจสอบเอกสารเดิมก่อนขึ้นทะเบียน`);
    if (mode === 'register' && index > 0 && dar.requestType === 'REVISION' && previous) {
      const oldRev = revisionKey(previous.currentRevision);
      const newRev = revisionKey(row.revision);
      if (previous.status !== 'ACTIVE') throw new Error(`${row.docNo}: เอกสารเดิมไม่ได้อยู่ในสถานะ Active`);
      if (!oldRev || !newRev || oldRev === newRev || (/^\d+$/.test(oldRev) && /^\d+$/.test(newRev) && Number(newRev) <= Number(oldRev))) throw new Error(`${row.docNo}: Rev. ที่เสนอต้องใหม่กว่า Rev. ปัจจุบันใน Master List`);
      if (previous.effectiveDate && row.previousEffectiveDate && previous.effectiveDate !== row.previousEffectiveDate) throw new Error(`${row.docNo}: วันที่เอกสารเดิมไม่ตรงกับ Master List กรุณาตรวจสอบ`);
    }
    const revision = row.revision;
    const history = previous ? getMasterRevisionHistory(previous) : [];
    const next: MasterDocument = {
      ...(previous || {}), id: row.key, docNo: row.docNo, docNameTh: row.docNameTh,
      docNameEn: row.docNameEn, docType: index > 0 && previous ? previous.docType : dar.docType, ownerDept: dar.requestDept,
      currentRevision: revision, effectiveDate: dar.targetEffectiveDate || today,
      reviewDueDate, status: dar.requestType === 'OBSOLETE' ? 'OBSOLETE' : 'ACTIVE',
      darReferenceId: dar.id, createdAt: previous?.createdAt || now, updatedAt: now,
      retentionPeriodYears: previous?.retentionPeriodYears || 5, distributionDepartments,
      ...(index > 0 ? { distributionSetDocId: primaryId } : {}),
      revisionHistory: [
        ...history.filter(item => revisionKey(item.rev) !== revisionKey(revision)).map(item => ({ ...item, status: 'SUPERSEDED' as const })),
        { rev: revision, effectiveDate: dar.targetEffectiveDate || today, darNo: dar.id, reason: row.reason, registeredBy: actor, registeredDate: today, status: dar.requestType === 'OBSOLETE' ? 'OBSOLETE' : 'ACTIVE', controlledDriveLink: '' },
      ],
    };
    if (index > 0) {
      // Files are attached to the entire DAR, not mapped to individual rows.
      // Do not present a previous or first-row PDF as this specific document.
      const previousPaths = previous?.currentFileStoragePaths?.length ? previous.currentFileStoragePaths : previous?.currentFileStoragePath ? [previous.currentFileStoragePath] : [];
      if (previous && previousPaths.length) next.previousRevisionSourceFiles = { ...previous.previousRevisionSourceFiles, [previous.currentRevision]: previousPaths };
      delete next.currentFileStoragePath; delete next.currentFileStoragePaths;
      delete next.fileName; delete next.fileSize; delete next.fileType;
      delete next.fileNames; delete next.fileSizes; delete next.fileTypes; delete next.fileDataUrl;
    } else {
      delete next.distributionSetDocId;
      const files = dar.attachments?.length ? dar.attachments : (dar.attachmentStoragePath ? [{ name: dar.attachmentFileName || 'document.pdf', size: dar.attachmentFileSize || '', type: dar.attachmentFileType || 'application/pdf', storagePath: dar.attachmentStoragePath }] : []);
      next.fileName = dar.attachmentFileName;
      next.fileSize = dar.attachmentFileSize;
      next.fileType = dar.attachmentFileType;
      next.fileNames = files.map(file => file.name);
      next.fileSizes = files.map(file => file.size);
      next.fileTypes = files.map(file => file.type);
    }
    next.revisionHistory = getMasterRevisionHistory(next, {
      ...dar, status: 'REGISTERED', docNo: row.docNo, proposedRevision: revision,
      currentRevision: index === 0 ? dar.currentRevision : previous?.currentRevision || 'N/A',
      previousEffectiveDate: row.previousEffectiveDate, reasonForChange: row.reason,
    });
    records.push(next);
  }
  return { records, conflicts, primaryId };
}
