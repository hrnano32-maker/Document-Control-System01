import React, { useState, useRef, useEffect } from 'react';
import { useDcs } from '../context/DcsContext';
import { DarRecord } from '../types';
import {
  Printer,
  X,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  Trash2,
  Save,
  Download,
  ExternalLink,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { printElementById, openPrintInNewTab, downloadPrintableHtml } from '../utils/printHelper';

interface DarPrintModalProps {
  dar: DarRecord;
  onClose: () => void;
}

const DEFAULT_POSITIONS = [
  'ผู้จัดการโรงงาน / Plant Manager',
  'เจ้าหน้าที่ควบคุมเอกสาร (DCC)',
  'ผู้จัดการฝ่ายผลิต (Production Mgr.)',
  'ผู้จัดการฝ่ายประกันคุณภาพ (QA Mgr.)',
  'ผู้จัดการฝ่ายควบคุมคุณภาพ (QC Mgr.)',
  'ผู้จัดการฝ่ายวิศวกรรม (Engineering Mgr.)',
  'หัวหน้าแผนกคลังสินค้า (Warehouse)',
  'หัวหน้าแผนกจัดซื้อ (Purchasing)',
  'หัวหน้าแผนกซ่อมบำรุง (Maintenance)',
  'หัวหน้าแผนกความปลอดภัย (SHE/Safety)',
  'หัวหน้าแผนกบุคคลและธุรการ (HR & Admin)',
  'หัวหน้าฝ่ายวางแผนการผลิต (PMC)',
  'หัวหน้าฝ่ายขายและการตลาด (Sales)',
  'ผู้บริหารตัวแทนระบบ (QMR)',
];

export const DarPrintModal: React.FC<DarPrintModalProps> = ({ dar, onClose }) => {
  const { updateDarSignatures, currentUser } = useDcs();

  // Local signature states
  const [requesterSig, setRequesterSig] = useState<string | undefined>(dar.requesterSignature);
  const [requesterName, setRequesterName] = useState<string>(dar.requesterName || currentUser.userName);
  const [requesterDate, setRequesterDate] = useState<string>(dar.requestDate || new Date().toISOString().split('T')[0]);

  const [deptManagerName, setDeptManagerName] = useState<string>(dar.deptApproverName || `ผู้จัดการฝ่าย ${dar.requestDept}`);
  const [deptManagerDate, setDeptManagerDate] = useState<string>(dar.deptApproverDate || dar.requestDate);
  const [deptManagerSig, setDeptManagerSig] = useState<string | undefined>(dar.deptApproverSignature);

  const [qmrName, setQmrName] = useState<string>(dar.qmrName || 'ตัวแทนฝ่ายบริหาร (QMR)');
  const [qmrDate, setQmrDate] = useState<string>(dar.qmrDate || new Date().toISOString().split('T')[0]);
  const [qmrSig, setQmrSig] = useState<string | undefined>(dar.qmrSignature);
  const [qmrDecision, setQmrDecision] = useState<'YES' | 'NO'>(
    dar.qmrApprovalDecision || (dar.status === 'APPROVED' || dar.status === 'REGISTERED' ? 'YES' : 'YES')
  );

  // Review items: QP, PQCT, SD, WI, FMEA, BOM (User strictly requested BOM instead of "เอกสารอื่นๆ")
  const [reviewItems, setReviewItems] = useState<string[]>(
    dar.reviewItems || ['QP', 'WI']
  );

  // Distribution holders list (14 items matching the form)
  const [distributionList, setDistributionList] = useState<{ checked: boolean; position: string; copies: string }[]>(() => {
    if (dar.distributionHolders && dar.distributionHolders.length === 14) {
      return dar.distributionHolders;
    }
    return DEFAULT_POSITIONS.map((pos, idx) => ({
      checked: idx < 4,
      position: pos,
      copies: idx < 4 ? '1' : '',
    }));
  });

  const [isSaved, setIsSaved] = useState(false);
  const [activeDragBox, setActiveDragBox] = useState<string | null>(null);

  // Hidden file inputs for manual click upload
  const requesterInputRef = useRef<HTMLInputElement>(null);
  const deptManagerInputRef = useRef<HTMLInputElement>(null);
  const qmrInputRef = useRef<HTMLInputElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Handle image file drop or select
  const handleSignatureFile = (
    file: File,
    setSig: (dataUrl: string) => void
  ) => {
    if (!file.type.startsWith('image/')) {
      alert('กรุณาเลือกหรือลากไฟล์รูปภาพลายเซ็น (PNG, JPG, SVG, WebP)');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setSig(e.target.result as string);
        setIsSaved(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent, boxId: string) => {
    e.preventDefault();
    setActiveDragBox(boxId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setActiveDragBox(null);
  };

  const handleDrop = (
    e: React.DragEvent,
    boxId: string,
    setSig: (dataUrl: string) => void
  ) => {
    e.preventDefault();
    setActiveDragBox(null);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleSignatureFile(e.dataTransfer.files[0], setSig);
    }
  };

  const handleSaveSignatures = () => {
    updateDarSignatures(dar.id, {
      requesterName,
      requestDate: requesterDate,
      requesterSignature: requesterSig,
      deptApproverName: deptManagerName,
      deptApproverDate: deptManagerDate,
      deptApproverSignature: deptManagerSig,
      qmrName: qmrName,
      qmrDate: qmrDate,
      qmrSignature: qmrSig,
      qmrApprovalDecision: qmrDecision,
      reviewItems,
      distributionHolders: distributionList,
    });
    setIsSaved(true);
    confetti({
      particleCount: 40,
      spread: 60,
      origin: { y: 0.7 },
    });
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handlePrint = () => {
    handleSaveSignatures();
    printElementById('dar-printable-sheet', `DAR_${dar.id}_Form`);
  };

  const handleOpenTab = () => {
    handleSaveSignatures();
    const success = openPrintInNewTab('dar-printable-sheet', `DAR_${dar.id}_Form`);
    if (!success) {
      printElementById('dar-printable-sheet', `DAR_${dar.id}_Form`);
    }
  };

  const handleDownload = () => {
    handleSaveSignatures();
    downloadPrintableHtml('dar-printable-sheet', `DAR_Form_${dar.id}`);
  };

  const quickSignCurrent = (role: 'requester' | 'dept' | 'qmr') => {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = 'italic bold 22px cursive, sans-serif';
      ctx.fillStyle = '#0f172a';
      ctx.fillText(currentUser.userName.split(' ')[0], 25, 45);
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(20, 52);
      ctx.bezierCurveTo(80, 58, 140, 42, 210, 55);
      ctx.stroke();
      const dataUrl = canvas.toDataURL('image/png');

      if (role === 'requester') setRequesterSig(dataUrl);
      if (role === 'dept') setDeptManagerSig(dataUrl);
      if (role === 'qmr') setQmrSig(dataUrl);
      setIsSaved(false);
    }
  };

  const toggleReviewItem = (item: string) => {
    setReviewItems(prev =>
      prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]
    );
    setIsSaved(false);
  };

  const toggleDistributionItem = (idx: number) => {
    setDistributionList(prev =>
      prev.map((item, i) =>
        i === idx
          ? { ...item, checked: !item.checked, copies: !item.checked && !item.copies ? '1' : item.copies }
          : item
      )
    );
    setIsSaved(false);
  };

  const updateDistributionCopies = (idx: number, copies: string) => {
    setDistributionList(prev =>
      prev.map((item, i) => (i === idx ? { ...item, copies } : item))
    );
    setIsSaved(false);
  };

  const updateDistributionPosition = (idx: number, position: string) => {
    setDistributionList(prev =>
      prev.map((item, i) => (i === idx ? { ...item, position } : item))
    );
    setIsSaved(false);
  };

  // Helper to format date in DD/MM/YYYY
  const formatThaiDate = (dateStr?: string) => {
    if (!dateStr) return '………..../……….…/……...….';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  // Determine doc type checkboxes in NANO QP-QS-001 format
  // Level 1: QM, Level 2: QP, Level 3: WI, Level 4: FM, SD, Level 5: DRAWING, EX
  const isQM = dar.docType === 'QM';
  const isQP = dar.docType === 'QP' || (dar.docType as string) === 'SOP';
  const isWI = dar.docType === 'WI';
  const isFM = dar.docType === 'FM';
  const isSD = dar.docType === 'SD';
  const isDrawing = dar.docType === 'DRAWING';
  const isEX = dar.docType === 'EX';
  const isOtherDocType = !isQM && !isQP && !isWI && !isFM && !isSD && !isDrawing && !isEX;

  // Request purpose
  const isNew = dar.requestType === 'NEW';
  const isRevision = dar.requestType === 'REVISION';
  const isObsolete = dar.requestType === 'OBSOLETE';

  return (
    <div
      id="dar-print-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto"
    >
      <div className="bg-slate-100 rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-300 overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Controls Bar (Hidden during actual print) */}
        <div className="print:hidden bg-slate-900 text-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-red-600 flex items-center justify-center font-black text-xs tracking-tighter text-white shadow-xs">
              NANO
            </div>
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                ใบขอดำเนินการจัดการด้านเอกสาร (DAR.)
                <span className="font-mono text-xs bg-slate-800 text-red-300 px-2 py-0.5 rounded border border-red-800">
                  {dar.id}
                </span>
              </h3>
              <p className="text-[11px] text-slate-300">
                ฟอร์มมาตรฐาน FM-QS-001-01:11/09/23 (ทบทวน: QP, PQCT, SD, WI, FMEA, BOM)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              type="button"
              id="btn-save-dar-signatures"
              onClick={handleSaveSignatures}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                isSaved
                  ? 'bg-emerald-600 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              {isSaved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              {isSaved ? 'บันทึกเรียบร้อย' : 'บันทึกข้อมูลฟอร์ม'}
            </button>

            <button
              type="button"
              id="btn-print-dar-newtab"
              onClick={handleOpenTab}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-1 cursor-pointer transition-all"
              title="เปิดหน้าต่างใหม่เพื่อสั่งพิมพ์ (กรณีถูกบล็อกใน iframe)"
            >
              <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
              เปิดแท็บใหม่พิมพ์
            </button>

            <button
              type="button"
              id="btn-download-dar-html"
              onClick={handleDownload}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-1 cursor-pointer transition-all"
              title="ดาวน์โหลดไฟล์เอกสารพร้อมพิมพ์ HTML/PDF"
            >
              <Download className="w-3.5 h-3.5 text-indigo-400" />
              ดาวน์โหลดไฟล์พิมพ์
            </button>

            <button
              type="button"
              id="btn-trigger-print-dar"
              onClick={handlePrint}
              className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-red-950/40"
            >
              <Printer className="w-4 h-4" />
              พิมพ์ใบ DAR (Print A4)
            </button>

            <button
              type="button"
              id="btn-close-dar-print-header"
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="ปิดหน้าต่าง (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tip Bar (Hidden on print) */}
        <div className="print:hidden bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-900 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              💡 <strong>ปรับแต่งก่อนพิมพ์:</strong> สามารถคลิกเลือกรายการทบทวน (เช่น <strong>BOM</strong>, QP, WI), แก้ไขตำแหน่งแจกจ่าย และลากไฟล์รูปภาพลายเซ็นต์วางในช่องเซ็นได้
            </span>
          </div>
          <span className="text-[10px] text-amber-800 font-mono font-bold">FM-QS-001-01</span>
        </div>

        {/* Printable Paper Canvas */}
        <div className="p-4 sm:p-6 max-h-[80vh] overflow-y-auto bg-slate-200 flex justify-center print:p-0 print:m-0 print:max-h-none print:overflow-visible print:bg-white">
          
          {/* Exact A4 Standard Form matching user's PDF */}
          <div
            id="dar-printable-sheet"
            className="bg-white text-black p-8 sm:p-10 rounded-lg shadow-xl border border-slate-300 w-full max-w-[850px] print:shadow-none print:border-0 print:p-6 print:rounded-none print:w-full font-sans"
            style={{ fontFamily: "'Prompt', 'Sarabun', system-ui, -apple-system, sans-serif" }}
          >
            
            {/* 1. Header with NANO Logo & Form Title */}
            <div className="relative mb-4 flex items-center justify-center min-h-[50px]">
              {/* NANO Logo (Red Oval) on the left */}
              <div className="absolute left-0 top-0 flex items-center">
                <div className="w-24 h-10 border-2 border-red-600 rounded-[50%] flex items-center justify-center bg-white shadow-xs">
                  <span className="text-red-600 font-black text-lg tracking-wider" style={{ fontFamily: 'Arial, sans-serif' }}>
                    NANO
                  </span>
                </div>
              </div>

              {/* Centered Form Title */}
              <div className="text-center">
                <h1 className="text-xl sm:text-2xl font-bold text-black tracking-normal">
                  ใบขอดำเนินการจัดการด้านเอกสาร (DAR.)
                </h1>
              </div>
            </div>

            {/* 2. ประเภทเอกสาร (Document Types) & มีความประสงค์ (Purposes) */}
            <div className="space-y-2.5 mb-3 text-[13px] text-black">
              
              {/* ประเภทเอกสาร */}
              <div className="flex items-start gap-4">
                <span className="font-bold whitespace-nowrap w-28 shrink-0">ชนิดเอกสาร</span>
                <div className="grid grid-cols-4 gap-x-4 gap-y-1.5 flex-1 text-[11px]">
                  
                  {/* Level 1 & 2 */}
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <span className="w-3.5 h-3.5 border-2 border-black rounded-xs flex items-center justify-center text-[10px] font-bold">
                      {isQM ? '✓' : ''}
                    </span>
                    <span>คู่มือคุณภาพ (QM)</span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <span className="w-3.5 h-3.5 border-2 border-black rounded-xs flex items-center justify-center text-[10px] font-bold">
                      {isQP ? '✓' : ''}
                    </span>
                    <span>ระเบียบปฏิบัติ (QP)</span>
                  </label>

                  {/* Level 3 */}
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <span className="w-3.5 h-3.5 border-2 border-black rounded-xs flex items-center justify-center text-[10px] font-bold">
                      {isWI ? '✓' : ''}
                    </span>
                    <span>วิธีการทำงาน (WI)</span>
                  </label>

                  {/* Level 4 */}
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <span className="w-3.5 h-3.5 border-2 border-black rounded-xs flex items-center justify-center text-[10px] font-bold">
                      {isFM ? '✓' : ''}
                    </span>
                    <span>แบบฟอร์ม (FM)</span>
                  </label>

                  {/* Level 4 (SD) & Level 5 (DRAWING, EX, อื่นๆ) */}
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <span className="w-3.5 h-3.5 border-2 border-black rounded-xs flex items-center justify-center text-[10px] font-bold">
                      {isSD ? '✓' : ''}
                    </span>
                    <span>เอกสารสนับสนุน (SD)</span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <span className="w-3.5 h-3.5 border-2 border-black rounded-xs flex items-center justify-center text-[10px] font-bold">
                      {isDrawing ? '✓' : ''}
                    </span>
                    <span>DRAWING / แบบ</span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <span className="w-3.5 h-3.5 border-2 border-black rounded-xs flex items-center justify-center text-[10px] font-bold">
                      {isEX ? '✓' : ''}
                    </span>
                    <span>เอกสารภายนอก (EX)</span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <span className="w-3.5 h-3.5 border-2 border-black rounded-xs flex items-center justify-center text-[10px] font-bold">
                      {isOtherDocType ? '✓' : ''}
                    </span>
                    <span className="flex items-center gap-1 flex-1">
                      อื่น ๆ
                      <span className="border-b border-black flex-1 min-w-[40px] inline-block text-[10px] pl-1">
                        {isOtherDocType ? dar.docType : ''}
                      </span>
                    </span>
                  </label>

                </div>
              </div>

              {/* มีความประสงค์ */}
              <div className="flex items-start gap-4 pt-1">
                <span className="font-bold whitespace-nowrap w-28 shrink-0">มีความประสงค์</span>
                <div className="grid grid-cols-4 gap-x-4 flex-1">
                  
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="w-4 h-4 rounded-full border-2 border-black flex items-center justify-center text-[10px] font-bold">
                      {isNew ? '●' : ''}
                    </span>
                    <span>ขอจัดทำใหม่</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="w-4 h-4 rounded-full border-2 border-black flex items-center justify-center text-[10px] font-bold">
                      {isRevision ? '●' : ''}
                    </span>
                    <span>ขอแก้ไข</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="w-4 h-4 rounded-full border-2 border-black flex items-center justify-center text-[10px] font-bold">
                      {isObsolete ? '●' : ''}
                    </span>
                    <span>ยกเลิก</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="w-4 h-4 rounded-full border-2 border-black flex items-center justify-center text-[10px] font-bold"></span>
                    <span className="flex items-center gap-1 flex-1">
                      อื่น ๆ
                      <span className="border-b border-black flex-1 min-w-[60px] inline-block"></span>
                    </span>
                  </label>

                </div>
              </div>

            </div>

            {/* 3. ตามรายการดังต่อไปนี้ (Main Document Table) */}
            <div className="mb-2">
              <div className="font-bold text-[13px] text-black mb-1">ตามรายการดังต่อไปนี้</div>
              
              <table className="w-full border-collapse border-2 border-black text-center text-xs">
                <thead>
                  <tr className="border-b-2 border-black bg-white font-bold text-[12px]">
                    <th className="border-r border-black p-2 w-12">ลำดับ</th>
                    <th className="border-r border-black p-2 w-32">หมายเลข</th>
                    <th className="border-r border-black p-2">ชื่อเอกสาร</th>
                    <th className="border-r border-black p-2 w-32 leading-tight">
                      วันที่เอกสารเดิม<br />บังคับใช้
                    </th>
                    <th className="border-r border-black p-2 w-20">ฉบับที่</th>
                    <th className="p-2 w-48">เหตุผล</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Row 1 - Populated with Current DAR record */}
                  <tr className="border-b border-black min-h-[36px]">
                    <td className="border-r border-black p-2 align-middle font-medium">1</td>
                    <td className="border-r border-black p-2 align-middle font-mono font-bold text-left">{dar.docNo}</td>
                    <td className="border-r border-black p-2 align-middle text-left leading-tight">
                      <div className="font-semibold text-black">{dar.docNameTh}</div>
                      {dar.docNameEn && <div className="text-[10px] text-slate-700 italic">{dar.docNameEn}</div>}
                    </td>
                    <td className="border-r border-black p-2 align-middle font-mono text-[11px]">
                      {dar.requestType === 'NEW' ? '-' : formatThaiDate(dar.requestDate)}
                    </td>
                    <td className="border-r border-black p-2 align-middle font-mono font-bold">
                      {dar.requestType === 'NEW' ? dar.proposedRevision : `${dar.currentRevision} ➔ ${dar.proposedRevision}`}
                    </td>
                    <td className="p-2 align-middle text-left text-[11px] leading-tight">
                      {dar.reasonForChange}
                      {dar.skippedRevisionReason && (
                        <div className="text-[10px] text-red-600 font-medium mt-0.5">
                          (ข้าม Rev: {dar.skippedRevisionReason})
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* Empty rows 2 to 6 with dashed bottom borders to match paper form */}
                  {[2, 3, 4, 5, 6].map((rowNum) => (
                    <tr key={rowNum} className="border-b border-dotted border-black/50 h-7">
                      <td className="border-r border-black p-1 text-slate-400">{rowNum}</td>
                      <td className="border-r border-black p-1"></td>
                      <td className="border-r border-black p-1"></td>
                      <td className="border-r border-black p-1"></td>
                      <td className="border-r border-black p-1"></td>
                      <td className="p-1"></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 4. ที่ต้องทบทวน (Review Section) with BOM instead of เอกสารอื่นๆ */}
            <div className="mb-4 text-[13px] text-black">
              <div className="flex items-start gap-4">
                <span className="font-bold whitespace-nowrap w-28 shrink-0 pt-0.5">ที่ต้องทบทวน</span>
                
                <div className="grid grid-cols-3 gap-x-8 gap-y-1.5 flex-1">
                  
                  {/* Row 1: QP, PQCT, SD */}
                  <label
                    onClick={() => toggleReviewItem('QP')}
                    className="flex items-center gap-2 cursor-pointer select-none"
                  >
                    <span className="w-4 h-4 border-2 border-black rounded-xs flex items-center justify-center text-[11px] font-bold">
                      {reviewItems.includes('QP') ? '✓' : ''}
                    </span>
                    <span className="font-medium">QP</span>
                  </label>

                  <label
                    onClick={() => toggleReviewItem('PQCT')}
                    className="flex items-center gap-2 cursor-pointer select-none"
                  >
                    <span className="w-4 h-4 border-2 border-black rounded-xs flex items-center justify-center text-[11px] font-bold">
                      {reviewItems.includes('PQCT') ? '✓' : ''}
                    </span>
                    <span className="font-medium">PQCT</span>
                  </label>

                  <label
                    onClick={() => toggleReviewItem('SD')}
                    className="flex items-center gap-2 cursor-pointer select-none"
                  >
                    <span className="w-4 h-4 border-2 border-black rounded-xs flex items-center justify-center text-[11px] font-bold">
                      {reviewItems.includes('SD') ? '✓' : ''}
                    </span>
                    <span className="font-medium">SD</span>
                  </label>

                  {/* Row 2: WI, FMEA, BOM (User requested BOM exclusively instead of 'เอกสารอื่นๆ') */}
                  <label
                    onClick={() => toggleReviewItem('WI')}
                    className="flex items-center gap-2 cursor-pointer select-none"
                  >
                    <span className="w-4 h-4 border-2 border-black rounded-xs flex items-center justify-center text-[11px] font-bold">
                      {reviewItems.includes('WI') ? '✓' : ''}
                    </span>
                    <span className="font-medium">WI</span>
                  </label>

                  <label
                    onClick={() => toggleReviewItem('FMEA')}
                    className="flex items-center gap-2 cursor-pointer select-none"
                  >
                    <span className="w-4 h-4 border-2 border-black rounded-xs flex items-center justify-center text-[11px] font-bold">
                      {reviewItems.includes('FMEA') ? '✓' : ''}
                    </span>
                    <span className="font-medium">FMEA</span>
                  </label>

                  <label
                    onClick={() => toggleReviewItem('BOM')}
                    className="flex items-center gap-2 cursor-pointer select-none"
                  >
                    <span className="w-4 h-4 border-2 border-black rounded-xs flex items-center justify-center text-[11px] font-bold bg-amber-50/50">
                      {reviewItems.includes('BOM') ? '✓' : ''}
                    </span>
                    <span className="font-bold text-black">BOM</span>
                  </label>

                </div>
              </div>
            </div>

            {/* 5. รายละเอียดการแจก-จ่าย (Distribution Details) */}
            <div className="mb-4 text-[12px] text-black">
              <h3 className="font-bold text-[14px] text-black border-b border-black/30 pb-0.5 mb-1.5">
                รายละเอียดการแจก-จ่าย
              </h3>

              {/* Sub header line */}
              <div className="flex items-center justify-between gap-4 mb-2 text-[12px]">
                <div className="flex items-center gap-2">
                  <span>โดยเอกสารฉบับใหม่ มีวันที่บังคับใช้ :</span>
                  <span className="border-b border-black min-w-[140px] inline-block font-mono font-bold pl-2">
                    {formatThaiDate(dar.targetEffectiveDate)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span>ฉบับที่ :</span>
                  <span className="border-b border-black min-w-[80px] inline-block font-mono font-bold pl-2">
                    {dar.proposedRevision}
                  </span>
                </div>
              </div>

              <div className="font-bold text-[12px] mb-1.5">ผู้ถือครองตามตำแหน่งงาน</div>

              {/* 2 Columns x 7 rows grid */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
                
                {/* Column 1 (Items 0 to 6) */}
                <div className="space-y-1.5">
                  {distributionList.slice(0, 7).map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-[11px]">
                      <span
                        onClick={() => toggleDistributionItem(idx)}
                        className="w-4 h-4 border-2 border-black rounded-xs flex items-center justify-center text-[10px] font-bold cursor-pointer shrink-0"
                      >
                        {item.checked ? '✓' : ''}
                      </span>
                      
                      <input
                        type="text"
                        value={item.position}
                        onChange={(e) => updateDistributionPosition(idx, e.target.value)}
                        placeholder="_____________________________________"
                        className="border-b border-black/60 bg-transparent flex-1 text-[11px] focus:outline-none focus:border-indigo-600 truncate"
                      />

                      <div className="flex items-center gap-1 shrink-0">
                        <span>จำนวนชุด</span>
                        <input
                          type="text"
                          value={item.copies}
                          onChange={(e) => updateDistributionCopies(idx, e.target.value)}
                          placeholder="___"
                          className="w-8 text-center border-b border-black/80 bg-transparent text-[11px] font-mono focus:outline-none font-bold"
                        />
                        <span>ชุด</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Column 2 (Items 7 to 13) */}
                <div className="space-y-1.5">
                  {distributionList.slice(7, 14).map((item, idx) => {
                    const realIdx = idx + 7;
                    return (
                      <div key={realIdx} className="flex items-center gap-2 text-[11px]">
                        <span
                          onClick={() => toggleDistributionItem(realIdx)}
                          className="w-4 h-4 border-2 border-black rounded-xs flex items-center justify-center text-[10px] font-bold cursor-pointer shrink-0"
                        >
                          {item.checked ? '✓' : ''}
                        </span>
                        
                        <input
                          type="text"
                          value={item.position}
                          onChange={(e) => updateDistributionPosition(realIdx, e.target.value)}
                          placeholder="_____________________________________"
                          className="border-b border-black/60 bg-transparent flex-1 text-[11px] focus:outline-none focus:border-indigo-600 truncate"
                        />

                        <div className="flex items-center gap-1 shrink-0">
                          <span>จำนวนชุด</span>
                          <input
                            type="text"
                            value={item.copies}
                            onChange={(e) => updateDistributionCopies(realIdx, e.target.value)}
                            placeholder="___"
                            className="w-8 text-center border-b border-black/80 bg-transparent text-[11px] font-mono focus:outline-none font-bold"
                          />
                          <span>ชุด</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>
            </div>

            {/* 6. Signatures Bottom Section (Exact 2-Box Split matching PDF) */}
            <div className="grid grid-cols-12 gap-3 mb-2 text-xs">
              
              {/* Left Box: แผนกที่ขอดำเนินการ + ผู้ขอดำเนินการ & ผู้อนุมัติ */}
              <div className="col-span-8 border-2 border-black flex flex-col justify-between">
                
                {/* Header: แผนกที่ขอดำเนินการ */}
                <div className="p-2 border-b-2 border-black flex items-center gap-2 font-bold text-[12px] bg-slate-50/50">
                  <span>แผนกที่ขอดำเนินการ :</span>
                  <span className="border-b border-black flex-1 font-semibold text-black pl-1">
                    {dar.requestDept}
                  </span>
                </div>

                {/* Sub 2-Columns: ผู้ขอดำเนินการ & ผู้อนุมัติ */}
                <div className="grid grid-cols-2 divide-x-2 divide-black flex-1">
                  
                  {/* Left Column: ผู้ขอดำเนินการ */}
                  <div
                    onDragOver={(e) => handleDragOver(e, 'requester')}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'requester', setRequesterSig)}
                    className={`p-2.5 flex flex-col justify-between min-h-[120px] transition-colors ${
                      activeDragBox === 'requester' ? 'bg-indigo-50/50 border-2 border-dashed border-indigo-500' : 'bg-white'
                    }`}
                  >
                    <div className="text-center font-bold text-[12px] pb-1">
                      ผู้ขอดำเนินการ
                    </div>

                    {/* Signature Slot */}
                    <div className="my-1 h-14 border border-dashed border-slate-300 rounded flex flex-col items-center justify-center relative overflow-hidden group">
                      {requesterSig ? (
                        <div className="relative w-full h-full flex items-center justify-center p-1">
                          <img
                            src={requesterSig}
                            alt="Requester Signature"
                            className="max-h-full max-w-full object-contain"
                          />
                          <button
                            type="button"
                            onClick={() => setRequesterSig(undefined)}
                            className="print:hidden absolute top-0.5 right-0.5 p-0.5 bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                            title="ลบลายเซ็น"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="text-center p-1 text-slate-400">
                          <span className="text-[9px] block">ลากรูปภาพลายเซ็นต์มาวาง</span>
                          <div className="print:hidden flex items-center justify-center gap-1 mt-0.5">
                            <button
                              type="button"
                              onClick={() => requesterInputRef.current?.click()}
                              className="text-[9px] text-indigo-600 hover:underline cursor-pointer font-bold"
                            >
                              เลือกไฟล์
                            </button>
                            <span className="text-[9px]">/</span>
                            <button
                              type="button"
                              onClick={() => quickSignCurrent('requester')}
                              className="text-[9px] text-emerald-600 hover:underline cursor-pointer font-bold"
                            >
                              เซ็นด่วน
                            </button>
                          </div>
                        </div>
                      )}
                      <input
                        ref={requesterInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleSignatureFile(e.target.files[0], setRequesterSig);
                          }
                        }}
                      />
                    </div>

                    {/* Date / Name Line */}
                    <div className="text-center text-[10px] text-black">
                      <div className="font-medium">
                        ({requesterName || '…………………………'})
                      </div>
                      <div className="text-[9px] text-slate-600 mt-0.5">
                        ({formatThaiDate(requesterDate)})
                      </div>
                    </div>
                  </div>

                  {/* Right Column: ผู้อนุมัติ */}
                  <div
                    onDragOver={(e) => handleDragOver(e, 'dept')}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'dept', setDeptManagerSig)}
                    className={`p-2.5 flex flex-col justify-between min-h-[120px] transition-colors ${
                      activeDragBox === 'dept' ? 'bg-indigo-50/50 border-2 border-dashed border-indigo-500' : 'bg-white'
                    }`}
                  >
                    <div className="text-center font-bold text-[12px] pb-1">
                      ผู้อนุมัติ
                    </div>

                    {/* Signature Slot */}
                    <div className="my-1 h-14 border border-dashed border-slate-300 rounded flex flex-col items-center justify-center relative overflow-hidden group">
                      {deptManagerSig ? (
                        <div className="relative w-full h-full flex items-center justify-center p-1">
                          <img
                            src={deptManagerSig}
                            alt="Dept Manager Signature"
                            className="max-h-full max-w-full object-contain"
                          />
                          <button
                            type="button"
                            onClick={() => setDeptManagerSig(undefined)}
                            className="print:hidden absolute top-0.5 right-0.5 p-0.5 bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                            title="ลบลายเซ็น"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="text-center p-1 text-slate-400">
                          <span className="text-[9px] block">ลากรูปภาพลายเซ็นต์มาวาง</span>
                          <div className="print:hidden flex items-center justify-center gap-1 mt-0.5">
                            <button
                              type="button"
                              onClick={() => deptManagerInputRef.current?.click()}
                              className="text-[9px] text-indigo-600 hover:underline cursor-pointer font-bold"
                            >
                              เลือกไฟล์
                            </button>
                            <span className="text-[9px]">/</span>
                            <button
                              type="button"
                              onClick={() => quickSignCurrent('dept')}
                              className="text-[9px] text-emerald-600 hover:underline cursor-pointer font-bold"
                            >
                              เซ็นด่วน
                            </button>
                          </div>
                        </div>
                      )}
                      <input
                        ref={deptManagerInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleSignatureFile(e.target.files[0], setDeptManagerSig);
                          }
                        }}
                      />
                    </div>

                    {/* Date / Name Line */}
                    <div className="text-center text-[10px] text-black">
                      <div className="font-medium">
                        ({deptManagerName || '…………………………'})
                      </div>
                      <div className="text-[9px] text-slate-600 mt-0.5">
                        ({formatThaiDate(deptManagerDate)})
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* Right Box: QMR Approval (YES / NO) */}
              <div className="col-span-4 border-2 border-black flex flex-col justify-between p-2.5">
                
                {/* Header: QMR */}
                <div className="text-center font-bold text-[12px] border-b border-black/40 pb-1 flex items-center justify-center gap-1">
                  <span>QMR.</span>
                  <span className="text-[10px]">✍</span>
                </div>

                {/* Radio / Checkbox YES / NO */}
                <div className="flex items-center justify-center gap-6 py-1 text-xs font-bold">
                  <label
                    onClick={() => { setQmrDecision('YES'); setIsSaved(false); }}
                    className="flex items-center gap-1.5 cursor-pointer select-none"
                  >
                    <span className="w-3.5 h-3.5 border border-black flex items-center justify-center text-[9px] font-bold">
                      {qmrDecision === 'YES' ? '✓' : ''}
                    </span>
                    <span>YES</span>
                  </label>

                  <label
                    onClick={() => { setQmrDecision('NO'); setIsSaved(false); }}
                    className="flex items-center gap-1.5 cursor-pointer select-none"
                  >
                    <span className="w-3.5 h-3.5 border border-black flex items-center justify-center text-[9px] font-bold">
                      {qmrDecision === 'NO' ? '✓' : ''}
                    </span>
                    <span>NO</span>
                  </label>
                </div>

                {/* Signature slot for QMR */}
                <div
                  onDragOver={(e) => handleDragOver(e, 'qmr')}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, 'qmr', setQmrSig)}
                  className={`my-1 h-14 border border-dashed border-slate-300 rounded flex flex-col items-center justify-center relative overflow-hidden group ${
                    activeDragBox === 'qmr' ? 'bg-indigo-50/50 border-2 border-dashed border-indigo-500' : 'bg-white'
                  }`}
                >
                  {qmrSig ? (
                    <div className="relative w-full h-full flex items-center justify-center p-1">
                      <img
                        src={qmrSig}
                        alt="QMR Signature"
                        className="max-h-full max-w-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => setQmrSig(undefined)}
                        className="print:hidden absolute top-0.5 right-0.5 p-0.5 bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        title="ลบลายเซ็น"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="text-center p-1 text-slate-400">
                      <span className="text-[9px] block">ลากรูปภาพลายเซ็นต์</span>
                      <div className="print:hidden flex items-center justify-center gap-1 mt-0.5">
                        <button
                          type="button"
                          onClick={() => qmrInputRef.current?.click()}
                          className="text-[9px] text-indigo-600 hover:underline cursor-pointer font-bold"
                        >
                          เลือกไฟล์
                        </button>
                        <span className="text-[9px]">/</span>
                        <button
                          type="button"
                          onClick={() => quickSignCurrent('qmr')}
                          className="text-[9px] text-emerald-600 hover:underline cursor-pointer font-bold"
                        >
                          เซ็นด่วน
                        </button>
                      </div>
                    </div>
                  )}
                  <input
                    ref={qmrInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleSignatureFile(e.target.files[0], setQmrSig);
                      }
                    }}
                  />
                </div>

                {/* QMR Date / Name */}
                <div className="text-center text-[10px] text-black">
                  <div className="font-medium truncate">
                    ({qmrName || '…………………………'})
                  </div>
                  <div className="text-[9px] text-slate-600 mt-0.5">
                    ({formatThaiDate(qmrDate)})
                  </div>
                </div>

              </div>

            </div>

            {/* 7. Footer Form Number (FM-QS-001-01:11/09/23) */}
            <div className="flex justify-end text-[11px] font-mono text-black font-semibold pt-1">
              <span>FM-QS-001-01:11/09/23</span>
            </div>

          </div>

        </div>

        {/* Modal Footer Controls (Hidden on print) */}
        <div className="print:hidden bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-600 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            แบบฟอร์ม NANO DAR ฉบับมาตรฐาน พร้อมทบทวน BOM และลายเซ็นต์ดิจิทัล/ลากวางรูป
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              id="btn-close-dar-print-footer"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              ปิดหน้าต่าง
            </button>
            <button
              type="button"
              id="btn-print-dar-bottom"
              onClick={handlePrint}
              className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
            >
              <Printer className="w-4 h-4" />
              พิมพ์เอกสาร DAR (A4)
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
