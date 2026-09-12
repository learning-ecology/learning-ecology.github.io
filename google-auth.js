// ============================================================
//  google-auth.js — "Đăng nhập với Google" dùng CHUNG cho login.html
//  và signup.html.
//
//  Dùng Google OAuth CỦA Supabase (sb.auth.signInWithOAuth) — luồng
//  chuyển hướng chính thức của Google, KHÔNG giả lập, KHÔNG bao giờ
//  thu mật khẩu Google. Client secret nằm ở Supabase (Auth → Providers
//  → Google), không có trong mã frontend. Xem setup-my-school/
//  google-oauth-setup.md để bật provider + khai báo redirect URLs.
//
//  Luồng:
//   • Bấm nút  → lưu cờ 'hub_oauth' → chuyển tới Google (kèm redirectTo
//     là CHÍNH trang này + ?next= để quay lại đúng chỗ). prompt=select_account
//     nên Google luôn hiện cửa sổ chọn tài khoản.
//   • Quay lại → Supabase tự đổi mã (detectSessionInUrl) → có phiên.
//     completeReturn(): điền hồ sơ (tên + ảnh Google) NẾU còn trống
//     (không ghi đè), giữ luật MỘT thiết bị + ghi lịch sử như đăng nhập
//     email, rồi trang gọi goNext() về đúng ?next=.
//
//  Tài khoản trùng email: Supabase tự liên kết theo email ĐÃ XÁC MINH,
//  nên không tạo tài khoản đôi (không đổi vai trò/Premium/dữ liệu cũ).
// ============================================================
(function () {
  "use strict";
  if (window.GoogleAuth) return;

  function tt(k) { try { return (typeof t === "function") ? t(k) : k; } catch (e) { return k; } }

  var GoogleAuth = {
    _msg: function (msg, key, err) {
      if (msg) { msg.textContent = tt(key); msg.className = "msg" + (err ? " err" : ""); }
    },

    /* Trang này có phải vừa quay lại từ Google không? */
    pendingReturn: function () {
      try { return sessionStorage.getItem("hub_oauth") === "1"; } catch (e) { return false; }
    },

    /* Gắn sự kiện cho nút "Đăng nhập với Google". next = đường dẫn nội bộ đã
       được kiểm tra (safeNext) để quay lại sau khi đăng nhập. */
    wireButton: function (button, msg, next) {
      if (!button) return;
      var self = this;
      button.addEventListener("click", function () {
        self._msg(msg, "g_redirecting", false);
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        try { sessionStorage.setItem("hub_oauth", "1"); } catch (e) {}
        // Quay về CHÍNH trang này (giữ ?next=) — phải nằm trong danh sách
        // Redirect URLs của Supabase. origin luôn là tên miền tin cậy hiện tại.
        var redirectTo = location.origin + location.pathname + (next ? ("?next=" + encodeURIComponent(next)) : "");
        Promise.resolve()
          .then(function () {
            return sb.auth.signInWithOAuth({
              provider: "google",
              options: { redirectTo: redirectTo, queryParams: { prompt: "select_account" } }
            });
          })
          .then(function (res) {
            if (res && res.error) throw res.error;
            // thành công → trình duyệt đang chuyển sang Google
          })
          .catch(function () {
            button.disabled = false;
            button.removeAttribute("aria-busy");
            self._msg(msg, "g_err_open", true);
            try { sessionStorage.removeItem("hub_oauth"); } catch (e) {}
          });
      });
    },

    /* Xử lý lượt QUAY LẠI từ Google. Trả về session (đăng nhập xong) hoặc
       null (huỷ / lỗi — đã hiện thông báo thân thiện). */
    completeReturn: function (msg) {
      var self = this;
      try { sessionStorage.removeItem("hub_oauth"); } catch (e) {}

      // Người dùng huỷ ở màn Google → quay lại kèm ?error=access_denied…
      var q = new URLSearchParams(location.search);
      var h = new URLSearchParams((location.hash || "").replace(/^#/, ""));
      var err = q.get("error") || h.get("error");
      var errDesc = (q.get("error_description") || h.get("error_description") || "") + " " + (err || "");
      if (err) {
        self._msg(msg, /denied|cancel|closed|dismiss/i.test(errDesc) ? "g_err_cancel" : "g_err_generic", true);
        self._cleanUrl();
        return Promise.resolve(null);
      }

      self._msg(msg, "g_signing_in", false);

      // Supabase đổi mã trong URL (detectSessionInUrl) có thể mất một nhịp →
      // thử lấy phiên vài lần.
      function waitSession(i) {
        return sb.auth.getSession().then(function (r) {
          if (r && r.data && r.data.session) return r.data.session;
          if (i >= 25) return null;
          return new Promise(function (res) { setTimeout(res, 150); }).then(function () { return waitSession(i + 1); });
        }).catch(function () {
          if (i >= 25) return null;
          return new Promise(function (res) { setTimeout(res, 150); }).then(function () { return waitSession(i + 1); });
        });
      }

      return waitSession(0).then(function (session) {
        if (!session) { self._msg(msg, "g_err_generic", true); self._cleanUrl(); return null; }
        return self._fillProfile(session.user)
          .then(function () { return self._claimDevice(session.user); })
          .then(function () { return session; });
      });
    },

    _cleanUrl: function () {
      try {
        var n = new URLSearchParams(location.search).get("next");
        history.replaceState(null, "", location.pathname + (n ? ("?next=" + encodeURIComponent(n)) : ""));
      } catch (e) {}
    },

    /* Điền TÊN + ẢNH từ Google — CHỈ khi hồ sơ còn trống (không ghi đè dữ liệu
       cũ, không đụng vai trò/Premium). Hồ sơ do trigger handle_new_user tạo sẵn
       khi tài khoản mới sinh ra. */
    _fillProfile: function (user) {
      var md = (user && user.user_metadata) || {};
      var name = String(md.full_name || md.name || "").trim();
      var avatar = String(md.avatar_url || md.picture || "").trim();
      return sb.from("profiles").select("full_name, avatar_url").eq("id", user.id).maybeSingle()
        .then(function (r) {
          var prof = r && r.data;
          if (!prof) return null;
          var patch = {};
          if ((!prof.full_name || !String(prof.full_name).trim()) && name) patch.full_name = name;
          if ((!prof.avatar_url || !String(prof.avatar_url).trim()) && avatar) patch.avatar_url = avatar;
          if (!Object.keys(patch).length) return null;
          return sb.from("profiles").update(patch).eq("id", user.id);
        })
        .catch(function () { /* không chặn đăng nhập nếu ghi hồ sơ lỗi */ });
    },

    /* Giữ đúng luật MỘT thiết bị/1 tài khoản + ghi lịch sử — GIỐNG hệt luồng
       đăng nhập bằng email, để hành vi nhất quán. */
    _claimDevice: function (user) {
      var device;
      try { device = crypto.randomUUID(); } catch (e) { device = String(Date.now()) + Math.random(); }
      try { localStorage.setItem("hub_device", device); } catch (e) {}
      return sb.from("profiles").update({ active_session: device }).eq("id", user.id)
        .then(function () { return sb.auth.signOut({ scope: "others" }); })
        .then(function () {
          var ua = navigator.userAgent;
          var dtp = /iPad|Tablet/i.test(ua) ? "tablet" : (/Mobi|iPhone|Android.*Mobile/i.test(ua) ? "mobile" : "desktop");
          var os = /Windows/i.test(ua) ? "Windows" : /Mac OS X/i.test(ua) ? "macOS" : /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : "other";
          var br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "other";
          return sb.from("access_events").insert({ student_id: user.id, event: "login", device: device, device_type: dtp, agent: os + " · " + br });
        })
        .catch(function () { /* không chặn đăng nhập nếu ghi lịch sử lỗi */ });
    }
  };

  window.GoogleAuth = GoogleAuth;
})();
