import type { DisplayState } from "@sodashitsu/protocol";
import {
  aggregate,
  depthFirstPaneIds,
  displayStateFor,
  paneNameOf,
  type KeyInput,
} from "@sodashitsu/client-core";
import type { MachinesModel } from "../model/MachinesModel.js";
import type { TuiDispatcher } from "../actions/TuiDispatcher.js";
import type { SessionModel } from "../model/SessionModel.js";
import type { UiState } from "../model/UiState.js";
import { glyphFor, stateColor } from "../render/chrome/context.js";
import { ATTR } from "../render/color.js";
import type { CursorState, Rect } from "../render/Screen.js";
import { truncate } from "../render/width.js";
import {
  dialogColors,
  drawBox,
  hiddenCursor,
  inside,
  isEnter,
  isEsc,
  type Overlay,
  type OverlayMouse,
  type OverlayRenderContext,
} from "./overlay.js";
import { TextInput } from "./TextInput.js";

type GotoTarget =
  | { kind: "workspace"; workspaceId: string }
  | { kind: "tab"; tabId: string }
  | { kind: "pane"; paneId: string }
  /** 別のマシンの workspace（選ぶとそのマシンへ切り替える。AC14）。 */
  | { kind: "remote"; machineId: string; workspaceId: string };

export interface GotoRow {
  depth: 0 | 1 | 2;
  label: string;
  meta: string;
  state: DisplayState | null;
  current: boolean;
  target: GotoTarget;
}

const STATE_KEYS: Record<string, DisplayState> = {
  b: "blocked",
  w: "working",
  i: "idle",
  d: "done",
};

function targetKey(t: GotoTarget): string {
  return t.kind === "workspace"
    ? `workspace:${t.workspaceId}`
    : t.kind === "tab"
      ? `tab:${t.tabId}`
      : t.kind === "pane"
        ? `pane:${t.paneId}`
        : `remote:${t.machineId}:${t.workspaceId}`;
}

/**
 * goto の行（web の `GotoPicker.vue` の `rows` を写した。herdr の `navigator_rows`）。workspace → tab → pane の木。文字の絞り込み（名前・cwd・tab の名前・
 * ブランチ）と状態の絞り込み。絞り込み中は全部展開する。
 */
export function gotoRows(
  model: SessionModel,
  query: string,
  filter: DisplayState | null,
  expanded: ReadonlySet<string>,
  machines?: MachinesModel,
): GotoRow[] {
  const q = query.trim().toLowerCase();
  const filtering = filter !== null || q !== "";
  const textMatch = (v: string) => q === "" || v.toLowerCase().includes(q);
  const statusMatch = (s: DisplayState | null) => filter === null || s === filter;
  const paneState = (paneId: string): DisplayState | null => {
    const p = model.panes.get(paneId);
    return p ? model.displayStateOf(p) : null;
  };
  const out: GotoRow[] = [];
  for (const ws of model.workspaces.values()) {
    const tabRows: GotoRow[] = [];
    for (const tabId of ws.tabIds) {
      const tab = model.tabs.get(tabId);
      if (!tab) continue;
      const paneIds = depthFirstPaneIds(tab.layout);
      const paneRows: GotoRow[] = [];
      for (const [index, paneId] of paneIds.entries()) {
        const pane = model.panes.get(paneId);
        if (!pane) continue;
        const state = paneState(paneId);
        const label = paneNameOf(pane, `pane ${index + 1}`);
        if (
          !filtering ||
          (statusMatch(state) &&
            (textMatch(label) || textMatch(pane.agent?.label ?? "") || textMatch(pane.cwd)))
        ) {
          paneRows.push({
            depth: 2,
            label,
            meta: pane.cwd,
            state,
            current: model.focusedPaneId === paneId,
            target: { kind: "pane", paneId },
          });
        }
      }
      const tabState = aggregate(paneIds.map((id) => paneState(id)));
      const tabMatches = statusMatch(tabState) && textMatch(tab.label);
      if (!filtering || tabMatches || paneRows.length > 0) {
        tabRows.push({
          depth: 1,
          label: tab.label,
          meta: `${paneIds.length} pane`,
          state: tabState,
          current: false,
          target: { kind: "tab", tabId: tab.id },
        });
        if (expanded.has(ws.id) || filtering) tabRows.push(...paneRows);
      }
    }
    const wsState = aggregate(model.panesInWorkspace(ws.id).map((p) => paneState(p.id)));
    const branch = ws.git?.branch ?? "";
    const wsMatches = statusMatch(wsState) && (textMatch(ws.label) || textMatch(branch));
    if (!filtering || wsMatches || tabRows.length > 0) {
      out.push({
        depth: 0,
        label: ws.label,
        meta: branch,
        state: wsState,
        current: false,
        target: { kind: "workspace", workspaceId: ws.id },
      });
      if (expanded.has(ws.id) || filtering) out.push(...tabRows);
    }
  }
  // 別のマシンの workspace（要約。そのマシンの名前を添える）。キーだけでマシンを切り替えられる（AC-I3・AC14）。
  if (machines?.hasMachines) {
    for (const s of machines.sections) {
      if (s.id === machines.selectedId) continue;
      for (const ws of machines.summaries[s.id]?.workspaces ?? []) {
        const state = aggregate(
          machines.agentsInWorkspace(s.id, ws.id).map((a) => displayStateFor(a, a.serverSeenSeq)),
        );
        if (filtering && !(statusMatch(state) && (textMatch(ws.label) || textMatch(s.label))))
          continue;
        out.push({
          depth: 0,
          label: ws.label,
          meta: `@${s.label}`,
          state,
          current: false,
          target: { kind: "remote", machineId: s.id, workspaceId: ws.id },
        });
      }
    }
  }
  return out;
}

/**
 * goto（`prefix+g`。web の `GotoPicker.vue`）。j/k・↑↓・Ctrl+D/U・Home/End/G で移動、Enter で移る、`/` で文字の絞り込み（Esc で欄から離れるだけで中身は保つ）、
 * b/w/i/d で状態の絞り込み・a で解除・Backspace で状態の絞り込みだけを消す、Space で workspace を開閉、Esc で閉じる。
 */
export class GotoDialog implements Overlay {
  private readonly query = new TextInput();
  private editing = false;
  private filter: DisplayState | null = null;
  private selected: GotoTarget | null = null;
  private readonly expanded: Set<string>;
  private rect: Rect | null = null;
  private rowsTop = 0;
  private scroll = 0;

  constructor(
    private readonly deps: {
      ui: UiState;
      model: SessionModel;
      actions: TuiDispatcher;
      /** 状態を記号でも示すか（共有の設定 `statusSymbols`。省略は入）。 */
      statusSymbols?: () => boolean;
      /** 保存した SSH のマシン（別のマシンの workspace も並べる）。 */
      machines?: MachinesModel;
    },
  ) {
    this.expanded = new Set(deps.model.workspaces.keys());
    this.selected = this.rows().find((r) => r.current)?.target ?? null;
  }

  rows(): GotoRow[] {
    return gotoRows(
      this.deps.model,
      this.query.value,
      this.filter,
      this.expanded,
      this.deps.machines,
    );
  }

  private selectedIndex(rows = this.rows()): number {
    if (this.selected) {
      const key = targetKey(this.selected);
      const idx = rows.findIndex((r) => targetKey(r.target) === key);
      if (idx >= 0) return idx;
    }
    return rows.length > 0 ? 0 : -1;
  }

  private move(delta: number): void {
    const rows = this.rows();
    if (rows.length === 0) {
      this.selected = null;
      return;
    }
    const next = Math.min(rows.length - 1, Math.max(0, this.selectedIndex(rows) + delta));
    this.selected = rows[next]!.target;
  }

  handleKey(k: KeyInput): void {
    if (isEsc(k)) {
      if (this.editing) this.editing = false;
      else this.cancel();
      return;
    }
    if (isEnter(k)) return this.accept();
    if (this.editing) {
      if (k.key === "ArrowUp" || (k.key === "p" && k.ctrl)) return this.move(-1);
      if (k.key === "ArrowDown" || (k.key === "n" && k.ctrl)) return this.move(1);
      if (this.query.handleKey(k)) this.selected = null;
      return;
    }
    if (k.key === "Backspace") {
      this.filter = null;
      return;
    }
    if (k.key === "Home") {
      this.selected = this.rows()[0]?.target ?? null;
      return;
    }
    if (k.key === "End" || k.key === "G") {
      this.selected = this.rows().at(-1)?.target ?? null;
      return;
    }
    if (k.key === "/") {
      this.filter = null;
      this.editing = true;
      return;
    }
    if (k.key === "j" || k.key === "ArrowDown") return this.move(1);
    if (k.key === "k" || k.key === "ArrowUp") return this.move(-1);
    if (k.key === "d" && k.ctrl) return this.move(8);
    if (k.key === "u" && k.ctrl) return this.move(-8);
    if (!k.ctrl && k.key in STATE_KEYS) {
      this.query.value = "";
      this.filter = STATE_KEYS[k.key]!;
      this.selected = null;
      return;
    }
    if (k.key === "a") {
      this.query.value = "";
      this.filter = null;
      this.selected = null;
      return;
    }
    if (k.key === " ") {
      const row = this.rows()[this.selectedIndex()];
      if (row?.target.kind === "workspace") {
        const id = row.target.workspaceId;
        if (this.expanded.has(id)) this.expanded.delete(id);
        else this.expanded.add(id);
      }
    }
  }

  handlePaste(text: string): void {
    this.editing = true;
    this.query.insert(text);
  }

  handleMouse(ev: OverlayMouse): boolean {
    if (!inside(this.rect, ev.x, ev.y)) return false;
    if (ev.action === "down" && ev.button === 0) {
      const index = ev.y - this.rowsTop + this.scroll;
      const rows = this.rows();
      if (ev.y >= this.rowsTop && index >= 0 && index < rows.length) {
        this.selected = rows[index]!.target;
        this.accept();
      }
    } else if (ev.action === "wheel") this.move(ev.button === 65 ? 1 : -1);
    return true;
  }

  cancel(): void {
    this.deps.ui.closeDialog();
  }

  /** 先に閉じ（開く前の pane へ一旦戻す）、それから選んだ所へ移る（web と同じ順）。 */
  private accept(): void {
    const row = this.rows()[this.selectedIndex()];
    if (!row) return;
    const { ui, model, actions } = this.deps;
    ui.closeDialog();
    const t = row.target;
    if (t.kind === "remote") actions.openRemoteWorkspace(t.machineId, t.workspaceId);
    else if (t.kind === "workspace") actions.focusWorkspaceById(t.workspaceId);
    else if (t.kind === "tab") {
      const tab = model.tabs.get(t.tabId);
      if (tab) actions.switchToTab(tab.workspaceId, tab.id);
    } else actions.focusPaneAcrossViews(t.paneId);
  }

  render({ grid, theme }: OverlayRenderContext): CursorState {
    const c = dialogColors(theme);
    const r = { x: 2, y: 1, w: Math.max(10, grid.w - 4), h: Math.max(5, grid.h - 2) };
    this.rect = r;
    const inner = drawBox(grid, r, c, "goto");
    const label = "/ ";
    grid.text(inner.x, inner.y, label, c.dim, c.bg);
    const view = this.query.view(inner.w - 12);
    const placeholder = "/ で絞り込み・b/w/i/d で状態・a で解除";
    grid.text(
      inner.x + 2,
      inner.y,
      this.editing || this.query.value ? view.text : placeholder,
      this.editing ? c.fg : c.dim,
      c.bg,
      0,
      inner.w - 12,
    );
    if (this.filter) grid.text(inner.x + inner.w - 8, inner.y, `[${this.filter}]`, c.warn, c.bg);
    const rows = this.rows();
    const sel = this.selectedIndex(rows);
    const visible = Math.max(1, inner.h - 2);
    if (sel < this.scroll) this.scroll = Math.max(0, sel);
    if (sel >= this.scroll + visible) this.scroll = sel - visible + 1;
    this.rowsTop = inner.y + 2;
    for (let i = 0; i < visible && i + this.scroll < rows.length; i++) {
      const row = rows[i + this.scroll]!;
      const y = this.rowsTop + i;
      const on = i + this.scroll === sel;
      const bg = on ? c.active : c.bg;
      grid.fill({ x: inner.x, y, w: inner.w, h: 1 }, c.fg, bg);
      let x = inner.x + row.depth * 2;
      const glyph = glyphFor(row.state, this.deps.statusSymbols?.() ?? true);
      if (glyph) grid.text(x, y, glyph, stateColor(theme, row.state), bg);
      x += 2;
      const w = grid.text(
        x,
        y,
        truncate(row.label, Math.max(1, Math.floor(inner.w / 2) - x + inner.x)),
        c.fg,
        bg,
        on || row.current ? ATTR.bold : 0,
      );
      if (row.meta)
        grid.text(
          x + w + 2,
          y,
          truncate(row.meta, Math.max(0, inner.x + inner.w - x - w - 2)),
          c.dim,
          bg,
        );
    }
    return this.editing
      ? { x: inner.x + 2 + view.cursorCol, y: inner.y, visible: true, style: "bar", blink: true }
      : hiddenCursor();
  }
}
