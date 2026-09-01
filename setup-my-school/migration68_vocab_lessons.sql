-- ============================================================
--  migration68_vocab_lessons.sql — HSK Vocabulary Practice lessons
--
--  Mirrors hsk_lessons (migration55) so the two systems feel identical:
--  one row = one interactive vocabulary-practice lesson. `data` holds the
--  whole lesson as JSON exactly like the standalone tool used to keep in
--  localStorage: { vocab:[], gapfill:[], arrange:[] }. Management happens in
--  the Owner Dashboard; the player page reads published rows.
--
--  Access is the SAME model as HSK Slides:
--    · staff (owner/admin/teacher) manage everything
--    · a student reads a published lesson if it is free, or they have
--      premium, or they are enrolled in its course
--    · guests/anon read the LIST + any FREE lesson via the public RPCs
--
--  Safe to run more than once.
-- ============================================================

create table if not exists public.vocab_lessons (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   text not null unique,               -- stable slug for deep links (?lesson=)
  title       text not null,
  hsk_level   int  not null default 1 check (hsk_level between 1 and 9),
  course_id   uuid references public.courses (id) on delete set null,
  lesson_no   text not null default '',
  tier        text not null default 'free' check (tier in ('free', 'premium')),
  published   boolean not null default false,
  sort_order  int not null default 0,
  data        jsonb not null default '{}'::jsonb, -- { vocab:[], gapfill:[], arrange:[] }
  vocab_count int not null default 0,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists vocab_lessons_order_idx
  on public.vocab_lessons (hsk_level, published, sort_order, created_at);

alter table public.vocab_lessons enable row level security;

-- staff manage everything
drop policy if exists "vocab lessons staff" on public.vocab_lessons;
create policy "vocab lessons staff" on public.vocab_lessons
  for all to authenticated
  using      (public.is_admin() or public.is_teacher())
  with check (public.is_admin() or public.is_teacher());

-- students read published lessons they may access (free / premium / enrolled)
drop policy if exists "vocab lessons student" on public.vocab_lessons;
create policy "vocab lessons student" on public.vocab_lessons
  for select to authenticated
  using (
    published and (
      tier = 'free'
      or public.has_premium()
      or (course_id is not null and public.has_access() and public.enrolled_in(course_id))
    )
  );

-- ------------------------------------------------------------
--  Public RPCs — mirror public_hsk_lessons / public_hsk_lesson.
--  The LIST is visible to everyone (incl. guests) so the catalogue shows;
--  full lesson DATA only comes back when the caller may open it.
-- ------------------------------------------------------------
create or replace function public.public_vocab_lessons(p_level int default null)
returns jsonb language sql security definer stable set search_path = public as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'lesson_id', l.lesson_id, 'title', l.title,
      'hsk_level', l.hsk_level, 'lesson_no', l.lesson_no,
      'vocab_count', l.vocab_count, 'sort_order', l.sort_order,
      'gapfill_count', jsonb_array_length(coalesce(l.data->'gapfill', '[]'::jsonb)),
      'arrange_count', jsonb_array_length(coalesce(l.data->'arrange', '[]'::jsonb)),
      'premium', (l.tier = 'premium'), 'course_id', l.course_id
    ) order by l.hsk_level, l.sort_order, l.created_at)
    from vocab_lessons l
    where l.published
      and (p_level is null or l.hsk_level = p_level)
  ), '[]'::jsonb);
$$;
revoke all on function public.public_vocab_lessons(int) from public;
grant execute on function public.public_vocab_lessons(int) to anon, authenticated;

create or replace function public.public_vocab_lesson(p_lesson_id text)
returns jsonb language sql security definer stable set search_path = public as $$
  select coalesce((
    select jsonb_build_object(
      'lesson_id', l.lesson_id, 'title', l.title, 'hsk_level', l.hsk_level,
      'lesson_no', l.lesson_no, 'premium', (l.tier = 'premium'),
      'course_id', l.course_id, 'data', l.data
    )
    from vocab_lessons l
    where l.lesson_id = p_lesson_id
      and l.published
      and (
        l.tier = 'free'
        or public.is_admin() or public.is_teacher() or public.has_premium()
        or (l.course_id is not null and public.has_access() and public.enrolled_in(l.course_id))
      )
  ), null);
$$;
revoke all on function public.public_vocab_lesson(text) from public;
grant execute on function public.public_vocab_lesson(text) to anon, authenticated;

-- ------------------------------------------------------------
--  One sample published FREE lesson so the player has content on day one.
--  (Delete it later from the dashboard once you import your own.)
-- ------------------------------------------------------------
insert into public.vocab_lessons (lesson_id, title, hsk_level, lesson_no, tier, published, sort_order, vocab_count, data)
values (
  'vocab-hsk1-demo', 'HSK 1 · Từ vựng mẫu', 1, '1', 'free', true, 0, 3,
  jsonb_build_object(
    'vocab', jsonb_build_array(
      jsonb_build_object('id','d1','hanzi','水','pinyin','shuǐ','vi','nước','en','water','image','','exHanzi','我喝水。','exPinyin','Wǒ hē shuǐ.','exVi','Tôi uống nước.','match',false),
      jsonb_build_object('id','d2','hanzi','书','pinyin','shū','vi','sách','en','book','image','','exHanzi','这是书。','exPinyin','Zhè shì shū.','exVi','Đây là sách.','match',false),
      jsonb_build_object('id','d3','hanzi','好','pinyin','hǎo','vi','tốt','en','good','image','','exHanzi','你好！','exPinyin','Nǐ hǎo!','exVi','Xin chào!','match',false)
    ),
    'gapfill', jsonb_build_array(
      jsonb_build_object('id','g1','sentence','我___水。','answer','喝','distractors',jsonb_build_array('是','吃','看'),'pinyin','Wǒ ___ shuǐ.')
    ),
    'arrange', jsonb_build_array(
      jsonb_build_object('id','a1','target','我喝水。','chunks',jsonb_build_array('我','喝','水'),'pinyin','Wǒ hē shuǐ.')
    )
  )
)
on conflict (lesson_id) do nothing;

-- Ảnh minh hoạ cho bài mẫu (để trò "nối hình" chạy được ngay). Idempotent:
-- chỉ đặt ảnh khi từ chưa có ảnh, nên không đè ảnh bạn tự thêm sau này.
update public.vocab_lessons
set data = jsonb_set(data, '{vocab}', jsonb_build_array(
      jsonb_build_object('id','d1','hanzi','水','pinyin','shuǐ','vi','nước','en','water','image','https://loremflickr.com/400/320/water','exHanzi','我喝水。','exPinyin','Wǒ hē shuǐ.','exVi','Tôi uống nước.','match',true),
      jsonb_build_object('id','d2','hanzi','书','pinyin','shū','vi','sách','en','book','image','https://loremflickr.com/400/320/book','exHanzi','这是书。','exPinyin','Zhè shì shū.','exVi','Đây là sách.','match',true),
      jsonb_build_object('id','d3','hanzi','好','pinyin','hǎo','vi','tốt','en','good','image','https://loremflickr.com/400/320/thumbsup','exHanzi','你好！','exPinyin','Nǐ hǎo!','exVi','Xin chào!','match',true)
    )),
    updated_at = now()
where lesson_id = 'vocab-hsk1-demo'
  and coalesce(data->'vocab'->0->>'image','') = '';