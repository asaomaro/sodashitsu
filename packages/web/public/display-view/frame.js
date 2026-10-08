// 表示の面（静的な形式 `text`・`markdown`・`html`）の枠。20261007-soda-extensions の design「枠とのやりとり」「静的ページ」。
// アプリ本体の iframe（sandbox に `allow-same-origin` なし＝不透明 origin）が開く。親とのやりとりは `MessageChannel` の port だけ。
// 中身は取り除き（sanitize.js）を通して文書に入れる。作者のスクリプトは動かない（CSP の script-src 'self'）。
// **この枠は、静的な形式（text・markdown・html）以外の `render` を描かない**（`rejected` を返す）。
//
// **名前の上書き（DOM clobbering）に備える**: 中身の `<img name="createElement">`・`<form><input name="getAttribute"></form>` などは、
// `document`・`form` 要素のメソッド・プロパティを差し替える。このファイルは、読み込み時（中身を入れる前）に控えた
// `Document.prototype`・`Element.prototype`・`Node.prototype` のメソッドと getter を `call` で使い、`document.X`・中身の要素の `el.X` を直接読まない。
// 描画の全体を `try` で囲み、失敗しても次の `render` を受け、親へ `failed` を知らせる。
(function () {
  'use strict';
  var STATIC = { text: 1, markdown: 1, html: 1 };
  var ACTION_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
  var FIELDS_MAX = 64;
  var KEY_MAX = 64;
  var DATA_MAX_BYTES = 8 * 1024;

  // --- 読み込み時に控える（中身を入れる前）-------------------------------------------------------------------
  // プロトタイプの連鎖をたどって getter を探す（ブラウザは `Document.prototype` などに直に持つ。連鎖をたどるのは、そうでない実装〔単体テストの DOM〕のため）。
  function getterOf(proto, name) {
    for (var o = proto; o; o = Object.getPrototypeOf(o)) {
      var d = Object.getOwnPropertyDescriptor(o, name);
      if (d && d.get) return d.get;
    }
    return undefined;
  }
  var D = Document.prototype;
  var E = Element.prototype;
  var N = Node.prototype;
  var docCreateElement = D.createElement;
  var docImportNode = D.importNode;
  var docHasFocus = D.hasFocus;
  var docBody = getterOf(D, 'body');
  var docHead = getterOf(D, 'head');
  var docElement = getterOf(D, 'documentElement');
  var docScrolling = getterOf(D, 'scrollingElement');
  var docActive = getterOf(D, 'activeElement');
  var docReady = getterOf(D, 'readyState');
  var addListener = EventTarget.prototype.addEventListener;
  var getAttribute = E.getAttribute;
  var setAttribute = E.setAttribute;
  var hasAttribute = E.hasAttribute;
  var closest = E.closest;
  var qsa = E.querySelectorAll;
  var localNameOf = getterOf(E, 'localName');
  var contains = N.contains;
  var appendChild = N.appendChild;
  var childNodesOf = getterOf(N, 'childNodes');
  var htmlFocus = HTMLElement.prototype.focus;
  var svgFocus = typeof SVGElement !== 'undefined' ? SVGElement.prototype.focus : undefined;
  var forEach = Array.prototype.forEach;
  var sanitize = self.__sodaDisplaySanitize;
  var marked = self.marked;
  var ticket = new URLSearchParams(location.search).get('t') || '';
  var port = null;
  var inited = false;
  var rev = 0;
  var relayKeys = [];
  var root = null;

  // 要素の種類に合う `focus` を使う（`HTMLElement.prototype.focus` を SVG の要素に `call` すると `Illegal invocation`）。失敗は呼び出し側が次の候補へ進む。
  function focusEl(el, opts) {
    if (el instanceof HTMLElement) htmlFocus.call(el, opts);
    else if (svgFocus && el instanceof SVGElement) svgFocus.call(el, opts);
    else if (typeof el.focus === 'function') el.focus(opts);
  }

  function post(msg) {
    if (port) port.postMessage(msg);
  }

  function ensureRoot() {
    if (root) return root;
    root = docCreateElement.call(document, 'div');
    root.id = 'soda-display-root';
    appendChild.call(docBody.call(document), root);
    return root;
  }

  function applyTheme(theme) {
    if (!theme || typeof theme !== 'object') return;
    var de = docElement.call(document);
    setAttribute.call(de, 'data-dark', theme.dark ? '1' : '0');
    var vars = theme.vars;
    if (vars && typeof vars === 'object') {
      Object.keys(vars).forEach(function (k) {
        if (/^--[A-Za-z0-9-]+$/.test(k) && typeof vars[k] === 'string') de.style.setProperty(k, vars[k]);
      });
    }
  }

  // --- 差し替えの前後で、スクロールと利用者が触った欄の値を保つ ---------------------------------------------
  function fieldKey(el) {
    var t = (el.type || '').toLowerCase();
    return el.name + '\u0000' + (t === 'radio' || t === 'checkbox' ? el.value : '');
  }
  function captureState() {
    var fields = {};
    if (root) {
      forEach.call(qsa.call(root, 'input[name], textarea[name], select[name]'), function (el) {
        var t = (el.type || '').toLowerCase();
        if (t === 'checkbox' || t === 'radio') {
          if (el.checked !== el.defaultChecked) fields[fieldKey(el)] = { checked: el.checked };
        } else if (localNameOf.call(el) === 'select') {
          var vals = Array.prototype.map.call(el.selectedOptions, function (o) { return o.value; });
          var def = Array.prototype.filter.call(el.options, function (o) { return o.defaultSelected; }).map(function (o) { return o.value; });
          if (vals.join('\u0001') !== def.join('\u0001')) fields[fieldKey(el)] = { values: vals };
        } else if (t !== 'file' && el.value !== el.defaultValue) {
          fields[fieldKey(el)] = { value: el.value };
        }
      });
    }
    var active = docActive.call(document);
    var focus = null;
    // 枠の文書が既にフォーカスを持つ（利用者が枠の中にいる）ときだけ、同じ name／id の要素へ持ち越す。端末から奪わない。
    if (docHasFocus.call(document) && active && active !== docBody.call(document) && root && contains.call(root, active)) {
      var an = getAttribute.call(active, 'name');
      var aid = getAttribute.call(active, 'id');
      if (an) focus = { by: 'name', v: an, type: getAttribute.call(active, 'type') || '' };
      else if (aid) focus = { by: 'id', v: aid };
      else focus = { by: 'body' };
    }
    var se = docScrolling.call(document) || docElement.call(document);
    return { fields: fields, focus: focus, top: se.scrollTop, left: se.scrollLeft };
  }
  function restoreState(s) {
    forEach.call(qsa.call(root, 'input[name], textarea[name], select[name]'), function (el) {
      var f = s.fields[fieldKey(el)];
      if (!f) return;
      if ('checked' in f) el.checked = f.checked;
      else if ('values' in f) Array.prototype.forEach.call(el.options, function (o) { o.selected = f.values.indexOf(o.value) >= 0; });
      else el.value = f.value;
    });
    var se = docScrolling.call(document) || docElement.call(document);
    se.scrollTop = s.top;
    se.scrollLeft = s.left;
    if (s.focus) {
      var target = null;
      var cands = qsa.call(root, '[name], [id]');
      for (var i = 0; i < cands.length && !target; i++) {
        if (s.focus.by === 'name' && getAttribute.call(cands[i], 'name') === s.focus.v && (getAttribute.call(cands[i], 'type') || '') === s.focus.type) target = cands[i];
        else if (s.focus.by === 'id' && getAttribute.call(cands[i], 'id') === s.focus.v) target = cands[i];
      }
      if (!target) {
        target = docBody.call(document);
        setAttribute.call(target, 'tabindex', '-1');
      }
      try { focusEl(target, { preventScroll: true }); } catch (e) { /* 何もしない */ }
    }
  }

  // --- 描く -------------------------------------------------------------------------------------------------
  function textFragment(source) {
    var tpl = docCreateElement.call(document, 'template');
    var pre = docCreateElement.call(document, 'pre');
    pre.className = 'soda-text';
    pre.textContent = source;
    tpl.content.appendChild(pre);
    return tpl.content;
  }
  function buildFragment(format, source) {
    if (format === 'text') return textFragment(source); // 文字として入れるだけなので、取り除きは要らない
    var tpl = docCreateElement.call(document, 'template');
    if (format === 'markdown') {
      tpl.innerHTML = marked.parse(source, { gfm: true });
    } else {
      // 読んだ文書（`doc`）も、中身の `name` で `head`・`body` などを上書きされうるので、getter を `call` で使う。
      var doc = new DOMParser().parseFromString(source, 'text/html');
      forEach.call(qsa.call(docHead.call(doc), 'style'), function (st) { appendChild.call(tpl.content, docImportNode.call(document, st, true)); });
      var kids = childNodesOf.call(docBody.call(doc));
      forEach.call(Array.prototype.slice.call(kids), function (n) { appendChild.call(tpl.content, docImportNode.call(document, n, true)); });
    }
    return sanitize(tpl.content);
  }
  function render(msg) {
    if (typeof msg.rev !== 'number') return;
    if (!STATIC[msg.format] || typeof msg.source !== 'string') {
      post({ type: 'rejected', rev: msg.rev });
      return;
    }
    try {
      var state = captureState();
      var frag;
      try {
        frag = buildFragment(msg.format, msg.source);
      } catch (e) {
        frag = textFragment(msg.source); // 壊れた中身は `<pre>`
      }
      applyTheme(msg.theme);
      relayKeys = Array.isArray(msg.relayKeys) ? msg.relayKeys : [];
      rev = msg.rev;
      var r = ensureRoot();
      r.textContent = '';
      appendChild.call(r, frag);
      restoreState(state);
      post({ type: 'rendered', rev: msg.rev });
    } catch (e) {
      post({ type: 'failed', rev: msg.rev }); // 次の render は受けられる（状態は壊れていない）
    }
  }

  // --- 操作 -------------------------------------------------------------------------------------------------
  function checkData(data) {
    var keys = Object.keys(data);
    if (keys.length > FIELDS_MAX) return false;
    for (var i = 0; i < keys.length; i++) {
      var n = Array.from(keys[i]).length;
      if (n < 1 || n > KEY_MAX || typeof data[keys[i]] !== 'string') return false;
    }
    return new TextEncoder().encode(JSON.stringify(data)).length <= DATA_MAX_BYTES;
  }
  function sendAction(action, data) {
    if (typeof action !== 'string' || !ACTION_RE.test(action)) return;
    if (data && !checkData(data)) return;
    var m = { type: 'action', rev: rev, action: action };
    if (data) m.data = data;
    post(m);
  }
  addListener.call(document, 'click', function (e) {
    var t = e.target;
    if (!(t instanceof Element)) return;
    var el = closest.call(t, '[data-soda-action]');
    if (!el || localNameOf.call(el) === 'form') return;
    if (hasAttribute.call(el, 'disabled') || getAttribute.call(el, 'aria-disabled') === 'true') return;
    var value = getAttribute.call(el, 'data-soda-value');
    if (value === null) value = getAttribute.call(el, 'value');
    sendAction(getAttribute.call(el, 'data-soda-action'), value === null ? undefined : { value: value });
  });
  addListener.call(document, 'submit', function (e) {
    e.preventDefault(); // 実際の送信は起こさない（CSP の form-action 'none'・取り除きの action と、三重）
    var form = e.target;
    if (!(form instanceof Element) || localNameOf.call(form) !== 'form') return;
    var action = getAttribute.call(form, 'data-soda-action');
    if (action === null) return;
    var data = {};
    var fd = new FormData(form);
    fd.forEach(function (v, k) {
      if (typeof v === 'string') Object.defineProperty(data, k, { value: v, enumerable: true, writable: true, configurable: true });
    });
    var sub = e.submitter;
    if (sub && sub.name) Object.defineProperty(data, sub.name, { value: sub.value, enumerable: true, writable: true, configurable: true });
    sendAction(action, data);
  });

  // --- キー（Esc と prefix だけ親へ取り次ぐ）-----------------------------------------------------------------
  function matchesRelay(e) {
    for (var i = 0; i < relayKeys.length; i++) {
      var k = relayKeys[i];
      if (k && typeof k.key === 'string' && e.key.toLowerCase() === k.key.toLowerCase() && !!k.ctrl === e.ctrlKey && !!k.alt === e.altKey && !!k.shift === e.shiftKey && !!k.meta === e.metaKey) return true;
    }
    return false;
  }
  addListener.call(
    window,
    'keydown',
    function (e) {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        post({ type: 'key', key: 'escape' });
      } else if (matchesRelay(e)) {
        e.preventDefault();
        post({ type: 'key', key: 'prefix' });
      }
    },
    true,
  );

  function focusFirst() {
    ensureRoot();
    var sel = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    var list = qsa.call(root, sel);
    for (var i = 0; i < list.length; i++) {
      if (hasAttribute.call(list[i], 'disabled')) continue;
      try { focusEl(list[i]); } catch (e) { continue; } // 1 つの要素で失敗しても次の候補へ
      if (docActive.call(document) === list[i]) return; // フォーカスを受けない要素（`<use>` など）は飛ばし、実際に移った要素で止める
    }
    var body = docBody.call(document);
    setAttribute.call(body, 'tabindex', '-1');
    focusEl(body);
  }

  // --- よそからフォーカスが来たこと（スクリプトが動く面が `parent.frames[i].focus()` で、この枠へフォーカスを移す場合に備える）---------------
  // 自分の window が `focus` を受けたとき、直前（500ms 以内）に、枠の中の本物の（isTrusted の）`pointerdown` も、親からの `focus` の知らせも無ければ、
  // 親へ `foreign-focus` を知らせる（親は、利用者が `Tab` で入ったのでなければ、元の場所へ戻す。回数には数えない）。この知らせ以外に、枠のスクリプトは `focus()` を呼ばない。
  var lastPointerAt = -Infinity;
  var lastParentFocusAt = -Infinity;
  var FOREIGN_WINDOW_MS = 500;
  addListener.call(window, 'pointerdown', function (e) {
    if (e.isTrusted) lastPointerAt = Date.now();
  }, true);
  addListener.call(window, 'focus', function () {
    var now = Date.now();
    if (now - lastPointerAt < FOREIGN_WINDOW_MS || now - lastParentFocusAt < FOREIGN_WINDOW_MS) return;
    post({ type: 'foreign-focus' });
  });

  function onPort(ev) {
    var m = ev.data;
    if (!m || typeof m !== 'object') return;
    if (m.type === 'ping') post({ type: 'pong', n: m.n });
    else if (m.type === 'render') render(m);
    else if (m.type === 'focus') {
      lastParentFocusAt = Date.now();
      focusFirst();
    }
  }

  addListener.call(window, 'message', function (ev) {
    if (inited || ev.source !== parent) return;
    var m = ev.data;
    if (!m || typeof m !== 'object' || m.type !== 'display-init' || !ev.ports || ev.ports.length < 1) return;
    inited = true;
    port = ev.ports[0];
    port.onmessage = onPort;
  });

  // 読み込みの最後に、合い札を添えて親に知らせる（親は、合い札と最初の `load` が合ってから通り道を渡す）。
  function ready() {
    ensureRoot();
    parent.postMessage({ type: 'display-ready', t: ticket }, '*');
  }
  if (docReady.call(document) === 'complete') ready();
  else addListener.call(window, 'load', ready);
})();
