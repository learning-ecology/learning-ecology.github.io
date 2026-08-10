/* ===== HSK Slides: Excel → lesson JSON → slide plan (Phase 56) ==========
   Ba việc TÁCH RIÊNG, đúng như yêu cầu tách dữ liệu khỏi trình bày:

     parseWorkbook(wb)   Excel  → dữ liệu bài học thuần (không có HTML)
     enrichLesson(l)     điền pinyin còn thiếu, đánh dấu nguồn
     buildSlidePlan(l)   dữ liệu → danh sách slide có id, KHÔNG số cứng
     validateLesson(l)   kiểm tra trước khi đăng

   Không hàm nào ở đây sinh HTML. Trình chiếu tự dựng giao diện từ
   slide plan, nên đổi giao diện không phải đụng vào dữ liệu và ngược lại.
   ===================================================================== */
(function (root) {

  /* ---------- đọc bảng tính ---------- */
  function aoa(ws) { return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' }); }
  function objRows(ws, headers) {
    if (!ws) return [];
    const rows = aoa(ws), h0 = headers[0];
    let hi = rows.findIndex(r => r.map(x => String(x == null ? '' : x).trim().toLowerCase())
                                 .includes(h0.toLowerCase()));
    if (hi < 0) return [];
    const head = rows[hi].map(x => String(x == null ? '' : x).trim().toLowerCase());
    const idx = {}; headers.forEach(h => idx[h] = head.indexOf(h.toLowerCase()));
    const out = [];
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.every(c => String(c == null ? '' : c).trim() === '')) continue;
      const o = {}; headers.forEach(h => { o[h] = idx[h] >= 0 ? r[idx[h]] : ''; });
      out.push(o);
    }
    return out;
  }
  const S = v => v == null ? '' : String(v).trim();
  const N = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
  const HAN = /[一-鿿㐀-䶿]/;
  const onlyHan = s => Array.from(S(s)).filter(c => HAN.test(c));

  /* Sheet phải khớp CHÍNH XÁC theo thứ tự ưu tiên, không dùng "chứa chuỗi":
     bản cũ dò theo substring nên "Grammar Practice" có thể bị nhận nhầm
     thành sheet "Grammar" tuỳ thứ tự sheet trong tệp. */
  function pickSheet(wb, exact, fallbacks) {
    const names = wb.SheetNames;
    let hit = names.find(n => n.trim().toLowerCase() === exact.toLowerCase());
    if (hit) return wb.Sheets[hit];
    for (const f of (fallbacks || [])) {
      hit = names.find(n => n.trim().toLowerCase() === f.toLowerCase());
      if (hit) return wb.Sheets[hit];
    }
    return null;
  }

  function parseWorkbook(wb) {
    if (typeof XLSX === 'undefined') throw new Error('Chưa tải được thư viện đọc Excel.');

    /* --- 1. Thông tin bài --- */
    const info = {};
    const infoWs = pickSheet(wb, 'LessonInfo', ['Lesson Info', 'Thông tin bài', 'Info', 'Meta']);
    (aoa(infoWs) || []).forEach(r => {
      /* ô đầu có thể rỗng → r[0] là undefined; bản cũ gọi .toString() ở đây và văng lỗi */
      const k = S(r && r[0]).toLowerCase(), v = S(r && r[1]);
      if (!k) return;
      info[k] = v;
    });
    const pick = (...keys) => { for (const k of keys) if (info[k]) return info[k]; return ''; };

    const lesson = {
      schema: 'hsk-lesson/1.0',
      lessonId:  pick('lessonid', 'mã bài', 'id'),
      course:    pick('course', 'khóa học', 'khoá học'),
      hskLevel:  N(pick('hsklevel', 'hsk', 'cấp độ')) || 1,
      lessonNo:  pick('lessonnumber', 'lessonno', 'số bài'),
      title:     pick('title', 'tiêu đề'),
      titleVi:   pick('titlevi', 'tiêu đề tiếng việt'),
      titleZh:   pick('titlezh', 'tiêu đề tiếng trung'),
      subtitle:  pick('subtitle', 'phụ đề'),
      theme:     pick('theme', 'chủ đề'),
      description: pick('description', 'mô tả'),
      vocabulary: [], reading: null, grammar: [],
      grammarPractice: [], vocabPractice: [], radicals: []
    };

    /* --- 2. Từ vựng --- */
    objRows(pickSheet(wb, 'Vocabulary', ['Từ vựng', 'Vocab']),
      ['order','chinese','pinyin','wordclass','vietnamese','example1','example1_vi',
       'example2','example2_vi','notes','image','imagekeyword','stroke'])
    .forEach((r, i) => {
      const zh = S(r.chinese);
      if (!zh) return;
      const ex = [];
      if (S(r.example1)) ex.push({ zh: S(r.example1), pinyin: '', vi: S(r.example1_vi) });
      if (S(r.example2)) ex.push({ zh: S(r.example2), pinyin: '', vi: S(r.example2_vi) });
      lesson.vocabulary.push({
        order: N(r.order) || (i + 1),
        chinese: zh,
        pinyin: S(r.pinyin), pinyinSource: S(r.pinyin) ? 'teacher' : '',
        wordClass: S(r.wordclass),
        vietnamese: S(r.vietnamese),
        examples: ex,
        notes: S(r.notes),
        image: S(r.image) ? { url: S(r.image), source: 'teacher', credit: '' } : null,
        imageKeyword: S(r.imagekeyword),
        strokeOverride: S(r.stroke),
        chars: onlyHan(zh)
      });
    });
    lesson.vocabulary.sort((a, b) => a.order - b.order);

    /* --- 3. Bài đọc: mỗi dòng một câu/lượt thoại ---
       Bài đọc HSK sơ cấp phần lớn là HỘI THOẠI, nên có cột speaker.
       Bài văn xuôi thì để trống cột đó. */
    const rd = objRows(pickSheet(wb, 'Reading', ['Bài đọc']),
      ['title','speaker','chinese','pinyin','vietnamese','notes','audio']);
    const lines = rd.filter(r => S(r.chinese)).map(r => ({
      speaker: S(r.speaker), zh: S(r.chinese), pinyin: S(r.pinyin), vi: S(r.vietnamese)
    }));
    if (lines.length) {
      lesson.reading = {
        title: S(rd[0].title) || 'Bài đọc',
        lines,
        isDialogue: lines.some(l => l.speaker),
        notes: S(rd.find(r => S(r.notes)) ? rd.find(r => S(r.notes)).notes : ''),
        audio: S(rd.find(r => S(r.audio)) ? rd.find(r => S(r.audio)).audio : '')
      };
    }

    /* --- 4. Ngữ pháp: các dòng cùng `order` gộp thành MỘT điểm ngữ pháp --- */
    const gmap = {};
    objRows(pickSheet(wb, 'Grammar', ['Ngữ pháp']),
      ['order','title','structure','explanation','examplezh','examplepinyin','examplevi'])
    .forEach((r, i) => {
      const key = String(N(r.order) || (i + 1));
      if (!gmap[key]) {
        gmap[key] = { order: N(r.order) || (i + 1), title: S(r.title) || ('Ngữ pháp ' + key),
                      structure: S(r.structure), explanation: S(r.explanation), examples: [] };
        lesson.grammar.push(gmap[key]);
      }
      if (S(r.title) && !gmap[key].title) gmap[key].title = S(r.title);
      if (S(r.structure) && !gmap[key].structure) gmap[key].structure = S(r.structure);
      if (S(r.explanation) && !gmap[key].explanation) gmap[key].explanation = S(r.explanation);
      if (S(r.examplezh)) gmap[key].examples.push({ zh: S(r.examplezh), pinyin: S(r.examplepinyin), vi: S(r.examplevi) });
    });
    lesson.grammar.sort((a, b) => a.order - b.order);

    /* --- 5 & 6. Luyện tập --- */
    const EX_TYPES_G = ['mcq','fill','arrange','correct','structure'];
    /* 'fill' dùng được cho cả hai ngân hàng — điền từ là bài từ vựng rất phổ biến */
    const EX_TYPES_V = ['mcq','match','picture','pinyin','cloze','complete','fill'];
    const readPractice = (ws, allowed, bucket) => {
      objRows(ws, ['type','question','a','b','c','d','answer','left','right','explanation'])
      .forEach(r => {
        /* chấp nhận cả tên kiểu viết dài mà bản mẫu đang dùng */
        const ALIAS = { multiple_choice:'mcq', 'multiple choice':'mcq', trac_nghiem:'mcq',
                        fill_blank:'fill', 'fill in the blank':'fill', dien_tu:'fill',
                        matching:'match', noi:'match', arrangement:'arrange', sap_xep:'arrange',
                        correction:'correct', sua_loi:'correct', sentence_completion:'complete' };
        let type = S(r.type).toLowerCase().replace(/\s+/g,' ');
        type = ALIAS[type] || ALIAS[type.replace(/ /g,'_')] || type;
        if (!type && !S(r.question) && !S(r.left)) return;
        const item = { type, question: S(r.question), answer: S(r.answer), explanation: S(r.explanation) };
        if (['mcq','picture','pinyin','structure'].indexOf(type) >= 0) {
          item.options = ['a','b','c','d'].map(k => S(r[k])).filter(Boolean);
        }
        if (type === 'match') { item.left = S(r.left); item.right = S(r.right); }
        item._known = allowed.indexOf(type) >= 0;
        bucket.push(item);
      });
    };
    readPractice(pickSheet(wb, 'GrammarPractice', ['Luyện tập ngữ pháp']), EX_TYPES_G, lesson.grammarPractice);
    readPractice(pickSheet(wb, 'VocabPractice', ['Luyện tập từ vựng']), EX_TYPES_V, lesson.vocabPractice);
    /* các câu ghép cặp cùng nhau thành một bài */
    lesson.vocabPractice = groupMatches(lesson.vocabPractice);

    /* --- 7. Bộ thủ (không bắt buộc) --- */
    objRows(pickSheet(wb, 'Radicals', ['Bộ thủ']),
      ['radical','pinyin','namevi','meaning','position','related','explanation'])
    .forEach(r => {
      if (!S(r.radical)) return;
      lesson.radicals.push({
        radical: S(r.radical), pinyin: S(r.pinyin), nameVi: S(r.namevi),
        meaning: S(r.meaning), position: S(r.position),
        related: S(r.related).split(/[|,、]/).map(x => x.trim()).filter(Boolean),
        explanation: S(r.explanation)
      });
    });

    return lesson;
  }

  function groupMatches(list) {
    const out = [], pairs = [];
    list.forEach(it => { if (it.type === 'match') pairs.push([it.left, it.right]); else out.push(it); });
    if (pairs.length) out.push({ type: 'match', question: 'Nối từ với nghĩa đúng', pairs, _known: true });
    return out;
  }

  /* ---------- làm giàu: chỉ điền chỗ TRỐNG, không đè lên nội dung của thầy ---------- */
  function autoPinyin(text) {
    const lib = root.pinyinPro || root.pinyin_pro;
    if (!lib || !lib.pinyin || !text) return '';
    try { return lib.pinyin(text, { toneType: 'symbol', type: 'string' }); }
    catch (e) { return ''; }
  }
  function enrichLesson(lesson) {
    (lesson.vocabulary || []).forEach(v => {
      if (!v.pinyin) { const p = autoPinyin(v.chinese); if (p) { v.pinyin = p; v.pinyinSource = 'auto'; } }
      (v.examples || []).forEach(e => { if (!e.pinyin) e.pinyin = autoPinyin(e.zh); });
    });
    (lesson.grammar || []).forEach(g =>
      (g.examples || []).forEach(e => { if (!e.pinyin) e.pinyin = autoPinyin(e.zh); }));
    if (lesson.reading) (lesson.reading.lines || []).forEach(l => { if (!l.pinyin) l.pinyin = autoPinyin(l.zh); });
    (lesson.radicals || []).forEach(r => { if (!r.pinyin) r.pinyin = autoPinyin(r.radical); });
    return lesson;
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
    (lesson.grammarPractice || []).forEach((p, i) =>
      s.push({ id: 'gpr-' + i, kind: 'practice', bank: 'grammar', index: i,
               title: 'Luyện ngữ pháp ' + (i + 1), section: 'gpractice' }));
    (lesson.vocabPractice || []).forEach((p, i) =>
      s.push({ id: 'vpr-' + i, kind: 'practice', bank: 'vocab', index: i,
               title: 'Luyện từ vựng ' + (i + 1), section: 'vpractice' }));
    (lesson.radicals || []).forEach((r, i) =>
      s.push({ id: 'radical-' + i, kind: 'radical', index: i, title: 'Bộ ' + r.radical, section: 'radicals' }));
    return s;
  }

  /* mục nào có nội dung thì mới hiện trong danh mục — sheet trống thì tự ẩn */
  function buildSections(lesson) {
    const out = [];
    const add = (key, label, icon, n) => { if (n) out.push({ key, label, icon, count: n }); };
    add('vocab',     'Từ vựng',            '📚', (lesson.vocabulary || []).length);
    add('reading',   'Bài đọc',            '📖', lesson.reading ? (lesson.reading.lines || []).length : 0);
    add('grammar',   'Ngữ pháp',           '🧩', (lesson.grammar || []).length);
    add('gpractice', 'Luyện tập Ngữ pháp', '✍️', (lesson.grammarPractice || []).length);
    add('vpractice', 'Luyện tập Từ vựng',  '🎯', (lesson.vocabPractice || []).length);
    add('radicals',  'Bộ thủ',             '🀄', (lesson.radicals || []).length);
    return out;
  }

  /* ---------- kiểm tra trước khi đăng ---------- */
  function validateLesson(lesson) {
    const errs = [], warns = [], items = [];
    if (!lesson.lessonId) errs.push('Thiếu LessonInfo → lessonId (mã bài, phải là duy nhất).');
    if (!lesson.title)    errs.push('Thiếu LessonInfo → title (tên bài hiển thị).');
    if (!lesson.course)   warns.push('Thiếu LessonInfo → course (tên khoá học hiện trên slide mở đầu).');
    if (!(lesson.hskLevel >= 1 && lesson.hskLevel <= 9))
      errs.push('LessonInfo → hskLevel phải là số từ 1 đến 9.');

    const V = lesson.vocabulary || [];
    if (!V.length) errs.push('Sheet Vocabulary chưa có từ nào — bài học cần ít nhất một từ vựng.');

    const seen = {};
    V.forEach((v, i) => {
      const at = 'Từ ' + (i + 1) + ' (' + (v.chinese || '?') + ')';
      const st = { word: v.chinese, status: 'ready', notes: [] };
      if (!v.chinese) errs.push(at + ': thiếu chữ Hán.');
      else if (!v.chars.length) {
        errs.push(at + ': cột chinese không chứa chữ Hán nào.');
        st.status = 'error'; st.notes.push('không phải chữ Hán');
      }
      if (seen[v.chinese]) { errs.push(at + ': trùng với từ số ' + seen[v.chinese] + '.'); st.status = 'error'; st.notes.push('trùng lặp'); }
      else seen[v.chinese] = i + 1;
      if (!v.vietnamese) { errs.push(at + ': thiếu nghĩa tiếng Việt (cột vietnamese).'); st.status = 'error'; st.notes.push('thiếu nghĩa'); }
      if (!v.pinyin) { warns.push(at + ': chưa có pinyin và cũng không tạo tự động được.'); if (st.status === 'ready') st.status = 'warn'; st.notes.push('thiếu pinyin'); }
      if (!v.image && !v.imageKeyword) { if (st.status === 'ready') st.status = 'warn'; st.notes.push('chưa có ảnh minh hoạ'); }
      if (!(v.examples || []).length) { warns.push(at + ': chưa có câu ví dụ nào.'); }
      (v.examples || []).forEach((e, k) => {
        if (!e.vi) warns.push(at + ' · ví dụ ' + (k + 1) + ': chưa có bản dịch tiếng Việt.');
      });
      items.push(st);
    });

    const badG = (lesson.grammarPractice || []).filter(p => !p._known);
    badG.forEach(p => warns.push('Luyện tập ngữ pháp: loại bài "' + (p.type || '(trống)') + '" chưa hỗ trợ — câu này sẽ bị bỏ qua.'));
    const badV = (lesson.vocabPractice || []).filter(p => !p._known);
    badV.forEach(p => warns.push('Luyện tập từ vựng: loại bài "' + (p.type || '(trống)') + '" chưa hỗ trợ — câu này sẽ bị bỏ qua.'));

    (lesson.grammar || []).forEach((g, i) => {
      if (!g.structure) warns.push('Ngữ pháp ' + (i + 1) + ' (' + g.title + '): chưa có cột structure.');
      if (!(g.examples || []).length) warns.push('Ngữ pháp ' + (i + 1) + ' (' + g.title + '): chưa có câu ví dụ.');
    });

    const sections = buildSections(lesson);
    const plan = buildSlidePlan(lesson);
    return { errs, warns, items, sections,
             stats: { vocab: V.length, slides: plan.length, sections: sections.length,
                      grammar: (lesson.grammar || []).length,
                      radicals: (lesson.radicals || []).length,
                      autoPinyin: V.filter(v => v.pinyinSource === 'auto').length } };
  }

  root.HSKParser = { parseWorkbook, enrichLesson, validateLesson, buildSlidePlan, buildSections, autoPinyin };
})(typeof window !== 'undefined' ? window : globalThis);
