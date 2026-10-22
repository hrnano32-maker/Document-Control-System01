import React, { useState, useEffect, useRef } from 'react';
import { useDcs } from '../context/DcsContext';
import { downloadDarAttachmentFromServer, validateDarEffectiveDates, correctDarRecord } from '../services/dcsRepository';
import {
  DarRecord,
  DarAdditionalDocument,
  DarRequestType,
  DocumentType,
  DOCUMENT_TYPES,
  DEPARTMENTS,
  Department,
  MasterDocument,
} from '../types';
import {
  FileText,
  Plus,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock,
  Search,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Send,
  X,
  Sparkles,
  ArrowRight,
  FolderSync,
  FileCheck2,
  Printer,
  Upload,
  Download,
  Image as ImageIcon,
  Trash2,
  Paperclip,
  PhoneCall,
  RefreshCw,
  ChevronDown,
  Check,
  Eye,
  PenLine,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { MAX_DAR_PDFS, formatPdfSize, validateDarPdf, getDarAttachments, saveDownloadedBlob } from '../utils/darAttachments';
import { DarPrintModal } from './DarPrintModal';
import { DarLivePreview } from './DarLivePreview';
import { analyzeRevisionSequence, getNextRevision, formatRevision } from '../utils/revisionHelper';

export const DarManagement: React.FC = () => {
  const {
    documents,
    dars,
    currentUser,
    createDar,
    reviewDar,
    cancelDar,
    deleteDar,
    registerDarToMasterList,
    setActiveView,
    openDocumentViewer,
  } = useDcs();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const DAR_PAGE_SIZE = 10;
  const [darPage, setDarPage] = useState(1);
  const submitInFlight = useRef(false);
  const [isSubmittingDar, setIsSubmittingDar] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedDarForReview, setSelectedDarForReview] = useState<DarRecord | null>(null);
  const [selectedDarForPrint, setSelectedDarForPrint] = useState<DarRecord | null>(null);
  const [showMobileLivePreview, setShowMobileLivePreview] = useState(false);
  const [registeringDarId, setRegisteringDarId] = useState<string | null>(null);
  const [attachmentDar, setAttachmentDar] = useState<DarRecord | null>(null);
  const [darUploadProgress, setDarUploadProgress] = useState({ message: '', percent: 0 });
  const [downloadingDarId, setDownloadingDarId] = useState<string | null>(null);

  const [editingDar, setEditingDar] = useState<DarRecord | null>(null);
  const [correction, setCorrection] = useState({ docNo: '', docNameTh: '', docNameEn: '', targetEffectiveDate: '', previousEffectiveDate: '', reasonForChange: '', changeDetails: '', currentRevision: '', proposedRevision: '' });
  const correctionDetailsOnly = editingDar?.status === 'APPROVED' || editingDar?.status === 'REGISTERED';
  const [correctionRows, setCorrectionRows] = useState<DarAdditionalDocument[]>([]);
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionError, setCorrectionError] = useState('');
  const [savingCorrection, setSavingCorrection] = useState(false);
  const openDarCorrection = (dar: DarRecord) => {
    // The details dialog may have been open while the live DAR list refreshed.
    dar = dars.find(item => item.id === dar.id) || dar;
    if (!isDcc || dar.status === 'CANCELLED') return;
    setSelectedDarForPrint(null);
    setCorrectionRows((dar.additionalDocuments || []).map(row => ({ ...row })));
    setEditingDar(dar);
    setCorrection({ docNo: dar.docNo, docNameTh: dar.docNameTh, docNameEn: dar.docNameEn || '', targetEffectiveDate: dar.targetEffectiveDate, previousEffectiveDate: dar.previousEffectiveDate || '', reasonForChange: dar.reasonForChange, changeDetails: dar.changeDetails || '', currentRevision: dar.currentRevision || '', proposedRevision: dar.proposedRevision || '' });
    setCorrectionReason(''); setCorrectionError('');
  };
  const saveDarCorrection = async () => {
    if (!editingDar || savingCorrection) return;
    setCorrectionError(''); setSavingCorrection(true);
    try {
      await correctDarRecord(currentUser, editingDar, { ...correction, additionalDocuments: correctionRows }, correctionReason);
      setEditingDar(null); setSelectedDarForReview(null);
      alert('บันทึกการแก้ไข DAR สำเร็จ พร้อมบันทึกประวัติ');
    } catch (error) {
      setCorrectionError(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ');
    } finally { setSavingCorrection(false); }
  };

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedDarForPrint) setSelectedDarForPrint(null);
        if (selectedDarForReview) setSelectedDarForReview(null);
        if (isCreateModalOpen && !submitInFlight.current) setIsCreateModalOpen(false);
      }
    };
    if (selectedDarForPrint || selectedDarForReview || isCreateModalOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDarForPrint, selectedDarForReview, isCreateModalOpen]);

  // DAR Creation Form state
  const [reqType, setReqType] = useState<DarRequestType>('REVISION');
  const [reqDept, setReqDept] = useState<Department>(currentUser.currentDept === 'DCC' ? 'Production 1' : currentUser.currentDept);
  const [requesterName, setRequesterName] = useState('');
  const [requesterTitle, setRequesterTitle] = useState(currentUser.position);
  const [targetEffectiveDate, setTargetEffectiveDate] = useState(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [previousEffectiveDate, setPreviousEffectiveDate] = useState('');
  const [docNo, setDocNo] = useState('');
  const [docNameTh, setDocNameTh] = useState('');
  const [docNameEn, setDocNameEn] = useState('');
  const [docType, setDocType] = useState<DocumentType>('QP');
  const [currentRevision, setCurrentRevision] = useState('02');
  const [proposedRevision, setProposedRevision] = useState('03');
  const [reasonForChange, setReasonForChange] = useState('');
  const [changeDetails, setChangeDetails] = useState('');
  const [additionalDocuments, setAdditionalDocuments] = useState<DarAdditionalDocument[]>([]);
  const [skippedRevisionReason, setSkippedRevisionReason] = useState('');
  const [showDocSelector, setShowDocSelector] = useState(false);
  const [docSearchKeyword, setDocSearchKeyword] = useState('');
  const [isoClause, setIsoClause] = useState('ISO 9001:2015 Clause 7.5.3');
  const [formError, setFormError] = useState('');

  // File Upload State in DAR Creation
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isReadingPdfs, setIsReadingPdfs] = useState(false);
  const readingPdfs = useRef(false);
  const [requesterSignature, setRequesterSignature] = useState<string | undefined>(undefined);
  const [deptApproverName, setDeptApproverName] = useState('');
  const [deptApproverTitle, setDeptApproverTitle] = useState('');
  const [deptApproverDate, setDeptApproverDate] = useState(new Date().toISOString().split('T')[0]);
  const [deptApproverSignature, setDeptApproverSignature] = useState<string | undefined>(undefined);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const handleDarAttachments = async (files: File[]) => {
    if (!files.length || readingPdfs.current || submitInFlight.current) return;
    setFormError('');
    if (attachedFiles.length + files.length > MAX_DAR_PDFS) {
      setFormError(`แนบได้สูงสุด ${MAX_DAR_PDFS} ไฟล์ต่อใบ DAR`); return;
    }
    readingPdfs.current = true; setIsReadingPdfs(true);
    try {
      for (const file of files) await validateDarPdf(file, file.name);
      setAttachedFiles(previous => [...previous, ...files]);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'อ่านไฟล์ PDF ไม่สำเร็จ');
    } finally { readingPdfs.current = false; setIsReadingPdfs(false); }
  };

  // Distribution Holders requested in DAR (ตามแบบฟอร์ม FM-QS-001-01)
  const [darDistributionHolders, setDarDistributionHolders] = useState<{ checked: boolean; dept: Department; position: string; copies: string }[]>(
    DEPARTMENTS.filter(item => item.id !== 'DCC').map(item => ({
      checked: false,
      dept: item.id,
      position: `ผู้รับผิดชอบเอกสารประจำ ${item.nameTh}`,
      copies: '1',
    }))
  );

  // DCC Review remarks state
  const [reviewRemarks, setReviewRemarks] = useState('');

  const isDcc = currentUser.userRole === 'DCC_ADMIN';
  const isDccOnlyRecipient = (dept: Department) => dept === 'QMR' || dept === 'Customer Rep';

  const handleDownloadDarDraft = async (dar: DarRecord, index?: number) => {
    const files = getDarAttachments(dar);
    if (index === undefined && files.length > 1) { setAttachmentDar(dar); return; }
    if (downloadingDarId) return;
    const file = files[index ?? 0];
    if (!file) { alert('DAR นี้ไม่มีไฟล์แนบในระบบ'); return; }
    setDownloadingDarId(dar.id);
    try { saveDownloadedBlob(await downloadDarAttachmentFromServer(dar.id, index ?? 0), file.name); }
    catch (error) { alert(error instanceof Error ? error.message : 'ดาวน์โหลดไฟล์แนบไม่สำเร็จ'); }
    finally { setDownloadingDarId(null); }
  };

  const openDarAttachment = (dar: DarRecord, index?: number) => {
    const files = getDarAttachments(dar);
    if (index === undefined && files.length > 1) { setAttachmentDar(dar); return; }
    const file = files[index ?? 0];
    if (!file) { alert('DAR นี้ไม่มีไฟล์แนบในระบบ'); return; }
    setAttachmentDar(null);
    openDocumentViewer({ title: dar.docNameTh, docNo: dar.docNo, docNameTh: dar.docNameTh, docNameEn: dar.docNameEn, docType: dar.docType, revision: dar.proposedRevision, dept: dar.requestDept,
      fileName: file.name, fileSize: file.size, fileType: file.type, fileStoragePath: file.storagePath, darId: dar.id, darAttachmentIndex: index ?? 0,
      reasonForChange: dar.reasonForChange, changeDetails: dar.changeDetails, isoClause: dar.isoClause });
  };

  const renderDarAttachments = (dar: DarRecord) => <div className="space-y-2" data-dar-attachments={dar.id}>
    <h4 className="text-sm font-bold text-indigo-950">ไฟล์แนบ {getDarAttachments(dar).length} ไฟล์</h4>
    {getDarAttachments(dar).map((file, index) => <div key={file.storagePath} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm">
      <div className="min-w-0 flex-1"><p className="break-all font-semibold">{index + 1}. {file.name}</p><p className="text-slate-600">{file.size}</p></div>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={() => openDarAttachment(dar, index)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800">เปิดดู</button>
        <button type="button" disabled={downloadingDarId !== null} onClick={() => handleDownloadDarDraft(dar, index)} className="rounded-lg bg-indigo-600 px-3 py-2 font-semibold text-white disabled:opacity-50">{downloadingDarId === dar.id ? 'กำลังดาวน์โหลด...' : 'ดาวน์โหลด'}</button>
      </div>
    </div>)}
    {!getDarAttachments(dar).length && <p className="text-sm text-slate-600">ไม่มีไฟล์แนบในระบบ</p>}
  </div>;

  // Real-time Revision Sequence Analysis
  const revAnalysis = analyzeRevisionSequence(
    docNo,
    reqType,
    currentRevision,
    proposedRevision,
    documents
  );

  // Handle selecting an existing document from Master List
  const handleSelectMasterDoc = (doc: MasterDocument) => {
    setDocNo(doc.docNo);
    setDocNameTh(doc.docNameTh);
    setDocNameEn(doc.docNameEn);
    setDocType(doc.docType);
    setReqDept(doc.ownerDept);
    if (reqType === 'NEW') setReqType('REVISION');
    setCurrentRevision(doc.currentRevision);
    setProposedRevision(getNextRevision(doc.currentRevision));
    setSkippedRevisionReason('');
    setShowDocSelector(false);
  };

  useEffect(() => {
    const existing = documents.find(item => item.docNo.trim().toUpperCase() === docNo.trim().toUpperCase());
    setPreviousEffectiveDate(reqType === 'NEW' ? '' : existing?.effectiveDate || '');
  }, [docNo, reqType, documents]);

  // Filter dars
  const filteredDars = dars.filter(dar => {
    // Department users can only see their own department's DARs
    if (!isDcc && dar.requestDept !== currentUser.currentDept) {
      return false;
    }

    const matchSearch =
      dar.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      dar.docNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      dar.docNameTh.toLowerCase().includes(searchQuery.toLowerCase()) ||
      dar.requesterName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchStatus = statusFilter === 'ALL' || dar.status === statusFilter;
    const matchType = typeFilter === 'ALL' || dar.requestType === typeFilter;

    return matchSearch && matchStatus && matchType;
  });

  const totalDarPages = Math.max(1, Math.ceil(filteredDars.length / DAR_PAGE_SIZE));
  const visiblePage = Math.min(darPage, totalDarPages);
  const pagedDars = filteredDars.slice((visiblePage - 1) * DAR_PAGE_SIZE, visiblePage * DAR_PAGE_SIZE);
  useEffect(() => { setDarPage(1); }, [searchQuery, statusFilter, typeFilter, currentUser.uid, currentUser.currentDept]);
  useEffect(() => { setDarPage(page => Math.min(page, totalDarPages)); }, [totalDarPages]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitInFlight.current || readingPdfs.current) return;
    setFormError('');

    if (!docNo.trim() || !docNameTh.trim()) {
      setFormError('กรุณากรอกรหัสเอกสารและชื่อภาษาไทย');
      return;
    }

    if (!attachedFiles.length) { setFormError('กรุณาแนบไฟล์ PDF อย่างน้อย 1 ไฟล์'); return; }

    if (!reasonForChange.trim()) {
      setFormError('กรุณาระบุเหตุผลความจำเป็นในการขอดำเนินการ');
      return;
    }

    if (!requesterSignature) {
      setFormError('กรุณาลงลายเซ็นผู้ยื่นคำขอก่อนส่งใบ DAR');
      return;
    }

    if (!deptApproverName.trim() || !deptApproverTitle.trim() || !deptApproverDate || !deptApproverSignature) {
      setFormError('กรุณากรอกชื่อ ตำแหน่ง วันที่ และลายเซ็นผู้อนุมัติในหน่วยงานให้ครบก่อนส่งใบ DAR');
      return;
    }

    // Revision skip validation enforcement
    if (revAnalysis.isSkipped && !skippedRevisionReason.trim()) {
      setFormError(
        `⚠️ ตรวจพบการข้าม Revision (${revAnalysis.warningMessage}) หากในระบบมี Rev.${revAnalysis.systemCurrentRev || currentRevision} แล้วต้องการขึ้นทะเบียนเป็น Rev.${proposedRevision} กรุณาระบุ "เหตุผลความจำเป็นในการข้าม Revision" หรือติดต่อ DCC ก่อนบันทึกใบ DAR`
      );
      return;
    }

    const filledAdditionalDocuments = additionalDocuments.filter(item =>
      item.docNo.trim() || item.docNameTh.trim() || item.docNameEn?.trim() || item.previousEffectiveDate || item.revision.trim() || item.reason.trim()
    );
    if (filledAdditionalDocuments.some(item => !item.docNo.trim() || !item.docNameTh.trim() || !item.revision.trim() || !item.reason.trim())) {
      setFormError('รายการเอกสารเพิ่มเติมต้องกรอกหมายเลข ชื่อเอกสาร ฉบับที่ และเหตุผลให้ครบ');
      return;
    }

    submitInFlight.current = true;
    setIsSubmittingDar(true);
    setDarUploadProgress({ message: 'กำลังตรวจสอบไฟล์ PDF', percent: 0 });
    try {
      validateDarEffectiveDates({ requestType: reqType, targetEffectiveDate, previousEffectiveDate, additionalDocuments: filledAdditionalDocuments });
      await createDar({
      requestType: reqType,
      requestDept: reqDept,
      requesterName: requesterName.trim(),
      requesterTitle: requesterTitle.trim(),
      targetEffectiveDate,
      previousEffectiveDate: reqType === 'NEW' ? undefined : previousEffectiveDate,
      docNo: docNo.trim().toUpperCase(),
      docNameTh: docNameTh.trim(),
      docNameEn: docNameEn.trim(),
      docType,
      currentRevision: reqType === 'NEW' ? 'N/A' : currentRevision.trim(),
      proposedRevision: reqType === 'OBSOLETE' ? 'OBSOLETE' : proposedRevision.trim(),
      reasonForChange: reasonForChange.trim(),
      changeDetails: changeDetails.trim(),
      additionalDocuments: filledAdditionalDocuments.map(item => ({ ...item, docNo: item.docNo.trim().toUpperCase(), docNameTh: item.docNameTh.trim(), docNameEn: item.docNameEn?.trim() || '', revision: item.revision.trim(), reason: item.reason.trim() })),
      isSkippedRevision: revAnalysis.isSkipped,
      skippedRevisionReason: revAnalysis.isSkipped ? skippedRevisionReason.trim() : undefined,
      systemCurrentRevision: revAnalysis.systemCurrentRev || undefined,
      isoClause: isoClause.trim(),
      attachments: attachedFiles.map(file => ({ name: file.name, size: formatPdfSize(file.size), type: 'application/pdf', file })),
      requesterSignature: requesterSignature,
      deptApproverName: deptApproverName.trim(),
      deptApproverTitle: deptApproverTitle.trim(),
      deptApproverDate,
      deptApproverSignature,
      distributionHolders: darDistributionHolders,
      }, (message, percent) => setDarUploadProgress({ message, percent }));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'ส่งใบ DAR ไม่สำเร็จ');
      return;
    } finally {
      submitInFlight.current = false;
      setIsSubmittingDar(false);
    }

    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.7 },
    });

    setIsCreateModalOpen(false);
    setAttachedFiles([]);
  };

  const handleRegisterToMasterList = async (darId: string) => {
    if (registeringDarId) return;
    setRegisteringDarId(darId);
    try {
      await registerDarToMasterList(darId);
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.5 },
      });
      setSelectedDarForReview(null);
      alert('อนุมัติและขึ้นทะเบียนสำเร็จ ระบบสร้างรายการแจกจ่ายและประทับตรา Controlled Copy อัตโนมัติแล้ว');
      setActiveView('masterlist');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'ขึ้นทะเบียนไม่สำเร็จ');
    } finally {
      setRegisteringDarId(null);
    }
  };

  const handleCancelDar = async (dar: DarRecord) => {
    const reason = window.prompt(`ระบุเหตุผลที่ต้องการยกเลิก ${dar.id}\n\nรายการจะถูกเก็บไว้เป็นประวัติและไม่สามารถนำไปอนุมัติหรือขึ้นทะเบียนได้`);
    if (reason === null) return;
    if (!reason.trim()) return alert('กรุณาระบุเหตุผลการยกเลิก');
    if (!window.confirm(`ยืนยันยกเลิก ${dar.id} ใช่หรือไม่?`)) return;
    try { await cancelDar(dar.id, reason); setSelectedDarForReview(null); }
    catch (error) { alert(error instanceof Error ? error.message : 'ยกเลิก DAR ไม่สำเร็จ'); }
  };

  const handleDeleteDar = async (dar: DarRecord) => {
    if (!window.confirm(`ลบ ${dar.id} และไฟล์แนบถาวรใช่หรือไม่?\n\nเมื่อลบแล้วจะไม่สามารถกู้คืนได้`)) return;
    try { await deleteDar(dar.id); setSelectedDarForReview(null); }
    catch (error) { alert(error instanceof Error ? error.message : 'ลบ DAR ไม่สำเร็จ'); }
  };

  return (
    <div id="dcs-dar-view" className="space-y-3 pb-4">
      
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[17px] leading-6 font-bold text-slate-900 tracking-tight">
              ใบขอดำเนินการเอกสาร (DAR - Document Action Request)
            </h1>
            <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-0.5 rounded-full border border-amber-200">
              {filteredDars.length} รายการ
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            กระบวนการขอจัดทำเอกสารใหม่ / แก้ไข / ยกเลิก: ผู้ออก DAR อัปโหลดไฟล์ร่าง ➔ DCC ดาวน์โหลดตรวจสอบ ➔ DCC อัปโหลดฉบับสมบูรณ์เพื่อแจกจ่าย
          </p>
        </div>

        <button
          onClick={() => {
            setDocNo('');
            setDocNameTh('');
            setDocNameEn('');
            setReasonForChange('');
            setChangeDetails('');
            setAdditionalDocuments([]);
            setFormError('');
            setIsCreateModalOpen(true);
          }}
          className="shrink-0 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          สร้าง DAR ใหม่
        </button>
      </div>

      {/* Filter and Search */}
      <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="ค้นหาเลขที่ DAR, รหัสเอกสาร, ผู้ขอ..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
            />
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
            >
              <option value="ALL">📁 ทุกสถานะ DAR (All Statuses)</option>
              <option value="PENDING_REVIEW">🟡 รอ DCC ตรวจสอบ (Pending Review)</option>
              <option value="UNDER_REVIEW">🔍 อยู่ระหว่างตรวจสอบ (Under Review)</option>
              <option value="APPROVED">🟢 อนุมัติแล้ว (Approved)</option>
              <option value="REGISTERED">⭐ ขึ้นทะเบียนแล้ว (Registered)</option>
              <option value="REJECTED">🔴 ไม่อนุมัติ / ตีกลับ (Rejected)</option>
              <option value="CANCELLED">⚫ ยกเลิกคำขอแล้ว (Cancelled)</option>
            </select>
          </div>

          <div>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
            >
              <option value="ALL">📋 ทุกประเภทคำขอ (New / Revision / Obsolete)</option>
              <option value="NEW">✨ ขอจัดทำเอกสารใหม่ (NEW)</option>
              <option value="REVISION">✏️ ขอแก้ไข / ปรับปรุง (REVISION)</option>
              <option value="OBSOLETE">🗑️ ขอยกเลิกการใช้ (OBSOLETE)</option>
            </select>
          </div>

        </div>
      </div>

      {/* One compact row per DAR, ten records per page. */}
      <section aria-label="รายการ DAR" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] table-fixed text-left text-[13px] leading-[18px]">
            <colgroup>
              <col style={{ width: '12%' }} /><col style={{ width: '22%' }} />
              <col style={{ width: '10%' }} /><col style={{ width: '8%' }} />
              <col style={{ width: '10%' }} /><col style={{ width: '14%' }} />
              <col style={{ width: '24%' }} />
            </colgroup>
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                {['เลขที่ DAR', 'รหัส / ชื่อเอกสาร', 'หน่วยงาน', 'Revision', 'เหตุผล', 'สถานะ / ประเภท', 'จัดการเอกสาร'].map(label => (
                  <th key={label} scope="col" className="px-3 py-2 font-semibold">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedDars.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">ไม่พบรายการ DAR ตามเงื่อนไข</td></tr>
              ) : pagedDars.map(dar => (
                <tr key={dar.id} data-dar-id={dar.id} className="hover:bg-indigo-50/30">
                  <td className="px-3 py-1.5 align-middle">
                    <button type="button" onClick={() => { setSelectedDarForReview(dar); setReviewRemarks(dar.dccRemarks || ''); }} className="font-mono font-semibold text-indigo-700 hover:underline whitespace-nowrap">{dar.id}</button>
                  </td>
                  <td className="px-3 py-1.5 align-middle">
                    <div className="truncate font-mono font-semibold text-slate-900" title={dar.docNo}>{dar.docNo}</div>
                    <div className="truncate text-slate-700" title={dar.docNameTh}>{dar.docNameTh}</div>
                  </td>
                  <td className="px-3 py-1.5 align-middle"><div className="truncate" title={dar.requestDept}>{dar.requestDept}</div></td>
                  <td className="px-3 py-1.5 align-middle">
                    <div className="whitespace-nowrap font-mono font-semibold text-indigo-700">{dar.currentRevision} → {dar.proposedRevision}</div>
                    {(dar.isSkippedRevision || dar.skippedRevisionReason) && (
                      <span className="flex items-center gap-1 text-[11px] text-amber-800" title={dar.skippedRevisionReason || `ข้าม Revision ${dar.currentRevision} → ${dar.proposedRevision}`}><AlertTriangle className="h-3 w-3 shrink-0" /> ข้าม Rev.</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 align-middle"><div className="line-clamp-2 text-slate-600" title={dar.reasonForChange}>{dar.reasonForChange}</div></td>
                  <td className="px-3 py-1.5 align-middle">
                    <div className={`truncate font-semibold ${
                      dar.status === 'PENDING_REVIEW' ? 'text-amber-800' :
                      dar.status === 'UNDER_REVIEW' ? 'text-cyan-800' :
                      dar.status === 'APPROVED' ? 'text-blue-800' :
                      dar.status === 'REGISTERED' ? 'text-emerald-800' : 'text-rose-800'
                    }`}>
                      {dar.status === 'PENDING_REVIEW' && '⏳ รอ DCC ตรวจสอบ'}
                      {dar.status === 'UNDER_REVIEW' && '🔍 อยู่ระหว่างตรวจ'}
                      {dar.status === 'APPROVED' && '🟢 อนุมัติแล้ว'}
                      {dar.status === 'REGISTERED' && '⭐ ขึ้นทะเบียนแล้ว'}
                      {dar.status === 'REJECTED' && '🔴 ไม่อนุมัติ'}
                      {dar.status === 'CANCELLED' && '⚫ ยกเลิกคำขอแล้ว'}
                    </div>
                    <div className="truncate text-slate-500">{dar.requestType === 'NEW' ? 'เอกสารใหม่' : dar.requestType === 'REVISION' ? 'ขอแก้ไข' : 'ขอยกเลิก'}</div>
                  </td>
                  <td className="px-3 py-1.5 align-middle">
                    <div className="flex items-center gap-1 whitespace-nowrap [&>button]:inline-flex [&>button]:h-[30px] [&>button]:min-w-[30px] [&>button]:shrink-0 [&>button]:items-center [&>button]:justify-center [&>button]:rounded-md [&>button]:border [&>button]:disabled:cursor-not-allowed [&>button]:disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4">
                      <button type="button" title="ดาวน์โหลดไฟล์แนบ" aria-label={`ดาวน์โหลด ${dar.id}`} onClick={() => handleDownloadDarDraft(dar)} disabled={downloadingDarId !== null} className="border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
                        {downloadingDarId === dar.id ? <RefreshCw className="animate-spin" /> : <Download />}
                      </button>
                      <button type="button" title="เปิดดูเอกสาร" aria-label={`เปิดดู ${dar.id}`} onClick={() => openDarAttachment(dar)} className="border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"><Eye /></button>
                      <button type="button" title="พิมพ์ A4" aria-label={`พิมพ์ ${dar.id}`} onClick={() => setSelectedDarForPrint(dar)} className="border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"><Printer /></button>
                      <button type="button" title="รายละเอียด / พิจารณา" aria-label={`รายละเอียด / พิจารณา ${dar.id}`} onClick={() => { setSelectedDarForReview(dar); setReviewRemarks(dar.dccRemarks || ''); }} className="border-slate-900 bg-slate-900 text-white hover:bg-slate-800"><FileText /></button>
                      {isDcc && <button type="button" title="DCC แก้ไขข้อมูล" aria-label={`DCC แก้ไขข้อมูล ${dar.id}`} onClick={() => openDarCorrection(dar)} className="border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50"><PenLine /></button>}
                      {dar.status === 'APPROVED' && currentUser.userRole === 'DCC_ADMIN' && <button type="button" title="ขึ้นทะเบียนและแจกจ่ายอัตโนมัติ" aria-label={`ขึ้นทะเบียนและแจกจ่าย ${dar.id}`} onClick={() => handleRegisterToMasterList(dar.id)} disabled={registeringDarId !== null} className="border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100">{registeringDarId === dar.id ? <RefreshCw className="animate-spin" /> : <Sparkles />}</button>}
                      {['PENDING_REVIEW','UNDER_REVIEW','REJECTED'].includes(dar.status) && (currentUser.userRole === 'DCC_ADMIN' || currentUser.currentDept === dar.requestDept) && <button type="button" title="ลบ DAR" aria-label={`ลบ ${dar.id}`} onClick={() => handleDeleteDar(dar)} className="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"><Trash2 /></button>}
                      {dar.status === 'APPROVED' && currentUser.userRole === 'DCC_ADMIN' && <button type="button" title="DCC ยกเลิก" aria-label={`DCC ยกเลิก ${dar.id}`} onClick={() => handleCancelDar(dar)} className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"><X /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <nav aria-label="เปลี่ยนหน้ารายการ DAR" className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 text-[13px]">
          <span className="text-slate-600">แสดง {filteredDars.length ? (visiblePage - 1) * DAR_PAGE_SIZE + 1 : 0}–{Math.min(visiblePage * DAR_PAGE_SIZE, filteredDars.length)} จาก {filteredDars.length} รายการ · หน้าละ 10 DAR</span>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="DAR หน้าก่อนหน้า" disabled={visiblePage === 1} onClick={() => setDarPage(visiblePage - 1)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-700 disabled:opacity-40 hover:enabled:bg-indigo-50">ก่อนหน้า</button>
            <span className="tabular-nums text-slate-700">หน้า {visiblePage} / {totalDarPages}</span>
            <button type="button" aria-label="DAR หน้าถัดไป" disabled={visiblePage === totalDarPages} onClick={() => setDarPage(visiblePage + 1)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-700 disabled:opacity-40 hover:enabled:bg-indigo-50">ถัดไป</button>
          </div>
        </nav>
      </section>

      {attachmentDar && <div className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-label={`ไฟล์แนบ ${attachmentDar.id}`}>
        <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-5 shadow-xl">
          <div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-lg font-bold">ไฟล์แนบ {attachmentDar.id}</h3><button type="button" onClick={() => setAttachmentDar(null)} aria-label="ปิดรายการไฟล์แนบ" className="rounded-lg p-2 hover:bg-slate-100"><X /></button></div>
          {renderDarAttachments(attachmentDar)}
        </div>
      </div>}

      {editingDar && isDcc && (
        <div role="dialog" aria-modal="true" aria-label={`DCC แก้ไขใบ DAR ${editingDar.id}`} className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold mb-2">DCC แก้ไขใบ DAR {editingDar.id}</h3>
            <p className="mb-4 text-sm text-amber-800">DCC สามารถแก้ไขวันที่และเหตุผลได้แม้อนุมัติแล้ว โดยระบบตรวจสอบวันที่และเก็บประวัติ</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                ['currentRevision', 'Rev. เดิม'], ['proposedRevision', 'Rev. ที่เสนอ'], ['docNo', 'รหัสเอกสาร'], ['docNameTh', 'ชื่อเอกสารภาษาไทย'],
                ['docNameEn', 'ชื่อเอกสารภาษาอังกฤษ'], ['targetEffectiveDate', 'วันที่เอกสารใหม่มีผล'],
                ...(editingDar.requestType === 'NEW' ? [] : [['previousEffectiveDate', 'วันที่เอกสารเดิมมีผล']]),
              ] as [keyof typeof correction, string][]).map(([key, label]) => (
                <label key={key} className="block text-sm font-semibold">{label}
                  <input className="mt-1 w-full rounded-lg border p-2" type={String(key).toLowerCase().includes('date') ? 'date' : 'text'}
                    disabled={savingCorrection || (correctionDetailsOnly && !['targetEffectiveDate', 'previousEffectiveDate'].includes(String(key)))}
                    value={correction[key]} onChange={e => setCorrection(prev => ({ ...prev, [key]: e.target.value }))} />
                </label>
              ))}
            </div>
            {([['reasonForChange', 'เหตุผลการดำเนินการ'], ['changeDetails', 'รายละเอียดการเปลี่ยนแปลง']] as const).map(([key, label]) => (
              <label key={key} className="mt-3 block text-sm font-semibold">{label}
                <textarea rows={2} className="mt-1 w-full rounded-lg border p-2" value={correction[key]}
                  onChange={e => setCorrection(prev => ({ ...prev, [key]: e.target.value }))} />
              </label>
            ))}
            <section className="mt-4 space-y-3">
              <h4 className="font-bold">รายการเอกสารเพิ่มเติม</h4>
              {correctionRows.map((row, index) => (
                <fieldset key={index} disabled={savingCorrection || correctionDetailsOnly} className="rounded-lg border p-3 disabled:opacity-60">
                  <legend className="font-semibold">รายการที่ {index + 2}</legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {([['docNo', 'รหัสเอกสาร'], ['docNameTh', 'ชื่อเอกสารภาษาไทย'], ['docNameEn', 'ชื่อเอกสารภาษาอังกฤษ'], ['previousEffectiveDate', 'วันที่เอกสารเดิมมีผล'], ['revision', 'ฉบับที่'], ['reason', 'เหตุผล']] as const).map(([key, label]) => (
                      <label key={key} className="text-sm font-semibold">{label}
                        <input type={key === 'previousEffectiveDate' ? 'date' : 'text'} className="mt-1 w-full rounded-lg border p-2"
                          value={row[key] || ''} onChange={e => setCorrectionRows(items => items.map((item, i) => i === index ? { ...item, [key]: e.target.value } : item))} />
                      </label>
                    ))}
                  </div>
                  <button type="button" disabled={savingCorrection} onClick={() => setCorrectionRows(items => items.filter((_, i) => i !== index))} className="mt-2 text-sm text-rose-700">ลบรายการนี้</button>
                </fieldset>
              ))}
              <button type="button" disabled={savingCorrection || correctionDetailsOnly || correctionRows.length >= 5}
                onClick={() => setCorrectionRows(items => [...items, { docNo: '', docNameTh: '', docNameEn: '', previousEffectiveDate: '', revision: '', reason: '' }])}
                className="rounded-lg border px-3 py-2 text-sm font-bold disabled:opacity-50">เพิ่มรายการ</button>
            </section>
            <label className="mt-3 block text-sm font-semibold">เหตุผลที่ DCC แก้ไข (บังคับกรอก)
              <textarea rows={2} className="mt-1 w-full rounded-lg border p-2" value={correctionReason}
                onChange={e => setCorrectionReason(e.target.value)} />
            </label>
            {correctionError && <p role="alert" className="mt-2 text-sm text-red-700">{correctionError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg border px-4 py-2" disabled={savingCorrection} onClick={() => setEditingDar(null)}>ยกเลิก</button>
              <button type="button" className="rounded-lg bg-indigo-700 px-4 py-2 font-bold text-white disabled:opacity-50"
                disabled={savingCorrection} onClick={saveDarCorrection}>{savingCorrection ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Review / Details Modal */}
      {selectedDarForReview && (
        <div
          id="dar-review-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedDarForReview(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto"
        >
          <div
            className="bg-white rounded-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8"
            style={{ width: 'min(96vw, 1450px)', maxWidth: '1450px' }}
          >
            
            <div className="bg-slate-900 text-white p-5 flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/30 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-indigo-300" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">
                    รายละเอียดคำขอดำเนินการ {selectedDarForReview.id}
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    ยื่นคำขอโดย {selectedDarForReview.requesterName} ({selectedDarForReview.requestDept})
                  </p>
                </div>
              </div>
              <button
                type="button"
                id="btn-close-dar-review-header"
                onClick={() => setSelectedDarForReview(null)}
                aria-label="ปิดหน้าต่าง"
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1 text-xs"
                title="ปิดหน้าต่าง (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-xs text-slate-800">
              {isDcc && selectedDarForReview.status !== 'CANCELLED' && <div className="flex justify-end"><button type="button" onClick={() => openDarCorrection(selectedDarForReview)} className="rounded-lg bg-indigo-600 px-4 py-2 text-white font-bold hover:bg-indigo-700">✏️ แก้ไข DAR (DCC)</button></div>}
              
              {/* Summary Info */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <span className="text-slate-400 text-[10px] block">รหัสเอกสาร:</span>
                  <strong className="font-mono text-indigo-900">{selectedDarForReview.docNo}</strong>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">ประเภทคำขอ:</span>
                  <strong className="text-slate-800">{selectedDarForReview.requestType}</strong>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Revision:</span>
                  <strong className="font-mono text-slate-900">
                    {selectedDarForReview.currentRevision} ➔ {selectedDarForReview.proposedRevision}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">วันที่มีผลเสนอ:</span>
                  <strong className="font-mono text-slate-800">{selectedDarForReview.targetEffectiveDate}</strong>
                </div>
              </div>

              <div className="space-y-1">
                <span className="font-bold text-slate-900 block">ชื่อเอกสาร:</span>
                <p className="text-slate-800 font-medium">{selectedDarForReview.docNameTh}</p>
                <p className="text-slate-500 italic text-[11px]">{selectedDarForReview.docNameEn}</p>
              </div>

              {/* Skipped Revision Warning & Justification in Review Modal */}
              {(selectedDarForReview.isSkippedRevision || selectedDarForReview.skippedRevisionReason) && (
                <div className="p-4 bg-amber-50/90 border-2 border-amber-300 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <h5 className="font-bold text-amber-950 text-xs sm:text-sm">
                      ⚠️ คำขอนี้มีการข้าม Revision (Skipped Revision Alert)
                    </h5>
                  </div>
                  <p className="text-xs text-amber-900">
                    คำขอนี้เสนอปรับจาก <strong>Rev.{selectedDarForReview.currentRevision}</strong> เป็น <strong>Rev.{selectedDarForReview.proposedRevision}</strong>
                    {selectedDarForReview.systemCurrentRevision && (
                      <span> (อ้างอิงจากทะเบียน Master List เดิมคือ Rev.{selectedDarForReview.systemCurrentRevision})</span>
                    )}
                  </p>
                  <div className="p-3 bg-white/90 border border-amber-200 rounded-xl space-y-1">
                    <span className="text-[11px] font-bold text-slate-800 block">
                      เหตุผลความจำเป็นในการข้าม Revision ที่ผู้ขอยื่นยัน:
                    </span>
                    <p className="text-xs text-slate-900 font-medium leading-relaxed">
                      {selectedDarForReview.skippedRevisionReason || 'ไม่ได้ระบุเหตุผลเพิ่มเติม'}
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <span className="font-bold text-slate-900 block">เหตุผลความจำเป็นในการขอดำเนินการ:</span>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-700 leading-relaxed">
                  {selectedDarForReview.reasonForChange}
                </div>
              </div>

              {selectedDarForReview.changeDetails && (
                <div className="space-y-1">
                  <span className="font-bold text-slate-900 block">รายละเอียดการเปลี่ยนแปลงข้อความ/ขั้นตอน:</span>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-700 leading-relaxed">
                    {selectedDarForReview.changeDetails}
                  </div>
                </div>
              )}

              {selectedDarForReview.additionalDocuments && selectedDarForReview.additionalDocuments.length > 0 && (
                <div className="space-y-2">
                  <span className="font-bold text-slate-900 block">รายการเอกสารเพิ่มเติมในชุดเดียวกัน:</span>
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 text-slate-700">
                        <tr>
                          <th className="p-2 text-center">ลำดับ</th>
                          <th className="p-2 text-left">หมายเลข</th>
                          <th className="p-2 text-left">ชื่อเอกสาร</th>
                          <th className="p-2 text-left">ฉบับที่</th>
                          <th className="p-2 text-left">เหตุผล</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDarForReview.additionalDocuments.map((item, index) => (
                          <tr key={index} className="border-t border-slate-200">
                            <td className="p-2 text-center font-bold">{index + 2}</td>
                            <td className="p-2 font-mono font-bold">{item.docNo}</td>
                            <td className="p-2">{item.docNameTh}{item.docNameEn ? <div className="text-[10px] text-slate-500 italic">{item.docNameEn}</div> : null}</td>
                            <td className="p-2 font-mono">{item.revision}</td>
                            <td className="p-2">{item.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {selectedDarForReview.status === 'CANCELLED' && <div className="p-4 rounded-xl border-2 border-rose-300 bg-rose-50 text-rose-900"><div className="font-black">คำขอนี้ถูกยกเลิกแล้ว</div><div className="mt-1">เหตุผล: {selectedDarForReview.cancellationReason || '-'}</div><div className="text-[11px] mt-1">โดย {selectedDarForReview.cancelledBy || '-'} เมื่อ {selectedDarForReview.cancelledAt ? new Date(selectedDarForReview.cancelledAt).toLocaleString('th-TH') : '-'}</div></div>}

              {renderDarAttachments(selectedDarForReview)}

              {/* ISO Clause */}
              <div className="text-[11px] text-slate-500">
                ข้อกำหนด ISO/IATF ที่เกี่ยวข้อง: <strong>{selectedDarForReview.isoClause || 'ISO 9001:2015 Clause 7.5'}</strong>
              </div>

              {/* DCC Action Section */}
              {currentUser.currentDept === 'DCC' && !['REGISTERED', 'CANCELLED'].includes(selectedDarForReview.status) && (
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-indigo-600" />
                    ส่วนการพิจารณาของ DCC Controller
                  </h4>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      ข้อคิดเห็น / หมายเหตุการตรวจสอบของ DCC
                    </label>
                    <textarea
                      rows={2}
                      value={reviewRemarks}
                      onChange={e => setReviewRemarks(e.target.value)}
                      placeholder="เช่น เอกสารถูกต้องตามโครงสร้าง หรือ ขอให้แนบเอกสาร Process Capability เพิ่มเติม"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div className={`p-3 rounded-xl border text-xs ${selectedDarForReview.requesterSignature && selectedDarForReview.deptApproverSignature ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-300 text-amber-900'}`}>
                    {selectedDarForReview.requesterSignature && selectedDarForReview.deptApproverSignature
                      ? '✓ ลายเซ็นภายในแผนกครบแล้ว สามารถส่งต่อเพื่อพิจารณาได้ (QMR ไม่ใช่เงื่อนไขในขั้นตอนนี้)'
                      : '⚠️ ยังส่งต่อไม่ได้: ต้องมีลายเซ็นผู้ขอดำเนินการและผู้อนุมัติในแผนกให้ครบก่อน โดยไม่บังคับลายเซ็น QMR'}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    
                    {/* Auto Register button */}
                    {selectedDarForReview.status === 'APPROVED' && <button
                      onClick={() => handleRegisterToMasterList(selectedDarForReview.id)}
                      disabled={registeringDarId !== null}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
                    >
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      ขึ้นทะเบียนและแจกจ่ายอัตโนมัติ
                    </button>}

                    <button
                      onClick={async () => {
                        // DAR must be approved inside the requesting department before DCC can accept it.
                        // QMR is intentionally NOT required here; QMR signs in the later approval stage.
                        if (!selectedDarForReview.requesterSignature || !selectedDarForReview.deptApproverSignature) {
                          alert('ยังไม่สามารถอนุมัติ/ส่งต่อใบ DAR ได้ กรุณาให้ผู้ขอดำเนินการและผู้อนุมัติในแผนกลงลายเซ็นให้ครบก่อน (ไม่รวม QMR)');
                          return;
                        }
                        try {
                          await reviewDar(selectedDarForReview.id, 'APPROVED', reviewRemarks);
                          await handleRegisterToMasterList(selectedDarForReview.id);
                        } catch (error) {
                          alert(error instanceof Error ? error.message : 'อนุมัติสำเร็จ แต่ขึ้นทะเบียนหรือแจกจ่ายอัตโนมัติไม่สำเร็จ กรุณากดดำเนินการซ้ำจากรายการ DAR');
                        }
                      }}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      อนุมัติและแจกจ่ายอัตโนมัติ
                    </button>

                    <button
                      onClick={async () => { try { await reviewDar(selectedDarForReview.id, 'UNDER_REVIEW', reviewRemarks); setSelectedDarForReview(null); } catch (error) { alert(error instanceof Error ? error.message : 'ดำเนินการไม่สำเร็จ'); } }}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      ขอเอกสารเพิ่มเติม
                    </button>

                    <button
                      onClick={async () => { try { await reviewDar(selectedDarForReview.id, 'REJECTED', reviewRemarks); setSelectedDarForReview(null); } catch (error) { alert(error instanceof Error ? error.message : 'ดำเนินการไม่สำเร็จ'); } }}
                      className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      ไม่อนุมัติ (Reject)
                    </button>

                  </div>
                </div>
              )}

              {['PENDING_REVIEW', 'UNDER_REVIEW', 'REJECTED'].includes(selectedDarForReview.status) && (currentUser.userRole === 'DCC_ADMIN' || currentUser.currentDept === selectedDarForReview.requestDept) && <button type="button" onClick={() => handleDeleteDar(selectedDarForReview)} className="w-full px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-xl font-black flex items-center justify-center gap-2"><Trash2 className="w-4 h-4" />ลบใบ DAR และไฟล์แนบถาวร</button>}
              {selectedDarForReview.status === 'APPROVED' && currentUser.userRole === 'DCC_ADMIN' && <button type="button" onClick={() => handleCancelDar(selectedDarForReview)} className="w-full px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl font-black flex items-center justify-center gap-2"><X className="w-4 h-4" />DCC ยกเลิกและเก็บประวัติ</button>}

            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                id="btn-print-from-review-modal"
                onClick={() => {
                  setSelectedDarForPrint(selectedDarForReview);
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <Printer className="w-4 h-4" />
                พิมพ์แบบฟอร์ม DAR A4 & จัดการลายเซ็น
              </button>

              <button
                type="button"
                id="btn-close-dar-review-footer"
                onClick={() => setSelectedDarForReview(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs transition-colors"
              >
                ปิดหน้าต่าง
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Create New DAR Modal */}
      {isCreateModalOpen && (
        <div
          id="dar-create-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitInFlight.current) setIsCreateModalOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-3 bg-slate-950/70 backdrop-blur-xs overflow-hidden"
        >
          <div
            className="bg-white rounded-2xl w-full max-w-none shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col"
            style={{ width: 'calc(100vw - 24px)', height: 'calc(100vh - 24px)' }}
          >
            
            <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white p-5 flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/30 flex items-center justify-center">
                  <Plus className="w-4 h-4 text-indigo-300" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">
                    สร้างใบขอดำเนินการเอกสาร (New DAR)
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    ยื่นคำขอถึงศูนย์ควบคุมเอกสาร (DCC)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setShowMobileLivePreview(true)} className="lg:hidden px-3 py-1.5 rounded-lg bg-indigo-500/30 hover:bg-indigo-500/50 text-indigo-100 text-xs font-bold flex items-center gap-1.5">
                  <Eye className="w-4 h-4" /> ดูตัวอย่างใบ DAR
                </button>
                <button
                  type="button"
                  id="btn-close-dar-create-header"
                  disabled={isSubmittingDar || isReadingPdfs}
                  onClick={() => setIsCreateModalOpen(false)}
                  aria-label="ปิดหน้าต่าง"
                  className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1 text-xs"
                  title="ปิดหน้าต่าง (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <form
              onSubmit={handleCreateSubmit}
              className="p-3 sm:p-4 lg:grid gap-4 flex-1 min-h-0 overflow-hidden text-xs text-slate-800"
              style={{ gridTemplateColumns: 'minmax(0, 1.55fr) minmax(380px, 0.85fr)' }}
            >
              <div className="min-w-0 min-h-0 space-y-4 overflow-y-auto overflow-x-hidden pr-1 lg:pr-3 pb-6">
              
              {/* Type selector */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                  ประเภทการขอดำเนินการ (Action Type) <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 [&>*]:min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      setReqType('NEW');
                      setCurrentRevision('N/A');
                      setProposedRevision('00');
                    }}
                    className={`min-w-0 whitespace-normal py-2 px-2 rounded-xl font-bold text-xs border text-center cursor-pointer transition-all ${
                      reqType === 'NEW'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-300'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    ✨ จัดทำเอกสารใหม่ (NEW)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setReqType('REVISION');
                      setCurrentRevision('01');
                      setProposedRevision('02');
                    }}
                    className={`min-w-0 whitespace-normal py-2 px-2 rounded-xl font-bold text-xs border text-center cursor-pointer transition-all ${
                      reqType === 'REVISION'
                        ? 'bg-blue-50 border-blue-500 text-blue-800 ring-2 ring-blue-300'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    ✏️ ขอแก้ไข (REVISION)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setReqType('OBSOLETE');
                      setProposedRevision('OBSOLETE');
                    }}
                    className={`min-w-0 whitespace-normal py-2 px-2 rounded-xl font-bold text-xs border text-center cursor-pointer transition-all ${
                      reqType === 'OBSOLETE'
                        ? 'bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-300'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    🗑️ ขอยกเลิกการใช้ (OBSOLETE)
                  </button>
                </div>
              </div>

              {/* Requester Details */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 p-4 bg-slate-50 border border-slate-200 rounded-xl [&>*]:min-w-0">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    หน่วยงานผู้ขอ <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={reqDept}
                    onChange={e => setReqDept(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    {DEPARTMENTS.filter(d => d.id !== 'DCC').map(d => (
                      <option key={d.id} value={d.id}>{d.id}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    ชื่อผู้ยื่นคำขอ <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={requesterName}
                    onChange={e => setRequesterName(e.target.value)}
                    placeholder="ระบุชื่อ-นามสกุลจริงผู้ยื่นคำขอ"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none placeholder-slate-400"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    วันที่มีผลเสนอใช้ <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={targetEffectiveDate}
                    onChange={e => setTargetEffectiveDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              {reqType !== 'NEW' && <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700">วันที่เอกสารเดิมบังคับใช้ <span className="text-rose-500">*</span></label>
                <input type="date" required value={previousEffectiveDate} onChange={e => setPreviousEffectiveDate(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <p className="mt-1 text-xs text-slate-500">ดึงจาก Master List เมื่อพบเอกสาร กรุณาตรวจสอบกับฉบับเดิม วันที่ฉบับใหม่ต้องอยู่หลังวันนี้</p>
                {previousEffectiveDate && targetEffectiveDate && previousEffectiveDate >= targetEffectiveDate && <p role="alert" className="mt-2 text-sm font-bold text-rose-600">วันที่ฉบับใหม่ต้องอยู่หลังวันที่เอกสารเดิม ระบบจะไม่อนุญาตให้ส่ง DAR</p>}
              </div>}
              {/* Document Identity */}
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(180px,0.85fr)] gap-3.5 [&>*]:min-w-0">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    รหัสเอกสาร (Doc No.) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={docNo}
                    onChange={e => setDocNo(e.target.value)}
                    placeholder="เช่น QP-PD-005 หรือ WI-QA-008"
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    ประเภทเอกสาร
                  </label>
                  <select
                    value={docType}
                    onChange={e => setDocType(e.target.value as any)}
                    className="min-w-0 w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    {DOCUMENT_TYPES.map(t => (
                      <option key={t.code} value={t.code}>[Level {t.level}] {t.code} - {t.labelTh} ({t.codePattern})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Rev. เดิม
                    </label>
                    <input
                      type="text"
                      value={currentRevision}
                      onChange={e => setCurrentRevision(e.target.value)}
                      disabled={reqType === 'NEW'}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono disabled:bg-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Rev. ที่เสนอ
                    </label>
                    <input
                      type="text"
                      value={proposedRevision}
                      onChange={e => setProposedRevision(e.target.value)}
                      disabled={reqType === 'OBSOLETE'}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono font-bold text-indigo-700 disabled:bg-slate-100"
                    />
                  </div>
                </div>
              </div>

              {/* Names */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 [&>*]:min-w-0">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    ชื่อเอกสารภาษาไทย <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={docNameTh}
                    onChange={e => setDocNameTh(e.target.value)}
                    placeholder="เช่น วิธีปฏิบัติงานการตรวจสอบข้อบกพร่องผลิตภัณฑ์"
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    ชื่อเอกสารภาษาอังกฤษ (English Name)
                  </label>
                  <input
                    type="text"
                    value={docNameEn}
                    onChange={e => setDocNameEn(e.target.value)}
                    placeholder="e.g. Work Instruction for Final Product Defect Inspection"
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  เหตุผลความจำเป็นในการจัดทำ/แก้ไข/ยกเลิก <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  value={reasonForChange}
                  onChange={e => setReasonForChange(e.target.value)}
                  placeholder="ระบุวัตถุประสงค์ เช่น ปรับปรุงให้สอดคล้องกับข้อกำหนดลูกค้าใหม่, แก้ไขข้อผิดพลาดในการทำงาน"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  required
                />
              </div>

              {/* Change details */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  สรุปรายละเอียดการเปลี่ยนแปลงข้อความ / แผนผัง
                </label>
                <textarea
                  rows={2}
                  value={changeDetails}
                  onChange={e => setChangeDetails(e.target.value)}
                  placeholder="ระบุข้อที่เปลี่ยนแปลง เช่น แก้ไขข้อ 4.2 เพิ่มขั้นตอนตรวจสอบความร้อน, ตัดข้อ 5.3 ออก"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Additional documents in the same DAR set (rows 2-6) */}
              <div className="space-y-3 border border-indigo-200 bg-indigo-50/30 rounded-xl p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">รายการเอกสารเพิ่มเติมในชุดเดียวกัน (ลำดับ 2–6)</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">ใช้เลขที่ DAR และการอนุมัติเดียวกับรายการที่ 1</p>
                  </div>
                  <button
                    type="button"
                    disabled={additionalDocuments.length >= 5}
                    onClick={() => setAdditionalDocuments(items => [...items, { docNo: '', docNameTh: '', docNameEn: '', previousEffectiveDate: '', revision: '', reason: '' }])}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 disabled:bg-slate-300 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3.5 h-3.5" /> เพิ่มรายการ
                  </button>
                </div>

                {additionalDocuments.length === 0 ? (
                  <div className="py-4 text-center text-xs text-slate-500 border border-dashed border-slate-300 rounded-lg bg-white">
                    หากมีเอกสารในชุดเดียวกัน ให้กด “เพิ่มรายการ” เพื่อกรอกลำดับ 2–6
                  </div>
                ) : (
                  <div className="space-y-3">
                    {additionalDocuments.map((item, index) => (
                      <div key={index} className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-indigo-800 text-xs">รายการที่ {index + 2}</span>
                          <button
                            type="button"
                            onClick={() => setAdditionalDocuments(items => items.filter((_, itemIndex) => itemIndex !== index))}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"
                            title="ลบรายการนี้"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">รหัสเอกสาร (Doc No.) <span className="text-rose-500">*</span></label>
                            <input value={item.docNo} onChange={e => setAdditionalDocuments(items => items.map((row, i) => i === index ? { ...row, docNo: e.target.value } : row))} placeholder="เช่น QP-PD-005 หรือ WI-QA-008" className="w-full h-10 px-3.5 border border-slate-300 rounded-lg text-sm font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">วันที่เอกสารเดิมบังคับใช้</label>
                            <input type="date" value={item.previousEffectiveDate || ''} onChange={e => setAdditionalDocuments(items => items.map((row, i) => i === index ? { ...row, previousEffectiveDate: e.target.value } : row))} className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">Rev. ที่เสนอ <span className="text-rose-500">*</span></label>
                            <input value={item.revision} onChange={e => setAdditionalDocuments(items => items.map((row, i) => i === index ? { ...row, revision: e.target.value } : row))} placeholder="เช่น 00, 01, 02" className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm font-mono font-bold text-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">ชื่อเอกสารภาษาไทย <span className="text-rose-500">*</span></label>
                            <input value={item.docNameTh} onChange={e => setAdditionalDocuments(items => items.map((row, i) => i === index ? { ...row, docNameTh: e.target.value } : row))} placeholder="ระบุชื่อเอกสารภาษาไทย" className="w-full h-10 px-3.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">ชื่อเอกสารภาษาอังกฤษ (English Name)</label>
                            <input value={item.docNameEn || ''} onChange={e => setAdditionalDocuments(items => items.map((row, i) => i === index ? { ...row, docNameEn: e.target.value } : row))} placeholder="ระบุชื่อเอกสารภาษาอังกฤษ (ถ้ามี)" className="w-full h-10 px-3.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1.5">เหตุผลความจำเป็นในการจัดทำ/แก้ไข/ยกเลิก <span className="text-rose-500">*</span></label>
                          <input value={item.reason} onChange={e => setAdditionalDocuments(items => items.map((row, i) => i === index ? { ...row, reason: e.target.value } : row))} placeholder="ระบุเหตุผลความจำเป็น" className="w-full h-10 px-3.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <section className="space-y-3" aria-label="ไฟล์ PDF แนบใบ DAR">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <h4 className="font-bold text-slate-800">ไฟล์แนบ PDF <span className="text-rose-600">*</span></h4>
                  <span className="text-slate-600">{attachedFiles.length}/{MAX_DAR_PDFS} ไฟล์ · ไฟล์ละน้อยกว่า 25 MB</span>
                </div>
                <div onDragOver={e => { e.preventDefault(); setIsDraggingFile(true); }} onDragLeave={() => setIsDraggingFile(false)}
                  onDrop={e => { e.preventDefault(); setIsDraggingFile(false); void handleDarAttachments(Array.from(e.dataTransfer.files)); }}
                  className={`rounded-xl border-2 border-dashed p-4 text-center ${isDraggingFile ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-slate-50'}`}>
                  <p className="mb-2 text-sm text-slate-700">เลือกหรือลาก PDF หลายไฟล์มาวางพร้อมกัน และเพิ่มไฟล์ภายหลังได้</p>
                  <input id="dar-pdf-files" aria-label="เลือกไฟล์ PDF แนบใบ DAR" type="file" multiple accept="application/pdf,.pdf"
                    disabled={isReadingPdfs || isSubmittingDar} className="max-w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:text-white"
                    onChange={e => { const files = Array.from(e.currentTarget.files || []) as File[]; e.currentTarget.value = ''; void handleDarAttachments(files); }} />
                  {isReadingPdfs && <p role="status" className="mt-2 text-sm text-indigo-700">กำลังตรวจสอบไฟล์ PDF...</p>}
                </div>
                {attachedFiles.map((file, index) => <div key={`${index}-${file.name}`} data-selected-pdf className="flex items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm">
                  <div className="min-w-0"><p className="break-all font-semibold text-indigo-950">{index + 1}. {file.name}</p><p className="text-slate-600">{formatPdfSize(file.size)}</p></div>
                  <button type="button" disabled={isReadingPdfs || isSubmittingDar} aria-label={`ลบไฟล์แนบ ${index + 1}: ${file.name}`} onClick={() => setAttachedFiles(files => files.filter((_, i) => i !== index))} className="shrink-0 rounded-lg p-2 text-rose-700 hover:bg-rose-100 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
                </div>)}
              </section>

              {/* Requester Signature Box (Drag and drop signature) */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <label className="block text-[11px] font-bold text-slate-800 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                    ลายเซ็นผู้ยื่นคำขอ (Requester Signature)
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal">
                    (ลากรูปภาพ PNG/JPG มาวาง หรือกดเซ็นด่วน)
                  </span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        const file = e.dataTransfer.files[0];
                        if (file.type.startsWith('image/')) {
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            setRequesterSignature(ev.target?.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }
                    }}
                    className="h-20 border border-dashed border-slate-300 rounded-lg bg-white flex items-center justify-center relative overflow-hidden group"
                  >
                    {requesterSignature ? (
                      <div className="relative w-full h-full flex items-center justify-center p-1">
                        <img
                          src={requesterSignature}
                          alt="Signature Preview"
                          className="max-h-full max-w-full object-contain"
                        />
                        <button
                          type="button"
                          onClick={() => setRequesterSignature(undefined)}
                          className="absolute top-1 right-1 p-1 bg-rose-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          title="ลบลายเซ็น"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="text-center p-1 text-slate-400">
                        <span className="text-[10px] block">ลากรูปภาพลายเซ็นมาวางที่นี่</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold text-center cursor-pointer transition-colors">
                      เลือกไฟล์รูปภาพลายเซ็น
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            const file = e.target.files[0];
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              setRequesterSignature(ev.target?.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => {
                        const canvas = document.createElement('canvas');
                        canvas.width = 240;
                        canvas.height = 80;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                          ctx.fillStyle = '#ffffff';
                          ctx.fillRect(0, 0, canvas.width, canvas.height);
                          ctx.font = 'italic bold 22px cursive, sans-serif';
                          ctx.fillStyle = '#0f172a';
                          ctx.fillText(requesterName.split(' ')[0] || 'Requester', 25, 45);
                          ctx.strokeStyle = '#2563eb';
                          ctx.lineWidth = 2;
                          ctx.beginPath();
                          ctx.moveTo(20, 52);
                          ctx.bezierCurveTo(80, 58, 140, 42, 210, 55);
                          ctx.stroke();
                          setRequesterSignature(canvas.toDataURL('image/png'));
                        }
                      }}
                      className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold text-center cursor-pointer transition-colors"
                    >
                      ✍️ เซ็นชื่อด่วน (Digital Stamp)
                    </button>
                  </div>
                </div>
              </div>

              {/* Requesting Department Approver */}
              <div className="p-3 bg-amber-50/70 border border-amber-300 rounded-xl space-y-3">
                <div>
                  <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-amber-700" />
                    การอนุมัติจากหน่วยงานผู้ร้องขอ (Department Approver)
                    <span className="text-rose-500">*</span>
                  </h3>
                  <p className="text-[10px] text-slate-600 mt-1">ต้องกรอกและลงนามให้ครบก่อนส่งใบ DAR ถึง DCC — ไม่รวมลายเซ็น QMR</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="text-[11px] font-bold text-slate-700">
                    ชื่อผู้อนุมัติ <span className="text-rose-500">*</span>
                    <input type="text" value={deptApproverName} onChange={e => setDeptApproverName(e.target.value)} placeholder="ระบุชื่อ-นามสกุลจริงผู้อนุมัติ" className="mt-1 w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none" required />
                  </label>
                  <label className="text-[11px] font-bold text-slate-700">
                    ตำแหน่งผู้อนุมัติ <span className="text-rose-500">*</span>
                    <input type="text" value={deptApproverTitle} onChange={e => setDeptApproverTitle(e.target.value)} placeholder="เช่น Manager / Asst. Manager" className="mt-1 w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none" required />
                  </label>
                  <label className="text-[11px] font-bold text-slate-700">
                    วันที่อนุมัติ <span className="text-rose-500">*</span>
                    <input type="date" value={deptApproverDate} onChange={e => setDeptApproverDate(e.target.value)} className="mt-1 w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none" required />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <div
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault();
                      const file = e.dataTransfer.files?.[0];
                      if (!file?.type.startsWith('image/')) return;
                      const reader = new FileReader();
                      reader.onload = event => setDeptApproverSignature(event.target?.result as string);
                      reader.readAsDataURL(file);
                    }}
                    className="h-20 border border-dashed border-amber-400 rounded-lg bg-white flex items-center justify-center relative overflow-hidden group"
                  >
                    {deptApproverSignature ? <div className="relative w-full h-full flex items-center justify-center p-1"><img src={deptApproverSignature} alt="Department Approver Signature" className="max-h-full max-w-full object-contain"/><button type="button" onClick={() => setDeptApproverSignature(undefined)} className="absolute top-1 right-1 p-1 bg-rose-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity" title="ลบลายเซ็น"><Trash2 className="w-3 h-3"/></button></div> : <span className="text-[10px] text-slate-400">ลากรูปภาพลายเซ็นผู้อนุมัติมาวางที่นี่</span>}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold text-center cursor-pointer">
                      เลือกไฟล์ลายเซ็นผู้อนุมัติ
                      <input type="file" accept="image/*" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = event => setDeptApproverSignature(event.target?.result as string); reader.readAsDataURL(file); }} />
                    </label>
                    <button type="button" onClick={() => { if (!deptApproverName.trim()) { setFormError('กรุณาระบุชื่อผู้อนุมัติก่อนกดเซ็นด่วน'); return; } const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 80; const ctx = canvas.getContext('2d'); if (ctx) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.font = 'italic bold 22px cursive, sans-serif'; ctx.fillStyle = '#0f172a'; ctx.fillText(deptApproverName.split(' ')[0], 25, 45); ctx.strokeStyle = '#b45309'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(20, 52); ctx.bezierCurveTo(80, 58, 140, 42, 210, 55); ctx.stroke(); setDeptApproverSignature(canvas.toDataURL('image/png')); setFormError(''); } }} className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold">✍️ เซ็นชื่อด่วนผู้อนุมัติ</button>
                  </div>
                </div>
              </div>

              {/* Distribution Request Selection (FM-QS-001-01 Section 4) */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-900 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-600" />
                    ผู้ถือครองตามตำแหน่งงานที่ขอให้แจกจ่าย (Distribution Request)
                  </label>
                  <span className="text-[10px] text-indigo-700 font-semibold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                    เลือก {darDistributionHolders.filter(h => h.checked).length} ตำแหน่ง
                  </span>
                </div>
                <p className="text-[10px] text-slate-500">
                  * ข้อมูลนี้จะถูกใช้อ้างอิงเป็นค่าเริ่มต้นในการสร้าง "ใบแจกจ่าย-เรียกคืนเอกสาร (FM-QS-003-00)"
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pt-1 pr-1">
                  {darDistributionHolders.map((holder, idx) => (
                    <label
                      key={holder.position}
                      className={`p-2 rounded-lg border text-xs flex items-center justify-between gap-2 cursor-pointer transition-all ${
                        holder.checked
                          ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950 font-semibold'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <input
                          type="checkbox"
                          checked={holder.checked}
                          disabled={!isDcc && isDccOnlyRecipient(holder.dept)}
                          title={!isDcc && isDccOnlyRecipient(holder.dept) ? 'เฉพาะ DCC เท่านั้นที่เลือกหน่วยงานนี้ได้' : undefined}
                          onChange={(e) => {
                            if (!isDcc && isDccOnlyRecipient(holder.dept)) return;
                            const isChecked = e.target.checked;
                            setDarDistributionHolders(prev =>
                              prev.map((h, i) => (i === idx ? { ...h, checked: isChecked } : h))
                            );
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500 shrink-0"
                        />
                        <span className="truncate text-[11px]">{holder.position}{!isDcc && isDccOnlyRecipient(holder.dept) ? ' (DCC เลือกเท่านั้น)' : ''}</span>
                      </div>

                      {holder.checked && (
                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <span className="text-[10px] text-slate-400">ชุด:</span>
                          <input
                            type="text"
                            value={holder.copies}
                            onChange={(e) => {
                              const val = e.target.value;
                              setDarDistributionHolders(prev =>
                                prev.map((h, i) => (i === idx ? { ...h, copies: val } : h))
                              );
                            }}
                            className="w-8 px-1 py-0.5 text-center text-xs font-mono font-bold bg-white border border-indigo-300 rounded text-indigo-900"
                          />
                        </div>
                      )}
                    </label>
                  ))}
                </div>
              </div>

              {/* ISO Clause */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  ข้อกำหนดมาตรฐานที่เกี่ยวข้อง (ISO / IATF Clause)
                </label>
                <input
                  type="text"
                  value={isoClause}
                  onChange={e => setIsoClause(e.target.value)}
                  placeholder="เช่น ISO 9001:2015 Clause 8.5.1 หรือ IATF 16949 Clause 7.5.3"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none"
                />
              </div>

              {isSubmittingDar && <div role="status" className="space-y-2 rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">
                <p className="break-words">{darUploadProgress.message} — {darUploadProgress.percent}%</p>
                <progress aria-label="ความคืบหน้าการส่ง DAR" max={100} value={darUploadProgress.percent} className="w-full" />
              </div>}
              {formError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs">
                  {formError}
                </div>
              )}

              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 -mx-6 -mb-6 mt-4">
                <button
                  type="button"
                  id="btn-close-dar-create-footer"
                  disabled={isSubmittingDar || isReadingPdfs}
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  ยกเลิก / ปิดหน้าต่าง
                </button>
                <button
                  type="submit"
                  id="btn-submit-dar"
                  disabled={isSubmittingDar || isReadingPdfs}
                  aria-busy={isSubmittingDar}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <Send className="w-3.5 h-3.5" />
                  {isSubmittingDar ? `กำลังส่งใบ DAR (${darUploadProgress.percent}%)` : 'ยื่นใบขอดำเนินการ (Submit DAR)'}
                </button>
              </div>

              </div>

              <aside className="hidden lg:flex min-w-0 min-h-0 bg-slate-200/70 border border-slate-300 rounded-xl p-3 flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-2 shrink-0">
                  <div>
                    <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5"><Eye className="w-4 h-4 text-indigo-600" /> ตัวอย่างใบ DAR แบบเรียลไทม์</h4>
                    <p className="text-[10px] text-slate-500">ฝั่งกรอกข้อมูลกว้างขึ้น และแบบฟอร์มจะเปลี่ยนทันทีขณะกรอก</p>
                  </div>
                  <span className="text-[10px] font-black text-rose-600 border border-rose-300 bg-rose-50 rounded px-2 py-1">DRAFT</span>
                </div>
                <div className="min-h-0 overflow-y-auto pr-1">
                  <DarLivePreview
                    requestType={reqType}
                    requestDept={reqDept}
                    requesterName={requesterName}
                    targetEffectiveDate={targetEffectiveDate} previousEffectiveDate={previousEffectiveDate}
                    docNo={docNo}
                    docNameTh={docNameTh}
                    docNameEn={docNameEn}
                    docType={docType}
                    currentRevision={currentRevision}
                    proposedRevision={proposedRevision}
                    reasonForChange={reasonForChange}
                    additionalDocuments={additionalDocuments}
                    requesterSignature={requesterSignature}
                    approverName={deptApproverName}
                    approverDate={deptApproverDate}
                    approverSignature={deptApproverSignature}
                    distributionHolders={darDistributionHolders}
                  />
                </div>
              </aside>

            </form>

            {showMobileLivePreview && (
              <div className="fixed inset-0 z-[70] bg-slate-950/90 p-3 sm:p-6 overflow-y-auto lg:hidden">
                <div className="max-w-xl mx-auto">
                  <div className="sticky top-0 z-10 bg-slate-900 text-white rounded-t-xl px-4 py-3 flex items-center justify-between">
                    <div><b className="text-sm">ตัวอย่างใบ DAR แบบเรียลไทม์</b><div className="text-[10px] text-slate-300">ฉบับร่างก่อนส่งให้ DCC</div></div>
                    <button type="button" onClick={() => setShowMobileLivePreview(false)} className="p-2 rounded-lg hover:bg-slate-700" aria-label="ปิดตัวอย่าง"><X className="w-5 h-5" /></button>
                  </div>
                  <DarLivePreview
                    requestType={reqType} requestDept={reqDept} requesterName={requesterName} targetEffectiveDate={targetEffectiveDate} previousEffectiveDate={previousEffectiveDate}
                    docNo={docNo} docNameTh={docNameTh} docNameEn={docNameEn} docType={docType}
                    currentRevision={currentRevision} proposedRevision={proposedRevision} reasonForChange={reasonForChange}
                    additionalDocuments={additionalDocuments} requesterSignature={requesterSignature}
                    approverName={deptApproverName} approverDate={deptApproverDate} approverSignature={deptApproverSignature}
                    distributionHolders={darDistributionHolders}
                  />
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Printable DAR Modal */}
      {selectedDarForPrint && (
        <DarPrintModal
          dar={selectedDarForPrint}
          onEdit={isDcc && selectedDarForPrint.status !== 'CANCELLED' ? () => openDarCorrection(selectedDarForPrint) : undefined}
          onClose={() => setSelectedDarForPrint(null)}
        />
      )}

    </div>
  );
};


