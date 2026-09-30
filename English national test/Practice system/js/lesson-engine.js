/* =============================================================================
 * lesson-engine.js — Lesson content parser / validator / model builder
 * -----------------------------------------------------------------------------
 * PURE LOGIC. No DOM. Global: `LessonEngine`.
 *
 * Turns a multi-sheet Excel workbook into a validated Lesson model:
 *
 *   Lesson_Info · Vocabulary · Collocations · Chunks · Grammar ·
 *   Grammar_Errors · Mini_Practice · Exam_Groups · Exam_Questions · Flashcards
 *
 * The EXAM section is delegated to the existing, validated TestEngine
 * (Exam_Groups -> "Groups", Exam_Questions -> "Questions", a synthesised Info),
 * so the national-exam paper behaves EXACTLY as it already does standalone.
 *
 * Depends on: global XLSX (SheetJS) inside parseWorkbook(); global TestEngine.
 * =========================================================================== */
(function (root) {
  "use strict";

  var MP_TYPES = ["mcq", "context", "gap_fill", "sentence_completion",
                  "transformation", "error_correction", "matching", "arrangement"];
  var LETTERS = ["A", "B", "C", "D"];

  /* ----------------------------- helpers -------------------------------- */
  function norm(v) { return v == null ? "" : String(v).replace(/\r\n/g, "\n").trim(); }
  function lc(v) { return norm(v).toLowerCase(); }
  function isBlank(v) { return norm(v) === ""; }
  function key(v) { return lc(v).replace(/\s+/g, "_"); }
  function toInt(v, d) { var n = parseInt(norm(v), 10); return isNaN(n) ? d : n; }
  function slug(s) {
    return norm(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "lesson";
  }
  // Split a multi-value cell on newlines or common bullet separators.
  function splitList(v) {
    return norm(v).split(/\n|·|•|\||;|•/).map(function (s) { return s.trim(); })
      .filter(function (s) { return s !== ""; });
  }
  // Accept multiple acceptable answers separated by | or /
  function splitAnswers(v) {
    return norm(v).split(/\||\/(?![^(]*\))/).map(function (s) { return s.trim(); })
      .filter(function (s) { return s !== ""; });
  }

  /* ---- rich-text-aware cell reading (mirrors TestEngine) --------------- */
  function hToMarkup(h) {
    var s = String(h);
    s = s.replace(/<br\s*\/?>/gi, "\n");
    s = s.replace(/<\s*strong\s*>/gi, "<b>").replace(/<\s*\/\s*strong\s*>/gi, "</b>");
    s = s.replace(/<\s*em\s*>/gi, "<i>").replace(/<\s*\/\s*em\s*>/gi, "</i>");
    s = s.replace(/<(?!\/?(?:b|i|u)\b)[^>]*>/gi, "");
    s = s.replace(/<(b|i|u)>\s*<\/\1>/gi, "");
    s = s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
         .replace(/&#0?39;/g, "'").replace(/&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
    return s;
  }
  function cellToMarkup(cell) {
    if (!cell) return "";
    var h = cell.h;
    if (h && /<(b|i|u|strong|em)\b/i.test(h)) return hToMarkup(h);
    if (cell.v === undefined || cell.v === null) return cell.w != null ? String(cell.w) : "";
    if (typeof cell.v === "string") return cell.v;
    return cell.w != null ? String(cell.w) : String(cell.v);
  }

  /* ---- header index + flexible column aliases -------------------------- */
  function headerIndex(rows) {
    var map = {};
    if (!rows || !rows.length) return map;
    rows[0].forEach(function (h, c) { var k = key(h); if (k) map[k] = c; });
    return map;
  }
  function col(hidx, aliases) {
    for (var i = 0; i < aliases.length; i++)
      if (hidx.hasOwnProperty(aliases[i])) return hidx[aliases[i]];
    return -1;
  }
  function cell(row, idx) { return idx === -1 || !row ? "" : norm(row[idx]); }

  /* =====================================================================
   * Build model from already-extracted sheets (rows[][] per sheet name).
   * `sheets` keys are canonical: Lesson_Info, Vocabulary, Collocations,
   * Chunks, Grammar, Grammar_Errors, Mini_Practice, Exam_Groups,
   * Exam_Questions, Flashcards. Any may be missing/empty.
   * ===================================================================== */
  function buildLesson(sheets) {
    var errors = [], warnings = [];
    function err(sheet, row, msg) { errors.push({ sheet: sheet, row: row, message: msg }); }
    function warn(sheet, row, msg) { warnings.push({ sheet: sheet, row: row, message: msg }); }

    /* -------------------- Lesson_Info (Key / Value) -------------------- */
    var info = {};
    var infoRows = sheets.Lesson_Info || [];
    var objectives = [];
    for (var i = 1; i < infoRows.length; i++) {
      var k = key(infoRows[i][0]);
      if (!k) continue;
      var val = norm(infoRows[i][1]);
      if (k === "objective" || k === "objectives") objectives.push(val);
      else info[k] = val;
    }
    if (info.objectives) objectives = objectives.concat(splitList(info.objectives));

    var courseId = info.course_id || "course";
    var lessonId = info.lesson_id || ("L" + (info.lesson_no || slug(info.title)));
    var lesson = {
      courseId: courseId,
      courseTitle: info.course_title || "English National Exam Course",
      id: lessonId,
      lessonNo: toInt(info.lesson_no, null),
      title: info.title || "Untitled Lesson",
      topic: info.topic || "",
      grammarTitle: info.grammar_title || "",
      level: info.level || "",
      duration: info.duration || "",
      objectives: objectives,
      // randomization switches
      randomize: ["no", "false", "0", "off"].indexOf(lc(info.randomize)) === -1,
      shuffleOptions: ["no", "false", "0", "off"].indexOf(lc(info.shuffle_options)) === -1,
      shuffleArrangement: ["no", "false", "0", "off"].indexOf(lc(info.shuffle_arrangement)) === -1,
      flashcardsFrom: (info.flashcards_from ? info.flashcards_from.split(/[,\n·|;]/) : ["vocabulary", "chunks"])
                        .map(function (s) { return lc(s); }).filter(function (s) { return s !== ""; }),
      // exam meta (fed to TestEngine)
      examMeta: {
        exam_code: info.exam_code || "",
        header_line1: info.header_line1 || "",
        header_line2: info.header_line2 || "",
        duration_minutes: info.exam_duration_minutes || info.duration_minutes || "50",
        default_mode: info.default_mode || "exam",
        allow_review: info.allow_review || "yes",
        pass_percent: info.pass_percent || "",
        instructions: info.exam_instructions || info.instructions || ""
      },
      examSkill: info.exam_skill_title ? { title: info.exam_skill_title, body: info.exam_skill_body || "" } : null,
      vocabulary: [], collocations: [], chunks: [],
      grammar: { title: info.grammar_title || "", intro: info.grammar_intro || "", points: [], errors: [] },
      miniPractice: [], flashcards: [], exam: null,
      counts: {}
    };
    if (!info.title) err("Lesson_Info", 2, "Missing required key 'title'.");
    if (!info.lesson_id) warn("Lesson_Info", 1, "No 'lesson_id' given — derived '" + lessonId + "'. Set one for stable IDs across re-imports.");

    /* -------------------- Vocabulary ---------------------------------- */
    var vRows = sheets.Vocabulary || [];
    var vh = headerIndex(vRows);
    var vc = {
      term: col(vh, ["term", "word", "word_phrase", "vocab", "headword", "item"]),
      pos: col(vh, ["pos", "part_of_speech", "type"]),
      def: col(vh, ["definition_en", "definition", "english_definition", "meaning_en", "meaning"]),
      vi: col(vh, ["vietnamese", "vi", "meaning_vi", "vn"]),
      ex: col(vh, ["example", "example_sentence", "sentence"]),
      ipa: col(vh, ["ipa", "pronunciation", "phonemic"]),
      tags: col(vh, ["tags", "topic", "category"]),
      id: col(vh, ["id", "vocab_id"])
    };
    if (vRows.length && vc.term === -1) err("Vocabulary", 1, "Missing a 'term' (word/phrase) column.");
    var vSeen = {};
    for (var r = 1; r < vRows.length; r++) {
      var row = vRows[r]; if (!row || row.every(isBlank)) continue;
      var term = cell(row, vc.term);
      if (!term) { err("Vocabulary", r + 1, "Blank term."); continue; }
      var tKey = lc(term);
      if (vSeen[tKey]) { warn("Vocabulary", r + 1, "Duplicate vocabulary '" + term + "' — kept once."); continue; }
      vSeen[tKey] = true;
      if (vc.def === -1 || isBlank(row[vc.def])) warn("Vocabulary", r + 1, "'" + term + "' has no English definition.");
      lesson.vocabulary.push({
        id: cell(row, vc.id) || (lessonId + "-v" + (lesson.vocabulary.length + 1)),
        term: term,
        pos: cell(row, vc.pos),
        defEn: cell(row, vc.def),
        vi: cell(row, vc.vi),
        example: cell(row, vc.ex),
        ipa: cell(row, vc.ipa),
        tags: cell(row, vc.tags)
      });
    }

    /* -------------------- Collocations -------------------------------- */
    var cRows = sheets.Collocations || [];
    var ch = headerIndex(cRows);
    var cc = {
      kw: col(ch, ["keyword", "key_word", "word", "headword", "term"]),
      cols: col(ch, ["collocations", "collocation", "phrases", "common_collocations"]),
      ex: col(ch, ["example", "example_sentence", "sentence"])
    };
    for (var rc = 1; rc < cRows.length; rc++) {
      var crow = cRows[rc]; if (!crow || crow.every(isBlank)) continue;
      var kw = cell(crow, cc.kw);
      var list = splitList(cell(crow, cc.cols));
      if (!kw && !list.length) continue;
      lesson.collocations.push({
        id: lessonId + "-c" + (lesson.collocations.length + 1),
        keyword: kw,
        collocations: list,
        example: cell(crow, cc.ex)
      });
    }

    /* -------------------- Chunks -------------------------------------- */
    var kRows = sheets.Chunks || [];
    var kh = headerIndex(kRows);
    var kc = {
      chunk: col(kh, ["chunk", "expression", "phrase", "fixed_expression"]),
      m: col(kh, ["meaning_en", "meaning", "definition", "definition_en"]),
      vi: col(kh, ["vietnamese", "vi", "meaning_vi", "vn"]),
      ex: col(kh, ["example", "example_sentence", "sentence"])
    };
    if (kRows.length && kc.chunk === -1) err("Chunks", 1, "Missing a 'chunk' column.");
    for (var rk = 1; rk < kRows.length; rk++) {
      var krow = kRows[rk]; if (!krow || krow.every(isBlank)) continue;
      var chunk = cell(krow, kc.chunk); if (!chunk) continue;
      lesson.chunks.push({
        id: lessonId + "-k" + (lesson.chunks.length + 1),
        chunk: chunk,
        meaningEn: cell(krow, kc.m),
        vi: cell(krow, kc.vi),
        example: cell(krow, kc.ex)
      });
    }

    /* -------------------- Grammar ------------------------------------- */
    var gRows = sheets.Grammar || [];
    var gh = headerIndex(gRows);
    var gc = {
      head: col(gh, ["heading", "title", "point", "name"]),
      exp: col(gh, ["explanation", "content", "detail", "notes"]),
      ex: col(gh, ["examples", "example", "example_sentences"]),
      order: col(gh, ["order", "seq", "no"])
    };
    for (var rg = 1; rg < gRows.length; rg++) {
      var grow = gRows[rg]; if (!grow || grow.every(isBlank)) continue;
      var head = cell(grow, gc.head), exp = cell(grow, gc.exp);
      if (!head && !exp) continue;
      lesson.grammar.points.push({
        id: lessonId + "-g" + (lesson.grammar.points.length + 1),
        order: gc.order !== -1 ? toInt(grow[gc.order], rg) : rg,
        heading: head,
        explanation: exp,
        examples: splitList(cell(grow, gc.ex))
      });
    }
    lesson.grammar.points.sort(function (a, b) { return a.order - b.order; });

    /* -------------------- Grammar_Errors (common mistakes) ------------ */
    var eRows = sheets.Grammar_Errors || [];
    var eh = headerIndex(eRows);
    var ec = {
      bad: col(eh, ["incorrect", "wrong", "error", "mistake"]),
      good: col(eh, ["correct", "right", "fix"]),
      why: col(eh, ["why", "reason", "explanation", "note"])
    };
    for (var re = 1; re < eRows.length; re++) {
      var erow = eRows[re]; if (!erow || erow.every(isBlank)) continue;
      var bad = cell(erow, ec.bad); if (!bad) continue;
      lesson.grammar.errors.push({ incorrect: bad, correct: cell(erow, ec.good), why: cell(erow, ec.why) });
    }

    /* -------------------- Mini_Practice ------------------------------- */
    var mRows = sheets.Mini_Practice || [];
    var mh = headerIndex(mRows);
    var mc = {
      id: col(mh, ["activity_id", "id", "activity", "q_id"]),
      type: col(mh, ["type", "activity_type", "kind"]),
      instr: col(mh, ["instructions", "instruction", "rubric"]),
      stem: col(mh, ["stem", "question", "prompt", "question_text"]),
      a: col(mh, ["option_a", "a", "opt_a"]),
      b: col(mh, ["option_b", "b", "opt_b"]),
      c: col(mh, ["option_c", "c", "opt_c"]),
      d: col(mh, ["option_d", "d", "opt_d"]),
      correct: col(mh, ["correct", "answer", "key", "correct_answer"]),
      expl: col(mh, ["explanation", "explain", "note"]),
      skill: col(mh, ["skill", "tested", "language_point", "focus"])
    };
    var mSeen = {};
    for (var rm = 1; rm < mRows.length; rm++) {
      var mrow = mRows[rm]; if (!mrow || mrow.every(isBlank)) continue;
      var xRow = rm + 1;
      var type = lc(cell(mrow, mc.type)) || "mcq";
      if (MP_TYPES.indexOf(type) === -1) {
        err("Mini_Practice", xRow, "Invalid type '" + cell(mrow, mc.type) + "'. Use one of: " + MP_TYPES.join(", ") + ".");
        continue;
      }
      var aid = cell(mrow, mc.id) || (lessonId + "-mp" + (lesson.miniPractice.length + 1));
      if (mSeen[aid]) { err("Mini_Practice", xRow, "Duplicate activity_id '" + aid + "'."); continue; }
      mSeen[aid] = true;

      var item = {
        id: aid, type: type,
        instructions: cell(mrow, mc.instr),
        stem: cell(mrow, mc.stem),
        explanation: cell(mrow, mc.expl),
        skill: cell(mrow, mc.skill)
      };

      if (type === "mcq" || type === "context") {
        var texts = [cell(mrow, mc.a), cell(mrow, mc.b), cell(mrow, mc.c), cell(mrow, mc.d)];
        var opts = [];
        LETTERS.forEach(function (L, idx) {
          if (!isBlank(texts[idx])) opts.push({ id: aid + "_" + L.toLowerCase(), letter: L, text: texts[idx], correct: false });
        });
        if (opts.length < 2) { err("Mini_Practice", xRow, "'" + aid + "' needs at least 2 options."); continue; }
        var cor = cell(mrow, mc.correct).toUpperCase().replace(/[^ABCD]/g, "");
        if (LETTERS.indexOf(cor) === -1) { err("Mini_Practice", xRow, "'" + aid + "' correct must be A–D."); continue; }
        var match = opts.filter(function (o) { return o.letter === cor; })[0];
        if (!match) { err("Mini_Practice", xRow, "'" + aid + "' correct '" + cor + "' points to an empty option."); continue; }
        match.correct = true;
        if (root.LessonRandom && root.LessonRandom.hasDuplicateOptions(opts.map(function (o) { return o.text; })))
          warn("Mini_Practice", xRow, "'" + aid + "' has two identical options — shuffling may confuse.");
        item.options = opts;
      } else if (type === "matching") {
        // stem lines "left :: right", one pair per line.
        var pairs = norm(cell(mrow, mc.stem)).split("\n").map(function (ln) {
          var p = ln.split(/::|\t|=>|\|/); return { left: (p[0] || "").trim(), right: (p[1] || "").trim() };
        }).filter(function (p) { return p.left && p.right; });
        if (pairs.length < 2) { err("Mini_Practice", xRow, "'" + aid + "' matching needs ≥2 'left :: right' lines in the stem."); continue; }
        item.pairs = pairs.map(function (p, i) { return { id: aid + "_p" + (i + 1), left: p.left, right: p.right }; });
      } else if (type === "arrangement") {
        // stem lines = items IN CORRECT ORDER.
        var items = norm(cell(mrow, mc.stem)).split("\n").map(function (s) { return s.trim(); })
          .filter(function (s) { return s !== ""; });
        if (items.length < 2) { err("Mini_Practice", xRow, "'" + aid + "' arrangement needs ≥2 lines (in correct order) in the stem."); continue; }
        item.items = items.map(function (t, i) { return { id: aid + "_s" + (i + 1), text: t.replace(/^[a-eA-E1-9][\.\)]\s*/, "") }; });
      } else {
        // gap_fill / sentence_completion / transformation / error_correction
        var ans = cell(mrow, mc.correct);
        if (isBlank(ans)) { err("Mini_Practice", xRow, "'" + aid + "' (" + type + ") needs an answer in the 'correct'/'answer' column."); continue; }
        item.answers = splitAnswers(ans);
      }
      lesson.miniPractice.push(item);
    }

    /* -------------------- EXAM (delegate to TestEngine) --------------- */
    var groups = sheets.Exam_Groups || [];
    var questions = sheets.Exam_Questions || [];
    if (questions.length > 1) {
      if (typeof root.TestEngine === "undefined") {
        err("Exam_Questions", 1, "TestEngine is not loaded — cannot build the exam section.");
      } else {
        var synthInfo = [["Key", "Value"],
          ["title", lesson.title + " — Exam"],
          ["exam_code", lesson.examMeta.exam_code],
          ["header_line1", lesson.examMeta.header_line1],
          ["header_line2", lesson.examMeta.header_line2],
          ["duration_minutes", lesson.examMeta.duration_minutes],
          ["default_mode", lesson.examMeta.default_mode],
          ["allow_review", lesson.examMeta.allow_review],
          ["pass_percent", lesson.examMeta.pass_percent],
          ["instructions", lesson.examMeta.instructions],
          ["id", lessonId + "-exam"]];
        var built = root.TestEngine.buildModel({ Info: synthInfo, Groups: groups, Questions: questions });
        // Re-label the source sheet names in any errors for the teacher.
        built.errors.forEach(function (e) {
          e.sheet = e.sheet === "Groups" ? "Exam_Groups" : (e.sheet === "Questions" ? "Exam_Questions" : e.sheet);
          errors.push(e);
        });
        built.warnings.forEach(function (w) {
          w.sheet = w.sheet === "Groups" ? "Exam_Groups" : (w.sheet === "Questions" ? "Exam_Questions" : w.sheet);
          warnings.push(w);
        });
        lesson.exam = built.test;
        annotateReadingBold(lesson.exam);   // bold cited words/phrases in passages
      }
    } else {
      warn("Exam_Questions", 1, "No exam questions found — the lesson will have no Section 2 (Exam).");
    }

    /* -------------------- Flashcards ---------------------------------- */
    var fRows = sheets.Flashcards || [];
    var fh = headerIndex(fRows);
    var fc = {
      front: col(fh, ["front", "term", "word", "prompt"]),
      fprompt: col(fh, ["front_prompt", "prompt", "example_prompt"]),
      meaning: col(fh, ["meaning", "definition", "back", "meaning_en"]),
      vi: col(fh, ["vietnamese", "vi", "meaning_vi"]),
      pos: col(fh, ["pos", "part_of_speech"]),
      ex: col(fh, ["example", "example_sentence"]),
      usage: col(fh, ["usage", "note", "usage_note"]),
      src: col(fh, ["source", "source_vocab", "vocab", "link"])
    };
    var explicitCards = [];
    for (var rf = 1; rf < fRows.length; rf++) {
      var frow = fRows[rf]; if (!frow || frow.every(isBlank)) continue;
      var front = cell(frow, fc.front); if (!front) continue;
      explicitCards.push({
        id: lessonId + "-f" + (explicitCards.length + 1),
        front: front,
        frontPrompt: cell(frow, fc.fprompt),
        back: {
          meaning: cell(frow, fc.meaning), vi: cell(frow, fc.vi),
          pos: cell(frow, fc.pos), example: cell(frow, fc.ex), usage: cell(frow, fc.usage)
        },
        source: cell(frow, fc.src) || front,
        origin: "manual"
      });
    }
    if (explicitCards.length) {
      lesson.flashcards = explicitCards;
    } else {
      lesson.flashcards = autoFlashcards(lesson);
    }

    /* -------------------- counts & final checks ----------------------- */
    lesson.counts = {
      vocabulary: lesson.vocabulary.length,
      collocations: lesson.collocations.length,
      chunks: lesson.chunks.length,
      grammarPoints: lesson.grammar.points.length,
      grammarErrors: lesson.grammar.errors.length,
      miniPractice: lesson.miniPractice.length,
      examQuestions: lesson.exam ? lesson.exam.questions.length : 0,
      flashcards: lesson.flashcards.length
    };
    if (!lesson.vocabulary.length && !lesson.exam && !lesson.miniPractice.length)
      err("(workbook)", 0, "The lesson is empty — no vocabulary, mini-practice, or exam questions were found.");

    return { lesson: lesson, errors: errors, warnings: warnings };
  }

  /* ---- Auto-bold cited words/phrases in reading passages -------------
   * A reference/vocabulary question often cites a target in quotes and names
   * its paragraph, e.g.  The phrase "prolonged eye contact" in paragraph 4 …
   * We bold ONLY that first occurrence in that paragraph so students can find
   * it quickly. Runs at import time → shows in the app AND the .docx export.
   * -------------------------------------------------------------------- */
  function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function boldFirstIn(text, phrase) {
    phrase = norm(phrase);
    if (!phrase) return text;
    // already bolded in this paragraph? leave it.
    if (new RegExp("<b>\\s*" + escRe(phrase) + "\\s*</b>", "i").test(text)) return text;
    var isWord = /^[A-Za-z][A-Za-z'-]*$/.test(phrase);   // single word → word boundary
    var re = new RegExp(isWord ? "\\b" + escRe(phrase) + "\\b" : escRe(phrase), "i");
    var m = re.exec(text);
    if (!m) return text;
    // don't wrap if the match is already inside an existing <b>…</b>
    var before = text.slice(0, m.index);
    if ((before.match(/<b>/gi) || []).length > (before.match(/<\/b>/gi) || []).length) return text;
    return text.slice(0, m.index) + "<b>" + m[0] + "</b>" + text.slice(m.index + m[0].length);
  }
  function firstQuoted(stem) {
    // a cited target may be in quotes \u2026 or bolded (<b>\u2026</b> / **\u2026**) in the stem
    var m = stem.match(/"([^"]{1,80})"/) || stem.match(/[\u201C]([^\u201D]{1,80})[\u201D]/) ||
            stem.match(/[\u2018]([^\u2019]{1,80})[\u2019]/) || stem.match(/'([^']{1,80})'/) ||
            stem.match(/<b>([^<]{1,80})<\/b>/i) || stem.match(/<strong>([^<]{1,80})<\/strong>/i) ||
            stem.match(/\*\*([^*]{1,80})\*\*/);
    return m ? m[1].trim() : null;
  }
  function splitParagraphs(body, minCount) {
    var paras = body.split(/\n\s*\n/);
    if (paras.length < minCount) {                      // fall back to single newlines
      var alt = body.split(/\n/).filter(function (p) { return norm(p) !== ""; });
      if (alt.length >= minCount) return { paras: alt, sep: "\n" };
    }
    return { paras: paras, sep: "\n\n" };
  }
  function annotateReadingBold(test) {
    (test.sections || []).forEach(function (s) {
      if (s.type !== "reading" || !s.body) return;
      var targets = [];
      (s.questions || []).forEach(function (q) {
        var stem = q.stem || "";
        var pm = stem.match(/paragraph\s+(\d+)/i);
        if (!pm) return;                                 // must name a paragraph
        var phrase = firstQuoted(stem);
        if (!phrase) return;                             // must quote a target
        targets.push({ para: parseInt(pm[1], 10), phrase: phrase });
      });
      if (!targets.length) return;
      var maxPara = targets.reduce(function (a, t) { return Math.max(a, t.para); }, 0);
      var split = splitParagraphs(s.body, maxPara);
      var paras = split.paras;
      targets.forEach(function (t) {
        var idx = t.para - 1;
        if (idx >= 0 && idx < paras.length) paras[idx] = boldFirstIn(paras[idx], t.phrase);
      });
      s.body = paras.join(split.sep);
    });
  }

  /* ---- Auto-generate flashcards from vocab/chunks/collocations -------- */
  function autoFlashcards(lesson) {
    var cards = [], seen = {};
    function add(front, back, source, origin, prompt) {
      var k = lc(front); if (!front || seen[k]) return; seen[k] = true;
      cards.push({ id: lesson.id + "-f" + (cards.length + 1), front: front, frontPrompt: prompt || "",
                   back: back, source: source || front, origin: origin });
    }
    var from = lesson.flashcardsFrom || ["vocabulary", "chunks"];
    if (from.indexOf("vocabulary") !== -1) {
      lesson.vocabulary.forEach(function (v) {
        add(v.term, { meaning: v.defEn, vi: v.vi, pos: v.pos, example: v.example, usage: v.ipa ? ("/" + v.ipa + "/") : "" },
            v.id, "vocabulary");
      });
    }
    if (from.indexOf("chunks") !== -1) {
      lesson.chunks.forEach(function (c) {
        add(c.chunk, { meaning: c.meaningEn, vi: c.vi, pos: "chunk", example: c.example, usage: "" }, c.id, "chunk");
      });
    }
    if (from.indexOf("collocations") !== -1) {
      lesson.collocations.forEach(function (c) {
        (c.collocations || []).forEach(function (phrase) {
          add(phrase, { meaning: "Collocation with “" + c.keyword + "”", vi: "", pos: "collocation", example: c.example, usage: "" },
              c.id, "collocation");
        });
      });
    }
    return cards;
  }

  /* =====================================================================
   * Public: parse an uploaded workbook (ArrayBuffer) with SheetJS.
   * ===================================================================== */
  var CANON_SHEETS = ["Lesson_Info", "Vocabulary", "Collocations", "Chunks",
    "Grammar", "Grammar_Errors", "Mini_Practice", "Exam_Groups", "Exam_Questions", "Flashcards"];
  // Friendly aliases so a teacher's slightly different tab name still resolves.
  var SHEET_ALIASES = {
    Lesson_Info: ["lesson_info", "info", "lesson info", "meta"],
    Vocabulary: ["vocabulary", "vocab", "words"],
    Collocations: ["collocations", "collocation"],
    Chunks: ["chunks", "expressions", "lexical_chunks"],
    Grammar: ["grammar", "grammar_points"],
    Grammar_Errors: ["grammar_errors", "common_errors", "errors", "mistakes"],
    Mini_Practice: ["mini_practice", "practice", "mini practice", "minipractice"],
    Exam_Groups: ["exam_groups", "groups", "exam groups", "passages"],
    Exam_Questions: ["exam_questions", "questions", "exam questions", "exam_test", "exam"],
    Flashcards: ["flashcards", "cards", "flash_cards"]
  };

  function parseWorkbook(arrayBuffer) {
    if (typeof root.XLSX === "undefined") throw new Error("SheetJS (XLSX) is not loaded.");
    var wb = root.XLSX.read(arrayBuffer, { type: "array", cellHTML: true, cellText: true });
    var lowerNames = {};
    wb.SheetNames.forEach(function (n) { lowerNames[n.toLowerCase()] = n; });

    function findSheet(canon) {
      var aliases = SHEET_ALIASES[canon] || [canon.toLowerCase()];
      for (var i = 0; i < aliases.length; i++) if (lowerNames[aliases[i]]) return lowerNames[aliases[i]];
      return null;
    }
    function sheetRows(realName) {
      var ws = wb.Sheets[realName];
      if (!ws || !ws["!ref"]) return [];
      var range = root.XLSX.utils.decode_range(ws["!ref"]);
      var rows = [];
      for (var R = range.s.r; R <= range.e.r; R++) {
        var row = [];
        for (var C = range.s.c; C <= range.e.c; C++)
          row.push(cellToMarkup(ws[root.XLSX.utils.encode_cell({ r: R, c: C })]));
        rows.push(row);
      }
      return rows;
    }

    var sheets = {};
    CANON_SHEETS.forEach(function (canon) {
      var real = findSheet(canon);
      sheets[canon] = real ? sheetRows(real) : [];
    });

    // Minimal viability check.
    if (!sheets.Lesson_Info.length && !sheets.Vocabulary.length && !sheets.Exam_Questions.length) {
      return { lesson: null, errors: [{ sheet: "(workbook)", row: 0,
        message: "No recognised sheets found. Expected tabs like: " + CANON_SHEETS.join(", ") + "." }], warnings: [] };
    }
    return buildLesson(sheets);
  }

  root.LessonEngine = {
    MP_TYPES: MP_TYPES,
    CANON_SHEETS: CANON_SHEETS,
    parseWorkbook: parseWorkbook,
    buildLesson: buildLesson,          // for tests / non-Excel data sources
    autoFlashcards: autoFlashcards,
    formatText: function (s) { return (root.TestEngine ? root.TestEngine.formatText(s) : String(s == null ? "" : s)); }
  };

})(typeof window !== "undefined" ? window : this);
