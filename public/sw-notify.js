// Loaded into the app's service worker (see vite.config.js → workbox.importScripts).
// When the owner taps a notification, bring ProfitMind to the front and open the right tab.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const tab = event.notification.data && event.notification.data.tab;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.postMessage({ type: "open-tab", tab });
          return client.focus();
        }
      }
      return self.clients.openWindow("/");
    })
  );
});
