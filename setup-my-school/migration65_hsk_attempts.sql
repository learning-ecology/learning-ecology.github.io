-- ============================================================
--  migration65_hsk_attempts.sql — student progress + results for HSK lessons
--
--  One row = one student's attempt at one interactive HSK lesson. Holds both
--  the RESUME state (current slide + every answer) and the RESULTS (per-section
--  scores, time). `homework_id` is NULL for free self-study; Phase C links it to
--  an assignment. The client keeps ONE open (status<>'completed') attempt per
--  (student, lesson, homework); "Try again" starts a new attempt_no.
--
--  RLS: a student reads/writes only their OWN attempts; owner/teacher can READ
--  all (for the progress-tracking dashboard). Safe to run more than once.
-- ============================================================

create table if not exists public.hsk_attempts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  lesson_id       text not null,                 -- hsk_lessons.lesson_id
  homework_id     uuid,                           -- null = self-study (Phase C fills it)
  attempt_no      int  not null default 1,
  status          text not null default 'in_progress'
                    check (status in ('not_started', 'in_progress', 'completed')),
  current_slide   int  not null default 0,
  answers         jsonb not null default '{}'::jsonb,   -- { exerciseId: state } for resume
  vocab_correct   int  not null default 0,
  vocab_total     int  not null default 0,
  grammar_correct int  not null default 0,
  grammar_total   int  not null default 0,
  score           int  not null default 0,        -- overall percentage 0..100
  time_spent_sec  int  not null default 0,
  started_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index if not exists hsk_attempts_user_lesson_idx
  on public.hsk_attempts (user_id, lesson_id, homework_id);
create index if not exists hsk_attempts_homework_idx
  on public.hsk_attempts (homework_id);

alter table public.hsk_attempts enable row level security;

-- student: full access to their own rows
drop policy if exists "hsk_attempts own" on public.hsk_attempts;
create policy "hsk_attempts own" on public.hsk_attempts
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- owner / admin / teacher: read every attempt (progress dashboard)
drop policy if exists "hsk_attempts staff read" on public.hsk_attempts;
create policy "hsk_attempts staff read" on public.hsk_attempts
  for select to authenticated
  using (exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.role in ('owner', 'admin', 'teacher')));
