import type { Grid, Rect } from "../Screen.js";
import { ATTR, type ThemeColors } from "../color.js";

/** Restyle the existing title row without changing layout, text or hit coordinates. */
export function pageHeader(grid: Grid, area: Rect, theme: ThemeColors): void {
  if (area.h < 1) return;
  for (let x = Math.max(0, area.x); x < Math.min(grid.w, area.x + area.w); x++) {
    const i = area.y * grid.w + x;
    if (i < 0 || i >= grid.ch.length) continue;
    // Keep control/selection backgrounds so active buttons remain distinguishable.
    if (grid.bg[i] === theme.ground("--soda-menu-bg")) {
      grid.bg[i] = theme.ui("--soda-menu-active-bg");
      grid.fg[i] = theme.ui("--soda-accent");
    }
    grid.attrs[i] = grid.attrs[i]! | ATTR.bold;
  }
}
