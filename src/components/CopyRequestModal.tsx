import React, { useState, useEffect } from 'react';
import { useDcs } from '../context/DcsContext';
import {
  Bell,
  X,
  AlertTriangle,
  Send,
  Building2,
  FileText,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { CopyReRequest } from '../types';

export const CopyRequestModal: React.FC = () => {
  const {
    selectedDistributionForReRequest,
    setSelectedDistributionForReRequest,
    createReRequest,
    currentUser,
  } = useDcs();

  const [requestedBy, setRequestedBy] = useState('');
  const [empId, setEmpId] = useState('');
  const [reasonType, setReasonType] = useState<CopyReRequest['reasonType']>('EXPIRED_DOWNLOAD_WINDOW');
  const [reasonDetails, setReasonDetails] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedDistributionForReRequest(null);
      }
    };
    if (selectedDistributionForReRequest) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDistributionForReRequest, setSelectedDistributionForReRequest]);

  if (!selectedDistributionForReRequest) return null;

  const { distribution, dept } = selectedDistributionForReRequest;

  const handleClose = () => {
    setSelectedDistributionForReRequest(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!requestedBy.trim()) {
      setErrorMsg('กรุณากรอกชื่อผู้ยื่นคำร้อง');
      return;
    }

    if (!reasonDetails.trim()) {
      setErrorMsg('กรุณาระบุรายละเอียดเหตุผลความจำเป็นในการขอสำเนาใหม่หรือต่ออายุ');
      return;
    }

    createReRequest(
      distribution.id,
      dept,
      requestedBy.trim(),
      empId.trim(),
      reasonType,
      reasonDetails.trim()
    );

    setIsSuccess(true);
    setTimeout(() => {
      setSelectedDistributionForReRequest(null);
    }, 2000);
  };

  return (
    <div
      id="copy-request-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto"
    >
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-amber-800 text-white p-5 flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
              <Bell className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                ร้องขอ DCC (ขอสำเนาใหม่ / ต่ออายุสิทธิ์)
              </h3>
              <p className="text-[11px] text-amber-100">
                ส่งคำร้องขออนุมัติสิทธิ์ดาวน์โหลด Controlled Copy เพิ่มเติม
              </p>
            </div>
          </div>
          <button
            type="button"
            id="btn-close-copy-request-header"
            onClick={handleClose}
            aria-label="ปิดหน้าต่าง"
            className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer flex items-center gap-1 text-xs"
            title="ปิดหน้าต่าง (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {isSuccess ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="font-bold text-slate-900 text-base">ยื่นคำร้องสำเร็จแล้ว</h4>
            <p className="text-xs text-slate-600 max-w-sm mx-auto">
              คำร้องขอสำเนา/ต่ออายุถูกส่งไปยังคิวตรวจสอบของ DCC เรียบร้อยแล้ว เมื่อ DCC อนุมัติ สิทธิ์ดาวน์โหลดจะเปิดใหม่อีก 3 วัน
            </p>
            <div className="pt-2">
              <button
                type="button"
                id="btn-close-copy-request-success"
                onClick={handleClose}
                className="px-5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl cursor-pointer transition-colors"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs text-slate-800">
            
            {/* Info Summary */}
            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold font-mono text-indigo-900">{distribution.docNo}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-200 text-amber-900">
                  Rev.{distribution.revision}
                </span>
              </div>
              <p className="font-semibold text-slate-900 text-xs">{distribution.docNameTh}</p>
              <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1 border-t border-amber-200/60">
                <span>หน่วยงาน: <strong>{dept}</strong></span>
                <span>เลขที่แจกจ่าย: <strong>{distribution.distributionNo}</strong></span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  ชื่อผู้ยื่นคำร้อง <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={requestedBy}
                  onChange={e => setRequestedBy(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  รหัสพนักงาน
                </label>
                <input
                  type="text"
                  value={empId}
                  onChange={e => setEmpId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                สาเหตุความจำเป็น <span className="text-rose-500">*</span>
              </label>
              <select
                value={reasonType}
                onChange={e => setReasonType(e.target.value as any)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none bg-white"
              >
                <option value="EXPIRED_DOWNLOAD_WINDOW">⏳ ดาวน์โหลดไม่ทันเวลา 3 วันที่กำหนด (ลิงก์หมดอายุ)</option>
                <option value="FILE_LOST_OR_DAMAGED">💾 ไฟล์ Controlled Copy ในเครื่องชำรุด / เครื่องคอมพิวเตอร์เสีย</option>
                <option value="ADDITIONAL_WORKSTATION">🖥️ ขอเพิ่มสำเนาสำหรับจุดปฏิบัติงานเพิ่มเติม (Workstation ใหม่)</option>
                <option value="AUDIT_PREPARATION">🔍 เตรียมความพร้อมรับการตรวจประเมิน ISO / ลูกค้าเข้า Audit</option>
                <option value="OTHER">📌 อื่นๆ (โปรดระบุรายละเอียด)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                รายละเอียดคำชี้แจง / เหตุผลความจำเป็น <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                value={reasonDetails}
                onChange={e => setReasonDetails(e.target.value)}
                placeholder="ระบุเหตุผลความจำเป็นเพื่อประกอบการพิจารณาของ DCC เช่น ติดภารกิจหน้างาน, เครื่องจักรเปลี่ยนคอมพิวเตอร์ใหม่ เป็นต้น"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                required
              />
            </div>

            {errorMsg && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs">
                {errorMsg}
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                id="btn-cancel-copy-request"
                onClick={handleClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
              >
                ยกเลิก / ปิด
              </button>
              <button
                type="submit"
                id="btn-submit-copy-request"
                className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                ส่งคำร้องถึง DCC
              </button>
            </div>

          </form>
        )}

      </div>
    </div>
  );
};
