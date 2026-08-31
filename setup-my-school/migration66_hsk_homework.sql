-- ============================================================
--  migration66_hsk_homework.sql — assign HSK lessons as homework
--
--  One row = one HSK lesson assigned to a class (optionally only to some
--  students). Student progress/score lives in hsk_attempts (migration65),
--  linked by hsk_attempts.homework_id.
--
--  RLS: owner/admin/teacher manage; a student sees a homework row only if it
--  is for a class they are in AND (it targets the whole class OR names them).
--  Safe to run more than once.
-- ============================================================

create table if not exists public.hsk_homework (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid references public.organizations (id) on delete cascade,
  class_id       uuid references public.classes (id) on delete cascade,
  lesson_id      text not null,                     -- hsk_lessons.lesson_id
  title          text not null default '',
  student_ids    uuid[] not null default '{}',      -- empty = the whole class
  start_at       timestamptz,
  due_at         timestamptz,
  required_score int not null default 0,            -- 0 = none
  max_attempts   int not null default 0,            -- 0 = unlimited
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists hsk_homework_class_idx on public.hsk_homework (class_id);

alter table public.hsk_homework enable row level security;

-- staff read/write everything
drop policy if exists "hsk_hw staff" on public.hsk_homework;
create policy "hsk_hw staff" on public.hsk_homework
  for all to authenticated
  using      (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','admin','teacher')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','admin','teacher')));

-- a student reads homework assigned to them (their class, and named or whole-class)
drop policy if exists "hsk_hw student read" on public.hsk_homework;
create policy "hsk_hw student read" on public.hsk_homework
  for select to authenticated using (
    exists (select 1 from public.class_students cs
            where cs.class_id = hsk_homework.class_id and cs.student_id = auth.uid())
    and (cardinality(student_ids) = 0 or auth.uid() = any (student_ids))
  );
