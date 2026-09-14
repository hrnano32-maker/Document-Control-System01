import React, { useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { ArrowLeft, CheckCircle2, FileSignature, Send, ShieldCheck, Upload, UserPlus } from 'lucide-react';
import { COMPANY } from '../config/company';
import { firebaseFunctions } from '../lib/firebase';
import { DEPARTMENTS, Department } from '../types';
import { NanoLogo } from './NanoLogo';

type Props = { onBack: () => void };
type FormState = {
  department: Department | '';
  username: string;
  displayName: string;
  empId: string;
  position: string;
  email: string;
  phone: string;
  recipientType: 'PRIMARY' | 'BACKUP';
  authorized: boolean;
};

const initial: FormState = {
  department: '', username: '', displayName: '', empId: '', position: '', email: '', phone: '', recipientType: 'PRIMARY', authorized: false,
};

const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์ลายเซ็นได้'));
  reader.readAsDataURL(file);
});

export const DepartmentRegistrationForm: React.FC<Props> = ({ onBack }) => {
  const [form, setForm] = useState<FormState>(initial);
  const [signature, setSignature] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState('');
  const departments = useMemo(() => DEPARTMENTS.filter(item => item.id !== 'DCC'), []);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(current => ({ ...current, [key]: value }));
  const chooseFile = (file?: File) => {
    setError('');
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) return setError('ไฟล์ลายเซ็นต้องเป็น PNG หรือ JPG เท่านั้น');
    if (file.size > 2 * 1024 * 1024) return setError('ไฟล์ลายเซ็นต้องมีขนาดไม่เกิน 2 MB');
    setSignature(file);
    const url = URL.createObjectURL(file);
    setPreview(old => { if (old) URL.revokeObjectURL(old); return url; });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (!form.department || !form.username.trim() || !form.displayName.trim() || !form.empId.trim() || !form.position.trim()) return setError('กรุณากรอกข้อมูลที่มีเครื่องหมาย * ให้ครบ');
    if (!/^[a-z0-9][a-z0-9._-]{2,29}$/i.test(form.username.trim())) return setError('Username ต้องเป็นภาษาอังกฤษ 3–30 ตัว ใช้ตัวเลข จุด ขีดกลาง หรือขีดล่างได้');
    if (!signature) return setError('กรุณาแนบไฟล์ลายเซ็น');
    if (!form.authorized) return setError('กรุณายืนยันว่าได้รับมอบหมายให้เป็นผู้รับเอกสาร');
    setSubmitting(true);
    try {
      const signatureDataUrl = await fileToDataUrl(signature);
      const call = httpsCallable<Record<string, unknown>, { registrationNo: string }>(firebaseFunctions, 'submitDepartmentRegistration');
      const result = await call({ ...form, username: form.username.trim().toLowerCase(), signatureDataUrl, signatureFileName: signature.name, signatureContentType: signature.type });
      setReceipt(result.data.registrationNo);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message.replace(/^Firebase:\s*/i, '') : 'ส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่');
    } finally { setSubmitting(false); }
  };

  if (receipt) return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4 py-10">
      <div className="max-w-lg w-full bg-slate-900 border border-emerald-700/60 rounded-3xl p-7 sm:p-10 text-center shadow-2xl">
        <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
        <h1 className="text-2xl font-black">ส่งข้อมูลเรียบร้อยแล้ว</h1>
        <p className="text-slate-300 mt-3">ข้อมูลอยู่ระหว่างรอเจ้าหน้าที่ DCC ตรวจสอบและอนุมัติ</p>
        <div className="mt-5 bg-slate-950 rounded-xl p-4 border border-slate-700">
          <div className="text-xs text-slate-400">เลขอ้างอิงการลงทะเบียน</div>
          <div className="font-mono font-black text-xl text-amber-300 mt-1">{receipt}</div>
        </div>
        <p className="text-xs text-slate-400 mt-4">ระบบยังไม่สร้างบัญชีจนกว่า DCC จะตรวจสอบข้อมูลและลายเซ็น</p>
        <button onClick={onBack} className="mt-7 w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold">กลับหน้าเข้าสู่ระบบ</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-7 sm:py-10">
      <div className="max-w-3xl mx-auto">
        <button onClick={onBack} className="mb-5 flex items-center gap-2 text-slate-300 hover:text-white"><ArrowLeft className="w-4 h-4" /> กลับหน้าเข้าสู่ระบบ</button>
        <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
          <header className="px-6 sm:px-9 py-7 border-b border-slate-800 bg-gradient-to-r from-indigo-950/80 to-slate-900">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="bg-white rounded-xl p-2 w-fit"><NanoLogo className="h-9 w-auto" /></div>
              <div><div className="text-sm text-indigo-300 font-bold">{COMPANY.nameTh}</div><h1 className="text-xl sm:text-2xl font-black mt-1 flex items-center gap-2"><UserPlus className="w-6 h-6 text-indigo-400" />ลงทะเบียนผู้รับเอกสารประจำแผนก</h1></div>
            </div>
            <p className="text-sm text-slate-400 mt-4">กรอกโดยผู้รับผิดชอบเอกสารหรือผู้รับแทนที่หัวหน้าแผนกมอบหมาย ข้อมูลจะมีผลหลัง DCC อนุมัติเท่านั้น</p>
          </header>
          <form onSubmit={submit} className="p-6 sm:p-9 space-y-7">
            {error && <div className="rounded-xl border border-rose-600/60 bg-rose-950/60 text-rose-200 p-4 text-sm">{error}</div>}
            <section className="space-y-4">
              <h2 className="font-black flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-indigo-400" />ข้อมูลหน่วยงานและผู้รับผิดชอบ</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="sm:col-span-2 text-sm font-bold">แผนก *<select value={form.department} onChange={e => setField('department', e.target.value as Department)} className="mt-2 w-full rounded-xl bg-slate-950 border border-slate-700 px-4 py-3 text-white"><option value="">— เลือกแผนก —</option>{departments.map(item => <option key={item.id} value={item.id}>{item.nameTh}</option>)}</select></label>
                <Field label="Username ที่ต้องการ *" value={form.username} onChange={v => setField('username', v)} placeholder="เช่น qa, hr, production1" />
                <Field label="รหัสพนักงาน *" value={form.empId} onChange={v => setField('empId', v)} />
                <Field label="ชื่อ–นามสกุล *" value={form.displayName} onChange={v => setField('displayName', v)} />
                <Field label="ตำแหน่ง *" value={form.position} onChange={v => setField('position', v)} />
                <Field label="อีเมลติดต่อ" value={form.email} onChange={v => setField('email', v)} type="email" />
                <Field label="เบอร์โทรศัพท์" value={form.phone} onChange={v => setField('phone', v)} type="tel" />
                <label className="sm:col-span-2 text-sm font-bold">ประเภทผู้รับ<select value={form.recipientType} onChange={e => setField('recipientType', e.target.value as 'PRIMARY' | 'BACKUP')} className="mt-2 w-full rounded-xl bg-slate-950 border border-slate-700 px-4 py-3 text-white"><option value="PRIMARY">ผู้รับหลักประจำแผนก</option><option value="BACKUP">ผู้รับแทน</option></select></label>
              </div>
            </section>
            <section className="space-y-4 border-t border-slate-800 pt-6">
              <h2 className="font-black flex items-center gap-2"><FileSignature className="w-5 h-5 text-cyan-400" />ไฟล์ลายเซ็น *</h2>
              <label className="block border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-2xl p-6 text-center cursor-pointer bg-slate-950/50">
                <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={e => chooseFile(e.target.files?.[0])} />
                {preview ? <img src={preview} alt="ตัวอย่างลายเซ็น" className="max-h-32 mx-auto bg-white rounded-lg p-2" /> : <Upload className="w-10 h-10 text-slate-500 mx-auto" />}
                <div className="font-bold mt-3">{signature?.name || 'กดเพื่อเลือกภาพลายเซ็น'}</div><div className="text-xs text-slate-400 mt-1">PNG หรือ JPG ขนาดไม่เกิน 2 MB ภาพต้องชัดและไม่ตัดปลายลายเซ็น</div>
              </label>
              <label className="flex gap-3 rounded-xl bg-amber-950/30 border border-amber-700/40 p-4 text-sm cursor-pointer"><input type="checkbox" checked={form.authorized} onChange={e => setField('authorized', e.target.checked)} className="mt-1 w-5 h-5" /><span>ข้าพเจ้ายืนยันว่าได้รับมอบหมายจากหัวหน้าแผนกให้เป็นผู้รับเอกสารควบคุม และยินยอมให้ใช้ลายเซ็นนี้เฉพาะการรับเอกสารในระบบ DCS</span></label>
            </section>
            <button type="submit" disabled={submitting} className="w-full py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 font-black flex justify-center items-center gap-2 disabled:opacity-50"><Send className="w-5 h-5" />{submitting ? 'กำลังส่งข้อมูล...' : 'ส่งข้อมูลให้ DCC ตรวจสอบ'}</button>
          </form>
        </div>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }> = ({ label, value, onChange, type = 'text', placeholder }) => (
  <label className="text-sm font-bold">{label}<input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="mt-2 w-full rounded-xl bg-slate-950 border border-slate-700 px-4 py-3 text-white placeholder-slate-600 focus:ring-2 focus:ring-indigo-500 outline-none" /></label>
);
