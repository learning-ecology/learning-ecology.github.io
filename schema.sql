-- ============================================================
--  Learning Center LMS — database setup
--  Run this whole file once in Supabase → SQL Editor → New query
-- ============================================================

-- 1. TABLES ---------------------------------------------------

-- One row per user. Linked to Supabase's built-in auth.users.
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  role       text not null default 'student' check (role in ('student','admin')),
  created_at timestamptz default now()
);

-- Your teaching materials (an HTML lesson link, or a PDF link).
create table if not exists lessons (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  kind       text not null check (kind in ('html','pdf')),
  url        text not null,            -- GitHub Pages URL, or a PDF link
  sort_order int  default 0,
  created_at timestamptz default now()
);

-- Which student has done which lesson.
create table if not exists progress (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  lesson_id  uuid not null references lessons(id)  on delete cascade,
  status     text not null default 'in_progress' check (status in ('in_progress','completed')),
  updated_at timestamptz default now(),
  unique (student_id, lesson_id)
);

-- 2. AUTO-CREATE A PROFILE WHEN A USER SIGNS UP --------------
-- Every new account (even ones you create in the dashboard)
-- automatically gets a matching profile row, defaulting to 'student'.
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', 'student')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- 3. HELPER: is the current user an admin? -------------------
-- security definer means this bypasses RLS, which avoids an
-- infinite-recursion error when used inside the profiles policy.
create or replace function is_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- 4. ROW LEVEL SECURITY --------------------------------------
-- This is what keeps students private from each other.
-- With RLS on, the database itself refuses to hand student A
-- the data belonging to student B — no matter what the webpage asks for.
alter table profiles enable row level security;
alter table lessons  enable row level security;
alter table progress enable row level security;

-- profiles: you can read your own row; an admin can read everyone.
create policy "read own or admin" on profiles
  for select using (id = auth.uid() or is_admin());
create policy "update own profile" on profiles
  for update using (id = auth.uid());

-- lessons: any logged-in user can read; only an admin can add/edit/delete.
create policy "authenticated read lessons" on lessons
  for select using (auth.role() = 'authenticated');
create policy "admin manage lessons" on lessons
  for all using (is_admin()) with check (is_admin());

-- progress: a student sees & edits only their own; an admin sees all.
create policy "read own progress or admin" on progress
  for select using (student_id = auth.uid() or is_admin());
create policy "insert own progress" on progress
  for insert with check (student_id = auth.uid());
create policy "update own progress" on progress
  for update using (student_id = auth.uid());

-- ============================================================
--  AFTER running the above, make YOURSELF the admin.
--  First create your own account (Authentication → Users → Add user),
--  then run this line with your email:
--
--    update profiles set role = 'admin'
--    where id = (select id from auth.users where email = 'you@example.com');
-- ============================================================
