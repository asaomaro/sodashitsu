/**
 * `wtm serve` の停止の手順（`main.ts` の `runServe` から切り出した。20260927-session-stop の design「`serveShutdown.ts`」・decisions D4・D6）。
 * `main.ts` は読み込むと起動するので単体テストできず、止める指示（`wtm session stop`）の冪等をテストで確かめるためにここへ分けた。
 *
 * 入口は 2 つで、どちらも同じ手順（token の表示 → 起動の途中なら待つ → `close()` → 終了コード 0／失敗は 1）を通る:
 * - `signal(s)`: 終了のシグナル（SIGINT・SIGTERM・SIGHUP）。**止まる途中にもう一度受けたら待たずに終わる**（終了コード 1。以前からの挙動）。
 *   止める指示で始まった停止も「1 回目」として数える（止める指示の後の Ctrl+C は待たずに終わる。decisions D6）。
 * - `stopRequest()`: 制御の socket の止める指示。**止まる途中なら何もしない**（2 回目の `wtm session stop` で停止を打ち切らない。AC7）。
 */
export interface ShutdownDeps {
  /** サーバを閉じる（`ComposedServer.close()`。`session.json` の保存・画面履歴の保存・ロックの解放）。 */
  close(): Promise<void>;
  /** 起動の途中なら、その Promise（`listen()`）。終えてから閉じる（`close()` と `listen()` を並行させない）。 */
  startup(): Promise<void> | undefined;
  /** まだ表示していない token を表示する（閉じる前・閉じる途中の両方で呼ぶ）。 */
  showTokenIfUnshown(): void;
  log(line: string): void;
  /** `console.error` と同じく、渡した引数をそのまま出す（停止の失敗では原因を 2 つ目に渡す）。 */
  error(line: string, ...rest: unknown[]): void;
  exit(code: number): void;
}

export interface Shutdown {
  signal(signal: NodeJS.Signals): void;
  stopRequest(): void;
  readonly shuttingDown: boolean;
}

export function createShutdown(deps: ShutdownDeps): Shutdown {
  let shuttingDown = false;
  const begin = (message: string): void => {
    shuttingDown = true;
    deps.log(message);
    void (async () => {
      await deps.startup()?.catch(() => undefined);
      deps.showTokenIfUnshown(); // 起動の途中で作った token（まだ表示していなければ）
      // close() は session.json を書き終えてから状態ディレクトリのロック（wtm.lock）を放す（失敗しても放す。D103）。
      await deps.close();
    })().then(
      () => deps.exit(0),
      (err: unknown) => {
        deps.error("wtm: error during shutdown", err);
        deps.exit(1);
      },
    );
  };
  return {
    get shuttingDown(): boolean {
      return shuttingDown;
    },
    signal(signal: NodeJS.Signals): void {
      deps.showTokenIfUnshown();
      if (shuttingDown) {
        deps.error(`wtm: received ${signal} again, exiting without waiting`);
        deps.exit(1);
        return;
      }
      begin(`wtm: received ${signal}, shutting down`);
    },
    stopRequest(): void {
      if (shuttingDown) return;
      deps.showTokenIfUnshown();
      begin("wtm: stop requested (wtm session stop), shutting down");
    },
  };
}
