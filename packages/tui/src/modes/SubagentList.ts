import {
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
export class SubagentList implements Overlay {
  private scroll = 0;
  private rect: Rect | null = null;
  private visible = 0;
  private total = 0;

  constructor(
    private readonly paneId: string,
    private readonly ui: UiState,
    private readonly model: SessionModel,
    private readonly now: () => number = () => Date.now(),
  ) {}

  handleKey(k: KeyInput): void {
    if (isEsc(k)) return this.cancel();
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
    if (!inside(this.rect, ev.x, ev.y)) return false;
    if (ev.action === "wheel") this.move(ev.button === 65 ? 1 : -1);
    return true;
  }

  cancel(): void {
    this.ui.closeDialog();
  }

  render({ grid, theme }: OverlayRenderContext): CursorState {
    const c = dialogColors(theme);
    const pane = this.model.panes.get(this.paneId);
    const subagents = pane?.agent?.subagents;
    const items = subagents?.items ?? [];
    const more = subagents ? subagentsMoreLabel(subagents) : null;
    const lines = items.length + (more ? 1 : 0);
    this.total = Math.max(1, lines);
    const r = centeredRect(grid, Math.min(80, grid.w - 2), Math.max(1, lines) + 4);
    this.rect = r;
    const title = `サブエージェント — ${pane ? paneNameOf(pane) : `pane ${this.paneId}`}`;
    const inner = drawBox(grid, r, c, title);
    this.visible = Math.max(0, inner.h - 1);
    this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, this.total - this.visible)));
    if (items.length === 0)
      grid.text(inner.x, inner.y, "実行中のサブエージェントはありません", c.dim, c.bg);
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
          `${item.type ?? "サブエージェント"}${item.background ? "（バックグラウンド）" : ""}`,
        ),
        room,
      );
      const hw = grid.text(inner.x, y, head, c.fg, c.bg, ATTR.bold, room);
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
    if (this.total > this.visible && this.visible > 0) {
      if (this.scroll > 0) grid.set(inner.x + inner.w - 1, inner.y, "↑", 1, c.dim, c.bg);
      if (this.scroll + this.visible < this.total)
        grid.set(inner.x + inner.w - 1, inner.y + this.visible - 1, "↓", 1, c.dim, c.bg);
    }
    grid.text(
      inner.x,
      inner.y + inner.h - 1,
      truncate("↑↓ で読む・Esc で閉じる", inner.w),
      c.dim,
      c.bg,
    );
    return hiddenCursor();
  }
}
