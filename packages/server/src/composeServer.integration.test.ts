import { existsSync } from "node:fs";
import { chmod, mkdir, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { createServer } from "node:net";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { encodeInputFrame } from "@sodashitsu/protocol";
import type { PaneAgentStatusChangedEvent } from "@sodashitsu/protocol";
import { makeTempDir } from "./persist/atomicFile.js";
import { composeServer } from "./composeServer.js";
import { composeServerOnFreePort, getFreePort } from "./composeServerOnFreePort.js";
import { ConfigError } from "./config.js";
import { STATE_DIR_LOCK_FILE, StateDirLock } from "./persist/StateDirLock.js";
import { DefaultAuthService } from "./auth/AuthService.js";
import { FsAuthFile } from "./persist/AuthFile.js";
import { ChildProcessGitRunner } from "./infra/GitRunner.js";

// どの it も実サーバを組み立て、多くは実 PTY・scrypt・git を使う。負荷の下で、上限を持たない it が最大 5.3 秒かかって既定の 5 秒で
// 落ちた。上限を持たない it の既定を 15 秒にする（このファイルにだけ効く。20260926-load-flaky-tests の D5）。
vi.setConfig({ testTimeout: 15_000 });

/**
 * 1 つ目のサーバの、起動直後の非同期の書き込みを終わらせる（基準の写しを取る前に呼ぶ）。workspace の git の情報（`repoKey`・`isLinkedWorktree`）は、定期のポーリング
 * （5 秒）か最初の問い合わせで埋まり、その結果が session.json に保存される。固定の短い待ち（300ms）だけでは、負荷が高いと、基準の写しの後に埋まって、
 * 「2 つ目の起動が書き換えた」と見間違える（試験が確かめるのは、2 つ目が触れないこと）。ここで、全 workspace を今ポーリングし、保存の予約を流す。
 */
async function settleFirstServer(server: { session: { snapshot(): { workspaces: { id: string }[] } }; gitPoller: { pollWorkspaceNow(id: string): Promise<unknown> }; persist: { flush(): Promise<void> } }): Promise<void> {
  for (const w of server.session.snapshot().workspaces) await server.gitPoller.pollWorkspaceNow(w.id).catch(() => undefined);
  await server.persist.flush();
}

describe("composeServer (integration)", () => {
  const cleanups: (() => Promise<void>)[] = [];
  afterEach(async () => {
    // 登録順に**逐次**実行する（`Promise.all` で並行させない）。`server.close()` が `persist.flush()`
    // でステートディレクトリへ書き込む一方、`rm(stateDir, …)` はそれを丸ごと消すので、並行させると
    // 書き込みの途中でディレクトリが消えて `ENOENT` になることがある（各テストは close→rm の順で
    // push しているので、逐次実行にすればこの順序がそのまま守られる）。
    for (const fn of cleanups.splice(0)) {
      await fn();
    }
  });

  it.skipIf(process.platform === "win32")(
    "close() は開いたままのスクロールバックのエディタの一時ディレクトリを消す（20260926-edit-scrollback の AC8）",
    async () => {
      const stateDir = await makeTempDir("soda-compose-");
      const tmpRoot = await makeTempDir("soda-compose-tmp-");
      cleanups.push(() => rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
      cleanups.push(() => rm(tmpRoot, { recursive: true, force: true }));
      const saved = { TMPDIR: process.env["TMPDIR"], EDITOR: process.env["EDITOR"] };
      const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
      try {
        const source = server.session.snapshot().panes[0]!;
        process.env["TMPDIR"] = tmpRoot; // 一時ディレクトリの置き場（os.tmpdir() は呼ぶたびに読む）
        process.env["EDITOR"] = "sleep 30 #"; // 閉じるまで終わらないエディタ
        await server.session.editScrollback(source.id);
        expect((await readdir(tmpRoot)).filter((n) => n.startsWith("soda-scrollback-"))).toHaveLength(1);
      } finally {
        for (const [k, v] of Object.entries(saved)) {
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
        }
        await server.close();
      }
      expect(await readdir(tmpRoot)).toEqual([]);
    },
  );

  it("--session work は <state-dir>/sessions/work に状態を作り、既定の session の状態を読みも書きもしない。同じ名前の 2 つ目は soda.lock で断り、別の名前は並行して動く（20260926-named-session AC1・AC5）", async () => {
    const base = await makeTempDir("soda-compose-");
    cleanups.push(() => rm(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    // 既定の session に目印の workspace を保存し、動いている soda のロック（このプロセスが持つ）も残しておく
    const def = await composeServerOnFreePort({ host: "127.0.0.1", stateDir: base, origin: [] });
    cleanups.unshift(() => def.close());
    await def.session.createWorkspace(process.cwd(), "marker-default");
    await settleFirstServer(def);
    const snap = async (name: string) => {
      const path = join(base, name);
      return { content: await readFile(path, "utf8"), mtimeMs: (await stat(path)).mtimeMs };
    };
    const before = { session: await snap("session.json"), auth: await snap("auth.json"), lock: await snap(STATE_DIR_LOCK_FILE) };

    const work = await composeServerOnFreePort({ host: "127.0.0.1", stateDir: base, session: "work", origin: [] });
    cleanups.unshift(() => work.close());
    await work.persist.flush();
    const workDir = join(base, "sessions", "work");
    expect(work.options.stateDir).toBe(workDir);
    expect(work.options.sessionName).toBe("work");
    expect(work.freshToken).toBeDefined(); // 既定の session の token を読まず、自分の token を作った
    expect(work.session.snapshot().workspaces.some((w) => w.label === "marker-default")).toBe(false);
    for (const name of [STATE_DIR_LOCK_FILE, "auth.json", "session.json"]) expect(existsSync(join(workDir, name)), name).toBe(true);
    await new Promise((res) => setTimeout(res, 800)); // 保存の予約が走る余地
    expect({ session: await snap("session.json"), auth: await snap("auth.json"), lock: await snap(STATE_DIR_LOCK_FILE) }).toEqual(before);

    const again = await composeServer({ host: "127.0.0.1", port: String(await getFreePort()), stateDir: base, session: "work", origin: [] });
    cleanups.unshift(() => again.close());
    const err = await again.listen().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConfigError);
    expect((err as ConfigError).message).toContain(workDir);

    const other = await composeServerOnFreePort({ host: "127.0.0.1", stateDir: base, session: "other", origin: [] });
    cleanups.unshift(() => other.close());
    expect(existsSync(join(base, "sessions", "other", STATE_DIR_LOCK_FILE))).toBe(true);
    expect(work.httpServer.server.listening).toBe(true);
    expect(other.httpServer.server.listening).toBe(true);
  }, 35_000); // 3 つの実サーバ。負荷の下で最大 15.7 秒（20260926-load-flaky-tests の D5）

  it("規則外の --session は composeServer が ConfigError で断り、状態ディレクトリに何も作らない（20260926-named-session AC2）", async () => {
    const base = await makeTempDir("soda-compose-");
    cleanups.push(() => rm(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    for (const bad of ["..", "../escape", "a/b", "con"]) {
      await expect(composeServer({ host: "127.0.0.1", stateDir: base, session: bad, origin: [] }), bad).rejects.toThrow(ConfigError);
    }
    expect(await readdir(base)).toEqual([]);
  });

  it("refuses to compose for a non-loopback host without a certificate (D12/D37 の前提)", async () => {
    const stateDir = await makeTempDir("soda-compose-");
    cleanups.push(() => rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    await expect(composeServer({ host: "0.0.0.0", stateDir, origin: [] })).rejects.toThrow(ConfigError);
  });

  it("generates a token on first run and listens on the requested port", async () => {
    const stateDir = await makeTempDir("soda-compose-");
    cleanups.push(() => rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    const server = await composeServerOnFreePort(
      { host: "127.0.0.1", stateDir, origin: [] },
      {
        start: async (s) => {
          // token は待ち受けに成功してから作る（D102）。listen() の前は常に undefined。
          expect(s.freshToken).toBeUndefined();
          await s.listen();
        },
      },
    );
    cleanups.unshift(() => server.close());
    const port = server.options.port;
    expect(server.freshToken).toBeTruthy();

    const res = await fetch(`http://127.0.0.1:${port}/api/session`);
    expect(res.status).toBe(401); // 未ログインなら拒否される（AC10）
  });

  it("待ち受けに失敗したら listen() が reject する（ポートが使用中。未処理の 'error' で落ちない。D101）", async () => {
    const stateDir = await makeTempDir("soda-compose-");
    const blocker = createServer();
    await new Promise<void>((res) => blocker.listen(0, "127.0.0.1", res));
    const port = (blocker.address() as AddressInfo).port;
    const server = await composeServer({ host: "127.0.0.1", port: String(port), stateDir, origin: [] });
    cleanups.push(() => server.close().catch(() => undefined));
    cleanups.push(() => new Promise<void>((res) => blocker.close(() => res())));
    cleanups.push(() => rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    await expect(server.listen()).rejects.toThrow(/EADDRINUSE/);
  });

  it("初回の起動で待ち受けに失敗しても token を作らず、次に成功した起動で token 付きの URL を出せる（D102）", async () => {
    // 以前は組み立て（composeServer）の時点で token を作って保存していたため、待ち受けに失敗した初回の起動が token を
    // 作ったまま一度も表示せずに終わり、次の起動では「作り済み」として表示されなかった。
    const stateDir = await makeTempDir("soda-compose-");
    cleanups.push(() => rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    const blocker = createServer();
    await new Promise<void>((res) => blocker.listen(0, "127.0.0.1", res));
    const port = (blocker.address() as AddressInfo).port;

    const failed = await composeServer({ host: "127.0.0.1", port: String(port), stateDir, origin: [] });
    await expect(failed.listen()).rejects.toThrow(/EADDRINUSE/);
    expect(failed.freshToken).toBeUndefined();
    expect(existsSync(join(stateDir, "auth.json"))).toBe(false);
    await failed.close();
    await new Promise<void>((res) => blocker.close(() => res()));

    const next = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
    cleanups.unshift(() => next.close()); // rm より先に閉じる
    expect(next.freshToken).toBeTruthy();
  });

  it("保存された状態があり待ち受けに失敗したら、シェルを起動せず session.json も書き換えない（D102。同じ state-dir の soda が動いている場合は、ポートが同じでもその前に soda.lock で断る——D103）", async () => {
    // 以前は復元（全 pane のシェルを猶予つきで起動）と poller の開始の後に bind していたため、失敗する起動でも全シェルを起動し、
    // その間の保存の予約（persist.touch）や close() の flush で、動いている側の session.json を上書きしえた。
    const stateDir = await makeTempDir("soda-compose-");
    cleanups.push(() => rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    const first = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
    await first.session.createWorkspace(process.cwd(), "saved");
    await first.close(); // flush で session.json に 2 つの workspace を保存する

    const sessionPath = join(stateDir, "session.json");
    const before = { content: await readFile(sessionPath, "utf8"), mtimeMs: (await stat(sessionPath)).mtimeMs };
    expect(before.content).toContain("saved");

    const blocker = createServer();
    await new Promise<void>((res) => blocker.listen(0, "127.0.0.1", res));
    const port = (blocker.address() as AddressInfo).port;
    const second = await composeServer({ host: "127.0.0.1", port: String(port), stateDir, origin: [] });
    await expect(second.listen()).rejects.toThrow(/EADDRINUSE/);
    // 復元していない（pane が 1 つも無い＝シェルを 1 つも起動していない）。
    expect(second.session.snapshot().panes.length).toBe(0);
    expect(second.session.snapshot().workspaces.length).toBe(0);
    // 保存の予約（500ms）が走る余地を与えてから、session.json が変わっていないことを確かめる。
    await new Promise((res) => setTimeout(res, 800));
    expect(await readFile(sessionPath, "utf8")).toBe(before.content);
    expect((await stat(sessionPath)).mtimeMs).toBe(before.mtimeMs);
    // 失敗した起動を閉じても、空の状態で session.json を上書きしない。
    await second.close();
    await new Promise<void>((res) => blocker.close(() => res()));
    expect(await readFile(sessionPath, "utf8")).toBe(before.content);
    expect((await stat(sessionPath)).mtimeMs).toBe(before.mtimeMs);
  }, 15000);

  it("同じ state-dir の 2 つ目はポートが違っても listen() が ConfigError で断り、シェルを起動せず session.json・auth.json に触れない（D103）", async () => {
    // docs は手元用 7780・LAN 用 8443 で起動させるので、ポート違いの二重起動が起きやすい。以前は bind が両方成功し、
    // 2 つ目が全シェルを二重に起動し、session.json・auth.json を互いに上書きし合っていた。
    const stateDir = await makeTempDir("soda-compose-");
    cleanups.push(() => rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    const first = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
    cleanups.unshift(() => first.close()); // rm より先に閉じる
    await first.session.createWorkspace(process.cwd(), "saved-by-first");
    await settleFirstServer(first); // 1 つ目の起動直後の書き込み（git の情報の保存）を終わらせる
    const lockPath = join(stateDir, STATE_DIR_LOCK_FILE);
    const snap = async (name: string) => {
      const path = join(stateDir, name);
      return { content: await readFile(path, "utf8"), mtimeMs: (await stat(path)).mtimeMs };
    };
    const before = { session: await snap("session.json"), auth: await snap("auth.json") };
    expect(before.session.content).toContain("saved-by-first");

    const port2 = await getFreePort();
    const second = await composeServer({ host: "127.0.0.1", port: String(port2), stateDir, origin: [] });
    const err = await second.listen().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConfigError);
    expect((err as ConfigError).message).toContain(`pid ${process.pid}`);
    expect((err as ConfigError).hint).toContain("--state-dir");
    // 復元していない（シェルを 1 つも起動していない）・token も作らない・待ち受けてもいない。
    expect(second.session.snapshot().panes.length).toBe(0);
    expect(second.freshToken).toBeUndefined();
    expect(second.httpServer.server.listening).toBe(false);
    // 保存の予約（500ms）が走る余地を与えてから、どちらのファイルも変わっていないことを確かめる。
    await new Promise((res) => setTimeout(res, 800));
    expect(await snap("session.json")).toEqual(before.session);
    expect(await snap("auth.json")).toEqual(before.auth);
    // 断られた起動を閉じても、ファイルにも 1 つ目のロックにも触れない。
    await second.close();
    expect(await snap("session.json")).toEqual(before.session);
    expect(await snap("auth.json")).toEqual(before.auth);
    expect((await readFile(lockPath, "utf8")).split("\n")[0]).toBe(String(process.pid));
    expect(first.session.snapshot().workspaces.some((w) => w.label === "saved-by-first")).toBe(true);

    // 1 つ目を閉じればロックを放し、同じ state-dir で起動し直せる。
    await first.close();
    expect(existsSync(lockPath)).toBe(false);
    const third = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
    cleanups.unshift(() => third.close());
    expect(third.session.snapshot().workspaces.some((w) => w.label === "saved-by-first")).toBe(true);
  }, 15000);

  it("組み立て（composeServer）と listen() の間に token reset が走っても、listen() はロックの後に auth.json を読むので新しい token で動く（D103 の独立点検 #1）", async () => {
    // 以前は組み立ての時点で auth.json を読んでいたため、その後・ロックの前に `soda token reset`（ロックを取って作り直す）が
    // 走ると、古い token をメモリに持ったまま起動し、新しい token を 401 で拒み、古い token を受け付け、次のログインで
    // auth.json を古い token に書き戻していた。
    const stateDir = await makeTempDir("soda-compose-");
    cleanups.push(() => rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    const { token: oldToken } = await new DefaultAuthService(new FsAuthFile(stateDir)).ensureToken();
    let newToken = "";
    const server = await composeServerOnFreePort(
      { host: "127.0.0.1", stateDir, origin: [] },
      {
        // 組み立ての後・listen() の前に走らせる（取り直したら、組み立て直した後にもう一度）。
        start: async (s) => {
          // `soda token reset` と同じ手順（ロックを取り、auth.json を読んで作り直し、放す）。serve はまだロックを取っていない。
          const resetLock = new StateDirLock(stateDir);
          await resetLock.acquire();
          const resetter = new DefaultAuthService(new FsAuthFile(stateDir));
          await resetter.initialize();
          newToken = await resetter.resetToken();
          await resetLock.release();
          await s.listen();
        },
      },
    );
    cleanups.unshift(() => server.close());
    const port = server.options.port;
    expect(server.freshToken).toBeUndefined(); // token は作り直し済み（新しく作らない）
    const origin = `http://127.0.0.1:${port}`;
    const login = (token: string | undefined): Promise<number> =>
      fetch(`${origin}/api/login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
        body: JSON.stringify({ token }),
      }).then((r) => r.status);
    expect(await login(newToken)).toBe(204);
    expect(await login(oldToken)).toBe(401);
    // serve 自身の書き込み（ログインで auth.json を保存する）の後も、auth.json は新しい token のまま。
    const reread = new DefaultAuthService(new FsAuthFile(stateDir));
    expect((await reread.login(newToken)).ok).toBe(true);
    expect((await reread.login(oldToken!)).ok).toBe(false);
  });

  it("listen() が失敗したら（待ち受けの失敗）close() を待たずにロックを放す（main は close() を呼ばずに終わる。D103）", async () => {
    const stateDir = await makeTempDir("soda-compose-");
    cleanups.push(() => rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    const blocker = createServer();
    await new Promise<void>((res) => blocker.listen(0, "127.0.0.1", res));
    cleanups.unshift(() => new Promise<void>((res) => blocker.close(() => res())));
    const server = await composeServer({ host: "127.0.0.1", port: String((blocker.address() as AddressInfo).port), stateDir, origin: [] });
    cleanups.unshift(() => server.close());
    await expect(server.listen()).rejects.toThrow(/EADDRINUSE/);
    expect(existsSync(join(stateDir, STATE_DIR_LOCK_FILE))).toBe(false);
  });

  // 既定のシェル（`$SHELL`）が無い環境で、最初の workspace の作成（ensureNotEmpty）が spawn_failed で失敗する。
  it.skipIf(process.platform === "win32")(
    "token を作った後に起動が失敗しても freshToken を読める（呼び出し側が失わずに表示できる。D102）",
    async () => {
      const stateDir = await makeTempDir("soda-compose-");
      cleanups.push(() => rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
      const originalShell = process.env["SHELL"];
      process.env["SHELL"] = join(stateDir, "no-such-shell");
      cleanups.unshift(async () => {
        if (originalShell === undefined) delete process.env["SHELL"];
        else process.env["SHELL"] = originalShell;
      });
      let listenError: unknown;
      const server = await composeServerOnFreePort(
        { host: "127.0.0.1", stateDir, origin: [] },
        {
          start: async (s) => {
            listenError = await s.listen().then(
              () => undefined,
              (err: unknown) => err,
            );
            if ((listenError as { code?: unknown } | undefined)?.code === "EADDRINUSE") throw listenError; // 取り直させる
          },
        },
      );
      cleanups.unshift(() => server.close()); // rm より先に閉じる
      expect(listenError).toBeInstanceOf(Error);
      expect((listenError as Error).message).toMatch(/failed to start a shell/);
      expect(server.freshToken).toBeTruthy(); // auth.json に保存済みの token を、呼び出し側（main）が表示できる
      expect(existsSync(join(stateDir, "auth.json"))).toBe(true);
    },
    10000,
  );

  it("証明書のファイルを読めなければ設定の誤り（ConfigError）にし、token も作らない（D102）", async () => {
    const stateDir = await makeTempDir("soda-compose-");
    cleanups.push(() => rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    const missing = join(stateDir, "no-such-cert.pem");
    await expect(composeServer({ host: "0.0.0.0", cert: missing, key: missing, stateDir, origin: [] })).rejects.toThrow(ConfigError);
    expect(existsSync(join(stateDir, "auth.json"))).toBe(false);
  });

  it("起動の途中（復元が終わるまで）は /ws を 503 で断り、listen() の後は受け付ける（D102）", async () => {
    const stateDir = await makeTempDir("soda-compose-");
    cleanups.push(() => rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    const upgradeStatus = (port: number, cookie?: string): Promise<number> =>
      new Promise((resolve, reject) => {
        const origin = `http://127.0.0.1:${port}`;
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { origin, host: `127.0.0.1:${port}`, ...(cookie ? { cookie } : {}) } });
        ws.once("open", () => {
          ws.close();
          resolve(101);
        });
        ws.once("unexpected-response", (_req, res) => {
          ws.terminate();
          resolve(res.statusCode ?? 0);
        });
        ws.once("error", reject);
      });

    const server = await composeServerOnFreePort(
      { host: "127.0.0.1", stateDir, origin: [] },
      {
        // bind が済み復元の途中の状態を模す：listen() を始め、bind した直後（token の作成・復元の await 中）に upgrade を試す。
        // bind に失敗したら（EADDRINUSE）"listening" は来ないので、listen() の失敗と競わせて取り直させる。
        start: async (s, port) => {
          const listening = s.listen();
          await Promise.race([new Promise<void>((res) => s.httpServer.server.once("listening", () => res())), listening]);
          expect(await upgradeStatus(port)).toBe(503);
          await listening;
        },
      },
    );
    cleanups.unshift(() => server.close());
    const port = server.options.port;
    const origin = `http://127.0.0.1:${port}`;

    const loginRes = await fetch(`${origin}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
      body: JSON.stringify({ token: server.freshToken }),
    });
    const cookie = loginRes.headers.get("set-cookie")!.split(";")[0]!;
    expect(await upgradeStatus(port, cookie)).toBe(101);
  }, 10000);

  it("creates one workspace on first startup when there is no saved session (AC1/AC8 の起点)", async () => {
    const stateDir = await makeTempDir("soda-compose-");
    const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
    cleanups.push(() => server.close());
    cleanups.push(() => rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    expect(server.session.snapshot().workspaces.length).toBe(1);
  });

  // 新しく開く場所の「引き継ぐ」の本番のつなぎ方（20260921-new-terminal-cwd。`makeNewCwdDeps` に渡す `terminals`・`inspector`・
  // `getPane`）。E2E ではエージェントの監視が `Pane.cwd` を追従させてしまい、読み直しを外しても記録の側で通る——ここでは
  // `listen()` を呼ばず（監視が動かない）、記録を開いた場所のままにして、前面プロセスの cwd を読み直すことだけを見る。
  // `/proc` を読むのは Linux だけ（macOS・Windows の前面の cwd は null。design D2）。
  it.runIf(process.platform === "linux")(
    "「引き継ぐ」は元の pane の前面プロセスの cwd を読み直して開く（記録された場所ではなく）",
    async () => {
      const stateDir = await makeTempDir("soda-compose-");
      const work = await realpath(await makeTempDir("soda-newcwd-"));
      const sub = join(work, "sub");
      await mkdir(sub);
      // シェルの代わりに、`cd` してから印を置いて待つだけのスクリプト（OSC 7 は出さない）。
      const shell = join(work, "cd-and-wait.sh");
      await writeFile(shell, `#!/bin/sh\ncd "${sub}" && : > ready && exec sleep 30\n`, { mode: 0o755 });
      const port = await getFreePort();
      const server = await composeServer({ host: "127.0.0.1", port: String(port), stateDir, origin: [], shell });
      cleanups.push(() => server.close());
      cleanups.push(() => rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
      cleanups.push(() => rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));

      const { pane } = await server.session.createWorkspace(work, "src");
      await expect.poll(() => existsSync(join(sub, "ready")), { timeout: 5000 }).toBe(true);
      expect(server.session.getPane(pane.id)?.cwd, "記録は開いた場所のまま（監視が動いていない）").toBe(work);

      const r = await server.session.createWorkspace(undefined, undefined, { policy: "follow", sourcePaneId: pane.id });
      expect(r.workspace.cwd).toBe(sub);
      expect(r.cwdFallback).toBeUndefined();
    },
    10000,
  );

  // 20260921-workspace-auto-label：保存に名前が自動かの印が載る（`toSessionFileData` は非公開なので、保存した session.json を読む）。
  it("保存した session.json の workspace に、名前が自動か付けたものかの印（autoLabel）が載る", async () => {
    const stateDir = await makeTempDir("soda-compose-");
    const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] }); // 起動時の最初の workspace は名前を渡さない（自動の名前）
    cleanups.push(() => server.close());
    cleanups.push(() => rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    const { workspace: named } = await server.session.createWorkspace(process.cwd(), "persisted");
    await server.persist.flush();
    const saved = JSON.parse(await readFile(join(stateDir, "session.json"), "utf8")) as {
      workspaces: { id: string; label: string; autoLabel?: boolean }[];
    };
    const first = saved.workspaces.find((w) => w.id !== named.id);
    expect(first?.autoLabel).toBe(true);
    expect(saved.workspaces.find((w) => w.id === named.id)).toMatchObject({ label: "persisted", autoLabel: false });
  }, 10000);

  // 20260926-workspace-label-follow-cwd：tab を並べ替えた順で保存する（復元で最初の tab が変わらない——名前と git を決める場所）。
  it.skipIf(process.platform === "win32")("保存した session.json の tab は並べ替えた順（workspace の tabIds の順）", async () => {
    const stateDir = await makeTempDir("soda-compose-");
    // 待つだけのシェル——一式を並べて走らせる負荷の下で、既定のシェルが猶予の間に終わって tab ごと閉じたことがある（test-result の失敗の証跡）。
    const shell = join(stateDir, "wait.sh");
    await writeFile(shell, "#!/bin/sh\nexec sleep 30\n", { mode: 0o755 });
    const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [], shell });
    cleanups.push(() => server.close());
    cleanups.push(() => rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    const { workspace, tab: first } = await server.session.createWorkspace(process.cwd(), "tabs");
    const { tab: second } = await server.session.createTab(workspace.id, undefined);
    server.session.moveTab(second.id, "previous");
    await server.persist.flush();
    const saved = JSON.parse(await readFile(join(stateDir, "session.json"), "utf8")) as { workspaces: { id: string; tabs: { id: string }[] }[] };
    expect(saved.workspaces.find((w) => w.id === workspace.id)!.tabs.map((t) => t.id)).toEqual([second.id, first.id]);
  }, 10000);

  it("persists and restores the session across two composeServer instances (AC18)", async () => {
    const stateDir = await makeTempDir("soda-compose-");
    const first = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
    const { workspace } = await first.session.createWorkspace(process.cwd(), "persisted");
    await first.persist.flush();
    await first.close();

    const second = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
    cleanups.push(() => second.close());
    cleanups.push(() => rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));

    const restored = second.session.snapshot().workspaces.find((w) => w.id === workspace.id);
    expect(restored).toBeDefined();
    expect(restored?.label).toBe("persisted");
  }, 15_000); // 2 つの実サーバ。負荷の下で最大 5.1 秒（20260926-load-flaky-tests の D5）

  it("full round trip: login, hello, create, subscribe, echo (same flow as smoke.ts)", async () => {
    const stateDir = await makeTempDir("soda-compose-e2e-");
    const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
    const port = server.options.port;
    cleanups.push(() => server.close());
    cleanups.push(() => rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));

    const origin = `http://127.0.0.1:${port}`;
    const loginRes = await fetch(`${origin}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
      body: JSON.stringify({ token: server.freshToken }),
    });
    expect(loginRes.status).toBe(204);
    const cookie = loginRes.headers.get("set-cookie")!.split(";")[0]!;

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { cookie, origin, host: `127.0.0.1:${port}` } });
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    cleanups.push(async () => {
      ws.close();
    });

    const helloReply = await requestUntilMatchingId(ws, "h1", "client.hello", { protocol: 1, kind: "desktop" });
    expect((helloReply as { clientId: string }).clientId).toBeTruthy();
  }, 10000);

  it("--worktree-dir で起動すると、worktree.create RPC で作られたパスがその配下になる（20260924-worktree-dir-config AC1。design「テストで確認すること」——実ホームディレクトリは使わない）", async () => {
    const stateDir = await makeTempDir("soda-compose-wtdir-");
    const worktreeDir = await makeTempDir("soda-compose-wtdir-root-");
    const repo = await makeTempDir("soda-compose-wtdir-repo-");

    const git = new ChildProcessGitRunner();
    async function runGit(args: string[]): Promise<void> {
      const r = await git.run(repo, args, 10_000);
      if (r.code !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
    }
    await runGit(["init", "-q", "-b", "main"]);
    await runGit(["config", "user.email", "t@example.com"]);
    await runGit(["config", "user.name", "t"]);
    await runGit(["commit", "-q", "--allow-empty", "-m", "init"]);

    const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [], worktreeDir });
    const port = server.options.port;
    cleanups.push(() => server.close());
    cleanups.push(() => rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    cleanups.push(() => rm(worktreeDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    cleanups.push(() => rm(repo, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));

    const origin = `http://127.0.0.1:${port}`;
    const loginRes = await fetch(`${origin}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
      body: JSON.stringify({ token: server.freshToken }),
    });
    expect(loginRes.status).toBe(204);
    const cookie = loginRes.headers.get("set-cookie")!.split(";")[0]!;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { cookie, origin, host: `127.0.0.1:${port}` } });
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    cleanups.push(async () => {
      ws.close();
    });

    await requestUntilMatchingId(ws, "h1", "client.hello", { protocol: 1, kind: "desktop" });
    const wsCreated = (await requestUntilMatchingId(ws, "c1", "workspace.create", { cwd: repo, label: "wt-repo" })) as {
      workspace: { id: string };
    };
    const result = (await requestUntilMatchingId(ws, "w1", "worktree.create", {
      workspaceId: wsCreated.workspace.id,
      branch: "worktree/test-branch",
    })) as { path: string };

    expect(result.path.startsWith(worktreeDir)).toBe(true);
  }, 15000);

  it("workspace.create は、実際の git リポジトリなら定期ポーリング（5秒）を待たずに Workspace.git が埋まる（20260925-workspace-git-immediate。AC1・AC3）", async () => {
    const stateDir = await makeTempDir("soda-compose-gitnow-");
    const repo = await makeTempDir("soda-compose-gitnow-repo-");

    const git = new ChildProcessGitRunner();
    async function runGit(args: string[]): Promise<void> {
      const r = await git.run(repo, args, 10_000);
      if (r.code !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
    }
    await runGit(["init", "-q", "-b", "main"]);
    await runGit(["config", "user.email", "t@example.com"]);
    await runGit(["config", "user.name", "t"]);
    await runGit(["commit", "-q", "--allow-empty", "-m", "init"]);

    const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] }); // gitPoller.start() もここで走る（既定の初期 workspace は別の場所を指すので無関係）
    const port = server.options.port;
    cleanups.push(() => server.close());
    cleanups.push(() => rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    cleanups.push(() => rm(repo, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));

    const origin = `http://127.0.0.1:${port}`;
    const loginRes = await fetch(`${origin}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
      body: JSON.stringify({ token: server.freshToken }),
    });
    const cookie = loginRes.headers.get("set-cookie")!.split(";")[0]!;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { cookie, origin, host: `127.0.0.1:${port}` } });
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    cleanups.push(async () => {
      ws.close();
    });

    await requestUntilMatchingId(ws, "h1", "client.hello", { protocol: 1, kind: "desktop" });
    const start = Date.now();
    const created = (await requestUntilMatchingId(ws, "c1", "workspace.create", { cwd: repo, label: "repo" })) as {
      workspace: { id: string };
    };
    const responseMs = Date.now() - start;
    // AC3（粗い sanity check。**厳密な検証ではない**——taskcheck T5 round1 で確認: 実リポジトリの
    // git 呼び出しは速く、`await` に戻す退行を入れてもこの閾値は超えないため、この assertion
    // 単体では await への退行を検知できない。厳密な検証は index.test.ts の
    // FakeGitInfoPoller〔releasePending() で明示的に遅延させる〕が担う——決定的で確実）。
    // ここでは「明らかに `GIT_TIMEOUT_MS`〔3000ms〕級の遅延でブロックしていないか」という
    // 粗い確認に留める。
    expect(responseMs).toBeLessThan(2000);

    // AC1: 定期ポーリング（5秒周期）の間隔を待たずに Workspace.git が埋まることを、
    // 実ホームディレクトリを汚さない範囲（この work 専用の一時ディレクトリ）で確認する。
    // 5秒よりずっと短い上限（2秒）でポーリングし、間に合わなければ失敗させる。
    const deadline = Date.now() + 2000;
    let gitInfo: unknown;
    do {
      gitInfo = server.session.snapshot().workspaces.find((w) => w.id === created.workspace.id)?.git;
      if (gitInfo) break;
      await new Promise((r) => setTimeout(r, 50));
    } while (Date.now() < deadline);
    expect(gitInfo).toMatchObject({ branch: "main" });
  }, 15000);

  it("close() resolves promptly even while a browser WebSocket is still connected (レビュー指摘の回帰テスト)", async () => {
    // 以前は composeServer().close() が WebSocket を一切閉じなかったため、ブラウザが1つでも繋がった
    // ままだと httpServer.server.close() のコールバックが永久に発火しなかった（`wsServer`/`WsGateway` が
    // 返り値にすら保持されていなかった）。ここでは「繋いだまま close() を呼んで、有限時間で終わる」ことを直接確かめる。
    const stateDir = await makeTempDir("soda-compose-shutdown-");
    cleanups.push(() => rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
    const port = server.options.port;

    const origin = `http://127.0.0.1:${port}`;
    const loginRes = await fetch(`${origin}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
      body: JSON.stringify({ token: server.freshToken }),
    });
    const cookie = loginRes.headers.get("set-cookie")!.split(";")[0]!;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { cookie, origin, host: `127.0.0.1:${port}` } });
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });

    // ws をこちらから閉じない（=「ブラウザを開いたまま」を模す）まま close() する。
    await Promise.race([
      server.close(),
      new Promise<never>((_r, reject) => setTimeout(() => reject(new Error("server.close() did not resolve within 5s")), 5000)),
    ]);
  }, 10000);

  // PATH 越しに偽の実行ファイルを解決させるので（`:` 区切り）、POSIX シェルの環境でだけ確かめる（02-agent-detection T10）。
  it.skipIf(process.platform === "win32")(
    "実物の PTY で偽の 'claude' を起動すると、pane.agent_status_changed が kind='claude' で届く（02-agent-detection T10・AC6）",
    async () => {
      const stateDir = await makeTempDir("soda-compose-agent-");
      const binDir = await makeTempDir("soda-compose-agent-bin-");
      // claude.toml の `live_turn_working`（bottom_non_empty_lines(12)・working）に当たる画面を出し、
      // pane が判定される間ずっと前面プロセスとして居座る（herdr の「対話の途中で待っている」を模す）。
      const claudePath = join(binDir, "claude");
      await writeFile(claudePath, "#!/usr/bin/env bash\nprintf '\\xe2\\x9c\\xbb Thinking\\xe2\\x80\\xa6\\n'\nsleep 30\n");
      await chmod(claudePath, 0o755);

      const originalPath = process.env["PATH"];
      process.env["PATH"] = `${binDir}:${originalPath ?? ""}`;
      cleanups.push(async () => {
        process.env["PATH"] = originalPath;
      });
      cleanups.push(() => rm(binDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));

      const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
      const port = server.options.port;
      cleanups.push(() => server.close());
      cleanups.push(() => rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));

      const origin = `http://127.0.0.1:${port}`;
      const loginRes = await fetch(`${origin}/api/login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
        body: JSON.stringify({ token: server.freshToken }),
      });
      const cookie = loginRes.headers.get("set-cookie")!.split(";")[0]!;
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { cookie, origin, host: `127.0.0.1:${port}` } });
      await new Promise<void>((resolve, reject) => {
        ws.once("open", () => resolve());
        ws.once("error", reject);
      });
      cleanups.push(async () => {
        ws.close();
      });

      await requestUntilMatchingId(ws, "h1", "client.hello", { protocol: 1, kind: "desktop" });
      const created = (await requestUntilMatchingId(ws, "c1", "workspace.create", { cwd: process.cwd(), label: "agent-test" })) as {
        pane: { id: string };
      };
      await requestUntilMatchingId(ws, "s1", "pane.subscribe", { paneId: created.pane.id, scrollbackLines: 200 });

      ws.send(encodeInputFrame(created.pane.id, new TextEncoder().encode("claude\n")));

      const event = await waitForEvent(
        ws,
        "pane.agent_status_changed",
        (data) => data.paneId === created.pane.id && data.agent?.kind === "claude",
        15_000, // it の上限の半分（負荷の下で it 全体が最大 12.5 秒かかり、この待ち 8 秒で落ちた。20260926-load-flaky-tests の D5）
      );
      expect(event.agent?.kind).toBe("claude");
    },
    30_000,
  );
});

function requestUntilMatchingId(ws: WebSocket, id: string, method: string, params: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const onMessage = (data: Buffer, isBinary: boolean): void => {
      if (isBinary) return;
      const msg = JSON.parse(data.toString("utf8")) as { id?: string; result?: unknown; error?: unknown };
      if (msg.id !== id) return;
      ws.off("message", onMessage);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    };
    ws.on("message", onMessage);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

/** 特定のイベント（design.md「WebSocket の通信」）が届くまで待つ。JSON メッセージの `event`/`data` を見る（RPC の応答とは `id` の有無で区別できる）。 */
function waitForEvent(
  ws: WebSocket,
  eventName: PaneAgentStatusChangedEvent["event"],
  predicate: (data: PaneAgentStatusChangedEvent["data"]) => boolean,
  timeoutMs: number,
): Promise<PaneAgentStatusChangedEvent["data"]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", onMessage);
      reject(new Error(`timed out waiting for event ${eventName}`));
    }, timeoutMs);
    const onMessage = (data: Buffer, isBinary: boolean): void => {
      if (isBinary) return;
      let msg: { event?: string; data?: unknown };
      try {
        msg = JSON.parse(data.toString("utf8")) as { event?: string; data?: unknown };
      } catch {
        return;
      }
      if (msg.event !== eventName) return;
      const eventData = msg.data as PaneAgentStatusChangedEvent["data"];
      if (!predicate(eventData)) return;
      clearTimeout(timer);
      ws.off("message", onMessage);
      resolve(eventData);
    };
    ws.on("message", onMessage);
  });
}

// 20260926-screen-history-replay：`--pane-history`（design「起動」「停止」）。実 PTY と実シェルを使う。
describe.skipIf(process.platform === "win32")("composeServer — 画面履歴（--pane-history）", () => {
  const cleanups: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0)) await fn();
  });

  const HISTORY = "session-history.json";
  const MARKER = "前回のセッションの画面";

  async function until(what: string, cond: () => boolean | Promise<boolean>, timeoutMs = 15_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!(await cond())) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async function start(stateDir: string, paneHistory: boolean, internal: { paneHistorySaveIntervalMs?: number } = {}) {
    const server = await composeServer(
      { host: "127.0.0.1", port: String(await getFreePort()), stateDir, origin: [], ...(paneHistory ? { paneHistory } : {}) },
      internal,
    );
    await server.listen();
    return server;
  }

  function screenOf(server: Awaited<ReturnType<typeof composeServer>>, paneId: string): string {
    return server.terminals.get(paneId)?.mirror.plainText() ?? "";
  }

  async function tempStateDir(): Promise<string> {
    const dir = await makeTempDir("soda-history-it-");
    cleanups.push(() => rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    return dir;
  }

  it("停止時に保存し（0600・色つき）、起動し直すと前回の画面・区切りの行・新しいシェルの出力がこの順に並ぶ（AC1・AC2・AC6・AC12）", async () => {
    const stateDir = await tempStateDir();
    const first = await start(stateDir, true);
    const paneId = first.session.snapshot().panes[0]!.id;
    let otherId: string;
    try {
      // 打ったコマンドの行には `HIST_%s` しか出ないので、`HIST_MARK` は出力の側にだけ現れる。
      first.terminals.get(paneId)!.write("printf '\\033[31mHIST_%s\\033[0m\\n' MARK\r");
      await until("the output in the first server", () => screenOf(first, paneId).includes("HIST_MARK"));
      // もう 1 つの pane（後で画面履歴から項目を除き、「保存した画面が無い pane」として復元させる。AC12）。
      otherId = (await first.session.createWorkspace(process.cwd(), "other")).pane.id;
      first.terminals.get(otherId)!.write("echo OTHER_$((1+1))\r");
      await until("the output in the other pane", () => screenOf(first, otherId).includes("OTHER_2"));
    } finally {
      await first.close();
    }

    const path = join(stateDir, HISTORY);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    const saved = JSON.parse(await readFile(path, "utf8")) as { schema: number; panes: { paneId: string; ansi: string }[] };
    const entry = saved.panes.find((p) => p.paneId === paneId);
    expect(entry?.ansi).toContain("\x1b[31mHIST_MARK"); // 色つきで保存している
    expect(saved.panes.map((p) => p.paneId)).toContain(otherId!);
    saved.panes = saved.panes.filter((p) => p.paneId !== otherId!);
    await writeFile(path, JSON.stringify(saved));

    const second = await start(stateDir, true);
    cleanups.unshift(() => second.close());
    const host = second.terminals.get(paneId)!;
    host.write("echo NEW_$((20+22))\r");
    await until("the new shell's output", () => screenOf(second, paneId).includes("NEW_42"));
    const screen = screenOf(second, paneId);
    const hist = screen.indexOf("HIST_MARK");
    const marker = screen.indexOf(MARKER);
    const fresh = screen.lastIndexOf("NEW_42");
    expect(hist).toBeGreaterThanOrEqual(0);
    expect(marker).toBeGreaterThan(hist);
    expect(fresh).toBeGreaterThan(marker);
    expect(screen.indexOf(MARKER, marker + 1)).toBe(-1); // 区切りは 1 回だけ

    // 保存した画面が無い pane は、区切りの行も出さずに空の新しいシェル（AC12）。
    expect(second.session.snapshot().panes.map((p) => p.id)).toContain(otherId!);
    expect(screenOf(second, otherId!)).not.toContain(MARKER);
    expect(screenOf(second, otherId!)).not.toContain("OTHER_2");
  }, 60_000);

  it("停止を待たずに定期的に保存し、停止の後は書かない（AC3。間隔は差し替えて短くする）", async () => {
    const stateDir = await tempStateDir();
    const server = await start(stateDir, true, { paneHistorySaveIntervalMs: 100 });
    const paneId = server.session.snapshot().panes[0]!.id;
    const path = join(stateDir, HISTORY);
    let closed = false;
    try {
      server.terminals.get(paneId)!.write("echo PERIODIC_$((6*7))\r");
      await until("the periodic save", async () => existsSync(path) && (await readFile(path, "utf8")).includes("PERIODIC_42"));
      await server.close();
      closed = true;
      await rm(path);
      await new Promise((resolve) => setTimeout(resolve, 400)); // 間隔の 4 倍
      expect(existsSync(path)).toBe(false);
    } finally {
      if (!closed) await server.close();
    }
  }, 60_000);

  it("--pane-history 無しでは作らず、起動時に既存のものを消し、流さない（AC4）", async () => {
    const stateDir = await tempStateDir();
    const first = await start(stateDir, false);
    const paneId = first.session.snapshot().panes[0]!.id;
    await first.close();
    expect(existsSync(join(stateDir, HISTORY))).toBe(false);

    // 以前に有効で保存した分が残っている状態。
    await writeFile(join(stateDir, HISTORY), JSON.stringify({ schema: 1, savedAt: "x", panes: [{ paneId, savedAt: "x", ansi: "STALE_SECRET" }] }));
    const second = await start(stateDir, false);
    try {
      expect(existsSync(join(stateDir, HISTORY))).toBe(false);
      expect(screenOf(second, paneId)).not.toContain("STALE_SECRET");
    } finally {
      await second.close();
    }
    expect(existsSync(join(stateDir, HISTORY))).toBe(false);
  }, 60_000);

  it.each([
    ["無い", null],
    ["壊れている", "{broken"],
  ])("session.json が%sときは、画面履歴を新しい pane に流さずに消す（AC5）", async (_name, sessionJson) => {
    const stateDir = await tempStateDir();
    if (sessionJson !== null) await writeFile(join(stateDir, "session.json"), sessionJson);
    // 前の起動の pane の古い画面（id は UUID なので新しい pane と衝突はしないが、復元しない起動では持ち越さず消す）。
    const oldPaneId = randomUUID();
    await writeFile(join(stateDir, HISTORY), JSON.stringify({ schema: 1, savedAt: "x", panes: [{ paneId: oldPaneId, savedAt: "x", ansi: "STALE_SCREEN" }] }));
    const server = await start(stateDir, true);
    cleanups.unshift(() => server.close());
    const paneId = server.session.snapshot().panes[0]!.id;
    expect(paneId).not.toBe(oldPaneId);
    expect(existsSync(join(stateDir, HISTORY))).toBe(false);
    expect(screenOf(server, paneId)).not.toContain("STALE_SCREEN");
  }, 60_000);

  it.each([
    ["壊れている", "{broken", "was corrupt"],
    ["形が合わない", JSON.stringify({ schema: 1, savedAt: "x", panes: "nope" }), "was corrupt"],
  ])("session-history.json が%sときも起動し、画面履歴なしで復元してログに残す（AC7）", async (_name, content, logText) => {
    const stateDir = await tempStateDir();
    const first = await start(stateDir, true);
    const paneId = first.session.snapshot().panes[0]!.id;
    await first.close();
    await writeFile(join(stateDir, HISTORY), content);

    const second = await start(stateDir, true);
    cleanups.unshift(() => second.close());
    expect(second.session.snapshot().panes.map((p) => p.id)).toContain(paneId);
    expect(screenOf(second, paneId)).not.toContain(MARKER);
    expect(await readFile(join(stateDir, "server.log"), "utf8")).toContain(logText);
    expect((await readdir(stateDir)).filter((n) => n.startsWith("session-history") && n !== HISTORY)).toEqual([]); // 退避コピーを作らない
  }, 60_000);

  it("画面履歴を書けなくても停止は続き、session.json は保存され、失敗はログに残る（AC13）", async () => {
    const stateDir = await tempStateDir();
    const server = await start(stateDir, true);
    await server.session.createWorkspace(process.cwd(), "second-ws");
    await mkdir(join(stateDir, HISTORY)); // 同じ名前のディレクトリがあるので rename で置き換えられない
    await server.close();
    const session = JSON.parse(await readFile(join(stateDir, "session.json"), "utf8")) as { workspaces: { label: string }[] };
    expect(session.workspaces.map((w) => w.label)).toContain("second-ws");
    expect(await readFile(join(stateDir, "server.log"), "utf8")).toContain("pane history save failed");
  }, 60_000);
});

/** 20260926-named-session-ui（AC1・AC4・AC8・AC10〜AC12・AC14）。 */
describe("composeServer — 名前付き session の表示・一覧・Cookie・ポートの記憶", () => {
  const cleanups: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0)) await fn();
  });
  async function tempBase(): Promise<string> {
    const base = await makeTempDir("soda-compose-named-ui-");
    cleanups.push(() => rm(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    return base;
  }
  async function readRecord(dir: string): Promise<{ port: number; pid: number; https: boolean; host: string }> {
    return JSON.parse(await readFile(join(dir, "serve.json"), "utf8")) as { port: number; pid: number; https: boolean; host: string };
  }

  it("名前付き session はスナップショットの host に名前を載せ、Cookie の名前を分け、一覧で自分を current として開くための情報を返す。既定の session は名前を載せない（AC1・AC4・AC8）", async () => {
    const base = await tempBase();
    const def = await composeServerOnFreePort({ host: "127.0.0.1", stateDir: base, origin: [] });
    cleanups.unshift(() => def.close());
    const work = await composeServerOnFreePort({ host: "127.0.0.1", stateDir: base, session: "work", origin: [] });
    cleanups.unshift(() => work.close());

    expect(work.session.snapshot().host.sessionName).toBe("work");
    expect("sessionName" in def.session.snapshot().host).toBe(false);

    // ログインの Cookie の名前（名前付きは soda_session_work、既定は soda_session のまま）
    const login = async (server: typeof work): Promise<string> => {
      const origin = `http://127.0.0.1:${server.options.port}`;
      const res = await fetch(`${origin}/api/login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin, host: `127.0.0.1:${server.options.port}` },
        body: JSON.stringify({ token: server.freshToken }),
      });
      expect(res.status).toBe(204);
      return res.headers.get("set-cookie")!.split(";")[0]!;
    };
    const workCookie = await login(work);
    expect(workCookie.startsWith("soda_session_work=")).toBe(true);
    expect((await login(def)).startsWith("soda_session=")).toBe(true);

    // 認証済みの WebSocket で server.sessions を取る
    const port = work.options.port;
    const origin = `http://127.0.0.1:${port}`;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { cookie: workCookie, origin, host: `127.0.0.1:${port}` } });
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    cleanups.unshift(async () => {
      ws.close();
    });
    const hello = (await requestUntilMatchingId(ws, "h1", "client.hello", { protocol: 1, kind: "desktop" })) as { snapshot: { host: { sessionName?: string } } };
    expect(hello.snapshot.host.sessionName).toBe("work");
    const result = (await requestUntilMatchingId(ws, "s1", "server.sessions", {})) as { sessions: unknown[] };
    expect(result.sessions).toEqual([
      { name: "default", default: true, running: true, current: false, endpoint: { port: def.options.port, https: false, host: "127.0.0.1" } },
      { name: "work", default: false, running: true, current: true, endpoint: { port, https: false, host: "127.0.0.1" } },
    ]);
    // 既定の session の Cookie だけでは名前付き session の /ws に入れない（別の session の Cookie は読まない）
    const defCookie = workCookie.replace(/^soda_session_work=/, "soda_session=");
    const rejected = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { cookie: defCookie, origin, host: `127.0.0.1:${port}` } });
    const status = await new Promise<number | undefined>((resolve) => {
      rejected.once("unexpected-response", (_req, res) => resolve(res.statusCode));
      rejected.once("open", () => resolve(101));
      rejected.once("error", () => resolve(undefined));
    });
    rejected.terminate();
    expect(status).toBe(401);
  }, 30_000);

  it("名前付き session は待ち受けたポートを記録し、--port の無い次の起動でそのポートを使う。--port を付ければそのポートで記録も変わる（AC10・AC16 の出所）", async () => {
    const base = await tempBase();
    const dir = join(base, "sessions", "work");
    const first = await composeServerOnFreePort({ host: "127.0.0.1", stateDir: base, session: "work", origin: [] });
    const p = first.options.port;
    expect(first.options.portSource).toBe("flag");
    expect(await readRecord(dir)).toMatchObject({ port: p, pid: process.pid, https: false, host: "127.0.0.1" });
    await first.close();

    // 記録したポートを試すので、閉じたポート p を固定して取り直す（その間に別のプロセスが p を取ると EADDRINUSE で落ちうる。
    // 番号を先に取る競合——20260926-load-flaky-tests の D3——と同じ型だが、記録したポートを使うこと自体が確かめたい振る舞いなので避けない）。
    const again = await composeServer({ host: "127.0.0.1", stateDir: base, session: "work", origin: [] });
    expect(again.options.port).toBe(p);
    expect(again.options.portSource).toBe("remembered");
    await again.listen();
    cleanups.unshift(() => again.close());
    expect(again.httpServer.server.address()).toMatchObject({ port: p });
    await again.close();
    cleanups.shift();

    const moved = await composeServerOnFreePort({ host: "127.0.0.1", stateDir: base, session: "work", origin: [] });
    cleanups.unshift(() => moved.close());
    expect(moved.options.port).not.toBe(p); // 別の空きポート（--port 付き）
    expect((await readRecord(dir)).port).toBe(moved.options.port);
  }, 30_000);

  it("記録が壊れている・範囲外なら既定の 7780（止まらない）。既定の session は記録があっても 7780（AC11・AC12）", async () => {
    const base = await tempBase();
    const dir = join(base, "sessions", "work");
    await mkdir(dir, { recursive: true });
    for (const raw of ["{broken", JSON.stringify({ schema: 1, pid: 1, hostname: "h", port: 70000, https: false, host: "127.0.0.1" })]) {
      await writeFile(join(dir, "serve.json"), raw);
      const s = await composeServer({ host: "127.0.0.1", stateDir: base, session: "work", origin: [] });
      expect(s.options.port).toBe(7780);
      expect(s.options.portSource).toBe("default");
    }
    await writeFile(join(base, "serve.json"), JSON.stringify({ schema: 1, pid: 1, hostname: "h", port: 9999, https: false, host: "127.0.0.1" }));
    const def = await composeServer({ host: "127.0.0.1", stateDir: base, origin: [] });
    expect(def.options.port).toBe(7780);
    expect(def.options.portSource).toBe("default");
    const defDefault = await composeServer({ host: "127.0.0.1", stateDir: base, session: "default", origin: [] });
    expect(defDefault.options.port).toBe(7780);
  });

  it("既定の session も待ち受けたポートを記録する（一覧の開くための情報。AC12）", async () => {
    const base = await tempBase();
    const def = await composeServerOnFreePort({ host: "127.0.0.1", stateDir: base, origin: [] });
    cleanups.unshift(() => def.close());
    expect((await readRecord(base)).port).toBe(def.options.port);
  });

  it("起動の記録を書けなくても起動は続き、失敗はログに残る", async () => {
    const base = await tempBase();
    await mkdir(join(base, "serve.json", "blocker"), { recursive: true }); // ディレクトリがあると rename で置き換えられない
    const def = await composeServerOnFreePort({ host: "127.0.0.1", stateDir: base, origin: [] });
    cleanups.unshift(() => def.close());
    expect(def.httpServer.server.listening).toBe(true);
    expect(await readFile(join(base, "server.log"), "utf8")).toContain("cannot write serve.json");
  });

  it("SODA_SESSION から選んだ名前付き session が使用中なら、案内に SODA_SESSION を添える（AC14）", async () => {
    const base = await tempBase();
    const first = await composeServerOnFreePort({ host: "127.0.0.1", stateDir: base, session: "work", origin: [] });
    cleanups.unshift(() => first.close());
    const second = await composeServer({ host: "127.0.0.1", stateDir: base, session: "work", sessionSource: "env", port: "1", origin: [] });
    const err = await second.listen().then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ConfigError);
    expect((err as ConfigError).hint).toContain("SODA_SESSION");
    const third = await composeServer({ host: "127.0.0.1", stateDir: base, session: "work", port: "1", origin: [] }); // ロックで断られるので bind しない
    const err2 = await third.listen().then(
      () => undefined,
      (e: unknown) => e,
    );
    expect((err2 as ConfigError).hint).not.toContain("SODA_SESSION");
  });
});
