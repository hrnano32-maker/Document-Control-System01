export type Department = 
  | 'DCC'
  | 'QA'
  | 'QC'
  | 'Production 1'
  | 'Production 2/3'
  | 'HR'
  | 'Purchasing'
  | 'Warehouse SP'
  | 'Warehouse FG/DL'
  | 'Planning'
  | 'New Model'
  | 'Marketing'
  | 'R&D'
  | 'Maintenance'
  | 'QMR'
  | 'Customer Rep';

export const DEPARTMENTS: { id: Department; aaCode: string; nameTh: string; nameEn: string; icon: string; color: string }[] = [
  { id: 'DCC', aaCode: 'QS', nameTh: 'ศูนย์ควบคุมเอกสาร (DCC / Quality System)', nameEn: 'Document Control Center', icon: 'ShieldCheck', color: 'indigo' },
  { id: 'QA', aaCode: 'QA', nameTh: 'ฝ่ายประกันคุณภาพ (QA)', nameEn: 'Quality Assurance', icon: 'CheckCircle2', color: 'emerald' },
  { id: 'QC', aaCode: 'QC', nameTh: 'ฝ่ายควบคุมคุณภาพ (QC)', nameEn: 'Quality Control', icon: 'FileCheck', color: 'teal' },
  { id: 'Production 1', aaCode: 'PD', nameTh: 'ฝ่ายผลิต 1 (Main Assembly)', nameEn: 'Production 1', icon: 'Factory', color: 'blue' },
  { id: 'Production 2/3', aaCode: 'PD', nameTh: 'ฝ่ายผลิต 2/3 (Sub & Assyst)', nameEn: 'Production 2/3', icon: 'Cpu', color: 'cyan' },
  { id: 'HR', aaCode: 'HR', nameTh: 'ทรัพยากรบุคคลและธุรการ (HR)', nameEn: 'Human Resources', icon: 'Users', color: 'pink' },
  { id: 'Purchasing', aaCode: 'PU', nameTh: 'ฝ่ายจัดซื้อ (Purchase)', nameEn: 'Purchasing', icon: 'ShoppingCart', color: 'amber' },
  { id: 'Warehouse SP', aaCode: 'WH', nameTh: 'คลังวัตถุดิบและอะไหล่ (Warehouse SP)', nameEn: 'Warehouse SP', icon: 'PackageSearch', color: 'orange' },
  { id: 'Warehouse FG/DL', aaCode: 'DL', nameTh: 'คลังสินค้าสำเร็จรูปและจัดส่ง (Delivery)', nameEn: 'Warehouse FG/DL', icon: 'Truck', color: 'amber' },
  { id: 'Planning', aaCode: 'PD', nameTh: 'ฝ่ายวางแผนและควบคุมการผลิต (PMC)', nameEn: 'Production Planning', icon: 'CalendarDays', color: 'purple' },
  { id: 'New Model', aaCode: 'ND', nameTh: 'ฝ่ายพัฒนาผลิตภัณฑ์ใหม่ (New Model / NPI)', nameEn: 'New Model / NPI', icon: 'Sparkles', color: 'violet' },
  { id: 'Marketing', aaCode: 'MK', nameTh: 'ฝ่ายการตลาดและการขาย (Marketing)', nameEn: 'Marketing & Sales', icon: 'TrendingUp', color: 'rose' },
  { id: 'R&D', aaCode: 'ND', nameTh: 'ฝ่ายวิจัยและพัฒนาผลิตภัณฑ์ (R&D)', nameEn: 'Research & Development', icon: 'FlaskConical', color: 'teal' },
  { id: 'Maintenance', aaCode: 'MN', nameTh: 'ฝ่ายซ่อมบำรุงและวิศวกรรม (Maintenance)', nameEn: 'Maintenance', icon: 'Wrench', color: 'slate' },
  { id: 'QMR', aaCode: 'MR', nameTh: 'ตัวแทนฝ่ายบริหารระบบคุณภาพ (QMR)', nameEn: 'Quality Management Rep.', icon: 'Award', color: 'red' },
  { id: 'Customer Rep', aaCode: 'CR', nameTh: 'ตัวแทนลูกค้า (Customer Representative)', nameEn: 'Customer Representative', icon: 'UserCheck', color: 'cyan' },
];

export type DocumentType = 'QM' | 'QP' | 'WI' | 'FM' | 'SD' | 'DRAWING' | 'EX';

export const DOCUMENT_TYPES: {
  code: DocumentType;
  level: number;
  levelLabelTh: string;
  labelTh: string;
  labelEn: string;
  codePattern: string;
  desc: string;
  badgeColor: string;
}[] = [
  {
    code: 'QM',
    level: 1,
    levelLabelTh: 'ระดับที่ 1 (Level 1)',
    labelTh: 'คู่มือคุณภาพ (Quality Manual)',
    labelEn: 'Quality Manual',
    codePattern: 'QM-AA-000',
    desc: 'เอกสารสำหรับกำหนดนโยบายเป้าหมายคุณภาพและการจัดระบบบริหารคุณภาพ',
    badgeColor: 'bg-red-50 text-red-700 border-red-200',
  },
  {
    code: 'QP',
    level: 2,
    levelLabelTh: 'ระดับที่ 2 (Level 2)',
    labelTh: 'ระเบียบการปฏิบัติ (Quality Procedure)',
    labelEn: 'Quality Procedure',
    codePattern: 'QP-AA-000',
    desc: 'กำหนดแนวทางการดำเนินงานของงานในส่วน/ฝ่าย/แผนก เพื่อให้สอดคล้องตามข้อกำหนด IATF 16949 / ISO 9001',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    code: 'WI',
    level: 3,
    levelLabelTh: 'ระดับที่ 3 (Level 3)',
    labelTh: 'วิธีปฏิบัติงานและเอกสารประเภท 3 (Work Instruction)',
    labelEn: 'Work Instruction & Type 3',
    codePattern: 'WI-AA-000',
    desc: 'อธิบายถึงวิธีการปฏิบัติงานที่เป็นรายละเอียดว่า "ทำอย่างไร" รวมถึง Customer Requirement และนโยบาย/เป้าหมายคุณภาพ',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    code: 'FM',
    level: 4,
    levelLabelTh: 'ระดับที่ 4 (Level 4)',
    labelTh: 'แบบฟอร์มบันทึกคุณภาพ (Form / Record Format)',
    labelEn: 'Form / Record Format',
    codePattern: 'FM-AA-000',
    desc: 'แบบฟอร์มการบันทึกต่าง ๆ สำหรับใช้บันทึกข้อมูลคุณภาพ (FM-AA-000-RR:DD/MM/YY)',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    code: 'SD',
    level: 4,
    levelLabelTh: 'ระดับที่ 4 (Level 4)',
    labelTh: 'เอกสารสนับสนุน (Support Document / Check Sheet)',
    labelEn: 'Support Document',
    codePattern: 'SD-AA-000',
    desc: 'เอกสารที่นำมาใช้เป็นแนวทางปฏิบัติหรืออ้างอิงในการทำงาน เช่น ตารางการเปรียบเทียบ, Check Sheet',
    badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  {
    code: 'DRAWING',
    level: 5,
    levelLabelTh: 'เอกสารทางวิศวกรรม',
    labelTh: 'แบบร่างทางวิศวกรรม / Drawing ลูกค้า',
    labelEn: 'Customer Drawing / Spec',
    codePattern: 'DWG.NO. XXXX:DD-MM-YY',
    desc: 'ข้อกำหนดทางวิศวกรรมและ Drawing ของลูกค้า (THM, HLT, TYM, TSM, SAS, PCT, KMT)',
    badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  {
    code: 'EX',
    level: 5,
    levelLabelTh: 'เอกสารภายนอก',
    labelTh: 'เอกสารภายนอก / กฎหมาย / มาตรฐานสากล',
    labelEn: 'External Document / Standards',
    codePattern: 'EXT-STD / กฎหมาย',
    desc: 'มาตรฐานสากลและกฎหมาย เช่น ASTM, JIS, ISO/IATF 16949, FMVSS, ECE R81, VSCC (VSTD NO.27), CCC',
    badgeColor: 'bg-slate-100 text-slate-700 border-slate-300',
  },
];

export type DarRequestType = 'NEW' | 'REVISION' | 'OBSOLETE';

export type DarStatus = 'PENDING_REVIEW' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'REGISTERED';

export interface DarRecord {
  id: string; // e.g. DAR-2026-0001
  requestType: DarRequestType;
  requestDept: Department;
  requesterName: string;
  requesterTitle: string;
  requestDate: string; // YYYY-MM-DD
  targetEffectiveDate: string; // YYYY-MM-DD
  docNo: string; // e.g. QP-PD-001
  docNameTh: string;
  docNameEn: string;
  docType: DocumentType;
  currentRevision: string; // e.g. "02" or "N/A"
  proposedRevision: string; // e.g. "03" or "00"
  reasonForChange: string;
  changeDetails: string;
  incomingDriveLink: string; // Google Drive Incoming/Temp Link
  status: DarStatus;
  dccReviewer?: string;
  dccReviewDate?: string;
  dccRemarks?: string;
  isoClause?: string;
  isSkippedRevision?: boolean;
  skippedRevisionReason?: string;
  systemCurrentRevision?: string;

  // Attached Draft Document / File
  attachmentFileName?: string;
  attachmentFileSize?: string;
  attachmentFileType?: string;
  attachmentFileDataUrl?: string;

  // DAR Signatures & Approvals (with Drag & Drop Image or Digital Sign)
  requesterSignature?: string; // Data URL or Image URL
  deptApproverName?: string;
  deptApproverTitle?: string;
  deptApproverDate?: string;
  deptApproverSignature?: string;
  dccSignature?: string;
  qmrName?: string;
  qmrTitle?: string;
  qmrDate?: string;
  qmrSignature?: string;
  qmrApprovalDecision?: 'YES' | 'NO';

  // Review Items & Distribution for standard NANO DAR Form
  reviewItems?: string[]; // e.g. ['QP', 'PQCT', 'SD', 'WI', 'FMEA', 'BOM']
  distributionHolders?: { checked: boolean; position: string; copies: string }[];
}

export interface RevisionHistoryItem {
  rev: string; // e.g. "00", "01", "02", "03"
  effectiveDate: string;
  darNo: string;
  reason: string;
  registeredBy: string;
  registeredDate: string;
  status: 'ACTIVE' | 'SUPERSEDED' | 'OBSOLETE';
  controlledDriveLink: string;
}

export type DocumentStatus = 'ACTIVE' | 'OBSOLETE' | 'UNDER_REVISION';

export interface MasterDocument {
  id: string;
  docNo: string; // e.g. QP-PD-001
  docNameTh: string;
  docNameEn: string;
  docType: DocumentType;
  ownerDept: Department;
  currentRevision: string; // e.g. "03"
  effectiveDate: string;
  reviewDueDate: string;
  status: DocumentStatus;
  controlledDriveLink: string; // Google Drive Controlled Copy Folder Link
  originalDriveLink: string; // Google Drive Original Archive
  darReferenceId: string;
  createdAt: string;
  updatedAt: string;
  revisionHistory: RevisionHistoryItem[];
  retentionPeriodYears: number;
}

export type TargetDownloadStatus = 'PENDING' | 'DOWNLOADED' | 'EXPIRED' | 'RE_REQUESTED';

export interface DepartmentDistributionTarget {
  dept: Department;
  copyNo: string; // "Copy 1/1"
  isDownloaded: boolean;
  downloadTimestamp: string | null;
  downloaderName: string | null;
  downloaderEmpId: string | null;
  downloaderPosition: string | null;
  signatureDataUrl: string | null; // Digital signature base64
  status: TargetDownloadStatus;
  reRequestReason?: string;
  reRequestDate?: string;
  reRequestStatus?: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
}

export type DistributionStatus = 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED';

export interface DistributionRecord {
  id: string;
  distributionNo: string; // e.g. DC-DIS-2026-0001
  docId: string;
  docNo: string;
  docNameTh: string;
  docNameEn: string;
  docType: DocumentType;
  revision: string;
  effectiveDate: string;
  distributedBy: string;
  distributedDate: string; // ISO string
  expirationDate: string; // ISO string (3 days from distributedDate)
  status: DistributionStatus;
  controlledDriveLink: string;
  instructions: string;
  targets: DepartmentDistributionTarget[];
}

export interface CopyReRequest {
  id: string;
  distributionId: string;
  distributionNo: string;
  docNo: string;
  docNameTh: string;
  revision: string;
  dept: Department;
  requestedBy: string;
  empId: string;
  reasonType: 'EXPIRED_DOWNLOAD_WINDOW' | 'FILE_LOST_OR_DAMAGED' | 'ADDITIONAL_WORKSTATION' | 'AUDIT_PREPARATION' | 'OTHER';
  reasonDetails: string;
  requestDate: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  dccDecisionBy?: string;
  dccDecisionDate?: string;
  dccDecisionNote?: string;
}

export type AuditActionType =
  | 'DAR_CREATED'
  | 'DAR_REVIEWED'
  | 'DOCUMENT_REGISTERED'
  | 'MASTER_LIST_UPDATED'
  | 'CONTROLLED_COPY_STAMPED'
  | 'DISTRIBUTION_INITIATED'
  | 'CONTROLLED_COPY_DOWNLOADED'
  | 'SIGNATURE_CAPTURED'
  | 'COPY_RE_REQUESTED'
  | 'RE_REQUEST_APPROVED'
  | 'LINK_EXPIRED'
  | 'OBSOLETE_MARKED';

export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO string
  actor: string;
  actorDept: Department;
  actionType: AuditActionType;
  docNo: string;
  revision: string;
  description: string;
  details?: Record<string, any>;
  ipAddress: string;
}

export interface CurrentUserSession {
  currentDept: Department;
  username: string;
  userName: string;
  userEmpId: string;
  userRole: 'DCC_ADMIN' | 'DEPT_CONTROLLER' | 'STAFF';
  roleName: 'DCC / Admin' | 'Department User';
  deptDescriptionTh: string;
  position: string;
  isAuthenticated: boolean;
  allowedViews: ('dashboard' | 'dar' | 'audit' | 'masterlist' | 'distribution')[];
}

export interface DocumentViewPayload {
  title: string;
  docNo?: string;
  docNameTh?: string;
  docNameEn?: string;
  docType?: DocumentType | string;
  revision?: string;
  dept?: string;
  driveLink?: string;
  fileName?: string;
  fileSize?: string;
  fileType?: string;
  fileDataUrl?: string;
  darId?: string;
  docId?: string;
  reasonForChange?: string;
  changeDetails?: string;
  isoClause?: string;
  effectiveDate?: string;
  isControlledCopy?: boolean;
}

