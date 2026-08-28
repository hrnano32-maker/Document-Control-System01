import React from 'react';
import { useDcs } from '../context/DcsContext';
import {
  FileText,
  Send,
  Download,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Layers,
  Stamp,
  Bell,
  ArrowRight,
  ShieldCheck,
  History,
  FolderOpen,
  Building2,
  ExternalLink,
  Calendar,
  Lock,
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const {
    currentUser,
    documents,
    dars,
    distributions,
    auditLogs,
    reRequests,
    setActiveView,
    setIsStamperOpen,
    setSelectedDistributionForDownload,
    setSelectedDistributionForSheet,
    setSelectedDistributionForReRequest,
  } = useDcs();

  const isDcc = currentUser.currentDept === 'DCC';

  // Metrics calculation
  const totalDocs = documents.length;
  const activeDocs = documents.filter(d => d.status === 'ACTIVE').length;
  const pendingDars = dars.filter(d => d.status === 'PENDING_REVIEW' || d.status === 'UNDER_REVIEW').length;
  const activeDistributions = distributions.filter(d => d.status === 'IN_PROGRESS').length;
  const pendingReRequests = reRequests.filter(r => r.status === 'PENDING').length;

  // Department specific stats
  const deptDistributions = distributions.filter(dist =>
    dist.targets.some(t => t.dept === currentUser.currentDept)
  );

  const deptPendingDownloads = distributions.filter(dist => {
    const target = dist.targets.find(t => t.dept === currentUser.currentDept);
    if (!target) return false;
    const isExpired = new Date().getTime() > new Date(dist.expirationDate).getTime();
    return !target.isDownloaded && !isExpired;
  });

  const deptExpiredDownloads = distributions.filter(dist => {
    const target = dist.targets.find(t => t.dept === currentUser.currentDept);
    if (!target) return false;
    const isExpired = new Date().getTime() > new Date(dist.expirationDate).getTime();
    return !target.isDownloaded && isExpired;
  });

  const deptOwnedDocs = documents.filter(d => d.ownerDept === currentUser.currentDept);
  const deptDars = dars.filter(d => d.requestDept === currentUser.currentDept);

  // Department-scoped audit logs (DCC sees all, other depts see only their department)
  const scopedAuditLogs = auditLogs.filter(log => {
    if (isDcc) return true;
    return (
      log.actorDept === currentUser.currentDept ||
      (log.actor && log.actor.includes(currentUser.currentDept)) ||
      (log.details && JSON.stringify(log.details).includes(currentUser.currentDept))
    );
  });

  return (
    <div id="dcs-dashboard" className="space-y-6">
      
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-800 relative overflow-hidden">
        {/* Subtle geometric backdrop */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-indigo-500/10 to-transparent pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-cyan-300 text-xs font-semibold backdrop-blur-xs border border-white/10">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <span>ISO 9001:2015 & IATF 16949 Compliant Control System</span>
            </div>
            
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              {isDcc ? 'ศูนย์ควบคุมเอกสาร (DCC Portal)' : `แดชบอร์ดฝ่าย ${currentUser.currentDept}`}
            </h1>
            
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              {isDcc
                ? 'ระบบบริหารจัดการ Metadata, ควบคุมรอบ Revision, อนุมัติ DAR และติดตามการแจกจ่ายเอกสารควบคุมไปยังทุกหน่วยงาน'
                : `ระบบตรวจสอบเอกสารควบคุมที่ได้รับมอบหมาย, ลงนามรับทราบ และติดตามสถานะคำขอ DAR ของหน่วยงาน`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isDcc ? (
              <>
                <button
                  onClick={() => setIsStamperOpen(true)}
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-rose-950/40"
                >
                  <Stamp className="w-4 h-4" />
                  ตราประทับ Controlled
                </button>
                <button
                  onClick={() => setActiveView('dar')}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-indigo-950/40"
                >
                  <Sparkles className="w-4 h-4" />
                  ตรวจ DAR ({pendingDars})
                </button>
              </>
            ) : (
              <button
                onClick={() => setActiveView('dar')}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-indigo-950/40"
              >
                <Sparkles className="w-4 h-4" />
                ยื่น DAR ขอจัดทำ/แก้ไข
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Urgent Alert Banner for Non-DCC if Pending Downloads */}
      {!isDcc && deptPendingDownloads.length > 0 && (
        <div className="bg-amber-500/10 border-2 border-amber-400/80 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in duration-200">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5 sm:mt-0">
              <Clock className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                มีเอกสารควบคุมใหม่รอฝ่าย {currentUser.currentDept} ดาวน์โหลด ({deptPendingDownloads.length} รายการ)
              </h3>
              <p className="text-sm text-slate-600 mt-1">
                กรุณาลงนามดิจิทัลและดาวน์โหลด Controlled Copy (Copy 1/1) ภายในกำหนดเวลา 3 วัน
              </p>
            </div>
          </div>

          <button
            onClick={() => setActiveView('distribution')}
            className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm rounded-xl flex items-center gap-2 shadow-sm cursor-pointer whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            ไปที่รายการรับเอกสาร
          </button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-5">
        
        {/* Card 1 */}
        <div
          onClick={() => {
            if (isDcc) setActiveView('masterlist');
          }}
          className={`bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-xs hover:border-indigo-400 hover:shadow-md transition-all ${isDcc ? 'cursor-pointer' : ''} group`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm sm:text-base font-bold text-slate-700">
              {isDcc ? 'ทะเบียนเอกสาร Master List' : `เอกสารของฝ่าย ${currentUser.currentDept}`}
            </span>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
              <FileText className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3.5 flex items-baseline gap-2.5">
            <span className="text-3xl sm:text-4xl font-black text-slate-900 font-mono tracking-tight">
              {isDcc ? totalDocs : deptOwnedDocs.length}
            </span>
            <span className="text-xs font-bold bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-full border border-emerald-200">
              {isDcc ? `Active ${activeDocs} ฉบับ` : `${deptOwnedDocs.filter(d => d.status === 'ACTIVE').length} Active`}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-2">
            {isDcc ? 'อัปเดตอัตโนมัติตาม DAR' : 'เอกสารที่หน่วยงานเป็นเจ้าของ'}
          </p>
        </div>

        {/* Card 2 */}
        <div
          onClick={() => setActiveView('dar')}
          className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-xs hover:border-amber-400 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm sm:text-base font-bold text-slate-700">
              {isDcc ? 'DAR รอพิจารณา' : `DAR ฝ่าย ${currentUser.currentDept}`}
            </span>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3.5 flex items-baseline gap-2.5">
            <span className="text-3xl sm:text-4xl font-black text-slate-900 font-mono tracking-tight">
              {isDcc ? pendingDars : deptDars.length}
            </span>
            <span className="text-xs font-bold bg-amber-50 text-amber-800 px-2.5 py-1 rounded-full border border-amber-200">
              {isDcc ? 'Pending Review' : `${deptDars.filter(d => d.status === 'REGISTERED').length} ขึ้นทะเบียนแล้ว`}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-2">
            {isDcc ? 'คำขอยื่นจากทุกแผนก' : 'ยื่นขอจัดทำ / แก้ไข / ยกเลิก'}
          </p>
        </div>

        {/* Card 3 */}
        <div
          onClick={() => {
            if (isDcc) setActiveView('distribution');
          }}
          className={`bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-xs hover:border-cyan-400 hover:shadow-md transition-all ${isDcc ? 'cursor-pointer' : ''} group`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm sm:text-base font-bold text-slate-700">
              {isDcc ? 'การแจกจ่ายที่กำลังดำเนินการ' : 'เอกสารรอรับ (3-Day Limit)'}
            </span>
            <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
              <Send className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3.5 flex items-baseline gap-2.5">
            <span className="text-3xl sm:text-4xl font-black text-slate-900 font-mono tracking-tight">
              {isDcc ? activeDistributions : deptPendingDownloads.length}
            </span>
            <span className="text-xs font-bold bg-cyan-50 text-cyan-800 px-2.5 py-1 rounded-full border border-cyan-200">
              {isDcc ? 'In Progress' : `${deptDistributions.length} ทั้งหมด`}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-2">กฎ 1 แผนก = 1 ดาวน์โหลด</p>
        </div>

        {/* Card 4 */}
        <div
          onClick={() => setActiveView(isDcc ? 'distribution' : 'audit')}
          className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-xs hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm sm:text-base font-bold text-slate-700">
              {isDcc ? 'คำร้องขอสำเนาใหม่ (Re-Request)' : `Audit Trail (${currentUser.currentDept})`}
            </span>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
              {isDcc ? <Bell className="w-5 h-5" /> : <History className="w-5 h-5" />}
            </div>
          </div>
          <div className="mt-3.5 flex items-baseline gap-2.5">
            <span className="text-3xl sm:text-4xl font-black text-slate-900 font-mono tracking-tight">
              {isDcc ? pendingReRequests : scopedAuditLogs.length}
            </span>
            <span className="text-xs font-bold bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-full border border-emerald-200">
              {isDcc ? 'รอดำเนินการ' : 'ISO 7.5 Verified'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-2">
            {isDcc ? 'รอ DCC พิจารณา' : `บันทึกกิจกรรมเฉพาะฝ่าย ${currentUser.currentDept}`}
          </p>
        </div>

      </div>

      {/* Main 2-Column Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column (2 Cols): Actionable Items */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Active Distributions Section */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-cyan-600" />
                <h2 className="font-bold text-base sm:text-lg text-slate-900">
                  {isDcc ? 'รายการแจกจ่ายล่าสุด (Controlled Copy Distributions)' : `รายการแจกจ่ายถึงฝ่าย ${currentUser.currentDept}`}
                </h2>
              </div>
              <button
                onClick={() => setActiveView('distribution')}
                className="text-xs sm:text-sm font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 cursor-pointer"
              >
                ดูทั้งหมด <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5">
              {(isDcc ? distributions : deptDistributions).slice(0, 3).map(dist => {
                const myTarget = dist.targets.find(t => t.dept === currentUser.currentDept);
                const downloadedCount = dist.targets.filter(t => t.isDownloaded).length;
                const totalTargets = dist.targets.length;
                const isExpired = new Date().getTime() > new Date(dist.expirationDate).getTime();

                return (
                  <div
                    key={dist.id}
                    className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono font-bold text-sm text-indigo-900 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                            {dist.docNo}
                          </span>
                          <span className="text-sm font-bold text-slate-800">
                            Rev.{dist.revision}
                          </span>
                          <span className="text-xs text-slate-500 font-mono">
                            ({dist.distributionNo})
                          </span>
                        </div>
                        <h4 className="font-bold text-sm sm:text-base text-slate-900 mt-1.5">{dist.docNameTh}</h4>
                      </div>

                      {/* Download or Sheet Button */}
                      <div>
                        {isDcc ? (
                          <button
                            onClick={() => setSelectedDistributionForSheet(dist)}
                            className="px-3.5 py-1.5 text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl shadow-xs cursor-pointer"
                          >
                            ดูใบแจกจ่าย A4
                          </button>
                        ) : myTarget?.isDownloaded ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-xl border border-emerald-200">
                            <CheckCircle2 className="w-4 h-4" /> รับสำเนาแล้ว (Copy 1/1)
                          </span>
                        ) : isExpired ? (
                          <button
                            onClick={() => setSelectedDistributionForReRequest({ distribution: dist, dept: currentUser.currentDept })}
                            className="px-3 py-1.5 text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 rounded-xl cursor-pointer"
                          >
                            🔔 ร้องขอ DCC
                          </button>
                        ) : (
                          <button
                            onClick={() => setSelectedDistributionForDownload({ distribution: dist, dept: currentUser.currentDept })}
                            className="px-3.5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm flex items-center gap-1.5 cursor-pointer animate-pulse"
                          >
                            <Download className="w-4 h-4" />
                            ดาวน์โหลด & ลงนาม
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-600 pt-2 border-t border-slate-200/80">
                      <span>
                        สถานะการรับ: <strong className="text-slate-800">{downloadedCount}/{totalTargets} หน่วยงาน</strong>
                      </span>
                      <span>
                        วันสิ้นสุดสิทธิ์: <strong className="text-slate-800">{new Date(dist.expirationDate).toLocaleDateString('th-TH')}</strong>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pending DARs Section */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-600" />
                <h2 className="font-bold text-base sm:text-lg text-slate-900">
                  {isDcc ? 'รายการ DAR รอดำเนินการ / อนุมัติ' : `ใบคำขอ DAR ของฝ่าย ${currentUser.currentDept}`}
                </h2>
              </div>
              <button
                onClick={() => setActiveView('dar')}
                className="text-xs sm:text-sm font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 cursor-pointer"
              >
                ดูทั้งหมด <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5">
              {(isDcc ? dars : deptDars).slice(0, 3).map(dar => (
                <div
                  key={dar.id}
                  className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 flex items-center justify-between gap-3.5 text-sm"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono font-bold text-indigo-900 text-sm">{dar.id}</span>
                      <span className="font-bold text-slate-800 text-sm">{dar.docNo}</span>
                      <span className="text-xs font-mono text-slate-500">Rev.{dar.proposedRevision}</span>
                    </div>
                    <p className="font-semibold text-slate-800">{dar.docNameTh}</p>
                    <span className="text-xs text-slate-500 block">
                      ขอโดย {dar.requesterName || `ฝ่าย ${dar.requestDept}`} • {new Date(dar.createdAt).toLocaleDateString('th-TH')}
                    </span>
                  </div>

                  <div className="text-right space-y-2 shrink-0">
                    <span className={`px-3 py-1 rounded-full font-bold text-xs block text-center ${
                      dar.status === 'REGISTERED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : dar.status === 'PENDING_REVIEW'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                    }`}>
                      {dar.status === 'REGISTERED' ? '⭐ ขึ้นทะเบียนแล้ว' : dar.status === 'PENDING_REVIEW' ? '⏳ รอ DCC ตรวจ' : '🔍 อนุมัติ'}
                    </span>
                    <button
                      onClick={() => setActiveView('dar')}
                      className="text-xs text-indigo-600 hover:underline font-bold"
                    >
                      เปิดดู DAR ➔
                    </button>
                  </div>
                </div>
              ))}

              {(isDcc ? dars : deptDars).length === 0 && (
                <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-2">
                  <FileText className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-sm text-slate-600 font-medium">ยังไม่มีคำขอดำเนินการเอกสาร (DAR) ในระบบ</p>
                  <button
                    type="button"
                    onClick={() => setActiveView('dar')}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    + สร้างคำขอ DAR แรกของคุณ
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Right Column (1 Col): System Architecture & Recent Audit Logs */}
        <div className="space-y-6">
          
          {/* Operational Status & Quick Actions Card */}
          <div className="bg-slate-900 text-white rounded-2xl p-5 sm:p-6 shadow-xs space-y-4 border border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-base">
                  {isDcc ? 'การดำเนินงาน DCC วันนี้' : `สรุปงานฝ่าย ${currentUser.currentDept}`}
                </h3>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {isDcc ? 'DCC Admin' : 'Operation'}
              </span>
            </div>

            <div className="space-y-2.5 text-sm">
              {isDcc ? (
                <>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
                    <span className="text-slate-300">DAR รอดำเนินการตรวจ:</span>
                    <span className="font-bold font-mono text-amber-400 text-base">{pendingDars} รายการ</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
                    <span className="text-slate-300">คำขอสำเนาใหม่ (Re-request):</span>
                    <span className="font-bold font-mono text-cyan-400 text-base">{pendingReRequests} คำขอ</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
                    <span className="text-slate-300">การแจกจ่ายที่กำลังดำเนินการ:</span>
                    <span className="font-bold font-mono text-emerald-400 text-base">{activeDistributions} ชุด</span>
                  </div>
                  <div className="pt-2 grid grid-cols-2 gap-2.5">
                    <button
                      onClick={() => setActiveView('dar')}
                      className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm rounded-xl transition-colors text-center cursor-pointer"
                    >
                      จัดการ DAR
                    </button>
                    <button
                      onClick={() => setActiveView('distribution')}
                      className="py-2.5 px-3 bg-slate-750 hover:bg-slate-700 text-slate-200 border border-slate-600 font-bold text-xs sm:text-sm rounded-xl transition-colors text-center cursor-pointer"
                    >
                      ดูการแจกจ่าย
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
                    <span className="text-slate-300">เอกสารในความดูแลของฝ่าย:</span>
                    <span className="font-bold font-mono text-white text-base">{deptOwnedDocs.length} ฉบับ</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
                    <span className="text-slate-300">สำเนาที่รอลงนามรับมอบ:</span>
                    <span className={`font-bold font-mono text-base ${deptPendingDownloads.length > 0 ? 'text-amber-400 animate-pulse' : 'text-emerald-400'}`}>
                      {deptPendingDownloads.length} ชุด
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
                    <span className="text-slate-300">คำขอ DAR ของฝ่าย:</span>
                    <span className="font-bold font-mono text-indigo-300 text-base">{deptDars.length} คำขอ</span>
                  </div>
                  <div className="pt-2">
                    <button
                      onClick={() => setActiveView('dar')}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-colors text-center cursor-pointer"
                    >
                      + ยื่นคำขอ DAR ใหม่
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Real-time Audit Trail Snippet */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-slate-700" />
                <h3 className="font-bold text-base text-slate-900">Audit Trail ล่าสุด</h3>
              </div>
              <button
                onClick={() => setActiveView('audit')}
                className="text-xs sm:text-sm font-bold text-indigo-600 hover:underline cursor-pointer"
              >
                ดูทั้งหมด
              </button>
            </div>

            <div className="space-y-3">
              {scopedAuditLogs.slice(0, 4).map(log => (
                <div key={log.id} className="text-sm p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-indigo-900">{log.docNo}</span>
                    <span className="text-slate-400 font-mono">
                      {new Date(log.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-slate-800 font-medium line-clamp-1">{log.description}</p>
                  <span className="text-xs text-slate-500 block">โดย {log.actor} ({log.actorDept})</span>
                </div>
              ))}
              {scopedAuditLogs.length === 0 && (
                <div className="text-center py-4 text-sm text-slate-400">
                  ไม่มีรายการเหตุการณ์ล่าสุดของฝ่าย {currentUser.currentDept}
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
