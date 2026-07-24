// ============================================================
//  Thong's Learning Hub — lesson tracker
//
//  Add these TWO lines near the end of any HTML lesson's <body>:
//
//  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//  <script src="https://learning-ecology.github.io/tracker.js"></script>
//
//  What happens automatically:
//   • time on the lesson is recorded (only while the tab is visible)
//   • any element with data-lms-section="name" is recorded as
//     "viewed" once the student scrolls it into view
//   • clicking any element with data-lms-done="name" records
//     that activity as completed
//
//  For quizzes/games, call from your own lesson code:
//   • LMS.done("exercise-1")            → mark an activity complete
//   • LMS.score("quiz-1", 8, 10)        → record a score (8 out of 10)
//
//  If a visitor is not logged in to the hub, the tracker does
//  nothing (lessons still work normally for everyone).
// ============================================================
(function () {
  const SUPABASE_URL = "https://lqeetnlfqmarlqmbxusn.supabase.co";
  const SUPABASE_KEY = "sb_publishable_HLTiqXAPVp94_ot9i3yIFQ_nRlegnZ7";

  // Public API is available immediately; calls made before we're
  // ready are queued and sent once the session is confirmed.
  const pending = [];
  let ready = false, uid = null, lessonId = null, sb = null;
  const sentOnce = {};

  window.LMS = {
    done(name)             { record("activity", String(name), 1, 1, true); },
    score(name, got, max)  { record("activity", String(name), Number(got) || 0, Number(max) || null, false); },
    section(name)          { record("section", String(name), 1, null, true); },

    // Submit a whole test for SERVER-SIDE scoring. The answer key lives in
    // the database (never in the page), so the browser only sends the
    // student's answers; the server scores, stores the attempt, and returns
    // the result (with the correct answers, revealed only AFTER submitting).
    //   testKey : the id of the test in test_keys, e.g. "hsk1-h10901"
    //   answers : { "1":"✓", "2":"A", ... }   (1-indexed question → choice)
    //   meta    : { seconds, started }         (time spent, ISO start time)
    // Returns the server result object, or { error } (e.g. not signed in).
    async submitTest(testKey, answers, meta) {
      if (!sb) return { error: "Chưa tải được kết nối máy chủ. Hãy tải lại trang." };
      meta = meta || {};
      try {
        const { data, error } = await sb.rpc("submit_test_attempt", {
          p_test_key: String(testKey),
          p_answers: answers || {},
          p_seconds: (meta.seconds != null ? Math.round(meta.seconds) : null),
          p_started: (meta.started || null),
          // optional computed summary (e.g. CEFR level, per-skill scores) that the
          // test attaches so the dashboard can show more than just the raw score
          p_meta: (meta.summary && typeof meta.summary === "object") ? meta.summary : {}
        });
        if (error) return { error: error.message || String(error) };
        // also surface the result in the lesson activity feed
        try { record("activity", "test:" + String(testKey),
                     (data && data.correct) || 0, (data && data.total) || null, false); } catch (e) {}
        return data;
      } catch (e) { return { error: String((e && e.message) || e) }; }
    }
  };

  function record(kind, key, value, max, onlyOnce) {
    if (onlyOnce) {
      const k = kind + ":" + key;
      if (sentOnce[k]) return;
      sentOnce[k] = true;
    }
    if (!ready) { pending.push([kind, key, value, max]); return; }
    if (!uid || !lessonId) return;
    sb.from("lesson_activity").upsert({
      student_id: uid, lesson_id: lessonId, kind, key,
      value, max_value: max, updated_at: new Date().toISOString()
    }, { onConflict: "student_id,lesson_id,kind,key" }).then(() => {});
  }

  if (!window.supabase) {
    console.warn("[LMS tracker] supabase-js not loaded — add its <script> tag before tracker.js");
    return;
  }
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // ---- OPTIONAL ACCESS GATE ----
  // Add data-lms-require="login" (any signed-in student) or
  // data-lms-require="enrolled" (must be enrolled in this lesson's
  // course) to the <html> tag of a lesson to protect it.
  const requireMode =
    document.documentElement.getAttribute("data-lms-require") ||
    (document.body && document.body.getAttribute("data-lms-require"));
  if (requireMode) document.documentElement.style.visibility = "hidden";

  function lockPage(msgEn, msgVi) {
    document.documentElement.style.visibility = "";
    document.body.innerHTML =
      '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;' +
      'font-family:sans-serif;background:#f4f6fa;color:#17263e;padding:1.5rem;text-align:center;">' +
      '<div style="max-width:420px;background:#fff;border:1px solid #dde3ec;border-radius:14px;padding:2rem;">' +
      '<div style="font-size:2.2rem;">🔒</div>' +
      '<h2 style="margin:0.6rem 0 0.4rem;">' + msgEn + '</h2>' +
      '<p style="color:#5a6577;margin:0 0 1.2rem;">' + msgVi + '</p>' +
      '<a href="https://learning-ecology.github.io/" ' +
      'style="display:inline-block;background:#1e4f8f;color:#fff;text-decoration:none;' +
      'padding:0.7rem 1.4rem;border-radius:10px;font-weight:600;">Learning Ecology \u2192</a>' +
      '</div></div>';
  }

  // Which lesson is this? The hub appends ?lms=<id> when a student
  // clicks Open; we remember it in case the lesson navigates.
  const fromUrl = new URLSearchParams(location.search).get("lms");
  try {
    if (fromUrl) sessionStorage.setItem("lms_lesson", fromUrl);
    lessonId = fromUrl || sessionStorage.getItem("lms_lesson");
  } catch (e) { lessonId = fromUrl; }

  // ---- time tracking (visible time only) ----
  let baseSeconds = 0, dayBase = 0, accrued = 0;
  let visibleSince = document.visibilityState === "visible" ? Date.now() : null;
  const todayKey = () => {
    const d = new Date();
    return "d:" + d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
      "-" + String(d.getDate()).padStart(2, "0");
  };
  function sessionSeconds() {
    return accrued + (visibleSince ? (Date.now() - visibleSince) / 1000 : 0);
  }
  function flushTime() {
    if (!(ready && uid && lessonId)) return;
    record("time", "total", Math.round(baseSeconds + sessionSeconds()), null, false);
    // daily bucket: powers weekly stats, streaks, and the 7-day chart
    record("time", todayKey(), Math.round(dayBase + sessionSeconds()), null, false);
  }

  // ---- section tracking ----
  function watchSections() {
    const els = document.querySelectorAll("[data-lms-section]");
    if (!els.length || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        record("section", en.target.getAttribute("data-lms-section"), 1, null, true);
        io.unobserve(en.target);
      });
    }, { threshold: 0.5 });
    els.forEach((el) => io.observe(el));
  }

  async function init() {
    const { data: { session } } = await sb.auth.getSession();

    // ---- share-key access (sold lessons) ----
    // A link like lesson/?lms=<id>&key=<token> unlocks a gated lesson
    // for visitors WITHOUT a hub account, if the key is valid for
    // this lesson's course. No tracking happens for key visitors.
    let shareKey = new URLSearchParams(location.search).get("key");
    try {
      if (shareKey) sessionStorage.setItem("lms_key", shareKey);
      shareKey = shareKey || sessionStorage.getItem("lms_key");
    } catch (e) {}
    if (requireMode && !session && shareKey && lessonId) {
      try {
        const { data: ok } = await sb.rpc("check_share_key", { tok: shareKey, lesson: lessonId });
        if (ok) { document.documentElement.style.visibility = ""; return; }
      } catch (e) {}
    }

    // ---- access gate enforcement ----
    if (requireMode) {
      if (!session) {
        lockPage("This lesson is for enrolled students",
                 "Bài học này dành cho học viên. Hãy đăng nhập tại Learning Hub.");
        return;
      }
      if (requireMode === "enrolled") {
        if (!lessonId) {
          lockPage("Please open this lesson from the Hub",
                   "Hãy mở bài học này từ trang Learning Hub của bạn.");
          return;
        }
        // RLS only returns the lesson row if this student may see it
        // (enrolled in its course, it has no course, or they're admin).
        const { data: allowed } = await sb.from("lessons")
          .select("id").eq("id", lessonId).maybeSingle();
        if (!allowed) {
          lockPage("You are not enrolled in this course",
                   "Bạn chưa được ghi danh vào khóa học này. Hãy liên hệ giáo viên.");
          return;
        }
      }
      document.documentElement.style.visibility = "";
    }

    if (!session || !lessonId) return;   // not a hub student → no tracking
    uid = session.user.id;

    // ---- access period enforcement inside lessons ----
    try {
      const { data: me } = await sb.from("profiles")
        .select("role, suspended, access_expires").eq("id", uid).maybeSingle();
      const today = new Date().getFullYear() + "-" +
        String(new Date().getMonth() + 1).padStart(2, "0") + "-" +
        String(new Date().getDate()).padStart(2, "0");
      if (me && me.role !== "admin" &&
          (me.suspended || (me.access_expires && me.access_expires < today))) {
        lockPage("Access expired",
                 "Gói truy cập của bạn đã hết hạn. Vui lòng liên hệ giáo viên để gia hạn.");
        return;
      }
      // access log: one "lesson opened" event per visit (students only)
      if (!me || me.role !== "admin") {
        const ua = navigator.userAgent;
        const dtp = /iPad|Tablet/i.test(ua) ? "tablet"
          : (/Mobi|iPhone|Android.*Mobile/i.test(ua) ? "mobile" : "desktop");
        const os = /Windows/i.test(ua) ? "Windows" : /Mac OS X/i.test(ua) ? "macOS"
          : /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : "other";
        const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome"
          : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "other";
        let dt = null; try { dt = localStorage.getItem("hub_device"); } catch (e) {}
        sb.from("access_events").insert({
          student_id: uid, lesson_id: lessonId, event: "lesson_open",
          device: dt, device_type: dtp, agent: os + " · " + br
        }).then(() => {});
      }
    } catch (e) {}

    // Continue from previously recorded time.
    try {
      const { data } = await sb.from("lesson_activity").select("key, value")
        .eq("student_id", uid).eq("lesson_id", lessonId)
        .eq("kind", "time").in("key", ["total", todayKey()]);
      (data || []).forEach(r => {
        if (r.key === "total") baseSeconds = Number(r.value) || 0;
        else dayBase = Number(r.value) || 0;
      });
    } catch (e) {}

    ready = true;
    pending.splice(0).forEach(([k, key, v, m]) => record(k, key, v, m, false));

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") { visibleSince = Date.now(); }
      else {
        if (visibleSince) accrued += (Date.now() - visibleSince) / 1000;
        visibleSince = null;
        flushTime();
      }
    });
    window.addEventListener("pagehide", flushTime);
    setInterval(flushTime, 20000);

    watchSections();
    document.querySelectorAll("[data-lms-done]").forEach((el) =>
      el.addEventListener("click", () =>
        record("activity", el.getAttribute("data-lms-done"), 1, 1, true)));

    // ---- one device per student account ----
    // If this account signs in on another device, this lesson tab
    // signs itself out too (admin accounts are exempt).
    let deviceTok = null;
    try { deviceTok = localStorage.getItem("hub_device"); } catch (e) {}
    if (deviceTok) {
      setInterval(async () => {
        const { data } = await sb.from("profiles")
          .select("active_session, role, multi_device").eq("id", uid).maybeSingle();
        if (data && data.role !== "admin" && !data.multi_device &&
            data.active_session && data.active_session !== deviceTok) {
          try { await sb.auth.signOut({ scope: "local" }); } catch (e) {}
          lockPage("Signed in on another device",
                   "Tài khoản vừa đăng nhập trên thiết bị khác nên phiên này đã bị đăng xuất.");
        }
      }, 60000);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }

  // ---- instructor credit footer on every lesson ----
  function addCredit() {
    if (document.getElementById("lms-credit")) return;
    const f = document.createElement("footer");
    f.id = "lms-credit";
    f.style.cssText = "margin:3rem auto 1.2rem;text-align:center;font:0.8rem sans-serif;color:#5a6577;";
    f.innerHTML = 'Designed by <b>Thầy Lê Quốc Thông</b> · 📞 Zalo: ' +
      '<a href="https://zalo.me/0961923983" target="_blank" rel="noopener" style="color:#1e4f8f;">0961 923 983</a>';
    document.body.appendChild(f);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addCredit);
  } else { addCredit(); }
})();
