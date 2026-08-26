import React, { useState, useRef, useEffect } from 'react';
import { useDcs } from '../context/DcsContext';
import { ChangePasswordModal } from './ChangePasswordModal';
import { NanoLogo } from './NanoLogo';
import {
  FileText,
  Send,
  History,
  Layers,
  ShieldCheck,
  RotateCcw,
  LogOut,
  KeyRound,
  Download,
  ChevronDown,
  UserCheck,
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const {
    currentUser,
    activeView,
    setActiveView,
    distributions,
    dars,
    reRequests,
    resetToDefaultData,
    logout,
    isChangePasswordOpen,
    setIsChangePasswordOpen,
  } = useDcs();

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const isDcc = currentUser.currentDept === 'DCC';

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Calculate notifications
  const pendingDarsCount = dars.filter(d =>
    isDcc
      ? d.status === 'PENDING_REVIEW' || d.status === 'UNDER_REVIEW'
      : d.requestDept === currentUser.currentDept && (d.status === 'PENDING_REVIEW' || d.status === 'UNDER_REVIEW')
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
    <>
      <header
        id="dcs-main-header"
        className="bg-slate-900/95 backdrop-blur-md text-white border-b border-slate-800 sticky top-0 z-40 shadow-lg"
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-2 sm:gap-4">
            
            {/* 1. Left: Brand & Logo */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <button
                id="dcs-logo-btn"
                onClick={() => setActiveView('dashboard')}
                className="flex items-center gap-2.5 text-left group cursor-pointer focus:outline-none"
              >
                {/* NANO Official Logo Badge */}
                <div className="bg-white/95 px-2 py-0.5 rounded-lg border border-slate-700/60 shadow-md group-hover:scale-105 transition-transform flex items-center justify-center">
                  <NanoLogo className="h-6 sm:h-7 w-auto" />
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-sm sm:text-base tracking-tight text-white group-hover:text-indigo-300 transition-colors whitespace-nowrap">
                    DCS <span className="text-indigo-400">e-Control</span>
                  </span>
                  <span className="hidden md:inline-block bg-indigo-950/80 border border-indigo-500/40 text-indigo-300 text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wider whitespace-nowrap">
                    ISO / IATF
                  </span>
                </div>
              </button>
            </div>

            {/* 2. Middle: Navigation Tabs (Clean, single-line, whitespace-nowrap) */}
            <nav id="dcs-nav-tabs" className="hidden md:flex items-center gap-1 lg:gap-1.5 overflow-x-auto no-scrollbar">
              
              {/* แดชบอร์ด */}
              <button
                id="nav-tab-dashboard"
                onClick={() => setActiveView('dashboard')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  activeView === 'dashboard'
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/50'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>แดชบอร์ด</span>
                {totalNotifications > 0 && (
                  <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full ml-0.5">
                    {totalNotifications}
                  </span>
                )}
              </button>

              {/* Master List */}
              <button
                id="nav-tab-masterlist"
                onClick={() => setActiveView('masterlist')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  activeView === 'masterlist'
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/50'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Master List</span>
              </button>

              {/* คำขอ DAR */}
              <button
                id="nav-tab-dar"
                onClick={() => setActiveView('dar')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  activeView === 'dar'
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/50'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-amber-400" />
                <span>คำขอ DAR</span>
                {pendingDarsCount > 0 && (
                  <span className="bg-amber-500 text-slate-950 text-[10px] font-bold px-1.5 py-0.2 rounded-full ml-0.5">
                    {pendingDarsCount}
                  </span>
                )}
              </button>

              {/* การแจกจ่าย & สำเนา */}
              <button
                id="nav-tab-distribution"
                onClick={() => setActiveView('distribution')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  activeView === 'distribution'
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/50'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                <Send className="w-3.5 h-3.5 text-cyan-400" />
                <span>{isDcc ? 'การแจกจ่าย' : 'รับเอกสารแจกจ่าย'}</span>
                {!isDcc && pendingDownloadsForMe > 0 && (
                  <span className="bg-cyan-500 text-slate-950 text-[10px] font-bold px-1.5 py-0.2 rounded-full ml-0.5 flex items-center gap-0.5">
                    <Download className="w-2.5 h-2.5" />
                    {pendingDownloadsForMe}
                  </span>
                )}
              </button>

              {/* Audit Trail */}
              <button
                id="nav-tab-audit"
                onClick={() => setActiveView('audit')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  activeView === 'audit'
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/50'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                <History className="w-3.5 h-3.5 text-emerald-400" />
                <span>Audit Trail</span>
              </button>

            </nav>

            {/* 3. Right: User Profile & Account Menu Dropdown */}
            <div className="flex items-center gap-2 shrink-0">
              
              {/* Account Dropdown Pill */}
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  id="btn-navbar-user-menu"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center gap-2 p-1 sm:px-2.5 sm:py-1.5 bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/80 rounded-xl text-left transition-all cursor-pointer shadow-xs focus:outline-none"
                >
                  <div
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center font-bold text-xs shadow-xs text-white ${
                      isDcc ? 'bg-indigo-600' : 'bg-cyan-600'
                    }`}
                  >
                    {currentUser.currentDept.substring(0, 3)}
                  </div>
                  
                  <div className="hidden sm:block text-left pr-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      <span className="font-bold text-xs text-white truncate max-w-[120px]">
                        {currentUser.currentDept}
                      </span>
                    </div>
                    <div className="text-[10px] text-indigo-300 truncate max-w-[120px]">
                      {currentUser.position || currentUser.roleName}
                    </div>
                  </div>

                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu Popup */}
                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl py-2 z-50 animate-fadeIn">
                    
                    {/* User Information Header */}
                    <div className="px-4 py-3 border-b border-slate-800">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${isDcc ? 'bg-indigo-950 text-indigo-300 border border-indigo-700' : 'bg-cyan-950 text-cyan-300 border border-cyan-700'}`}>
                          {currentUser.roleName}
                        </span>
                        <span className="text-[10px] text-slate-300 font-semibold bg-slate-800 px-2 py-0.5 rounded-md">
                          แผนก {currentUser.currentDept}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-white truncate">
                        {currentUser.position || currentUser.deptDescriptionTh}
                      </p>
                      <p className="text-[11px] text-slate-400 font-normal truncate mt-0.5">
                        {currentUser.deptDescriptionTh}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1 flex items-center justify-between">
                        <span>บัญชีผู้ใช้:</span>
                        <code className="text-amber-300 font-mono bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">{currentUser.username}</code>
                      </p>
                    </div>

                    {/* Actions List */}
                    <div className="p-1 space-y-0.5">
                      
                      {/* Change Password */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          setIsChangePasswordOpen(true);
                        }}
                        className="w-full px-3 py-2 text-left text-xs font-medium text-slate-200 hover:text-white hover:bg-slate-800 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <div className="w-6 h-6 rounded-lg bg-indigo-950/80 border border-indigo-700/50 flex items-center justify-center text-indigo-400">
                          <KeyRound className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-semibold">เปลี่ยนรหัสผ่าน</div>
                          <div className="text-[10px] text-slate-400">ตั้งรหัสผ่านใหม่ประจำแผนก</div>
                        </div>
                      </button>

                      {/* Reset Demo Data (DCC only or Admin) */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          if (window.confirm('ต้องการรีเซ็ตข้อมูลตัวอย่างกลับเป็นค่าเริ่มต้นทั้งหมดหรือไม่?')) {
                            resetToDefaultData();
                          }
                        }}
                        className="w-full px-3 py-2 text-left text-xs font-medium text-slate-200 hover:text-white hover:bg-slate-800 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <div className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400">
                          <RotateCcw className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-semibold">รีเซ็ตข้อมูลระบบ</div>
                          <div className="text-[10px] text-slate-400">ล้างข้อมูลเป็นค่าเริ่มต้น</div>
                        </div>
                      </button>

                    </div>

                    {/* Logout Button */}
                    <div className="pt-1 mt-1 border-t border-slate-800 p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          logout();
                        }}
                        className="w-full px-3 py-2 text-left text-xs font-semibold text-rose-300 hover:text-white hover:bg-rose-600 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <LogOut className="w-4 h-4 text-rose-400 group-hover:text-white" />
                        <span>ออกจากระบบ (Logout)</span>
                      </button>
                    </div>

                  </div>
                )}
              </div>

            </div>

          </div>

          {/* Mobile Bottom Sub-Navigation (Icons + labels scrollable) */}
          <div className="md:hidden flex items-center justify-between py-1.5 gap-1 border-t border-slate-800/80 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveView('dashboard')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-center text-xs font-medium whitespace-nowrap cursor-pointer flex items-center justify-center gap-1 ${
                activeView === 'dashboard' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-300'
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>แดชบอร์ด</span>
            </button>

            <button
              onClick={() => setActiveView('masterlist')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-center text-xs font-medium whitespace-nowrap cursor-pointer flex items-center justify-center gap-1 ${
                activeView === 'masterlist' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-300'
              }`}
            >
              <FileText className="w-3 h-3" />
              <span>Master</span>
            </button>

            <button
              onClick={() => setActiveView('dar')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-center text-xs font-medium whitespace-nowrap cursor-pointer flex items-center justify-center gap-1 ${
                activeView === 'dar' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-300'
              }`}
            >
              <FileText className="w-3 h-3 text-amber-400" />
              <span>DAR {pendingDarsCount > 0 && `(${pendingDarsCount})`}</span>
            </button>

            <button
              onClick={() => setActiveView('distribution')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-center text-xs font-medium whitespace-nowrap cursor-pointer flex items-center justify-center gap-1 ${
                activeView === 'distribution' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-300'
              }`}
            >
              <Send className="w-3 h-3 text-cyan-400" />
              <span>แจกจ่าย</span>
            </button>

            <button
              onClick={() => setActiveView('audit')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-center text-xs font-medium whitespace-nowrap cursor-pointer flex items-center justify-center gap-1 ${
                activeView === 'audit' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-300'
              }`}
            >
              <History className="w-3 h-3 text-emerald-400" />
              <span>Audit</span>
            </button>
          </div>

        </div>
      </header>

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </>
  );
};
