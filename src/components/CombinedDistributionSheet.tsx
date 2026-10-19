import React, { useEffect, useMemo, useState } from 'react';
import type { DistributionRecord, DarRecord } from '../types';
import { getStorageFileUrl } from '../services/dcsRepository';
import { normalizeSignatureDataUrl } from '../utils/signatureImage';
import { buildCombinedDistributionRows } from '../utils/distributionSheetGroup';
import { downloadPrintableHtml, openPrintInNewTab, printElementById } from '../utils/printHelper';
import { printSheetLayout } from '../utils/printSheetLayout';
import { COMPANY } from '../config/company';
import { NanoLogo } from './NanoLogo';

interface Props {
  records: DistributionRecord[];
  darId: string;
  dar?: DarRecord;
  onClose: () => void;
  onEdit?: (record: DistributionRecord) => void;
}
const dateText = (date?: string) => {
  if (!date) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : date;
};

export function CombinedDistributionSheet({ records, darId, dar, onClose, onEdit }: Props) {
  const rows = useMemo(() => buildCombinedDistributionRows(records), [records]);
  // Preserve the original form with only the first signed receipt per department.
  const departments = useMemo(() => {
    const grouped = new Map<string, typeof rows>();
    rows.forEach(row => grouped.set(row.department, [...(grouped.get(row.department) || []), row]));
    return [...grouped.entries()];
  }, [rows]);
  const primary = records[0];
  const docNo = primary?.distributionSheet?.docNo || dar?.docNo || primary?.docNo || '';
  const docName = primary?.distributionSheet?.docNameTh || dar?.docNameTh || primary?.docNameTh || '';
  const receiveRev = primary?.distributionSheet?.receiveRevision || primary?.revision || dar?.proposedRevision || '00';
  const returnRev = primary?.distributionSheet?.returnRevision || (dar?.requestType === 'NEW' ? '-' : dar?.currentRevision) || '-';
  const [signatures, setSignatures] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const paths = useMemo(() => [...new Set(rows.flatMap(row => [row.receipt?.signatureStoragePath, row.returnSignatureStoragePath]).filter((value): value is string => Boolean(value)))], [rows]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(''); setSignatures({});
    void Promise.all(paths.map(async path => {
      const url = await getStorageFileUrl(path);
      // Normalize to an embedded image so printing waits for the actual signature.
      try { return [path, await normalizeSignatureDataUrl(url)] as const; }
      catch {
        const image = new Image();
        image.src = url;
        await image.decode();
        return [path, url] as const;
      }
    })).then(entries => { if (!cancelled) setSignatures(Object.fromEntries(entries)); })
      .catch(() => { if (!cancelled) setError('โหลดลายเซ็นบางรายการไม่สำเร็จ กรุณาลองใหม่ก่อนพิมพ์'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [paths, attempt]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [onClose]);
  const ready = rows.length > 0 && !loading && !error && paths.every(path => Boolean(signatures[path]));
  const title = `FM-QS-003-00_${darId}_Distribution`;
  const print = () => { if (ready) printElementById('distribution-recall-sheet', title); };
  const open = () => { if (ready && !openPrintInNewTab('distribution-recall-sheet', title)) print(); };
  const download = () => { if (ready) downloadPrintableHtml('distribution-recall-sheet', title); };
  const signature = (path?: string) => path && signatures[path] ? <img src={signatures[path]} alt="ลายเซ็นที่บันทึกไว้" className="mx-auto h-7 max-w-[80px] object-contain"/> : null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-3" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="my-6 w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="print:hidden flex flex-wrap items-center justify-between gap-3 bg-slate-900 p-4 text-white">
          <div><h2 className="text-base font-bold">ใบแจกจ่าย - เรียกคืน เอกสาร</h2><p className="text-sm">อ้างอิง DAR: {darId}</p></div>
          <div className="flex flex-wrap gap-2">
            <button onClick={open} disabled={!ready} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">เปิดแท็บพิมพ์</button>
            <button onClick={download} disabled={!ready} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">ดาวน์โหลดแบบพิมพ์</button>
            <button onClick={print} disabled={!ready} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold disabled:opacity-40">พิมพ์ A4</button>
            <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm">ปิด</button>
          </div>
        </div>
        <div className="print:hidden border-b bg-indigo-50 px-4 py-3 text-sm text-indigo-950">
          แสดงเฉพาะหน่วยงานที่เซ็นรับแล้ว {departments.length} หน่วยงาน · ใช้หลักฐานการรับครั้งแรกของแต่ละหน่วยงานใน DAR นี้
          {rows.length === 0 && <p className="mt-1 font-bold text-amber-800">ยังไม่มีรายการเซ็นรับเอกสารสำหรับ DAR นี้</p>}
          {loading && <p role="status" className="mt-1">กำลังเตรียมลายเซ็นสำหรับพิมพ์…</p>}
          {error && <p role="alert" className="mt-1 text-red-700">{error} <button onClick={() => setAttempt(value => value + 1)} className="font-bold underline">ลองใหม่</button></p>}
          {onEdit && <div className="mt-2 flex flex-wrap gap-2">{records.map(record => <button key={record.id} onClick={() => onEdit(record)} className="rounded border border-indigo-300 bg-white px-2 py-1">แก้ไขข้อมูล {record.docNo}</button>)}</div>}
        </div>
        <div className="p-4 sm:p-6 max-h-[75vh] overflow-y-auto bg-slate-300 flex justify-center print:p-0 print:m-0 print:max-h-none print:overflow-visible print:bg-white">
          <div id="distribution-recall-sheet" data-print-target="true" className="bg-white text-black p-8 sm:p-10 rounded-lg shadow-xl border border-slate-300 w-full max-w-[900px] print:shadow-none print:border-0 print:p-6 print:rounded-none print:w-full font-sans" style={{fontFamily:"'IBM Plex Sans Thai', 'Prompt', 'Sarabun', Tahoma, sans-serif"}}>
            <style>{printSheetLayout('distribution-recall-sheet') + `
              #distribution-recall-sheet .font-mono { font-family: inherit; }
              @media print {
                #distribution-recall-sheet .distribution-form-table { table-layout: fixed; font-size: 13px !important; line-height: 1.3 !important; }
                #distribution-recall-sheet .distribution-form-table td, #distribution-recall-sheet .distribution-form-table th { padding: 2px; overflow-wrap: anywhere; }
                #distribution-recall-sheet .receipt-evidence { height: 22px !important; min-height: 22px !important; }
                #distribution-recall-sheet .receipt-evidence img { height: 20px !important; }
              }
            `}</style>
            <div className="mb-5 grid grid-cols-[100px_1fr_100px] items-center gap-2 min-h-[48px]">
              <div className="flex items-center justify-start"><NanoLogo className="h-11 w-24"/></div>
              <div className="text-center px-1">
                <p className="text-[11px] font-semibold">{COMPANY.nameTh}</p>
                <p className="text-[11px] tracking-wide">{COMPANY.nameEn}</p>
                <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-black tracking-tight whitespace-nowrap">ใบแจกจ่าย - เรียกคืน เอกสาร</h1>
              </div>
              <div className="text-right text-[11px] font-mono text-slate-500 hidden sm:block">FM-QS-003</div>
            </div>
            <div className="mb-3 p-2.5 bg-slate-50 border border-black text-xs flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-slate-600 font-medium">รหัสเอกสาร: </span><span className="font-mono text-black font-bold text-sm">{docNo}</span>
                <span className="mx-2 text-slate-400">|</span>
                <span className="text-slate-600 font-medium">ชื่อเอกสาร: </span><span className="text-black font-semibold">{docName}</span>
              </div>
              <div className="flex items-center gap-3 font-mono text-xs flex-wrap">
                <span>ฉบับที่: <strong>Rev.{receiveRev}</strong></span>
                <span>วันที่มีผล: <strong>{dateText(primary?.effectiveDate)}</strong></span>
                <span className="text-slate-700">อ้างอิง DAR: <strong>{darId}</strong></span>
              </div>
            </div>
            <div className="mb-3">
              <table className="distribution-form-table w-full border-collapse border-2 border-black text-center text-xs">
                <thead>
                  <tr className="border-b border-black bg-white font-bold text-[13px]">
                    <th rowSpan={2} className="border-r border-black p-2 w-[7%] align-middle">ลำดับที่</th>
                    <th rowSpan={2} className="border-r border-black p-2 w-[26%] align-middle text-center">หน่วยงาน<br/>ผู้รับเอกสาร</th>
                    <th rowSpan={2} className="border-r border-black p-2 w-[9%] align-middle text-center">จำนวน<br/>สำเนา</th>
                    <th colSpan={2} className="border-r border-black p-1.5 text-center bg-slate-50/50">รับ <span className="font-bold text-[12px] font-mono">(Rev.{receiveRev})</span></th>
                    <th colSpan={2} className="p-1.5 text-center bg-slate-50/50">คืน <span className="font-bold text-[12px] font-mono">(Rev.{returnRev})</span></th>
                  </tr>
                  <tr className="border-b-2 border-black bg-white font-bold text-[12px]">
                    <th className="border-r border-black p-1.5 w-[15%]">ลายเซ็นต์</th><th className="border-r border-black p-1.5 w-[14%]">วันที่</th>
                    <th className="border-r border-black p-1.5 w-[15%]">ลายเซ็นต์</th><th className="p-1.5 w-[14%]">วันที่</th>
                  </tr>
                </thead>
                <tbody>{departments.map(([department, evidence], index) => <tr key={department} data-combined-row="true" className="border-b border-dotted border-black min-h-[34px]">
                  <td className="border-r border-black p-1 text-center font-medium text-[12px] align-middle">{index + 1}</td>
                  <td className="border-r border-black p-1 text-left align-middle"><span className="px-1 text-[12px] font-medium text-black">{department}</span></td>
                  <td className="border-r border-black p-1 text-center align-middle">{evidence.map(row => <div key={row.key} className="receipt-evidence flex min-h-[28px] items-center justify-center text-[12px] font-mono font-bold">{row.copies}</div>)}</td>
                  <td className="border-r border-black p-1 text-center align-middle">{evidence.map(row => <div key={row.key} data-receipt-signature="true" className="receipt-evidence flex min-h-[28px] items-center justify-center">{signature(row.receipt?.signatureStoragePath) || <span className="text-[11px] text-slate-400">{loading ? 'กำลังโหลดลายเซ็น…' : 'โหลดลายเซ็นไม่สำเร็จ'}</span>}</div>)}</td>
                  <td className="border-r border-black p-1 text-center align-middle">{evidence.map(row => <div key={row.key} data-receipt-date="true" className="receipt-evidence flex min-h-[28px] items-center justify-center text-[11px] font-mono">{dateText(row.receipt?.downloadedAt)}</div>)}</td>
                  <td className="border-r border-black p-1 text-center align-middle">{evidence.map(row => <div key={row.key} className="receipt-evidence flex min-h-[28px] items-center justify-center">{signature(row.returnSignatureStoragePath)}</div>)}</td>
                  <td className="p-1 text-center align-middle">{evidence.map(row => <div key={row.key} className="receipt-evidence flex min-h-[28px] items-center justify-center text-[11px] font-mono">{dateText(row.returnDate)}</div>)}</td>
                </tr>)}</tbody>
              </table>
            </div>
            <div className="flex justify-between items-center text-[11px] font-mono text-black font-semibold pt-1">
              <span className="text-slate-500 font-normal">* แสดงเฉพาะหน่วยงานที่เซ็นรับแล้ว ตามใบ DAR ({darId})</span>
              <span>{COMPANY.distributionFormCode}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

