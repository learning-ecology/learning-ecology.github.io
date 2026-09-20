/* ============================================================================
 * lms-adapter.js  —  Chinese Test Generator
 * ----------------------------------------------------------------------------
 * The ONLY place that knows how the test module talks to an outside host
 * (your future LMS). It is deliberately thin and framework-free so the module
 * stays standalone today and drops into an LMS later without touching the
 * generator / player / scorer.
 *
 * IN — context the host may provide (all optional):
 *   window.CTG_CONTEXT = { studentId, studentName, class, course,
 *                          lessonId, assignedTestId, attemptId }
 *   ...or the same keys as URL query params (?studentId=...&attemptId=...).
 *   ...or a parent window/LMS can postMessage({type:'ctg:context', context}).
 *
 * OUT — when a test is submitted, the adapter emits the attempt every way a
 *   host might listen:
 *     • window.CTG_ON_RESULT(attempt)         (callback hook, if defined)
 *     • CustomEvent 'ctg:result' on window     (detail = attempt)
 *     • window.parent.postMessage({type:'ctg:result', attempt}, '*')  (iframe)
 *
 * The `attempt` object is the stable, LMS-friendly record. Extend it here (not
 * elsewhere) if the LMS needs more fields.
 * ==========================================================================*/
(function (global) {
  'use strict';
  var CTG = global.CTG = global.CTG || {};

  var CONTEXT_KEYS = ['studentId', 'studentName', 'class', 'course',
    'lessonId', 'assignedTestId', 'attemptId'];

  var _pushed = null; // context delivered via postMessage

  function readQuery() {
    var out = {};
    try {
      var q = new URLSearchParams(global.location ? global.location.search : '');
      CONTEXT_KEYS.forEach(function (k) { if (q.has(k)) out[k] = q.get(k); });
    } catch (e) { /* no location (node) */ }
    return out;
  }

  function readContext() {
    var ctx = {};
    // precedence: query < global object < pushed message
    Object.assign(ctx, readQuery());
    if (global.CTG_CONTEXT && typeof global.CTG_CONTEXT === 'object') {
      CONTEXT_KEYS.forEach(function (k) { if (global.CTG_CONTEXT[k] != null) ctx[k] = global.CTG_CONTEXT[k]; });
    }
    if (_pushed) Object.assign(ctx, _pushed);
    if (!ctx.attemptId) ctx.attemptId = CTG.schema.uid('attempt');
    return ctx;
  }

  // Let a host push context after load.
  function listenForContext(onUpdate) {
    try {
      global.addEventListener('message', function (ev) {
        var d = ev && ev.data;
        if (d && d.type === 'ctg:context' && d.context) {
          _pushed = _pushed || {};
          Object.assign(_pushed, d.context);
          if (typeof onUpdate === 'function') onUpdate(readContext());
        }
      });
    } catch (e) { /* ignore */ }
  }

  /* Build the stable attempt record from a test, the raw answers, the scoring
   * result and the runtime context. This is what you persist / send to the LMS. */
  function buildAttempt(test, answers, result, context, timing) {
    context = context || {};
    timing = timing || {};
    return {
      schemaVersion: CTG.schema.SCHEMA_VERSION,
      attemptId: context.attemptId || CTG.schema.uid('attempt'),
      // pass-through LMS identifiers (never invented here)
      studentId: context.studentId || null,
      studentName: context.studentName || null,
      class: context['class'] || null,
      course: context.course || null,
      assignedTestId: context.assignedTestId || null,
      // the test taken
      testId: test.testId,
      testTitle: test.title,
      lessonIds: test.lessonIds,
      seed: test.seed,
      // timing
      startedAt: timing.startedAt || null,
      submittedAt: new Date().toISOString(),
      durationSeconds: timing.startedAt
        ? Math.round((Date.now() - new Date(timing.startedAt).getTime()) / 1000) : null,
      // score
      maxPoints: result.maxPoints,
      earnedPoints: result.earnedPoints,
      percent: result.percent,
      // full detail for analytics / review
      rawAnswers: answers,
      sections: result.sections
    };
  }

  function emitResult(attempt) {
    // 1) callback hook
    try { if (typeof global.CTG_ON_RESULT === 'function') global.CTG_ON_RESULT(attempt); } catch (e) {}
    // 2) DOM event
    try {
      if (global.dispatchEvent && global.CustomEvent) {
        global.dispatchEvent(new global.CustomEvent('ctg:result', { detail: attempt }));
      }
    } catch (e) {}
    // 3) postMessage to embedding host
    try {
      if (global.parent && global.parent !== global) {
        global.parent.postMessage({ type: 'ctg:result', attempt: attempt }, '*');
      }
    } catch (e) {}
    return attempt;
  }

  CTG.lms = {
    CONTEXT_KEYS: CONTEXT_KEYS,
    readContext: readContext,
    listenForContext: listenForContext,
    buildAttempt: buildAttempt,
    emitResult: emitResult
  };
})(typeof window !== 'undefined' ? window : this);
