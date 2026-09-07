/* Saldova service worker — bewust minimaal en veilig.
 *
 * - API-verzoeken (/api/*) gaan ALTIJD naar het netwerk: nooit gecachete
 *   financiële data of sessies.
 * - Navigaties: netwerk eerst; zonder verbinding het offline-scherm.
 * - Statische bestanden (hashed chunks, iconen, OCR-bestanden): cache-first,
 *   zodat de app snel opent en bonnetjes scannen ook offline werkt.
 */
const VERSION = "saldova-v1";
const PRECACHE = ["/offline.html", "/icons/icon-192.png", "/manifest.webmanifest"];
const STATIC_PREFIXES = ["/_next/static/", "/icons/", "/tesseract/", "/tessdata/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // altijd live

  // Pagina's: netwerk eerst, offline-scherm als vangnet
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }

  // Statische bestanden: cache-first (hashed, dus veilig lang te bewaren)
  if (STATIC_PREFIXES.some((p) => url.pathname.startsWith(p))) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((cache) => cache.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
