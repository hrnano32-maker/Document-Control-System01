import { MasterDocument, DarRecord, DistributionRecord, AuditLogEntry, CopyReRequest } from '../types';

// ข้อมูลเริ่มต้นสำหรับระบบใช้งานจริง (Production - สะอาด 100% ไม่มีเอกสารจำลอง)
export const INITIAL_DOCUMENTS: MasterDocument[] = [];

export const INITIAL_DARS: DarRecord[] = [];

export const INITIAL_DISTRIBUTIONS: DistributionRecord[] = [];

export const INITIAL_RE_REQUESTS: CopyReRequest[] = [];

export const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [];
