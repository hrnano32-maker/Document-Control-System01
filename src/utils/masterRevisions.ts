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

// Existing Master List dates take precedence over DAR fallback, including DCC corrections.
// Only the DAR linked to this registered document may fill a missing history entry/date.
export function getMasterRevisionHistory(master: MasterDocument, dar?: DarRecord): RevisionHistoryItem[] {
  const entries = new Map<string, RevisionHistoryItem>();
  for (const item of master.revisionHistory || []) {
    const key = revisionKey(item.rev);
    if (!key) continue;
    const existing = entries.get(key);
    if (!existing || (!existing.effectiveDate && item.effectiveDate)) entries.set(key, { ...item, rev: key });
  }
  const currentKey = revisionKey(master.currentRevision);
  const supplement = (rev: string, date: string | undefined, sourceDar?: DarRecord) => {
    const key = revisionKey(rev);
    if (!key || !date || !isCalendarDate(date)) return;
    const existing = entries.get(key);
    if (existing?.effectiveDate) return;
    entries.set(key, {
      rev: key, darNo: sourceDar?.id || master.darReferenceId,
      reason: key === currentKey ? (sourceDar?.reasonForChange || 'วันที่ฉบับปัจจุบันใน Master List') : 'วันที่เอกสารเดิมจากใบ DAR',
      registeredBy: '', registeredDate: '',
      status: key === currentKey ? (master.status === 'OBSOLETE' ? 'OBSOLETE' : 'ACTIVE') : 'SUPERSEDED',
      controlledDriveLink: '', ...existing, effectiveDate: date,
    });
  };
  supplement(master.currentRevision, master.effectiveDate);
  if (dar?.id === master.darReferenceId && dar.status === 'REGISTERED'
      && dar.docNo.trim().toUpperCase() === master.docNo.trim().toUpperCase()
      && revisionKey(dar.proposedRevision || dar.currentRevision) === currentKey) {
    supplement(dar.proposedRevision || dar.currentRevision, dar.targetEffectiveDate, dar);
    if (dar.requestType !== 'NEW' && revisionKey(dar.currentRevision) !== currentKey) {
      supplement(dar.currentRevision, dar.previousEffectiveDate, dar);
    }
  }
  return [...entries.values()].sort((a, b) => compareRevisions(a.rev, b.rev));
}

export const hasMissingRevisionDates = (master: MasterDocument, dar?: DarRecord) =>
  getMasterRevisionHistory(master, dar).some(row => !(master.revisionHistory || [])
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
