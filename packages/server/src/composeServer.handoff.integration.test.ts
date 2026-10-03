import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { connect as netConnect } from "node:net";
import { join } from "node:path";
import { WriteStream } from "node:tty";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { PANE_OP_ASK_OPEN, type PaneSocketResponse } from "@sodashitsu/protocol";
import { makeTempDir } from "./persist/atomicFile.js";
import { composeServerOnFreePort } from "./composeServerOnFreePort.js";
import type { ComposedServer } from "./composeServer.js";
import {
  HANDOFF_FILE_NAME,
  HANDOFF_FORMAT_VERSION,
  HANDOFF_NONCE_ENV,
  isPtyMaster,
  writeHandoffManifest,
} from "./handoff/HandoffManifest.js";
import { askSocket } from "./handoff/handoffCommand.js";
import { handoffSocketPathFor } from "./handoff/HandoffSocket.js";
import { nodePtyNative } from "./pty/nodePtyNative.js";

/**
 * 新しい版の起動での引き継ぎの受け取り（20260926-live-handoff の T7）を、`composeServer.listen` の配線ごと確かめる。execve はせず、
 * 同じプロセスの中で PTY の組を作って「渡された master」に見立て、`handoff.json` と環境変数を用意してから起動する。
 * execve をまたぐ通しは smoke（`handoffSmoke.ts`）。
 */
vi.setConfig({ testTimeout: 20_000 });

const NONCE = "0123456789abcdef0123456789abcdef";

describe.skipIf(process.platform !== "linux")("composeServer: 引き継ぎの起動（T7）", () => {
  const cleanups: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    delete process.env[HANDOFF_NONCE_ENV];
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  /** 普通に起動して止め、pane を 1 つ持つ session.json を作る。 */
  async function prepared(): Promise<{ stateDir: string; paneId: string }> {
    const stateDir = await makeTempDir("soda-handoff-compose-");
    cleanups.push(() =>
      rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
    );
    const first = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
    const paneId = first.session.snapshot().panes[0]!.id;
    await first.close();
    return { stateDir, paneId };
  }

  /** 渡された PTY に見立てる組（master・slave）と、pane のプロセスに見立てる子。 */
  function fakeHandedOffPty(): { master: number; slave: number; child: ChildProcess } {
    const { master, slave } = nodePtyNative().open(80, 24);
    const child = spawn("sleep", ["60"], { stdio: "ignore" });
    cleanups.push(() => {
      child.kill("SIGKILL");
    });
    return { master, slave, child };
  }

  async function start(stateDir: string): Promise<ComposedServer> {
    const server = await composeServerOnFreePort(
      { host: "127.0.0.1", stateDir, origin: [] },
      { attempts: 1 },
    );
    cleanups.push(() => server.close());
    return server;
  }

  it("渡された PTY を pane の端末にし、前の画面を見せ、入出力が通る。環境変数と handoff.json は消える", async () => {
    const { stateDir, paneId } = await prepared();
    const { master, slave, child } = fakeHandedOffPty();
    await writeHandoffManifest(stateDir, {
      format: HANDOFF_FORMAT_VERSION,
      id: "abcdef01",
      nonce: NONCE,
      pid: process.pid,
      createdAt: new Date().toISOString(),
      port: 1,
      panes: [
        { paneId, fd: master, pid: child.pid!, cols: 80, rows: 24, screen: "OLD-SCREEN-LINE\r\n" },
      ],
      scrollbackEditors: [],
    });
    process.env[HANDOFF_NONCE_ENV] = NONCE;
    const server = await start(stateDir);
    expect(server.handoffResult).toEqual({ id: "abcdef01", adopted: 1, dropped: 0 });
    expect(process.env[HANDOFF_NONCE_ENV]).toBeUndefined();
    expect(existsSync(join(stateDir, HANDOFF_FILE_NAME))).toBe(false);
    const host = server.terminals.get(paneId)!;
    expect(host.pid).toBe(child.pid);
    expect(host.mirror.plainText()).toContain("OLD-SCREEN-LINE");
    const out = new WriteStream(slave);
    cleanups.push(() => {
      out.destroy();
    });
    out.write("from-the-shell\r\n");
    const deadline = Date.now() + 5000;
    while (!host.mirror.plainText().includes("from-the-shell") && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 20));
    expect(host.mirror.plainText()).toContain("from-the-shell");
  });

  it("受け渡しに載らなかった PTY の master（読み取りを止めた後にできた pane 等）は、PTY を開く前に閉じる。受け渡しの master は閉じない", async () => {
    const { stateDir, paneId } = await prepared();
    const { master, child } = fakeHandedOffPty();
    const stray = nodePtyNative().open(80, 24);
    await writeHandoffManifest(stateDir, {
      format: HANDOFF_FORMAT_VERSION,
      id: "abcdef04",
      nonce: NONCE,
      pid: process.pid,
      createdAt: new Date().toISOString(),
      port: 1,
      panes: [{ paneId, fd: master, pid: child.pid!, cols: 80, rows: 24, screen: "" }],
      scrollbackEditors: [],
    });
    process.env[HANDOFF_NONCE_ENV] = NONCE;
    const server = await start(stateDir);
    expect(server.handoffResult).toMatchObject({ adopted: 1, dropped: 0 });
    expect(isPtyMaster(stray.master)).toBe(false); // 閉じた
    expect(isPtyMaster(master)).toBe(true); // 引き継いだ pane の master は開いたまま
    expect(server.terminals.get(paneId)?.pid).toBe(child.pid);
  });

  it("確かめに通らなかった（書いた pid が違う）PTY は、新しいシェルを開く前に手放す——新しいシェルの master を閉じない", async () => {
    const { stateDir, paneId } = await prepared();
    const { master, child } = fakeHandedOffPty();
    await writeHandoffManifest(stateDir, {
      format: HANDOFF_FORMAT_VERSION,
      id: "abcdef02",
      nonce: NONCE,
      pid: process.pid + 1,
      createdAt: new Date().toISOString(),
      port: 1,
      panes: [{ paneId, fd: master, pid: child.pid!, cols: 80, rows: 24, screen: "" }],
      scrollbackEditors: [],
    });
    process.env[HANDOFF_NONCE_ENV] = NONCE;
    const server = await start(stateDir);
    expect(server.handoffResult).toEqual({ id: "abcdef02", adopted: 0, dropped: 1 });
    const host = server.terminals.get(paneId)!;
    expect(host.pid).not.toBe(child.pid);
    // 新しいシェルは生きていて、その master は開いたまま（同じ番号を再利用していても閉じられていない）
    await new Promise((r) => setTimeout(r, 300));
    expect(server.terminals.get(paneId)).toBe(host);
    const fd = (host as unknown as { pty: { handoffFd(): number | undefined } }).pty.handoffFd();
    expect(fd !== undefined && isPtyMaster(fd)).toBe(true);
    expect(child.exitCode).toBeNull(); // 確かめに通らなかった pid にはシグナルを送らない
  });

  it("確かめに通らなかった番号を新しいシェルの master が使っていても、閉じない（手放すのは PTY を開く前）", async () => {
    // 1 回目の起動で pane の master が使った番号を控える（同じ手順の起動は同じ番号を使うことが多い）。
    const stateDir = await makeTempDir("soda-handoff-compose-");
    cleanups.push(() =>
      rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
    );
    const first = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
    const paneId = first.session.snapshot().panes[0]!.id;
    const usedFd = (
      first.terminals.get(paneId) as unknown as { pty: { handoffFd(): number | undefined } }
    ).pty.handoffFd()!;
    await first.close();
    // シェルが終わって node-pty が master を閉じるのを待つ（いまは開いていない番号にする）
    const deadline = Date.now() + 5000;
    while (isPtyMaster(usedFd) && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 20));
    expect(isPtyMaster(usedFd)).toBe(false);
    // その番号を「渡された」ことにする——開いていないので確かめに通らない（rejected）。
    await writeHandoffManifest(stateDir, {
      format: HANDOFF_FORMAT_VERSION,
      id: "abcdef03",
      nonce: NONCE,
      pid: process.pid,
      createdAt: new Date().toISOString(),
      port: 1,
      panes: [{ paneId, fd: usedFd, pid: 999999999, cols: 80, rows: 24, screen: "" }],
      scrollbackEditors: [],
    });
    process.env[HANDOFF_NONCE_ENV] = NONCE;
    const server = await start(stateDir);
    expect(server.handoffResult).toMatchObject({ adopted: 0, dropped: 1 });
    const host = server.terminals.get(paneId)!;
    await new Promise((r) => setTimeout(r, 500));
    expect(server.terminals.get(paneId)).toBe(host); // 新しいシェルは閉じられていない
    const fd = (host as unknown as { pty: { handoffFd(): number | undefined } }).pty.handoffFd();
    expect(fd !== undefined && isPtyMaster(fd)).toBe(true);
  });

  it("環境変数はあるが受け渡しが無い（壊れた）なら、残った PTY の master を閉じて普通に起動する", async () => {
    const { stateDir, paneId } = await prepared();
    const { master } = fakeHandedOffPty();
    process.env[HANDOFF_NONCE_ENV] = NONCE;
    const server = await start(stateDir);
    expect(server.handoffResult).toBeUndefined();
    expect(server.terminals.get(paneId)).toBeDefined(); // 普通の復元
    const log = await readFile(join(stateDir, "server.log"), "utf8").catch(() => "");
    await (server.logger as unknown as { flush(): Promise<void> }).flush();
    const log2 = log + (await readFile(join(stateDir, "server.log"), "utf8"));
    expect(log2).toMatch(/handoff data was unusable.*"closed":[1-9]/);
    void master;
  });
});

/**
 * 引き継ぎの指示の間のログイン不要の受け口（`pane.sock`。20261003-sodactl-ask-socket の T8）。古い版の側の配線（`HandoffController` の依存
 * `closeClients` → `paneSocket.pause()`、`reopenClients` → `paneSocket.resume()`）を、実物の `composeServer` と制御の socket（`handoff.sock`）越しに確かめる。
 * execve はテストの差し替えが投げる（＝元に戻す経路）。「引き継ぎの最中」は、pane の読み取りを止める手順（`/ws` を閉じた後・execve の前）を
 * テストが止めて作る。
 */
describe.skipIf(process.platform === "win32")(
  "composeServer: 引き継ぎの間の pane.sock（20261003-sodactl-ask-socket の T8）",
  () => {
    const cleanups: (() => Promise<unknown> | unknown)[] = [];
    /** テストが置いた `process.execve` の置き場を外す。ほかの後始末が投げても必ず走らせる（置き場を次のテストへ残さない）。 */
    let removeExecvePlaceholder: (() => void) | undefined;
    afterEach(async () => {
      try {
        for (const fn of cleanups.splice(0).reverse()) await fn();
      } finally {
        removeExecvePlaceholder?.();
        removeExecvePlaceholder = undefined;
      }
    });

    /** 受け口へ 1 行送る（sodactl と同じく `write` で送り、半分だけ閉じない）。`closed` は、接続が閉じるまでに受け口が書いたもの。 */
    function send(path: string, paneId: string): Promise<{ closed: Promise<string> }> {
      return new Promise((resolve, reject) => {
        let buf = "";
        const sock = netConnect(path);
        cleanups.push(() => sock.destroy());
        sock.setEncoding("utf8");
        sock.on("data", (chunk: string) => (buf += chunk));
        const closed = new Promise<string>((res) => sock.on("close", () => res(buf)));
        sock.once("error", reject);
        sock.once("connect", () => {
          sock.off("error", reject);
          sock.on("error", () => undefined);
          const spec = { questions: [{ id: "q", label: "q", options: ["a", "b"] }] };
          sock.write(
            `${JSON.stringify({ v: 1, op: PANE_OP_ASK_OPEN, paneId, params: { spec, timeoutMs: 20_000 } })}\n`,
          );
          resolve({ closed });
        });
      });
    }
    const call = async (path: string, paneId: string): Promise<PaneSocketResponse> =>
      JSON.parse(await (await send(path, paneId)).closed) as PaneSocketResponse;

    /** 質問を出せる画面（`/ws` で `ask.subscribe` した desktop）。`opened` は `ask.opened` が届いたら解決する。 */
    async function browser(server: ComposedServer): Promise<{ opened: Promise<void> }> {
      const port = server.options.port;
      const origin = `http://127.0.0.1:${port}`;
      const headers = { origin, host: `127.0.0.1:${port}` };
      const res = await fetch(`${origin}/api/login`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ token: server.freshToken }),
      });
      expect(res.status).toBe(204);
      const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0]!;
      const ws = await new Promise<WebSocket>((resolve, reject) => {
        const w = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { ...headers, cookie } });
        w.once("open", () => resolve(w));
        w.once("error", reject);
      });
      cleanups.push(() => ws.close());
      let seq = 0;
      const replies = new Map<string, (error?: { code: string }) => void>();
      let onOpened!: () => void;
      const opened = new Promise<void>((r) => (onOpened = r));
      ws.on("message", (data, isBinary) => {
        if (isBinary) return;
        const msg = JSON.parse(String(data)) as {
          id?: string;
          error?: { code: string };
          event?: string;
        };
        if (msg.id !== undefined) replies.get(msg.id)?.(msg.error);
        else if (msg.event === "ask.opened") onOpened();
      });
      const request = (method: string, params: unknown): Promise<void> =>
        new Promise((resolve, reject) => {
          const id = String(++seq);
          // 誤りの返事は reject する（`paneSocket.integration.test.ts` の `Browser` と同じ。hello・購読が断られたまま先へ進まない）
          replies.set(id, (error) =>
            error ? reject(Object.assign(new Error(error.code), { code: error.code })) : resolve(),
          );
          ws.send(JSON.stringify({ id, method, params }));
        });
      await request("client.hello", { protocol: 1, kind: "desktop" });
      await request("ask.subscribe", {});
      return { opened };
    }

    it("引き継ぎの間は、待っていた接続を返事なしで捨て、新しい接続を pane_socket_busy で断る。元に戻ると受け付けが戻る（AC11）", async () => {
      // 引き継ぎは `process.execve` のある Node でだけ受け付ける（無ければ `unsupported`）。入れ替えそのものは下の `handoffExecve` が差し替えるので、
      // 無い Node（22.15 より前）では、組み立ての間だけ「ある」ことにする（この関数は呼ばれない）。
      const proc = process as { execve?: unknown };
      if (typeof proc.execve !== "function") {
        proc.execve = () => {
          throw new Error("the test's process.execve placeholder must not be called");
        };
        removeExecvePlaceholder = () => {
          delete proc.execve;
        };
      }
      const stateDir = await makeTempDir("soda-handoff-psock-");
      cleanups.push(() =>
        rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
      );
      let execveCalls = 0;
      const server = await composeServerOnFreePort(
        { host: "127.0.0.1", stateDir, origin: [] },
        {
          internal: {
            handoffPreflight: () => Promise.resolve({ ok: true }),
            handoffExecve: () => {
              execveCalls++;
              throw new Error("execve refused by the test");
            },
          },
        },
      );
      cleanups.push(() => server.close());
      const paneId = server.session.snapshot().panes[0]!.id;
      const sockPath = join(stateDir, "pane.sock");

      // 「引き継ぎの最中」を止めて作る: pane の読み取りを止める手順は `closeClients` の後・execve の前に呼ばれる。
      const host = server.terminals.get(paneId)!;
      const hold = host.holdForHandoff!.bind(host);
      let reachedHold!: () => void;
      const duringHandoff = new Promise<void>((r) => (reachedHold = r));
      let releaseHold!: () => void;
      const gate = new Promise<void>((r) => (releaseHold = r));
      host.holdForHandoff = async () => {
        reachedHold();
        await gate;
        return hold();
      };

      // 引き継ぎの前から返事を待っている接続（画面が居るので、質問が出て待つ）
      const b = await browser(server);
      const waiting = await send(sockPath, paneId);
      await b.opened;

      const answer = askSocket(
        handoffSocketPathFor(stateDir),
        JSON.stringify({ op: "handoff" }),
        15_000,
      );
      await duringHandoff;
      // 待っていた接続は、何も書かれずに閉じる（質問は取り消し。sodactl には `connection_closed`）
      expect(await waiting.closed).toBe("");
      // 最中の新しい接続は、要求を読まずに断る（質問は出していない、と呼び出し側に分かる）
      expect(await call(sockPath, paneId)).toEqual({
        ok: false,
        error: { code: "pane_socket_busy", message: expect.any(String) },
      });
      expect(execveCalls).toBe(0);

      releaseHold();
      expect(JSON.parse(await answer)).toMatchObject({ ok: true, panes: 1 });
      // execve が失敗して元に戻ると、受け付けが戻る（画面は引き継ぎで切れたので、質問は待たずに `unavailable`）。
      // 待っていた質問が取り消されていることの確かめも兼ねる——残っていれば、同じ pane への 2 つめは `ask_busy` で断られる。
      await vi.waitFor(
        async () =>
          // 落ちたときに返事の code が読めるよう、返事の全体を比べる
          expect(await call(sockPath, paneId)).toEqual({
            ok: true,
            result: { status: "unavailable", reason: expect.any(String) },
          }),
        {
          timeout: 10_000,
          interval: 20,
        },
      );
      expect(execveCalls).toBe(1);
    });
  },
);
