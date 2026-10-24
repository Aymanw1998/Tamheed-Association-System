/* eslint-disable no-restricted-globals */
import { clientsClaim } from "workbox-core";
import { precacheAndRoute, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { shouldCache } from "./pwa/shouldCache";

const API_CACHE = "tamheed-api";
const ICON = "/icons/icon-192.png";

clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);

// SPA navigations fall back to the app shell, except API paths.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api\//i, /\/[^/?]+\.[^/]+$/],
  })
);

registerRoute(
  ({ url, request }) =>
    url.origin === self.location.origin &&
    !String(request.headers.get("Accept") || "").includes("text/event-stream") &&
    shouldCache(url.href, request.method),
  new NetworkFirst({
    cacheName: API_CACHE,
    networkTimeoutSeconds: 4,
    plugins: [new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 7 * 24 * 60 * 60 })],
  })
);

self.addEventListener("message", (event) => {
  const type = event.data && event.data.type;
  if (type === "SKIP_WAITING") {
    self.skipWaiting();
  } else if (type === "CLEAR_API_CACHE") {
    event.waitUntil(caches.delete(API_CACHE).catch(() => {}));
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  if (!payload || typeof payload !== "object" || !payload.title) return;
  event.waitUntil(
    self.registration.showNotification(String(payload.title), {
      body: typeof payload.body === "string" ? payload.body : "",
      dir: "rtl",
      lang: "ar",
      icon: ICON,
      badge: ICON,
      data: { url: typeof payload.url === "string" ? payload.url : "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let target = new URL("/", self.location.origin).href;
  try {
    const u = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);
    if (u.origin === self.location.origin) target = u.href;
  } catch {}
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).origin === self.location.origin && "focus" in c) {
          return c.focus().then((f) => (f && "navigate" in f ? f.navigate(target) : f));
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
