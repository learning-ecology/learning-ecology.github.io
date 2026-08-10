-- ============================================================
--  migration58 — HSK Slides: cho phép lưu BẢN GHI PHÁT ÂM
--  (Phase 58)
--
--  Bảng hsk_media đã sẵn sàng từ migration55: cột `kind` vốn đã
--  nhận 'audio'. Thứ duy nhất còn chặn là kho tệp 'hsk-media' —
--  migration55 chỉ cho phép các định dạng ẢNH, nên tệp mp3 phát âm
--  bị từ chối ngay lúc tải lên.
--
--  Sau khi chạy: mỗi từ/câu chỉ cần sinh giọng đọc MỘT lần, lần sau
--  (và với mọi học viên, mọi bài khác) đều dùng lại bản ghi đã có —
--  không gọi lại dịch vụ đọc, không tốn lượt, và nghe nhanh hơn.
--
--  An toàn khi chạy nhiều lần.
--  Không tạo bảng mới, không đụng tới dữ liệu đang có.
-- ============================================================

update storage.buckets
   set allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
         'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg'
       ],
       -- ảnh vẫn nhỏ; nới lên 10 MB để câu dài hoặc bản ghi của thầy cũng vừa
       file_size_limit = 10485760
 where id = 'hsk-media';

-- Quyền không đổi: ai cũng NGHE được (bucket công khai), chỉ giáo viên
-- và quản trị mới ghi được — đúng như migration55 đã đặt.

-- Kiểm tra nhanh: hai dòng dưới phải trả về 'audio/mpeg' và 10485760
select allowed_mime_types, file_size_limit
  from storage.buckets
 where id = 'hsk-media';
