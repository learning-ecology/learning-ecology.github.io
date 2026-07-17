// ------------------------------------------------------------
//  sw.js — service worker for Learning Ecology (Phase 5, PWA)
//
//  Strategy: NETWORK FIRST for everything on this site.
//  - Online: students always get the newest files (so uploading
//    new versions to GitHub keeps working exactly as before).
//  - Offline / flaky connection: the last good copy is served
//    from the cache, so the app still opens.
//  - Requests to other origins (Supabase, CDNs) are not touched.
// ------------------------------------------------------------

const CACHE = "learning-ecology-v4";

// The app shell, pre-cached at install so the first offline
// launch works. Files that fail to cache are skipped silently
// (the worker still installs).
const CORE = [
  "./",
  "./index.html",
  "./login.html",
  "./profile.jpg",
  "./dashboard.html",
  "./admin.html",
  "./teacher.html",
  "./organizations.html",
  "./reset.html",
  "./styles.css",
  "./ui.js",
  "./lang.js",
  "./tracker.js",
  "./config.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(CORE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;

  // Images: serve the cached copy INSTANTLY, refresh it in the
  // background ("stale-while-revalidate"). Icons, the logo, lesson
  // covers and photos rarely change, so this makes every page feel
  // immediate — and a changed image still arrives on the next view.
  if (/\.(png|jpg|jpeg|webp|gif|svg|ico)$/i.test(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then((hit) => {
        const net = fetch(e.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: false })
        .then((hit) => hit || caches.match("./login.html")))
  );
});
