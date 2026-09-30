/* =============================================================================
 * test-engine.js  —  National English Test System
 * -----------------------------------------------------------------------------
 * PURE LOGIC LAYER. No DOM, no rendering. Safe to reuse in any front-end or to
 * run server-side (with a SheetJS build available as `XLSX`).
 *
 * Responsibilities:
 *   1. Parse a 3-sheet workbook (Info / Groups / Questions) into a Test model.
 *   2. Validate the data and return row-level errors + warnings.
 *   3. Tokenise cloze passages so blanks can be rendered inline.
 *   4. Score a set of answers into a structured result payload.
 *
 * This file defines a single global: `TestEngine`.
 * It depends on the global `XLSX` (SheetJS) ONLY inside parseWorkbook().
 * =========================================================================== */
(function (root) {
  "use strict";

  var QTYPES = ["arrange", "reading", "cloze"];
  var LETTERS = ["A", "B", "C", "D"];

  /* ----------------------------------------------------------------------- *
   * Small helpers
   * ----------------------------------------------------------------------- */
  function norm(v) {
    if (v === undefined || v === null) return "";
    return String(v).replace(/\r\n/g, "\n").trim();
  }
  function lc(v) { return norm(v).toLowerCase(); }
  function isBlank(v) { return norm(v) === ""; }

  /* ----------------------------------------------------------------------- *
   * Inline formatting (bold / italic / underline)
   * -----------------------------------------------------------------------
   * Two authoring routes, both supported:
   *   (a) Bold the text directly in Excel  -> read from the cell's rich text.
   *   (b) Type lightweight markup           -> <b>word</b>, <i>..</i>, <u>..</u>,
   *                                            or **word** for bold.
   * Storage is always a plain string that may contain <b>/<i>/<u> markup.
   * Rendering goes through formatText(), which escapes everything first and
   * then re-enables ONLY that whitelist — so nothing a teacher types can ever
   * inject live HTML, and students never see raw tags.
   * ----------------------------------------------------------------------- */

  // Convert a SheetJS cell's HTML (native rich text) -> our safe markup string.
  function hToMarkup(h) {
    var s = String(h);
    s = s.replace(/<br\s*\/?>/gi, "\n");
    s = s.replace(/<\s*strong\s*>/gi, "<b>").replace(/<\s*\/\s*strong\s*>/gi, "</b>");
    s = s.replace(/<\s*em\s*>/gi, "<i>").replace(/<\s*\/\s*em\s*>/gi, "</i>");
    s = s.replace(/<(?!\/?(?:b|i|u)\b)[^>]*>/gi, "");          // drop span/font/etc, keep b/i/u
    s = s.replace(/<(b|i|u)>\s*<\/\1>/gi, "");                 // remove empty pairs
    s = s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
         .replace(/&#0?39;/g, "'").replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
         .replace(/&amp;/g, "&");
    return s;
  }

  // Read one cell as a markup string: native rich text if present, else raw value.
  function cellToMarkup(cell) {
    if (!cell) return "";
    var h = cell.h;
    if (h && /<(b|i|u|strong|em)\b/i.test(h)) return hToMarkup(h);
    if (cell.v === undefined || cell.v === null) return cell.w != null ? String(cell.w) : "";
    if (typeof cell.v === "string") return cell.v;               // keeps any typed <b> markup
    return cell.w != null ? String(cell.w) : String(cell.v);
  }

  // Render-time: markup string -> SAFE html (used by the UI layer).
  function formatText(s) {
    s = String(s == null ? "" : s);
    s = s.replace(/<br\s*\/?>/gi, "\n");
    s = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");  // **bold**
    s = s.replace(/&lt;(\/?)(b|strong|i|em|u)&gt;/gi, "<$1$2>"); // re-enable whitelist only
    return s;
  }

  // Build a case-insensitive header lookup for a sheet's first row.
  function headerIndex(rows) {
    var map = {};
    if (!rows.length) return map;
    var header = rows[0];
    for (var c = 0; c < header.length; c++) {
      var key = lc(header[c]).replace(/\s+/g, "_");
      if (key) map[key] = c;
    }
    return map;
  }

  // Accept a few friendly aliases for column names.
  var COLUMN_ALIASES = {
    group_id: ["group_id", "group", "groupid", "passage_id", "passage", "id"],
    type: ["type", "section_type", "kind"],
    order: ["order", "seq", "sequence", "position"],
    instructions: ["instructions", "instruction", "rubric"],
    body: ["body", "passage_text", "text", "content", "passage"],
    question_no: ["question_no", "question_number", "q_no", "no", "number", "question"],
    stem: ["stem", "question_text", "prompt", "question_stem"],
    option_a: ["option_a", "a", "opt_a", "choice_a"],
    option_b: ["option_b", "b", "opt_b", "choice_b"],
    option_c: ["option_c", "c", "opt_c", "choice_c"],
    option_d: ["option_d", "d", "opt_d", "choice_d"],
    correct: ["correct", "answer", "key", "correct_answer"],
    explanation: ["explanation", "explain", "rationale", "note", "notes"]
  };

  function resolveCol(hidx, canonical) {
    var aliases = COLUMN_ALIASES[canonical] || [canonical];
    for (var i = 0; i < aliases.length; i++) {
      if (hidx.hasOwnProperty(aliases[i])) return hidx[aliases[i]];
    }
    return -1;
  }

  /* ----------------------------------------------------------------------- *
   * Cloze tokeniser
   * Recognises  {{24}}  (recommended)  OR  (24)_____  (pasted-from-exam style)
   * Returns an ordered list of segments: {text:"..."} | {blank: <number>}
   * ----------------------------------------------------------------------- */
  var CLOZE_RE = /\{\{\s*(\d+)\s*\}\}|\((\d+)\)\s*_+/g;

  function tokenizeCloze(body) {
    var text = norm(body);
    var tokens = [];
    var last = 0;
    var m;
    CLOZE_RE.lastIndex = 0;
    while ((m = CLOZE_RE.exec(text)) !== null) {
      if (m.index > last) tokens.push({ text: text.slice(last, m.index) });
      var n = parseInt(m[1] !== undefined ? m[1] : m[2], 10);
      tokens.push({ blank: n });
      last = CLOZE_RE.lastIndex;
    }
    if (last < text.length) tokens.push({ text: text.slice(last) });
    return tokens;
  }

  function clozeBlankNumbers(body) {
    return tokenizeCloze(body)
      .filter(function (t) { return t.blank !== undefined; })
      .map(function (t) { return t.blank; });
  }

  /* ----------------------------------------------------------------------- *
   * Parse raw sheets -> Test model
   * `sheets` = { Info: rows[][], Groups: rows[][], Questions: rows[][] }
   * ----------------------------------------------------------------------- */
  function buildModel(sheets) {
    var errors = [];
    var warnings = [];

    function err(sheet, row, msg) { errors.push({ sheet: sheet, row: row, message: msg }); }
    function warn(sheet, row, msg) { warnings.push({ sheet: sheet, row: row, message: msg }); }

    /* ---- Info sheet (Key / Value) ---- */
    var info = {};
    var infoRows = sheets.Info || [];
    for (var i = 1; i < infoRows.length; i++) {
      var key = lc(infoRows[i][0]).replace(/\s+/g, "_");
      if (!key) continue;
      info[key] = norm(infoRows[i][1]);
    }

    var test = {
      id: info.id || info.test_id || slug(info.title || "test") + "-" + Date.now().toString(36),
      title: info.title || "Untitled Test",
      examCode: info.exam_code || info.made || info.code || "",
      headerLine1: info.header_line1 || "",
      headerLine2: info.header_line2 || "",
      durationMinutes: toInt(info.duration_minutes || info.duration, 50),
      defaultMode: (lc(info.default_mode) === "practice") ? "practice" : "exam",
      // Detailed review after submission is ON by default; set allow_review = no
      // in the Info sheet to hide answers even after a high-stakes exam.
      allowReview: ["no", "false", "0", "off"].indexOf(lc(info.allow_review)) === -1,
      passPercent: info.pass_percent ? toInt(info.pass_percent, 0) : null,
      instructionsIntro: info.instructions || "",
      sections: [],
      questions: []
    };

    /* ---- Groups sheet ---- */
    var groupRows = sheets.Groups || [];
    var gh = headerIndex(groupRows);
    var gId = resolveCol(gh, "group_id"),
        gType = resolveCol(gh, "type"),
        gOrder = resolveCol(gh, "order"),
        gInstr = resolveCol(gh, "instructions"),
        gBody = resolveCol(gh, "body");

    if (groupRows.length && gId === -1)
      err("Groups", 1, "Missing a 'group_id' column.");
    if (groupRows.length && gType === -1)
      err("Groups", 1, "Missing a 'type' column.");

    var sectionsById = {};
    for (var r = 1; r < groupRows.length; r++) {
      var row = groupRows[r];
      if (!row || row.every(isBlank)) continue;
      var excelRow = r + 1; // 1-based, incl. header
      var id = norm(row[gId]);
      if (!id) { err("Groups", excelRow, "Blank group_id."); continue; }
      var type = lc(row[gType]);
      if (QTYPES.indexOf(type) === -1) {
        err("Groups", excelRow, "type must be one of arrange / reading / cloze (got '" + norm(row[gType]) + "').");
        continue;
      }
      if (sectionsById[id]) {
        err("Groups", excelRow, "Duplicate group_id '" + id + "'.");
        continue;
      }
      var section = {
        id: id,
        type: type,
        order: gOrder !== -1 ? toInt(row[gOrder], r) : r,
        instructions: gInstr !== -1 ? norm(row[gInstr]) : "",
        body: gBody !== -1 ? norm(row[gBody]) : "",
        excelRow: excelRow,
        questions: []
      };
      sectionsById[id] = section;
      test.sections.push(section);
    }

    /* ---- Questions sheet ---- */
    var qRows = sheets.Questions || [];
    var qh = headerIndex(qRows);
    var cGid = resolveCol(qh, "group_id"),
        cNo = resolveCol(qh, "question_no"),
        cStem = resolveCol(qh, "stem"),
        cA = resolveCol(qh, "option_a"),
        cB = resolveCol(qh, "option_b"),
        cC = resolveCol(qh, "option_c"),
        cD = resolveCol(qh, "option_d"),
        cCorrect = resolveCol(qh, "correct"),
        cExpl = resolveCol(qh, "explanation");

    if (qRows.length) {
      if (cCorrect === -1) err("Questions", 1, "Missing a 'correct' column.");
      if (cA === -1 || cB === -1) err("Questions", 1, "Missing option columns (need at least option_a, option_b).");
    } else {
      err("Questions", 1, "The Questions sheet is empty.");
    }

    var standaloneCounter = 0;
    for (var qr = 1; qr < qRows.length; qr++) {
      var qrow = qRows[qr];
      if (!qrow || qrow.every(isBlank)) continue;
      var qExcelRow = qr + 1;

      var gid = cGid !== -1 ? norm(qrow[cGid]) : "";
      var section2;
      if (gid) {
        section2 = sectionsById[gid];
        if (!section2) {
          err("Questions", qExcelRow, "group_id '" + gid + "' has no matching row in the Groups sheet.");
          continue;
        }
      } else {
        // Implicit standalone section (one question, no shared passage).
        standaloneCounter++;
        var sid = "_standalone_" + qExcelRow;
        section2 = {
          id: sid, type: "arrange", order: 10000 + standaloneCounter,
          instructions: "", body: "", excelRow: qExcelRow, questions: [], standalone: true
        };
        sectionsById[sid] = section2;
        test.sections.push(section2);
      }

      var opts = {
        A: cA !== -1 ? norm(qrow[cA]) : "",
        B: cB !== -1 ? norm(qrow[cB]) : "",
        C: cC !== -1 ? norm(qrow[cC]) : "",
        D: cD !== -1 ? norm(qrow[cD]) : ""
      };
      var provided = LETTERS.filter(function (L) { return !isBlank(opts[L]); });
      if (provided.length < 2)
        err("Questions", qExcelRow, "A question needs at least 2 options.");

      var correct = norm(cCorrect !== -1 ? qrow[cCorrect] : "").toUpperCase().replace(/[^ABCD]/g, "");
      if (LETTERS.indexOf(correct) === -1) {
        err("Questions", qExcelRow, "correct answer must be A, B, C or D (got '" + norm(qrow[cCorrect]) + "').");
      } else if (isBlank(opts[correct])) {
        err("Questions", qExcelRow, "correct answer '" + correct + "' points to an empty option.");
      }

      var q = {
        sectionId: section2.id,
        no: cNo !== -1 && !isBlank(qrow[cNo]) ? toInt(qrow[cNo], null) : null,
        stem: cStem !== -1 ? norm(qrow[cStem]) : "",
        options: opts,
        correct: correct,
        explanation: cExpl !== -1 ? norm(qrow[cExpl]) : "",
        excelRow: qExcelRow
      };
      section2.questions.push(q);
      test.questions.push(q);
    }

    /* ---- Order sections, assign display numbers ---- */
    test.sections.sort(function (a, b) { return a.order - b.order; });

    var running = 0;
    var orderedQuestions = [];
    test.sections.forEach(function (s) {
      s.questions.forEach(function (q) {
        running++;
        q.displayNo = q.no !== null ? q.no : running;
        orderedQuestions.push(q);
      });
    });
    // If ANY explicit number was given, trust them for display but keep flow order.
    test.questions = orderedQuestions;
    // Give each question a stable unique id for the UI/answers map.
    test.questions.forEach(function (q, idx) { q.id = "q" + (idx + 1); q.index = idx; });

    /* ---- Cross-checks per section type ---- */
    test.sections.forEach(function (s) {
      if (s.questions.length === 0) {
        warn("Groups", s.excelRow, "Group '" + s.id + "' has no questions.");
      }
      if (s.type === "cloze" && s.body) {
        var blanks = clozeBlankNumbers(s.body);
        if (blanks.length === 0) {
          warn("Groups", s.excelRow, "Cloze group '" + s.id + "' has no blank markers ({{n}} or (n)____) in its body.");
        } else if (blanks.length !== s.questions.length) {
          err("Groups", s.excelRow, "Cloze group '" + s.id + "' has " + blanks.length +
            " blank(s) in the text but " + s.questions.length + " question(s).");
        } else {
          // Warn if a blank number has no matching question number (when numbers given).
          var qnos = s.questions.map(function (q) { return q.displayNo; });
          blanks.forEach(function (bn) {
            if (qnos.indexOf(bn) === -1)
              warn("Groups", s.excelRow, "Cloze blank {{" + bn + "}} in '" + s.id +
                "' does not match any question number in this group.");
          });
        }
      }
      if (s.type === "reading" && !s.body && !s.standalone) {
        warn("Groups", s.excelRow, "Reading group '" + s.id + "' has an empty passage body.");
      }
    });

    if (test.questions.length === 0)
      err("Questions", 1, "No valid questions were found.");

    return { test: test, errors: errors, warnings: warnings };
  }

  function toInt(v, dflt) {
    var n = parseInt(norm(v), 10);
    return isNaN(n) ? dflt : n;
  }
  function slug(s) {
    return norm(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "test";
  }

  /* ----------------------------------------------------------------------- *
   * Public: parse an uploaded workbook (ArrayBuffer) using SheetJS.
   * ----------------------------------------------------------------------- */
  function parseWorkbook(arrayBuffer) {
    if (typeof root.XLSX === "undefined")
      throw new Error("SheetJS (XLSX) is not loaded.");
    // cellHTML:true makes native rich-text (bold/italic) available as cell.h
    var wb = root.XLSX.read(arrayBuffer, { type: "array", cellHTML: true, cellText: true });

    function sheetToRows(name) {
      // Case-insensitive sheet lookup.
      var found = wb.SheetNames.filter(function (n) { return n.toLowerCase() === name.toLowerCase(); })[0];
      if (!found) return null;
      var ws = wb.Sheets[found];
      if (!ws || !ws["!ref"]) return [];
      // Rich-text-aware row builder (mirrors sheet_to_json header:1 semantics,
      // but preserves bold/italic/underline as inline markup).
      var range = root.XLSX.utils.decode_range(ws["!ref"]);
      var rows = [];
      for (var R = range.s.r; R <= range.e.r; R++) {
        var row = [];
        for (var C = range.s.c; C <= range.e.c; C++) {
          row.push(cellToMarkup(ws[root.XLSX.utils.encode_cell({ r: R, c: C })]));
        }
        rows.push(row);
      }
      return rows;
    }

    var sheets = {
      Info: sheetToRows("Info"),
      Groups: sheetToRows("Groups"),
      Questions: sheetToRows("Questions")
    };

    var missing = [];
    if (!sheets.Groups) missing.push("Groups");
    if (!sheets.Questions) missing.push("Questions");
    if (missing.length) {
      return {
        test: null,
        errors: [{ sheet: "(workbook)", row: 0, message: "Missing required sheet(s): " + missing.join(", ") +
          ". Expected sheets named Info, Groups, Questions." }],
        warnings: []
      };
    }
    if (!sheets.Info) sheets.Info = [["Key", "Value"]];
    return buildModel(sheets);
  }

  /* ----------------------------------------------------------------------- *
   * Public: score answers.
   * answers = { <questionId>: "A"|"B"|"C"|"D" }
   * ----------------------------------------------------------------------- */
  function score(test, answers, meta) {
    answers = answers || {};
    meta = meta || {};
    var perSection = {};
    var detail = [];
    var correctCount = 0;

    test.questions.forEach(function (q) {
      var chosen = answers[q.id] || null;
      var ok = chosen === q.correct;
      if (ok) correctCount++;
      if (!perSection[q.sectionId]) {
        var sec = test.sections.filter(function (s) { return s.id === q.sectionId; })[0];
        perSection[q.sectionId] = { sectionId: q.sectionId, type: sec ? sec.type : "", correct: 0, total: 0 };
      }
      perSection[q.sectionId].total++;
      if (ok) perSection[q.sectionId].correct++;
      detail.push({
        questionId: q.id,
        questionNo: q.displayNo,
        sectionId: q.sectionId,
        chosen: chosen,
        correct: q.correct,
        isCorrect: ok
      });
    });

    var total = test.questions.length;
    var percent = total ? Math.round((correctCount / total) * 1000) / 10 : 0;

    return {
      testId: test.id,
      testTitle: test.title,
      examCode: test.examCode,
      mode: meta.mode || test.defaultMode,
      candidate: meta.candidate || { name: "", id: "" },
      startedAt: meta.startedAt || null,
      submittedAt: meta.submittedAt || new Date().toISOString(),
      durationUsedSec: meta.durationUsedSec != null ? meta.durationUsedSec : null,
      score: { correct: correctCount, total: total, percent: percent },
      passed: test.passPercent != null ? (percent >= test.passPercent) : null,
      bySection: Object.keys(perSection).map(function (k) { return perSection[k]; }),
      answers: detail
    };
  }

  /* ----------------------------------------------------------------------- *
   * Export
   * ----------------------------------------------------------------------- */
  root.TestEngine = {
    QTYPES: QTYPES,
    LETTERS: LETTERS,
    parseWorkbook: parseWorkbook,
    buildModel: buildModel,          // exposed for tests / non-Excel data sources
    formatText: formatText,          // safe markup -> html (used by the UI)
    tokenizeCloze: tokenizeCloze,
    clozeBlankNumbers: clozeBlankNumbers,
    score: score,
    _slug: slug
  };

})(typeof window !== "undefined" ? window : this);
