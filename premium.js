// ============================================================
//  premium.js — popup "Mở khóa Premium" dùng chung cho CẢ TRANG WEB
//
//  Mọi nơi có nội dung khóa (trang khóa học công khai, dashboard học
//  viên, Đọc hiểu, Shadowing, Chép chính tả, và các thư viện sau này)
//  đều gọi cùng một popup này, và nội dung của nó được cấu hình từ
//  Bảng điều khiển → "Giá & thanh toán" (bảng course_pricing +
//  payment_settings, migration 46).
//
//  Cách dùng:
//     <script src="premium.js"></script>        (sau config.js)
//     Premium.open({ courseId, courseTitle, thumb, reason });
//
//  Tất cả tham số đều không bắt buộc — thiếu gì thì popup tự dùng
//  cấu hình chung. Nếu chưa chạy migration 46, popup vẫn hiện với
//  nội dung mặc định + nút Zalo (không bao giờ vỡ trang).
// ============================================================

(function () {
  "use strict";

  var CACHE = null;          // { settings, byCourse }
  var LOADING = null;        // promise while fetching
  var LS_KEY = "hub_pricing_cache";
  var ZALO_FALLBACK = "https://zalo.me/0961923983";

  // ---------- tiện ích ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // Mô tả do CHÍNH chủ trang soạn trong bảng điều khiển → cho phép HTML
  // cơ bản, nhưng vẫn bỏ script/iframe/sự kiện on… cho an toàn.
  function safeHtml(s) {
    var d = document.createElement("div");
    d.innerHTML = String(s == null ? "" : s);
    d.querySelectorAll("script, iframe, object, embed, style, link, form").forEach(function (n) { n.remove(); });
    d.querySelectorAll("*").forEach(function (n) {
      Array.prototype.slice.call(n.attributes).forEach(function (a) {
        var nm = a.name.toLowerCase();
        if (nm.indexOf("on") === 0) n.removeAttribute(a.name);
        if ((nm === "href" || nm === "src") && /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name);
      });
    });
    return d.innerHTML;
  }
  function money(v, cur) {
    if (v == null || v === "" || isNaN(Number(v))) return "";
    return Number(v).toLocaleString("vi-VN") + (cur || "đ");
  }
  function isDark() {
    var attr = document.documentElement.getAttribute("data-theme");
    if (attr === "dark") return true;
    if (attr === "light") return false;
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }
  function periodLabel(p) {
    return { month: " / tháng", year: " / năm", life: " · trọn đời" }[p] || "";
  }
  function telHref(p) { return "tel:" + String(p).replace(/[^\d+]/g, ""); }
  function zaloHref(z) {
    z = String(z || "").trim();
    if (!z) return "";
    if (/^https?:\/\//i.test(z)) return z;
    return "https://zalo.me/" + z.replace(/[^\d]/g, "");
  }

  // ---------- nạp cấu hình (một lần, có nhớ tạm) ----------
  function load() {
    if (CACHE) return Promise.resolve(CACHE);
    if (LOADING) return LOADING;
    // dùng bản nhớ tạm trước cho nhanh, vẫn tải bản mới ở nền
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) CACHE = JSON.parse(raw);
    } catch (e) {}

    // config.js declares `const sb = …`, which is script-scoped and is NOT
    // a property of window — so test the identifier, never window.sb.
    var db = (typeof sb !== "undefined" && sb) ? sb : (window.sb || null);
    if (!db) {
      return Promise.resolve(CACHE || { settings: {}, byCourse: {} });
    }
    LOADING = Promise.all([
      db.from("payment_settings").select("config").eq("id", 1).maybeSingle()
        .then(function (r) { return r; }, function () { return { data: null }; }),
      db.from("course_pricing").select("course_id, config")
        .then(function (r) { return r; }, function () { return { data: null }; }),
      db.from("section_pricing").select("section, config")
        .then(function (r) { return r; }, function () { return { data: null }; })
    ]).then(function (res) {
      var settings = (res[0] && res[0].data && res[0].data.config) || {};
      var byCourse = {}, bySection = {};
      ((res[1] && res[1].data) || []).forEach(function (r) { byCourse[r.course_id] = r.config || {}; });
      ((res[2] && res[2].data) || []).forEach(function (r) { bySection[r.section] = r.config || {}; });
      CACHE = { settings: settings, byCourse: byCourse, bySection: bySection };
      try { localStorage.setItem(LS_KEY, JSON.stringify(CACHE)); } catch (e) {}
      LOADING = null;
      return CACHE;
    }).catch(function () {
      LOADING = null;
      return CACHE || { settings: {}, byCourse: {} };
    });
    return LOADING;
  }

  // Gộp: cấu hình khóa đè lên cấu hình chung
  function resolve(courseId, data, section) {
    var s = (data && data.settings) || {};
    var c = section
      ? ((data && data.bySection && data.bySection[section]) || {})
      : ((courseId && data && data.byCourse && data.byCourse[courseId]) || {});
    var d = s.defaults || {};
    var pay = Object.assign({}, s.payment || {});
    var con = Object.assign({}, s.contacts || {});
    if (c.payment && c.payment.use_global === false) pay = Object.assign(pay, c.payment);
    if (c.contacts && c.contacts.use_global === false) con = Object.assign(con, c.contacts);
    var price = c.price, sale = c.on_sale ? c.sale_price : null;
    var badge = c.badge;
    if (!badge && price && sale && Number(price) > Number(sale)) {
      badge = "-" + Math.round((1 - Number(sale) / Number(price)) * 100) + "%";
    }
    return {
      enabled: c.enabled !== false,
      title: c.title || d.title || "Mở khóa toàn bộ khóa học",
      subtitle: c.subtitle || d.subtitle || "Liên hệ để kích hoạt Premium và học không giới hạn.",
      price: price, sale_price: sale, badge: badge,
      promo_label: c.promo_label || "",
      period: c.period || "",
      currency: c.currency || "đ",
      promo_image: c.promo_image || "",
      benefits: (c.benefits && c.benefits.length ? c.benefits : (d.benefits || [])),
      description_html: c.description_html || d.description_html || "",
      plans: c.plans || [],
      payment: pay, contacts: con
    };
  }

  // ---------- CSS (nạp một lần) ----------
  function ensureCss() {
    if (document.getElementById("premium-css")) return;
    var st = document.createElement("style");
    st.id = "premium-css";
    st.textContent = [
      ".pmx-ov{position:fixed;inset:0;z-index:1000;background:rgba(8,14,26,.62);",
      "backdrop-filter:blur(3px);display:flex;align-items:flex-start;justify-content:center;",
      "padding:24px 14px;overflow-y:auto;opacity:0;transition:opacity .22s ease;}",
      ".pmx-ov.on{opacity:1;}",
      ".pmx{width:100%;max-width:470px;background:var(--pmx-card);color:var(--pmx-ink);",
      "border-radius:20px;overflow:hidden;box-shadow:0 40px 90px -35px rgba(0,0,0,.7);",
      "transform:translateY(14px) scale(.985);transition:transform .24s cubic-bezier(.2,.8,.3,1);",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;",
      "margin:auto;}",
      ".pmx-ov.on .pmx{transform:none;}",
      ".pmx-hero{position:relative;height:132px;background:linear-gradient(135deg,#1e4f8f,#132743);",
      "background-size:cover;background-position:center;display:flex;align-items:flex-end;}",
      ".pmx-hero .sh{position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,18,32,.15),rgba(10,18,32,.86));}",
      ".pmx-hero .tx{position:relative;padding:14px 18px;color:#fff;width:100%;}",
      ".pmx-crown{position:absolute;top:12px;right:14px;background:linear-gradient(135deg,#fde68a,#d9a53c);",
      "color:#713f12;font-weight:800;font-size:12px;padding:4px 11px;border-radius:999px;z-index:2;}",
      ".pmx-ttl{font-size:19px;font-weight:800;line-height:1.3;text-shadow:0 2px 10px rgba(0,0,0,.5);}",
      ".pmx-sub{font-size:13px;opacity:.92;margin-top:2px;text-shadow:0 1px 6px rgba(0,0,0,.5);}",
      ".pmx-body{padding:16px 18px 18px;}",
      ".pmx-price{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:4px;}",
      ".pmx-now{font-size:27px;font-weight:900;color:var(--pmx-gold);}",
      ".pmx-old{font-size:15px;color:var(--pmx-muted);text-decoration:line-through;}",
      ".pmx-per{font-size:14px;font-weight:600;color:var(--pmx-muted);}",
      ".pmx-badge{background:#e11d48;color:#fff;font-size:12px;font-weight:800;padding:3px 9px;border-radius:999px;}",
      ".pmx-promo{display:inline-block;background:var(--pmx-soft);color:var(--pmx-gold);font-size:12px;",
      "font-weight:700;padding:3px 10px;border-radius:999px;margin-bottom:10px;}",
      ".pmx-img{width:100%;border-radius:12px;margin:10px 0 4px;display:block;}",
      ".pmx-ben{list-style:none;padding:0;margin:12px 0 4px;}",
      ".pmx-ben li{display:flex;gap:9px;align-items:flex-start;font-size:14px;line-height:1.5;margin-bottom:7px;}",
      ".pmx-ben li .ck{color:#16a34a;font-weight:900;flex:none;}",
      ".pmx-desc{font-size:13.5px;line-height:1.6;color:var(--pmx-muted);margin-top:10px;}",
      ".pmx-desc p{margin:.4em 0;} .pmx-desc ul{margin:.4em 0;padding-left:1.1em;}",
      ".pmx-pay{border:1px solid var(--pmx-line);border-radius:12px;padding:12px 14px;margin-top:14px;",
      "background:var(--pmx-soft2);font-size:13.5px;}",
      ".pmx-pay .row{display:flex;justify-content:space-between;gap:10px;padding:3px 0;}",
      ".pmx-pay .row b{font-weight:700;}",
      ".pmx-pay .lab{color:var(--pmx-muted);flex:none;}",
      ".pmx-qr{display:block;margin:10px auto 2px;max-width:170px;width:100%;border-radius:10px;background:#fff;padding:6px;}",
      ".pmx-btns{display:flex;flex-direction:column;gap:8px;margin-top:16px;}",
      ".pmx-btn{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;",
      "padding:12px 16px;border-radius:12px;font-size:14.5px;font-weight:700;cursor:pointer;",
      "text-decoration:none;border:1px solid transparent;transition:filter .15s ease,background .15s ease;}",
      ".pmx-btn:hover{filter:brightness(1.06);}",
      ".pmx-zalo{background:linear-gradient(135deg,#f4d68a,#d9a53c);color:#5a3d0e;}",
      ".pmx-fb{background:#1877f2;color:#fff;}",
      ".pmx-call{background:#16a34a;color:#fff;}",
      ".pmx-ghost{background:transparent;color:var(--pmx-ink);border-color:var(--pmx-line);}",
      ".pmx-row2{display:flex;gap:8px;} .pmx-row2 .pmx-btn{flex:1;}",
      ".pmx-x{width:100%;background:none;border:none;color:var(--pmx-muted);font-size:14px;",
      "cursor:pointer;padding:11px 0 2px;font-family:inherit;}",
      ".pmx-note{text-align:center;font-size:12px;color:var(--pmx-muted);margin-top:9px;}",
      "@media(max-width:420px){.pmx-hero{height:108px;}.pmx-now{font-size:23px;}.pmx-row2{flex-direction:column;}}",
      "@media(prefers-reduced-motion:reduce){.pmx-ov,.pmx{transition:none;}}"
    ].join("");
    document.head.appendChild(st);
  }

  function themeVars(el) {
    var d = isDark();
    el.style.setProperty("--pmx-card", d ? "#172233" : "#ffffff");
    el.style.setProperty("--pmx-ink", d ? "#e7edf8" : "#17263e");
    el.style.setProperty("--pmx-muted", d ? "#97a4bb" : "#5a6577");
    el.style.setProperty("--pmx-line", d ? "#2a3650" : "#dde3ec");
    el.style.setProperty("--pmx-soft", d ? "rgba(217,171,92,.16)" : "rgba(183,130,63,.13)");
    el.style.setProperty("--pmx-soft2", d ? "rgba(255,255,255,.04)" : "#f7f9fc");
    el.style.setProperty("--pmx-gold", d ? "#e8c477" : "#a16207");
  }

  // ---------- dựng popup ----------
  function render(cfg, opts) {
    ensureCss();
    var old = document.querySelector(".pmx-ov");
    if (old) old.remove();

    var ov = document.createElement("div");
    ov.className = "pmx-ov";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    themeVars(ov);

    var pay = cfg.payment || {}, con = cfg.contacts || {};
    var hasPay = !!(pay.bank || pay.number || pay.qr_url);
    var zalo = zaloHref(con.zalo) || ZALO_FALLBACK;
    var heroStyle = opts.thumb ? ' style="background-image:url(\'' + esc(opts.thumb) + '\');"' : "";

    var priceHtml = "";
    if (cfg.sale_price || cfg.price) {
      priceHtml =
        '<div class="pmx-price">' +
          '<span class="pmx-now">' + esc(money(cfg.sale_price || cfg.price, cfg.currency)) +
            (cfg.period ? '<span class="pmx-per">' + esc(periodLabel(cfg.period)) + '</span>' : "") + '</span>' +
          (cfg.sale_price && cfg.price ? '<span class="pmx-old">' + esc(money(cfg.price, cfg.currency)) + '</span>' : "") +
          (cfg.badge ? '<span class="pmx-badge">' + esc(cfg.badge) + '</span>' : "") +
        '</div>';
    }

    var payHtml = "";
    if (hasPay) {
      payHtml =
        '<div class="pmx-pay" id="pmxPay" hidden>' +
          (pay.bank ? '<div class="row"><span class="lab">Ngân hàng</span><b>' + esc(pay.bank) + '</b></div>' : "") +
          (pay.holder ? '<div class="row"><span class="lab">Chủ tài khoản</span><b>' + esc(pay.holder) + '</b></div>' : "") +
          (pay.number ? '<div class="row"><span class="lab">Số tài khoản</span><b id="pmxAcc">' + esc(pay.number) + '</b></div>' : "") +
          (pay.reference ? '<div class="row"><span class="lab">Nội dung CK</span><b>' + esc(pay.reference) + '</b></div>' : "") +
          (pay.qr_url ? '<img class="pmx-qr" src="' + esc(pay.qr_url) + '" alt="QR thanh toán" loading="lazy" />' : "") +
          (pay.number ? '<button class="pmx-btn pmx-ghost" id="pmxCopy" style="margin-top:10px;">📋 Sao chép số tài khoản</button>' : "") +
        '</div>';
    }

    ov.innerHTML =
      '<div class="pmx">' +
        '<div class="pmx-hero"' + heroStyle + '>' +
          '<span class="pmx-crown">👑 Premium</span>' +
          '<div class="sh"></div>' +
          '<div class="tx">' +
            '<div class="pmx-ttl">' + esc(cfg.title) + '</div>' +
            (opts.courseTitle ? '<div class="pmx-sub">' + esc(opts.courseTitle) + '</div>' : "") +
          '</div>' +
        '</div>' +
        '<div class="pmx-body">' +
          (cfg.promo_label ? '<span class="pmx-promo">🎁 ' + esc(cfg.promo_label) + '</span>' : "") +
          priceHtml +
          '<p style="font-size:14px;line-height:1.55;color:var(--pmx-muted);margin:6px 0 0;">' +
            esc(opts.reason || cfg.subtitle) + '</p>' +
          (cfg.promo_image ? '<img class="pmx-img" src="' + esc(cfg.promo_image) + '" alt="Bảng giá" loading="lazy" />' : "") +
          (cfg.benefits && cfg.benefits.length
            ? '<ul class="pmx-ben">' + cfg.benefits.map(function (b) {
                return '<li><span class="ck">✓</span><span>' + esc(b) + '</span></li>'; }).join("") + '</ul>'
            : "") +
          (cfg.description_html ? '<div class="pmx-desc">' + safeHtml(cfg.description_html) + '</div>' : "") +
          payHtml +
          '<div class="pmx-btns">' +
            '<a class="pmx-btn pmx-zalo" href="' + esc(zalo) + '" target="_blank" rel="noopener">💬 Liên hệ Zalo để mở khóa</a>' +
            (con.messenger || con.phone
              ? '<div class="pmx-row2">' +
                  (con.messenger ? '<a class="pmx-btn pmx-fb" href="' + esc(con.messenger) + '" target="_blank" rel="noopener">Messenger</a>' : "") +
                  (con.phone ? '<a class="pmx-btn pmx-call" href="' + esc(telHref(con.phone)) + '">📞 Gọi ngay</a>' : "") +
                '</div>'
              : "") +
            (hasPay ? '<button class="pmx-btn pmx-ghost" id="pmxPayBtn">🏦 Xem thông tin thanh toán</button>' : "") +
          '</div>' +
          (con.email ? '<p class="pmx-note">✉️ ' + esc(con.email) + '</p>' : "") +
          '<button class="pmx-x" id="pmxClose">Đóng</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(ov);
    requestAnimationFrame(function () { ov.classList.add("on"); });

    function close() {
      ov.classList.remove("on");
      setTimeout(function () { ov.remove(); }, 200);
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    var cb = ov.querySelector("#pmxClose");
    if (cb) cb.addEventListener("click", close);

    var payBtn = ov.querySelector("#pmxPayBtn");
    if (payBtn) payBtn.addEventListener("click", function () {
      var box = ov.querySelector("#pmxPay");
      box.hidden = !box.hidden;
      payBtn.textContent = box.hidden ? "🏦 Xem thông tin thanh toán" : "🏦 Ẩn thông tin thanh toán";
      if (!box.hidden) box.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    var copyBtn = ov.querySelector("#pmxCopy");
    if (copyBtn) copyBtn.addEventListener("click", function () {
      var acc = (ov.querySelector("#pmxAcc") || {}).textContent || "";
      var done = function () { copyBtn.textContent = "✓ Đã sao chép"; setTimeout(function () {
        copyBtn.textContent = "📋 Sao chép số tài khoản"; }, 1800); };
      if (navigator.clipboard) navigator.clipboard.writeText(acc.trim()).then(done, function () { window.prompt("Số tài khoản:", acc); });
      else window.prompt("Số tài khoản:", acc);
    });
    return ov;
  }

  // ---------- API công khai ----------
  var Premium = {
    // Premium.open({ courseId, courseTitle, thumb, reason })
    open: function (opts) {
      opts = opts || {};
      return load().then(function (data) {
        var cfg = resolve(opts.courseId, data, opts.section);
        return render(cfg, opts);
      }).catch(function () {
        return render(resolve(null, null), opts);   // vẫn hiện popup mặc định
      });
    },
    // xem thử ngay trong bảng điều khiển, không cần lưu
    preview: function (config, opts) {
      opts = opts || {};
      var data = { settings: (CACHE && CACHE.settings) || {}, byCourse: {}, bySection: {} };
      if (opts.section) data.bySection[opts.section] = config || {};
      else if (opts.courseId) data.byCourse[opts.courseId] = config || {};
      return render(resolve(opts.courseId, data, opts.section), opts);
    },
    // gọi sau khi lưu cấu hình để popup lấy bản mới
    refresh: function () {
      CACHE = null; LOADING = null;
      try { localStorage.removeItem(LS_KEY); } catch (e) {}
      return load();
    },
    preload: load
  };

  window.Premium = Premium;
})();
