/* =============================================================================
 * randomize.js — Seeded, stable-ID question randomization
 * -----------------------------------------------------------------------------
 * PURE LOGIC. No DOM. Global: `LessonRandom`.
 *
 * Guarantees required by the lesson system:
 *   • The correct answer is tracked by a STABLE id/value, never by its letter
 *     or its displayed position — so options may be reshuffled freely while
 *     scoring and analytics stay accurate.
 *   • Multiple-choice options are shuffled every attempt.
 *   • Sentence/utterance ARRANGEMENT items are shuffled INDEPENDENTLY of the
 *     options, and the original correct sequence is preserved internally.
 *   • No duplicate options are created; the correct option is never left in a
 *     predictable slot (a light anti-fixed-point pass); ambiguity (two options
 *     with identical text) is detected and left un-shuffled-into-collision.
 *   • Reproducible: pass the same `seed` to get the same order (for debugging
 *     or for replaying a student's exact paper when reviewing results).
 *
 * Two data shapes are supported:
 *   A. The exam "letter model" used by TestEngine/TestRunner, where a question
 *      is { options:{A,B,C,D}, correct:"A".."D" }.  ->  permuteExamModel()
 *   B. The lesson "option-object model" used by mini-practice, where a question
 *      is { options:[{id,text,correct}] }.           ->  shuffleOptionObjects()
 * =========================================================================== */
(function (root) {
  "use strict";

  var LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

  /* ---- Deterministic RNG (mulberry32) seeded from a string ------------- */
  function hashString(str) {
    str = String(str == null ? "" : str);
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Build an RNG from any seed (string/number). Same seed => same sequence.
  function makeRng(seed) { return mulberry32(hashString(seed)); }

  /* ---- Fisher–Yates using a supplied rng ------------------------------- */
  function shuffleInPlace(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  // Shuffle, but avoid an identity permutation and avoid leaving the "special"
  // index (e.g. the correct one) in its original slot, when there is room to.
  function shuffleAvoidingFixed(indices, rng, specialIdx) {
    if (indices.length < 2) return indices.slice();
    var order = indices.slice();
    var attempts = 0;
    do {
      shuffleInPlace(order, rng);
      attempts++;
      var identity = order.every(function (v, i) { return v === indices[i]; });
      var specialStuck = specialIdx != null &&
        order.indexOf(specialIdx) === indices.indexOf(specialIdx);
      if (!identity && !specialStuck) break;
    } while (attempts < 12);
    return order;
  }

  /* ---------------------------------------------------------------------- *
   * Arrangement scramble (exam MCQ "arrange" questions)
   * ----------------------------------------------------------------------
   * The sentences a–e are usually authored IN THEIR CORRECT ORDER, so the
   * answer ends up being the identity "a – b – c – d – e" and a student can
   * just read top-to-bottom. This relabels the displayed sentences into a
   * scrambled order and rewrites every option ordering accordingly, so the
   * correct answer is NEVER the identity order and the reader must actually
   * reconstruct the sequence. Scoring is unaffected (the same option stays
   * correct, only its displayed text changes). Reproducible via `rng`.
   * ---------------------------------------------------------------------- */
  var LOWER = "abcdefghijklmnopqrstuvwxyz";
  function scrambleArrangeQuestion(q, rng) {
    if (!q || !q.options) return;
    // 1) Parse the stem lines "a. text" into label -> text.
    var lines = String(q.stem || "").split(/\n+/).map(function (s) { return s.trim(); })
      .filter(function (s) { return s !== ""; });
    var labelRe = /^([a-z])\s*[\.\)\-:–]\s*(.*)$/i;
    var textByLabel = {}, origLabels = [];
    lines.forEach(function (ln) {
      var m = ln.match(labelRe);
      if (m) { var L = m[1].toLowerCase(); textByLabel[L] = m[2]; origLabels.push(L); }
    });
    var n = origLabels.length;
    if (n < 3) return; // nothing worth scrambling / not a labelled arrangement
    var labelset = {}; origLabels.forEach(function (L) { labelset[L] = true; });

    function parseSeq(str) {
      return (String(str == null ? "" : str).toLowerCase().match(/[a-z]/g) || [])
        .filter(function (c) { return labelset[c]; });
    }
    // 2) The correct chronological order = the correct option's sequence.
    var correctSeq = parseSeq(q.options[q.correct]);
    if (correctSeq.length !== n) return;
    var seen = {};
    for (var i = 0; i < correctSeq.length; i++) { if (seen[correctSeq[i]]) return; seen[correctSeq[i]] = true; }

    // Stable identity = chronological position (1..n).
    var stableOfLabel = {}, textOfStable = {};
    correctSeq.forEach(function (L, idx) { stableOfLabel[L] = idx + 1; textOfStable[idx + 1] = textByLabel[L]; });

    // 3) Pick a DISPLAY order of stable ids that is NOT the chronological one.
    var ids = []; for (var k = 1; k <= n; k++) ids.push(k);
    var D, tries = 0;
    do { D = ids.slice(); shuffleInPlace(D, rng); tries++; }
    while (tries < 24 && D.every(function (v, j) { return v === ids[j]; }));

    // 4) Assign new display labels a,b,c… to positions; map stable id -> new label.
    var newLabelOfStable = {};
    D.forEach(function (sid, pos) { newLabelOfStable[sid] = LOWER[pos]; });

    // 5) Rewrite the stem in the scrambled display order.
    q.stem = D.map(function (sid, pos) { return LOWER[pos] + ". " + textOfStable[sid]; }).join("\n");

    // 6) Rewrite every option ordering into the new labels (bijection: no
    //    collisions, distractors preserved). The correct option is now a
    //    non-identity ordering by construction.
    var newOptions = {};
    Object.keys(q.options).forEach(function (L) {
      var txt = q.options[L];
      if (txt === "" || txt == null) { newOptions[L] = ""; return; }
      var seq = parseSeq(txt);
      if (seq.length !== n) { newOptions[L] = txt; return; }
      newOptions[L] = seq.map(function (ol) { return newLabelOfStable[stableOfLabel[ol]]; }).join(" – ");
    });
    q.options = newOptions;
    q.arrangeScrambled = true;   // marker for analytics / tests
    // q.correct stays the same letter — same option, new displayed text.
  }

  /* =======================================================================
   * A. EXAM LETTER MODEL
   * Produce a per-attempt COPY of a parsed TestEngine model whose options are
   * physically reordered into A.. slots, with `correct` remapped to the new
   * slot. The runner/engine need no changes and scoring stays correct.
   *
   * For analytics with stable identity, each question gets:
   *   q.optionOrigin = { A:"C", B:"A", ... }  (display slot -> original slot)
   *   q.correctOriginal = original correct letter (stable across shuffles)
   * arrangement/reading/cloze are all letter-MCQs in the exam, so all shuffle.
   * ======================================================================= */
  function permuteExamModel(model, seed, options) {
    options = options || {};
    var doOptionShuffle = options.shuffleOptions !== false;   // default true
    var rng = makeRng(seed == null ? Date.now() : seed);
    // Deep-ish clone (JSON is fine: model holds only plain data).
    var copy = JSON.parse(JSON.stringify(model));
    copy._seed = String(seed);

    // The JSON clone above breaks the reference-sharing between copy.questions
    // (the flat list used for scoring) and copy.sections[].questions (what the
    // runner RENDERS). Re-link them to the SAME objects so a mutation is seen
    // by both the UI and the scorer.
    var byId = {};
    copy.questions.forEach(function (q) { byId[q.id] = q; });
    (copy.sections || []).forEach(function (s) {
      s.questions = (s.questions || []).map(function (sq) { return byId[sq.id] || sq; });
    });

    // Which section each question belongs to (to find "arrange" questions).
    var typeById = {};
    (copy.sections || []).forEach(function (s) { typeById[s.id] = s.type; });

    copy.questions.forEach(function (q) {
      // Arrangement questions ALWAYS get their displayed sentence order
      // scrambled (independent of option shuffling) so the answer is never
      // the identity a–b–c–d–e ordering.
      if (typeById[q.sectionId] === "arrange") {
        scrambleArrangeQuestion(q, makeRng((seed == null ? "" : seed) + "|arr|" + (q.id || q.displayNo)));
      }
      if (!doOptionShuffle) return;

      var present = LETTERS.filter(function (L) {
        return q.options[L] !== undefined && q.options[L] !== "";
      });
      if (present.length < 2) return;

      // Detect duplicate option texts -> do not shuffle into ambiguity, but we
      // still shuffle; identical texts remain identical (no NEW duplicate made).
      var origCorrectIdx = present.indexOf(q.correct);
      var order = shuffleAvoidingFixed(
        present.map(function (_, i) { return i; }), rng, origCorrectIdx
      );

      var newOptions = {};
      var origin = {};
      var newCorrect = null;
      order.forEach(function (origPos, newPos) {
        var newL = LETTERS[newPos];
        var origL = present[origPos];
        newOptions[newL] = q.options[origL];
        origin[newL] = origL;
        if (origL === q.correct) newCorrect = newL;
      });
      // Blank any letters beyond the present count.
      LETTERS.forEach(function (L) { if (newOptions[L] === undefined) newOptions[L] = ""; });

      q.correctOriginal = q.correct;   // stable identity for analytics
      q.optionOrigin = origin;         // display letter -> original letter
      q.options = newOptions;
      q.correct = newCorrect || q.correct;
    });

    return copy;
  }

  /* =======================================================================
   * B. LESSON OPTION-OBJECT MODEL  (mini-practice MCQ)
   * options: [{ id, text, correct:true|false }]  (ids are the STABLE identity)
   * Returns a NEW array in display order. Correctness travels with each object,
   * so the caller scores by comparing chosen.id to the option whose correct===true.
   * ======================================================================= */
  function shuffleOptionObjects(opts, seed) {
    var rng = makeRng(seed == null ? Date.now() : seed);
    var arr = opts.map(function (o, i) { return { o: o, i: i }; });
    var correctIdx = arr.findIndex(function (x) { return x.o.correct; });
    var order = shuffleAvoidingFixed(arr.map(function (_, i) { return i; }), rng, correctIdx);
    return order.map(function (idx) { return arr[idx].o; });
  }

  /* =======================================================================
   * C. ARRANGEMENT ITEMS  (interactive reorder in mini-practice)
   * items: [{ id, text }] given IN CORRECT ORDER.
   * Returns { display:[items shuffled], correctSequence:[ids in right order] }.
   * The correct sequence is the ids in their ORIGINAL order — display order is
   * independent and never used for scoring.
   * ======================================================================= */
  function shuffleArrangement(items, seed) {
    var rng = makeRng(seed == null ? Date.now() : seed);
    var correctSequence = items.map(function (it) { return it.id; });
    var idxs = shuffleAvoidingFixed(items.map(function (_, i) { return i; }), rng, null);
    // Guard: if only 1 item, nothing to do.
    var display = idxs.map(function (i) { return items[i]; });
    return { display: display, correctSequence: correctSequence };
  }

  /* ---- Ambiguity check (optional authoring aid) ------------------------ */
  // Returns true if two DISTINCT options share identical (trimmed) text, which
  // would make a shuffled MCQ ambiguous. Importer can surface this as a warning.
  function hasDuplicateOptions(textsArray) {
    var seen = {};
    for (var i = 0; i < textsArray.length; i++) {
      var t = String(textsArray[i] == null ? "" : textsArray[i]).trim().toLowerCase();
      if (t === "") continue;
      if (seen[t]) return true;
      seen[t] = true;
    }
    return false;
  }

  root.LessonRandom = {
    makeRng: makeRng,
    hashString: hashString,
    shuffle: function (arr, seed) { return shuffleInPlace(arr.slice(), makeRng(seed == null ? Date.now() : seed)); },
    permuteExamModel: permuteExamModel,
    shuffleOptionObjects: shuffleOptionObjects,
    shuffleArrangement: shuffleArrangement,
    hasDuplicateOptions: hasDuplicateOptions,
    LETTERS: LETTERS
  };

})(typeof window !== "undefined" ? window : this);
