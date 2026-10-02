import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { httpsCallable } from 'firebase/functions';
import { firebaseApp, firebaseFunctions } from '../lib/firebase';
import type { CurrentUserSession } from '../types';

export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let installPrompt: InstallPromptEvent | null = null;
const installListeners = new Set<(available: boolean) => void>();
let serviceWorkerPromise: Promise<ServiceWorkerRegistration> | null = null;

export const initializePwa = () => {
  if (!('serviceWorker' in navigator)) return;
  serviceWorkerPromise = navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
    installListeners.forEach(listener => listener(true));
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    installListeners.forEach(listener => listener(false));
  });
};

export const subscribeInstallAvailability = (listener: (available: boolean) => void) => {
  installListeners.add(listener);
  listener(Boolean(installPrompt));
  return () => installListeners.delete(listener);
};

export const requestAppInstall = async () => {
  if (!installPrompt) return false;
  await installPrompt.prompt();
  const choice = await installPrompt.userChoice;
  if (choice.outcome === 'accepted') installPrompt = null;
  return choice.outcome === 'accepted';
};

const registerDevice = httpsCallable(firebaseFunctions, 'registerNotificationDevice');

export const enableDepartmentNotifications = async (user: CurrentUserSession) => {
  if (!(await isSupported())) throw new Error('เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือนเว็บแอป');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('ยังไม่ได้อนุญาตการแจ้งเตือน กรุณาเปิดสิทธิ์แจ้งเตือนในเบราว์เซอร์');
  const registration = serviceWorkerPromise
    ? await serviceWorkerPromise
    : await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
  const messaging = getMessaging(firebaseApp);
  const token = await getToken(messaging, { serviceWorkerRegistration: registration });
  if (!token) throw new Error('อุปกรณ์นี้ยังไม่สามารถสร้างรหัสรับการแจ้งเตือนได้');
  await registerDevice({ token, department: user.currentDept, platform: navigator.userAgent });
  localStorage.setItem('dcs_notifications_enabled', 'true');
  return token;
};

export const listenForForegroundNotifications = async (onNotification: (title: string, body: string) => void) => {
  if (!(await isSupported())) return () => undefined;
  return onMessage(getMessaging(firebaseApp), payload => {
    onNotification(payload.notification?.title || 'มีเอกสารแจกจ่ายใหม่', payload.notification?.body || 'กรุณาตรวจสอบรายการเอกสารรอรับ');
  });
};

export const isStandaloneApp = () => window.matchMedia('(display-mode: standalone)').matches
  || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

export const isIosDevice = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
