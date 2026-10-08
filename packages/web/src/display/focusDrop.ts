/**
 * 「フォーカスの脱落」の検知（スクリプトが動く面の備え (b) の補い。20261007-soda-extensions のレビューの指摘）。
 *
 * スクリプトが動く面が、同じタスクで `window.focus(); parent.focus()` を呼ぶと、親の `document.activeElement` は枠ではなく `body` になる。
 * 枠が取った形跡が親から見えず（`activeElement` が iframe にならない）、端末へ打った文字が届かなくなるだけで、戻しも知らせも起きない。
 * そこで、**画面にスクリプトが動く面の枠が 1 つ以上載っているとき**、「アプリの要素にあったフォーカスが、本物のキー・ポインタ・タッチの操作なしに `body` へ落ちた」ことを見て、元の場所へ戻し、横取りとして数える。
 *
 * 数え方（決めたこと）: どの面が起こしたかは分からない。**利用者が選んでいる pane にスクリプトが動く面があれば、その pane の面（最初の 1 つ）に 1 回**、無ければ**スクリプトが動く面が載っている pane のそれぞれに 1 回**
 * （誰がやったか分からないので、早く閉じる側に倒す）。サーバが pane ごとに数え、3 回で冷却に入る。
 * 利用者の操作（直前 1 秒の本物のポインタ・タッチ。キーは数えない）があったとき・ウィンドウ（文書）がフォーカスを持たないとき・直前にウィンドウへ戻ったときは、数えない。
 * 限界: アプリ自身が（利用者の操作なしに）フォーカスのある要素を取り除いて `body` へ落ちた場合も、同じに見える（元の場所へ戻すだけで、数えは 1 回）。
 */
import { rememberedOrigin, userInputWithin, documentRegainedFocusWithin } from "./focusOrigin.js";
import { scriptFramesSnapshot } from "./frameRegistry.js";

export const FOCUS_DROP_USER_INPUT_MS = 1000;
export const FOCUS_DROP_REGAINED_MS = 1000;
export const FOCUS_DROP_PATROL_MS = 100;

export interface FocusDropDeps {
  /** 利用者が選んでいる pane（無ければ null）。 */
  focusedPaneId(): string | null;
  /** 利用者が選んでいる pane の端末へフォーカスを戻す。 */
  focusSelectedTerminal(): void;
  /** 「1 回取られた」の知らせ（画面が見えているときだけ呼ばれる）。 */
  reportSteal(id: string, paneId: string, format: string): void;
}

let hadFocus = false;
let timer: ReturnType<typeof setInterval> | null = null;
let deps: FocusDropDeps | null = null;
let doc: Document | null = null;

function isAppElement(el: Element | null, d: Document): boolean {
  if (!el || el === d.body || el === d.documentElement) return false;
  return !el.hasAttribute("data-display-frame");
}

function onFocusOut(ev: Event): void {
  if ((ev as FocusEvent).relatedTarget === null) setTimeout(check, 0);
}

/** 1 回見る（見回り・`focusout` から）。落ちたことを見つけたら、戻して数える。 */
export function check(): void {
  if (!doc || !deps) return;
  const d = doc;
  if (scriptFramesSnapshot().length === 0) {
    hadFocus = false;
    return;
  }
  const active = d.activeElement;
  if (isAppElement(active, d)) {
    hadFocus = true;
    return;
  }
  if (active && active !== d.body && active !== d.documentElement) {
    hadFocus = false; // 表示の枠にある（枠が取ったことは、枠ごとの番が扱う）
    return;
  }
  // body（か無し）。落ちたのは、直前までアプリの要素にあったときだけ。
  if (!hadFocus) return;
  hadFocus = false;
  if (!d.hasFocus()) return; // ウィンドウ・タブが離れた
  if (userInputWithin(FOCUS_DROP_USER_INPUT_MS) || documentRegainedFocusWithin(FOCUS_DROP_REGAINED_MS)) return;
  // 脱落: 元の場所へ戻し、数える。
  const el = rememberedOrigin();
  if (el) {
    try {
      (el as HTMLElement).focus({ preventScroll: true });
    } catch {
      /* 次の戻し先へ */
    }
  }
  if (d.activeElement === d.body || d.activeElement === null) deps.focusSelectedTerminal();
  // 戻した先は、アプリの要素。すぐまた落とされても、次の見回り・focusout で「落ちた」と分かるように、印を立て直す。
  hadFocus = isAppElement(d.activeElement, d);
  if (d.visibilityState !== "visible") return;
  const faces = scriptFramesSnapshot();
  const pane = deps.focusedPaneId();
  const onFocused = pane === null ? [] : faces.filter((f) => f.paneId === pane);
  if (onFocused.length > 0) {
    const f = onFocused[0]!;
    deps.reportSteal(f.id, f.paneId, f.format);
    return;
  }
  const seen = new Set<string>();
  for (const f of faces) {
    if (seen.has(f.paneId)) continue;
    seen.add(f.paneId);
    deps.reportSteal(f.id, f.paneId, f.format);
  }
}

/** 見回りを始める（スクリプトが動く枠が載ったとき。何度呼んでもよい）。 */
export function startFocusDropWatch(d: FocusDropDeps, document_: Document = document): void {
  deps = d;
  if (timer !== null) return;
  doc = document_;
  hadFocus = isAppElement(doc.activeElement, doc);
  doc.addEventListener("focusout", onFocusOut, true);
  timer = setInterval(check, FOCUS_DROP_PATROL_MS);
}

/** 見回りを止める（スクリプトが動く枠が 1 つも無くなったとき）。 */
export function stopFocusDropWatch(): void {
  // 最後の面が外れる直前に落とされたフォーカス（繰り返し落とす面が閉じられた直後）を、数えずに戻す。
  if (doc && deps && hadFocus && (doc.activeElement === doc.body || doc.activeElement === null) && doc.hasFocus() && !userInputWithin(FOCUS_DROP_USER_INPUT_MS)) {
    const el = rememberedOrigin();
    if (el) {
      try {
        (el as HTMLElement).focus({ preventScroll: true });
      } catch {
        /* 次の戻し先へ */
      }
    }
    if (doc.activeElement === doc.body || doc.activeElement === null) deps.focusSelectedTerminal();
  }
  if (timer !== null) clearInterval(timer);
  timer = null;
  doc?.removeEventListener("focusout", onFocusOut, true);
  doc = null;
  deps = null;
  hadFocus = false;
}
