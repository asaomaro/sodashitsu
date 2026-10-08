import type { DisplayInfo } from "@sodashitsu/protocol";
import { nextTick } from "vue";
import type { DisplayHost } from "../injection.js";
import type { MenuTarget } from "../term/MouseBridge.js";
import { endEngageFrame } from "./frameRegistry.js";

/**
 * 表示の面の操作の、フォーカスの始末（20261008-display-layout の design「たたむ・開く」「押してもフォーカスを取らない部品と、操作中の枠」）。
 *
 * スクリプトの枠が 1 つでも載っている間、`body` に落ちたフォーカスは、見回りが理由を問わず戻して**数える**（3 秒に 15 回で、その画面のスクリプトの面を全部止める）。
 * だから、フォーカスのある部品を消す・移す操作は、必ずここを通り、**フォーカスを `body` に落とさない**。
 */

/** 見出し（[data-display-head]）・トレイ・つまみ・アプリの固定の部品。 */
const CHROME_SELECTOR = "[data-display-chrome], [data-display-tray], [data-pane-panel-resize]";

const esc = (id: string): string => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, "\\$&"));

/** 面の枠（iframe）か。 */
function frameOf(el: Element | null): HTMLIFrameElement | null {
  return el instanceof HTMLIFrameElement && el.hasAttribute("data-display-frame") ? el : null;
}

/** 操作中のスクリプトの枠か、静的な形式の枠か。操作中でないスクリプトの枠（スクリプトが取った直後）は対象にしない。 */
export function isReleasableFrame(el: Element | null): el is HTMLIFrameElement {
  const f = frameOf(el);
  if (!f) return false;
  if (!f.hasAttribute("data-display-script")) return true;
  return f.parentElement?.getAttribute("data-display-engaged") === "1"; // `closest` で探さない（PanePanel の根にも、意味の違う同じ名前の属性がある）
}

/** 面の枠が持つ pane（枠の祖先の `[data-pane-id]`）。 */
function paneIdOfFrame(f: Element): string | null {
  return f.closest("[data-pane-id]")?.getAttribute("data-pane-id") ?? null;
}

/** 面のどの部品にフォーカスがあるか。 */
export type FocusPlace = "frame" | "head" | "tray" | "other";
export function focusPlaceOf(info: Pick<DisplayInfo, "id">, doc: Document = document): FocusPlace {
  const a = doc.activeElement;
  if (!(a instanceof Element)) return "other";
  const id = esc(info.id);
  const root = a.closest(`[data-display-root="${id}"]`);
  if (root) {
    if (frameOf(a) && root.contains(a)) return "frame";
    if (a.closest("[data-display-head]")) return "head";
  }
  if (a.closest(`[data-display-tray-button][data-display-id="${id}"]`)) return "tray";
  return "other";
}

/** 面の見出し（帯は行の右端）のフォーカスの行き先: ［たたむ］があればそれ、無ければ［⋮］。 */
export function headFocusTarget(id: string): HTMLElement | null {
  const root = `[data-display-root="${esc(id)}"]`;
  return document.querySelector<HTMLElement>(`${root} [data-pane-panel-fold]`) ?? document.querySelector<HTMLElement>(`${root} [data-display-menu-button]`);
}
/** 面のトレイのボタン。 */
export function trayFocusTarget(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-display-tray-button][data-display-id="${esc(id)}"]`);
}

export interface DisplayChangeOptions {
  /** 変更の後に残る部品（浮いた窓のトレイのボタン）にフォーカスがあるときは、変更の前に端末へ移さない。 */
  keepTrayFocus?: boolean;
}

/**
 * 面の状態を変える操作（たたむ・開く・置き場所の変更・窓を閉じる）を、フォーカスの始末つきで行う。
 * 1. フォーカスが、その面の枠（操作中のスクリプトの枠か、静的な形式の枠）にあれば、先に `endEngageFrame` して端末へ戻す。
 * 2. 見出し・トレイのボタンにあれば、**変更の前に、同期で端末へ移す**（消える・移る部品にフォーカスを置いたまま消さない）。
 * 3. `change()` の後（`nextTick`）、元がキーボードで届いた部品（見出し・トレイ）だったなら、`focusAfter()` が返す行き先へ。
 * 4. どの場合でも、変更の後に `activeElement` が `body`・文書に無い要素なら、端末へ移す（備え）。
 */
export async function withDisplayChange(
  info: Pick<DisplayInfo, "id" | "paneId">,
  change: () => void,
  focusAfter: () => HTMLElement | null,
  host: DisplayHost | undefined,
  opts: DisplayChangeOptions = {},
): Promise<void> {
  const place = focusPlaceOf(info);
  if (place === "frame") {
    // 操作中のスクリプトの枠か、静的な形式の枠だけ。操作中でないスクリプトの枠（スクリプトが取った直後）は動かさない（`DisplayFrame` の片づけの数え方に任せる）。
    if (isReleasableFrame(document.activeElement)) {
      endEngageFrame(info.id);
      host?.focusTerminal(info.paneId);
    }
  } else if ((place === "head" || place === "tray") && !(place === "tray" && opts.keepTrayFocus)) {
    host?.focusTerminal(info.paneId);
  }
  change();
  await nextTick();
  if (place === "head" || place === "tray") {
    const to = focusAfter();
    if (to?.isConnected) to.focus();
  }
  const a = document.activeElement;
  if (a === null || a === document.body || !a.isConnected) host?.focusTerminal(info.paneId);
}

/** 面を閉じる（［×］・メニュー）。面が消えるのはサーバの応答の後なので、フォーカスのあるボタンごと消えて `body` に落ちないよう、先に端末へ移す。 */
export function dismissWithFocus(info: Pick<DisplayInfo, "id" | "paneId">, dismiss: () => void, host: DisplayHost | undefined): void {
  const place = focusPlaceOf(info);
  if (place === "frame") {
    if (isReleasableFrame(document.activeElement)) {
      endEngageFrame(info.id);
      host?.focusTerminal(info.paneId);
    }
  } else if (place !== "other") host?.focusTerminal(info.paneId);
  dismiss();
}

/**
 * 表示のメニュー（面の一覧・面のメニュー）を開く。**開く前に、フォーカスが面の枠（操作中のスクリプトの枠か静的な枠）にあれば、端末へ移す**
 * （`ContextMenu` は開く前の `activeElement` を覚えて、閉じるときに `focus()` する。枠を覚えさせると、アプリが枠へ `focus()` することになり、スクリプトの面では「取った」と数えられる）。
 */
export function openDisplayMenu(
  open: (target: MenuTarget, at: { x: number; y: number }) => void,
  target: MenuTarget,
  at: { x: number; y: number },
  host: DisplayHost | undefined,
  paneId: string,
): void {
  const a = document.activeElement;
  if (isReleasableFrame(a)) {
    const wrap = a.closest("[data-display-root]")?.getAttribute("data-display-root");
    if (wrap) endEngageFrame(wrap);
    const pane = paneIdOfFrame(a) ?? paneId;
    host?.focusTerminal(pane);
  }
  open(target, at);
}

/** ボタンの箱の下（キーで開いたときも、ボタンの下）。 */
export function menuPositionBelow(el: Element | null): { x: number; y: number } {
  const r = el?.getBoundingClientRect();
  return r ? { x: Math.round(r.left), y: Math.round(r.bottom) } : { x: 8, y: 8 };
}

/**
 * 押してもフォーカスを取らない部品（`data-display-keepfocus`）・スクリプトの面の覆い（`data-display-cover`）を押したとき、フォーカスが操作中のスクリプトの枠か静的な枠にあれば、
 * 押した瞬間に（同期で）その枠の pane の端末へ移す。`DisplayFrame` の「操作中に枠の外を押した」は、フォーカスを取らない部品だと、枠にフォーカスが残ったまま「取られた」と数えてしまう
 * （`focus_steal`）。`DisplayFrame` の `document` の capture の聞き手より先に走るよう、`window` の capture で聞く。モバイル（重ね表示）では働かせない（押下のたびに見る）。
 * 操作中でないスクリプトの枠にフォーカスがあるとき（スクリプトが取った直後）は何もしない（数え方を変えない）。
 */
export function installKeepFocusRelease(host: DisplayHost | undefined, isMobileSheet: () => boolean, win: Window = window): () => void {
  const onDown = (ev: Event): void => {
    if (!ev.isTrusted) return; // 本物の押下だけ（スクリプトが作った合成の押下で、操作中を解かせない）
    if (isMobileSheet()) return;
    const t = ev.target;
    if (!(t instanceof Element) || t.closest("[data-display-keepfocus], [data-display-cover]") === null) return;
    const a = win.document.activeElement;
    if (!isReleasableFrame(a)) return;
    const pane = paneIdOfFrame(a);
    if (pane) host?.focusTerminal(pane);
    else host?.focusSelectedTerminal();
  };
  win.addEventListener("pointerdown", onDown, true);
  return () => win.removeEventListener("pointerdown", onDown, true);
}

/**
 * `prefix+i` の行き先: ① 開いているパネル（最後に操作した面 → 無ければ出た順）→ ② たたんだパネル（開いてから）→ ③ 開いている帯 → ④ たたんだ帯（開いてから）。
 * 自動でたたまれた面（pane が狭くて出せない）は飛ばす。`faces` は出た順。
 */
export function pickFocusTarget(
  faces: readonly DisplayInfo[],
  isCollapsed: (d: DisplayInfo) => boolean,
  auto: ReadonlySet<string>,
  lastId: string | null,
): { info: DisplayInfo; open: boolean } | null {
  const usable = faces.filter((d) => !auto.has(d.id));
  const panels = usable.filter((d) => d.kind === "panel");
  const bands = usable.filter((d) => d.kind === "band");
  const openPanels = panels.filter((d) => !isCollapsed(d));
  const last = openPanels.find((d) => d.id === lastId) ?? openPanels[0];
  if (last) return { info: last, open: false };
  const foldedPanel = panels[0];
  if (foldedPanel) return { info: foldedPanel, open: true };
  const openBand = bands.find((d) => !isCollapsed(d));
  if (openBand) return { info: openBand, open: false };
  const foldedBand = bands[0];
  return foldedBand ? { info: foldedBand, open: true } : null;
}
