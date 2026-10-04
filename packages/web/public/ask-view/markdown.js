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

  // 枠自身を動かす・外へ繋ぐ要素と、リンクを絞る。整形の直後（`marked` の出力）と、mermaid の図を挿入した直後の両方に掛ける
  // （図のラベルの HTML・`click … href` は `<a>` を作り、SMIL は `href` を後から書き換えるので、図の中にも掛けないと枠自身が外へ移れる）。
  // `whole` が真のときは `svg`・`math` も取り除く（Markdown への直書きは捨てる）。図の SVG そのものは残すので、図には偽を渡す。
  var SMIL = 'set, animate, animateTransform, animateMotion, animateColor';
  function sanitize(root, whole) {
    var links = whole; // 外へ開けるリンクは本文だけ（図の中のリンクは開かせない）
    // CSP の default-src 'none' では止まらない `<meta http-equiv=refresh>`・`<base>`・`<form>` 等。
    var sel = 'meta, link, base, form, iframe, frame, object, embed, map, area, script, ' + SMIL;
    if (whole) sel += ', svg, math';
    Array.prototype.forEach.call(root.querySelectorAll(sel), function (el) { el.remove(); });
    // リンク: 本文（`links` が真）の `a` は、`http:`・`https:` の href だけ残して新しいタブで開く（`rel=noopener noreferrer`。枠にスクリプトが無いので、開く先へ本文は渡らない）。
    // それ以外（`javascript:`・`data:`・相対・`//host` 等）と、図の中（`links` が偽）の `a` は href を外して文字として残し、行き先は title に出す。同じ文書の中の `#` は残す。`xlink:href` は常に外す。
    Array.prototype.forEach.call(root.querySelectorAll('a'), function (a) {
      var href = a.getAttribute('href') || a.getAttribute('xlink:href') || '';
      a.removeAttribute('xlink:href');
      a.removeAttribute('target');
      a.removeAttribute('rel');
      if (href.charAt(0) === '#' && a.getAttribute('href') === href) return;
      a.removeAttribute('href');
      if (href !== '') a.setAttribute('title', href);
      if (links && window.askViewLinks.openableHref(href)) {
        a.setAttribute('href', href);
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      }
    });
  }

  async function diagrams(dark) {
    var blocks = Array.prototype.slice.call(doc.querySelectorAll('pre > code.language-mermaid'));
    if (!blocks.length) return;
    await load('mermaid.min.js'); // 図があるときだけ読む（大きいので）
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', flowchart: { htmlLabels: false }, theme: dark ? 'dark' : 'default' });
    for (var i = 0; i < blocks.length; i++) {
      var pre = blocks[i].parentNode;
      try {
        var out = await mermaid.render('mmd' + i, blocks[i].textContent);
        var fig = document.createElement('div');
        fig.className = 'mermaid';
        fig.innerHTML = out.svg;
        sanitize(fig, false); // 図の中のリンク・SMIL も外す（枠自身の遷移を許さない）
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
      // 動かない入れ物（template）の中で取り除いてから文書に入れる。文書に入れた後で消すと、`<meta http-equiv=refresh>` が挿入の時点で効いて、枠が外へ移る。
      var tpl = document.createElement('template');
      tpl.innerHTML = marked.parse(d.source, { gfm: true });
      sanitize(tpl.content, true);
      doc.replaceChildren(tpl.content);
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
