import { ScrollBar } from "./ScrollBar.js";
import type { SubagentHistoryItem } from "@sodashitsu/protocol";
import type { RequestPort } from "../term/PaneRegistry.js";
import { shortId } from "@sodashitsu/protocol";
import {
  SubagentHistoryReader,
  subagentHistoryMessage,
  subagentTerminalLabel,
  subagentModelLabel,
  subagentStateLabel,
  subagentEmptyLabel,
  formatSubagentElapsed,
  paneNameOf,
  subagentsMoreLabel,
  type KeyInput,
} from "@sodashitsu/client-core";
import type { SessionModel } from "../model/SessionModel.js";
import type { UiState } from "../model/UiState.js";
import { ATTR } from "../render/color.js";
import type { CursorState, Rect } from "../render/Screen.js";
import { stringWidth, truncate } from "../render/width.js";
import {
  centeredRect,
  dialogColors,
  drawBox,
  hiddenCursor,
  inside,
  isDown,
  isEnter,
  isEsc,
  isUp,
  type Overlay,
  type OverlayMouse,
  type OverlayRenderContext,
} from "./overlay.js";

/**
 * 端末へそのまま出してはいけない文字（C0・DEL・C1〔0x9b は 8 ビットの CSI〕・行区切り・双方向の制御）を空白にする。説明・種類はエージェントが書いた文なので、
 * 画面の制御列（`\x1b[2J` 等）や見た目の入れ替えを持ち込ませない。
 */
export function plainText(text: string): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const bad =
      cp < 0x20 ||
      (cp >= 0x7f && cp <= 0x9f) ||
      cp === 0x2028 ||
      cp === 0x2029 ||
      (cp >= 0x202a && cp <= 0x202e) ||
      (cp >= 0x2066 && cp <= 0x2069);
    out += bad ? " " : ch;
  }
  return out;
}

/**
 * エージェントが動かしているサブエージェントの一覧（端末版。20261004-subagent-display）。`NotificationList` と同じ形の overlay。見るだけ:
 * ↑↓（`j`・`k`）で読み（ホイールも）、`Esc`・外側のクリックで閉じる。中身は開いている間も model から引く（件数が変われば一覧も変わる）。
 * 対象のエージェントが居なくなった・入れ替わった・pane が閉じたら閉じるのは `TuiApp.onModelChange`（`closeSubagentsIfGone`）。
 * 短い説明・種類はエージェントが書いた文なので、画面には文字として出す（制御文字は `plainText` で空白にする）。
 * 一覧が長いときの ↑↓ の印は右端の 1 桁に出すので、中身はその手前までにする。
 */
export interface SubagentListHistoryOptions {
  port: RequestPort;
  scope: () => string | null;
  redraw: () => void;
  onClose?: () => void;
  onCurrent?: (agentId: string) => void;
  onHistorical?: (item: SubagentHistoryItem) => void;
}
export class SubagentList implements Overlay {
  private historyMode = false;
  private historyReader: SubagentHistoryReader | null = null;
  private readonly openedScope: string | null;
  private historySelected = 0;
  private historyStart = 0;
  private historyHits: Array<{ y: number; index: number }> = [];
  private validHistory(): boolean {
    return !!this.history && this.openedScope !== null && this.history.scope() === this.openedScope;
  }
  private setHistory(open: boolean): void {
    this.historyReader?.dispose();
    this.historyReader = null;
    this.historyMode = open;
    this.historySelected = 0;
    this.historyStart = 0;
    if (open && this.history && this.validHistory()) {
      this.historyReader = new SubagentHistoryReader(
        this.history.port,
        this.paneId,
        () => (this.validHistory() ? this.openedScope : null),
        () => this.history?.redraw(),
      );
      this.historyReader.start();
    }
  }
  private selectHistory(): void {
    if (!this.validHistory()) return;
    const item = this.historyReader?.state.items[this.historySelected],
      agent = this.model.panes.get(this.paneId)?.agent;
    if (!item || !agent) return;
    if (this.history?.onHistorical) this.history.onHistorical(item);
    else
      this.ui.openDialogWithContext({
        kind: "childConversation",
        paneId: this.paneId,
        agentId: item.id,
        instanceId: agent.instanceId,
        historical: item,
      });
  }
  private selectCurrent(agentId: string): void {
    const parent = this.model.panes.get(this.paneId);
    if (!parent?.agent) return;
    if (this.history?.onCurrent) this.history.onCurrent(agentId);
    else
      this.ui.openDialogWithContext({
        kind: "childConversation",
        paneId: this.paneId,
        agentId,
        instanceId: parent.agent.instanceId,
      });
  }

  private readonly scrollbar = new ScrollBar();
  handleScrollMouse(ev: OverlayMouse) {
    return this.scrollbar.handleMouse(ev);
  }
  cancelInteraction() {
    this.scrollbar.cancel();
  }

  private scroll = 0;
  private selected = 0;
  private rect: Rect | null = null;
  private visible = 0;
  private total = 0;

  constructor(
    private readonly paneId: string,
    private readonly ui: UiState,
    private readonly model: SessionModel,
    private readonly now: () => number = () => Date.now(),
    private readonly history?: SubagentListHistoryOptions,
  ) {
    this.openedScope = history?.scope() ?? null;
    if (history && (model.panes.get(paneId)?.agent?.subagents?.count ?? 0) === 0)
      this.setHistory(true);
  }

  handleKey(k: KeyInput): void {
    this.scrollbar.cancel();
    if (isEsc(k)) return this.cancel();
    if (!k.ctrl && !k.alt && !k.meta && k.key.toLowerCase() === "h" && this.history) {
      this.setHistory(!this.historyMode);
      return;
    }
    if (this.historyMode) {
      const items = this.historyReader?.state.items ?? [];
      if (isEnter(k)) {
        this.selectHistory();
        return;
      }
      if (k.key === "Tab" || isDown(k) || k.key === "j")
        this.historySelected = Math.min(Math.max(0, items.length - 1), this.historySelected + 1);
      else if (isUp(k) || k.key === "k")
        this.historySelected = Math.max(0, this.historySelected - 1);
      else if (k.key === "Home") this.historySelected = 0;
      else if (k.key === "End") this.historySelected = Math.max(0, items.length - 1);
      else if (!k.ctrl && !k.alt && !k.meta && k.key.toLowerCase() === "m")
        void this.historyReader?.more();
      else if (!k.ctrl && !k.alt && !k.meta && k.key.toLowerCase() === "r")
        void this.historyReader?.refresh(true);
      return;
    }
    const parent = this.model.panes.get(this.paneId),
      items = parent?.agent?.subagents?.items.slice(0, 64) ?? [];
    if (k.key === "Tab") {
      this.selected = (this.selected + 1) % Math.max(1, items.length);
      this.scroll = Math.max(
        0,
        Math.min(this.selected, Math.max(this.scroll, this.selected - this.visible + 1)),
      );
      return;
    }
    if (isEnter(k)) {
      const child = items[this.selected];
      if (child) this.selectCurrent(child.id);
      return;
    }

    if (isDown(k) || k.key === "j") this.move(1);
    else if (isUp(k) || k.key === "k") this.move(-1);
    else if (k.key === "PageDown") this.move(Math.max(1, this.visible - 1));
    else if (k.key === "PageUp") this.move(-Math.max(1, this.visible - 1));
    else if (k.key === "Home") this.scroll = 0;
    else if (k.key === "End") this.scroll = Math.max(0, this.total - this.visible);
  }

  private move(delta: number): void {
    this.scroll = Math.max(
      0,
      Math.min(Math.max(0, this.total - this.visible), this.scroll + delta),
    );
  }

  handleMouse(ev: OverlayMouse): boolean {
    if (this.handleScrollMouse(ev)) return true;
    if (!inside(this.rect, ev.x, ev.y)) return false;
    if (this.historyMode) {
      if (ev.action === "down" && ev.button === 0) {
        const hit = this.historyHits.find((h) => h.y === ev.y);
        if (hit) {
          this.historySelected = hit.index;
          this.selectHistory();
        }
      }
      if (ev.action === "wheel")
        this.historySelected = Math.max(
          0,
          Math.min(
            (this.historyReader?.state.items.length ?? 1) - 1,
            this.historySelected + (ev.button === 65 ? 1 : -1),
          ),
        );
      return true;
    }
    if (ev.action === "wheel") this.move(ev.button === 65 ? 1 : -1);
    return true;
  }

  dispose(): void {
    this.historyReader?.dispose();
    this.historyReader = null;
    this.historyHits = [];
  }
  cancel(): void {
    this.dispose();
    if (this.history?.onClose) this.history.onClose();
    else this.ui.closeDialog();
  }
  private renderHistory({ grid, theme }: OverlayRenderContext): CursorState {
    const c = dialogColors(theme),
      pane = this.model.panes.get(this.paneId);
    this.rect = centeredRect(grid, Math.min(100, grid.w - 2), Math.max(8, grid.h - 4));
    const inner = drawBox(grid, this.rect, c, `終了した子 — ${pane ? paneNameOf(pane) : "—"}`),
      width = Math.max(0, inner.w - 1),
      room = Math.max(0, inner.h - 3);
    const state = this.historyReader?.state ?? {
        items: [],
        status: "unavailable" as const,
        loading: false,
        offset: 0,
        more: false,
        omittedBefore: false,
        incomplete: false,
      },
      message = subagentHistoryMessage(state);
    this.historySelected = Math.max(0, Math.min(this.historySelected, state.items.length - 1));
    const height = (i: number) => (subagentModelLabel(state.items[i]!) ? 2 : 1);
    if (this.historySelected < this.historyStart) this.historyStart = this.historySelected;
    let used = 0;
    for (let i = this.historyStart; i <= this.historySelected && i < state.items.length; i++)
      used += height(i);
    while (used > room && this.historyStart < this.historySelected) {
      used -= height(this.historyStart++);
    }
    this.historyHits = [];
    let y = inner.y;
    for (let i = this.historyStart; i < state.items.length && y < inner.y + room; i++) {
      const item = state.items[i]!,
        name = item.description || item.type || "サブエージェント",
        label = subagentModelLabel(item),
        bg = i === this.historySelected ? c.active : c.bg;
      grid.text(
        inner.x,
        y,
        plainText(
          `${i === this.historySelected ? "▶ " : ""}${subagentTerminalLabel(item.terminalStatus)} · ${name}`,
        ),
        c.fg,
        bg,
        0,
        width,
      );
      this.historyHits.push({ y, index: i });
      y++;
      if (label && y < inner.y + room) {
        grid.text(inner.x, y, plainText(label), c.dim, bg, 0, width);
        this.historyHits.push({ y, index: i });
        y++;
      }
    }
    if (message) grid.text(inner.x, inner.y + room, plainText(message), c.dim, c.bg, 0, width);
    grid.text(
      inner.x,
      inner.y + room + 1,
      `${state.omittedBefore ? "古い履歴の一部を省略 · " : ""}${state.more ? "M:さらに表示 · " : ""}R:更新`,
      c.dim,
      c.bg,
      0,
      width,
    );
    grid.text(
      inner.x,
      inner.y + room + 2,
      "↑↓/Tab:選択 Enter:会話 H:現在の子 Esc:戻る",
      c.dim,
      c.bg,
      0,
      width,
    );
    const totalRows = state.items.reduce((n, _row, i) => n + height(i), 0),
      startRow = state.items.slice(0, this.historyStart).reduce((n, _row, i) => n + height(i), 0);
    this.scrollbar.render(grid, { ...inner, h: room }, totalRows, startRow, c, (offset) => {
      const end = offset + room;
      let used = 0,
        selected = 0;
      for (let i = 0; i < state.items.length; i++) {
        const next = used + height(i);
        if (next > end) break;
        used = next;
        selected = i;
      }
      this.historySelected = selected;
      this.historyStart = 0;
    });
    return hiddenCursor();
  }

  render(context: OverlayRenderContext): CursorState {
    if (this.historyMode) return this.renderHistory(context);
    const { grid, theme } = context;
    const c = dialogColors(theme);
    const pane = this.model.panes.get(this.paneId);
    const subagents = pane?.agent?.subagents;
    const items = subagents?.items.slice(0, 64) ?? [];
    const more = subagents ? subagentsMoreLabel(subagents) : null;
    const lines = items.length + (more ? 1 : 0);
    this.total = Math.max(1, lines);
    const r = centeredRect(grid, Math.min(80, grid.w - 2), Math.max(1, lines) + 4);
    this.rect = r;
    const title = `サブエージェント${subagents?.countBasis === "alive" ? "（所属）" : ""} — ${pane ? paneNameOf(pane) : `pane ${shortId(this.paneId)}`}`;
    const inner = drawBox(grid, r, c, title);
    this.visible = Math.max(0, inner.h - 1);
    this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, this.total - this.visible)));
    if (items.length === 0) grid.text(inner.x, inner.y, subagentEmptyLabel(subagents), c.dim, c.bg);
    const now = this.now();
    // 右端の 1 桁は ↑↓ の印のために空けておく（経過時間・「ほか n 件」の最後の文字を上書きしない）。
    const cw = Math.max(0, inner.w - 1);
    for (let i = 0; i < this.visible; i++) {
      const index = this.scroll + i;
      const y = inner.y + i;
      if (index >= lines) break;
      const item = items[index];
      if (!item) {
        grid.text(inner.x, y, truncate(more ?? "", cw), c.dim, c.bg);
        continue;
      }
      const elapsed = formatSubagentElapsed(item.startedAt, now);
      const ew = stringWidth(elapsed);
      const room = Math.max(0, cw - ew - 2);
      const head = truncate(
        plainText(
          `${item.state ? subagentStateLabel(item) + " " : ""}${item.type ?? "サブエージェント"}${item.background ? "（バックグラウンド）" : ""}`,
        ),
        room,
      );
      const hw = grid.text(
        inner.x,
        y,
        head,
        c.fg,
        index === this.selected ? c.active : c.bg,
        ATTR.bold,
        room,
      );
      if (item.description && room - hw > 2) {
        grid.text(
          inner.x + hw,
          y,
          truncate(`  ${plainText(item.description)}`, room - hw),
          c.dim,
          c.bg,
          0,
          room - hw,
        );
      }
      grid.text(inner.x + cw - ew, y, elapsed, c.dim, c.bg, 0);
    }
    grid.text(
      inner.x,
      inner.y + this.visible,
      `${this.history ? "H:終了履歴 · " : ""}Tab:子を選択 · Enter:会話 · Esc:閉じる`,
      c.dim,
      c.bg,
      0,
      inner.w,
    );
    this.scrollbar.render(
      grid,
      { ...inner, h: this.visible },
      this.total,
      this.scroll,
      c,
      (offset) => {
        this.scroll = offset;
      },
    );

    return hiddenCursor();
  }
}
