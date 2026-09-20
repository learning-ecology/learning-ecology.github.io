/* =============================================================================
 * test-app.js — Application shell: teacher library, Excel upload + validation,
 * preview, test management (activate / duplicate / edit / delete), and the
 * results (attempts) dashboard with CSV/JSON export.
 *
 * Depends on: TestEngine, TestStore, TestRunner.
 * This is the "glue". Your LMS can bypass it entirely and call TestRunner
 * directly with a parsed test model + your own onSubmit handler.
 * =========================================================================== */
(function (root) {
  "use strict";

  var app, root_el, runner = null;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function toast(msg, kind) {
    var wrap = document.querySelector(".toast-wrap");
    if (!wrap) { wrap = document.createElement("div"); wrap.className = "toast-wrap"; document.body.appendChild(wrap); }
    var t = document.createElement("div");
    t.className = "toast " + (kind || "");
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(function () { t.style.transition = "opacity .3s"; t.style.opacity = "0"; setTimeout(function () { wrap.removeChild(t); }, 300); }, 2600);
  }
  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || "text/plain" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------------- Routing ---------------- */
  function show(view) {
    if (runner) { runner.destroy && runner.destroy(); runner = null; }
    root_el.innerHTML = "";
    view();
  }

  /* ---------------- Library ---------------- */
  function libraryView() {
    document.querySelector(".app-header .sub").textContent = "Test library";
    TestStore.listTests().then(function (tests) {
      var cards = tests.map(function (rec) {
        var t = rec.test;
        var typeCounts = {};
        t.sections.forEach(function (s) { typeCounts[s.type] = (typeCounts[s.type] || 0) + s.questions.length; });
        var chips = Object.keys(typeCounts).map(function (k) {
          var label = { arrange: "Arrange", reading: "Reading", cloze: "Cloze" }[k] || k;
          return '<span class="chip">' + label + " " + typeCounts[k] + "</span>";
        }).join("");
        return '<div class="test-card card">' +
          '<h3>' + esc(t.title) + '</h3>' +
          '<div class="meta">' + (t.examCode ? "Code " + esc(t.examCode) + " · " : "") +
            t.questions.length + ' questions · ' + (t.durationMinutes || 50) + ' min · updated ' +
            new Date(rec.updatedAt).toLocaleDateString() + '</div>' +
          '<div class="stats">' + chips +
            '<span class="chip ' + (rec.active ? "on" : "off") + '">' + (rec.active ? "● Active" : "○ Inactive") + '</span></div>' +
          '<div class="actions">' +
            '<button class="btn sm primary" data-act="take" data-id="' + rec.id + '">Take</button>' +
            '<button class="btn sm" data-act="preview" data-id="' + rec.id + '">Preview</button>' +
            '<button class="btn sm" data-act="results" data-id="' + rec.id + '">Results</button>' +
            '<button class="btn sm" data-act="edit" data-id="' + rec.id + '">Edit</button>' +
            '<button class="btn sm" data-act="toggle" data-id="' + rec.id + '">' + (rec.active ? "Deactivate" : "Activate") + '</button>' +
            '<button class="btn sm" data-act="dup" data-id="' + rec.id + '">Duplicate</button>' +
            '<button class="btn sm danger" data-act="del" data-id="' + rec.id + '">Delete</button>' +
          '</div>' +
        '</div>';
      }).join("");

      root_el.innerHTML =
        '<div class="wrap">' +
          '<div class="lib-head"><h1>Your tests</h1><div class="spacer"></div>' +
            '<button class="btn" id="template-btn">⬇ Excel template</button>' +
            '<button class="btn primary" id="upload-btn">＋ Import test (Excel)</button></div>' +
          (tests.length ? '<div class="test-grid">' + cards + '</div>'
            : '<div class="empty"><h2>No tests yet</h2><p>Import an Excel file to generate your first test.<br>' +
              'Use the <b>Excel template</b> button to get the starter workbook.</p>' +
              '<button class="btn primary mt" id="upload-btn2">＋ Import test (Excel)</button></div>') +
        '</div>';

      root_el.querySelector("#upload-btn").onclick = uploadView;
      var u2 = root_el.querySelector("#upload-btn2"); if (u2) u2.onclick = uploadView;
      root_el.querySelector("#template-btn").onclick = downloadTemplateInfo;

      root_el.querySelectorAll("[data-act]").forEach(function (btn) {
        btn.onclick = function () {
          var id = btn.getAttribute("data-id"), act = btn.getAttribute("data-act");
          TestStore.getTest(id).then(function (rec) {
            if (!rec) return;
            if (act === "take") runTest(rec, { preview: false });
            else if (act === "preview") runTest(rec, { preview: true, mode: "practice" });
            else if (act === "results") attemptsView(rec);
            else if (act === "edit") editView(rec);
            else if (act === "toggle") { rec.active = !rec.active; TestStore.saveTest(rec).then(libraryView); }
            else if (act === "dup") duplicateTest(rec);
            else if (act === "del") confirmDelete(rec);
          });
        };
      });
    });
  }

  function duplicateTest(rec) {
    var copy = JSON.parse(JSON.stringify(rec));
    copy.id = rec.id + "-copy-" + Date.now().toString(36);
    copy.test.id = copy.id;
    copy.test.title = rec.test.title + " (copy)";
    copy.title = copy.test.title;
    copy.active = false;
    copy.createdAt = null;
    TestStore.saveTest(copy).then(function () { toast("Test duplicated", "good"); libraryView(); });
  }

  function confirmDelete(rec) {
    var back = document.createElement("div");
    back.className = "modal-back";
    back.innerHTML = '<div class="modal"><h3>Delete this test?</h3>' +
      '<p class="muted">“' + esc(rec.test.title) + '” will be removed from your library. This cannot be undone. (Collected results are kept.)</p>' +
      '<div class="modal-actions"><button class="btn ghost" id="c-no">Cancel</button>' +
      '<button class="btn danger" id="c-yes">Delete</button></div></div>';
    document.body.appendChild(back);
    back.querySelector("#c-no").onclick = function () { document.body.removeChild(back); };
    back.querySelector("#c-yes").onclick = function () {
      document.body.removeChild(back);
      TestStore.deleteTest(rec.id).then(function () { toast("Test deleted"); libraryView(); });
    };
  }

  /* ---------------- Upload + validation ---------------- */
  function uploadView() {
    document.querySelector(".app-header .sub").textContent = "Import test";
    root_el.innerHTML =
      '<div class="wrap wrap-narrow">' +
        '<div class="btn-row mb"><button class="btn ghost" id="back">← Back to library</button></div>' +
        '<h1>Import a test from Excel</h1>' +
        '<p class="muted">Upload a workbook with <b>Info</b>, <b>Groups</b> and <b>Questions</b> sheets. ' +
          'The test is generated automatically — no coding needed.</p>' +
        '<div class="dropzone" id="dz"><div class="big">Drop your .xlsx here</div>' +
          '<div class="muted">or click to choose a file</div>' +
          '<input type="file" id="file" accept=".xlsx,.xls" class="hidden"></div>' +
        '<div id="parse-out" class="mt"></div>' +
      '</div>';
    root_el.querySelector("#back").onclick = libraryView;
    var dz = root_el.querySelector("#dz"), file = root_el.querySelector("#file");
    dz.onclick = function () { file.click(); };
    file.onchange = function () { if (file.files[0]) handleFile(file.files[0]); };
    ["dragenter", "dragover"].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add("drag"); }); });
    ["dragleave", "drop"].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove("drag"); }); });
    dz.addEventListener("drop", function (e) { if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });
  }

  function handleFile(f) {
    var out = root_el.querySelector("#parse-out");
    out.innerHTML = '<p class="muted">Reading “' + esc(f.name) + '” …</p>';
    var reader = new FileReader();
    reader.onload = function (e) {
      var parsed;
      try { parsed = TestEngine.parseWorkbook(new Uint8Array(e.target.result)); }
      catch (err) { out.innerHTML = '<div class="report-item err"><span class="badge">error</span> ' + esc(err.message) + '</div>'; return; }
      renderValidation(parsed, f.name);
    };
    reader.onerror = function () { out.innerHTML = '<div class="report-item err">Could not read the file.</div>'; };
    reader.readAsArrayBuffer(f);
  }

  function renderValidation(parsed, filename) {
    var out = root_el.querySelector("#parse-out");
    var errs = parsed.errors || [], warns = parsed.warnings || [];
    var html = "";

    if (errs.length) {
      html += '<div class="card card-pad mb"><h3 style="color:var(--bad)">' + errs.length + ' error(s) — fix these and re-upload</h3>' +
        errs.map(function (e) {
          return '<div class="report-item err"><span class="badge">err</span>' +
            '<span class="loc">' + esc(e.sheet) + (e.row ? " · row " + e.row : "") + '</span>' +
            '<span>' + esc(e.message) + '</span></div>';
        }).join("") + '</div>';
    }
    if (warns.length) {
      html += '<div class="card card-pad mb"><h3 style="color:var(--warn)">' + warns.length + ' warning(s)</h3>' +
        warns.map(function (w) {
          return '<div class="report-item warn"><span class="badge">warn</span>' +
            '<span class="loc">' + esc(w.sheet) + (w.row ? " · row " + w.row : "") + '</span>' +
            '<span>' + esc(w.message) + '</span></div>';
        }).join("") + '</div>';
    }

    if (!errs.length && parsed.test) {
      var t = parsed.test;
      html += '<div class="card card-pad"><h3 style="color:var(--good)">✓ Looks good</h3>' +
        '<p><b>' + esc(t.title) + '</b> — ' + t.questions.length + ' questions, ' + t.sections.length +
        ' sections, ' + (t.durationMinutes || 50) + ' min.' + (warns.length ? ' (' + warns.length + ' warning(s) above — non-blocking.)' : '') + '</p>' +
        '<div class="btn-row mt">' +
          '<button class="btn primary" id="save-t">Save to library</button>' +
          '<button class="btn" id="prev-t">Preview now</button>' +
        '</div></div>';
    } else if (errs.length) {
      html += '<p class="muted">Nothing was saved. Correct the rows above in Excel and upload again.</p>';
    }

    out.innerHTML = html;

    if (!errs.length && parsed.test) {
      var rec = { id: parsed.test.id, title: parsed.test.title, examCode: parsed.test.examCode, active: true, test: parsed.test, source: filename };
      var s = out.querySelector("#save-t"), p = out.querySelector("#prev-t");
      if (s) s.onclick = function () { TestStore.saveTest(rec).then(function () { toast("Test saved to library", "good"); libraryView(); }); };
      if (p) p.onclick = function () { runTest(rec, { preview: true, mode: "practice" }); };
    }
  }

  /* ---------------- Edit test info ---------------- */
  function editView(rec) {
    var t = rec.test;
    root_el.innerHTML =
      '<div class="wrap wrap-narrow"><div class="btn-row mb"><button class="btn ghost" id="back">← Back</button></div>' +
        '<h1>Edit test info</h1><div class="card card-pad">' +
        field("Title", "e-title", t.title) +
        field("Exam code", "e-code", t.examCode) +
        field("Header line 1", "e-h1", t.headerLine1) +
        field("Header line 2", "e-h2", t.headerLine2) +
        field("Duration (minutes)", "e-dur", t.durationMinutes, "number") +
        '<div class="field"><label>Default mode</label><select id="e-mode">' +
          '<option value="exam"' + (t.defaultMode === "exam" ? " selected" : "") + '>Exam</option>' +
          '<option value="practice"' + (t.defaultMode === "practice" ? " selected" : "") + '>Practice</option></select></div>' +
        field("Pass threshold % (blank = none)", "e-pass", t.passPercent == null ? "" : t.passPercent, "number") +
        '<div class="btn-row mt"><button class="btn primary" id="e-save">Save changes</button></div>' +
      '</div></div>';
    root_el.querySelector("#back").onclick = libraryView;
    root_el.querySelector("#e-save").onclick = function () {
      t.title = val("e-title") || t.title;
      t.examCode = val("e-code");
      t.headerLine1 = val("e-h1"); t.headerLine2 = val("e-h2");
      t.durationMinutes = parseInt(val("e-dur"), 10) || t.durationMinutes;
      t.defaultMode = val("e-mode");
      var p = val("e-pass"); t.passPercent = p === "" ? null : (parseInt(p, 10) || null);
      rec.title = t.title; rec.examCode = t.examCode;
      TestStore.saveTest(rec).then(function () { toast("Saved", "good"); libraryView(); });
    };
    function field(label, id, value, type) {
      return '<div class="field"><label>' + label + '</label><input id="' + id + '" type="' + (type || "text") +
        '" value="' + esc(value) + '"></div>';
    }
    function val(id) { return (root_el.querySelector("#" + id).value || "").trim(); }
  }

  /* ---------------- Run a test ---------------- */
  function runTest(rec, opts) {
    opts = opts || {};
    document.querySelector(".app-header .sub").textContent = opts.preview ? "Preview" : "Taking test";
    show(function () {
      runner = new TestRunner(root_el, rec.test, {
        mode: opts.mode || rec.test.defaultMode,
        preview: !!opts.preview,
        candidate: null,
        onExit: libraryView,
        onSubmit: function (result) {
          if (result.preview) { toast("Preview attempt — not saved"); return; }
          // >>> Collect result. Default = local store; swap TestStore.saveAttempt for your API. <<<
          TestStore.saveAttempt(result).then(function () { toast("Result recorded (" + result.score.percent + "%)", "good"); });
        }
      });
    });
  }

  /* ---------------- Attempts / results dashboard ---------------- */
  function attemptsView(rec) {
    document.querySelector(".app-header .sub").textContent = "Results";
    TestStore.listAttempts(rec.id).then(function (list) {
      var rows = list.map(function (a) {
        return '<tr><td>' + esc(a.candidate && a.candidate.name || "—") + '</td>' +
          '<td>' + esc(a.candidate && a.candidate.id || "") + '</td>' +
          '<td>' + a.score.correct + " / " + a.score.total + '</td>' +
          '<td>' + a.score.percent + '%</td>' +
          '<td>' + (a.mode || "") + '</td>' +
          '<td>' + new Date(a.submittedAt).toLocaleString() + '</td></tr>';
      }).join("");
      var avg = list.length ? Math.round(list.reduce(function (s, a) { return s + a.score.percent; }, 0) / list.length * 10) / 10 : 0;

      root_el.innerHTML =
        '<div class="wrap"><div class="btn-row mb"><button class="btn ghost" id="back">← Back to library</button></div>' +
          '<div class="lib-head"><h1>Results — ' + esc(rec.test.title) + '</h1><div class="spacer"></div>' +
            (list.length ? '<button class="btn" id="csv">⬇ CSV</button><button class="btn" id="json">⬇ JSON</button>' +
              '<button class="btn danger" id="clear">Clear results</button>' : '') + '</div>' +
          (list.length
            ? '<div class="stats mb"><span class="chip brand">' + list.length + ' attempts</span><span class="chip">Average ' + avg + '%</span></div>' +
              '<div class="card card-pad"><table class="data-table"><thead><tr>' +
              '<th>Name</th><th>ID</th><th>Score</th><th>%</th><th>Mode</th><th>Submitted</th></tr></thead>' +
              '<tbody>' + rows + '</tbody></table></div>'
            : '<div class="empty"><h2>No attempts yet</h2><p>Results collected from this test will appear here.</p></div>') +
        '</div>';
      root_el.querySelector("#back").onclick = libraryView;
      var csv = root_el.querySelector("#csv"); if (csv) csv.onclick = function () { exportCSV(rec, list); };
      var json = root_el.querySelector("#json"); if (json) json.onclick = function () { download(fileBase(rec) + "-results.json", JSON.stringify(list, null, 2), "application/json"); };
      var clear = root_el.querySelector("#clear"); if (clear) clear.onclick = function () {
        if (confirm("Clear all collected results for this test?")) TestStore.clearAttempts(rec.id).then(function () { attemptsView(rec); });
      };
    });
  }

  function fileBase(rec) { return (rec.test.title || "test").replace(/[^a-z0-9]+/gi, "_").toLowerCase(); }

  function exportCSV(rec, list) {
    var maxQ = rec.test.questions.length;
    var header = ["name", "candidate_id", "score", "total", "percent", "mode", "submitted_at"];
    for (var i = 1; i <= maxQ; i++) header.push("Q" + (rec.test.questions[i - 1].displayNo));
    var lines = [header.join(",")];
    list.forEach(function (a) {
      var byId = {};
      a.answers.forEach(function (d) { byId[d.questionNo] = d.chosen || ""; });
      var row = [
        csvCell(a.candidate && a.candidate.name), csvCell(a.candidate && a.candidate.id),
        a.score.correct, a.score.total, a.score.percent, a.mode, csvCell(a.submittedAt)
      ];
      rec.test.questions.forEach(function (q) { row.push(csvCell(byId[q.displayNo] || "")); });
      lines.push(row.join(","));
    });
    download(fileBase(rec) + "-results.csv", lines.join("\n"), "text/csv");
  }
  function csvCell(v) {
    v = v == null ? "" : String(v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  function downloadTemplateInfo() {
    // The starter template ships beside the app. Try to fetch it; else point the user to it.
    var candidates = ["assets/test-template.xlsx", "test-template.xlsx"];
    (function tryNext(i) {
      if (i >= candidates.length) { toast("Template file 'test-template.xlsx' is in this folder", ""); return; }
      fetch(candidates[i]).then(function (r) {
        if (!r.ok) throw 0;
        return r.blob();
      }).then(function (b) {
        var url = URL.createObjectURL(b); var a = document.createElement("a");
        a.href = url; a.download = "test-template.xlsx"; a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      }).catch(function () { tryNext(i + 1); });
    })(0);
  }

  /* ---------------- Boot ---------------- */
  root.TestApp = {
    mount: function (el) {
      root_el = el;
      libraryView();
    }
  };

})(typeof window !== "undefined" ? window : this);
