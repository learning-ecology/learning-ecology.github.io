/* ===== HSK Slides: kế hoạch slide (dùng chung) ==========================
   MỘT bản duy nhất cho cả trang trình chiếu và bảng điều khiển. Trước đây
   hsk-slides.html giữ một bản chép tay riêng, nên khi Phase 57 bỏ bài tập
   hỏng ra khỏi slide thì trang quản lý đếm 28 slide còn lớp học lại thấy
   29 — đúng kiểu sai lệch mà việc chép đôi luôn gây ra.

   Thuần dữ liệu, không sinh HTML, không cần thư viện đọc Excel.
   ===================================================================== */
(function (root) {
  /* ba loại bài dạng "nối cặp" — cần ít nhất hai cặp mới chạy được */
  const PAIRED = ['match', 'picture', 'pinyin'];

  /* hoạt động "auto" được dựng từ chính từ vựng của bài, ngay trước khi trình chiếu.
     Để ở đây (không ở trang giảng) nên trang quản lý đếm slide và kiểm tra
     được y hệt những gì thầy sẽ thấy trên lớp. */
  function buildAutoPairs(activity, lesson) {
    const V = (lesson.vocabulary || []);
    if (activity.type === 'pinyin')
      return V.filter(v => v.chinese && v.pinyin).slice(0, 6).map(v => ({ left: v.chinese, right: v.pinyin }));
    if (activity.type === 'picture')
      return V.filter(v => v.image && v.image.url).slice(0, 6)
              .map(v => ({ left: v.chinese, right: v.vietnamese, image: v.image.url }));
    return V.filter(v => v.chinese && v.vietnamese).slice(0, 6)
            .map(v => ({ left: v.chinese, right: v.vietnamese }));
  }
  /* cặp thật sự dùng để hiện và để đếm — auto hay không cũng đi qua đây */
  function pairsOf(activity, lesson) {
    return activity.auto ? buildAutoPairs(activity, lesson) : (activity.pairs || []);
  }
  function activityUsable(activity, lesson) {
    if (!activity._ok) return false;
    if (PAIRED.indexOf(activity.type) >= 0) return pairsOf(activity, lesson).length >= 2;
    return true;
  }

  /* ---------- kế hoạch slide: id sinh từ dữ liệu, KHÔNG số thứ tự cứng ---------- */
  function buildSlidePlan(lesson) {
    const s = [];
    s.push({ id: 'intro', kind: 'intro', title: lesson.title || 'Bài học' });
    s.push({ id: 'hub', kind: 'hub', title: 'DANH MỤC BÀI HỌC' });

    (lesson.vocabulary || []).forEach((v, i) => {
      s.push({ id: 'vocab-' + i, kind: 'vocab', index: i, title: v.chinese, section: 'vocab' });
      if (v.chars && v.chars.length)
        s.push({ id: 'write-' + i, kind: 'write', index: i, title: 'Viết ' + v.chinese, section: 'vocab' });
    });
    if (lesson.reading && (lesson.reading.lines || []).length)
      s.push({ id: 'reading', kind: 'reading', title: lesson.reading.title, section: 'reading' });
    (lesson.grammar || []).forEach((g, i) =>
      s.push({ id: 'grammar-' + i, kind: 'grammar', index: i, title: g.title, section: 'grammar' }));
    /* bài tập hỏng (thiếu đáp án, chưa đủ cặp…) KHÔNG lên slide — trang quản
       lý đã nhắc trong bảng kiểm tra, đưa lên lớp chỉ tổ lúng túng */
    (lesson.grammarPractice || []).forEach((p, i) => { if (!activityUsable(p, lesson)) return;
      s.push({ id: 'gpr-' + i, kind: 'practice', bank: 'grammar', index: i,
               title: exTitle(p, i), section: 'gpractice' }); });
    (lesson.vocabPractice || []).forEach((p, i) => { if (!activityUsable(p, lesson)) return;
      s.push({ id: 'vpr-' + i, kind: 'practice', bank: 'vocab', index: i,
               title: exTitle(p, i), section: 'vpractice' }); });
    (lesson.radicals || []).forEach((r, i) =>
      s.push({ id: 'radical-' + i, kind: 'radical', index: i, title: 'Bộ ' + r.radical, section: 'radicals' }));
    return s;
  }

  const EX_LABEL = { mcq: 'Chọn đáp án', fill: 'Điền vào chỗ trống', arrange: 'Sắp xếp câu',
                     match: 'Nối từ', picture: 'Nhìn hình chọn từ', pinyin: 'Nối pinyin' };
  function exTitle(p, i) { return (EX_LABEL[p.type] || 'Luyện tập') + ' ' + (i + 1); }

  /* mục nào có nội dung thì mới hiện trong danh mục — sheet trống thì tự ẩn */
  function buildSections(lesson) {
    const out = [];
    const add = (key, label, icon, n) => { if (n) out.push({ key, label, icon, count: n }); };
    const usable = list => (list || []).filter(p => activityUsable(p, lesson)).length;
    add('vocab',     'Từ vựng',            '📚', (lesson.vocabulary || []).length);
    add('reading',   'Bài đọc',            '📖', lesson.reading ? (lesson.reading.lines || []).length : 0);
    add('grammar',   'Ngữ pháp',           '🧩', (lesson.grammar || []).length);
    add('gpractice', 'Luyện tập Ngữ pháp', '✍️', usable(lesson.grammarPractice));
    add('vpractice', 'Luyện tập Từ vựng',  '🎯', usable(lesson.vocabPractice));
    add('radicals',  'Bộ thủ',             '🀄', (lesson.radicals || []).length);
    return out;
  }


  root.HSKPlan = { buildSlidePlan, buildSections, pairsOf, activityUsable,
                   buildAutoPairs, exTitle, EX_LABEL };
})(typeof window !== 'undefined' ? window : globalThis);
