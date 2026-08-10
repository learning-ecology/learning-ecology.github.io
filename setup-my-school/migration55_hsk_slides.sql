-- ============================================================
--  Migration 55: Kho bài giảng HSK (Slides Generator)
--
--  Bài giảng KHÁC đề thi: không có điểm, không có lần nộp bài, nên
--  không dùng chung bảng vsat_exams. Nhưng cấu trúc thì đặt giống hệt
--  để tab quản lý trong Bảng điều khiển làm việc theo đúng một khuôn:
--      lesson_id · title · data(jsonb) · published · tier · sort_order
--
--  Thêm hai thứ mà hệ thống đề thi không cần:
--    • hsk_media — thư viện dùng lại: một chữ / một từ chỉ phải tìm ảnh
--      hoặc duyệt tài nguyên MỘT LẦN, bài sau lấy lại ngay.
--    • kho tệp 'hsk-media' cho ảnh minh hoạ đã duyệt.
--
--  Thứ tự nét KHÔNG cần lưu: HanziWriter dựng hoạt ảnh ngay trên máy
--  học viên cho ~9.000 chữ, nên không phải tải hay lưu GIF nào cả.
--
--  Chạy SAU migration54. Có transaction: lỗi = không đổi gì.
--  Chạy lại nhiều lần vẫn an toàn.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Bài giảng
--    `data` chứa toàn bộ nội dung bài đã được làm giàu (từ vựng,
--    bài đọc, ngữ pháp, luyện tập, bộ thủ) ở dạng JSON — cùng cách
--    làm với đề thi, nên thêm loại nội dung mới không phải đổi bảng.
-- ------------------------------------------------------------
create table if not exists public.hsk_lessons (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   text not null unique,        -- mã bài, do thầy đặt trong Excel
  title       text not null,
  subtitle    text not null default '',
  course      text not null default '',    -- "Tiếng Trung Sơ Cấp (HSK 1)"
  hsk_level   int  not null default 1 check (hsk_level between 1 and 9),
  lesson_no   text not null default '',
  data        jsonb not null,
  vocab_count int  not null default 0,
  slide_count int  not null default 0,
  tier        text not null default 'free' check (tier in ('free', 'premium')),
  published   boolean not null default false,
  sort_order  int not null default 0,
  course_id   uuid references public.courses(id) on delete set null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists hsk_lessons_order_idx
  on public.hsk_lessons (hsk_level, published, sort_order, created_at);

alter table public.hsk_lessons enable row level security;

drop policy if exists "hsk lessons staff" on public.hsk_lessons;
create policy "hsk lessons staff" on public.hsk_lessons
  for all to authenticated
  using (public.is_admin() or public.is_teacher())
  with check (public.is_admin() or public.is_teacher());

-- Học viên: bài đã đăng, miễn phí hoặc có quyền Premium / đang học khoá
drop policy if exists "hsk lessons student" on public.hsk_lessons;
create policy "hsk lessons student" on public.hsk_lessons
  for select to authenticated
  using (
    published and (
      tier = 'free'
      or public.has_premium()
      or (course_id is not null and public.has_access() and public.enrolled_in(course_id))
    )
  );

-- ------------------------------------------------------------
-- 2. Thư viện tài nguyên dùng lại
--    key = chữ Hán hoặc từ; kind = loại tài nguyên.
--    Ảnh minh hoạ đã duyệt cho 苹果 dùng được cho MỌI bài sau.
-- ------------------------------------------------------------
create table if not exists public.hsk_media (
  id         uuid primary key default gen_random_uuid(),
  media_key  text not null,               -- '苹果'
  kind       text not null default 'image' check (kind in ('image', 'audio', 'radical')),
  url        text not null,
  source     text not null default '',    -- 'pexels' | 'teacher' | 'generated'
  credit     text not null default '',    -- tên tác giả, nếu giấy phép yêu cầu
  approved   boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (media_key, kind)
);

alter table public.hsk_media enable row level security;

drop policy if exists "hsk media read" on public.hsk_media;
create policy "hsk media read" on public.hsk_media
  for select using (true);

drop policy if exists "hsk media staff write" on public.hsk_media;
create policy "hsk media staff write" on public.hsk_media
  for all to authenticated
  using (public.is_admin() or public.is_teacher())
  with check (public.is_admin() or public.is_teacher());

-- ------------------------------------------------------------
-- 3. Kho tệp ảnh minh hoạ
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('hsk-media', 'hsk-media', true)
on conflict (id) do nothing;

update storage.buckets
   set public = true,
       file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/svg+xml']
 where id = 'hsk-media';

drop policy if exists "hsk media public read" on storage.objects;
create policy "hsk media public read" on storage.objects
  for select using (bucket_id = 'hsk-media');

drop policy if exists "hsk media staff write" on storage.objects;
create policy "hsk media staff write" on storage.objects
  for all to authenticated
  using (bucket_id = 'hsk-media' and (public.is_teacher() or public.is_admin()))
  with check (bucket_id = 'hsk-media' and (public.is_teacher() or public.is_admin()));

-- ------------------------------------------------------------
-- 4. Danh sách bài cho trang giảng — KHÔNG kèm `data`
--    Thầy/học viên thấy tên bài để chọn, nội dung chỉ tải khi mở bài.
-- ------------------------------------------------------------
create or replace function public.public_hsk_lessons(p_level int default null)
returns jsonb language sql security definer stable set search_path = public as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'lesson_id', l.lesson_id, 'title', l.title, 'subtitle', l.subtitle,
      'course', l.course, 'hsk_level', l.hsk_level, 'lesson_no', l.lesson_no,
      'vocab_count', l.vocab_count, 'slide_count', l.slide_count,
      'premium', (l.tier = 'premium'), 'course_id', l.course_id
    ) order by l.hsk_level, l.sort_order, l.created_at)
    from hsk_lessons l
    where l.published
      and (p_level is null or l.hsk_level = p_level)
      and auth.uid() is not null          -- bài giảng chỉ dành cho người đã đăng nhập
  ), '[]'::jsonb);
$$;

revoke all on function public.public_hsk_lessons(int) from public;
grant execute on function public.public_hsk_lessons(int) to authenticated;

commit;
