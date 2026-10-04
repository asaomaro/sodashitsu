// 成果物（HTML）の枠。親の `postMessage`（`{type:"ask-view", source: <HTML の文字列>}`）で受けた HTML を、このページの文書として描く（スクリプトも動く）。
// 外へは通信できない（応答のヘッダ `default-src 'none'`）・親・アプリには触れない（sandbox・不透明 origin）。親から来たものだけを受ける（`event.source`）。
(function () {
  'use strict';
  var started = false;
  window.addEventListener('message', function (ev) {
    if (ev.source !== parent || started) return;
    var d = ev.data;
    if (!d || d.type !== 'ask-view' || typeof d.source !== 'string') return;
    started = true;
    document.open();
    document.write(d.source);
    document.close();
    // 書き込みで文書が置き換わるので、キーの取り次ぎは書いた後に付け直す（窓のキャプチャの 1 番目ではなくなるが、枠の中のスクリプトが止めない限り届く）。
    window.addEventListener('keydown', window.__askViewRelayKeys, true);
  });
  parent.postMessage({ type: 'ready' }, '*');
})();
