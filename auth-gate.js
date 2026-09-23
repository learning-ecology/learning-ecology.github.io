/* =============================================================================
 * auth-gate.js — ONE central sign-in gate for every lesson / resource page.
 * -----------------------------------------------------------------------------
 * Include this ONCE, right after config.js, on any page that a visitor must be
 * signed in to open (HSK slides, vocabulary practice, tests, reading, shadowing,
 * dictation, placement, VSTEP/V-SAT, …). Behaviour:
 *
 *   • Already signed in  → nothing happens; the lesson opens immediately.
 *   • Not signed in      → the EXACT destination (path + query + hash) is saved
 *                          and the visitor is sent to login.html?g=1&next=…,
 *                          which launches Google sign-in straightaway and, after
 *                          authentication, returns them to that exact resource.
 *
 * Because it is a single shared script driven only by "is there a session?",
 * every existing AND future lesson page follows the same rule just by including
 * it — no per-lesson or per-card login logic. Fail-OPEN on any error so a
 * transient problem never locks a student out of a page they can reach.
 * =========================================================================== */
(function () {
  "use strict";

  // Resolve the Supabase client. config.js declares `const sb = …`, a global
  // lexical binding reachable by the bare name (not as window.sb).
  function client() {
    try { if (typeof sb !== "undefined" && sb && sb.auth) return sb; } catch (e) {}
    try { if (window.sb && window.sb.auth) return window.sb; } catch (e) {}
    return null;
  }

  var c = client();
  if (!c) return;                       // no client yet → don't lock anyone out

  // Don't interfere with an OAuth return that lands here (token/errors in hash).
  try {
    var h = location.hash || "";
    if (h.indexOf("access_token") >= 0 || h.indexOf("error=") >= 0) return;
  } catch (e) {}

  c.auth.getSession().then(function (r) {
    var s = r && r.data && r.data.session;
    if (s && s.user) return;            // signed in → let the page load normally
    var dest = location.pathname + location.search + location.hash;
    location.replace("login.html?g=1&next=" + encodeURIComponent(dest));
  }).catch(function () { /* fail open */ });
})();
