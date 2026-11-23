import React, { useEffect, useRef, useState } from 'react';
import { useDcs } from '../context/DcsContext';
import { confirmDocumentReturn, syncDocumentReturnRequests } from '../services/dcsRepository';
import { isPendingDepartmentReceipt } from '../utils/distributionAccess';
import type { DocumentReturnRequest } from '../types';

export function DocumentReturnPanel({ mandatory = false }: { mandatory?: boolean }) {
  const { currentUser, distributions = [], dars = [], documentReturns: rows, returnSync, retryDistributionSync } = useDcs();
  const [consents, setConsents] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState('');
  const submitting = useRef(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const dcc = currentUser.userRole === 'DCC_ADMIN';
  useEffect(() => {
    setError(''); setConsents({}); setMessage('');
  }, [currentUser.uid, currentUser.currentDept, currentUser.userRole]);
  const candidates = dcc ? distributions.filter(item => item.status !== 'CANCELLED' && item.stampStatus === 'COMPLETED' && dars.some(dar => dar.id === item.darReferenceId && dar.requestType === 'REVISION')) : [];
  const sync = async () => {
    if (submitting.current) return;
    submitting.current = true; setBusy('sync'); setError(''); setMessage('');
    try { for (const row of candidates) await syncDocumentReturnRequests(row.id); setMessage('ตรวจรายการคืนฉบับเดิมครบแล้ว'); }
    catch (e) { setError(e instanceof Error ? e.message : 'ตรวจรายการคืนไม่สำเร็จ กรุณาลองใหม่'); }
    finally { submitting.current = false; setBusy(''); }
  };
  const pending = rows.filter(row => row.status === 'PENDING');
  const visible = rows.filter(row => !mandatory && showHistory ? row.status !== 'PENDING' : row.status === 'PENDING');
  const confirm = async (row: DocumentReturnRequest) => {
    if (!consents[row.id] || submitting.current) return;
    submitting.current = true; setBusy(row.id); setError(''); setMessage('');
    try {
      await confirmDocumentReturn(row.id);
      setMessage(`บันทึกการคืน/เลิกใช้ ${row.docNo} Rev.${row.previousRevision} สำเร็จ`);
    } catch (e) { setError(e instanceof Error ? e.message : 'ยืนยันไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setBusy(''); submitting.current = false; }
  };
  if (!rows.length && !error && !message && !candidates.length && returnSync === 'ready') return null;
  return <section aria-label="คืนเอกสารฉบับเดิม" className="rounded-2xl border border-amber-300 bg-white p-4 text-sm space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-[15px] font-bold text-amber-950">คืน/เลิกใช้เอกสารฉบับเดิม · รอยืนยัน {pending.length} รายการ</h2>
      {!mandatory && <button type="button" onClick={() => setShowHistory(value => !value)} className="rounded-lg border border-slate-300 px-3 py-2">{showHistory ? 'ดูรายการรอยืนยัน' : 'ดูประวัติการคืน'}</button>}
    </div>
    {dcc && candidates.length > 0 && <button type="button" disabled={!!busy} onClick={() => void sync()} className="rounded-lg border border-amber-500 px-3 py-2 text-amber-900 disabled:opacity-50">{busy === 'sync' ? 'กำลังตรวจรายการคืน...' : 'ตรวจรายการคืนฉบับเดิม'}</button>}
    <p className="text-slate-600">ตรวจสอบรหัสและ Rev. ก่อนยืนยัน นำฉบับเดิมออกจากจุดใช้งาน รวมถึงไฟล์ที่บันทึกในเครื่อง ระบบจะบันทึกลายเซ็นลงในใบแจกจ่าย–เรียกคืนของ DAR ฉบับใหม่</p>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-700">{error}</p>}
    {returnSync === 'error' && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-700">อ่านรายการคืนฉบับเดิมไม่สำเร็จ <button type="button" onClick={retryDistributionSync} className="font-bold underline">ลองเชื่อมต่ออีกครั้ง</button></p>}
    {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-800">{message}</p>}
    {!visible.length && <p className="text-slate-500">ไม่มีรายการในหมวดนี้</p>}
    {visible.map(row => { const distribution = distributions.find(item => item.id === row.distributionId); const mustDownloadFirst = Boolean(!dcc && distribution && isPendingDepartmentReceipt(distribution, currentUser.currentDept)); return <article key={row.id} className="rounded-xl border border-slate-200 p-3 space-y-2">
      <div className="flex flex-wrap justify-between gap-2"><strong>{row.sourceDocuments?.length ? `เอกสารฉบับใหม่ ${row.docNo} · Rev.${row.newRevision}` : `${row.docNo} · Rev.${row.previousRevision} → Rev.${row.newRevision}`}</strong><span>{row.dept} · {row.darId}</span></div>
      <p>{row.docNameTh}</p>
      {!!row.sourceDocuments?.length && <div className="rounded-lg bg-amber-50 p-2"><strong>เอกสารเดิมที่ต้องคืน/เลิกใช้</strong><ul className="list-disc pl-5">{row.sourceDocuments.map(item => <li key={`${item.docNo}-${item.revision}`}>{item.docNo} · Rev.{item.revision}</li>)}</ul></div>}
      {row.status === 'CONFIRMED' ? <p className="text-emerald-800">ยืนยันแล้วโดย {row.signerName} · {new Date(row.confirmedAt!).toLocaleString('th-TH')}</p>
        : row.status === 'CANCELLED' ? <p className="text-slate-500">ยกเลิกรายการแล้ว</p>
        : dcc ? <p className="text-amber-800">รอแผนกยืนยันคืน/เลิกใช้ฉบับเดิม</p>
        : <>
          <p>ผู้ยืนยัน: {currentUser.userName} · ใช้ลายเซ็นที่ลงทะเบียนในบัญชีนี้</p>
          {mustDownloadFirst && <p className="rounded-lg bg-amber-50 p-2 font-semibold text-amber-900">กรุณารับและดาวน์โหลดเอกสารฉบับใหม่ให้ครบก่อน แล้วจึงยืนยันคืนฉบับเดิม</p>}
          <label className="flex items-start gap-2"><input type="checkbox" checked={!!consents[row.id]} disabled={!!busy || mustDownloadFirst} onChange={event => setConsents(values => ({ ...values, [row.id]: event.target.checked }))} className="mt-1"/><span>ข้าพเจ้ายืนยันว่าได้คืน/เลิกใช้เอกสารฉบับเดิมตามรายการข้างต้น และนำสำเนาฉบับเดิมออกจากจุดใช้งานแล้ว ยินยอมใช้ลายเซ็นที่ลงทะเบียนเป็นหลักฐาน</span></label>
          <button type="button" disabled={!consents[row.id] || !!busy || mustDownloadFirst} onClick={() => void confirm(row)} className="rounded-lg bg-amber-700 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy === row.id ? 'กำลังบันทึกลายเซ็นคืน...' : 'ยืนยันคืน/เลิกใช้ฉบับเดิม'}</button>
        </>}
    </article>})}
  </section>;
}
