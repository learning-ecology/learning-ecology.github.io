-- ============================================================
--  Migration 53: Mở kho đề thi cho VSTEP (và mọi kỳ thi sau này)
--
--  Bảng vsat_exams của migration52 đã có sẵn mọi thứ một kỳ thi cần:
--  quyền đọc theo Miễn phí/Premium/khoá học, công tắc đăng, thứ tự,
--  tiến độ theo học viên, và kết quả ghi vào test_attempts. Thay vì
--  dựng lại toàn bộ chừng đó cho VSTEP, ta thêm MỘT cột `kind`:
--
--      kind = 'vsat'          → đề V-SAT     (làm bài ở vsat.html)
--      kind = 'vstep-reading' → VSTEP Đọc    (làm bài ở vstep.html)
--      sau này: 'vstep-listening', 'vstep-writing'… chỉ thêm GIÁ TRỊ,
--      không phải thêm bảng, thêm chính sách hay thêm migration.
--
--  Mọi hàm cũ giữ nguyên cách gọi: tham số kind đều có giá trị mặc
--  định 'vsat', nên vsat.html không phải sửa gì để chạy tiếp.
--
--  Chạy SAU migration52. Có transaction: lỗi = không đổi gì.
--  Chạy lại nhiều lần vẫn an toàn.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Đề thuộc kỳ thi nào
--    Mặc định 'vsat' nên hai đề V-SAT đang có được gán đúng ngay.
-- ------------------------------------------------------------
alter table public.vsat_exams
  add column if not exists kind text not null default 'vsat';

alter table public.vsat_exams drop constraint if exists vsat_exams_kind_check;
alter table public.vsat_exams add constraint vsat_exams_kind_check
  check (kind in ('vsat', 'vstep-reading', 'vstep-listening', 'vstep-writing', 'vstep-speaking'));

-- màn hình chọn đề luôn lọc theo kỳ thi → cần chỉ mục này khi số đề tăng
drop index if exists vsat_exams_order_idx;
create index if not exists vsat_exams_kind_order_idx
  on public.vsat_exams (kind, published, sort_order, created_at);

comment on table public.vsat_exams is
  'Kho đề thi dùng chung cho nhiều kỳ thi. Cột kind quyết định đề thuộc kỳ thi nào và trang nào hiển thị nó (vsat.html / vstep.html). Tên bảng giữ nguyên từ migration52 để không phải sửa lại mọi thứ đang chạy.';

-- ------------------------------------------------------------
-- 2. Danh sách đề — nay lọc theo kỳ thi
--    Bỏ hàm cũ trước, nếu không Postgres sẽ có HAI hàm cùng tên và
--    lời gọi public_vsat_list() sẽ báo lỗi "không rõ hàm nào".
-- ------------------------------------------------------------
drop function if exists public.public_vsat_list();

create or replace function public.public_vsat_list(p_kind text default 'vsat')
returns jsonb language sql security definer stable set search_path = public as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'exam_id', e.exam_id, 'title', e.title, 'subtitle', e.subtitle,
      'institution', e.institution, 'subject', e.subject,
      'duration_min', e.duration_min, 'questions', e.questions, 'max_raw', e.max_raw,
      'premium', (e.tier = 'premium'),
      'kind', e.kind,
      'course_id', e.course_id
    ) order by e.sort_order, e.created_at)
    from vsat_exams e
    where e.published
      and e.kind = coalesce(nullif(p_kind, ''), 'vsat')
      -- công tắc xem trước công khai: VSTEP dùng mục riêng của nó
      and (public.is_section_public(
             case when e.kind like 'vstep%' then 'vstep' else 'vsat' end)
           or auth.uid() is not null)
  ), '[]'::jsonb);
$$;

revoke all on function public.public_vsat_list(text) from public;
grant execute on function public.public_vsat_list(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. Ghi một lần nộp bài — thêm tham số kind
--    test_key thành 'vstep-reading:<mã đề>' thay vì 'vsat:<mã đề>',
--    nhờ vậy results.html tách được kết quả của hai kỳ thi.
-- ------------------------------------------------------------
drop function if exists public.record_vsat_attempt(text, numeric, int, int, int, int, int, jsonb, jsonb, jsonb, int);

create or replace function public.record_vsat_attempt(
  p_exam_id text, p_raw numeric, p_max_raw int,
  p_correct int, p_incorrect int, p_blank int, p_total int,
  p_answers jsonb, p_detail jsonb, p_meta jsonb, p_seconds int,
  p_kind text default 'vsat')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  e public.vsat_exams%rowtype;
  v_no int; v_token text; v_org uuid; v_id uuid; v_kind text;
begin
  if uid is null then
    raise exception 'Bạn cần đăng nhập để lưu kết quả.' using errcode = '28000';
  end if;
  select * into e from public.vsat_exams where exam_id = p_exam_id;
  if not found then
    raise exception 'Không tìm thấy đề "%".', p_exam_id using errcode = 'P0002';
  end if;
  -- kind lấy từ chính bản ghi đề, không tin tham số gửi lên
  v_kind := coalesce(e.kind, coalesce(nullif(p_kind, ''), 'vsat'));

  select org_id into v_org from public.profiles where id = uid;
  select coalesce(max(attempt_no), 0) + 1 into v_no
    from public.test_attempts where student_id = uid and test_key = v_kind || ':' || p_exam_id;
  -- giống migration44: gen_random_uuid() nằm sẵn trong pg_catalog, còn
  -- gen_random_bytes() thuộc pgcrypto (schema `extensions`) nên sẽ không
  -- tìm thấy khi hàm chạy với search_path = public.
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.test_attempts (
    student_id, test_key, test_name, org_id, attempt_no,
    score, max_score, correct, incorrect, unanswered, total,
    answers, detail, seconds_spent, share_token, meta)
  values (
    uid, v_kind || ':' || p_exam_id, e.title, v_org, v_no,
    round(p_raw)::int, p_max_raw, p_correct, p_incorrect, p_blank, p_total,
    coalesce(p_answers, '{}'::jsonb), coalesce(p_detail, '[]'::jsonb), p_seconds, v_token,
    coalesce(p_meta, '{}'::jsonb) || jsonb_build_object(
      'kind', v_kind, 'exam_id', p_exam_id, 'raw_exact', p_raw, 'max_raw', p_max_raw))
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'attempt_no', v_no, 'share_token', v_token);
end $$;

revoke all on function public.record_vsat_attempt(text, numeric, int, int, int, int, int, jsonb, jsonb, jsonb, int, text) from public;
grant execute on function public.record_vsat_attempt(text, numeric, int, int, int, int, int, jsonb, jsonb, jsonb, int, text) to authenticated;

-- ------------------------------------------------------------
-- 4. Lịch sử làm bài của học viên — lọc theo kỳ thi
-- ------------------------------------------------------------
drop function if exists public.my_vsat_attempts(text);

create or replace function public.my_vsat_attempts(
  p_exam_id text default null, p_kind text default 'vsat')
returns jsonb language sql security definer stable set search_path = public as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'exam_id', a.meta ->> 'exam_id', 'test_name', a.test_name,
      'attempt_no', a.attempt_no, 'raw', a.meta ->> 'raw_exact', 'max_raw', a.max_score,
      'correct', a.correct, 'incorrect', a.incorrect, 'unanswered', a.unanswered,
      'seconds', a.seconds_spent, 'at', a.submitted_at, 'meta', a.meta,
      'kind', a.meta ->> 'kind'
    ) order by a.submitted_at desc)
    from test_attempts a
    where a.student_id = auth.uid()
      -- p_kind rỗng = lấy tất cả các kỳ thi
      and (nullif(p_kind, '') is null or a.meta ->> 'kind' = p_kind)
      and (p_exam_id is null or a.meta ->> 'exam_id' = p_exam_id)
  ), '[]'::jsonb);
$$;

revoke all on function public.my_vsat_attempts(text, text) from public;
grant execute on function public.my_vsat_attempts(text, text) to authenticated;

-- ------------------------------------------------------------
-- 5. Mục "VSTEP" cho công tắc xem trước công khai + trang bán riêng
--    (dùng chung bảng section_pricing của migration47)
-- ------------------------------------------------------------
alter table public.section_pricing drop constraint if exists section_pricing_section_check;
alter table public.section_pricing add constraint section_pricing_section_check
  check (section in ('reading', 'shadow', 'dict', 'vsat', 'vstep'));

insert into public.section_pricing (section, config) values
  ('vstep', jsonb_build_object('public_on', false, 'period', 'course',
     'title', 'Mở khóa Luyện thi VSTEP',
     'tagline', 'Đề thi thử VSTEP bám sát định dạng thật, chấm điểm và giải thích chi tiết'))
on conflict (section) do nothing;

-- ------------------------------------------------------------
-- 6. Thêm VSTEP vào hàm tổng quan xem trước công khai (migration47)
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
      'free',    (select count(*) from vsat_exams where published and tier = 'free' and kind = 'vsat'),
      'premium', (select count(*) from vsat_exams where published and tier = 'premium' and kind = 'vsat')
    )
    where public.is_section_public('vsat')
    union all
    select jsonb_build_object(
      'section', 'vstep',
      'config',  (select config from section_pricing where section = 'vstep'),
      'free',    (select count(*) from vsat_exams where published and tier = 'free' and kind like 'vstep%'),
      'premium', (select count(*) from vsat_exams where published and tier = 'premium' and kind like 'vstep%')
    )
    where public.is_section_public('vstep')
  ) s;
$$;

revoke all on function public.public_sections() from public;
grant execute on function public.public_sections() to anon, authenticated;

commit;
