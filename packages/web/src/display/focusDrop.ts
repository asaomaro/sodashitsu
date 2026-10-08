/**
 * 「フォーカスの脱落」の検知と戻し（スクリプトが動く面の備え (b) の補い。20261007-soda-extensions の PR3 のレビューの指摘）。
 *
 * スクリプトが動く面が、同じタスクで `window.focus(); parent.focus()` を呼ぶと、親の `document.activeElement` は枠ではなく `body` になる。
 * 端末へ打った文字が届かなくなる。そこで、**画面にスクリプトが動く面の枠が 1 つ以上載っているあいだ**、見回りのたびに（**状態を持たずに**）次を見る:
 *
 *   `activeElement` が `body`（か無し）· 文書がフォーカスを持っている · 操作中の枠が無い  →  最後にフォーカスのあったアプリの要素へ戻す（無い・外れた・隠れているなら、選んでいる pane の端末）。
 *
 * **「利用者が自分で外した」の免除は無い**（5 回目の再レビュー）。面の落としは、押下の直後・押した先・`focusout` の `relatedTarget` のどれも偽装できる。
 * 見分けようとした 4 回とも、「戻さないまま検知が止まる」穴になった。代償: スクリプトの面が載っている間は、余白を押してフォーカスを外しても、端末へ戻る。
 * 「前回の見回りで、アプリの要素がフォーカスを持っていたか」も持たない（一度戻さなかったら、以後も見なくなる、という状態を作りとして持たない）。持つのは戻し先の記憶
 * （最後にフォーカスのあった、枠・覆い・［操作する］でないアプリの要素。親の `focusin` でだけ更新する。`focusOrigin.ts`）と、遮断器の数だけ。
 *
 * 戻さないのは次だけ: 文書がフォーカスを持たない（別のウィンドウ・タブ・ブラウザの UI）/ 操作中の枠がある（利用者が［操作する］で始めた）/
 * `activeElement` が `body` でない（アプリの別の要素・ダイアログ・メニュー・入力欄・枠。枠が `activeElement` のときは枠ごとの番が戻す）/ 戻し先がどこにも無い。
 *
 * **サーバへ知らせない・面を閉じない**（決めたこと）: どの面が落としたかを、親は確かめられない。戻した回数は、遮断器（この画面だけ）と知らせ（トースト）にだけ使う。
 * 枠ごとの番が戻した分（`noteFocusRestored`）も同じ数に入る。実際に動かせたときだけ数える（戻し先が無くて動かせない見回りは数えない）。
 */
import { noteActiveElement, restoreFromDrop } from "./focusOrigin.js";
import { anyFrameEngaged, scriptFramesSnapshot } from "./frameRegistry.js";

/** 見回りの間隔（スクリプトの枠が載っているあいだだけ回る軽い検査）。短いほど、戻すまでに失われるキーが少ない。 */
export const FOCUS_DROP_PATROL_MS = 25;
/** 短い間に何度も戻したときの知らせ: `FOCUS_DROP_NOTICE_COUNT` 回を `FOCUS_DROP_NOTICE_WINDOW_MS` 以内に。知らせの間隔は `FOCUS_DROP_NOTICE_EVERY_MS` 以上。 */
export const FOCUS_DROP_NOTICE_COUNT = 5;
export const FOCUS_DROP_NOTICE_WINDOW_MS = 10_000;
export const FOCUS_DROP_NOTICE_EVERY_MS = 60_000;
/**
 * **この画面だけの遮断器**: `FOCUS_DROP_BREAKER_WINDOW_MS` 以内に `FOCUS_DROP_BREAKER_COUNT` 回戻したら、この画面に載っているスクリプトの枠を全部止める（`deps.trip()`）。
 * 実測（Chromium 153）: ふつうの操作では戻しは 0 回。`setInterval` で 300ms ごとに落とす面は 3 秒に約 10 回（遮断しない・知らせだけ）、
 * 100ms ごとなら約 30 回・`MessageChannel` の連鎖や毎フレーム（`requestAnimationFrame`）なら 3 秒に 100 回超（遮断する）。知らせの線（10 秒に 5 回）より強い線にした。
 */
export const FOCUS_DROP_BREAKER_COUNT = 15;
export const FOCUS_DROP_BREAKER_WINDOW_MS = 3000;

export interface FocusDropDeps {
  /** 利用者が選んでいる pane の端末へフォーカスを戻す。 */
  focusSelectedTerminal(): void;
  /** 利用者への知らせ（トースト）。 */
  notify(message: string): void;
  /** 遮断器が働いた: この画面のスクリプトの枠を全部止める（DOM から外し、固定の文言と［再開］を出す。サーバへは知らせない・数えない）。 */
  trip(): void;
}

let timer: ReturnType<typeof setInterval> | null = null;
let deps: FocusDropDeps | null = null;
let doc: Document | null = null;
const restoredAt: number[] = [];
let lastNoticeAt = -Infinity;

function onFocusOut(ev: Event): void {
  if ((ev as FocusEvent).relatedTarget === null) setTimeout(check, 0);
}
/** 窓の `blur`・`focus`（フォーカスが枠へ移って戻る途中）。1 拍置いて見る。 */
function onWindowFocusChange(): void {
  setTimeout(check, 0);
}

/** 枠ごとの番（操作中でない枠が取った）が戻したとき。遮断器の数に入れる（脱落を戻した分と同じ列。1 回の出来事は、どちらか 1 か所でしか数えない）。 */
export function noteFocusRestored(): void {
  if (deps) noteRestore(Date.now());
}

function noteRestore(now: number): void {
  restoredAt.push(now);
  if (restoredAt.filter((t) => now - t <= FOCUS_DROP_BREAKER_WINDOW_MS).length >= FOCUS_DROP_BREAKER_COUNT) {
    restoredAt.length = 0;
    const d = deps;
    d?.trip();
    // 止めた枠が DOM から外れるまでの間に、もう 1 回落とされることがある。外れたあとに、body のままなら戻す（数えない）。
    for (const ms of [0, 60, 200]) setTimeout(() => restoreFromBody(false), ms);
    return;
  }
  while (restoredAt.length > 0 && now - restoredAt[0]! > FOCUS_DROP_NOTICE_WINDOW_MS) restoredAt.shift();
  if (restoredAt.length >= FOCUS_DROP_NOTICE_COUNT && now - lastNoticeAt >= FOCUS_DROP_NOTICE_EVERY_MS) {
    lastNoticeAt = now;
    const names = [...new Set(scriptFramesSnapshot().map((f) => f.name))].join("、");
    deps?.notify(`スクリプトの表示（${names}）が、入力のフォーカスを繰り返し外しています。心当たりが無ければ、表示を閉じてください`);
  }
}

/**
 * フォーカスが `body` にあれば、戻し先へ戻す。**今の状態だけで決める**（`activeElement`・文書のフォーカス・操作中の枠・戻し先）。
 * 実際に `body` から動かせたとき `true`。
 */
function restoreFromBody(count: boolean): boolean {
  const d = doc;
  const dd = deps;
  if (!d || !dd) return false;
  noteActiveElement(d); // 戻し先の記憶を、いまのフォーカスで補う（focusin が届かないフォーカスの移り方がある）
  if (!(d.activeElement === d.body || d.activeElement === null || d.activeElement === d.documentElement)) return false; // 脱落ではない
  if (!d.hasFocus()) return false; // 別のウィンドウ・タブ・ブラウザの UI
  if (anyFrameEngaged()) return false; // 利用者が［操作する］で始めた（枠のフォーカスが外れれば、枠ごとの番が操作中を終え、次の見回りで戻す）
  const moved = restoreFromDrop(d, () => dd.focusSelectedTerminal());
  if (moved && count) noteRestore(Date.now());
  return moved;
}

/** 1 回見る（見回り・`focusout`・窓の `blur`/`focus` から）。 */
export function check(): void {
  if (!doc || !deps) return;
  if (scriptFramesSnapshot().length === 0) return;
  restoreFromBody(true);
}

/** 見回りを始める（スクリプトが動く枠が載ったとき。何度呼んでもよい）。 */
export function startFocusDropWatch(d: FocusDropDeps, document_: Document = document): void {
  deps = d;
  if (timer !== null) return;
  doc = document_;
  doc.addEventListener("focusout", onFocusOut, true);
  doc.defaultView?.addEventListener("blur", onWindowFocusChange);
  doc.defaultView?.addEventListener("focus", onWindowFocusChange);
  timer = setInterval(check, FOCUS_DROP_PATROL_MS);
}

/** 見回りを止める（スクリプトが動く枠が 1 つも無くなったとき）。 */
export function stopFocusDropWatch(): void {
  // 最後の面が外れる直前に落とされたフォーカス（繰り返し落とす面が閉じられた直後）を戻す（数えない）。
  if (doc && deps) restoreFromBody(false);
  if (timer !== null) clearInterval(timer);
  timer = null;
  doc?.removeEventListener("focusout", onFocusOut, true);
  doc?.defaultView?.removeEventListener("blur", onWindowFocusChange);
  doc?.defaultView?.removeEventListener("focus", onWindowFocusChange);
  doc = null;
  deps = null;
  restoredAt.length = 0;
  lastNoticeAt = -Infinity;
}
