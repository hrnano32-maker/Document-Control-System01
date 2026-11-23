import type { CopyReRequest } from '../types';
import { canonicalDistributionDepartment } from './distributionReopen';

// Requests already waiting when another request was approved/started are the
// same request cycle. Requests submitted after that decision are a new cycle.
export const findConflictingCopyRequest = (request: CopyReRequest, rows: CopyReRequest[]) => {
  const requestedAt = Date.parse(request.requestDate);
  if (!Number.isFinite(requestedAt)) return undefined;
  return rows.find(other => {
    if (other.id === request.id || other.distributionId !== request.distributionId
      || canonicalDistributionDepartment(other.dept) !== canonicalDistributionDepartment(request.dept)) return false;
    const time = other.status === 'APPROVED' ? other.dccDecisionDate
      : other.status === 'PROCESSING' ? (other as CopyReRequest & { processingStartedAt?: string }).processingStartedAt : undefined;
    const decisionAt = Date.parse(time || '');
    return Number.isFinite(decisionAt) && decisionAt >= requestedAt;
  });
};
