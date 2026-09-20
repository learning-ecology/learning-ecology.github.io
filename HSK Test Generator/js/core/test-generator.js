/* ============================================================================
 * test-generator.js  —  Chinese Test Generator
 * ----------------------------------------------------------------------------
 * Turns a question bank + settings into a single, frozen, randomised test.
 * The generated test is fully self-describing: the student player and the
 * scorer need nothing else.
 *
 * KEY GUARANTEE: correct answers are stored by stable id
 *   - choice questions:      answerId  (an option id)
 *   - matching:              left item's pairId maps to the right item with the
 *                            same id
 *   - sentence arrangement:  correctOrder (array of chunk ids)
 * Shuffling only reorders arrays; it never touches these ids, so randomisation
 * can never change which answer is correct.
 *
 * Public API (window.CTG.generator):
 *   defaultSettings()                 -> settings object
 *   generate(bank, settings)          -> { test } | throws with .issues
 *
 * settings = {
 *   title, seed,
 *   lessonIds:   [ids]        // empty/absent = all lessons
 *   types:       {type:bool}  // which sections to include
 *   counts:      {type:int}   // how many items per section (reading/matching = groups)
 *   randomize:   bool         // shuffle question order, option order, chunks
 *   pinyinDefaultOn: bool
 *   allowPinyinToggle: bool
 *   pinyinScopes: {passages,questions,sentences,options}
 * }
 * ==========================================================================*/
(function (global) {
  'use strict';
  var CTG = global.CTG = global.CTG || {};
  var S = CTG.schema;
  var TYPE = S.TYPE;

  function defaultSettings() {
    var types = {}; var counts = {};
    S.SECTIONS.forEach(function (s) { types[s.type] = true; counts[s.type] = 5; });
    return {
      title: 'Chinese Test',
      seed: null,
      lessonIds: [],
      types: types,
      counts: counts,
      randomize: true,
      pinyinDefaultOn: false,
      allowPinyinToggle: true,
      pinyinScopes: { passages: true, questions: true, sentences: true, options: true }
    };
  }

  /* Balance which position the correct option sits in, across a set of
   * choice-items, so answers are not predictably A/B. Mutates each item's
   * `options` array; keeps answerId. */
  function balancePositions(items, rng) {
    // group by option count (pinyin=4, mcq may be 2-4)
    var groups = {};
    items.forEach(function (it) {
      var n = it.options.length;
      (groups[n] = groups[n] || []).push(it);
    });
    Object.keys(groups).forEach(function (n) {
      n = Number(n);
      var group = groups[n];
      // target positions: balanced round-robin then shuffled
      var targets = [];
      for (var i = 0; i < group.length; i++) targets.push(i % n);
      targets = S.shuffle(targets, rng);
      group.forEach(function (it, idx) {
        var correct = it.options.filter(function (o) { return o.id === it.answerId; })[0];
        var others = S.shuffle(it.options.filter(function (o) { return o.id !== it.answerId; }), rng);
        var target = targets[idx];
        var arranged = [];
        var oi = 0;
        for (var p = 0; p < n; p++) {
          if (p === target) arranged.push(correct);
          else arranged.push(others[oi++]);
        }
        it.options = arranged;
      });
    });
  }

  function pickPool(pool, count, rng) {
    if (!count || count >= pool.length) return S.shuffle(pool, rng);
    return S.sample(pool, count, rng);
  }

  function generate(bank, settings) {
    settings = Object.assign(defaultSettings(), settings || {});
    var rng = S.makeRng(settings.seed);
    var randomize = settings.randomize !== false;

    var lessonIds = settings.lessonIds && settings.lessonIds.length ? settings.lessonIds : null;
    var pool = CTG.bank.filter(bank, { lessonIds: lessonIds });
    var grouped = CTG.bank.byType(pool);

    var issues = [];
    var sections = [];

    S.SECTIONS.forEach(function (secMeta) {
      var type = secMeta.type;
      if (!settings.types[type]) return;
      var available = grouped[type] || [];
      if (available.length === 0) {
        issues.push('No "' + secMeta.label + '" questions available for the selected lessons — section skipped.');
        return;
      }
      var want = settings.counts[type] != null ? Number(settings.counts[type]) : available.length;
      if (want > available.length) {
        issues.push('Requested ' + want + ' "' + secMeta.label + '" but only ' + available.length + ' available; using ' + available.length + '.');
      }
      var chosen = pickPool(available, want, rng);

      var items;
      switch (type) {
        case TYPE.PINYIN:  items = buildChoice(chosen, randomize, rng, false); break;
        case TYPE.MCQ:     items = buildChoice(chosen, randomize, rng, true); break;
        case TYPE.MATCH:   items = buildMatching(chosen, randomize, rng); break;
        case TYPE.ARRANGE: items = buildArrange(chosen, randomize, rng); break;
        case TYPE.READING: items = buildReading(chosen, randomize, rng); break;
      }
      if (!items || !items.length) return;
      if (randomize) items = S.shuffle(items, rng);

      sections.push({
        id: S.uid('sec'),
        type: type,
        label: secMeta.label,
        order: secMeta.order,
        items: items
      });
    });

    sections.sort(function (a, b) { return a.order - b.order; });

    if (sections.length === 0) {
      var e = new Error('Nothing to generate. Select at least one section that has questions in the chosen lessons.');
      e.issues = issues;
      throw e;
    }

    var test = {
      schemaVersion: S.SCHEMA_VERSION,
      testId: S.uid('test'),
      title: settings.title || 'Chinese Test',
      createdAt: new Date().toISOString(),
      seed: rng.seed,
      settings: {
        randomize: randomize,
        pinyinDefaultOn: !!settings.pinyinDefaultOn,
        allowPinyinToggle: settings.allowPinyinToggle !== false,
        pinyinScopes: Object.assign({ passages: true, questions: true, sentences: true, options: true }, settings.pinyinScopes || {})
      },
      lessonIds: lessonIds || bank.lessons.map(function (l) { return l.id; }),
      sections: sections
    };
    computeMaxScore(test);
    return { test: test, issues: issues };
  }

  /* ---- section builders (return arrays of frozen items) ------------------ */

  function buildChoice(questions, randomize, rng, withPinyin) {
    var items = questions.map(function (q) {
      var options = q.options.map(function (o) {
        return withPinyin ? { id: o.id, text: o.text, pinyin: o.pinyin || '' }
                          : { id: o.id, text: o.text };
      });
      var item = {
        id: q.id, type: q.type, answerId: q.answerId,
        options: options, explanation: q.explanation || ''
      };
      if (q.type === TYPE.PINYIN) item.hanzi = q.hanzi;
      if (q.type === TYPE.MCQ) { item.prompt = q.prompt; item.promptPinyin = q.promptPinyin || ''; }
      return item;
    });
    if (randomize) balancePositions(items, rng);
    return items;
  }

  function buildMatching(questions, randomize, rng) {
    return questions.map(function (q) {
      var left = q.pairs.map(function (p) {
        return { pairId: p.id, chinese: p.chinese, pinyin: p.pinyin || '' };
      });
      var right = q.pairs.map(function (p) {
        return { id: p.id, meaning: p.meaning };
      });
      if (randomize) { left = S.shuffle(left, rng); right = S.shuffle(right, rng); }
      return {
        id: q.id, type: TYPE.MATCH,
        left: left, right: right,
        explanation: q.explanation || ''
      };
    });
  }

  function buildArrange(questions, randomize, rng) {
    return questions.map(function (q) {
      var chunks = q.chunks.map(function (c) { return { id: c.id, text: c.text, pinyin: c.pinyin || '' }; });
      var presented = chunks;
      if (randomize && chunks.length > 1) {
        // shuffle, but avoid returning the exact correct order
        for (var tries = 0; tries < 6; tries++) {
          presented = S.shuffle(chunks, rng);
          var same = presented.every(function (c, i) { return c.id === q.correctOrder[i]; });
          if (!same) break;
        }
      }
      return {
        id: q.id, type: TYPE.ARRANGE,
        chunks: presented,
        correctOrder: q.correctOrder.slice(),
        meaning: q.meaning || '',
        explanation: q.explanation || ''
      };
    });
  }

  function buildReading(questions, randomize, rng) {
    return questions.map(function (q) {
      var subs = q.questions.map(function (sq) {
        return {
          id: sq.id, prompt: sq.prompt, promptPinyin: sq.promptPinyin || '',
          answerId: sq.answerId,
          options: sq.options.map(function (o) { return { id: o.id, text: o.text, pinyin: o.pinyin || '' }; }),
          explanation: sq.explanation || ''
        };
      });
      if (randomize) { subs = S.shuffle(subs, rng); balancePositions(subs, rng); }
      return {
        id: q.id, type: TYPE.READING,
        title: q.title || '', passage: q.passage, passagePinyin: q.passagePinyin || '',
        questions: subs
      };
    });
  }

  /* ---- scoring metadata (max points per item / section / test) ---------- */
  function itemMaxPoints(item) {
    if (item.type === TYPE.MATCH) return item.left.length;
    if (item.type === TYPE.READING) return item.questions.length;
    return 1;
  }
  function computeMaxScore(test) {
    var total = 0;
    test.sections.forEach(function (sec) {
      var p = 0;
      sec.items.forEach(function (it) { p += itemMaxPoints(it); });
      sec.maxPoints = p;
      total += p;
    });
    test.maxPoints = total;
    return total;
  }

  CTG.generator = {
    defaultSettings: defaultSettings,
    generate: generate,
    itemMaxPoints: itemMaxPoints,
    computeMaxScore: computeMaxScore
  };
})(typeof window !== 'undefined' ? window : this);
