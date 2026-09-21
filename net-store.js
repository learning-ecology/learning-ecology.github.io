/* =============================================================================
 * net-store.js — LMS implementation of the National English Test's `TestStore`.
 * -----------------------------------------------------------------------------
 * Drop-in replacement for the module's js/test-store.js: same 7 method names,
 * every one returns a Promise. Storage lives in Supabase (Postgres + RLS), not
 * the browser. The engine/runner are UNCHANGED and only call these methods.
 *
 *   listTests()           GET   net_tests            (staff)
 *   getTest(id)           GET   net_tests[lesson_id]
 *   saveTest(record)      UPSERT net_tests           (staff)
 *   deleteTest(id)        DELETE net_tests           (staff)
 *   saveAttempt(result)   RPC   submit_net_attempt   (student, own attempt)
 *   listAttempts(testId)  GET   net_attempts         (staff read all)
 *   clearAttempts(testId) DELETE net_attempts        (staff)
 *
 * Roles/ownership are enforced SERVER-side (RLS + the SECURITY DEFINER RPC).
 * Requires a Supabase client as window.sb. `TestStore.context` lets the player
 * pass the homework/lesson it opened so the attempt is linked + re-attempt
 * checked (the interface the engine uses is untouched).
 * =========================================================================== */
(function (root) {
  "use strict";
  // config.js declares `const sb = supabase.createClient(...)` — a top-level
  // const is a GLOBAL LEXICAL binding (reachable only by the bare name `sb`,
  // NOT as window.sb). This helper (deliberately NOT named `sb`) resolves that
  // binding, falling back to root.sb / window.sb if a page set one there.
  function client() {
    try { if (typeof sb !== "undefined" && sb) return sb; } catch (e) {}
    return root.sb || (typeof window !== "undefined" ? window.sb : undefined);
  }

  function rowToRecord(r) {
    return {
      id: r.lesson_id, _uuid: r.id, lesson_id: r.lesson_id,
      title: r.title, examCode: r.exam_code, active: r.active,
      createdAt: r.created_at, updatedAt: r.updated_at, source: r.source,
      test: r.test, course_id: r.course_id, tier: r.tier,
      total_questions: r.total_questions, duration_minutes: r.duration_minutes
    };
  }
  function attemptToPayload(a) {
    return {
      _id: a.id, testId: a.test_id, lessonId: a.lesson_id, testTitle: a.test_title,
      examCode: a.exam_code, mode: a.mode, candidate: a.candidate || { name: "", id: "" },
      startedAt: a.started_at, submittedAt: a.submitted_at, durationUsedSec: a.duration_used_sec,
      score: { correct: a.correct, total: a.total, percent: Number(a.percent) },
      passed: a.passed, autoSubmitted: a.auto_submitted, preview: false,
      bySection: a.by_section || [], answers: a.answers || [],
      student_id: a.student_id, homework_id: a.homework_id, attempt_no: a.attempt_no, created_at: a.created_at
    };
  }

  var TestStore = {
    // set by the player before running a test (does not change the engine API)
    context: { homeworkId: null, lessonId: null },

    listTests: function () {
      return client().from("net_tests").select("*").order("sort_order").order("created_at", { ascending: false })
        .then(function (r) { if (r.error) throw r.error; return (r.data || []).map(rowToRecord); });
    },

    getTest: function (id) {
      return client().from("net_tests").select("*").eq("lesson_id", id).maybeSingle()
        .then(function (r) { if (r.error) throw r.error; return r.data ? rowToRecord(r.data) : null; });
    },

    saveTest: function (record) {
      var t = record.test || {};
      var slug = record.id || record.lesson_id ||
        ("net-" + String(record.examCode || t.examCode || "t").toLowerCase().replace(/[^a-z0-9]+/g, "") + "-" + Math.random().toString(36).slice(2, 7));
      var patch = {
        lesson_id: slug,
        title: record.title || t.title || "Bài kiểm tra tiếng Anh",
        exam_code: record.examCode || t.examCode || null,
        active: record.active !== false,
        source: record.source || null,
        test: t,
        total_questions: (t.questions ? t.questions.length : 0),
        duration_minutes: t.durationMinutes || null,
        course_id: record.course_id || null,
        tier: record.tier || "free",
        updated_at: new Date().toISOString()
      };
      return client().from("net_tests").upsert(patch, { onConflict: "lesson_id" }).select().maybeSingle()
        .then(function (r) { if (r.error) throw r.error; return rowToRecord(r.data); });
    },

    deleteTest: function (id) {
      return client().from("net_tests").delete().eq("lesson_id", id)
        .then(function (r) { if (r.error) throw r.error; return true; });
    },

    saveAttempt: function (result) {
      return client().rpc("submit_net_attempt", {
        p_result: result,
        p_homework: TestStore.context.homeworkId || null,
        p_lesson: TestStore.context.lessonId || null
      }).then(function (r) { if (r.error) throw r.error; return r.data; });
    },

    listAttempts: function (testId) {
      var qy = client().from("net_attempts").select("*").order("created_at", { ascending: false });
      if (testId) qy = qy.eq("lesson_id", testId);
      return qy.then(function (r) { if (r.error) throw r.error; return (r.data || []).map(attemptToPayload); });
    },

    clearAttempts: function (testId) {
      var qy = client().from("net_attempts").delete();
      qy = testId ? qy.eq("lesson_id", testId) : qy.neq("id", "00000000-0000-0000-0000-000000000000");
      return qy.then(function (r) { if (r.error) throw r.error; return true; });
    }
  };

  root.TestStore = TestStore;
})(typeof window !== "undefined" ? window : this);
