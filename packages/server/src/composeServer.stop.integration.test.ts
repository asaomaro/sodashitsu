import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTempDir } from "./persist/atomicFile.js";
import { STATE_DIR_LOCK_FILE } from "./persist/StateDirLock.js";
import { composeServerOnFreePort } from "./composeServerOnFreePort.js";
import type { ComposedServer } from "./composeServer.js";
import { askSocket } from "./handoff/handoffCommand.js";
import { handoffSocketPathFor } from "./handoff/HandoffSocket.js";

/**
 * 止める指示（`soda session stop`。20260927-session-stop の T2）を、実物の `composeServer` と実物の制御の socket（`handoff.sock`）で確かめる。
 * `main.ts` の停止の手順は `serveShutdown.test.ts`、ビルドした `soda` の通しは smoke（`stopSmoke.ts`）。
 */
vi.setConfig({ testTimeout: 20_000 });

describe.skipIf(process.platform === "win32")("composeServer: 止める指示（T2）", () => {
  const cleanups: (() => Promise<unknown> | unknown)[] = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  async function start(
    internal?: Parameters<typeof composeServerOnFreePort>[1] extends infer O
      ? O extends { internal?: infer I }
        ? I
        : never
      : never,
  ): Promise<{ server: ComposedServer; stateDir: string; sock: string }> {
    const stateDir = await makeTempDir("soda-stop-compose-");
    cleanups.push(() =>
      rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
    );
    const server = await composeServerOnFreePort(
      { host: "127.0.0.1", stateDir, origin: [] },
      { internal },
    );
    let closed = false;
    const close = server.close.bind(server);
    server.close = async () => {
      if (closed) return;
      closed = true;
      await close();
    };
    cleanups.push(() => server.close());
    return { server, stateDir, sock: handoffSocketPathFor(stateDir) };
  }

  const ask = async (sock: string, op: string): Promise<unknown> =>
    JSON.parse(await askSocket(sock, JSON.stringify({ op }), 5000));

  it("止める指示に pid で答えてから、登録した停止を 1 回だけ呼ぶ。止まる途中の指示は alreadyStopping、引き継ぎは busy。閉じ終えるとロックが無く session.json がある", async () => {
    const { server, stateDir, sock } = await start();
    let closing: Promise<void> | undefined;
    const followUps: unknown[] = [];
    let calls = 0;
    server.onStopRequest(() => {
      calls++;
      // 後続の 2 本は close() より先に繋ぎ始める——接続を受け付けてからでないと close() の最後の socket の close と競合する。サーバがその行を
      // 読むのは close() の最初（同期）で止まる途中の印を立てた後。close() は受け付けた接続の終わりを待つ（止まる途中も socket はロックを放す直前まで開いている）。
      const followUp = Promise.all([ask(sock, "stop"), ask(sock, "handoff")]).then(
        (r) => void followUps.push(...r),
        (err: unknown) => void followUps.push(`failed: ${String(err)}`),
      );
      // main.ts の停止の手順と同じく close() を始める。
      closing = server.close().then(() => followUp);
    });
    expect(await ask(sock, "stop")).toEqual({
      ok: true,
      pid: process.pid,
      alreadyStopping: false,
    });
    const deadline = Date.now() + 10_000;
    while (closing === undefined && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 20));
    await closing;
    expect(calls).toBe(1);
    expect(followUps).toEqual([
      { ok: true, pid: process.pid, alreadyStopping: true },
      { ok: false, reason: "stopping", message: "the server is stopping" },
    ]);
    expect(existsSync(join(stateDir, STATE_DIR_LOCK_FILE))).toBe(false);
    expect(existsSync(sock)).toBe(false);
    expect(existsSync(join(stateDir, "session.json"))).toBe(true);
  });

  it("停止を登録していなければ unsupported で断り、サーバは動き続ける（ロックを持ったまま）", async () => {
    const { stateDir, sock } = await start();
    expect(await ask(sock, "stop")).toMatchObject({ ok: false, reason: "unsupported" });
    expect(existsSync(join(stateDir, STATE_DIR_LOCK_FILE))).toBe(true);
    // status は今までどおり答える
    expect(await ask(sock, "status")).toEqual({ lastHandoff: null });
  });

  it("Ctrl+C の経路（close() を直接呼ぶ）の途中に届いた止める指示は alreadyStopping で、停止の入口を呼ばない", async () => {
    const { server, sock } = await start();
    let calls = 0;
    server.onStopRequest(() => calls++);
    const answer = ask(sock, "stop"); // close() より先に繋ぎ始める（上と同じ理由）
    const closing = server.close();
    expect(await answer).toEqual({
      ok: true,
      pid: process.pid,
      alreadyStopping: true,
    });
    await closing;
    expect(calls).toBe(0);
  });

  it.skipIf(process.platform !== "linux" || typeof process.execve !== "function")(
    "引き継ぎの最中に close()（Ctrl+C）が始まったら、引き継ぎが終わる（元に戻す）まで保存もロックの解放もしない（decisions D9）",
    async () => {
      let releasePreflight: () => void = () => undefined;
      const preflight = new Promise<{ ok: false; message: string }>((resolve) => {
        releasePreflight = () => resolve({ ok: false, message: "held by the test" });
      });
      const { server, stateDir, sock } = await start({ handoffPreflight: () => preflight });
      const paneId = server.session.snapshot().panes[0]!.id;
      const handoffAnswer = ask(sock, "handoff"); // preflight で止まる（受け付け済みの引き継ぎ）
      await new Promise((r) => setTimeout(r, 200));
      let closed = false;
      const closing = server.close().then(() => {
        closed = true;
      });
      await new Promise((r) => setTimeout(r, 300));
      expect(closed).toBe(false);
      // 停止の本体（poller の停止・保存・端末の破棄・ロックの解放）はまだ始まっていない
      expect(server.terminals.get(paneId)).toBeDefined();
      expect(existsSync(join(stateDir, STATE_DIR_LOCK_FILE))).toBe(true);
      releasePreflight();
      expect(await handoffAnswer).toMatchObject({ ok: false, reason: "preflight_failed" });
      await closing;
      expect(server.terminals.get(paneId)).toBeUndefined();
      expect(existsSync(join(stateDir, "session.json"))).toBe(true);
      expect(existsSync(join(stateDir, STATE_DIR_LOCK_FILE))).toBe(false);
    },
  );
});
