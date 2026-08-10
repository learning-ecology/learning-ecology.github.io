/* ===== HSK Slides: Excel → lesson JSON → slide plan =====================
   Phase 56 dựng khung; Phase 57 thay ngân hàng bài tập bằng sáu loại
   hoạt động TƯƠNG TÁC và thêm trạng thái tư liệu cho từng từ.
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

    /* --- 5 & 6. Luyện tập (Phase 57) ---
       SÁU loại bài, tất cả đều TƯƠNG TÁC THẬT trên slide. Bản Phase 56 chỉ
       đọc ra rồi hiện sẵn đáp án; giờ mỗi loại có một cỗ máy riêng bên
       trình chiếu, nên chỗ này chỉ lo chuẩn hoá DỮ LIỆU:

         mcq      chọn A/B/C/D            → options[] + answerIndex
         fill     điền vào chỗ trống      → answers[] (chấp nhận nhiều đáp án)
         arrange  sắp xếp thành câu       → tokens[] + answer
         match    nối cột trái với phải   → pairs[]
         picture  nhìn ảnh chọn từ        → pairs[] (ảnh lấy từ Vocabulary)
         pinyin   nối chữ Hán với pinyin  → pairs[]

       match/picture/pinyin: mỗi DÒNG là một cặp, các dòng liền nhau cùng
       loại gộp thành MỘT hoạt động. Để trống hết left/right thì hệ thống
       tự dựng hoạt động từ chính từ vựng của bài — nhờ vậy tệp Excel sau
       chỉ cần một dòng "pinyin" là có bài nối pinyin đầy đủ. */
    readPractice(pickSheet(wb, 'GrammarPractice', ['Luyện tập ngữ pháp']), lesson.grammarPractice);
    readPractice(pickSheet(wb, 'VocabPractice', ['Luyện tập từ vựng']), lesson.vocabPractice);
    lesson.grammarPractice = groupActivities(lesson.grammarPractice);
    lesson.vocabPractice  = groupActivities(lesson.vocabPractice);

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

  /* tên loại bài: chấp nhận cả tiếng Anh dài, tiếng Việt không dấu và bản mẫu cũ */
  const EX_ALIAS = {
    'multiple_choice':'mcq', 'multiple choice':'mcq', 'trac_nghiem':'mcq', 'chon_dap_an':'mcq',
    'fill_blank':'fill', 'fill in the blank':'fill', 'fill_in_the_blank':'fill', 'dien_tu':'fill',
    'dien_vao_cho_trong':'fill', 'cloze':'fill', 'complete':'fill', 'sentence_completion':'fill',
    'correct':'fill', 'correction':'fill', 'sua_loi':'fill',
    'matching':'match', 'noi':'match', 'noi_tu':'match',
    'sentence_arrangement':'arrange', 'arrangement':'arrange', 'sap_xep':'arrange',
    'sap_xep_cau':'arrange', 'order':'arrange',
    'picture_matching':'picture', 'picture matching':'picture', 'noi_hinh':'picture', 'hinh_anh':'picture',
    'pinyin_matching':'pinyin', 'pinyin matching':'pinyin', 'noi_pinyin':'pinyin',
    'structure':'mcq'
  };
  const EX_TYPES = ['mcq','fill','arrange','match','picture','pinyin'];
  const PAIRED   = ['match','picture','pinyin'];
  const splitList = s => S(s).split(/\s*[\/|,、;]\s*|\s{2,}/).map(x => x.trim()).filter(Boolean);

  function readPractice(ws, bucket) {
    objRows(ws, ['type','question','a','b','c','d','answer','left','right','tokens','image','explanation'])
    .forEach(r => {
      let type = S(r.type).toLowerCase().replace(/\s+/g, ' ');
      type = EX_ALIAS[type] || EX_ALIAS[type.replace(/ /g, '_')] || type;
      if (!type && !S(r.question) && !S(r.left)) return;

      const item = { type, question: S(r.question), explanation: S(r.explanation), _ok: true, _why: '' };
      const fail = why => { item._ok = false; item._why = why; };

      /* Dòng ghi một loại nhưng viết ra lại đúng khuôn trắc nghiệm (bốn
         phương án a–d + đáp án A/B/C/D) thì hiểu là trắc nghiệm. Bài mẫu
         gốc ghi "fill_blank" và "matching" cho những câu như vậy; theo
         đúng nhãn thì cả hai đều hỏng. */
      const asOpts = ['a','b','c','d'].map(k => S(r[k])).filter(Boolean);
      if (type !== 'mcq' && asOpts.length >= 2 && optionIndex(S(r.answer), asOpts) >= 0) {
        item._retyped = type; item.type = type = 'mcq';
      }

      if (EX_TYPES.indexOf(type) < 0) { fail('loại bài "' + (type || '(trống)') + '" chưa hỗ trợ'); bucket.push(item); return; }

      if (type === 'mcq') {
        item.options = ['a','b','c','d'].map(k => S(r[k])).filter(Boolean);
        item.answerIndex = optionIndex(S(r.answer), item.options);
        if (item.options.length < 2) fail('cần ít nhất hai phương án ở cột a–d');
        else if (item.answerIndex < 0) fail('cột answer phải là A/B/C/D hoặc trùng đúng chữ của một phương án');
      } else if (type === 'fill') {
        item.answers = splitList(r.answer);
        /* câu hỏi không có chỗ trống thì tự thêm vào cuối, đỡ phải dặn thầy */
        if (!/_{2,}|\.{3,}|…/.test(item.question)) item.question = item.question + ' ______';
        if (!item.answers.length) fail('thiếu đáp án ở cột answer');
      } else if (type === 'arrange') {
        item.answer = S(r.answer);
        item.tokens = splitList(r.tokens);
        if (!item.tokens.length && item.answer) item.tokens = tokensFromAnswer(item.answer);
        if (!item.answer) fail('thiếu câu đúng ở cột answer');
        else if (item.tokens.length < 2) fail('cần ít nhất hai thẻ ở cột tokens');
      } else {                                   /* match · picture · pinyin */
        item.left = S(r.left); item.right = S(r.right); item.image = S(r.image);
        item._pair = true;
      }
      bucket.push(item);
    });
  }

  /* "你好" → ["你","好"] ; "我 是 学生" → ["我","是","学生"] */
  function tokensFromAnswer(ans) {
    const a = S(ans).replace(/[。！？，、]/g, '');
    if (/\s/.test(a)) return a.split(/\s+/).filter(Boolean);
    return Array.from(a).filter(c => c.trim());
  }
  function optionIndex(ans, options) {
    const a = S(ans);
    if (!a) return -1;
    if (/^[a-dA-D]$/.test(a)) { const i = a.toUpperCase().charCodeAt(0) - 65; return i < options.length ? i : -1; }
    return options.findIndex(o => S(o) === a);
  }

  /* các dòng liền nhau cùng loại ghép cặp → MỘT hoạt động */
  const PAIR_TITLE = { match: 'Nối từ với nghĩa đúng', picture: 'Nhìn hình chọn từ đúng',
                       pinyin: 'Nối chữ Hán với pinyin' };
  function groupActivities(list) {
    const out = [];
    let run = null;
    const flush = () => {
      if (!run) return;
      if (!run.pairs.length) { run.auto = true; }        /* dòng trống → tự dựng từ từ vựng của bài */
      else if (run.pairs.length < 2) { run._ok = false; run._why = 'cần ít nhất hai cặp'; }
      out.push(run); run = null;
    };
    list.forEach(it => {
      if (!it._pair) { flush(); out.push(it); return; }
      if (!run || run.type !== it.type) { flush();
        run = { type: it.type, question: it.question || PAIR_TITLE[it.type], pairs: [],
                explanation: '', _ok: true, _why: '' }; }
      if (it.question && !run.question) run.question = it.question;
      if (it.explanation && !run.explanation) run.explanation = it.explanation;
      if (it.left || it.right) run.pairs.push({ left: it.left, right: it.right, image: it.image });
    });
    flush();
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

  /* các hàm dựng slide plan nằm ở hsk-plan.js — dùng chung với trang trình chiếu */
  const P = () => root.HSKPlan || (function(){ throw new Error('Thiếu hsk-plan.js'); })();
  const buildSlidePlan  = l => P().buildSlidePlan(l);
  const buildSections   = l => P().buildSections(l);
  const pairsOf         = (a, l) => P().pairsOf(a, l);
  const activityUsable  = (a, l) => P().activityUsable(a, l);

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

      /* trạng thái tư liệu — thầy chỉ phải sửa đúng từ nào thiếu (yêu cầu 17) */
      st.illustration = v.image && v.image.url ? (v.image.source || 'teacher') : 'none';
      st.strokeChars  = v.chars || [];
      st.strokeStatus = (v.chars || []).length ? 'unknown' : 'none';   // trang quản lý kiểm tra thật rồi điền vào
      if (st.illustration === 'none') { if (st.status === 'ready') st.status = 'warn'; st.notes.push('chưa có ảnh minh hoạ'); }
      else if (st.illustration === 'auto') st.notes.push('ảnh tự tìm — nên xem lại');
      if (st.strokeStatus === 'none') { if (st.status === 'ready') st.status = 'warn'; st.notes.push('không có chữ Hán để vẽ nét'); }

      if (!(v.examples || []).length) { warns.push(at + ': chưa có câu ví dụ nào.'); }
      (v.examples || []).forEach((e, k) => {
        if (!e.vi) warns.push(at + ' · ví dụ ' + (k + 1) + ': chưa có bản dịch tiếng Việt.');
      });
      items.push(st);
    });

    const checkBank = (list, label) => (list || []).forEach((p, i) => {
      if (p._retyped) warns.push(label + ' ' + (i + 1) + ': cột type ghi "' + p._retyped +
        '" nhưng dòng có sẵn bốn phương án và đáp án A/B/C/D, nên hệ thống hiểu là bài trắc nghiệm.');
      if (activityUsable(p, lesson)) return;
      const why = p._why || (PAIRED.indexOf(p.type) >= 0 ? 'chưa đủ hai cặp để nối' : 'thiếu dữ liệu');
      warns.push(label + ' ' + (i + 1) + ' (' + (p.type || 'không rõ loại') + '): ' + why + ' — câu này sẽ không lên slide.');
    });
    checkBank(lesson.grammarPractice, 'Luyện tập ngữ pháp');
    checkBank(lesson.vocabPractice, 'Luyện tập từ vựng');

    (lesson.grammar || []).forEach((g, i) => {
      if (!g.structure) warns.push('Ngữ pháp ' + (i + 1) + ' (' + g.title + '): chưa có cột structure.');
      if (!(g.examples || []).length) warns.push('Ngữ pháp ' + (i + 1) + ' (' + g.title + '): chưa có câu ví dụ.');
    });

    const sections = buildSections(lesson);
    const plan = buildSlidePlan(lesson);
    const drills = plan.filter(s => s.kind === 'practice').length;
    return { errs, warns, items, sections,
             stats: { vocab: V.length, slides: plan.length, sections: sections.length,
                      grammar: (lesson.grammar || []).length,
                      radicals: (lesson.radicals || []).length,
                      drills,
                      autoPinyin: V.filter(v => v.pinyinSource === 'auto').length,
                      images: V.filter(v => v.image && v.image.url).length } };
  }

  /* các hàm plan được xuất lại cho tiện gọi — nguồn thật vẫn là hsk-plan.js */
  root.HSKParser = { parseWorkbook, enrichLesson, validateLesson, buildSlidePlan, buildSections,
                     autoPinyin, pairsOf, activityUsable,
                     get exTitle()  { return P().exTitle; },
                     get EX_LABEL() { return P().EX_LABEL; } };
})(typeof window !== 'undefined' ? window : globalThis);
