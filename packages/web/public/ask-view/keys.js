// 成果物の枠の中のキーを、親（Sodashitsu の質問のダイアログ）へ取り次ぐ（20261004-ask-media-popup）。
// 枠は別 origin 扱い（sandbox・`allow-same-origin` なし）なので、枠の中にフォーカスがあるとキーは親の `<dialog>` へ届かない。
// 取り次ぐのは 3 種だけ: Escape（取り消し）・Ctrl/Cmd+Enter（決定）・Alt+PageUp/PageDown（前後の質問）。親は `event.source` が自分の枠のときだけ受ける。
(function () {
  'use strict';
  function relay(e) {
    if (e.isComposing || e.keyCode === 229) return;
    var ok =
      e.key === 'Escape' ||
      (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ||
      (e.altKey && (e.key === 'PageUp' || e.key === 'PageDown'));
    if (!ok) return;
    e.preventDefault();
    parent.postMessage({ type: 'key', key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey }, '*');
  }
  window.addEventListener('keydown', relay, true);
  window.__askViewRelayKeys = relay;
})();
