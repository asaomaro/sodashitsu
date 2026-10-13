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
import { charWidth } from "../render/width.js";
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
type Glyph = { ch: string; color: StatuslineColor; width: 1 | 2 };
export class PaneStatuslines {
  private preview: number | null = null;
  private drag: { paneId: string; startY: number; initial: number } | null = null;
  private hits = new Map<string, { rect: Rect; max: number; lines: Glyph[][] }>();
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
      const lines: Glyph[][] = [[]];
      let used = 0;
      const capacity = box.content.w - 3;
      segments.forEach((segment, i) => {
        for (const ch of (i ? " · " : "") + segment.text) {
          const cp = ch.codePointAt(0)!;
          if (cp < 32 || (cp >= 127 && cp <= 159)) continue;
          const width = charWidth(cp);
          if (!width) {
            const previous = lines.at(-1)?.at(-1);
            if (previous) previous.ch += ch;
            continue;
          }
          if (used + width > capacity) {
            lines.push([]);
            used = 0;
          }
          lines.at(-1)!.push({ ch, width, color: segment.color });
          used += width;
        }
      });
      const max = Math.min(lines.length, box.content.h - 1);
      const h = Math.min(max, this.preview ?? s.rows);
      this.offsets.set(
        pane.id,
        Math.min(this.offsets.get(pane.id) ?? 0, Math.max(0, lines.length - h)),
      );
      box.content = { ...box.content, h: box.content.h - h };
      this.hits.set(pane.id, {
        rect: { x: box.content.x, y: box.content.y + box.content.h, w: box.content.w, h },
        max,
        lines,
      });
    }
    if (this.drag && !this.hits.has(this.drag.paneId)) {
      this.drag = null;
      this.preview = null;
    }
  }
  render(grid: Grid, theme: ThemeColors): void {
    for (const [id, hit] of this.hits) {
      const { x, y, w, h } = hit.rect,
        bg = theme.ground("--soda-bg");
      grid.text(x, y, "⋮", theme.ui("--soda-fg"), bg, 0, 1);
      const offset = this.offsets.get(id) ?? 0;
      for (let row = 0; row < h; row++) {
        let col = x + 2;
        for (const c of hit.lines[offset + row] ?? []) {
          grid.set(col, y + row, c.ch, c.width, theme.ui(colors[c.color]), bg);
          col += c.width;
        }
      }
      grid.text(x + w - 1, y, "↕", theme.ui("--soda-fg"), bg, 0, 1);
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
        this.preview = Math.min(hit.max, Math.max(1, this.drag.initial + this.drag.startY - ev.y));
        this.changed();
      }
      if (ev.action === "up") {
        const rows = this.preview === null ? null : Math.min(hit.max, this.preview);
        this.drag = null;
        this.preview = null;
        if (rows !== null)
          this.writer.setShared({
            statuslineSettings: {
              ...loadStatuslineSettings(this.prefs.shared.statuslineSettings),
              rows,
            },
          });
        this.changed();
      }
      return true;
    }
    for (const [id, hit] of this.hits) {
      const r = hit.rect;
      if (ev.y < r.y || ev.y >= r.y + r.h || ev.x < r.x || ev.x >= r.x + r.w) continue;
      if (ev.action === "down") {
        if (ev.button === 2 || (ev.y === r.y && ev.x < r.x + 2))
          this.ui.openDialogWithContext({ kind: "statuslineSettings" });
        else if (ev.button === 0 && ev.y === r.y && ev.x === r.x + r.w - 1)
          this.drag = { paneId: id, startY: ev.y, initial: r.h };
      } else if (ev.action === "wheel") {
        this.offsets.set(
          id,
          Math.max(
            0,
            Math.min(
              hit.lines.length - r.h,
              (this.offsets.get(id) ?? 0) + (ev.button === 64 ? -1 : 1),
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
