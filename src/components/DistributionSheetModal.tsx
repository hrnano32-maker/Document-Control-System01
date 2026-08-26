import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useDcs } from '../context/DcsContext';
import { DistributionRecord, DarRecord } from '../types';
import {
  Printer,
  X,
  Plus,
  Trash2,
  CheckCircle2,
  Save,
  Download,
  ExternalLink,
  RotateCcw,
  Sparkles,
  FileSpreadsheet,
  Image as ImageIcon,
  Link as LinkIcon,
  Layers,
  ChevronDown,
  Info,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { printElementById, openPrintInNewTab, downloadPrintableHtml } from '../utils/printHelper';

interface DistributionRowData {
  id: string;
  position: string;
  copies: string;
  receiveSignature?: string;
  receiveDate: string;
  receiveSignerName?: string;
  returnSignature?: string;
  returnDate: string;
  returnSignerName?: string;
  sourceDarId?: string;
}

export const DEFAULT_STANDARD_POSITIONS: string[] = [
  'ผู้จัดการโรงงาน / Plant Manager',
  'เจ้าหน้าที่ควบคุมเอกสาร (DCC)',
  'ผู้จัดการฝ่ายประกันคุณภาพ (QA Manager)',
  'ผู้จัดการฝ่ายควบคุมคุณภาพ (QC Manager)',
  'ผู้จัดการฝ่ายผลิต (Production Manager)',
  'ผู้จัดการฝ่ายวิศวกรรม (Engineering Mgr.)',
  'หัวหน้าแผนกคลังสินค้าและวัตถุดิบ (Warehouse)',
  'หัวหน้าแผนกจัดซื้อ (Purchasing Supervisor)',
  'หัวหน้าแผนกซ่อมบำรุง (Maintenance Supervisor)',
  'หัวหน้าแผนกความปลอดภัย (SHE / Safety)',
  'หัวหน้าแผนกบุคคลและธุรการ (HR & Admin)',
  'หัวหน้าฝ่ายวางแผนการผลิต (PMC Supervisor)',
  'หัวหน้าฝ่ายเทคโนโลยีสารสนเทศ (IT Support)',
  'ผู้บริหารตัวแทนระบบคุณภาพ (QMR)',
];

export const DistributionSheetModal: React.FC = () => {
  const {
    selectedDistributionForSheet,
    setSelectedDistributionForSheet,
    currentUser,
    documents,
    dars,
  } = useDcs();

  const [printMode, setPrintMode] = useState<'FILLED' | 'BLANK'>('FILLED');
  const [showDocMetadataHeader, setShowDocMetadataHeader] = useState<boolean>(true);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [activeDarId, setActiveDarId] = useState<string>('');

  // Revisions for Receiving (รับ) and Returning (คืน)
  const [receiveRev, setReceiveRev] = useState<string>('');
  const [returnRev, setReturnRev] = useState<string>('');

  // Hidden file inputs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<{ rowIdx: number; type: 'receive' | 'return' } | null>(null);

  // Rows state
  const [rows, setRows] = useState<DistributionRowData[]>([]);

  // Find linked document and candidate DARs
  const linkedDoc = useMemo(() => {
    if (!selectedDistributionForSheet) return null;
    return (
      documents.find(
        d =>
          d.id === selectedDistributionForSheet.docId ||
          d.docNo.trim().toUpperCase() === selectedDistributionForSheet.docNo.trim().toUpperCase()
      ) || null
    );
  }, [documents, selectedDistributionForSheet]);

  const candidateDars = useMemo(() => {
    if (!selectedDistributionForSheet) return [];
    const docNo = selectedDistributionForSheet.docNo.trim().toUpperCase();
    return dars.filter(d => d.docNo.trim().toUpperCase() === docNo);
  }, [dars, selectedDistributionForSheet]);

  // Determine initial active DAR
  const initialDar = useMemo(() => {
    if (!selectedDistributionForSheet) return undefined;
    if (linkedDoc?.darReferenceId) {
      const darByRef = dars.find(d => d.id === linkedDoc.darReferenceId);
      if (darByRef) return darByRef;
    }
    // Match by revision
    const darByRev = candidateDars.find(
      d =>
        d.proposedRevision === selectedDistributionForSheet.revision ||
        d.currentRevision === selectedDistributionForSheet.revision
    );
    if (darByRev) return darByRev;
    if (candidateDars.length > 0) return candidateDars[0];
    return dars[0];
  }, [linkedDoc, candidateDars, dars, selectedDistributionForSheet]);

  const currentDar = useMemo(() => {
    if (activeDarId) {
      return dars.find(d => d.id === activeDarId);
    }
    return initialDar;
  }, [activeDarId, initialDar, dars]);

  // Function to build initial rows from a specified DAR
  const buildRowsFromDar = (dar?: DarRecord, dist?: DistributionRecord): DistributionRowData[] => {
    if (!dist) return [];

    const distDate = dist.distributedDate ? dist.distributedDate.split('T')[0] : new Date().toISOString().split('T')[0];

    // Case 1: The DAR has distributionHolders specified
    if (dar && dar.distributionHolders && dar.distributionHolders.length > 0) {
      const checkedHolders = dar.distributionHolders.filter(h => h.checked);
      if (checkedHolders.length > 0) {
        return checkedHolders.map((holder, idx) => {
          // Look for matching existing target signature in the distribution record
          const matchedTarget = dist.targets.find(
            t =>
              (t.downloaderPosition && holder.position.toLowerCase().includes(t.downloaderPosition.toLowerCase())) ||
              holder.position.toLowerCase().includes(t.dept.toLowerCase())
          );

          return {
            id: `dar-row-${idx}-${holder.position.substring(0, 10)}`,
            position: holder.position,
            copies: holder.copies && holder.copies.trim() ? holder.copies : '1',
            receiveSignature: matchedTarget?.signatureDataUrl || undefined,
            receiveDate: matchedTarget?.downloadTimestamp ? matchedTarget.downloadTimestamp.split('T')[0] : distDate,
            receiveSignerName: matchedTarget?.downloaderName || '',
            returnSignature: undefined,
            returnDate: '',
            returnSignerName: '',
            sourceDarId: dar.id,
          };
        });
      }
    }

    // Case 2: If DAR doesn't have distributionHolders, check distribution record targets
    if (dist.targets && dist.targets.length > 0) {
      return dist.targets.map((target, idx) => ({
        id: `target-row-${idx}-${target.dept}`,
        position: target.downloaderPosition || `หัวหน้าแผนก / ผู้รับผิดชอบฝ่าย ${target.dept}`,
        copies: target.copyNo ? target.copyNo.replace(/[^0-9]/g, '') || '1' : '1',
        receiveSignature: target.signatureDataUrl || undefined,
        receiveDate: target.downloadTimestamp ? target.downloadTimestamp.split('T')[0] : distDate,
        receiveSignerName: target.downloaderName || '',
        returnSignature: undefined,
        returnDate: '',
        returnSignerName: '',
        sourceDarId: dar?.id,
      }));
    }

    // Case 3: Default fallback: request dept + QA
    const fallbackDept = dar?.requestDept || 'Production';
    return [
      {
        id: 'row-default-1',
        position: `ผู้จัดการฝ่าย ${fallbackDept}`,
        copies: '1',
        receiveDate: distDate,
        receiveSignerName: dar?.requesterName || '',
        returnDate: '',
      },
      {
        id: 'row-default-2',
        position: 'ผู้จัดการฝ่ายประกันคุณภาพ (QA Manager)',
        copies: '1',
        receiveDate: distDate,
        returnDate: '',
      },
    ];
  };

  // Initialize rows whenever selectedDistributionForSheet or initial DAR changes
  useEffect(() => {
    if (selectedDistributionForSheet) {
      const darToUse = initialDar;
      if (darToUse) {
        setActiveDarId(darToUse.id);
      }
      const initialBuiltRows = buildRowsFromDar(darToUse, selectedDistributionForSheet);
      setRows(initialBuiltRows);

      // Auto-calculate Rev for รับ and คืน
      const currentRevClean = selectedDistributionForSheet.revision?.replace(/[^0-9]/g, '') || '00';
      setReceiveRev(currentRevClean);

      if (darToUse) {
        if (darToUse.requestType === 'NEW' || darToUse.currentRevision === '00' || !darToUse.currentRevision) {
          if (parseInt(currentRevClean, 10) === 0) {
            setReturnRev('-');
          } else {
            const prev = (parseInt(currentRevClean, 10) - 1).toString().padStart(2, '0');
            setReturnRev(prev);
          }
        } else {
          setReturnRev(darToUse.currentRevision.replace(/[^0-9]/g, '') || '-');
        }
      } else {
        const revNum = parseInt(currentRevClean, 10);
        if (revNum > 0) {
          setReturnRev((revNum - 1).toString().padStart(2, '0'));
        } else {
          setReturnRev('-');
        }
      }
    }
  }, [selectedDistributionForSheet, initialDar]);

  // Handler to switch/reload from selected DAR
  const handleLoadFromDar = (darId: string) => {
    setActiveDarId(darId);
    const targetDar = dars.find(d => d.id === darId);
    if (selectedDistributionForSheet && targetDar) {
      const darRows = buildRowsFromDar(targetDar, selectedDistributionForSheet);
      setRows(darRows);

      if (targetDar.proposedRevision) {
        setReceiveRev(targetDar.proposedRevision.replace(/[^0-9]/g, '') || targetDar.proposedRevision);
      }
      if (targetDar.requestType === 'NEW' || !targetDar.currentRevision || targetDar.currentRevision === '00') {
        setReturnRev('-');
      } else {
        setReturnRev(targetDar.currentRevision.replace(/[^0-9]/g, '') || targetDar.currentRevision);
      }

      setIsSaved(false);
      confetti({
        particleCount: 30,
        spread: 50,
        origin: { y: 0.6 },
      });
    }
  };

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!selectedDistributionForSheet) return null;

  const dist = selectedDistributionForSheet;

  const handleClose = () => {
    setSelectedDistributionForSheet(null);
  };

  // Helper date format
  const formatThaiDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  // Row operations
  const updateRow = (index: number, field: keyof DistributionRowData, value: string | undefined) => {
    setRows(prev =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
    setIsSaved(false);
  };

  const addRow = () => {
    const newRow: DistributionRowData = {
      id: `row-custom-${Date.now()}`,
      position: '',
      copies: '1',
      receiveDate: dist.distributedDate ? dist.distributedDate.split('T')[0] : new Date().toISOString().split('T')[0],
      receiveSignerName: '',
      returnDate: '',
      returnSignerName: '',
    };
    setRows(prev => [...prev, newRow]);
    setIsSaved(false);
  };

  const removeRow = (index: number) => {
    if (rows.length <= 1) return;
    setRows(prev => prev.filter((_, i) => i !== index));
    setIsSaved(false);
  };

  const loadStandard14Positions = () => {
    const distDate = dist.distributedDate ? dist.distributedDate.split('T')[0] : new Date().toISOString().split('T')[0];
    const standardRows: DistributionRowData[] = DEFAULT_STANDARD_POSITIONS.map((pos, idx) => ({
      id: `row-std-${idx}`,
      position: pos,
      copies: '1',
      receiveSignature: undefined,
      receiveDate: distDate,
      receiveSignerName: '',
      returnSignature: undefined,
      returnDate: '',
      returnSignerName: '',
    }));
    setRows(standardRows);
    setIsSaved(false);
  };

  const clearAllRows = () => {
    const distDate = dist.distributedDate ? dist.distributedDate.split('T')[0] : new Date().toISOString().split('T')[0];
    setRows([
      {
        id: `row-empty-1`,
        position: '',
        copies: '1',
        receiveDate: distDate,
        returnDate: '',
      },
    ]);
    setIsSaved(false);
  };

  // Signature file upload
  const handleSignatureFile = (file: File, rowIdx: number, type: 'receive' | 'return') => {
    if (!file.type.startsWith('image/')) {
      alert('กรุณาเลือกไฟล์รูปภาพลายเซ็น (PNG, JPG, WebP)');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        const fieldName = type === 'receive' ? 'receiveSignature' : 'returnSignature';
        const dateFieldName = type === 'receive' ? 'receiveDate' : 'returnDate';
        const today = new Date().toISOString().split('T')[0];

        setRows(prev =>
          prev.map((r, i) => {
            if (i === rowIdx) {
              return {
                ...r,
                [fieldName]: e.target?.result as string,
                [dateFieldName]: r[dateFieldName] || today,
              };
            }
            return r;
          })
        );
        setIsSaved(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Quick Sign generator
  const quickSignRow = (rowIdx: number, type: 'receive' | 'return') => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = 'italic bold 16px cursive, sans-serif';
      ctx.fillStyle = '#0f172a';
      ctx.fillText(currentUser.userName.split(' ')[0], 15, 30);
      ctx.strokeStyle = type === 'receive' ? '#2563eb' : '#dc2626';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(10, 36);
      ctx.bezierCurveTo(50, 42, 90, 28, 145, 38);
      ctx.stroke();

      const dataUrl = canvas.toDataURL('image/png');
      const fieldName = type === 'receive' ? 'receiveSignature' : 'returnSignature';
      const dateFieldName = type === 'receive' ? 'receiveDate' : 'returnDate';
      const today = new Date().toISOString().split('T')[0];

      setRows(prev =>
        prev.map((r, i) => {
          if (i === rowIdx) {
            return {
              ...r,
              [fieldName]: dataUrl,
              [dateFieldName]: r[dateFieldName] || today,
            };
          }
          return r;
        })
      );
      setIsSaved(false);
    }
  };

  const handleSave = () => {
    setIsSaved(true);
    confetti({
      particleCount: 35,
      spread: 60,
      origin: { y: 0.7 },
    });
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handlePrint = () => {
    handleSave();
    printElementById('distribution-recall-sheet', `FM-QS-003-00_${dist.docNo}_Distribution`);
  };

  const handleOpenTab = () => {
    handleSave();
    const success = openPrintInNewTab('distribution-recall-sheet', `FM-QS-003-00_${dist.docNo}_Distribution`);
    if (!success) {
      printElementById('distribution-recall-sheet', `FM-QS-003-00_${dist.docNo}_Distribution`);
    }
  };

  const handleDownload = () => {
    handleSave();
    downloadPrintableHtml('distribution-recall-sheet', `Distribution_Recall_${dist.docNo}`);
  };

  const totalCopiesCount = rows.reduce((sum, r) => sum + (parseInt(r.copies, 10) || 0), 0);

  return (
    <div
      id="distribution-sheet-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto"
    >
      <div className="bg-slate-100 rounded-2xl max-w-5xl w-full shadow-2xl border border-slate-300 overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Controls Bar (Hidden during Print) */}
        <div className="print:hidden bg-slate-900 text-white p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-600 flex items-center justify-center font-black text-xs tracking-tighter text-white shadow-xs shrink-0">
              NANO
            </div>
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-2 flex-wrap">
                <span>ใบแจกจ่าย - เรียกคืน เอกสาร</span>
                <span className="font-mono text-xs bg-slate-800 text-red-300 px-2 py-0.5 rounded border border-red-800">
                  FM-QS-003-00:27/03/18
                </span>
              </h3>
              <p className="text-[11px] text-slate-300">
                เอกสาร: <strong className="text-white font-mono">{dist.docNo}</strong> ({dist.docNameTh}) | Rev.{dist.revision}
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            
            {/* Print Mode Switcher */}
            <div className="flex items-center bg-slate-800 p-0.5 rounded-xl border border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => setPrintMode('FILLED')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  printMode === 'FILLED'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                ข้อมูลระบบ ({rows.length} รายการ)
              </button>
              <button
                type="button"
                onClick={() => setPrintMode('BLANK')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  printMode === 'BLANK'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="พิมพ์แบบฟอร์มเปล่าเพื่อเซ็นด้วยปากกา"
              >
                ฟอร์มเปล่า
              </button>
            </div>

            <button
              type="button"
              id="btn-save-distribution-sheet"
              onClick={handleSave}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                isSaved
                  ? 'bg-emerald-600 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              {isSaved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              {isSaved ? 'บันทึกแล้ว' : 'บันทึก'}
            </button>

            <button
              type="button"
              id="btn-print-distribution-newtab"
              onClick={handleOpenTab}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-1 cursor-pointer transition-all"
              title="เปิดแท็บใหม่เพื่อสั่งพิมพ์ (กรณีติด iFrame)"
            >
              <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
              เปิดแท็บใหม่
            </button>

            <button
              type="button"
              id="btn-download-distribution-html"
              onClick={handleDownload}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-1 cursor-pointer transition-all"
              title="ดาวน์โหลดไฟล์พร้อมพิมพ์ HTML/PDF"
            >
              <Download className="w-3.5 h-3.5 text-indigo-400" />
              ดาวน์โหลด
            </button>

            <button
              type="button"
              id="btn-trigger-print-distribution"
              onClick={handlePrint}
              className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-red-950/40"
            >
              <Printer className="w-4 h-4" />
              พิมพ์ A4 (Print)
            </button>

            <button
              type="button"
              id="btn-close-distribution-modal"
              onClick={handleClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="ปิดหน้าต่าง (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* DAR Reference & Originating Link Bar (Strict Requirement: Initialized with initiating DAR, add more afterwards) */}
        <div className="print:hidden bg-indigo-950 text-indigo-100 px-4 py-2.5 border-b border-indigo-900 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1.5 font-bold text-indigo-200 bg-indigo-900/90 px-2.5 py-1 rounded-lg border border-indigo-700">
              <LinkIcon className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>อ้างอิงค่าเริ่มต้นจากใบ DAR:</span>
            </div>

            {currentDar ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-bold text-amber-300 bg-black/30 px-2 py-0.5 rounded border border-amber-500/40">
                  {currentDar.id}
                </span>
                <span className="text-indigo-200">
                  (ผู้ขอ: <strong>{currentDar.requesterName}</strong> - {currentDar.requestDept})
                </span>
                <span className="text-[11px] bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded-full border border-cyan-700">
                  DAR ระบุแจกจ่าย {currentDar.distributionHolders?.filter(h => h.checked).length || 0} ตำแหน่ง
                </span>
              </div>
            ) : (
              <span className="text-indigo-300 italic">ไม่พบใบ DAR เชื่อมโยงโดยตรง (ใช้ค่าเริ่มต้นระบบ)</span>
            )}
          </div>

          {/* Quick DAR Switcher & Re-sync */}
          <div className="flex items-center gap-2 shrink-0">
            {candidateDars.length > 1 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-indigo-300">เลือก DAR:</span>
                <select
                  value={activeDarId || (currentDar?.id || '')}
                  onChange={(e) => handleLoadFromDar(e.target.value)}
                  className="bg-indigo-900 border border-indigo-700 text-white rounded-lg px-2 py-1 text-xs focus:ring-1 focus:ring-cyan-400 focus:outline-none cursor-pointer"
                >
                  {candidateDars.map((dar) => (
                    <option key={dar.id} value={dar.id}>
                      {dar.id} (Rev.{dar.proposedRevision || dar.currentRevision} - {dar.requestType})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {currentDar && (
              <button
                type="button"
                onClick={() => handleLoadFromDar(currentDar.id)}
                className="px-2.5 py-1 bg-indigo-800 hover:bg-indigo-700 text-indigo-100 hover:text-white rounded-lg font-bold flex items-center gap-1 cursor-pointer transition-colors border border-indigo-600"
                title="รีเซ็ตตารางให้ตรงตามตำแหน่งที่ใบ DAR นี้ระบุไว้"
              >
                <RotateCcw className="w-3 h-3 text-cyan-400" />
                ดึงรายการตาม DAR
              </button>
            )}
          </div>
        </div>

        {/* Quick Toolbar (Hidden during Print) */}
        <div className="print:hidden bg-slate-200/80 border-b border-slate-300 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-700 flex-wrap">
            <span className="font-semibold text-slate-800">จัดการแถวผู้รับ:</span>
            
            <button
              type="button"
              onClick={addRow}
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold flex items-center gap-1 cursor-pointer shadow-xs transition-colors"
              title="เพิ่มแถวผู้รับมอบเอกสารเพิ่มเติมหลังจากดึงค่าเริ่มต้นจากใบ DAR"
            >
              <Plus className="w-3.5 h-3.5" />
              + เพิ่มแถวผู้รับเพิ่มเติม
            </button>

            <button
              type="button"
              onClick={loadStandard14Positions}
              className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-slate-700 font-medium flex items-center gap-1 cursor-pointer shadow-2xs transition-colors"
              title="โหลดรายชื่อ 14 ตำแหน่งมาตรฐานโรงงาน"
            >
              <Layers className="w-3 h-3 text-indigo-600" />
              นำเข้า 14 ตำแหน่งมาตรฐาน
            </button>

            <button
              type="button"
              onClick={clearAllRows}
              className="px-2 py-1 bg-white hover:bg-rose-50 border border-slate-300 hover:border-rose-300 rounded-lg text-slate-600 hover:text-rose-700 font-medium flex items-center gap-1 cursor-pointer shadow-2xs transition-colors"
              title="ล้างแถวทั้งหมด"
            >
              <Trash2 className="w-3 h-3 text-slate-400" />
              ล้างตาราง
            </button>
          </div>

          <div className="flex items-center gap-3 text-slate-600 text-xs flex-wrap">
            <div className="flex items-center gap-1.5 bg-white px-2 py-0.5 rounded-lg border border-slate-300">
              <span className="text-slate-500 font-medium">รับ:</span>
              <span className="font-mono font-bold text-indigo-700">Rev.{receiveRev || '00'}</span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-500 font-medium">คืน:</span>
              <span className="font-mono font-bold text-rose-700">{returnRev && returnRev !== '-' ? `Rev.${returnRev}` : '-'}</span>
            </div>

            <span className="font-semibold text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
              รวม: {rows.length} ผู้ถือครอง ({totalCopiesCount} ชุด)
            </span>

            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showDocMetadataHeader}
                onChange={(e) => setShowDocMetadataHeader(e.target.checked)}
                className="rounded text-indigo-600"
              />
              <span>แสดงแถบรหัสเอกสารด้านบน</span>
            </label>
          </div>
        </div>

        {/* Printable Canvas Container */}
        <div className="p-4 sm:p-6 max-h-[75vh] overflow-y-auto bg-slate-300 flex justify-center print:p-0 print:m-0 print:max-h-none print:overflow-visible print:bg-white">
          
          {/* Exact Form Matching User's Image (FM-QS-003-00:27/03/18) */}
          <div
            id="distribution-recall-sheet"
            className="bg-white text-black p-8 sm:p-10 rounded-lg shadow-xl border border-slate-300 w-full max-w-[900px] print:shadow-none print:border-0 print:p-6 print:rounded-none print:w-full font-sans"
            style={{ fontFamily: "'Prompt', 'Sarabun', system-ui, -apple-system, sans-serif" }}
          >
            
            {/* Header with NANO Logo & Form Title */}
            <div className="relative mb-5 flex items-center justify-center min-h-[50px]">
              
              {/* NANO Red Oval Logo on the left */}
              <div className="absolute left-0 top-0 flex items-center">
                <div className="w-24 h-10 border-2 border-red-600 rounded-[50%] flex items-center justify-center bg-white shadow-xs">
                  <span className="text-red-600 font-black text-lg tracking-wider" style={{ fontFamily: 'Arial, sans-serif' }}>
                    NANO
                  </span>
                </div>
              </div>

              {/* Form Title Centered */}
              <div className="text-center">
                <h1 className="text-xl sm:text-2xl font-bold text-black tracking-tight">
                  ใบแจกจ่าย - เรียกคืน เอกสาร
                </h1>
              </div>
            </div>

            {/* Optional Document Metadata Banner (For easy tracking) */}
            {showDocMetadataHeader && (
              <div className="mb-3 p-2.5 bg-slate-50 border border-black text-xs flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-slate-600 font-medium">รหัสเอกสาร: </span>
                  <strong className="font-mono text-black font-bold text-sm">{dist.docNo}</strong>
                  <span className="mx-2 text-slate-400">|</span>
                  <span className="text-slate-600 font-medium">ชื่อเอกสาร: </span>
                  <strong className="text-black font-semibold">{dist.docNameTh}</strong>
                </div>
                <div className="flex items-center gap-3 font-mono text-xs flex-wrap">
                  <span>ฉบับที่: <strong>Rev.{dist.revision}</strong></span>
                  <span>วันที่มีผล: <strong>{formatThaiDate(dist.effectiveDate)}</strong></span>
                  {currentDar && (
                    <span className="text-slate-700">อ้างอิง DAR: <strong>{currentDar.id}</strong></span>
                  )}
                </div>
              </div>
            )}

            {/* Main Distribution - Recall Table */}
            <div className="mb-3">
              <table className="w-full border-collapse border-2 border-black text-center text-xs">
                <thead>
                  {/* Top Header Row */}
                  <tr className="border-b border-black bg-white font-bold text-[13px]">
                    <th rowSpan={2} className="border-r border-black p-2 w-14 align-middle">
                      ลำดับที่
                    </th>
                    <th rowSpan={2} className="border-r border-black p-2 align-middle text-center w-64">
                      ผู้ถือครอง<br />ตามตำแหน่งงาน
                    </th>
                    <th rowSpan={2} className="border-r border-black p-2 w-20 align-middle text-center">
                      จำนวน<br />สำเนา
                    </th>
                    <th colSpan={2} className="border-r border-black p-1.5 text-center bg-slate-50/50">
                      <div className="flex items-center justify-center gap-1">
                        <span>รับ</span>
                        <span className="font-bold text-[12px] font-mono">
                          (Rev.
                          <span className="hidden print:inline">{receiveRev || '00'}</span>
                          <input
                            type="text"
                            value={receiveRev}
                            onChange={(e) => setReceiveRev(e.target.value)}
                            placeholder="00"
                            className="print:hidden w-8 text-center bg-transparent border-b border-dashed border-slate-400 font-mono font-bold text-[12px] focus:outline-none focus:border-indigo-600 focus:bg-indigo-50/50 px-0.5"
                            title="แก้ไข Rev. ที่รับ"
                          />
                          )
                        </span>
                      </div>
                    </th>
                    <th colSpan={2} className="p-1.5 text-center bg-slate-50/50">
                      <div className="flex items-center justify-center gap-1">
                        <span>คืน</span>
                        <span className="font-bold text-[12px] font-mono">
                          (Rev.
                          <span className="hidden print:inline">{returnRev || '-'}</span>
                          <input
                            type="text"
                            value={returnRev}
                            onChange={(e) => setReturnRev(e.target.value)}
                            placeholder="-"
                            className="print:hidden w-8 text-center bg-transparent border-b border-dashed border-slate-400 font-mono font-bold text-[12px] focus:outline-none focus:border-indigo-600 focus:bg-indigo-50/50 px-0.5"
                            title="แก้ไข Rev. ที่เรียกคืน"
                          />
                          )
                        </span>
                      </div>
                    </th>
                  </tr>

                  {/* Sub Header Row for รับ / คืน */}
                  <tr className="border-b-2 border-black bg-white font-bold text-[12px]">
                    {/* รับ */}
                    <th className="border-r border-black p-1.5 w-28">ลายเซ็นต์</th>
                    <th className="border-r border-black p-1.5 w-24">วันที่</th>
                    {/* คืน */}
                    <th className="border-r border-black p-1.5 w-28">ลายเซ็นต์</th>
                    <th className="p-1.5 w-24">วันที่</th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row, idx) => {
                    const isBlankMode = printMode === 'BLANK';

                    return (
                      <tr
                        key={row.id}
                        className="border-b border-dotted border-black min-h-[34px] group hover:bg-slate-50/70 transition-colors"
                      >
                        {/* ลำดับที่ */}
                        <td className="border-r border-black p-1 text-center font-medium text-[12px] align-middle">
                          <div className="flex items-center justify-center gap-1">
                            <span>{idx + 1}</span>
                            <button
                              type="button"
                              onClick={() => removeRow(idx)}
                              className="print:hidden opacity-0 group-hover:opacity-100 text-rose-500 hover:text-rose-700 transition-opacity p-0.5 cursor-pointer"
                              title="ลบแถวนี้"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>

                        {/* ผู้ถือครองตามตำแหน่งงาน */}
                        <td className="border-r border-black p-1 text-left align-middle relative">
                          {isBlankMode ? (
                            <div className="min-h-[22px]"></div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={row.position}
                                onChange={(e) => updateRow(idx, 'position', e.target.value)}
                                placeholder="ระบุตำแหน่งงาน เช่น ผู้จัดการฝ่ายผลิต..."
                                className="w-full bg-transparent px-1 py-0.5 text-[12px] font-medium text-black focus:outline-none focus:bg-indigo-50/60 rounded"
                              />
                            </div>
                          )}
                        </td>

                        {/* จำนวนสำเนา */}
                        <td className="border-r border-black p-1 text-center align-middle">
                          {isBlankMode ? (
                            <div className="min-h-[22px]"></div>
                          ) : (
                            <input
                              type="text"
                              value={row.copies}
                              onChange={(e) => updateRow(idx, 'copies', e.target.value)}
                              placeholder="1"
                              className="w-12 text-center bg-transparent px-1 py-0.5 text-[12px] font-mono font-bold text-black focus:outline-none focus:bg-indigo-50/60 rounded"
                            />
                          )}
                        </td>

                        {/* รับ: ลายเซ็นต์ */}
                        <td className="border-r border-black p-1 text-center align-middle relative group/rec">
                          {isBlankMode ? (
                            <div className="min-h-[26px]"></div>
                          ) : row.receiveSignature ? (
                            <div className="relative flex items-center justify-center min-h-[26px]">
                              <img
                                src={row.receiveSignature}
                                alt="Receive Signature"
                                className="max-h-7 max-w-[90px] object-contain"
                              />
                              <button
                                type="button"
                                onClick={() => updateRow(idx, 'receiveSignature', undefined)}
                                className="print:hidden absolute -top-1 -right-1 p-0.5 bg-red-600 text-white rounded opacity-0 group-hover/rec:opacity-100 transition-opacity cursor-pointer shadow-xs"
                                title="ลบลายเซ็นต์"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="min-h-[26px] flex items-center justify-center">
                              <div className="print:hidden flex items-center gap-1 opacity-40 group-hover/rec:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUploadTarget({ rowIdx: idx, type: 'receive' });
                                    fileInputRef.current?.click();
                                  }}
                                  className="text-[9px] text-indigo-600 hover:underline font-semibold cursor-pointer"
                                >
                                  อัปโหลด
                                </button>
                                <span className="text-[9px] text-slate-400">/</span>
                                <button
                                  type="button"
                                  onClick={() => quickSignRow(idx, 'receive')}
                                  className="text-[9px] text-emerald-600 hover:underline font-semibold cursor-pointer"
                                >
                                  เซ็น
                                </button>
                              </div>
                            </div>
                          )}
                        </td>

                        {/* รับ: วันที่ */}
                        <td className="border-r border-black p-1 text-center align-middle">
                          {isBlankMode ? (
                            <div className="min-h-[22px]"></div>
                          ) : (
                            <input
                              type="text"
                              value={formatThaiDate(row.receiveDate)}
                              onChange={(e) => updateRow(idx, 'receiveDate', e.target.value)}
                              placeholder="วว/ดด/ปปปป"
                              className="w-full text-center bg-transparent px-1 py-0.5 text-[11px] font-mono text-black focus:outline-none focus:bg-indigo-50/60 rounded"
                            />
                          )}
                        </td>

                        {/* คืน: ลายเซ็นต์ */}
                        <td className="border-r border-black p-1 text-center align-middle relative group/ret">
                          {isBlankMode ? (
                            <div className="min-h-[26px]"></div>
                          ) : row.returnSignature ? (
                            <div className="relative flex items-center justify-center min-h-[26px]">
                              <img
                                src={row.returnSignature}
                                alt="Return Signature"
                                className="max-h-7 max-w-[90px] object-contain"
                              />
                              <button
                                type="button"
                                onClick={() => updateRow(idx, 'returnSignature', undefined)}
                                className="print:hidden absolute -top-1 -right-1 p-0.5 bg-red-600 text-white rounded opacity-0 group-hover/ret:opacity-100 transition-opacity cursor-pointer shadow-xs"
                                title="ลบลายเซ็นต์"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="min-h-[26px] flex items-center justify-center">
                              <div className="print:hidden flex items-center gap-1 opacity-40 group-hover/ret:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUploadTarget({ rowIdx: idx, type: 'return' });
                                    fileInputRef.current?.click();
                                  }}
                                  className="text-[9px] text-indigo-600 hover:underline font-semibold cursor-pointer"
                                >
                                  อัปโหลด
                                </button>
                                <span className="text-[9px] text-slate-400">/</span>
                                <button
                                  type="button"
                                  onClick={() => quickSignRow(idx, 'return')}
                                  className="text-[9px] text-rose-600 hover:underline font-semibold cursor-pointer"
                                >
                                  เซ็น
                                </button>
                              </div>
                            </div>
                          )}
                        </td>

                        {/* คืน: วันที่ */}
                        <td className="p-1 text-center align-middle">
                          {isBlankMode ? (
                            <div className="min-h-[22px]"></div>
                          ) : (
                            <input
                              type="text"
                              value={formatThaiDate(row.returnDate)}
                              onChange={(e) => updateRow(idx, 'returnDate', e.target.value)}
                              placeholder="วว/ดด/ปปปป"
                              className="w-full text-center bg-transparent px-1 py-0.5 text-[11px] font-mono text-black focus:outline-none focus:bg-indigo-50/60 rounded"
                            />
                          )}
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer Form Code (FM-QS-003-00:27/03/18) */}
            <div className="flex justify-between items-center text-[11px] font-mono text-black font-semibold pt-1">
              <span className="text-slate-500 font-normal">
                * ใบแจกจ่ายนี้เริ่มต้นสร้างตามรายการหน่วยงานที่ระบุในใบ DAR ({currentDar?.id || 'DAR อ้างอิง'})
              </span>
              <span>FM-QS-003-00:27/03/18</span>
            </div>

          </div>

        </div>

        {/* Modal Bottom Bar (Hidden in Print) */}
        <div className="bg-slate-900 text-slate-300 p-3.5 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs print:hidden">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>
              อ้างอิงค่าเริ่มต้นจากใบ DAR: <strong className="text-white">{currentDar?.id || 'อัตโนมัติ'}</strong> — สามารถเพิ่ม/ปรับแก้ผู้รับเพิ่มเติมได้ตามต้องการ
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-colors cursor-pointer"
            >
              ปิดหน้าต่าง
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <Printer className="w-4 h-4" />
              พิมพ์ A4
            </button>
          </div>
        </div>

        {/* Global Hidden Input for Image Signature Upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0] && uploadTarget) {
              handleSignatureFile(e.target.files[0], uploadTarget.rowIdx, uploadTarget.type);
            }
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
        />

      </div>
    </div>
  );
};
