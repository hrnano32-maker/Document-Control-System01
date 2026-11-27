import type { DarRecord, MasterDocument, RevisionHistoryItem } from '../types';

export const revisionKey = (value: string) => {
  const text = String(value || '').trim().replace(/^rev\.?\s*/i, '');
  if (!text || /^(?:n\/a|-)$/i.test(text)) return '';
  return /^\d+$/.test(text) ? String(Number(text)).padStart(2, '0') : text.toUpperCase();
};

export const isCalendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const compareRevisions = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });

const codeKey = (value?: string) => (value || '').trim().toUpperCase();

function registeredRow(master: MasterDocument, dar?: DarRecord) {
  if (!dar || dar.status !== 'REGISTERED' || dar.id !== master.darReferenceId) return;
  const rows = [
    { docNo: dar.docNo, revision: dar.proposedRevision || dar.currentRevision, currentRevision: dar.currentRevision, previousEffectiveDate: dar.previousEffectiveDate, reason: dar.reasonForChange },
    ...(dar.additionalDocuments || []),
  ].filter(row => codeKey(row.docNo) === codeKey(master.docNo));
  if (rows.length === 1 && revisionKey(rows[0].revision) === revisionKey(master.currentRevision)) return rows[0];
}

// Old releases registered renumberings with reciprocal IDs and the DAR ID on
// both Masters. A shared DAR, attachment set, document name or row order is
// never evidence that a second document is an earlier revision of this one.
function isPredecessor(master: MasterDocument, old: MasterDocument): boolean {
  return !!master.id && !!old.id && old.id !== master.id && old.status === 'OBSOLETE'
    && master.previousDocumentId === old.id && old.supersededByDocumentId === master.id
    && !!master.renumberedByDarId && master.renumberedByDarId === old.renumberedByDarId
    && (!master.previousDocNo || codeKey(master.previousDocNo) === codeKey(old.docNo))
    && (!old.supersededByDocNo || codeKey(old.supersededByDocNo) === codeKey(master.docNo));
}

// Prefer a date already in this Master, then its verified predecessor,
// then this specific row of its registered DAR. Do not copy file access.
export function getMasterRevisionHistory(master: MasterDocument, dar?: DarRecord, previous?: MasterDocument): RevisionHistoryItem[] {
  const entries = new Map<string, RevisionHistoryItem>();
  for (const item of master.revisionHistory || []) {
    const key = revisionKey(item.rev);
    if (!key) continue;
    const existing = entries.get(key);
    if (!existing || (!existing.effectiveDate && item.effectiveDate)) entries.set(key, { ...item, rev: key });
  }
  const currentKey = revisionKey(master.currentRevision);
  const supplement = (rev: string | undefined, date: string | undefined, darNo: string, reason: string) => {
    const key = revisionKey(rev || '');
    if (!key || !date || !isCalendarDate(date)) return;
    const existing = entries.get(key);
    if (existing?.effectiveDate) return;
    entries.set(key, {
      rev: key, darNo, reason, registeredBy: '', registeredDate: '',
      status: key === currentKey ? (master.status === 'OBSOLETE' ? 'OBSOLETE' : 'ACTIVE') : 'SUPERSEDED',
      controlledDriveLink: '', ...existing, effectiveDate: date,
    });
  };
  supplement(master.currentRevision, master.effectiveDate, master.darReferenceId, 'วันที่ฉบับปัจจุบันใน Master List');
  if (previous && isPredecessor(master, previous)) {
    const currentDate = entries.get(currentKey)?.effectiveDate;
    for (const row of getMasterRevisionHistory(previous)) {
      if (row.rev === currentKey || (currentDate && row.effectiveDate >= currentDate)) continue;
      if (/^\d+$/.test(row.rev) && /^\d+$/.test(currentKey) && Number(row.rev) >= Number(currentKey)) continue;
      supplement(row.rev, row.effectiveDate, row.darNo || previous.darReferenceId, `วันที่ตาม Master List รหัสเดิม ${previous.docNo}`);
    }
  }
  const row = registeredRow(master, dar);
  if (dar && row) {
    supplement(row.revision, dar.targetEffectiveDate, dar.id, row.reason || 'วันที่ฉบับปัจจุบันจากใบ DAR');
    if (dar.requestType !== 'NEW' && revisionKey(row.currentRevision || '') !== currentKey) {
      supplement(row.currentRevision, row.previousEffectiveDate, dar.id, 'วันที่เอกสารเดิมจากใบ DAR');
    }
  }
  return [...entries.values()].sort((a, b) => compareRevisions(a.rev, b.rev));
}

export const hasMissingRevisionDates = (master: MasterDocument, dar?: DarRecord, previous?: MasterDocument) =>
  getMasterRevisionHistory(master, dar, previous).some(row => !(master.revisionHistory || [])
    .some(stored => revisionKey(stored.rev) === row.rev && stored.effectiveDate === row.effectiveDate));

// Rev.00 is the initial issue. All revisions belong to the same table, in order.
export function getMasterRevisionColumnGroups(documents: MasterDocument[]): string[][] {
  const keys = new Set(['00', '01', '02', '03', '04', '05']);
  for (const master of documents) for (const item of getMasterRevisionHistory(master)) keys.add(item.rev);
  return [[...keys].sort(compareRevisions)];
}

export function validateMasterRevisionDates(history: RevisionHistoryItem[], reviewDueDate: string, currentRevision: string) {
  for (const item of history) {
    if (item.effectiveDate && !isCalendarDate(item.effectiveDate)) throw new Error(`วันที่ Rev.${item.rev} ไม่ถูกต้อง`);
  }
  const dated = history.filter(item => /^\d+$/.test(item.rev) && item.effectiveDate)
    .sort((a, b) => Number(a.rev) - Number(b.rev));
  for (let index = 1; index < dated.length; index++) {
    if (dated[index - 1].effectiveDate >= dated[index].effectiveDate) {
      throw new Error(`วันที่ Rev.${dated[index - 1].rev} ต้องก่อนวันที่ Rev.${dated[index].rev}`);
    }
  }
  const current = history.find(item => item.rev === revisionKey(currentRevision));
  if (reviewDueDate && (!isCalendarDate(reviewDueDate) || (current?.effectiveDate && reviewDueDate < current.effectiveDate))) {
    throw new Error('วันครบกำหนดทบทวนต้องเป็นวันที่ถูกต้องและไม่ก่อนวันมีผลของฉบับปัจจุบัน');
  }
}
