import React, { useMemo, useState } from 'react';
import { Bell, CalendarDays, CheckCircle2, Download, Eye, FileText, Loader2, Megaphone, Pencil, Plus, Send, ShieldAlert, X } from 'lucide-react';
import { DEPARTMENTS, type DcsAnnouncement, type Department } from '../types';
import { useDcs } from '../context/DcsContext';
import { downloadAnnouncementAttachment } from '../services/dcsRepository';

type FormState = Pick<DcsAnnouncement, 'title' | 'details' | 'category' | 'priority' | 'effectiveDate' | 'endDate' | 'targetDepartments' | 'requireAcknowledgement'>;
const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = (): FormState => ({ title: '', details: '', category: 'QUALITY_NEWS', priority: 'NORMAL', effectiveDate: today(), endDate: today(), targetDepartments: [], requireAcknowledgement: false });
const categoryLabel: Record<DcsAnnouncement['category'], string> = { ISO: 'ข้อกำหนด ISO', IATF: 'ข้อกำหนด IATF', CUSTOMER_REQUIREMENT: 'ข้อกำหนดลูกค้า', QUALITY_NEWS: 'ข่าวสารระบบคุณภาพ', OTHER: 'ข้อมูลอื่น ๆ' };
const priorityLabel: Record<DcsAnnouncement['priority'], string> = { NORMAL: 'ทั่วไป', IMPORTANT: 'สำคัญ', URGENT: 'เร่งด่วน' };

export const Announcements: React.FC = () => {
  const { announcements, currentUser, createAnnouncement, updateAnnouncement, cancelAnnouncement, markAnnouncementRead, acknowledgeAnnouncement } = useDcs();
  const isDcc = currentUser.userRole === 'DCC_ADMIN';
  const [history, setHistory] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DcsAnnouncement | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [files, setFiles] = useState<File[]>([]);
  const [selected, setSelected] = useState<DcsAnnouncement | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadMessage, setDownloadMessage] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [message, setMessage] = useState('');

  const isArchived = (item: DcsAnnouncement) => item.status === 'CANCELLED' || item.endDate < today();
  const visible = useMemo(() => announcements.filter(item => history ? isArchived(item) : !isArchived(item)), [announcements, history]);
  const unread = isDcc ? 0 : announcements.filter(item => !isArchived(item) && !item.reads?.[currentUser.currentDept]).length;

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setFiles([]); setMessage(''); setFormOpen(true); };
  const openEdit = (item: DcsAnnouncement) => { setEditing(item); setForm({ title: item.title, details: item.details, category: item.category, priority: item.priority, effectiveDate: item.effectiveDate, endDate: item.endDate, targetDepartments: item.targetDepartments, requireAcknowledgement: item.requireAcknowledgement }); setFiles([]); setMessage(''); setFormOpen(true); };
  const openAnnouncement = async (item: DcsAnnouncement) => { setDownloadProgress(0); setDownloadMessage(''); setDownloadError(''); setSelected(item); if (!isDcc && !item.reads?.[currentUser.currentDept]) await markAnnouncementRead(item.id).catch(() => undefined); };
  const toggleDepartment = (dept: Department) => setForm(prev => ({ ...prev, targetDepartments: prev.targetDepartments.includes(dept) ? prev.targetDepartments.filter(item => item !== dept) : [...prev.targetDepartments, dept] }));
  const allRecipientDepartments = DEPARTMENTS.filter(item => item.id !== 'DCC').map(item => item.id);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setMessage('');
    try {
      if (editing) await updateAnnouncement(editing.id, form);
      else await createAnnouncement(form, files);
      setFormOpen(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'บันทึกประกาศไม่สำเร็จ'); }
    finally { setSaving(false); }
  };

  const cancelItem = async (item: DcsAnnouncement) => {
    const reason = window.prompt('ระบุเหตุผลการยกเลิกประกาศ');
    if (!reason) return;
    try { await cancelAnnouncement(item.id, reason); } catch (error) { window.alert(error instanceof Error ? error.message : 'ยกเลิกประกาศไม่สำเร็จ'); }
  };

  const downloadFile = async (attachment: DcsAnnouncement['attachments'][number], fileIndex: number) => {
    if (downloading) return;
    setDownloading(attachment.storagePath);
    setDownloadProgress(0);
    setDownloadMessage('กำลังตรวจสอบสิทธิ์และเตรียมไฟล์...');
    setDownloadError('');
    try {
      if (!selected) throw new Error('ไม่พบประกาศ กรุณาปิดหน้าต่างแล้วเปิดใหม่');
      const blob = await downloadAnnouncementAttachment(selected.id, fileIndex, percent => {
        setDownloadProgress(percent);
        setDownloadMessage(percent >= 100 ? 'รับไฟล์ครบแล้ว กำลังบันทึกลงเครื่อง...' : `กำลังดาวน์โหลด ${percent}%`);
      });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = objectUrl; anchor.download = attachment.name; document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      setDownloadProgress(100);
      setDownloadMessage(`ดาวน์โหลด “${attachment.name}” สำเร็จแล้ว กรุณาตรวจสอบโฟลเดอร์ Downloads`);
    } catch (error) {
      console.error('Announcement attachment download failed', error);
      setDownloadProgress(0);
      setDownloadMessage('');
      setDownloadError(error instanceof Error ? error.message : 'ดาวน์โหลดไฟล์ไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่แล้วลองอีกครั้ง');
    }
    finally { setDownloading(null); }
  };

  const selectedAcknowledged = selected ? Boolean(selected.acknowledgements?.[currentUser.currentDept]) : false;
  const canCloseSelected = !selected?.requireAcknowledgement || selectedAcknowledged || isDcc || selected.status === 'CANCELLED';
  const closeSelected = () => { if (canCloseSelected) setSelected(null); };

  return <div className="space-y-5">
    <section className="rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white shadow-xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="flex items-center gap-2"><Megaphone className="h-7 w-7 text-amber-300"/><h1 className="text-2xl font-black">ประกาศส่วนกลาง</h1>{unread > 0 && <span className="rounded-full bg-rose-500 px-2.5 py-1 text-xs font-black">ยังไม่อ่าน {unread}</span>}</div><p className="mt-2 text-sm text-slate-300">ข้อมูล ISO, IATF, ข้อกำหนดลูกค้า และข่าวสารระบบคุณภาพจาก DCC</p></div>
        {isDcc && <button onClick={openCreate} className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-bold hover:bg-indigo-500"><Plus className="h-5 w-5"/>สร้างประกาศ</button>}
      </div>
    </section>

    <div className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      <button onClick={() => setHistory(false)} className={`flex-1 rounded-xl px-4 py-2.5 font-bold ${!history ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>ประกาศปัจจุบัน</button>
      <button onClick={() => setHistory(true)} className={`flex-1 rounded-xl px-4 py-2.5 font-bold ${history ? 'bg-slate-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>ประวัติ / หมดอายุ</button>
    </div>

    <div className="space-y-3">
      {visible.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">ไม่มีประกาศในหมวดนี้</div>}
      {visible.map(item => {
        const read = Boolean(item.reads?.[currentUser.currentDept]); const ack = Boolean(item.acknowledgements?.[currentUser.currentDept]);
        return <article key={item.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${!read && !isDcc ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${item.priority === 'URGENT' ? 'bg-rose-100 text-rose-700' : item.priority === 'IMPORTANT' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>{priorityLabel[item.priority]}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{categoryLabel[item.category]}</span>{!read && !isDcc && <span className="rounded-full bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white">ใหม่</span>}{ack && <span className="flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4"/>รับทราบแล้ว</span>}</div><h2 className="mt-3 text-xl font-black text-slate-900">{item.title}</h2><p className="mt-2 line-clamp-2 whitespace-pre-line text-sm leading-6 text-slate-600">{item.details}</p><div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold text-slate-500"><span className="flex items-center gap-1"><CalendarDays className="h-4 w-4"/>มีผล {item.effectiveDate} ถึง {item.endDate}</span><span className="flex items-center gap-1"><FileText className="h-4 w-4"/>{item.attachments.length} ไฟล์</span>{item.requireAcknowledgement && <span className="flex items-center gap-1 text-rose-600"><ShieldAlert className="h-4 w-4"/>บังคับรับทราบ</span>}</div></div>
            <div className="flex flex-wrap gap-2"><button onClick={() => void openAnnouncement(item)} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"><Eye className="h-4 w-4"/>เปิดอ่าน</button>{isDcc && !isArchived(item) && <><button onClick={() => openEdit(item)} className="rounded-xl border border-slate-300 p-2.5 text-slate-600 hover:bg-slate-100" title="แก้ไข"><Pencil className="h-4 w-4"/></button><button onClick={() => void cancelItem(item)} className="rounded-xl border border-rose-200 p-2.5 text-rose-600 hover:bg-rose-50" title="ยกเลิก"><X className="h-4 w-4"/></button></>}</div>
          </div>
          {isDcc && <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm"><div className="rounded-xl bg-sky-50 p-3 font-bold text-sky-800">อ่านแล้ว {Object.keys(item.reads || {}).length}/{item.targetDepartments.length} หน่วยงาน</div><div className="rounded-xl bg-emerald-50 p-3 font-bold text-emerald-800">รับทราบ {Object.keys(item.acknowledgements || {}).length}/{item.targetDepartments.length} หน่วยงาน</div></div>}
        </article>;
      })}
    </div>

    {formOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3"><form onSubmit={submit} className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between bg-slate-900 px-5 py-4 text-white"><h2 className="text-lg font-black">{editing ? 'แก้ไขประกาศ' : 'สร้างประกาศส่วนกลาง'}</h2><button type="button" onClick={() => setFormOpen(false)}><X/></button></div><div className="space-y-4 p-5">
      <label className="block font-bold text-slate-700">หัวข้อประกาศ *<input value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-3" required/></label>
      <label className="block font-bold text-slate-700">รายละเอียด *<textarea value={form.details} onChange={e => setForm(prev => ({ ...prev, details: e.target.value }))} className="mt-1.5 min-h-32 w-full rounded-xl border border-slate-300 px-4 py-3" required/></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="font-bold text-slate-700">ประเภท<select value={form.category} onChange={e => setForm(prev => ({ ...prev, category: e.target.value as DcsAnnouncement['category'] }))} className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-3">{Object.entries(categoryLabel).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="font-bold text-slate-700">ระดับความสำคัญ<select value={form.priority} onChange={e => setForm(prev => ({ ...prev, priority: e.target.value as DcsAnnouncement['priority'] }))} className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-3">{Object.entries(priorityLabel).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="font-bold text-slate-700">วันที่มีผล<input type="date" value={form.effectiveDate} onChange={e => setForm(prev => ({ ...prev, effectiveDate: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-3" required/></label><label className="font-bold text-slate-700">วันสิ้นสุด<input type="date" value={form.endDate} min={form.effectiveDate} onChange={e => setForm(prev => ({ ...prev, endDate: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-3" required/></label></div>
      <div><div className="mb-2 flex items-center justify-between"><span className="font-bold text-slate-700">หน่วยงานผู้รับ *</span><button type="button" onClick={() => setForm(prev => ({ ...prev, targetDepartments: prev.targetDepartments.length === allRecipientDepartments.length ? [] : allRecipientDepartments }))} className="text-sm font-bold text-indigo-600">{form.targetDepartments.length === allRecipientDepartments.length ? 'ยกเลิกทั้งหมด' : 'เลือกทุกแผนก'}</button></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{DEPARTMENTS.filter(dept => dept.id !== 'DCC').map(dept => <label key={dept.id} className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-semibold"><input type="checkbox" checked={form.targetDepartments.includes(dept.id)} onChange={() => toggleDepartment(dept.id)}/>{dept.id}</label>)}</div></div>
      {!editing && <label className="block font-bold text-slate-700">ไฟล์ PDF แนบ (ไม่บังคับและเลือกได้หลายไฟล์)<input type="file" multiple accept="application/pdf,.pdf" onChange={e => setFiles(Array.from(e.target.files || []))} className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal"/>{files.length > 0 && <span className="mt-1 block text-sm text-emerald-700">เลือกแล้ว {files.length} ไฟล์</span>}</label>}
      {editing && editing.attachments.length > 0 && <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-600">ไฟล์แนบเดิม {editing.attachments.length} ไฟล์ยังคงอยู่ การแก้ไขครั้งนี้เปลี่ยนเฉพาะรายละเอียดประกาศ</p>}
      <label className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 font-bold text-amber-900"><input type="checkbox" checked={form.requireAcknowledgement} onChange={e => setForm(prev => ({ ...prev, requireAcknowledgement: e.target.checked }))} className="mt-1"/><span>ประกาศสำคัญ — บังคับให้ผู้รับกด “รับทราบ” ก่อนปิดหน้าต่าง</span></label>
      {message && <p className="rounded-xl bg-rose-50 p-3 font-bold text-rose-700">{message}</p>}
    </div><div className="sticky bottom-0 flex justify-end gap-2 border-t bg-white p-4"><button type="button" onClick={() => setFormOpen(false)} className="rounded-xl px-4 py-2.5 font-bold text-slate-600">ยกเลิก</button><button disabled={saving} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 font-bold text-white disabled:opacity-50"><Send className="h-4 w-4"/>{saving ? 'กำลังบันทึก...' : editing ? 'บันทึกการแก้ไข' : 'ส่งประกาศ'}</button></div></form></div>}

    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3"><div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl"><div className="flex items-start justify-between bg-slate-900 p-5 text-white"><div><div className="mb-2 flex gap-2"><span className="rounded-full bg-indigo-500 px-2.5 py-1 text-xs font-bold">{categoryLabel[selected.category]}</span><span className="rounded-full bg-amber-500 px-2.5 py-1 text-xs font-bold text-slate-950">{priorityLabel[selected.priority]}</span></div><h2 className="text-xl font-black">{selected.title}</h2></div><button onClick={closeSelected} disabled={!canCloseSelected || Boolean(downloading)} className="disabled:cursor-not-allowed disabled:opacity-30"><X/></button></div><div className="space-y-5 p-6"><p className="whitespace-pre-line text-base leading-7 text-slate-700">{selected.details}</p><div className="rounded-xl bg-slate-100 p-4 text-sm font-semibold text-slate-600">วันที่มีผล {selected.effectiveDate} ถึง {selected.endDate}</div>{selected.attachments.length > 0 && <div><h3 className="mb-2 font-black">ไฟล์แนบ PDF</h3><div className="space-y-2">{selected.attachments.map((attachment, fileIndex) => <button key={attachment.storagePath} onClick={() => void downloadFile(attachment, fileIndex)} disabled={Boolean(downloading)} className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-3 text-left font-bold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"><span className="truncate">{attachment.name}</span>{downloading === attachment.storagePath ? <span className="ml-3 flex shrink-0 items-center gap-2"><Loader2 className="h-5 w-5 animate-spin"/>{downloadProgress > 0 ? `${downloadProgress}%` : 'กำลังเตรียม'}</span> : <Download className="h-5 w-5 shrink-0"/>}</button>)}</div>{(downloading || downloadMessage) && <div className={`mt-3 rounded-xl border p-3 ${downloading ? 'border-indigo-200 bg-indigo-50 text-indigo-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}><div className="flex items-center gap-2 text-sm font-bold">{downloading ? <Loader2 className="h-4 w-4 animate-spin"/> : <CheckCircle2 className="h-4 w-4"/>}{downloadMessage}</div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white"><div className={`h-full transition-all duration-300 ${downloading ? 'bg-indigo-600' : 'bg-emerald-500'}`} style={{ width: `${downloadProgress}%` }}/></div></div>}{downloadError && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">ดาวน์โหลดไม่สำเร็จ: {downloadError}</div>}</div>}{isDcc && <div><h3 className="mb-2 font-black">สถานะรายหน่วยงาน</h3><div className="grid gap-2 sm:grid-cols-2">{selected.targetDepartments.map(dept => <div key={dept} className="rounded-xl border border-slate-200 p-3"><div className="font-black text-slate-800">{dept}</div><div className="mt-1 flex gap-2 text-xs font-bold"><span className={selected.reads?.[dept] ? 'text-sky-700' : 'text-slate-400'}>{selected.reads?.[dept] ? 'อ่านแล้ว' : 'ยังไม่อ่าน'}</span><span className={selected.acknowledgements?.[dept] ? 'text-emerald-700' : 'text-slate-400'}>{selected.acknowledgements?.[dept] ? 'รับทราบแล้ว' : 'ยังไม่รับทราบ'}</span></div></div>)}</div></div>}{!isDcc && <button onClick={async () => { await acknowledgeAnnouncement(selected.id); setSelected(prev => prev ? ({ ...prev, acknowledgements: { ...prev.acknowledgements, [currentUser.currentDept]: { department: currentUser.currentDept, uid: currentUser.uid, userName: currentUser.userName || currentUser.currentDept, timestamp: new Date().toISOString() } } }) : null); }} disabled={selectedAcknowledged} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-black text-white disabled:bg-emerald-100 disabled:text-emerald-700"><CheckCircle2 className="h-5 w-5"/>{selectedAcknowledged ? 'รับทราบแล้ว' : 'กดรับทราบ'}</button>}{!canCloseSelected && <p className="text-center text-sm font-bold text-rose-600">ประกาศนี้กำหนดให้กดรับทราบก่อนปิดหน้าต่าง</p>}</div><div className="border-t p-4 text-right"><button onClick={closeSelected} disabled={!canCloseSelected || Boolean(downloading)} className="rounded-xl bg-slate-800 px-5 py-2.5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{downloading ? 'กรุณารอการดาวน์โหลด' : 'ปิดหน้าต่าง'}</button></div></div></div>}
  </div>;
};
