/**
 * 「元の場所」の追跡と、戻し方（スクリプトが動く面のフォーカスの番の一部。20261007-soda-extensions の design「元の場所を覚える」「横取りの検知」）。
 *
 * - 親の文書の `focusin` で、「最後にフォーカスのあった、**表示の枠（どの面のものでも）・覆い・［操作する］ボタンでない**要素」を覚える。
 *   面が続けて取り合っても、枠を覚えない（戻る先が枠どうしで回らない）。
 * - 戻し方: 覚えた要素へ `focus()`。覚えた要素が無い・もう DOM に無い・`body` のときは、`fallback`（利用者が選んでいる pane の端末）へ。
 *   戻ったかを確かめ（`document.activeElement` がその iframe でない）、だめなら `iframe.blur()` してもう 1 回。それでもだめなら `false`（呼び側が、この画面の枠を外す）。
 */

/** 追跡に入れない要素（表示の枠・覆い・［操作する］ボタン）。 */
const EXCLUDED = "[data-display-frame], .display-frame-cover, .display-engage";

let origin: Element | null = null;
let installed = false;
let target: Document | null = null;
let lastTabAt = -Infinity;
const lastNow = (): number => Date.now();

let regainedAt = -Infinity;
let docUnfocused = false;

function onKeyDown(ev: Event): void {
  if ((ev as KeyboardEvent).key === "Tab") lastTabAt = lastNow();
  if (target) noteActiveElement(target);
}
function onWindowBlur(): void {
  // 枠（iframe）へフォーカスが移っても親の window の `blur` は起きる。文書がフォーカスを持たなくなった（別のウィンドウ・タブへ移った）ときだけ数える。1 拍置いて見る。
  setTimeout(() => {
    if (target && !target.hasFocus()) docUnfocused = true;
  }, 0);
}
function onWindowFocus(): void {
  if (docUnfocused) {
    docUnfocused = false;
    regainedAt = lastNow(); // 別のウィンドウ・タブ・ブラウザの UI（アドレスバーから Tab）から戻った
  }
}

/** 直前（`ms` 以内）に、親の文書が（別のウィンドウ・タブ・ブラウザの UI から）フォーカスを取り戻したか。 */
export function documentRegainedFocusWithin(ms: number): boolean {
  return lastNow() - regainedAt < ms;
}
/** 直前（`ms` 以内）に、親の文書で `Tab` のキーを受けたか（利用者が `Tab` で枠へ入ったのかを見分ける）。 */
export function tabPressedWithin(ms: number): boolean {
  return lastNow() - lastTabAt < ms;
}

/** Shadow DOM を辿った、最も深い `activeElement`。 */
export function deepActiveElement(doc: Document): Element | null {
  let a: Element | null = doc.activeElement;
  while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
  return a;
}

/**
 * いま実際にフォーカスのある要素（Shadow DOM の中も）を、戻し先として覚える（枠・覆い・［操作する］・`body` は除く）。
 * `focusin` が親の文書に届かないフォーカスの移り方がある（実測: `<ask-form>` の中の text の入力。`focusin` の通知が無いまま入力が `activeElement` になる）ので、
 * 見回り・キー・押下のたびにも呼んで補う。
 */
export function noteActiveElement(doc: Document = document): void {
  const a = deepActiveElement(doc);
  if (!a || a === doc.body || a === doc.documentElement) return;
  // 枠（iframe）が activeElement のときは、その host の経路を見る
  if (a.matches(EXCLUDED) || a.closest(EXCLUDED)) return;
  for (let n: Node | null = a.getRootNode(); n instanceof ShadowRoot; n = n.host.getRootNode()) {
    if (n.host.matches(EXCLUDED) || n.host.closest(EXCLUDED)) return;
  }
  origin = a;
}

function onFocusIn(ev: Event): void {
  // Shadow DOM の中の入力は、親の文書では host に付け替えられた `target` で見える（host はフォーカスを受けない）。実際の要素（`composedPath()[0]`）を覚える。
  const path = typeof ev.composedPath === "function" ? ev.composedPath().filter((e): e is Element => e instanceof Element) : [];
  const t = path[0] ?? (ev.target instanceof Element ? ev.target : null);
  if (!t) return;
  // 枠・覆い・［操作する］は覚えない（Shadow DOM の外の祖先にあっても、経路のどれかが当てはまれば除く）。
  if (t.matches(EXCLUDED) || t.closest(EXCLUDED) || path.some((e) => e.matches(EXCLUDED))) return;
  if (t === t.ownerDocument.body || t === t.ownerDocument.documentElement) return;
  origin = t;
}

/** 追跡を始める（何度呼んでもよい）。 */
export function installFocusOriginTracking(doc: Document = document): void {
  if (installed && target === doc) return;
  if (installed && target) {
    target.removeEventListener("focusin", onFocusIn, true);
    target.removeEventListener("keydown", onKeyDown, true);
    target.defaultView?.removeEventListener("blur", onWindowBlur);
    target.defaultView?.removeEventListener("focus", onWindowFocus);
  }
  doc.addEventListener("focusin", onFocusIn, true);
  doc.addEventListener("keydown", onKeyDown, true);
  doc.defaultView?.addEventListener("blur", onWindowBlur);
  doc.defaultView?.addEventListener("focus", onWindowFocus);
  installed = true;
  target = doc;
}

/** テスト用: 追跡を外して覚えた要素を捨てる。 */
export function resetFocusOriginTracking(): void {
  if (installed && target) {
    target.removeEventListener("focusin", onFocusIn, true);
    target.removeEventListener("keydown", onKeyDown, true);
    target.defaultView?.removeEventListener("blur", onWindowBlur);
    target.defaultView?.removeEventListener("focus", onWindowFocus);
  }
  installed = false;
  target = null;
  origin = null;
  lastTabAt = -Infinity;
  regainedAt = -Infinity;
  docUnfocused = false;
}

/** 覚えている元の場所（まだ文書の中にあるときだけ）。 */
export function rememberedOrigin(): Element | null {
  return origin !== null && origin.isConnected && !origin.matches(EXCLUDED) ? origin : null;
}

/** 文書にあって、見えている（描かれている）要素か。Shadow DOM の中の要素も同じに働く（`isConnected` は shadow tree が文書につながっていれば真）。 */
export function isShownElement(el: Element): boolean {
  return el.isConnected && (el as HTMLElement).getClientRects().length > 0;
}

/** 開いている modal のダイアログ（文書のほかの部分は inert）。 */
function openModalDialog(doc: Document): HTMLDialogElement | null {
  for (const d of Array.from(doc.querySelectorAll("dialog[open]"))) {
    try {
      if (d.matches(":modal")) return d as HTMLDialogElement;
    } catch {
      /* :modal を知らない環境 */
    }
  }
  return null;
}

const FOCUSABLE = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";
/** `root`（Shadow DOM の中も）でフォーカスを受けられる最初の、見えている要素。 */
function firstFocusableDeep(root: ParentNode): HTMLElement | null {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))) {
    if ((el as HTMLInputElement).disabled || el.hidden || !isShownElement(el)) continue;
    return el;
  }
  for (const host of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
    if (host.shadowRoot) {
      const inner = firstFocusableDeep(host.shadowRoot);
      if (inner) return inner;
    }
  }
  return null;
}

/**
 * 脱落（フォーカスが `body`）からの戻し。戻し先の記憶 → その host（Shadow DOM の中の要素のとき）→ modal のダイアログが開いていればその中でフォーカスを受けられる最初の要素
 * → 選んでいる pane の端末、の順。**戻った後に、最も深い `activeElement` が期待どおりになったか**を確かめて、ならなければ次へ倒す。
 * **modal のダイアログが開いているあいだは、フォーカスをダイアログの外へ移さない**（端末は inert で戻せない）。どこにも戻せなければ何もしない。
 * 実際に `body` から動かせたとき `true`。
 */
export function restoreFromDrop(doc: Document, focusTerminal: () => void): boolean {
  const onBody = (): boolean => doc.activeElement === null || doc.activeElement === doc.body || doc.activeElement === doc.documentElement;
  const tryFocus = (el: HTMLElement): boolean => {
    try {
      el.focus({ preventScroll: true });
    } catch {
      return false;
    }
    return !onBody();
  };
  const modal = openModalDialog(doc);
  const el = rememberedOrigin();
  if (el !== null && isShownElement(el) && (modal === null || modal.contains(el) || modal.contains(el.getRootNode() instanceof ShadowRoot ? (el.getRootNode() as ShadowRoot).host : el))) {
    if (tryFocus(el as HTMLElement) && deepActiveElement(doc) === el) return true;
    const root = el.getRootNode();
    if (root instanceof ShadowRoot && tryFocus(root.host as HTMLElement)) return true;
  }
  if (modal !== null) {
    const first = firstFocusableDeep(modal);
    return first !== null && tryFocus(first);
  }
  focusTerminal();
  return !onBody();
}

function isFocusable(el: Element): el is HTMLElement {
  return typeof (el as HTMLElement).focus === "function";
}

/**
 * 元の場所へ戻す。`iframe` は、取られた枠（戻ったかの確かめに使う）。`fallback` は、覚えた要素が使えないときの戻し先
 * （利用者が選んでいる pane の端末へフォーカスを移す関数）。戻せたら `true`。
 */
export function restoreFocus(iframe: HTMLIFrameElement, fallback: () => void, doc: Document = document): boolean {
  const back = (): void => {
    const el = rememberedOrigin();
    if (el !== null && isFocusable(el)) {
      try {
        el.focus({ preventScroll: true });
      } catch {
        /* 次の戻し先へ */
      }
    }
    if (doc.activeElement === iframe || el === null) {
      // 覚えた要素へ戻せなかった・無かった: 利用者が選んでいる pane の端末へ。
      fallback();
    }
  };
  back();
  if (doc.activeElement !== iframe) return true;
  // 戻っていない: 枠を blur してもう 1 回。
  try {
    iframe.blur();
  } catch {
    /* 続ける */
  }
  back();
  return doc.activeElement !== iframe;
}
