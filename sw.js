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

/* Đổi số này MỖI KHI sửa dashboard.html / vsat.html / các tệp trong CORE.
   Lúc service worker mới kích hoạt, toàn bộ cache cũ bị xoá, nên không máy
   nào còn phục vụ bản cũ nữa. Không đổi thì cuộc đua 2,5 giây bên dưới có
   thể trả về bản đã lưu — đúng lỗi đã khiến một đề tải lên bằng bản
   dashboard cũ và chỉ sinh được 1 bài tập ngữ pháp. */
const CACHE = "learning-ecology-v10";

// Phase 43: how long a navigation waits for the network before the last good
// copy is shown instead. On a healthy connection the network always wins, so
// a freshly uploaded file still appears immediately; on a slow or flaky
// connection the page opens at once and the fresh copy lands in the cache for
// the next visit.
const SLOW_NETWORK_MS = 2500;

// The app shell, pre-cached at install so the first offline
// launch works. Files that fail to cache are skipped silently
// (the worker still installs).
const CORE = [
  "./",
  "./index.html",
  "./course.html",
  "./login.html",
  "./profile.jpg",
  "./dashboard.html",
  "./admin.html",
  "./teacher.html",
  "./organizations.html",
  "./reset.html",
  "./reading.html",
  "./shadow.html",
  "./writing.html",
  "./dictation.html",
  "./vsat.html",
  "./vstep.html",
  "./cert.html",
  "./styles.css",
  "./ui.js",
  "./lang.js",
  "./tracker.js",
  "./config.js",
  "./manifest.json",
  "./icons/logo-64.png",
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

  // Pages, CSS and JS: still network first, so a new upload is picked up right
  // away — but a slow network no longer means a blank screen. If the response
  // has not arrived within SLOW_NETWORK_MS the cached copy is shown instead,
  // and the network reply (whenever it lands) refreshes the cache.
  e.respondWith(
    new Promise((resolve) => {
      let sent = false;
      const send = (r) => { if (!sent && r) { sent = true; resolve(r); } };

      const slow = setTimeout(() => {
        caches.match(e.request).then((hit) => send(hit));
      }, SLOW_NETWORK_MS);

      fetch(e.request)
        .then((res) => {
          clearTimeout(slow);
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          send(res);
        })
        .catch(() => {
          clearTimeout(slow);
          caches.match(e.request, { ignoreSearch: false })
            .then((hit) => send(hit || caches.match("./login.html")));
        });
    })
  );
});
