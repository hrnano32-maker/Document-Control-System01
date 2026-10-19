import type { Department, DistributionRecord, MasterDocument } from '../types';

export const canonicalDistributionDepartment = (dept: string): Department =>
  (['QA', 'QC', 'QA/QC'].includes(dept) ? 'QA/QC' : dept) as Department;

export function findExistingDistribution(master: MasterDocument, records: DistributionRecord[]) {
  if (!master.darReferenceId) return undefined;
  return records.filter(record => record.status !== 'CANCELLED'
    && record.darReferenceId === master.darReferenceId
    && record.docId === master.id && record.revision === master.currentRevision)
    .sort((a, b) => a.distributedDate.localeCompare(b.distributedDate) || a.id.localeCompare(b.id))[0];
}

export function initialDistributionSelection(master: MasterDocument, existing?: DistributionRecord, now = Date.now()): Department[] {
  const departments = [...new Set([
    ...(master.distributionDepartments || []).map(row => canonicalDistributionDepartment(row.dept)),
    ...(existing?.targetDepartments || []).map(canonicalDistributionDepartment),
  ])];
  if (!existing) return departments;
  return departments.filter(dept => !existing.receipts?.[dept]?.downloadedAt
    || Number(existing.departmentExpirationEpoch?.[dept] || existing.expirationEpoch) <= now);
}
