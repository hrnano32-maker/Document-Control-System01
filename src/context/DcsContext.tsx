import React, { createContext, useContext, useEffect, useState } from 'react';
import type { AuditLogEntry, CopyReRequest, CurrentUserSession, DarRecord, Department, DistributionRecord, DocumentViewPayload, MasterDocument } from '../types';
import { changeDcsPassword, observeDcsAuth, signInDcsUser, signOutDcsUser } from '../services/authService';
import { acknowledgeDownload, cancelDarRecord, createCopyRequestRecord, createDarRecord, createDistributionRecord, decideCopyRequest, manageDistributionRecord, deleteDarDraftRecord, patchDarRecord, registerDarRecord, reviewDarRecord, reviseMasterDocument, saveMasterDocument, subscribeAuditForUser, subscribeCollection, subscribeCopyRequests, subscribeDars, subscribeDistributions, writeAudit } from '../services/dcsRepository';

type Result = { success: boolean; message: string; downloadUrl?: string; downloadUrls?: string[] };
interface DcsContextType {
  currentUser: CurrentUserSession; setUserName: (name: string) => void;
  login: (username: string, password: string, rememberMe?: boolean) => Promise<Result>; logout: () => void;
  changePassword: (oldPassword: string, newPassword: string) => Promise<Result>; isChangePasswordOpen: boolean; setIsChangePasswordOpen: (open: boolean) => void;
  documents: MasterDocument[]; addDocument: (doc: Omit<MasterDocument, 'id' | 'createdAt' | 'updatedAt' | 'revisionHistory'>) => Promise<void>;
  updateDocumentRevision: (docId: string, newRev: string, effectiveDate: string, darNo: string, reason: string, driveLink: string) => Promise<void>;
  dars: DarRecord[]; createDar: (dar: Omit<DarRecord, 'id' | 'requestDate' | 'status'>) => Promise<string>;
  reviewDar: (darId: string, status: 'APPROVED' | 'REJECTED' | 'UNDER_REVIEW', remarks: string) => Promise<void>;
  cancelDar: (darId: string, reason: string) => Promise<void>;
  deleteDar: (darId: string) => Promise<void>;
  updateDarSignatures: (darId: string, updates: Partial<DarRecord>) => Promise<void>; registerDarToMasterList: (darId: string) => Promise<void>;
  distributions: DistributionRecord[];
  createDistribution: (docId: string, targetDepts: Department[], instructions: string, attachedFiles?: { name: string; size: string; type: string; dataUrl?: string }[], onProgress?: (message: string, percent: number) => void) => Promise<string>;
  cancelDistribution: (distributionId: string, reason: string) => Promise<void>;
  deleteDistribution: (distributionId: string) => Promise<void>;
  downloadControlledCopy: (distributionId: string, dept: Department, downloaderName: string, downloaderEmpId: string, downloaderPosition: string, signatureDataUrl: string, onProgress?: (message: string, percent: number) => void) => Promise<Result>;
  reRequests: CopyReRequest[];
  createReRequest: (distributionId: string, dept: Department, requestedBy: string, empId: string, reasonType: CopyReRequest['reasonType'], reasonDetails: string) => Promise<void>;
  reviewReRequest: (requestId: string, approve: boolean, note: string, extendDays?: number, file?: { name: string; size: string; type: string; dataUrl: string }) => Promise<void>;
  auditLogs: AuditLogEntry[]; logAudit: (actionType: AuditLogEntry['actionType'], docNo: string, revision: string, description: string, details?: Record<string, unknown>) => Promise<void>;
  resetToDefaultData: () => void; activeView: string; setActiveView: (view: string) => void;
  selectedDocForModal: MasterDocument | null; setSelectedDocForModal: (doc: MasterDocument | null) => void;
  selectedDistributionForSheet: DistributionRecord | null; setSelectedDistributionForSheet: (dist: DistributionRecord | null) => void;
  selectedDistributionForDownload: { distribution: DistributionRecord; dept: Department } | null; setSelectedDistributionForDownload: (data: { distribution: DistributionRecord; dept: Department } | null) => void;
  selectedDistributionForReRequest: { distribution: DistributionRecord; dept: Department } | null; setSelectedDistributionForReRequest: (data: { distribution: DistributionRecord; dept: Department } | null) => void;
  isStamperOpen: boolean; setIsStamperOpen: (open: boolean) => void; stampDocData: { docNo: string; docName: string; revision: string; dept: string } | null;
  openStamperForDoc: (docNo: string, docName: string, revision: string, dept: string) => void;
  selectedDocumentForView: DocumentViewPayload | null; setSelectedDocumentForView: (payload: DocumentViewPayload | null) => void; openDocumentViewer: (payload: DocumentViewPayload) => void;
  updateDriveLink: (id: string, type: 'DAR' | 'MASTER_DOC', newLink: string) => Promise<void>;
}

const emptySession = (): CurrentUserSession => ({ uid: '', currentDept: 'DCC', username: '', userName: '', userEmpId: '', userRole: 'STAFF', roleName: 'Department User', deptDescriptionTh: '', position: '', isAuthenticated: false, mustChangePassword: false, allowedViews: [] });
const DcsContext = createContext<DcsContextType | undefined>(undefined);
const hydrateDistribution = (row: any): DistributionRecord => ({ ...row, targets: (row.targets || []).map((target: any) => { const receipt = row.receipts?.[target.dept]; return receipt ? { ...target, isDownloaded: true, status: 'DOWNLOADED', downloadTimestamp: receipt.downloadedAt, downloaderName: receipt.downloaderName, downloaderEmpId: receipt.downloaderEmpId, downloaderPosition: receipt.downloaderPosition, signatureDataUrl: null } : target; }) });

export const DcsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<CurrentUserSession>(emptySession());
  const [documents, setDocuments] = useState<MasterDocument[]>([]); const [dars, setDars] = useState<DarRecord[]>([]);
  const [distributions, setDistributions] = useState<DistributionRecord[]>([]); const [reRequests, setReRequests] = useState<CopyReRequest[]>([]); const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [activeView, setActiveView] = useState('dashboard'); const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [selectedDocForModal, setSelectedDocForModal] = useState<MasterDocument | null>(null); const [selectedDistributionForSheet, setSelectedDistributionForSheet] = useState<DistributionRecord | null>(null);
  const [selectedDistributionForDownload, setSelectedDistributionForDownload] = useState<{ distribution: DistributionRecord; dept: Department } | null>(null);
  const [selectedDistributionForReRequest, setSelectedDistributionForReRequest] = useState<{ distribution: DistributionRecord; dept: Department } | null>(null);
  const [isStamperOpen, setIsStamperOpen] = useState(false); const [stampDocData, setStampDocData] = useState<{ docNo: string; docName: string; revision: string; dept: string } | null>(null);
  const [selectedDocumentForView, setSelectedDocumentForView] = useState<DocumentViewPayload | null>(null);

  useEffect(() => observeDcsAuth(session => {
    setCurrentUser(session || emptySession());
    if (!session) setActiveView('dashboard');
    if (session?.mustChangePassword) setIsChangePasswordOpen(true);
  }), []);
  useEffect(() => {
    if (!currentUser.isAuthenticated) { setDocuments([]); setDars([]); setDistributions([]); setReRequests([]); setAuditLogs([]); return; }
    const stops = [subscribeCollection<MasterDocument>('dcs_documents', setDocuments), subscribeDars(currentUser, setDars), subscribeDistributions(currentUser, rows => setDistributions(rows.map(hydrateDistribution))), subscribeCopyRequests(currentUser, setReRequests), subscribeAuditForUser(currentUser, setAuditLogs)];
    return () => stops.forEach(stop => stop());
  }, [currentUser.isAuthenticated, currentUser.uid]);

  const needDar = (id: string) => { const row = dars.find(x => x.id === id); if (!row) throw new Error('ไม่พบ DAR'); return row; };
  const needDoc = (id: string) => { const row = documents.find(x => x.id === id); if (!row) throw new Error('ไม่พบเอกสาร'); return row; };
  const needDist = (id: string) => { const row = distributions.find(x => x.id === id); if (!row) throw new Error('ไม่พบรายการแจกจ่าย'); return row; };
  const login = async (username: string, password: string, remember = false): Promise<Result> => { try { setCurrentUser(await signInDcsUser(username, password, remember)); return { success: true, message: 'เข้าสู่ระบบสำเร็จ' }; } catch (e) { return { success: false, message: e instanceof Error ? e.message : 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }; } };
  const changePassword = async (oldPassword: string, newPassword: string): Promise<Result> => { try { await changeDcsPassword(oldPassword, newPassword); setCurrentUser(prev => ({ ...prev, mustChangePassword: false })); return { success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ' }; } catch { return { success: false, message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง หรือเซสชันหมดอายุ' }; } };
  const downloadControlledCopy = async (id: string, dept: Department, name: string, empId: string, position: string, signature: string, onProgress?: (message: string, percent: number) => void): Promise<Result> => { try { const downloadUrls = await acknowledgeDownload(currentUser, needDist(id), dept, { name, empId, position, signatureDataUrl: signature }, onProgress); return { success: true, message: 'บันทึกการรับเอกสารสำเร็จ', downloadUrl: downloadUrls[0], downloadUrls }; } catch (e) { return { success: false, message: e instanceof Error ? e.message : 'ดำเนินการไม่สำเร็จ' }; } };

  const value: DcsContextType = {
    currentUser, setUserName: name => setCurrentUser(prev => ({ ...prev, userName: name })), login, logout: () => { void signOutDcsUser(); setCurrentUser(emptySession()); }, changePassword, isChangePasswordOpen, setIsChangePasswordOpen: open => { if (!open && currentUser.mustChangePassword) return; setIsChangePasswordOpen(open); },
    documents, addDocument: input => saveMasterDocument(currentUser, input), updateDocumentRevision: (id, rev, date, darNo, reason, link) => reviseMasterDocument(currentUser, needDoc(id), rev, date, darNo, reason, link),
    dars, createDar: input => createDarRecord(currentUser, input), reviewDar: (id, status, remarks) => reviewDarRecord(currentUser, needDar(id), status, remarks), cancelDar: (id, reason) => cancelDarRecord(currentUser, needDar(id), reason), deleteDar: id => deleteDarDraftRecord(currentUser, needDar(id)), updateDarSignatures: patchDarRecord, registerDarToMasterList: id => registerDarRecord(currentUser, needDar(id)),
    distributions, createDistribution: (id, depts, instructions, files, onProgress) => createDistributionRecord(currentUser, needDoc(id), depts, instructions, files, onProgress), cancelDistribution: (id, reason) => manageDistributionRecord(currentUser, needDist(id), 'CANCEL', reason), deleteDistribution: id => manageDistributionRecord(currentUser, needDist(id), 'DELETE'), downloadControlledCopy,
    reRequests, createReRequest: (id, dept, name, empId, reason, details) => createCopyRequestRecord(currentUser, needDist(id), dept, name, empId, reason, details), reviewReRequest: async (id, approve, note, _days, file) => { const row = reRequests.find(x => x.id === id); if (!row) throw new Error('ไม่พบคำขอ'); await decideCopyRequest(currentUser, row, approve, note, file); },
    auditLogs, logAudit: (type, docNo, revision, description, details) => writeAudit(currentUser, type, docNo, revision, description, details), resetToDefaultData: () => {},
    activeView, setActiveView: view => { if (currentUser.allowedViews.includes(view as any)) setActiveView(view); }, selectedDocForModal, setSelectedDocForModal, selectedDistributionForSheet, setSelectedDistributionForSheet,
    selectedDistributionForDownload, setSelectedDistributionForDownload, selectedDistributionForReRequest, setSelectedDistributionForReRequest, isStamperOpen, setIsStamperOpen, stampDocData,
    openStamperForDoc: (docNo, docName, revision, dept) => { setStampDocData({ docNo, docName, revision, dept }); setIsStamperOpen(true); }, selectedDocumentForView, setSelectedDocumentForView, openDocumentViewer: setSelectedDocumentForView,
    updateDriveLink: async (id, type, newLink) => { if (type === 'DAR') await patchDarRecord(id, { incomingDriveLink: newLink }); else throw new Error('Master List ใช้ไฟล์ใน Firebase Storage เท่านั้น'); },
  };
  return <DcsContext.Provider value={value}>{children}</DcsContext.Provider>;
};
export const useDcs = () => { const value = useContext(DcsContext); if (!value) throw new Error('useDcs must be used within a DcsProvider'); return value; };
