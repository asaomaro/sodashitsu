// Markdown の枠のリンクの判定（純関数）。`markdown.js` が読み、単体テストも同じファイルを読む。
// 開けるのは、先頭が小文字の `http://`・`https://` で、前後の空白・制御文字・改行・バックスラッシュを含まず、URL として読める値だけ。
// `//host`（プロトコル相対）・`HTTP://`・`javascript:`・`data:`・相対・`#` 以外は開けない（拒否が安全）。
(function (root) {
  'use strict';
  function openableHref(href) {
    if (typeof href !== 'string') return false;
    if (!/^https?:\/\/(?!\/)[^\s\u0000-\u001f\u007f-\u009f\\]+$/.test(href)) return false;
    try {
      var u = new URL(href);
      return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname !== '';
    } catch (e) {
      return false;
    }
  }
  var api = { openableHref: openableHref };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.askViewLinks = api;
})(typeof self !== 'undefined' ? self : this);
