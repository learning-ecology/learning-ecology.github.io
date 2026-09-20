/* Headless end-to-end test of the core engine (no DOM).
   Run: node tools/selftest.js */
const fs = require('fs');
const path = require('path');

// Provide a browser-like global so the IIFE modules attach to a shared object.
global.window = global;
global.XLSX = require(path.join(__dirname, '..', 'js', 'vendor', 'xlsx.full.min.js'));

const CORE = ['schema', 'excel-import', 'question-bank', 'test-generator', 'scoring', 'pinyin', 'storage', 'lms-adapter'];
CORE.forEach(f => require(path.join(__dirname, '..', 'js', 'core', f + '.js')));
const CTG = global.CTG;

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures++; console.log('  ✗ ' + msg); } else { console.log('  ✓ ' + msg); }
}

// ---- 1. Import ------------------------------------------------------------
console.log('\n[1] Import & validate template');
const buf = fs.readFileSync(path.join(__dirname, '..', 'templates', 'chinese-test-template.xlsx'));
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const { bank, report } = CTG.excel.parseWorkbook(ab);
assert(report.ok, 'no validation errors (' + report.errors.length + ' errors, ' + report.warnings.length + ' warnings)');
if (report.errors.length) console.log(JSON.stringify(report.errors, null, 2));
assert(bank.lessons.length === 4, 'parsed 4 lessons');
const byType = CTG.bank.byType(bank.questions);
assert((byType['pinyin_choice'] || []).length === 5, 'parsed 5 pinyin questions');
assert((byType['meaning_match'] || []).length === 2, 'parsed 2 matching sets');
assert((byType['mcq'] || []).length === 4, 'parsed 4 mcq');
assert((byType['sentence_arrange'] || []).length === 3, 'parsed 3 arrange');
assert((byType['reading'] || []).length === 1, 'parsed 1 reading passage');
assert(byType['reading'][0].questions.length === 3, 'reading passage has 3 sub-questions');

// ---- 2. Generate ----------------------------------------------------------
console.log('\n[2] Generate a randomised test');
const settings = CTG.generator.defaultSettings();
settings.title = 'Self Test';
settings.counts = { pinyin_choice: 5, meaning_match: 2, mcq: 4, sentence_arrange: 3, reading: 1 };
const gen = CTG.generator.generate(bank, settings);
const test = gen.test;
assert(test.sections.length === 5, 'generated 5 sections');
assert(test.maxPoints > 0, 'test has a max score of ' + test.maxPoints + ' points');

// every choice item still contains its correct option after balancing
let integrityOK = true;
test.sections.forEach(sec => sec.items.forEach(it => {
  if (it.type === 'pinyin_choice' || it.type === 'mcq') {
    if (!it.options.some(o => o.id === it.answerId)) integrityOK = false;
  }
  if (it.type === 'reading') it.questions.forEach(q => {
    if (!q.options.some(o => o.id === q.answerId)) integrityOK = false;
  });
}));
assert(integrityOK, 'every choice item still contains its correct option after shuffling');

// answer-position spread check (correct answers not all in the same slot)
const pinyinSec = test.sections.find(s => s.type === 'pinyin_choice');
const positions = pinyinSec.items.map(it => it.options.findIndex(o => o.id === it.answerId));
const distinctPos = new Set(positions).size;
assert(distinctPos > 1, 'pinyin correct-answer positions are spread across slots: [' + positions.join(',') + ']');

// arrange chunks shuffled away from correct order (at least one item)
const arrSec = test.sections.find(s => s.type === 'sentence_arrange');
const anyShuffled = arrSec.items.some(it => !it.chunks.every((c, i) => c.id === it.correctOrder[i]));
assert(anyShuffled, 'at least one arrange item is presented out of correct order');

// ---- 3. Score a PERFECT attempt ------------------------------------------
console.log('\n[3] Score a perfect attempt');
const perfect = {};
test.sections.forEach(sec => sec.items.forEach(it => {
  if (it.type === 'pinyin_choice' || it.type === 'mcq') perfect[it.id] = it.answerId;
  else if (it.type === 'meaning_match') { perfect[it.id] = {}; it.left.forEach(l => { perfect[it.id][l.pairId] = l.pairId; }); }
  else if (it.type === 'sentence_arrange') perfect[it.id] = it.correctOrder.slice();
  else if (it.type === 'reading') it.questions.forEach(q => { perfect[q.id] = q.answerId; });
}));
const rPerfect = CTG.scoring.score(test, perfect);
assert(rPerfect.percent === 100, 'perfect attempt scores 100% (' + rPerfect.earnedPoints + '/' + rPerfect.maxPoints + ')');

// ---- 4. Score a MIXED attempt --------------------------------------------
console.log('\n[4] Score a partial attempt');
const mixed = JSON.parse(JSON.stringify(perfect));
// break one pinyin answer
const py0 = pinyinSec.items[0];
mixed[py0.id] = py0.options.find(o => o.id !== py0.answerId).id;
// break one matching pair
const matchSec = test.sections.find(s => s.type === 'meaning_match');
const m0 = matchSec.items[0];
const firstPair = m0.left[0].pairId;
const wrongRight = m0.right.find(r => r.id !== firstPair).id;
mixed[m0.id][firstPair] = wrongRight;
// reverse one arrange
const a0 = arrSec.items[0];
mixed[a0.id] = a0.correctOrder.slice().reverse();
const rMixed = CTG.scoring.score(test, mixed);
assert(rMixed.earnedPoints === rPerfect.earnedPoints - 3, 'partial attempt loses exactly 3 points (1 pinyin + 1 pair + 1 arrange)');
const pyRes = rMixed.sections.find(s => s.type === 'pinyin_choice').items[0];
assert(pyRes.correct === false && pyRes.selectedId !== pyRes.correctId, 'broken pinyin item marked incorrect with recorded selection');

// ---- 5. LMS attempt record ------------------------------------------------
console.log('\n[5] LMS attempt record');
global.CTG_CONTEXT = { studentId: 'S123', studentName: 'Nguyen A', class: '6A', course: 'HSK1' };
const ctx = CTG.lms.readContext();
const attempt = CTG.lms.buildAttempt(test, mixed, rMixed, ctx, { startedAt: new Date().toISOString() });
assert(attempt.studentId === 'S123' && attempt.attemptId && attempt.testId === test.testId, 'attempt carries LMS ids + score (' + attempt.percent + '%)');

console.log('\n' + (failures === 0 ? 'ALL PASSED ✓' : failures + ' CHECK(S) FAILED ✗'));
process.exit(failures === 0 ? 0 : 1);
