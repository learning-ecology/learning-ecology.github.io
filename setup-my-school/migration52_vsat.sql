-- ============================================================
--  Migration 52: Đưa hệ thống luyện thi V-SAT vào nền tảng
--
--  Bộ máy làm bài (vsat_engine.html) vốn đã tách rời NỘI DUNG và GIAO DIỆN:
--  mỗi đề là một tệp .vsat.json. Migration này chỉ chuyển chỗ cất đề —
--  từ máy học viên lên cơ sở dữ liệu — để:
--    • thầy đăng đề một lần, mọi học viên đều thấy;
--    • đánh dấu từng đề là Miễn phí hay Premium;
--    • tiến độ luyện tập và kết quả thi gắn với tài khoản học viên.
--
--  KHÔNG tạo hệ thống mới: kết quả thi ghi vào bảng test_attempts có sẵn
--  (Phase 36) nên trang results.html, quyền của giáo viên/chủ trường và
--  liên kết chia sẻ chỉ-đọc dùng lại được y nguyên.
--
--  Chạy SAU migration51. Có transaction: lỗi = không đổi gì.
--  Chạy lại nhiều lần vẫn an toàn.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Kho đề thi V-SAT
--    `data` chứa nguyên tệp .vsat.json (meta + mock + practice).
--    Cách chấm điểm hiện chạy trên máy học viên nên `data` phải gửi về
--    máy — vì vậy RLS chỉ cho đọc đề MIỄN PHÍ hoặc đề mà học viên có
--    quyền. Danh sách đề (không kèm nội dung) có hàm riêng ở mục 3.
-- ------------------------------------------------------------
create table if not exists public.vsat_exams (
  id          uuid primary key default gen_random_uuid(),
  exam_id     text not null unique,          -- meta.id trong tệp .vsat.json
  title       text not null,
  subtitle    text not null default '',
  institution text not null default '',
  subject     text not null default '',
  duration_min int not null default 60,
  questions   int  not null default 0,       -- số câu, tính sẵn để hiện trên thẻ
  max_raw     int  not null default 0,       -- điểm tối đa (số câu × 6)
  data        jsonb not null,                -- toàn bộ .vsat.json
  tier        text not null default 'premium' check (tier in ('free', 'premium')),
  published   boolean not null default false,
  sort_order  int not null default 0,
  course_id   uuid references public.courses(id) on delete set null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists vsat_exams_order_idx on public.vsat_exams (published, sort_order, created_at);

alter table public.vsat_exams enable row level security;

-- Chủ trường / giáo viên: toàn quyền
drop policy if exists "vsat exams staff" on public.vsat_exams;
create policy "vsat exams staff" on public.vsat_exams
  for all to authenticated
  using (public.is_admin() or public.is_teacher())
  with check (public.is_admin() or public.is_teacher());

-- Học viên đã đăng nhập: đọc được đề miễn phí, và đề Premium nếu có
-- quyền Premium hoặc đang học khoá gắn với đề đó.
drop policy if exists "vsat exams student" on public.vsat_exams;
create policy "vsat exams student" on public.vsat_exams
  for select to authenticated
  using (
    published and (
      tier = 'free'
      or public.has_premium()
      or (course_id is not null and public.has_access() and public.enrolled_in(course_id))
    )
  );

-- Khách chưa đăng nhập: CHỈ đề miễn phí, và chỉ khi thầy đã bật xem
-- trước công khai cho mục V-SAT (dùng chung công tắc với Đọc hiểu…).
drop policy if exists "vsat exams public" on public.vsat_exams;
create policy "vsat exams public" on public.vsat_exams
  for select to anon
  using (published and tier = 'free' and public.is_section_public('vsat'));

-- ------------------------------------------------------------
-- 2. Tiến độ luyện tập + bài làm dở của từng học viên, theo từng đề
--    (một dòng cho mỗi cặp học viên–đề)
-- ------------------------------------------------------------
create table if not exists public.vsat_progress (
  student_id uuid not null references public.profiles(id) on delete cascade,
  exam_id    text not null,
  practice   jsonb not null default '{}'::jsonb,   -- bước học, thẻ nhớ, điểm bài tập
  test_state jsonb not null default '{}'::jsonb,   -- câu trả lời, thời gian còn lại, ghi chú
  updated_at timestamptz not null default now(),
  primary key (student_id, exam_id)
);

alter table public.vsat_progress enable row level security;

drop policy if exists "vsat progress own" on public.vsat_progress;
create policy "vsat progress own" on public.vsat_progress
  for all to authenticated
  using (student_id = auth.uid()) with check (student_id = auth.uid());

drop policy if exists "vsat progress staff" on public.vsat_progress;
create policy "vsat progress staff" on public.vsat_progress
  for select to authenticated
  using (public.is_admin() or public.is_teacher());

-- ------------------------------------------------------------
-- 3. Danh sách đề cho trang công khai / màn hình chọn đề
--    KHÔNG kèm `data`, nên khách thấy được tên đề Premium (để biết mà
--    mua) nhưng không lấy được nội dung.
-- ------------------------------------------------------------
create or replace function public.public_vsat_list()
returns jsonb language sql security definer stable set search_path = public as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'exam_id', e.exam_id, 'title', e.title, 'subtitle', e.subtitle,
      'institution', e.institution, 'subject', e.subject,
      'duration_min', e.duration_min, 'questions', e.questions, 'max_raw', e.max_raw,
      'premium', (e.tier = 'premium'),
      'course_id', e.course_id
    ) order by e.sort_order, e.created_at)
    from vsat_exams e
    where e.published
      and (public.is_section_public('vsat') or auth.uid() is not null)
  ), '[]'::jsonb);
$$;

revoke all on function public.public_vsat_list() from public;
grant execute on function public.public_vsat_list() to anon, authenticated;

-- ------------------------------------------------------------
-- 4. Ghi lại một lần nộp bài vào bảng test_attempts CÓ SẴN
--    Nhờ vậy results.html, quyền xem của giáo viên và liên kết chia sẻ
--    chỉ-đọc dùng lại được, không phải làm hệ thống kết quả thứ hai.
--
--    Lưu ý: cột score là số nguyên, mà điểm V-SAT có thể lẻ .5 (ghép hợp
--    1,5 điểm mỗi ý). Vì vậy score = làm tròn, còn điểm chính xác và bảng
--    phân tích theo phần/dạng câu nằm trong cột meta.
-- ------------------------------------------------------------
create or replace function public.record_vsat_attempt(
  p_exam_id text, p_raw numeric, p_max_raw int,
  p_correct int, p_incorrect int, p_blank int, p_total int,
  p_answers jsonb, p_detail jsonb, p_meta jsonb, p_seconds int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  e public.vsat_exams%rowtype;
  v_no int; v_token text; v_org uuid; v_id uuid;
begin
  if uid is null then
    raise exception 'Bạn cần đăng nhập để lưu kết quả.' using errcode = '28000';
  end if;
  select * into e from public.vsat_exams where exam_id = p_exam_id;
  if not found then
    raise exception 'Không tìm thấy đề "%".', p_exam_id using errcode = 'P0002';
  end if;

  select org_id into v_org from public.profiles where id = uid;
  select coalesce(max(attempt_no), 0) + 1 into v_no
    from public.test_attempts where student_id = uid and test_key = 'vsat:' || p_exam_id;
  -- giống migration44: gen_random_uuid() nằm sẵn trong pg_catalog, còn
  -- gen_random_bytes() thuộc pgcrypto (schema `extensions`) nên sẽ không
  -- tìm thấy khi hàm chạy với search_path = public.
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.test_attempts (
    student_id, test_key, test_name, org_id, attempt_no,
    score, max_score, correct, incorrect, unanswered, total,
    answers, detail, seconds_spent, share_token, meta)
  values (
    uid, 'vsat:' || p_exam_id, e.title, v_org, v_no,
    round(p_raw)::int, p_max_raw, p_correct, p_incorrect, p_blank, p_total,
    coalesce(p_answers, '{}'::jsonb), coalesce(p_detail, '[]'::jsonb), p_seconds, v_token,
    coalesce(p_meta, '{}'::jsonb) || jsonb_build_object(
      'kind', 'vsat', 'exam_id', p_exam_id, 'raw_exact', p_raw, 'max_raw', p_max_raw))
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'attempt_no', v_no, 'share_token', v_token);
end $$;

revoke all on function public.record_vsat_attempt(text, numeric, int, int, int, int, int, jsonb, jsonb, jsonb, int) from public;
grant execute on function public.record_vsat_attempt(text, numeric, int, int, int, int, int, jsonb, jsonb, jsonb, int) to authenticated;

-- ------------------------------------------------------------
-- 5. Học viên xem lại lịch sử làm bài V-SAT của CHÍNH MÌNH
--    (test_attempts vốn chỉ cho chủ trường/giáo viên đọc)
-- ------------------------------------------------------------
create or replace function public.my_vsat_attempts(p_exam_id text default null)
returns jsonb language sql security definer stable set search_path = public as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'exam_id', a.meta ->> 'exam_id', 'test_name', a.test_name,
      'attempt_no', a.attempt_no, 'raw', a.meta ->> 'raw_exact', 'max_raw', a.max_score,
      'correct', a.correct, 'incorrect', a.incorrect, 'unanswered', a.unanswered,
      'seconds', a.seconds_spent, 'at', a.submitted_at, 'meta', a.meta
    ) order by a.submitted_at desc)
    from test_attempts a
    where a.student_id = auth.uid()
      and a.meta ->> 'kind' = 'vsat'
      and (p_exam_id is null or a.meta ->> 'exam_id' = p_exam_id)
  ), '[]'::jsonb);
$$;

revoke all on function public.my_vsat_attempts(text) from public;
grant execute on function public.my_vsat_attempts(text) to authenticated;

-- ------------------------------------------------------------
-- 6. Mục "V-SAT" cho công tắc xem trước công khai + trang bán riêng
--    (dùng chung bảng section_pricing của migration47)
-- ------------------------------------------------------------
alter table public.section_pricing drop constraint if exists section_pricing_section_check;
alter table public.section_pricing add constraint section_pricing_section_check
  check (section in ('reading', 'shadow', 'dict', 'vsat'));

insert into public.section_pricing (section, config) values
  ('vsat', jsonb_build_object('public_on', false, 'period', 'course',
     'title', 'Mở khóa Luyện thi V-SAT',
     'tagline', 'Đề thi thử bám sát cấu trúc V-SAT, chấm điểm và giải thích chi tiết'))
on conflict (section) do nothing;

-- ------------------------------------------------------------
-- 7. Thêm V-SAT vào hàm tổng quan xem trước công khai (migration47)
--    để trang khóa học liệt kê nó cạnh Đọc hiểu / Shadowing / Chép chính tả.
-- ------------------------------------------------------------
create or replace function public.public_sections()
returns jsonb language sql security definer stable set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'section'), '[]'::jsonb) from (
    select jsonb_build_object(
      'section', 'reading',
      'config',  (select config from section_pricing where section = 'reading'),
      'free',    (select count(*) from reading_texts
                  where published and audience = 'everyone' and coalesce(tier,'free') <> 'premium'),
      'premium', (select count(*) from reading_texts
                  where published and audience = 'everyone' and tier = 'premium')
    ) as x
    where public.is_section_public('reading')
    union all
    select jsonb_build_object(
      'section', 'shadow',
      'config',  (select config from section_pricing where section = 'shadow'),
      'free',    (select count(*) from shadow_videos where published and coalesce(tier,'free') <> 'premium'),
      'premium', (select count(*) from shadow_videos where published and tier = 'premium')
    )
    where public.is_section_public('shadow')
    union all
    select jsonb_build_object(
      'section', 'dict',
      'config',  (select config from section_pricing where section = 'dict'),
      'free',    (select count(*) from shadow_videos
                  where published and coalesce(tier,'free') <> 'premium' and jsonb_array_length(subs) > 0),
      'premium', (select count(*) from shadow_videos
                  where published and tier = 'premium' and jsonb_array_length(subs) > 0)
    )
    where public.is_section_public('dict')
    union all
    select jsonb_build_object(
      'section', 'vsat',
      'config',  (select config from section_pricing where section = 'vsat'),
      'free',    (select count(*) from vsat_exams where published and tier = 'free'),
      'premium', (select count(*) from vsat_exams where published and tier = 'premium')
    )
    where public.is_section_public('vsat')
  ) s;
$$;

revoke all on function public.public_sections() from public;
grant execute on function public.public_sections() to anon, authenticated;

commit;
