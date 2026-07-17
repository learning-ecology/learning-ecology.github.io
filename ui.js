// ------------------------------------------------------------
//  ui.js — shared UI library for Thong's Learning Hub (Phase 1)
//  Toasts, dialogs, icons, skeletons, CSV export, EN/VI text
//  for the staff pages. Uses the same language setting
//  ("hub_lang") as the student pages, so the choice follows
//  the user everywhere.
// ------------------------------------------------------------

(function () {
  // ---------- language ----------
  let LANG = "en";
  try { LANG = localStorage.getItem("hub_lang") || "en"; } catch (e) {}
  if (!["en", "vi"].includes(LANG)) LANG = "en";

  const S = {
    en: {
      sign_out: "Sign out", loading: "Loading…", overview: "Overview",
      students: "Students", teachers: "Teachers", people: "People",
      enrollments: "Enrollments", announcements: "Announcements",
      progress: "Progress", courses: "Courses", licenses: "Licenses",
      organizations: "Organizations", dashboard: "Dashboard",
      email: "Email", password: "Password", full_name: "Full name",
      full_name_opt: "Full name (optional)", role: "Role", course: "Course",
      student: "Student", teacher: "Teacher", org_admin: "Org admin",
      create_account: "Create account", create: "Create", enroll: "Enroll",
      assign: "Assign", post: "Post", save: "Save", cancel: "Cancel",
      confirm: "Confirm", delete_: "Delete", remove: "Remove", revoke: "Revoke",
      close: "Close", export_csv: "Export CSV",
      invite_instead: "Email an invitation instead (they choose their own password)",
      invite_note: "Note: invitation emails on the free plan are limited to a few per hour.",
      pw_min6: "min 6 characters", their_teacher: "Their teacher",
      message: "Message", send_to: "Send to", whole_org: "Whole organization",
      no_courses: "No courses yet", no_students: "No students yet",
      no_teachers: "No teachers yet",
      created_ok: "Account created ✓", invited_ok: "Invitation sent ✓ — they'll get an email to set their password.",
      saved_ok: "Saved ✓", posted_ok: "Posted ✓", enrolled_ok: "Enrolled ✓",
      assigned_ok: "Assigned ✓", deleted_ok: "Deleted ✓", removed_ok: "Removed ✓",
      err_create: "Could not create: ", err_save: "Could not save: ",
      err_post: "Could not post: ", err_enroll: "Could not enroll: ",
      err_delete: "Could not delete: ", err_generic: "Something went wrong: ",
      need_email_pw: "Enter an email and a password of at least 6 characters.",
      need_email: "Enter an email address.",
      pick_student_course: "Pick a student and a course.",
      pick_teacher_course: "Pick a teacher and a course.",
      write_message: "Write a message first.", pick_course: "Pick a course.",
      already_enrolled: "That student is already enrolled in that course.",
      already_assigned: "That teacher is already assigned to that course.",
      seat_limit: "Seat limit reached for this course — contact the platform owner for more seats.",
      seats_used: "seats used", seats: "seats", no_expiry: "no expiry",
      valid_until: "valid until", license_until: "license until",
      unlimited: "Unlimited", suspended: "Suspended", expired: "Expired",
      until: "until", lessons: "lessons", completed: "Completed",
      in_progress: "in progress", not_started: "not started",
      study_time: "Study time", last_active: "Last active", never: "never",
      access: "Access", actions: "Actions", records: "records",
      all_courses: "All courses", all_students: "All students",
      reset_pw: "Reset password", new_password: "New password",
      reset_pw_ok: "Password changed ✓ — tell them the new password.",
      del_user_title: "Delete this account?",
      del_user_body: "Their profile, enrollments, and all progress records will be permanently removed. This cannot be undone.",
      del_ann_title: "Delete this announcement?",
      remove_enr_title: "Remove this enrollment?",
      remove_enr_body: "The student will no longer see that course's lessons.",
      remove_asgn_title: "Remove this assignment?",
      remove_asgn_body: "The teacher loses access to this course.",
      revoke_lic_title: "Revoke this license?",
      revoke_lic_body: "The organization immediately loses access to the course.",
      suspend_title: "Suspend this account?",
      suspend_body: "The student will be blocked from all lessons until reactivated.",
      reactivate: "Reactivate", suspend: "Suspend", extend: "Extend",
      expiring_soon: "expiring soon", days_left: "days left",
      alert_lic_expiring: "license(s) expiring within 30 days:",
      alert_seats_full: "course(s) at or near their seat limit:",
      needs_attention: "Needs attention",
      my_courses: "My courses", my_students: "My students",
      my_teaching: "My teaching", lessons_completed: "Lessons completed",
      by_students: "by my students", licensed_courses: "Licensed courses",
      add_student: "Add a student account", create_student: "Create student",
      enroll_title: "Enroll a student in a course",
      no_courses_assigned: "No courses assigned to you yet — ask your administrator (or the platform owner).",
      no_students_hint: "No students yet — create an account above, then enroll them in a course.",
      no_enrollments: "No enrollments yet.", no_announcements: "Nothing posted yet.",
      no_licenses: "No course licenses yet — contact the platform owner to purchase courses.",
      our_licenses: "Our course licenses", assign_title: "Assign a teacher to a course",
      students_access: "Students — access & activity", no_assignments: "No assignments yet.",
      // --- assignments ---
      asgn: "Assignments", new_asgn: "New assignment", title_label: "Title",
      instructions: "Instructions", due_date: "Due date",
      points: "Max points (optional)", create_asgn: "Create assignment",
      submissions: "submissions", grade: "Grade", feedback: "Feedback",
      save_grade: "Save grade", graded: "Graded", submitted: "Submitted",
      not_submitted: "Not submitted", overdue: "Overdue", due: "Due",
      no_asgn_teacher: "No assignments yet — create one above.",
      no_asgn_student: "No assignments yet.",
      del_asgn_title: "Delete this assignment?",
      del_asgn_body: "All student submissions and grades for it will be deleted too.",
      asgn_created: "Assignment created ✓", grade_saved: "Grade saved ✓",
      submit_answer: "Submit answer", your_answer: "Your answer",
      answer_saved: "Answer submitted ✓", edit_answer: "Save changes",
      need_title_course: "Add a title and pick a course.",
      write_answer: "Write your answer first.",
      editable_note: "You can edit your answer until it is graded.",
      score: "Score", time: "Time",
      // --- discussions ---
      disc: "Discussions", new_question: "New question",
      question_ph: "What do you want to ask?", first_msg: "Describe your question…",
      ask: "Post question", reply: "Reply", reply_ph: "Write a reply…",
      back_list: "← All questions", replies: "replies",
      pinned: "Pinned", locked: "Locked", pin: "Pin", unpin: "Unpin",
      lock: "Lock", unlock: "Unlock",
      del_thread_title: "Delete this question?",
      del_thread_body: "All its replies will be deleted too.",
      del_post_title: "Delete this reply?",
      no_threads: "No questions yet — be the first to ask!",
      need_q: "Add a title and a message.",
      q_posted: "Question posted ✓", reply_posted: "Reply posted ✓",
      locked_note: "This discussion is locked.",
      // --- reports ---
      reports: "Reports", report_card: "Student report card",
      per_course: "By course", per_teacher: "By teacher",
      avg_completion: "Avg completion", avg_score: "Avg quiz score",
      total_time: "Study time", enrolled: "enrolled", print: "Print",
      select_student: "Choose a student…", generated: "Generated",
      asgn_grades: "Assignment grades", no_data: "No data yet.",
      completion: "Completion",
      // --- notifications + certificates + drill-down ---
      notifications: "Notifications", no_notifs: "Nothing new.",
      detail: "Details",
      cert_title: "Certificate of Completion",
      cert_awarded: "This certificate is proudly awarded to",
      cert_completed: "for successfully completing the course",
      cert_date: "Date", cert_get: "Certificate",
      // --- schedule + materials + review ---
      schedule: "Schedule", new_session: "New class session",
      when: "Date & time", duration: "Duration (min)",
      location_link: "Room / meeting link", notes: "Notes",
      upcoming: "Upcoming classes", past: "Past",
      no_sessions: "No upcoming classes.",
      session_created: "Class session created ✓",
      del_session_title: "Delete this class session?",
      need_session: "Add a title and a date & time.",
      join: "Open link", general: "— general —",
      materials: "My materials", materials_student: "Extra materials from your teacher",
      add_material: "Add material", link_label: "Link (or upload a file instead)",
      uploaded_file: "uploaded file", material_added: "Material added ✓",
      del_material_title: "Delete this material?",
      need_material: "Add a title, plus a link or a file.",
      open_btn: "Open", uploading: "Uploading…",
      review_title: "Suggested review",
      review_hint: "Lessons where your best quiz score is below 70% — a quick review will help.",
      review_go: "Review",
      nav_home: "Home", profile_tab: "Profile", menu: "Menu",
      premium: "Premium", free_plan: "Free", plan: "Plan",
      upgrade: "Upgrade", upgrade_title: "Upgrade to Premium",
      upgrade_body: "Unlock every Premium lesson, complete course roadmaps, and all future premium content.",
      upgrade_hint: "Some lessons are Premium — upgrade to unlock everything.",
      contact_upgrade: "Contact your teacher to upgrade",
      premium_active: "Premium active",
      branding: "Organization branding",
      brand_hint: "Pick your organization's color — it is applied to buttons, tabs, and highlights on all your pages (teachers and students included).",
      brand_saved: "Branding saved ✓",
      reset_default: "Reset to default",
      // --- Phase 4: membership + lesson images ---
      membership: "Membership", mb_teacher_pro: "Teacher Pro",
      mb_teacher_prem: "Teacher Premium", mb_org: "Organization", mb_owner: "Owner",
      all_accounts: "All accounts", free_accounts: "Free accounts",
      premium_accounts: "Premium accounts", teacher_accounts: "Teacher accounts",
      org_accounts: "Organization accounts",
      lesson_image: "Lesson image", replace_image: "Replace image",
      remove_image: "Remove image", image_saved: "Image saved ✓",
      image_removed: "Image removed ✓",
      lessons_left: "remaining",
      lang_btn: "VI",
    },
    vi: {
      sign_out: "Đăng xuất", loading: "Đang tải…", overview: "Tổng quan",
      students: "Học viên", teachers: "Giáo viên", people: "Thành viên",
      enrollments: "Ghi danh", announcements: "Thông báo",
      progress: "Tiến độ", courses: "Khóa học", licenses: "Bản quyền khóa học",
      organizations: "Tổ chức", dashboard: "Bảng điều khiển",
      email: "Email", password: "Mật khẩu", full_name: "Họ và tên",
      full_name_opt: "Họ và tên (không bắt buộc)", role: "Vai trò", course: "Khóa học",
      student: "Học viên", teacher: "Giáo viên", org_admin: "Quản trị viên",
      create_account: "Tạo tài khoản", create: "Tạo", enroll: "Ghi danh",
      assign: "Phân công", post: "Đăng", save: "Lưu", cancel: "Hủy",
      confirm: "Xác nhận", delete_: "Xóa", remove: "Gỡ bỏ", revoke: "Thu hồi",
      close: "Đóng", export_csv: "Xuất CSV",
      invite_instead: "Gửi email mời thay vì đặt mật khẩu (họ tự chọn mật khẩu)",
      invite_note: "Lưu ý: gói miễn phí chỉ gửi được vài email mời mỗi giờ.",
      pw_min6: "tối thiểu 6 ký tự", their_teacher: "Giáo viên phụ trách",
      message: "Nội dung", send_to: "Gửi đến", whole_org: "Toàn tổ chức",
      no_courses: "Chưa có khóa học", no_students: "Chưa có học viên",
      no_teachers: "Chưa có giáo viên",
      created_ok: "Đã tạo tài khoản ✓", invited_ok: "Đã gửi lời mời ✓ — họ sẽ nhận email để tự đặt mật khẩu.",
      saved_ok: "Đã lưu ✓", posted_ok: "Đã đăng ✓", enrolled_ok: "Đã ghi danh ✓",
      assigned_ok: "Đã phân công ✓", deleted_ok: "Đã xóa ✓", removed_ok: "Đã gỡ bỏ ✓",
      err_create: "Không thể tạo: ", err_save: "Không thể lưu: ",
      err_post: "Không thể đăng: ", err_enroll: "Không thể ghi danh: ",
      err_delete: "Không thể xóa: ", err_generic: "Đã xảy ra lỗi: ",
      need_email_pw: "Nhập email và mật khẩu tối thiểu 6 ký tự.",
      need_email: "Nhập địa chỉ email.",
      pick_student_course: "Chọn một học viên và một khóa học.",
      pick_teacher_course: "Chọn một giáo viên và một khóa học.",
      write_message: "Hãy viết nội dung trước.", pick_course: "Chọn một khóa học.",
      already_enrolled: "Học viên này đã được ghi danh vào khóa học đó.",
      already_assigned: "Giáo viên này đã được phân công khóa học đó.",
      seat_limit: "Đã hết chỗ cho khóa học này — liên hệ chủ nền tảng để mua thêm chỗ.",
      seats_used: "chỗ đã dùng", seats: "chỗ", no_expiry: "không hết hạn",
      valid_until: "hiệu lực đến", license_until: "bản quyền đến",
      unlimited: "Không giới hạn", suspended: "Tạm ngưng", expired: "Hết hạn",
      until: "đến", lessons: "bài học", completed: "Hoàn thành",
      in_progress: "đang học", not_started: "chưa bắt đầu",
      study_time: "Thời gian học", last_active: "Hoạt động cuối", never: "chưa từng",
      access: "Quyền truy cập", actions: "Thao tác", records: "bản ghi",
      all_courses: "Tất cả khóa học", all_students: "Tất cả học viên",
      reset_pw: "Đặt lại mật khẩu", new_password: "Mật khẩu mới",
      reset_pw_ok: "Đã đổi mật khẩu ✓ — hãy báo mật khẩu mới cho họ.",
      del_user_title: "Xóa tài khoản này?",
      del_user_body: "Hồ sơ, ghi danh và toàn bộ tiến độ học sẽ bị xóa vĩnh viễn. Không thể hoàn tác.",
      del_ann_title: "Xóa thông báo này?",
      remove_enr_title: "Gỡ ghi danh này?",
      remove_enr_body: "Học viên sẽ không còn thấy bài học của khóa này.",
      remove_asgn_title: "Gỡ phân công này?",
      remove_asgn_body: "Giáo viên sẽ mất quyền truy cập khóa học này.",
      revoke_lic_title: "Thu hồi bản quyền này?",
      revoke_lic_body: "Tổ chức sẽ mất quyền truy cập khóa học ngay lập tức.",
      suspend_title: "Tạm ngưng tài khoản này?",
      suspend_body: "Học viên sẽ không truy cập được bài học cho đến khi kích hoạt lại.",
      reactivate: "Kích hoạt lại", suspend: "Tạm ngưng", extend: "Gia hạn",
      expiring_soon: "sắp hết hạn", days_left: "ngày còn lại",
      alert_lic_expiring: "bản quyền sắp hết hạn trong 30 ngày:",
      alert_seats_full: "khóa học đã đầy hoặc gần hết chỗ:",
      needs_attention: "Cần chú ý",
      my_courses: "Khóa học của tôi", my_students: "Học viên của tôi",
      my_teaching: "Lớp của tôi", lessons_completed: "Bài học hoàn thành",
      by_students: "bởi học viên của tôi", licensed_courses: "Khóa học có bản quyền",
      add_student: "Tạo tài khoản học viên", create_student: "Tạo học viên",
      enroll_title: "Ghi danh học viên vào khóa học",
      no_courses_assigned: "Bạn chưa được phân công khóa học nào — hãy hỏi quản trị viên (hoặc chủ nền tảng).",
      no_students_hint: "Chưa có học viên — hãy tạo tài khoản ở trên rồi ghi danh vào khóa học.",
      no_enrollments: "Chưa có ghi danh nào.", no_announcements: "Chưa đăng gì.",
      no_licenses: "Chưa có bản quyền khóa học — liên hệ chủ nền tảng để mua.",
      our_licenses: "Bản quyền khóa học của chúng tôi", assign_title: "Phân công giáo viên cho khóa học",
      students_access: "Học viên — truy cập & hoạt động", no_assignments: "Chưa có phân công nào.",
      // --- assignments ---
      asgn: "Bài tập", new_asgn: "Bài tập mới", title_label: "Tiêu đề",
      instructions: "Hướng dẫn", due_date: "Hạn nộp",
      points: "Điểm tối đa (không bắt buộc)", create_asgn: "Tạo bài tập",
      submissions: "bài nộp", grade: "Điểm", feedback: "Nhận xét",
      save_grade: "Lưu điểm", graded: "Đã chấm", submitted: "Đã nộp",
      not_submitted: "Chưa nộp", overdue: "Quá hạn", due: "Hạn",
      no_asgn_teacher: "Chưa có bài tập — hãy tạo ở trên.",
      no_asgn_student: "Chưa có bài tập nào.",
      del_asgn_title: "Xóa bài tập này?",
      del_asgn_body: "Toàn bộ bài nộp và điểm của học viên cũng sẽ bị xóa.",
      asgn_created: "Đã tạo bài tập ✓", grade_saved: "Đã lưu điểm ✓",
      submit_answer: "Nộp bài", your_answer: "Bài làm của bạn",
      answer_saved: "Đã nộp bài ✓", edit_answer: "Lưu thay đổi",
      need_title_course: "Nhập tiêu đề và chọn khóa học.",
      write_answer: "Hãy viết bài làm trước.",
      editable_note: "Bạn có thể sửa bài làm cho đến khi được chấm điểm.",
      score: "Điểm số", time: "Thời gian",
      // --- discussions ---
      disc: "Thảo luận", new_question: "Câu hỏi mới",
      question_ph: "Bạn muốn hỏi điều gì?", first_msg: "Mô tả câu hỏi của bạn…",
      ask: "Đăng câu hỏi", reply: "Trả lời", reply_ph: "Viết câu trả lời…",
      back_list: "← Tất cả câu hỏi", replies: "trả lời",
      pinned: "Đã ghim", locked: "Đã khóa", pin: "Ghim", unpin: "Bỏ ghim",
      lock: "Khóa", unlock: "Mở khóa",
      del_thread_title: "Xóa câu hỏi này?",
      del_thread_body: "Toàn bộ câu trả lời cũng sẽ bị xóa.",
      del_post_title: "Xóa câu trả lời này?",
      no_threads: "Chưa có câu hỏi nào — hãy là người đầu tiên!",
      need_q: "Nhập tiêu đề và nội dung.",
      q_posted: "Đã đăng câu hỏi ✓", reply_posted: "Đã trả lời ✓",
      locked_note: "Cuộc thảo luận này đã bị khóa.",
      // --- reports ---
      reports: "Báo cáo", report_card: "Phiếu báo cáo học viên",
      per_course: "Theo khóa học", per_teacher: "Theo giáo viên",
      avg_completion: "Hoàn thành TB", avg_score: "Điểm quiz TB",
      total_time: "Thời gian học", enrolled: "đã ghi danh", print: "In",
      select_student: "Chọn học viên…", generated: "Ngày lập",
      asgn_grades: "Điểm bài tập", no_data: "Chưa có dữ liệu.",
      completion: "Hoàn thành",
      // --- notifications + certificates + drill-down ---
      notifications: "Thông báo", no_notifs: "Không có thông báo mới.",
      detail: "Chi tiết",
      cert_title: "Chứng nhận hoàn thành khóa học",
      cert_awarded: "Chứng nhận này được trao cho",
      cert_completed: "vì đã hoàn thành xuất sắc khóa học",
      cert_date: "Ngày", cert_get: "Nhận chứng nhận",
      // --- schedule + materials + review ---
      schedule: "Lịch học", new_session: "Buổi học mới",
      when: "Ngày & giờ", duration: "Thời lượng (phút)",
      location_link: "Phòng / liên kết học online", notes: "Ghi chú",
      upcoming: "Buổi học sắp tới", past: "Đã qua",
      no_sessions: "Chưa có buổi học nào sắp tới.",
      session_created: "Đã tạo buổi học ✓",
      del_session_title: "Xóa buổi học này?",
      need_session: "Nhập tiêu đề và ngày giờ.",
      join: "Mở liên kết", general: "— chung —",
      materials: "Tài liệu của tôi", materials_student: "Tài liệu bổ sung từ giáo viên",
      add_material: "Thêm tài liệu", link_label: "Liên kết (hoặc tải tệp lên)",
      uploaded_file: "tệp đã tải lên", material_added: "Đã thêm tài liệu ✓",
      del_material_title: "Xóa tài liệu này?",
      need_material: "Nhập tiêu đề, kèm liên kết hoặc tệp.",
      open_btn: "Mở", uploading: "Đang tải lên…",
      review_title: "Gợi ý ôn tập",
      review_hint: "Các bài học có điểm quiz cao nhất dưới 70% — nên ôn lại nhé.",
      review_go: "Ôn lại",
      nav_home: "Trang chủ", profile_tab: "Hồ sơ", menu: "Menu",
      premium: "Premium", free_plan: "Miễn phí", plan: "Gói",
      upgrade: "Nâng cấp", upgrade_title: "Nâng cấp lên Premium",
      upgrade_body: "Mở khóa toàn bộ bài học Premium, lộ trình đầy đủ của các khóa học và mọi nội dung nâng cao trong tương lai.",
      upgrade_hint: "Một số bài học thuộc gói Premium — nâng cấp để mở khóa tất cả.",
      contact_upgrade: "Liên hệ giáo viên để nâng cấp",
      premium_active: "Đang dùng gói Premium",
      branding: "Màu thương hiệu tổ chức",
      brand_hint: "Chọn màu của tổ chức — màu này áp dụng cho nút bấm, thẻ và điểm nhấn trên mọi trang của bạn (kể cả giáo viên và học viên).",
      brand_saved: "Đã lưu màu thương hiệu ✓",
      reset_default: "Khôi phục mặc định",
      // --- Phase 4: membership + lesson images ---
      membership: "Gói tài khoản", mb_teacher_pro: "Teacher Pro",
      mb_teacher_prem: "Teacher Premium", mb_org: "Tổ chức", mb_owner: "Chủ nền tảng",
      all_accounts: "Tất cả tài khoản", free_accounts: "Tài khoản miễn phí",
      premium_accounts: "Tài khoản Premium", teacher_accounts: "Tài khoản giáo viên",
      org_accounts: "Tài khoản tổ chức",
      lesson_image: "Ảnh bài học", replace_image: "Đổi ảnh",
      remove_image: "Xóa ảnh", image_saved: "Đã lưu ảnh ✓",
      image_removed: "Đã xóa ảnh ✓",
      lessons_left: "còn lại",
      lang_btn: "EN",
    }
  };

  const t2 = k => (S[LANG] && S[LANG][k]) || S.en[k] || k;

  // ---------- toasts ----------
  function ensureToastBox() {
    let box = document.getElementById("toast-box");
    if (!box) {
      box = document.createElement("div");
      box.id = "toast-box";
      document.body.appendChild(box);
    }
    return box;
  }
  function toast(msg, type) {
    const box = ensureToastBox();
    const el = document.createElement("div");
    el.className = "toast " + (type || "ok");
    el.setAttribute("role", "status");
    el.textContent = msg;
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 300);
    }, type === "err" ? 5200 : 3200);
  }

  // ---------- modal dialogs ----------
  function baseModal(inner) {
    const wrap = document.createElement("div");
    wrap.className = "modal-wrap";
    wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${inner}</div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add("show"));
    return wrap;
  }
  function closeModal(wrap) {
    wrap.classList.remove("show");
    setTimeout(() => wrap.remove(), 200);
  }
  // Confirm: returns Promise<boolean>
  function confirmDialog({ title, body, okText, danger }) {
    return new Promise(resolve => {
      const wrap = baseModal(`
        <h3>${title}</h3>
        ${body ? `<p>${body}</p>` : ""}
        <div class="modal-actions">
          <button class="ghost" data-act="no">${t2("cancel")}</button>
          <button data-act="yes" class="${danger ? "danger-btn" : ""}">${okText || t2("confirm")}</button>
        </div>`);
      const done = v => { closeModal(wrap); resolve(v); };
      wrap.addEventListener("click", e => {
        if (e.target === wrap) done(false);
        const act = e.target.getAttribute && e.target.getAttribute("data-act");
        if (act) done(act === "yes");
      });
      document.addEventListener("keydown", function esc(e) {
        if (e.key === "Escape") { document.removeEventListener("keydown", esc); done(false); }
      });
      wrap.querySelector('[data-act="yes"]').focus();
    });
  }
  // Prompt with one input: returns Promise<string|null>
  function promptDialog({ title, label, placeholder, type }) {
    return new Promise(resolve => {
      const wrap = baseModal(`
        <h3>${title}</h3>
        <div class="field"><label>${label || ""}</label>
          <input id="modal-input" type="${type || "text"}" placeholder="${placeholder || ""}" /></div>
        <div class="modal-actions">
          <button class="ghost" data-act="no">${t2("cancel")}</button>
          <button data-act="yes">${t2("confirm")}</button>
        </div>`);
      const input = wrap.querySelector("#modal-input");
      const done = v => { closeModal(wrap); resolve(v); };
      wrap.addEventListener("click", e => {
        if (e.target === wrap) done(null);
        const act = e.target.getAttribute && e.target.getAttribute("data-act");
        if (act === "no") done(null);
        if (act === "yes") done(input.value);
      });
      input.addEventListener("keydown", e => { if (e.key === "Enter") done(input.value); });
      input.focus();
    });
  }

  // ---------- skeleton loading ----------
  function skeleton(n) {
    let out = "";
    for (let i = 0; i < (n || 3); i++) {
      out += `<div class="card"><div class="sk sk-title"></div>
        <div class="sk sk-line"></div><div class="sk sk-line" style="width:70%;"></div></div>`;
    }
    return out;
  }

  // ---------- CSV export ----------
  function csv(filename, rows) {
    if (!rows || !rows.length) { toast(t2("no_enrollments"), "err"); return; }
    const cols = Object.keys(rows[0]);
    const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const body = [cols.map(q).join(",")]
      .concat(rows.map(r => cols.map(c => q(r[c])).join(","))).join("\r\n");
    // BOM so Vietnamese text opens correctly in Excel
    const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ---------- icons (Lucide, loaded from CDN in each page) ----------
  function refreshIcons() {
    try { if (window.lucide) window.lucide.createIcons(); } catch (e) {}
  }
  const icon = (name, size) =>
    `<i data-lucide="${name}" style="width:${size || 16}px;height:${size || 16}px;"></i>`;

  // ---------- language toggle ----------
  function wireLangButton(btn, onSwitch) {
    if (!btn) return;
    btn.textContent = t2("lang_btn");
    btn.addEventListener("click", () => {
      const next = LANG === "en" ? "vi" : "en";
      try { localStorage.setItem("hub_lang", next); } catch (e) {}
      if (onSwitch) onSwitch(next); else location.reload();
    });
  }

  // ---------- scroll-preserving re-render ----------
  async function rerender(fn) {
    const y = window.scrollY;
    await fn();
    window.scrollTo(0, y);
  }

  // ---------- notification bell (needs migration 18) ----------
  const escU = s => String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));

  async function initBell(mount) {
    try {
      if (!mount || !window.sb) return;
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const [{ data: anns }, { data: reads }] = await Promise.all([
        sb.from("announcements").select("id, body, created_at")
          .order("created_at", { ascending: false }).limit(15),
        sb.from("announcement_reads").select("announcement_id").eq("user_id", user.id)
      ]);
      const readSet = new Set((reads || []).map(r => r.announcement_id));
      const unread = (anns || []).filter(a => !readSet.has(a.id));
      const strip = s => { const d = document.createElement("div"); d.innerHTML = String(s ?? ""); return d.textContent || ""; };
      mount.innerHTML = `
        <span class="bell-wrap">
          <button class="ghost" id="bell-btn" aria-label="${t2("notifications")}">🔔${
            unread.length ? `<span class="bell-badge">${unread.length}</span>` : ""}</button>
          <div class="bell-panel" id="bell-panel" style="display:none;">
            <div class="bell-head">${t2("notifications")}</div>
            ${(anns || []).map(a => `
              <div class="bell-item ${readSet.has(a.id) ? "" : "unread"}">
                <div>${escU(strip(a.body).slice(0, 90) || "🖼")}</div>
                <span class="kind">${new Date(a.created_at).toLocaleDateString()}</span>
              </div>`).join("") || `<div class="bell-item">${t2("no_notifs")}</div>`}
          </div>
        </span>`;
      const btn = mount.querySelector("#bell-btn");
      const panel = mount.querySelector("#bell-panel");
      btn.addEventListener("click", async () => {
        const open = panel.style.display !== "none";
        panel.style.display = open ? "none" : "block";
        if (!open && unread.length) {
          await sb.from("announcement_reads").upsert(
            unread.map(a => ({ announcement_id: a.id, user_id: user.id })),
            { onConflict: "announcement_id,user_id" });
          const badge = btn.querySelector(".bell-badge");
          if (badge) badge.remove();
          unread.length = 0;
        }
      });
      document.addEventListener("click", e => {
        if (!e.target.closest(".bell-wrap")) panel.style.display = "none";
      });
    } catch (e) { /* bell is optional — never break the page */ }
  }

  // ---------- organization brand color ----------
  // Curated presets: all dark enough for white text (accessibility).
  const BRAND_PRESETS = ["#1e4f8f", "#0e7c66", "#6d28d9", "#b3261e",
                         "#0f766e", "#334155", "#7f1d1d", "#0369a1"];

  function applyBrand(hex) {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex || "")) return;
    const root = document.documentElement;
    root.style.setProperty("--accent", hex);
    const n = parseInt(hex.slice(1), 16);
    const dk = c => Math.max(0, Math.round(c * 0.72));
    root.style.setProperty("--accent-ink",
      "#" + [(n >> 16) & 255, (n >> 8) & 255, n & 255]
        .map(c => dk(c).toString(16).padStart(2, "0")).join(""));
  }

  // ---------- membership (Phase 4) ----------
  // One consistent account label + color across every page:
  //   free (blue) · premium (gold) · teacher pro / teacher premium
  //   (purple) · organization (navy) · owner (navy + gold)
  function membership(p) {
    if (!p) return { key: "free", label: t2("free_plan"), icon: "" };
    const today = new Date().toISOString().slice(0, 10);
    const premOK = p.plan === "premium" && (!p.premium_until || p.premium_until >= today);
    if (p.role === "owner")
      return { key: "owner", label: t2("mb_owner"), icon: "★ " };
    if (p.role === "admin")
      return { key: "org", label: t2("mb_org"), icon: "🏢 " };
    if (p.role === "teacher")
      return premOK
        ? { key: "teacher-prem", label: t2("mb_teacher_prem"), icon: "👑 " }
        : { key: "teacher", label: t2("mb_teacher_pro"), icon: "🎓 " };
    return premOK
      ? { key: "premium", label: t2("premium"), icon: "👑 " }
      : { key: "free", label: t2("free_plan"), icon: "" };
  }
  function memberBadge(p) {
    const m = membership(p);
    return `<span class="mb mb-${m.key}">${m.icon}${m.label}</span>`;
  }

  // ---------- client-side image downscale (banner uploads) ----------
  function resizeImage(file, maxW) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, (maxW || 1200) / img.width);
          const cv = document.createElement("canvas");
          cv.width = Math.max(1, Math.round(img.width * scale));
          cv.height = Math.max(1, Math.round(img.height * scale));
          cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
          cv.toBlob(b => b ? resolve(b) : reject(new Error("resize failed")),
                    "image/jpeg", 0.85);
        } catch (e) { reject(e); }
        URL.revokeObjectURL(img.src);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  // ---------- crop + resize to a fixed frame (lesson covers) ----------
  // Center-crops the image to exactly w×h (cover), so every lesson
  // thumbnail has the same shape no matter what was uploaded.
  function cropResize(file, w, h) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const W = w || 640, H = h || 360;
          const scale = Math.max(W / img.width, H / img.height);
          const sw = W / scale, sh = H / scale;
          const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
          const cv = document.createElement("canvas");
          cv.width = W; cv.height = H;
          cv.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
          cv.toBlob(b => b ? resolve(b) : reject(new Error("resize failed")),
                    "image/jpeg", 0.85);
        } catch (e) { reject(e); }
        URL.revokeObjectURL(img.src);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  // ---------- sticky navigation bar (below the header) ----------
  // opts: { items: [{id|href, label, icon}], active, onSelect(id),
  //         actions: [{label, icon, onClick}] }
  function initNav(opts) {
    let nav = document.getElementById("subnav");
    if (!nav) {
      nav = document.createElement("nav");
      nav.id = "subnav";
      const header = document.querySelector("header.topbar");
      if (!header) return;
      header.insertAdjacentElement("afterend", nav);
    }
    const one = i => i.href
      ? `<a class="sn-item" href="${i.href}">${icon(i.icon)}<span>${i.label}</span></a>`
      : `<button class="sn-item ${opts.active === i.id ? "on" : ""}" data-id="${i.id}">${icon(i.icon)}<span>${i.label}</span></button>`;
    nav.innerHTML = `
      <button class="sn-burger" aria-expanded="false">☰ <span>${t2("menu")}</span></button>
      <div class="sn-items">
        ${opts.items.map(one).join("")}
        ${(opts.actions && opts.actions.length)
          ? `<span class="sn-spacer"></span>` + opts.actions.map((a, ix) =>
              `<button class="sn-item sn-action" data-act="${ix}">${icon(a.icon)}<span>${a.label}</span></button>`).join("")
          : ""}
      </div>`;
    const burger = nav.querySelector(".sn-burger");
    burger.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.querySelectorAll(".sn-item[data-id]").forEach(b => b.addEventListener("click", () => {
      nav.classList.remove("open");
      if (opts.onSelect) opts.onSelect(b.getAttribute("data-id"));
    }));
    nav.querySelectorAll(".sn-action").forEach(b => b.addEventListener("click", () => {
      nav.classList.remove("open");
      const a = opts.actions[Number(b.getAttribute("data-act"))];
      if (a && a.onClick) a.onClick();
    }));
    refreshIcons();
  }

  // ---------- dark mode toggle (Phase 8) ----------
  // The theme itself is applied by a tiny head snippet on every page
  // (before first paint). This just adds the 🌙/☀️ switch to the topbar.
  function initTheme() {
    const root = document.documentElement;
    const isDark = () => root.getAttribute("data-theme") === "dark";
    const slot = document.querySelector(".topbar > div");
    if (!slot || slot.querySelector(".theme-btn")) return;
    const btn = document.createElement("button");
    btn.className = "ghost theme-btn";
    btn.setAttribute("aria-label", "Light / dark mode");
    btn.textContent = isDark() ? "☀️" : "🌙";
    btn.addEventListener("click", () => {
      const next = isDark() ? "light" : "dark";
      if (next === "dark") root.setAttribute("data-theme", "dark");
      else root.removeAttribute("data-theme");
      try { localStorage.setItem("hub_theme", next); } catch (e) {}
      btn.textContent = next === "dark" ? "☀️" : "🌙";
    });
    slot.insertBefore(btn, slot.firstChild);
  }
  initTheme();   // ui.js loads at the end of <body>, so the topbar exists

  window.UI = { t2, LANG, toast, confirmDialog, promptDialog, skeleton,
                csv, icon, refreshIcons, wireLangButton, rerender, initBell,
                applyBrand, resizeImage, cropResize, membership, memberBadge,
                BRAND_PRESETS, initNav, initTheme };
  document.documentElement.setAttribute("lang", LANG);
})();
