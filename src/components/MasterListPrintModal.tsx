import React from 'react';
import { Download, ExternalLink, FileSpreadsheet, Printer, X } from 'lucide-react';
import { COMPANY } from '../config/company';
import { DEPARTMENTS, DOCUMENT_TYPES, MasterDocument } from '../types';
import { downloadPrintableHtml, openPrintInNewTab, printElementById } from '../utils/printHelper';
import { NanoLogo } from './NanoLogo';

interface MasterListPrintModalProps {
  documents: MasterDocument[];
  selectedType: string;
  selectedDept: string;
  selectedStatus: string;
  searchQuery: string;
  onClose: () => void;
}

const formatDate = (value?: string) => {
  if (!value) return '';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
};

export const MasterListPrintModal: React.FC<MasterListPrintModalProps> = ({ documents, selectedType, selectedDept, selectedStatus, searchQuery, onClose }) => {
  const reportTitle = `FM-QS-002-00_Master_List_${new Date().toISOString().slice(0, 10)}`;
  const selectedDepartment = DEPARTMENTS.find(item => item.id === selectedDept);
  const typeCodes = ['QM', 'QP', 'WI', 'FM', 'EX'] as const;
  const handlePrint = () => printElementById('masterlist-printable-sheet', reportTitle);
  const handleOpenTab = () => openPrintInNewTab('masterlist-printable-sheet', reportTitle);
  const handleDownload = () => downloadPrintableHtml('masterlist-printable-sheet', reportTitle);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-2 sm:p-4" onClick={event => event.target === event.currentTarget && onClose()}>
      <div className="my-6 w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl">
        <div className="print:hidden flex flex-col gap-3 border-b border-slate-800 bg-slate-900 p-4 text-white sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 text-indigo-400" />
            <div><h3 className="text-sm font-bold">ตัวอย่างทะเบียนรายชื่อเอกสาร (Master List)</h3><p className="text-[11px] text-slate-300">อ้างอิงแบบฟอร์มจริง {COMPANY.masterListFormCode} • {documents.length} รายการ</p></div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={handleOpenTab} className="flex items-center gap-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-semibold"><ExternalLink className="h-3.5 w-3.5" />เปิดแท็บพิมพ์</button>
            <button type="button" onClick={handleDownload} className="flex items-center gap-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-semibold"><Download className="h-3.5 w-3.5" />ดาวน์โหลดแบบพิมพ์</button>
            <button type="button" onClick={handlePrint} className="flex items-center gap-1 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold"><Printer className="h-4 w-4" />พิมพ์ A4</button>
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-300 hover:bg-slate-700"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="max-h-[80vh] overflow-auto bg-slate-200 p-4 sm:p-6">
          <section id="masterlist-printable-sheet" data-print-target="true" className="mx-auto min-h-[1122px] w-full max-w-[794px] bg-white px-8 py-7 text-black shadow-xl print:min-h-0 print:max-w-none print:px-0 print:py-0 print:shadow-none" style={{ fontFamily: "'Sarabun', 'IBM Plex Sans Thai', Tahoma, sans-serif" }}>
            <header className="mb-3 grid grid-cols-[120px_1fr_120px] items-center">
              <NanoLogo className="h-12 w-28" />
              <div className="text-center"><p className="text-[10px] font-semibold">{COMPANY.nameTh}</p><p className="text-[9px] tracking-wide">{COMPANY.nameEn}</p><h1 className="mt-1 text-xl font-bold">ทะเบียนรายชื่อเอกสาร (Master List)</h1></div><div />
            </header>
            <div className="mb-2 grid grid-cols-[1fr_3fr] gap-x-4 border-y border-black py-2 text-[11px]">
              <div><strong>ฝ่าย / แผนก:</strong> {selectedDepartment ? selectedDepartment.nameTh : 'ทุกฝ่าย / ทุกแผนก'}</div>
              <div className="flex flex-wrap justify-end gap-x-4 gap-y-1"><strong>ประเภทเอกสาร:</strong>{typeCodes.map(code => <span key={code}>{selectedType === code ? '☑' : '☐'} {code === 'EX' ? 'เอกสารภายนอก' : DOCUMENT_TYPES.find(item => item.code === code)?.labelTh.split(' (')[0]}</span>)}</div>
            </div>
            {(selectedStatus !== 'ALL' || searchQuery) && <div className="mb-2 text-[9px] text-slate-600">เงื่อนไขรายงาน: สถานะ {selectedStatus}{searchQuery ? ` • คำค้น “${searchQuery}”` : ''}</div>}
            <table className="w-full table-fixed border-collapse border-2 border-black text-[9px]">
              <thead className="[display:table-header-group]"><tr><th rowSpan={2} className="w-8 border border-black p-1">ลำดับที่</th><th rowSpan={2} className="w-24 border border-black p-1">รหัสเอกสาร</th><th rowSpan={2} className="w-48 border border-black p-1">ชื่อเอกสาร</th>{[1,2,3,4,5].map(no => <th key={no} className="border border-black p-1">Rev. {String(no).padStart(2,'0')}</th>)}</tr><tr>{[1,2,3,4,5].map(no => <th key={no} className="border border-black p-1 text-[8px]">วันที่บังคับใช้</th>)}</tr></thead>
              <tbody>
                {documents.length ? documents.map((document,index) => {
                  const history=[...(document.revisionHistory||[])].sort((a,b)=>Number(a.rev)-Number(b.rev));
                  return <React.Fragment key={document.id}>
                    <tr className="break-inside-avoid"><td className="border border-black p-1 text-center">{index+1}</td><td className="border border-black p-1 font-mono font-semibold">{document.docNo}</td><td className="border border-black p-1"><strong>{document.docNameTh}</strong>{document.docNameEn?<div className="text-[7px]">{document.docNameEn}</div>:null}</td>{[0,1,2,3,4].map(slot=><td key={slot} className="border border-black p-1 text-center"><strong>{history[slot]?`Rev.${history[slot].rev}`:''}</strong><div>{formatDate(history[slot]?.effectiveDate)}</div></td>)}</tr>
                    {history.length>5&&<tr className="break-inside-avoid bg-slate-50"><td className="border border-black p-1 text-center">ต่อ</td><td className="border border-black p-1 font-mono">{document.docNo}</td><td className="border border-black p-1">ประวัติ Revision ต่อเนื่อง</td>{[5,6,7,8,9].map(slot=><td key={slot} className="border border-black p-1 text-center"><strong>{history[slot]?`Rev.${history[slot].rev}`:''}</strong><div>{formatDate(history[slot]?.effectiveDate)}</div></td>)}</tr>}
                  </React.Fragment>;
                }):<tr><td colSpan={8} className="h-16 border border-black text-center">ไม่พบรายการเอกสาร</td></tr>}
              </tbody>
            </table>
            <footer className="mt-2 flex items-end justify-between text-[9px]"><span>พิมพ์จากระบบ DCC e-Control วันที่ {new Date().toLocaleDateString('th-TH')}</span><strong>{COMPANY.masterListFormCode}</strong></footer>
          </section>
        </div>
      </div>
    </div>
  );
};
