import { collection, doc, runTransaction, type Transaction } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { CurrentUserSession, DarRecord, MasterDocument } from '../types';
import { getMasterRevisionHistory, hasMissingRevisionDates, isCalendarDate, revisionKey, validateMasterRevisionDates } from '../utils/masterRevisions';

function requireDcc(user: CurrentUserSession) {
  if (user.userRole !== 'DCC_ADMIN' || !auth.currentUser || auth.currentUser.uid !== user.uid) {
    throw new Error('เฉพาะ DCC ที่เข้าสู่ระบบเท่านั้นที่แก้ไขวันที่ Master List ได้');
  }
}

const dateSnapshot = (master: MasterDocument) => ({
  currentRevision: revisionKey(master.currentRevision),
  effectiveDate: master.effectiveDate,
  reviewDueDate: master.reviewDueDate || '',
  revisions: getMasterRevisionHistory(master).map(row => ({ rev: row.rev, effectiveDate: row.effectiveDate })),
});

function auditRecord(user: CurrentUserSession, master: MasterDocument, description: string, details: unknown) {
  const now = new Date().toISOString();
  return { timestamp: now, createdAt: now, actor: user.userName, actorUid: user.uid, actorDept: user.currentDept,
    actionType: 'MASTER_LIST_UPDATED', docNo: master.docNo, revision: master.currentRevision, description, details };
}

async function readDateSources(tx: Transaction, master: MasterDocument) {
  const [dar, previous] = await Promise.all([
    master.darReferenceId ? tx.get(doc(db, 'dcs_dars', master.darReferenceId)) : null,
    master.previousDocumentId && master.previousDocumentId !== master.id
      ? tx.get(doc(db, 'dcs_documents', master.previousDocumentId)) : null,
  ]);
  return {
    dar: dar?.exists() ? { ...dar.data(), id: master.darReferenceId } as DarRecord : undefined,
    previous: previous?.exists() ? { ...previous.data(), id: master.previousDocumentId } as MasterDocument : undefined,
  };
}

// Runs only for missing entries when DCC opens Master List. Read the linked DAR
// inside the transaction; do not persist stale client fallback or replace corrected dates.
export async function restoreMasterRevisionDates(user: CurrentUserSession, id: string) {
  requireDcc(user);
  const masterRef = doc(db, 'dcs_documents', id);
  return runTransaction(db, async tx => {
    const snapshot = await tx.get(masterRef);
    if (!snapshot.exists()) return false;
    const master = snapshot.data() as MasterDocument;
    const { dar, previous } = await readDateSources(tx, master);
    if (!hasMissingRevisionDates(master, dar, previous)) return false;
    const revisionHistory = getMasterRevisionHistory(master, dar, previous);
    const auditRef = doc(collection(db, 'dcs_audit_logs'));
    tx.update(masterRef, { revisionHistory, updatedAt: new Date().toISOString() });
    tx.set(auditRef, { id: auditRef.id, ...auditRecord(user, master, 'เติมวันที่ประวัติ Revision จากหลักฐานทะเบียนและใบ DAR', { masterId: id, darId: master.darReferenceId, before: master.revisionHistory || [], after: revisionHistory }) });
    return true;
  });
}

export async function correctMasterRevisionDates(
  user: CurrentUserSession, opened: MasterDocument,
  dates: Record<string, string>, reviewDueDate: string, reason: string,
): Promise<MasterDocument> {
  requireDcc(user);
  if (!reason.trim()) throw new Error('กรุณาระบุเหตุผลการแก้ไขวันที่');
  const masterRef = doc(db, 'dcs_documents', opened.id);
  return runTransaction(db, async tx => {
    const snapshot = await tx.get(masterRef);
    if (!snapshot.exists()) throw new Error('ไม่พบเอกสารใน Master List');
    const current = snapshot.data() as MasterDocument;
    const { dar, previous } = await readDateSources(tx, current);
    const history = getMasterRevisionHistory(current, dar, previous);
    const resolved = { ...current, revisionHistory: history };
    if (JSON.stringify(dateSnapshot(resolved)) !== JSON.stringify(dateSnapshot(opened))) {
      throw new Error('วันที่หรือ Revision เปลี่ยนระหว่างแก้ไข กรุณาปิดแล้วเปิดหน้าต่างแก้ไขใหม่');
    }
    const allowed = new Set(history.map(row => row.rev));
    if (Object.keys(dates).some(key => !allowed.has(key))) throw new Error('แก้ไขได้เฉพาะวันที่ของ Revision ที่มีอยู่แล้ว');
    const revisionHistory = history.map(row => {
      const value = dates[row.rev] ?? row.effectiveDate;
      if (value !== row.effectiveDate && !isCalendarDate(value)) throw new Error(`กรุณาระบุวันที่ Rev.${row.rev} ให้ถูกต้อง`);
      return { ...row, effectiveDate: value };
    });
    if (reviewDueDate !== (current.reviewDueDate || '') && !isCalendarDate(reviewDueDate)) throw new Error('กรุณาระบุวันครบกำหนดทบทวนให้ถูกต้อง');
    validateMasterRevisionDates(revisionHistory, reviewDueDate, current.currentRevision);
    const effectiveDate = revisionHistory.find(row => row.rev === revisionKey(current.currentRevision))?.effectiveDate || current.effectiveDate;
    const next = { ...current, effectiveDate, reviewDueDate, revisionHistory, updatedAt: new Date().toISOString() };
    if (JSON.stringify(dateSnapshot(next)) === JSON.stringify(dateSnapshot(resolved)) && !hasMissingRevisionDates(current, dar, previous)) return resolved;
    const auditRef = doc(collection(db, 'dcs_audit_logs'));
    tx.update(masterRef, { effectiveDate, reviewDueDate, revisionHistory, updatedAt: next.updatedAt });
    tx.set(auditRef, { id: auditRef.id, ...auditRecord(user, current, 'DCC แก้ไขวันที่ Master List', { masterId: current.id, reason: reason.trim(), before: dateSnapshot(resolved), after: dateSnapshot(next) }) });
    return next;
  });
}
