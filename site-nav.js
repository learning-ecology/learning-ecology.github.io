/* ============================================================
   site-nav.js — ONE shared top navigation for the public pages
   (index.html landing + course.html materials).

   Goal: students who open course.html directly (from a shared link)
   can still reach the landing page (announcements, teacher & school
   info, contact) and jump between the Chinese / English / tools
   sections of the materials page — with a single, consistent nav.

   Self-contained: injects its own scoped CSS (.se-*), builds a
   sticky bar right below the page's existing .lp-header (which keeps
   the logo + login/account on the right), and wires all behaviour.
   No external libraries. Reuses the site's own header colours
   (--lp-header-bg / --lp-header-text) so it matches every brand/theme.

   A page may expose window.SiteNavHooks = { gotoSection(key) } to
   handle its own in-page section activation (course.html does this);
   otherwise the nav scrolls to #key or navigates cross-page.
   ============================================================ */
(function () {
  "use strict";
  if (window.SiteNav) return;                        // guard double-include

  var REDUCED = false;
  try { REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  /* ---- home / book icons (inline SVG, currentColor) ---------------------- */
  var IC_HOME = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">'
    + '<path fill="currentColor" d="M12 3.2 2.6 11.1a1 1 0 0 0 .65 1.76H4.5V20a1 1 0 0 0 1 1H9.5a1 1 0 0 0 1-1v-4.2h3V20a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-7.14h1.25a1 1 0 0 0 .65-1.76Z"/></svg>';
  var IC_BOOK = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false">'
    + '<path fill="currentColor" d="M5 3.5A2.5 2.5 0 0 0 2.5 6v12.2A1.8 1.8 0 0 0 4.3 20H12V5.6A2.1 2.1 0 0 0 9.9 3.5Zm9 0v16.5h7.7a1.8 1.8 0 0 0 1.8-1.8V6A2.5 2.5 0 0 0 21 3.5h-4.9A2.1 2.1 0 0 0 14 5.6Z"/></svg>';

  /* ---- the primary items (identical on every page) ----------------------- */
  var LINKS = [
    { key: "home",    label: "Trang chủ",           href: "index.html",                  page: "index",  section: "",                 icon: IC_HOME, home: true, group: "a" },
    { key: "courses", label: "Khóa học & Tài liệu", href: "course.html",                 page: "course", section: "",                 icon: IC_BOOK, group: "a" },
    { key: "zh",      label: "Tiếng Trung",         href: "course.html#tieng-trung",     page: "course", section: "tieng-trung",      group: "a" },
    { key: "en",      label: "Tiếng Anh",           href: "course.html#tieng-anh",       page: "course", section: "tieng-anh",        group: "a" },
    { key: "tools",   label: "Công cụ học tập",     href: "course.html#cong-cu-hoc-tap", page: "course", section: "cong-cu-hoc-tap",  group: "a" },
    { key: "new",     label: "Khóa học mới",        href: "index.html#khoa-hoc",         page: "index",  section: "khoa-hoc",         badge: "Mới", group: "b" },
    { key: "about",   label: "Giới thiệu",          href: "index.html#giao-vien",        page: "index",  section: "giao-vien",        group: "b" },
    { key: "contact", label: "Liên hệ",             href: "index.html#lien-he",          page: "index",  section: "lien-he",          group: "b" }
  ];

  function pageFile() { return (location.pathname.split("/").pop() || "index.html").toLowerCase() || "index.html"; }
  function isIndex(file) { return file === "" || file === "index.html" || file === "/"; }
  function currentPage() { return isIndex(pageFile()) ? "index" : (pageFile() === "course.html" ? "course" : "other"); }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

  /* ---- scoped CSS -------------------------------------------------------- */
  function injectCSS() {
    if (document.getElementById("se-nav-css")) return;
    var css = ""
      + ".se-nav{position:sticky;z-index:45;top:var(--se-header-h,0px);"
      + "background:var(--lp-header-bg,rgba(23,38,62,0.97));color:var(--lp-header-text,#fff);"
      + "border-top:1px solid rgba(255,255,255,0.12);box-shadow:0 6px 18px -14px rgba(0,0,0,.6);"
      + "backdrop-filter:blur(8px);font-family:inherit;}"
      + ".se-nav-in{max-width:1180px;margin:0 auto;display:flex;align-items:center;gap:.35rem;"
      + "padding:.3rem clamp(.75rem,4vw,2.5rem);min-height:46px;}"
      + ".se-list{list-style:none;display:flex;align-items:center;gap:.1rem;margin:0;padding:0;flex-wrap:wrap;flex:1;}"
      + ".se-sep{width:1px;align-self:stretch;margin:.35rem .35rem;background:rgba(255,255,255,.18);}"
      + ".se-link{display:inline-flex;align-items:center;gap:.35rem;text-decoration:none;color:inherit;"
      + "font:inherit;font-size:.9rem;font-weight:600;line-height:1;padding:.5rem .6rem;border-radius:999px;"
      + "border:1px solid transparent;white-space:nowrap;position:relative;transition:background .15s,color .15s,border-color .15s;}"
      + ".se-link:hover{background:rgba(255,255,255,.12);}"
      + ".se-link:focus-visible{outline:2px solid var(--gold,#f0c04a);outline-offset:2px;}"
      + ".se-link .se-ic{display:inline-flex;opacity:.95;}"
      + ".se-link.se-active{background:rgba(255,255,255,.16);}"
      + ".se-link.se-active::after{content:'';position:absolute;left:.7rem;right:.7rem;bottom:-.32rem;height:3px;"
      + "border-radius:3px;background:var(--gold,#f0c04a);}"
      + ".se-link.se-home{background:var(--gold,#f0c04a);color:#3a2c05;border-color:transparent;font-weight:800;}"
      + ".se-link.se-home:hover{filter:brightness(1.05);}"
      + ".se-link.se-home.se-active::after{display:none;}"
      + ".se-badge{font-size:.62rem;font-weight:800;letter-spacing:.02em;background:#e23b3b;color:#fff;"
      + "border-radius:999px;padding:.08rem .4rem;margin-left:.1rem;text-transform:uppercase;}"
      + ".se-link.se-new{border-color:color-mix(in srgb,var(--gold,#f0c04a) 60%,transparent);}"
      /* hamburger */
      + ".se-burger{display:none;align-items:center;gap:.45rem;margin-left:auto;background:rgba(255,255,255,.1);"
      + "color:inherit;border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:.45rem .8rem;"
      + "font:inherit;font-size:.9rem;font-weight:700;cursor:pointer;}"
      + ".se-burger:focus-visible{outline:2px solid var(--gold,#f0c04a);outline-offset:2px;}"
      + ".se-burger-x{display:none;}"
      /* promo strip */
      + ".se-promo{background:color-mix(in srgb,var(--gold,#f0c04a) 16%,#fff);"
      + "border-bottom:1px solid color-mix(in srgb,var(--gold,#f0c04a) 40%,transparent);color:var(--ink,#17263e);}"
      + ":root[data-theme='dark'] .se-promo{background:rgba(240,192,74,.12);color:var(--ink,#e8eef7);}"
      + ".se-promo-in{max-width:1180px;margin:0 auto;display:flex;align-items:center;gap:.7rem;flex-wrap:wrap;"
      + "padding:.55rem clamp(.75rem,4vw,2.5rem);}"
      + ".se-promo .se-pm-txt{flex:1;min-width:200px;font-size:.92rem;line-height:1.35;}"
      + ".se-promo .se-pm-txt b{font-size:.98rem;}"
      + ".se-promo .se-pm-badge{font-size:.62rem;font-weight:800;background:#e23b3b;color:#fff;border-radius:999px;"
      + "padding:.08rem .45rem;margin-left:.35rem;text-transform:uppercase;vertical-align:middle;}"
      + ".se-promo .se-pm-cta{text-decoration:none;background:var(--lp-header-bg,#17263e);color:#fff;font-weight:700;"
      + "font-size:.9rem;border-radius:999px;padding:.45rem 1rem;white-space:nowrap;border:1px solid transparent;}"
      + ".se-promo .se-pm-cta:hover{filter:brightness(1.08);}"
      + ".se-promo .se-pm-cta:focus-visible{outline:2px solid var(--lp-header-bg,#17263e);outline-offset:2px;}"
      + ".se-promo .se-pm-close{background:transparent;border:none;color:inherit;font-size:1.25rem;line-height:1;"
      + "cursor:pointer;padding:.1rem .4rem;border-radius:8px;opacity:.7;}"
      + ".se-promo .se-pm-close:hover{opacity:1;background:rgba(0,0,0,.06);}"
      + ".se-promo .se-pm-close:focus-visible{outline:2px solid var(--lp-header-bg,#17263e);outline-offset:1px;}"
      /* ---- tablet / mobile: collapse to a hamburger dropdown ---- */
      + "@media(max-width:1024px){"
      + ".se-nav-in{flex-wrap:nowrap;}"
      + ".se-burger{display:inline-flex;}"
      + ".se-list{position:absolute;left:0;right:0;top:100%;flex-direction:column;align-items:stretch;gap:0;"
      + "background:var(--lp-header-bg,rgba(23,38,62,0.99));border-top:1px solid rgba(255,255,255,.14);"
      + "box-shadow:0 20px 40px -18px rgba(0,0,0,.7);padding:.4rem;max-height:76vh;overflow:auto;display:none;}"
      + ".se-nav.se-open .se-list{display:flex;}"
      + ".se-nav.se-open .se-burger .se-burger-open{display:none;}"
      + ".se-nav.se-open .se-burger .se-burger-x{display:inline;}"
      + ".se-list .se-sep{display:none;}"
      + ".se-link{width:100%;font-size:1.02rem;padding:.85rem 1rem;border-radius:12px;justify-content:flex-start;}"
      + ".se-link.se-active::after{display:none;}"
      + ".se-link.se-active{background:rgba(255,255,255,.2);}"
      + ".se-link.se-home{margin-bottom:.15rem;}"
      + "}"
      + "@media(max-width:430px){.se-promo .se-pm-txt{font-size:.86rem;}}";
    var st = document.createElement("style");
    st.id = "se-nav-css";
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* ---- build the bar ----------------------------------------------------- */
  var navEl = null, listEl = null, burgerEl = null, promoEl = null, header = null;
  var page = "other";

  function build() {
    header = document.querySelector(".lp-header");
    if (!header) return false;
    page = currentPage();

    navEl = document.createElement("nav");
    navEl.className = "se-nav";
    navEl.setAttribute("aria-label", "Điều hướng chính");

    var itemsHtml = "";
    var prevGroup = null;
    LINKS.forEach(function (l) {
      if (prevGroup && l.group !== prevGroup) itemsHtml += '<li class="se-sep" aria-hidden="true"></li>';
      prevGroup = l.group;
      var cls = "se-link" + (l.home ? " se-home" : "") + (l.badge ? " se-new" : "");
      itemsHtml += '<li><a class="' + cls + '" href="' + esc(l.href) + '" data-key="' + esc(l.key) + '">'
        + (l.icon ? '<span class="se-ic">' + l.icon + "</span>" : "")
        + "<span>" + esc(l.label) + "</span>"
        + (l.badge ? '<span class="se-badge" data-badge>' + esc(l.badge) + "</span>" : "")
        + "</a></li>";
    });

    navEl.innerHTML =
      '<div class="se-nav-in">'
      + '<ul class="se-list" id="seList">' + itemsHtml + "</ul>"
      + '<button class="se-burger" id="seBurger" type="button" aria-expanded="false" aria-controls="seList" aria-haspopup="true">'
      + '<span class="se-burger-open" aria-hidden="true">☰</span><span class="se-burger-x" aria-hidden="true">✕</span>'
      + '<span>Menu</span></button>'
      + "</div>";

    header.insertAdjacentElement("afterend", navEl);
    listEl = navEl.querySelector("#seList");
    burgerEl = navEl.querySelector("#seBurger");
    return true;
  }

  /* ---- sticky offset: nav sits directly under the header ------------------ */
  function measure() {
    if (!header || !navEl) return;
    var hh = Math.round(header.getBoundingClientRect().height);
    document.documentElement.style.setProperty("--se-header-h", hh + "px");
    var stick = hh + Math.round(navEl.getBoundingClientRect().height);
    document.documentElement.style.setProperty("--se-stick", stick + "px");
  }
  function watchSize() {
    measure();
    try {
      var ro = new ResizeObserver(measure);
      ro.observe(header); ro.observe(navEl);
    } catch (e) {}
    addEventListener("resize", measure, { passive: true });
    addEventListener("load", measure);
    setTimeout(measure, 300); setTimeout(measure, 1200);
  }

  /* ---- smooth scroll honouring the sticky header ------------------------- */
  function stickH() {
    var v = getComputedStyle(document.documentElement).getPropertyValue("--se-stick");
    var n = parseInt(v, 10); return isNaN(n) ? 90 : n;
  }
  /* Manual, dependency-free smooth scroll: reliable across browsers (some
     no-op scrollTo{behavior:'smooth'}) and honours reduced-motion. */
  function animateScrollTo(top) {
    top = Math.max(0, Math.round(top));
    if (REDUCED) { window.scrollTo(0, top); return; }
    var start = scrollY, dist = top - start;
    if (Math.abs(dist) < 2) { window.scrollTo(0, top); return; }
    var dur = Math.min(650, Math.max(260, Math.abs(dist) * 0.5)), t0 = Date.now();
    (function step() {
      var p = Math.min(1, (Date.now() - t0) / dur);
      var e = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;   // easeInOutQuad
      window.scrollTo(0, Math.round(start + dist * e));
      if (p < 1) setTimeout(step, 16);
    })();
  }
  function scrollToEl(el) {
    if (!el) return false;
    animateScrollTo(el.getBoundingClientRect().top + scrollY - stickH() - 10);
    return true;
  }
  function scrollToTop() { animateScrollTo(0); }

  /* Navigate to a section on the CURRENT page.
     Returns "hook" (page handled it + owns the URL), "scroll" (we scrolled),
     or false (nothing to do). */
  function gotoSectionHere(key) {
    if (!key) { scrollToTop(); return "scroll"; }
    if (window.SiteNavHooks && typeof window.SiteNavHooks.gotoSection === "function") {
      try { if (window.SiteNavHooks.gotoSection(key)) return "hook"; } catch (e) {}
    }
    var el = document.getElementById(key);
    if (el && !el.hidden) return scrollToEl(el) ? "scroll" : false;
    return false;
  }

  /* ---- active-state highlighting ----------------------------------------- */
  var linkByKey = {};
  var basePageKey = "home";              // the item representing THIS page
  function indexLinks() {
    navEl.querySelectorAll(".se-link").forEach(function (a) { linkByKey[a.getAttribute("data-key")] = a; });
  }
  function clearActive() {
    navEl.querySelectorAll(".se-link").forEach(function (a) {
      a.classList.remove("se-active"); a.removeAttribute("aria-current");
    });
  }
  function applyPageCurrent() { var a = linkByKey[basePageKey]; if (a) a.setAttribute("aria-current", "page"); }
  /* Give the underline to `key`; the current-page item always keeps
     aria-current="page", section items get aria-current="location". */
  var lockedKey = null;
  function setActive(key) {
    clearActive();
    var a = linkByKey[key];
    if (a) { a.classList.add("se-active"); a.setAttribute("aria-current", key === basePageKey ? "page" : "location"); }
    if (key !== basePageKey) applyPageCurrent();
  }
  // public: pages call this when their own section changes (e.g. course category)
  function setActiveSection(key) { lockedKey = key || null; setActive(key || basePageKey); }

  /* index.html: highlight the item matching the section currently in view */
  function spyIndex() {
    if (lockedKey) return;
    var candidates = LINKS.filter(function (l) { return l.page === "index" && l.section; });
    var line = scrollY + stickH() + 20;
    var activeKey = "home";
    // if near the very top → Home
    if (scrollY > 40) {
      candidates.forEach(function (l) {
        var el = document.getElementById(l.section);
        if (el && !el.hidden && (el.getBoundingClientRect().top + scrollY) <= line) activeKey = l.key;
      });
    }
    if (scrollY + innerHeight >= document.documentElement.scrollHeight - 4) {
      // bottom of page → the last index section that exists (contact)
      var last = candidates[candidates.length - 1];
      if (last && document.getElementById(last.section)) activeKey = last.key;
    }
    setActive(activeKey);
  }

  /* ---- hamburger menu ---------------------------------------------------- */
  function openMenu() { navEl.classList.add("se-open"); burgerEl.setAttribute("aria-expanded", "true"); }
  function closeMenu() { navEl.classList.remove("se-open"); burgerEl.setAttribute("aria-expanded", "false"); }
  function menuOpen() { return navEl.classList.contains("se-open"); }

  function wire() {
    indexLinks();
    basePageKey = (page === "course") ? "courses" : "home";

    // link clicks
    listEl.addEventListener("click", function (e) {
      var a = e.target.closest("a.se-link"); if (!a) return;
      var url;
      try { url = new URL(a.getAttribute("href"), location.href); } catch (err) { return; }
      var targetFile = (url.pathname.split("/").pop() || "index.html").toLowerCase();
      var samePage = (isIndex(targetFile) && page === "index") || (targetFile === "course.html" && page === "course");
      if (samePage) {
        e.preventDefault();
        var key = url.hash ? url.hash.slice(1) : "";
        var res = gotoSectionHere(key);
        // only site-nav-driven scrolls update the URL here; when the page hook
        // handles it ("hook"), the page owns history so we don't double-push
        if (res === "scroll") {
          try { history.pushState(null, "", url.hash || (url.pathname.split("/").pop() || "index.html")); } catch (er) {}
          setActive(a.getAttribute("data-key"));   // instant highlight (spy refines on scroll)
        }
      }
      // cross-page: let the browser follow the real href (destination handles the hash on load)
      closeMenu();
    });

    // burger
    burgerEl.addEventListener("click", function (e) {
      e.stopPropagation();
      if (menuOpen()) closeMenu(); else openMenu();
    });
    // close on outside click / Escape
    document.addEventListener("click", function (e) { if (menuOpen() && !navEl.contains(e.target)) closeMenu(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && menuOpen()) { closeMenu(); burgerEl.focus(); } });

    // reflect active page immediately
    setActive(basePageKey);

    // scroll spy (index only; course drives it via setActiveSection)
    if (page === "index") {
      var q = null;
      addEventListener("scroll", function () { if (q) return; q = setTimeout(function () { q = null; spyIndex(); }, 100); }, { passive: true });
      addEventListener("resize", spyIndex, { passive: true });
      spyIndex();
    }

    // browser back/forward → re-apply hash target
    addEventListener("hashchange", function () { applyIncomingHash(); });
  }

  /* ---- handle an incoming #hash (deep link / back-forward) ---------------- */
  function applyIncomingHash() {
    var h = location.hash ? location.hash.slice(1) : "";
    if (!h) return;
    // only act on hashes that are real nav targets
    var known = LINKS.some(function (l) { return l.section === h; }) || document.getElementById(h);
    if (!known) return;
    gotoSectionHere(h);
  }

  /* ---- promotional "explore the homepage" strip (course.html) ------------- */
  var PROMO_KEY = "le_home_promo_dismissed";
  var PROMO_DAYS = 14;
  function promoDismissed() {
    try {
      var v = localStorage.getItem(PROMO_KEY);
      if (!v) return false;
      return (Date.now() - Number(v)) < PROMO_DAYS * 864e5;
    } catch (e) { return false; }
  }
  function renderPromo(cfg) {
    if (page !== "course" || !navEl) return;
    cfg = cfg || (window.SITE_NAV_PROMO || {});
    if (cfg.show === false) { if (promoEl) { promoEl.remove(); promoEl = null; } return; }
    if (promoDismissed()) return;
    var title = cfg.title || "Khám phá Learning Ecology";
    var desc = cfg.desc || "Xem các khóa học mới, thông báo quan trọng và thông tin về giáo viên.";
    var btn = cfg.btnLabel || "Về trang chủ";
    var href = cfg.href || "index.html";
    var badge = cfg.badge ? '<span class="se-pm-badge">' + esc(cfg.badge) + "</span>" : "";
    if (promoEl) promoEl.remove();
    promoEl = document.createElement("div");
    promoEl.className = "se-promo";
    promoEl.setAttribute("role", "region");
    promoEl.setAttribute("aria-label", "Khám phá trang chủ");
    promoEl.innerHTML =
      '<div class="se-promo-in">'
      + '<div class="se-pm-txt"><b>' + esc(title) + "</b>" + badge + "<br>" + esc(desc) + "</div>"
      + '<a class="se-pm-cta" href="' + esc(href) + '">' + esc(btn) + "</a>"
      + '<button class="se-pm-close" type="button" aria-label="Ẩn thông báo này">✕</button>'
      + "</div>";
    navEl.insertAdjacentElement("afterend", promoEl);
    promoEl.querySelector(".se-pm-close").addEventListener("click", function () {
      try { localStorage.setItem(PROMO_KEY, String(Date.now())); } catch (e) {}
      promoEl.remove(); promoEl = null; measure();
    });
    measure();
  }

  /* ---- boot -------------------------------------------------------------- */
  function boot() {
    injectCSS();
    if (!build()) return;
    watchSize();
    wire();
    // hide the older per-page section menu on index (superseded by this nav)
    var old = document.getElementById("lpNav"); if (old) old.hidden = true;
    // apply any deep-link hash once things are in place
    setTimeout(applyIncomingHash, 60);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  /* ---- public API (used by course.html) ---------------------------------- */
  window.SiteNav = {
    setActiveSection: setActiveSection,   // (key|null) — highlight zh/en/tools, or reset
    applyHash: applyIncomingHash,          // re-run the #hash target (after async content loads)
    renderPromo: renderPromo,              // (cfg) — show/refresh the course.html promo strip
    goto: gotoSectionHere,
    remeasure: measure
  };
})();
