-- ============================================================
--  migration61 — Điều hướng do CHỦ TRUNG TÂM tự quản (Phase 63)
--
--  Trước đây danh mục điều hướng (Tiếng Trung / Tiếng Anh / …) được
--  VIẾT CỨNG trong course.html. Nay chuyển hẳn vào cơ sở dữ liệu để
--  chủ trung tâm tự Tạo → Đổi tên → Chuyển → Sắp xếp → Xoá mà KHÔNG
--  cần sửa mã.
--
--  Cấu trúc BA cấp:
--    Danh mục (nav_categories)  →  Nhóm con (nav_subcategories)  →  Mục
--  "Mục" ở đây là các khóa học và công cụ sẵn có; chúng được GÁN vào
--  một nhóm con / danh mục qua bảng ánh xạ nav_settings.assignments,
--  nên KHÔNG phải đụng vào bảng courses hay section_pricing, và ID của
--  khóa học / công cụ giữ nguyên — không có gì bị mồ côi.
--
--  ID danh mục / nhóm con là uuid CỐ ĐỊNH: đổi tên hay chuyển nhóm
--  không đổi ID, nên mọi liên kết cũ vẫn đúng.
--
--  Quyền: ai đăng nhập cũng ĐỌC được cấu trúc (để hiện điều hướng);
--  chỉ owner/admin mới SỬA. Trang công khai đọc qua RPC public_nav()
--  (SECURITY DEFINER) nên khách chưa đăng nhập vẫn thấy.
--
--  An toàn khi chạy nhiều lần. Không xoá dữ liệu.
-- ============================================================

begin;

-- ---------- 1. Danh mục cấp cao nhất ----------
create table if not exists public.nav_categories (
  id         uuid primary key default gen_random_uuid(),
  key        text unique,               -- chỉ dùng cho 5 mục gốc, để khớp cách gom cũ; mục mới = null
  name       text not null,
  icon       text not null default '',
  position   int  not null default 100,
  created_at timestamptz not null default now()
);

-- ---------- 2. Nhóm con thuộc một danh mục ----------
create table if not exists public.nav_subcategories (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.nav_categories(id) on delete cascade,
  name        text not null,
  position    int  not null default 100,
  created_at  timestamptz not null default now()
);
create index if not exists nav_subcat_cat_idx on public.nav_subcategories(category_id);

-- ---------- 3. Ánh xạ MỤC → nhóm con / danh mục ----------
--  Một hàng JSON duy nhất: { "<navId>": { "c": "<catId>", "s": "<subId|null>" } }
--  navId = id khóa học (uuid) hoặc "sec:vsat" cho công cụ.
create table if not exists public.nav_settings (
  id          int primary key default 1 check (id = 1),
  assignments jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
insert into public.nav_settings (id) values (1) on conflict do nothing;

-- ---------- 4. RLS ----------
alter table public.nav_categories    enable row level security;
alter table public.nav_subcategories enable row level security;
alter table public.nav_settings      enable row level security;

-- Đọc: ai cũng đọc (cấu trúc điều hướng không bí mật). Ghi: chỉ owner/admin.
drop policy if exists "nav cat read"  on public.nav_categories;
create policy "nav cat read"  on public.nav_categories  for select to anon, authenticated using (true);
drop policy if exists "nav cat write" on public.nav_categories;
create policy "nav cat write" on public.nav_categories  for all to authenticated
  using (public.is_admin() or public.is_org_admin()) with check (public.is_admin() or public.is_org_admin());

drop policy if exists "nav sub read"  on public.nav_subcategories;
create policy "nav sub read"  on public.nav_subcategories for select to anon, authenticated using (true);
drop policy if exists "nav sub write" on public.nav_subcategories;
create policy "nav sub write" on public.nav_subcategories for all to authenticated
  using (public.is_admin() or public.is_org_admin()) with check (public.is_admin() or public.is_org_admin());

drop policy if exists "nav set read"  on public.nav_settings;
create policy "nav set read"  on public.nav_settings for select to anon, authenticated using (true);
drop policy if exists "nav set write" on public.nav_settings;
create policy "nav set write" on public.nav_settings for all to authenticated
  using (public.is_admin() or public.is_org_admin()) with check (public.is_admin() or public.is_org_admin());

-- ---------- 5. Gieo 5 danh mục gốc (khớp cách gom của Phase 62) ----------
--  Chỉ thêm nếu chưa có key đó, nên chạy lại không nhân đôi, và không
--  ghi đè tên nếu chủ đã đổi.
insert into public.nav_categories (key, name, icon, position) values
  ('zh',    'Tiếng Trung',       '🀄',   10),
  ('en',    'Tiếng Anh',         '🔤',   20),
  ('teach', 'Công cụ giảng dạy', '🧑‍🏫', 30),
  ('learn', 'Công cụ học tập',   '🎧',   40),
  ('other', 'Khác',              '✨',   50)
on conflict (key) do nothing;

-- ---------- 6. RPC đọc cả cây trong MỘT lượt (cho trang công khai) ----------
create or replace function public.public_nav()
returns jsonb language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'key', c.key, 'name', c.name, 'icon', c.icon, 'position', c.position,
        'subs', coalesce((
          select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'position', s.position)
                           order by s.position, s.name)
          from nav_subcategories s where s.category_id = c.id), '[]'::jsonb)
      ) order by c.position, c.name)
      from nav_categories c), '[]'::jsonb),
    'assignments', coalesce((select assignments from nav_settings where id = 1), '{}'::jsonb)
  );
$$;
revoke all on function public.public_nav() from public;
grant execute on function public.public_nav() to anon, authenticated;

commit;

-- Kiểm tra nhanh: phải thấy 5 danh mục và khoá 'assignments'
select jsonb_array_length(public.public_nav() -> 'categories') as so_danh_muc;
select jsonb_object_keys(public.public_nav()) as khoa;
