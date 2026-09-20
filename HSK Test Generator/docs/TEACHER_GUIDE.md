# Teacher Guide — Chinese Test Generator

This guide explains how to fill in the Excel question bank and turn it into a test. You never touch any code — you only edit a spreadsheet and click buttons.

## 1. Get the template

Open `index.html` and click **⬇ Excel template** (or open `templates/chinese-test-template.xlsx`). It already contains sample questions for every section and an **Instructions** sheet. Replace the samples with your own content and keep the column headers exactly as they are.

Two rules apply to every sheet:

- **Dark-red headers are required; light-red headers are optional.** Leave optional cells blank if you don't need them.
- **Give every question a unique ID** (QuestionID / SetID / PassageID). IDs are what keep the correct answer attached to a question even after the test is shuffled — and they let a future LMS follow a question over time. Never reuse an ID.

Type Pinyin **with tone marks** (`nǐ hǎo`, not `ni3 hao3`). Vietnamese is the meaning language (the `MeaningVI` column).

## 2. The sheets

**Lessons** — list your lessons once: `LessonID`, `LessonName`, `Order`. Every question points at one `LessonID`, and the teacher can later pick which lessons go into a test.

**Pinyin** (Section A — choose the correct Pinyin). Show a Chinese word; the student picks its Pinyin. Columns: `QuestionID`, `LessonID`, `Hanzi`, `CorrectPinyin`, `Distractor1–3`, `Explanation`. The three distractors are usually the same syllables with wrong tones.

**Matching** (Section B). **One pair per row.** Rows that share the same `SetID` become one matching activity (aim for 4–8 pairs). Columns: `SetID`, `LessonID`, `Chinese`, `Pinyin` (optional), `MeaningVI`, `Explanation`. Both columns are shuffled independently for each student.

**MultipleChoice** (Section C). A prompt with up to four options. The prompt can be a sentence with a gap (`我 ______ 学生。`) or the first line of a dialogue (put line A, a line break, then `B: ______`). Columns: `QuestionID`, `LessonID`, `Prompt`, `PromptPinyin` (optional), `OptionA…D` with optional `Option_Pinyin`, `Correct`, `Explanation`. **`Correct` takes the letter of the right option (A/B/C/D)** — that is the safest — or the exact option text. You may leave OptionC/OptionD blank for a two- or three-option question.

**SentenceArrange** (Section D). Write the sentence **in the correct order**, splitting it into meaningful chunks with a forward slash: `我 / 每天 / 七点 / 起床`. The app shuffles the chunks for the student. Optional `ChunkPinyin` must use the **same number of chunks in the same order** (`wǒ / měitiān / qī diǎn / qǐchuáng`). `Meaning` (Vietnamese) is shown as a hint.

**ReadingPassages** + **ReadingQuestions** (Section E). Put each passage once on **ReadingPassages** with a `PassageID`. On **ReadingQuestions**, every question points back at its `PassageID`; a passage may have many questions. A passage and its questions always stay grouped together. Reading questions use the same option/`Correct` layout as MultipleChoice.

Add an **Explanation** to any question — students see it on the results page.

## 3. Import and generate

1. In `index.html`, drag your `.xlsx` onto the import box. You'll get a green "imported successfully" message, or a clear list of any rows to fix (with the sheet and row number).
2. Choose the **lessons** to include, turn **sections** on/off and set how many questions each should have.
3. Set the options:
   - **Randomise** — shuffles question order, options, matching, and chunks.
   - **Show Pinyin by default** — whether Pinyin starts visible.
   - **Let students show/hide Pinyin** — whether students get the toggle. (If this is off and Pinyin is off, students cannot reveal it at all.)
   - **Pinyin is available on** — which content may show Pinyin: passages, question prompts, sentences & matching terms, answer options.
4. Click **⚡ Generate test**. A preview appears; each click makes a fresh random version.

## 4. Give the test to students

- **Download standalone test (one .html file)** — the easiest option. It's a single file that works offline; a student just opens it. Send it by email, chat, or your class platform.
- **Download test file (.json)** — the portable package. Give it to a student together with `student.html` (they open `student.html` and choose the file), or feed it to your LMS later.
- **Take it now (preview)** — opens the test yourself to check it.

## 5. Results

When a student submits, they see their score, a percentage, how many questions were fully correct, and a per-question review showing their answer, the correct answer, and any explanation. Sentence-arrangement questions show the student's sentence next to the correct one. Students can download their result as a `.json` file to send back to you.

## Tips

- Keep a master copy of your Excel bank. To update a test, edit the spreadsheet and re-import — you never edit any code.
- Want several versions of the "same" test? Just click **Regenerate**; randomisation and answer-position balancing give a different version each time while keeping every answer correctly mapped.
- If a cell won't import, the message names the sheet, the row and the reason — fix that cell and drag the file in again.
