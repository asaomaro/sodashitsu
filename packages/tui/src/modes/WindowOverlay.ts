import { viewHeaderButtons } from "./viewHeader.js";
import type { KeyInput } from "@sodashitsu/client-core";
import type { ThemeColors } from "../render/color.js";
import { Grid, type Rect } from "../render/Screen.js";
import type { Overlay, OverlayMouse, OverlayRenderContext } from "./overlay.js";

/** 内蔵overlayをセル単位の移動・リサイズ可能な窓にする。 */
export class WindowOverlay implements Overlay {
  private rect: Rect | null = null;
  private screen = { w: 0, h: 0 };
  private drag: {
    x: number;
    y: number;
    rect: Rect;
    resize: boolean;
    moved: boolean;
    custom: boolean;
    maximized: boolean;
    dock: boolean;
    left: boolean;
    top: boolean;
    horizontal: boolean;
    vertical: boolean;
  } | null = null;
  private custom = false;
  private pointer: { x: number; y: number } | null = null;
  private restore: Rect | null = null;
  private maximized = false;
  constructor(
    private readonly inner: Overlay,
    private readonly initial = { w: 110, h: 32 },
    private readonly controls?: {
      busy?(): boolean;
      showTitle?(): boolean;
      preview?(grid: Grid, theme: ThemeColors, x: number, y: number): void;
      fold(): void;
      close(): void;
      menu(x: number, y: number): void;
      drop(x: number, y: number, canLeave?: () => boolean): void;
    },
    private readonly options: { maximize?: boolean } = {},
  ) {}
  private toggleMaximize() {
    if (!this.rect) return;
    if (this.maximized) {
      this.rect = this.restore ? { ...this.restore } : this.rect;
      this.maximized = false;
      this.clamp();
    } else {
      this.restore = { ...this.rect };
      this.rect = { x: 0, y: 0, w: this.screen.w, h: this.screen.h };
      this.maximized = true;
    }
    this.custom = true;
    this.drag = null;
  }
  cancelInteraction(): void {
    this.inner.cancelInteraction?.();
    if (!this.drag) return;
    this.rect = { ...this.drag.rect };
    this.custom = this.drag.custom;
    this.maximized = this.drag.maximized;
    this.drag = null;
    this.pointer = null;
  }
  private clamp() {
    if (!this.rect) return;
    const r = this.rect;
    r.w = Math.min(this.screen.w, Math.max(Math.min(24, this.screen.w), r.w));
    r.h = Math.min(this.screen.h, Math.max(Math.min(8, this.screen.h), r.h));
    r.x = Math.max(0, Math.min(r.x, this.screen.w - r.w));
    r.y = Math.max(0, Math.min(r.y, this.screen.h - r.h));
  }
  handleKey(k: KeyInput) {
    if (this.controls?.busy?.()) return;
    if (this.options.maximize && k.alt && k.key === "Enter") {
      this.toggleMaximize();
      return;
    }
    if (this.drag && k.key === "Escape") {
      this.rect = { ...this.drag.rect };
      this.custom = this.drag.custom;
      this.maximized = this.drag.maximized;
      this.drag = null;
      this.pointer = null;
      this.clamp();
      return;
    }
    if (k.alt && !k.ctrl && !k.meta && /^Arrow(Left|Right|Up|Down)$/.test(k.key) && this.rect) {
      this.custom = true;
      this.maximized = false;
      const dx = k.key === "ArrowLeft" ? -2 : k.key === "ArrowRight" ? 2 : 0;
      const dy = k.key === "ArrowUp" ? -1 : k.key === "ArrowDown" ? 1 : 0;
      if (k.shift) {
        this.rect.x += dx;
        this.rect.y += dy;
      } else {
        this.rect.w += dx;
        this.rect.h += dy;
      }
      this.clamp();
      return;
    }
    if (k.key === "Escape" && this.controls) {
      if (this.inner.canLeave?.() !== false) this.controls.close();
      return;
    }
    this.inner.handleKey(k);
  }
  handleKeyEvent(ev: { key: KeyInput; raw: string }) {
    if (this.controls?.busy?.()) return;
    if (
      (this.controls && ev.key.key === "Escape") ||
      this.drag ||
      (this.options.maximize && ev.key.alt && ev.key.key === "Enter") ||
      (ev.key.alt && /^Arrow(Left|Right|Up|Down)$/.test(ev.key.key))
    )
      this.handleKey(ev.key);
    else if (this.inner.handleKeyEvent) this.inner.handleKeyEvent(ev);
    else this.inner.handleKey(ev.key);
  }
  handlePaste(text: string) {
    if (this.controls?.busy?.()) return;
    this.inner.handlePaste?.(text);
  }
  handleMouse(ev: OverlayMouse): boolean {
    if (this.controls?.busy?.()) return true;
    if (!this.rect) return true;
    if (this.drag) {
      if (ev.action === "move") {
        const d = this.drag;
        this.pointer = { x: ev.x, y: ev.y };
        d.moved ||= Math.abs(ev.x - d.x) + Math.abs(ev.y - d.y) >= 2;
        this.rect = { ...d.rect };
        if (d.resize) {
          const dx = ev.x - d.x,
            dy = ev.y - d.y;
          if (d.left) {
            this.rect.x = Math.max(
              0,
              Math.min(d.rect.x + dx, d.rect.x + d.rect.w - Math.min(24, this.screen.w)),
            );
            this.rect.w = d.rect.x + d.rect.w - this.rect.x;
          } else if (d.horizontal) this.rect.w += dx;
          if (d.top) {
            this.rect.y = Math.max(
              0,
              Math.min(d.rect.y + dy, d.rect.y + d.rect.h - Math.min(8, this.screen.h)),
            );
            this.rect.h = d.rect.y + d.rect.h - this.rect.y;
          } else if (d.vertical) this.rect.h += dy;
        } else {
          this.rect.x += ev.x - d.x;
          this.rect.y += ev.y - d.y;
        }
        this.custom = true;
        this.maximized = false;
        this.clamp();
      }
      if (ev.action === "up") {
        if (this.drag.dock && this.drag.moved && this.inner.canLeave?.() !== false)
          this.controls?.drop(ev.x, ev.y, () => this.inner.canLeave?.() !== false);
        this.drag = null;
        this.pointer = null;
      }
      return true;
    }
    const r = this.rect;
    if (this.inner.handleScrollMouse?.({ ...ev, x: ev.x - r.x, y: ev.y - r.y })) return true;
    if (ev.x < r.x || ev.x >= r.x + r.w || ev.y < r.y || ev.y >= r.y + r.h) return true;
    if (
      this.options.maximize &&
      ev.action === "down" &&
      ev.button === 0 &&
      ev.y === r.y + 1 &&
      ev.x >= r.x + r.w - 6 &&
      ev.x < r.x + r.w - 3
    ) {
      this.toggleMaximize();
      return true;
    }
    if (this.controls && ev.action === "down" && ev.y === r.y + 1) {
      if (this.inner.canLeave?.() === false) return true;
      if (ev.button === 2) {
        this.controls.menu(ev.x, ev.y);
        return true;
      }
      const button = viewHeaderButtons({ x: r.x + 1, y: r.y + 1, w: r.w - 3, h: 1 }).find(
        (b) => ev.x >= b.x && ev.x < b.x + b.w,
      );
      if (ev.button === 0 && button) {
        if (button.action === "close") this.controls.close();
        else if (button.action === "fold") this.controls.fold();
        else this.controls.menu(button.x, r.y + 2);
        return true;
      }
    }
    // innerは1セルの余白を持つ仮想画面に描く。
    const left = ev.x === r.x + 1,
      right = ev.x === r.x + r.w - 2;
    const top = ev.y === r.y + 1 && (left || right),
      bottom = ev.y === r.y + r.h - 2;
    const corner = ev.x >= r.x + r.w - 3 && ev.x <= r.x + r.w - 2 && bottom;
    const resize = left || right || top || bottom;
    const dock = !!this.controls && ev.y === r.y + 1 && ev.x >= r.x + 2 && ev.x < r.x + 4;
    const move = ev.y === r.y + 1 && ev.x >= r.x + 1 && ev.x < r.x + r.w - 1;
    if (ev.action === "down" && ev.button === 0 && (resize || move)) {
      this.drag = {
        x: ev.x,
        y: ev.y,
        rect: { ...r },
        resize,
        moved: false,
        custom: this.custom,
        maximized: this.maximized,
        dock,
        left,
        top,
        horizontal: left || right || corner,
        vertical: top || bottom,
      };
      return true;
    }
    this.inner.handleMouse?.({ ...ev, x: ev.x - r.x, y: ev.y - r.y });
    return true;
  }
  render(ctx: OverlayRenderContext) {
    this.screen = { w: ctx.grid.w, h: ctx.grid.h };
    if (this.maximized) this.rect = { x: 0, y: 0, w: ctx.grid.w, h: ctx.grid.h };
    if (!this.rect || !this.custom)
      this.rect = {
        x: Math.floor((ctx.grid.w - Math.min(this.initial.w, ctx.grid.w)) / 2),
        y: Math.floor((ctx.grid.h - Math.min(this.initial.h, ctx.grid.h)) / 2),
        w: Math.min(this.initial.w, ctx.grid.w),
        h: Math.min(this.initial.h, ctx.grid.h),
      };
    this.clamp();
    const r = this.rect;
    const grid = new Grid(r.w, r.h);
    const cursor = this.inner.render({
      grid,
      theme: ctx.theme,
      showTitle: this.controls?.showTitle?.() ?? true,
    });
    // 空白の仮想画面全体を塗らず、overlayが描いたセルだけを写す。
    for (let y = 0; y < grid.h; y++)
      for (let x = 0; x < grid.w; x++) {
        const i = y * grid.w + x;
        if (grid.fg[i] === 0 && grid.bg[i] === 0 && grid.ch[i] === " ") continue;
        if (grid.width[i] === 0) continue;
        const cell = grid.cell(x, y);
        ctx.grid.set(r.x + x, r.y + y, cell.ch, cell.width as 1 | 2, cell.fg, cell.bg, cell.attrs);
      }
    if (this.controls) {
      const row = r.y + 1;
      for (let x = r.w - 3; x >= 4; x--) {
        const cell = grid.cell(x - 2, 1);
        if (cell.width === 0) continue;
        ctx.grid.set(r.x + x, row, cell.ch, cell.width, cell.fg, cell.bg, cell.attrs);
      }
      ctx.grid.text(
        r.x + 2,
        row,
        "⠿ ",
        ctx.theme.ui("--soda-fg"),
        ctx.theme.ground("--soda-bg"),
        0,
        Math.max(0, r.w - 4),
      );
    }
    if (this.controls)
      for (const button of viewHeaderButtons({ x: r.x + 1, y: r.y + 1, w: r.w - 3, h: 1 }))
        ctx.grid.text(
          button.x,
          button.y,
          button.text,
          ctx.theme.ui("--soda-fg"),
          ctx.theme.ground("--soda-bg"),
          0,
          button.w,
        );
    if (this.options.maximize)
      ctx.grid.text(
        r.x + r.w - 6,
        r.y + 1,
        this.maximized ? "[▣]" : "[□]",
        ctx.theme.ui("--soda-fg"),
        ctx.theme.ground("--soda-bg"),
        0,
        3,
      );
    if (this.drag?.moved && this.drag.dock && this.pointer)
      this.controls?.preview?.(ctx.grid, ctx.theme, this.pointer.x, this.pointer.y);
    return cursor ? { ...cursor, x: cursor.x + r.x, y: cursor.y + r.y } : null;
  }
  cancel() {
    this.inner.cancel();
  }
  dispose() {
    this.inner.dispose?.();
  }
}
