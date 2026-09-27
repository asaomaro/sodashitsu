import type { Disposable } from "../util/Disposable.js";
export type { Disposable };

export interface PtySpawnOptions {
  shell: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  cols: number;
  rows: number;
}

/** design.md「PTY（node-pty）」・architecture.md「PtyBackend」interface。差し替え点（D9）。 */
export interface PtyProcess {
  readonly pid: number;
  onData(cb: (chunk: string) => void): Disposable;
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): Disposable;
  write(data: string | Uint8Array): void;
  /**
   * `pixels` は端末の文字の領域の画素の大きさ（20260926-kitty-graphics design「5.」）。Unix では `TIOCGWINSZ` の `ws_xpixel`/`ws_ypixel` になる
   * （画像を出すツールが読む）。Windows（ConPTY）は無視する。
   */
  resize(cols: number, rows: number, pixels?: { width: number; height: number }): void;
  /** E4。ミラーの処理が遅れたときに PTY 自体を止める（design「流量制御」）。 */
  pause(): void;
  resume(): void;
  kill(): void;
}

export interface PtyBackend {
  spawn(opts: PtySpawnOptions): PtyProcess;
}
