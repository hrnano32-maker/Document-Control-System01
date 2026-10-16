import type { DistributionRecord, DistributionReceipt } from '../types';

export function getDarDistributionGroup(selected: DistributionRecord, distributions: DistributionRecord[]): DistributionRecord[] {
  const byId = new Map(distributions.map(item => [item.id, item]));
  if (!byId.has(selected.id)) byId.set(selected.id, selected);
  const current = byId.get(selected.id)!;
  const reference = (record: DistributionRecord, seen = new Set<string>()): string => {
    if (seen.has(record.id)) return '';
    seen.add(record.id);
    if (record.darReferenceId?.trim()) return record.darReferenceId.trim().toUpperCase();
    const parent = record.reissueOf && byId.get(record.reissueOf);
    return parent ? reference(parent, seen) : '';
  };
  const darId = reference(current);
  // A missing DAR or a cancelled historical record must never combine unrelated work.
  if (!darId || current.status === 'CANCELLED') return [current];
  return [...byId.values()].filter(record => record.status !== 'CANCELLED' && reference(record) === darId)
    .sort((a, b) => (a.distributedDate || '').localeCompare(b.distributedDate || '') || a.id.localeCompare(b.id));
}

export interface CombinedSheetRow {
  key: string;
  department: string;
  recordIds: string[];
  documentIndexes: number[];
  copies: number;
  receipt?: DistributionReceipt;
  returnDate: string;
  returnSignerName: string;
  returnSignatureStoragePath: string;
}

const departmentKey = (dept: string) => ['QA', 'QC', 'QA/QC'].includes(dept.trim().toUpperCase()) ? 'QA/QC' : dept;

export function buildCombinedDistributionRows(records: DistributionRecord[]): CombinedSheetRow[] {
  const rows = new Map<string, CombinedSheetRow>();
  records.forEach((record, index) => {
    const departments = [...new Set([...(record.targetDepartments || []), ...(record.targets || []).map(target => target.dept)])];
    departments.forEach(dept => {
      if (record.departmentCancellations?.[dept]) return;
      const target = record.targets?.find(item => item.dept === dept);
      const receipt = record.receipts?.[dept];
      const saved = record.distributionSheet?.rows.find(row => row.dept === dept);
      const department = departmentKey(dept);
      const copies = receipt?.receivedCopies || record.allocationByDepartment?.[dept] || target?.allocatedCopies || 1;
      const returnDate = saved?.returnDate || '';
      const returnSignerName = saved?.returnSignerName || '';
      const returnSignatureStoragePath = saved?.returnSignatureStoragePath || '';
      // Only identical evidence may share a row. Different signatures/dates stay
      // separate with their covered document numbers; no receipt is invented.
      const key = JSON.stringify([department, copies, receipt?.downloadedAt || '', receipt?.signatureStoragePath || '', receipt?.downloaderUid || '', receipt?.downloaderName || '', returnDate, returnSignerName, returnSignatureStoragePath]);
      const existing = rows.get(key);
      if (existing) {
        if (!existing.recordIds.includes(record.id)) existing.recordIds.push(record.id);
        if (!existing.documentIndexes.includes(index + 1)) existing.documentIndexes.push(index + 1);
      } else {
        rows.set(key, { key, department, copies, receipt, recordIds: [record.id], documentIndexes: [index + 1], returnDate, returnSignerName, returnSignatureStoragePath });
      }
    });
  });
  return [...rows.values()];
}

export function isCombinedSheetComplete(records: DistributionRecord[]): boolean {
  return records.length > 0 && records.every(record => {
    const departments = [...new Set([...(record.targetDepartments || []), ...(record.targets || []).map(target => target.dept)])]
      .filter(dept => !record.departmentCancellations?.[dept]);
    return record.status !== 'CANCELLED' && departments.length > 0 && departments.every(dept => Boolean(record.receipts?.[dept]?.downloadedAt));
  });
}
