/* =============================================================================
 * net-layout.js — resizable divider for the National English Test runner.
 * -----------------------------------------------------------------------------
 * PURELY a layout enhancement. It does NOT touch the test engine, data, timer,
 * scoring, or submission — it only injects a draggable vertical divider between
 * the passage column and the questions column (both rendered by TestRunner) and
 * drives a CSS variable (--net-split) that css/styles.css uses for their widths.
 *
 * The runner re-renders #section-area on every section change, so a
 * MutationObserver re-injects the divider whenever a fresh .passage-cols
 * appears. The chosen proportion lives on #host (survives navigation) and in
 * localStorage (survives reload). Disabled below MIN_VW → the CSS falls back to
 * the stacked responsive layout. The far-right question navigator is a separate
 * grid column and is never affected.
 * =========================================================================== */
(function () {
  "use strict";
  var HOST = "#host";
  var LS = "net-split";
  var DEFAULT = 46;                 // passage % of the two-panel track
  var MIN_PASS = 280, MIN_QUES = 320, HANDLE = 16;
  var MIN_VW = 900;                 // below this: stacked layout, no resize

  function host() { return document.querySelector(HOST); }
  function desktop() { return window.innerWidth >= MIN_VW; }
  function curPct() { var h = host(); var v = h && parseFloat(h.style.getPropertyValue("--net-split")); return isFinite(v) ? v : DEFAULT; }
  function apply(p) { var h = host(); if (h) h.style.setProperty("--net-split", p + "%"); }
  function getSaved() { try { var v = parseFloat(localStorage.getItem(LS)); return isFinite(v) ? v : DEFAULT; } catch (e) { return DEFAULT; } }
  function save(p) { try { localStorage.setItem(LS, String(p)); } catch (e) {} }
  function clampPct(cols, pct) {
    var w = cols.getBoundingClientRect().width || 1;
    var minP = (MIN_PASS / w) * 100;
    var maxP = 100 - (MIN_QUES / w) * 100 - (HANDLE / w) * 100;
    if (minP > maxP) return 50;
    return Math.max(minP, Math.min(maxP, pct));
  }

  function enhance(cols) {
    if (!cols || cols.__netEnhanced) return;
    cols.__netEnhanced = true;
    apply(getSaved());
    var passage = cols.querySelector(".passage-panel") || cols.children[0];
    if (!passage || cols.children.length < 2) return;

    var div = document.createElement("div");
    div.className = "net-divider";
    div.setAttribute("role", "separator");
    div.setAttribute("aria-orientation", "vertical");
    div.setAttribute("aria-label", "Kéo để chỉnh độ rộng đề và câu hỏi (nhấn đúp để đặt lại)");
    div.tabIndex = 0;
    div.innerHTML = '<button type="button" class="net-reset" title="Đặt lại bố cục" aria-label="Đặt lại bố cục">↔</button>';
    if (passage.nextSibling) cols.insertBefore(div, passage.nextSibling); else cols.appendChild(div);
    wire(cols, div);
  }

  function wire(cols, div) {
    var dragging = false;
    function pctFromEvent(e) {
      var r = cols.getBoundingClientRect();
      var x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      return clampPct(cols, (x / (r.width || 1)) * 100);
    }
    function move(e) { if (!dragging) return; apply(pctFromEvent(e)); if (e.cancelable) e.preventDefault(); }
    function end() {
      if (!dragging) return;
      dragging = false; document.body.classList.remove("net-resizing"); save(curPct());
      document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", end);
      document.removeEventListener("touchmove", move); document.removeEventListener("touchend", end);
    }
    function start(e) {
      if (!desktop() || (e.target && e.target.classList.contains("net-reset"))) return;
      dragging = true; document.body.classList.add("net-resizing");
      if (e.cancelable) e.preventDefault();
      document.addEventListener("mousemove", move); document.addEventListener("mouseup", end);
      document.addEventListener("touchmove", move, { passive: false }); document.addEventListener("touchend", end);
    }
    function reset() { apply(DEFAULT); save(DEFAULT); }

    div.addEventListener("mousedown", start);
    div.addEventListener("touchstart", start, { passive: false });
    div.addEventListener("dblclick", reset);
    div.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        var p = clampPct(cols, curPct() + (e.key === "ArrowLeft" ? -2 : 2)); apply(p); save(p); e.preventDefault();
      } else if (e.key === "Home") { reset(); e.preventDefault(); }
    });
    var rb = div.querySelector(".net-reset");
    if (rb) rb.addEventListener("click", function (e) { e.stopPropagation(); reset(); });
  }

  var scheduled = false;
  function scan() {
    scheduled = false;
    var list = document.querySelectorAll(".passage-cols");
    for (var i = 0; i < list.length; i++) if (!list[i].__netEnhanced) enhance(list[i]);
  }
  function schedule() { if (scheduled) return; scheduled = true; setTimeout(scan, 0); }

  function boot() {
    var h = host();
    if (!h) { setTimeout(boot, 300); return; }
    apply(getSaved());
    new MutationObserver(schedule).observe(h, { childList: true, subtree: true });
    schedule();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
