/* =============================================================================
 * flashcards.js — Section 3 flashcard engine + shared course bank viewer
 * -----------------------------------------------------------------------------
 * Global: `FlashcardDeck` (a class).  Depends on LessonEngine.formatText and a
 * store implementing listBank / getCardStatuses / setCardStatus (LessonStore).
 *
 *   new FlashcardDeck(container, {
 *     store, courseId, lessonId, studentId,
 *     scope: "lesson" | "previous" | "all" | "difficult",   // default "lesson"
 *     onProgress: function (stats) {}                        // {known, unknown, difficult, total, seen}
 *   });
 *
 * Students can: flip a card, mark known / still-learning / difficult, filter to
 * difficult+unknown, shuffle, and switch scope to review current, previous, or
 * ALL course vocabulary. Status persists per student per course (cross-lesson).
 * =========================================================================== */
(function (root) {
  "use strict";

  function fmt(s) { return root.LessonEngine ? root.LessonEngine.formatText(s) : esc(s); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function FlashcardDeck(container, opts) {
    this.el = container;
    this.opts = opts || {};
    this.store = opts.store || root.LessonStore;
    this.courseId = opts.courseId;
    this.lessonId = opts.lessonId;
    this.studentId = opts.studentId || "anon";
    this.scope = opts.scope || "lesson";
    this.cards = [];
    this.statuses = {};
    this.filterDifficult = false;
    this.index = 0;
    this.flipped = false;
    this._load();
  }

  FlashcardDeck.prototype._load = function () {
    var self = this;
    var scopeQuery = {};
    if (this.scope === "lesson") scopeQuery.lessonId = this.lessonId;
    Promise.all([
      this.store.listBank(this.courseId, scopeQuery),
      this.store.getCardStatuses(this.studentId, this.courseId)
    ]).then(function (r) {
      var all = r[0]; self.statuses = r[1] || {};
      if (self.scope === "previous") {
        all = all.filter(function (c) {
          return c.lessons.indexOf(self.lessonId) === -1; // seen in other lessons only
        });
      } else if (self.scope === "difficult") {
        all = all.filter(function (c) {
          var st = self.statuses[c.key] && self.statuses[c.key].status;
          return st === "difficult" || st === "unknown";
        });
      }
      self.cards = all;
      self.index = 0; self.flipped = false;
      self._render();
    });
  };

  FlashcardDeck.prototype._stats = function () {
    var k = 0, u = 0, d = 0, seen = 0;
    var self = this;
    this.cards.forEach(function (c) {
      var st = self.statuses[c.key] && self.statuses[c.key].status;
      if (st) seen++;
      if (st === "known") k++; else if (st === "unknown") u++; else if (st === "difficult") d++;
    });
    return { known: k, unknown: u, difficult: d, total: this.cards.length, seen: seen };
  };

  FlashcardDeck.prototype._render = function () {
    var self = this;
    var stats = this._stats();
    if (this.opts.onProgress) this.opts.onProgress(stats);

    var pool = this.filterDifficult
      ? this.cards.filter(function (c) { var st = self.statuses[c.key] && self.statuses[c.key].status; return st === "difficult" || st === "unknown" || !st; })
      : this.cards;

    var scopeTabs = [["lesson", "This lesson"], ["previous", "Previous lessons"],
                     ["all", "All course"], ["difficult", "Difficult"]]
      .map(function (x) {
        return '<button class="fc-scope' + (self.scope === x[0] ? " active" : "") + '" data-scope="' + x[0] + '">' + x[1] + '</button>';
      }).join("");

    if (!pool.length) {
      this.el.innerHTML =
        '<div class="fc-toolbar">' + scopeTabs + '</div>' +
        '<div class="fc-empty"><h3>No cards here yet</h3><p class="muted">' +
        (this.scope === "difficult" ? "Mark some cards as “Still learning” or “Difficult” and they’ll collect here for focused review."
          : this.scope === "previous" ? "Cards from earlier lessons in this course will appear here once you import them."
          : "This lesson has no flashcards.") + '</p></div>';
      this._wireScopes();
      return;
    }

    if (this.index >= pool.length) this.index = 0;
    var card = pool[this.index];
    var st = (this.statuses[card.key] && this.statuses[card.key].status) || "";
    var back = card.back || {};

    var backHtml =
      (back.pos ? '<span class="fc-pos">' + esc(back.pos) + '</span>' : '') +
      (back.meaning ? '<div class="fc-meaning">' + fmt(back.meaning) + '</div>' : '') +
      (back.vi ? '<div class="fc-vi">' + esc(back.vi) + '</div>' : '') +
      (back.example ? '<div class="fc-example">“' + fmt(back.example) + '”</div>' : '') +
      (back.usage ? '<div class="fc-usage">' + esc(back.usage) + '</div>' : '');

    this.el.innerHTML =
      '<div class="fc-toolbar">' + scopeTabs +
        '<span class="spacer"></span>' +
        '<label class="fc-check"><input type="checkbox" id="fc-diff"' + (this.filterDifficult ? " checked" : "") + '> Focus difficult</label>' +
        '<button class="btn sm" id="fc-shuffle">🔀 Shuffle</button>' +
      '</div>' +
      '<div class="fc-progress">' +
        '<span class="chip good">Known ' + stats.known + '</span>' +
        '<span class="chip warn">Learning ' + stats.unknown + '</span>' +
        '<span class="chip bad">Difficult ' + stats.difficult + '</span>' +
        '<span class="chip">' + (this.index + 1) + ' / ' + pool.length + '</span>' +
      '</div>' +
      '<div class="fc-card' + (this.flipped ? " flipped" : "") + (st ? " status-" + st : "") + '" id="fc-card" tabindex="0">' +
        '<div class="fc-face fc-front">' +
          '<div class="fc-term">' + fmt(card.front) + '</div>' +
          (card.frontPrompt ? '<div class="fc-prompt">' + fmt(card.frontPrompt) + '</div>' : '') +
          '<div class="fc-hint">Click / press Space to flip</div>' +
        '</div>' +
        '<div class="fc-face fc-back">' + (backHtml || '<div class="muted">No details</div>') + '</div>' +
      '</div>' +
      '<div class="fc-actions">' +
        '<button class="btn" id="fc-prev">← Prev</button>' +
        '<button class="btn good" id="fc-known">✓ Known</button>' +
        '<button class="btn warn" id="fc-learning">↻ Still learning</button>' +
        '<button class="btn bad" id="fc-difficult">★ Difficult</button>' +
        '<button class="btn" id="fc-next">Next →</button>' +
      '</div>';

    this._wireScopes();
    var cardEl = this.el.querySelector("#fc-card");
    cardEl.onclick = function () { self.flipped = !self.flipped; cardEl.classList.toggle("flipped"); };
    cardEl.onkeydown = function (e) {
      if (e.code === "Space" || e.key === " ") { e.preventDefault(); self.flipped = !self.flipped; cardEl.classList.toggle("flipped"); }
      else if (e.key === "ArrowRight") self._go(1, pool);
      else if (e.key === "ArrowLeft") self._go(-1, pool);
    };
    this.el.querySelector("#fc-prev").onclick = function () { self._go(-1, pool); };
    this.el.querySelector("#fc-next").onclick = function () { self._go(1, pool); };
    this.el.querySelector("#fc-known").onclick = function () { self._mark(card, "known", pool); };
    this.el.querySelector("#fc-learning").onclick = function () { self._mark(card, "unknown", pool); };
    this.el.querySelector("#fc-difficult").onclick = function () { self._mark(card, "difficult", pool); };
    this.el.querySelector("#fc-shuffle").onclick = function () {
      for (var i = self.cards.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = self.cards[i]; self.cards[i] = self.cards[j]; self.cards[j] = t; }
      self.index = 0; self.flipped = false; self._render();
    };
    this.el.querySelector("#fc-diff").onchange = function (e) { self.filterDifficult = e.target.checked; self.index = 0; self._render(); };
  };

  FlashcardDeck.prototype._wireScopes = function () {
    var self = this;
    this.el.querySelectorAll(".fc-scope").forEach(function (b) {
      b.onclick = function () { self.scope = b.getAttribute("data-scope"); self._load(); };
    });
  };

  FlashcardDeck.prototype._go = function (dir, pool) {
    this.index = (this.index + dir + pool.length) % pool.length;
    this.flipped = false;
    this._render();
  };

  FlashcardDeck.prototype._mark = function (card, status, pool) {
    var self = this;
    // toggle off if same status clicked again
    var cur = this.statuses[card.key] && this.statuses[card.key].status;
    var next = cur === status ? null : status;
    this.statuses[card.key] = next ? { status: next, at: new Date().toISOString() } : undefined;
    if (!next) delete this.statuses[card.key];
    this.store.setCardStatus(this.studentId, this.courseId, card.key, next).then(function () {
      // advance to next card for a smooth review flow
      self.flipped = false;
      self.index = Math.min(self.index + 1, pool.length - 1);
      self._render();
    });
  };

  root.FlashcardDeck = FlashcardDeck;

})(typeof window !== "undefined" ? window : this);
