import React, { useState } from 'react';
import { useDcs } from '../context/DcsContext';
import {
  DistributionRecord,
  DEPARTMENTS,
  Department,
  CopyReRequest,
} from '../types';
import {
  Send,
  Printer,
  Clock,
  CheckCircle2,
  AlertCircle,
  Download,
  Lock,
  Bell,
  Search,
  ExternalLink,
  ShieldCheck,
  FileSpreadsheet,
  Layers,
  Sparkles,
  Eye,
} from 'lucide-react';
import confetti from 'canvas-confetti';

export const DistributionManager: React.FC = () => {
  const {
    distributions,
    currentUser,
    setSelectedDistributionForSheet,
    setSelectedDistributionForDownload,
    setSelectedDistributionForReRequest,
    reRequests,
    reviewReRequest,
    setActiveView,
    openDocumentViewer,
  } = useDcs();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [reRequestNote, setReRequestNote] = useState('');

  const filteredDistributions = distributions.filter(dist => {
    const matchSearch =
      dist.distributionNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      dist.docNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      dist.docNameTh.toLowerCase().includes(searchQuery.toLowerCase());

    const matchStatus = statusFilter === 'ALL' || dist.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const pendingReRequests = reRequests.filter(r => r.status === 'PENDING');

  const getRemainingTimeText = (expirationDate: string) => {
    const now = new Date().getTime();
    const expiry = new Date(expirationDate).getTime();
    const diffMs = expiry - now;

    if (diffMs <= 0) {
      return { isExpired: true, text: '🔴 ลิงก์หมดอายุแล้ว', color: 'bg-rose-50 text-rose-700 border-rose-200' };
    }

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;

    if (hours < 24) {
      return { isExpired: false, text: `🟡 เหลือเวลา ${hours} ชม.`, color: 'bg-amber-50 text-amber-700 border-amber-200' };
    }

    return { isExpired: false, text: `🟢 เหลือเวลา ${days} วัน ${remHours} ชม.`, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  };

  const handleApproveReRequest = (reqId: string) => {
    reviewReRequest(reqId, true, reRequestNote || 'อนุมัติเปิดสิทธิ์ดาวน์โหลดใหม่ 3 วันตามคำร้องขอ', 3);
    confetti({
      particleCount: 50,
      spread: 60,
    });
    setReRequestNote('');
  };

  const handleRejectReRequest = (reqId: string) => {
    reviewReRequest(reqId, false, reRequestNote || 'ไม่อนุมัติคำร้องขอสำเนา', 0);
    setReRequestNote('');
  };

  return (
    <div id="dcs-distribution-view" className="space-y-6 pb-12">
      
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              การแจกจ่าย & ควบคุมสำเนา (Distribution Control)
            </h1>
            <span className="bg-cyan-100 text-cyan-800 text-xs font-bold px-2.5 py-0.5 rounded-full border border-cyan-200">
              {filteredDistributions.length} ใบแจกจ่าย
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            ควบคุมการแจกจ่าย Controlled Copy ไปยัง 12 หน่วยงาน ด้วยกฎ 1 แผนก = 1 ดาวน์โหลด พร้อมเวลานับถอยหลัง 3 วัน
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              if (distributions.length > 0) {
                setSelectedDistributionForSheet(distributions[0]);
              } else {
                setSelectedDistributionForSheet({
                  id: 'blank-dist',
                  distributionNo: 'DC-DIS-STANDARD',
                  docId: 'DOC-001',
                  docNo: 'QP-PD-001',
                  docNameTh: 'ระเบียบปฏิบัติการควบคุมกระบวนการผลิต',
                  docNameEn: 'Quality Procedure for Production Process Control',
                  docType: 'QP',
                  revision: '00',
                  effectiveDate: new Date().toISOString().split('T')[0],
                  distributedBy: currentUser.userName,
                  distributedDate: new Date().toISOString(),
                  expirationDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
                  status: 'IN_PROGRESS',
                  controlledDriveLink: '',
                  instructions: '',
                  targets: [],
                });
              }
            }}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer border border-slate-700"
          >
            <Printer className="w-4 h-4 text-cyan-400" />
            ใบแจกจ่าย-เรียกคืน (FM-QS-003-00)
          </button>

          <button
            onClick={() => setActiveView('masterlist')}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            + แจกจ่ายเอกสารจาก Master List
          </button>
        </div>
      </div>

      {/* DCC Re-Requests Alert Queue (If any pending) */}
      {currentUser.currentDept === 'DCC' && pendingReRequests.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 shadow-xs space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
              <Bell className="w-5 h-5 text-amber-600 animate-bounce" />
              <span>คำร้องขอสำเนาใหม่ / ขอต่ออายุสิทธิ์ดาวน์โหลดรอการพิจารณา ({pendingReRequests.length} รายการ)</span>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">
              Action Required
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pendingReRequests.map(req => (
              <div key={req.id} className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-indigo-900">{req.id}</span>
                  <span className="font-bold text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                    หน่วยงาน: {req.dept}
                  </span>
                </div>

                <div>
                  <strong className="text-slate-900 block">{req.docNo} (Rev.{req.revision})</strong>
                  <span className="text-slate-600 text-[11px]">{req.docNameTh}</span>
                </div>

                <div className="p-2.5 bg-slate-50 rounded-lg border text-[11px] text-slate-700">
                  <span className="font-semibold text-slate-900 block">เหตุผล: </span>
                  {req.reasonDetails}
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                  <span>ผู้ขอ: <strong>{req.requestedBy}</strong> ({req.empId || 'N/A'})</span>
                  <span>วันที่ขอ: {new Date(req.requestDate).toLocaleDateString('th-TH')}</span>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => handleApproveReRequest(req.id)}
                    className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    อนุมัติเปิดสิทธิ์ใหม่อีก 3 วัน
                  </button>
                  <button
                    onClick={() => handleRejectReRequest(req.id)}
                    className="py-1.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold rounded-lg text-xs cursor-pointer transition-colors"
                  >
                    ไม่อนุมัติ
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter and Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="ค้นหาเลขที่แจกจ่าย (DC-DIS-...), รหัสเอกสาร, ชื่อ..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-slate-50/50"
          />
        </div>

        <div className="w-full sm:w-60">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-white"
          >
            <option value="ALL">📋 ทุกสถานะการแจกจ่าย</option>
            <option value="IN_PROGRESS">🟡 อยู่ระหว่างดาวน์โหลด (In Progress)</option>
            <option value="COMPLETED">🟢 ดาวน์โหลดครบทุกแผนกแล้ว (Completed)</option>
            <option value="EXPIRED">🔴 มีหน่วยงานหมดอายุ (Expired)</option>
          </select>
        </div>
      </div>

      {/* Distribution Cards List */}
      <div className="space-y-4">
        {filteredDistributions.length === 0 ? (
          <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
            <Send className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            ไม่พบรายการแจกจ่ายเอกสาร
          </div>
        ) : (
          filteredDistributions.map(dist => {
            const timeInfo = getRemainingTimeText(dist.expirationDate);
            const downloadedCount = dist.targets.filter(t => t.isDownloaded).length;
            const totalTargets = dist.targets.length;
            const percent = Math.round((downloadedCount / totalTargets) * 100);

            const myTarget = dist.targets.find(t => t.dept === currentUser.currentDept);

            return (
              <div
                key={dist.id}
                className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs space-y-4 hover:border-cyan-300 transition-colors"
              >
                
                {/* Header Strip */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono font-black text-sm text-indigo-900 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                      {dist.distributionNo}
                    </span>
                    <span className="font-mono font-bold text-slate-800 text-sm">
                      {dist.docNo}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-mono font-bold text-xs">
                      Rev.{dist.revision}
                    </span>
                    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${timeInfo.color}`}>
                      {timeInfo.text}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openDocumentViewer({
                        title: dist.docNameTh,
                        docNo: dist.docNo,
                        docNameTh: dist.docNameTh,
                        docNameEn: dist.docNameEn,
                        revision: dist.revision,
                        fileName: dist.fileName || `${dist.docNo}_Rev${dist.revision}_CONTROLLED.pdf`,
                        fileSize: dist.fileSize,
                        fileType: dist.fileType,
                        fileDataUrl: dist.fileDataUrl,
                        effectiveDate: dist.effectiveDate,
                        isControlledCopy: true,
                      })}
                      className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
                    >
                      <Eye className="w-4 h-4 text-indigo-600" />
                      ดูเอกสารฉบับนี้
                    </button>
                    <button
                      onClick={() => setSelectedDistributionForSheet(dist)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                      ใบแจกจ่าย-เรียกคืน (FM-QS-003-00) / พิมพ์
                    </button>
                  </div>
                </div>

                {/* Body Details */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  
                  <div className="lg:col-span-2 space-y-2">
                    <h3 className="font-bold text-sm text-slate-900">{dist.docNameTh}</h3>
                    <p className="text-xs text-slate-500 italic">{dist.docNameEn}</p>
                    
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600 pt-1">
                      <span>วันที่แจกจ่าย: <strong>{new Date(dist.distributedDate).toLocaleDateString('th-TH')}</strong></span>
                      <span>วันที่มีผลบังคับใช้: <strong>{dist.effectiveDate}</strong></span>
                      <span>ผู้แจกจ่าย: <strong>{dist.distributedBy}</strong></span>
                    </div>

                    <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      <strong>คำสั่งการแจกจ่าย:</strong> {dist.instructions}
                    </p>
                  </div>

                  {/* Progress & Quick My Dept Action */}
                  <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200 flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-bold text-slate-700">ความคืบหน้าการรับเอกสาร:</span>
                        <span className="font-black text-indigo-900 font-mono">{downloadedCount}/{totalTargets} ({percent}%)</span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ${
                            percent === 100 ? 'bg-emerald-500' : 'bg-cyan-500'
                          }`}
                          style={{ width: `${percent}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Department-specific Action Banner */}
                    {myTarget && (
                      <div className="pt-2 border-t border-slate-200">
                        {myTarget.isDownloaded ? (
                          <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between">
                            <span className="text-[11px] font-bold text-emerald-800 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              {currentUser.currentDept}: รับสำเนาแล้ว (Copy 1/1)
                            </span>
                            <span className="text-[10px] text-emerald-600 font-mono">
                              {new Date(myTarget.downloadTimestamp!).toLocaleDateString('th-TH')}
                            </span>
                          </div>
                        ) : timeInfo.isExpired ? (
                          <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between">
                            <span className="text-[11px] font-bold text-rose-800 flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                              ลิงก์ของแผนกหมดอายุแล้ว
                            </span>
                            <button
                              onClick={() => setSelectedDistributionForReRequest({ distribution: dist, dept: currentUser.currentDept })}
                              className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[10px] font-bold cursor-pointer transition-colors shadow-xs"
                            >
                              🔔 ร้องขอ DCC
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setSelectedDistributionForDownload({ distribution: dist, dept: currentUser.currentDept })}
                            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5 cursor-pointer transition-all animate-pulse"
                          >
                            <Download className="w-4 h-4" />
                            ดาวน์โหลด Controlled Copy สำหรับ {currentUser.currentDept}
                          </button>
                        )}
                      </div>
                    )}

                  </div>

                </div>

                {/* Target Departments Matrix Chips */}
                <div className="pt-3 border-t border-slate-100">
                  <div className="text-xs font-bold text-slate-800 mb-2 flex items-center justify-between">
                    <span>รายชื่อหน่วยงานผู้รับและการลงนามรับทราบ:</span>
                    <span className="text-[11px] text-slate-500 font-normal">ระบบจำกัด 1 แผนก = 1 ดาวน์โหลด</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                    {dist.targets.map(target => {
                      const isExpired = new Date().getTime() > new Date(dist.expirationDate).getTime();
                      return (
                        <div
                          key={target.dept}
                          className={`p-3 rounded-xl border text-xs flex flex-col justify-between space-y-1.5 transition-colors ${
                            target.isDownloaded
                              ? 'bg-emerald-50/60 border-emerald-200/90 text-slate-800'
                              : isExpired
                                ? 'bg-rose-50/50 border-rose-200 text-slate-700'
                                : 'bg-slate-50 border-slate-200/90 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900 text-xs sm:text-sm">{target.dept}</span>
                            <span className="text-[11px] font-mono text-slate-500 font-semibold bg-white/80 px-1.5 py-0.5 rounded border border-slate-200/60">{target.copyNo}</span>
                          </div>

                          {target.isDownloaded ? (
                            <div className="space-y-0.5 pt-1.5 border-t border-emerald-200/60">
                              <div className="flex items-center gap-1 text-xs text-emerald-900 font-semibold">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span className="truncate">{target.downloaderName}</span>
                              </div>
                              <span className="text-[11px] text-slate-500 block font-mono">
                                {new Date(target.downloadTimestamp!).toLocaleString('th-TH')}
                              </span>
                            </div>
                          ) : isExpired ? (
                            <div className="flex items-center justify-between pt-1.5 border-t border-rose-200/60">
                              <span className="text-[11px] text-rose-700 font-bold">🔴 หมดเวลา 3 วัน</span>
                              <button
                                onClick={() => setSelectedDistributionForReRequest({ distribution: dist, dept: target.dept })}
                                className="text-xs text-amber-700 hover:underline font-bold cursor-pointer"
                              >
                                ร้องขอ DCC
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between pt-1.5 border-t border-slate-200">
                              <span className="text-[11px] text-amber-700 font-semibold flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" /> รอดาวน์โหลด
                              </span>
                              {currentUser.currentDept === target.dept && (
                                <button
                                  onClick={() => setSelectedDistributionForDownload({ distribution: dist, dept: target.dept })}
                                  className="text-xs text-indigo-600 hover:underline font-bold cursor-pointer"
                                >
                                  กดรับไฟล์ ➔
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                </div>

              </div>
            );
          })
        )}
      </div>

    </div>
  );
};
