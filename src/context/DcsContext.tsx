import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Department,
  MasterDocument,
  DarRecord,
  DistributionRecord,
  CopyReRequest,
  AuditLogEntry,
  CurrentUserSession,
  DEPARTMENTS,
  DarRequestType,
  DocumentType,
  DocumentViewPayload,
} from '../types';
import {
  INITIAL_DOCUMENTS,
  INITIAL_DARS,
  INITIAL_DISTRIBUTIONS,
  INITIAL_RE_REQUESTS,
  INITIAL_AUDIT_LOGS,
} from '../data/initialData';
import { USER_ACCOUNTS, UserAccount } from '../data/userCredentials';

interface DcsContextType {
  // Session & Authentication
  currentUser: CurrentUserSession;
  setCurrentDept: (dept: Department) => void;
  setUserName: (name: string) => void;
  login: (username: string, password: string, rememberMe?: boolean) => { success: boolean; message: string };
  loginAsDept: (username: string) => void;
  logout: () => void;
  userAccounts: UserAccount[];
  changePassword: (oldPassword: string, newPassword: string) => { success: boolean; message: string };
  isChangePasswordOpen: boolean;
  setIsChangePasswordOpen: (open: boolean) => void;

  // Master Documents
  documents: MasterDocument[];
  addDocument: (doc: Omit<MasterDocument, 'id' | 'createdAt' | 'updatedAt' | 'revisionHistory'>) => void;
  updateDocumentRevision: (docId: string, newRev: string, effectiveDate: string, darNo: string, reason: string, driveLink: string) => void;
  
  // DAR Management
  dars: DarRecord[];
  createDar: (dar: Omit<DarRecord, 'id' | 'requestDate' | 'status'>) => string;
  reviewDar: (darId: string, status: 'APPROVED' | 'REJECTED' | 'UNDER_REVIEW', remarks: string) => void;
  updateDarSignatures: (darId: string, updates: Partial<DarRecord>) => void;
  registerDarToMasterList: (darId: string) => void;

  // Distribution Management
  distributions: DistributionRecord[];
  createDistribution: (docId: string, targetDepts: Department[], instructions: string, driveLink?: string) => string;
  downloadControlledCopy: (
    distributionId: string,
    dept: Department,
    downloaderName: string,
    downloaderEmpId: string,
    downloaderPosition: string,
    signatureDataUrl: string
  ) => { success: boolean; message: string };

  // Copy Re-requests
  reRequests: CopyReRequest[];
  createReRequest: (
    distributionId: string,
    dept: Department,
    requestedBy: string,
    empId: string,
    reasonType: CopyReRequest['reasonType'],
    reasonDetails: string
  ) => void;
  reviewReRequest: (requestId: string, approve: boolean, note: string, extendDays?: number) => void;

  // Audit Logs
  auditLogs: AuditLogEntry[];
  logAudit: (actionType: AuditLogEntry['actionType'], docNo: string, revision: string, description: string, details?: Record<string, any>) => void;

  // Utils
  resetToDefaultData: () => void;
  activeView: string;
  setActiveView: (view: string) => void;
  selectedDocForModal: MasterDocument | null;
  setSelectedDocForModal: (doc: MasterDocument | null) => void;
  selectedDistributionForSheet: DistributionRecord | null;
  setSelectedDistributionForSheet: (dist: DistributionRecord | null) => void;
  selectedDistributionForDownload: { distribution: DistributionRecord; dept: Department } | null;
  setSelectedDistributionForDownload: (data: { distribution: DistributionRecord; dept: Department } | null) => void;
  selectedDistributionForReRequest: { distribution: DistributionRecord; dept: Department } | null;
  setSelectedDistributionForReRequest: (data: { distribution: DistributionRecord; dept: Department } | null) => void;
  isStamperOpen: boolean;
  setIsStamperOpen: (open: boolean) => void;
  stampDocData: { docNo: string; docName: string; revision: string; dept: string } | null;
  openStamperForDoc: (docNo: string, docName: string, revision: string, dept: string) => void;
  selectedDocumentForView: DocumentViewPayload | null;
  setSelectedDocumentForView: (payload: DocumentViewPayload | null) => void;
  openDocumentViewer: (payload: DocumentViewPayload) => void;
  updateDriveLink: (id: string, type: 'DAR' | 'MASTER_DOC', newLink: string) => void;
}

const STORAGE_KEYS = {
  DOCUMENTS: 'dcs_prod_documents_v2',
  DARS: 'dcs_prod_dars_v2',
  DISTRIBUTIONS: 'dcs_prod_distributions_v2',
  RE_REQUESTS: 'dcs_prod_re_requests_v2',
  AUDIT_LOGS: 'dcs_prod_audit_logs_v2',
  AUTH_USER: 'dcs_auth_user_v2',
  CUSTOM_PASSWORDS: 'dcs_custom_passwords_v2',
};

// Cleanup old mock prototype storage if present
if (typeof window !== 'undefined') {
  try {
    ['dcs_documents_v1', 'dcs_dars_v1', 'dcs_distributions_v1', 'dcs_re_requests_v1', 'dcs_audit_logs_v1'].forEach(key => {
      localStorage.removeItem(key);
    });
  } catch {
    // Ignore in SSR
  }
}

const DcsContext = createContext<DcsContextType | undefined>(undefined);

export const DcsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Custom passwords state
  const [customPasswords, setCustomPasswords] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CUSTOM_PASSWORDS);
    return saved ? JSON.parse(saved) : {};
  });

  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  // Current user state (auto login from saved session)
  const [currentUser, setCurrentUser] = useState<CurrentUserSession>(() => {
    const savedAuth = localStorage.getItem(STORAGE_KEYS.AUTH_USER);
    if (savedAuth) {
      try {
        const parsed = JSON.parse(savedAuth);
        if (parsed && parsed.currentDept && parsed.isAuthenticated) {
          const account = USER_ACCOUNTS.find(a => a.dept === parsed.currentDept) || USER_ACCOUNTS[0];
          return {
            currentDept: account.dept,
            username: account.username,
            userName: account.nameTh,
            userEmpId: account.empId,
            userRole: account.role,
            roleName: account.roleName,
            deptDescriptionTh: account.deptDescriptionTh,
            position: account.position,
            isAuthenticated: true,
            allowedViews: account.allowedViews,
          };
        }
      } catch (e) {
        console.error(e);
      }
    }
    const defaultAccount = USER_ACCOUNTS[0];
    return {
      currentDept: defaultAccount.dept,
      username: defaultAccount.username,
      userName: defaultAccount.nameTh,
      userEmpId: defaultAccount.empId,
      userRole: defaultAccount.role,
      roleName: defaultAccount.roleName,
      deptDescriptionTh: defaultAccount.deptDescriptionTh,
      position: defaultAccount.position,
      isAuthenticated: false,
      allowedViews: defaultAccount.allowedViews,
    };
  });

  // Main state with localStorage fallback
  const [documents, setDocuments] = useState<MasterDocument[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.DOCUMENTS);
    return saved ? JSON.parse(saved) : INITIAL_DOCUMENTS;
  });

  const [dars, setDars] = useState<DarRecord[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.DARS);
    return saved ? JSON.parse(saved) : INITIAL_DARS;
  });

  const [distributions, setDistributions] = useState<DistributionRecord[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.DISTRIBUTIONS);
    return saved ? JSON.parse(saved) : INITIAL_DISTRIBUTIONS;
  });

  const [reRequests, setReRequests] = useState<CopyReRequest[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.RE_REQUESTS);
    return saved ? JSON.parse(saved) : INITIAL_RE_REQUESTS;
  });

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
    return saved ? JSON.parse(saved) : INITIAL_AUDIT_LOGS;
  });

  // UI state
  const [activeView, setActiveView] = useState<string>('dashboard');
  const [selectedDocForModal, setSelectedDocForModal] = useState<MasterDocument | null>(null);
  const [selectedDistributionForSheet, setSelectedDistributionForSheet] = useState<DistributionRecord | null>(null);
  const [selectedDistributionForDownload, setSelectedDistributionForDownload] = useState<{ distribution: DistributionRecord; dept: Department } | null>(null);
  const [selectedDistributionForReRequest, setSelectedDistributionForReRequest] = useState<{ distribution: DistributionRecord; dept: Department } | null>(null);
  const [isStamperOpen, setIsStamperOpen] = useState(false);
  const [stampDocData, setStampDocData] = useState<{ docNo: string; docName: string; revision: string; dept: string } | null>(null);
  const [selectedDocumentForView, setSelectedDocumentForView] = useState<DocumentViewPayload | null>(null);

  const openDocumentViewer = (payload: DocumentViewPayload) => {
    setSelectedDocumentForView(payload);
  };

  const updateDriveLink = (id: string, type: 'DAR' | 'MASTER_DOC', newLink: string) => {
    if (type === 'DAR') {
      setDars(prev => prev.map(dar => dar.id === id ? { ...dar, incomingDriveLink: newLink } : dar));
      logAudit('DAR_REVIEWED' as any, id, '00', `อัปเดต Google Drive Link สำหรับคำขอ ${id} เป็น: ${newLink}`);
    } else {
      setDocuments(prev => prev.map(doc => doc.id === id || doc.docNo === id ? { ...doc, controlledDriveLink: newLink, originalDriveLink: newLink } : doc));
      logAudit('MASTER_LIST_UPDATED' as any, id, '00', `อัปเดต Google Drive Link สำหรับเอกสาร ${id} เป็น: ${newLink}`);
    }
  };

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.DOCUMENTS, JSON.stringify(documents));
  }, [documents]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.DARS, JSON.stringify(dars));
  }, [dars]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.DISTRIBUTIONS, JSON.stringify(distributions));
  }, [distributions]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.RE_REQUESTS, JSON.stringify(reRequests));
  }, [reRequests]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(auditLogs));
  }, [auditLogs]);

  const setCurrentDept = (dept: Department) => {
    const account = USER_ACCOUNTS.find(a => a.dept === dept) || USER_ACCOUNTS[0];
    const session: CurrentUserSession = {
      currentDept: account.dept,
      username: account.username,
      userName: account.nameTh,
      userEmpId: account.empId,
      userRole: account.role,
      roleName: account.roleName,
      deptDescriptionTh: account.deptDescriptionTh,
      position: account.position,
      isAuthenticated: true,
      allowedViews: account.allowedViews,
    };
    setCurrentUser(session);
    localStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(session));
    if (dept !== 'DCC' && (activeView === 'masterlist' || activeView === 'distribution')) {
      setActiveView('dashboard');
    }
  };

  const login = (usernameInput: string, passwordInput: string, rememberMe = true): { success: boolean; message: string } => {
    const trimmedUser = usernameInput.trim().toLowerCase();
    const trimmedPass = passwordInput.trim();

    const account = USER_ACCOUNTS.find(a => {
      const userMatches =
        a.username.toLowerCase() === trimmedUser ||
        (a.aliases && a.aliases.some(alias => alias.toLowerCase() === trimmedUser));
      
      return userMatches;
    });

    if (!account) {
      return {
        success: false,
        message: 'ชื่อผู้ใช้งาน (Username) หรือรหัสผ่าน (Password) ไม่ถูกต้อง กรุณาตรวจสอบข้อมูลประจำแผนก',
      };
    }

    // Check custom changed password first, then default initial password & altPasswords
    const effectivePass = customPasswords[account.username.toLowerCase()] || account.password;
    const passMatches =
      effectivePass === trimmedPass ||
      effectivePass.toLowerCase() === trimmedPass.toLowerCase() ||
      (account.altPasswords && account.altPasswords.some(alt => alt === trimmedPass || alt.toLowerCase() === trimmedPass.toLowerCase()));

    if (!passMatches) {
      return {
        success: false,
        message: 'ชื่อผู้ใช้งาน (Username) หรือรหัสผ่าน (Password) ไม่ถูกต้อง กรุณาตรวจสอบข้อมูลประจำแผนก',
      };
    }

    const session: CurrentUserSession = {
      currentDept: account.dept,
      username: account.username,
      userName: account.nameTh,
      userEmpId: account.empId,
      userRole: account.role,
      roleName: account.roleName,
      deptDescriptionTh: account.deptDescriptionTh,
      position: account.position,
      isAuthenticated: true,
      allowedViews: account.allowedViews,
    };

    setCurrentUser(session);
    if (rememberMe) {
      localStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(session));
    }
    setActiveView('dashboard');

    logAudit(
      'DAR_REVIEWED' as any,
      'AUTH-LOGIN',
      '00',
      `ผู้ใช้ ${account.username} (${account.nameTh}) เข้าสู่ระบบสำเร็จในฐานะ [${account.dept} - ${account.roleName}]`,
      { dept: account.dept, username: account.username }
    );

    return {
      success: true,
      message: `เข้าสู่ระบบสำเร็จ! ยินดีต้อนรับ ${account.nameTh} (${account.dept})`,
    };
  };

  const changePassword = (oldPassword: string, newPassword: string): { success: boolean; message: string } => {
    const trimmedUser = currentUser.username.toLowerCase();
    const account = USER_ACCOUNTS.find(a => 
      a.username.toLowerCase() === trimmedUser || 
      a.dept === currentUser.currentDept
    );

    if (!account) {
      return { success: false, message: 'ไม่พบบัญชีผู้ใช้งานที่เข้าสู่ระบบ' };
    }

    const effectiveCurrentPass = customPasswords[account.username.toLowerCase()] || account.password;
    const isOldMatch = 
      (oldPassword.trim() === effectiveCurrentPass) ||
      (account.altPasswords && account.altPasswords.includes(oldPassword.trim()));

    if (!isOldMatch) {
      return { success: false, message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง กรุณาตรวจสอบและลองใหม่อีกครั้ง' };
    }

    const updated = { ...customPasswords, [account.username.toLowerCase()]: newPassword.trim() };
    setCustomPasswords(updated);
    localStorage.setItem(STORAGE_KEYS.CUSTOM_PASSWORDS, JSON.stringify(updated));

    logAudit(
      'DAR_REVIEWED' as any,
      'PASSWORD-UPDATE',
      '00',
      `ผู้ใช้ ${currentUser.username} (${currentUser.userName}) แผนก ${currentUser.currentDept} ได้เปลี่ยนรหัสผ่านเข้าสู่ระบบสำเร็จ`,
      { dept: currentUser.currentDept, username: currentUser.username }
    );

    return {
      success: true,
      message: 'เปลี่ยนรหัสผ่านใหม่สำเร็จเรียบร้อยแล้ว!',
    };
  };

  const loginAsDept = (username: string) => {
    const account = USER_ACCOUNTS.find(a => a.username.toLowerCase() === username.toLowerCase());
    if (account) {
      const effectivePass = customPasswords[account.username.toLowerCase()] || account.password;
      login(account.username, effectivePass);
    }
  };

  const logout = () => {
    const previousDept = currentUser.currentDept;
    const previousUser = currentUser.userName;
    
    const unauthenticatedSession: CurrentUserSession = {
      ...currentUser,
      isAuthenticated: false,
    };

    setCurrentUser(unauthenticatedSession);
    localStorage.removeItem(STORAGE_KEYS.AUTH_USER);
    setActiveView('dashboard');

    logAudit(
      'DAR_REVIEWED' as any,
      'AUTH-LOGOUT',
      '00',
      `ผู้ใช้ ${previousUser} (${previousDept}) ออกจากระบบเรียบร้อยแล้ว`,
      { dept: previousDept }
    );
  };

  const safeSetActiveView = (view: string) => {
    setActiveView(view);
  };

  const setUserName = (name: string) => {
    setCurrentUser(prev => ({ ...prev, userName: name }));
  };

  const logAudit = (
    actionType: AuditLogEntry['actionType'],
    docNo: string,
    revision: string,
    description: string,
    details?: Record<string, any>
  ) => {
    const newEntry: AuditLogEntry = {
      id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      actor: `${currentUser.userName} (${currentUser.currentDept})`,
      actorDept: currentUser.currentDept,
      actionType,
      docNo,
      revision,
      description,
      details,
      ipAddress: '192.168.1.' + (10 + Math.floor(Math.random() * 80)),
    };
    setAuditLogs(prev => [newEntry, ...prev]);
  };

  const openStamperForDoc = (docNo: string, docName: string, revision: string, dept: string) => {
    setStampDocData({ docNo, docName, revision, dept });
    setIsStamperOpen(true);
  };

  // DAR Creation
  const createDar = (darData: Omit<DarRecord, 'id' | 'requestDate' | 'status'>): string => {
    const count = dars.length + 1;
    const year = new Date().getFullYear();
    const darId = `DAR-${year}-${String(count).padStart(4, '0')}`;
    const today = new Date().toISOString().split('T')[0];

    const newDar: DarRecord = {
      ...darData,
      id: darId,
      requestDate: today,
      status: 'PENDING_REVIEW',
    };

    setDars(prev => [newDar, ...prev]);

    logAudit(
      'DAR_CREATED',
      newDar.docNo,
      newDar.proposedRevision,
      `แผนก ${newDar.requestDept} สร้างคำขอดำเนินการ ${darId} ประเภท [${newDar.requestType}] สำหรับเอกสาร ${newDar.docNo} (${newDar.docNameTh}) พร้อมระบุลิงก์ Google Drive Incoming`,
      { darId, requestType: newDar.requestType, driveLink: newDar.incomingDriveLink }
    );

    return darId;
  };

  // Review DAR
  const reviewDar = (darId: string, status: 'APPROVED' | 'REJECTED' | 'UNDER_REVIEW', remarks: string) => {
    setDars(prev =>
      prev.map(d => {
        if (d.id === darId) {
          return {
            ...d,
            status,
            dccReviewer: currentUser.userName,
            dccReviewDate: new Date().toISOString().split('T')[0],
            dccRemarks: remarks,
          };
        }
        return d;
      })
    );

    const targetDar = dars.find(d => d.id === darId);
    if (targetDar) {
      logAudit(
        'DAR_REVIEWED',
        targetDar.docNo,
        targetDar.proposedRevision,
        `DCC (${currentUser.userName}) ตรวจสอบ ${darId} และเปลี่ยนสถานะเป็น [${status}] หมายเหตุ: ${remarks || 'ไม่มี'}`,
        { darId, status, remarks }
      );
    }
  };

  // Update DAR signatures and attachments
  const updateDarSignatures = (darId: string, updates: Partial<DarRecord>) => {
    setDars(prev =>
      prev.map(d => {
        if (d.id === darId) {
          return {
            ...d,
            ...updates,
          };
        }
        return d;
      })
    );

    const targetDar = dars.find(d => d.id === darId);
    if (targetDar) {
      logAudit(
        'DAR_REVIEWED',
        targetDar.docNo,
        targetDar.proposedRevision,
        `อัปเดตลายเซ็น/ข้อมูลเอกสารในใบขอดำเนินการ ${darId} โดย ${currentUser.userName} (${currentUser.currentDept})`,
        { darId, updatedFields: Object.keys(updates) }
      );
    }
  };

  // Auto Register DAR to Master List (No double manual typing!)
  const registerDarToMasterList = (darId: string) => {
    const dar = dars.find(d => d.id === darId);
    if (!dar) return;

    const today = new Date().toISOString().split('T')[0];
    const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Check if doc already exists in Master List
    const existingDoc = documents.find(d => d.docNo.trim().toUpperCase() === dar.docNo.trim().toUpperCase());

    if (dar.requestType === 'OBSOLETE') {
      // Mark as Obsolete in Master List
      if (existingDoc) {
        setDocuments(prev =>
          prev.map(d =>
            d.id === existingDoc.id
              ? {
                  ...d,
                  status: 'OBSOLETE',
                  updatedAt: today,
                  revisionHistory: [
                    ...d.revisionHistory.map(r => ({ ...r, status: 'SUPERSEDED' as const })),
                    {
                      rev: dar.currentRevision,
                      effectiveDate: dar.targetEffectiveDate || today,
                      darNo: dar.id,
                      reason: `ขอยกเลิกการใช้งานตาม DAR: ${dar.reasonForChange}`,
                      registeredBy: currentUser.userName,
                      registeredDate: today,
                      status: 'OBSOLETE' as const,
                      controlledDriveLink: dar.incomingDriveLink,
                    },
                  ],
                }
              : d
          )
        );
      }
    } else if (existingDoc) {
      // Update revision
      const newRev = dar.proposedRevision;
      const historyItem = {
        rev: newRev,
        effectiveDate: dar.targetEffectiveDate || today,
        darNo: dar.id,
        reason: dar.skippedRevisionReason
          ? `${dar.reasonForChange} (ข้าม Revision: ${dar.skippedRevisionReason})`
          : dar.reasonForChange,
        registeredBy: currentUser.userName,
        registeredDate: today,
        status: 'ACTIVE' as const,
        controlledDriveLink: dar.incomingDriveLink || `https://drive.google.com/drive/folders/dcc-controlled-archive/${dar.docNo}_Rev${newRev}_CONTROLLED.pdf`,
      };

      setDocuments(prev =>
        prev.map(d =>
          d.id === existingDoc.id
            ? {
                ...d,
                docNameTh: dar.docNameTh || d.docNameTh,
                docNameEn: dar.docNameEn || d.docNameEn,
                docType: dar.docType || d.docType,
                currentRevision: newRev,
                effectiveDate: dar.targetEffectiveDate || today,
                reviewDueDate: nextYear,
                status: 'ACTIVE',
                darReferenceId: dar.id,
                updatedAt: today,
                controlledDriveLink: historyItem.controlledDriveLink,
                revisionHistory: [
                  ...d.revisionHistory.map(h => ({ ...h, status: 'SUPERSEDED' as const })),
                  historyItem,
                ],
              }
            : d
        )
      );
    } else {
      // Create Brand New Document in Master List
      const newDocId = `DOC-${Date.now()}`;
      const newMasterDoc: MasterDocument = {
        id: newDocId,
        docNo: dar.docNo,
        docNameTh: dar.docNameTh,
        docNameEn: dar.docNameEn,
        docType: dar.docType,
        ownerDept: dar.requestDept,
        currentRevision: dar.proposedRevision || '00',
        effectiveDate: dar.targetEffectiveDate || today,
        reviewDueDate: nextYear,
        status: 'ACTIVE',
        controlledDriveLink: dar.incomingDriveLink || `https://drive.google.com/drive/folders/dcc-controlled-archive/${dar.docNo}_Rev00_CONTROLLED.pdf`,
        originalDriveLink: dar.incomingDriveLink,
        darReferenceId: dar.id,
        createdAt: today,
        updatedAt: today,
        retentionPeriodYears: 5,
        revisionHistory: [
          {
            rev: dar.proposedRevision || '00',
            effectiveDate: dar.targetEffectiveDate || today,
            darNo: dar.id,
            reason: dar.reasonForChange || 'จัดทำเอกสารขึ้นทะเบียนใหม่',
            registeredBy: currentUser.userName,
            registeredDate: today,
            status: 'ACTIVE',
            controlledDriveLink: dar.incomingDriveLink || `https://drive.google.com/drive/folders/dcc-controlled-archive/${dar.docNo}_Rev00_CONTROLLED.pdf`,
          },
        ],
      };

      setDocuments(prev => [newMasterDoc, ...prev]);
    }

    // Mark DAR as Registered
    setDars(prev =>
      prev.map(d => (d.id === darId ? { ...d, status: 'REGISTERED', dccReviewDate: today } : d))
    );

    logAudit(
      'DOCUMENT_REGISTERED',
      dar.docNo,
      dar.proposedRevision,
      `DCC ขึ้นทะเบียนเอกสาร ${dar.docNo} (Rev.${dar.proposedRevision}) จาก ${dar.id} เข้า Master List เรียบร้อยโดยอัตโนมัติ ไม่ต้องกรอกซ้ำ`,
      { darId, docNo: dar.docNo, rev: dar.proposedRevision }
    );

    logAudit(
      'MASTER_LIST_UPDATED',
      dar.docNo,
      dar.proposedRevision,
      `Master List อัปเดตข้อมูล ${dar.docNo} เป็นสถานะ Active ล่าสุด พร้อมจัดเก็บประวัติ Revision ย้อนหลังในระบบ`,
      { docNo: dar.docNo, newRev: dar.proposedRevision }
    );
  };

  // Add Document directly (if needed by DCC)
  const addDocument = (docData: Omit<MasterDocument, 'id' | 'createdAt' | 'updatedAt' | 'revisionHistory'>) => {
    const today = new Date().toISOString().split('T')[0];
    const newDoc: MasterDocument = {
      ...docData,
      id: `DOC-${Date.now()}`,
      createdAt: today,
      updatedAt: today,
      revisionHistory: [
        {
          rev: docData.currentRevision,
          effectiveDate: docData.effectiveDate,
          darNo: docData.darReferenceId || 'DIRECT-REGISTER',
          reason: 'ขึ้นทะเบียนเอกสารโดยตรงในระบบ DCC',
          registeredBy: currentUser.userName,
          registeredDate: today,
          status: 'ACTIVE',
          controlledDriveLink: docData.controlledDriveLink,
        },
      ],
    };

    setDocuments(prev => [newDoc, ...prev]);
    logAudit('DOCUMENT_REGISTERED', newDoc.docNo, newDoc.currentRevision, `ขึ้นทะเบียนเอกสาร ${newDoc.docNo} ใน Master List`);
  };

  const updateDocumentRevision = (
    docId: string,
    newRev: string,
    effectiveDate: string,
    darNo: string,
    reason: string,
    driveLink: string
  ) => {
    const today = new Date().toISOString().split('T')[0];
    setDocuments(prev =>
      prev.map(d => {
        if (d.id === docId) {
          return {
            ...d,
            currentRevision: newRev,
            effectiveDate,
            updatedAt: today,
            controlledDriveLink: driveLink,
            revisionHistory: [
              ...d.revisionHistory.map(r => ({ ...r, status: 'SUPERSEDED' as const })),
              {
                rev: newRev,
                effectiveDate,
                darNo,
                reason,
                registeredBy: currentUser.userName,
                registeredDate: today,
                status: 'ACTIVE',
                controlledDriveLink: driveLink,
              },
            ],
          };
        }
        return d;
      })
    );
  };

  // Create Distribution
  const createDistribution = (
    docId: string,
    targetDepts: Department[],
    instructions: string,
    driveLink?: string
  ): string => {
    const targetDoc = documents.find(d => d.id === docId);
    if (!targetDoc) return '';

    const year = new Date().getFullYear();
    const count = distributions.length + 1;
    const distNo = `DC-DIS-${year}-${String(count).padStart(4, '0')}`;
    const nowIso = new Date().toISOString();
    // 3 Days Expiration (exactly 72 hours)
    const expiryIso = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const newDist: DistributionRecord = {
      id: `DIS-${Date.now()}`,
      distributionNo: distNo,
      docId: targetDoc.id,
      docNo: targetDoc.docNo,
      docNameTh: targetDoc.docNameTh,
      docNameEn: targetDoc.docNameEn,
      docType: targetDoc.docType,
      revision: targetDoc.currentRevision,
      effectiveDate: targetDoc.effectiveDate,
      distributedBy: currentUser.userName,
      distributedDate: nowIso,
      expirationDate: expiryIso,
      status: 'IN_PROGRESS',
      controlledDriveLink: driveLink || targetDoc.controlledDriveLink,
      instructions: instructions || 'กรุณาดาวน์โหลดและจัดเก็บ Controlled Copy เข้าแฟ้มเอกสารประจำหน่วยงานภายใน 3 วัน',
      targets: targetDepts.map(dept => ({
        dept,
        copyNo: 'Copy 1/1',
        isDownloaded: false,
        downloadTimestamp: null,
        downloaderName: null,
        downloaderEmpId: null,
        downloaderPosition: null,
        signatureDataUrl: null,
        status: 'PENDING',
      })),
    };

    setDistributions(prev => [newDist, ...prev]);

    logAudit(
      'DISTRIBUTION_INITIATED',
      targetDoc.docNo,
      targetDoc.currentRevision,
      `DCC (${currentUser.userName}) ทำการแจกจ่ายเอกสาร ${targetDoc.docNo} Rev.${targetDoc.currentRevision} (เลขที่แจกจ่าย: ${distNo}) ไปยัง ${targetDepts.length} แผนก พร้อมกำหนดอายุลิงก์ดาวน์โหลด 3 วัน (หมดอายุ: ${new Date(expiryIso).toLocaleString('th-TH')})`,
      { distributionNo: distNo, targetCount: targetDepts.length, targets: targetDepts }
    );

    return distNo;
  };

  // Download Controlled Copy (Enforcing the 1 Document + 1 Revision + 1 Distribution + 1 Department = 1 Download Rule)
  const downloadControlledCopy = (
    distributionId: string,
    dept: Department,
    downloaderName: string,
    downloaderEmpId: string,
    downloaderPosition: string,
    signatureDataUrl: string
  ): { success: boolean; message: string } => {
    const dist = distributions.find(d => d.id === distributionId);
    if (!dist) {
      return { success: false, message: 'ไม่พบรายการแจกจ่ายเอกสาร' };
    }

    // Check expiration (3 days)
    const isExpired = new Date().getTime() > new Date(dist.expirationDate).getTime();
    if (isExpired) {
      return {
        success: false,
        message: 'ลิงก์ดาวน์โหลดหมดอายุแล้ว (เกิน 3 วันนับจากวันที่แจกจ่าย) กรุณากดปุ่ม "ร้องขอ DCC" เพื่อขอต่ออายุสิทธิ์',
      };
    }

    // Check target department
    const target = dist.targets.find(t => t.dept === dept);
    if (!target) {
      return { success: false, message: `หน่วยงาน ${dept} ไม่อยู่ในรายชื่อผู้รับการแจกจ่ายฉบับนี้` };
    }

    if (target.isDownloaded) {
      return {
        success: false,
        message: `🔒 หน่วยงาน ${dept} ได้ใช้สิทธิ์ดาวน์โหลด Controlled Copy (Copy 1/1) ไปแล้วโดย ${target.downloaderName} เมื่อ ${new Date(target.downloadTimestamp!).toLocaleString('th-TH')} หากต้องการสำเนาใหม่ กรุณาร้องขอ DCC`,
      };
    }

    const downloadTimestamp = new Date().toISOString();

    setDistributions(prev =>
      prev.map(d => {
        if (d.id === distributionId) {
          const updatedTargets = d.targets.map(t => {
            if (t.dept === dept) {
              return {
                ...t,
                isDownloaded: true,
                downloadTimestamp,
                downloaderName,
                downloaderEmpId,
                downloaderPosition,
                signatureDataUrl,
                status: 'DOWNLOADED' as const,
              };
            }
            return t;
          });

          // Check if all downloaded
          const allDownloaded = updatedTargets.every(t => t.isDownloaded);

          return {
            ...d,
            targets: updatedTargets,
            status: allDownloaded ? 'COMPLETED' : d.status,
          };
        }
        return d;
      })
    );

    logAudit(
      'CONTROLLED_COPY_DOWNLOADED',
      dist.docNo,
      dist.revision,
      `หน่วยงาน [${dept}] โดย ${downloaderName} (รหัสพนักงาน: ${downloaderEmpId || 'N/A'}, ตำแหน่ง: ${downloaderPosition || 'N/A'}) แนบลายเซ็นดิจิทัลและดาวน์โหลด Controlled Copy (Copy 1/1) บันทึกจัดเก็บลงเครื่องคอมพิวเตอร์ประจำหน่วยงานเรียบร้อย สิทธิ์ดาวน์โหลดถูกปิดล็อค 🔒`,
      {
        distributionNo: dist.distributionNo,
        dept,
        downloader: downloaderName,
        empId: downloaderEmpId,
        timestamp: downloadTimestamp,
        copyNo: 'Copy 1/1',
      }
    );

    return { success: true, message: 'ดาวน์โหลด Controlled Copy สำเร็จ พร้อมบันทึกหลักฐานและล็อคสิทธิ์ดาวน์โหลดเรียบร้อย' };
  };

  // Request Copy / Re-issue
  const createReRequest = (
    distributionId: string,
    dept: Department,
    requestedBy: string,
    empId: string,
    reasonType: CopyReRequest['reasonType'],
    reasonDetails: string
  ) => {
    const dist = distributions.find(d => d.id === distributionId);
    if (!dist) return;

    const count = reRequests.length + 1;
    const year = new Date().getFullYear();
    const reqId = `REQ-${year}-${String(count).padStart(4, '0')}`;

    const newReq: CopyReRequest = {
      id: reqId,
      distributionId: dist.id,
      distributionNo: dist.distributionNo,
      docNo: dist.docNo,
      docNameTh: dist.docNameTh,
      revision: dist.revision,
      dept,
      requestedBy,
      empId,
      reasonType,
      reasonDetails,
      requestDate: new Date().toISOString(),
      status: 'PENDING',
    };

    setReRequests(prev => [newReq, ...prev]);

    // Mark target status as RE_REQUESTED
    setDistributions(prev =>
      prev.map(d => {
        if (d.id === distributionId) {
          return {
            ...d,
            targets: d.targets.map(t => {
              if (t.dept === dept) {
                return {
                  ...t,
                  status: 'RE_REQUESTED',
                  reRequestReason: reasonDetails,
                  reRequestDate: new Date().toISOString(),
                  reRequestStatus: 'PENDING',
                };
              }
              return t;
            }),
          };
        }
        return d;
      })
    );

    logAudit(
      'COPY_RE_REQUESTED',
      dist.docNo,
      dist.revision,
      `หน่วยงาน [${dept}] โดย ${requestedBy} ยื่นคำร้องขอ ${reqId} ถึง DCC เพื่อขอสิทธิ์ดาวน์โหลด Controlled Copy เพิ่มเติม/ต่ออายุ สาเหตุ: ${reasonDetails}`,
      { requestId: reqId, dept, reasonType, reasonDetails }
    );
  };

  // Review Re-request by DCC
  const reviewReRequest = (requestId: string, approve: boolean, note: string, extendDays = 3) => {
    const req = reRequests.find(r => r.id === requestId);
    if (!req) return;

    const today = new Date().toISOString();
    const newExpiry = new Date(Date.now() + extendDays * 24 * 60 * 60 * 1000).toISOString();

    setReRequests(prev =>
      prev.map(r =>
        r.id === requestId
          ? {
              ...r,
              status: approve ? 'APPROVED' : 'REJECTED',
              dccDecisionBy: currentUser.userName,
              dccDecisionDate: today,
              dccDecisionNote: note,
            }
          : r
      )
    );

    if (approve) {
      // Re-open download permission for that department
      setDistributions(prev =>
        prev.map(d => {
          if (d.id === req.distributionId) {
            return {
              ...d,
              status: 'IN_PROGRESS',
              expirationDate: newExpiry,
              targets: d.targets.map(t => {
                if (t.dept === req.dept) {
                  return {
                    ...t,
                    isDownloaded: false,
                    status: 'PENDING',
                    reRequestStatus: 'APPROVED',
                  };
                }
                return t;
              }),
            };
          }
          return d;
        })
      );

      logAudit(
        'RE_REQUEST_APPROVED',
        req.docNo,
        req.revision,
        `DCC (${currentUser.userName}) อนุมัติคำร้อง ${requestId} ของหน่วยงาน [${req.dept}] และเปิดสิทธิ์ให้ดาวน์โหลด Controlled Copy ใหม่ได้อีก ${extendDays} วัน (หมดอายุ: ${new Date(newExpiry).toLocaleDateString('th-TH')})`,
        { requestId, approved: true, note, newExpiry }
      );
    } else {
      setDistributions(prev =>
        prev.map(d => {
          if (d.id === req.distributionId) {
            return {
              ...d,
              targets: d.targets.map(t => (t.dept === req.dept ? { ...t, reRequestStatus: 'REJECTED' } : t)),
            };
          }
          return d;
        })
      );

      logAudit(
        'RE_REQUEST_APPROVED',
        req.docNo,
        req.revision,
        `DCC (${currentUser.userName}) ปฏิเสธคำร้อง ${requestId} ของหน่วยงาน [${req.dept}] เหตุผล: ${note}`,
        { requestId, approved: false, note }
      );
    }
  };

  const resetToDefaultData = () => {
    localStorage.removeItem(STORAGE_KEYS.DOCUMENTS);
    localStorage.removeItem(STORAGE_KEYS.DARS);
    localStorage.removeItem(STORAGE_KEYS.DISTRIBUTIONS);
    localStorage.removeItem(STORAGE_KEYS.RE_REQUESTS);
    localStorage.removeItem(STORAGE_KEYS.AUDIT_LOGS);
    setDocuments(INITIAL_DOCUMENTS);
    setDars(INITIAL_DARS);
    setDistributions(INITIAL_DISTRIBUTIONS);
    setReRequests(INITIAL_RE_REQUESTS);
    setAuditLogs(INITIAL_AUDIT_LOGS);
    setCurrentDept('DCC');
  };

  return (
    <DcsContext.Provider
      value={{
        currentUser,
        setCurrentDept,
        setUserName,
        login,
        loginAsDept,
        logout,
        userAccounts: USER_ACCOUNTS,
        documents,
        addDocument,
        updateDocumentRevision,
        dars,
        createDar,
        reviewDar,
        updateDarSignatures,
        registerDarToMasterList,
        distributions,
        createDistribution,
        downloadControlledCopy,
        reRequests,
        createReRequest,
        reviewReRequest,
        auditLogs,
        logAudit,
        resetToDefaultData,
        activeView,
        setActiveView: safeSetActiveView,
        selectedDocForModal,
        setSelectedDocForModal,
        selectedDistributionForSheet,
        setSelectedDistributionForSheet,
        selectedDistributionForDownload,
        setSelectedDistributionForDownload,
        selectedDistributionForReRequest,
        setSelectedDistributionForReRequest,
        isStamperOpen,
        setIsStamperOpen,
        stampDocData,
        openStamperForDoc,
        selectedDocumentForView,
        setSelectedDocumentForView,
        openDocumentViewer,
        updateDriveLink,
        changePassword,
        isChangePasswordOpen,
        setIsChangePasswordOpen,
      }}
    >
      {children}
    </DcsContext.Provider>
  );
};

export const useDcs = () => {
  const context = useContext(DcsContext);
  if (!context) {
    throw new Error('useDcs must be used within a DcsProvider');
  }
  return context;
};
