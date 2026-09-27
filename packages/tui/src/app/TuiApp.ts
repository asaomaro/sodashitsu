import type { ConnectionState, TerminalSinkPort } from "@sodashitsu/client-core";
import { SessionModel } from "../model/SessionModel.js";
import { TuiNet, type TuiNetDeps } from "../net/TuiNet.js";
import type { TuiIo, TuiTarget } from "../types.js";
import { TerminalModes } from "./terminalModes.js";

export interface TuiAppOptions {
  /** 接続の差し替え（テスト用）。 */
  net?: TuiNetDeps;
}

/**
 * 端末版の組み立て（20260927-cli-mode の architecture「tui」の `app/TuiApp.ts`）。外側の端末のモードの有効化と、どの終わり方でも
 * 戻すことを受け持つ（終了・シグナル・例外・プロセスの `exit`）。
 */
export class TuiApp {
  private readonly modes: TerminalModes;
  private readonly disposers: (() => void)[] = [];
  private ended = false;
  private detaching = false;
  private resolveExit: (code: number) => void = () => undefined;

  readonly model: SessionModel;
  protected net: TuiNet | null = null;
  connectionState: ConnectionState = "connecting";

  constructor(
    readonly target: TuiTarget,
    readonly io: TuiIo,
    protected readonly options: TuiAppOptions = {},
  ) {
    this.modes = new TerminalModes(io);
    this.model = new SessionModel();
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

  /** 画面の部品の組み立て。 */
  protected start(): void {
    const net = new TuiNet(
      this.target,
      {
        model: this.model,
        sink: this.sink(),
        onState: (s) => this.onConnectionState(s),
        onOpened: (clientId) => this.onConnectionOpened(clientId),
        onClosed: () => this.onConnectionClosed(),
        onFatal: (message) => this.finish(1, message),
      },
      this.options.net,
    );
    this.net = net;
    this.disposers.push(() => net.stop());
    void net.start();
  }

  /** pane の出力の受け口（T3 で pane の headless へ）。 */
  protected sink(): TerminalSinkPort {
    return {
      onOutput: () => undefined,
      onSnapshot: () => undefined,
      onSizeChanged: () => undefined,
    };
  }

  protected onConnectionState(s: ConnectionState): void {
    this.connectionState = s;
    // サーバが閉じた `client.detach` の後（自分で切り離した）。
    if (s === "detached") this.finish(0);
  }

  protected onConnectionOpened(_clientId: string): void {}

  protected onConnectionClosed(): void {}

  /** 切り離し（`prefix+q`・SIGHUP・SIGTERM・SIGINT）。`client.detach` を送れるなら送る。サーバとエージェントは動き続ける。 */
  detach(): void {
    if (this.detaching || this.ended) return;
    this.detaching = true;
    const net = this.net;
    if (!net || this.connectionState !== "open") {
      this.finish(0);
      return;
    }
    void net.detach().then(() => this.finish(0));
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

  get isEnded(): boolean {
    return this.ended;
  }
}

export function describeError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
}
