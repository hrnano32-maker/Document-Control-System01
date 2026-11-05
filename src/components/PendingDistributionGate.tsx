import React, { useEffect, useRef } from 'react';
import { AlertTriangle, Clock, Download, FileText, LoaderCircle, LogOut, RefreshCw, Send } from 'lucide-react';
import { useDcs } from '../context/DcsContext';
import { useDistributionClock } from '../hooks/useDistributionClock';
import { getDepartmentReceipt, getDistributionDownloadAccess, isPendingDepartmentReceipt } from '../utils/distributionAccess';
import { canonicalDistributionDepartment } from '../utils/distributionReopen';

// Keep this gate above every normal view. The two action dialogs are rendered
// separately above it, so closing an action returns to the unresolved list.
export const PendingDistributionGate: React.FC = () => {
  const { currentUser, distributions, reRequests, distributionSync, retryDistributionSync, logout,
    selectedDistributionForDownload, selectedDistributionForReRequest,
    setSelectedDistributionForDownload, setSelectedDistributionForReRequest, isChangePasswordOpen } = useDcs();
  const now = useDistributionClock();
  const title = useRef<HTMLHeadingElement>(null);
  const pending = distributions.filter(row => isPendingDepartmentReceipt(row, currentUser.currentDept));
  const show = currentUser.userRole !== 'DCC_ADMIN' && !currentUser.mustChangePassword && !isChangePasswordOpen
    && (distributionSync !== 'ready' || pending.length > 0);
  const actionOpen = Boolean(selectedDistributionForDownload || selectedDistributionForReRequest);
  useEffect(() => { if (show && !actionOpen) title.current?.focus(); }, [show, actionOpen]);
  if (!show) return null;

  return (
    <section role="dialog" aria-modal="true" aria-labelledby="pending-distribution-title" aria-hidden={actionOpen || undefined} inert={actionOpen || undefined}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-3 sm:p-5">
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="bg-gradient-to-r from-indigo-950 to-slate-900 px-5 py-4 text-white sm:px-6">
          <h2 ref={title} tabIndex={-1} id="pending-distribution-title" className="flex items-center gap-2 text-lg font-bold outline-none">
            <FileText className="h-5 w-5" /> เอกสารค้างรับของหน่วยงาน {currentUser.currentDept}
          </h2>
          <p className="mt-1 text-sm text-slate-200">กรุณาลงนามและบันทึกไฟล์ให้ครบทุกชุดก่อนใช้งานหน้าปกติ</p>
        </header>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4 sm:p-6">
          {distributionSync !== 'ready' ? (
            <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
              <p className="flex items-center gap-2 font-bold">{distributionSync === 'loading' ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <AlertTriangle className="h-5 w-5" />}
                {distributionSync === 'loading' ? 'กำลังตรวจสอบรายการค้างรับจากระบบ' : 'ตรวจสอบรายการค้างรับไม่สำเร็จ'}</p>
              <p className="mt-2">กรุณาตรวจสอบอินเทอร์เน็ต แล้วลองเชื่อมต่ออีกครั้ง หรือติดต่อ DCC หากยังไม่สามารถใช้งานได้</p>
              {distributionSync === 'error' && <button type="button" onClick={retryDistributionSync} className="mt-3 flex items-center gap-2 rounded-lg bg-amber-700 px-4 py-2 font-bold text-white"><RefreshCw className="h-4 w-4" />ลองเชื่อมต่ออีกครั้ง</button>}
            </div>
          ) : <>
            <p className="text-sm font-bold text-slate-700">ค้างดำเนินการ {pending.length} ชุด</p>
            {pending.map(distribution => {
              const dept = currentUser.currentDept;
              const receipt = getDepartmentReceipt(distribution, dept);
              const fileCount = distribution.departmentFileLists?.[dept]?.length || (distribution.departmentFiles?.[dept] ? 1 : 0);
              const otherSigner = receipt?.transferStatus === 'PENDING' && receipt.downloaderUid && receipt.downloaderUid !== currentUser.uid;
              const access = getDistributionDownloadAccess(distribution, dept, now);
              const pendingRequest = reRequests.find(request => request.distributionId === distribution.id
                && canonicalDistributionDepartment(request.dept) === canonicalDistributionDepartment(dept)
                && (request.status === 'PENDING' || request.status === 'PROCESSING'));
              const canAct = access.canDownload && !otherSigner;
              const canRequest = !canAct && (access.canRequest || Boolean(otherSigner));
              const reasonType = access.state === 'EXPIRED' ? 'EXPIRED_DOWNLOAD_WINDOW' : 'FILE_LOST_OR_DAMAGED';
              return <article key={distribution.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm"><strong className="break-all text-indigo-800">{distribution.docNo}</strong><span className="rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">Rev.{distribution.revision}</span><span className="text-xs text-slate-500">{distribution.distributionNo}</span></div>
                    <p className="break-words text-sm font-semibold text-slate-900">{distribution.docNameTh}</p>
                    <p className={`flex items-start gap-1 text-sm ${canAct ? 'text-indigo-700' : 'text-amber-800'}`}><Clock className="mt-0.5 h-4 w-4 shrink-0" />
                      {otherSigner ? 'มีผู้ลงนามแล้วแต่ดาวน์โหลดไม่ครบ ให้ผู้ลงนามเข้าสู่ระบบต่อ หรือร้องขอ DCC เปิดสิทธิ์ใหม่' : receipt?.transferStatus === 'PENDING' && canAct ? `ลงนามแล้ว ยังบันทึกไฟล์ไม่ครบ กรุณาดาวน์โหลดต่อ${fileCount ? ` (${receipt.transferredIndexes?.length || 0}/${fileCount} ไฟล์)` : ''}` : access.message}
                    </p>
                  </div>
                  {canAct ? <button type="button" onClick={() => setSelectedDistributionForDownload({ distribution, dept })} className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"><Download className="h-4 w-4" />{receipt?.transferStatus === 'PENDING' ? 'ดาวน์โหลดต่อ' : 'ลงนามและดาวน์โหลด'}</button>
                    : pendingRequest ? <span className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">ส่งคำร้องแล้ว · รอ DCC</span>
                    : canRequest ? <button type="button" onClick={() => setSelectedDistributionForReRequest({ distribution, dept, reasonType, reasonDetails: `ขอเปิดสิทธิ์รับเอกสาร ${distribution.distributionNo} อีกครั้ง เนื่องจากยังดาวน์โหลดไม่ครบ` })} className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-amber-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-800"><Send className="h-4 w-4" />ร้องขอ DCC เปิดสิทธิ์ใหม่</button>
                    : <span className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">กำลังเตรียมไฟล์ กรุณารอหรือติดต่อ DCC</span>}
                </div>
              </article>;
            })}
            <p className="text-sm text-slate-600">รายการหมดอายุจะยังค้างอยู่ระหว่างรอ DCC อนุมัติ เมื่อเปิดสิทธิ์แล้วให้กลับมาลงนามและดาวน์โหลด หากเอกสารถูกแทนที่แล้ว กรุณาให้ DCC ตรวจสอบหรือยกเลิกรายการที่ไม่ต้องรับ</p>
          </>}
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4 text-sm">
          <p className="text-slate-600">หากไฟล์หรือลายเซ็นมีปัญหา กรุณาติดต่อ DCC</p>
          <button type="button" onClick={logout} className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100"><LogOut className="h-4 w-4" />ออกจากระบบ</button>
        </footer>
      </div>
    </section>
  );
};
