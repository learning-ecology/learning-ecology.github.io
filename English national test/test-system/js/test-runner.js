/* =============================================================================
 * test-runner.js — Student test interface (rendering, navigation, timing,
 * submission, results, review). Depends on TestEngine. No storage assumptions:
 * results are handed back via opts.onSubmit(result).
 *
 * Usage:
 *   var runner = new TestRunner(containerEl, testModel, {
 *     mode: "exam" | "practice",
 *     preview: false,                 // true = teacher preview, no auto-save
 *     candidate: { name, id } | null, // null => show candidate start screen
 *     onSubmit: function (result) {}, // called once, after submission
 *     onExit: function () {}          // "back to library"
 *   });
 * =========================================================================== */
(function (root) {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  // fmt() renders teacher content with safe bold/italic/underline markup.
  // Use fmt() for anything authored in Excel (passages, stems, options,
  // explanations, instructions); use esc() for system/candidate values.
  function fmt(s) { return root.TestEngine.formatText(s); }
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var mm = (m < 10 ? "0" : "") + m, ss = (s < 10 ? "0" : "") + s;
    return h > 0 ? h + ":" + mm + ":" + ss : mm + ":" + ss;
  }

  function TestRunner(container, test, opts) {
    this.el = container;
    this.test = test;
    this.opts = opts || {};
    this.mode = this.opts.mode === "practice" ? "practice" : "exam";
    this.answers = {};                       // { qId: "A".."D" }
    this.sectionIndex = 0;
    this.submitted = false;
    this.reviewing = false;
    this.candidate = this.opts.candidate || null;
    this.remaining = (test.durationMinutes || 50) * 60;
    this.startedAt = null;
    this._timer = null;
    this._currentQ = null;                   // highlighted question id

    if (this.candidate) this._begin();
    else this._renderStart();
  }

  TestRunner.prototype._h = function (html) { this.el.innerHTML = html; };

  /* ---------------- Start / candidate screen ---------------- */
  TestRunner.prototype._renderStart = function () {
    var t = this.test;
    var secCount = t.sections.length, qCount = t.questions.length;
    this._h(
      '<div class="wrap wrap-narrow">' +
        '<div class="card card-pad start-card">' +
          '<div class="exam-header-block">' +
            (t.headerLine1 ? '<div class="l1">' + esc(t.headerLine1) + '</div>' : '<div class="l1">' + esc(t.title) + '</div>') +
            (t.headerLine2 ? '<div class="l2">' + esc(t.headerLine2) + '</div>' : '') +
            (t.examCode ? '<div class="code chip brand">Exam code: ' + esc(t.examCode) + '</div>' : '') +
          '</div>' +
          '<h2 style="text-align:center">' + esc(t.title) + '</h2>' +
          '<p class="muted" style="text-align:center">' +
            qCount + ' questions · ' + secCount + ' sections · ' + (t.durationMinutes || 50) + ' minutes' +
          '</p>' +
          (t.instructionsIntro ? '<div class="section-instr">' + esc(t.instructionsIntro) + '</div>' : '') +
          '<div class="field"><label>Candidate name</label><input id="cand-name" type="text" placeholder="Full name" autocomplete="off"></div>' +
          '<div class="field"><label>Candidate ID / Số báo danh <span class="muted tiny">(optional)</span></label><input id="cand-id" type="text" placeholder="e.g. 01234567" autocomplete="off"></div>' +
          '<div class="field"><label>Mode</label><select id="cand-mode">' +
            '<option value="exam"' + (this.mode === "exam" ? " selected" : "") + '>Exam — results shown only after submitting</option>' +
            '<option value="practice"' + (this.mode === "practice" ? " selected" : "") + '>Practice — review answers & explanations after submitting</option>' +
          '</select></div>' +
          '<div class="btn-row mt"><button class="btn primary" id="start-btn">Start test</button>' +
            (this.opts.onExit ? '<button class="btn ghost" id="exit-btn">Cancel</button>' : '') + '</div>' +
        '</div>' +
      '</div>'
    );
    var self = this;
    this.el.querySelector("#start-btn").onclick = function () {
      var name = (self.el.querySelector("#cand-name").value || "").trim();
      self.candidate = { name: name || "Anonymous", id: (self.el.querySelector("#cand-id").value || "").trim() };
      self.mode = self.el.querySelector("#cand-mode").value === "practice" ? "practice" : "exam";
      self._begin();
    };
    if (this.opts.onExit) this.el.querySelector("#exit-btn").onclick = function () { self.opts.onExit(); };
  };

  /* ---------------- Begin exam ---------------- */
  TestRunner.prototype._begin = function () {
    this.startedAt = new Date().toISOString();
    this.remaining = (this.test.durationMinutes || 50) * 60;
    this._renderRunner();
    this._startTimer();
  };

  TestRunner.prototype._startTimer = function () {
    var self = this;
    clearInterval(this._timer);
    this._timer = setInterval(function () {
      self.remaining--;
      self._paintTimer();
      if (self.remaining <= 0) {
        clearInterval(self._timer);
        self._submit(true);
      }
    }, 1000);
  };
  TestRunner.prototype._paintTimer = function () {
    var el = this.el.querySelector("#timer");
    if (!el) return;
    el.textContent = "⏱ " + fmtTime(this.remaining);
    el.classList.toggle("warn", this.remaining <= 300 && this.remaining > 60);
    el.classList.toggle("danger", this.remaining <= 60);
  };

  /* ---------------- Main runner shell ---------------- */
  TestRunner.prototype._renderRunner = function () {
    var t = this.test;
    this._h(
      '<div class="runner-top">' +
        '<div><div class="t-title">' + esc(t.title) + '</div>' +
          '<div class="t-sub">' + esc(this.candidate.name) + (this.candidate.id ? " · " + esc(this.candidate.id) : "") +
          (t.examCode ? " · Code " + esc(t.examCode) : "") + '</div></div>' +
        '<span class="mode-tag ' + this.mode + '">' + this.mode + '</span>' +
        '<div class="spacer" style="flex:1"></div>' +
        '<span class="progress-pill" id="progress"></span>' +
        '<span class="timer" id="timer">⏱ --:--</span>' +
      '</div>' +
      '<div class="runner-body">' +
        '<div id="section-area"></div>' +
        '<div class="nav-panel">' +
          '<h4>Questions</h4>' +
          '<div class="nav-grid" id="nav-grid"></div>' +
          '<div class="nav-legend" id="nav-legend"></div>' +
          '<div class="nav-actions">' +
            '<button class="btn primary" id="submit-btn">Submit test</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
    var self = this;
    this.el.querySelector("#submit-btn").onclick = function () { self._confirmSubmit(); };
    this._paintTimer();
    this._renderSection();
    this._renderNav();
    this._paintProgress();
  };

  TestRunner.prototype._paintProgress = function () {
    var answered = Object.keys(this.answers).length;
    var el = this.el.querySelector("#progress");
    if (el) el.textContent = answered + " / " + this.test.questions.length + " answered";
  };

  /* ---------------- Section screen ---------------- */
  TestRunner.prototype._renderSection = function () {
    var t = this.test, s = t.sections[this.sectionIndex];
    var area = this.el.querySelector("#section-area");
    var hasBody = !!s.body && (s.type === "reading" || s.type === "cloze");

    var instr = s.instructions
      ? '<div class="section-instr"><span class="k">Section ' + (this.sectionIndex + 1) + " / " + t.sections.length +
        '</span><br>' + fmt(s.instructions) + '</div>'
      : '<div class="section-instr"><span class="k">Section ' + (this.sectionIndex + 1) + " / " + t.sections.length + '</span></div>';

    var qHtml = '<div class="q-list">' + s.questions.map(this._questionHtml.bind(this)).join("") + '</div>';

    var inner;
    if (hasBody) {
      inner = instr +
        '<div class="passage-cols">' +
          '<div class="passage-panel"><h4>' + (s.type === "cloze" ? "Text — fill the blanks" : "Reading passage") + '</h4>' +
            '<div class="passage-text">' + this._bodyHtml(s) + '</div></div>' +
          '<div>' + qHtml + '</div>' +
        '</div>';
    } else {
      inner = instr + qHtml;
    }

    inner += '<div class="section-nav">' +
      '<button class="btn" id="prev-sec"' + (this.sectionIndex === 0 ? " disabled" : "") + '>← Previous</button>' +
      '<button class="btn" id="next-sec"' + (this.sectionIndex === t.sections.length - 1 ? " disabled" : "") + '>Next →</button>' +
    '</div>';

    area.innerHTML = inner;

    var self = this;
    var prev = area.querySelector("#prev-sec"), next = area.querySelector("#next-sec");
    if (prev) prev.onclick = function () { if (self.sectionIndex > 0) { self.sectionIndex--; self._afterSectionChange(); } };
    if (next) next.onclick = function () { if (self.sectionIndex < t.sections.length - 1) { self.sectionIndex++; self._afterSectionChange(); } };

    // wire option buttons + blank chips
    this._wireOptions(area);
    this._wireBlanks(area);
  };

  TestRunner.prototype._afterSectionChange = function () {
    this._renderSection();
    this._renderNav();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  TestRunner.prototype._bodyHtml = function (s) {
    if (s.type !== "cloze") return fmt(s.body);
    // Cloze: replace blanks with clickable chips.
    var tokens = root.TestEngine.tokenizeCloze(s.body);
    var self = this;
    return tokens.map(function (tk) {
      if (tk.text !== undefined) return fmt(tk.text);
      // find the question with this displayNo in this section
      var q = s.questions.filter(function (q) { return q.displayNo === tk.blank; })[0];
      var answered = q && self.answers[q.id];
      return '<span class="blank' + (answered ? " answered" : "") + '" data-blank="' + tk.blank + '"' +
        (q ? ' data-q="' + q.id + '"' : "") + '>' +
        (answered ? "(" + tk.blank + ": " + esc(self.answers[q.id]) + ")" : "(" + tk.blank + ")") + '</span>';
    }).join("");
  };

  TestRunner.prototype._questionHtml = function (q) {
    var self = this;
    var chosen = this.answers[q.id];
    var opts = ["A", "B", "C", "D"].filter(function (L) { return q.options[L] !== ""; }).map(function (L) {
      var cls = "opt";
      if (this.reviewing) {
        if (L === q.correct) cls += " correct";
        else if (chosen === L) cls += " wrong";
      } else if (chosen === L) {
        cls += " selected";
      }
      return '<button type="button" class="' + cls + '" data-q="' + q.id + '" data-opt="' + L + '"' +
        (this.reviewing ? " disabled" : "") + '>' +
        '<span class="letter">' + L + '</span><span class="otext">' + fmt(q.options[L]) + '</span></button>';
    }, this).join("");

    var review = "";
    if (this.reviewing) {
      var ok = chosen === q.correct;
      review = '<div class="answer-line">' +
        '<span class="tag">Your answer:</span> ' + (chosen ? '<span class="' + (ok ? "ok" : "no") + '">' + chosen + "</span>" : '<span class="no">—</span>') +
        ' &nbsp;·&nbsp; <span class="tag">Correct:</span> <span class="ok">' + q.correct + "</span></div>";
      if (q.explanation)
        review += '<div class="explain"><span class="k">Explanation</span>' + esc(q.explanation) + '</div>';
    }

    return '<div class="q-card" id="qc-' + q.id + '" data-q="' + q.id + '">' +
      '<div class="q-head"><span class="q-num">' + q.displayNo + '</span>' +
        (q.stem ? '<div class="q-stem">' + fmt(q.stem) + '</div>' : '<div class="q-stem muted">Choose the best answer.</div>') +
      '</div>' +
      '<div class="q-options">' + opts + '</div>' + review +
    '</div>';
  };

  TestRunner.prototype._wireOptions = function (area) {
    var self = this;
    area.querySelectorAll(".opt").forEach(function (btn) {
      if (self.reviewing) return;
      btn.onclick = function () {
        var qId = btn.getAttribute("data-q"), L = btn.getAttribute("data-opt");
        self.answers[qId] = L;
        // repaint this question's options
        var group = btn.parentElement;
        group.querySelectorAll(".opt").forEach(function (b) { b.classList.remove("selected"); });
        btn.classList.add("selected");
        self._currentQ = qId;
        self._paintProgress();
        self._renderNav();
        self._syncBlank(qId);
      };
    });
  };

  TestRunner.prototype._wireBlanks = function (area) {
    var self = this;
    area.querySelectorAll(".blank[data-q]").forEach(function (chip) {
      chip.onclick = function () {
        var qId = chip.getAttribute("data-q");
        var card = self.el.querySelector("#qc-" + qId);
        if (card) {
          self.el.querySelectorAll(".q-card.current").forEach(function (c) { c.classList.remove("current"); });
          card.classList.add("current");
          card.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      };
    });
  };

  TestRunner.prototype._syncBlank = function (qId) {
    // update cloze chip label when an answer changes
    var chip = this.el.querySelector('.blank[data-q="' + qId + '"]');
    if (!chip) return;
    var n = chip.getAttribute("data-blank");
    var val = this.answers[qId];
    chip.classList.toggle("answered", !!val);
    chip.textContent = val ? "(" + n + ": " + val + ")" : "(" + n + ")";
  };

  /* ---------------- Navigator ---------------- */
  TestRunner.prototype._renderNav = function () {
    var grid = this.el.querySelector("#nav-grid");
    var legend = this.el.querySelector("#nav-legend");
    if (!grid) return;
    var self = this, t = this.test;
    // map each question to its section index
    grid.innerHTML = t.questions.map(function (q) {
      var secIdx = t.sections.findIndex(function (s) { return s.id === q.sectionId; });
      var cls = "nav-cell";
      if (self.reviewing) {
        var chosen = self.answers[q.id];
        if (chosen === q.correct) cls += " correct";
        else if (chosen) cls += " wrong";
      } else if (self.answers[q.id]) {
        cls += " answered";
      }
      if (secIdx === self.sectionIndex) cls += " current";
      return '<button class="' + cls + '" data-sec="' + secIdx + '" data-q="' + q.id + '">' + q.displayNo + "</button>";
    }).join("");

    grid.querySelectorAll(".nav-cell").forEach(function (cell) {
      cell.onclick = function () {
        var secIdx = parseInt(cell.getAttribute("data-sec"), 10);
        var qId = cell.getAttribute("data-q");
        if (secIdx !== self.sectionIndex) { self.sectionIndex = secIdx; self._renderSection(); self._renderNav(); }
        var card = self.el.querySelector("#qc-" + qId);
        if (card) {
          self.el.querySelectorAll(".q-card.current").forEach(function (c) { c.classList.remove("current"); });
          card.classList.add("current");
          card.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      };
    });

    if (legend) {
      legend.innerHTML = self.reviewing
        ? '<span><span class="dot correct"></span> Correct</span><span><span class="dot wrong"></span> Incorrect</span><span><span class="dot"></span> Unanswered</span>'
        : '<span><span class="dot answered"></span> Answered</span><span><span class="dot"></span> Not answered</span>';
    }
  };

  /* ---------------- Submit ---------------- */
  TestRunner.prototype._confirmSubmit = function () {
    var answered = Object.keys(this.answers).length, total = this.test.questions.length;
    var unanswered = total - answered;
    var self = this;
    var back = document.createElement("div");
    back.className = "modal-back";
    back.innerHTML =
      '<div class="modal"><h3>Submit your test?</h3>' +
      '<p class="muted">Once submitted you cannot change your answers.</p>' +
      '<div class="confirm-stats">' +
        '<div class="box"><b>' + answered + '</b><span class="tiny muted">Answered</span></div>' +
        '<div class="box ' + (unanswered ? "warn" : "") + '"><b>' + unanswered + '</b><span class="tiny muted">Unanswered</span></div>' +
        '<div class="box"><b>' + fmtTime(self.remaining) + '</b><span class="tiny muted">Time left</span></div>' +
      '</div>' +
      '<div class="modal-actions"><button class="btn ghost" id="m-cancel">Keep working</button>' +
        '<button class="btn primary" id="m-ok">Submit now</button></div></div>';
    document.body.appendChild(back);
    back.querySelector("#m-cancel").onclick = function () { document.body.removeChild(back); };
    back.querySelector("#m-ok").onclick = function () { document.body.removeChild(back); self._submit(false); };
  };

  TestRunner.prototype._submit = function (auto) {
    if (this.submitted) return;
    this.submitted = true;
    clearInterval(this._timer);
    var durationUsed = (this.test.durationMinutes || 50) * 60 - this.remaining;
    var result = root.TestEngine.score(this.test, this.answers, {
      mode: this.mode,
      candidate: this.candidate,
      startedAt: this.startedAt,
      submittedAt: new Date().toISOString(),
      durationUsedSec: durationUsed
    });
    result.autoSubmitted = !!auto;
    result.preview = !!this.opts.preview;
    this.result = result;
    if (typeof this.opts.onSubmit === "function") {
      try { this.opts.onSubmit(result); } catch (e) { console.warn(e); }
    }
    this._renderResults(result);
  };

  /* ---------------- Counts helper ---------------- */
  TestRunner.prototype._counts = function (result) {
    var answered = 0;
    result.answers.forEach(function (a) { if (a.chosen) answered++; });
    return {
      correct: result.score.correct,
      incorrect: answered - result.score.correct,
      unanswered: result.score.total - answered,
      total: result.score.total,
      percent: result.score.percent
    };
  };

  /* ---------------- Results summary ---------------- */
  TestRunner.prototype._renderResults = function (result) {
    var t = this.test;
    var pct = result.score.percent;
    var c = this._counts(result);
    var secNameByType = { arrange: "Arrangement", reading: "Reading", cloze: "Cloze / gap-fill" };
    var byType = {};
    result.bySection.forEach(function (b) {
      var key = b.type || "other";
      if (!byType[key]) byType[key] = { correct: 0, total: 0 };
      byType[key].correct += b.correct; byType[key].total += b.total;
    });
    var rows = Object.keys(byType).map(function (k) {
      var b = byType[k];
      return '<tr><td>' + (secNameByType[k] || k) + '</td><td>' + b.correct + " / " + b.total + '</td><td>' +
        Math.round((b.correct / b.total) * 100) + '%</td></tr>';
    }).join("");

    var passHtml = "";
    if (result.passed !== null) {
      passHtml = '<div class="mt"><span class="pass-badge ' + (result.passed ? "pass" : "fail") + '">' +
        (result.passed ? "PASS" : "NOT YET") + ' · threshold ' + t.passPercent + '%</span></div>';
    }

    var canReview = t.allowReview !== false;
    this._h(
      '<div class="wrap wrap-narrow">' +
        '<div class="card card-pad">' +
          '<div class="score-hero">' +
            (result.autoSubmitted ? '<p class="chip off" style="display:inline-block">⏱ Time expired — auto-submitted</p>' : '') +
            '<div class="score-ring" style="--pct:' + pct + '%"><div class="val"><b>' + pct + '%</b><small>' +
              result.score.correct + ' / ' + result.score.total + '</small></div></div>' +
            '<h2 style="margin:6px 0 2px">' + esc(this.candidate.name) + '</h2>' +
            '<p class="muted">' + esc(t.title) + (t.examCode ? " · Code " + esc(t.examCode) : "") + '</p>' +
            passHtml +
          '</div>' +
          '<div class="stat-row">' +
            '<div class="stat"><b>' + c.correct + '</b><span>Correct</span></div>' +
            '<div class="stat bad"><b>' + c.incorrect + '</b><span>Incorrect</span></div>' +
            '<div class="stat warn"><b>' + c.unanswered + '</b><span>Unanswered</span></div>' +
            '<div class="stat brand"><b>' + pct + '%</b><span>Percentage</span></div>' +
          '</div>' +
          '<table class="result-table mt"><thead><tr><th>Section type</th><th>Score</th><th>%</th></tr></thead>' +
            '<tbody>' + rows + '</tbody></table>' +
          '<div class="btn-row mt">' +
            (canReview ? '<button class="btn primary" id="review-btn">📋 View detailed review</button>' : '') +
            (this.opts.onExit ? '<button class="btn" id="exit-btn">Back to library</button>' : '') +
          '</div>' +
          (!canReview ? '<p class="tiny muted mt">Detailed review is turned off for this test (Info sheet: <b>allow_review = no</b>).</p>' : '') +
        '</div>' +
      '</div>'
    );
    var self = this;
    var rb = this.el.querySelector("#review-btn");
    if (rb) rb.onclick = function () { self.reviewFilter = "all"; self._renderReview(); };
    var eb = this.el.querySelector("#exit-btn");
    if (eb) eb.onclick = function () { self.opts.onExit(); };
  };

  /* ---------------- Detailed review page ---------------- */
  TestRunner.prototype._qStatus = function (q) {
    var chosen = this.answers[q.id];
    return !chosen ? "unanswered" : (chosen === q.correct ? "correct" : "incorrect");
  };

  TestRunner.prototype._reviewBodyHtml = function (s) {
    if (s.type !== "cloze") return fmt(s.body);
    var tokens = root.TestEngine.tokenizeCloze(s.body);
    var self = this;
    return tokens.map(function (tk) {
      if (tk.text !== undefined) return fmt(tk.text);
      var q = s.questions.filter(function (q) { return q.displayNo === tk.blank; })[0];
      var st = q ? self._qStatus(q) : "";
      var val = q && self.answers[q.id];
      return '<span class="blank ' + st + '">(' + tk.blank + (val ? ": " + esc(val) : "") + ')</span>';
    }).join("");
  };

  TestRunner.prototype._reviewCardHtml = function (q) {
    var chosen = this.answers[q.id];
    var st = this._qStatus(q);
    var opts = ["A", "B", "C", "D"].filter(function (L) { return q.options[L] !== ""; }).map(function (L) {
      var cls = "opt";
      if (L === q.correct) cls += " correct";
      else if (chosen === L) cls += " wrong";
      return '<div class="' + cls + '"><span class="letter">' + L + '</span><span class="otext">' + fmt(q.options[L]) + '</span></div>';
    }).join("");

    var badge = { correct: '<span class="status-badge correct">✓ Correct</span>',
                  incorrect: '<span class="status-badge incorrect">✗ Incorrect</span>',
                  unanswered: '<span class="status-badge unanswered">— Unanswered</span>' }[st];

    var cmp = '<div class="cmp-line">' +
      '<span class="cmp"><span class="lbl">Your answer</span> <b class="' + (st === "correct" ? "ok" : "no") + '">' +
        (chosen || "—") + '</b></span>' +
      '<span class="cmp"><span class="lbl">Correct answer</span> <b class="ok">' + q.correct + '</b></span>' +
    '</div>';

    var expl = q.explanation ? '<div class="explain"><span class="k">Explanation</span>' + fmt(q.explanation) + '</div>' : "";

    return '<div class="q-card review ' + st + '" data-status="' + st + '">' +
      '<div class="q-head"><span class="q-num">' + q.displayNo + '</span>' +
        (q.stem ? '<div class="q-stem">' + fmt(q.stem) + '</div>' : '<div class="q-stem muted">Choose the best answer.</div>') +
        badge +
      '</div>' +
      '<div class="q-options review">' + opts + '</div>' + cmp + expl +
    '</div>';
  };

  TestRunner.prototype._renderReview = function () {
    var self = this, t = this.test, result = this.result;
    var filter = this.reviewFilter || "all";
    var c = this._counts(result);
    clearInterval(this._timer);

    var tabs = [["all", "All", c.total], ["incorrect", "Incorrect", c.incorrect],
                ["correct", "Correct", c.correct], ["unanswered", "Unanswered", c.unanswered]]
      .map(function (x) {
        return '<button class="filter-tab' + (filter === x[0] ? " active" : "") + '" data-f="' + x[0] + '">' +
          x[1] + ' <span class="cnt">' + x[2] + '</span></button>';
      }).join("");

    var sections = t.sections.map(function (s) {
      var qs = s.questions.filter(function (q) { return filter === "all" || self._qStatus(q) === filter; });
      if (!qs.length) return "";
      var hasBody = s.body && (s.type === "reading" || s.type === "cloze");
      var passage = hasBody
        ? '<div class="review-passage"><h4>' + (s.type === "cloze" ? "Text" : "Reading passage") + '</h4>' +
          '<div class="passage-text">' + self._reviewBodyHtml(s) + '</div></div>'
        : "";
      var instr = s.instructions ? '<div class="section-instr">' + fmt(s.instructions) + '</div>' : "";
      return '<div class="review-section">' + instr + passage +
        '<div class="q-list">' + qs.map(self._reviewCardHtml.bind(self)).join("") + '</div></div>';
    }).join("");

    if (!sections) sections = '<div class="empty"><h2>No questions</h2><p>Nothing matches this filter.</p></div>';

    this._h(
      '<div class="review-bar">' +
        '<div class="rb-left"><b>' + esc(this.candidate.name) + '</b> · ' + result.score.correct + " / " + result.score.total +
          ' correct · ' + c.percent + '%</div>' +
        '<div class="rb-actions">' +
          (this.opts.onExit ? '<button class="btn sm" id="rv-exit">Back to library</button>' : '') +
          '<button class="btn sm primary" id="rv-summary">Back to results</button>' +
        '</div>' +
      '</div>' +
      '<div class="review-filters">' + tabs + '</div>' +
      '<div class="wrap wrap-review">' + sections + '</div>'
    );

    this.el.querySelectorAll(".filter-tab").forEach(function (tab) {
      tab.onclick = function () { self.reviewFilter = tab.getAttribute("data-f"); self._renderReview(); };
    });
    var sum = this.el.querySelector("#rv-summary");
    if (sum) sum.onclick = function () { self._renderResults(self.result); };
    var ex = this.el.querySelector("#rv-exit");
    if (ex) ex.onclick = function () { self.opts.onExit(); };
    window.scrollTo({ top: 0 });
  };

  TestRunner.prototype.destroy = function () { clearInterval(this._timer); };

  root.TestRunner = TestRunner;

})(typeof window !== "undefined" ? window : this);
