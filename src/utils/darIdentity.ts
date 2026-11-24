import type { DarRecord, MasterDocument } from '../types';
import { canonicalDistributionDepartment } from './distributionReopen';

type IdentityRow = Pick<DarRecord, 'docNo' | 'docNameTh'> & { docNameEn?: string };
export type DarIdentity = IdentityRow & Pick<DarRecord, 'requestType' | 'requestDept' | 'additionalDocuments'>;
export const numberText = (s: string) => String(s || '').trim().toUpperCase();
const norm = (s?: string) => (s || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '');
const similar = (a: string, b: string) => {
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 6) return false;
  if ((a.includes(b) || b.includes(a)) && Math.min(a.length, b.length) / Math.max(a.length, b.length) >= .55) return true;
  const pairs = (v: string) => new Set(Array.from({ length: v.length - 1 }, (_, i) => v.slice(i, i + 2)));
  const x = pairs(a), y = pairs(b);
  return 2 * [...x].filter(pair => y.has(pair)).length / (x.size + y.size) >= .76;
};

export const isOwnedActiveMaster = (master: MasterDocument, dept: string) =>
  master.status === 'ACTIVE' && !master.supersededByDocumentId && canonicalDistributionDepartment(master.ownerDept) === canonicalDistributionDepartment(dept);

export const assertExistingDarMaster = (row: IdentityRow, dept: string, master?: MasterDocument) => {
  if (!master || numberText(master.docNo) !== numberText(row.docNo)) throw new Error(`ไม่พบ ${row.docNo} ใน Master List: การแก้ไขหรือยกเลิกต้องใช้รหัสเอกสารเดิม ห้ามเปลี่ยนหมายเลข`);
  if (!isOwnedActiveMaster(master, dept)) throw new Error(`${row.docNo}: ต้องเลือกเอกสารที่ยังใช้งานของหน่วยงานผู้ขอ`);
};

// Similarity only prompts a human review. It never chooses or merges a Master.
export function identityWarnings(dar: DarIdentity, catalog: MasterDocument[]): string[] {
  const messages: string[] = [];
  for (const [index, row] of [dar, ...(dar.additionalDocuments || [])].entries()) {
    if (!row.docNo.trim()) continue;
    const prefix = `รายการที่ ${index + 1} · ${row.docNo}`;
    if (dar.requestType !== 'NEW') {
      const prior = catalog.find(doc => numberText(doc.docNo) === numberText(row.docNo));
      if (prior && (row.docNameTh.trim() !== prior.docNameTh.trim() || (row.docNameEn || '').trim() !== (prior.docNameEn || '').trim()))
        messages.push(`${prefix}: เอกสารก่อนหน้าคือฉบับนี้ใช่หรือไม่?\nเดิม: ${[prior.docNameTh, prior.docNameEn].filter(Boolean).join(' / ')} (Rev.${prior.currentRevision})\nเสนอ: ${[row.docNameTh, row.docNameEn].filter(Boolean).join(' / ')} · ใช้รหัสเดิม ${prior.docNo}`);
    } else {
      const names = [norm(row.docNameTh), norm(row.docNameEn)].filter(Boolean);
      const candidates = catalog.filter(doc => numberText(doc.docNo) !== numberText(row.docNo) &&
        (norm(doc.docNo) === norm(row.docNo) || names.some(name => [norm(doc.docNameTh), norm(doc.docNameEn)].some(other => similar(name, other)))));
      if (candidates.length) messages.push(`${prefix}: เป็นเอกสารเดิมในรายการนี้หรือไม่?\n${candidates.slice(0,5).map(doc => `${doc.docNo} · ${doc.docNameTh} (Rev.${doc.currentRevision}, ${doc.ownerDept})`).join('\n')}${candidates.length > 5 ? `\nและอีก ${candidates.length - 5} รายการ` : ''}`);
    }
  }
  return messages;
}
