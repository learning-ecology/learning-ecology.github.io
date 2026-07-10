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
    score(name, got, max)  { record("activity", String(name), Number(got) || 0, Number(max) || null, false); }
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
    if (!session || !lessonId) return;   // not a hub student → do nothing
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }
})();
