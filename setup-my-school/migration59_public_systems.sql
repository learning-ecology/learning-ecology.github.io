-- ============================================================
--  migration59 — Hiển thị công khai: V-SAT, VSTEP, HSK Slides
--  (Phase 59)
--
--  Vì sao ba hệ thống này chưa hiện ở trang xem trước:
--    • V-SAT và VSTEP thật ra ĐÃ được trang course.html hỗ trợ đầy đủ
--      từ Phase 52–55 — chỉ thiếu đúng một thứ: công tắc
--      config->>'public_on'. Mà bảng điều khiển lại chưa có chỗ nào
--      bật nó, nên nó nằm im ở false mãi.
--    • HSK Slides thì thiếu thật: chưa có trong public_sections(),
--      và danh sách bài chỉ trả về cho người ĐÃ ĐĂNG NHẬP nên khách
--      vào xem trước không thấy gì.
--
--  Thay đổi:
--    1. section_pricing nhận thêm 'hsk'.
--    2. public_sections() viết lại theo kiểu SỔ ĐĂNG KÝ: duyệt mọi
--       dòng trong section_pricing có public_on = true, thay vì liệt
--       kê cứng từng hệ thống. Thêm hệ thống mới sau này chỉ cần một
--       dòng dữ liệu là hiện ra ngay, không phải sửa hàm này nữa.
--    3. Đếm số bài tách ra hàm riêng section_count(); hệ thống nào
--       chưa có cách đếm thì trả 0 chứ không làm hỏng cả danh sách.
--    4. Danh sách sắp theo config->>'sort_order' (thầy tự đổi được).
--    5. public_hsk_lessons() cho khách xem được DANH SÁCH bài (chỉ tên
--       và số liệu, không có nội dung bài).
--    6. Thêm public_hsk_lesson() trả NỘI DUNG bài — chỉ khi bài miễn
--       phí, hoặc người xem có quyền. Nhờ vậy khách học thử được bài
--       miễn phí y như Đọc hiểu, mà bài Premium vẫn không lọt ra ngoài.
--    7. Bật sẵn công khai cho V-SAT, VSTEP, HSK và điền thông tin
--       hiển thị mặc định.
--
--  An toàn khi chạy nhiều lần. Không xoá dữ liệu nào.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. section_pricing nhận thêm 'hsk'
-- ------------------------------------------------------------
-- Bỏ danh sách cứng: trước đây mỗi lần thêm một hệ thống là phải sửa
-- ràng buộc này bằng SQL. Nay chỉ cần mã hợp lệ (chữ thường, số, - _),
-- nên hệ thống mới đăng ký ở bảng điều khiển là dùng được ngay.
alter table public.section_pricing drop constraint if exists section_pricing_section_check;
alter table public.section_pricing add constraint section_pricing_section_check
  check (section ~ '^[a-z0-9_-]{2,24}$');

-- ------------------------------------------------------------
-- 2. Đếm số bài đã đăng của từng hệ thống.
--    Tách riêng để public_sections() không phình ra mỗi lần thêm
--    hệ thống, và để hệ thống lạ không làm hỏng cả trang.
-- ------------------------------------------------------------
create or replace function public.section_count(p_section text, p_premium boolean)
returns int language sql security definer stable set search_path = public as $$
  select coalesce(case p_section
    when 'reading' then (select count(*) from reading_texts
                          where published and audience = 'everyone'
                            and (case when p_premium then tier = 'premium'
                                      else coalesce(tier,'free') <> 'premium' end))
    when 'shadow'  then (select count(*) from shadow_videos
                          where published
                            and (case when p_premium then tier = 'premium'
                                      else coalesce(tier,'free') <> 'premium' end))
    when 'dict'    then (select count(*) from shadow_videos
                          where published and jsonb_array_length(subs) > 0
                            and (case when p_premium then tier = 'premium'
                                      else coalesce(tier,'free') <> 'premium' end))
    when 'vsat'    then (select count(*) from vsat_exams
                          where published and kind = 'vsat'
                            and (case when p_premium then tier = 'premium' else tier = 'free' end))
    when 'vstep'   then (select count(*) from vsat_exams
                          where published and kind like 'vstep%'
                            and (case when p_premium then tier = 'premium' else tier = 'free' end))
    when 'hsk'     then (select count(*) from hsk_lessons
                          where published
                            and (case when p_premium then tier = 'premium' else tier = 'free' end))
    else 0
  end, 0)::int;
$$;
revoke all on function public.section_count(text, boolean) from public;
grant execute on function public.section_count(text, boolean) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. Danh sách hệ thống công khai — theo SỔ ĐĂNG KÝ, có thứ tự
-- ------------------------------------------------------------
create or replace function public.public_sections()
returns jsonb language sql security definer stable set search_path = public as $$
  select coalesce(jsonb_agg(x order by ord, sec), '[]'::jsonb) from (
    select sp.section as sec,
           coalesce(nullif(sp.config ->> 'sort_order', '')::numeric, 999) as ord,
           jsonb_build_object(
             'section', sp.section,
             'config',  sp.config,
             'free',    public.section_count(sp.section, false),
             'premium', public.section_count(sp.section, true)
           ) as x
      from section_pricing sp
     where coalesce((sp.config ->> 'public_on')::boolean, false)
  ) s;
$$;
revoke all on function public.public_sections() from public;
grant execute on function public.public_sections() to anon, authenticated;

-- ------------------------------------------------------------
-- 4. HSK: danh sách bài cho trang xem trước
--    Chỉ tên bài và số liệu — KHÔNG có nội dung slide, nên cho khách
--    xem thoải mái. Bài chưa đăng thì không bao giờ lọt vào đây.
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
  ), '[]'::jsonb);
$$;
revoke all on function public.public_hsk_lessons(int) from public;
grant execute on function public.public_hsk_lessons(int) to anon, authenticated;

-- ------------------------------------------------------------
-- 5. HSK: NỘI DUNG một bài.
--    Máy chủ chỉ trả nội dung khi bài đó miễn phí, hoặc người xem
--    thật sự có quyền — giống cách Đọc hiểu đang làm. Khách chưa đăng
--    nhập học thử được bài miễn phí; bài Premium không gửi về máy
--    khách một chữ nào, nên không xem trộm qua mã nguồn được.
-- ------------------------------------------------------------
create or replace function public.public_hsk_lesson(p_lesson_id text)
returns jsonb language sql security definer stable set search_path = public as $$
  select l.data
    from hsk_lessons l
   where l.lesson_id = p_lesson_id
     and l.published
     and (
       l.tier = 'free'
       or public.is_admin() or public.is_teacher() or public.has_premium()
       or (l.course_id is not null and public.has_access() and public.enrolled_in(l.course_id))
     )
   limit 1;
$$;
revoke all on function public.public_hsk_lesson(text) from public;
grant execute on function public.public_hsk_lesson(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 6. Bật công khai + thông tin hiển thị mặc định.
--    Dùng jsonb || nên KHÔNG đè lên phần thầy đã sửa: khoá nào đã có
--    trong config thì giữ nguyên, chỉ thêm khoá còn thiếu.
-- ------------------------------------------------------------
insert into public.section_pricing (section, config) values
  ('vsat',  '{}'::jsonb), ('vstep', '{}'::jsonb), ('hsk', '{}'::jsonb)
on conflict (section) do nothing;

update public.section_pricing set config =
  jsonb_build_object(
    'sort_order', 40,
    'name',    'Luyện thi V-SAT',
    'icon',    '📝',
    'unit',    'đề thi',
    'tagline', 'Luyện tập và thi thử V-SAT với chế độ Practice và Mock Test',
    'cta',     'Luyện tập ngay'
  ) || config || jsonb_build_object('public_on', true)   -- công tắc: bật cho bằng được
 where section = 'vsat';

update public.section_pricing set config =
  jsonb_build_object(
    'sort_order', 50,
    'name',    'Luyện thi VSTEP',
    'icon',    '📖',
    'unit',    'đề thi',
    'tagline', 'Đề thi VSTEP đầy đủ phần Đọc và Nghe, chấm điểm tự động',
    'cta',     'Thi thử ngay'
  ) || config || jsonb_build_object('public_on', true)   -- công tắc: bật cho bằng được
 where section = 'vstep';

update public.section_pricing set config =
  jsonb_build_object(
    'sort_order', 60,
    'name',    'Bài giảng HSK tương tác',
    'icon',    '🀄',
    'unit',    'bài giảng',
    'tagline', 'Học từ vựng, ngữ pháp, bài đọc và luyện tập qua bài giảng tương tác',
    'cta',     'Học thử ngay'
  ) || config || jsonb_build_object('public_on', true)   -- công tắc: bật cho bằng được
 where section = 'hsk';

-- ba công cụ cũ: chỉ thêm thứ tự nếu chưa có, không đụng gì khác
update public.section_pricing set config = jsonb_build_object('sort_order', 10) || config where section = 'reading';
update public.section_pricing set config = jsonb_build_object('sort_order', 20) || config where section = 'shadow';
update public.section_pricing set config = jsonb_build_object('sort_order', 30) || config where section = 'dict';

commit;

-- Kiểm tra nhanh: phải thấy 6 dòng, có vsat / vstep / hsk
select jsonb_array_length(public.public_sections()) as so_he_thong_cong_khai;
select section, config ->> 'sort_order' as thu_tu, config ->> 'public_on' as hien
  from public.section_pricing order by (config ->> 'sort_order')::numeric nulls last;
