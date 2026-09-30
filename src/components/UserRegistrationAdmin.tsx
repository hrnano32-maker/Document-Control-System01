import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { Check, Copy, Eye, KeyRound, ShieldCheck, Upload, UserCheck, UserX, X } from 'lucide-react';
import { db, firebaseFunctions, storage } from '../lib/firebase';
import { normalizeSignatureDataUrl } from '../utils/signatureImage';

type Registration = {
  id: string; registrationNo: string; department: string; username: string; displayName: string; empId: string; position: string;
  email?: string; phone?: string; recipientType: 'PRIMARY' | 'BACKUP'; signaturePath: string; permanentSignaturePath?: string; authUid?: string; status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'UPLOAD_FAILED'; createdAt: string; reviewNote?: string;
};

export const UserRegistrationAdmin: React.FC = () => {
  const [rows, setRows] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState('');
  const [signatureUrl, setSignatureUrl] = useState('');
  const [credentials, setCredentials] = useState<{ username: string; password: string; displayName: string; department: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => onSnapshot(collection(db, 'dcs_user_registrations'), snap => {
    setRows(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Registration)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    setLoading(false);
  }, caught => { setError(caught.message); setLoading(false); }), []);
  const pending = useMemo(() => rows.filter(row => row.status === 'PENDING'), [rows]);
  const approved = useMemo(() => rows.filter(row => row.status === 'APPROVED'), [rows]);

  const viewSignature = async (row: Registration) => {
    setError('');
    const path = row.status === 'APPROVED' ? (row.permanentSignaturePath || row.signaturePath) : row.signaturePath;
    if (!path) return setError('บัญชีนี้ยังไม่มีลายเซ็น กรุณากด “เพิ่มลายเซ็น”');
    try { setSignatureUrl(await getDownloadURL(ref(storage, path))); }
    catch (caught) {
      const code = typeof caught === 'object' && caught && 'code' in caught ? String(caught.code) : '';
      setError(code.includes('unauthorized')
        ? 'บัญชีนี้ไม่มีสิทธิ์เปิดลายเซ็น กรุณาออกจากระบบแล้วเข้าสู่ระบบ DCC ใหม่'
        : 'ไม่สามารถเปิดไฟล์ลายเซ็นได้ กรุณาตรวจสอบว่าไฟล์ยังอยู่ใน Firebase Storage');
    }
  };
  const updateUserSignature = async (row: Registration, file?: File) => {
    if (!file) return;
    setError('');
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 2 * 1024 * 1024) return setError('ลายเซ็นต้องเป็นไฟล์ PNG หรือ JPG ขนาดไม่เกิน 2 MB');
    setWorkingId(row.id);
    try {
      const source = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('อ่านไฟล์ลายเซ็นไม่สำเร็จ'));
        reader.readAsDataURL(file);
      });
      const normalized = await normalizeSignatureDataUrl(source);
      const call = httpsCallable<{ registrationId: string; signatureDataUrl: string }, { signaturePath: string }>(firebaseFunctions, 'adminUpdateUserSignature', { timeout: 60000 });
      await call({ registrationId: row.id, signatureDataUrl: normalized });
      setSignatureUrl(normalized);
    } catch (caught) { setError(caught instanceof Error ? caught.message.replace(/^Firebase:\s*/i, '') : 'บันทึกลายเซ็นไม่สำเร็จ'); }
    finally { setWorkingId(''); }
  };
  const review = async (row: Registration, action: 'APPROVE' | 'REJECT') => {
    const note = action === 'REJECT' ? window.prompt('ระบุเหตุผลที่ปฏิเสธคำขอ') : window.prompt('หมายเหตุการอนุมัติ (เว้นว่างได้)', 'ตรวจสอบข้อมูลและลายเซ็นแล้ว');
    if (note === null) return;
    if (action === 'REJECT' && !note.trim()) return setError('กรุณาระบุเหตุผลที่ปฏิเสธ');
    setWorkingId(row.id); setError('');
    try {
      const call = httpsCallable<{ registrationId: string; action: string; reviewNote: string }, any>(firebaseFunctions, 'reviewDepartmentRegistration');
      const result = await call({ registrationId: row.id, action, reviewNote: note });
      if (action === 'APPROVE') setCredentials({ username: result.data.username, password: result.data.temporaryPassword, displayName: result.data.displayName, department: result.data.department });
    } catch (caught) { setError(caught instanceof Error ? caught.message.replace(/^Firebase:\s*/i, '') : 'ดำเนินการไม่สำเร็จ'); }
    finally { setWorkingId(''); }
  };
  const resetPassword = async (row: Registration) => {
    if (!window.confirm(`ออกรหัสผ่านชั่วคราวใหม่ให้ ${row.displayName} (${row.department}) ใช่หรือไม่?\n\nรหัสผ่านเดิมจะใช้ไม่ได้ทันที`)) return;
    setWorkingId(row.id); setError('');
    try {
      const call = httpsCallable<{ registrationId: string }, any>(firebaseFunctions, 'resetDepartmentTemporaryPassword');
      const result = await call({ registrationId: row.id });
      setCredentials({ username: result.data.username, password: result.data.temporaryPassword, displayName: result.data.displayName, department: result.data.department });
    } catch (caught) { setError(caught instanceof Error ? caught.message.replace(/^Firebase:\s*/i, '') : 'ออกรหัสผ่านใหม่ไม่สำเร็จ'); }
    finally { setWorkingId(''); }
  };

  return <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
      <div><div className="text-sm font-bold text-indigo-600 flex items-center gap-2"><ShieldCheck className="w-5 h-5" />เฉพาะเจ้าหน้าที่ DCC</div><h1 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">อนุมัติผู้ใช้งาน</h1><p className="text-slate-500 mt-1">ตรวจข้อมูลและลายเซ็นก่อนสร้างบัญชีผู้รับเอกสาร</p></div>
      <div className="rounded-xl bg-amber-100 text-amber-900 px-4 py-2 font-black">รออนุมัติ {pending.length} รายการ</div>
    </div>
    {error && <div className="bg-rose-50 border border-rose-300 text-rose-800 rounded-xl p-4">{error}</div>}
    <div className="grid gap-4">
      {loading && <div className="bg-white rounded-2xl p-8 text-center text-slate-500">กำลังโหลดข้อมูล...</div>}
      {!loading && pending.length === 0 && <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center"><UserCheck className="w-12 h-12 text-emerald-500 mx-auto" /><div className="font-black text-lg mt-3">ไม่มีคำขอรออนุมัติ</div></div>}
      {pending.map(row => <article key={row.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="bg-indigo-100 text-indigo-800 rounded-lg px-2.5 py-1 font-black">{row.department}</span><span className="bg-amber-100 text-amber-800 rounded-lg px-2.5 py-1 text-xs font-bold">{row.recipientType === 'PRIMARY' ? 'ผู้รับหลัก' : 'ผู้รับแทน'}</span><span className="text-xs text-slate-400">{row.registrationNo}</span></div><h2 className="font-black text-xl mt-3">{row.displayName}</h2><div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 mt-2 text-sm text-slate-600"><div>รหัสพนักงาน: <b>{row.empId}</b></div><div>ตำแหน่ง: <b>{row.position}</b></div><div>Username: <b className="font-mono">{row.username}</b></div><div>ติดต่อ: <b>{row.email || row.phone || '-'}</b></div></div></div>
          <div className="flex flex-wrap gap-2 shrink-0"><button onClick={() => viewSignature(row)} className="px-4 py-2.5 rounded-xl border border-slate-300 font-bold flex items-center gap-2 hover:bg-slate-50"><Eye className="w-4 h-4" />ดูลายเซ็น</button><label className="px-4 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 font-bold flex items-center gap-2 hover:bg-indigo-100 cursor-pointer"><Upload className="w-4 h-4" />{row.signaturePath ? 'เปลี่ยนลายเซ็น' : 'เพิ่มลายเซ็น'}<input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" disabled={workingId === row.id} className="hidden" onChange={async event => { await updateUserSignature(row, event.target.files?.[0]); event.currentTarget.value = ''; }} /></label><button disabled={workingId === row.id} onClick={() => review(row, 'REJECT')} className="px-4 py-2.5 rounded-xl bg-rose-100 text-rose-800 font-bold flex items-center gap-2 disabled:opacity-50"><UserX className="w-4 h-4" />ปฏิเสธ</button><button disabled={workingId === row.id} onClick={() => review(row, 'APPROVE')} className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-bold flex items-center gap-2 disabled:opacity-50"><Check className="w-4 h-4" />{workingId === row.id ? 'กำลังดำเนินการ...' : 'อนุมัติ'}</button></div>
        </div>
      </article>)}
    </div>
    <section className="space-y-3">
      <div><h2 className="text-xl font-black text-slate-900">บัญชีที่อนุมัติแล้ว</h2><p className="text-sm text-slate-500">สำหรับออกรหัสผ่านชั่วคราวใหม่เมื่อผู้ใช้ลืมรหัสผ่าน</p></div>
      {approved.length === 0 ? <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-slate-500">ยังไม่มีบัญชีที่อนุมัติ</div> : approved.map(row => <article key={row.id} className="bg-white rounded-2xl border border-emerald-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div><div className="flex items-center gap-2"><span className="bg-emerald-100 text-emerald-800 rounded-lg px-2.5 py-1 text-xs font-black">อนุมัติแล้ว</span><b>{row.department}</b></div><div className="font-black mt-2">{row.displayName}</div><div className="text-sm text-slate-500">Username: <span className="font-mono font-bold text-slate-700">{row.username}</span></div></div>
        <div className="flex flex-wrap gap-2"><button onClick={() => viewSignature(row)} className="px-4 py-2.5 rounded-xl border border-slate-300 font-bold flex items-center justify-center gap-2 hover:bg-slate-50"><Eye className="w-4 h-4" />ดูลายเซ็น</button><label className={`px-4 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 font-black flex items-center justify-center gap-2 hover:bg-indigo-100 ${workingId === row.id ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}><Upload className="w-4 h-4" />{row.permanentSignaturePath || row.signaturePath ? 'เปลี่ยนลายเซ็น' : 'เพิ่มลายเซ็น'}<input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" disabled={workingId === row.id} className="hidden" onChange={async event => { await updateUserSignature(row, event.target.files?.[0]); event.currentTarget.value = ''; }} /></label><button disabled={workingId === row.id} onClick={() => resetPassword(row)} className="px-4 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-black flex items-center justify-center gap-2 disabled:opacity-50"><KeyRound className="w-4 h-4" />{workingId === row.id ? 'กำลังดำเนินการ...' : 'ออกรหัสผ่านชั่วคราวใหม่'}</button></div>
      </article>)}
    </section>
    {signatureUrl && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setSignatureUrl('')}><div className="bg-white rounded-2xl p-5 max-w-2xl w-full" onClick={e => e.stopPropagation()}><div className="flex justify-between items-center mb-4"><b>ตรวจสอบลายเซ็น</b><button onClick={() => setSignatureUrl('')}><X /></button></div><img src={signatureUrl} alt="ลายเซ็นผู้ลงทะเบียน" className="max-h-[65vh] mx-auto" /></div></div>}
    {credentials && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"><div className="bg-white rounded-2xl p-6 max-w-lg w-full"><div className="flex justify-between"><div><div className="text-emerald-700 font-black">รหัสผ่านชั่วคราวพร้อมใช้งาน</div><h2 className="text-xl font-black mt-1">{credentials.displayName} — {credentials.department}</h2></div><button onClick={() => setCredentials(null)}><X /></button></div><div className="mt-5 bg-slate-950 text-white rounded-xl p-4 space-y-3"><div><div className="text-xs text-slate-400">Username</div><div className="font-mono font-black text-lg">{credentials.username}</div></div><div><div className="text-xs text-slate-400">รหัสผ่านชั่วคราว</div><div className="font-mono font-black text-lg text-amber-300 break-all">{credentials.password}</div></div></div><button onClick={() => navigator.clipboard.writeText(`Username: ${credentials.username}\nรหัสผ่านชั่วคราว: ${credentials.password}`)} className="mt-4 w-full border border-slate-300 rounded-xl py-3 font-bold flex items-center justify-center gap-2"><Copy className="w-4 h-4" />คัดลอกข้อมูลเข้าสู่ระบบ</button><p className="text-xs text-rose-600 font-bold mt-3">รหัสผ่านเดิมใช้ไม่ได้แล้ว กรุณาบันทึกรหัสใหม่นี้ทันที หน้าต่างนี้ปิดแล้วจะไม่สามารถเปิดดูได้อีก</p></div></div>}
  </div>;
};
