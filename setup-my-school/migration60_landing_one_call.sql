-- ============================================================
--  migration60 — Trang chủ: 8 lượt hỏi máy chủ gộp còn 1
--  (Phase 60 — tăng tốc)
--
--  Vì sao chậm: trang chủ đang gọi TÁM yêu cầu REST riêng biệt
--  (landing_settings, courses, trials, teachers, achievements,
--  feedback, gallery, classes) rồi `await Promise.all` — nghĩa là
--  phải chờ CẢ TÁM xong mới vẽ được một chữ. Mạng ở Việt Nam đi
--  Singapore mỗi lượt mất 150–400 ms, lại thêm bắt tay TLS cho
--  lượt đầu; đo thực tế nhóm này ngốn ~1,8 giây.
--
--  Hàm dưới đây trả về ĐÚNG những dữ liệu ấy trong MỘT lượt.
--  Chỉ lấy dòng đã đăng (status = 'published') — bản nháp không
--  bao giờ ra ngoài. Trang chủ vẫn tự lọc thêm một lần nữa nên
--  hành vi không đổi.
--
--  Không tạo bảng, không sửa dữ liệu. Chạy lại nhiều lần vô hại.
-- ============================================================

create or replace function public.public_landing()
returns jsonb language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'config',       coalesce((select config from landing_settings where id = 1), '{}'::jsonb),
    'courses',      public._landing_rows('landing_courses'),
    'trials',       public._landing_rows('landing_trials'),
    'teachers',     public._landing_rows('landing_teachers'),
    'achievements', public._landing_rows('landing_achievements'),
    'feedback',     public._landing_rows('landing_feedback'),
    'gallery',      public._landing_rows('landing_gallery'),
    'classes',      public._landing_rows('landing_classes')
  );
$$;

-- Gom một bảng thành mảng jsonb, sắp đúng thứ tự trang chủ đang dùng.
-- Bảng nào chưa tồn tại (migration cũ chưa chạy) thì trả mảng rỗng
-- thay vì làm hỏng cả trang.
create or replace function public._landing_rows(p_table text)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare r jsonb;
begin
  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t) order by t.sort_order nulls last, t.updated_at), ''[]''::jsonb)
       from %I t where t.status = ''published''', p_table) into r;
  return coalesce(r, '[]'::jsonb);
exception when undefined_table or undefined_column then
  return '[]'::jsonb;
end;
$$;

revoke all on function public.public_landing() from public;
revoke all on function public._landing_rows(text) from public;
grant execute on function public.public_landing() to anon, authenticated;

-- Kiểm tra nhanh: phải thấy các khoá và số phần tử
select jsonb_object_keys(public.public_landing()) as khoa;
select jsonb_array_length(public.public_landing() -> 'courses') as so_khoa_hoc;
