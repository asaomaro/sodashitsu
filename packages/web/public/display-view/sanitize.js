// 表示の面（静的な形式。20261007-soda-extensions の design「静的ページ」）の取り除き。`frame.js` が読み、単体テストも同じファイルを読む。
// 文書に入れる前の断片（`<template>` の中身）に掛ける。**隔離の本体は枠（sandbox・不透明 origin）と応答のヘッダ（script-src 'self'・default-src 'none'）**で、
// ここは二重の守り（枠自身を動かす・外へ繋ぐ・フォーカスを奪う要素と属性を、文書に入れる前に消す）。
(function (root) {
  'use strict';
  var REMOVE =
    'script, meta, link, base, iframe, frame, frameset, object, embed, applet, portal, map, area, math, audio, video, source, track, noscript, ' +
    'set, animate, animateTransform, animateMotion, animateColor, foreignObject';
  var DROP_ATTRS = ['autofocus', 'srcdoc', 'action', 'formaction', 'target', 'ping', 'background', 'http-equiv', 'srcset'];
  var DATA_IMG = /^data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,]/i;

  function openable(href) {
    var links = root.askViewLinks;
    return !!(links && typeof links.openableHref === 'function' && links.openableHref(href));
  }

  function isSvg(el) {
    return el.namespaceURI === 'http://www.w3.org/2000/svg';
  }

  function sanitize(frag) {
    Array.prototype.forEach.call(frag.querySelectorAll(REMOVE), function (el) { el.remove(); });
    // 取り込めない入力: ファイル選択・画像ボタン。
    Array.prototype.forEach.call(frag.querySelectorAll('input[type="file" i], input[type="image" i]'), function (el) { el.remove(); });
    // SVG の中の `a` は、中身を残して `a` だけ外す（SMIL が href を書き換えて枠を動かすのを防ぐ）。
    Array.prototype.forEach.call(frag.querySelectorAll('a'), function (a) {
      if (!isSvg(a)) return;
      while (a.firstChild) a.parentNode.insertBefore(a.firstChild, a);
      a.remove();
    });
    Array.prototype.forEach.call(frag.querySelectorAll('*'), function (el) {
      var tag = el.localName;
      var attrs = Array.prototype.slice.call(el.attributes);
      for (var i = 0; i < attrs.length; i++) {
        var n = attrs[i].name.toLowerCase();
        if (n.indexOf('on') === 0 || DROP_ATTRS.indexOf(n) >= 0) el.removeAttribute(attrs[i].name);
      }
      if (tag === 'a') {
        el.removeAttribute('xlink:href');
        var href = el.getAttribute('href');
        if (href !== null) {
          if (href.charAt(0) === '#') return; // 同じ文書の中
          el.removeAttribute('href');
          if (href !== '') el.setAttribute('title', href); // 行き先は title に見せる
          if (openable(href)) {
            el.setAttribute('href', href);
            el.setAttribute('target', '_blank');
            el.setAttribute('rel', 'noopener noreferrer');
          }
        }
        return;
      }
      // `a` 以外の `xlink:href`／`href`（SVG の `image`・`use` など）。`#` と、画像の `data:` だけ残す。
      var xl = el.getAttribute('xlink:href');
      if (xl !== null) el.removeAttribute('xlink:href');
      if (tag === 'img' || tag === 'image') {
        var key = tag === 'img' ? 'src' : 'href';
        var src = el.getAttribute(key);
        if (src !== null && !DATA_IMG.test(src.replace(/^\s+/, ''))) el.removeAttribute(key);
        if (tag === 'image' && xl !== null && DATA_IMG.test(xl.replace(/^\s+/, ''))) el.setAttribute('href', xl);
      } else if (isSvg(el) && el.hasAttribute('href')) {
        if ((el.getAttribute('href') || '').charAt(0) !== '#') el.removeAttribute('href');
      }
      // img 以外の `src`（input type=image は消えている。video・audio・iframe も消えている）。
      if (tag !== 'img' && el.hasAttribute('src')) el.removeAttribute('src');
      if (tag === 'form') {
        el.removeAttribute('action');
        el.removeAttribute('target');
      }
    });
    return frag;
  }

  root.__sodaDisplaySanitize = sanitize;
})(typeof self !== 'undefined' ? self : this);
