-- ============================================================
--  Migration 54: Kho tệp âm thanh cho VSTEP Listening
--
--  Bảng đề thi KHÔNG phải sửa gì: migration53 đã cho phép
--  kind = 'vstep-listening', và mọi hàm (danh sách đề, ghi kết quả,
--  công tắc bán/xem trước) đều chạy theo cột kind. Đề Nghe vì vậy
--  dùng lại nguyên bộ quyền, tiến độ và lịch sử làm bài của Đọc.
--
--  Thứ duy nhất còn thiếu là chỗ cất FILE MP3. Mỗi đề Nghe nặng
--  khoảng 40 MB nên không thể nhét vào cột dữ liệu — phải để trong
--  kho tệp (Storage) rồi lưu đường dẫn.
--
--  Chạy SAU migration53. Có transaction: lỗi = không đổi gì.
--  Chạy lại nhiều lần vẫn an toàn.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Kho tệp âm thanh — công khai để thẻ <audio> phát được
--    Học viên chỉ mở được đề khi có quyền (RLS ở bảng vsat_exams),
--    nhưng bản thân tệp mp3 phải đọc công khai thì trình duyệt mới
--    tua/phát mượt được — giống hệt cách ảnh bìa bài đọc đang làm.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('vstep-audio', 'vstep-audio', true)
on conflict (id) do nothing;

-- giới hạn 60 MB mỗi tệp và chỉ nhận âm thanh
update storage.buckets
   set public = true,
       file_size_limit = 62914560,
       allowed_mime_types = array['audio/mpeg','audio/mp3','audio/mp4','audio/m4a',
                                  'audio/x-m4a','audio/wav','audio/ogg','audio/webm']
 where id = 'vstep-audio';

drop policy if exists "vstep audio public read" on storage.objects;
create policy "vstep audio public read" on storage.objects
  for select using (bucket_id = 'vstep-audio');

drop policy if exists "vstep audio staff write" on storage.objects;
create policy "vstep audio staff write" on storage.objects
  for all to authenticated
  using (bucket_id = 'vstep-audio' and (public.is_teacher() or public.is_admin()))
  with check (bucket_id = 'vstep-audio' and (public.is_teacher() or public.is_admin()));

commit;
