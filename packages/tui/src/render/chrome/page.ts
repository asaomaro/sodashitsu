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
      grid.bg[i] = theme.transparent ? theme.ground("--soda-menu-bg") : theme.ui("--soda-menu-active-bg");
      grid.fg[i] = theme.ui("--soda-accent");
    }
    grid.attrs[i] = grid.attrs[i]! | ATTR.bold;
  }
}

/** Non-destructive section borders. Call after painting content; reserve edge cells for the frame. */
export function sectionRule(grid: Grid, area: Rect, y: number, theme: ThemeColors, title = "", bottom = false, joined = false): void {
  if (area.w < 2 || y < area.y || y >= area.y + area.h) return;
  const fg = theme.ui("--soda-accent"), bg = theme.ground("--soda-menu-bg");
  grid.text(area.x,y,"─".repeat(area.w),fg,bg,0,area.w);
  grid.text(area.x,y,bottom?"╰":joined?"├":"╭",fg,bg,0,1);
  grid.text(area.x+area.w-1,y,bottom?"╯":joined?"┤":"╮",fg,bg,0,1);
  if (!bottom && title && area.w > 6) grid.text(area.x+2,y,` ${title} `,fg,bg,ATTR.bold,Math.max(0,area.w-4));
}
export function sectionSides(grid: Grid, area: Rect, y: number, theme: ThemeColors): void {
  if (area.w < 2 || y < area.y || y >= area.y + area.h) return;
  const fg=theme.ui("--soda-accent"), bg=theme.ground("--soda-menu-bg");
  grid.text(area.x,y,"│",fg,bg,0,1);
  grid.text(area.x+area.w-1,y,"│",fg,bg,0,1);
}
export function sectionBox(grid: Grid, area: Rect, theme: ThemeColors, title: string): void {
  if(area.h<3||area.w<4)return;
  sectionRule(grid,area,area.y,theme,title);
  for(let y=area.y+1;y<area.y+area.h-1;y++)sectionSides(grid,area,y,theme);
  sectionRule(grid,area,area.y+area.h-1,theme,"",true);
}
