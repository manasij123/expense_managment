importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

// TODO: base.html থেকে আপনার firebaseConfig-এর কোডটুকু হুবহু কপি করে এখানে পেস্ট করুন
const firebaseConfig = {
  apiKey: "AIzaSyBB1lT-Kh0OkJtnC1tKT2RQlvsFuHNlWEE",
authDomain: "expensemanagement-178bf.firebaseapp.com",
            projectId: "expensemanagement-178bf",
            storageBucket: "expensemanagement-178bf.firebasestorage.app",
            messagingSenderId: "853835589338",
            appId: "1:853835589338:web:a8a909cc0d8c510a22a7e3"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// অ্যাপ বন্ধ বা ব্যাকগ্রাউন্ডে থাকলে নোটিফিকেশন রিসিভ করার কোড
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message: ', payload);

  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/static/durga_logo.svg',
    badge: '/static/durga_logo.svg',
    // Alarm-like buzz pattern (Android only — iOS/desktop ignore vibrate) and
    // keep the notification on screen until the user actually dismisses it,
    // instead of the OS auto-hiding it after a few seconds.
    vibrate: [300, 150, 300, 150, 300, 150, 600],
    requireInteraction: true,
    renotify: true,
    tag: 'newspaper-reminder',
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// ট্যাপ করলে সরাসরি অ্যাপ খুলে যাবে (বা ইতিমধ্যে খোলা ট্যাবে ফোকাস করবে)
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/newspaper');
    })
  );
});
