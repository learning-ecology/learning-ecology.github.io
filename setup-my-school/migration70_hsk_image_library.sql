-- ============================================================
--  migration70_hsk_image_library.sql — reusable approved-image library
--
--  When the owner approves an illustration for a vocabulary word in HSK
--  Slides, it is saved here keyed by the Chinese word. The next time the
--  same word appears in ANY lesson, the approved image is reused instead of
--  searching again — so the system gets better the more you review.
--
--  RLS: only staff (owner/admin/teacher) read & write it (dashboard-only).
--  Safe to run more than once.
-- ============================================================

create table if not exists public.hsk_image_library (
  chinese     text primary key,
  vietnamese  text not null default '',
  concept     text not null default '',        -- visual concept / search idea
  url         text not null,
  source      text not null default 'approved',
  word_type   text not null default '',        -- concrete | action | state | social | abstract
  created_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table public.hsk_image_library enable row level security;

drop policy if exists "hsk img lib staff" on public.hsk_image_library;
create policy "hsk img lib staff" on public.hsk_image_library
  for all to authenticated
  using      (public.is_admin() or public.is_teacher())
  with check (public.is_admin() or public.is_teacher());
