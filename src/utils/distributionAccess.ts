import type { DistributionRecord } from '../types';
import { canonicalDistributionDepartment } from './distributionReopen';

// Historical targets/receipts remain after cancellation. Only the current
// allocation and cancellation state grant access; expiry still allows re-request.
export const hasDistributionAllocation = (distribution: DistributionRecord | undefined, department: string): boolean => {
  if (!distribution || distribution.status === 'CANCELLED') return false;
  const dept = canonicalDistributionDepartment(department);
  return distribution.targetDepartments?.some(value => canonicalDistributionDepartment(value) === dept) === true
    && !Object.entries(distribution.departmentCancellations || {}).some(([key, value]) =>
      canonicalDistributionDepartment(key) === dept && Boolean(value));
};

export const refreshDistributionSelection = <T extends { distribution: DistributionRecord; dept: string }>(
  selected: T | null, distributions: DistributionRecord[],
): T | null => {
  if (!selected) return null;
  const distribution = distributions.find(row => row.id === selected.distribution.id);
  return distribution && hasDistributionAllocation(distribution, selected.dept) ? { ...selected, distribution } : null;
};
