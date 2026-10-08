// 表示の面（静的な形式。20261007-soda-extensions の design「静的ページ」）の取り除き。`frame.js` が読み、単体テストも同じファイルを読む。
// 文書に入れる前の断片（`<template>` の中身）に掛ける。**隔離の本体は枠（sandbox・不透明 origin）と応答のヘッダ（script-src 'self'・default-src 'none'）**で、
// ここは二重の守り（枠自身を動かす・外へ繋ぐ・フォーカスを奪う要素と属性を、文書に入れる前に消す）。
//
// **要素の名前の上書き（DOM clobbering）に備える**: `<form><input name="attributes"></form>` のように、子の `name`・`id` が親の `form` の
// `attributes`・`getAttribute`・`tagName`・`children`・`parentNode` などを差し替える。中身の要素のプロパティ・メソッドを直接読まず、
// 読み込み時に控えた `Element.prototype`・`Node.prototype` のメソッドと getter を `call` で使う。
(function (root) {
  'use strict';
  var EP = Element.prototype;
  var NP = Node.prototype;
  // プロトタイプの連鎖をたどって getter を探す（ブラウザは `Document.prototype` などに直に持つ。連鎖をたどるのは、そうでない実装〔単体テストの DOM〕のため）。
  function getterOf(proto, name) {
    for (var o = proto; o; o = Object.getPrototypeOf(o)) {
      var d = Object.getOwnPropertyDescriptor(o, name);
      if (d && d.get) return d.get;
    }
    return undefined;
  }
  var getAttributeNames = EP.getAttributeNames;
  var getAttribute = EP.getAttribute;
  var setAttribute = EP.setAttribute;
  var removeAttribute = EP.removeAttribute;
  var hasAttribute = EP.hasAttribute;
  var removeEl = EP.remove;
  var localNameOf = getterOf(EP, 'localName');
  var namespaceOf = getterOf(EP, 'namespaceURI');
  var parentOf = getterOf(NP, 'parentNode');
  var firstChildOf = getterOf(NP, 'firstChild');
  var insertBefore = NP.insertBefore;
  var querySelectorAll = DocumentFragment.prototype.querySelectorAll;
  var forEach = Array.prototype.forEach;
  var indexOf = Array.prototype.indexOf;

  var REMOVE =
    'script, meta, link, base, iframe, frame, frameset, object, embed, applet, portal, map, area, math, audio, video, source, track, noscript, ' +
    'set, animate, animateTransform, animateMotion, animateColor, foreignObject';
  var DROP_ATTRS = ['autofocus', 'srcdoc', 'action', 'formaction', 'target', 'ping', 'background', 'http-equiv', 'srcset'];
  var DATA_IMG = /^data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,]/i;

  function openable(href) {
    var links = root.askViewLinks;
    return !!(links && typeof links.openableHref === 'function' && links.openableHref(href));
  }

  function sanitize(frag) {
    forEach.call(querySelectorAll.call(frag, REMOVE), function (el) { removeEl.call(el); });
    // 取り込めない入力: ファイル選択・画像ボタン。
    forEach.call(querySelectorAll.call(frag, 'input[type="file" i], input[type="image" i]'), function (el) { removeEl.call(el); });
    // SVG の中の `a` は、中身を残して `a` だけ外す（SMIL が href を書き換えて枠を動かすのを防ぐ）。
    forEach.call(querySelectorAll.call(frag, 'a'), function (a) {
      if (namespaceOf.call(a) !== 'http://www.w3.org/2000/svg') return;
      var parent = parentOf.call(a);
      for (var c = firstChildOf.call(a); c; c = firstChildOf.call(a)) insertBefore.call(parent, c, a);
      removeEl.call(a);
    });
    forEach.call(querySelectorAll.call(frag, '*'), function (el) {
      var tag = localNameOf.call(el);
      var svg = namespaceOf.call(el) === 'http://www.w3.org/2000/svg';
      var names = getAttributeNames.call(el);
      for (var i = 0; i < names.length; i++) {
        var n = names[i].toLowerCase();
        if (n.indexOf('on') === 0 || indexOf.call(DROP_ATTRS, n) >= 0) removeAttribute.call(el, names[i]);
      }
      if (tag === 'a') {
        removeAttribute.call(el, 'xlink:href');
        var href = getAttribute.call(el, 'href');
        if (href !== null) {
          if (href.charAt(0) === '#') return; // 同じ文書の中
          removeAttribute.call(el, 'href');
          if (href !== '') setAttribute.call(el, 'title', href); // 行き先は title に見せる
          if (openable(href)) {
            setAttribute.call(el, 'href', href);
            setAttribute.call(el, 'target', '_blank');
            setAttribute.call(el, 'rel', 'noopener noreferrer');
          }
        }
        return;
      }
      // `a` 以外の `xlink:href`／`href`（SVG の `image`・`use` など）。`#` と、画像の `data:` だけ残す。
      var xl = getAttribute.call(el, 'xlink:href');
      if (xl !== null) removeAttribute.call(el, 'xlink:href');
      if (tag === 'img' || tag === 'image') {
        var key = tag === 'img' ? 'src' : 'href';
        var src = getAttribute.call(el, key);
        if (src !== null && !DATA_IMG.test(src.replace(/^\s+/, ''))) removeAttribute.call(el, key);
        if (tag === 'image' && xl !== null && DATA_IMG.test(xl.replace(/^\s+/, ''))) setAttribute.call(el, 'href', xl);
      } else if (svg && hasAttribute.call(el, 'href')) {
        if ((getAttribute.call(el, 'href') || '').charAt(0) !== '#') removeAttribute.call(el, 'href');
      }
      // img 以外の `src`（input type=image は消えている。video・audio・iframe も消えている）。
      if (tag !== 'img' && hasAttribute.call(el, 'src')) removeAttribute.call(el, 'src');
      if (tag === 'form') {
        removeAttribute.call(el, 'action');
        removeAttribute.call(el, 'target');
      }
    });
    return frag;
  }

  root.__sodaDisplaySanitize = sanitize;
})(typeof self !== 'undefined' ? self : this);
