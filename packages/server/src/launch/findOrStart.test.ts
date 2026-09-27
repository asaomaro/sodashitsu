import { appendFileSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTempDir } from "../persist/atomicFile.js";
import { composeServerOnFreePort } from "../composeServerOnFreePort.js";
import type { ComposedServer } from "../composeServer.js";
import { STATE_DIR_LOCK_FILE } from "../persist/StateDirLock.js";
import {
  findOrStart,
  LaunchError,
  redactTokens,
  tokenNotice,
  type FindOrStartOptions,
} from "./findOrStart.js";
import { openWs } from "./localHttp.js";
import { placeholderEntry } from "./placeholderEntry.js";
import type { SpawnedServe, SpawnServeRequest } from "./spawnDetached.js";
import { runTuiCommand } from "./tuiCommand.js";
import { parseArgs } from "../cliArgs.js";

/**
 * 20260927-cli-mode の T5：引数なしの `soda` がサーバを見つける・裏で起動する・準備完了を待つ。子の起動は差し替え、同じプロセスの中で実物の `composeServer`
 * （一時の状態ディレクトリ・乱数ポート）を立てる——ロック・`serve.json`・`local-auth.json`・`/api/local-login`・`/ws` の 503 は実物のまま通る。
 * 実際に切り離して起動する経路は `spawnDetached.test.ts`。
 */
vi.setConfig({ testTimeout: 30_000 });

describe("findOrStart", () => {
  const cleanups: (() => Promise<unknown> | unknown)[] = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  async function tempStateDir(): Promise<string> {
    const dir = await makeTempDir("soda-find-");
    cleanups.push(() => rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    return dir;
  }

  function track(server: ComposedServer): ComposedServer {
    let closed = false;
    const close = server.close.bind(server);
    server.close = async () => {
      if (closed) return;
      closed = true;
      await close();
    };
    cleanups.push(() => server.close());
    return server;
  }

  function options(stateDir: string, extra: Partial<FindOrStartOptions> = {}): FindOrStartOptions {
    return {
      serve: { origin: [], stateDir },
      allowNested: false,
      env: {},
      cwd: process.cwd(),
      platform: process.platform,
      execPath: process.execPath,
      execArgv: [],
      mainPath: "/nonexistent/main.js",
      ...extra,
    };
  }

  /** 子の `soda serve` の代わりに、同じプロセスで実物のサーバを立てる。起動の表示（token）は serve.out へ書く。 */
  function inProcessSpawn(calls: SpawnServeRequest[] = []) {
    return async (req: SpawnServeRequest): Promise<SpawnedServe> => {
      calls.push(req);
      const at = (flag: string): string | undefined => {
        const i = req.args.indexOf(flag);
        return i === -1 ? undefined : req.args[i + 1];
      };
      let exited = false;
      const out = (line: string): void => appendFileSync(req.outPath, `${line}\n`);
      void composeServerOnFreePort(
        {
          host: "127.0.0.1",
          stateDir: at("--state-dir")!,
          ...(at("--session") !== undefined ? { session: at("--session")! } : {}),
          origin: [],
        },
        {
          start: async (server) => {
            await server.listen();
            track(server);
            if (server.freshToken !== undefined) {
              out(`soda: listening on 127.0.0.1 port ${server.options.port} (http)`);
              out(`soda: open http://127.0.0.1:${server.options.port}/#token=${server.freshToken}`);
              out("soda: (token 付きの URL は今だけ表示します)");
            }
          },
        },
      ).catch((err: unknown) => {
        out(`soda: ${err instanceof Error ? err.message : String(err)}`);
        exited = true;
      });
      return { method: "detached", pid: process.pid, hasExited: () => exited };
    };
  }

  const noSpawn = (): Promise<SpawnedServe> => Promise.reject(new Error("must not spawn"));

  it("動いていれば起動せずに繋ぎ先を返す。login() は最初に準備完了の cookie、以後は秘密で取り直す", async () => {
    const stateDir = await tempStateDir();
    const server = track(
      await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] }),
    );
    const target = await findOrStart(options(stateDir), { spawnServe: noSpawn });
    expect(target.baseUrl).toBe(`http://127.0.0.1:${server.options.port}`);
    expect(target.origin).toBe(target.baseUrl);
    expect(target.stateDir).toBe(stateDir);
    expect(target.startupNotice).toBeUndefined();
    expect(target.certSha256).toBeUndefined();
    const first = await target.login();
    const second = await target.login();
    expect(first).toMatch(/^soda_session=/);
    expect(second).toMatch(/^soda_session=/);
    expect(second).not.toBe(first);
    for (const cookie of [first, second]) {
      const probe = await openWs(target, cookie);
      expect(probe.kind).toBe("open");
      if (probe.kind === "open") probe.ws.close();
    }
  });

  it("動いていなければ裏で起動し、準備完了を待って、serve.out の token を知らせにして空にする。子の引数は serve --state-dir --session", async () => {
    const root = await tempStateDir();
    const calls: SpawnServeRequest[] = [];
    const target = await findOrStart(
      options(root, { serve: { origin: [], stateDir: root, session: "work" } }),
      {
        spawnServe: inProcessSpawn(calls),
      },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args).toEqual([
      "/nonexistent/main.js",
      "serve",
      "--state-dir",
      root,
      "--session",
      "work",
    ]);
    expect(calls[0]!.outPath).toBe(join(root, "sessions", "work", "serve.out"));
    expect(target.session).toBe("work");
    expect(target.stateDir).toBe(join(root, "sessions", "work"));
    expect(target.startupNotice).toMatch(/#token=/);
    expect(target.startupNotice).toContain("今だけ表示します");
    expect(target.startupNotice).not.toContain("listening on");
    expect(await readFile(calls[0]!.outPath, "utf8")).toBe("");
    const probe = await openWs(target, await target.login());
    expect(probe.kind).toBe("open");
    if (probe.kind === "open") probe.ws.close();
  });

  it("同時に 2 つ起動しても、使用中で終わった側はやり直して同じサーバへ繋ぐ", async () => {
    const stateDir = await tempStateDir();
    const calls: SpawnServeRequest[] = [];
    const spawn = inProcessSpawn(calls);
    const [a, b] = await Promise.all([
      findOrStart(options(stateDir), { spawnServe: spawn }),
      findOrStart(options(stateDir), { spawnServe: spawn }),
    ]);
    expect(a.baseUrl).toBe(b.baseUrl);
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls.length).toBeLessThanOrEqual(2);
    // 初回の token は、負けた側がやり直す前に serve.out を空にして失わない（どちらかの soda で必ず見える）。
    expect([a, b].some((t) => t.startupNotice?.includes("#token=") === true)).toBe(true);
  });

  it("最後の試行で子が「使用中」で終わっても、動いている持ち主へ繋ぐ", async () => {
    const stateDir = await tempStateDir();
    let server: ComposedServer | undefined;
    const loser = async (req: SpawnServeRequest): Promise<SpawnedServe> => {
      // 同時に別の soda がロックを取った状況：持ち主を立ててから、こちらの子は使用中で終わる。
      server = track(await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] }));
      // serve.out は 2 つの子で共有する。勝った側の子の初回の token の行が先に書かれている。
      await writeFile(
        req.outPath,
        "soda: open http://127.0.0.1:1/#token=WINNERTOKEN\nsoda: (token 付きの URL は今だけ表示します)\nsoda: the state dir is already in use by another soda\n",
      );
      return { method: "detached", pid: 1, hasExited: () => true };
    };
    const target = await findOrStart(options(stateDir), { spawnServe: loser, maxStartAttempts: 1 });
    expect(target.baseUrl).toBe(`http://127.0.0.1:${server!.options.port}`);
    // 勝った側の token の行を、やり直しの前に捨てずに見せる。
    expect(target.startupNotice).toContain("#token=WINNERTOKEN");
  });

  it("ローカルログインが断られたら、秘密を読み直して 1 回だけやり直し、だめなら案内つきで断る（回数の制限まで繰り返さない）", async () => {
    const stateDir = await tempStateDir();
    const server = track(
      await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] }),
    );
    await writeFile(
      join(stateDir, "local-auth.json"),
      JSON.stringify({ secret: "wrong", pid: process.pid, createdAt: "" }),
    );
    const err = await findOrStart(options(stateDir), {
      spawnServe: noSpawn,
      timeoutMs: 10_000,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LaunchError);
    expect((err as LaunchError).message).toContain("local login was refused (HTTP 401)");
    // 2 回だけ失敗した（5 回で締め出される制限に掛かっていない）：token のログインはまだ通る。
    const port = server.options.port;
    const origin = `http://127.0.0.1:${port}`;
    const res = await fetch(`${origin}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
      body: JSON.stringify({ token: server.freshToken }),
    });
    expect(res.status).toBe(204);
  });

  it("子が準備完了の前に終わったら、serve.out の内容を案内にして断る", async () => {
    const stateDir = await tempStateDir();
    const failing = async (req: SpawnServeRequest): Promise<SpawnedServe> => {
      await writeFile(
        req.outPath,
        "soda: cannot listen on 127.0.0.1:7780: EADDRINUSE\nそのポートは別のプロセスが使っています。\n",
      );
      return { method: "detached", pid: 1, hasExited: () => true };
    };
    const err = await findOrStart(options(stateDir), { spawnServe: failing }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(LaunchError);
    expect((err as LaunchError).message).toContain("exited before it became ready");
    expect((err as LaunchError).hint).toContain("EADDRINUSE");
    expect(await readFile(join(stateDir, "serve.out"), "utf8")).toBe("");
  });

  it("準備完了にならなければ時間切れで断る（サーバは止めない）", async () => {
    const stateDir = await tempStateDir();
    const never = async (req: SpawnServeRequest): Promise<SpawnedServe> => {
      await writeFile(
        req.outPath,
        "soda: open http://127.0.0.1:1/#token=SECRETTOKEN\nsoda: (token 付きの URL は今だけ表示します)\nstill starting\n",
      );
      return { method: "detached", pid: 1, hasExited: () => false };
    };
    const err = await findOrStart(options(stateDir), { spawnServe: never, timeoutMs: 300 }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(LaunchError);
    expect((err as LaunchError).message).toContain("did not become ready");
    expect((err as LaunchError).hint).toContain("still starting");
    expect((err as LaunchError).hint).toContain("server.log");
    // 末尾の token は伏せ、token は知らせとして一度だけ見せ、serve.out は空にする。
    const hint = (err as LaunchError).hint;
    expect(hint).toContain("#token=<redacted>");
    expect(hint.split("SECRETTOKEN").length - 1).toBe(1);
    expect(await readFile(join(stateDir, "serve.out"), "utf8")).toBe("");
  });

  it("redactTokens は token の URL と「今回作成」の行の token を伏せる", () => {
    expect(
      redactTokens(
        "soda: open http://a/#token=abc\nsoda: token（今回作成・この表示が最後）: xyz\nother",
      ),
    ).toBe(
      "soda: open http://a/#token=<redacted>\nsoda: token（今回作成・この表示が最後）: <redacted>\nother",
    );
  });

  it("入れ子（SODA_PANE_ID）は --allow-nested が無ければ断る", async () => {
    const stateDir = await tempStateDir();
    const err = await findOrStart(options(stateDir, { env: { SODA_PANE_ID: "p1" } }), {
      spawnServe: noSpawn,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LaunchError);
    expect((err as LaunchError).hint).toContain("--allow-nested");
    const server = track(
      await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] }),
    );
    const target = await findOrStart(
      options(stateDir, { env: { SODA_PANE_ID: "p1" }, allowNested: true }),
      { spawnServe: noSpawn },
    );
    expect(target.baseUrl).toContain(String(server.options.port));
  });

  it("ロックの持ち主が別のホストなら断る", async () => {
    const stateDir = await tempStateDir();
    await writeFile(join(stateDir, STATE_DIR_LOCK_FILE), "12345\nsome-other-host\n");
    const err = await findOrStart(options(stateDir), { spawnServe: noSpawn }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(LaunchError);
    expect((err as LaunchError).message).toContain("some-other-host");
  });

  it("tokenNotice は token の行と「今だけ」の注記だけを拾う", () => {
    expect(
      tokenNotice(
        "soda: listening on x\nsoda: open http://a/#token=abc\nsoda: (token 付きの URL は今だけ表示します)\n",
      ),
    ).toBe("soda: open http://a/#token=abc\nsoda: (token 付きの URL は今だけ表示します)");
    expect(tokenNotice("soda: token（今回作成）: abc\n")).toBe("soda: token（今回作成）: abc");
    expect(tokenNotice("soda: open http://a/\nsoda: token を忘れた場合は…\n")).toBeUndefined();
  });

  it("runTuiCommand: 仮の入口は local-login → /ws → client.hello（desktop）で繋ぎ、繋ぎ先を 1 行表示して 0。断る事情は案内つきの 1", async () => {
    const stateDir = await tempStateDir();
    const server = track(
      await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] }),
    );
    const out: string[] = [];
    const err: string[] = [];
    const io = { out: (l: string) => out.push(l), err: (l: string) => err.push(l) };
    const proc = {
      env: {},
      cwd: process.cwd(),
      platform: process.platform,
      execPath: process.execPath,
      execArgv: [],
      mainPath: "/x/main.js",
    };
    const code = await runTuiCommand(
      parseArgs(["--state-dir", stateDir]),
      placeholderEntry(io),
      io,
      proc,
      { spawnServe: noSpawn },
    );
    expect(code).toBe(0);
    expect(out).toEqual([
      `soda: connected to http://127.0.0.1:${server.options.port} (tui not yet available)`,
    ]);
    const nested = await runTuiCommand(
      parseArgs(["--state-dir", stateDir]),
      placeholderEntry(io),
      io,
      { ...proc, env: { SODA_PANE_ID: "p1" } },
      { spawnServe: noSpawn },
    );
    expect(nested).toBe(1);
    expect(err.join("\n")).toContain("--allow-nested");
  });
});
