import type { DarRecord, MasterDocument, DarDocumentLink } from '../types';
import { getMasterRevisionHistory, revisionKey } from './masterRevisions';

export const masterDocumentKey = (docNo: string) => encodeURIComponent(docNo.trim().toUpperCase()).replace(/%/g, '_');

// A DAR has one approval and one distribution set, but each row is a distinct document.
export function getDarMasterRows(dar: DarRecord) {
  const rows = [
    { docNo: dar.docNo, docNameTh: dar.docNameTh, docNameEn: dar.docNameEn, currentRevision: dar.currentRevision, revision: dar.proposedRevision || dar.currentRevision || '00', reason: dar.reasonForChange, previousEffectiveDate: dar.previousEffectiveDate },
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
  actor: string, now: string, mode: 'register' | 'recover', links: Record<string, string> = {},
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
  const superseded: MasterDocument[] = [];
  const linkedPreviousDocuments: DarDocumentLink[] = [];
  const usedSources = new Set<string>();
  const rowKeys = new Set(rows.map(row => row.key));
  if (Object.keys(links).some(key => !rowKeys.has(key))) throw new Error('รายการเชื่อมรหัสไม่ตรงกับใบ DAR กรุณาตรวจสอบใหม่');
  if (Object.keys(links).length && (mode !== 'register' || dar.requestType !== 'REVISION')) throw new Error('เชื่อมรหัสเดิมได้เฉพาะใบ DAR ขอแก้ไขเอกสาร');
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const sourceId = links[row.key];
    const renamed = Boolean(sourceId && sourceId !== row.key);
    if (sourceId && !renamed) throw new Error(`${row.docNo}: กรุณาเลือกรหัสเดิมที่แตกต่าง หรือไม่ต้องเชื่อมรหัส`);
    if (renamed && (rowKeys.has(sourceId) || usedSources.has(sourceId))) throw new Error(`${row.docNo}: รหัสเดิมถูกใช้ซ้ำในใบ DAR`);
    if (renamed && previousById[row.key]) throw new Error(`${row.docNo}: รหัสใหม่มีใน Master List แล้ว จึงเชื่อมทับไม่ได้`);
    const previous = previousById[renamed ? sourceId : row.key];
    if (renamed) {
      if (!previous || previous.id !== sourceId || previous.status !== 'ACTIVE' || previous.supersededByDocumentId) throw new Error(`${row.docNo}: ไม่พบรหัสเดิมที่ยัง Active กรุณาเลือกใหม่`);
      const dept = (value: string) => ['QA', 'QC', 'QA/QC'].includes(value) ? 'QA/QC' : value;
      if (dept(previous.ownerDept) !== dept(dar.requestDept)) throw new Error(`${row.docNo}: เอกสารเดิมเป็นของหน่วยงานอื่น กรุณาตรวจสอบ`);
      if (row.currentRevision && revisionKey(row.currentRevision) !== revisionKey(previous.currentRevision)) throw new Error(`${row.docNo}: Rev. เดิมไม่ตรงกับ Master List`);
      if (row.previousEffectiveDate && previous.effectiveDate && row.previousEffectiveDate !== previous.effectiveDate) throw new Error(`${row.docNo}: วันที่เอกสารเดิมไม่ตรงกับ Master List`);
      if (previous.effectiveDate && dar.targetEffectiveDate && previous.effectiveDate >= dar.targetEffectiveDate) throw new Error(`${row.docNo}: วันที่มีผลฉบับใหม่ต้องหลังวันที่ฉบับเดิม`);
      const anchorId = previous.distributionSetDocId || sourceId;
      const anchor = previousById[anchorId];
      if (!anchor) throw new Error(`${row.docNo}: ไม่พบเอกสารหลักของชุดแจกจ่ายเดิม กรุณาตรวจสอบ`);
      usedSources.add(sourceId);
      linkedPreviousDocuments.push({ newDocumentId: row.key, newDocNo: row.docNo, previousDocumentId: sourceId, previousDocNo: previous.docNo, previousRevision: previous.currentRevision, newRevision: row.revision, previousDarId: previous.darReferenceId || '', previousDistributionAnchorId: anchorId, previousAnchorRevision: anchor.currentRevision });
      superseded.push({ ...previous, status: 'OBSOLETE', supersededByDocumentId: row.key, supersededByDocNo: row.docNo, renumberedByDarId: dar.id, updatedAt: now });
    }
    if (mode === 'register' && Object.keys(links).length && dar.requestType === 'REVISION' && !previous) throw new Error(`${row.docNo}: ไม่พบเอกสารเดิม กรุณาเลือกรหัสเดิมสำหรับรายการนี้`);
    if (mode === 'recover' && (index === 0 || previous)) {
      if (index && previous && previous.darReferenceId !== dar.id) conflicts.push(row.docNo);
      continue;
    }
    if (mode === 'register' && dar.requestType === 'NEW' && previous && previous.darReferenceId !== dar.id) throw new Error(`รหัส ${row.docNo} มีใน Master List แล้ว กรุณาตรวจสอบก่อนขึ้นทะเบียน`);
    if (mode === 'register' && index > 0 && dar.requestType !== 'NEW' && !previous) throw new Error(`ไม่พบ ${row.docNo} ใน Master List กรุณาตรวจสอบเอกสารเดิมก่อนขึ้นทะเบียน`);
    if (mode === 'register' && index > 0 && dar.requestType !== 'NEW' && previous && row.currentRevision && revisionKey(row.currentRevision) !== revisionKey(previous.currentRevision)) {
      throw new Error(`${row.docNo}: Rev. เดิมไม่ตรงกับ Master List กรุณาตรวจสอบ`);
    }
    if (mode === 'register' && index > 0 && dar.requestType === 'REVISION' && previous && !renamed) {
      const oldRev = revisionKey(previous.currentRevision);
      const newRev = revisionKey(row.revision);
      if (previous.status !== 'ACTIVE') throw new Error(`${row.docNo}: เอกสารเดิมไม่ได้อยู่ในสถานะ Active`);
      if (!oldRev || !newRev || oldRev === newRev || (/^\d+$/.test(oldRev) && /^\d+$/.test(newRev) && Number(newRev) <= Number(oldRev))) throw new Error(`${row.docNo}: Rev. ที่เสนอต้องใหม่กว่า Rev. ปัจจุบันใน Master List`);
      if (previous.effectiveDate && row.previousEffectiveDate && previous.effectiveDate !== row.previousEffectiveDate) throw new Error(`${row.docNo}: วันที่เอกสารเดิมไม่ตรงกับ Master List กรุณาตรวจสอบ`);
    }
    const revision = row.revision;
    const history = previous && !renamed ? getMasterRevisionHistory(previous) : [];
    const next: MasterDocument = {
      ...(previous && !renamed ? previous : {}), id: row.key, docNo: row.docNo, docNameTh: row.docNameTh,
      docNameEn: row.docNameEn, docType: index > 0 && previous ? previous.docType : dar.docType, ownerDept: dar.requestDept,
      currentRevision: revision, effectiveDate: dar.targetEffectiveDate || today,
      reviewDueDate, status: dar.requestType === 'OBSOLETE' ? 'OBSOLETE' : 'ACTIVE',
      darReferenceId: dar.id, createdAt: previous?.createdAt || now, updatedAt: now,
      retentionPeriodYears: previous?.retentionPeriodYears || 5, distributionDepartments,
      ...(index > 0 ? { distributionSetDocId: primaryId } : {}),
      ...(renamed ? { previousDocumentId: sourceId, previousDocNo: previous!.docNo, renumberedByDarId: dar.id } : {}),
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
    next.revisionHistory = renamed ? getMasterRevisionHistory(next) : getMasterRevisionHistory(next, {
      ...dar, status: 'REGISTERED', docNo: row.docNo, proposedRevision: revision,
      currentRevision: index === 0 ? dar.currentRevision : row.currentRevision || previous?.currentRevision || 'N/A',
      previousEffectiveDate: row.previousEffectiveDate, reasonForChange: row.reason,
    });
    records.push(next);
  }
  return { records, conflicts, primaryId, superseded, linkedPreviousDocuments };
}
