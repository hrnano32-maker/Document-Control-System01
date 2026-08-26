import React from 'react';
import { DcsProvider, useDcs } from './context/DcsContext';
import { Navbar } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { MasterListView } from './components/MasterListView';
import { DarManagement } from './components/DarManagement';
import { DistributionManager } from './components/DistributionManager';
import { AuditTrailView } from './components/AuditTrailView';
import { DownloadModal } from './components/DownloadModal';
import { DistributionSheetModal } from './components/DistributionSheetModal';
import { CopyRequestModal } from './components/CopyRequestModal';
import { StamperToolModal } from './components/StamperToolModal';
import { DocumentViewerModal } from './components/DocumentViewerModal';
import { LoginPage } from './components/LoginPage';

const MainLayout: React.FC = () => {
  const { activeView, currentUser } = useDcs();

  if (!currentUser.isAuthenticated) {
    return <LoginPage />;
  }

  const isDcc = currentUser.currentDept === 'DCC';

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-800 flex flex-col selection:bg-indigo-500 selection:text-white font-sans">
      
      {/* Top Navigation */}
      <Navbar />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12">
        {activeView === 'dashboard' && <Dashboard />}
        {activeView === 'masterlist' && (isDcc ? <MasterListView /> : <Dashboard />)}
        {activeView === 'dar' && <DarManagement />}
        {activeView === 'distribution' && (isDcc ? <DistributionManager /> : <Dashboard />)}
        {activeView === 'audit' && <AuditTrailView />}
      </main>

      {/* Modals & Dialogs */}
      <DownloadModal />
      <DistributionSheetModal />
      <CopyRequestModal />
      <StamperToolModal />
      <DocumentViewerModal />

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500 print:hidden">
        <div className="max-w-7xl mx-auto px-4 space-y-1">
          <p className="font-semibold text-slate-700">
            ระบบควบคุมเอกสารอิเล็กทรอนิกส์ (Document Control System - DCS) • ISO 9001:2015 & IATF 16949
          </p>
          <p className="text-[11px] text-slate-400">
            หน่วยงานปัจจุบัน: <span className="font-bold text-indigo-600">{currentUser.currentDept}</span> ({currentUser.deptDescriptionTh}) • บทบาท: {currentUser.roleName}
          </p>
        </div>
      </footer>

    </div>
  );
};

export default function App() {
  return (
    <DcsProvider>
      <MainLayout />
    </DcsProvider>
  );
}
