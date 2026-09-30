/* =============================================================================
 * lesson-store.js — Persistence, progress, mastery & the shared flashcard bank
 * -----------------------------------------------------------------------------
 * THE ONE FILE TO SWAP when you wire this into your LMS backend.
 *
 * Every method returns a Promise, so replacing a body with `fetch(...)` is a
 * drop-in. The default implementation uses the browser's localStorage so the
 * app is fully functional offline/standalone.
 *
 * Data separated into four namespaces (see LMS & data architecture):
 *   • Content   — imported lessons        (lnet.lessons.v1)
 *   • Bank      — shared course flashcards (lnet.bank.v1)      [de-duplicated]
 *   • Student   — progress / mastery / card status (lnet.progress.v1)
 *   • Results   — exam & activity attempts (lnet.attempts.v1)
 *
 * Structured IDs used everywhere: course_id, lesson_id, section_id,
 * activity_id, question_id, option_id, vocabulary_id, flashcard_id, student_id.
 * =========================================================================== */
(function (root) {
  "use strict";

  var K_LESSONS  = "lnet.lessons.v1";   // { [lessonId]: LessonRecord }
  var K_BANK     = "lnet.bank.v1";      // { [courseId]: { [cardKey]: BankCard } }
  var K_PROGRESS = "lnet.progress.v1";  // { [studentId]: { [lessonId]: Progress } }
  var K_ATTEMPTS = "lnet.attempts.v1";  // [ Attempt, ... ]
  var K_CARDSTAT = "lnet.cardstat.v1";  // { [studentId]: { [courseId]: { [cardKey]: status } } }

  function readJSON(key, dflt) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : dflt; }
    catch (e) { return dflt; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { console.warn("Storage write failed:", e); return false; }
  }
  function resolve(v) { return Promise.resolve(v); }
  function now() { return new Date().toISOString(); }
  function cardKey(front) { return String(front == null ? "" : front).trim().toLowerCase(); }

  var LessonStore = {

    /* =============== CONTENT: lesson library (teacher) =============== */
    listLessons: function (courseId) {
      var obj = readJSON(K_LESSONS, {});
      var arr = Object.keys(obj).map(function (k) { return obj[k]; });
      if (courseId) arr = arr.filter(function (r) { return r.courseId === courseId; });
      arr.sort(function (a, b) {
        var an = a.lessonNo, bn = b.lessonNo;
        if (an != null && bn != null && an !== bn) return an - bn;
        return (b.updatedAt || "").localeCompare(a.updatedAt || "");
      });
      return resolve(arr);
    },
    getLesson: function (lessonId) {
      var obj = readJSON(K_LESSONS, {});
      return resolve(obj[lessonId] || null);
    },
    saveLesson: function (record) {
      var obj = readJSON(K_LESSONS, {});
      if (!record.createdAt) record.createdAt = now();
      record.updatedAt = now();
      obj[record.id] = record;
      writeJSON(K_LESSONS, obj);
      return resolve(record);
    },
    deleteLesson: function (lessonId) {
      var obj = readJSON(K_LESSONS, {});
      delete obj[lessonId];
      writeJSON(K_LESSONS, obj);
      return resolve(true);
    },

    /* =============== BANK: shared, de-duplicated course flashcards ===============
     * Adds a lesson's cards to the course bank. A card already present (same
     * normalised front from ANY lesson) is NOT duplicated; instead the lesson
     * is recorded in its `lessons[]` so "review by lesson" still works.
     */
    addLessonToBank: function (courseId, lessonId, cards) {
      var bank = readJSON(K_BANK, {});
      var course = bank[courseId] || (bank[courseId] = {});
      (cards || []).forEach(function (c) {
        var k = cardKey(c.front);
        if (!k) return;
        if (course[k]) {
          if (course[k].lessons.indexOf(lessonId) === -1) course[k].lessons.push(lessonId);
        } else {
          course[k] = {
            id: c.id, key: k, front: c.front, frontPrompt: c.frontPrompt || "",
            back: c.back || {}, origin: c.origin || "vocabulary",
            lessons: [lessonId], addedAt: now()
          };
        }
      });
      writeJSON(K_BANK, bank);
      return resolve(course);
    },
    // scope: "lesson" (needs lessonId) | "all" | "course"
    listBank: function (courseId, opts) {
      opts = opts || {};
      var bank = readJSON(K_BANK, {});
      var course = bank[courseId] || {};
      var arr = Object.keys(course).map(function (k) { return course[k]; });
      if (opts.lessonId) arr = arr.filter(function (c) { return c.lessons.indexOf(opts.lessonId) !== -1; });
      arr.sort(function (a, b) { return (a.addedAt || "").localeCompare(b.addedAt || ""); });
      return resolve(arr);
    },
    removeLessonFromBank: function (courseId, lessonId) {
      var bank = readJSON(K_BANK, {});
      var course = bank[courseId]; if (!course) return resolve(true);
      Object.keys(course).forEach(function (k) {
        var idx = course[k].lessons.indexOf(lessonId);
        if (idx !== -1) course[k].lessons.splice(idx, 1);
        if (course[k].lessons.length === 0) delete course[k];
      });
      writeJSON(K_BANK, bank);
      return resolve(true);
    },

    /* =============== STUDENT: flashcard status (known/unknown/difficult) ===============
     * status ∈ "known" | "unknown" | "difficult". Stored per student per course
     * per cardKey, so mastery persists across lessons and the whole course.
     */
    getCardStatuses: function (studentId, courseId) {
      var all = readJSON(K_CARDSTAT, {});
      return resolve(((all[studentId] || {})[courseId]) || {});
    },
    setCardStatus: function (studentId, courseId, key, status) {
      var all = readJSON(K_CARDSTAT, {});
      var s = all[studentId] || (all[studentId] = {});
      var c = s[courseId] || (s[courseId] = {});
      if (status == null) delete c[key];
      else c[key] = { status: status, at: now() };
      writeJSON(K_CARDSTAT, all);
      return resolve(true);
    },

    /* =============== STUDENT: lesson progress & mastery ===============
     * Progress = {
     *   studentId, lessonId, courseId,
     *   sections: { learn:{completed,score}, exam:{...}, flashcards:{...} },
     *   activities: { [activityId]: { attempts, correct, lastCorrect, timeSec } },
     *   vocabMastery: { [vocabId or cardKey]: "known"|"unknown"|"difficult" },
     *   lastActivityAt
     * }
     */
    getProgress: function (studentId, lessonId) {
      var all = readJSON(K_PROGRESS, {});
      var s = all[studentId] || {};
      return resolve(s[lessonId] || null);
    },
    saveProgress: function (progress) {
      var all = readJSON(K_PROGRESS, {});
      var s = all[progress.studentId] || (all[progress.studentId] = {});
      progress.lastActivityAt = now();
      s[progress.lessonId] = progress;
      writeJSON(K_PROGRESS, all);
      return resolve(progress);
    },
    // Convenience: merge one activity result into progress.
    recordActivity: function (studentId, lessonId, courseId, activityId, res) {
      var all = readJSON(K_PROGRESS, {});
      var s = all[studentId] || (all[studentId] = {});
      var p = s[lessonId] || (s[lessonId] = {
        studentId: studentId, lessonId: lessonId, courseId: courseId,
        sections: {}, activities: {}, vocabMastery: {}, lastActivityAt: now()
      });
      var a = p.activities[activityId] || (p.activities[activityId] = { attempts: 0, correct: 0, lastCorrect: null, timeSec: 0 });
      a.attempts += 1;
      if (res && res.correct) a.correct += 1;
      a.lastCorrect = !!(res && res.correct);
      if (res && res.timeSec) a.timeSec += res.timeSec;
      p.lastActivityAt = now();
      writeJSON(K_PROGRESS, all);
      return resolve(p);
    },
    setSectionStatus: function (studentId, lessonId, courseId, sectionId, patch) {
      var all = readJSON(K_PROGRESS, {});
      var s = all[studentId] || (all[studentId] = {});
      var p = s[lessonId] || (s[lessonId] = {
        studentId: studentId, lessonId: lessonId, courseId: courseId,
        sections: {}, activities: {}, vocabMastery: {}, lastActivityAt: now()
      });
      p.sections[sectionId] = Object.assign({}, p.sections[sectionId] || {}, patch || {});
      p.lastActivityAt = now();
      writeJSON(K_PROGRESS, all);
      return resolve(p);
    },

    /* =============== RESULTS: exam & activity attempts ===============
     * >>> REPLACE with a POST to your backend to collect centrally. <<<
     */
    saveAttempt: function (result) {
      var arr = readJSON(K_ATTEMPTS, []);
      result._id = "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      if (!result.savedAt) result.savedAt = now();
      arr.push(result);
      writeJSON(K_ATTEMPTS, arr);
      return resolve(result);
    },
    listAttempts: function (filter) {
      var arr = readJSON(K_ATTEMPTS, []);
      filter = filter || {};
      if (filter.lessonId) arr = arr.filter(function (a) { return a.lessonId === filter.lessonId || a.testId === (filter.lessonId + "-exam"); });
      if (filter.studentId) arr = arr.filter(function (a) { return (a.candidate && a.candidate.id) === filter.studentId; });
      arr.sort(function (a, b) { return (b.submittedAt || b.savedAt || "").localeCompare(a.submittedAt || a.savedAt || ""); });
      return resolve(arr);
    },
    clearAttempts: function (filter) {
      var arr = readJSON(K_ATTEMPTS, []);
      filter = filter || {};
      if (filter.lessonId) arr = arr.filter(function (a) { return a.lessonId !== filter.lessonId && a.testId !== (filter.lessonId + "-exam"); });
      else arr = [];
      writeJSON(K_ATTEMPTS, arr);
      return resolve(true);
    }
  };

  root.LessonStore = LessonStore;

})(typeof window !== "undefined" ? window : this);
