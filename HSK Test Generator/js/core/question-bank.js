/* ============================================================================
 * question-bank.js  —  Chinese Test Generator
 * ----------------------------------------------------------------------------
 * Thin, read-only helpers over a bank object (from excel-import.js). Keeps
 * filtering/counting logic out of the UI and the generator.
 *
 * Public API (window.CTG.bank):
 *   filter(bank, {lessonIds, types}) -> [questions]
 *   byType(questions) -> {type: [questions]}
 *   availability(bank, lessonIds) -> {type: count}   (reading counts passages)
 *   lessonsWithCounts(bank) -> [{id,name,order, count}]
 * ==========================================================================*/
(function (global) {
  'use strict';
  var CTG = global.CTG = global.CTG || {};

  function filter(bank, opts) {
    opts = opts || {};
    var lessonIds = opts.lessonIds && opts.lessonIds.length ? opts.lessonIds : null;
    var types = opts.types || null; // array or map of allowed types
    var typeAllowed;
    if (!types) typeAllowed = function () { return true; };
    else if (Array.isArray(types)) typeAllowed = function (t) { return types.indexOf(t) >= 0; };
    else typeAllowed = function (t) { return !!types[t]; };

    return bank.questions.filter(function (q) {
      if (lessonIds && lessonIds.indexOf(q.lessonId) < 0) return false;
      return typeAllowed(q.type);
    });
  }

  function byType(questions) {
    var map = {};
    questions.forEach(function (q) {
      (map[q.type] = map[q.type] || []).push(q);
    });
    return map;
  }

  function availability(bank, lessonIds) {
    var qs = filter(bank, { lessonIds: lessonIds });
    var grouped = byType(qs);
    var out = {};
    Object.keys(CTG.schema.TYPE).forEach(function (k) {
      var t = CTG.schema.TYPE[k];
      out[t] = (grouped[t] || []).length;
    });
    return out;
  }

  function lessonsWithCounts(bank) {
    var counts = {};
    bank.questions.forEach(function (q) { counts[q.lessonId] = (counts[q.lessonId] || 0) + 1; });
    return bank.lessons.map(function (l) {
      return { id: l.id, name: l.name, order: l.order, count: counts[l.id] || 0 };
    });
  }

  CTG.bank = {
    filter: filter,
    byType: byType,
    availability: availability,
    lessonsWithCounts: lessonsWithCounts
  };
})(typeof window !== 'undefined' ? window : this);
