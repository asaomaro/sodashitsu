import {
  offsetFromDragRow,
  offsetFromRow,
  scrollbarThumb,
  type ScrollMetrics,
} from "../render/scrollbar.js";
import type { Grid, Rect } from "../render/Screen.js";
import type { DialogColors, OverlayMouse } from "./overlay.js";

/** 内容の右端1列を使うスクロールバー。窓の外枠／リサイズ境界とは分離する。 */
export class ScrollBar {
  private state: { rect: Rect; metrics: ScrollMetrics; set: (offset: number) => void } | null =
    null;
  private grab: number | null = null;
  cancel() {
    this.grab = null;
  }
  render(
    grid: Grid,
    rect: Rect,
    total: number,
    offset: number,
    colors: DialogColors,
    set: (offset: number) => void,
  ) {
    const max = Math.max(0, total - rect.h);
    if (!max || rect.h <= 0 || rect.w <= 0) {
      this.state = null;
      this.cancel();
      return;
    }
    const metrics = {
      maxOffsetFromBottom: max,
      offsetFromBottom: max - Math.max(0, Math.min(max, offset)),
      viewportRows: rect.h,
    };
    const track = { y: rect.y, h: rect.h };
    this.state = { rect: { ...rect, x: rect.x + rect.w - 1, w: 1 }, metrics, set };
    const thumb = scrollbarThumb(metrics, track)!;
    for (let y = rect.y; y < rect.y + rect.h; y++)
      grid.set(
        this.state.rect.x,
        y,
        y >= thumb.top && y < thumb.top + thumb.len ? "█" : "░",
        1,
        colors.accent,
        colors.bg,
      );
  }
  handleMouse(ev: OverlayMouse): boolean {
    const s = this.state;
    if (!s) return false;
    const track = { y: s.rect.y, h: s.rect.h };
    if (this.grab !== null) {
      if (ev.action === "move" || ev.action === "up") {
        s.set(s.metrics.maxOffsetFromBottom - offsetFromDragRow(s.metrics, track, ev.y, this.grab));
        if (ev.action === "up") this.cancel();
      }
      return true;
    }
    if (ev.x !== s.rect.x || ev.y < track.y || ev.y >= track.y + track.h) return false;
    if (ev.action === "down" && ev.button === 0) {
      const thumb = scrollbarThumb(s.metrics, track)!;
      if (ev.y >= thumb.top && ev.y < thumb.top + thumb.len) this.grab = ev.y - thumb.top;
      else {
        s.set(s.metrics.maxOffsetFromBottom - offsetFromRow(s.metrics, track, ev.y));
        this.grab = Math.floor(thumb.len / 2);
      }
    } else if (ev.action === "wheel") {
      const current = s.metrics.maxOffsetFromBottom - s.metrics.offsetFromBottom;
      s.set(
        Math.max(0, Math.min(s.metrics.maxOffsetFromBottom, current + (ev.button === 65 ? 3 : -3))),
      );
    }
    return true;
  }
}
