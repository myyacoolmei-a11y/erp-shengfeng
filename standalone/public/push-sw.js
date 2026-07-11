/* Web Push handlers — imported by Workbox service worker */
self.addEventListener("push", (event) => {
  let data = { title: "晟風 ERP", body: "", url: "/", notificationId: null };
  try {
    data = { ...data, ...JSON.parse(event.data?.text() ?? "{}") };
  } catch {
    /* ignore */
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const appFocused = clientList.some(c => c.focused && c.url.startsWith(self.location.origin));
      if (appFocused) return;

      return self.registration.showNotification(data.title, {
        body: data.body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { url: data.url, notificationId: data.notificationId },
        tag: data.notificationId ? `shengfeng-${data.notificationId}` : `shengfeng-${Date.now()}`,
      });
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const relativeUrl = event.notification.data?.url || "/";
  const absoluteUrl = new URL(relativeUrl, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.postMessage({ type: "navigate", url: relativeUrl });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(absoluteUrl);
      }
    }),
  );
});
