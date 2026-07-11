// ------------------------------------------------------------
//  Language support for Thong's Learning Hub (English / Tiếng Việt)
//  To change a translation, edit the text here. To make Vietnamese
//  the default for new visitors, change DEFAULT_LANG to "vi".
// ------------------------------------------------------------

const DEFAULT_LANG = "en";

const I18N = {
  en: {
    lang_name: "Tiếng Việt",          // what the switch button offers
    loading: "Loading…",
    sign_out: "Sign out",

    // --- sign in ---
    signin_title: "Sign in",
    signin_sub: "Use the email and password your teacher gave you.",
    email: "Email",
    password: "Password",
    signin_btn: "Sign in",
    forgot: "Forgot password?",
    msg_enter_both: "Enter your email and password.",
    msg_bad_login: "Those details didn't work. Check them and try again.",
    msg_type_email_first: "Type your email above first, then click 'Forgot password?'.",
    msg_reset_sent: "Check your inbox — we sent you a password reset link.",
    msg_reset_fail: "Could not send the email. Try again in a minute.",
    msg_kicked: "This account was signed in on another device, so this session was signed out.",

    // --- reset password ---
    reset_title: "Set a new password",
    reset_sub: "Choose a new password for your account.",
    new_pw: "New password",
    repeat_pw: "Repeat new password",
    ph_min8: "At least 8 characters",
    ph_same: "Same as above",
    save_new_pw: "Save new password",
    err_min8: "Use at least 8 characters.",
    err_mismatch: "The two passwords don't match.",
    err_need_link: "This page only works from the link in your reset email. Go back to the sign-in page and click 'Forgot password?'.",
    err_save: "Could not save: ",
    reset_ok: "Password saved! Taking you to your dashboard…",

    // --- student dashboard ---
    my_lessons: "My lessons",
    welcome: "Welcome back",
    open: "Open",
    mark_done: "Mark done",
    completed_pill: "✓ Completed",
    done_count: "{d} of {t} done",
    no_lessons_course: "No lessons in this course yet.",
    other_lessons: "Other lessons",
    congrats: " — completed. Great work!",
    not_enrolled: "You're not enrolled in any course yet. Your teacher will add you soon.",
    my_profile: "My profile",
    change_photo: "Change photo",
    my_name: "My name",
    about_me: "About me",
    ph_name: "How your teacher sees you",
    ph_bio: "A sentence about yourself (optional)",
    save_profile: "Save profile",
    saved: "Saved ✓",
    uploading: "Uploading…",
    img_too_big: "Please choose an image under 2 MB.",
    upload_failed: "Upload failed: ",
    file_open_fail: "Could not open the file: ",
    save_retry: "Could not save. Try again."
  },

  vi: {
    lang_name: "English",
    loading: "Đang tải…",
    sign_out: "Đăng xuất",

    // --- đăng nhập ---
    signin_title: "Đăng nhập",
    signin_sub: "Hãy dùng email và mật khẩu giáo viên đã cấp cho bạn.",
    email: "Email",
    password: "Mật khẩu",
    signin_btn: "Đăng nhập",
    forgot: "Quên mật khẩu?",
    msg_enter_both: "Hãy nhập email và mật khẩu.",
    msg_bad_login: "Thông tin đăng nhập chưa đúng. Hãy kiểm tra và thử lại.",
    msg_type_email_first: "Hãy nhập email ở trên trước, rồi bấm 'Quên mật khẩu?'.",
    msg_reset_sent: "Hãy kiểm tra hộp thư — liên kết đặt lại mật khẩu đã được gửi.",
    msg_reset_fail: "Không gửi được email. Hãy thử lại sau ít phút.",
    msg_kicked: "Tài khoản vừa đăng nhập trên thiết bị khác nên phiên này đã bị đăng xuất.",

    // --- đặt lại mật khẩu ---
    reset_title: "Đặt mật khẩu mới",
    reset_sub: "Hãy chọn mật khẩu mới cho tài khoản của bạn.",
    new_pw: "Mật khẩu mới",
    repeat_pw: "Nhập lại mật khẩu mới",
    ph_min8: "Ít nhất 8 ký tự",
    ph_same: "Giống ô trên",
    save_new_pw: "Lưu mật khẩu mới",
    err_min8: "Hãy dùng ít nhất 8 ký tự.",
    err_mismatch: "Hai mật khẩu không khớp.",
    err_need_link: "Trang này chỉ hoạt động khi mở từ liên kết trong email đặt lại mật khẩu. Hãy quay lại trang đăng nhập và bấm 'Quên mật khẩu?'.",
    err_save: "Không lưu được: ",
    reset_ok: "Đã lưu mật khẩu! Đang chuyển đến trang của bạn…",

    // --- trang học viên ---
    my_lessons: "Bài học của tôi",
    welcome: "Chào mừng trở lại",
    open: "Mở",
    mark_done: "Đánh dấu xong",
    completed_pill: "✓ Đã hoàn thành",
    done_count: "Đã xong {d}/{t}",
    no_lessons_course: "Khóa học này chưa có bài học.",
    other_lessons: "Bài học khác",
    congrats: " — đã hoàn thành. Làm tốt lắm!",
    not_enrolled: "Bạn chưa được ghi danh vào khóa học nào. Giáo viên sẽ sớm thêm bạn.",
    my_profile: "Hồ sơ của tôi",
    change_photo: "Đổi ảnh",
    my_name: "Tên của tôi",
    about_me: "Giới thiệu",
    ph_name: "Tên mà giáo viên sẽ thấy",
    ph_bio: "Một câu giới thiệu về bạn (không bắt buộc)",
    save_profile: "Lưu hồ sơ",
    saved: "Đã lưu ✓",
    uploading: "Đang tải lên…",
    img_too_big: "Hãy chọn ảnh dưới 2 MB.",
    upload_failed: "Tải lên thất bại: ",
    file_open_fail: "Không mở được tệp: ",
    save_retry: "Không lưu được. Hãy thử lại."
  }
};

let LANG = DEFAULT_LANG;
try { LANG = localStorage.getItem("hub_lang") || DEFAULT_LANG; } catch (e) {}
if (!I18N[LANG]) LANG = DEFAULT_LANG;

function t(key) {
  return (I18N[LANG] && I18N[LANG][key]) ?? I18N.en[key] ?? key;
}
function tf(key, vars) {
  let s = t(key);
  for (const k in vars) s = s.replace("{" + k + "}", vars[k]);
  return s;
}
function otherLang() { return LANG === "en" ? "vi" : "en"; }
function setLang(l) {
  try { localStorage.setItem("hub_lang", l); } catch (e) {}
  location.reload();
}
// Translate static elements marked with data-i18n / data-i18n-ph.
function applyI18n() {
  document.documentElement.lang = LANG;
  document.querySelectorAll("[data-i18n]").forEach(el =>
    el.textContent = t(el.getAttribute("data-i18n")));
  document.querySelectorAll("[data-i18n-ph]").forEach(el =>
    el.placeholder = t(el.getAttribute("data-i18n-ph")));
}
