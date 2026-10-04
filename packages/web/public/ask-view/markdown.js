// 成果物（Markdown）の枠。親の `postMessage`（`{type:"ask-view", source, dark?}`）で受けた Markdown を marked で HTML にし、mermaid のコードを図にする。
// marked は無害化しない。**隔離は枠（sandbox・不透明 origin）と応答のヘッダ（script-src 'self'・default-src 'none'）が担う**: 埋め込まれた `<script>`・`onerror=` 等のインラインは CSP が止める。
// 外へは通信できない。親から来たものだけを受ける（`event.source`）。
(function () {
  'use strict';
  var doc = document.getElementById('doc');
  var source = document.getElementById('source');
  var toggle = document.getElementById('toggle');
  var started = false;

  function plain() {
    doc.hidden = true;
    source.hidden = false;
    toggle.hidden = true;
  }
  function load(name) {
    return new Promise(function (ok, ng) {
      var s = document.createElement('script');
      s.src = 'vendor/' + name;
      s.onload = ok;
      s.onerror = function () { ng(new Error(name + ' を読めません')); };
      document.head.append(s);
    });
  }
  toggle.addEventListener('click', function () {
    var on = toggle.getAttribute('aria-pressed') !== 'true';
    toggle.setAttribute('aria-pressed', String(on));
    toggle.textContent = on ? '整形して見る' : 'ソースを見る';
    doc.hidden = on;
    source.hidden = !on;
  });

  async function diagrams(dark) {
    var blocks = Array.prototype.slice.call(doc.querySelectorAll('pre > code.language-mermaid'));
    if (!blocks.length) return;
    await load('mermaid.min.js'); // 図があるときだけ読む（大きいので）
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default' });
    for (var i = 0; i < blocks.length; i++) {
      var pre = blocks[i].parentNode;
      try {
        var out = await mermaid.render('mmd' + i, blocks[i].textContent);
        var fig = document.createElement('div');
        fig.className = 'mermaid';
        fig.innerHTML = out.svg;
        pre.replaceWith(fig);
      } catch (e) { // 描けない図は、コードのまま残して理由を添える
        var note = document.createElement('div');
        note.className = 'mermaid-error';
        note.textContent = '図にできませんでした: ' + String((e && e.message) || e).split('\n')[0];
        pre.after(note);
        Array.prototype.forEach.call(document.querySelectorAll('body > [id^="dmmd"], body > svg[id^="mmd"]'), function (junk) { junk.remove(); });
      }
    }
  }

  window.addEventListener('message', async function (ev) {
    if (ev.source !== parent || started) return;
    var d = ev.data;
    if (!d || d.type !== 'ask-view' || typeof d.source !== 'string') return;
    started = true;
    var dark = d.dark === true || (d.dark === undefined && matchMedia('(prefers-color-scheme:dark)').matches);
    document.documentElement.setAttribute('data-dark', dark ? '1' : '0');
    source.textContent = d.source;
    try {
      await load('marked.umd.js');
      doc.innerHTML = marked.parse(d.source, { gfm: true });
      // 枠自身を動かす・外へ繋ぐ要素は取り除く（CSP の default-src 'none' では止まらない `<meta http-equiv=refresh>`・`<base>`・`<form>` 等）。
      Array.prototype.forEach.call(doc.querySelectorAll('meta, link, base, form, iframe, frame, object, embed'), function (el) { el.remove(); });
      // リンクは開けない（外への通信を止める）。文字として残し、行き先は title に出す。同じ文書の中の `#` は残す。
      // SVG の中のリンクは `xlink:href` で書けるので、`href` のあるものだけでなくすべての `a` を見て、両方の属性を外す。
      Array.prototype.forEach.call(doc.querySelectorAll('a'), function (a) {
        var href = a.getAttribute('href') || a.getAttribute('xlink:href') || '';
        if (href.charAt(0) === '#') return;
        a.removeAttribute('href');
        a.removeAttribute('xlink:href');
        if (href !== '') a.title = href;
      });
      toggle.hidden = false;
    } catch (e) {
      plain();
      return;
    }
    try {
      await diagrams(dark);
    } catch (e) {
      var note = document.createElement('div');
      note.className = 'mermaid-error';
      note.textContent = 'mermaid の図は、コードのまま出しています（' + ((e && e.message) || e) + '）';
      doc.prepend(note);
    }
    document.documentElement.dataset.ready = '1';
    parent.postMessage({ type: 'rendered' }, '*');
  });
  parent.postMessage({ type: 'ready' }, '*');
})();
