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
