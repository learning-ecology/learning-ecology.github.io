/* ============================================================================
 * student-app.js  —  Chinese Test Generator (student test player)
 * ----------------------------------------------------------------------------
 * A small, framework-free SPA that takes ONE generated test and runs it:
 *   load test  ->  start screen  ->  one screen per item  ->  submit  ->  results
 *
 * The test can arrive three ways (in priority order):
 *   1. window.__EMBEDDED_TEST__     (teacher's "standalone .html" export / preview)
 *   2. ?test=<url>                  (a .json fetched alongside a served page)
 *   3. a file the student opens     (drag/drop or picker of a .json test file)
 *
 * On submit, results are shown AND handed to the LMS adapter (event / callback /
 * postMessage) so a host can capture the attempt. Nothing here knows about
 * accounts, classes or courses — that context comes from lms-adapter.js.
 * ==========================================================================*/
(function () {
  'use strict';
  var CTG = window.CTG;
  var S = CTG.schema, P = CTG.pinyin, esc = P.escapeHtml;
  var TYPE = S.TYPE;
  var app = document.getElementById('app');

  var state = {
    test: null, ctx: null, screens: [], idx: 0,
    answers: {}, startedAt: null, pinyinOn: false, include: {}, allowToggle: false
  };

  /* ---------------- load ---------------- */
  init();
  function init() {
    state.ctx = CTG.lms.readContext();
    CTG.lms.listenForContext(function () { /* context can arrive late; used at submit */ });

    if (window.__EMBEDDED_TEST__) { loadTest(window.__EMBEDDED_TEST__); return; }
    var url = new URLSearchParams(location.search).get('test');
    if (url) {
      fetch(url).then(function (r) { return r.json(); })
        .then(loadTest)
        .catch(function () { renderLoader('Could not load the test from "' + esc(url) + '". Choose the file manually below.'); });
      return;
    }
    renderLoader();
  }

  function loadTest(test) {
    if (!test || !test.sections) { renderLoader('That file is not a valid test package.'); return; }
    state.test = test;
    var pref = test.settings || {};
    state.allowToggle = pref.allowPinyinToggle !== false;
    var scopes = pref.pinyinScopes || {};
    // A scope's pinyin is rendered into the DOM only if allowed to ever be seen.
    ['passages', 'questions', 'sentences', 'options'].forEach(function (sc) {
      state.include[sc] = !!scopes[sc] && (!!pref.pinyinDefaultOn || state.allowToggle);
    });
    state.pinyinOn = !!pref.pinyinDefaultOn;
    renderStart();
  }

  /* ---------------- loader (manual file) ---------------- */
  function renderLoader(msg) {
    app.innerHTML =
      '<div class="wrap-narrow">' +
      '<div class="hero"><div class="cn-badge">中</div><h1>Open a test</h1></div>' +
      (msg ? '<div class="notice notice-bad">' + msg + '</div>' : '') +
      '<div class="card"><p class="hint">Your teacher gave you a test file (<code>.json</code>). Choose it or drag it here. ' +
      'If you were given a single <code>.html</code> file, just open that file directly instead.</p>' +
      '<div class="dropzone" id="dz" style="border:2px dashed var(--line-strong);border-radius:12px;padding:26px;text-align:center;cursor:pointer">' +
      '<div style="font-size:30px">📄</div><p><strong>Click to choose</strong> or drag your .json test here</p>' +
      '<input type="file" id="fi" accept=".json,application/json" class="hidden"></div></div></div>';
    var dz = document.getElementById('dz'), fi = document.getElementById('fi');
    dz.onclick = function () { fi.click(); };
    fi.onchange = function (e) { if (e.target.files[0]) readFile(e.target.files[0]); };
    ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.style.borderColor = 'var(--red)'; }); });
    dz.addEventListener('drop', function (e) { e.preventDefault(); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); });
  }
  function readFile(f) {
    var r = new FileReader();
    r.onload = function (e) { try { loadTest(JSON.parse(e.target.result)); } catch (err) { renderLoader('That file could not be read as a test.'); } };
    r.readAsText(f);
  }

  /* ---------------- start screen ---------------- */
  function renderStart() {
    var t = state.test;
    var secLines = t.sections.map(function (s) {
      return '<li>' + esc(s.label) + ' — ' + s.items.length + (s.type === TYPE.READING ? ' passage(s)' : s.type === TYPE.MATCH ? ' set(s)' : ' question(s)') + '</li>';
    }).join('');
    var needName = !state.ctx.studentName;
    app.innerHTML =
      '<div class="wrap-narrow">' +
      (window.__PREVIEW__ ? '<div class="notice notice-info" style="margin-top:14px">Teacher preview — you can take the test to check it; results are not sent anywhere.</div>' : '') +
      '<div class="hero"><div class="cn-badge">中</div><h1>' + esc(t.title) + '</h1>' +
      '<p class="score-sub">' + t.sections.length + ' sections · ' + t.maxPoints + ' points</p></div>' +
      '<div class="card">' +
      (state.ctx.studentName ? '<p>Good luck, <strong>' + esc(state.ctx.studentName) + '</strong>!</p>' : '') +
      (needName ? '<div class="field"><label for="nm">Your name (optional)</label><input type="text" id="nm" placeholder="Enter your name"></div>' : '') +
      '<p><strong>This test contains:</strong></p><ul>' + secLines + '</ul>' +
      '<p class="hint">' + (state.allowToggle ? 'You can show or hide Pinyin during the test.' : (state.pinyinOn ? 'Pinyin is shown throughout.' : 'Pinyin is hidden for this test.')) + '</p>' +
      '<button class="btn btn-primary" id="startBtn">Start test →</button></div></div>';
    document.getElementById('startBtn').onclick = function () {
      var nm = document.getElementById('nm');
      if (nm && nm.value.trim()) state.ctx.studentName = nm.value.trim();
      startTest();
    };
  }

  /* ---------------- build & run ---------------- */
  function startTest() {
    state.screens = [];
    state.test.sections.forEach(function (sec) {
      sec.items.forEach(function (item) {
        state.screens.push({ sectionLabel: sec.label, type: sec.type, item: item });
      });
    });
    state.idx = 0; state.answers = {}; state.startedAt = new Date().toISOString();
    renderShell();
    renderScreen();
  }

  function renderShell() {
    app.innerHTML =
      '<header class="player-hd"><div class="wrap-narrow">' +
      '<span class="title" id="hdTitle">' + esc(state.test.title) + '</span>' +
      (state.allowToggle ? '<button class="btn btn-sm btn-ghost" id="pyToggle"></button>' : '') +
      '</div><div class="wrap-narrow" style="padding-bottom:8px"><div class="progress"><i id="prog"></i></div></div></header>' +
      '<main class="wrap-narrow"><div id="screen" class="screen"></div>' +
      '<div class="dots" id="dots"></div>' +
      '<div class="nav-row">' +
      '<button class="btn" id="prevBtn">← Prev</button>' +
      '<span class="spacer qcounter" id="counter"></span>' +
      '<button class="btn btn-primary" id="nextBtn">Next →</button>' +
      '</div></main>';
    setPinyinClass();
    var tog = document.getElementById('pyToggle');
    if (tog) { updateToggleLabel(); tog.onclick = function () { state.pinyinOn = !state.pinyinOn; setPinyinClass(); updateToggleLabel(); }; }
    document.getElementById('prevBtn').onclick = function () { go(-1); };
    document.getElementById('nextBtn').onclick = function () { go(1); };
  }
  function setPinyinClass() {
    document.body.classList.toggle('pinyin-on', state.pinyinOn);
    document.body.classList.toggle('pinyin-off', !state.pinyinOn);
  }
  function updateToggleLabel() {
    var tog = document.getElementById('pyToggle');
    if (tog) tog.textContent = state.pinyinOn ? '拼 Hide Pinyin' : '拼 Show Pinyin';
  }

  function go(delta) {
    var n = state.idx + delta;
    if (n < 0) return;
    if (n >= state.screens.length) { confirmSubmit(); return; }
    state.idx = n; renderScreen();
  }

  function renderScreen() {
    var sc = state.screens[state.idx];
    var mount = document.getElementById('screen');
    var h = '<div class="section-tag">' + esc(sc.sectionLabel) + '</div>';
    mount.innerHTML = h + '<div id="body"></div>';
    var body = document.getElementById('body');
    switch (sc.type) {
      case TYPE.PINYIN:  renderPinyin(sc.item, body); break;
      case TYPE.MCQ:     renderMcq(sc.item, body); break;
      case TYPE.MATCH:   renderMatch(sc.item, body); break;
      case TYPE.ARRANGE: renderArrange(sc.item, body); break;
      case TYPE.READING: renderReading(sc.item, body); break;
    }
    // nav labels
    document.getElementById('counter').textContent = 'Question ' + (state.idx + 1) + ' of ' + state.screens.length;
    document.getElementById('prevBtn').disabled = state.idx === 0;
    document.getElementById('nextBtn').textContent = (state.idx === state.screens.length - 1) ? 'Finish →' : 'Next →';
    renderDots();
    updateProgress();
  }

  /* ---------------- per-type renderers ---------------- */
  function optionButtons(item, mount, subId) {
    var key = subId || item.id;
    var opts = item.options;
    var wrap = document.createElement('div'); wrap.className = 'options';
    opts.forEach(function (o, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'opt-btn';
      if (state.answers[key] === o.id) b.classList.add('sel');
      var isPinyinChoice = (item.type === TYPE.PINYIN);
      var label = isPinyinChoice
        ? '<span class="cn cn-nopy"><span class="cn-hz">' + esc(o.text) + '</span></span>'
        : P.annotate(o.text, o.pinyin, state.include.options);
      b.innerHTML = '<span class="key">' + String.fromCharCode(65 + i) + '</span>' + label;
      b.onclick = function () {
        state.answers[key] = o.id;
        [].forEach.call(wrap.children, function (c) { c.classList.remove('sel'); });
        b.classList.add('sel');
        renderDots(); updateProgress();
      };
      wrap.appendChild(b);
    });
    mount.appendChild(wrap);
  }

  function renderPinyin(item, mount) {
    mount.innerHTML = '<div class="big-hanzi center"><span class="cn cn-nopy"><span class="cn-hz">' + esc(item.hanzi) + '</span></span></div>' +
      '<p class="hint center">Choose the correct Pinyin.</p>';
    optionButtons(item, mount);
  }

  function renderMcq(item, mount) {
    mount.innerHTML = '<div class="stem">' + P.annotateBlock(item.prompt, item.promptPinyin, state.include.questions) + '</div>';
    optionButtons(item, mount);
  }

  function renderMatch(item, mount) {
    state.answers[item.id] = state.answers[item.id] || {};
    var ans = state.answers[item.id];
    var optionsHtml = '<option value="">— choose —</option>' + item.right.map(function (r) {
      return '<option value="' + esc(r.id) + '">' + esc(r.meaning) + '</option>';
    }).join('');
    var h = '<p class="hint">Match each Chinese word to its meaning.</p><div class="match-grid">';
    item.left.forEach(function (l) {
      h += '<div class="match-row"><span class="term">' + P.annotate(l.chinese, l.pinyin, state.include.sentences) +
        '</span><select data-pair="' + esc(l.pairId) + '">' + optionsHtml + '</select></div>';
    });
    mount.innerHTML = h + '</div>';
    [].forEach.call(mount.querySelectorAll('select'), function (sel) {
      var pid = sel.getAttribute('data-pair');
      if (ans[pid]) sel.value = ans[pid];
      sel.onchange = function () {
        if (sel.value) ans[pid] = sel.value; else delete ans[pid];
        renderDots(); updateProgress();
      };
    });
  }

  function renderArrange(item, mount) {
    mount.innerHTML = '<p class="hint">Put the chunks in the correct order.</p>' +
      (item.meaning ? '<p class="muted">Meaning: ' + esc(item.meaning) + '</p>' : '') +
      '<div class="arrange-answer" id="ansArea"></div>' +
      '<div class="arrange-bank" id="bankArea"></div>' +
      '<div style="margin-top:10px"><button class="btn btn-sm btn-ghost" id="clearArr">Clear</button></div>';
    var ansArea = document.getElementById('ansArea');
    var bankArea = document.getElementById('bankArea');
    var byId = {}; item.chunks.forEach(function (c) { byId[c.id] = c; });

    function chunkEl(c, inAnswer) {
      var el = document.createElement('div');
      el.className = 'chunk' + (inAnswer ? ' in-answer' : '');
      el.innerHTML = (c.pinyin && state.include.sentences ? '<span class="py">' + esc(c.pinyin) + '</span>' : '') +
        '<span class="hz">' + esc(c.text) + '</span>';
      el.dataset.id = c.id;
      if (inAnswer) {
        el.setAttribute('draggable', 'true');
        el.onclick = function () { removeChunk(c.id); };
        el.addEventListener('dragstart', function (e) { el.classList.add('dragging'); e.dataTransfer.setData('text/plain', c.id); });
        el.addEventListener('dragend', function () { el.classList.remove('dragging'); });
      } else {
        el.onclick = function () { addChunk(c.id); };
      }
      return el;
    }
    function draw() {
      var ans = state.answers[item.id] || [];
      ansArea.innerHTML = ''; bankArea.innerHTML = '';
      ansArea.classList.toggle('empty', ans.length === 0);
      ans.forEach(function (id) { ansArea.appendChild(chunkEl(byId[id], true)); });
      item.chunks.forEach(function (c) { if (ans.indexOf(c.id) < 0) bankArea.appendChild(chunkEl(c, false)); });
    }
    function addChunk(id) { var a = state.answers[item.id] = (state.answers[item.id] || []).slice(); a.push(id); draw(); renderDots(); updateProgress(); }
    function removeChunk(id) { state.answers[item.id] = (state.answers[item.id] || []).filter(function (x) { return x !== id; }); draw(); renderDots(); updateProgress(); }
    // drag reorder within the answer area
    ansArea.addEventListener('dragover', function (e) {
      e.preventDefault();
      var after = dragAfter(ansArea, e.clientX, e.clientY);
      var dragging = ansArea.querySelector('.dragging');
      if (!dragging) return;
      if (after == null) ansArea.appendChild(dragging); else ansArea.insertBefore(dragging, after);
    });
    ansArea.addEventListener('drop', function (e) {
      e.preventDefault();
      var order = [].map.call(ansArea.querySelectorAll('.chunk'), function (c) { return c.dataset.id; });
      state.answers[item.id] = order; renderDots(); updateProgress();
    });
    document.getElementById('clearArr').onclick = function () { state.answers[item.id] = []; draw(); renderDots(); updateProgress(); };
    draw();
  }
  function dragAfter(container, x, y) {
    var els = [].slice.call(container.querySelectorAll('.chunk:not(.dragging)'));
    var closest = null, closestDist = -Infinity;
    els.forEach(function (el) {
      var box = el.getBoundingClientRect();
      var offset = x - box.left - box.width / 2;
      if (offset < 0 && offset > closestDist) { closestDist = offset; closest = el; }
    });
    return closest;
  }

  function renderReading(item, mount) {
    var h = '<div class="passage">';
    if (item.title) h += '<h3>' + P.annotate(item.title, '', false) + '</h3>';
    h += P.annotateBlock(item.passage, item.passagePinyin, state.include.passages) + '</div>';
    item.questions.forEach(function (sq, i) {
      h += '<div class="sub-q"><div class="sub-stem">' + (i + 1) + '. ' +
        P.annotate(sq.prompt, sq.promptPinyin, state.include.questions) + '</div><div class="sub-opts" data-sub="' + esc(sq.id) + '"></div></div>';
    });
    mount.innerHTML = h;
    item.questions.forEach(function (sq) {
      var holder = mount.querySelector('.sub-opts[data-sub="' + cssEscape(sq.id) + '"]');
      optionButtons(sq, holder, sq.id);
    });
  }
  function cssEscape(s) { return String(s).replace(/["\\]/g, '\\$&'); }

  /* ---------------- progress / dots ---------------- */
  function isComplete(sc) {
    var it = sc.item, a = state.answers;
    switch (sc.type) {
      case TYPE.PINYIN: case TYPE.MCQ: return !!a[it.id];
      case TYPE.MATCH: return it.left.every(function (l) { return a[it.id] && a[it.id][l.pairId]; });
      case TYPE.ARRANGE: return (a[it.id] || []).length === it.chunks.length;
      case TYPE.READING: return it.questions.every(function (q) { return !!a[q.id]; });
    }
    return false;
  }
  function completedCount() {
    return state.screens.reduce(function (n, sc) { return n + (isComplete(sc) ? 1 : 0); }, 0);
  }
  function updateProgress() {
    var pct = Math.round((completedCount() / state.screens.length) * 100);
    var bar = document.getElementById('prog'); if (bar) bar.style.width = pct + '%';
  }
  function renderDots() {
    var wrap = document.getElementById('dots'); if (!wrap) return;
    wrap.innerHTML = '';
    state.screens.forEach(function (sc, i) {
      var d = document.createElement('button');
      d.className = 'dot' + (i === state.idx ? ' current' : '') + (isComplete(sc) ? ' answered' : '');
      d.textContent = i + 1;
      d.onclick = function () { state.idx = i; renderScreen(); };
      wrap.appendChild(d);
    });
  }

  /* ---------------- submit ---------------- */
  function confirmSubmit() {
    var done = completedCount(), total = state.screens.length;
    var back = document.createElement('div'); back.className = 'modal-back';
    back.innerHTML = '<div class="modal"><h2>Submit your test?</h2>' +
      '<p>You have completed <strong>' + done + ' of ' + total + '</strong> questions.' +
      (done < total ? ' Unanswered questions will be marked as incorrect.' : '') + '</p>' +
      '<p class="hint">You can’t change your answers after submitting.</p>' +
      '<div class="btn-row" style="margin-top:8px"><button class="btn btn-primary" id="mConfirm">Submit</button>' +
      '<button class="btn btn-ghost" id="mCancel">Keep working</button></div></div>';
    document.body.appendChild(back);
    document.getElementById('mCancel').onclick = function () { back.remove(); };
    document.getElementById('mConfirm').onclick = function () { back.remove(); submit(); };
  }

  function submit() {
    var result = CTG.scoring.score(state.test, state.answers);
    var ctx = CTG.lms.readContext();
    if (state.ctx.studentName && !ctx.studentName) ctx.studentName = state.ctx.studentName;
    ctx.attemptId = state.ctx.attemptId; // keep the id used on the start screen
    var attempt = CTG.lms.buildAttempt(state.test, state.answers, result, ctx, { startedAt: state.startedAt });
    if (!window.__PREVIEW__) CTG.lms.emitResult(attempt);
    state.lastAttempt = attempt;
    renderResults(result, attempt);
  }

  /* ---------------- results ---------------- */
  function renderResults(result, attempt) {
    document.body.classList.add('pinyin-on'); // reveal everything in review
    document.body.classList.remove('pinyin-off');
    var correctItems = 0, totalItems = 0;
    result.sections.forEach(function (s) { s.items.forEach(function (it) { totalItems++; if (it.correct) correctItems++; }); });

    var h = '<div class="wrap-narrow"><div class="hero"><h1>Results</h1><p class="score-sub">' + esc(result.title) + '</p></div>' +
      '<div class="card"><div class="score-ring"><div class="score-big">' + result.percent + '%</div>' +
      '<div class="score-sub">' + result.earnedPoints + ' / ' + result.maxPoints + ' points · ' +
      correctItems + ' / ' + totalItems + ' questions fully correct</div></div>' +
      '<div class="btn-row center" style="justify-content:center">' +
      '<button class="btn" id="dlRes">⬇ Download my results (.json)</button>' +
      (window.__PREVIEW__ ? '<button class="btn btn-ghost" id="retake">↻ Retake</button>' : '') +
      '</div></div>';

    result.sections.forEach(function (sec) {
      h += '<h2 style="margin-top:22px">' + esc(sec.label) + ' <span class="muted" style="font-size:15px">' + sec.earnedPoints + '/' + sec.maxPoints + '</span></h2>';
      sec.items.forEach(function (it) { h += resultItem(it); });
    });
    h += '</div>';
    app.innerHTML = h;

    document.getElementById('dlRes').onclick = function () {
      var blob = new Blob([JSON.stringify(attempt, null, 2)], { type: 'application/json;charset=utf-8' });
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = 'result_' + (attempt.studentName || 'student').replace(/\s+/g, '_') + '.json';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
    };
    var rt = document.getElementById('retake'); if (rt) rt.onclick = function () { renderStart(); };
    window.scrollTo(0, 0);
  }

  function tag(ok) { return '<span class="tag">' + (ok ? '✓ Correct' : '✗ Incorrect') + '</span>'; }
  function cls(ok) { return 'res-item ' + (ok ? 'correct' : 'incorrect'); }
  function expl(e) { return e ? '<div class="res-expl">💡 ' + esc(e) + '</div>' : ''; }

  function resultItem(it) {
    if (it.type === TYPE.PINYIN || it.type === TYPE.MCQ) return choiceResult(it);
    if (it.type === TYPE.MATCH) return matchResult(it);
    if (it.type === TYPE.ARRANGE) return arrangeResult(it);
    if (it.type === TYPE.READING) return readingResult(it);
    return '';
  }
  function textOf(item, optId, list) { var o = (list || []).filter(function (x) { return x.id === optId; })[0]; return o ? o.text : '—'; }

  function choiceResult(it, subStem) {
    // it.selectedId / it.correctId are option ids; we need the label text — but
    // the scoring result doesn't carry option text, so store maps on the test.
    var yourTxt = optText(it.selectedId), corrTxt = optText(it.correctId);
    var stem = subStem || stemFor(it.id);
    var h = '<div class="' + cls(it.correct) + '">' + tag(it.correct) +
      (stem ? '<div class="res-line" style="margin-top:4px">' + stem + '</div>' : '') +
      '<div class="res-line"><b>Your answer:</b> ' + (it.selectedId ? '<span class="' + (it.correct ? 'ans-good' : 'ans-bad') + '">' + esc(yourTxt) + '</span>' : '<span class="muted">— not answered —</span>') + '</div>';
    if (!it.correct) h += '<div class="res-line"><b>Correct:</b> <span class="ans-good">' + esc(corrTxt) + '</span></div>';
    h += expl(it.explanation) + '</div>';
    return h;
  }
  function matchResult(it) {
    var h = '<div class="' + cls(it.correct) + '">' + tag(it.correct) +
      '<div class="res-line" style="margin-top:4px"><b>Matching (' + it.earnedPoints + '/' + it.maxPoints + ')</b></div>';
    it.pairResults.forEach(function (p) {
      h += '<div class="res-line">' + esc(p.chinese) + ' → ' +
        (p.correct ? '<span class="ans-good">' + esc(p.correctMeaning) + '</span>'
          : '<span class="ans-bad">' + esc(p.selectedMeaning || '—') + '</span> <span class="ans-good">' + esc(p.correctMeaning) + '</span>') + '</div>';
    });
    return h + expl(it.explanation) + '</div>';
  }
  function arrangeResult(it) {
    var byId = {}; (it.chunks || []).forEach(function (c) { byId[c.id] = c.text; });
    var yours = (it.studentOrder || []).map(function (id) { return byId[id] || '?'; }).join(' ');
    var corr = (it.correctOrder || []).map(function (id) { return byId[id] || '?'; }).join(' ');
    var h = '<div class="' + cls(it.correct) + '">' + tag(it.correct) +
      '<div class="res-line" style="margin-top:4px"><b>Your sentence:</b> ' +
      (yours ? '<span class="cn-hz ' + (it.correct ? 'ans-good' : 'ans-bad') + '">' + esc(yours) + '</span>' : '<span class="muted">— not answered —</span>') + '</div>';
    if (!it.correct) h += '<div class="res-line"><b>Correct:</b> <span class="cn-hz ans-good">' + esc(corr) + '</span></div>';
    if (it.meaning) h += '<div class="res-line muted">' + esc(it.meaning) + '</div>';
    return h + expl(it.explanation) + '</div>';
  }
  function readingResult(it) {
    var h = '<div class="res-item ' + (it.correct ? 'correct' : 'incorrect') + '">' + tag(it.correct) +
      (it.title ? '<div class="res-line" style="margin-top:4px"><b>' + esc(it.title) + '</b></div>' : '') +
      '<div class="res-line"><b>' + it.earnedPoints + '/' + it.maxPoints + ' correct</b></div>';
    it.questions.forEach(function (q) {
      var yourTxt = optText(q.selectedId), corrTxt = optText(q.correctId);
      h += '<div class="res-line" style="border-top:1px dashed var(--line);padding-top:6px;margin-top:6px">' +
        (q.correct ? '✓ ' : '✗ ') + esc(q.prompt) + '<br>' +
        '<b>You:</b> ' + (q.selectedId ? '<span class="' + (q.correct ? 'ans-good' : 'ans-bad') + '">' + esc(yourTxt) + '</span>' : '<span class="muted">—</span>');
      if (!q.correct) h += ' &nbsp; <b>Correct:</b> <span class="ans-good">' + esc(corrTxt) + '</span>';
      if (q.explanation) h += '<div class="res-expl">💡 ' + esc(q.explanation) + '</div>';
      h += '</div>';
    });
    return h + '</div>';
  }

  /* Lookups back into the test so results can show option TEXT (scoring keeps
   * ids only, on purpose). Built once per test. */
  var _optText = null, _stem = null;
  function buildLookups() {
    _optText = {}; _stem = {};
    state.test.sections.forEach(function (sec) {
      sec.items.forEach(function (it) {
        if (it.options) { it.options.forEach(function (o) { _optText[o.id] = o.text; }); }
        if (it.type === TYPE.PINYIN) _stem[it.id] = '<span class="cn-hz">' + esc(it.hanzi) + '</span>';
        if (it.type === TYPE.MCQ) _stem[it.id] = P.withBreaks(it.prompt);
        if (it.type === TYPE.READING) it.questions.forEach(function (q) {
          q.options.forEach(function (o) { _optText[o.id] = o.text; });
        });
      });
    });
  }
  function optText(id) { if (!_optText) buildLookups(); return id && _optText[id] != null ? _optText[id] : '—'; }
  function stemFor(id) { if (!_stem) buildLookups(); return _stem[id] || ''; }
})();
