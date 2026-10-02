/* global firebase */
importScripts('https://www.gstatic.com/firebasejs/12.3.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.3.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyC8fZsa1FY3-NMbMXcr9PpqvnhzlHpJwUA',
  authDomain: 'dar-online-form.firebaseapp.com',
  projectId: 'dar-online-form',
  storageBucket: 'dar-online-form.firebasestorage.app',
  messagingSenderId: '850027048943',
  appId: '1:850027048943:web:b907d73ff1f2973f2d101a'
});

const messaging = firebase.messaging();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

messaging.onBackgroundMessage(payload => {
  const appBaseUrl = self.registration.scope;
  const title = payload.notification?.title || 'มีเอกสารแจกจ่ายใหม่';
  const options = {
    body: payload.notification?.body || 'กรุณาเข้าสู่ระบบ DCS เพื่อรับเอกสาร',
    icon: new URL('dcs-app-icon.svg', appBaseUrl).href,
    badge: new URL('dcs-app-icon.svg', appBaseUrl).href,
    tag: payload.data?.distributionId || 'dcs-distribution',
    data: { url: payload.data?.url || new URL('?view=distribution', appBaseUrl).href },
    requireInteraction: true
  };
  return self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '?view=distribution', self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(targetUrl);
      return existing.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});
