// 表示の面（静的な形式 `text`・`markdown`・`html`）の枠。20261007-soda-extensions の design「枠とのやりとり」「静的ページ」。
// アプリ本体の iframe（sandbox に `allow-same-origin` なし＝不透明 origin）が開く。親とのやりとりは `MessageChannel` の port だけ。
// 中身は取り除き（sanitize.js）を通して文書に入れる。作者のスクリプトは動かない（CSP の script-src 'self'）。
// **この枠は、静的な形式（text・markdown・html）以外の `render` を描かない**（`rejected` を返す）。
(function () {
  'use strict';
  var STATIC = { text: 1, markdown: 1, html: 1 };
  var ACTION_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
  var FIELDS_MAX = 64;
  var KEY_MAX = 64;
  var DATA_MAX_BYTES = 8 * 1024;
  var sanitize = self.__sodaDisplaySanitize;
  var marked = self.marked;
  var ticket = new URLSearchParams(location.search).get('t') || '';
  var port = null;
  var inited = false;
  var rev = 0;
  var relayKeys = [];
  var root = null;

  function post(msg) {
    if (port) port.postMessage(msg);
  }

  function ensureRoot() {
    if (root) return root;
    root = document.createElement('div');
    root.id = 'soda-display-root';
    document.body.appendChild(root);
    return root;
  }

  function applyTheme(theme) {
    if (!theme || typeof theme !== 'object') return;
    var de = document.documentElement;
    de.setAttribute('data-dark', theme.dark ? '1' : '0');
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
      Array.prototype.forEach.call(root.querySelectorAll('input[name], textarea[name], select[name]'), function (el) {
        var t = (el.type || '').toLowerCase();
        if (t === 'checkbox' || t === 'radio') {
          if (el.checked !== el.defaultChecked) fields[fieldKey(el)] = { checked: el.checked };
        } else if (el.tagName === 'SELECT') {
          var vals = Array.prototype.map.call(el.selectedOptions, function (o) { return o.value; });
          var def = Array.prototype.filter.call(el.options, function (o) { return o.defaultSelected; }).map(function (o) { return o.value; });
          if (vals.join('\u0001') !== def.join('\u0001')) fields[fieldKey(el)] = { values: vals };
        } else if (t !== 'file' && el.value !== el.defaultValue) {
          fields[fieldKey(el)] = { value: el.value };
        }
      });
    }
    var active = document.activeElement;
    var focus = null;
    // 枠の文書が既にフォーカスを持つ（利用者が枠の中にいる）ときだけ、同じ name／id の要素へ持ち越す。端末から奪わない。
    if (document.hasFocus() && active && active !== document.body && root && root.contains(active)) {
      if (active.getAttribute('name')) focus = { by: 'name', v: active.getAttribute('name'), type: active.getAttribute('type') || '', value: active.value };
      else if (active.id) focus = { by: 'id', v: active.id };
      else focus = { by: 'body' };
    }
    var se = document.scrollingElement || document.documentElement;
    return { fields: fields, focus: focus, top: se.scrollTop, left: se.scrollLeft };
  }
  function restoreState(s) {
    Array.prototype.forEach.call(root.querySelectorAll('input[name], textarea[name], select[name]'), function (el) {
      var f = s.fields[fieldKey(el)];
      if (!f) return;
      if ('checked' in f) el.checked = f.checked;
      else if ('values' in f) Array.prototype.forEach.call(el.options, function (o) { o.selected = f.values.indexOf(o.value) >= 0; });
      else el.value = f.value;
    });
    var se = document.scrollingElement || document.documentElement;
    se.scrollTop = s.top;
    se.scrollLeft = s.left;
    if (s.focus) {
      var target = null;
      if (s.focus.by === 'name') {
        var cands = root.querySelectorAll('[name]');
        for (var i = 0; i < cands.length; i++) {
          if (cands[i].getAttribute('name') === s.focus.v && (cands[i].getAttribute('type') || '') === s.focus.type) { target = cands[i]; break; }
        }
      } else if (s.focus.by === 'id') {
        var c2 = root.querySelectorAll('[id]');
        for (var j = 0; j < c2.length; j++) if (c2[j].id === s.focus.v) { target = c2[j]; break; }
      }
      if (!target) {
        document.body.setAttribute('tabindex', '-1');
        target = document.body;
      }
      try { target.focus({ preventScroll: true }); } catch (e) { /* 何もしない */ }
    }
  }

  // --- 描く -------------------------------------------------------------------------------------------------
  function buildFragment(format, source) {
    var tpl = document.createElement('template');
    if (format === 'text') {
      var pre = document.createElement('pre');
      pre.className = 'soda-text';
      pre.textContent = source;
      tpl.content.appendChild(pre);
      return tpl.content; // 文字として入れるだけなので、取り除きは要らない
    }
    if (format === 'markdown') {
      tpl.innerHTML = marked.parse(source, { gfm: true });
    } else {
      var doc = new DOMParser().parseFromString(source, 'text/html');
      Array.prototype.forEach.call(doc.head.querySelectorAll('style'), function (st) { tpl.content.appendChild(document.importNode(st, true)); });
      Array.prototype.forEach.call(doc.body.childNodes, function (n) { tpl.content.appendChild(document.importNode(n, true)); });
    }
    return sanitize(tpl.content);
  }
  function render(msg) {
    if (typeof msg.rev !== 'number') return;
    if (!STATIC[msg.format] || typeof msg.source !== 'string') {
      post({ type: 'rejected', rev: msg.rev });
      return;
    }
    var state = captureState();
    var frag;
    try {
      frag = buildFragment(msg.format, msg.source);
    } catch (e) {
      var tpl = document.createElement('template');
      var pre = document.createElement('pre');
      pre.className = 'soda-text';
      pre.textContent = msg.source;
      tpl.content.appendChild(pre);
      frag = tpl.content;
    }
    applyTheme(msg.theme);
    relayKeys = Array.isArray(msg.relayKeys) ? msg.relayKeys : [];
    rev = msg.rev;
    var r = ensureRoot();
    r.textContent = '';
    r.appendChild(frag);
    restoreState(state);
    post({ type: 'rendered', rev: msg.rev });
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
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || typeof t.closest !== 'function') return;
    var el = t.closest('[data-soda-action]');
    if (!el || el.localName === 'form') return;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    var value = el.getAttribute('data-soda-value');
    if (value === null) value = el.getAttribute('value');
    sendAction(el.getAttribute('data-soda-action'), value === null ? undefined : { value: value });
  });
  document.addEventListener('submit', function (e) {
    e.preventDefault(); // 実際の送信は起こさない（CSP の form-action 'none'・取り除きの action と、三重）
    var form = e.target;
    if (!form || form.localName !== 'form') return;
    var action = form.getAttribute('data-soda-action');
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
  window.addEventListener(
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
    if (!root) ensureRoot();
    var sel = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    var list = root.querySelectorAll(sel);
    for (var i = 0; i < list.length; i++) {
      if (!list[i].disabled) { list[i].focus(); return; }
    }
    document.body.setAttribute('tabindex', '-1');
    document.body.focus();
  }

  function onPort(ev) {
    var m = ev.data;
    if (!m || typeof m !== 'object') return;
    if (m.type === 'ping') post({ type: 'pong', n: m.n });
    else if (m.type === 'render') render(m);
    else if (m.type === 'focus') focusFirst();
  }

  window.addEventListener('message', function (ev) {
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
  if (document.readyState === 'complete') ready();
  else window.addEventListener('load', ready);
})();
