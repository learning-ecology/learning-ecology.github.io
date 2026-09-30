/* =============================================================================
 * eng-lesson-store.js — LMS implementation of the Lesson System's `LessonStore`.
 * -----------------------------------------------------------------------------
 * Drop-in replacement for the module's js/lesson-store.js: SAME method names,
 * every one returns a Promise. Loaded INSTEAD of the module's store, so the
 * engines/runner are UNCHANGED and only call these methods.
 *
 * Phase A (content + exam grading):
 *   • Content (eng_lessons) ...... Supabase  — listLessons/getLesson/saveLesson/deleteLesson
 *   • Exam attempts .............. Supabase  — saveAttempt → RPC submit_lesson_attempt
 *                                             listAttempts/clearAttempts → eng_lesson_attempts
 *   • Progress / mastery ......... localStorage (per browser) — Phase B will move these
 *   • Flashcard bank / status .... localStorage — kept SEPARATE from the LMS
 *                                  Flashcards feature on purpose (Phase A decision)
 *
 * Roles/ownership are enforced SERVER-side (RLS + the SECURITY DEFINER RPC).
 * Requires a Supabase client. config.js declares `const sb = ...` (a global
 * LEXICAL binding, reachable only by bare `sb`, NOT window.sb) — client()
 * resolves it, exactly like net-store.js.
 * =========================================================================== */
(function (root) {
  "use strict";

  function client() {
    try { if (typeof sb !== "undefined" && sb) return sb; } catch (e) {}
    return root.sb || (typeof window !== "undefined" ? window.sb : undefined);
  }
  function now() { return new Date().toISOString(); }

  /* ---- local (browser) namespaces for the not-yet-server-backed parts ---- */
  var K_PROGRESS = "eng.local.progress.v1";  // { [studentId]: { [lessonId]: Progress } }
  var K_BANK     = "eng.local.bank.v1";      // { [courseId]: { [cardKey]: BankCard } }
  var K_CARDSTAT = "eng.local.cardstat.v1";  // { [studentId]: { [courseId]: { [cardKey]: status } } }
  function readJSON(key, dflt) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : dflt; }
    catch (e) { return dflt; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }
  function resolve(v) { return Promise.resolve(v); }
  function cardKey(front) { return String(front == null ? "" : front).trim().toLowerCase(); }

  /* ---- row <-> record mappers (server side) ------------------------------ */
  function rowToRecord(r) {
    return {
      id: r.lesson_id, _uuid: r.id, lesson_id: r.lesson_id,
      title: r.title, topic: r.topic, lessonNo: r.lesson_no, level: r.level,
      examCode: r.exam_code, active: r.active, source: r.source,
      lesson: r.lesson,                       // <-- the parsed Lesson model (LessonRunner reads record.lesson)
      totalQuestions: r.total_questions, durationMinutes: r.duration_minutes,
      courseId: r.course_id, tier: r.tier, createdAt: r.created_at, updatedAt: r.updated_at
    };
  }
  function attemptToPayload(a) {
    return {
      _id: a.id, testId: a.test_id, lessonId: a.lesson_id, sectionId: a.section_id,
      testTitle: a.test_title, examCode: a.exam_code, mode: a.mode,
      candidate: a.candidate || { name: "", id: "" },
      startedAt: a.started_at, submittedAt: a.submitted_at, durationUsedSec: a.duration_used_sec,
      score: { correct: a.correct, total: a.total, percent: Number(a.percent) },
      passed: a.passed, autoSubmitted: a.auto_submitted, preview: false,
      bySection: a.by_section || [], answers: a.answers || [],
      homework_id: a.homework_id, attempt_no: a.attempt_no, created_at: a.created_at
    };
  }
  function slugify(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  }

  var LessonStore = {
    // set by lesson.html before mounting the runner (does not change engine API)
    context: { homeworkId: null, lessonId: null },

    /* =============== CONTENT: lesson library (teacher) — Supabase =============== */
    listLessons: function (courseId) {
      var qy = client().from("eng_lessons").select("*").order("sort_order").order("created_at", { ascending: false });
      if (courseId) qy = qy.eq("course_id", courseId);
      return qy.then(function (r) { if (r.error) throw r.error; return (r.data || []).map(rowToRecord); });
    },
    getLesson: function (lessonId) {
      return client().from("eng_lessons").select("*").eq("lesson_id", lessonId).maybeSingle()
        .then(function (r) { if (r.error) throw r.error; return r.data ? rowToRecord(r.data) : null; });
    },
    saveLesson: function (record) {
      var L = record.lesson || record.test || record;   // tolerate shapes
      var exam = L.exam || {};
      var slug = record.id || record.lesson_id || L.id ||
        ("eng-" + (slugify(L.title) || "lesson") + "-" + Math.random().toString(36).slice(2, 6));
      var patch = {
        lesson_id: slug,
        title: record.title || L.title || "Bài học tiếng Anh",
        topic: L.topic || null,
        lesson_no: (L.lessonNo != null ? L.lessonNo : null),
        level: L.level || null,
        exam_code: L.examCode || exam.examCode || null,
        active: record.active !== false,
        source: record.source || null,
        lesson: L,
        total_questions: (exam.questions ? exam.questions.length : 0),
        duration_minutes: exam.durationMinutes || null,
        course_id: record.course_id || record.courseId || L.courseId || null,
        tier: record.tier || "free",
        updated_at: now()
      };
      return client().from("eng_lessons").upsert(patch, { onConflict: "lesson_id" }).select().maybeSingle()
        .then(function (r) { if (r.error) throw r.error; return rowToRecord(r.data); });
    },
    deleteLesson: function (lessonId) {
      return client().from("eng_lessons").delete().eq("lesson_id", lessonId)
        .then(function (r) { if (r.error) throw r.error; return true; });
    },

    /* =============== RESULTS: exam attempts — Supabase =============== */
    saveAttempt: function (result) {
      return client().rpc("submit_lesson_attempt", {
        p_result: result,
        p_homework: LessonStore.context.homeworkId || null,
        p_lesson: LessonStore.context.lessonId || (result && result.lessonId) || null
      }).then(function (r) { if (r.error) throw r.error; return r.data; });
    },
    listAttempts: function (filter) {
      filter = filter || {};
      var qy = client().from("eng_lesson_attempts").select("*").order("created_at", { ascending: false });
      if (filter.lessonId) qy = qy.eq("lesson_id", filter.lessonId);
      if (filter.studentId) qy = qy.eq("student_id", filter.studentId);
      return qy.then(function (r) { if (r.error) throw r.error; return (r.data || []).map(attemptToPayload); });
    },
    clearAttempts: function (filter) {
      filter = filter || {};
      var qy = client().from("eng_lesson_attempts").delete();
      qy = filter.lessonId ? qy.eq("lesson_id", filter.lessonId) : qy.neq("id", "00000000-0000-0000-0000-000000000000");
      return qy.then(function (r) { if (r.error) throw r.error; return true; });
    },

    /* =============== PROGRESS & MASTERY — local (Phase A) =============== */
    getProgress: function (studentId, lessonId) {
      var all = readJSON(K_PROGRESS, {}); return resolve((all[studentId] || {})[lessonId] || null);
    },
    saveProgress: function (progress) {
      var all = readJSON(K_PROGRESS, {}); var s = all[progress.studentId] || (all[progress.studentId] = {});
      progress.lastActivityAt = now(); s[progress.lessonId] = progress; writeJSON(K_PROGRESS, all); return resolve(progress);
    },
    recordActivity: function (studentId, lessonId, courseId, activityId, res) {
      var all = readJSON(K_PROGRESS, {}); var s = all[studentId] || (all[studentId] = {});
      var p = s[lessonId] || (s[lessonId] = { studentId: studentId, lessonId: lessonId, courseId: courseId, sections: {}, activities: {}, vocabMastery: {}, lastActivityAt: now() });
      var a = p.activities[activityId] || (p.activities[activityId] = { attempts: 0, correct: 0, lastCorrect: null, timeSec: 0 });
      a.attempts += 1; if (res && res.correct) a.correct += 1; a.lastCorrect = !!(res && res.correct);
      if (res && res.timeSec) a.timeSec += res.timeSec; p.lastActivityAt = now(); writeJSON(K_PROGRESS, all); return resolve(p);
    },
    setSectionStatus: function (studentId, lessonId, courseId, sectionId, patch) {
      var all = readJSON(K_PROGRESS, {}); var s = all[studentId] || (all[studentId] = {});
      var p = s[lessonId] || (s[lessonId] = { studentId: studentId, lessonId: lessonId, courseId: courseId, sections: {}, activities: {}, vocabMastery: {}, lastActivityAt: now() });
      p.sections[sectionId] = Object.assign({}, p.sections[sectionId] || {}, patch || {}); p.lastActivityAt = now(); writeJSON(K_PROGRESS, all); return resolve(p);
    },

    /* =============== FLASHCARD BANK & STATUS — local, kept SEPARATE =============== */
    addLessonToBank: function (courseId, lessonId, cards) {
      var bank = readJSON(K_BANK, {}); var course = bank[courseId] || (bank[courseId] = {});
      (cards || []).forEach(function (c) {
        var k = cardKey(c.front); if (!k) return;
        if (course[k]) { if (course[k].lessons.indexOf(lessonId) === -1) course[k].lessons.push(lessonId); }
        else course[k] = { id: c.id, key: k, front: c.front, frontPrompt: c.frontPrompt || "", back: c.back || {}, origin: c.origin || "vocabulary", lessons: [lessonId], addedAt: now() };
      });
      writeJSON(K_BANK, bank); return resolve(course);
    },
    listBank: function (courseId, opts) {
      opts = opts || {}; var course = readJSON(K_BANK, {})[courseId] || {};
      var arr = Object.keys(course).map(function (k) { return course[k]; });
      if (opts.lessonId) arr = arr.filter(function (c) { return c.lessons.indexOf(opts.lessonId) !== -1; });
      arr.sort(function (a, b) { return (a.addedAt || "").localeCompare(b.addedAt || ""); }); return resolve(arr);
    },
    removeLessonFromBank: function (courseId, lessonId) {
      var bank = readJSON(K_BANK, {}); var course = bank[courseId]; if (!course) return resolve(true);
      Object.keys(course).forEach(function (k) { var i = course[k].lessons.indexOf(lessonId); if (i !== -1) course[k].lessons.splice(i, 1); if (course[k].lessons.length === 0) delete course[k]; });
      writeJSON(K_BANK, bank); return resolve(true);
    },
    getCardStatuses: function (studentId, courseId) {
      var all = readJSON(K_CARDSTAT, {}); return resolve(((all[studentId] || {})[courseId]) || {});
    },
    setCardStatus: function (studentId, courseId, key, status) {
      var all = readJSON(K_CARDSTAT, {}); var s = all[studentId] || (all[studentId] = {}); var c = s[courseId] || (s[courseId] = {});
      if (status == null) delete c[key]; else c[key] = { status: status, at: now() }; writeJSON(K_CARDSTAT, all); return resolve(true);
    }
  };

  root.LessonStore = LessonStore;
})(typeof window !== "undefined" ? window : this);
