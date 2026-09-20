/* =============================================================================
 * test-store.js  —  Persistence + result-collection adapter
 * -----------------------------------------------------------------------------
 * This is the ONE place to change when you embed the system in your own LMS.
 *
 * The rest of the app only ever calls `TestStore.<method>`. The default
 * implementation below keeps everything in the browser's localStorage so the
 * app is fully functional standalone. To collect results on YOUR server,
 * replace the bodies of `saveAttempt` / `listAttempts` (and optionally the
 * test CRUD methods) with `fetch(...)` calls to your API. Nothing else in the
 * codebase needs to change.
 *
 * Every method returns a Promise, so a network implementation is a drop-in.
 * =========================================================================== */
(function (root) {
  "use strict";

  var TESTS_KEY = "nets.tests.v1";       // { [id]: TestRecord }
  var ATTEMPTS_KEY = "nets.attempts.v1"; // [ ResultPayload, ... ]

  function readJSON(key, dflt) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : dflt;
    } catch (e) { return dflt; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { console.warn("Storage write failed:", e); return false; }
  }
  function resolve(v) { return Promise.resolve(v); }

  /* A stored test record wraps the parsed Test model plus admin metadata. */
  //  TestRecord = { id, title, examCode, active, createdAt, updatedAt, test }

  var TestStore = {

    /* -------- Test library (teacher side) -------- */

    listTests: function () {
      var obj = readJSON(TESTS_KEY, {});
      var arr = Object.keys(obj).map(function (k) { return obj[k]; });
      arr.sort(function (a, b) { return (b.updatedAt || "").localeCompare(a.updatedAt || ""); });
      return resolve(arr);
    },

    getTest: function (id) {
      var obj = readJSON(TESTS_KEY, {});
      return resolve(obj[id] || null);
    },

    saveTest: function (record) {
      var obj = readJSON(TESTS_KEY, {});
      var now = new Date().toISOString();
      if (!record.createdAt) record.createdAt = now;
      record.updatedAt = now;
      obj[record.id] = record;
      writeJSON(TESTS_KEY, obj);
      return resolve(record);
    },

    deleteTest: function (id) {
      var obj = readJSON(TESTS_KEY, {});
      delete obj[id];
      writeJSON(TESTS_KEY, obj);
      return resolve(true);
    },

    /* -------- Attempts / results (student side) --------
     * >>> REPLACE THIS with a POST to your backend to collect centrally. <<<
     * Example:
     *   saveAttempt: function (result) {
     *     return fetch("/api/attempts", {
     *       method: "POST",
     *       headers: { "Content-Type": "application/json" },
     *       body: JSON.stringify(result)
     *     }).then(function (r) { return r.json(); });
     *   },
     */
    saveAttempt: function (result) {
      var arr = readJSON(ATTEMPTS_KEY, []);
      result._id = "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      arr.push(result);
      writeJSON(ATTEMPTS_KEY, arr);
      return resolve(result);
    },

    listAttempts: function (testId) {
      var arr = readJSON(ATTEMPTS_KEY, []);
      if (testId) arr = arr.filter(function (a) { return a.testId === testId; });
      arr.sort(function (a, b) { return (b.submittedAt || "").localeCompare(a.submittedAt || ""); });
      return resolve(arr);
    },

    clearAttempts: function (testId) {
      var arr = readJSON(ATTEMPTS_KEY, []);
      if (testId) arr = arr.filter(function (a) { return a.testId !== testId; });
      else arr = [];
      writeJSON(ATTEMPTS_KEY, arr);
      return resolve(true);
    }
  };

  root.TestStore = TestStore;

})(typeof window !== "undefined" ? window : this);
