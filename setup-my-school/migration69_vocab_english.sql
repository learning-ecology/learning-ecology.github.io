-- ============================================================
--  migration69_vocab_english.sql — one Vocabulary Practice system,
--  two languages (Chinese + English), with a dynamic category tree.
--
--  Design goals (do NOT break existing HSK):
--   · vocab_lessons gets a `language` column defaulting to 'zh', so every
--     existing lesson stays Chinese and keeps working exactly as before.
--   · English lessons are organised by a DYNAMIC tree the owner manages from
--     the dashboard: vocab_categories → vocab_subcategories. Lessons point at
--     them by id, so renaming/reordering never breaks a lesson, and deleting
--     a category only NULLs the lesson's link (the lesson itself survives).
--   · Chinese keeps grouping by hsk_level; English groups by category tree.
--
--  Safe to run more than once.
-- ============================================================

-- 1) language + dynamic-tree links on lessons ------------------------------
alter table public.vocab_lessons
  add column if not exists language       text not null default 'zh',
  add column if not exists category_id    uuid,
  add column if not exists subcategory_id uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'vocab_lessons_language_chk') then
    alter table public.vocab_lessons
      add constraint vocab_lessons_language_chk check (language in ('zh', 'en'));
  end if;
end $$;

-- 2) dynamic category tree (per language) ----------------------------------
create table if not exists public.vocab_categories (
  id         uuid primary key default gen_random_uuid(),
  language   text not null default 'en' check (language in ('zh', 'en')),
  name       text not null,
  sort_order int  not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vocab_subcategories (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.vocab_categories (id) on delete cascade,
  name        text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists vocab_subcat_cat_idx on public.vocab_subcategories (category_id, sort_order);
create index if not exists vocab_lessons_lang_idx on public.vocab_lessons (language, category_id, subcategory_id, sort_order);

-- Lessons link to the tree; ON DELETE SET NULL keeps the lesson (requirement:
-- deleting a category must never delete learning content).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'vocab_lessons_category_fk') then
    alter table public.vocab_lessons
      add constraint vocab_lessons_category_fk foreign key (category_id)
      references public.vocab_categories (id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vocab_lessons_subcategory_fk') then
    alter table public.vocab_lessons
      add constraint vocab_lessons_subcategory_fk foreign key (subcategory_id)
      references public.vocab_subcategories (id) on delete set null;
  end if;
end $$;

-- 3) RLS: everyone reads the tree (it's just labels); staff manage ---------
alter table public.vocab_categories    enable row level security;
alter table public.vocab_subcategories enable row level security;

drop policy if exists "vocab cats read" on public.vocab_categories;
create policy "vocab cats read" on public.vocab_categories
  for select to anon, authenticated using (true);
drop policy if exists "vocab cats staff" on public.vocab_categories;
create policy "vocab cats staff" on public.vocab_categories
  for all to authenticated
  using (public.is_admin() or public.is_teacher())
  with check (public.is_admin() or public.is_teacher());

drop policy if exists "vocab subcats read" on public.vocab_subcategories;
create policy "vocab subcats read" on public.vocab_subcategories
  for select to anon, authenticated using (true);
drop policy if exists "vocab subcats staff" on public.vocab_subcategories;
create policy "vocab subcats staff" on public.vocab_subcategories
  for all to authenticated
  using (public.is_admin() or public.is_teacher())
  with check (public.is_admin() or public.is_teacher());

-- 4) public tree RPC — category → subcategory (+ published-lesson counts) ---
create or replace function public.public_vocab_tree(p_language text default 'en')
returns jsonb language sql security definer stable set search_path = public as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'sort_order', c.sort_order,
      'subs', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', s.id, 'name', s.name, 'sort_order', s.sort_order,
          'lesson_count', (select count(*) from vocab_lessons l where l.subcategory_id = s.id and l.published)
        ) order by s.sort_order, s.name)
        from vocab_subcategories s where s.category_id = c.id
      ), '[]'::jsonb),
      'lesson_count', (select count(*) from vocab_lessons l where l.category_id = c.id and l.published)
    ) order by c.sort_order, c.name)
    from vocab_categories c where c.language = p_language
  ), '[]'::jsonb);
$$;
revoke all on function public.public_vocab_tree(text) from public;
grant execute on function public.public_vocab_tree(text) to anon, authenticated;

-- 5) extend the lesson-list RPC with language + tree links -----------------
--    (drop the old 1-arg version so PostgREST resolves cleanly)
drop function if exists public.public_vocab_lessons(int);
create or replace function public.public_vocab_lessons(p_level int default null, p_language text default null)
returns jsonb language sql security definer stable set search_path = public as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'lesson_id', l.lesson_id, 'title', l.title, 'language', l.language,
      'hsk_level', l.hsk_level, 'lesson_no', l.lesson_no,
      'category_id', l.category_id, 'subcategory_id', l.subcategory_id,
      'vocab_count', l.vocab_count, 'sort_order', l.sort_order,
      'gapfill_count', jsonb_array_length(coalesce(l.data->'gapfill', '[]'::jsonb)),
      'arrange_count', jsonb_array_length(coalesce(l.data->'arrange', '[]'::jsonb)),
      'mcq_count', jsonb_array_length(coalesce(l.data->'mcq', '[]'::jsonb)),
      'premium', (l.tier = 'premium'), 'course_id', l.course_id
    ) order by l.hsk_level, l.sort_order, l.created_at)
    from vocab_lessons l
    where l.published
      and (p_level is null or l.hsk_level = p_level)
      and (p_language is null or l.language = p_language)
  ), '[]'::jsonb);
$$;
revoke all on function public.public_vocab_lessons(int, text) from public;
grant execute on function public.public_vocab_lessons(int, text) to anon, authenticated;

-- 6) single-lesson RPC — add language + tree ids ---------------------------
create or replace function public.public_vocab_lesson(p_lesson_id text)
returns jsonb language sql security definer stable set search_path = public as $$
  select coalesce((
    select jsonb_build_object(
      'lesson_id', l.lesson_id, 'title', l.title, 'language', l.language,
      'hsk_level', l.hsk_level, 'lesson_no', l.lesson_no,
      'category_id', l.category_id, 'subcategory_id', l.subcategory_id,
      'premium', (l.tier = 'premium'), 'course_id', l.course_id, 'data', l.data
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

-- 7) seed the initial English tree ONCE (only if no English categories yet) -
--    These are just starting rows — fully editable/renamable/removable later.
do $$
declare v_cefr_ielts boolean;
begin
  if not exists (select 1 from public.vocab_categories where language = 'en') then
    insert into public.vocab_categories (language, name, sort_order) values
      ('en','A1',10),('en','A2',20),('en','B1',30),('en','B2',40),
      ('en','C1',50),('en','C2',60),('en','IELTS',70),
      ('en','Collocations in Use',80),('en','Common Idioms',90);

    -- a few example subcategories so the tree isn't empty on day one
    insert into public.vocab_subcategories (category_id, name, sort_order)
      select id, x.name, x.so from public.vocab_categories,
        (values ('Travel',10),('Education',20),('Health',30),('Technology',40)) as x(name, so)
      where language='en' and name='B1';
    insert into public.vocab_subcategories (category_id, name, sort_order)
      select id, x.name, x.so from public.vocab_categories,
        (values ('Academic Vocabulary',10),('Writing Vocabulary',20),('Speaking Vocabulary',30)) as x(name, so)
      where language='en' and name='IELTS';
    insert into public.vocab_subcategories (category_id, name, sort_order)
      select id, x.name, x.so from public.vocab_categories,
        (values ('Everyday Life',10),('Work & Study',20),('Travel',30)) as x(name, so)
      where language='en' and name='Collocations in Use';
    insert into public.vocab_subcategories (category_id, name, sort_order)
      select id, x.name, x.so from public.vocab_categories,
        (values ('Daily Communication',10),('Work',20),('Emotions',30)) as x(name, so)
      where language='en' and name='Common Idioms';

    -- one complete sample English lesson under B1 → Travel (free, published)
    insert into public.vocab_lessons
      (lesson_id, title, language, hsk_level, category_id, subcategory_id, lesson_no, tier, published, sort_order, vocab_count, data)
    select 'en-b1-travel-demo', 'B1 · Travel — Getting Around', 'en', 1,
           c.id, s.id, '1', 'free', true, 0, 4,
      jsonb_build_object(
        'vocab', jsonb_build_array(
          jsonb_build_object('id','e1','word','commute','pos','verb / noun','vi','đi lại hằng ngày (đi làm)','def','to travel regularly between home and work','example','She commutes to the city center every day.','image','https://loremflickr.com/400/320/commute,train','imgKeyword','commute','match',true),
          jsonb_build_object('id','e2','word','luggage','pos','noun','vi','hành lý','def','the bags and cases you take when travelling','example','We checked our luggage before the flight.','image','https://loremflickr.com/400/320/luggage','imgKeyword','luggage','match',true),
          jsonb_build_object('id','e3','word','departure','pos','noun','vi','sự khởi hành','def','the act of leaving, especially to start a journey','example','The departure was delayed by two hours.','image','https://loremflickr.com/400/320/airport,departure','imgKeyword','departure','match',true),
          jsonb_build_object('id','e4','word','fare','pos','noun','vi','giá vé (đi lại)','def','the money you pay for a journey by bus, train, taxi, etc.','example','The bus fare went up last month.','image','https://loremflickr.com/400/320/bus,ticket','imgKeyword','fare','match',true)
        ),
        'mcq', jsonb_build_array(
          jsonb_build_object('id','m1','sentence','I ______ to work by train because driving in the city is stressful.','answer','commute','distractors',jsonb_build_array('depart','arrive','wander'),'explanation','commute = travel regularly between home and work'),
          jsonb_build_object('id','m2','sentence','Please keep your ______ with you at all times at the airport.','answer','luggage','distractors',jsonb_build_array('fare','departure','commute'),'explanation','luggage = bags you travel with'),
          jsonb_build_object('id','m3','sentence','The train ______ is at 9:15, so we should arrive by 9:00.','answer','departure','distractors',jsonb_build_array('luggage','fare','commute'),'explanation','departure = the leaving/start of a journey'),
          jsonb_build_object('id','m4','sentence','The taxi ______ from the airport to the hotel was quite expensive.','answer','fare','distractors',jsonb_build_array('luggage','commute','departure'),'explanation','fare = the price of a journey')
        )
      )
    from public.vocab_categories c
    join public.vocab_subcategories s on s.category_id = c.id and s.name = 'Travel'
    where c.language = 'en' and c.name = 'B1'
    on conflict (lesson_id) do nothing;
  end if;
end $$;
