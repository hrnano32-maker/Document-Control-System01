import type { Department, DistributionRecord, MasterDocument } from '../types';

export const canonicalDistributionDepartment = (dept: string): Department =>
  (['QA', 'QC', 'QA/QC'].includes(dept) ? 'QA/QC' : dept) as Department;

// Extra Master rows belong to the existing DAR set; distribution always uses
// its primary document. A later DAR on that primary must not be used by mistake.
export function resolveDistributionAnchor(master: MasterDocument, registry: MasterDocument[]) {
  if (!master.distributionSetDocId) return master;
  return registry.find(row => row.id === master.distributionSetDocId && row.darReferenceId === master.darReferenceId);
}

export function isDistributedMasterForDepartment(master: MasterDocument, records: DistributionRecord[], dept: Department) {
  return records.some(row => row.status !== 'CANCELLED'
    && row.docId === (master.distributionSetDocId || master.id)
    && (!master.distributionSetDocId || row.darReferenceId === master.darReferenceId)
    && row.targetDepartments.some(value => canonicalDistributionDepartment(value) === canonicalDistributionDepartment(dept)));
}

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

