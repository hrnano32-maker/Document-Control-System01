import React, { useState, useEffect } from 'react';
import { useDcs } from '../context/DcsContext';
import {
  Stamp,
  X,
  Download,
  Copy,
  CheckCircle2,
  FileCheck2,
  Sparkles,
  Printer,
  ShieldCheck,
} from 'lucide-react';
import { DEPARTMENTS } from '../types';

export const StamperToolModal: React.FC = () => {
  const { isStamperOpen, setIsStamperOpen, stampDocData, currentUser } = useDcs();

  const [targetDept, setTargetDept] = useState(stampDocData?.dept || 'Production 1');
  const [copyNo, setCopyNo] = useState('Copy 1/1');
  const [stampColor, setStampColor] = useState<'RED' | 'BLUE'>('RED');
  const [copied, setCopied] = useState(false);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsStamperOpen(false);
      }
    };
    if (isStamperOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isStamperOpen, setIsStamperOpen]);

  if (!isStamperOpen) return null;

  const handleClose = () => {
    setIsStamperOpen(false);
  };

  const docNo = stampDocData?.docNo || 'QP-PD-001';
  const docName = stampDocData?.docName || 'ระเบียบปฏิบัติการควบคุมกระบวนการผลิตสายการประกอบหลัก';
  const revision = stampDocData?.revision || '03';
  const today = new Date().toISOString().split('T')[0];

  const handleCopyStampCode = () => {
    const stampCode = `[ISO-CONTROLLED-STAMP | DOC:${docNo} | REV:${revision} | DEPT:${targetDept} | COPY:${copyNo} | DATE:${today} | BY:${currentUser.userName}]`;
    navigator.clipboard.writeText(stampCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      id="stamper-tool-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto"
    >
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-red-700 via-red-800 to-rose-900 text-white p-5 flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
              <Stamp className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                ระบบจำลองตราประทับ CONTROLLED COPY (DCC Stamper)
              </h3>
              <p className="text-[11px] text-red-100">
                สร้างลายน้ำและรหัสควบคุมสำเนาสำหรับอัปโหลดขึ้น Google Drive Controlled Folder
              </p>
            </div>
          </div>
          <button
            type="button"
            id="btn-close-stamper-modal-header"
            onClick={handleClose}
            aria-label="ปิดหน้าต่าง"
            className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer flex items-center gap-1 text-xs"
            title="ปิดหน้าต่าง (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 text-xs text-slate-800">
          
          {/* Settings Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                หน่วยงานผู้รับสำเนา
              </label>
              <select
                value={targetDept}
                onChange={e => setTargetDept(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-medium focus:ring-2 focus:ring-red-500 focus:outline-none"
              >
                {DEPARTMENTS.filter(d => d.id !== 'DCC').map(d => (
                  <option key={d.id} value={d.id}>{d.id}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                หมายเลขสำเนา (Copy No.)
              </label>
              <input
                type="text"
                value={copyNo}
                onChange={e => setCopyNo(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-red-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                สีตราประทับควบคุม
              </label>
              <div className="flex gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => setStampColor('RED')}
                  className={`flex-1 py-1.5 rounded-lg font-bold text-xs border cursor-pointer ${
                    stampColor === 'RED' ? 'bg-red-50 border-red-500 text-red-700 ring-2 ring-red-300' : 'border-slate-300 text-slate-600'
                  }`}
                >
                  🔴 สีแดง (มาตรฐาน)
                </button>
                <button
                  type="button"
                  onClick={() => setStampColor('BLUE')}
                  className={`flex-1 py-1.5 rounded-lg font-bold text-xs border cursor-pointer ${
                    stampColor === 'BLUE' ? 'bg-blue-50 border-blue-500 text-blue-700 ring-2 ring-blue-300' : 'border-slate-300 text-slate-600'
                  }`}
                >
                  🔵 สีน้ำเงิน
                </button>
              </div>
            </div>
          </div>

          {/* Virtual Document Preview with Controlled Stamp Overlay */}
          <div className="border-2 border-slate-300 rounded-xl p-6 bg-white shadow-inner relative min-h-[260px] flex flex-col justify-between overflow-hidden">
            
            {/* Background watermark / Document skeleton */}
            <div className="space-y-3 opacity-40 select-none pointer-events-none">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="font-bold text-slate-900">{docNo} (Rev.{revision})</span>
                <span className="text-[10px] text-slate-500">{today}</span>
              </div>
              <h4 className="font-bold text-sm text-slate-900">{docName}</h4>
              <p className="text-[11px] text-slate-700 leading-relaxed">
                1.0 วัตถุประสงค์ (Purpose): เพื่อกำหนดแนวทางการปฏิบัติงานให้เป็นมาตรฐานเดียวกันตามข้อกำหนด ISO 9001:2015...
              </p>
              <div className="h-2 bg-slate-200 rounded w-full"></div>
              <div className="h-2 bg-slate-200 rounded w-5/6"></div>
              <div className="h-2 bg-slate-200 rounded w-4/6"></div>
            </div>

            {/* RED / BLUE STAMP OVERLAY */}
            <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
              <div className={`transform -rotate-12 border-4 ${
                stampColor === 'RED' 
                  ? 'border-red-600 bg-red-50/85 text-red-700 ring-2 ring-red-400' 
                  : 'border-blue-600 bg-blue-50/85 text-blue-700 ring-2 ring-blue-400'
              } rounded-2xl p-4 sm:p-5 max-w-sm text-center shadow-lg font-mono space-y-1.5 backdrop-blur-[2px]`}>
                
                <div className="font-black text-sm sm:text-base tracking-wider uppercase border-b-2 pb-1 border-current flex items-center justify-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  CONTROLLED COPY (เอกสารควบคุม)
                </div>
                
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] sm:text-[11px] text-left pt-1 font-bold">
                  <div>DOC NO: <span className="underline">{docNo}</span></div>
                  <div>REVISION: <span className="underline">Rev.{revision}</span></div>
                  <div>DEPT: <span className="underline">{targetDept}</span></div>
                  <div>ALLOCATION: <span className="underline">{copyNo}</span></div>
                  <div>DATE: <span className="underline">{today}</span></div>
                  <div>DCC: <span className="underline">AUTHORIZED</span></div>
                </div>

                <div className="text-[9px] uppercase tracking-tighter opacity-80 pt-1 border-t border-current">
                  UNAUTHORIZED DUPLICATION STRICTLY FORBIDDEN
                </div>
              </div>
            </div>

            <div className="text-[10px] text-slate-400 text-right pt-4">
              ตัวอย่างการประทับตรา Controlled Copy บนเอกสาร PDF ก่อนส่งขึ้น Google Drive
            </div>
          </div>

          {/* Workflow guidance note */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 space-y-1">
            <strong>💡 ลำดับการทำงานของ DCC:</strong>
            <p>
              1. DCC ดาวน์โหลด Original จาก Google Drive Incoming ➔ 2. ทำการประทับตรา Controlled Copy ➔ 3. อัปโหลดไฟล์ประทับตราขึ้น Google Drive Controlled Archive ➔ 4. นำลิงก์ไปแจกจ่ายในระบบ DCS
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            id="btn-copy-stamp-code"
            onClick={handleCopyStampCode}
            className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            {copied ? 'คัดลอกรหัสตราประทับแล้ว!' : 'คัดลอก Stamp Metadata Code'}
          </button>

          <button
            type="button"
            id="btn-close-stamper-modal-footer"
            onClick={handleClose}
            className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>

      </div>
    </div>
  );
};
