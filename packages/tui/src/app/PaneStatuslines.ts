import {
  loadStatuslineSettings,
  statuslineSegments,
  type StatuslineColor,
} from "@sodashitsu/protocol";
import type { SessionModel } from "../model/SessionModel.js";
import type { PrefsModel } from "../model/PrefsModel.js";
import type { UsageModel } from "../model/UsageModel.js";
import type { UiState } from "../model/UiState.js";
import type { SettingsWriter } from "../settings/SettingsWriter.js";
import type { LayoutResult } from "../layout/computeLayout.js";
import type { InputEvent } from "../input/decode.js";
import type { Grid, Rect } from "../render/Screen.js";
import type { ThemeColors } from "../render/color.js";
import { charWidth, stringWidth } from "../render/width.js";
const colors = {
  name: "--soda-state-working",
  active: "--soda-state-working",
  model: "--soda-state-idle",
  good: "--soda-state-done",
  warning: "--soda-state-working",
  danger: "--soda-state-blocked",
  muted: "--soda-fg",
} as const;
type Mouse = Extract<InputEvent, { kind: "mouse" }>;
export class PaneStatuslines {
  private preview: number | null = null;
  private drag: { paneId: string; startX: number; initial: number } | null = null;
  private hits = new Map<
    string,
    { rect: Rect; max: number; text: { ch: string; color: StatuslineColor; width: number }[] }
  >();
  private offsets = new Map<string, number>();
  constructor(
    private model: SessionModel,
    private prefs: PrefsModel,
    private usage: UsageModel,
    private ui: UiState,
    private writer: SettingsWriter,
    private changed: () => void,
  ) {}
  get dragging(): boolean {
    return this.drag !== null;
  }
  cancel(): void {
    this.drag = null;
    this.preview = null;
    this.changed();
  }
  adjust(layout: LayoutResult): void {
    this.hits.clear();
    if (this.ui.screen !== "base") return;
    const s = loadStatuslineSettings(this.prefs.shared.statuslineSettings);
    for (const box of layout.panes) {
      const pane = this.model.panes.get(box.paneId);
      if (!pane || box.content.h < 2 || box.content.w < 8) continue;
      const segments = statuslineSegments(
        pane,
        this.usage.data.panes[pane.id],
        this.usage.data.accounts,
        s,
      );
      if (!segments.length) continue;
      const text: { ch: string; color: StatuslineColor; width: number }[] = [];
      segments.forEach((segment, i) => {
        for (const ch of i ? " · " : "")
          text.push({ ch, color: "muted", width: charWidth(ch.codePointAt(0)!) });
        for (const ch of segment.text)
          text.push({ ch, color: segment.color, width: charWidth(ch.codePointAt(0)!) });
      });
      const max = Math.min(box.content.w, stringWidth(segments.map((v) => v.text).join(" · ")) + 3);
      const w = Math.min(max, this.preview ?? s.columns ?? max);
      const total = text.reduce((n, c) => n + c.width, 0);
      this.offsets.set(
        pane.id,
        Math.max(0, Math.min(this.offsets.get(pane.id) ?? 0, total - w + 3)),
      );
      box.content = { ...box.content, h: box.content.h - 1 };
      this.hits.set(pane.id, {
        rect: { x: box.content.x, y: box.content.y + box.content.h, w, h: 1 },
        max,
        text,
      });
    }
    if (this.drag && !this.hits.has(this.drag.paneId)) {
      this.drag = null;
      this.preview = null;
    }
  }
  render(grid: Grid, theme: ThemeColors): void {
    for (const [id, hit] of this.hits) {
      const { x, y, w } = hit.rect,
        bg = theme.ground("--soda-bg");
      grid.text(x, y, "⋮", theme.ui("--soda-fg"), bg, 0, 1);
      let pos = 0,
        col = x + 2;
      const offset = this.offsets.get(id) ?? 0;
      for (const c of hit.text) {
        if (pos >= offset) {
          if (col + c.width > x + w - 1) break;
          if (c.width > 0) grid.set(col, y, c.ch, c.width as 1 | 2, theme.ui(colors[c.color]), bg);
          col += c.width;
        }
        pos += c.width;
      }
      grid.text(x + w - 1, y, "│", theme.ui("--soda-fg"), bg, 0, 1);
    }
  }
  handle(ev: Mouse): boolean {
    if (this.drag) {
      if (ev.action === "down") {
        this.cancel();
        return this.handle(ev);
      }
      const hit = this.hits.get(this.drag.paneId);
      if (!hit) {
        this.cancel();
        return true;
      }
      if (ev.action === "move") {
        this.preview = Math.min(hit.max, Math.max(8, this.drag.initial + ev.x - this.drag.startX));
        this.changed();
      }
      if (ev.action === "up") {
        const columns = this.preview;
        this.drag = null;
        this.preview = null;
        if (columns !== null)
          this.writer.setShared({
            statuslineSettings: {
              ...loadStatuslineSettings(this.prefs.shared.statuslineSettings),
              columns,
            },
          });
        this.changed();
      }
      return true;
    }
    for (const [id, hit] of this.hits) {
      const r = hit.rect;
      if (ev.y !== r.y || ev.x < r.x || ev.x >= r.x + r.w) continue;
      if (ev.action === "down") {
        if (ev.button === 2 || ev.x < r.x + 2)
          this.ui.openDialogWithContext({ kind: "statuslineSettings" });
        else if (ev.button === 0 && ev.x === r.x + r.w - 1)
          this.drag = { paneId: id, startX: ev.x, initial: r.w };
      } else if (ev.action === "wheel") {
        const total = hit.text.reduce((n, c) => n + c.width, 0);
        this.offsets.set(
          id,
          Math.max(
            0,
            Math.min(
              Math.max(0, total - r.w + 3),
              (this.offsets.get(id) ?? 0) + (ev.button === 64 ? -4 : 4),
            ),
          ),
        );
        this.changed();
      }
      return true;
    }
    return false;
  }
}
