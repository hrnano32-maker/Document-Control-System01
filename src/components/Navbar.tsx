import React from 'react';
import { useDcs } from '../context/DcsContext';
import { DEPARTMENTS } from '../types';
import {
  FileText,
  Layers,
  Send,
  History,
  ShieldCheck,
  RotateCcw,
  LogOut,
  User,
  KeyRound,
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const {
    currentUser,
    setCurrentDept,
    activeView,
    setActiveView,
    distributions,
    dars,
    reRequests,
    resetToDefaultData,
    logout,
    userAccounts,
  } = useDcs();

  const isDcc = currentUser.currentDept === 'DCC';

  // Calculate notifications
  const pendingDarsCount = dars.filter(d => 
    isDcc 
      ? (d.status === 'PENDING_REVIEW' || d.status === 'UNDER_REVIEW')
      : (d.requestDept === currentUser.currentDept && (d.status === 'PENDING_REVIEW' || d.status === 'UNDER_REVIEW'))
  ).length;

  const pendingReRequestsCount = reRequests.filter(r => r.status === 'PENDING').length;
  
  // Pending downloads for current dept
  const pendingDownloadsForMe = distributions.reduce((acc, dist) => {
    const target = dist.targets.find(t => t.dept === currentUser.currentDept);
    const isExpired = new Date().getTime() > new Date(dist.expirationDate).getTime();
    if (target && !target.isDownloaded && !isExpired) {
      return acc + 1;
    }
    return acc;
  }, 0);

  const totalNotifications = isDcc 
    ? pendingDarsCount + pendingReRequestsCount 
    : pendingDownloadsForMe;

  return (
    <header id="dcs-main-header" className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40 shadow-md">
      {/* Main Navbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <button
              id="dcs-logo-btn"
              onClick={() => setActiveView('dashboard')}
              className="flex items-center gap-3 text-left group cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-blue-600 to-indigo-700 flex items-center justify-center shadow-inner shadow-white/20 ring-1 ring-white/10 group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base sm:text-lg tracking-tight text-white group-hover:text-indigo-300 transition-colors">
                    DCS e-Control
                  </span>
                  <span className="bg-indigo-900/70 border border-indigo-500/40 text-indigo-200 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    ISO/IATF
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 hidden sm:block">
                  ระบบควบคุมเอกสารอิเล็กทรอนิกส์ & บันทึกสิทธิ์รายแผนก
                </p>
              </div>
            </button>
          </div>

          {/* Navigation Links - Role Scoped (DCC: 5 tabs, Departments: 3 tabs only) */}
          <nav id="dcs-nav-tabs" className="hidden lg:flex items-center gap-1">
            
            {/* 1. แดชบอร์ด (All Roles) */}
            <button
              id="nav-tab-dashboard"
              onClick={() => setActiveView('dashboard')}
              className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                activeView === 'dashboard'
                  ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Layers className="w-4 h-4" />
              แดชบอร์ด
              {totalNotifications > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                  {totalNotifications}
                </span>
              )}
            </button>

            {/* 2. Master List (DCC Admin Only) */}
            {isDcc && (
              <button
                id="nav-tab-masterlist"
                onClick={() => setActiveView('masterlist')}
                className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeView === 'masterlist'
                    ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <FileText className="w-4 h-4" />
                Master List ทะเบียนเอกสาร
              </button>
            )}

            {/* 3. DAR ขอดำเนินการ (All Roles) */}
            <button
              id="nav-tab-dar"
              onClick={() => setActiveView('dar')}
              className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                activeView === 'dar'
                  ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <FileText className="w-4 h-4 text-amber-400" />
              DAR ขอดำเนินการ
              {pendingDarsCount > 0 && (
                <span className="bg-amber-500 text-slate-950 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                  {pendingDarsCount}
                </span>
              )}
            </button>

            {/* 4. การแจกจ่าย & สำเนา (DCC Admin Only) */}
            {isDcc && (
              <button
                id="nav-tab-distribution"
                onClick={() => setActiveView('distribution')}
                className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeView === 'distribution'
                    ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Send className="w-4 h-4 text-cyan-400" />
                การแจกจ่าย & สำเนา
              </button>
            )}

            {/* 5. Audit Trail บันทึกเหตุการณ์ (All Roles - scoped to dept) */}
            <button
              id="nav-tab-audit"
              onClick={() => setActiveView('audit')}
              className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                activeView === 'audit'
                  ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <History className="w-4 h-4 text-emerald-400" />
              Audit Trail {!isDcc && `(${currentUser.currentDept})`}
            </button>

          </nav>

          {/* User Profile, Dept Switcher & Logout */}
          <div className="flex items-center gap-2 sm:gap-3">
            
            {/* Department Display (Locked to Authenticated Session) */}
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                หน่วยงานที่เข้าสู่ระบบ:
              </span>
              <div className="flex items-center gap-1.5 bg-slate-800/90 text-white text-xs font-semibold rounded-lg px-2.5 py-1 border border-indigo-500/30">
                <span className="text-indigo-300 font-bold">{currentUser.currentDept}</span>
                <span className="text-slate-400 text-[11px] hidden sm:inline">({currentUser.deptDescriptionTh})</span>
              </div>
            </div>

            {/* Department Badge */}
            <div
              id="dcs-dept-avatar-badge"
              className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shadow-inner ring-1 shrink-0 ${
                isDcc
                  ? 'bg-indigo-600 text-white ring-indigo-400'
                  : 'bg-cyan-600 text-white ring-cyan-400'
              }`}
              title={`บัญชี: ${currentUser.username} | หน่วยงาน: ${currentUser.currentDept} (${currentUser.roleName})`}
            >
              {currentUser.currentDept.substring(0, 3)}
            </div>

            {/* Logout / Switch Account Button */}
            <button
              type="button"
              id="btn-navbar-logout"
              onClick={logout}
              className="p-2 sm:px-3 sm:py-1.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              title="ออกจากระบบ เพื่อเข้าสู่ระบบด้วยแผนกอื่น"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">ออกจากระบบ</span>
            </button>

            {/* Reset Data Button */}
            <button
              id="dcs-btn-reset-demo"
              onClick={() => {
                if (window.confirm('ต้องการรีเซ็ตข้อมูลตัวอย่างกลับเป็นค่าเริ่มต้นทั้งหมดหรือไม่?')) {
                  resetToDefaultData();
                }
              }}
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="รีเซ็ตข้อมูลตัวอย่างระบบ"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile Sub-Navigation Bar (Role Scoped) */}
        <div className="lg:hidden flex items-center justify-start overflow-x-auto py-2 gap-2 border-t border-slate-800 no-scrollbar">
          <button
            onClick={() => setActiveView('dashboard')}
            className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap cursor-pointer ${
              activeView === 'dashboard' ? 'bg-indigo-600 text-white' : 'text-slate-300'
            }`}
          >
            แดชบอร์ด
          </button>

          {isDcc && (
            <button
              onClick={() => setActiveView('masterlist')}
              className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap cursor-pointer ${
                activeView === 'masterlist' ? 'bg-indigo-600 text-white' : 'text-slate-300'
              }`}
            >
              Master List
            </button>
          )}

          <button
            onClick={() => setActiveView('dar')}
            className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap cursor-pointer ${
              activeView === 'dar' ? 'bg-indigo-600 text-white' : 'text-slate-300'
            }`}
          >
            DAR ({pendingDarsCount})
          </button>

          {isDcc && (
            <button
              onClick={() => setActiveView('distribution')}
              className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap cursor-pointer ${
                activeView === 'distribution' ? 'bg-indigo-600 text-white' : 'text-slate-300'
              }`}
            >
              การแจกจ่าย
            </button>
          )}

          <button
            onClick={() => setActiveView('audit')}
            className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap cursor-pointer ${
              activeView === 'audit' ? 'bg-indigo-600 text-white' : 'text-slate-300'
            }`}
          >
            Audit Trail
          </button>
        </div>
      </div>
    </header>
  );
};
