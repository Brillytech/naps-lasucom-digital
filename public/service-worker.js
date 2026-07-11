const CACHE_NAME = "naps-lasucom-v2";

const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/images/naps-logo.png",
  "/constitution.pdf",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => null);
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName))
        );
      }),
      self.clients.claim(),
    ])
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();

        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, clone).catch(() => null);
        });

        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          return cached || caches.match("/");
        });
      })
  );
});

/* ===============================
   PUSH NOTIFICATIONS
================================ */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data = {};

  try {
    data = event.data.json();
  } catch {
    data = {
      title: "NAPS LASUCOM",
      body: event.data.text(),
    };
  }

  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badge || "/icons/icon-192.png",
    image: data.image || undefined,

    vibrate: [200, 100, 200],

    data: {
      url: data.url || "/notifications",
    },

    tag: "naps-announcement",
    renotify: true,
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(
      data.title || "NAPS LASUCOM",
      options
    )
  );
});

/* ===============================
   NOTIFICATION CLICK
================================ */

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/notifications";

  event.waitUntil(
    clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      return clients.openWindow(targetUrl);
    })
  );
});

/* ===============================
   PUSH SUBSCRIPTION CHANGED
================================ */

self.addEventListener("pushsubscriptionchange", (event) => {
  console.log("Push subscription changed.", event);
});