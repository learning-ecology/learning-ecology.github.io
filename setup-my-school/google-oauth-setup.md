# Bật "Đăng nhập với Google" — hướng dẫn cấu hình (một lần)

Nút **Đăng nhập với Google** ở `login.html` và `signup.html` dùng **Google OAuth
của Supabase**. Toàn bộ bí mật (Client Secret) nằm ở **Supabase**, KHÔNG có trong
mã frontend. Sau khi làm 3 bước dưới đây, nút sẽ chạy trên mọi máy (desktop +
điện thoại) và trên tên miền thật `learningecology.io.vn`.

> Dự án Supabase: `lqeetnlfqmarlqmbxusn.supabase.co`
> Callback của Supabase (dùng ở bước 1): `https://lqeetnlfqmarlqmbxusn.supabase.co/auth/v1/callback`

---

## 1) Google Cloud Console — tạo OAuth Client
1. Vào <https://console.cloud.google.com> → tạo (hoặc chọn) một Project.
2. **APIs & Services → OAuth consent screen**: chọn **External**, điền tên ứng
   dụng “Learning Ecology”, email hỗ trợ, và **Publish** (Testing cũng chạy được
   nhưng chỉ cho email thử; nên Publish để mọi học viên dùng được).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized JavaScript origins** — thêm:
     - `https://learningecology.io.vn`
     - `https://learning-ecology.github.io`
     - `http://localhost:8798` (và cổng bạn hay dùng khi chạy thử máy tính)
   - **Authorized redirect URIs** — thêm **đúng** callback của Supabase:
     - `https://lqeetnlfqmarlqmbxusn.supabase.co/auth/v1/callback`
4. Bấm **Create** → copy **Client ID** và **Client Secret**.

## 2) Supabase — bật provider Google
1. Supabase Dashboard → **Authentication → Providers → Google** → bật **Enable**.
2. Dán **Client ID** và **Client Secret** (từ bước 1) → **Save**.
   *(Client Secret chỉ nằm ở đây — không bao giờ đưa vào frontend.)*

## 3) Supabase — khai báo URL tin cậy
Authentication → **URL Configuration**:
- **Site URL**: `https://learningecology.io.vn`
- **Redirect URLs** — thêm tất cả (mỗi dòng một mục; `**` là ký tự đại diện để
  giữ được `?next=`):
  - `https://learningecology.io.vn/**`
  - `https://learning-ecology.github.io/**`
  - `http://localhost:8798/**`
  - `http://127.0.0.1:8798/**`

  > Trang chỉ cho `redirectTo` quay về **chính tên miền hiện tại** + `?next=` đã
  > được kiểm tra (chỉ trang nội bộ, không phải login/signup/reset). Vì vậy các
  > mục trên là đủ; thêm cổng khác nếu bạn chạy thử ở cổng khác.

---

## Tài khoản trùng email (không tạo tài khoản đôi)
Supabase **tự liên kết theo email đã xác minh**: nếu học viên đã có tài khoản
email/mật khẩu (email đã xác nhận) rồi đăng nhập bằng Google **cùng email**,
Supabase gắn danh tính Google vào **cùng một tài khoản** — không tạo tài khoản
mới, không đổi vai trò/Premium/dữ liệu cũ. (Để email được xác minh, giữ mặc định
“Confirm email” của Supabase, hoặc dùng chính Google — email Google luôn đã xác
minh.)

## Hồ sơ tài khoản mới
- Trigger `handle_new_user` (đã có trong `migration.sql`) tự tạo hồ sơ cho tài
  khoản mới với **vai trò `student`** và **tên** lấy từ Google.
- **Ảnh đại diện** Google được điền phía client (`google-auth.js`) **chỉ khi hồ
  sơ còn trống** — không ghi đè ảnh/tên học viên đã tự đặt.

Không cần chạy SQL mới cho tính năng này.
