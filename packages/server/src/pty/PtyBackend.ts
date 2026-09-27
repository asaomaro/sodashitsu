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
  resize(cols: number, rows: number): void;
  /** E4。ミラーの処理が遅れたときに PTY 自体を止める（design「流量制御」）。 */
  pause(): void;
  resume(): void;
  kill(): void;
  /**
   * 更新時の引き継ぎ（20260926-live-handoff）で新しい版へ渡す PTY の master の fd。渡せない実装（Windows の ConPTY・テストの偽物）は
   * 持たないか undefined を返す。
   */
  handoffFd?(): number | undefined;
  /** 引き継ぎの前に読み取りを止め、読み取り済みの分を `onData` へ流し切る（止められなければ false）。`socketReading.ts`。 */
  holdReading?(): boolean;
  /** `holdReading` を戻す（一時停止は解かない。呼び出し側が `resume` する）。 */
  releaseReading?(): void;
}

export interface PtyBackend {
  spawn(opts: PtySpawnOptions): PtyProcess;
  /** execve をまたいで引き継いだ PTY の master の fd から作る（Unix だけ。20260926-live-handoff）。 */
  adopt?(opts: { fd: number; pid: number }): PtyProcess;
}
