import React, { useEffect, useRef, useState } from 'react';
import { Calendar, X } from 'lucide-react';
import type { CurrentUserSession, MasterDocument } from '../types';
import { correctMasterRevisionDates } from '../services/masterDateRepository';
import { getMasterRevisionHistory, revisionKey } from '../utils/masterRevisions';

interface Props {
  document: MasterDocument;
  user: CurrentUserSession;
  onClose: () => void;
  onSaved: (document: MasterDocument) => void;
}

export function MasterRevisionDatesModal({ document, user, onClose, onSaved }: Props) {
  const history = getMasterRevisionHistory(document);
  const [dates, setDates] = useState<Record<string, string>>(() => Object.fromEntries(history.map(row => [row.rev, row.effectiveDate])));
  const [reviewDueDate, setReviewDueDate] = useState(document.reviewDueDate || '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !inFlight.current) onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true); setError('');
    try {
      const updated = await correctMasterRevisionDates(user, document, dates, reviewDueDate, reason);
      onSaved(updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'บันทึกวันที่ไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      inFlight.current = false; setSaving(false);
    }
  };

  if (user.userRole !== 'DCC_ADMIN') return null;
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-3" onClick={event => {
    if (event.target === event.currentTarget && !inFlight.current) onClose();
  }}>
    <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="master-dates-title" className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex items-center justify-between gap-3 bg-slate-900 p-5 text-white">
        <div><h2 id="master-dates-title" className="flex items-center gap-2 text-lg font-bold"><Calendar className="h-5 w-5" />แก้ไขวันที่ Master List</h2><p className="mt-1 text-sm">{document.docNo} • {document.docNameTh}</p></div>
        <button type="button" aria-label="ปิดหน้าต่างแก้ไขวันที่" disabled={saving} onClick={onClose} className="rounded-lg p-2 disabled:opacity-40"><X className="h-5 w-5" /></button>
      </header>
      <div className="overflow-y-auto p-5 text-sm">
        <p className="mb-4 text-slate-600">แก้ไขวันที่มีผลบังคับใช้ตาม Revision และวันครบกำหนดทบทวน พร้อมระบุเหตุผลเพื่อเก็บประวัติ</p>
        <fieldset disabled={saving} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {history.map(row => <label key={row.rev} className="block font-semibold text-slate-800">
              วันที่มีผล Rev.{row.rev}{row.rev === revisionKey(document.currentRevision) ? ' (ฉบับปัจจุบัน)' : ''}
              <input type="date" aria-label={`วันที่มีผล Rev.${row.rev}`} value={dates[row.rev] || ''} onChange={event => setDates(values => ({ ...values, [row.rev]: event.target.value }))} className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
            </label>)}
            <label className="block font-semibold text-slate-800">วันครบกำหนดทบทวน
              <input type="date" aria-label="วันครบกำหนดทบทวน" value={reviewDueDate} onChange={event => setReviewDueDate(event.target.value)} className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
            </label>
          </div>
          <label className="block font-semibold text-slate-800">เหตุผลการแก้ไข <span className="text-red-600">*</span>
            <textarea required value={reason} onChange={event => setReason(event.target.value)} rows={3} placeholder="ระบุเหตุผลการแก้ไขวันที่" className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
          </label>
        </fieldset>
        {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{error}</p>}
      </div>
      <footer className="flex justify-end gap-3 border-t border-slate-200 p-4 text-sm">
        <button type="button" disabled={saving} onClick={onClose} className="rounded-lg bg-slate-100 px-4 py-2.5 font-semibold disabled:opacity-40">ยกเลิก</button>
        <button type="submit" disabled={saving} aria-busy={saving} className="rounded-lg bg-indigo-600 px-5 py-2.5 font-bold text-white disabled:opacity-50">{saving ? 'กำลังบันทึกวันที่...' : 'บันทึกวันที่'}</button>
      </footer>
    </form>
  </div>;
}
