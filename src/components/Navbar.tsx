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
  Type,
  ZoomIn,
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
  const [fontSize, setFontSize] = useState<'normal' | 'large' | 'extra-large'>('large');
  const userMenuRef = useRef<HTMLDivElement>(null);

  const isDcc = currentUser.currentDept === 'DCC';

  // Load font size preference from localStorage on mount
  useEffect(() => {
    const savedFontSize = (localStorage.getItem('dcs_font_size') as 'normal' | 'large' | 'extra-large') || 'large';
    setFontSize(savedFontSize);
    document.documentElement.setAttribute('data-font-size', savedFontSize);
  }, []);

  const handleSetFontSize = (size: 'normal' | 'large' | 'extra-large') => {
    setFontSize(size);
    localStorage.setItem('dcs_font_size', size);
    document.documentElement.setAttribute('data-font-size', size);
  };

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
          <div className="flex items-center justify-between h-16 sm:h-20 gap-2 sm:gap-4">
            
            {/* 1. Left: Brand & Logo */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <button
                id="dcs-logo-btn"
                onClick={() => setActiveView('dashboard')}
                className="flex items-center gap-3 text-left group cursor-pointer focus:outline-none"
              >
                {/* NANO Official Logo Badge */}
                <div className="bg-white/95 px-2.5 py-1 rounded-xl border border-slate-700/60 shadow-md group-hover:scale-105 transition-transform flex items-center justify-center">
                  <NanoLogo className="h-7 sm:h-8 w-auto" />
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-base sm:text-lg tracking-tight text-white group-hover:text-indigo-300 transition-colors whitespace-nowrap">
                    DCS <span className="text-indigo-400">e-Control</span>
                  </span>
                  <span className="hidden lg:inline-block bg-indigo-950/80 border border-indigo-500/40 text-indigo-300 text-xs font-bold px-2 py-0.5 rounded-md uppercase tracking-wider whitespace-nowrap">
                    ISO / IATF
                  </span>
                </div>
              </button>
            </div>

            {/* 2. Middle: Navigation Tabs */}
            <nav id="dcs-nav-tabs" className="hidden md:flex items-center gap-1.5 lg:gap-2.5 overflow-x-auto no-scrollbar">
              
              {/* แดชบอร์ด */}
              <button
                id="nav-tab-dashboard"
                onClick={() => setActiveView('dashboard')}
                className={`px-4 py-2.5 rounded-xl text-base font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                  activeView === 'dashboard'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/40'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                <Layers className="w-5 h-5" />
                <span>แดชบอร์ด</span>
                {totalNotifications > 0 && (
                  <span className="bg-rose-500 text-white text-xs font-extrabold px-2 py-0.5 rounded-full ml-0.5">
                    {totalNotifications}
                  </span>
                )}
              </button>

              {/* Master List */}
              <button
                id="nav-tab-masterlist"
                onClick={() => setActiveView('masterlist')}
                className={`px-4 py-2.5 rounded-xl text-base font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                  activeView === 'masterlist'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/40'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                <FileText className="w-5 h-5" />
                <span>Master List</span>
              </button>

              {/* คำขอ DAR */}
              <button
                id="nav-tab-dar"
                onClick={() => setActiveView('dar')}
                className={`px-4 py-2.5 rounded-xl text-base font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                  activeView === 'dar'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/40'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                <FileText className="w-5 h-5 text-amber-400" />
                <span>คำขอ DAR</span>
                {pendingDarsCount > 0 && (
                  <span className="bg-amber-500 text-slate-950 text-xs font-extrabold px-2 py-0.5 rounded-full ml-0.5">
                    {pendingDarsCount}
                  </span>
                )}
              </button>

              {/* การแจกจ่าย & สำเนา */}
              <button
                id="nav-tab-distribution"
                onClick={() => setActiveView('distribution')}
                className={`px-4 py-2.5 rounded-xl text-base font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                  activeView === 'distribution'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/40'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                <Send className="w-5 h-5 text-cyan-400" />
                <span>{isDcc ? 'การแจกจ่าย' : 'รับเอกสารแจกจ่าย'}</span>
                {!isDcc && pendingDownloadsForMe > 0 && (
                  <span className="bg-cyan-500 text-slate-950 text-xs font-extrabold px-2 py-0.5 rounded-full ml-0.5 flex items-center gap-0.5">
                    <Download className="w-3.5 h-3.5" />
                    {pendingDownloadsForMe}
                  </span>
                )}
              </button>

              {/* Audit Trail */}
              <button
                id="nav-tab-audit"
                onClick={() => setActiveView('audit')}
                className={`px-4 py-2.5 rounded-xl text-base font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                  activeView === 'audit'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/40'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                <History className="w-5 h-5 text-emerald-400" />
                <span>Audit Trail</span>
              </button>

            </nav>

            {/* 3. Right: User Profile & Account Menu Dropdown */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              
              {/* Account Dropdown Pill */}
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  id="btn-navbar-user-menu"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center gap-2.5 p-1.5 sm:px-3 sm:py-2 bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/80 rounded-xl text-left transition-all cursor-pointer shadow-xs focus:outline-none"
                >
                  <div
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-black text-sm shadow-xs text-white ${
                      isDcc ? 'bg-indigo-600' : 'bg-cyan-600'
                    }`}
                  >
                    {currentUser.currentDept.substring(0, 3)}
                  </div>
                  
                  <div className="hidden sm:block text-left pr-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                      <span className="font-bold text-base text-white truncate max-w-[150px]">
                        {currentUser.currentDept}
                      </span>
                    </div>
                    <div className="text-xs text-indigo-300 font-semibold truncate max-w-[150px]">
                      {currentUser.position || currentUser.roleName}
                    </div>
                  </div>

                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu Popup */}
                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-88 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl py-2.5 z-50 animate-fadeIn">
                    
                    {/* User Information Header */}
                    <div className="px-4 py-3.5 border-b border-slate-800">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${isDcc ? 'bg-indigo-950 text-indigo-300 border border-indigo-700' : 'bg-cyan-950 text-cyan-300 border border-cyan-700'}`}>
                          {currentUser.roleName}
                        </span>
                        <span className="text-xs text-slate-300 font-bold bg-slate-800 px-2.5 py-1 rounded-md">
                          แผนก {currentUser.currentDept}
                        </span>
                      </div>
                      <p className="text-base font-bold text-white truncate">
                        {currentUser.position || currentUser.deptDescriptionTh}
                      </p>
                      <p className="text-xs text-slate-400 font-medium truncate mt-0.5">
                        {currentUser.deptDescriptionTh}
                      </p>
                      <p className="text-xs text-slate-400 mt-2.5 flex items-center justify-between">
                        <span>ชื่อผู้ใช้ (User):</span>
                        <code className="text-amber-300 font-mono text-xs bg-slate-950 px-2.5 py-0.5 rounded border border-slate-800 font-bold">{currentUser.username}</code>
                      </p>
                    </div>

                    {/* Font Size Adjust for Mobile / Dropdown */}
                    <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/40">
                      <div className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                        <Type className="w-4 h-4 text-indigo-400" />
                        <span>ปรับขนาดตัวหนังสือทั้งระบบ:</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleSetFontSize('normal')}
                          className={`py-1.5 px-2 rounded-lg text-xs font-bold text-center cursor-pointer transition-all ${
                            fontSize === 'normal' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          ปกติ (16px)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetFontSize('large')}
                          className={`py-1.5 px-2 rounded-lg text-xs font-bold text-center cursor-pointer transition-all ${
                            fontSize === 'large' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          ใหญ่ (18px)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetFontSize('extra-large')}
                          className={`py-1.5 px-2 rounded-lg text-xs font-bold text-center cursor-pointer transition-all ${
                            fontSize === 'extra-large' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          ใหญ่มาก (20px)
                        </button>
                      </div>
                    </div>

                    {/* Actions List */}
                    <div className="p-2 space-y-1">
                      
                      {/* Change Password */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          setIsChangePasswordOpen(true);
                        }}
                        className="w-full px-3 py-2.5 text-left text-sm font-medium text-slate-200 hover:text-white hover:bg-slate-800 rounded-xl flex items-center gap-3 transition-colors cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-lg bg-indigo-950/80 border border-indigo-700/50 flex items-center justify-center text-indigo-400 shrink-0">
                          <KeyRound className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-sm text-white">เปลี่ยนรหัสผ่าน</div>
                          <div className="text-xs text-slate-400">ตั้งรหัสผ่านใหม่ประจำแผนก</div>
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
                        className="w-full px-3 py-2.5 text-left text-sm font-medium text-slate-200 hover:text-white hover:bg-slate-800 rounded-xl flex items-center gap-3 transition-colors cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 shrink-0">
                          <RotateCcw className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-sm text-white">รีเซ็ตข้อมูลระบบ</div>
                          <div className="text-xs text-slate-400">ล้างข้อมูลเป็นค่าเริ่มต้น</div>
                        </div>
                      </button>

                    </div>

                    {/* Logout Button */}
                    <div className="pt-1.5 mt-1 border-t border-slate-800 p-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          logout();
                        }}
                        className="w-full px-3 py-2.5 text-left text-sm font-bold text-rose-300 hover:text-white hover:bg-rose-600 rounded-xl flex items-center gap-3 transition-colors cursor-pointer"
                      >
                        <LogOut className="w-4 h-4 text-rose-400 group-hover:text-white shrink-0" />
                        <span>ออกจากระบบ (Logout)</span>
                      </button>
                    </div>

                  </div>
                )}
              </div>

            </div>

          </div>

          {/* Mobile Bottom Sub-Navigation */}
          <div className="md:hidden flex items-center justify-between py-2 gap-1 border-t border-slate-800/80 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveView('dashboard')}
              className={`flex-1 py-2 px-2.5 rounded-xl text-center text-xs sm:text-sm font-bold whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 ${
                activeView === 'dashboard' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>แดชบอร์ด</span>
            </button>

            <button
              onClick={() => setActiveView('masterlist')}
              className={`flex-1 py-2 px-2.5 rounded-xl text-center text-xs sm:text-sm font-bold whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 ${
                activeView === 'masterlist' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Master</span>
            </button>

            <button
              onClick={() => setActiveView('dar')}
              className={`flex-1 py-2 px-2.5 rounded-xl text-center text-xs sm:text-sm font-bold whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 ${
                activeView === 'dar' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4 text-amber-400" />
              <span>DAR {pendingDarsCount > 0 && `(${pendingDarsCount})`}</span>
            </button>

            <button
              onClick={() => setActiveView('distribution')}
              className={`flex-1 py-2 px-2.5 rounded-xl text-center text-xs sm:text-sm font-bold whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 ${
                activeView === 'distribution' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
            >
              <Send className="w-4 h-4 text-cyan-400" />
              <span>แจกจ่าย</span>
            </button>

            <button
              onClick={() => setActiveView('audit')}
              className={`flex-1 py-2 px-2.5 rounded-xl text-center text-xs sm:text-sm font-bold whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 ${
                activeView === 'audit' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
            >
              <History className="w-4 h-4 text-emerald-400" />
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
