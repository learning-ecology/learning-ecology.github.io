// ============================================================
//  Thong's Learning Hub — lesson tracker
//
//  Add these TWO lines near the end of any HTML lesson's <body>:
//
//  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//  <script src="https://lqthongforwork.github.io/learninghub/tracker.js"></script>
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
    section(name)          { record("section", String(name), 1, null, true); }
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
      '<a href="https://lqthongforwork.github.io/learninghub/" ' +
      'style="display:inline-block;background:#1e4f8f;color:#fff;text-decoration:none;' +
      'padding:0.7rem 1.4rem;border-radius:10px;font-weight:600;">Thong\u2019s Learning Hub \u2192</a>' +
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
  let baseSeconds = 0, accrued = 0;
  let visibleSince = document.visibilityState === "visible" ? Date.now() : null;
  function totalSeconds() {
    return Math.round(baseSeconds + accrued +
      (visibleSince ? (Date.now() - visibleSince) / 1000 : 0));
  }
  function flushTime() {
    if (ready && uid && lessonId) record("time", "total", totalSeconds(), null, false);
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

    // Continue from previously recorded time.
    try {
      const { data } = await sb.from("lesson_activity").select("value")
        .eq("student_id", uid).eq("lesson_id", lessonId)
        .eq("kind", "time").eq("key", "total").maybeSingle();
      baseSeconds = Number(data?.value) || 0;
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
          .select("active_session, role").eq("id", uid).maybeSingle();
        if (data && data.role !== "admin" &&
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
})();
