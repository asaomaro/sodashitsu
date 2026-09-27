import * as nodePty from "node-pty";
import type { Disposable, PtyBackend, PtyProcess, PtySpawnOptions } from "./PtyBackend.js";

/**
 * node-pty 1.2.0-beta.15 での実装（research.md F8.1）。
 * Windows では既定で同梱の ConPTY（`useConptyDll: true`）を使う。古い system ConPTY は
 * Kitty keyboard のシーケンスを落とすため（`[H]windows-beta.mdx:106-108`）。
 * `WTM_WINDOWS_CONPTY=system` で OS 付属の ConPTY に戻せる（herdr の `HERDR_WINDOWS_CONPTY=system` と同じ考え方）。
 */
export class NodePtyBackend implements PtyBackend {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  spawn(opts: PtySpawnOptions): PtyProcess {
    const isWindows = process.platform === "win32";
    const useConptyDll = isWindows && this.env["WTM_WINDOWS_CONPTY"] !== "system";
    const pty = nodePty.spawn(opts.shell, opts.args, {
      name: "xterm-256color",
      cols: opts.cols,
      rows: opts.rows,
      cwd: opts.cwd,
      env: opts.env,
      ...(isWindows ? { useConptyDll } : {}),
    });
    return new NodePtyProcess(pty);
  }
}

class NodePtyProcess implements PtyProcess {
  constructor(private readonly pty: nodePty.IPty) {}

  get pid(): number {
    return this.pty.pid;
  }

  onData(cb: (chunk: string) => void): Disposable {
    return this.pty.onData(cb);
  }

  onExit(cb: (e: { exitCode: number; signal?: number }) => void): Disposable {
    return this.pty.onExit(cb);
  }

  write(data: string | Uint8Array): void {
    // node-pty の write は string | Buffer を受ける。Uint8Array は Buffer のビューにして渡す。
    this.pty.write(typeof data === "string" ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  }

  resize(cols: number, rows: number, pixels?: { width: number; height: number }): void {
    // ConPTY は 0 を渡すと落ちることがある（node-pty #877）ので、下限 1 に丸める。画素は node-pty が Unix で `ws_xpixel`/`ws_ypixel` に入れる
    // （Windows は無視する。node-pty の型定義 `resize(columns, rows, pixelSize?)`）。
    if (pixels) this.pty.resize(Math.max(1, cols), Math.max(1, rows), pixels);
    else this.pty.resize(Math.max(1, cols), Math.max(1, rows));
  }

  pause(): void {
    this.pty.pause();
  }

  resume(): void {
    this.pty.resume();
  }

  kill(): void {
    this.pty.kill();
  }
}
