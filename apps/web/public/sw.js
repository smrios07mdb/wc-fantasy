/*
 * WC Fantasy service worker (Prompt 41a). Served at /sw.js from the web root and registered manually by
 * the Settings "Enable browser notifications" button (no next-pwa, no build step). It does exactly two
 * things — display an incoming push and focus/open the app on click — and deliberately NOTHING else:
 * no fetch interception, no caching, no offline shell. "Boring and reliable": the smallest worker that
 * makes Web Push work.
 *
 * The payload JSON shape is the @app/notify PushPayload: { title, body, url, tag }.
 */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "WC Fantasy";
  const options = {
    body: payload.body || "",
    tag: payload.tag || undefined,
    // Per-subject tag → a re-send REPLACES rather than stacks (belt-and-braces with the server ledger).
    renotify: Boolean(payload.tag),
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: payload.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Focus an existing tab already on the target path; otherwise open a new window.
      for (const client of allClients) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })(),
  );
});
