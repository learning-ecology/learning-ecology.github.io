/* ============================================================================
 * scoring.js  —  Chinese Test Generator
 * ----------------------------------------------------------------------------
 * Scores a set of student answers against a generated test. Pure functions,
 * no DOM. All correctness decisions compare stable ids, never positions.
 *
 * answers (keyed by item / sub-question id):
 *   pinyin_choice / mcq        answers[itemId]  = optionId
 *   reading (per sub-question)  answers[subId]   = optionId
 *   sentence_arrange            answers[itemId]  = [chunkId, ...]  (student order)
 *   meaning_match               answers[itemId]  = { pairId: rightId, ... }
 *
 * Public API (window.CTG.scoring):
 *   score(test, answers) -> result   (see shape below)
 * ==========================================================================*/
(function (global) {
  'use strict';
  var CTG = global.CTG = global.CTG || {};
  var S = CTG.schema;
  var TYPE = S.TYPE;

  function score(test, answers) {
    answers = answers || {};
    var result = {
      testId: test.testId,
      title: test.title,
      scoredAt: new Date().toISOString(),
      maxPoints: 0,
      earnedPoints: 0,
      percent: 0,
      sections: []
    };

    test.sections.forEach(function (sec) {
      var secRes = { id: sec.id, type: sec.type, label: sec.label, maxPoints: 0, earnedPoints: 0, items: [] };
      sec.items.forEach(function (item) {
        var ir = scoreItem(item, answers);
        secRes.items.push(ir);
        secRes.maxPoints += ir.maxPoints;
        secRes.earnedPoints += ir.earnedPoints;
      });
      result.sections.push(secRes);
      result.maxPoints += secRes.maxPoints;
      result.earnedPoints += secRes.earnedPoints;
    });

    result.percent = result.maxPoints ? Math.round((result.earnedPoints / result.maxPoints) * 100) : 0;
    return result;
  }

  function scoreItem(item, answers) {
    switch (item.type) {
      case TYPE.PINYIN:
      case TYPE.MCQ:
        return scoreChoice(item, answers[item.id]);
      case TYPE.MATCH:
        return scoreMatch(item, answers[item.id]);
      case TYPE.ARRANGE:
        return scoreArrange(item, answers[item.id]);
      case TYPE.READING:
        return scoreReading(item, answers);
    }
    return { id: item.id, type: item.type, maxPoints: 0, earnedPoints: 0, correct: false, answered: false };
  }

  function scoreChoice(item, selectedId) {
    var answered = !!selectedId;
    var correct = answered && selectedId === item.answerId;
    return {
      id: item.id, type: item.type, maxPoints: 1, earnedPoints: correct ? 1 : 0,
      answered: answered, correct: correct,
      selectedId: selectedId || null, correctId: item.answerId,
      explanation: item.explanation || ''
    };
  }

  function scoreMatch(item, mapping) {
    mapping = mapping || {};
    var pairResults = item.left.map(function (l) {
      var selected = mapping[l.pairId] || null;
      var isCorrect = selected === l.pairId; // right item id equals its pair id
      return {
        pairId: l.pairId, chinese: l.chinese, pinyin: l.pinyin,
        selectedRightId: selected, correct: isCorrect,
        correctMeaning: meaningFor(item, l.pairId),
        selectedMeaning: selected ? meaningFor(item, selected) : null
      };
    });
    var earned = pairResults.filter(function (p) { return p.correct; }).length;
    var answered = pairResults.some(function (p) { return p.selectedRightId; });
    return {
      id: item.id, type: TYPE.MATCH, maxPoints: item.left.length, earnedPoints: earned,
      answered: answered, correct: earned === item.left.length,
      pairResults: pairResults, explanation: item.explanation || ''
    };
  }
  function meaningFor(item, pairId) {
    var r = item.right.filter(function (x) { return x.id === pairId; })[0];
    return r ? r.meaning : null;
  }

  function scoreArrange(item, order) {
    order = Array.isArray(order) ? order : [];
    var answered = order.length > 0;
    var correct = answered && order.length === item.correctOrder.length &&
      order.every(function (id, i) { return id === item.correctOrder[i]; });
    return {
      id: item.id, type: TYPE.ARRANGE, maxPoints: 1, earnedPoints: correct ? 1 : 0,
      answered: answered, correct: correct,
      studentOrder: order.slice(), correctOrder: item.correctOrder.slice(),
      chunks: item.chunks, meaning: item.meaning || '', explanation: item.explanation || ''
    };
  }

  function scoreReading(item, answers) {
    var qResults = item.questions.map(function (sq) {
      var r = scoreChoice(sq, answers[sq.id]);
      r.prompt = sq.prompt; r.promptPinyin = sq.promptPinyin || '';
      return r;
    });
    var earned = qResults.reduce(function (s, r) { return s + r.earnedPoints; }, 0);
    return {
      id: item.id, type: TYPE.READING, maxPoints: item.questions.length, earnedPoints: earned,
      answered: qResults.some(function (r) { return r.answered; }),
      correct: earned === item.questions.length,
      title: item.title || '', questions: qResults
    };
  }

  CTG.scoring = { score: score };
})(typeof window !== 'undefined' ? window : this);
