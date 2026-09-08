-- ============================================================
--  migration71_vocab_homework.sql — assign HSK *Vocabulary Practice*
--  lessons as homework, REUSING the HSK Slides homework system.
--
--  Instead of a parallel set of tables, this extends the existing
--  hsk_homework / hsk_attempts tables with a `kind` discriminator:
--     kind = 'slides'  → an HSK Slides lesson  (hsk_lessons.lesson_id)
--     kind = 'vocab'   → a Vocabulary lesson   (vocab_lessons.lesson_id)
--  Both tables key the lesson by its text `lesson_id` slug, and
--  vocab_lessons.lesson_id is likewise a unique slug — so the same
--  assignment row, RLS, progress rows and dashboards work for both.
--
--  It also adds a widening SELECT policy on vocab_lessons (mirroring
--  migration67 for hsk_lessons) so a student can OPEN a vocabulary
--  lesson that is assigned to them even if it is unpublished or premium
--  and they are not otherwise enrolled — the assignment is the grant.
--
--  Needs migration66 (hsk_homework), migration65 (hsk_attempts),
--  migration68 (vocab_lessons) and migration39 (class_students).
--  Safe to run more than once.
-- ============================================================

-- 1) discriminator on the assignment table -------------------
alter table public.hsk_homework
  add column if not exists kind text not null default 'slides';

-- backfill any pre-existing rows explicitly, then constrain
update public.hsk_homework set kind = 'slides' where kind is null or kind = '';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'hsk_homework_kind_chk'
  ) then
    alter table public.hsk_homework
      add constraint hsk_homework_kind_chk check (kind in ('slides', 'vocab'));
  end if;
end $$;

-- 2) discriminator on the progress/results table -------------
alter table public.hsk_attempts
  add column if not exists kind text not null default 'slides';

update public.hsk_attempts set kind = 'slides' where kind is null or kind = '';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'hsk_attempts_kind_chk'
  ) then
    alter table public.hsk_attempts
      add constraint hsk_attempts_kind_chk check (kind in ('slides', 'vocab'));
  end if;
end $$;

-- 3) let an assigned student OPEN the vocabulary lesson -------
--    (policies are OR-ed, so this only widens access; the normal
--     "vocab lessons student" policy from migration68 still applies)
drop policy if exists "vocab lessons via homework" on public.vocab_lessons;
create policy "vocab lessons via homework" on public.vocab_lessons
  for select to authenticated using (
    exists (
      select 1
        from public.hsk_homework h
        join public.class_students cs on cs.class_id = h.class_id
       where h.kind = 'vocab'
         and h.lesson_id = vocab_lessons.lesson_id
         and cs.student_id = auth.uid()
         and (cardinality(h.student_ids) = 0 or auth.uid() = any (h.student_ids))
    )
  );
