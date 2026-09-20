/* ============================================================================
 * storage.js  —  Chinese Test Generator
 * ----------------------------------------------------------------------------
 * Tiny, defensive localStorage wrapper. Used ONLY for per-browser convenience
 * on the teacher side (remembering the last imported bank + settings) and, on
 * the student side, for resuming an in-progress attempt. Never load-bearing:
 * every access is wrapped so private-mode / blocked storage degrades cleanly.
 *
 * This is intentionally NOT where authoritative data lives — a future LMS owns
 * persistence. Keys are namespaced so integration stays clean.
 * ==========================================================================*/
(function (global) {
  'use strict';
  var CTG = global.CTG = global.CTG || {};
  var NS = 'ctg:';

  function available() {
    try {
      var k = NS + '__t';
      global.localStorage.setItem(k, '1');
      global.localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  }

  function get(key, fallback) {
    try {
      var raw = global.localStorage.getItem(NS + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function set(key, value) {
    try { global.localStorage.setItem(NS + key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }
  function remove(key) {
    try { global.localStorage.removeItem(NS + key); return true; }
    catch (e) { return false; }
  }

  CTG.storage = {
    available: available,
    get: get,
    set: set,
    remove: remove,
    KEYS: {
      BANK: 'bank',
      SETTINGS: 'settings',
      attempt: function (testId) { return 'attempt:' + testId; }
    }
  };
})(typeof window !== 'undefined' ? window : this);
