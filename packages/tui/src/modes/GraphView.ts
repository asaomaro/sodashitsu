import type { Graph, NodeKey } from "@sodashitsu/protocol";
import { paneNameOf, type KeyInput } from "@sodashitsu/client-core";
import type { SessionModel } from "../model/SessionModel.js";
import type { UiState } from "../model/UiState.js";
import type { RequestPort } from "../term/PaneRegistry.js";
import type { Grid, Rect, CursorState } from "../render/Screen.js";
import type { ThemeColors } from "../render/color.js";
import { dialogColors, drawBox, hiddenCursor, inside, type OverlayMouse } from "./overlay.js";
import { safeText } from "./document.js";
import { glyphFor, stateColor } from "../render/chrome/context.js";
import { stringWidth } from "../render/width.js";
type Point = { x: number; y: number };
const W = 24,
  H = 5;
/** 端末専用のセル座標。サーバーのWeb用ノード座標には書き込まない。 */
export class GraphView {
  private graph: Graph = { rev: 0, paused: false, nodes: [], links: [] };
  private positions = new Map<NodeKey, Point>();
  private selected: NodeKey | null = null;
  private pan: Point = { x: 0, y: 0 };
  private drag: { key: NodeKey | null; start: Point; origin: Point; moved: boolean } | null = null;
  private rect: Rect | null = null;
  private boxes = new Map<NodeKey, Rect>();
  private active = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private generation = 0;
  private error = "";
  private loading = false;
  constructor(
    private model: SessionModel,
    private ui: UiState,
    private conn: RequestPort,
    private redraw: () => void,
    private focusPane: (id: string) => void,
    private symbols: () => boolean = () => true,
  ) {}
  sync(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (active) {
      void this.refresh();
      this.timer = setInterval(() => void this.refresh(), 3000);
      this.timer.unref?.();
    } else {
      this.generation++;
      this.loading = false;
      this.drag = null;
    }
  }
  reset() {
    this.generation++;
    this.graph = { rev: 0, paused: false, nodes: [], links: [] };
    this.positions.clear();
    this.pan = { x: 0, y: 0 };
    this.selected = null;
    this.drag = null;
    this.loading = false;
    this.error = "";
    if (this.active) void this.refresh();
  }
  private async refresh() {
    if (this.loading) return;
    this.loading = true;
    const generation = this.generation;
    try {
      const graph = await this.conn.request("graph.get", {});
      if (generation === this.generation) {
        this.graph = graph;
        this.error = "";
      }
    } catch {
      if (generation === this.generation) this.error = "グラフを取得できません";
    } finally {
      if (generation === this.generation) this.loading = false;
      if (this.active) this.redraw();
    }
  }
  private move(dx: number, dy: number) {
    if (this.selected) {
      const p = this.positions.get(this.selected);
      if (p) this.positions.set(this.selected, { x: p.x + dx, y: p.y + dy });
    } else this.pan = { x: this.pan.x + dx, y: this.pan.y + dy };
  }
  handleKey(k: KeyInput) {
    if (k.key === "Escape") {
      if (this.drag) {
        this.drag = null;
        return;
      }
      if (this.selected) {
        this.selected = null;
        return;
      }
      this.ui.setScreen("base");
    } else if (k.key === "Tab") {
      const keys = this.graph.nodes.map((n) => n.key);
      this.selected =
        keys[(keys.indexOf(this.selected!) + (k.shift ? -1 : 1) + keys.length) % keys.length] ??
        null;
    } else if (k.key === "Enter" && this.selected?.startsWith("local:")) {
      const id = this.selected.slice(6);
      if (this.model.panes.has(id)) {
        this.focusPane(id);
      }
    } else if (k.key === "ArrowLeft") this.move(-2, 0);
    else if (k.key === "ArrowRight") this.move(2, 0);
    else if (k.key === "ArrowUp") this.move(0, -1);
    else if (k.key === "ArrowDown") this.move(0, 1);
    else if (k.key === "r") void this.refresh();
    else if (k.key === "0") {
      this.positions.clear();
      this.pan = { x: 0, y: 0 };
    } else if (k.key === "p") {
      const generation = this.generation;
      void this.conn
        .request(this.graph.paused ? "graph.resume" : "graph.pause", {})
        .then((graph) => {
          if (generation === this.generation) {
            this.graph = graph;
            this.redraw();
          }
        })
        .catch(() => {
          this.error = "一時停止を切り替えられません";
          this.redraw();
        });
    }
  }
  handleMouse(e: OverlayMouse) {
    if (!inside(this.rect, e.x, e.y) && !this.drag) return false;
    if (e.action === "wheel") {
      this.pan.y += e.button === 64 ? 2 : -2;
      this.redraw();
      return true;
    }
    if (e.action === "down" && e.button === 0) {
      const key = [...this.boxes].reverse().find(([, r]) => inside(r, e.x, e.y))?.[0] ?? null;
      this.selected = key;
      this.drag = {
        key,
        start: { x: e.x, y: e.y },
        origin: { ...(key ? this.positions.get(key)! : this.pan) },
        moved: false,
      };
    } else if (this.drag && (e.action === "move" || e.action === "up")) {
      const drag = this.drag,
        point = { x: drag.origin.x + e.x - drag.start.x, y: drag.origin.y + e.y - drag.start.y };
      drag.moved ||= Math.abs(e.x - drag.start.x) + Math.abs(e.y - drag.start.y) >= 2;
      if (drag.moved) {
        if (drag.key) this.positions.set(drag.key, point);
        else this.pan = point;
      }
      if (e.action === "up") {
        this.drag = null;
        if (!drag.moved && drag.key?.startsWith("local:")) {
          const id = drag.key.slice(6);
          if (this.model.panes.has(id)) this.focusPane(id);
        }
      }
    }
    this.redraw();
    return true;
  }
  render(grid: Grid, area: Rect, theme: ThemeColors): CursorState {
    this.rect = area;
    this.boxes.clear();
    const c = dialogColors(theme);
    grid.fill(area, c.fg, c.bg);
    grid.text(
      area.x + 1,
      area.y,
      `グラフ · ${this.graph.paused ? "一時停止" : "稼働"} · ${this.graph.nodes.length}ノード / ${this.graph.links.length}線`,
      c.fg,
      c.bg,
      0,
      Math.max(0, area.w - 2),
    );
    grid.text(
      area.x + 1,
      area.y + 1,
      this.graph.links
        .map(
          (l) =>
            `${{ trigger: "指示", supervise: "監督", approval: "承認" }[l.kind]} ${l.count}/${l.limit}${l.paused ? " 停止" : ""}`,
        )
        .join(" · "),
      c.dim,
      c.bg,
      0,
      Math.max(0, area.w - 2),
    );
    const canvas: Rect = { x: area.x, y: area.y + 2, w: area.w, h: Math.max(0, area.h - 3) };
    if (area.w < W + 3 || canvas.h < H + 3) {
      grid.text(
        area.x,
        area.y + 1,
        "グラフを表示するには幅27桁・高さ11行が必要です",
        c.warn,
        c.bg,
        0,
        area.w,
      );
      return hiddenCursor();
    }
    const cols = Math.max(1, Math.floor(area.w / (W + 6)));
    const live = new Set(this.graph.nodes.map((n) => n.key));
    for (const key of this.positions.keys()) if (!live.has(key)) this.positions.delete(key);
    if (this.selected && !live.has(this.selected)) this.selected = null;
    const groups = new Map<string, NodeKey[]>();
    const groupName = new Map<string, string>();
    for (const node of this.graph.nodes) {
      const pane = node.key.startsWith("local:")
        ? this.model.panes.get(node.key.slice(6))
        : undefined;
      const tab = pane ? this.model.tabs.get(pane.tabId) : undefined;
      const workspace = tab ? this.model.workspaces.get(tab.workspaceId) : undefined;
      const id =
        workspace?.id ?? (node.key.startsWith("local:") ? "closed" : node.key.split(":")[0]!);
      groups.set(id, [...(groups.get(id) ?? []), node.key]);
      groupName.set(
        id,
        workspace?.label ?? (id === "closed" ? "閉じたペイン" : `マシン ${id.slice(0, 8)}`),
      );
    }
    let offset = 2;
    for (const keys of groups.values()) {
      for (const [slot, key] of keys.entries()) {
        if (!this.positions.has(key)) {
          let free = slot;
          const candidate = () => ({
            x: 2 + (free % cols) * (W + 6),
            y: offset + Math.floor(free / cols) * (H + 3),
          });
          while (
            [...this.positions.values()].some(
              (p) => Math.abs(p.x - candidate().x) < W + 2 && Math.abs(p.y - candidate().y) < H + 2,
            )
          )
            free++;
          this.positions.set(key, candidate());
        }
        const p = this.positions.get(key)!;
        this.boxes.set(key, {
          x: canvas.x + p.x + this.pan.x,
          y: canvas.y + p.y + this.pan.y,
          w: W,
          h: H,
        });
      }
      offset += Math.ceil(keys.length / cols) * (H + 3) + 3;
    }
    for (const [id, keys] of groups) {
      const boxes = keys.map((k) => this.boxes.get(k)!);
      const left = Math.min(...boxes.map((b) => b.x)) - 1,
        top = Math.min(...boxes.map((b) => b.y)) - 2;
      const right = Math.max(...boxes.map((b) => b.x + b.w)) + 1,
        bottom = Math.max(...boxes.map((b) => b.y + b.h)) + 1;
      const x = Math.max(canvas.x, left),
        y = Math.max(canvas.y, top),
        w = Math.min(canvas.x + canvas.w, right) - x,
        h = Math.min(canvas.y + canvas.h, bottom) - y;
      if (w >= 4 && h >= 3)
        drawBox(grid, { x, y, w, h }, c, safeText(`${groupName.get(id)} · ${keys.length}ペイン`));
    }
    // セル間の接続方向を合成して、交点も罫線で描く。
    const masks = new Map<string, number>();
    const set = (x: number, y: number, mask: number) => {
      if (inside(canvas, x, y)) {
        const key = x + "," + y;
        masks.set(key, (masks.get(key) ?? 0) | mask);
      }
    };
    const segment = (a: Point, b: Point) => {
      const dx = Math.sign(b.x - a.x),
        dy = Math.sign(b.y - a.y);
      let x = a.x,
        y = a.y;
      const steps = Math.min(
        2 * (canvas.w + canvas.h) + 200,
        Math.abs(b.x - a.x) + Math.abs(b.y - a.y),
      );
      for (let i = 0; i < steps; i++) {
        set(x, y, dx ? (dx > 0 ? 2 : 8) : dy > 0 ? 4 : 1);
        x += dx;
        y += dy;
        set(x, y, dx ? (dx > 0 ? 8 : 2) : dy > 0 ? 1 : 4);
      }
    };
    const arrows: Point[] = [];
    const connect = (from: NodeKey, to: NodeKey, label: string) => {
      const a = this.boxes.get(from),
        b = this.boxes.get(to);
      if (
        !a ||
        !b ||
        !inside(canvas, a.x + W / 2, a.y + H / 2) ||
        !inside(canvas, b.x + W / 2, b.y + H / 2)
      )
        return;
      const start = { x: a.x + W, y: a.y + 1 },
        end = { x: b.x - 1, y: b.y + 1 },
        mid = Math.floor((start.x + end.x) / 2);
      segment(start, { x: mid, y: start.y });
      segment({ x: mid, y: start.y }, { x: mid, y: end.y });
      segment({ x: mid, y: end.y }, end);
      arrows.push(end);
      if (inside(canvas, start.x, start.y - 1))
        grid.text(
          start.x,
          start.y - 1,
          label,
          c.fg,
          c.bg,
          0,
          Math.min(24, canvas.x + canvas.w - start.x),
        );
    };
    for (const link of this.graph.links)
      connect(
        link.from,
        link.to,
        `${link.count}/${link.limit} ${{ trigger: "指示", supervise: "監督", approval: "承認" }[link.kind]}${link.paused ? " 停止" : ""}`,
      );
    for (const node of this.graph.nodes)
      if (node.forkedFrom) connect(node.forkedFrom, node.key, "fork");
    const glyphs: Record<number, string> = {
      1: "│",
      2: "─",
      4: "│",
      8: "─",
      3: "└",
      6: "┌",
      9: "┘",
      12: "┐",
      5: "│",
      10: "─",
      7: "├",
      11: "┴",
      13: "┤",
      14: "┬",
      15: "┼",
    };
    for (const [key, mask] of masks) {
      const [x, y] = key.split(",").map(Number);
      grid.set(x!, y!, glyphs[mask] ?? "┼", 1, c.fg, c.bg);
    }
    for (const point of arrows)
      if (inside(canvas, point.x, point.y)) grid.set(point.x, point.y, "▶", 1, c.fg, c.bg);
    for (const [key, box] of this.boxes) {
      if (
        box.x < canvas.x ||
        box.y < canvas.y ||
        box.x + W > canvas.x + canvas.w ||
        box.y + H > canvas.y + canvas.h
      )
        continue;
      const pane = key.startsWith("local:") ? this.model.panes.get(key.slice(6)) : undefined;
      const colors = { ...c, border: this.selected === key ? c.warn : c.border };
      drawBox(grid, box, colors);
      const state = pane?.agent ? this.model.displayStateOf(pane) : null;
      const glyph = glyphFor(state, this.symbols());
      const prefixWidth = glyph ? stringWidth(glyph) + 1 : 0;
      grid.text(box.x + 1, box.y + 1, glyph, stateColor(theme, state), c.bg, 0, W - 2);
      grid.text(
        box.x + 1 + prefixWidth,
        box.y + 1,
        safeText(pane ? paneNameOf(pane) : key),
        c.fg,
        c.bg,
        0,
        W - 2 - prefixWidth,
      );
      grid.text(
        box.x + 1,
        box.y + 2,
        safeText(
          pane?.agent
            ? `${pane.agent.kind} · ${this.model.displayStateOf(pane)}`
            : pane
              ? "ターミナル"
              : "別のマシン",
        ),
        c.fg,
        c.bg,
        0,
        W - 2,
      );
      const tab = pane ? this.model.tabs.get(pane.tabId) : undefined;
      grid.text(
        box.x + 1,
        box.y + 3,
        safeText(
          `[${tab?.label ?? "—"}]${pane?.agent?.subagents?.count ? ` · 子${pane.agent.subagents.count}` : ""}`,
        ),
        c.dim,
        c.bg,
        0,
        W - 2,
      );
    }
    if (this.error || !this.graph.nodes.length)
      grid.text(
        area.x + 1,
        area.y + 1,
        this.error || "ノードはありません",
        c.warn,
        c.bg,
        0,
        Math.max(0, area.w - 2),
      );
    grid.text(
      area.x,
      area.y + area.h - 1,
      "D&D 移動 · Tab 選択 · ↑↓←→ 移動 · Enter 端末 · p 停止/再開 · 0 整列 · Esc 戻る",
      c.fg,
      c.bg,
      0,
      area.w,
    );
    return hiddenCursor();
  }
  dispose() {
    this.sync(false);
    this.generation++;
  }
}
