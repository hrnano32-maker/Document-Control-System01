import React, { useState } from 'react';
import { useDcs } from '../context/DcsContext';
import { AuditLogEntry, DEPARTMENTS } from '../types';
import {
  History,
  Search,
  Filter,
  ShieldCheck,
  Calendar,
  User,
  Clock,
  FileText,
  Lock,
  Download,
  Send,
  Sparkles,
  ArrowRight,
  Database,
  CheckCircle2,
} from 'lucide-react';

export const AuditTrailView: React.FC = () => {
  const { auditLogs, currentUser } = useDcs();

  const isDcc = currentUser.currentDept === 'DCC';
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAction, setSelectedAction] = useState<string>('ALL');
  const [selectedDept, setSelectedDept] = useState<string>(isDcc ? 'ALL' : currentUser.currentDept);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Update selectedDept when currentUser changes
  React.useEffect(() => {
    if (!isDcc) {
      setSelectedDept(currentUser.currentDept);
    }
  }, [currentUser.currentDept, isDcc]);

  const filteredLogs = auditLogs.filter(log => {
    // Non-DCC users can only see logs relevant to their department
    if (!isDcc) {
      const isRelatedToDept =
        log.actorDept === currentUser.currentDept ||
        (log.actor && log.actor.includes(currentUser.currentDept)) ||
        (log.details && JSON.stringify(log.details).includes(currentUser.currentDept));
      if (!isRelatedToDept) return false;
    }

    const matchSearch =
      log.docNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.actor.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.details && JSON.stringify(log.details).toLowerCase().includes(searchQuery.toLowerCase()));

    const matchAction = selectedAction === 'ALL' || log.actionType === selectedAction;
    const matchDept = isDcc ? (selectedDept === 'ALL' || log.actorDept === selectedDept) : true;

    return matchSearch && matchAction && matchDept;
  });

  const getActionBadge = (actionType: AuditLogEntry['actionType']) => {
    switch (actionType) {
      case 'DAR_CREATED':
        return { label: '📝 DAR สร้างขึ้น', color: 'bg-amber-100 text-amber-800 border-amber-200' };
      case 'DAR_REVIEWED':
        return { label: '👤 DCC ตรวจสอบ DAR', color: 'bg-blue-100 text-blue-800 border-blue-200' };
      case 'DOCUMENT_REGISTERED':
        return { label: '📊 ขึ้นทะเบียนเอกสาร', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
      case 'MASTER_LIST_UPDATED':
        return { label: '⚡ Master List อัปเดต', color: 'bg-purple-100 text-purple-800 border-purple-200' };
      case 'CONTROLLED_COPY_STAMPED':
        return { label: '🖨️ ตราประทับ Controlled', color: 'bg-rose-100 text-rose-800 border-rose-200' };
      case 'DISTRIBUTION_INITIATED':
        return { label: '📤 แจกจ่ายเอกสาร', color: 'bg-cyan-100 text-cyan-800 border-cyan-200' };
      case 'CONTROLLED_COPY_DOWNLOADED':
        return { label: '📥 ดาวน์โหลด & ลายเซ็น', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
      case 'COPY_RE_REQUESTED':
        return { label: '🔔 ร้องขอสำเนาใหม่', color: 'bg-amber-100 text-amber-800 border-amber-200' };
      case 'RE_REQUEST_APPROVED':
        return { label: '✅ อนุมัติคำขอสำเนา', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
      default:
        return { label: actionType, color: 'bg-slate-100 text-slate-800 border-slate-200' };
    }
  };

  return (
    <div id="dcs-audit-view" className="space-y-6 pb-12">
      
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Audit Trail (ระบบจำทุกเหตุการณ์ย้อนหลัง)
            </h1>
            <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-0.5 rounded-full border border-emerald-200">
              {filteredLogs.length} เหตุการณ์
            </span>
            {isDcc ? (
              <span className="bg-indigo-100 text-indigo-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-indigo-200 flex items-center gap-1">
                👑 DCC Admin (แสดงทุกแผนก)
              </span>
            ) : (
              <span className="bg-amber-100 text-amber-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
                🔒 เฉพาะฝ่าย {currentUser.currentDept}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {isDcc
              ? 'บันทึกประวัติการเปลี่ยนแปลงตามมาตรฐาน ISO 9001:2015 & IATF 16949 Clause 7.5 ครบทุกแผนกในองค์กร'
              : `บันทึกประวัติและกิจกรรมที่เกี่ยวข้องกับฝ่าย ${currentUser.currentDept} (DCC เท่านั้นที่สามารถดูภาพรวมทุกแผนกได้)`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-mono rounded-xl border flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            ISO 7.5 Log Integrity: Verified
          </span>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="ค้นหารหัสเอกสาร, ชื่อผู้กระทำ, รายละเอียด..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50/50"
            />
          </div>

          <div>
            <select
              value={selectedAction}
              onChange={e => setSelectedAction(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
            >
              <option value="ALL">📋 ทุกประเภทเหตุการณ์ (All Events)</option>
              <option value="DAR_CREATED">📝 DAR สร้างขึ้น</option>
              <option value="DAR_REVIEWED">👤 DCC ตรวจสอบ DAR</option>
              <option value="DOCUMENT_REGISTERED">📊 ขึ้นทะเบียนเอกสาร</option>
              <option value="MASTER_LIST_UPDATED">⚡ Master List อัปเดต</option>
              <option value="CONTROLLED_COPY_STAMPED">🖨️ ตราประทับ Controlled</option>
              <option value="DISTRIBUTION_INITIATED">📤 แจกจ่ายเอกสาร</option>
              <option value="CONTROLLED_COPY_DOWNLOADED">📥 ดาวน์โหลด Controlled Copy</option>
              <option value="COPY_RE_REQUESTED">🔔 ร้องขอสำเนาใหม่</option>
              <option value="RE_REQUEST_APPROVED">✅ อนุมัติคำขอสำเนา</option>
            </select>
          </div>

          <div>
            {isDcc ? (
              <select
                value={selectedDept}
                onChange={e => setSelectedDept(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
              >
                <option value="ALL">🏢 ทุกหน่วยงาน (All Departments)</option>
                {DEPARTMENTS.map(d => (
                  <option key={d.id} value={d.id}>{d.id} - {d.nameTh}</option>
                ))}
              </select>
            ) : (
              <div className="w-full px-3 py-2 text-xs border border-amber-300 rounded-xl bg-amber-50 text-amber-900 font-semibold flex items-center justify-between">
                <span>🏢 สังกัด: {currentUser.currentDept}</span>
                <span className="text-[10px] bg-amber-200/80 px-2 py-0.5 rounded text-amber-800 font-normal">ล็อกตามฝ่าย</span>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Timeline List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <History className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            ไม่พบบันทึกเหตุการณ์ตามเงื่อนไข
          </div>
        ) : (
          <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
            {filteredLogs.map(log => {
              const badge = getActionBadge(log.actionType);
              const isExpanded = expandedLogId === log.id;

              return (
                <div key={log.id} className="relative space-y-2 group">
                  
                  {/* Timeline Dot */}
                  <div className="absolute -left-[27px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white bg-indigo-600 shadow-xs group-hover:scale-125 transition-transform"></div>

                  <div className="bg-slate-50/70 hover:bg-slate-50 border border-slate-200 rounded-2xl p-4 transition-colors space-y-2">
                    
                    {/* Event Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badge.color}`}>
                          {badge.label}
                        </span>
                        <span className="font-mono font-bold text-xs text-indigo-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                          {log.docNo}
                        </span>
                        {log.revision && (
                          <span className="font-mono font-semibold text-xs text-slate-700 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                            Rev.{log.revision}
                          </span>
                        )}
                        <span className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-slate-500" />
                          {log.actor}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {new Date(log.timestamp).toLocaleString('th-TH')}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          IP: {log.ipAddress}
                        </span>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-slate-800 leading-relaxed font-medium">
                      {log.description}
                    </p>

                    {/* Metadata details toggle */}
                    {log.details && Object.keys(log.details).length > 0 && (
                      <div className="pt-2">
                        <button
                          onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                          className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Database className="w-3 h-3" />
                          {isExpanded ? 'ซ่อน Metadata ละเอียด' : 'ดู Metadata & ลายเซ็นที่บันทึก'}
                        </button>

                        {isExpanded && (
                          <div className="mt-2 p-3 bg-slate-900 text-slate-200 rounded-xl font-mono text-[11px] overflow-x-auto shadow-inner">
                            <pre>{JSON.stringify(log.details, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    )}

                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};
