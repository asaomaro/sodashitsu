import type { TuiIo, TuiTarget } from "../types.js";
import { TerminalModes } from "./terminalModes.js";

/**
 * 端末版の組み立て（20260927-cli-mode の architecture「tui」の `app/TuiApp.ts`）。外側の端末のモードの有効化と、どの終わり方でも
 * 戻すことを受け持つ（終了・シグナル・例外・プロセスの `exit`）。
 */
export class TuiApp {
  private readonly modes: TerminalModes;
  private readonly disposers: (() => void)[] = [];
  private ended = false;
  private resolveExit: (code: number) => void = () => undefined;

  constructor(
    readonly target: TuiTarget,
    readonly io: TuiIo,
  ) {
    this.modes = new TerminalModes(io);
  }

  run(): Promise<number> {
    if (!this.io.isTTY) {
      this.io.writeError("soda: the terminal UI needs a terminal on both stdin and stdout\n");
      return Promise.resolve(1);
    }
    const done = new Promise<number>((resolve) => {
      this.resolveExit = resolve;
    });
    // 初回の token など（ブラウザ用。二度と出ない）は、代替画面に入る前に標準エラーへ（design「起動と終了」）。
    if (this.target.startupNotice) this.io.writeError(`${this.target.startupNotice}\n`);
    this.disposers.push(this.io.onExit(() => this.modes.restore()));
    this.disposers.push(this.io.onSignal(() => this.detach()));
    this.disposers.push(
      this.io.onFatal((err) => this.finish(1, `soda: unexpected error: ${describeError(err)}\n`)),
    );
    try {
      this.modes.enable(true);
      this.start();
    } catch (err) {
      this.finish(1, `soda: ${describeError(err)}\n`);
    }
    return done;
  }

  /** 画面の部品の組み立て（T2 以降で中身を足す）。 */
  protected start(): void {}

  /** 切り離し（`prefix+q`・SIGHUP・SIGTERM）。サーバとエージェントは動き続ける。 */
  detach(): void {
    this.finish(0);
  }

  /** 1 回だけ：後始末 → モードを戻す → 案内 → 終了コードを返す。 */
  finish(code: number, message?: string): void {
    if (this.ended) return;
    this.ended = true;
    for (const dispose of this.disposers.splice(0).reverse()) {
      try {
        dispose();
      } catch {
        // 後始末の失敗で、モードを戻すのを止めない。
      }
    }
    this.modes.restore();
    if (message) this.io.writeError(message);
    this.resolveExit(code);
  }
}

export function describeError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
}
