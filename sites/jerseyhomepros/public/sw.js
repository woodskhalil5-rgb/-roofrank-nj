/* Jersey Home Pros service worker.
 * Deliberately does NOT cache pages or API responses: availability counts,
 * the Home Board and estimates must always be live. Its only jobs are to make
 * the site installable and to show a friendly page when there's no signal. */
const OFFLINE = "/offline.html";
const CACHE = "jhp-offline-v1";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return; // everything else goes straight to the network
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});
