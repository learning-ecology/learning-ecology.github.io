/* =============================================================================
 * mini-practice.js — Section 1 interactive activity engine (immediate feedback)
 * -----------------------------------------------------------------------------
 * Global: `MiniPractice` (a class). Depends on LessonRandom + LessonEngine.formatText.
 *
 *   new MiniPractice(container, items, {
 *     seed,                       // reproducible shuffling (per student/attempt)
 *     onResult: function (activityId, { correct, timeSec }) {},
 *   });
 *
 * Supported types (all self-check with Correct/Incorrect status, the correct
 * answer, and the explanation):
 *   mcq · context           – shuffled 4-option MCQ (stable option IDs)
 *   gap_fill · sentence_completion · transformation · error_correction
 *                           – free-text input, accepts multiple answers (a|b)
 *   matching                – left column fixed, right choices shuffled
 *   arrangement             – click items into the correct order (shuffled start)
 * =========================================================================== */
(function (root) {
  "use strict";

  function fmt(s) { return root.LessonEngine ? root.LessonEngine.formatText(s) : esc(s); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function normAns(s) {
    return String(s == null ? "" : s).trim().toLowerCase()
      .replace(/[.,!?;:"'’]/g, "").replace(/\s+/g, " ");
  }
  var R = function () { return root.LessonRandom; };

  function MiniPractice(container, items, opts) {
    this.el = container;
    this.items = items || [];
    this.opts = opts || {};
    this.seed = opts.seed != null ? opts.seed : ("mp-" + Date.now());
    this.state = {};      // activityId -> { answered, correct, ...ui state }
    this._render();
  }

  MiniPractice.prototype._render = function () {
    var self = this;
    if (!this.items.length) { this.el.innerHTML = '<p class="muted">No mini-practice in this lesson.</p>'; return; }
    this.el.innerHTML = this.items.map(function (it, i) { return self._activityHtml(it, i); }).join("");
    this.items.forEach(function (it) { self._wire(it); });
  };

  MiniPractice.prototype._activityHtml = function (it, i) {
    var body;
    switch (it.type) {
      case "mcq": case "context": body = this._mcqHtml(it); break;
      case "matching": body = this._matchHtml(it); break;
      case "arrangement": body = this._arrangeHtml(it); break;
      default: body = this._inputHtml(it); break;
    }
    var typeLabel = {
      mcq: "Multiple choice", context: "Context question", gap_fill: "Gap fill",
      sentence_completion: "Sentence completion", transformation: "Transformation",
      error_correction: "Error correction", matching: "Matching", arrangement: "Arrangement"
    }[it.type] || it.type;

    return '<div class="mp-item card" id="mp-' + it.id + '" data-id="' + it.id + '">' +
      '<div class="mp-head"><span class="mp-badge">' + esc(typeLabel) + '</span>' +
        (it.skill ? '<span class="mp-skill">' + esc(it.skill) + '</span>' : '') + '</div>' +
      (it.instructions ? '<div class="mp-instr">' + fmt(it.instructions) + '</div>' : '') +
      (it.stem && it.type !== "arrangement" && it.type !== "matching" ? '<div class="mp-stem">' + fmt(it.stem) + '</div>' : '') +
      '<div class="mp-body">' + body + '</div>' +
      '<div class="mp-controls"><button class="btn sm primary" data-act="check">Check</button>' +
        '<button class="btn sm ghost" data-act="reset" style="display:none">Try again</button></div>' +
      '<div class="mp-feedback" style="display:none"></div>' +
    '</div>';
  };

  /* ---------------- MCQ / context ---------------- */
  MiniPractice.prototype._mcqHtml = function (it) {
    var display = R() ? R().shuffleOptionObjects(it.options, this.seed + "|" + it.id) : it.options;
    this.state[it.id] = { display: display, chosen: null };
    return '<div class="mp-options">' + display.map(function (o, idx) {
      var L = String.fromCharCode(65 + idx);
      return '<button type="button" class="opt" data-opt="' + o.id + '">' +
        '<span class="letter">' + L + '</span><span class="otext">' + fmt(o.text) + '</span></button>';
    }).join("") + '</div>';
  };

  /* ---------------- free-text inputs ---------------- */
  MiniPractice.prototype._inputHtml = function (it) {
    this.state[it.id] = { chosen: null };
    var ph = it.type === "error_correction" ? "Rewrite the corrected sentence…"
           : it.type === "transformation" ? "Complete / rewrite the sentence…" : "Type your answer…";
    return '<input type="text" class="mp-input" placeholder="' + esc(ph) + '" autocomplete="off">';
  };

  /* ---------------- matching ---------------- */
  MiniPractice.prototype._matchHtml = function (it) {
    var pairs = it.pairs || [];
    var rights = pairs.map(function (p) { return { id: p.id, text: p.right }; });
    var shuffled = R() ? R().shuffleOptionObjects(rights.map(function (r) { return { id: r.id, text: r.text, correct: false }; }), this.seed + "|" + it.id)
                       : rights;
    this.state[it.id] = { pairs: pairs };
    var optionsHtml = shuffled.map(function (r, i) {
      var L = String.fromCharCode(65 + i);
      return '<option value="' + r.id + '">' + L + '. ' + esc(r.text) + '</option>';
    }).join("");
    return '<div class="mp-match">' + pairs.map(function (p, i) {
      return '<div class="mp-match-row">' +
        '<span class="mp-left"><b>' + (i + 1) + '.</b> ' + fmt(p.left) + '</span>' +
        '<select class="mp-select" data-pair="' + p.id + '"><option value="">— choose —</option>' + optionsHtml + '</select>' +
      '</div>';
    }).join("") + '</div>';
  };

  /* ---------------- arrangement (click into order) ---------------- */
  MiniPractice.prototype._arrangeHtml = function (it) {
    var res = R() ? R().shuffleArrangement(it.items, this.seed + "|" + it.id)
                  : { display: it.items, correctSequence: it.items.map(function (x) { return x.id; }) };
    this.state[it.id] = { display: res.display, correctSequence: res.correctSequence, order: [] };
    return (it.stem ? '<div class="mp-instr small">' + fmt(it.stem) + '</div>' : '') +
      '<div class="mp-arrange-pool">' + res.display.map(function (x) {
        return '<button type="button" class="mp-chip" data-item="' + x.id + '">' + fmt(x.text) + '</button>';
      }).join("") + '</div>' +
      '<div class="mp-arrange-seq"><span class="muted tiny">Your order:</span> <span class="mp-seq-list"></span></div>';
  };

  /* ---------------- wiring ---------------- */
  MiniPractice.prototype._wire = function (it) {
    var self = this;
    var root_el = this.el.querySelector("#mp-" + it.id);
    var st = this.state[it.id];
    var started = Date.now();

    if (it.type === "mcq" || it.type === "context") {
      root_el.querySelectorAll(".opt").forEach(function (b) {
        b.onclick = function () {
          if (st.locked) return;
          root_el.querySelectorAll(".opt").forEach(function (x) { x.classList.remove("selected"); });
          b.classList.add("selected"); st.chosen = b.getAttribute("data-opt");
        };
      });
    } else if (it.type === "arrangement") {
      var pool = root_el.querySelector(".mp-arrange-pool");
      var seqList = root_el.querySelector(".mp-seq-list");
      pool.querySelectorAll(".mp-chip").forEach(function (chip) {
        chip.onclick = function () {
          if (st.locked) return;
          var id = chip.getAttribute("data-item");
          var pos = st.order.indexOf(id);
          if (pos === -1) { st.order.push(id); chip.classList.add("used"); }
          else { st.order.splice(pos, 1); chip.classList.remove("used"); }
          seqList.innerHTML = st.order.map(function (oid, i) {
            var item = st.display.filter(function (x) { return x.id === oid; })[0];
            return '<span class="mp-seq-item">' + (i + 1) + '. ' + esc(item ? item.text : "") + '</span>';
          }).join(" ");
        };
      });
    }

    root_el.querySelector('[data-act="check"]').onclick = function () {
      var timeSec = Math.round((Date.now() - started) / 1000);
      var res = self._check(it);
      st.locked = true;
      self._showFeedback(root_el, it, res);
      root_el.querySelector('[data-act="check"]').style.display = "none";
      root_el.querySelector('[data-act="reset"]').style.display = "";
      if (self.opts.onResult) self.opts.onResult(it.id, { correct: res.correct, timeSec: timeSec });
    };
    root_el.querySelector('[data-act="reset"]').onclick = function () {
      self.state[it.id] = null;
      var idx = self.items.indexOf(it);
      root_el.outerHTML = self._activityHtml(it, idx);
      self._wire(it);
    };
  };

  /* ---------------- checking ---------------- */
  MiniPractice.prototype._check = function (it) {
    var st = this.state[it.id];
    var root_el = this.el.querySelector("#mp-" + it.id);

    if (it.type === "mcq" || it.type === "context") {
      var correctOpt = it.options.filter(function (o) { return o.correct; })[0];
      var ok = st.chosen === (correctOpt && correctOpt.id);
      // paint options
      root_el.querySelectorAll(".opt").forEach(function (b) {
        var oid = b.getAttribute("data-opt");
        b.disabled = true;
        if (oid === (correctOpt && correctOpt.id)) b.classList.add("correct");
        else if (oid === st.chosen) b.classList.add("wrong");
      });
      return { correct: ok, correctText: correctOpt ? correctOpt.text : "", chosenText: chosenText(it, st.chosen) };
    }

    if (it.type === "matching") {
      var allOk = true, lines = [];
      st.pairs.forEach(function (p) {
        var sel = root_el.querySelector('.mp-select[data-pair="' + p.id + '"]');
        var chosen = sel ? sel.value : "";
        var ok = chosen === p.id;
        if (!ok) allOk = false;
        if (sel) { sel.disabled = true; sel.classList.add(ok ? "correct" : "wrong"); }
        lines.push((ok ? "✓ " : "✗ ") + p.left + " → " + p.right);
      });
      return { correct: allOk, correctText: lines.join("<br>") };
    }

    if (it.type === "arrangement") {
      var ok = st.order.length === st.correctSequence.length &&
               st.order.every(function (id, i) { return id === st.correctSequence[i]; });
      root_el.querySelectorAll(".mp-chip").forEach(function (c) { c.disabled = true; });
      var correctText = st.correctSequence.map(function (id, i) {
        var item = st.display.filter(function (x) { return x.id === id; })[0];
        return (i + 1) + ". " + (item ? item.text : "");
      }).join("<br>");
      return { correct: ok, correctText: correctText };
    }

    // free-text
    var input = root_el.querySelector(".mp-input");
    var val = input ? input.value : "";
    if (input) input.disabled = true;
    var accepted = (it.answers || []).map(normAns);
    var okText = accepted.indexOf(normAns(val)) !== -1;
    if (input) input.classList.add(okText ? "correct" : "wrong");
    return { correct: okText, correctText: (it.answers || []).join(" / "), chosenText: val || "—" };
  };

  function chosenText(it, oid) {
    var o = (it.options || []).filter(function (x) { return x.id === oid; })[0];
    return o ? o.text : "—";
  }

  MiniPractice.prototype._showFeedback = function (root_el, it, res) {
    var fb = root_el.querySelector(".mp-feedback");
    fb.style.display = "";
    fb.className = "mp-feedback " + (res.correct ? "ok" : "no");
    var html = '<div class="mp-status">' + (res.correct ? "✓ Correct" : "✗ Not quite") + '</div>';
    if (!res.correct && res.correctText)
      html += '<div class="mp-answer"><span class="k">Correct answer</span> ' + res.correctText + '</div>';
    if (it.explanation)
      html += '<div class="mp-explain"><span class="k">Explanation</span> ' + fmt(it.explanation) + '</div>';
    fb.innerHTML = html;
  };

  // Aggregate helper for progress rollups.
  MiniPractice.summary = function (results) {
    var correct = 0, total = 0;
    Object.keys(results || {}).forEach(function (k) { total++; if (results[k]) correct++; });
    return { correct: correct, total: total, percent: total ? Math.round(correct / total * 100) : 0 };
  };

  root.MiniPractice = MiniPractice;

})(typeof window !== "undefined" ? window : this);
