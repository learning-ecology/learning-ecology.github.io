/* ===== Giọng đọc tiếng Trung dùng chung (Phase 58) ======================
   MỘT chỗ duy nhất lo việc đọc tiếng Trung cho các trang bài giảng.

   Vì sao phải viết lại: bản Phase 56 gọi thẳng
       new SpeechSynthesisUtterance(text); u.lang = 'zh-CN'
   rồi phó mặc cho trình duyệt chọn giọng. Trên máy Mac thường rơi vào
   giọng máy cũ, đọc rời từng chữ, nghe rất "máy" — đúng như thầy nhận
   xét. Tệ hơn: nếu máy không có giọng tiếng Trung nào thì trình duyệt
   lấy đại giọng tiếng Anh/tiếng Việt đọc chữ Hán.

   Thứ tự ưu tiên:
     1. Bản ghi đã duyệt trong thư viện  (mediaGet — dùng lại, không tốn lượt)
     2. Azure Neural  (giọng thật, dùng CHUNG khoá đã lưu ở Đọc hiểu)
     3. Giọng tốt nhất có trên máy, đã lọc và xếp hạng
     4. Im lặng còn hơn đọc sai — không bao giờ để giọng Anh/Việt đọc chữ Hán.

   Trang gọi chỉ cần: ZhSpeech.configure({...}) một lần, rồi ZhSpeech.speak(text).
   ===================================================================== */
(function (root) {
  'use strict';

  const CFG = {
    db: null,            // Supabase client (để đọc khoá Azure dùng chung)
    mediaGet: null,      // async (key) → url | ''      tra thư viện
    mediaPut: null,      // async (key, blob) → url     ghi vào thư viện (chỉ giáo viên)
    canCache: false,     // chỉ giáo viên mới được ghi
    voice: 'zh-CN-XiaoxiaoNeural',
    rate: 0              // % so với tốc độ chuẩn
  };
  let AZ = null;         // { key, region } — null nghĩa là chưa hỏi
  let azOk = true;       // tắt hẳn Azure sau khi hỏng, khỏi chờ lâu mỗi lần bấm

  function configure(opts) { Object.assign(CFG, opts || {}); }

  /* ---------- chọn giọng trên máy ----------
     Xếp hạng giống trang Đọc hiểu để cả hệ thống nghe giống nhau. */
  function quality(v) {
    const n = (v.name + ' ' + v.voiceURI).toLowerCase();
    if (n.includes('natural') || n.includes('neural')) return 4;
    if (n.includes('siri') || n.includes('premium') || n.includes('enhanced')) return 3;
    if (n.includes('google')) return 2.5;
    if (/flo|sandy|shelley|eddy|reed|rocko|grandma|grandpa|novelty|eloquence/.test(n)) return 0.5;
    return 1;
  }
  /* hàm THUẦN, tách khỏi trình duyệt để kiểm thử được */
  function rankVoices(list) {
    return (list || [])
      /* CHỈ tiếng Phổ thông. Giọng Quảng Đông đọc chữ Hán ra âm khác hẳn,
         còn giọng Anh/Việt thì đọc thành ký tự vô nghĩa. */
      .filter(v => /^zh([-_](cn|tw|sg))?$/i.test(v.lang) || /^cmn/i.test(v.lang))
      .filter(v => !/hk|cantonese|sinji|aasing|yue/i.test(v.lang + ' ' + v.name))
      .sort((a, b) => (quality(b) - quality(a)) ||
                      (/^zh[-_]cn/i.test(b.lang) ? 1 : 0) - (/^zh[-_]cn/i.test(a.lang) ? 1 : 0));
  }
  function mandarinVoices() {
    if (!('speechSynthesis' in root)) return [];
    return rankVoices(speechSynthesis.getVoices());
  }
  /* danh sách để trang quản lý hiện ra cho thầy chọn */
  const AZURE_VOICES = [
    { id: 'zh-CN-XiaoxiaoNeural',  label: '👩 Xiaoxiao — nữ, ấm (mặc định)' },
    { id: 'zh-CN-YunxiNeural',     label: '👨 Yunxi — nam, trẻ' },
    { id: 'zh-CN-XiaoyiNeural',    label: '👩 Xiaoyi — nữ, trong trẻo' },
    { id: 'zh-CN-YunjianNeural',   label: '👨 Yunjian — nam, trầm' },
    { id: 'zh-CN-XiaoshuangNeural',label: '🧒 Xiaoshuang — bé gái' },
    { id: 'device',                label: '💻 Giọng có sẵn trên máy' }
  ];

  /* ---------- Azure ---------- */
  async function azConf() {
    if (AZ) return AZ;
    AZ = { key: '', region: 'southeastasia' };
    try {
      /* dùng chung đúng khoá thầy đã lưu ở Đọc hiểu — không phải nhập lại */
      const { data } = await CFG.db.from('reading_settings').select('az_key,az_region').eq('id', 1).maybeSingle();
      if (data && data.az_key) AZ = { key: data.az_key, region: data.az_region || 'southeastasia' };
    } catch (e) {}
    return AZ;
  }
  const escXml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  async function azureSynth(text, voice, ratePct) {
    const { key, region } = await azConf();
    if (!key) throw new Error('no-key');
    const res = await fetch('https://' + region + '.tts.speech.microsoft.com/cognitiveservices/v1', {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml',
                 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3' },
      body: '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">' +
            '<voice name="' + voice + '"><prosody rate="' + (ratePct >= 0 ? '+' : '') + Math.round(ratePct) + '%">' +
            escXml(text) + '</prosody></voice></speak>'
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return new Blob([await res.arrayBuffer()], { type: 'audio/mpeg' });
  }

  /* ---------- nhịp đọc (yêu cầu 8) ----------
     Từ đơn: chậm hơn một chút cho rõ thanh điệu.
     Câu và bài đọc: giữ nhịp tự nhiên, đọc chậm quá thành rời rạc. */
  const isWord = t => Array.from(String(t).replace(/[\s，。！？、；：]/g, '')).length <= 4;
  function rateFor(text) { return CFG.rate + (isWord(text) ? -12 : 0); }

  /* ---------- thư viện phát âm (yêu cầu 6) ----------
     Khoá gồm cả tên giọng: đổi giọng cho bài thì sinh lại, không phát nhầm
     bản ghi của giọng cũ. Chỉ lưu từ/câu ngắn — bài đọc dài thì phát thẳng. */
  const memo = new Map();                       // text|voice|rate → Promise<Blob|url>
  const cacheKey = (text, voice) => voice + '|' + text;
  const worthCaching = t => String(t).length <= 30;

  let token = 0, audio = null;
  function stop() {
    token++;
    if (audio) { try { audio.pause(); } catch (e) {} audio = null; }
    try { speechSynthesis.cancel(); } catch (e) {}
  }

  function playUrl(url, my) {
    return new Promise(done => {
      const a = new Audio(url); audio = a;
      a.onended = a.onerror = () => done();
      a.play().catch(() => done());
      if (token !== my) { try { a.pause(); } catch (e) {} done(); }
    });
  }

  function speakDevice(text, my) {
    if (!('speechSynthesis' in root)) return;
    const v = mandarinVoices()[0];
    /* Không có giọng tiếng Trung nào thì THÔI — để trình duyệt tự chọn
       nghĩa là giọng tiếng Anh đọc chữ Hán, còn tệ hơn im lặng. */
    if (!v) { if (CFG.onNoVoice) CFG.onNoVoice(); return; }
    const u = new SpeechSynthesisUtterance(String(text));
    u.voice = v; u.lang = v.lang || 'zh-CN';
    u.rate = 1 + rateFor(text) / 100;
    if (token === my) speechSynthesis.speak(u);
  }

  async function speak(text) {
    text = String(text == null ? '' : text).trim();
    if (!text) return;
    stop();
    const my = token;
    const voice = CFG.voice || 'zh-CN-XiaoxiaoNeural';

    if (voice === 'device') { speakDevice(text, my); return; }

    const key = cacheKey(text, voice);

    /* 1. đã có trong thư viện chưa? */
    if (CFG.mediaGet && worthCaching(text)) {
      try {
        const url = await CFG.mediaGet(key);
        if (url) { if (token !== my) return; await playUrl(url, my); return; }
      } catch (e) {}
    }

    /* 2. Azure Neural */
    if (azOk) {
      try {
        let p = memo.get(key);
        if (!p) {
          p = azureSynth(text, voice, rateFor(text));
          p.catch(() => memo.delete(key));
          if (memo.size > 60) memo.delete(memo.keys().next().value);
          memo.set(key, p);
        }
        const blob = await p;
        if (token !== my) return;
        const url = URL.createObjectURL(blob);
        const playing = playUrl(url, my);
        /* ghi vào thư viện để bài sau và học viên khác dùng lại */
        if (CFG.canCache && CFG.mediaPut && worthCaching(text)) {
          CFG.mediaPut(key, blob).catch(() => {});
        }
        await playing;
        URL.revokeObjectURL(url);
        return;
      } catch (e) {
        if (String(e.message) === 'no-key') azOk = false;      // chưa có khoá — khỏi thử lại
        else if (/HTTP 4/.test(e.message)) azOk = false;       // khoá sai/hết hạn
      }
    }

    /* 3. giọng trên máy */
    if (token === my) speakDevice(text, my);
  }

  root.ZhSpeech = { configure, speak, stop, mandarinVoices, rankVoices, rateFor, AZURE_VOICES,
                    get usingAzure() { return azOk; } };
})(typeof window !== 'undefined' ? window : globalThis);
