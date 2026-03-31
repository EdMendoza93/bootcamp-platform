importScripts("https://www.gstatic.com/firebasejs/12.10.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.10.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAc9WUQzLLGXdjCXXpvi7paqTFRHwc0E5M",
  authDomain: self.location.hostname,
  projectId: "bootcamp-platform-27d16",
  storageBucket: "bootcamp-platform-27d16.firebasestorage.app",
  messagingSenderId: "780790284759",
  appId: "1:780790284759:web:b5bc273be0392d60ff8b92",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  // When the payload contains `notification`, FCM/browser already shows it.
  // Showing one manually here would create duplicates.
  if (payload?.notification) {
    return;
  }

  const title = payload?.data?.title || "Wild Atlantic Bootcamp";
  const body = payload?.data?.body || "You have a new notification.";
  const url = payload?.data?.url || "/dashboard";

  self.registration.showNotification(title, {
    body,
    icon: "/icon.png",
    badge: "/icon.png",
    data: { url },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification?.data?.url || "/dashboard";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
