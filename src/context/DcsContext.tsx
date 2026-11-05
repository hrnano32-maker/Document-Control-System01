import React, { createContext, useContext, useEffect, useState } from 'react';
import { hasDistributionAllocation, refreshDistributionSelection, getDepartmentReceipt, isReceiptTransferComplete } from '../utils/distributionAccess';
import type { AuditLogEntry, CopyReRequest, CurrentUserSession, DarCreateInput, DarRecord, DcsAnnouncement, Department, DistributionRecord, DocumentViewPayload, MasterDocument } from '../types';
import { changeDcsPassword, observeDcsAuth, signInDcsUser, signOutDcsUser, updateOwnSignature } from '../services/authService';
import { acknowledgeDownload, cancelAnnouncementRecord, cancelDarRecord, createAnnouncementRecord, createCopyRequestRecord, createDarRecord, createDistributionRecord, decideCopyRequest, manageDistributionRecord, deleteDarDraftRecord, patchDarRecord, recordAnnouncementActivity, registerDarRecord, reviewDarRecord, reviseMasterDocument, saveMasterDocument, subscribeAnnouncements, subscribeAuditForUser, subscribeMasterDocuments, subscribeMasterListRegistry, subscribeCopyRequests, subscribeDars, subscribeDistributions, updateAnnouncementRecord, writeAudit } from '../services/dcsRepository';

type Result = { success: boolean; message: string; downloadUrl?: string; downloadUrls?: string[]; transferId?: string };
interface DcsContextType {
  currentUser: CurrentUserSession; setUserName: (name: string) => void;
  login: (username: string, password: string, rememberMe?: boolean) => Promise<Result>; logout: () => void;
  changePassword: (oldPassword: string, newPassword: string) => Promise<Result>; isChangePasswordOpen: boolean; setIsChangePasswordOpen: (open: boolean) => void;
  updateSignature: (signatureDataUrl: string) => Promise<Result>;
  documents: MasterDocument[]; masterListDocuments: MasterDocument[]; addDocument: (doc: Omit<MasterDocument, 'id' | 'createdAt' | 'updatedAt' | 'revisionHistory'>) => Promise<void>;
  updateDocumentRevision: (docId: string, newRev: string, effectiveDate: string, darNo: string, reason: string, driveLink: string) => Promise<void>;
  dars: DarRecord[]; createDar: (dar: DarCreateInput, onProgress?: (message: string, percent: number) => void) => Promise<string>;
  reviewDar: (darId: string, status: 'APPROVED' | 'REJECTED' | 'UNDER_REVIEW', remarks: string) => Promise<void>;
  cancelDar: (darId: string, reason: string) => Promise<void>;
  deleteDar: (darId: string) => Promise<void>;
  updateDarSignatures: (darId: string, updates: Partial<DarRecord>) => Promise<void>; registerDarToMasterList: (darId: string) => Promise<void>;
  distributions: DistributionRecord[]; distributionSync: 'loading' | 'ready' | 'error'; retryDistributionSync: () => void;
  createDistribution: (docId: string, targetDepts: Department[], instructions: string, attachedFiles?: { name: string; size: string; type: string; dataUrl?: string }[], onProgress?: (message: string, percent: number) => void) => Promise<string>;
  cancelDistribution: (distributionId: string, reason: string) => Promise<void>;
  deleteDistribution: (distributionId: string) => Promise<void>;
  downloadControlledCopy: (distributionId: string, dept: Department, downloaderName: string, downloaderEmpId: string, downloaderPosition: string, signatureDataUrl: string, onProgress?: (message: string, percent: number) => void) => Promise<Result>;
  reRequests: CopyReRequest[];
  createReRequest: (distributionId: string, dept: Department, requestedBy: string, empId: string, reasonType: CopyReRequest['reasonType'], reasonDetails: string) => Promise<void>;
  reviewReRequest: (requestId: string, approve: boolean, note: string, extendDays?: number, files?: { name: string; size: string; type: string; dataUrl: string }[]) => Promise<void>;
  auditLogs: AuditLogEntry[]; logAudit: (actionType: AuditLogEntry['actionType'], docNo: string, revision: string, description: string, details?: Record<string, unknown>) => Promise<void>;
  announcements: DcsAnnouncement[];
  createAnnouncement: (input: Pick<DcsAnnouncement, 'title' | 'details' | 'category' | 'priority' | 'effectiveDate' | 'endDate' | 'targetDepartments' | 'requireAcknowledgement'>, files: File[]) => Promise<string>;
  updateAnnouncement: (id: string, updates: Pick<DcsAnnouncement, 'title' | 'details' | 'category' | 'priority' | 'effectiveDate' | 'endDate' | 'targetDepartments' | 'requireAcknowledgement'>) => Promise<void>;
  cancelAnnouncement: (id: string, reason: string) => Promise<void>;
  markAnnouncementRead: (id: string) => Promise<void>; acknowledgeAnnouncement: (id: string) => Promise<void>;
  resetToDefaultData: () => void; activeView: string; setActiveView: (view: string) => void;
  selectedDocForModal: MasterDocument | null; setSelectedDocForModal: (doc: MasterDocument | null) => void;
  selectedDistributionForSheet: DistributionRecord | null; setSelectedDistributionForSheet: (dist: DistributionRecord | null) => void;
  selectedDistributionForDownload: { distribution: DistributionRecord; dept: Department } | null; setSelectedDistributionForDownload: (data: { distribution: DistributionRecord; dept: Department } | null) => void;
  selectedDistributionForReRequest: { distribution: DistributionRecord; dept: Department; reasonType?: CopyReRequest['reasonType']; reasonDetails?: string } | null; setSelectedDistributionForReRequest: (data: { distribution: DistributionRecord; dept: Department; reasonType?: CopyReRequest['reasonType']; reasonDetails?: string } | null) => void;
  isStamperOpen: boolean; setIsStamperOpen: (open: boolean) => void; stampDocData: { docNo: string; docName: string; revision: string; dept: string } | null;
  openStamperForDoc: (docNo: string, docName: string, revision: string, dept: string) => void;
  selectedDocumentForView: DocumentViewPayload | null; setSelectedDocumentForView: (payload: DocumentViewPayload | null) => void; openDocumentViewer: (payload: DocumentViewPayload) => void;
  updateDriveLink: (id: string, type: 'DAR' | 'MASTER_DOC', newLink: string) => Promise<void>;
}

const emptySession = (): CurrentUserSession => ({ uid: '', currentDept: 'DCC', username: '', userName: '', userEmpId: '', userRole: 'STAFF', roleName: 'Department User', deptDescriptionTh: '', position: '', signaturePath: '', isAuthenticated: false, mustChangePassword: false, allowedViews: [] });
const DcsContext = createContext<DcsContextType | undefined>(undefined);
const hydrateDistribution = (row: DistributionRecord): DistributionRecord => ({ ...row, targets: (row.targets || []).map(target => { const receipt = getDepartmentReceipt(row, target.dept); if (!receipt) return target; const complete = isReceiptTransferComplete(receipt); return { ...target, isDownloaded: complete, status: complete ? 'DOWNLOADED' : 'PENDING', downloadTimestamp: receipt.downloadedAt, downloaderName: receipt.downloaderName, downloaderEmpId: receipt.downloaderEmpId, downloaderPosition: receipt.downloaderPosition, signatureDataUrl: null }; }) });

export const DcsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<CurrentUserSession>(emptySession());
  const [documents, setDocuments] = useState<MasterDocument[]>([]); const [masterListDocuments, setMasterListDocuments] = useState<MasterDocument[]>([]); const [dars, setDars] = useState<DarRecord[]>([]);
  const [distributions, setDistributions] = useState<DistributionRecord[]>([]); const [reRequests, setReRequests] = useState<CopyReRequest[]>([]); const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [distributionSyncState, setDistributionSyncState] = useState<{ key: string; status: 'loading' | 'ready' | 'error' }>({ key: '', status: 'loading' });
  const [requestSyncState, setRequestSyncState] = useState<{ key: string; status: 'loading' | 'ready' | 'error' }>({ key: '', status: 'loading' });
  const [distributionRetry, setDistributionRetry] = useState(0);
  const distributionKey = `${currentUser.uid}:${currentUser.currentDept}:${currentUser.userRole}`;
  const distributionStatus = distributionSyncState.key === distributionKey ? distributionSyncState.status : 'loading';
  const requestStatus = requestSyncState.key === distributionKey ? requestSyncState.status : 'loading';
  const distributionSync = distributionStatus === 'error' || requestStatus === 'error' ? 'error' : distributionStatus === 'ready' && requestStatus === 'ready' ? 'ready' : 'loading';
  const [announcements, setAnnouncements] = useState<DcsAnnouncement[]>([]);
  const [activeView, setActiveView] = useState('dashboard'); const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [selectedDocForModal, setSelectedDocForModal] = useState<MasterDocument | null>(null); const [selectedDistributionForSheet, setSelectedDistributionForSheet] = useState<DistributionRecord | null>(null);
  const [selectedDistributionForDownload, setSelectedDistributionForDownload] = useState<{ distribution: DistributionRecord; dept: Department } | null>(null);
  const [selectedDistributionForReRequest, setSelectedDistributionForReRequest] = useState<{ distribution: DistributionRecord; dept: Department; reasonType?: CopyReRequest['reasonType']; reasonDetails?: string } | null>(null);
  const [isStamperOpen, setIsStamperOpen] = useState(false); const [stampDocData, setStampDocData] = useState<{ docNo: string; docName: string; revision: string; dept: string } | null>(null);
  const [selectedDocumentForView, setSelectedDocumentForView] = useState<DocumentViewPayload | null>(null);

  useEffect(() => observeDcsAuth(session => {
    setCurrentUser(session || emptySession());
    if (!session) { setActiveView('dashboard'); setDistributionSyncState({ key: '', status: 'loading' }); setRequestSyncState({ key: '', status: 'loading' }); }
    if (session?.mustChangePassword) setIsChangePasswordOpen(true);
  }), []);
  useEffect(() => {
    setSelectedDistributionForDownload(null);
    setSelectedDistributionForReRequest(null);
    setSelectedDistributionForSheet(null);
    setSelectedDocumentForView(null);
    if (!currentUser.isAuthenticated) { setDocuments([]); setMasterListDocuments([]); setDars([]); setDistributions([]); setReRequests([]); setAuditLogs([]); setAnnouncements([]); return; }
    let active = true;
    setDistributionSyncState({ key: distributionKey, status: 'loading' });
    setRequestSyncState({ key: distributionKey, status: 'loading' });
    const receiveDistributions = (rows: DistributionRecord[], fromCache: boolean) => {
      if (!active) return;
      const latest = rows.map(hydrateDistribution);
      setDistributions(latest);
      setDistributionSyncState({ key: distributionKey, status: fromCache ? 'loading' : 'ready' });
      setSelectedDistributionForDownload(selected => refreshDistributionSelection(selected, latest));
      setSelectedDistributionForReRequest(selected => refreshDistributionSelection(selected, latest));
      setSelectedDistributionForSheet(selected => {
        if (!selected) return null;
        const updated = latest.find(row => row.id === selected.id);
        return updated && (currentUser.userRole === 'DCC_ADMIN' || hasDistributionAllocation(updated, currentUser.currentDept)) ? updated : null;
      });
      setSelectedDocumentForView(selected => {
        if (!selected?.distributionId || currentUser.userRole === 'DCC_ADMIN') return selected;
        return hasDistributionAllocation(latest.find(row => row.id === selected.distributionId), currentUser.currentDept) ? selected : null;
      });
    };
    const stops = [subscribeMasterDocuments(currentUser, setDocuments), subscribeMasterListRegistry(setMasterListDocuments), subscribeDars(currentUser, setDars), subscribeDistributions(currentUser, receiveDistributions, error => { console.error('DISTRIBUTION_SYNC_FAILED', error); if (active) setDistributionSyncState({ key: distributionKey, status: 'error' }); }), subscribeCopyRequests(currentUser, (rows, fromCache) => { if (active) { setReRequests(rows); setRequestSyncState({ key: distributionKey, status: fromCache ? 'loading' : 'ready' }); } }, error => { console.error('COPY_REQUEST_SYNC_FAILED', error); if (active) setRequestSyncState({ key: distributionKey, status: 'error' }); }), subscribeAuditForUser(currentUser, setAuditLogs), subscribeAnnouncements(currentUser, setAnnouncements)];
    return () => { active = false; stops.forEach(stop => stop()); };
  }, [currentUser.isAuthenticated, currentUser.uid, currentUser.currentDept, currentUser.userRole, distributionRetry]);

  const needDar = (id: string) => { const row = dars.find(x => x.id === id); if (!row) throw new Error('ไม่พบ DAR'); return row; };
  const needDoc = (id: string) => { const row = documents.find(x => x.id === id); if (!row) throw new Error('ไม่พบเอกสาร'); return row; };
  const needDist = (id: string) => { const row = distributions.find(x => x.id === id); if (!row) throw new Error('ไม่พบรายการแจกจ่าย'); return row; };
  const login = async (username: string, password: string, remember = false): Promise<Result> => { try { setCurrentUser(await signInDcsUser(username, password, remember)); return { success: true, message: 'เข้าสู่ระบบสำเร็จ' }; } catch (e) { return { success: false, message: e instanceof Error ? e.message : 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }; } };
  const changePassword = async (oldPassword: string, newPassword: string): Promise<Result> => { try { await changeDcsPassword(oldPassword, newPassword); setCurrentUser(prev => ({ ...prev, mustChangePassword: false })); return { success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ' }; } catch { return { success: false, message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง หรือเซสชันหมดอายุ' }; } };
  const updateSignature = async (signatureDataUrl: string): Promise<Result> => { try { const signaturePath = await updateOwnSignature(signatureDataUrl); setCurrentUser(prev => ({ ...prev, signaturePath })); return { success: true, message: 'บันทึกลายเซ็นใหม่สำเร็จ' }; } catch (error) { return { success: false, message: error instanceof Error ? error.message : 'บันทึกลายเซ็นไม่สำเร็จ' }; } };
  const downloadControlledCopy = async (id: string, dept: Department, name: string, empId: string, position: string, signature: string, onProgress?: (message: string, percent: number) => void): Promise<Result> => { try { const { downloadUrls, transferId } = await acknowledgeDownload(currentUser, needDist(id), dept, { name, empId, position, signatureDataUrl: signature }, onProgress); return { success: true, message: 'บันทึกลายเซ็นแล้ว', downloadUrl: downloadUrls[0], downloadUrls, transferId }; } catch (e) { return { success: false, message: e instanceof Error ? e.message : 'ดำเนินการไม่สำเร็จ' }; } };

  const value: DcsContextType = {
    currentUser, setUserName: name => setCurrentUser(prev => ({ ...prev, userName: name })), login, logout: () => { void signOutDcsUser(); setDistributionSyncState({ key: '', status: 'loading' }); setRequestSyncState({ key: '', status: 'loading' }); setCurrentUser(emptySession()); }, changePassword, updateSignature, isChangePasswordOpen, setIsChangePasswordOpen: open => { if (!open && currentUser.mustChangePassword) return; setIsChangePasswordOpen(open); },
    documents, masterListDocuments, addDocument: input => saveMasterDocument(currentUser, input), updateDocumentRevision: (id, rev, date, darNo, reason, link) => reviseMasterDocument(currentUser, needDoc(id), rev, date, darNo, reason, link),
    dars, createDar: (input, onProgress) => createDarRecord(currentUser, input, onProgress), reviewDar: (id, status, remarks) => reviewDarRecord(currentUser, needDar(id), status, remarks), cancelDar: (id, reason) => cancelDarRecord(currentUser, needDar(id), reason), deleteDar: id => deleteDarDraftRecord(currentUser, needDar(id)), updateDarSignatures: patchDarRecord, registerDarToMasterList: id => registerDarRecord(currentUser, needDar(id)),
    distributions, distributionSync, retryDistributionSync: () => setDistributionRetry(value => value + 1), createDistribution: (id, depts, instructions, files, onProgress) => createDistributionRecord(currentUser, needDoc(id), depts, instructions, files, onProgress), cancelDistribution: (id, reason) => manageDistributionRecord(currentUser, needDist(id), 'CANCEL', reason), deleteDistribution: id => manageDistributionRecord(currentUser, needDist(id), 'DELETE'), downloadControlledCopy,
    reRequests, createReRequest: (id, dept, name, empId, reason, details) => createCopyRequestRecord(currentUser, needDist(id), dept, name, empId, reason, details), reviewReRequest: async (id, approve, note, _days, files) => { const row = reRequests.find(x => x.id === id); if (!row) throw new Error('ไม่พบคำขอ'); await decideCopyRequest(currentUser, row, approve, note, files); },
    announcements, createAnnouncement: (input, files) => createAnnouncementRecord(currentUser, input, files), updateAnnouncement: (id, updates) => updateAnnouncementRecord(currentUser, id, updates), cancelAnnouncement: (id, reason) => cancelAnnouncementRecord(currentUser, id, reason), markAnnouncementRead: id => recordAnnouncementActivity(currentUser, id, 'READ'), acknowledgeAnnouncement: id => recordAnnouncementActivity(currentUser, id, 'ACKNOWLEDGE'),
    auditLogs, logAudit: (type, docNo, revision, description, details) => writeAudit(currentUser, type, docNo, revision, description, details), resetToDefaultData: () => {},
    activeView, setActiveView: view => { if (currentUser.allowedViews.includes(view as any)) setActiveView(view); }, selectedDocForModal, setSelectedDocForModal, selectedDistributionForSheet, setSelectedDistributionForSheet,
    selectedDistributionForDownload, setSelectedDistributionForDownload, selectedDistributionForReRequest, setSelectedDistributionForReRequest, isStamperOpen, setIsStamperOpen, stampDocData,
    openStamperForDoc: (docNo, docName, revision, dept) => { setStampDocData({ docNo, docName, revision, dept }); setIsStamperOpen(true); }, selectedDocumentForView, setSelectedDocumentForView, openDocumentViewer: setSelectedDocumentForView,
    updateDriveLink: async (id, type, newLink) => { if (type === 'DAR') await patchDarRecord(id, { incomingDriveLink: newLink }); else throw new Error('Master List ใช้ไฟล์ใน Firebase Storage เท่านั้น'); },
  };
  return <DcsContext.Provider value={value}>{children}</DcsContext.Provider>;
};
export const useDcs = () => { const value = useContext(DcsContext); if (!value) throw new Error('useDcs must be used within a DcsProvider'); return value; };

