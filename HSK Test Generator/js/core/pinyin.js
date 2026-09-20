/* ============================================================================
 * pinyin.js  —  Chinese Test Generator
 * ----------------------------------------------------------------------------
 * Renders Chinese text with an optional tone-marked Pinyin line placed above
 * it, without disturbing the surrounding layout. Whole-phrase pinyin is shown
 * as one line above the phrase (we do not attempt per-character alignment
 * because the Excel provides phrase-level pinyin).
 *
 * Visibility model:
 *   - When `include` is false, no pinyin text is emitted into the DOM at all
 *     (used when the teacher forbids showing pinyin — students cannot reveal
 *     what was never rendered).
 *   - When `include` is true, the pinyin <span> is emitted and its visibility
 *     is controlled by a `.pinyin-on` / `.pinyin-off` class on an ancestor,
 *     so the Show/Hide toggle is instant and never shifts layout.
 *
 * Public API (window.CTG.pinyin):
 *   escapeHtml(s)
 *   annotate(chinese, pinyin, include)      -> inline HTML string
 *   annotateBlock(chinese, pinyin, include) -> block HTML string (passages)
 * ==========================================================================*/
(function (global) {
  'use strict';
  var CTG = global.CTG = global.CTG || {};

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Preserve author line breaks (e.g. dialogue A:/B:) as <br>.
  function withBreaks(s) {
    return escapeHtml(s).replace(/\r?\n/g, '<br>');
  }

  function annotate(chinese, pinyin, include) {
    var hz = withBreaks(chinese);
    if (include && pinyin) {
      return '<span class="cn">' +
               '<span class="cn-py">' + withBreaks(pinyin) + '</span>' +
               '<span class="cn-hz">' + hz + '</span>' +
             '</span>';
    }
    return '<span class="cn cn-nopy"><span class="cn-hz">' + hz + '</span></span>';
  }

  function annotateBlock(chinese, pinyin, include) {
    var hz = withBreaks(chinese);
    var out = '<div class="cn-block">';
    if (include && pinyin) {
      out += '<div class="cn-block-py">' + withBreaks(pinyin) + '</div>';
    }
    out += '<div class="cn-block-hz">' + hz + '</div></div>';
    return out;
  }

  CTG.pinyin = {
    escapeHtml: escapeHtml,
    withBreaks: withBreaks,
    annotate: annotate,
    annotateBlock: annotateBlock
  };
})(typeof window !== 'undefined' ? window : this);
