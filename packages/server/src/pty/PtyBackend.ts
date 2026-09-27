import type { Disposable } from "../util/Disposable.js";
export type { Disposable };

export interface PtySpawnOptions {
  shell: string;
  /**
   * 引数。**文字列は Windows の 1 本のコマンドライン**（node-pty はそのまま使い、引用し直さない。独自コマンドの `cmd.exe /d /s /c "<command>"`。
   * 20260927-custom-command-keys の review ラウンド 1）。
   */
  args: string[] | string;
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
   * `write` で受けたがまだ PTY へ書けていないバイト数（20260927-server-size-input-limits）。pane のプログラムが入力を読まない（raw モードで
   * 固まった TUI 等）と増え続けるので、`TerminalHost.writeInput` が上限の判定に使う。測れない実装は持たないか undefined を返す（捨てない側に倒す）。
   */
  pendingWriteBytes?(): number | undefined;
  /**
   * その待ちの件数（`write` 1 回が 1 件。20260927-server-size-input-limits の decisions D9）。1 バイトずつの大量の書き込みはバイト数では小さくても件数ぶんのメモリを使うので、
   * 上限の判定は件数にも手間を掛けて数える。数えられない実装は持たないか undefined（0 とみなす）。どちらも O(1) で返すこと（入力 1 通ごとに呼ぶ）。
   */
  pendingWriteChunks?(): number | undefined;
  /**
   * `pixels` は端末の文字の領域の画素の大きさ（20260926-kitty-graphics design「5.」）。Unix では `TIOCGWINSZ` の `ws_xpixel`/`ws_ypixel` になる
   * （画像を出すツールが読む）。Windows（ConPTY）は無視する。
   */
  resize(cols: number, rows: number, pixels?: { width: number; height: number }): void;
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
