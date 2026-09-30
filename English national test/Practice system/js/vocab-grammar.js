/* =============================================================================
 * vocab-grammar.js — Section 1 presentation (vocabulary, collocations, chunks,
 * grammar points, common errors, exam-skill focus). Global: `VocabGrammar`.
 * Rendering only; the interactive Mini-Practice is mounted separately.
 * =========================================================================== */
(function (root) {
  "use strict";

  function fmt(s) { return root.LessonEngine ? root.LessonEngine.formatText(s) : esc(s); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function vocabCard(v) {
    return '<div class="vocab-card" data-id="' + esc(v.id) + '">' +
      '<div class="vc-top">' +
        '<span class="vc-term">' + fmt(v.term) + '</span>' +
        (v.pos ? '<span class="vc-pos">' + esc(v.pos) + '</span>' : '') +
        (v.ipa ? '<button class="vc-say" title="Listen" data-say="' + esc(v.term) + '">🔊 /' + esc(v.ipa) + '/</button>'
               : '<button class="vc-say" title="Listen" data-say="' + esc(v.term) + '">🔊</button>') +
      '</div>' +
      (v.defEn ? '<div class="vc-def">' + fmt(v.defEn) + '</div>' : '') +
      (v.vi ? '<div class="vc-vi">🇻🇳 ' + esc(v.vi) + '</div>' : '') +
      (v.example ? '<div class="vc-ex">“' + fmt(v.example) + '”</div>' : '') +
    '</div>';
  }

  function render(container, lesson, opts) {
    opts = opts || {};
    var html = "";

    if (lesson.objectives && lesson.objectives.length) {
      html += '<div class="panel"><h3>Lesson objectives</h3><ul class="obj-list">' +
        lesson.objectives.map(function (o) { return '<li>' + fmt(o) + '</li>'; }).join("") + '</ul></div>';
    }

    /* Vocabulary */
    if (lesson.vocabulary.length) {
      html += '<div class="panel"><div class="panel-head"><h3>Vocabulary</h3>' +
        '<span class="chip">' + lesson.vocabulary.length + ' items</span></div>' +
        '<div class="vocab-grid">' + lesson.vocabulary.map(vocabCard).join("") + '</div></div>';
    }

    /* Collocations */
    if (lesson.collocations.length) {
      html += '<div class="panel"><div class="panel-head"><h3>Collocations</h3></div>' +
        '<div class="colloc-list">' + lesson.collocations.map(function (c) {
          return '<div class="colloc-row"><span class="colloc-kw">' + fmt(c.keyword) + '</span>' +
            '<span class="colloc-phrases">' + c.collocations.map(function (p) { return '<span class="tag">' + fmt(p) + '</span>'; }).join("") + '</span>' +
            (c.example ? '<div class="colloc-ex">“' + fmt(c.example) + '”</div>' : '') + '</div>';
        }).join("") + '</div></div>';
    }

    /* Chunks */
    if (lesson.chunks.length) {
      html += '<div class="panel"><div class="panel-head"><h3>Lexical chunks &amp; fixed expressions</h3>' +
        '<span class="chip">' + lesson.chunks.length + '</span></div>' +
        '<div class="chunk-grid">' + lesson.chunks.map(function (k) {
          return '<div class="chunk-card"><div class="chunk-top">' + fmt(k.chunk) + '</div>' +
            (k.meaningEn ? '<div class="chunk-mean">' + fmt(k.meaningEn) + '</div>' : '') +
            (k.vi ? '<div class="chunk-vi">🇻🇳 ' + esc(k.vi) + '</div>' : '') +
            (k.example ? '<div class="chunk-ex">“' + fmt(k.example) + '”</div>' : '') + '</div>';
        }).join("") + '</div></div>';
    }

    /* Exam-skill focus */
    if (lesson.examSkill && (lesson.examSkill.title || lesson.examSkill.body)) {
      html += '<div class="panel accent"><h3>🎯 Exam-skill focus' +
        (lesson.examSkill.title ? ' — ' + esc(lesson.examSkill.title) : '') + '</h3>' +
        '<div class="prose">' + fmt(lesson.examSkill.body).replace(/\n/g, "<br>") + '</div></div>';
    }

    /* Grammar */
    if (lesson.grammar.points.length || lesson.grammar.errors.length) {
      html += '<div class="panel"><div class="panel-head"><h3>Grammar' +
        (lesson.grammar.title ? ' — ' + esc(lesson.grammar.title) : '') + '</h3></div>';
      if (lesson.grammar.intro) html += '<div class="prose">' + fmt(lesson.grammar.intro).replace(/\n/g, "<br>") + '</div>';
      lesson.grammar.points.forEach(function (g) {
        html += '<div class="grammar-point"><h4>' + fmt(g.heading) + '</h4>' +
          (g.explanation ? '<div class="prose">' + fmt(g.explanation).replace(/\n/g, "<br>") + '</div>' : '') +
          (g.examples.length ? '<ul class="ex-list">' + g.examples.map(function (e) { return '<li>' + fmt(e) + '</li>'; }).join("") + '</ul>' : '') +
        '</div>';
      });
      if (lesson.grammar.errors.length) {
        html += '<h4 class="mt">Common mistakes</h4><table class="err-table"><thead><tr><th>✗ Incorrect</th><th>✓ Correct</th><th>Why</th></tr></thead><tbody>' +
          lesson.grammar.errors.map(function (e) {
            return '<tr><td class="bad-cell">' + fmt(e.incorrect) + '</td><td class="good-cell">' + fmt(e.correct) + '</td><td>' + fmt(e.why) + '</td></tr>';
          }).join("") + '</tbody></table>';
      }
      html += '</div>';
    }

    container.innerHTML = html || '<p class="muted">No vocabulary or grammar content in this lesson.</p>';

    // Pronunciation (Web Speech API, graceful no-op offline / unsupported).
    container.querySelectorAll("[data-say]").forEach(function (b) {
      b.onclick = function () {
        try {
          var u = new SpeechSynthesisUtterance(b.getAttribute("data-say"));
          u.lang = "en-US"; u.rate = 0.9;
          speechSynthesis.cancel(); speechSynthesis.speak(u);
        } catch (e) { /* ignore */ }
      };
    });
  }

  root.VocabGrammar = { render: render, vocabCard: vocabCard };

})(typeof window !== "undefined" ? window : this);
