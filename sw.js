/* SIBO Root Journal service worker: caches the app shell so it opens offline.
   build-pwa.py fills in VERSION and FILES; a new version replaces the old cache. */
const VERSION = "dd7be6d2c87d";
const FILES = ["./", "index.html", "knowledge.js", "core.js", "vault.js", "parser.js", "ui.js", "insights.js", "nutrition.js", "meals.js", "results.js", "voice.js", "foods.json", "stt-worker.js", "manifest.webmanifest", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"];
const CACHE = "root-journal-" + VERSION;

self.addEventListener("install", e => {
  // cache: "reload" skips the browser's HTTP cache, so a new version never installs stale files
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("root-journal-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// The display font (Google Fonts) and the PDF reader (cdnjs) load from other hosts; keep copies so they work offline.
// …and the speech library and its runtime (jsdelivr). The speech model itself is cached by the library.
const FONT_HOSTS = ["https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"];

// Same-origin GETs and the font: serve from cache, refresh in the background. Everything else goes to the network.
self.addEventListener("fetch", e => {
  const req = e.request, origin = new URL(req.url).origin;
  if (req.method !== "GET" || (origin !== location.origin && !FONT_HOSTS.includes(origin))) return;
  if (new URL(req.url).pathname.endsWith("/version.json")) return; // the update check always asks the network
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === "navigate" ? await cache.match("./") : null);
    // own files revalidate with the server rather than trusting the HTTP cache
    const fresh = (origin === location.origin ? fetch(req.url, { cache: "no-cache", credentials: "same-origin" }) : fetch(req)).then(res => { if (res.ok || res.type === "opaque") cache.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || fresh;
  }));
});
