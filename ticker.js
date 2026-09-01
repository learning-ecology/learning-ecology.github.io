/* ============================================================
   ticker.js — shared announcement ticker for the WHOLE site.

   One centralized component, reused on every public-facing page
   (course preview, Reading, VSTEP, V-SAT, HSK, tools, dashboard…).
   • Works logged-OUT (RLS lets anyone read ticker_announcements).
   • Detects the current page → context tokens → shows only the
     announcements whose `targets` match (global = all pages).
   • Self-contained: injects its own scoped CSS + bar element, uses
     the global `sb` from config.js. Loads on its own path so it
     never blocks the page. Fails silently if the table is absent.

   Owner管理 lives in dashboard.html; it calls window.LETicker.reload()
   after any change so every page reflects it on next load.
   ============================================================ */
(function () {
  "use strict";
  if (window.LETicker) return;                       // guard against double-include

  var STORE_KEY = "le_ticker_dismissed";

  /* ---- current-page context tokens --------------------------------------
     A page matches an announcement when the announcement is global
     (no targets / "all") OR shares at least one token with the page. */
  var PAGE_MAP = {
    "":                     ["home", "page:index"],
    "index.html":           ["home", "page:index"],
    "course.html":          ["courses", "page:course"],
    "reading.html":         ["reading", "tools", "page:reading"],
    "shadow.html":          ["chinese", "tools", "page:shadow"],
    "dictation.html":       ["chinese", "tools", "page:dictation"],
    "writing.html":         ["chinese", "tools", "page:writing"],
    "hsk-slides.html":      ["hsk", "chinese", "tools", "page:hsk", "page:hsk-slides"],
    "vocab-practice.html":  ["hsk", "chinese", "tools", "page:vocab", "page:vocab-practice"],
    "vstep.html":           ["vstep", "english", "tools", "page:vstep"],
    "vstep-listening.html": ["vstep", "english", "tools", "page:vstep", "page:vstep-listening"],
    "vsat.html":            ["vsat", "english", "tools", "page:vsat"],
    "eng-placement.html":   ["english", "tools", "page:eng-placement"],
    "dashboard.html":       ["dashboard", "page:dashboard"],
    "cert.html":            ["page:cert"]
  };

  function pageContext() {
    var file = (location.pathname.split("/").pop() || "").toLowerCase();
    var base = PAGE_MAP[file] || ["page:" + file.replace(/\.html$/, "")];
    var ctx = base.slice();
    // course preview: add the specific course id from ?id=…
    if (file === "course.html") {
      try { var id = new URLSearchParams(location.search).get("id"); if (id) ctx.push("course:" + id); } catch (e) {}
    }
    // a page may add extra tokens (e.g. reading sets its current language,
    // course.html sets the viewed course's category) before/while we run.
    if (Array.isArray(window.LE_TICKER_CTX)) ctx = ctx.concat(window.LE_TICKER_CTX);
    var seen = {}, out = [];
    ctx.forEach(function (t) { if (t && !seen[t]) { seen[t] = 1; out.push(String(t)); } });
    return out;
  }

  function matches(ann, ctx) {
    var t = (ann.targets || []).filter(Boolean);
    if (!t.length || t.indexOf("all") !== -1) return true;   // global
    for (var i = 0; i < t.length; i++) if (ctx.indexOf(t[i]) !== -1) return true;
    return false;
  }

  function activeNow(rows) {
    var now = Date.now();
    return (rows || []).filter(function (a) {
      return a && a.enabled && (a.text || "").trim()
        && (!a.starts_at || Date.parse(a.starts_at) <= now)
        && (!a.ends_at   || Date.parse(a.ends_at)   >= now);
    });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function dismissed() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); } catch (e) { return []; } }
  function dismiss(ids) {
    try { var s = {}; dismissed().concat(ids).forEach(function (i) { s[i] = 1; });
      localStorage.setItem(STORE_KEY, JSON.stringify(Object.keys(s))); } catch (e) {}
  }

  function itemHtml(a) {
    var inner = (a.icon ? '<span class="le-tk__ic">' + esc(a.icon) + "</span>" : "") + "<span>" + esc(a.text) + "</span>";
    var url = (a.url || "").trim();
    if (url) {
      var safe = /^(https?:|mailto:|\/)/i.test(url) ? url : "https://" + url;   // never javascript: etc.
      return '<a class="le-tk__item" href="' + esc(safe) + '"' + (a.new_tab ? ' target="_blank" rel="noopener"' : "") + ">" + inner + "</a>";
    }
    return '<span class="le-tk__item">' + inner + "</span>";
  }
  function segHtml(list) { return list.map(itemHtml).join('<span class="le-tk__sep">◆</span>'); }
  function trackHtml(list) {
    var seg = segHtml(list);
    return '<div class="le-tk__vp"><div class="le-tk__track">'
      + '<div class="le-tk__seg">' + seg + "</div>"
      + '<div class="le-tk__seg" aria-hidden="true">' + seg + "</div>"
      + "</div></div>";
  }
  // duration ∝ content width (~60px/s) so speed is steady and readable
  function startAnim(box) {
    var seg = box.querySelector(".le-tk__seg"), track = box.querySelector(".le-tk__track");
    if (!seg || !track) return;
    var w = seg.getBoundingClientRect().width;
    if (w > 0) track.style.animationDuration = Math.max(14, Math.round(w / 60)) + "s";
  }
  function safeUrl(u) {
    u = String(u || "").trim();
    return /^(https?:|mailto:|\/)/i.test(u) ? u : (u ? "https://" + u : "");
  }
  function isGlobal(l) { var t = (l.targets || []).filter(Boolean); return !t.length || t.indexOf("all") !== -1; }
  // most specific matching link for a platform (page-targeted beats global)
  function pickLink(links, platform, ctx) {
    var cands = (links || []).filter(function (l) {
      return l.platform === platform && l.enabled && safeUrl(l.url) && (l.title || "").trim() && matches(l, ctx);
    });
    if (!cands.length) return null;
    var specific = cands.filter(function (l) { return !isGlobal(l); });
    var pool = specific.length ? specific : cands;
    pool.sort(function (a, b) {
      return (a.sort_order - b.sort_order) || String(a.created_at || "").localeCompare(String(b.created_at || ""));
    });
    return pool[0];
  }
  function grpHtml(link, platform) {
    var icon = platform === "zalo" ? "Z" : "f";
    return '<a class="le-tk__grp le-tk__grp--' + (platform === "zalo" ? "zalo" : "fb") + '" href="'
      + esc(safeUrl(link.url)) + '" target="_blank" rel="noopener">'
      + '<span class="ic">' + icon + '</span><span class="txt">' + esc(link.title) + "</span></a>";
  }
  function linksHtml(links, ctx) {
    var out = [];
    var z = pickLink(links, "zalo", ctx); if (z) out.push(grpHtml(z, "zalo"));
    var f = pickLink(links, "facebook", ctx); if (f) out.push(grpHtml(f, "facebook"));
    return out.length ? '<div class="le-tk__links">' + out.join("") + "</div>" : "";
  }

  var CSS =
    ".le-tk{position:relative;display:flex;align-items:stretch;overflow:hidden;" +
      "background:#fff3df;color:#5b3f16;border-bottom:1px solid #f0dab4;" +
      "font-family:inherit;font-size:0.9rem;line-height:1.2;z-index:60;}" +
    ".le-tk[hidden]{display:none;}" +
    ".le-tk__vp{flex:1 1 auto;min-width:0;overflow:hidden;" +
      "-webkit-mask-image:linear-gradient(90deg,transparent,#000 2.2rem,#000 calc(100% - 2.2rem),transparent);" +
      "mask-image:linear-gradient(90deg,transparent,#000 2.2rem,#000 calc(100% - 2.2rem),transparent);}" +
    ".le-tk__track{display:flex;width:max-content;white-space:nowrap;will-change:transform;animation:leTkScroll 30s linear infinite;}" +
    ".le-tk:hover .le-tk__track,.le-tk__track:focus-within{animation-play-state:paused;}" +
    ".le-tk__seg{display:flex;align-items:center;padding:0.55rem 0;}" +
    ".le-tk__item{display:inline-flex;align-items:center;gap:0.4rem;color:inherit;text-decoration:none;}" +
    "a.le-tk__item:hover span:last-child{text-decoration:underline;}" +
    ".le-tk__ic{font-size:1.05em;line-height:1;}" +
    ".le-tk__sep{margin:0 1.5rem;opacity:0.4;}" +
    ".le-tk__close{flex:none;align-self:center;background:transparent;border:0;cursor:pointer;color:inherit;" +
      "font-size:1.2rem;line-height:1;padding:0 0.75rem;opacity:0.55;}" +
    ".le-tk__close:hover{opacity:1;}" +
    // fixed group links (Zalo / Facebook) on the left — they do NOT scroll
    ".le-tk__links{flex:none;display:flex;align-items:center;gap:0.55rem;padding:0.4rem 0.2rem 0.4rem 0.9rem;max-width:60%;}" +
    ".le-tk__grp{display:inline-flex;align-items:center;gap:0.35rem;color:inherit;text-decoration:none;font-weight:700;white-space:nowrap;font-size:0.86rem;}" +
    ".le-tk__grp:hover .txt{text-decoration:underline;}" +
    ".le-tk__grp .ic{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:5px;" +
      "font-size:10px;font-weight:800;color:#fff;flex:none;letter-spacing:-.02em;}" +
    ".le-tk__grp--zalo .ic{background:#0068ff;}" +
    ".le-tk__grp--fb .ic{background:#1877f2;font-family:Georgia,serif;}" +
    ".le-tk__div{flex:none;width:1px;align-self:stretch;background:currentColor;opacity:0.18;margin:0.45rem 0.4rem;}" +
    "@media (max-width:640px){.le-tk{font-size:0.82rem;}.le-tk__sep{margin:0 1rem;}.le-tk__close{padding:0 0.5rem;}" +
      ".le-tk__links{gap:0.35rem;padding-left:0.5rem;max-width:52%;}.le-tk__grp{font-size:0.76rem;}}" +
    "@media (max-width:460px){.le-tk__grp .txt{max-width:8ch;overflow:hidden;text-overflow:ellipsis;}}" +
    "@media (prefers-color-scheme:dark){.le-tk{background:#2b2440;color:#f1e7d7;border-bottom-color:#3c3555;}}" +
    "@media (prefers-reduced-motion:reduce){.le-tk__track{animation:none;}.le-tk__vp{overflow-x:auto;-webkit-mask-image:none;mask-image:none;}" +
      ".le-tk__vp::-webkit-scrollbar{display:none;}.le-tk__seg:nth-child(2){display:none;}}" +
    "@keyframes leTkScroll{from{transform:translateX(0);}to{transform:translateX(-50%);}}";

  function injectStyle() {
    if (document.getElementById("le-tk-style")) return;
    var st = document.createElement("style");
    st.id = "le-tk-style"; st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }
  function barEl() {
    var bar = document.getElementById("le-ticker-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "le-ticker-bar"; bar.className = "le-tk"; bar.hidden = true;
      if (document.body) document.body.insertBefore(bar, document.body.firstChild);
    }
    return bar;
  }

  var LOADED = null;   // announcements, cached across reload()s within a page load
  var LINKS = null;    // group links (Zalo / Facebook)

  function render() {
    injectStyle();
    var bar = barEl();
    if (!bar) return;
    var ctx = pageContext();
    var gone = dismissed();
    var list = activeNow(LOADED).filter(function (a) { return matches(a, ctx); })
      .filter(function (a) { return gone.indexOf(a.id) === -1; });
    var lh = linksHtml(LINKS, ctx);
    if (!list.length && !lh) { bar.hidden = true; bar.innerHTML = ""; return; }
    bar.innerHTML = lh
      + (lh && list.length ? '<div class="le-tk__div"></div>' : "")
      + (list.length ? trackHtml(list) : "")
      + (list.length ? '<button class="le-tk__close" id="le-ticker-close" title="Ẩn thông báo" aria-label="Dismiss">×</button>' : "");
    bar.hidden = false;
    if (list.length) startAnim(bar);
    var close = document.getElementById("le-ticker-close");
    // dismissing hides only the scrolling text; fixed group links stay
    if (close) close.onclick = function () { dismiss(list.map(function (a) { return a.id; })); render(); };
  }

  async function fetchTable(name, order2) {
    if (typeof sb === "undefined" || !sb) return [];
    try {
      var q = sb.from(name).select("*").order("sort_order");
      if (order2) q = q.order("created_at");
      var r = await q;
      if (r.error) return [];
      return r.data || [];
    } catch (e) { return []; }
  }

  async function reload() {
    var res = await Promise.all([fetchTable("ticker_announcements", true), fetchTable("ticker_links", false)]);
    LOADED = res[0]; LINKS = res[1];
    render();
  }
  function rerender() { render(); }   // re-filter with the current page context, no refetch

  window.LETicker = {
    reload: reload,
    rerender: rerender,
    setContext: function (tokens) { window.LE_TICKER_CTX = Array.isArray(tokens) ? tokens : []; rerender(); },
    // helpers reused by the owner-dashboard preview
    previewHTML: function (ann) { return trackHtml([ann]); },
    linkPreviewHTML: function (link, platform) { return '<div class="le-tk__links">' + grpHtml(link, platform) + "</div>"; },
    startAnim: startAnim
  };

  function boot() { injectStyle(); barEl(); reload(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
