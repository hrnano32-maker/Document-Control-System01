import React, { useState, useRef, useEffect } from 'react';
import { useDcs } from '../context/DcsContext';
import {
  Download,
  Lock,
  X,
  CheckCircle2,
  AlertTriangle,
  PenTool,
  Clock,
  HardDrive,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import confetti from 'canvas-confetti';

export const DownloadModal: React.FC = () => {
  const {
    selectedDistributionForDownload,
    setSelectedDistributionForDownload,
    downloadControlledCopy,
    currentUser,
  } = useDcs();

  if (!selectedDistributionForDownload) return null;

  const { distribution, dept } = selectedDistributionForDownload;

  const target = distribution.targets.find(t => t.dept === dept);

  // Form states: Recipient must explicitly enter their real name upon receiving document
  const [downloaderName, setDownloaderName] = useState('');
  const [downloaderEmpId, setDownloaderEmpId] = useState('');
  const [downloaderPosition, setDownloaderPosition] = useState(
    currentUser.currentDept === dept ? currentUser.position : ''
  );
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [signatureData, setSignatureData] = useState<string>('');
  const [signatureType, setSignatureType] = useState<'DRAW' | 'UPLOAD'>('DRAW');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Canvas drawing ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Calculate remaining time
  const expiryTime = new Date(distribution.expirationDate).getTime();
  const now = new Date().getTime();
  const diffMs = expiryTime - now;
  const isExpired = diffMs <= 0;

  const hoursRemaining = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
  const daysRemaining = Math.floor(hoursRemaining / 24);
  const remHours = hoursRemaining % 24;

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedDistributionForDownload(null);
      }
    };
    if (selectedDistributionForDownload) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDistributionForDownload, setSelectedDistributionForDownload]);

  const handleClose = () => {
    setSelectedDistributionForDownload(null);
  };

  useEffect(() => {
    // Initialize canvas if drawing mode
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = '#1e3a8a'; // Navy ink
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, [signatureType]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setSignatureData(canvas.toDataURL('image/png'));
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    setSignatureData('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSignatureData(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleConfirmDownload = () => {
    setErrorMsg('');

    if (isExpired) {
      setErrorMsg('ลิงก์ดาวน์โหลดหมดอายุแล้ว (เกิน 3 วัน) ไม่สามารถดำเนินการได้ กรุณาร้องขอ DCC');
      return;
    }

    if (!downloaderName.trim()) {
      setErrorMsg('กรุณาระบุชื่อ-นามสกุล ผู้ดาวน์โหลด');
      return;
    }

    if (!signatureData) {
      setErrorMsg('กรุณาลงลายมือชื่อดิจิทัล หรือแนบไฟล์รูปลายเซ็น เพื่อเป็นหลักฐานตามมาตรฐาน ISO');
      return;
    }

    if (!agreeTerms) {
      setErrorMsg('กรุณาทำเครื่องหมายยินยอมเงื่อนไขการจัดเก็บ Controlled Copy');
      return;
    }

    setIsSubmitting(true);

    const result = downloadControlledCopy(
      distribution.id,
      dept,
      downloaderName.trim(),
      downloaderEmpId.trim(),
      downloaderPosition.trim(),
      signatureData
    );

    if (result.success) {
      // Trigger celebratory confetti
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.6 },
      });

      // If binary fileDataUrl is present, download the actual attached file directly
      if (distribution.fileDataUrl) {
        const link = document.createElement('a');
        link.href = distribution.fileDataUrl;
        const baseName = distribution.fileName || `${distribution.docNo}_Rev${distribution.revision}_CONTROLLED.pdf`;
        link.download = `CONTROLLED_${dept}_${baseName}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        // Fallback controlled copy document text
        const controlledDocText = `======================================================
         OFFICIAL CONTROLLED COPY (สำเนาควบคุม)
         Document Control System (ISO 9001 / IATF 16949)
======================================================
Document No:      ${distribution.docNo}
Document Name:    ${distribution.docNameTh} (${distribution.docNameEn})
Type:             ${distribution.docType}
Revision:         Rev.${distribution.revision}
Effective Date:   ${distribution.effectiveDate}
Distribution No:  ${distribution.distributionNo}

--- CONTROLLED ALLOCATION ---
Recipient Dept:   ${dept}
Copy Number:      Copy 1/1 (SINGLE AUTHORIZED WORKSTATION COPY)
Downloader Name:  ${downloaderName}
Employee ID:      ${downloaderEmpId || 'N/A'}
Position:         ${downloaderPosition || 'N/A'}
Download Date:    ${new Date().toLocaleDateString('th-TH')}
Download Time:    ${new Date().toLocaleTimeString('th-TH')}
Status:           DOWNLOADED & LOCKED 🔒

--- STORAGE OBLIGATION ---
This electronic Controlled Copy must be retained exclusively on the designated 
departmental workstation for operational use. Re-distribution or un-authorized 
duplication is strictly prohibited under DCC procedure.
======================================================`;

        const blob = new Blob([controlledDocText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `CONTROLLED_${distribution.docNo}_Rev${distribution.revision}_${dept.replace(/[^A-Za-z0-9]/g, '_')}_Copy1-1.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }

      setTimeout(() => {
        setIsSubmitting(false);
        setSelectedDistributionForDownload(null);
      }, 500);
    } else {
      setIsSubmitting(false);
      setErrorMsg(result.message);
    }
  };

  return (
    <div
      id="download-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto"
    >
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/30 border border-indigo-400/40 flex items-center justify-center">
                <Download className="w-4 h-4 text-indigo-300" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">
                  ดาวน์โหลด Controlled Copy (สำเนาควบคุม)
                </h3>
                <p className="text-[11px] text-slate-300">
                  ระบบบันทึกหลักฐานและล็อคสิทธิ์ดาวน์โหลด 1 แผนก = 1 ครั้ง
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            id="btn-close-download-modal-header"
            onClick={handleClose}
            aria-label="ปิดหน้าต่าง"
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1 text-xs"
            title="ปิดหน้าต่าง (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto text-slate-800 text-xs">
          
          {/* Expiration Timer Banner */}
          <div className={`p-3 rounded-xl border flex items-center justify-between ${
            isExpired 
              ? 'bg-rose-50 border-rose-200 text-rose-800' 
              : hoursRemaining < 24 
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 shrink-0" />
              <div>
                <span className="font-bold">
                  {isExpired ? '🔴 ลิงก์ดาวน์โหลดหมดอายุแล้ว' : '🟢 อายุสิทธิ์ดาวน์โหลด (3 วัน)'}
                </span>
                <p className="text-[10px]">
                  {isExpired 
                    ? 'เกินกำหนด 72 ชม. นับจากวันที่แจกจ่าย' 
                    : `เหลือเวลาอีก: ${daysRemaining} วัน ${remHours} ชั่วโมง (หมดอายุ: ${new Date(distribution.expirationDate).toLocaleString('th-TH')})`}
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/80 border">
              {distribution.distributionNo}
            </span>
          </div>

          {/* Document Summary Card */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-sm text-indigo-700">{distribution.docNo}</span>
              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 font-bold rounded-md">
                Revision: Rev.{distribution.revision}
              </span>
            </div>
            <p className="font-bold text-slate-900 text-xs">{distribution.docNameTh}</p>
            <p className="text-[11px] text-slate-500 italic">{distribution.docNameEn}</p>
            
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/80 text-[11px]">
              <div>
                <span className="text-slate-400">หน่วยงานผู้รับ: </span>
                <span className="font-bold text-slate-800">{dept}</span>
              </div>
              <div>
                <span className="text-slate-400">โควตาสำเนา: </span>
                <span className="font-bold text-emerald-700">Copy 1/1 (สิทธิ์เดียว)</span>
              </div>
            </div>
          </div>

          {/* Already Downloaded Warning Check */}
          {target?.isDownloaded ? (
            <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-amber-800 font-bold">
                <Lock className="w-4 h-4 text-amber-600" />
                <span>🔒 หน่วยงาน {dept} ได้ใช้สิทธิ์ดาวน์โหลดไปแล้ว</span>
              </div>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                ผู้ดาวน์โหลด: <strong>{target.downloaderName}</strong> ({target.downloaderEmpId || 'ไม่ระบุรหัส'})
                <br />
                เมื่อวันที่: <strong>{new Date(target.downloadTimestamp!).toLocaleString('th-TH')}</strong>
                <br />
                หากไฟล์สูญหายหรือต้องการสำเนาเพิ่มเติม โปรดส่งคำร้องขอผ่านระบบถึง DCC
              </p>
            </div>
          ) : (
            /* Downloader Form & Signature */
            <div className="space-y-4">
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                    <ShieldCheck className="w-4 h-4 text-indigo-600" />
                    1. ข้อมูลผู้รับมอบหมายและดาวน์โหลดเอกสาร
                  </h4>
                  <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                    * กรอกชื่อจริงของผู้รับเอกสาร
                  </span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      ชื่อ-นามสกุล ผู้รับเอกสารจริง <span className="text-rose-500 font-bold">* (บังคับกรอก)</span>
                    </label>
                    <input
                      type="text"
                      value={downloaderName}
                      onChange={e => setDownloaderName(e.target.value)}
                      placeholder="ระบุชื่อ-นามสกุลจริงผู้รับมอบหมาย"
                      className="w-full px-3.5 py-2.5 border-2 border-indigo-200 bg-indigo-50/20 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none placeholder-slate-400"
                      required
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      รหัสพนักงาน (Employee ID) <span className="text-slate-400 font-normal">(ถ้ามี)</span>
                    </label>
                    <input
                      type="text"
                      value={downloaderEmpId}
                      onChange={e => setDownloaderEmpId(e.target.value)}
                      placeholder="เช่น EMP-PD1-042"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    ตำแหน่ง / หน้าที่ (Position / Role)
                  </label>
                  <input
                    type="text"
                    value={downloaderPosition}
                    onChange={e => setDownloaderPosition(e.target.value)}
                    placeholder="เช่น วิศวกรควบคุมคุณภาพ / หัวหน้ากะฝ่ายผลิต"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Signature Section */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                    <PenTool className="w-4 h-4 text-indigo-600" />
                    2. ลายมือชื่ออิเล็กทรอนิกส์ (Digital Signature) <span className="text-rose-500">*</span>
                  </h4>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSignatureType('DRAW')}
                      className={`px-2 py-1 rounded text-[10px] font-medium cursor-pointer ${
                        signatureType === 'DRAW' ? 'bg-indigo-100 text-indigo-800' : 'text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      วาดลายเซ็น
                    </button>
                    <button
                      type="button"
                      onClick={() => setSignatureType('UPLOAD')}
                      className={`px-2 py-1 rounded text-[10px] font-medium cursor-pointer ${
                        signatureType === 'UPLOAD' ? 'bg-indigo-100 text-indigo-800' : 'text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      อัปโหลดไฟล์รูป
                    </button>
                  </div>
                </div>

                {signatureType === 'DRAW' ? (
                  <div className="border-2 border-dashed border-indigo-200 rounded-xl p-2 bg-indigo-50/20 relative">
                    <canvas
                      ref={canvasRef}
                      width={480}
                      height={120}
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                      className="w-full h-28 bg-white rounded-lg border border-slate-200 cursor-crosshair touch-none"
                    />
                    <div className="flex items-center justify-between mt-1 text-[10px] text-slate-400">
                      <span>เซ็นชื่อลงในกรอบสีขาวด้านบน</span>
                      <button
                        type="button"
                        onClick={clearSignature}
                        className="text-rose-600 hover:text-rose-700 flex items-center gap-1 font-semibold cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" /> ล้างลายเซ็น
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 bg-slate-50 text-center space-y-2">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                    />
                    {signatureData && (
                      <div className="mt-2 flex justify-center">
                        <img src={signatureData} alt="Signature Preview" className="h-16 border rounded bg-white p-1" />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Acknowledgement Checkbox */}
              <div className="pt-2 border-t border-slate-100">
                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={e => setAgreeTerms(e.target.checked)}
                    className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                  />
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-900 text-xs">
                      ข้าพเจ้ายืนยันรับ Controlled Copy (Copy 1/1)
                    </span>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      จะนำไฟล์ไปจัดเก็บไว้ในเครื่องคอมพิวเตอร์ประจำหน่วยงาน ({dept}) และไม่ทำสำเนาแจกจ่ายต่อโดยไม่ได้รับอนุญาตจาก DCC ตามข้อกำหนด ISO 9001:2015 Clause 7.5
                    </p>
                  </div>
                </label>
              </div>

            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
            <HardDrive className="w-3.5 h-3.5" />
            <span>จัดเก็บ Copy 1/1 ลงเครื่องประจำแผนก</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              id="btn-close-download-modal-footer"
              onClick={handleClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              {target?.isDownloaded || isExpired ? 'ปิดหน้าต่าง' : 'ยกเลิก / ปิด'}
            </button>

            {!target?.isDownloaded && (
              <button
                type="button"
                id="btn-confirm-download-controlled"
                disabled={isSubmitting || isExpired}
                onClick={handleConfirmDownload}
                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" />
                {isSubmitting ? 'กำลังบันทึกหลักฐาน...' : 'ยืนยัน & ดาวน์โหลด Controlled Copy'}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
