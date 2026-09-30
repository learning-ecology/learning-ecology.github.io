/* =============================================================================
 * docx-export.js — Export a parsed test/exam model to a real .docx (OOXML)
 * -----------------------------------------------------------------------------
 * No external library, no network: builds Office Open XML and packs it into a
 * valid (store/uncompressed) ZIP entirely in the browser, so it works offline.
 * Global: `DocxExport`.
 *
 *   DocxExport.download(test, "Lesson 27 — Exam.docx", { answerKey:true });
 *   var bytes = DocxExport.build(test, opts);   // Uint8Array (for tests)
 *
 * `test` is a TestEngine/Lesson exam model: { title, examCode, headerLine1/2,
 * sections:[{type,instructions,body,questions:[{displayNo,stem,options,correct,
 * explanation}]}], questions:[...] }. A full Lesson can be passed too (its
 * .exam is used, and vocab/grammar are appended when opts.lesson is set).
 * =========================================================================== */
(function (root) {
  "use strict";

  /* ---------------- tiny UTF-8 + CRC32 + store-ZIP ---------------- */
  function utf8(str) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(str);
    // node/legacy fallback
    var Buf = root.Buffer || (typeof Buffer !== "undefined" ? Buffer : null);
    if (Buf) return new Uint8Array(Buf.from(str, "utf8"));
    var out = [], i, c;
    for (i = 0; i < str.length; i++) {
      c = str.charCodeAt(i);
      if (c < 128) out.push(c);
      else if (c < 2048) { out.push(192 | (c >> 6), 128 | (c & 63)); }
      else { out.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63)); }
    }
    return new Uint8Array(out);
  }

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256), c, n, k;
    for (n = 0; n < 256; n++) {
      c = n;
      for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // Build a ZIP (all entries stored, no compression) from [{name, bytes}].
  function zipStore(entries) {
    var parts = [], central = [], offset = 0;
    function u16(n) { return [n & 255, (n >>> 8) & 255]; }
    function u32(n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; }

    entries.forEach(function (e) {
      var nameBytes = utf8(e.name);
      var data = e.bytes;
      var crc = crc32(data);
      var local = [].concat(
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length),
        u16(nameBytes.length), u16(0)
      );
      parts.push(new Uint8Array(local), nameBytes, data);
      var localLen = local.length + nameBytes.length + data.length;
      central.push({ nameBytes: nameBytes, crc: crc, size: data.length, offset: offset });
      offset += localLen;
    });

    var cd = [];
    central.forEach(function (c) {
      var rec = [].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(c.crc), u32(c.size), u32(c.size),
        u16(c.nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0),
        u32(c.offset)
      );
      cd.push(new Uint8Array(rec), c.nameBytes);
    });
    var cdBytes = concat(cd);
    var eocd = new Uint8Array([].concat(
      u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
      u32(cdBytes.length), u32(offset), u16(0)
    ));
    return concat(parts.concat([cdBytes, eocd]));
  }
  function concat(arrays) {
    var total = 0, i;
    for (i = 0; i < arrays.length; i++) total += arrays[i].length;
    var out = new Uint8Array(total), pos = 0;
    for (i = 0; i < arrays.length; i++) { out.set(arrays[i], pos); pos += arrays[i].length; }
    return out;
  }

  /* ---------------- OOXML helpers ---------------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  // Turn our bold/italic/underline markup into runs: [{text,b,i,u}]
  function runsFromMarkup(text) {
    text = String(text == null ? "" : text)
      .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
      .replace(/<\s*strong\s*>/gi, "<b>").replace(/<\s*\/\s*strong\s*>/gi, "</b>")
      .replace(/<\s*em\s*>/gi, "<i>").replace(/<\s*\/\s*em\s*>/gi, "</i>");
    var runs = [], state = { b: false, i: false, u: false }, buf = "";
    function flush() { if (buf) { runs.push({ text: buf, b: state.b, i: state.i, u: state.u }); buf = ""; } }
    var re = /<(\/?)(b|i|u)>/gi, last = 0, m;
    while ((m = re.exec(text)) !== null) {
      buf += text.slice(last, m.index); flush();
      state[m[2].toLowerCase()] = (m[1] !== "/");
      last = re.lastIndex;
    }
    buf += text.slice(last); flush();
    if (!runs.length) runs.push({ text: "", b: false, i: false, u: false });
    return runs;
  }
  function runXml(r, base) {
    base = base || {};
    var rpr = "";
    if (r.b) rpr += "<w:b/>";
    if (r.i) rpr += "<w:i/>";
    if (r.u) rpr += '<w:u w:val="single"/>';
    if (base.sz) rpr += '<w:sz w:val="' + base.sz + '"/><w:szCs w:val="' + base.sz + '"/>';
    if (base.color) rpr += '<w:color w:val="' + base.color + '"/>';
    var rPr = rpr ? "<w:rPr>" + rpr + "</w:rPr>" : "";
    return "<w:r>" + rPr + '<w:t xml:space="preserve">' + esc(r.text) + "</w:t></w:r>";
  }
  function para(runs, opts) {
    opts = opts || {};
    var props = "";
    if (opts.align) props += '<w:jc w:val="' + opts.align + '"/>';
    var sp = "";
    if (opts.before != null) sp += ' w:before="' + opts.before + '"';
    if (opts.after != null) sp += ' w:after="' + opts.after + '"';
    if (sp) props += "<w:spacing" + sp + "/>";
    if (opts.indent) props += '<w:ind w:left="' + opts.indent + '"/>';
    if (opts.shade) props += '<w:shd w:val="clear" w:fill="' + opts.shade + '"/>';
    var pPr = props ? "<w:pPr>" + props + "</w:pPr>" : "";
    return "<w:p>" + pPr + runs.map(function (r) { return runXml(r, opts); }).join("") + "</w:p>";
  }
  // Text paragraph with markup + a base size/color.
  function textPara(text, opts) { return para(runsFromMarkup(text), opts); }
  // Multi-line block: one paragraph per line (blank lines kept).
  function block(text, opts) {
    return String(text == null ? "" : text).split("\n").map(function (ln) {
      return textPara(ln, opts);
    }).join("");
  }

  var LETTERS = ["A", "B", "C", "D", "E", "F"];
  var TYPE_LABEL = { arrange: "Arrangement", reading: "Reading comprehension", cloze: "Gap-fill / cloze" };

  /* ---- Adaptive MCQ option layout (to conserve paper) ---------------- */
  var USABLE_TWIPS = 9638;   // A4 (11906) minus 1134 margins each side
  function plainText(t) { return runsFromMarkup(t).map(function (r) { return r.text; }).join(""); }
  function wordCount(t) { var s = plainText(t).trim(); return s ? s.split(/\s+/).length : 0; }

  // Decide one layout for a whole question so its four options align:
  //   "row"  = 4 across (short: ≤5 words, ≤22 chars)
  //   "grid" = 2×2      (medium: ~6–8 words)
  //   "stack"= 1 per line (long: >8 words / multi-sentence / very wide)
  function optionMode(present) {
    var maxW = 0, maxC = 0, multi = false;
    present.forEach(function (o) {
      var p = plainText(o.text);
      // count real words only — ignore standalone punctuation (e.g. the "–" in
      // arrangement orderings "a – b – c – d – e"), so short orderings pack tightly.
      var w = (p.match(/[A-Za-z0-9]+/g) || []).length;
      if (w > maxW) maxW = w;
      if (p.length > maxC) maxC = p.length;
      if (p.length > 40 && /[.!?…]\s+\S/.test(p)) multi = true;   // more than one sentence
    });
    if (maxW > 8 || maxC > 46 || multi) return "stack";
    if (maxW <= 5 && maxC <= 22) return "row";
    return "grid";
  }
  function optCellPara(o) {
    return para([{ text: o.L + ".  ", b: true }].concat(runsFromMarkup(o.text)), { sz: 22, before: 10, after: 10 });
  }
  // Borderless, fixed-width table so option letters/text align across the page.
  function borderlessTable(rows, cols) {
    var none = ["top", "left", "bottom", "right", "insideH", "insideV"].map(function (s) {
      return "<w:" + s + ' w:val="none" w:sz="0" w:space="0" w:color="auto"/>';
    }).join("");
    var pr = '<w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblLayout w:type="fixed"/>' +
      "<w:tblBorders>" + none + "</w:tblBorders>" +
      '<w:tblCellMar><w:top w:w="10" w:type="dxa"/><w:left w:w="60" w:type="dxa"/>' +
      '<w:bottom w:w="10" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>';
    var grid = cols.map(function (w) { return '<w:gridCol w:w="' + w + '"/>'; }).join("");
    var trs = rows.map(function (cells) {
      return "<w:tr>" + cells.map(function (cellP, i) {
        return '<w:tc><w:tcPr><w:tcW w:w="' + cols[Math.min(i, cols.length - 1)] + '" w:type="dxa"/></w:tcPr>' + cellP + "</w:tc>";
      }).join("") + "</w:tr>";
    }).join("");
    return "<w:tbl>" + pr + "<w:tblGrid>" + grid + "</w:tblGrid>" + trs + "</w:tbl>";
  }
  // Empty spacer paragraph (also stops two consecutive tables from merging in Word).
  function sepPara() { return '<w:p><w:pPr><w:spacing w:before="0" w:after="40"/><w:rPr><w:sz w:val="10"/></w:rPr></w:pPr></w:p>'; }

  // Isolated questions with NO stem (e.g. cloze gap-fills): put the number
  // INLINE as the first column, on the same row as the options.
  var NUM_W = 720;
  function numCell(label) { return para([{ text: label, b: false }], { sz: 22, before: 10, after: 10 }); }
  function blankCell() { return para([{ text: "" }], { sz: 22, before: 10, after: 10 }); }
  function optionsInlineWithNumber(label, present) {
    var mode = optionMode(present);
    if (mode === "row") {
      var ow = Math.floor((USABLE_TWIPS - NUM_W) / 4);
      var cells = [numCell(label)].concat(present.map(optCellPara));
      var cols = [NUM_W].concat(present.map(function () { return ow; }));
      return borderlessTable([cells], cols) + sepPara();
    }
    if (mode === "grid") {
      var cw = Math.floor((USABLE_TWIPS - NUM_W) / 2);
      var rows = [[numCell(label), optCellPara(present[0]), present[1] ? optCellPara(present[1]) : blankCell()]];
      if (present.length > 2)
        rows.push([blankCell(), optCellPara(present[2]), present[3] ? optCellPara(present[3]) : blankCell()]);
      return borderlessTable(rows, [NUM_W, cw, cw]) + sepPara();
    }
    // stack: number beside the first option, the rest aligned beneath it
    var rows2 = present.map(function (o, i) { return [i === 0 ? numCell(label) : blankCell(), optCellPara(o)]; });
    return borderlessTable(rows2, [NUM_W, USABLE_TWIPS - NUM_W]) + sepPara();
  }

  function optionsXml(present) {
    var mode = optionMode(present);
    if (mode === "stack") {
      return present.map(function (o) {
        return para([{ text: o.L + ".  ", b: true }].concat(runsFromMarkup(o.text)), { sz: 22, indent: 360, before: 10, after: 10 });
      }).join("");
    }
    if (mode === "row") {
      var w = Math.floor(USABLE_TWIPS / 4);
      var cols = present.map(function () { return w; });
      return borderlessTable([present.map(optCellPara)], cols) + sepPara();
    }
    // grid 2×2
    var cw = Math.floor(USABLE_TWIPS / 2);
    var rows = [];
    for (var i = 0; i < present.length; i += 2) rows.push(present.slice(i, i + 2).map(optCellPara));
    return borderlessTable(rows, [cw, cw]) + sepPara();
  }

  /* ---------------- Build the document body ---------------- */
  function buildBody(test, opts) {
    opts = opts || {};
    var out = [];
    // Header block
    if (test.headerLine1) out.push(textPara(test.headerLine1, { sz: 24, align: "center", after: 40 }));
    if (test.headerLine2) out.push(textPara(test.headerLine2, { sz: 20, color: "555555", align: "center", after: 60 }));
    out.push(para([{ text: test.title || "Test", b: true, sz: 34 }], { align: "center", after: 40 }));
    var sub = [];
    if (test.examCode) sub.push("Code " + test.examCode);
    sub.push((test.questions ? test.questions.length : 0) + " questions");
    if (test.durationMinutes) sub.push(test.durationMinutes + " minutes");
    out.push(textPara(sub.join("  ·  "), { sz: 20, color: "777777", align: "center", after: 200 }));

    // Sections
    (test.sections || []).forEach(function (s, idx) {
      out.push(para([{ text: "Part " + (idx + 1) + " — " + (TYPE_LABEL[s.type] || s.type), b: true, sz: 26 }],
        { before: 200, after: 40, shade: "EEF2FB" }));
      if (s.instructions) out.push(textPara(s.instructions, { sz: 20, i: true, color: "444444", after: 60 }));
      if (s.body && (s.type === "reading" || s.type === "cloze")) {
        out.push.apply(out, block(s.body, { sz: 22, after: 20 }).match(/<w:p>[\s\S]*?<\/w:p>/g) || []);
        out.push(para([{ text: "" }], { after: 60 }));
      }
      (s.questions || []).forEach(function (q) {
        var present = LETTERS.filter(function (L) {
          return q.options && q.options[L] !== undefined && q.options[L] !== "" && q.options[L] != null;
        }).map(function (L) { return { L: L, text: q.options[L] }; });
        var hasStem = !!(q.stem && String(q.stem).trim());
        if (hasStem) {
          var stem = (q.displayNo != null ? q.displayNo + ". " : "") + q.stem;
          // arrangement stems carry multi-line labelled sentences
          block(stem, { sz: 22, before: 80 }).match(/<w:p>[\s\S]*?<\/w:p>/g).forEach(function (p) { out.push(p); });
          if (present.length) out.push(optionsXml(present));
        } else {
          // no stem → number goes inline with the options (saves a line each)
          var label = (q.displayNo != null ? q.displayNo + "." : "");
          if (present.length) out.push(optionsInlineWithNumber(label, present));
          else out.push(textPara(label, { sz: 22, before: 80 }));
        }
      });
    });

    // Answer key
    if (opts.answerKey !== false) {
      out.push(para([{ text: "Answer Key", b: true, sz: 28 }], { before: 300, after: 60, shade: "EAF6EE" }));
      (test.sections || []).forEach(function (s, idx) {
        var pairs = (s.questions || []).map(function (q) { return q.displayNo + "-" + q.correct; });
        if (pairs.length)
          out.push(textPara("Part " + (idx + 1) + ": " + pairs.join(",  "), { sz: 22, after: 20 }));
      });
      // Explanations (optional, when present)
      var withExpl = (test.questions || []).filter(function (q) { return q.explanation; });
      if (withExpl.length && opts.explanations !== false) {
        out.push(para([{ text: "Explanations", b: true, sz: 24 }], { before: 160, after: 40 }));
        withExpl.forEach(function (q) {
          out.push(para([{ text: q.displayNo + ". ", b: true }].concat(runsFromMarkup(q.explanation)), { sz: 20, after: 20 }));
        });
      }
    }
    return out.join("");
  }

  /* ---------------- Package parts ---------------- */
  function documentXml(bodyXml) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body>' + bodyXml +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="720" w:footer="720" w:gutter="0"/>' +
      '</w:sectPr></w:body></w:document>';
  }
  var CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>';
  var RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>';
  var DOC_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';

  function build(model, opts) {
    var test = model && model.exam ? model.exam : model;   // accept a Lesson
    if (!test || !test.sections) throw new Error("DocxExport: no test/exam model to export.");
    var bodyXml = buildBody(test, opts || {});
    var entries = [
      { name: "[Content_Types].xml", bytes: utf8(CONTENT_TYPES) },
      { name: "_rels/.rels", bytes: utf8(RELS) },
      { name: "word/_rels/document.xml.rels", bytes: utf8(DOC_RELS) },
      { name: "word/document.xml", bytes: utf8(documentXml(bodyXml)) }
    ];
    return zipStore(entries);
  }

  function download(model, filename, opts) {
    var bytes = build(model, opts);
    var blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    var url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = filename || "test.docx";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  root.DocxExport = { build: build, download: download, _runsFromMarkup: runsFromMarkup, _zipStore: zipStore };

})(typeof window !== "undefined" ? window : this);
