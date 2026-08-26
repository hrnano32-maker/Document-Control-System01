import React from 'react';
import { MasterDocument, DOCUMENT_TYPES, DEPARTMENTS } from '../types';
import { Printer, X, FileSpreadsheet, ExternalLink, Download } from 'lucide-react';
import { printElementById, openPrintInNewTab, downloadPrintableHtml } from '../utils/printHelper';

interface MasterListPrintModalProps {
  documents: MasterDocument[];
  selectedType: string;
  selectedDept: string;
  selectedStatus: string;
  searchQuery: string;
  onClose: () => void;
}

export const MasterListPrintModal: React.FC<MasterListPrintModalProps> = ({
  documents,
  selectedType,
  selectedDept,
  selectedStatus,
  searchQuery,
  onClose,
}) => {
  const reportTitle = `Master-List-Report-${new Date().toISOString().split('T')[0]}`;

  const handlePrint = () => {
    printElementById('masterlist-printable-sheet', reportTitle);
  };

  const handleOpenTab = () => {
    openPrintInNewTab('masterlist-printable-sheet', reportTitle);
  };

  const handleDownload = () => {
    downloadPrintableHtml('masterlist-printable-sheet', reportTitle);
  };

  const getTypeName = (code: string) => {
    if (code === 'ALL') return 'ทุกประเภทเอกสาร (All Types)';
    const found = DOCUMENT_TYPES.find(t => t.code === code);
    return found ? `${found.code} - ${found.labelTh}` : code;
  };

  const getDeptName = (deptId: string) => {
    if (deptId === 'ALL') return 'ทุกหน่วยงาน (All Departments)';
    const found = DEPARTMENTS.find(d => d.id === deptId);
    return found ? `${found.id} - ${found.nameTh}` : deptId;
  };

  const getStatusName = (status: string) => {
    if (status === 'ALL') return 'ทุกสถานะ (All Statuses)';
    if (status === 'ACTIVE') return 'ใช้งานอยู่ (Active)';
    if (status === 'OBSOLETE') return 'ยกเลิกแล้ว (Obsolete)';
    if (status === 'UNDER_REVISION') return 'อยู่ระหว่างทบทวน (Under Revision)';
    return status;
  };

  return (
    <div
      id="modal-masterlist-print"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white print:static"
    >
      <div className="bg-white rounded-2xl max-w-5xl w-full shadow-2xl border border-slate-300 overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-6 print:shadow-none print:border-none print:max-w-none print:m-0 print:rounded-none">
        
        {/* Modal Header Controls (Hidden during print) */}
        <div className="bg-slate-900 text-white p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 print:hidden border-b border-slate-800">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-5 h-5 text-indigo-400 shrink-0" />
            <div>
              <h3 className="font-bold text-sm text-white">
                ตัวอย่างพิมพ์ทะเบียนเอกสารควบคุม (Master List Print Preview)
              </h3>
              <p className="text-[11px] text-slate-400">
                รายการเอกสารที่ผ่านการกรองจำนวน: <span className="font-bold text-indigo-300">{documents.length} ฉบับ</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              id="btn-print-masterlist-newtab"
              onClick={handleOpenTab}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-1 cursor-pointer transition-all"
              title="เปิดหน้าต่างใหม่เพื่อสั่งพิมพ์ (กรณีถูกบล็อกใน iframe)"
            >
              <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
              เปิดแท็บใหม่พิมพ์
            </button>
            <button
              type="button"
              id="btn-download-masterlist-html"
              onClick={handleDownload}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-1 cursor-pointer transition-all"
              title="ดาวน์โหลดไฟล์เอกสารพร้อมพิมพ์ HTML/PDF"
            >
              <Download className="w-3.5 h-3.5 text-indigo-400" />
              ดาวน์โหลดไฟล์พิมพ์
            </button>
            <button
              type="button"
              id="btn-confirm-print-masterlist"
              onClick={handlePrint}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <Printer className="w-4 h-4" />
              สั่งพิมพ์ (Print A4)
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              title="ปิดหน้าต่าง"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable View Container */}
        <div className="p-4 sm:p-6 bg-slate-100/70 overflow-y-auto max-h-[78vh]">
          <div
            id="masterlist-printable-sheet"
            className="p-6 sm:p-8 space-y-5 text-slate-900 font-sans bg-white rounded-xl shadow-md border border-slate-200 print:shadow-none print:border-none print:p-2"
          >
            {/* Header ISO Standard */}
            <div className="border-2 border-slate-900 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row items-center justify-between border-b-2 border-slate-900 pb-3 gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-slate-900 text-white flex items-center justify-center font-black text-xl tracking-tighter">
                    DCS
                  </div>
                  <div>
                    <h1 className="font-black text-base uppercase tracking-tight text-slate-900">
                      บริษัท แมนูแฟคเจอริ่ง อินดัสทรี (ประเทศไทย) จำกัด
                    </h1>
                    <p className="text-xs text-slate-600 font-medium">
                      DOCUMENT CONTROL CENTER (DCC) • ISO 9001:2015 & IATF 16949
                    </p>
                  </div>
                </div>
                <div className="text-right sm:text-right w-full sm:w-auto bg-slate-50 sm:bg-transparent p-2 sm:p-0 rounded border sm:border-0 border-slate-200">
                  <div className="text-xs font-bold text-indigo-900 font-mono">
                    แบบฟอร์ม: FM-DCC-002
                  </div>
                  <div className="text-[11px] text-slate-600">
                    วันที่พิมพ์รายงาน: {new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </div>
                </div>
              </div>

              <div className="text-center py-1">
                <h2 className="text-base font-black text-slate-900 uppercase tracking-wide">
                  ทะเบียนเอกสารควบคุม (CONTROLLED DOCUMENT MASTER LIST)
                </h2>
              </div>

              {/* Filter Criteria Summary Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-300 text-xs bg-slate-50 p-2.5 rounded border border-slate-200">
                <div>
                  <span className="text-slate-500 text-[10px] block">ประเภทเอกสาร (Doc Type):</span>
                  <strong className="text-slate-900 font-medium">{getTypeName(selectedType)}</strong>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">หน่วยงานเจ้าของ (Owner Dept):</span>
                  <strong className="text-slate-900 font-medium">{getDeptName(selectedDept)}</strong>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">สถานะเอกสาร (Status):</span>
                  <strong className="text-slate-900 font-medium">{getStatusName(selectedStatus)}</strong>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">จำนวนรายการที่พบ:</span>
                  <strong className="text-indigo-900 font-bold">{documents.length} ฉบับ</strong>
                  {searchQuery && (
                    <span className="text-[10px] text-slate-500 block truncate">คำค้น: "{searchQuery}"</span>
                  )}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="border-2 border-slate-900 overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b-2 border-slate-900 text-slate-900 font-bold uppercase text-[11px]">
                    <th className="p-2 border-r border-slate-300 text-center w-10">ลำดับ</th>
                    <th className="p-2 border-r border-slate-300 w-32">รหัสเอกสาร</th>
                    <th className="p-2 border-r border-slate-300">ชื่อเอกสาร (Document Name)</th>
                    <th className="p-2 border-r border-slate-300 text-center w-16">ประเภท</th>
                    <th className="p-2 border-r border-slate-300 text-center w-24">หน่วยงาน</th>
                    <th className="p-2 border-r border-slate-300 text-center w-16">Rev.</th>
                    <th className="p-2 border-r border-slate-300 text-center w-24">วันที่มีผล</th>
                    <th className="p-2 border-r border-slate-300 text-center w-24">ครบกำหนดทบทวน</th>
                    <th className="p-2 text-center w-20">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300">
                  {documents.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-slate-500 italic">
                        ไม่พบเอกสารตรงตามเงื่อนไขที่เลือก
                      </td>
                    </tr>
                  ) : (
                    documents.map((doc, idx) => (
                      <tr key={doc.id} className="hover:bg-slate-50/60">
                        <td className="p-2 border-r border-slate-300 text-center font-mono font-semibold text-slate-600">
                          {idx + 1}
                        </td>
                        <td className="p-2 border-r border-slate-300 font-mono font-bold text-slate-900 whitespace-nowrap">
                          {doc.docNo}
                        </td>
                        <td className="p-2 border-r border-slate-300">
                          <div className="font-semibold text-slate-900">{doc.docNameTh}</div>
                          <div className="text-[10px] text-slate-500 italic">{doc.docNameEn}</div>
                        </td>
                        <td className="p-2 border-r border-slate-300 text-center font-mono font-bold text-slate-700">
                          {doc.docType}
                        </td>
                        <td className="p-2 border-r border-slate-300 text-center font-medium text-slate-800">
                          {doc.ownerDept}
                        </td>
                        <td className="p-2 border-r border-slate-300 text-center font-mono font-bold text-indigo-900">
                          Rev.{doc.currentRevision}
                        </td>
                        <td className="p-2 border-r border-slate-300 text-center text-[11px] text-slate-700 whitespace-nowrap">
                          {doc.effectiveDate}
                        </td>
                        <td className="p-2 border-r border-slate-300 text-center text-[11px] text-slate-700 whitespace-nowrap">
                          {doc.reviewDueDate}
                        </td>
                        <td className="p-2 text-center">
                          {doc.status === 'ACTIVE' && (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              Active
                            </span>
                          )}
                          {doc.status === 'OBSOLETE' && (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                              Obsolete
                            </span>
                          )}
                          {doc.status === 'UNDER_REVISION' && (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              Revision
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Document Verification Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-200 gap-2">
              <div>
                * เอกสารควบคุมฉบับนี้พิมพ์จากระบบ DCC e-Control • ระบบบันทึกประวัติ Revision และควบคุมสถานะตาม ISO 9001:2015 ข้อ 7.5
              </div>
              <div className="font-mono text-[11px] text-slate-400">
                Page 1 of 1
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer (Hidden during print) */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between print:hidden">
          <div className="text-xs text-slate-500">
            สามารถเลือกเครื่องพิมพ์หรือเลือกบันทึกเป็น <span className="font-bold text-slate-700">Save as PDF (A4)</span> ได้จากหน้าต่างสั่งพิมพ์
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              ปิดหน้าต่าง
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Printer className="w-4 h-4" />
              สั่งพิมพ์ A4 / บันทึก PDF
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
