import type { TuiDispatcher } from "../actions/TuiDispatcher.js";
import type { Divider, LayoutResult, PaneBox, Rect } from "../layout/computeLayout.js";
import type { SessionModel } from "../model/SessionModel.js";
import type { UiState } from "../model/UiState.js";
import type { SidebarDragInfo, SidebarHit } from "../render/chrome/sidebar.js";
import { canGrab } from "./sidebarDrag.js";
import type { TabBarHits, TabHit } from "../render/chrome/tabBar.js";
import type { RequestPort } from "../term/PaneRegistry.js";
import {
  logicalLine,
  logicalStart,
  rangeText,
  rowCells,
  snapCol,
  wordRange,
} from "../term/bufferText.js";
import type { PaneTerminal } from "../term/PaneTerminal.js";
import {
  offsetFromDragRow,
  offsetFromRow,
  paneScrollTrack,
  scrollbarThumb,
  scrollMetricsOf,
  type ScrollMetrics,
  type Track,
} from "../render/scrollbar.js";
import type { InputEvent } from "./decode.js";
import { encodeMouse, type MouseTracking } from "./mouseEncode.js";

type MouseEv = Extract<InputEvent, { kind: "mouse" }>;

/** pane の名前をドラッグして落とす先（web の `paneDragZone.ts` の `Zone`）。 */
export type Zone = "top" | "bottom" | "left" | "right" | "center";

/** 縁とみなす帯の幅（対象の軸の割合。web と同じ）。 */
const EDGE_RATIO = 0.3;
/** ダブルクリックとみなす間（ms）。 */
const DOUBLE_CLICK_MS = 400;
/** ホイール 1 目盛りの行数（herdr と同じ 3 行）。 */
const WHEEL_LINES = 3;
/** 境界のドラッグの比率を送る間隔（web の `Splitter.vue` の `SEND_INTERVAL_MS` と同じ）。 */
const SPLIT_SEND_INTERVAL_MS = 50;

/** 落とす先のゾーン（左右を先に、次に上下。web の `zoneAt` と同じ規則）。 */
export function zoneAt(rect: Rect, x: number, y: number): Zone {
  const relX = (x - rect.x + 0.5) / rect.w;
  const relY = (y - rect.y + 0.5) / rect.h;
  if (relX < EDGE_RATIO) return "left";
  if (relX > 1 - EDGE_RATIO) return "right";
  if (relY < EDGE_RATIO) return "top";
  if (relY > 1 - EDGE_RATIO) return "bottom";
  return "center";
}

/** pane の中の選択（マウス。絶対行）。 */
export interface MouseSelection {
  paneId: string;
  from: { row: number; col: number };
  to: { row: number; col: number };
}

/** pane の名前のドラッグの落とし先（描画が強調する）。 */
export type PaneDropTarget =
  | { kind: "pane"; paneId: string; zone: Zone; rect: Rect }
  | { kind: "tab"; tabId: string }
  | { kind: "workspace"; workspaceId: string };

export interface MouseHost {
  model: SessionModel;
  ui: UiState;
  actions: TuiDispatcher;
  layout(): LayoutResult | null;
  sidebarHits(): readonly SidebarHit[];
  tabHits(): TabBarHits;
  /** 1 列表示の「switch」（狭い幅のときだけ）。 */
  switchButton?(): { x: number; w: number } | null;
  pane(paneId: string): PaneTerminal | undefined;
  sendToPane(paneId: string, bytes: string | Uint8Array): void;
  writeClipboard(text: string): Promise<boolean>;
  /** サイドバーの幅を変える（`persist` なら `tui-state.json` に残す）。 */
  setSidebarCols(cols: number, persist: boolean): void;
  /** サイドバーの spaces の区画の行数（区切りのドラッグ）。 */
  setSidebarSpacesRows?(rows: number, persist: boolean): void;
  /** リンクを開く（M6。Ctrl＋クリック）。 */
  openLink?(url: string): void;
  /** マシンを切り替える（サイドバーのマシンの見出し・別のマシンの workspace の行）。 */
  switchMachine?(id: string, target?: { workspaceId: string; tabId: string }): void;
  /** マシンの見出しの畳み・広げ（M10）。 */
  toggleMachine?(id: string): void;
  /** 知らせ（トースト）の当たり（押すと `ui.clickToast`）。 */
  toastHits?(): readonly { id: number; x: number; y: number; w: number }[];
  /** マウスで選んだら離した時点でコピーするか（`tui.copyOnSelect`。省略は入）。 */
  copyOnSelect?(): boolean;
  /** サイドバーの区画をホイールで動かす（区画が一覧より低いとき）。 */
  scrollSidebar?(section: "spaces" | "agents", delta: number): void;
  /** あふれた tab バーの表示をずらす（「‹」「›」）。 */
  scrollTabs?(delta: number): void;
  rpc: RequestPort;
  scheduleRender(): void;
  now?(): number;
}

type Drag =
  /** pane へ渡している押下（最後に送った位置。捨てるときに離しを送る）。 */
  | { kind: "forward"; paneId: string; button: number; col: number; row: number }
  /** 選択。`word` はダブルクリックから押したまま動かした（単語単位に広げる。M5）。 */
  | {
      kind: "select";
      paneId: string;
      anchor: { row: number; col: number };
      word?: { from: number; to: number };
    }
  /** 境界。`grab` は掴んだ位置と境界の差（掴んだだけでは動かさない）。 */
  | {
      kind: "divider";
      divider: Divider;
      tabId: string;
      grab: number;
      start: number;
      /** まだ送っていない比率（50ms 間隔にまとめる）。 */
      pending: number | null;
      timer: ReturnType<typeof setTimeout> | null;
    }
  /** pane のスクロールバーのつまみ（M9）。`grab` はつまみの上端から掴んだ位置までの行数。 */
  | { kind: "scrollbar"; paneId: string; grab: number }
  | { kind: "sidebar" }
  /** サイドバーの spaces と agents の区切り（herdr の H19b）。 */
  | { kind: "section"; top: number }
  | { kind: "tab"; tabId: string; startX: number; moved: boolean }
  /**
   * サイドバーの行（項目・グループの見出し・「グループなし」の見出し）の掴み。`source` は掴んだ行の情報（押した時点のもの）。
   * 動かさずに離した見出しは `onClick`（折りたたみ）。古いサーバで掴めない行は動かしても `moved` にしない（クリック扱い）。
   */
  | {
      kind: "item";
      source: SidebarDragInfo | null;
      startY: number;
      moved: boolean;
      grabbable: boolean;
      onClick: (() => void) | null;
    }
  | { kind: "paneName"; paneId: string; startX: number; startY: number; moved: boolean };

/**
 * マウスの全操作（20260927-cli-mode の design「マウス」。herdr の M1〜M14 と web の拡張 W01〜W04）。押した場所で何をするかを決め、離すまで変えない
 * （pane への受け渡しとドラッグが混ざらないように。04 の tasks「リスク」）。
 * - pane の中身：pane がマウスを求めていれば（Shift を押していなければ）pane ローカルの座標で pane へ。そうでなければ焦点・選択（離すとコピー）・
 *   ダブルクリックで単語・ホイールでスクロールバック。右クリックは pane の右クリックの宛先の設定に従う（pane かメニュー）。
 * - 枠の上辺（名前）：押して離せば焦点、ドラッグで入れ替え・分割（縁）・置き換え（中央）・tab やサイドバーの workspace へ移す。
 * - 分割の境界：ドラッグで比率。サイドバーの右端：ドラッグで幅。
 * - tab：押して焦点・ドラッグで並べ替え・右クリックでメニュー。「＋」で新しい tab。
 * - サイドバー：workspace の行で移る（ドラッグで並べ替え）・グループの見出しで開閉・エージェントの行でその pane へ・「＋」で新しい workspace・
 *   右クリックでメニュー（何も無い所は全体のメニュー）。
 */
export class MouseController {
  private drag: Drag | null = null;
  selection: MouseSelection | null = null;
  dropTarget: PaneDropTarget | null = null;
  private lastClick: { at: number; paneId: string; row: number; col: number } | null = null;

  constructor(private readonly host: MouseHost) {}

  private now(): number {
    return this.host.now?.() ?? Date.now();
  }

  handle(ev: MouseEv): void {
    // 離す事象を取りこぼした（外側の端末の外で離した等）ドラッグが残っていたら、次の押下で捨ててから新しく始める（04 の点検）。
    if (this.drag && ev.action === "down") this.cancel();
    if (this.drag) {
      this.continueDrag(ev);
      return;
    }
    if (ev.action === "down") this.press(ev);
    else if (ev.action === "wheel") this.wheel(ev);
    else if (ev.action === "move") this.motion(ev);
  }

  /** ボタンを押していない動き（外側の端末で ?1003 を有効にしたとき）：全部の動きを求める pane（any）へ送る。 */
  private motion(ev: MouseEv): void {
    const layout = this.host.layout();
    if (!layout || ev.mods.shift) return;
    const box = this.paneAt(layout, ev.x, ev.y);
    if (!box || !this.inContent(box, ev.x, ev.y)) return;
    const term = this.host.pane(box.paneId);
    if (!term || term.modes.mouseTrackingMode !== "any") return;
    const p = this.paneCoords(box, term, ev.x, ev.y);
    if (p) this.forward(box.paneId, term, "any", ev, p.col, p.row);
  }

  /** 画面の座標 → pane の中の座標。pane の実際の大きさの外（切り取りの余白）なら端に寄せる（大きさを超える座標を送らない。04 の点検）。 */
  private paneCoords(
    box: PaneBox,
    term: PaneTerminal,
    x: number,
    y: number,
  ): { col: number; row: number } | null {
    const col = clamp(x - box.content.x, 0, Math.min(box.content.w, term.cols) - 1);
    const row = clamp(y - box.content.y, 0, Math.min(box.content.h, term.rows) - 1);
    return col < 0 || row < 0 ? null : { col, row };
  }

  // --- 当たり判定 ---

  private paneAt(layout: LayoutResult, x: number, y: number): PaneBox | undefined {
    return layout.panes.find(
      (b) =>
        x >= b.frame.x && x < b.frame.x + b.frame.w && y >= b.frame.y && y < b.frame.y + b.frame.h,
    );
  }

  private inContent(b: PaneBox, x: number, y: number): boolean {
    const c = b.content;
    return x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h;
  }

  /** pane の右の罫線のスクロールバー（スクロールバックがある pane の、中身の行の範囲）。 */
  private scrollbarAt(
    layout: LayoutResult,
    x: number,
    y: number,
  ): { box: PaneBox; term: PaneTerminal; metrics: ScrollMetrics; track: Track } | undefined {
    for (const box of layout.panes) {
      if (x !== box.frame.x + box.frame.w - 1) continue;
      const term = this.host.pane(box.paneId);
      if (!term) continue;
      const metrics = scrollMetricsOf(term.term);
      const track = paneScrollTrack(box, term);
      if (metrics && track && y >= track.y && y < track.y + track.h)
        return { box, term, metrics, track };
    }
    return undefined;
  }

  /**
   * 分割の境界（掴んで大きさを変える）。枠の罫線・境目の線の桁だけ——pane の中身の桁は境界にしない（枠を描かない・隙間の無い pane は、
   * 境界の隣の桁が中身。`box.sides`。05 T7 の点検）。
   */
  private dividerAt(layout: LayoutResult, x: number, y: number): Divider | undefined {
    if (layout.panes.some((b) => this.inContent(b, x, y))) return undefined;
    return layout.dividers.find((d) =>
      d.dir === "right"
        ? (x === d.x || x === d.x - 1) && y >= d.y && y < d.y + d.len
        : // 上下の分割は上の pane の下辺だけ（下の pane の上辺は名前の行。名前のドラッグ・焦点を奪わない。04 の点検）
          y === d.y - 1 && x >= d.x && x < d.x + d.len,
    );
  }

  private tabAt(x: number, y: number, layout: LayoutResult): TabHit | undefined {
    if (y !== layout.tabBar.y) return undefined;
    return this.host.tabHits().tabs.find((t) => x >= t.x && x < t.x + t.w);
  }

  private sidebarAt(x: number, y: number, layout: LayoutResult): SidebarHit | undefined {
    const s = layout.sidebar;
    if (!s || x < s.x || x >= s.x + s.w - 1) return undefined;
    const row = this.host.sidebarHits().filter((h) => h.y === y);
    // 桁の決まったボタン（「＋」・並び順・「«」）を先に、無ければ行そのもの。
    return (
      row.find(
        (h) =>
          ((h.kind === "newWorkspace" || h.kind === "collapse") && h.x === x) ||
          ((h.kind === "sort" || h.kind === "subagents") && x >= h.x && x < h.x + h.w),
      ) ??
      row.find(
        (h) =>
          h.kind !== "newWorkspace" &&
          h.kind !== "collapse" &&
          h.kind !== "sort" &&
          h.kind !== "subagents",
      )
    );
  }

  // --- 押した ---

  private press(ev: MouseEv): void {
    const layout = this.host.layout();
    if (!layout || layout.tooSmall) return;
    const { x, y } = ev;
    const { actions, ui, model } = this.host;
    const right = ev.button === 2;
    const left = ev.button === 0;
    this.selection = null;

    // 知らせ（通知のトースト）：押すと対象へ（design「通知」）。ほかの部品より上に描いているので先に見る。
    const toast = this.host.toastHits?.().find((t) => t.y === y && x >= t.x && x < t.x + t.w);
    if (toast) {
      if (left) ui.clickToast(toast.id);
      return;
    }

    // サイドバー
    if (layout.sidebar && x >= layout.sidebar.x && x < layout.sidebar.x + layout.sidebar.w) {
      if (x === layout.sidebar.x + layout.sidebar.w - 1) {
        if (left && !layout.sidebarOverlay) this.drag = { kind: "sidebar" };
        return;
      }
      const hit = this.sidebarAt(x, y, layout);
      if (right) {
        if (hit?.kind === "workspace" || hit?.kind === "autoGroup")
          ui.openContextMenu({ kind: "workspace", workspaceId: hit.workspaceId }, { x, y });
        else if (hit?.kind === "group")
          ui.openContextMenu({ kind: "group", groupId: hit.groupId }, { x, y });
        else if (hit?.kind === "ungrouped") {
          // 「グループなし」の見出し：上へ／下へ移動だけ。`layout` の無い古いサーバでは出す項目が無いので開かない（web と同じ）。
          if (model.hasServerLayout) ui.openContextMenu({ kind: "ungrouped" }, { x, y });
        } else if (hit?.kind === "agent" || hit?.kind === "subagents")
          ui.openContextMenu({ kind: "pane", paneId: hit.paneId }, { x, y });
        else ui.openContextMenu({ kind: "global" }, { x, y });
        return;
      }
      if (!left || !hit) return;
      if (hit.kind === "autoGroup" && x <= hit.toggleX)
        // worktree グループの先頭の行の左の「▸/▾」で畳み・広げ（マシンの見出しの toggleX と同じ。ほかは workspace の行）。
        actions.toggleAutoGroupCollapsed(hit.repoKey);
      else if ((hit.kind === "group" || hit.kind === "ungrouped") && x <= hit.toggleX)
        // 見出しの左の「▸/▾」は押した時点で畳み・広げ（ドラッグの掴みにしない）。
        this.toggleHeading(hit);
      else if (hit.kind === "workspace" || hit.kind === "autoGroup") {
        actions.focusWorkspaceById(hit.workspaceId);
        this.drag = {
          kind: "item",
          source: hit.drag ?? null,
          startY: y,
          moved: false,
          grabbable: hit.drag !== undefined && canGrab(hit.drag, model.hasServerLayout),
          onClick: null,
        };
      } else if (hit.kind === "group" || hit.kind === "ungrouped") {
        // 見出しの名前・線の上：動かさずに離せば畳み・広げ、動かせば項目（グループ・「グループなし」）の並べ替え。
        this.drag = {
          kind: "item",
          source: hit.drag ?? null,
          startY: y,
          moved: false,
          grabbable: hit.drag !== undefined && canGrab(hit.drag, model.hasServerLayout),
          onClick: () => this.toggleHeading(hit),
        };
      } else if (hit.kind === "agent") actions.focusPaneAcrossViews(hit.paneId);
      else if (hit.kind === "subagents") actions.showSubagentsOf(hit.paneId);
      else if (hit.kind === "newWorkspace") actions.run({ type: "newWorkspace" });
      else if (hit.kind === "sort") {
        if (hit.section === "spaces") actions.toggleWorkspaceSort();
        else actions.toggleAgentSort();
      } else if (hit.kind === "collapse") actions.run({ type: "toggleSidebar" });
      else if (hit.kind === "machine") {
        // 左の「▸/▾」で畳み・広げ（M10）、ほかは切り替え（web の MachineHeader の 2 つのボタン）。
        if (x <= hit.toggleX) this.host.toggleMachine?.(hit.machineId);
        else this.host.switchMachine?.(hit.machineId);
      } else if (hit.kind === "machineWorkspace")
        this.host.switchMachine?.(hit.machineId, {
          workspaceId: hit.workspaceId,
          tabId: hit.tabId,
        });
      else if (hit.kind === "sectionDivider")
        this.drag = { kind: "section", top: layout.sidebar.y };
      return;
    }

    // 1 列表示の上辺：「switch」で選び直しの一覧（goto）。右クリックは全体のメニュー。
    if (layout.narrow && y === layout.tabBar.y) {
      const sw = this.host.switchButton?.() ?? null;
      if (right) ui.openContextMenu({ kind: "global" }, { x, y: y + 1 });
      else if (left && sw && x >= sw.x && x < sw.x + sw.w) actions.run({ type: "goto" });
      return;
    }

    // tab バー
    if (y === layout.tabBar.y && x >= layout.tabBar.x) {
      const tab = this.tabAt(x, y, layout);
      if (right) {
        if (tab) ui.openContextMenu({ kind: "tab", tabId: tab.tabId }, { x, y: y + 1 });
        else ui.openContextMenu({ kind: "global" }, { x, y: y + 1 });
        return;
      }
      if (!left) return;
      const bar = this.host.tabHits();
      if (bar.expandSidebar && x === bar.expandSidebar.x) {
        actions.run({ type: "toggleSidebar" });
        return;
      }
      if (bar.scrollLeft && x === bar.scrollLeft.x) {
        this.host.scrollTabs?.(-1);
        return;
      }
      if (bar.scrollRight && x === bar.scrollRight.x) {
        this.host.scrollTabs?.(1);
        return;
      }
      if (tab) {
        const t = model.tabs.get(tab.tabId);
        if (t) actions.switchToTab(t.workspaceId, t.id);
        this.drag = { kind: "tab", tabId: tab.tabId, startX: x, moved: false };
        return;
      }
      const plus = this.host.tabHits().newTab;
      if (plus && x >= plus.x && x < plus.x + plus.w) actions.run({ type: "newTab" });
      return;
    }

    // pane のスクロールバー（右の罫線。スクロールバックがあるとき。M9）。境界より先に見る（境界は右隣の pane の左の罫線でも掴める）。
    const bar = left ? this.scrollbarAt(layout, x, y) : undefined;
    if (bar) {
      const thumb = scrollbarThumb(bar.metrics, bar.track);
      let grab: number;
      if (thumb && y >= thumb.top && y < thumb.top + thumb.len) grab = y - thumb.top;
      else {
        // 溝を押した：つまみの真ん中がそこへ来るまで飛び、そのままつまみを掴んだことにする。
        this.scrollPaneTo(bar.term, offsetFromRow(bar.metrics, bar.track, y));
        grab = Math.floor((thumb?.len ?? 1) / 2);
      }
      this.focus(bar.box.paneId);
      this.drag = { kind: "scrollbar", paneId: bar.box.paneId, grab };
      return;
    }

    // 分割の境界（掴んだ位置と境界の差を覚える。掴んだだけでは比率を変えない。04 ラウンド 2 の点検）
    const divider = left ? this.dividerAt(layout, x, y) : undefined;
    const tab = model.currentTab();
    if (divider && tab) {
      const start = divider.dir === "right" ? x : y;
      const edge = divider.dir === "right" ? divider.x : divider.y;
      this.drag = {
        kind: "divider",
        divider,
        tabId: tab.id,
        grab: start - edge,
        start,
        pending: null,
        timer: null,
      };
      return;
    }

    const box = this.paneAt(layout, x, y);
    if (!box) {
      if (right) ui.openContextMenu({ kind: "global" }, { x, y });
      return;
    }
    const paneId = box.paneId;
    if (!this.inContent(box, x, y)) {
      // 枠：上辺は名前のドラッグ、右クリックはメニュー（web の PaneFrame と同じ）。
      if (right) {
        ui.openContextMenu({ kind: "pane", paneId }, { x, y });
        return;
      }
      if (!left) return;
      if (y === box.frame.y) {
        this.drag = { kind: "paneName", paneId, startX: x, startY: y, moved: false };
        return;
      }
      this.focus(paneId);
      return;
    }

    // pane の中身（pane の実際の大きさの外＝切り取りの余白は端に寄せる。遡っているとき、余白の行が画面に無い行を指さない）
    const term = this.host.pane(paneId);
    const inPane = term ? this.paneCoords(box, term, x, y) : null;
    const col = inPane?.col ?? x - box.content.x;
    const row = inPane?.row ?? y - box.content.y;
    const pane = model.panes.get(paneId);
    // Ctrl（macOS の端末では Cmd が Alt/Meta で届かないので Ctrl だけ）＋クリックでリンクを開く（M6）。pane がマウスを求めていても端末版が扱う。
    if (left && ev.mods.ctrl && term) {
      // OSC 8 のリンク（アプリが付けたもの）を先に、無ければ文字の中の URL。
      const abs = term.term.buffer.active.viewportY + row;
      const url = term.hyperlinkAt(abs, snapCol(term.term, abs, col)) ?? urlAt(term, abs, col);
      if (url) {
        this.focus(paneId);
        this.host.openLink?.(url);
        return;
      }
    }
    const tracking = (term?.modes.mouseTrackingMode ?? "none") as MouseTracking;
    const wantsMouse = tracking !== "none" && !ev.mods.shift;
    if (right && !(pane?.rightClick === "pane" && wantsMouse)) {
      this.focus(paneId);
      ui.openContextMenu({ kind: "pane", paneId }, { x, y });
      return;
    }
    this.focus(paneId);
    if (wantsMouse && term) {
      if (inPane) this.forward(paneId, term, tracking, ev, inPane.col, inPane.row);
      this.drag = { kind: "forward", paneId, button: ev.button, col, row };
      return;
    }
    if (!left || !term) return;
    const abs = term.term.buffer.active.viewportY + row;
    const cell = snapCol(term.term, abs, col);
    // ダブルクリック：単語を選んでコピー（M5）。全角の左右どちらの半分を押しても同じ文字（セル）として数える。
    const now = this.now();
    const dbl =
      this.lastClick !== null &&
      now - this.lastClick.at < DOUBLE_CLICK_MS &&
      this.lastClick.paneId === paneId &&
      this.lastClick.row === abs &&
      this.lastClick.col === cell;
    this.lastClick = { at: now, paneId, row: abs, col: cell };
    if (dbl) {
      const [from, to] = wordRange(term.term, abs, col, "mouse");
      this.selection = { paneId, from: { row: abs, col: from }, to: { row: abs, col: to } };
      // 押したまま動かせば単語単位に広げる（離したときにコピー。動かさずに離してもコピー）。
      this.drag = { kind: "select", paneId, anchor: { row: abs, col: from }, word: { from, to } };
      this.host.scheduleRender();
      return;
    }
    this.drag = { kind: "select", paneId, anchor: { row: abs, col: cell } };
  }

  private focus(paneId: string): void {
    if (this.host.model.focusedPaneId !== paneId) this.host.actions.focusPaneAcrossViews(paneId);
  }

  private forward(
    paneId: string,
    term: PaneTerminal,
    tracking: MouseTracking,
    ev: MouseEv,
    col: number,
    row: number,
  ): void {
    const bytes = encodeMouse(
      { action: ev.action, button: ev.button, col, row, mods: ev.mods },
      term.mouseEncoding,
      tracking,
    );
    if (bytes !== null) this.host.sendToPane(paneId, bytes);
  }

  // --- ドラッグ・離した ---

  private continueDrag(ev: MouseEv): void {
    const drag = this.drag!;
    const layout = this.host.layout();
    if (!layout) {
      this.drag = null;
      return;
    }
    const done = ev.action === "up";
    switch (drag.kind) {
      case "forward": {
        const box = layout.panes.find((b) => b.paneId === drag.paneId);
        const term = this.host.pane(drag.paneId);
        const p = box && term ? this.paneCoords(box, term, ev.x, ev.y) : null;
        if (box && term && p) {
          const { col, row } = p;
          drag.col = col;
          drag.row = row;
          this.forward(
            drag.paneId,
            term,
            term.modes.mouseTrackingMode as MouseTracking,
            ev,
            col,
            row,
          );
        }
        break;
      }
      case "select": {
        const box = layout.panes.find((b) => b.paneId === drag.paneId);
        const term = this.host.pane(drag.paneId);
        const p = box && term ? this.paneCoords(box, term, ev.x, ev.y) : null;
        if (box && term && p) {
          const row = term.term.buffer.active.viewportY + p.row;
          const col = snapCol(term.term, row, p.col);
          if (drag.word) {
            // ダブルクリックから押したまま：単語単位に広げる（M5）。
            const [wf, wt] = wordRange(term.term, row, col, "mouse");
            const a = drag.anchor;
            const back = row < a.row || (row === a.row && col < drag.word.from);
            this.selection = back
              ? {
                  paneId: drag.paneId,
                  from: { row, col: wf },
                  to: { row: a.row, col: drag.word.to },
                }
              : {
                  paneId: drag.paneId,
                  from: { row: a.row, col: drag.word.from },
                  to: { row, col: Math.max(wt, row === a.row ? drag.word.to : wt) },
                };
            if (done) this.copySelection(term);
            this.host.scheduleRender();
            break;
          }
          const a = drag.anchor;
          // 終わりが全角の本体なら右半分まで含める。
          const w = rowCells(term.term, row)[col]?.width ?? 1;
          const b = { row, col };
          const forward = a.row < b.row || (a.row === b.row && a.col <= b.col);
          if (a.row !== b.row || a.col !== b.col) {
            const [from, to] = forward ? [a, b] : [b, a];
            const tw = forward ? w : (rowCells(term.term, a.row)[a.col]?.width ?? 1);
            this.selection = {
              paneId: drag.paneId,
              from,
              to: { row: to.row, col: to.col + Math.max(0, tw - 1) },
            };
          }
          if (done && this.selection) this.copySelection(term);
          this.host.scheduleRender();
        }
        break;
      }
      case "divider": {
        const d = drag.divider;
        const at = d.dir === "right" ? ev.x : ev.y;
        if (at !== drag.start) {
          const pos = at - drag.grab - (d.dir === "right" ? d.area.x : d.area.y);
          const total = d.dir === "right" ? d.area.w : d.area.h;
          drag.pending = Math.min(0.95, Math.max(0.05, pos / total));
        }
        // 動いている間は 50ms 間隔にまとめて送り（web の Splitter と同じ）、離したら最後の値をすぐ送る。
        if (done) this.flushRatio(drag);
        else if (drag.pending !== null && drag.timer === null)
          drag.timer = this.setTimer(() => {
            drag.timer = null;
            this.flushRatio(drag);
          }, SPLIT_SEND_INTERVAL_MS);
        break;
      }
      case "scrollbar": {
        const box = layout.panes.find((b) => b.paneId === drag.paneId);
        const term = this.host.pane(drag.paneId);
        const metrics = term ? scrollMetricsOf(term.term) : null;
        const track = box && term ? paneScrollTrack(box, term) : null;
        if (term && metrics && track)
          this.scrollPaneTo(term, offsetFromDragRow(metrics, track, ev.y, drag.grab));
        break;
      }
      case "sidebar":
        this.host.setSidebarCols(Math.max(10, ev.x + 1), done);
        break;
      case "section":
        this.host.setSidebarSpacesRows?.(Math.max(2, ev.y - drag.top), done);
        break;
      case "tab": {
        if (Math.abs(ev.x - drag.startX) > 1) drag.moved = true;
        if (done && drag.moved) this.dropTab(drag.tabId, ev.x, layout);
        break;
      }
      case "item": {
        if (ev.y !== drag.startY && drag.grabbable) drag.moved = true;
        if (done) {
          if (drag.moved) this.dropItem(drag.source, ev.x, ev.y, layout);
          else drag.onClick?.();
        }
        break;
      }
      case "paneName": {
        if (Math.abs(ev.x - drag.startX) > 1 || ev.y !== drag.startY) drag.moved = true;
        this.dropTarget = drag.moved ? this.paneDropTarget(drag.paneId, ev.x, ev.y, layout) : null;
        if (done) {
          if (drag.moved) this.dropPane(drag.paneId);
          else this.focus(drag.paneId);
          this.dropTarget = null;
        }
        this.host.scheduleRender();
        break;
      }
    }
    if (done) this.drag = null;
  }

  private wheel(ev: MouseEv): void {
    const layout = this.host.layout();
    if (!layout || layout.tooSmall) return;
    const horizontal = ev.button === 66 || ev.button === 67;
    const down = ev.button === 65;
    // tab バー：上下のホイールで前後の tab へ（herdr の H22b・web の TabBar）。
    if (ev.y === layout.tabBar.y && ev.x >= layout.tabBar.x && !layout.narrow) {
      if (!horizontal) this.host.actions.run({ type: "tabDelta", delta: down ? 1 : -1 });
      return;
    }
    // サイドバー：区画の一覧を動かす（区画が一覧より低いとき）。
    const side = layout.sidebar;
    if (side && ev.x >= side.x && ev.x < side.x + side.w) {
      const hit = this.sidebarAt(ev.x, ev.y, layout);
      const section = hit?.section;
      if (section && !horizontal)
        this.host.scrollSidebar?.(section, down ? WHEEL_LINES : -WHEEL_LINES);
      return;
    }
    const box = this.paneAt(layout, ev.x, ev.y);
    if (!box || !this.inContent(box, ev.x, ev.y)) return;
    const term = this.host.pane(box.paneId);
    if (!term) return;
    const tracking = term.modes.mouseTrackingMode as MouseTracking;
    if (tracking !== "none" && !ev.mods.shift) {
      // pane の大きさに収めた座標で送る（横のホイール 66/67 もそのまま渡す）。
      const p = this.paneCoords(box, term, ev.x, ev.y);
      if (p) this.forward(box.paneId, term, tracking, ev, p.col, p.row);
      return;
    }
    // マウスを求めていない pane では横のホイールは使わない（上へのホイールと取り違えない。04 ラウンド 2 の点検）。
    if (horizontal) return;
    // マウスを求めていない代替画面（less・man 等）：矢印キーを 3 回送る（xterm の alternateScroll・herdr の AlternateScroll と同じ）。
    if (term.term.buffer.active.type === "alternate") {
      const final = down ? "B" : "A";
      const seq = `${term.modes.applicationCursorKeysMode ? "\x1bO" : "\x1b["}${final}`;
      this.host.sendToPane(box.paneId, seq.repeat(WHEEL_LINES));
      return;
    }
    // マウスを求めていない pane：スクロールバックを動かす（M8）。
    term.term.scrollLines(down ? WHEEL_LINES : -WHEEL_LINES);
    this.host.scheduleRender();
  }

  private setTimer(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
    const t = setTimeout(fn, ms);
    t.unref?.();
    return t;
  }

  /** 溜めた境界の比率を送る。 */
  private flushRatio(drag: Extract<Drag, { kind: "divider" }>): void {
    if (drag.timer !== null) clearTimeout(drag.timer);
    drag.timer = null;
    const ratio = drag.pending;
    drag.pending = null;
    if (ratio === null) return;
    void this.host.rpc
      .request("layout.set_split_ratio", {
        tabId: drag.tabId,
        splitId: drag.divider.splitId,
        ratio,
      })
      .catch(() => undefined);
  }

  /** スクロールバーの位置（末尾からの行数）へ pane を動かす。 */
  private scrollPaneTo(term: PaneTerminal, offsetFromBottom: number): void {
    const buf = term.term.buffer.active;
    term.term.scrollToLine(Math.max(0, buf.baseY - offsetFromBottom));
    this.host.scheduleRender();
  }

  private copySelection(term: PaneTerminal): void {
    const sel = this.selection;
    if (!sel || this.host.copyOnSelect?.() === false) return;
    // セルの列で切り出し、折り返しの続きの行へは改行を入れない（copy モードと同じ。04 の点検）。
    const text = rangeText(term.term, sel.from, sel.to, false).replace(/[ ]+$/gm, "");
    if (text === "") return;
    void this.host.writeClipboard(text);
  }

  private dropTab(tabId: string, x: number, layout: LayoutResult): void {
    const target = this.tabAt(x, layout.tabBar.y, layout);
    const tabs = this.host.tabHits().tabs;
    const from = tabs.findIndex((t) => t.tabId === tabId);
    const to = target
      ? tabs.findIndex((t) => t.tabId === target.tabId)
      : x >= (tabs.at(-1)?.x ?? 0)
        ? tabs.length - 1
        : -1;
    if (from < 0 || to < 0 || from === to) return;
    // 並べ替えの RPC は隣との入れ替え（`tab.move`）なので、離れた分だけ送る（M12）。
    const direction = to > from ? "next" : "previous";
    for (let i = 0; i < Math.abs(to - from); i++)
      void this.host.rpc.request("tab.move", { tabId, direction }).catch(() => undefined);
  }

  /** 見出し（グループ・「グループなし」）の畳み・広げ。 */
  private toggleHeading(hit: Extract<SidebarHit, { kind: "group" | "ungrouped" }>): void {
    if (hit.kind === "group") this.host.actions.toggleGroupCollapsed(hit.groupId);
    else this.host.actions.toggleUngroupedCollapsed();
  }

  /** 掴んだ項目を、離した行（`drag` を持つ行）の項目へ並べ替える。行の外（何も無い所・別の区画）で離したときは何もしない（取り消し）。 */
  private dropItem(
    source: SidebarDragInfo | null,
    x: number,
    y: number,
    layout: LayoutResult,
  ): void {
    if (!source) return;
    this.host.actions.dropSidebarItem(source, this.sidebarAt(x, y, layout)?.drag);
  }

  private paneDropTarget(
    paneId: string,
    x: number,
    y: number,
    layout: LayoutResult,
  ): PaneDropTarget | null {
    const tab = this.tabAt(x, y, layout);
    if (tab)
      return tab.tabId === this.host.model.panes.get(paneId)?.tabId
        ? null
        : { kind: "tab", tabId: tab.tabId };
    const side = this.sidebarAt(x, y, layout);
    if (side?.kind === "workspace" || side?.kind === "autoGroup")
      return { kind: "workspace", workspaceId: side.workspaceId };
    const box = this.paneAt(layout, x, y);
    if (!box || box.paneId === paneId) return null;
    const zone = zoneAt(box.frame, x, y);
    return { kind: "pane", paneId: box.paneId, zone, rect: zoneRect(box.frame, zone) };
  }

  private dropPane(paneId: string): void {
    const t = this.dropTarget;
    if (!t) return;
    const { actions } = this.host;
    if (t.kind === "tab") actions.movePaneToTab(paneId, t.tabId);
    else if (t.kind === "workspace") actions.movePaneToNewTab(paneId, t.workspaceId);
    else if (t.zone === "center") actions.replacePaneWithDrag(paneId, t.paneId);
    else actions.movePaneToEdge(paneId, t.paneId, t.zone);
  }

  /** サイドバーの項目の掴みの途中か（`Esc` で取り消すため。TuiApp が見る）。 */
  get itemDragging(): boolean {
    return this.drag?.kind === "item" && this.drag.moved;
  }

  /** ドラッグの途中でマウスの報告が途切れた（外側の端末の外で離した等）ときの後始末。 */
  cancel(): void {
    const drag = this.drag;
    this.drag = null;
    // 途中の境界の比率は捨てる（離していない。送る時計も止める）。
    if (drag?.kind === "divider" && drag.timer !== null) clearTimeout(drag.timer);
    this.dropTarget = null;
    // pane へ押下を渡していたなら離しも送る（押したままのアプリを残さない。04 ラウンド 2 の点検）。
    if (drag?.kind === "forward") {
      const term = this.host.pane(drag.paneId);
      if (term)
        this.forward(
          drag.paneId,
          term,
          term.modes.mouseTrackingMode as MouseTracking,
          {
            kind: "mouse",
            action: "up",
            button: drag.button,
            x: 0,
            y: 0,
            mods: { shift: false, alt: false, ctrl: false, meta: false },
          },
          drag.col,
          drag.row,
        );
    }
  }
}

/** ゾーンの強調の矩形（縁は外側から 3 割、中央は全体）。 */
export function zoneRect(frame: Rect, zone: Zone): Rect {
  const w = Math.max(1, Math.round(frame.w * EDGE_RATIO));
  const h = Math.max(1, Math.round(frame.h * EDGE_RATIO));
  switch (zone) {
    case "left":
      return { ...frame, w };
    case "right":
      return { ...frame, x: frame.x + frame.w - w, w };
    case "top":
      return { ...frame, h };
    case "bottom":
      return { ...frame, y: frame.y + frame.h - h, h };
    case "center":
      return frame;
  }
}

/** 単語の範囲（空白・記号で区切る。英数字と `_`・`-`・`.`・`/` は単語の中）。 */
export function wordBounds(text: string, col: number): [number, number] {
  const isWord = (c: string | undefined): boolean =>
    c !== undefined && /[^\s"'`()[\]{}<>|,;]/.test(c);
  if (!isWord(text[col])) return [col, col];
  let from = col;
  let to = col;
  while (from > 0 && isWord(text[from - 1])) from--;
  while (to + 1 < text.length && isWord(text[to + 1])) to++;
  return [from, to];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** http(s) の URL（M6）。 */
const URL_RE = /https?:\/\/[^\s"'<>`]+/g;

/** その位置（セル）に掛かる URL（折り返しをつないだ行で探す。末尾の句読点は落とす）。 */
export function urlAt(term: PaneTerminal, row: number, col: number): string | null {
  const start = logicalStart(term.term, row);
  const { line } = logicalLine(term.term, start);
  // 全角の右半分を押しても本体の文字に当てる（位置は UTF-16 の単位ごと。サロゲートの後もずれない）。
  const cell = snapCol(term.term, row, col);
  const idx = line.pos.findIndex((p) => p.row === row && p.col === cell);
  if (idx < 0) return null;
  for (const m of line.text.matchAll(URL_RE)) {
    const url = m[0].replace(/[.,;:!?)\]]+$/, "");
    const from = m.index;
    if (idx >= from && idx < from + url.length) return url;
  }
  return null;
}
