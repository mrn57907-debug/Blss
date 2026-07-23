// firebase-messaging-sw.js
// ══════════════════════════════════════════
// FCM Service Worker — Background & Closed-Tab Notifications
//
// DEPLOYMENT:
//   • Place this file in the SAME directory as index.html
//   • GitHub Pages: repo-root/ if index.html is at root, or docs/ if served from docs/
//   • Firebase Hosting: public/ root (firebase.json hosting.public)
//
// The JS in index.html registers this SW using a dynamic base path
// so it works on both GitHub Pages subdirs and Firebase Hosting root.
// ══════════════════════════════════════════

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyAUkeqz4iGn4LwJf93EJa0JilIUoHHdVOs",
  authDomain:        "ssss-27d97.firebaseapp.com",
  projectId:         "ssss-27d97",
  storageBucket:     "ssss-27d97.firebasestorage.app",
  messagingSenderId: "402050236451",
  appId:             "1:402050236451:web:5f8ad5ddcd6a7c63377196"
});

const messaging = firebase.messaging();

// Background message handler (app in background or tab closed)
messaging.onBackgroundMessage(function(payload) {
  const notif = payload.notification || {};
  const title = notif.title || 'نظام الجامعة';
  const options = {
    body:               notif.body  || '',
    icon:               notif.icon  || '/favicon.ico',
    badge:              notif.icon  || '/favicon.ico',
    data:               payload.data || {},
    dir:                'rtl',
    lang:               'ar',
    tag:                (payload.data && payload.data.tag) ? payload.data.tag : 'uni-bg',
    requireInteraction: false,
  };
  return self.registration.showNotification(title, options);
});

// Notification click — focus existing tab or open app
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  // Resolve URL relative to SW location (handles GitHub Pages subdirs automatically)
  const appUrl = self.registration.scope;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(appUrl);
    })
  );
});

// Keep SW alive — prevents Chrome from killing it mid-notification
self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));

// معالج fetch بسيط (تمرير مباشر للشبكة، بلا أي تخزين مؤقت أو تغيير سلوك) —
// مطلوب من Chrome ليُحتسب الموقع "قابل للتثبيت كتطبيق" (Install app) بدل
// "إضافة اختصار" فقط. لا يغيّر أي طلب شبكة موجود.
self.addEventListener('fetch', () => {});
