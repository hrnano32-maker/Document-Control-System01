import type { CurrentUserSession, DistributionReceipt, DistributionRecord, DocumentReturnRequest } from '../types';
import { canonicalDistributionDepartment } from './distributionReopen';

// Older receipts did not record transfer status. Preserve their established
// meaning; a new receipt explicitly remains pending until its files are saved.
export const isReceiptTransferComplete = (receipt?: DistributionReceipt, expectedFileCount?: number): boolean => {
  if (!receipt?.downloadedAt) return false;
  // Historical receipts predate transfer tracking and remain completed as
  // recorded; their individual downloaded files cannot be reconstructed.
  if (receipt.transferStatus == null && !receipt.transferId) return true;
  if (receipt.transferStatus !== 'COMPLETE' || !receipt.transferId || !receipt.transferCompletedAt || !Array.isArray(receipt.transferredIndexes)) return false;
  const indexes = receipt.transferredIndexes;
  if (!indexes.length || indexes.some(index => !Number.isInteger(index) || index < 0) || new Set(indexes).size !== indexes.length) return false;
  if (expectedFileCount && expectedFileCount > 0) return indexes.length === expectedFileCount && indexes.every(index => index < expectedFileCount);
  // After cleanup the paths may be gone, but completed indexes must still
  // form a contiguous sequence beginning at zero.
  return indexes.every(index => index < indexes.length);
};

// Prefer the current canonical entry over data left under a former department name.
const departmentValue = <T,>(map: Record<string, T> | undefined, department: string): T | undefined => {
  const id = canonicalDistributionDepartment(department);
  return map?.[id] ?? Object.entries(map || {}).find(([key]) => canonicalDistributionDepartment(key) === id)?.[1];
};
export const getDepartmentReceipt = (distribution: DistributionRecord, department: string) => departmentValue(distribution.receipts, department);

export const getDepartmentFileCount = (dist: DistributionRecord, dept: string): number => {
  // A reopened department may have its own set of files. Never use a different
  // department's count. Names and keys survive removal of the downloadable paths.
  const reissue = (dist.copyReissueHistory || []).slice().reverse().find(row => canonicalDistributionDepartment(row.department) === canonicalDistributionDepartment(dept));
  const scoped = Math.max(departmentValue(dist.departmentFileLists, dept)?.length || 0,
    departmentValue(dist.departmentFileNames, dept)?.length || 0,
    departmentValue(dist.departmentFileKeyLists, dept)?.length || 0, reissue?.fileCount || 0);
  return scoped || dist.fileNames?.length || dist.fileStoragePaths?.length ||
    (departmentValue(dist.departmentFiles, dept) || dist.fileName ? 1 : 0);
};

// Printing keeps historical signatures. Admission to the application requires
// file completion for the CURRENT allocation, never a target flag or first receipt.
export function getDepartmentReceiptState(dist: DistributionRecord, dept: string) {
  if (!hasDistributionAllocation(dist, dept)) return 'NOT_ASSIGNED';
  const receipt = getDepartmentReceipt(dist, dept);
  if (!receipt) return 'DUE';
  if (receipt.transferStatus === 'COMPLETE' && isReceiptTransferComplete(receipt, getDepartmentFileCount(dist, dept))) {
    const lastReopen = (dist.copyReissueHistory || []).slice().reverse().find(row => canonicalDistributionDepartment(row.department) === canonicalDistributionDepartment(dept));
    const completedAt = Date.parse(receipt.transferCompletedAt!);
    if (Number.isFinite(completedAt) && (!lastReopen || completedAt >= Date.parse(lastReopen.approvedAt))) return 'COMPLETE';
  }
  if (receipt.transferStatus === 'PENDING' && receipt.transferId && receipt.downloaderUid && receipt.downloadedAt) return 'DUE';
  return 'NEEDS_REOPEN';
}

export const isPendingDepartmentReceipt = (dist: DistributionRecord, dept: string) => {
  const state = getDepartmentReceiptState(dist, dept);
  return state === 'DUE' || state === 'NEEDS_REOPEN';
};

export function getRecipientGate(user: CurrentUserSession, sync: 'ready' | 'loading' | 'error', distributions: DistributionRecord[], returns: DocumentReturnRequest[]) {
  const pending = distributions.filter(item => isPendingDepartmentReceipt(item, user.currentDept));
  const pendingReturns = returns.filter(item => item.status === 'PENDING' && canonicalDistributionDepartment(item.dept) === canonicalDistributionDepartment(user.currentDept));
  const blocked = user.userRole !== 'DCC_ADMIN' && !user.mustChangePassword && (sync !== 'ready' || pending.length > 0 || pendingReturns.length > 0);
  return { blocked, pending, pendingReturns };
}

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

// A reopened department has its own deadline. Never substitute another
// department's later, set-wide deadline for an explicit zero/invalid deadline.
export const getDistributionExpiry = (distribution: DistributionRecord, department?: string): number => {
  const deadlines = distribution.departmentExpirationEpoch || {};
  if (department && Object.prototype.hasOwnProperty.call(deadlines, department)) {
    const value = Number(deadlines[department as keyof typeof deadlines]);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }
  if (distribution.expirationEpoch != null) {
    const value = Number(distribution.expirationEpoch);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }
  const value = Date.parse(distribution.expirationDate);
  return Number.isFinite(value) ? value : 0;
};

export const getDistributionDownloadAccess = (distribution: DistributionRecord, department: string, now = Date.now()) => {
  const expiresAt = getDistributionExpiry(distribution, department);
  const result = (state: 'READY' | 'EXPIRED' | 'UNAVAILABLE' | 'PREPARING' | 'CANCELLED' | 'INVALID_DEADLINE', message: string, canRequest = false) =>
    ({ state, expiresAt, canDownload: state === 'READY', canRequest, message });
  if (!hasDistributionAllocation(distribution, department)) return result('CANCELLED', 'ยกเลิกการแจกจ่ายหรือไม่มีสิทธิ์รับเอกสาร');
  if (expiresAt <= now && expiresAt > 0) return result('EXPIRED', 'สิทธิ์ดาวน์โหลดของแผนกหมดอายุแล้ว', true);
  if (!expiresAt) return result('INVALID_DEADLINE', 'ไม่พบกำหนดเวลารับเอกสารที่ถูกต้อง กรุณาติดต่อ DCC', true);
  if (distribution.storageStatus === 'PURGED' || distribution.storageStatus === 'PURGE_PENDING') return result('UNAVAILABLE', 'ไฟล์ไม่พร้อมดาวน์โหลด กรุณาร้องขอ DCC', true);
  if (distribution.stampStatus === 'PROCESSING' || distribution.storageStatus === 'PROCESSING') return result('PREPARING', 'กำลังเตรียมไฟล์ Controlled Copy');
  const paths = distribution.departmentFileLists?.[department] || (distribution.departmentFiles?.[department] ? [distribution.departmentFiles[department]] : []);
  if (!paths.length || distribution.stampStatus !== 'COMPLETED') return result('UNAVAILABLE', 'ไม่พบไฟล์ Controlled Copy ที่พร้อมดาวน์โหลด กรุณาร้องขอ DCC', true);
  const hours = Math.floor((expiresAt - now) / 3600000);
  const message = hours >= 24 ? `เหลือเวลา ${Math.floor(hours / 24)} วัน ${hours % 24} ชม.`
    : hours > 0 ? `เหลือเวลา ${hours} ชม.` : `เหลือเวลา ${Math.max(1, Math.ceil((expiresAt - now) / 60000))} นาที`;
  return result('READY', message);
};
