/* =============================================================================
 * lesson-runner.js — Student lesson experience (the 3-section shell)
 * -----------------------------------------------------------------------------
 * Global: `LessonRunner` (a class). Orchestrates the sections, mounting the
 * reusable engines for each:
 *   Section 1  LEARN       VocabGrammar.render + MiniPractice
 *   Section 2  EXAM        TestRunner (on a per-attempt randomized model)
 *   Section 3  FLASHCARDS  FlashcardDeck (with the shared course bank)
 *
 *   new LessonRunner(container, lessonRecord, {
 *     store, courseId, studentId, studentName, onExit
 *   });
 *
 * Answers/analytics flow to the store; the exam uses the existing TestRunner
 * and TestEngine untouched (fed a randomized copy so options never sit in a
 * fixed slot, while scoring stays exact).
 * =========================================================================== */
(function (root) {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function fmt(s) { return root.LessonEngine ? root.LessonEngine.formatText(s) : esc(s); }

  var SECTIONS = [
    { id: "learn", label: "Vocabulary & Grammar", icon: "1", tag: "LEARN" },
    { id: "exam", label: "Exam-focused Test", icon: "2", tag: "TEST" },
    { id: "flashcards", label: "Flashcards", icon: "3", tag: "REVIEW" }
  ];

  function LessonRunner(container, record, opts) {
    this.el = container;
    this.record = record;
    this.lesson = record.test || record.lesson || record; // tolerate shapes
    this.opts = opts || {};
    this.store = opts.store || root.LessonStore;
    this.courseId = opts.courseId || this.lesson.courseId;
    this.studentId = opts.studentId || "anon";
    this.studentName = opts.studentName || "Student";
    this.section = "learn";
    this.mpResults = {};      // activityId -> correct?
    this.examResult = null;
    this._deck = null;
    this._testRunner = null;
    this.seed = opts.seed != null ? opts.seed : (this.studentId + "|" + this.lesson.id + "|" + Date.now());
    var self = this;
    this._fsHandler = function () { self._updateFsLabel(); };
    document.addEventListener("fullscreenchange", this._fsHandler);
    document.addEventListener("webkitfullscreenchange", this._fsHandler);
    this._render();
  }

  LessonRunner.prototype._availSections = function () {
    var L = this.lesson;
    return SECTIONS.filter(function (s) {
      if (s.id === "learn") return (L.vocabulary && L.vocabulary.length) || (L.grammar && (L.grammar.points.length || L.grammar.errors.length)) || (L.miniPractice && L.miniPractice.length);
      if (s.id === "exam") return !!L.exam;
      if (s.id === "flashcards") return (L.flashcards && L.flashcards.length);
      return true;
    });
  };

  LessonRunner.prototype._render = function () {
    var self = this, L = this.lesson;
    var avail = this._availSections();
    if (avail.filter(function (s) { return s.id === self.section; }).length === 0 && avail.length) this.section = avail[0].id;

    var stepper = avail.map(function (s) {
      return '<button class="lr-step' + (self.section === s.id ? " active" : "") + '" data-sec="' + s.id + '">' +
        '<span class="lr-step-num">' + s.icon + '</span><span class="lr-step-label">' + esc(s.label) + '</span></button>';
    }).join('<span class="lr-step-sep">›</span>');

    this.el.innerHTML =
      '<div class="lr-top">' +
        '<div class="lr-title-block">' +
          (L.lessonNo != null ? '<span class="lr-lesson-no">Lesson ' + esc(L.lessonNo) + '</span>' : '') +
          '<div class="lr-title">' + esc(L.title) + '</div>' +
          '<div class="lr-sub">' + esc([L.topic, L.grammarTitle, L.level].filter(Boolean).join(" · ")) + '</div>' +
        '</div>' +
        '<div class="lr-top-actions">' +
          '<button class="btn ghost sm" id="lr-fs" title="Toggle full screen (distraction-free)">⛶ Full screen</button>' +
          (this.opts.onExit ? '<button class="btn ghost sm" id="lr-exit">← Lessons</button>' : '') +
        '</div>' +
      '</div>' +
      '<div class="lr-stepper">' + stepper + '</div>' +
      '<div class="lr-content" id="lr-content"></div>';

    this.el.querySelectorAll(".lr-step").forEach(function (b) {
      b.onclick = function () { self.section = b.getAttribute("data-sec"); self._renderSection(); self._paintStepper(); };
    });
    var ex = this.el.querySelector("#lr-exit");
    if (ex) ex.onclick = function () { self.opts.onExit && self.opts.onExit(); };
    var fs = this.el.querySelector("#lr-fs");
    if (fs) fs.onclick = function () { self._toggleFullscreen(); };
    this._updateFsLabel();

    this._renderSection();
  };

  /* ---------------- Fullscreen (distraction-free) ---------------- */
  LessonRunner.prototype._toggleFullscreen = function () {
    var d = document, el = d.documentElement;
    var isFs = d.fullscreenElement || d.webkitFullscreenElement || d.msFullscreenElement;
    try {
      if (!isFs) {
        var req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
        if (req) req.call(el);
      } else {
        var exit = d.exitFullscreen || d.webkitExitFullscreen || d.msExitFullscreen;
        if (exit) exit.call(d);
      }
    } catch (e) { /* some browsers block without a user gesture; ignore */ }
  };
  LessonRunner.prototype._updateFsLabel = function () {
    var btn = this.el.querySelector("#lr-fs");
    if (!btn) return;
    var isFs = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
    btn.innerHTML = isFs ? "⤢ Exit full screen" : "⛶ Full screen";
    btn.classList.toggle("active", !!isFs);
    // the exam stage height depends on viewport → re-fit after a FS change
    if (this._examFit) requestAnimationFrame(this._examFit);
  };

  LessonRunner.prototype._paintStepper = function () {
    var self = this;
    this.el.querySelectorAll(".lr-step").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-sec") === self.section);
    });
  };

  LessonRunner.prototype._renderSection = function () {
    var host = this.el.querySelector("#lr-content");
    if (this._testRunner) { this._testRunner.destroy && this._testRunner.destroy(); this._testRunner = null; }
    this._deactivateExamLayout();               // reset any full-viewport exam stage
    host.innerHTML = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (this.section === "learn") this._renderLearn(host);
    else if (this.section === "exam") this._renderExam(host);
    else if (this.section === "flashcards") this._renderFlashcards(host);
  };

  /* Full-viewport split-screen stage for the exam (passage | questions | nav,
   * each column scrolling independently). Purely a wrapper concern — the reused
   * TestRunner markup is untouched. */
  LessonRunner.prototype._activateExamLayout = function (host) {
    var self = this;
    if (window.innerWidth < 960) return;        // narrow screens flow normally
    host.classList.add("exam-mode");
    this._examFit = function () {
      var r = host.getBoundingClientRect();
      var h = Math.max(420, window.innerHeight - r.top);
      host.style.height = h + "px";
      host.style.setProperty("--exam-stage-h", h + "px");
      var rt = host.querySelector(".runner-top");
      host.style.setProperty("--exam-head", (rt ? rt.offsetHeight : 56) + "px");
    };
    this._examFit();
    // re-measure after layout settles + on resize
    requestAnimationFrame(this._examFit);
    window.addEventListener("resize", this._examFit);
  };
  LessonRunner.prototype._deactivateExamLayout = function () {
    var host = this.el.querySelector("#lr-content");
    if (host) { host.classList.remove("exam-mode"); host.style.height = ""; }
    if (this._examFit) { window.removeEventListener("resize", this._examFit); this._examFit = null; }
  };

  /* ---------------- Section 1: Learn ---------------- */
  LessonRunner.prototype._renderLearn = function (host) {
    var self = this, L = this.lesson;
    host.innerHTML = '<div id="lr-present"></div>' +
      (L.miniPractice && L.miniPractice.length ?
        '<div class="panel"><div class="panel-head"><h3>Mini-practice</h3>' +
        '<span class="chip" id="mp-progress">0 / ' + L.miniPractice.length + '</span></div>' +
        '<div id="lr-mp"></div>' +
        '<div class="lr-section-done"><button class="btn primary" id="learn-done">Mark section complete →</button></div></div>' : '') ;

    if (root.VocabGrammar) root.VocabGrammar.render(host.querySelector("#lr-present"), L, {});

    if (L.miniPractice && L.miniPractice.length && root.MiniPractice) {
      new root.MiniPractice(host.querySelector("#lr-mp"), L.miniPractice, {
        seed: this.seed,
        onResult: function (activityId, res) {
          self.mpResults[activityId] = res.correct;
          var s = root.MiniPractice.summary(self.mpResults);
          var pg = host.querySelector("#mp-progress");
          if (pg) pg.textContent = s.correct + " / " + L.miniPractice.length + " correct";
          self.store.recordActivity(self.studentId, L.id, self.courseId, activityId, res);
        }
      });
      var done = host.querySelector("#learn-done");
      if (done) done.onclick = function () {
        var s = root.MiniPractice.summary(self.mpResults);
        self.store.setSectionStatus(self.studentId, L.id, self.courseId, "learn",
          { completed: true, score: s.percent, at: new Date().toISOString() });
        done.textContent = "✓ Section complete"; done.disabled = true;
        self.section = self._availSections().filter(function (x){return x.id!=="learn";}).length ? "exam" : "learn";
        if (self.section === "exam") { self._renderSection(); self._paintStepper(); }
      };
    }
  };

  /* ---------------- Section 2: Exam ---------------- */
  LessonRunner.prototype._renderExam = function (host) {
    var self = this, L = this.lesson;
    if (!L.exam) { host.innerHTML = '<p class="muted">This lesson has no exam.</p>'; return; }
    var model = L.exam;
    // Randomize at runtime: arrangement sentences are always scrambled; MCQ
    // options shuffle unless shuffle_options = no.
    if (L.randomize && root.LessonRandom) {
      model = root.LessonRandom.permuteExamModel(L.exam, self.seed + "|exam", { shuffleOptions: L.shuffleOptions !== false });
    }
    this._testRunner = new root.TestRunner(host, model, {
      mode: model.defaultMode || "practice",
      candidate: { name: this.studentName, id: this.studentId },
      onSubmit: function (result) {
        result.lessonId = L.id;
        result.courseId = self.courseId;
        result.sectionId = "exam";
        self.examResult = result;
        self.store.saveAttempt(result);
        if (!result.preview)
          self.store.setSectionStatus(self.studentId, L.id, self.courseId, "exam",
            { completed: true, score: result.score.percent, at: new Date().toISOString() });
        // Results & review are a single scrolling column — leave the split stage.
        setTimeout(function () { self._deactivateExamLayout(); }, 0);
      },
      onExit: this.opts.onExit ? function () {
        self.section = "flashcards"; self._render();
      } : null
    });
    this._activateExamLayout(host);
  };

  /* ---------------- Section 3: Flashcards ---------------- */
  LessonRunner.prototype._renderFlashcards = function (host) {
    var L = this.lesson;
    host.innerHTML = '<div class="panel"><div class="panel-head"><h3>Flashcards</h3>' +
      '<span class="chip">' + (L.flashcards ? L.flashcards.length : 0) + ' in this lesson</span></div>' +
      '<div id="lr-deck"></div></div>';
    this._deck = new root.FlashcardDeck(host.querySelector("#lr-deck"), {
      store: this.store, courseId: this.courseId, lessonId: L.id, studentId: this.studentId, scope: "lesson"
    });
  };

  LessonRunner.prototype.destroy = function () {
    if (this._testRunner && this._testRunner.destroy) this._testRunner.destroy();
    this._deactivateExamLayout();
    if (this._fsHandler) {
      document.removeEventListener("fullscreenchange", this._fsHandler);
      document.removeEventListener("webkitfullscreenchange", this._fsHandler);
      this._fsHandler = null;
    }
  };

  root.LessonRunner = LessonRunner;

})(typeof window !== "undefined" ? window : this);
