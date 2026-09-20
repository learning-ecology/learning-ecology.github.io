# National English Test System

A reusable, offline-capable online test engine that reproduces the format of the
**Vietnamese National High School Graduation English Exam** (Bộ GD&ĐT, 2026).

**You never edit code to make a new test.** The workflow is:

> Fill in an Excel file → Import it → a complete online test is generated automatically.

The code is deliberately split into **data → engine → UI** so you can drop the
engine into your own learning-management system later.

---

## 1. Files

```
national-english-test-system/
├── index.html                 ← open this to run the standalone app
├── css/styles.css             ← all styling (re-skin via the tokens at the top)
├── js/
│   ├── test-engine.js         ← PURE logic: parse Excel · validate · build model · score
│   ├── test-store.js          ← persistence + result collection (the ONE file to swap for your backend)
│   ├── test-runner.js         ← student test interface (render · navigate · time · submit · review)
│   └── test-app.js            ← teacher shell: library, upload, management, results dashboard
├── vendor/xlsx.full.min.js    ← SheetJS (bundled locally → works with no internet)
└── assets/test-template.xlsx  ← the reusable Excel template with worked examples
```

**To run:** open `index.html` in any modern browser (Chrome, Edge, Firefox, Safari).
Everything runs locally; no server and no internet are required.

---

## 2. The Excel template (how you create tests)

The workbook has **three sheets**. Open `assets/test-template.xlsx` to see filled-in
examples of every question type.

### Sheet `Info` — one setting per row (Key / Value)

| Key | Meaning |
|-----|---------|
| `title` | Test name |
| `exam_code` | Mã đề (shown to candidates) |
| `header_line1` / `header_line2` | Exam header lines |
| `duration_minutes` | Countdown length (e.g. `50`) |
| `default_mode` | `exam` or `practice` |
| `allow_review` | `yes` (default) = students get the detailed review after submitting; `no` = score only |
| `pass_percent` | Blank = none, or e.g. `50` for a PASS/NOT-YET badge |
| `instructions` | Optional intro shown on the start screen |

### Sheet `Groups` — one row per passage / cloze text / arrangement section

| Column | Meaning |
|--------|---------|
| `group_id` | A short id you invent, e.g. `G1`, `G2` (links to Questions) |
| `type` | `arrange`, `reading`, or `cloze` |
| `order` | Display order of the section (1, 2, 3 …) |
| `instructions` | The rubric ("Read the passage and mark …") |
| `body` | The shared text — see per-type notes below |

### Sheet `Questions` — one row per question

| Column | Meaning |
|--------|---------|
| `group_id` | Which Groups row this question belongs to |
| `question_no` | The displayed number (e.g. `24`). Leave blank to auto-number. |
| `stem` | The question text |
| `option_a` … `option_d` | The four choices |
| `correct` | `A`, `B`, `C`, or `D` |
| `explanation` | Optional — shown only in Practice mode |

### The three question types

**`reading`** — put the passage in the group's `body`. Add as many Questions rows as
you need, all sharing that `group_id`. For **sentence-insertion** questions, mark the
positions in the passage with `[I]`, `[II]`, `[III]`, `[IV]` and make the options
`[I]`…`[IV]` — the passage displays those markers as-is.

**`cloze`** — put the text in `body` with a blank marker for each gap. Use
`{{7}}` (recommended) **or** the exam style `(7)_____`, where the number matches the
question's `question_no`. Each blank needs one matching Questions row. The number of
blanks must equal the number of questions in that group (the importer checks this).

**`arrange`** — leave the group `body` empty. Put the jumbled items (`a.` … `e.`, and
any fixed frame like `Dear Dr Cheetah,` / `Yours sincerely,`) in each question's
`stem` (use Alt+Enter for line breaks). The options are the orderings, e.g.
`b – d – e – a – c`.

> **Tip — column names are flexible.** `answer` works for `correct`, `passage` for
> `body`, `A`/`B`/`C`/`D` for the options, etc. Sheet and column names are
> case-insensitive.

### Bold / italic formatting (for words that questions refer to)

Passages, stems, options and explanations can contain **bold** (and italic /
underline). There are two ways to author it — use whichever is easier:

1. **Bold it directly in Excel.** Select the word(s) in the cell and press Ctrl/Cmd+B.
   The system reads the native rich text and shows it bold in the test.
2. **Type lightweight markup:** `<b>word</b>` for bold, `<i>…</i>` for italic,
   `<u>…</u>` for underline, or `**word**` for bold. Example:
   *"The word `<b>fictitious</b>` in paragraph 2 mostly means ______."*

Both survive Excel → import → storage → rendering, and both display in the test **and**
in the detailed review (so a passage's bold keywords stay bold when students go back to
compare). Any other HTML a teacher types is safely escaped and shown as plain text —
students never see raw tags, and nothing can inject live code. (The template's reading
passage bolds *"undoing"* natively, and question 4 uses `<b>undoing</b>` markup, so you
can see both approaches side by side.)

---

## 3. Import & validation

Click **Import test (Excel)**, drop the file, and the system reads it and shows a
report. If anything is wrong it lists **exactly which sheet and row** to fix — e.g.
*"Questions · row 12: correct answer must be A, B, C or D"* or *"Groups · row 4: Cloze
group 'G3' has 3 blanks in the text but 4 questions."* Nothing is saved until the file
is clean. Warnings (non-blocking) are shown separately.

---

## 4. Test management (teacher)

From the library each test card offers: **Take · Preview · Results · Edit · Activate/
Deactivate · Duplicate · Delete**. *Preview* runs the test in practice mode without
recording a result. *Edit* changes title, code, header, duration, mode and pass mark
without re-importing.

## 5. Taking the test

The student interface includes: exam header + candidate info, per-section instructions,
a two-column passage/questions layout (the passage stays pinned beside its questions),
a question-navigator grid with answered/current indicators, Previous/Next, a live
progress count, a countdown timer that auto-submits at zero, and a submit confirmation
dialog. Answers are never lost when moving between questions or sections.

- **Exam mode** hides answers *during* the test.
- **Practice mode** is identical to take, but signals a lower-stakes attempt.

## 6. Detailed results & answer review

After submitting, every student first sees a **summary**: score ring, percentage, and
four tiles — **Correct · Incorrect · Unanswered · Percentage** — plus a per-section-type
breakdown. This works automatically for every test; you never configure it.

Clicking **View detailed review** opens a full review page (available in both modes,
unless you set `allow_review = no`). It shows:

- Filter tabs: **All · Incorrect · Correct · Unanswered** (with live counts).
- Every question grouped under its **reading passage / cloze text**, with all bold
  formatting preserved, so students can re-read the passage beside its questions.
- For each question: the number, the stem, all options with the **correct answer in
  green** and the **student's wrong choice in red**, a clear **Correct / Incorrect /
  Unanswered** badge, a one-line **Your answer → Correct answer** comparison, and the
  **explanation** from the Excel file.
- Cloze blanks in the passage are tinted green / red / amber to match each answer.

The **Incorrect** filter is the fast path for a student to see exactly what they missed:
Question → their answer → correct answer → explanation, one card at a time.

## 7. Results collection

Every submission produces a structured **result payload** (see below). By default it is
stored in the browser, and the teacher's **Results** dashboard shows all attempts with
**CSV** and **JSON** export (the CSV has one column per question for item analysis).

---

## 8. Embedding in your own LMS

The system is modular. Two integration points cover almost every case.

### (a) Collect results on your server

Open `js/test-store.js` and replace the body of `saveAttempt` (and, if you want your
server to own the test library too, `listTests` / `saveTest` / etc.). Every method
already returns a Promise, so a `fetch` is a drop-in:

```js
saveAttempt: function (result) {
  return fetch("/api/attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result)
  }).then(function (r) { return r.json(); });
}
```

Nothing else in the app needs to change.

### (b) Run the test engine directly (skip the teacher shell)

If your LMS already lists tests and handles auth, use the engine + runner alone:

```html
<script src="vendor/xlsx.full.min.js"></script>
<script src="js/test-engine.js"></script>
<script src="js/test-runner.js"></script>
<script>
  // 1. Get a test model — either parse an uploaded workbook…
  const parsed = TestEngine.parseWorkbook(new Uint8Array(arrayBuffer));
  if (parsed.errors.length) { /* show parsed.errors */ }

  // …or build one from your OWN data source (no Excel needed):
  // const parsed = TestEngine.buildModel({ Info:[...], Groups:[...], Questions:[...] });

  // 2. Run it and receive the result.
  new TestRunner(document.getElementById("host"), parsed.test, {
    mode: "exam",
    candidate: { name: "Nguyen Van A", id: "01234567" }, // or null to show a start screen
    onSubmit: (result) => yourApi.saveAttempt(result),
    onExit: () => yourRouter.goToDashboard()
  });
</script>
```

`TestEngine` has no DOM dependencies, so you can also parse and **score on your server**
(with a SheetJS build available as the global `XLSX`).

### Result payload shape

```jsonc
{
  "testId": "...", "testTitle": "...", "examCode": "0001", "mode": "exam",
  "candidate": { "name": "Nguyen Van A", "id": "01234567" },
  "startedAt": "2026-…Z", "submittedAt": "2026-…Z", "durationUsedSec": 1832,
  "score": { "correct": 34, "total": 40, "percent": 85 },
  "passed": true,                       // null if no pass_percent set
  "autoSubmitted": false,
  "bySection": [ { "sectionId": "G1", "type": "arrange", "correct": 5, "total": 5 }, … ],
  "answers": [ { "questionNo": 1, "sectionId": "G1", "chosen": "A", "correct": "A", "isCorrect": true }, … ]
}
```

---

## 9. Notes & limits

- **Offline.** SheetJS is bundled locally. The Google Font is a nice-to-have and falls
  back to system fonts if there's no internet.
- **Browser storage.** The standalone app keeps tests and attempts in that browser's
  `localStorage` (per-device, per-browser). For central/shared storage, wire up
  `test-store.js` as in §8(a).
- **Question types** are exactly the three in the national exam (arrangement, reading,
  cloze). No other formats are assumed. Add new Excel rows to add questions — never the
  code.
- **Re-skin** by editing the CSS variables in the `:root` block of `css/styles.css`.
