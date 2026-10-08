/**
 * 「フォーカスの脱落」の検知と戻し（スクリプトが動く面の備え (b) の補い。20261007-soda-extensions の PR3 のレビューの指摘）。
 *
 * スクリプトが動く面が、同じタスクで `window.focus(); parent.focus()` を呼ぶと、親の `document.activeElement` は枠ではなく `body` になる。
 * 枠が取った形跡が親から見えず、端末へ打った文字が届かなくなる。そこで、**画面にスクリプトが動く面の枠が 1 つ以上載っているあいだ**、
 * 「アプリの要素にあったフォーカスが `body` へ落ちた」ことを見て、**元の場所へ戻す**。
 *
 * **数えない・サーバへ知らせない**（決めたこと）: どの面が落としたかを、親は確かめられない（枠の中のことは親から見えず、土台からの知らせは、落とさない面が出さないだけで偽れる）。
 * 誰が落としたか分からないまま回数・冷却に結び付けると、無関係な pane の無害な面を巻き込める。だから**戻すだけ**にする。
 * 落とし続ける面は、自動では閉じない。短い間に何度も戻したときは、**利用者への知らせ（トースト）を 1 回出して**、心当たりの無い表示を閉じてもらう。
 *
 * 戻さない（利用者が自分でフォーカスを外した）のは次のとき:
 *  - 直前 1 秒の本物のポインタ・タッチの押下の先が**フォーカスを受けない要素（余白）**だった。
 *  - 文書がフォーカスを持たない（別のウィンドウ・タブ）・直前に別のウィンドウ／ブラウザの UI から戻った。
 *  - 直前までフォーカスのあった要素が、もう文書に無い・見えていない（メニュー・ダイアログ・モバイルの重ね表示を閉じた、pane・タブが替わった、など。アプリが外した）。
 * **利用者が端末（フォーカスを受ける要素）を押した直後の脱落は、利用者の意図ではないので戻す**（クリックの直後 1 秒を免除にしない）。
 * 戻したあとも検知を続ける（免除・戻しの後に、次の脱落を見落とさない）。
 */
import { documentRegainedFocusWithin, recentPointer, rememberedOrigin } from "./focusOrigin.js";
import { scriptFramesSnapshot } from "./frameRegistry.js";

export const FOCUS_DROP_USER_INPUT_MS = 1000;
/** 見回りの間隔（スクリプトの枠が載っているあいだだけ回る軽い検査）。短いほど、戻すまでに失われるキーが少ない。 */
export const FOCUS_DROP_PATROL_MS = 25;
/** 短い間に何度も戻したときの知らせ: `FOCUS_DROP_NOTICE_COUNT` 回を `FOCUS_DROP_NOTICE_WINDOW_MS` 以内に。知らせの間隔は `FOCUS_DROP_NOTICE_EVERY_MS` 以上。 */
export const FOCUS_DROP_NOTICE_COUNT = 5;
export const FOCUS_DROP_NOTICE_WINDOW_MS = 10_000;
export const FOCUS_DROP_NOTICE_EVERY_MS = 60_000;

export interface FocusDropDeps {
  /** 利用者が選んでいる pane の端末へフォーカスを戻す。 */
  focusSelectedTerminal(): void;
  /** 利用者への知らせ（トースト）。 */
  notify(message: string): void;
}

let hadFocus = false;
let lastAppEl: Element | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let deps: FocusDropDeps | null = null;
let doc: Document | null = null;
const restoredAt: number[] = [];
let lastNoticeAt = -Infinity;

function isAppElement(el: Element | null, d: Document): boolean {
  if (!el || el === d.body || el === d.documentElement) return false;
  return !el.hasAttribute("data-display-frame");
}
/** 文書にあって、見えている（描かれている）要素か。 */
function isShown(el: Element): boolean {
  return el.isConnected && (el as HTMLElement).getClientRects().length > 0;
}

function onFocusOut(ev: Event): void {
  if ((ev as FocusEvent).relatedTarget === null) setTimeout(check, 0);
}
/** 窓の `blur`・`focus`（フォーカスが枠へ移って戻る途中）。1 拍置いて見る。 */
function onWindowFocusChange(): void {
  setTimeout(check, 0);
}

function noteRestore(now: number): void {
  restoredAt.push(now);
  while (restoredAt.length > 0 && now - restoredAt[0]! > FOCUS_DROP_NOTICE_WINDOW_MS) restoredAt.shift();
  if (restoredAt.length >= FOCUS_DROP_NOTICE_COUNT && now - lastNoticeAt >= FOCUS_DROP_NOTICE_EVERY_MS) {
    lastNoticeAt = now;
    const names = [...new Set(scriptFramesSnapshot().map((f) => f.name))].join("、");
    deps?.notify(`スクリプトの表示（${names}）が、入力のフォーカスを繰り返し外しています。心当たりが無ければ、表示を閉じてください`);
  }
}

/** 1 回見る（見回り・`focusout` から）。落ちたことを見つけたら、戻す。 */
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
    lastAppEl = active;
    return;
  }
  if (active && active !== d.body && active !== d.documentElement) {
    hadFocus = false; // 表示の枠にある（枠が取ったことは、枠ごとの番が扱う）
    return;
  }
  // body（か無し）。落ちたのは、直前までアプリの要素にあったときだけ。
  if (!hadFocus) return;
  hadFocus = false;
  const was = lastAppEl;
  lastAppEl = null;
  if (!d.hasFocus()) return; // ウィンドウ・タブが離れた
  if (documentRegainedFocusWithin(FOCUS_DROP_USER_INPUT_MS)) return; // 別のウィンドウ・ブラウザの UI から戻った
  if (recentPointer(FOCUS_DROP_USER_INPUT_MS) === "blank") return; // 利用者が余白を押して、自分で外した
  if (was !== null && !isShown(was)) return; // アプリが、フォーカスのあった要素を外した・隠した
  // 脱落: 元の場所へ戻す（数えない）。
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
  if (hadFocus) lastAppEl = d.activeElement;
  noteRestore(Date.now());
}

/** 見回りを始める（スクリプトが動く枠が載ったとき。何度呼んでもよい）。 */
export function startFocusDropWatch(d: FocusDropDeps, document_: Document = document): void {
  deps = d;
  if (timer !== null) return;
  doc = document_;
  hadFocus = isAppElement(doc.activeElement, doc);
  lastAppEl = hadFocus ? doc.activeElement : null;
  doc.addEventListener("focusout", onFocusOut, true);
  doc.defaultView?.addEventListener("blur", onWindowFocusChange);
  doc.defaultView?.addEventListener("focus", onWindowFocusChange);
  timer = setInterval(check, FOCUS_DROP_PATROL_MS);
}

/** 見回りを止める（スクリプトが動く枠が 1 つも無くなったとき）。 */
export function stopFocusDropWatch(): void {
  // 最後の面が外れる直前に落とされたフォーカス（繰り返し落とす面が閉じられた直後）を戻す。
  if (doc && deps && hadFocus && (doc.activeElement === doc.body || doc.activeElement === null) && doc.hasFocus() && recentPointer(FOCUS_DROP_USER_INPUT_MS) !== "blank" && (lastAppEl === null || isShown(lastAppEl))) {
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
  doc?.defaultView?.removeEventListener("blur", onWindowFocusChange);
  doc?.defaultView?.removeEventListener("focus", onWindowFocusChange);
  doc = null;
  deps = null;
  hadFocus = false;
  lastAppEl = null;
  restoredAt.length = 0;
  lastNoticeAt = -Infinity;
}
