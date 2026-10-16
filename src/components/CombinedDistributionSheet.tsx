import React, { useEffect, useMemo, useState } from 'react';
import type { DistributionRecord } from '../types';
import { getStorageFileUrl } from '../services/dcsRepository';
import { normalizeSignatureDataUrl } from '../utils/signatureImage';
import { buildCombinedDistributionRows, isCombinedSheetComplete } from '../utils/distributionSheetGroup';
import { downloadPrintableHtml, openPrintInNewTab, printElementById } from '../utils/printHelper';
import { printSheetLayout } from '../utils/printSheetLayout';
import { COMPANY } from '../config/company';
import { NanoLogo } from './NanoLogo';

interface Props {
  records: DistributionRecord[];
  darId: string;
  onClose: () => void;
  onEdit?: (record: DistributionRecord) => void;
}
const dateText = (date?: string) => {
  if (!date) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : date;
};

export function CombinedDistributionSheet({ records, darId, onClose, onEdit }: Props) {
  const rows = useMemo(() => buildCombinedDistributionRows(records), [records]);
  const complete = isCombinedSheetComplete(records);
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
  const ready = complete && !loading && !error;
  const title = `FM-QS-003-00_${darId}_Distribution`;
  const print = () => { if (ready) printElementById('distribution-recall-sheet', title); };
  const open = () => { if (ready && !openPrintInNewTab('distribution-recall-sheet', title)) print(); };
  const download = () => { if (ready) downloadPrintableHtml('distribution-recall-sheet', title); };
  const signature = (path?: string) => path && signatures[path] ? <img src={signatures[path]} alt="ลายเซ็นที่บันทึกไว้" className="mx-auto h-7 max-w-[80px] object-contain"/> : null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-3" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="my-6 w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="print:hidden flex flex-wrap items-center justify-between gap-3 bg-slate-900 p-4 text-white">
          <div><h2 className="text-base font-bold">ใบแจกจ่ายรวมตาม DAR</h2><p className="text-sm">{darId} · รวม {records.length} รายการแจกจ่าย</p></div>
          <div className="flex flex-wrap gap-2">
            <button onClick={open} disabled={!ready} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">เปิดแท็บพิมพ์</button>
            <button onClick={download} disabled={!ready} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">ดาวน์โหลดแบบพิมพ์</button>
            <button onClick={print} disabled={!ready} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold disabled:opacity-40">พิมพ์ใบรวม A4</button>
            <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm">ปิด</button>
          </div>
        </div>
        <div className="print:hidden border-b bg-indigo-50 px-4 py-3 text-sm text-indigo-950">
          รายการแจกจ่าย DAR เดียวกันรวมอยู่ในใบนี้ ลายเซ็นแต่ละแถวอ้างอิงรายการเอกสารตามเลขที่แสดงในตาราง
          {!complete && <p className="mt-1 font-bold text-amber-800">ยังรับเอกสารไม่ครบทุกหน่วยงานในชุด DAR นี้ จึงยังพิมพ์ฉบับสมบูรณ์ไม่ได้</p>}
          {loading && <p role="status" className="mt-1">กำลังเตรียมลายเซ็นสำหรับพิมพ์…</p>}
          {error && <p role="alert" className="mt-1 text-red-700">{error} <button onClick={() => setAttempt(value => value + 1)} className="font-bold underline">ลองใหม่</button></p>}
          {onEdit && <div className="mt-2 flex flex-wrap gap-2">{records.map(record => <button key={record.id} onClick={() => onEdit(record)} className="rounded border border-indigo-300 bg-white px-2 py-1">แก้ไข {record.distributionNo}</button>)}</div>}
        </div>
        <div className="max-h-[78vh] overflow-auto bg-slate-200 p-4">
          <section id="distribution-recall-sheet" data-print-target="true" className="mx-auto w-full max-w-[794px] bg-white p-7 text-black shadow-lg" style={{fontFamily:"'IBM Plex Sans Thai', Tahoma, sans-serif",fontSize:11,lineHeight:1.3}}>
            <style>{printSheetLayout('distribution-recall-sheet') + '\n@media print { #distribution-recall-sheet .bundle-table { table-layout: fixed; font-size: 13px !important; line-height: 1.3 !important; } #distribution-recall-sheet .bundle-table img { height: 20px !important; } #distribution-recall-sheet .bundle-table td, #distribution-recall-sheet .bundle-table th { padding: 2px; overflow-wrap: anywhere; } }'}</style>
            <div className="mb-3 grid grid-cols-[90px_1fr_90px] items-center gap-2">
              <NanoLogo className="h-11 w-24"/>
              <div className="text-center"><p>{COMPANY.nameTh}</p><h1 className="text-lg font-bold">ใบแจกจ่าย - เรียกคืน เอกสาร</h1></div><div/>
            </div>
            <div className="mb-2 flex flex-wrap justify-between gap-2 border-y border-black py-2"><strong>อ้างอิง DAR: {darId}</strong><span>รวม {records.length} รายการแจกจ่าย</span></div>
            <table className="bundle-table mb-3 w-full border-collapse border border-black text-left">
              <thead><tr><th className="w-[5%] border border-black p-1">ที่</th><th className="w-[22%] border border-black p-1">เลขใบแจกจ่าย</th><th className="w-[23%] border border-black p-1">รหัสเอกสาร</th><th className="w-[28%] border border-black p-1">ชื่อเอกสาร</th><th className="w-[8%] border border-black p-1">Rev.</th><th className="w-[14%] border border-black p-1">วันที่มีผล</th></tr></thead>
              <tbody>{records.map((record, index) => <tr key={record.id}><td className="border border-black p-1 text-center">{index+1}</td><td className="border border-black p-1">{record.distributionNo}</td><td className="border border-black p-1">{record.distributionSheet?.docNo || record.docNo}</td><td className="border border-black p-1">{record.distributionSheet?.docNameTh || record.docNameTh}</td><td className="border border-black p-1 text-center">{record.distributionSheet?.receiveRevision || record.revision}{record.distributionSheet?.returnRevision && <div className="mt-1 text-[11px]">คืน {record.distributionSheet.returnRevision}</div>}</td><td className="border border-black p-1 text-center">{dateText(record.effectiveDate)}</td></tr>)}</tbody>
            </table>
            <table className="bundle-table w-full border-collapse border-2 border-black text-center">
              <thead><tr><th rowSpan={2} className="w-[5%] border border-black p-1">ที่</th><th rowSpan={2} className="w-[20%] border border-black p-1">หน่วยงานผู้รับ</th><th rowSpan={2} className="w-[9%] border border-black p-1">รายการเอกสาร</th><th rowSpan={2} className="w-[8%] border border-black p-1">จำนวนชุด</th><th colSpan={2} className="w-[29%] border border-black p-1">รับเอกสาร</th><th colSpan={2} className="w-[29%] border border-black p-1">คืนเอกสารเดิม</th></tr><tr>{['ลายเซ็น','วันที่','ลายเซ็น','วันที่'].map((label,index)=><th key={index} className="border border-black p-1">{label}</th>)}</tr></thead>
              <tbody>{rows.map((row,index)=><tr key={row.key} data-combined-row="true"><td className="border border-black p-1">{index+1}</td><td className="border border-black p-1 text-left">{row.department}</td><td className="border border-black p-1">{row.documentIndexes.join(', ')}</td><td className="border border-black p-1">{row.copies}</td><td className="border border-black p-1">{signature(row.receipt?.signatureStoragePath) || (row.receipt?.downloadedAt ? 'ไม่พบลายเซ็น' : 'รอรับเอกสาร')}</td><td className="border border-black p-1">{dateText(row.receipt?.downloadedAt)}</td><td className="border border-black p-1">{signature(row.returnSignatureStoragePath)}</td><td className="border border-black p-1">{dateText(row.returnDate)}</td></tr>)}</tbody>
            </table>
            <p className="mt-2">รายการเอกสารอ้างอิงเลขลำดับตารางด้านบน · จำนวนชุดต่อรายการเอกสาร · ลายเซ็นและวันที่แสดงตามหลักฐานที่บันทึกไว้</p>
            <div className="mt-2 flex justify-end font-bold">{COMPANY.distributionFormCode}</div>
          </section>
        </div>
      </div>
    </div>
  );
}
