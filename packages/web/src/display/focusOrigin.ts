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

let lastUserInputAt = -Infinity;
let regainedAt = -Infinity;
let docUnfocused = false;

function onKeyDown(ev: Event): void {
  if ((ev as KeyboardEvent).key === "Tab") lastTabAt = lastNow();
}
let pressOpen = false;
let lastUserBlurAt = -Infinity;
/**
 * 押下の処理の最中（pointerdown から次のタスクまで）に実際にフォーカスが body へ移ったときだけ、「利用者が余白を押して自分で外した」と見る。
 * 余白を押したときのフォーカスの移動は、押下のイベントと同じタスクの中で起きる。時間（50ms など）で見ると、押下の直後にたまたま来たスクリプトの脱落を、利用者の操作と取り違える。
 */
/** 本物の（isTrusted の）ポインタ・タッチの押下の時刻。 */
function onPointer(ev: Event): void {
  if (!ev.isTrusted) return;
  lastUserInputAt = lastNow();
  pressOpen = true;
  setTimeout(() => {
    pressOpen = false;
  }, 0);
}
/** フォーカスがどこへも移らず外れた（`relatedTarget` なし）時刻。余白を押す・スクリプトが `parent.focus()` で落とす、のどちらでも起きる。 */
function onFocusOutNone(ev: Event): void {
  if (pressOpen && (ev as FocusEvent).relatedTarget === null) lastUserBlurAt = lastNow();
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
/**
 * 直前（`ms` 以内）に、利用者が**押して、その押下の処理の最中に実際にフォーカスが body へ移った**か（＝余白を押して自分で外した）。
 * 押した先の種類では決めない: 覆い（`mousedown.prevent`）や見出しの飾りなど、押してもフォーカスが動かない場所の後の脱落は、利用者の意図ではないので戻す。
 * **キーは数えない**: 打っている最中にフォーカスを落とされるのが、まさに止めたい被害で、キーはフォーカスを body へ落とさない。
 */
export function userBlurredFocusWithin(ms: number): boolean {
  return lastNow() - lastUserBlurAt < ms;
}
/** 後方互換: 直前に本物のポインタ・タッチの操作があったか。 */
export function userInputWithin(ms: number): boolean {
  return lastNow() - lastUserInputAt < ms;
}

/** 直前（`ms` 以内）に、親の文書で `Tab` のキーを受けたか（利用者が `Tab` で枠へ入ったのかを見分ける）。 */
export function tabPressedWithin(ms: number): boolean {
  return lastNow() - lastTabAt < ms;
}

function onFocusIn(ev: Event): void {
  const t = ev.target;
  if (!(t instanceof Element)) return;
  if (t.matches(EXCLUDED) || t.closest(EXCLUDED)) return;
  if (t === t.ownerDocument.body || t === t.ownerDocument.documentElement) return;
  origin = t;
}

/** 追跡を始める（何度呼んでもよい）。 */
export function installFocusOriginTracking(doc: Document = document): void {
  if (installed && target === doc) return;
  if (installed && target) {
    target.removeEventListener("focusin", onFocusIn, true);
    target.removeEventListener("keydown", onKeyDown, true);
    for (const t of ["pointerdown", "mousedown", "touchstart"]) target.removeEventListener(t, onPointer, true);
    target.removeEventListener("focusout", onFocusOutNone, true);
    target.defaultView?.removeEventListener("blur", onWindowBlur);
    target.defaultView?.removeEventListener("focus", onWindowFocus);
  }
  doc.addEventListener("focusin", onFocusIn, true);
  doc.addEventListener("keydown", onKeyDown, true);
  for (const t of ["pointerdown", "mousedown", "touchstart"]) doc.addEventListener(t, onPointer, true);
  doc.addEventListener("focusout", onFocusOutNone, true);
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
    for (const t of ["pointerdown", "mousedown", "touchstart"]) target.removeEventListener(t, onPointer, true);
    target.removeEventListener("focusout", onFocusOutNone, true);
    target.defaultView?.removeEventListener("blur", onWindowBlur);
    target.defaultView?.removeEventListener("focus", onWindowFocus);
  }
  installed = false;
  target = null;
  origin = null;
  lastTabAt = -Infinity;
  lastUserInputAt = -Infinity;
  pressOpen = false;
  lastUserBlurAt = -Infinity;
  regainedAt = -Infinity;
  docUnfocused = false;
}

/** 覚えている元の場所（まだ文書の中にあるときだけ）。 */
export function rememberedOrigin(): Element | null {
  return origin !== null && origin.isConnected && !origin.matches(EXCLUDED) ? origin : null;
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
