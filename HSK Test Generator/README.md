# Chinese Test Generator

A self-contained, browser-based platform for building randomised Chinese tests from an Excel question bank. Teachers import questions from a spreadsheet, configure a test, and generate a version that students take in a clean, responsive interface. It is deliberately built as a **standalone module with no backend and no framework** (plain HTML, CSS and JavaScript), and its data model is designed so it can later drop into a Learning Management System without rework.

## What it does

A teacher opens `index.html`, imports an `.xlsx` question bank, chooses which lessons, sections and how many questions to include, and clicks **Generate**. The result can be exported two ways: a single self-contained `.html` file a student just opens, or a `.json` test package used with the student player. Students answer five kinds of question, get an automatic score, and see a full review with the correct answers and explanations.

The five sections are: **A** choose the correct Pinyin, **B** meaning matching (Chinese ↔ Vietnamese), **C** contextual multiple choice, **D** sentence arrangement (drag or tap chunks into order), and **E** reading comprehension (a passage with several questions).

## Quick start

1. Open `index.html` in a browser (double-click it, or host the folder).
2. Click **⬇ Excel template**, open it, and read the **Instructions** sheet. The template already contains sample questions for all five sections.
3. Back in the app, drag the `.xlsx` onto the import box.
4. Pick lessons, sections and counts, then **Generate test**.
5. **Download standalone test (one .html file)** and give it to students, or **Download test file (.json)** to use with `student.html` / your LMS.

To try it immediately without importing anything, open **`dist/demo-test.html`** — it is a ready-made test.

## Project layout

```
index.html            Teacher / admin app (import, configure, generate, export)
student.html          Student player (loads a .json test, or an embedded test)
css/
  common.css          Shared design tokens, Pinyin rendering, buttons, forms
  teacher.css         Teacher-only styles
  student.css         Student-player styles
js/
  vendor/
    xlsx.full.min.js  SheetJS (Excel parsing) — bundled, offline
  core/               The engine — no DOM, reusable, LMS-ready
    schema.js         Data model, IDs, randomisation utilities (source of truth)
    excel-import.js   Parse + validate the .xlsx into the bank model
    question-bank.js  Read-only filtering/counting over a bank
    test-generator.js Randomised test assembly with stable-ID answer mapping
    scoring.js        Score answers against a generated test
    pinyin.js         Render Chinese with an optional Pinyin line
    storage.js        Defensive localStorage (per-browser convenience only)
    lms-adapter.js    The ONLY integration point with a host / LMS
  generated/
    player-template.js  Auto-built: the player as a string, for standalone export
  teacher-app.js      Teacher UI glue
  student-app.js      Student UI glue
templates/
  chinese-test-template.xlsx   The reusable question-bank template (with samples)
tools/
  build_template.py   Rebuilds the Excel template
  build.js            Bundles the player + regenerates the sample/demo
  selftest.js         Headless engine test (import → generate → score)
sample/sample-test.json    A generated test package (example)
dist/
  player.html         Self-contained student player (single file)
  demo-test.html      The sample test embedded in the player (double-click to try)
docs/TEACHER_GUIDE.md How to fill in the Excel and run a test
```

## Architecture & why it's built this way

The code is split into a **DOM-free engine** (`js/core/*`) and two thin UIs (`teacher-app.js`, `student-app.js`). The engine has no idea a browser exists — it is imported and tested headlessly in `tools/selftest.js` — so the same logic can be reused elsewhere (including inside an LMS build).

**Stable IDs everywhere.** Lessons, questions, options, matching pairs, sentence chunks, passages, tests and attempts all carry stable ids. Correct answers are stored **by id, never by position**:

- multiple-choice / Pinyin: the correct `answerId` (an option id);
- matching: a left item's `pairId` is correct against the right item with the same id;
- sentence arrangement: `correctOrder`, an array of chunk ids.

Because of this, shuffling only reorders arrays — it can never change which answer is correct. The generator also **balances** where the correct option appears so answers aren't predictably "A" or "B".

**Separation of concerns.** Question bank (data) ≠ Excel import ≠ generation ≠ the student interface ≠ scoring. Each is its own file with a small public API on the `window.CTG` namespace. No student accounts, classes, courses or auth are hard-coded anywhere.

## Designed for later LMS integration

Everything an LMS needs to own is kept out of the module and funnelled through **`js/core/lms-adapter.js`**:

**Context in** — the host can pass identifiers three ways (all optional):

- `window.CTG_CONTEXT = { studentId, studentName, class, course, lessonId, assignedTestId, attemptId }`
- URL query params: `student.html?test=…&studentId=S1&attemptId=A1`
- `postMessage({ type: 'ctg:context', context })` from a parent window / iframe host.

**Results out** — on submit, the player emits a single stable `attempt` record every common way at once:

- `window.CTG_ON_RESULT(attempt)` callback, if you define one;
- a `ctg:result` DOM `CustomEvent` (`event.detail` is the attempt);
- `postMessage({ type: 'ctg:result', attempt }, '*')` to the embedding host.

The `attempt` object carries the LMS ids, the test id/seed, timing, the score, and full per-section detail for analytics — enough to support assignment, attempt history, progress tracking and reporting later. To embed the module, host the folder and load `student.html` in an iframe with the context params; capture `ctg:result`. Nothing else in the module needs to change.

## Rebuilding

No build step is required to use the app — the bundled artifacts are committed. If you change the player or the template:

```
node tools/build.js        # rebundle player + regenerate sample/demo
python3 tools/build_template.py   # rebuild the Excel template
node tools/selftest.js     # verify the engine (import → generate → score)
```

## Notes & limits

- Because there is no server, a generated test carries its own answer key so it can be scored in the browser. That is appropriate for a standalone classroom module; secure, server-side scoring is a natural thing for the LMS to take over later using the same `attempt` data.
- Pinyin must be typed (with tone marks) in the Excel. The teacher chooses at generation time which content shows Pinyin and whether students may toggle it; when toggling is disabled and Pinyin is off, it is never placed in the page at all.
- Chinese characters and tone-marked Pinyin are preserved throughout (UTF-8).
