import { appendFileSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
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
import { startupLines } from "../startupBanner.js";
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
            // 実物の `soda serve`（main.ts）と同じく、待ち受けた後に起動の表示を書く。
            for (const line of startupLines({
              scheme: "http",
              host: "127.0.0.1",
              port: server.options.port,
              extraOrigins: [],
              lanAddresses: [],
              freshToken: server.freshToken,
            }))
              out(line);
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
  });

  // ラウンド 2 の点検（順序を決めて再現）：両方が起動を決めた後、勝った側の子がロックを取って待ち受け、少し後に起動の表示（token）を書き、その後で負けた側の子が
  // 「使用中」で終わる。token は起動した子が準備完了になった側（取った側）にだけ、ちょうど一度出る（負けた側が読んで消さない・負けた側にも出さない）。
  it("同時の起動で、token は取った側にだけちょうど一度出る（負けた側は serve.out を読みも消しもしない）", async () => {
    const stateDir = await tempStateDir();
    let secondSpawned: () => void = () => undefined;
    const bothSpawned = new Promise<void>((r) => (secondSpawned = r));
    let loserExited = false;
    // 負けた側が「使用中」で終わったのを見たら解ける（負荷の下でも順序を決める：最後の行はその後に書く）。
    let loserSawExit: () => void = () => undefined;
    const sawExit = new Promise<void>((r) => (loserSawExit = r));
    const order: string[] = [];
    const spawn = async (req: SpawnServeRequest): Promise<SpawnedServe> => {
      order.push(req.cwd);
      if (order.length === 2) {
        secondSpawned();
        // 負けた側は WMI の経路で起動した形（pid は間の cmd.exe なので持ち主と比べられない）——「使用中」で終わるのを見て、やり直しの経路を通る。
        return {
          method: "wmi",
          pid: 1,
          hasExited: () => {
            if (loserExited) loserSawExit();
            return loserExited;
          },
        };
      }
      void (async () => {
        await bothSpawned;
        const server = track(
          await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] }),
        );
        await new Promise((r) => setTimeout(r, 400)); // `/ws` は受け付け済み。起動の表示はまだ（実物の main.ts と同じ順）
        // token の行を書く → 負けた側の子が「使用中」で終わる → 負けた側がそれを見るだけの間を置いてから、表示の最後の行を書く。
        appendFileSync(
          req.outPath,
          `soda: listening on 127.0.0.1 port ${server.options.port} (http)\nsoda: open http://127.0.0.1:${server.options.port}/#token=TOK_A\n`,
        );
        appendFileSync(req.outPath, "soda: the state dir is already in use by another soda\n");
        loserExited = true;
        await sawExit;
        appendFileSync(req.outPath, "soda: (token 付きの URL は今だけ表示します)\n");
      })();
      return { method: "detached", pid: process.pid, hasExited: () => false };
    };
    const dirA = await tempStateDir();
    const dirB = await tempStateDir();
    const [a, b] = await Promise.all([
      findOrStart(options(stateDir, { cwd: dirA }), { spawnServe: spawn }),
      findOrStart(options(stateDir, { cwd: dirB }), { spawnServe: spawn }),
    ]);
    expect(order).toHaveLength(2);
    const winner = order[0] === dirA ? a : b;
    const loser = order[0] === dirA ? b : a;
    expect(winner.startupNotice).toContain("#token=TOK_A");
    expect(loser.startupNotice).toBeUndefined();
  });

  it("起動した子が持ち主でなければ（同時に起動したほかの soda の子が先にロックを取った）、token を見せず・読まずに持ち主へ繋ぐ", async () => {
    const stateDir = await tempStateDir();
    const otherWon = async (req: SpawnServeRequest): Promise<SpawnedServe> => {
      const server = track(
        await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] }),
      );
      appendFileSync(
        req.outPath,
        `soda: open http://127.0.0.1:${server.options.port}/#token=OTHER\nsoda: (token 付きの URL は今だけ表示します)\n`,
      );
      return { method: "detached", pid: 1, hasExited: () => false }; // こちらの子（pid 1）はまだ終わっていない
    };
    const target = await findOrStart(options(stateDir), { spawnServe: otherWon });
    expect(target.startupNotice).toBeUndefined();
    expect(await readFile(join(stateDir, "serve.out"), "utf8")).toContain("#token=OTHER"); // 取った側のために残す
  }, 8000);

  // 02 の review：古い版の soda serve（local-auth.json を書かない）には 15 秒待たせずに案内して断る。
  it("持ち主と serve.json は合うのに local-auth.json が猶予を過ぎても無ければ、古い版のサーバとして案内して断る", async () => {
    const stateDir = await tempStateDir();
    track(await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] }));
    await rm(join(stateDir, "local-auth.json"));
    const t0 = Date.now();
    const err = await findOrStart(options(stateDir), {
      spawnServe: noSpawn,
      oldServerGraceMs: 200,
      timeoutMs: 5000,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LaunchError);
    expect((err as LaunchError).message).toContain("older version");
    expect((err as LaunchError).hint).toContain("soda handoff");
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  // 02 の review：時間切れで serve.out を読んで token を見せるのは、起動した側だけ。
  it("起動しなかった側の時間切れは serve.out を読まない・空にしない（起動した側の token を横取りしない）", async () => {
    const stateDir = await tempStateDir();
    // 生きている別のプロセス（このテストの親）が持ち主のロック。serve.json は無いので準備完了にならない。
    await writeFile(join(stateDir, STATE_DIR_LOCK_FILE), `${process.ppid}\n${hostname()}\n`);
    const out =
      "soda: open http://127.0.0.1:1/#token=THEIRS\nsoda: (token 付きの URL は今だけ表示します)\n";
    await writeFile(join(stateDir, "serve.out"), out);
    const err = await findOrStart(options(stateDir), { spawnServe: noSpawn, timeoutMs: 300 }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(LaunchError);
    expect((err as LaunchError).message).toContain("did not become ready");
    expect((err as LaunchError).hint).not.toContain("THEIRS");
    expect(await readFile(join(stateDir, "serve.out"), "utf8")).toBe(out);
  });

  it("最後の試行で子が「使用中」で終わっても、動いている持ち主へ繋ぐ（起動しなかった側なので token は出さない）", async () => {
    const stateDir = await tempStateDir();
    let server: ComposedServer | undefined;
    const loser = async (req: SpawnServeRequest): Promise<SpawnedServe> => {
      // 同時に別の soda がロックを取った状況：持ち主を立ててから、こちらの子は使用中で終わる。
      server = track(await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] }));
      await writeFile(
        req.outPath,
        "soda: open http://127.0.0.1:1/#token=WINNERTOKEN\nsoda: (token 付きの URL は今だけ表示します)\nsoda: the state dir is already in use by another soda\n",
      );
      return { method: "detached", pid: 1, hasExited: () => true };
    };
    const target = await findOrStart(options(stateDir), { spawnServe: loser, maxStartAttempts: 1 });
    expect(target.baseUrl).toBe(`http://127.0.0.1:${server!.options.port}`);
    expect(target.startupNotice).toBeUndefined();
  });

  // ラウンド 2 の点検：待ちの途中の Ctrl-C で読まれずに残った前の起動の行を、次の起動で見せない。
  it("前の起動の serve.out の行（読まれずに残った token 等）は、次の起動で見せない", async () => {
    const stateDir = await tempStateDir();
    await writeFile(
      join(stateDir, "serve.out"),
      "soda: open http://127.0.0.1:1/#token=OLDTOKEN\nsoda: (token 付きの URL は今だけ表示します)\n",
    );
    const target = await findOrStart(options(stateDir), { spawnServe: inProcessSpawn() });
    expect(target.startupNotice).toContain("#token=");
    expect(target.startupNotice).not.toContain("OLDTOKEN");
  });

  // ラウンド 2 の点検：`/ws` は起動の表示より先に受け付け始める。表示の最後の行が書かれるまで準備完了としない。
  it("起動した子の起動の表示（最後の行）が書かれるまで準備完了としない（token の行を書く前に読んで失わない）", async () => {
    const stateDir = await tempStateDir();
    const slowBanner = async (req: SpawnServeRequest): Promise<SpawnedServe> => {
      void (async () => {
        const server = track(
          await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] }),
        );
        await new Promise((r) => setTimeout(r, 400)); // 待ち受け・/ws は受け付け済み。表示はまだ
        appendFileSync(
          req.outPath,
          `soda: open http://127.0.0.1:${server.options.port}/#token=${server.freshToken}\nsoda: (token 付きの URL は今だけ表示します)\n`,
        );
      })();
      return { method: "detached", pid: process.pid, hasExited: () => false };
    };
    const target = await findOrStart(options(stateDir), { spawnServe: slowBanner });
    expect(target.startupNotice).toContain("#token=");
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
    let helps = 0;
    const io = {
      out: (l: string) => out.push(l),
      err: (l: string) => err.push(l),
      help: () => void helps++,
    };
    const proc = {
      isTty: true,
      env: {},
      cwd: process.cwd(),
      platform: process.platform,
      execPath: process.execPath,
      execArgv: [],
      mainPath: "/x/main.js",
    };
    const code = await runTuiCommand(
      parseArgs(["--state-dir", stateDir]),
      async () => placeholderEntry(io),
      io,
      proc,
      { spawnServe: noSpawn },
    );
    expect(code).toBe(0);
    expect(out).toEqual([
      `soda: connected to http://127.0.0.1:${server.options.port} (tui not yet available)`,
    ]);
    // 終わるときにセッションを返す（auth.json にセッションが残らない。02 の review）。
    const authJson = JSON.parse(await readFile(join(stateDir, "auth.json"), "utf8")) as {
      sessions: unknown[];
    };
    expect(authJson.sessions).toEqual([]);
    const nested = await runTuiCommand(
      parseArgs(["--state-dir", stateDir]),
      async () => placeholderEntry(io),
      io,
      { ...proc, env: { SODA_PANE_ID: "p1" } },
      { spawnServe: noSpawn },
    );
    expect(nested).toBe(1);
    expect(err.join("\n")).toContain("--allow-nested");
    expect(helps).toBe(0);
  });

  // 02 の review：端末でなければサーバを起動せずに（起動の前に）断り、help を出して 2。
  it("runTuiCommand: 標準入出力が端末でなければ、サーバを起動せずに一行の案内と help を出して 2（--state-dir・--session の形も同じ）", async () => {
    const stateDir = await tempStateDir();
    const err: string[] = [];
    let helps = 0;
    const io = { out: () => undefined, err: (l: string) => err.push(l), help: () => void helps++ };
    const spawned: SpawnServeRequest[] = [];
    const proc = {
      isTty: false,
      env: {},
      cwd: process.cwd(),
      platform: process.platform,
      execPath: process.execPath,
      execArgv: [],
      mainPath: "/x/main.js",
    };
    for (const argv of [
      [],
      ["--state-dir", stateDir],
      ["--session", "w", "--state-dir", stateDir],
    ]) {
      const code = await runTuiCommand(
        parseArgs(argv),
        async () => placeholderEntry(io),
        io,
        proc,
        {
          spawnServe: async (req) => {
            spawned.push(req);
            throw new Error("must not spawn");
          },
        },
      );
      expect(code, argv.join(" ")).toBe(2);
    }
    expect(spawned).toEqual([]);
    expect(helps).toBe(3);
    expect(err[0]).toContain("needs a terminal");
  });

  // 03 の T6 の点検：端末版の読み込みに失敗したら、サーバを探す・起動する前に案内して 1（裏でサーバだけが残らない・生のスタックを出さない）。
  it("runTuiCommand: 端末版を読み込めなければサーバを起動せずに案内して 1", async () => {
    const stateDir = await tempStateDir();
    const err: string[] = [];
    const io = { out: () => undefined, err: (l: string) => err.push(l), help: () => undefined };
    const spawned: SpawnServeRequest[] = [];
    const code = await runTuiCommand(
      parseArgs(["--state-dir", stateDir]),
      async () => {
        throw new Error("Cannot find package '@sodashitsu/tui'");
      },
      io,
      {
        isTty: true,
        env: {},
        cwd: process.cwd(),
        platform: process.platform,
        execPath: process.execPath,
        execArgv: [],
        mainPath: "/x/main.js",
      },
      {
        spawnServe: async (req) => {
          spawned.push(req);
          throw new Error("must not spawn");
        },
      },
    );
    expect(code).toBe(1);
    expect(spawned).toEqual([]);
    expect(err[0]).toBe(
      "soda: the terminal UI could not be loaded (Cannot find package '@sodashitsu/tui')",
    );
    expect(err.join("\n")).toContain("pnpm build");
  });
});
