import React, { useState, useEffect } from 'react';
import { useDcs } from '../context/DcsContext';
import {
  DarRecord,
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
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { DarPrintModal } from './DarPrintModal';
import { analyzeRevisionSequence, getNextRevision, formatRevision } from '../utils/revisionHelper';

export const DarManagement: React.FC = () => {
  const {
    documents,
    dars,
    currentUser,
    createDar,
    reviewDar,
    registerDarToMasterList,
    setActiveView,
    openDocumentViewer,
  } = useDcs();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedDarForReview, setSelectedDarForReview] = useState<DarRecord | null>(null);
  const [selectedDarForPrint, setSelectedDarForPrint] = useState<DarRecord | null>(null);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedDarForPrint) setSelectedDarForPrint(null);
        if (selectedDarForReview) setSelectedDarForReview(null);
        if (isCreateModalOpen) setIsCreateModalOpen(false);
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
  const [docNo, setDocNo] = useState('');
  const [docNameTh, setDocNameTh] = useState('');
  const [docNameEn, setDocNameEn] = useState('');
  const [docType, setDocType] = useState<DocumentType>('QP');
  const [currentRevision, setCurrentRevision] = useState('02');
  const [proposedRevision, setProposedRevision] = useState('03');
  const [reasonForChange, setReasonForChange] = useState('');
  const [changeDetails, setChangeDetails] = useState('');
  const [skippedRevisionReason, setSkippedRevisionReason] = useState('');
  const [showDocSelector, setShowDocSelector] = useState(false);
  const [docSearchKeyword, setDocSearchKeyword] = useState('');
  const [isoClause, setIsoClause] = useState('ISO 9001:2015 Clause 7.5.3');
  const [formError, setFormError] = useState('');

  // File Upload State in DAR Creation
  const [attachedFile, setAttachedFile] = useState<{
    name: string;
    size: string;
    type: string;
    dataUrl?: string;
  } | null>(null);
  const [requesterSignature, setRequesterSignature] = useState<string | undefined>(undefined);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // Distribution Holders requested in DAR (ตามแบบฟอร์ม FM-QS-001-01)
  const [darDistributionHolders, setDarDistributionHolders] = useState<{ checked: boolean; position: string; copies: string }[]>([
    { checked: true, position: 'ผู้จัดการฝ่ายผลิต (Production Mgr.)', copies: '1' },
    { checked: true, position: 'ผู้จัดการฝ่ายประกันคุณภาพ (QA Mgr.)', copies: '1' },
    { checked: true, position: 'ผู้จัดการฝ่ายควบคุมคุณภาพ (QC Mgr.)', copies: '1' },
    { checked: false, position: 'ผู้จัดการฝ่ายวิศวกรรม (Engineering Mgr.)', copies: '1' },
    { checked: false, position: 'หัวหน้าแผนกคลังสินค้า (Warehouse)', copies: '1' },
    { checked: false, position: 'หัวหน้าแผนกจัดซื้อ (Purchasing)', copies: '1' },
    { checked: false, position: 'หัวหน้าแผนกซ่อมบำรุง (Maintenance)', copies: '1' },
    { checked: false, position: 'หัวหน้าแผนกความปลอดภัย (SHE/Safety)', copies: '1' },
    { checked: false, position: 'หัวหน้าแผนกบุคคลและธุรการ (HR & Admin)', copies: '1' },
    { checked: false, position: 'หัวหน้าฝ่ายวางแผนการผลิต (PMC)', copies: '1' },
    { checked: false, position: 'หัวหน้าฝ่ายขายและการตลาด (Sales)', copies: '1' },
    { checked: false, position: 'ผู้บริหารตัวแทนระบบ (QMR)', copies: '1' },
  ]);

  // DCC Review remarks state
  const [reviewRemarks, setReviewRemarks] = useState('');

  const isDcc = currentUser.currentDept === 'DCC';

  // Helper to download draft file attached by DAR requester
  const handleDownloadDarDraft = (dar: DarRecord) => {
    const fileName = dar.attachmentFileName || `${dar.docNo}_Rev${dar.proposedRevision}_DRAFT.docx`;
    if (dar.attachmentFileDataUrl) {
      const link = document.createElement('a');
      link.href = dar.attachmentFileDataUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // Generate fallback draft document text if no binary attached
    const sampleContent = `================================================================================
DRAFT DOCUMENT FOR DCC REVIEW (เอกสารร่างสำหรับ DCC ตรวจสอบ)
Document Control System (ISO 9001:2015 / IATF 16949)
================================================================================
DAR No:           ${dar.id}
Document No:      ${dar.docNo}
Document Name:    ${dar.docNameTh} (${dar.docNameEn})
Type:             ${dar.docType}
Proposed Rev:     Rev.${dar.proposedRevision} (เดิม Rev.${dar.currentRevision})
Request Dept:     ${dar.requestDept}
Requester:        ${dar.requesterName} (${dar.requesterTitle})
Target Date:      ${dar.targetEffectiveDate}
ISO Clause:       ${dar.isoClause || 'ISO 9001:2015 Clause 7.5.3'}
--------------------------------------------------------------------------------
1. เหตุผลความจำเป็นในการขอดำเนินการ:
${dar.reasonForChange}

2. รายละเอียดการเปลี่ยนแปลงข้อความ / กระบวนการ:
${dar.changeDetails || 'รายละเอียดและข้อความตามฉบับร่างที่ผู้ร้องขอได้จัดทำ'}
================================================================================`;

    const blob = new Blob([sampleContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${dar.docNo}_Rev${dar.proposedRevision}_DRAFT.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

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

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!docNo.trim() || !docNameTh.trim()) {
      setFormError('กรุณากรอกรหัสเอกสารและชื่อภาษาไทย');
      return;
    }

    if (!reasonForChange.trim()) {
      setFormError('กรุณาระบุเหตุผลความจำเป็นในการขอดำเนินการ');
      return;
    }

    // Revision skip validation enforcement
    if (revAnalysis.isSkipped && !skippedRevisionReason.trim()) {
      setFormError(
        `⚠️ ตรวจพบการข้าม Revision (${revAnalysis.warningMessage}) หากในระบบมี Rev.${revAnalysis.systemCurrentRev || currentRevision} แล้วต้องการขึ้นทะเบียนเป็น Rev.${proposedRevision} กรุณาระบุ "เหตุผลความจำเป็นในการข้าม Revision" หรือติดต่อ DCC ก่อนบันทึกใบ DAR`
      );
      return;
    }

    const createdId = createDar({
      requestType: reqType,
      requestDept: reqDept,
      requesterName: requesterName.trim(),
      requesterTitle: requesterTitle.trim(),
      targetEffectiveDate,
      docNo: docNo.trim().toUpperCase(),
      docNameTh: docNameTh.trim(),
      docNameEn: docNameEn.trim(),
      docType,
      currentRevision: reqType === 'NEW' ? 'N/A' : currentRevision.trim(),
      proposedRevision: reqType === 'OBSOLETE' ? 'OBSOLETE' : proposedRevision.trim(),
      reasonForChange: reasonForChange.trim(),
      changeDetails: changeDetails.trim(),
      isSkippedRevision: revAnalysis.isSkipped,
      skippedRevisionReason: revAnalysis.isSkipped ? skippedRevisionReason.trim() : undefined,
      systemCurrentRevision: revAnalysis.systemCurrentRev || undefined,
      isoClause: isoClause.trim(),
      attachmentFileName: attachedFile?.name,
      attachmentFileSize: attachedFile?.size,
      attachmentFileType: attachedFile?.type,
      attachmentFileDataUrl: attachedFile?.dataUrl,
      requesterSignature: requesterSignature,
      distributionHolders: darDistributionHolders,
    });

    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.7 },
    });

    setIsCreateModalOpen(false);
  };

  const handleRegisterToMasterList = (darId: string) => {
    registerDarToMasterList(darId);
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.5 },
    });
    setSelectedDarForReview(null);
  };

  return (
    <div id="dcs-dar-view" className="space-y-6 pb-12">
      
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
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
            setFormError('');
            setIsCreateModalOpen(true);
          }}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          สร้าง DAR ใหม่ (New Request)
        </button>
      </div>

      {/* Filter and Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
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

      {/* DAR Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredDars.length === 0 ? (
          <div className="col-span-full p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
            <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            ไม่พบรายการ DAR ตามเงื่อนไข
          </div>
        ) : (
          filteredDars.map(dar => {
            return (
              <div
                key={dar.id}
                className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between space-y-4"
              >
                
                {/* Header Strip */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                      {dar.id}
                    </span>
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                      dar.requestType === 'NEW'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : dar.requestType === 'REVISION'
                          ? 'bg-blue-50 text-blue-800 border-blue-200'
                          : 'bg-rose-50 text-rose-800 border-rose-200'
                    }`}>
                      {dar.requestType === 'NEW' ? '✨ เอกสารใหม่' : dar.requestType === 'REVISION' ? '✏️ ขอแก้ไข' : '🗑️ ขอยกเลิก'}
                    </span>
                  </div>

                  <div>
                    <div className="font-mono font-bold text-sm text-slate-900">{dar.docNo}</div>
                    <div className="font-bold text-xs sm:text-sm text-slate-800 line-clamp-1">{dar.docNameTh}</div>
                    <div className="text-xs text-slate-500 italic line-clamp-1">{dar.docNameEn}</div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-slate-400">หน่วยงานขอ: </span>
                      <strong className="text-slate-800 font-semibold">{dar.requestDept}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Revision: </span>
                      <strong className="font-mono font-bold text-indigo-700">
                        {dar.currentRevision} ➔ {dar.proposedRevision}
                      </strong>
                    </div>
                  </div>

                  {/* Skipped Revision Warning Indicator on Card */}
                  {(dar.isSkippedRevision || dar.skippedRevisionReason) && (
                    <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl space-y-1">
                      <div className="flex items-center gap-1 text-xs font-bold text-amber-900">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>ตรวจพบการข้าม Revision ({dar.currentRevision} ➔ {dar.proposedRevision})</span>
                      </div>
                      {dar.skippedRevisionReason && (
                        <p className="text-xs text-amber-950 font-medium line-clamp-2 pl-4.5">
                          <strong>เหตุผลข้าม Rev:</strong> {dar.skippedRevisionReason}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 line-clamp-2 leading-relaxed">
                    <strong>เหตุผล:</strong> {dar.reasonForChange}
                  </div>
                </div>

                {/* Footer and Actions */}
                <div className="space-y-3 pt-2.5 border-t border-slate-100">
                  
                  {/* Status Badge */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 text-xs">สถานะการพิจารณา:</span>
                    <span className={`px-2.5 py-0.5 rounded-full font-bold text-xs border ${
                      dar.status === 'PENDING_REVIEW'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : dar.status === 'UNDER_REVIEW'
                          ? 'bg-cyan-50 text-cyan-800 border-cyan-200'
                          : dar.status === 'APPROVED'
                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                            : dar.status === 'REGISTERED'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-rose-50 text-rose-800 border-rose-200'
                    }`}>
                      {dar.status === 'PENDING_REVIEW' && '⏳ รอ DCC ตรวจสอบ'}
                      {dar.status === 'UNDER_REVIEW' && '🔍 อยู่ระหว่างตรวจ'}
                      {dar.status === 'APPROVED' && '🟢 อนุมัติแล้ว'}
                      {dar.status === 'REGISTERED' && '⭐ ขึ้นทะเบียนแล้ว'}
                      {dar.status === 'REJECTED' && '🔴 ไม่อนุมัติ'}
                    </span>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleDownloadDarDraft(dar)}
                        className="text-[11px] text-indigo-700 hover:text-indigo-900 font-bold flex items-center gap-1 cursor-pointer bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200 transition-colors"
                        title="ดาวน์โหลดไฟล์ร่างที่ผู้ออก DAR แนบมาลงเครื่อง"
                      >
                        <Download className="w-3.5 h-3.5 text-indigo-600" />
                        ดาวน์โหลดไฟล์ร่าง
                      </button>

                      <button
                        type="button"
                        onClick={() => openDocumentViewer({
                          title: dar.docNameTh,
                          docNo: dar.docNo,
                          docNameTh: dar.docNameTh,
                          docNameEn: dar.docNameEn,
                          docType: dar.docType,
                          revision: dar.proposedRevision,
                          dept: dar.requestDept,
                          fileName: dar.attachmentFileName,
                          fileSize: dar.attachmentFileSize,
                          fileType: dar.attachmentFileType,
                          fileDataUrl: dar.attachmentFileDataUrl,
                          darId: dar.id,
                          reasonForChange: dar.reasonForChange,
                          changeDetails: dar.changeDetails,
                          isoClause: dar.isoClause,
                        })}
                        className="text-[11px] text-slate-700 hover:text-slate-900 font-semibold flex items-center gap-1 cursor-pointer bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg border border-slate-200 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-600" />
                        เปิดดู
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedDarForPrint(dar)}
                        className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                        title="พิมพ์แบบฟอร์ม DAR A4 & จัดการลายเซ็น"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        พิมพ์ A4 / ลายเซ็น
                      </button>

                      <button
                        onClick={() => {
                          setSelectedDarForReview(dar);
                          setReviewRemarks(dar.dccRemarks || '');
                        }}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-xs"
                      >
                        ดูรายละเอียด / พิจารณา
                      </button>
                    </div>
                  </div>

                </div>

              </div>
            );
          })
        )}
      </div>

      {/* Review / Details Modal */}
      {selectedDarForReview && (
        <div
          id="dar-review-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedDarForReview(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto"
        >
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8">
            
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

              {/* Draft File Attachment card */}
              <div className="p-4 bg-indigo-50/70 border-2 border-indigo-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
                    <FileCheck2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="font-bold text-indigo-950 block text-xs truncate">
                      {selectedDarForReview.attachmentFileName || `${selectedDarForReview.docNo}_Rev${selectedDarForReview.proposedRevision}_DRAFT.docx`}
                    </span>
                    <span className="text-[11px] text-indigo-700 block">
                      ขนาด: {selectedDarForReview.attachmentFileSize || '1.2 MB'} • ชนิด: {selectedDarForReview.attachmentFileType || 'Document'} • แนบโดยผู้ออก DAR
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleDownloadDarDraft(selectedDarForReview)}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    ดาวน์โหลดไฟล์ร่าง
                  </button>

                  <button
                    type="button"
                    onClick={() => openDocumentViewer({
                      title: selectedDarForReview.docNameTh,
                      docNo: selectedDarForReview.docNo,
                      docNameTh: selectedDarForReview.docNameTh,
                      docNameEn: selectedDarForReview.docNameEn,
                      docType: selectedDarForReview.docType,
                      revision: selectedDarForReview.proposedRevision,
                      dept: selectedDarForReview.requestDept,
                      fileName: selectedDarForReview.attachmentFileName,
                      fileSize: selectedDarForReview.attachmentFileSize,
                      fileType: selectedDarForReview.attachmentFileType,
                      fileDataUrl: selectedDarForReview.attachmentFileDataUrl,
                      darId: selectedDarForReview.id,
                      reasonForChange: selectedDarForReview.reasonForChange,
                      changeDetails: selectedDarForReview.changeDetails,
                      isoClause: selectedDarForReview.isoClause,
                    })}
                    className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    เปิดดู
                  </button>
                </div>
              </div>

              {/* ISO Clause */}
              <div className="text-[11px] text-slate-500">
                ข้อกำหนด ISO/IATF ที่เกี่ยวข้อง: <strong>{selectedDarForReview.isoClause || 'ISO 9001:2015 Clause 7.5'}</strong>
              </div>

              {/* DCC Action Section */}
              {currentUser.currentDept === 'DCC' && (
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

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    
                    {/* Auto Register button */}
                    <button
                      onClick={() => handleRegisterToMasterList(selectedDarForReview.id)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
                    >
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      🚀 อนุมัติ & ขึ้นทะเบียน Master List ทันที
                    </button>

                    <button
                      onClick={() => {
                        reviewDar(selectedDarForReview.id, 'APPROVED', reviewRemarks);
                        setSelectedDarForReview(null);
                      }}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      อนุมัติ (Approved)
                    </button>

                    <button
                      onClick={() => {
                        reviewDar(selectedDarForReview.id, 'UNDER_REVIEW', reviewRemarks);
                        setSelectedDarForReview(null);
                      }}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      ขอเอกสารเพิ่มเติม
                    </button>

                    <button
                      onClick={() => {
                        reviewDar(selectedDarForReview.id, 'REJECTED', reviewRemarks);
                        setSelectedDarForReview(null);
                      }}
                      className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      ไม่อนุมัติ (Reject)
                    </button>

                  </div>
                </div>
              )}

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
            if (e.target === e.currentTarget) setIsCreateModalOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto"
        >
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8">
            
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
              <button
                type="button"
                id="btn-close-dar-create-header"
                onClick={() => setIsCreateModalOpen(false)}
                aria-label="ปิดหน้าต่าง"
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1 text-xs"
                title="ปิดหน้าต่าง (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-xs text-slate-800">
              
              {/* Type selector */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                  ประเภทการขอดำเนินการ (Action Type) <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setReqType('NEW');
                      setCurrentRevision('N/A');
                      setProposedRevision('00');
                    }}
                    className={`py-2 px-3 rounded-xl font-bold text-xs border text-center cursor-pointer transition-all ${
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
                    className={`py-2 px-3 rounded-xl font-bold text-xs border text-center cursor-pointer transition-all ${
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
                    className={`py-2 px-3 rounded-xl font-bold text-xs border text-center cursor-pointer transition-all ${
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 p-4 bg-slate-50 border border-slate-200 rounded-xl">
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

              {/* Document Identity */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
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
                    ประเภทเอกสาร (Type ตาม QP-QS-001)
                  </label>
                  <select
                    value={docType}
                    onChange={e => setDocType(e.target.value as any)}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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

              {/* File Attachment & Upload Zone (New Feature) */}
              <div className="space-y-2">
                <label className="block text-[11px] font-bold text-slate-800 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-indigo-600" />
                    อัปโหลดไฟล์ร่างเอกสาร / เอกสารแนบ (Draft Document Attachment)
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal">
                    (PDF, DOCX, XLSX, PPTX, ภาพ หรือ ZIP)
                  </span>
                </label>

                {attachedFile ? (
                  <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                        <FileCheck2 className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-bold text-xs text-indigo-950 block">{attachedFile.name}</span>
                        <span className="text-[10px] text-indigo-700 font-mono">
                          ขนาด {attachedFile.size} • ชนิดไฟล์: {attachedFile.type || 'Document'}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setAttachedFile(null)}
                      className="p-1.5 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
                      title="ลบไฟล์แนบ"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingFile(true);
                    }}
                    onDragLeave={() => setIsDraggingFile(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingFile(false);
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        const file = e.dataTransfer.files[0];
                        const sizeStr =
                          file.size > 1024 * 1024
                            ? (file.size / (1024 * 1024)).toFixed(2) + ' MB'
                            : (file.size / 1024).toFixed(1) + ' KB';
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          setAttachedFile({
                            name: file.name,
                            size: sizeStr,
                            type: file.type || file.name.split('.').pop() || 'file',
                            dataUrl: ev.target?.result as string,
                          });
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    className={`border-2 border-dashed rounded-xl p-4 text-center transition-all ${
                      isDraggingFile
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-slate-300 hover:border-indigo-400 bg-slate-50/50'
                    }`}
                  >
                    <Upload className="w-6 h-6 mx-auto text-indigo-500 mb-1" />
                    <p className="text-xs font-semibold text-slate-700">
                      ลากและวางไฟล์เอกสารร่างลงที่นี่ หรือ{' '}
                      <label className="text-indigo-600 hover:underline cursor-pointer font-bold">
                        เลือกไฟล์จากเครื่อง
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              const file = e.target.files[0];
                              const sizeStr =
                                file.size > 1024 * 1024
                                  ? (file.size / (1024 * 1024)).toFixed(2) + ' MB'
                                  : (file.size / 1024).toFixed(1) + ' KB';
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                setAttachedFile({
                                  name: file.name,
                                  size: sizeStr,
                                  type: file.type || file.name.split('.').pop() || 'file',
                                  dataUrl: ev.target?.result as string,
                                });
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      รองรับ .pdf, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .png, .jpg, .zip
                    </p>
                  </div>
                )}
              </div>

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
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            setDarDistributionHolders(prev =>
                              prev.map((h, i) => (i === idx ? { ...h, checked: isChecked } : h))
                            );
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500 shrink-0"
                        />
                        <span className="truncate text-[11px]">{holder.position}</span>
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

              {formError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs">
                  {formError}
                </div>
              )}

              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 -mx-6 -mb-6 mt-4">
                <button
                  type="button"
                  id="btn-close-dar-create-footer"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  ยกเลิก / ปิดหน้าต่าง
                </button>
                <button
                  type="submit"
                  id="btn-submit-dar"
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <Send className="w-3.5 h-3.5" />
                  ยื่นใบขอดำเนินการ (Submit DAR)
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* Printable DAR Modal */}
      {selectedDarForPrint && (
        <DarPrintModal
          dar={selectedDarForPrint}
          onClose={() => setSelectedDarForPrint(null)}
        />
      )}

    </div>
  );
};
