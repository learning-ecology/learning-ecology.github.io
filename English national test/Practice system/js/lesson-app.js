/* =============================================================================
 * lesson-app.js — Teacher shell: lesson library, Excel import (validate →
 * preview → generate), lesson management, results dashboard, course bank.
 * Global: `LessonApp`. Depends on LessonEngine, LessonStore, LessonRunner,
 * FlashcardDeck, TestEngine/TestRunner, XLSX. Your LMS can bypass this file and
 * call LessonEngine.parseWorkbook + LessonRunner + LessonStore directly.
 * =========================================================================== */
(function (root) {
  "use strict";

  var app, runner = null, deck = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function fmt(s) { return root.LessonEngine ? root.LessonEngine.formatText(s) : esc(s); }
  function setSub(t) { var e = document.querySelector(".app-header .sub"); if (e) e.textContent = t; }
  function toast(msg, kind) {
    var wrap = document.querySelector(".toast-wrap");
    if (!wrap) { wrap = document.createElement("div"); wrap.className = "toast-wrap"; document.body.appendChild(wrap); }
    var t = document.createElement("div"); t.className = "toast " + (kind || ""); t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(function () { t.style.opacity = "0"; setTimeout(function () { wrap.removeChild(t); }, 300); }, 2800);
  }
  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || "text/plain" });
    var url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function show(fn) {
    if (runner) { runner.destroy && runner.destroy(); runner = null; }
    deck = null; app.innerHTML = ""; fn();
  }

  /* ============================ Library ============================ */
  function library() {
    setSub("Lesson library");
    root.LessonStore.listLessons().then(function (lessons) {
      var cards = lessons.map(function (rec) {
        var L = rec;
        var c = rec.counts || {};
        return '<div class="test-card card">' +
          '<h3>' + (L.lessonNo != null ? "Lesson " + esc(L.lessonNo) + " — " : "") + esc(L.title) + '</h3>' +
          '<div class="meta">' + esc([L.topic, L.grammarTitle].filter(Boolean).join(" · ")) + '</div>' +
          '<div class="stats">' +
            '<span class="chip">Vocab ' + (c.vocabulary || 0) + '</span>' +
            '<span class="chip">Chunks ' + (c.chunks || 0) + '</span>' +
            '<span class="chip">Practice ' + (c.miniPractice || 0) + '</span>' +
            '<span class="chip">Exam ' + (c.examQuestions || 0) + '</span>' +
            '<span class="chip good">Cards ' + (c.flashcards || 0) + '</span>' +
          '</div>' +
          '<div class="actions">' +
            '<button class="btn sm primary" data-act="open" data-id="' + esc(L.id) + '">Open lesson</button>' +
            '<button class="btn sm" data-act="results" data-id="' + esc(L.id) + '">Results</button>' +
            '<button class="btn sm" data-act="bank" data-id="' + esc(L.id) + '">Flashcard bank</button>' +
            (L.exam ? '<button class="btn sm" data-act="word" data-id="' + esc(L.id) + '">⬇ Export Word</button>' : '') +
            '<button class="btn sm danger" data-act="del" data-id="' + esc(L.id) + '">Delete</button>' +
          '</div></div>';
      }).join("");

      app.innerHTML =
        '<div class="wrap">' +
          '<div class="lib-head">' +
            '<div><h2>Lessons</h2><p class="muted">Create a lesson by uploading an Excel file. All lessons share one UI, engine, scoring, flashcard bank and progress model.</p></div>' +
            '<div class="lib-actions">' +
              '<button class="btn primary" id="import-btn">＋ Import lesson (Excel)</button>' +
              '<button class="btn" id="bank-all-btn">📇 Course flashcard bank</button>' +
            '</div>' +
          '</div>' +
          (lessons.length ? '<div class="card-grid">' + cards + '</div>'
            : '<div class="empty"><h3>No lessons yet</h3><p class="muted">Click <b>Import lesson (Excel)</b> and drop your lesson workbook, or start from the template in <code>assets/lesson-template.xlsx</code>.</p></div>') +
        '</div>';

      document.getElementById("import-btn").onclick = importFlow;
      document.getElementById("bank-all-btn").onclick = function () { courseBank(lessons[0] ? lessons[0].courseId : "course"); };
      app.querySelectorAll("[data-act]").forEach(function (b) {
        var id = b.getAttribute("data-id"), act = b.getAttribute("data-act");
        b.onclick = function () {
          if (act === "open") openLesson(id);
          else if (act === "results") results(id);
          else if (act === "bank") { root.LessonStore.getLesson(id).then(function (L) { courseBank(L.courseId, id); }); }
          else if (act === "word") { root.LessonStore.getLesson(id).then(function (L) { exportWord(L); }); }
          else if (act === "del") {
            if (confirm("Delete this lesson? Its flashcards are removed from the shared bank too.")) {
              root.LessonStore.getLesson(id).then(function (L) {
                root.LessonStore.removeLessonFromBank(L.courseId, id).then(function () {
                  root.LessonStore.deleteLesson(id).then(function () { toast("Lesson deleted"); library(); });
                });
              });
            }
          }
        };
      });
    });
  }

  /* ============================ Import flow ============================ */
  function importFlow() {
    show(function () {
      setSub("Import lesson");
      app.innerHTML =
        '<div class="wrap wrap-narrow">' +
          '<div class="card card-pad">' +
            '<h2>Import a lesson</h2>' +
            '<p class="muted">Upload a lesson workbook (sheets: Lesson_Info, Vocabulary, Collocations, Chunks, Grammar, Grammar_Errors, Mini_Practice, Exam_Groups, Exam_Questions, Flashcards). The file is validated before anything is saved.</p>' +
            '<div class="dropzone" id="dz"><input type="file" id="file" accept=".xlsx,.xls" hidden>' +
              '<div class="dz-inner">📄 <b>Choose Excel file</b> or drop it here</div></div>' +
            '<div id="report"></div>' +
            '<div class="btn-row mt"><button class="btn ghost" id="cancel">Cancel</button></div>' +
          '</div>' +
        '</div>';
      var file = document.getElementById("file"), dz = document.getElementById("dz");
      dz.onclick = function () { file.click(); };
      dz.ondragover = function (e) { e.preventDefault(); dz.classList.add("over"); };
      dz.ondragleave = function () { dz.classList.remove("over"); };
      dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove("over"); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); };
      file.onchange = function () { if (file.files[0]) handleFile(file.files[0]); };
      document.getElementById("cancel").onclick = library;
    });
  }

  function handleFile(f) {
    var report = document.getElementById("report");
    report.innerHTML = '<p class="muted">Reading <b>' + esc(f.name) + '</b>…</p>';
    var reader = new FileReader();
    reader.onload = function (e) {
      var parsed;
      try { parsed = root.LessonEngine.parseWorkbook(new Uint8Array(e.target.result)); }
      catch (err) { report.innerHTML = '<div class="report-box err"><b>Could not read the file.</b><div>' + esc(err.message) + '</div></div>'; return; }
      renderReport(parsed, f.name);
    };
    reader.readAsArrayBuffer(f);
  }

  function renderReport(parsed, filename) {
    var report = document.getElementById("report");
    var errs = parsed.errors || [], warns = parsed.warnings || [], L = parsed.lesson;
    var html = "";
    if (errs.length) {
      html += '<div class="report-box err"><b>✗ ' + errs.length + ' problem(s) — nothing was saved. Fix these and re-upload:</b><ul>' +
        errs.map(function (x) { return '<li><span class="loc">' + esc(x.sheet) + (x.row ? " · row " + x.row : "") + '</span> ' + esc(x.message) + '</li>'; }).join("") + '</ul></div>';
    }
    if (warns.length) {
      html += '<div class="report-box warn"><b>⚠ ' + warns.length + ' warning(s) (non-blocking):</b><ul>' +
        warns.map(function (x) { return '<li><span class="loc">' + esc(x.sheet) + (x.row ? " · row " + x.row : "") + '</span> ' + esc(x.message) + '</li>'; }).join("") + '</ul></div>';
    }
    if (!errs.length && L) {
      var c = L.counts;
      html += '<div class="report-box ok"><b>✓ Looks good — preview the generated lesson below.</b></div>' +
        '<div class="preview">' +
          '<h3>' + (L.lessonNo != null ? "Lesson " + esc(L.lessonNo) + " — " : "") + esc(L.title) + '</h3>' +
          '<div class="stats mt">' +
            '<span class="chip">Vocabulary ' + c.vocabulary + '</span>' +
            '<span class="chip">Collocations ' + c.collocations + '</span>' +
            '<span class="chip">Chunks ' + c.chunks + '</span>' +
            '<span class="chip">Grammar ' + c.grammarPoints + ' + ' + c.grammarErrors + ' errors</span>' +
            '<span class="chip">Mini-practice ' + c.miniPractice + '</span>' +
            '<span class="chip">Exam ' + c.examQuestions + '</span>' +
            '<span class="chip good">Flashcards ' + c.flashcards + '</span>' +
          '</div>' +
          previewSamples(L) +
        '</div>' +
        '<div class="btn-row mt">' +
          '<button class="btn primary" id="confirm-import">Import &amp; generate lesson</button>' +
          '<button class="btn" id="preview-run">▶ Preview as student</button>' +
          (L.exam ? '<button class="btn" id="preview-word">⬇ Export Word</button>' : '') +
        '</div>';
    }
    report.innerHTML = html;

    if (!errs.length && L) {
      document.getElementById("confirm-import").onclick = function () {
        var record = Object.assign({}, L, { source: filename });
        root.LessonStore.saveLesson(record).then(function () {
          return root.LessonStore.addLessonToBank(L.courseId, L.id, L.flashcards);
        }).then(function () {
          toast("Lesson imported · " + L.counts.flashcards + " cards added to the course bank", "ok");
          library();
        });
      };
      document.getElementById("preview-run").onclick = function () { runLesson(L, true); };
      var pw = document.getElementById("preview-word");
      if (pw) pw.onclick = function () { exportWord(L); };
    }
  }

  /* ---------------- Export the exam paper to .docx ---------------- */
  function exportWord(L) {
    if (!L || !L.exam) { toast("This lesson has no exam to export.", ""); return; }
    if (!root.DocxExport) { toast("Word export module not loaded.", ""); return; }
    try {
      var base = (L.lessonNo != null ? "Lesson " + L.lessonNo + " - " : "") + (L.title || "Exam");
      root.DocxExport.download(L.exam, base.replace(/[\\/:*?"<>|]/g, "-") + " - Exam.docx", { answerKey: true });
      toast("Word document exported", "ok");
    } catch (e) { toast("Export failed: " + e.message, ""); }
  }

  function previewSamples(L) {
    var out = "";
    if (L.vocabulary.length) {
      out += '<h4 class="mt">Vocabulary (first 5)</h4><table class="mini-table"><thead><tr><th>Term</th><th>POS</th><th>Definition</th><th>Vietnamese</th></tr></thead><tbody>' +
        L.vocabulary.slice(0, 5).map(function (v) {
          return '<tr><td><b>' + fmt(v.term) + '</b></td><td>' + esc(v.pos) + '</td><td>' + fmt(v.defEn) + '</td><td>' + esc(v.vi) + '</td></tr>';
        }).join("") + '</tbody></table>';
    }
    if (L.miniPractice.length) {
      out += '<h4 class="mt">Mini-practice types</h4><div class="stats">' +
        Object.entries(L.miniPractice.reduce(function (m, x) { m[x.type] = (m[x.type] || 0) + 1; return m; }, {}))
          .map(function (kv) { return '<span class="chip">' + esc(kv[0]) + ' × ' + kv[1] + '</span>'; }).join("") + '</div>';
    }
    if (L.exam) {
      out += '<h4 class="mt">Exam sections</h4><div class="stats">' +
        L.exam.sections.map(function (s) { return '<span class="chip">' + esc(s.type) + ' · ' + s.questions.length + 'Q</span>'; }).join("") + '</div>';
    }
    return out;
  }

  /* ============================ Open / run ============================ */
  function openLesson(id) {
    root.LessonStore.getLesson(id).then(function (L) { if (L) runLesson(L, false); });
  }
  function runLesson(L, preview) {
    show(function () {
      setSub((preview ? "Preview · " : "") + L.title);
      var host = document.createElement("div"); host.id = "runner-host"; app.appendChild(host);
      runner = new root.LessonRunner(host, L, {
        store: root.LessonStore, courseId: L.courseId,
        studentId: preview ? "preview" : (root.LessonApp.studentId || "student-demo"),
        studentName: preview ? "Preview" : (root.LessonApp.studentName || "Student"),
        onExit: function () { library(); }
      });
    });
  }

  /* ============================ Results ============================ */
  function results(lessonId) {
    show(function () {
      setSub("Results");
      root.LessonStore.getLesson(lessonId).then(function (L) {
        root.LessonStore.listAttempts({ lessonId: lessonId }).then(function (attempts) {
          var rows = attempts.map(function (a) {
            return '<tr><td>' + esc(a.candidate ? a.candidate.name : "—") + '</td>' +
              '<td>' + esc(a.candidate ? a.candidate.id : "") + '</td>' +
              '<td>' + (a.score ? a.score.correct + " / " + a.score.total : "—") + '</td>' +
              '<td>' + (a.score ? a.score.percent + "%" : "—") + '</td>' +
              '<td>' + (a.mode || "") + '</td>' +
              '<td>' + (a.submittedAt ? new Date(a.submittedAt).toLocaleString() : "") + '</td></tr>';
          }).join("");
          app.innerHTML =
            '<div class="wrap"><div class="lib-head"><h2>Results — ' + esc(L ? L.title : "") + '</h2>' +
              '<div class="lib-actions"><button class="btn sm" id="csv">Export CSV</button>' +
              '<button class="btn sm" id="json">Export JSON</button>' +
              '<button class="btn sm" id="back">← Lessons</button></div></div>' +
            (attempts.length ?
              '<table class="result-table"><thead><tr><th>Name</th><th>ID</th><th>Score</th><th>%</th><th>Mode</th><th>Submitted</th></tr></thead><tbody>' + rows + '</tbody></table>'
              : '<div class="empty"><p class="muted">No attempts yet for this lesson.</p></div>') +
            '</div>';
          document.getElementById("back").onclick = library;
          document.getElementById("json").onclick = function () { download((L ? L.id : "lesson") + "-attempts.json", JSON.stringify(attempts, null, 2), "application/json"); };
          document.getElementById("csv").onclick = function () { download((L ? L.id : "lesson") + "-attempts.csv", attemptsCsv(attempts), "text/csv"); };
        });
      });
    });
  }

  function attemptsCsv(attempts) {
    var maxQ = 0; attempts.forEach(function (a) { if (a.answers) maxQ = Math.max(maxQ, a.answers.length); });
    var head = ["name", "id", "mode", "correct", "total", "percent", "submittedAt"];
    for (var i = 1; i <= maxQ; i++) head.push("q" + i);
    var lines = [head.join(",")];
    attempts.forEach(function (a) {
      var row = [q(a.candidate && a.candidate.name), q(a.candidate && a.candidate.id), a.mode,
        a.score && a.score.correct, a.score && a.score.total, a.score && a.score.percent, a.submittedAt];
      (a.answers || []).forEach(function (ans) { row.push((ans.isCorrect ? "1" : "0") + ":" + (ans.chosen || "-")); });
      lines.push(row.join(","));
    });
    return lines.join("\n");
    function q(v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  }

  /* ============================ Course flashcard bank ============================ */
  function courseBank(courseId, lessonId) {
    show(function () {
      setSub("Course flashcard bank");
      app.innerHTML = '<div class="wrap"><div class="lib-head"><h2>Course flashcard bank</h2>' +
        '<div class="lib-actions"><button class="btn sm" id="back">← Lessons</button></div></div>' +
        '<p class="muted">Every imported lesson contributes its cards here, de-duplicated across the course. Switch scope to review this lesson, previous lessons, all, or just the difficult ones.</p>' +
        '<div id="bank-deck"></div></div>';
      document.getElementById("back").onclick = library;
      deck = new root.FlashcardDeck(document.getElementById("bank-deck"), {
        store: root.LessonStore, courseId: courseId || "course", lessonId: lessonId || null,
        studentId: root.LessonApp.studentId || "student-demo", scope: lessonId ? "lesson" : "all"
      });
    });
  }

  /* ============================ Mount ============================ */
  root.LessonApp = {
    studentId: "student-demo",
    studentName: "Student",
    mount: function (el) { app = el; library(); },
    library: library
  };

})(typeof window !== "undefined" ? window : this);
