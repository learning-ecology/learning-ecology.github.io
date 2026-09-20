/* ============================================================================
 * excel-import.js  —  Chinese Test Generator
 * ----------------------------------------------------------------------------
 * Parses an .xlsx question-bank workbook (via SheetJS / global XLSX) into the
 * canonical bank model defined in schema.js, and produces a validation report.
 *
 * Public API (window.CTG.excel):
 *   parseWorkbook(arrayBuffer) -> { bank, report }
 *   REQUIRED_SHEETS            -> [names]
 *
 * The bank shape:
 *   {
 *     schemaVersion, meta:{importedAt},
 *     lessons:  [ {id, name, order} ],
 *     questions:[ Question ],           // all types, flattened
 *   }
 *
 * report:
 *   { ok, errors:[Issue], warnings:[Issue], stats:{byType, byLesson, lessons} }
 *   Issue = { sheet, row, id, message }
 * ==========================================================================*/
(function (global) {
  'use strict';

  var CTG = global.CTG = global.CTG || {};
  var S = CTG.schema;
  var TYPE = S.TYPE;

  var REQUIRED_SHEETS = ['Lessons', 'Pinyin', 'Matching', 'MultipleChoice',
    'SentenceArrange', 'ReadingPassages', 'ReadingQuestions'];

  var OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

  /* -- low level: read a sheet into row objects keyed by header ------------ */
  function readSheet(wb, name) {
    var ws = wb.Sheets[name];
    if (!ws) return null;
    // header:1 -> array of arrays, so we control header mapping and keep the
    // true Excel row number for error messages.
    var aoa = global.XLSX.utils.sheet_to_json(ws, {
      header: 1, raw: false, defval: '', blankrows: false
    });
    if (!aoa.length) return { headers: [], rows: [] };
    var headers = aoa[0].map(function (h) { return S.str(h); });
    var rows = [];
    for (var i = 1; i < aoa.length; i++) {
      var arr = aoa[i];
      // skip fully empty rows
      var allBlank = arr.every(function (v) { return S.isBlank(v); });
      if (allBlank) continue;
      var obj = { __row: i + 1 }; // 1-based Excel row (header is row 1)
      for (var c = 0; c < headers.length; c++) {
        obj[headers[c]] = arr[c] !== undefined ? arr[c] : '';
      }
      rows.push(obj);
    }
    return { headers: headers, rows: rows };
  }

  /* -- main ---------------------------------------------------------------- */
  function parseWorkbook(arrayBuffer) {
    if (!global.XLSX) throw new Error('SheetJS (XLSX) is not loaded.');
    var wb = global.XLSX.read(arrayBuffer, { type: 'array' });

    var errors = [];
    var warnings = [];
    function err(sheet, row, id, message) { errors.push({ sheet: sheet, row: row, id: id, message: message }); }
    function warn(sheet, row, id, message) { warnings.push({ sheet: sheet, row: row, id: id, message: message }); }

    // sheet presence
    REQUIRED_SHEETS.forEach(function (name) {
      if (!wb.Sheets[name]) err(name, null, null, 'Missing sheet "' + name + '". Use the provided template.');
    });

    var bank = {
      schemaVersion: S.SCHEMA_VERSION,
      meta: { importedAt: new Date().toISOString() },
      lessons: [],
      questions: []
    };

    var seenQid = {};      // question ids across all question sheets
    var lessonById = {};

    function requireLesson(sheet, row, id, lessonId) {
      lessonId = S.str(lessonId);
      if (!lessonId) { err(sheet, row, id, 'LessonID is required.'); return null; }
      if (!lessonById[lessonId]) { err(sheet, row, id, 'LessonID "' + lessonId + '" is not defined on the Lessons sheet.'); return null; }
      return lessonId;
    }
    function claimQid(sheet, row, id) {
      if (!id) { err(sheet, row, id, 'QuestionID is required.'); return false; }
      if (seenQid[id]) { err(sheet, row, id, 'Duplicate QuestionID "' + id + '" (already used on ' + seenQid[id] + ').'); return false; }
      seenQid[id] = sheet + ' row ' + row;
      return true;
    }

    /* ---- Lessons ---- */
    var lessonsSheet = readSheet(wb, 'Lessons');
    if (lessonsSheet) {
      lessonsSheet.rows.forEach(function (r) {
        var id = S.str(r.LessonID);
        var name = S.str(r.LessonName);
        if (!id) { err('Lessons', r.__row, null, 'LessonID is required.'); return; }
        if (lessonById[id]) { err('Lessons', r.__row, id, 'Duplicate LessonID "' + id + '".'); return; }
        if (!name) warn('Lessons', r.__row, id, 'Lesson "' + id + '" has no name.');
        var lesson = { id: id, name: name || id, order: Number(r.Order) || (bank.lessons.length + 1) };
        lessonById[id] = lesson;
        bank.lessons.push(lesson);
      });
    }
    bank.lessons.sort(function (a, b) { return a.order - b.order; });

    /* ---- Section A: Pinyin ---- */
    var py = readSheet(wb, 'Pinyin');
    if (py) py.rows.forEach(function (r) {
      var id = S.str(r.QuestionID);
      if (!claimQid('Pinyin', r.__row, id)) return;
      var lessonId = requireLesson('Pinyin', r.__row, id, r.LessonID);
      var hanzi = S.str(r.Hanzi);
      var correct = S.str(r.CorrectPinyin);
      if (!hanzi) err('Pinyin', r.__row, id, 'Hanzi is required.');
      if (!correct) err('Pinyin', r.__row, id, 'CorrectPinyin is required.');
      var distractors = [r.Distractor1, r.Distractor2, r.Distractor3]
        .map(S.str).filter(function (d) { return d; });
      if (distractors.length === 0) { err('Pinyin', r.__row, id, 'At least one distractor is required.'); }
      else if (distractors.length < 3) { warn('Pinyin', r.__row, id, 'Only ' + distractors.length + ' distractor(s); 3 is recommended.'); }
      if (!hanzi || !correct || distractors.length === 0 || !lessonId) return;

      var opts = [{ id: S.childId(id, 'o', 0), text: correct }];
      distractors.forEach(function (d, i) { opts.push({ id: S.childId(id, 'o', i + 1), text: d }); });
      bank.questions.push({
        id: id, type: TYPE.PINYIN, lessonId: lessonId,
        hanzi: hanzi, options: opts, answerId: opts[0].id,
        explanation: S.str(r.Explanation)
      });
    });

    /* ---- Section B: Matching (grouped by SetID) ---- */
    var mt = readSheet(wb, 'Matching');
    if (mt) {
      var sets = {}; var setOrder = [];
      mt.rows.forEach(function (r) {
        var setId = S.str(r.SetID);
        if (!setId) { err('Matching', r.__row, null, 'SetID is required.'); return; }
        var chinese = S.str(r.Chinese);
        var meaning = S.str(r.MeaningVI);
        if (!chinese) { err('Matching', r.__row, setId, 'Chinese is required.'); return; }
        if (!meaning) { err('Matching', r.__row, setId, 'MeaningVI (Vietnamese meaning) is required.'); return; }
        if (!sets[setId]) {
          if (seenQid[setId]) { err('Matching', r.__row, setId, 'SetID "' + setId + '" collides with an existing QuestionID.'); return; }
          sets[setId] = { id: setId, lessonId: null, row: r.__row, pairs: [] };
          setOrder.push(setId);
        }
        var lessonId = requireLesson('Matching', r.__row, setId, r.LessonID);
        if (lessonId && !sets[setId].lessonId) sets[setId].lessonId = lessonId;
        var pairIndex = sets[setId].pairs.length;
        sets[setId].pairs.push({
          id: S.childId(setId, 'p', pairIndex),
          chinese: chinese,
          pinyin: S.str(r.Pinyin),
          meaning: meaning
        });
      });
      setOrder.forEach(function (setId) {
        var set = sets[setId];
        if (set.pairs.length < 2) { err('Matching', set.row, setId, 'Matching set "' + setId + '" needs at least 2 pairs (has ' + set.pairs.length + ').'); return; }
        if (!set.lessonId) return; // lesson error already reported
        seenQid[setId] = 'Matching set';
        bank.questions.push({
          id: setId, type: TYPE.MATCH, lessonId: set.lessonId,
          pairs: set.pairs, explanation: ''
        });
      });
    }

    /* ---- Section C: MultipleChoice ---- */
    var mc = readSheet(wb, 'MultipleChoice');
    if (mc) mc.rows.forEach(function (r) {
      var id = S.str(r.QuestionID);
      if (!claimQid('MultipleChoice', r.__row, id)) return;
      var lessonId = requireLesson('MultipleChoice', r.__row, id, r.LessonID);
      var prompt = S.str(r.Prompt);
      if (!prompt) err('MultipleChoice', r.__row, id, 'Prompt is required.');
      var parsed = parseOptions(r, id);
      if (parsed.options.length < 2) err('MultipleChoice', r.__row, id, 'At least 2 options (OptionA, OptionB) are required.');
      var answerId = resolveCorrect(r.Correct, parsed.options, 'MultipleChoice', r.__row, id, err);
      if (!prompt || parsed.options.length < 2 || !answerId || !lessonId) return;
      bank.questions.push({
        id: id, type: TYPE.MCQ, lessonId: lessonId,
        prompt: prompt, promptPinyin: S.str(r.PromptPinyin),
        options: parsed.options, answerId: answerId,
        explanation: S.str(r.Explanation)
      });
    });

    /* ---- Section D: SentenceArrange ---- */
    var sa = readSheet(wb, 'SentenceArrange');
    if (sa) sa.rows.forEach(function (r) {
      var id = S.str(r.QuestionID);
      if (!claimQid('SentenceArrange', r.__row, id)) return;
      var lessonId = requireLesson('SentenceArrange', r.__row, id, r.LessonID);
      var chunkTexts = S.splitChunks(r.Chunks);
      if (chunkTexts.length < 2) { err('SentenceArrange', r.__row, id, 'Chunks must contain at least 2 chunks separated by "/".'); }
      var chunkPys = S.splitChunks(r.ChunkPinyin);
      if (chunkPys.length && chunkPys.length !== chunkTexts.length) {
        warn('SentenceArrange', r.__row, id, 'ChunkPinyin has ' + chunkPys.length + ' chunks but Chunks has ' + chunkTexts.length + '; pinyin will be ignored where it does not line up.');
      }
      if (chunkTexts.length < 2 || !lessonId) return;
      var chunks = chunkTexts.map(function (t, i) {
        return { id: S.childId(id, 'c', i), text: t, pinyin: chunkPys[i] || '' };
      });
      bank.questions.push({
        id: id, type: TYPE.ARRANGE, lessonId: lessonId,
        chunks: chunks,
        correctOrder: chunks.map(function (c) { return c.id; }),
        meaning: S.str(r.Meaning),
        explanation: S.str(r.Explanation)
      });
    });

    /* ---- Section E: Reading (passages + questions) ---- */
    var passages = {};
    var rp = readSheet(wb, 'ReadingPassages');
    if (rp) rp.rows.forEach(function (r) {
      var pid = S.str(r.PassageID);
      if (!pid) { err('ReadingPassages', r.__row, null, 'PassageID is required.'); return; }
      if (passages[pid]) { err('ReadingPassages', r.__row, pid, 'Duplicate PassageID "' + pid + '".'); return; }
      var lessonId = requireLesson('ReadingPassages', r.__row, pid, r.LessonID);
      var text = S.str(r.Passage);
      if (!text) err('ReadingPassages', r.__row, pid, 'Passage text is required.');
      passages[pid] = {
        id: pid, lessonId: lessonId, title: S.str(r.Title),
        passage: text, passagePinyin: S.str(r.PassagePinyin),
        questions: [], row: r.__row, valid: !!(text && lessonId)
      };
    });
    var rq = readSheet(wb, 'ReadingQuestions');
    if (rq) rq.rows.forEach(function (r) {
      var id = S.str(r.QuestionID);
      if (!claimQid('ReadingQuestions', r.__row, id)) return;
      var pid = S.str(r.PassageID);
      if (!pid) { err('ReadingQuestions', r.__row, id, 'PassageID is required.'); return; }
      if (!passages[pid]) { err('ReadingQuestions', r.__row, id, 'PassageID "' + pid + '" is not defined on ReadingPassages.'); return; }
      var prompt = S.str(r.Question);
      if (!prompt) err('ReadingQuestions', r.__row, id, 'Question is required.');
      var parsed = parseOptions(r, id);
      if (parsed.options.length < 2) err('ReadingQuestions', r.__row, id, 'At least 2 options are required.');
      var answerId = resolveCorrect(r.Correct, parsed.options, 'ReadingQuestions', r.__row, id, err);
      if (!prompt || parsed.options.length < 2 || !answerId) return;
      passages[pid].questions.push({
        id: id, prompt: prompt, promptPinyin: S.str(r.QuestionPinyin),
        options: parsed.options, answerId: answerId,
        explanation: S.str(r.Explanation)
      });
    });
    Object.keys(passages).forEach(function (pid) {
      var p = passages[pid];
      if (!p.valid) return;
      if (p.questions.length === 0) { warn('ReadingPassages', p.row, pid, 'Passage "' + pid + '" has no questions and will be skipped.'); return; }
      bank.questions.push({
        id: pid, type: TYPE.READING, lessonId: p.lessonId,
        title: p.title, passage: p.passage, passagePinyin: p.passagePinyin,
        questions: p.questions, explanation: ''
      });
    });

    /* ---- stats ---- */
    var stats = { lessons: bank.lessons.length, byType: {}, byLesson: {}, total: 0 };
    Object.keys(TYPE).forEach(function (k) { stats.byType[TYPE[k]] = 0; });
    bank.questions.forEach(function (q) {
      stats.byType[q.type] = (stats.byType[q.type] || 0) + 1;
      stats.byLesson[q.lessonId] = (stats.byLesson[q.lessonId] || 0) + 1;
      // count reading sub-questions toward a meaningful total
      stats.total += (q.type === TYPE.READING) ? q.questions.length : 1;
    });

    if (bank.questions.length === 0 && errors.length === 0) {
      err(null, null, null, 'No questions were found in the workbook.');
    }

    return {
      bank: bank,
      report: { ok: errors.length === 0, errors: errors, warnings: warnings, stats: stats }
    };
  }

  /* -- helpers shared by MCQ & Reading ------------------------------------ */
  function parseOptions(r, qid) {
    var options = [];
    for (var i = 0; i < OPTION_LETTERS.length; i++) {
      var L = OPTION_LETTERS[i];
      var text = S.str(r['Option' + L]);
      if (!text) continue;
      options.push({
        id: S.childId(qid, 'o', options.length),
        letter: L,
        text: text,
        pinyin: S.str(r['Option' + L + 'Pinyin'])
      });
    }
    return { options: options };
  }

  function resolveCorrect(rawCorrect, options, sheet, row, id, err) {
    var val = S.str(rawCorrect);
    if (!val) { err(sheet, row, id, 'Correct answer is required.'); return null; }
    // 1) single letter A-F
    var up = val.toUpperCase();
    if (up.length === 1 && OPTION_LETTERS.indexOf(up) >= 0) {
      var byLetter = options.filter(function (o) { return o.letter === up; })[0];
      if (byLetter) return byLetter.id;
      err(sheet, row, id, 'Correct = "' + val + '" but there is no Option' + up + '.');
      return null;
    }
    // 2) exact option text
    var byText = options.filter(function (o) { return o.text === val; })[0];
    if (byText) return byText.id;
    err(sheet, row, id, 'Correct = "' + val + '" does not match any option letter or text.');
    return null;
  }

  CTG.excel = {
    parseWorkbook: parseWorkbook,
    REQUIRED_SHEETS: REQUIRED_SHEETS
  };
})(typeof window !== 'undefined' ? window : this);
