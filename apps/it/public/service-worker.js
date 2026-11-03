/* eslint-disable no-restricted-globals */
// The IT site has no offline copy. Before it existed, this host name showed
// the everyday app, whose service worker (same file name) may still be
// installed on a phone and keep showing that app. The browser fetches this
// file when it checks for an update: it clears every cache, removes itself
// and reloads the open pages, which then load the IT site from the server.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
    await self.registration.unregister();
    const pages = await self.clients.matchAll({ type: "window" });
    pages.forEach((page) => page.navigate(page.url));
  })());
});
