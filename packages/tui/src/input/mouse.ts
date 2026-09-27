import type { TuiDispatcher } from "../actions/TuiDispatcher.js";
import type { Divider, LayoutResult, PaneBox, Rect } from "../layout/computeLayout.js";
import type { SessionModel } from "../model/SessionModel.js";
import type { UiState } from "../model/UiState.js";
import type { SidebarHit } from "../render/chrome/sidebar.js";
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
  rpc: RequestPort;
  scheduleRender(): void;
  now?(): number;
}

type Drag =
  | { kind: "forward"; paneId: string }
  | { kind: "select"; paneId: string; anchor: { row: number; col: number } }
  | { kind: "divider"; divider: Divider; tabId: string }
  | { kind: "sidebar" }
  /** サイドバーの spaces と agents の区切り（herdr の H19b）。 */
  | { kind: "section"; top: number }
  | { kind: "tab"; tabId: string; startX: number; moved: boolean }
  | { kind: "workspace"; workspaceId: string; startY: number; moved: boolean }
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
  private lastClick: { at: number; x: number; y: number } | null = null;

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

  private dividerAt(layout: LayoutResult, x: number, y: number): Divider | undefined {
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
    return this.host
      .sidebarHits()
      .find((h) => h.y === y && (h.kind !== "newWorkspace" || h.x === x));
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

    // サイドバー
    if (layout.sidebar && x >= layout.sidebar.x && x < layout.sidebar.x + layout.sidebar.w) {
      if (x === layout.sidebar.x + layout.sidebar.w - 1) {
        if (left) this.drag = { kind: "sidebar" };
        return;
      }
      const hit = this.sidebarAt(x, y, layout);
      if (right) {
        if (hit?.kind === "workspace")
          ui.openContextMenu({ kind: "workspace", workspaceId: hit.workspaceId }, { x, y });
        else if (hit?.kind === "group")
          ui.openContextMenu({ kind: "group", groupId: hit.groupId }, { x, y });
        else if (hit?.kind === "agent")
          ui.openContextMenu({ kind: "pane", paneId: hit.paneId }, { x, y });
        else ui.openContextMenu({ kind: "global" }, { x, y });
        return;
      }
      if (!left || !hit) return;
      if (hit.kind === "workspace") {
        actions.focusWorkspaceById(hit.workspaceId);
        this.drag = { kind: "workspace", workspaceId: hit.workspaceId, startY: y, moved: false };
      } else if (hit.kind === "group") actions.toggleGroupCollapsed(hit.groupId);
      else if (hit.kind === "autoGroup") actions.toggleAutoGroupCollapsed(hit.repoKey);
      else if (hit.kind === "agent") actions.focusPaneAcrossViews(hit.paneId);
      else if (hit.kind === "newWorkspace") actions.run({ type: "newWorkspace" });
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

    // 分割の境界
    const divider = left ? this.dividerAt(layout, x, y) : undefined;
    const tab = model.currentTab();
    if (divider && tab) {
      this.drag = { kind: "divider", divider, tabId: tab.id };
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

    // pane の中身
    const term = this.host.pane(paneId);
    const col = x - box.content.x;
    const row = y - box.content.y;
    const pane = model.panes.get(paneId);
    // Ctrl（macOS の端末では Cmd が Alt/Meta で届かないので Ctrl だけ）＋クリックでリンクを開く（M6）。pane がマウスを求めていても端末版が扱う。
    if (left && ev.mods.ctrl && term) {
      const url = urlAt(term, term.term.buffer.active.viewportY + row, col);
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
      const p = this.paneCoords(box, term, x, y);
      if (p) this.forward(paneId, term, tracking, ev, p.col, p.row);
      this.drag = { kind: "forward", paneId };
      return;
    }
    if (!left || !term) return;
    const abs = term.term.buffer.active.viewportY + row;
    // ダブルクリック：単語を選んでコピー（M5）。
    const now = this.now();
    const dbl =
      this.lastClick !== null &&
      now - this.lastClick.at < DOUBLE_CLICK_MS &&
      this.lastClick.x === x &&
      this.lastClick.y === y;
    this.lastClick = { at: now, x, y };
    if (dbl) {
      const [from, to] = wordRange(term.term, abs, col, "mouse");
      this.selection = { paneId, from: { row: abs, col: from }, to: { row: abs, col: to } };
      this.copySelection(term);
      this.host.scheduleRender();
      return;
    }
    this.drag = { kind: "select", paneId, anchor: { row: abs, col: snapCol(term.term, abs, col) } };
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
        if (box && term) {
          const row =
            term.term.buffer.active.viewportY + clamp(ev.y - box.content.y, 0, box.content.h - 1);
          const col = snapCol(term.term, row, clamp(ev.x - box.content.x, 0, box.content.w - 1));
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
        const pos = d.dir === "right" ? ev.x - d.area.x : ev.y - d.area.y;
        const total = d.dir === "right" ? d.area.w : d.area.h;
        const ratio = Math.min(0.95, Math.max(0.05, pos / total));
        void this.host.rpc
          .request("layout.set_split_ratio", { tabId: drag.tabId, splitId: d.splitId, ratio })
          .catch(() => undefined);
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
      case "workspace": {
        if (ev.y !== drag.startY) drag.moved = true;
        if (done && drag.moved) this.dropWorkspace(drag.workspaceId, ev.x, ev.y, layout);
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
    if (!layout) return;
    const box = this.paneAt(layout, ev.x, ev.y);
    if (!box || !this.inContent(box, ev.x, ev.y)) return;
    const term = this.host.pane(box.paneId);
    if (!term) return;
    const tracking = term.modes.mouseTrackingMode as MouseTracking;
    if (tracking !== "none" && !ev.mods.shift) {
      this.forward(box.paneId, term, tracking, ev, ev.x - box.content.x, ev.y - box.content.y);
      return;
    }
    // マウスを求めていない代替画面（less・man 等）：矢印キーを 3 回送る（xterm の alternateScroll・herdr の AlternateScroll と同じ）。
    if (term.term.buffer.active.type === "alternate") {
      const final = ev.button === 65 ? "B" : "A";
      const seq = `${term.modes.applicationCursorKeysMode ? "\x1bO" : "\x1b["}${final}`;
      this.host.sendToPane(box.paneId, seq.repeat(WHEEL_LINES));
      return;
    }
    // マウスを求めていない pane：スクロールバックを動かす（M8）。
    term.term.scrollLines(ev.button === 65 ? WHEEL_LINES : -WHEEL_LINES);
    this.host.scheduleRender();
  }

  private copySelection(term: PaneTerminal): void {
    const sel = this.selection;
    if (!sel) return;
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

  private dropWorkspace(workspaceId: string, x: number, y: number, layout: LayoutResult): void {
    const rows = this.host
      .sidebarHits()
      .filter((h): h is Extract<SidebarHit, { kind: "workspace" }> => h.kind === "workspace");
    const target = this.sidebarAt(x, y, layout);
    const from = rows.findIndex((r) => r.workspaceId === workspaceId);
    if (target?.kind !== "workspace" || from < 0) return;
    const to = rows.findIndex((r) => r.workspaceId === target.workspaceId);
    if (to === from) return;
    // 上へ動かすなら落とした行の前、下へなら落とした行の次の前（末尾なら null）。web の D&D と同じ位置。
    const before = to < from ? rows[to]!.workspaceId : (rows[to + 1]?.workspaceId ?? null);
    this.host.actions.moveWorkspacesByDrag([workspaceId], before);
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
    if (side?.kind === "workspace") return { kind: "workspace", workspaceId: side.workspaceId };
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

  /** ドラッグの途中でマウスの報告が途切れた（外側の端末の外で離した等）ときの後始末。 */
  cancel(): void {
    this.drag = null;
    this.dropTarget = null;
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
  const idx = line.pos.findIndex((p) => p.row === row && p.col >= col);
  if (idx < 0) return null;
  for (const m of line.text.matchAll(URL_RE)) {
    const url = m[0].replace(/[.,;:!?)\]]+$/, "");
    const from = m.index;
    if (idx >= from && idx < from + url.length) return url;
  }
  return null;
}
