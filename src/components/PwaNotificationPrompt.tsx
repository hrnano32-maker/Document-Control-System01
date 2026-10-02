import React, { useEffect, useState } from 'react';
import { BellRing, CheckCircle2, Download, Share2, X } from 'lucide-react';
import { useDcs } from '../context/DcsContext';
import {
  enableDepartmentNotifications,
  isIosDevice,
  isStandaloneApp,
  listenForForegroundNotifications,
  requestAppInstall,
  subscribeInstallAvailability,
} from '../services/pwaService';

export const PwaNotificationPrompt: React.FC = () => {
  const { currentUser, setActiveView } = useDcs();
  const [installAvailable, setInstallAvailable] = useState(false);
  const [installed, setInstalled] = useState(isStandaloneApp());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const notificationEnabled = typeof Notification !== 'undefined' && Notification.permission === 'granted'
    && localStorage.getItem('dcs_notifications_enabled') === 'true';
  const needsNotification = typeof Notification !== 'undefined' && !notificationEnabled;
  const ios = isIosDevice();

  useEffect(() => subscribeInstallAvailability(setInstallAvailable), []);

  useEffect(() => {
    if (!currentUser.isAuthenticated || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    void enableDepartmentNotifications(currentUser).catch(() => undefined);
    let stop = () => undefined;
    void listenForForegroundNotifications((title, body) => {
      setMessage(`${title}: ${body}`);
      setActiveView('distribution');
    }).then(unsubscribe => { stop = unsubscribe; });
    return () => stop();
  }, [currentUser.isAuthenticated, currentUser.uid, currentUser.currentDept]);

  if (!currentUser.isAuthenticated || dismissed || (installed && !needsNotification && !message)) return null;
  if (!installAvailable && !ios && !needsNotification && !message) return null;

  const install = async () => {
    setBusy(true);
    try {
      const accepted = await requestAppInstall();
      if (accepted) { setInstalled(true); setMessage('ติดตั้งเว็บแอปสำเร็จแล้ว'); }
    } finally { setBusy(false); }
  };

  const enableNotifications = async () => {
    setBusy(true);
    setMessage('');
    try {
      await enableDepartmentNotifications(currentUser);
      setMessage(`เปิดแจ้งเตือนสำหรับแผนก ${currentUser.currentDept} สำเร็จแล้ว`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'เปิดการแจ้งเตือนไม่สำเร็จ');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-xl rounded-2xl border border-indigo-200 bg-white p-4 shadow-2xl print:hidden sm:bottom-5">
      <button type="button" onClick={() => setDismissed(true)} className="absolute right-3 top-3 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="ปิด">
        <X className="h-5 w-5" />
      </button>
      <div className="flex gap-3 pr-8">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
          {notificationEnabled ? <CheckCircle2 className="h-6 w-6" /> : <BellRing className="h-6 w-6" />}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-extrabold text-slate-900">ติดตั้ง DCS และรับแจ้งเตือนเอกสาร</h2>
          <p className="mt-1 text-sm text-slate-600">รับแจ้งทันทีเมื่อ DCC แจกจ่ายเอกสารให้แผนก {currentUser.currentDept}</p>
          {ios && !installed && !installAvailable && (
            <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
              <Share2 className="h-4 w-4" /> iPhone/iPad: กดปุ่มแชร์ แล้วเลือก “เพิ่มไปยังหน้าจอโฮม”
            </p>
          )}
          {message && <p className="mt-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-800">{message}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {installAvailable && !installed && (
              <button type="button" onClick={install} disabled={busy} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50">
                <Download className="h-4 w-4" /> ติดตั้งเว็บแอป
              </button>
            )}
            {needsNotification && (
              <button type="button" onClick={enableNotifications} disabled={busy} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
                <BellRing className="h-4 w-4" /> {busy ? 'กำลังเปิดใช้งาน…' : 'อนุญาตการแจ้งเตือน'}
              </button>
            )}
            {notificationEnabled && <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> เปิดแจ้งเตือนแล้ว</span>}
          </div>
        </div>
      </div>
    </div>
  );
};
