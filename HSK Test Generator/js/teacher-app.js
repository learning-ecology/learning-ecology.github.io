/* ============================================================================
 * teacher-app.js  —  Chinese Test Generator (teacher/admin UI)
 * ----------------------------------------------------------------------------
 * Glue only: wires the DOM to the core engine (import → review → configure →
 * generate → export). No test logic lives here.
 * ==========================================================================*/
(function () {
  'use strict';
  var CTG = window.CTG;
  var S = CTG.schema, esc = CTG.pinyin.escapeHtml;

  var state = { bank: null, report: null, test: null, lastGen: null };
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- theme ---------- */
  (function theme() {
    var saved = CTG.storage.get('theme', null);
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    $('themeBtn').addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme');
      var isDark = cur === 'dark' || (!cur && matchMedia('(prefers-color-scheme: dark)').matches);
      var next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      CTG.storage.set('theme', next);
    });
  })();

  /* ---------- import ---------- */
  var dz = $('dropzone'), fi = $('fileInput');
  dz.addEventListener('click', function () { fi.click(); });
  fi.addEventListener('change', function (e) { if (e.target.files[0]) handleFile(e.target.files[0]); });
  ['dragenter', 'dragover'].forEach(function (ev) {
    dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('drag'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('drag'); });
  });
  dz.addEventListener('drop', function (e) {
    var f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  });

  function handleFile(file) {
    if (!/\.xlsx?$/i.test(file.name)) { showReport({ ok: false, errors: [{ message: 'Please choose an .xlsx Excel file.' }], warnings: [], stats: {} }); return; }
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var res = CTG.excel.parseWorkbook(e.target.result);
        state.bank = res.bank; state.report = res.report;
        showReport(res.report);
        if (res.report.errors.length === 0 && res.bank.questions.length) {
          CTG.storage.set(CTG.storage.KEYS.BANK, res.bank);
          onBankReady();
        }
      } catch (err) {
        showReport({ ok: false, errors: [{ message: 'Could not read the file: ' + err.message }], warnings: [], stats: {} });
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function showReport(report) {
    var el = $('importReport'); var h = '';
    if (report.errors.length) {
      h += '<div class="notice notice-bad"><strong>' + report.errors.length + ' problem(s) must be fixed before importing:</strong></div>';
      h += issueTable(report.errors);
    } else {
      var st = report.stats || {};
      h += '<div class="notice notice-ok">✓ Imported successfully — ' +
        (st.lessons || 0) + ' lessons, ' + ((state.bank && state.bank.questions.length) || 0) +
        ' questions (' + (st.total || 0) + ' scorable items).</div>';
      h += statRow(st);
    }
    if (report.warnings && report.warnings.length) {
      h += '<div class="notice notice-warn"><strong>' + report.warnings.length + ' warning(s)</strong> — imported anyway, but worth a look:</div>';
      h += issueTable(report.warnings);
    }
    el.innerHTML = h;
  }
  function issueTable(rows) {
    var h = '<table class="data"><thead><tr><th>Sheet</th><th>Row</th><th>ID</th><th>Message</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      h += '<tr><td>' + esc(r.sheet || '—') + '</td><td>' + (r.row || '—') + '</td><td class="mono">' + esc(r.id || '') + '</td><td>' + esc(r.message) + '</td></tr>';
    });
    return h + '</tbody></table>';
  }
  function statRow(st) {
    var by = st.byType || {};
    var order = [S.TYPE.PINYIN, S.TYPE.MATCH, S.TYPE.MCQ, S.TYPE.ARRANGE, S.TYPE.READING];
    var h = '<div class="stat-row">';
    order.forEach(function (t) {
      h += '<div class="stat"><div class="n">' + (by[t] || 0) + '</div><div class="l">' + esc(S.sectionLabel(t)) + '</div></div>';
    });
    return h + '</div>';
  }

  /* ---------- bank ready: reveal steps 2-3 ---------- */
  function onBankReady() {
    $('bankCard').classList.remove('hidden');
    $('settingsCard').classList.remove('hidden');
    buildBankBrowser();
    buildLessonList();
    buildSectionList();
    updateAvailability();
    $('settingsCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- bank browser ---------- */
  function buildBankBrowser() {
    var tabs = $('bankTabs'); tabs.innerHTML = '';
    var types = [S.TYPE.PINYIN, S.TYPE.MATCH, S.TYPE.MCQ, S.TYPE.ARRANGE, S.TYPE.READING];
    var grouped = CTG.bank.byType(state.bank.questions);
    types.forEach(function (t, i) {
      var n = (grouped[t] || []).length;
      var b = document.createElement('button');
      b.className = 'bank-tab' + (i === 0 ? ' active' : '');
      b.textContent = S.sectionLabel(t) + ' (' + n + ')';
      b.onclick = function () {
        [].forEach.call(tabs.children, function (c) { c.classList.remove('active'); });
        b.classList.add('active');
        renderBank(t, grouped[t] || []);
      };
      tabs.appendChild(b);
    });
    renderBank(types[0], grouped[types[0]] || []);
  }
  function renderBank(type, list) {
    var body = $('bankBody');
    if (!list.length) { body.innerHTML = '<p class="muted">No questions of this type.</p>'; return; }
    var h = '';
    list.forEach(function (q) {
      h += '<div class="q-card"><div class="q-meta"><span class="pill pill-muted">' + esc(q.id) + '</span><span>' + esc(lessonName(q.lessonId)) + '</span></div>';
      if (type === S.TYPE.PINYIN) {
        h += '<div><strong>' + esc(q.hanzi) + '</strong></div>';
        q.options.forEach(function (o) { h += '<div class="opt' + (o.id === q.answerId ? ' correct' : '') + '">' + esc(o.text) + (o.id === q.answerId ? ' ✓' : '') + '</div>'; });
      } else if (type === S.TYPE.MATCH) {
        q.pairs.forEach(function (p) { h += '<div class="opt">' + esc(p.chinese) + ' — ' + esc(p.meaning) + '</div>'; });
      } else if (type === S.TYPE.MCQ) {
        h += '<div>' + CTG.pinyin.withBreaks(q.prompt) + '</div>';
        q.options.forEach(function (o) { h += '<div class="opt' + (o.id === q.answerId ? ' correct' : '') + '">' + esc(o.text) + (o.id === q.answerId ? ' ✓' : '') + '</div>'; });
      } else if (type === S.TYPE.ARRANGE) {
        h += '<div>' + esc(q.chunks.map(function (c) { return c.text; }).join(' / ')) + '</div>';
        if (q.meaning) h += '<div class="muted">' + esc(q.meaning) + '</div>';
      } else if (type === S.TYPE.READING) {
        h += '<div class="muted" style="margin-bottom:6px">' + esc((q.passage || '').slice(0, 90)) + '…</div>';
        q.questions.forEach(function (sq) { h += '<div class="opt">• ' + esc(sq.prompt) + '</div>'; });
      }
      h += '</div>';
    });
    body.innerHTML = h;
  }

  /* ---------- lessons ---------- */
  function lessonName(id) {
    var l = state.bank.lessons.filter(function (x) { return x.id === id; })[0];
    return l ? l.name : id;
  }
  function buildLessonList() {
    var wrap = $('lessonList'); wrap.innerHTML = '';
    CTG.bank.lessonsWithCounts(state.bank).forEach(function (l) {
      var row = document.createElement('label');
      row.className = 'lesson-item';
      row.innerHTML = '<input type="checkbox" class="lesson-cb" value="' + esc(l.id) + '" checked>' +
        '<span style="flex:1"><strong>' + esc(l.name) + '</strong></span>' +
        '<span class="pill pill-muted">' + l.count + ' q</span>';
      wrap.appendChild(row);
    });
    [].forEach.call(wrap.querySelectorAll('.lesson-cb'), function (cb) {
      cb.addEventListener('change', updateAvailability);
    });
    document.querySelectorAll('[data-lessons]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var v = btn.getAttribute('data-lessons') === 'all';
        wrap.querySelectorAll('.lesson-cb').forEach(function (cb) { cb.checked = v; });
        updateAvailability();
      });
    });
  }
  function selectedLessons() {
    return [].map.call(document.querySelectorAll('.lesson-cb:checked'), function (cb) { return cb.value; });
  }

  /* ---------- sections ---------- */
  function buildSectionList() {
    var wrap = $('sectionList'); wrap.innerHTML = '';
    S.SECTIONS.forEach(function (sec) {
      var row = document.createElement('div');
      row.className = 'section-config';
      row.dataset.type = sec.type;
      var unit = (sec.type === S.TYPE.READING) ? 'passages' : (sec.type === S.TYPE.MATCH ? 'sets' : 'questions');
      row.innerHTML =
        '<div class="sc-main">' +
          '<label class="check"><input type="checkbox" class="sec-cb" checked> <strong>' + esc(sec.label) + '</strong></label>' +
          '<span class="sc-avail"></span>' +
        '</div>' +
        '<div class="sc-count"><label style="font-weight:500">Include</label>' +
          '<input type="number" class="sec-count" min="0" value="5"> <span class="muted">' + unit + '</span></div>';
      wrap.appendChild(row);
      row.querySelector('.sec-cb').addEventListener('change', function (e) {
        row.classList.toggle('off', !e.target.checked);
      });
    });
  }
  function updateAvailability() {
    var avail = CTG.bank.availability(state.bank, selectedLessons());
    document.querySelectorAll('.section-config').forEach(function (row) {
      var t = row.dataset.type;
      var n = avail[t] || 0;
      row.querySelector('.sc-avail').textContent = n + ' available';
      var cb = row.querySelector('.sec-cb');
      var count = row.querySelector('.sec-count');
      count.max = n;
      if (Number(count.value) > n) count.value = n;
      if (n === 0) { cb.checked = false; row.classList.add('off'); cb.disabled = true; }
      else { cb.disabled = false; }
    });
  }

  /* ---------- gather settings ---------- */
  function gatherSettings() {
    var counts = {}, types = {};
    document.querySelectorAll('.section-config').forEach(function (row) {
      var t = row.dataset.type;
      var on = row.querySelector('.sec-cb').checked;
      types[t] = on;
      counts[t] = Number(row.querySelector('.sec-count').value) || 0;
    });
    var scopes = {};
    document.querySelectorAll('#pinyinScopes [data-scope]').forEach(function (cb) {
      scopes[cb.getAttribute('data-scope')] = cb.checked;
    });
    return {
      title: $('testTitle').value.trim() || 'Chinese Test',
      lessonIds: selectedLessons(),
      types: types, counts: counts,
      randomize: $('optRandomize').checked,
      pinyinDefaultOn: $('optPinyinDefault').checked,
      allowPinyinToggle: $('optPinyinToggle').checked,
      pinyinScopes: scopes
    };
  }

  /* ---------- generate ---------- */
  $('generateBtn').addEventListener('click', doGenerate);
  $('regenBtn').addEventListener('click', doGenerate);
  function doGenerate() {
    var settings = gatherSettings();
    CTG.storage.set(CTG.storage.KEYS.SETTINGS, settings);
    var out;
    try {
      out = CTG.generator.generate(state.bank, settings);
    } catch (err) {
      $('genHint').innerHTML = '<span style="color:var(--bad)">' + esc(err.message) + '</span>';
      return;
    }
    state.test = out.test;
    $('genHint').textContent = '';
    showResult(out);
  }

  function showResult(out) {
    var test = out.test;
    $('resultCard').classList.remove('hidden');
    var lines = test.sections.map(function (s) {
      return '<span class="pill pill-red">' + esc(s.label) + ': ' + s.items.length + '</span>';
    }).join(' ');
    var warn = out.issues && out.issues.length
      ? '<div class="notice notice-warn">' + out.issues.map(esc).join('<br>') + '</div>' : '';
    $('genSummary').innerHTML =
      '<p><strong>' + esc(test.title) + '</strong> — ' + test.sections.length + ' sections, ' +
      test.maxPoints + ' points. <span class="mono muted">' + esc(test.testId) + '</span></p>' +
      '<div style="margin:8px 0">' + lines + '</div>' + warn;

    // preview
    var shell = $('previewShell'); shell.classList.remove('hidden');
    var frame = $('previewFrame');
    var html = buildStandalone(test, true);
    if (html) frame.srcdoc = html;
    else shell.classList.add('hidden');

    $('resultCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $('launchBtn').addEventListener('click', function () {
    var html = buildStandalone(state.test, true);
    if (!html) return;
    var w = window.open('', '_blank');
    if (w) { w.document.open(); w.document.write(html); w.document.close(); }
  });

  /* ---------- exports ---------- */
  $('dlJson').addEventListener('click', function () {
    download(safeName(state.test.title) + '.json', JSON.stringify(state.test, null, 2), 'application/json');
  });
  $('dlStandalone').addEventListener('click', function () {
    var html = buildStandalone(state.test, false);
    if (!html) { alert('The standalone player bundle is missing. Run tools/build.js, or use the .json export with student.html.'); return; }
    download(safeName(state.test.title) + '.html', html, 'text/html');
  });

  /* Insert the frozen test into the self-contained player template. `preview`
   * enables preview mode (no "download results" prompt friction differences). */
  function buildStandalone(test, preview) {
    var tpl = window.CTG && CTG.PLAYER_TEMPLATE;
    if (!tpl) return null;
    var json = JSON.stringify(test).replace(/</g, '\\u003c');
    var inject = 'window.__EMBEDDED_TEST__ = ' + json + ';' +
      (preview ? 'window.__PREVIEW__ = true;' : '');
    // The template carries a placeholder script: /*__EMBEDDED_TEST__*/
    return tpl.replace('/*__EMBEDDED_TEST__*/', inject);
  }

  function download(name, content, type) {
    var blob = new Blob([content], { type: type + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
  }
  function safeName(s) { return (s || 'chinese-test').replace(/[^\w一-鿿-]+/g, '_').slice(0, 60); }

  /* ---------- restore last bank (convenience) ---------- */
  (function restore() {
    var saved = CTG.storage.get(CTG.storage.KEYS.BANK, null);
    if (saved && saved.questions && saved.questions.length) {
      state.bank = saved;
      state.report = { ok: true, errors: [], warnings: [], stats: bankStats(saved) };
      $('importReport').innerHTML = '<div class="notice notice-info">Restored your last imported bank (' +
        saved.questions.length + ' questions). Import a new file to replace it. ' +
        '<button class="btn btn-sm btn-ghost" id="clearBank">Clear</button></div>' + statRow(state.report.stats);
      $('clearBank').addEventListener('click', function () {
        CTG.storage.remove(CTG.storage.KEYS.BANK);
        location.reload();
      });
      onBankReady();
    }
  })();
  function bankStats(bank) {
    var st = { lessons: bank.lessons.length, byType: {}, total: 0 };
    Object.keys(S.TYPE).forEach(function (k) { st.byType[S.TYPE[k]] = 0; });
    bank.questions.forEach(function (q) {
      st.byType[q.type]++;
      st.total += q.type === S.TYPE.READING ? q.questions.length : 1;
    });
    return st;
  }
})();
