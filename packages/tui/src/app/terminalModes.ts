import type { TuiIo } from "../types.js";

/**
 * 外側の端末のモードの有効化と復元（20260927-cli-mode の design「起動と終了」・「ドメイン固有の考慮」）。
 * 復元の列は `packages/cli/src/commands/attach.ts` の `RESTORE_SCREEN` を写し、端末版が有効にするもの（同期出力・カーソルの形）を足した。
 * cli は変えない（design の対象範囲）。
 */

/** マウスの報告（ボタンとドラッグ＋SGR の符号化）。`tui.mouseCapture` が偽なら出さない。 */
export const ENABLE_MOUSE = "\x1b[?1000h\x1b[?1002h\x1b[?1006h";

/** 代替画面・画面の消去・カーソルを隠す・ブラケットペースト・フォーカスの報告。 */
export function enterSequence(mouse: boolean): string {
  return "\x1b[?1049h\x1b[H\x1b[2J\x1b[?25l\x1b[?2004h\x1b[?1004h" + (mouse ? ENABLE_MOUSE : "");
}

/**
 * pane・端末版が変えたかもしれない端末のモードを戻し、最後に代替画面から出る。色・カーソルの表示と形・スクロール領域・自動折り返し・
 * 原点モード・文字集合・マウスの報告・フォーカスの報告・ブラケットペースト・カーソルキー／キーパッド・同期出力。
 */
export const RESTORE_SEQUENCE =
  "\x1b[?2026l" +
  // スクロール領域の解除（CSI r）はカーソルを左上へ動かすので、カーソルの退避（ESC 7）と復帰（ESC 8）で挟む。
  "\x1b[0m\x1b[?25h\x1b[0 q\x1b7\x1b[r\x1b8\x1b[?7h\x1b[?6l\x1b(B" +
  "\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1005l\x1b[?1006l\x1b[?1015l\x1b[?1016l" +
  "\x1b[?1004l\x1b[?2004l\x1b[?1l\x1b>" +
  "\x1b[?1049l";

/**
 * 有効にしたモードを、どの終わり方でも 1 回だけ戻す（終了・シグナル・例外・プロセスの `exit`）。
 * 書けない（端末が先に閉じた。SIGHUP 等）ときの失敗は握りつぶす——戻すものも無い。
 */
export class TerminalModes {
  private enabled = false;
  private rawMode = false;

  constructor(private readonly io: TuiIo) {}

  get active(): boolean {
    return this.enabled;
  }

  enable(mouse: boolean): void {
    if (this.enabled) return;
    this.enabled = true;
    this.io.setRawMode(true);
    this.rawMode = true;
    this.io.write(enterSequence(mouse));
  }

  restore(): void {
    if (!this.enabled) return;
    this.enabled = false;
    try {
      this.io.write(RESTORE_SEQUENCE);
    } catch {
      // 書けなければ戻すものも無い。
    }
    try {
      if (this.rawMode) this.io.setRawMode(false);
    } catch {
      // 同上。
    }
    this.rawMode = false;
  }
}
