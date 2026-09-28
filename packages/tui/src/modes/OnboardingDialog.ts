import type { KeyInput } from "@sodashitsu/client-core";
import { ATTR } from "../render/color.js";
import type { CursorState, Rect } from "../render/Screen.js";
import { stringWidth } from "../render/width.js";
import {
  centeredRect,
  dialogColors,
  drawBox,
  hiddenCursor,
  inside,
  isEnter,
  type Overlay,
  type OverlayMouse,
  type OverlayRenderContext,
} from "./overlay.js";

export interface OnboardingDeps {
  /** prefix のキー（`ctrl+b` 等）。 */
  prefix(): string;
  /** キー割り当ての一覧・設定を開くキーの案内（割り当てが無ければ null）。 */
  hintFor(id: "help" | "settings"): string | null;
  /** 確定した（案内済みにして設定画面を開く）。 */
  complete(): void;
}

/**
 * はじめの案内（H25b。herdr の onboarding のはじめの画面：`client/shell/overlays.rs` の `render_onboarding_overlay` と
 * `overlay_input.rs` の `route_overlay_key`・`complete_onboarding`）。Enter・→・`l`・［はじめる］で確定し、案内済み（共有の設定 `onboarding: false`）に
 * して設定画面を開く。herdr と同じく Esc・外側のクリックでは閉じない（初回の案内を誤って消費しない）。
 */
export class OnboardingDialog implements Overlay {
  private rect: Rect | null = null;
  private button: Rect | null = null;

  constructor(private readonly deps: OnboardingDeps) {}

  handleKey(k: KeyInput): void {
    if (isEnter(k) || k.key === "ArrowRight" || (k.key === "l" && !k.ctrl && !k.alt))
      this.deps.complete();
  }

  handleMouse(ev: OverlayMouse): boolean {
    if (!inside(this.rect, ev.x, ev.y)) return true; // 外側を押しても閉じない
    if (ev.action === "down" && ev.button === 0 && inside(this.button, ev.x, ev.y))
      this.deps.complete();
    return true;
  }

  /** 閉じない（herdr と同じ）。 */
  cancel(): void {}

  /** 本文の行（テストが読む）。 */
  lines(): string[] {
    const help = this.deps.hintFor("help");
    const settings = this.deps.hintFor("settings");
    return [
      "マウスで操作できる端末です。",
      "サイドバーを押して workspace を切り替え、pane の境界をドラッグして",
      "大きさを変え、右クリックでメニューを開きます。",
      "",
      `${this.deps.prefix()} で prefix モード · ${help ?? "prefix の後の ?"} でキー割り当て`,
      settings ? `${settings} で設定を開きます。` : "設定はメニューの「設定」から開きます。",
      "次に：設定の「エージェント連携」で、状態をより確かに取れます。",
    ];
  }

  render({ grid, theme }: OverlayRenderContext): CursorState {
    const c = dialogColors(theme);
    const lines = this.lines();
    const width = Math.min(72, grid.w - 2);
    const r = centeredRect(grid, width, lines.length + 7);
    this.rect = r;
    const inner = drawBox(grid, r, c);
    grid.text(inner.x, inner.y, "Sodashitsu（操舵室）", c.fg, c.bg, ATTR.bold, inner.w);
    grid.text(
      inner.x,
      inner.y + 1,
      "コーディングエージェントのための端末の作業場",
      c.dim,
      c.bg,
      0,
      inner.w,
    );
    lines.forEach((l, i) => grid.text(inner.x, inner.y + 3 + i, l, c.fg, c.bg, 0, inner.w));
    const label = " ↵ はじめる ";
    const bw = stringWidth(label);
    const by = inner.y + inner.h - 1;
    const bx = inner.x + Math.max(0, inner.w - bw);
    grid.text(bx, by, label, c.accentFg, c.accent, ATTR.bold, inner.w);
    this.button = { x: bx, y: by, w: bw, h: 1 };
    return hiddenCursor();
  }
}
