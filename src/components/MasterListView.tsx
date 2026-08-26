import React, { useState, useEffect } from 'react';
import { useDcs } from '../context/DcsContext';
import { MasterDocument, DOCUMENT_TYPES, DEPARTMENTS, DocumentType } from '../types';
import { MasterListPrintModal } from './MasterListPrintModal';
import {
  FileText,
  Search,
  Filter,
  History,
  Send,
  Stamp,
  ExternalLink,
  Download,
  Printer,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  Calendar,
  X,
  Layers,
  ArrowRight,
  ShieldCheck,
  FileSpreadsheet,
  Clock,
  Eye,
} from 'lucide-react';

export const MasterListView: React.FC = () => {
  const {
    documents,
    currentUser,
    setActiveView,
    openStamperForDoc,
    createDistribution,
    openDocumentViewer,
  } = useDcs();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedDocForHistory, setSelectedDocForHistory] = useState<MasterDocument | null>(null);
  const [quickDistributeDoc, setQuickDistributeDoc] = useState<MasterDocument | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [targetDepts, setTargetDepts] = useState<string[]>([]);
  const [distInstructions, setDistInstructions] = useState('');
  const [distSuccessMsg, setDistSuccessMsg] = useState('');

  // Close modals on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedDocForHistory) setSelectedDocForHistory(null);
        if (quickDistributeDoc) setQuickDistributeDoc(null);
        if (isPrintModalOpen) setIsPrintModalOpen(false);
      }
    };
    if (selectedDocForHistory || quickDistributeDoc || isPrintModalOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDocForHistory, quickDistributeDoc, isPrintModalOpen]);

  // Filter documents
  const filteredDocs = documents.filter(doc => {
    const matchSearch =
      doc.docNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.docNameTh.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.docNameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.darReferenceId.toLowerCase().includes(searchQuery.toLowerCase());

    const matchType = selectedType === 'ALL' || doc.docType === selectedType;
    const matchDept = selectedDept === 'ALL' || doc.ownerDept === selectedDept;
    const matchStatus = selectedStatus === 'ALL' || doc.status === selectedStatus;

    return matchSearch && matchType && matchDept && matchStatus;
  });

  const handleOpenQuickDistribute = (doc: MasterDocument) => {
    setQuickDistributeDoc(doc);
    // Pre-select some typical departments or all
    setTargetDepts(DEPARTMENTS.filter(d => d.id !== 'DCC').map(d => d.id));
    setDistInstructions(`แจกจ่ายเอกสารควบคุม ${doc.docNo} Rev.${doc.currentRevision} กรุณาดาวน์โหลดภายใน 3 วัน`);
    setDistSuccessMsg('');
  };

  const handleConfirmDistribution = () => {
    if (!quickDistributeDoc || targetDepts.length === 0) return;

    const distNo = createDistribution(
      quickDistributeDoc.id,
      targetDepts as any,
      distInstructions,
      quickDistributeDoc.controlledDriveLink
    );

    setDistSuccessMsg(`สร้างใบแจกจ่ายเลขที่ ${distNo} สำเร็จเรียบร้อย!`);
    setTimeout(() => {
      setQuickDistributeDoc(null);
      setDistSuccessMsg('');
      setActiveView('distribution');
    }, 1200);
  };

  const handlePrintMasterList = () => {
    setIsPrintModalOpen(true);
  };

  const handleExportCSV = () => {
    const headers = [
      'Document No',
      'Document Name TH',
      'Document Name EN',
      'Type',
      'Owner Dept',
      'Current Rev',
      'Effective Date',
      'Review Due Date',
      'Status',
      'DAR Ref',
    ];

    const rows = filteredDocs.map(d => [
      `"${d.docNo}"`,
      `"${d.docNameTh.replace(/"/g, '""')}"`,
      `"${d.docNameEn.replace(/"/g, '""')}"`,
      `"${d.docType}"`,
      `"${d.ownerDept}"`,
      `"Rev.${d.currentRevision}"`,
      `"${d.effectiveDate}"`,
      `"${d.reviewDueDate}"`,
      `"${d.status}"`,
      `"${d.darReferenceId}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `DCC_Master_List_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div id="dcs-masterlist-view" className="space-y-6 pb-12">
      
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              ทะเบียนเอกสารควบคุม (Master List)
            </h1>
            <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2.5 py-0.5 rounded-full border border-indigo-200">
              {filteredDocs.length} ฉบับ
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            ระบบอัปเดต Master List และประวัติ Revision อัตโนมัติเมื่อขึ้นทะเบียนผ่าน DAR (ไม่ต้องคีย์ซ้ำ)
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportCSV}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Download className="w-4 h-4" />
            ส่งออก CSV
          </button>
          <button
            onClick={handlePrintMasterList}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Printer className="w-4 h-4" />
            พิมพ์ Master List
          </button>
          {currentUser.currentDept === 'DCC' && (
            <button
              onClick={() => setActiveView('dar')}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              ขึ้นทะเบียนผ่าน DAR
            </button>
          )}
        </div>
      </div>

      {/* Search and Filters Strip */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <Filter className="w-4 h-4 text-indigo-600" />
            <span>ตัวกรองข้อมูล Master List (เลือกเพื่อค้นหาหรือพิมพ์รายงาน)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">
              พบ <strong className="text-indigo-700 font-bold">{filteredDocs.length}</strong> รายการ
            </span>
            <button
              type="button"
              id="btn-print-masterlist-filter"
              onClick={handlePrintMasterList}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl border border-indigo-200 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="พิมพ์ Master List ตามตัวกรองปัจจุบัน"
            >
              <Printer className="w-3.5 h-3.5" />
              พิมพ์ Master List ({filteredDocs.length})
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          
          {/* Search Bar */}
          <div className="relative md:col-span-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="ค้นหาชื่อเอกสาร, รหัส หรือ DAR..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
            />
          </div>

          {/* Type Filter */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 mb-1">ประเภทเอกสาร:</label>
            <select
              value={selectedType}
              onChange={e => setSelectedType(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
            >
              <option value="ALL">📁 ทุกประเภทเอกสาร (All Types)</option>
              {DOCUMENT_TYPES.map(t => (
                <option key={t.code} value={t.code}>
                  {t.code} - {t.labelTh}
                </option>
              ))}
            </select>
          </div>

          {/* Department Filter */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 mb-1">หน่วยงานเจ้าของ:</label>
            <select
              value={selectedDept}
              onChange={e => setSelectedDept(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
            >
              <option value="ALL">🏢 ทุกหน่วยงานเจ้าของ (All Depts)</option>
              {DEPARTMENTS.map(d => (
                <option key={d.id} value={d.id}>
                  {d.id} - {d.nameTh}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 mb-1">สถานะเอกสาร:</label>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
            >
              <option value="ALL">🟢 ทุกสถานะ (Active & Obsolete)</option>
              <option value="ACTIVE">🟢 ใช้งานอยู่ (Active)</option>
              <option value="OBSOLETE">🔴 ยกเลิกแล้ว (Obsolete)</option>
              <option value="UNDER_REVISION">🟡 อยู่ระหว่างทบทวน</option>
            </select>
          </div>

        </div>
      </div>

      {/* Master List Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white font-semibold uppercase text-[11px] tracking-wider">
                <th className="p-3.5 border-r border-slate-800">รหัสเอกสาร (Doc No.)</th>
                <th className="p-3.5 border-r border-slate-800 min-w-[240px]">ชื่อเอกสาร (Document Name)</th>
                <th className="p-3.5 border-r border-slate-800 text-center">ประเภท</th>
                <th className="p-3.5 border-r border-slate-800 text-center">หน่วยงาน</th>
                <th className="p-3.5 border-r border-slate-800 text-center">Rev. ปัจจุบัน</th>
                <th className="p-3.5 border-r border-slate-800 text-center">วันที่มีผลบังคับใช้</th>
                <th className="p-3.5 border-r border-slate-800 text-center">ครบกำหนดทบทวน</th>
                <th className="p-3.5 border-r border-slate-800 text-center">สถานะ</th>
                <th className="p-3.5 text-center">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400">
                    <FolderOpen className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    ไม่พบเอกสารตามเงื่อนไขที่ระบุ
                  </td>
                </tr>
              ) : (
                filteredDocs.map(doc => {
                  const typeObj = DOCUMENT_TYPES.find(t => t.code === doc.docType);
                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                      
                      {/* Doc No */}
                      <td className="p-3.5 border-r border-slate-100 font-mono font-bold text-indigo-900 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-indigo-600" />
                          <span>{doc.docNo}</span>
                        </div>
                      </td>

                      {/* Doc Name */}
                      <td className="p-3.5 border-r border-slate-100">
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-900">{doc.docNameTh}</div>
                          <div className="text-[11px] text-slate-500 italic">{doc.docNameEn}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            DAR Ref: {doc.darReferenceId}
                          </div>
                        </div>
                      </td>

                      {/* Type Badge */}
                      <td className="p-3.5 border-r border-slate-100 text-center whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${typeObj?.badgeColor || 'bg-slate-100 text-slate-700'}`}>
                          {doc.docType}
                        </span>
                      </td>

                      {/* Owner Dept */}
                      <td className="p-3.5 border-r border-slate-100 text-center whitespace-nowrap font-medium text-slate-700">
                        {doc.ownerDept}
                      </td>

                      {/* Current Rev */}
                      <td className="p-3.5 border-r border-slate-100 text-center whitespace-nowrap">
                        <button
                          onClick={() => setSelectedDocForHistory(doc)}
                          className="inline-flex items-center gap-1 font-mono font-bold text-xs px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 cursor-pointer transition-colors"
                          title="คลิกเพื่อดูประวัติ Revision ทั้งหมด"
                        >
                          Rev.{doc.currentRevision}
                          <History className="w-3 h-3" />
                        </button>
                      </td>

                      {/* Effective Date */}
                      <td className="p-3.5 border-r border-slate-100 text-center whitespace-nowrap text-slate-800 font-mono">
                        {doc.effectiveDate}
                      </td>

                      {/* Review Due Date */}
                      <td className="p-3.5 border-r border-slate-100 text-center whitespace-nowrap text-slate-600 font-mono">
                        {doc.reviewDueDate}
                      </td>

                      {/* Status */}
                      <td className="p-3.5 border-r border-slate-100 text-center whitespace-nowrap">
                        {doc.status === 'ACTIVE' ? (
                          <span className="inline-flex items-center gap-1 font-bold text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <CheckCircle2 className="w-3 h-3" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-bold text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                            <AlertCircle className="w-3 h-3" /> Obsolete
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          
                          {/* History */}
                          <button
                            onClick={() => setSelectedDocForHistory(doc)}
                            className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="ดูประวัติ Revision ทั้งหมด"
                          >
                            <History className="w-4 h-4" />
                          </button>

                          {/* Stamper */}
                          <button
                            onClick={() => openStamperForDoc(doc.docNo, doc.docNameTh, doc.currentRevision, doc.ownerDept)}
                            className="p-1.5 text-slate-600 hover:text-red-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="ประทับตรา Controlled Copy"
                          >
                            <Stamp className="w-4 h-4" />
                          </button>

                          {/* DCC Distribute Button */}
                          {currentUser.currentDept === 'DCC' && (
                            <button
                              onClick={() => handleOpenQuickDistribute(doc)}
                              className="px-2 py-1 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                              title="แจกจ่ายเอกสารนี้"
                            >
                              <Send className="w-3 h-3" />
                              แจกจ่าย
                            </button>
                          )}

                          {/* View Document & Google Drive Link */}
                          <button
                            type="button"
                            onClick={() => openDocumentViewer({
                              title: doc.docNameTh,
                              docNo: doc.docNo,
                              docNameTh: doc.docNameTh,
                              docNameEn: doc.docNameEn,
                              docType: doc.docType,
                              revision: doc.currentRevision,
                              dept: doc.ownerDept,
                              driveLink: doc.controlledDriveLink,
                              fileName: `${doc.docNo}_Rev${doc.currentRevision}_CONTROLLED.pdf`,
                              docId: doc.id,
                              effectiveDate: doc.effectiveDate,
                              isControlledCopy: true,
                            })}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            title="เปิดดูตัวอย่างเอกสาร & ลิงก์ Google Drive"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                        </div>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Revision History Modal */}
      {selectedDocForHistory && (
        <div
          id="revision-history-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedDocForHistory(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto"
        >
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-6">
            
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 flex items-start justify-between border-b border-slate-800">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center">
                    <History className="w-5 h-5 text-indigo-300" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-white">
                      ประวัติการแก้ไขและ Revision ย้อนหลัง (Document Revision Trail)
                    </h3>
                    <p className="text-[11px] text-slate-300">
                      {selectedDocForHistory.docNo} • {selectedDocForHistory.docNameTh} ({selectedDocForHistory.ownerDept})
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                id="btn-close-doc-history-header"
                onClick={() => setSelectedDocForHistory(null)}
                aria-label="ปิดหน้าต่าง"
                className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1 text-xs"
                title="ปิดหน้าต่าง (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto text-xs text-slate-800">
              
              {/* Top Summary Banner */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-gradient-to-r from-indigo-50/80 to-slate-50 border border-indigo-200/80 rounded-xl">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Revision ล่าสุด (Active):</span>
                  <span className="font-black text-base text-indigo-900 font-mono flex items-center gap-1.5">
                    Rev.{selectedDocForHistory.currentRevision}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-sans font-bold border border-emerald-300">
                      ใช้งานอยู่
                    </span>
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">วันที่มีผลบังคับใช้ฉบับปัจจุบัน:</span>
                  <span className="font-bold text-slate-800 font-mono text-xs">{selectedDocForHistory.effectiveDate}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">จำนวน Revision ทั้งหมด:</span>
                  <span className="font-bold text-slate-800 text-xs">
                    {selectedDocForHistory.revisionHistory.length} ฉบับ (Rev.00 ถึง Rev.{selectedDocForHistory.currentRevision})
                  </span>
                </div>
              </div>

              {/* Revision Comparison & Summary Table */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wide flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                  ตารางเปรียบเทียบประวัติ Revision ทั้งหมด (Revision History Summary):
                </h4>
                
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold text-[11px]">
                        <th className="p-2.5 text-center w-16">Revision</th>
                        <th className="p-2.5 w-24 text-center">วันที่มีผล</th>
                        <th className="p-2.5 w-28 text-center">DAR อ้างอิง</th>
                        <th className="p-2.5">เหตุผลและรายละเอียดการเปลี่ยนแปลง</th>
                        <th className="p-2.5 w-28 text-center">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {selectedDocForHistory.revisionHistory.map((item) => (
                        <tr
                          key={item.rev}
                          className={item.status === 'ACTIVE' ? 'bg-indigo-50/40 font-medium' : 'hover:bg-slate-50'}
                        >
                          <td className="p-2.5 text-center font-mono font-bold">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              item.status === 'ACTIVE'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-200 text-slate-800'
                            }`}>
                              Rev.{item.rev}
                            </span>
                          </td>
                          <td className="p-2.5 text-center font-mono text-[11px] text-slate-700">
                            {item.effectiveDate}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-indigo-700 text-[11px]">
                            {item.darNo}
                          </td>
                          <td className="p-2.5 text-slate-800">
                            {item.reason}
                          </td>
                          <td className="p-2.5 text-center">
                            {item.status === 'ACTIVE' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <CheckCircle2 className="w-3 h-3" /> ฉบับปัจจุบัน
                              </span>
                            )}
                            {item.status === 'SUPERSEDED' && (
                              <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-300">
                                ยกเลิกตามรอบ
                              </span>
                            )}
                            {item.status === 'OBSOLETE' && (
                              <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                                ยกเลิก
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Timeline Detail Cards */}
              <div className="space-y-3 pt-2">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wide flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-slate-600" />
                  ไทม์ไลน์บันทึกรายละเอียดแต่ละ Revision (Detailed Timeline):
                </h4>

                <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {selectedDocForHistory.revisionHistory.map((revItem) => (
                    <div
                      key={revItem.rev}
                      className={`relative space-y-2 p-4 rounded-xl border transition-all ${
                        revItem.status === 'ACTIVE'
                          ? 'bg-white border-indigo-300 shadow-sm ring-1 ring-indigo-200'
                          : 'bg-slate-50/80 border-slate-200'
                      }`}
                    >
                      <div className={`absolute -left-[23px] top-4 w-3.5 h-3.5 rounded-full border-2 border-white ${
                        revItem.status === 'ACTIVE' ? 'bg-indigo-600 ring-2 ring-indigo-300' : 'bg-slate-400'
                      }`}></div>

                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-xs px-2.5 py-0.5 bg-slate-900 text-white rounded-md">
                            Rev.{revItem.rev}
                          </span>
                          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                            revItem.status === 'ACTIVE' 
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                              : revItem.status === 'OBSOLETE'
                                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                : 'bg-slate-200 text-slate-700'
                          }`}>
                            {revItem.status === 'ACTIVE' ? '🟢 ฉบับบังคับใช้อยู่ (Active)' : revItem.status === 'OBSOLETE' ? '🔴 ยกเลิกแล้ว (Obsolete)' : '⚪ ถูกทดแทนโดยฉบับใหม่ (Superseded)'}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                          วันที่มีผล: <strong>{revItem.effectiveDate}</strong>
                        </span>
                      </div>

                      <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                        <span className="text-[11px] text-slate-500 font-semibold block">เหตุผลและรายละเอียดการเปลี่ยนแปลง:</span>
                        <p className="text-xs text-slate-800 leading-relaxed font-medium">
                          {revItem.reason}
                        </p>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-600 pt-2 border-t border-slate-200 flex-wrap gap-2">
                        <div className="flex items-center gap-4">
                          <span>ใบคำขอ DAR: <strong className="font-mono text-indigo-700">{revItem.darNo}</strong></span>
                          <span>ผู้บันทึกขึ้นทะเบียน: <strong>{revItem.registeredBy}</strong></span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          เก็บบันทึกประวัติฉบับควบคุมโดย DCC
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
              <div className="text-[11px] text-slate-500">
                ระบบควบคุมประวัติการแก้ไขและ Revision Trail ตามข้อกำหนด ISO 9001:2015 ข้อ 7.5.3
              </div>
              <button
                type="button"
                id="btn-close-doc-history-footer"
                onClick={() => setSelectedDocForHistory(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs transition-colors"
              >
                ปิดหน้าต่าง
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Quick Distribute Modal */}
      {quickDistributeDoc && (
        <div
          id="quick-distribute-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setQuickDistributeDoc(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8">
            
            <div className="bg-gradient-to-r from-cyan-700 to-indigo-800 text-white p-5 flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
                  <Send className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">
                    แจกจ่ายเอกสารควบคุม (Initiate Distribution)
                  </h3>
                  <p className="text-[11px] text-cyan-100">
                    {quickDistributeDoc.docNo} Rev.{quickDistributeDoc.currentRevision}
                  </p>
                </div>
              </div>
              <button
                type="button"
                id="btn-close-quick-distribute-header"
                onClick={() => setQuickDistributeDoc(null)}
                aria-label="ปิดหน้าต่าง"
                className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer flex items-center gap-1 text-xs"
                title="ปิดหน้าต่าง (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-slate-800">
              
              {distSuccessMsg ? (
                <div className="p-6 text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                  <h4 className="font-bold text-sm text-slate-900">{distSuccessMsg}</h4>
                  <p className="text-xs text-slate-500">กำลังนำคุณไปยังหน้ารายการแจกจ่าย...</p>
                </div>
              ) : (
                <>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <span className="font-bold text-slate-900">{quickDistributeDoc.docNameTh}</span>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>ประเภท: <strong>{quickDistributeDoc.docType}</strong></span>
                      <span>วันที่มีผล: <strong>{quickDistributeDoc.effectiveDate}</strong></span>
                      <span>อายุสิทธิ์ดาวน์โหลด: <strong className="text-indigo-600">3 วัน</strong></span>
                    </div>
                  </div>

                  {/* Target Department selection */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="font-bold text-slate-900 text-xs">
                        เลือกหน่วยงานที่ต้องการแจกจ่าย ({targetDepts.length}/12 หน่วยงาน)
                      </label>
                      <div className="flex gap-1 text-[10px]">
                        <button
                          type="button"
                          onClick={() => setTargetDepts(DEPARTMENTS.filter(d => d.id !== 'DCC').map(d => d.id))}
                          className="text-indigo-600 hover:underline font-semibold cursor-pointer"
                        >
                          เลือกทั้งหมด
                        </button>
                        <span>|</span>
                        <button
                          type="button"
                          onClick={() => setTargetDepts(['Production 1', 'Production 2/3', 'QA'])}
                          className="text-indigo-600 hover:underline font-semibold cursor-pointer"
                        >
                          เฉพาะฝ่ายผลิต+QA
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto p-2 border border-slate-200 rounded-xl bg-slate-50/50">
                      {DEPARTMENTS.filter(d => d.id !== 'DCC').map(dept => {
                        const isChecked = targetDepts.includes(dept.id);
                        return (
                          <label
                            key={dept.id}
                            className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                              isChecked ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-semibold' : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={e => {
                                if (e.target.checked) {
                                  setTargetDepts(prev => [...prev, dept.id]);
                                } else {
                                  setTargetDepts(prev => prev.filter(id => id !== dept.id));
                                }
                              }}
                              className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                            />
                            <span className="truncate">{dept.id}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      ข้อความ / คำสั่งการแจกจ่าย
                    </label>
                    <textarea
                      rows={2}
                      value={distInstructions}
                      onChange={e => setDistInstructions(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 space-y-0.5">
                    <strong>⏳ กฎการแจกจ่าย:</strong>
                    <p>
                      เมื่อกดแจกจ่าย ระบบจะออกรหัสใบแจกจ่ายอัตโนมัติ (DC-DIS) และตั้งเวลานับถอยหลัง 3 วันสำหรับแต่ละหน่วยงานในการดาวน์โหลด Controlled Copy (Copy 1/1)
                    </p>
                  </div>
                </>
              )}

            </div>

            {!distSuccessMsg && (
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  id="btn-close-quick-distribute-footer"
                  onClick={() => setQuickDistributeDoc(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  ยกเลิก / ปิดหน้าต่าง
                </button>
                <button
                  type="button"
                  id="btn-confirm-quick-distribute"
                  disabled={targetDepts.length === 0}
                  onClick={handleConfirmDistribution}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <Send className="w-3.5 h-3.5" />
                  ยืนยันการแจกจ่าย ({targetDepts.length} แผนก)
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Master List Print Preview Modal */}
      {isPrintModalOpen && (
        <MasterListPrintModal
          documents={filteredDocs}
          selectedType={selectedType}
          selectedDept={selectedDept}
          selectedStatus={selectedStatus}
          searchQuery={searchQuery}
          onClose={() => setIsPrintModalOpen(false)}
        />
      )}

    </div>
  );
};
