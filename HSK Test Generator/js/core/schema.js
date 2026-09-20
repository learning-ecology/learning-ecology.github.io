/* ============================================================================
 * schema.js  —  Chinese Test Generator
 * ----------------------------------------------------------------------------
 * The single source of truth for the data model. Everything else (import,
 * generation, scoring, UI, LMS integration) depends only on the shapes and
 * constants defined here.
 *
 * Design notes for future LMS integration:
 *   - Every entity (lesson, question, option, pair, chunk, section, test,
 *     attempt) carries a STABLE id. Correct-answer relationships are stored by
 *     id, never by display position, so randomising order never changes the
 *     truth about which answer is correct.
 *   - Nothing here knows about students, classes, courses or auth. The LMS
 *     supplies that context at runtime via js/core/lms-adapter.js.
 *
 * Loaded as a classic <script> (works over file:// with no build step). It
 * attaches everything to the global namespace object `window.CTG`.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var CTG = global.CTG = global.CTG || {};

  /* Bump when the persisted data shape changes in a breaking way. */
  var SCHEMA_VERSION = 1;

  /* -- Section / question types -------------------------------------------- */
  var TYPE = {
    PINYIN:  'pinyin_choice',    // A. Choose the correct Pinyin
    MATCH:   'meaning_match',    // B. Meaning matching
    MCQ:     'mcq',              // C. Multiple choice (word / dialogue)
    ARRANGE: 'sentence_arrange', // D. Sentence arrangement
    READING: 'reading'           // E. Reading comprehension
  };

  /* Ordered metadata for every section type. `sheet` is the Excel sheet name
   * that feeds it (reading uses two sheets). `order` fixes section order in a
   * generated test. */
  var SECTIONS = [
    { type: TYPE.PINYIN,  order: 1, label: 'Choose the Correct Pinyin',  sheet: 'Pinyin' },
    { type: TYPE.MATCH,   order: 2, label: 'Meaning Matching',           sheet: 'Matching' },
    { type: TYPE.MCQ,     order: 3, label: 'Multiple Choice',            sheet: 'MultipleChoice' },
    { type: TYPE.ARRANGE, order: 4, label: 'Sentence Arrangement',       sheet: 'SentenceArrange' },
    { type: TYPE.READING, order: 5, label: 'Reading Comprehension',      sheet: 'ReadingPassages / ReadingQuestions' }
  ];

  var SECTION_BY_TYPE = {};
  SECTIONS.forEach(function (s) { SECTION_BY_TYPE[s.type] = s; });

  function sectionLabel(type) {
    return (SECTION_BY_TYPE[type] && SECTION_BY_TYPE[type].label) || type;
  }
  function sectionOrder(type) {
    return (SECTION_BY_TYPE[type] && SECTION_BY_TYPE[type].order) || 99;
  }

  /* -- Pinyin scope categories --------------------------------------------- *
   * The teacher decides which kinds of Chinese text expose Pinyin. Data must
   * exist in the Excel for a scope to have any effect. */
  var PINYIN_SCOPE = {
    PASSAGES:  'passages',   // reading passages
    QUESTIONS: 'questions',  // question prompts / stems
    SENTENCES: 'sentences',  // sentence-arrangement chunks + matching terms
    OPTIONS:   'options'     // answer options
  };
  var PINYIN_SCOPE_LABEL = {
    passages:  'Reading passages',
    questions: 'Question prompts',
    sentences: 'Sentences & matching terms',
    options:   'Answer options'
  };

  /* -- ID generation ------------------------------------------------------- *
   * Prefer teacher-supplied ids from the Excel. When absent we mint one that
   * is stable within an import and unique across the bank. */
  var _counters = {};
  function uid(prefix) {
    prefix = prefix || 'id';
    // Prefer crypto for globally-unique ids (tests, attempts).
    try {
      if (global.crypto && global.crypto.randomUUID) {
        return prefix + '_' + global.crypto.randomUUID().slice(0, 8);
      }
    } catch (e) { /* fall through */ }
    _counters[prefix] = (_counters[prefix] || 0) + 1;
    return prefix + '_' + Date.now().toString(36) + '_' +
           _counters[prefix].toString(36) +
           Math.random().toString(36).slice(2, 6);
  }

  /* A deterministic child id (option/pair/chunk/sub-question ids that hang off
   * a parent question). Keeps ids readable and stable given the same input. */
  function childId(parentId, tag, index) {
    return String(parentId) + '-' + tag + (index != null ? index : '');
  }

  /* -- Randomisation utilities --------------------------------------------- *
   * A small seedable PRNG (mulberry32) so a test can be reproduced from its
   * seed if the LMS ever needs deterministic regeneration. Falls back to
   * Math.random when no seed is given. */
  function makeRng(seed) {
    if (seed == null) {
      return { next: function () { return Math.random(); }, seed: null };
    }
    var a = (typeof seed === 'number') ? seed : hashString(String(seed));
    return {
      seed: a,
      next: function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        var t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      }
    };
  }
  function hashString(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /* Fisher–Yates, non-mutating. Accepts an optional rng ({next:fn}). */
  function shuffle(arr, rng) {
    var a = arr.slice();
    var rand = rng ? function () { return rng.next(); } : Math.random;
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* Pick n distinct items at random (or all, if n >= length / n falsy). */
  function sample(arr, n, rng) {
    var s = shuffle(arr, rng);
    if (!n || n >= s.length) return s;
    return s.slice(0, n);
  }

  /* -- Type guards / helpers ----------------------------------------------- */
  function isBlank(v) {
    return v === null || v === undefined || String(v).trim() === '';
  }
  function str(v) {
    return v == null ? '' : String(v).trim();
  }

  /* Split a chunk string ("我 / 每天 / 七点 / 起床") into trimmed chunks.
   * Accepts / | ／ ｜ as separators. */
  function splitChunks(raw) {
    return str(raw)
      .split(/\s*[\/|／｜]\s*/)
      .map(function (c) { return c.trim(); })
      .filter(function (c) { return c.length > 0; });
  }

  CTG.schema = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    TYPE: TYPE,
    SECTIONS: SECTIONS,
    SECTION_BY_TYPE: SECTION_BY_TYPE,
    PINYIN_SCOPE: PINYIN_SCOPE,
    PINYIN_SCOPE_LABEL: PINYIN_SCOPE_LABEL,
    sectionLabel: sectionLabel,
    sectionOrder: sectionOrder,
    uid: uid,
    childId: childId,
    makeRng: makeRng,
    hashString: hashString,
    shuffle: shuffle,
    sample: sample,
    isBlank: isBlank,
    str: str,
    splitChunks: splitChunks
  };
})(typeof window !== 'undefined' ? window : this);
