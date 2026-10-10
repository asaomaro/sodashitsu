import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { connect as netConnect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { agentReportSocketPathFor } from "./config.js";
import { composeServerOnFreePort } from "./composeServerOnFreePort.js";
import type { ComposedServer } from "./composeServer.js";
import { assertPaneResolvesFake } from "./testing/fakeAgentGuard.js";

/**
 * 20261009-agent-resume-lost の AC1（再現）と回帰。実物の `composeServer`（自前の一時 stateDir）・実 PTY の bash・偽の `claude`
 * （画面の判定に当たる）の上で、会話の参照（`pane.agentSession`）が、エージェントのプロセスの終わり方でどう変わるかを調べる。
 * 動いている利用者のサーバ・状態のフォルダには触らない（HOME も一時のフォルダ）。
 */
vi.setConfig({ testTimeout: 60_000 });

const fakeAgent = `
process.stdin.setRawMode(true);
process.stdout.write("\\u001b]0;\\u2733 fake\\u0007fake agent ready\\r\\n");
process.stdin.on("data", (d) => {
  if (String(d).includes("q")) process.exit(0);
});
setInterval(() => {}, 1000);
`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(process.platform !== "linux" || !existsSync("/bin/bash"))("composeServer: 会話の参照が消える道（20261009-agent-resume-lost）", () => {
  let dir: string;
  let savedEnv: Record<string, string | undefined> = {};
  const cleanups: (() => Promise<unknown> | unknown)[] = [];

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "soda-resumelost-it-"));
    await mkdir(join(dir, "bin"));
    await writeFile(join(dir, "fake-agent.mjs"), fakeAgent);
    const wrapper = join(dir, "bin", "claude");
    await writeFile(
      wrapper,
      `#!/bin/bash\necho "$@" >> ${JSON.stringify(join(dir, "claude-args.log"))}\nexec -a claude ${JSON.stringify(process.execPath)} ${JSON.stringify(join(dir, "fake-agent.mjs"))} "$@"\n`,
    );
    await chmod(wrapper, 0o755);
    savedEnv = { HOME: process.env["HOME"], PATH: process.env["PATH"], ENV: process.env["ENV"] };
    process.env["HOME"] = dir;
    process.env["PATH"] = `${join(dir, "bin")}:${process.env["PATH"] ?? "/usr/bin:/bin"}`;
    delete process.env["ENV"];
  });
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });
  afterAll(async () => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    if (dir) await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  async function boot(stateDir: string): Promise<ComposedServer> {
    const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [], shell: "/bin/bash" });
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
  const agentOf = (s: ComposedServer, paneId: string) => s.session.getPane(paneId)?.agent ?? null;
  async function shellReady(server: ComposedServer, paneId: string): Promise<void> {
    const marker = join(dir, `ready-${server.options.port}-${paneId}`);
    server.terminals.get(paneId)!.write(`touch ${JSON.stringify(marker)}\r`);
    await vi.waitFor(() => expect(existsSync(marker)).toBe(true), { timeout: 10_000, interval: 50 });
    await assertPaneResolvesFake({ write: (input) => server.terminals.get(paneId)!.write(input), name: "claude", fakeDir: join(dir, "bin"), scratchDir: dir });
  }
  async function bootWithAgent(stateDir: string, sessionId: string) {
    const server = await boot(stateDir);
    const paneId = server.session.snapshot().panes[0]!.id;
    await shellReady(server, paneId);
    server.terminals.get(paneId)!.write("claude\r");
    await vi.waitFor(() => expect(agentOf(server, paneId)).not.toBeNull(), { timeout: 15_000, interval: 50 });
    await report(stateDir, { paneId, kind: "claude", sessionId });
    await vi.waitFor(() => expect(server.session.getPane(paneId)?.agentSession?.sessionId).toBe(sessionId));
    return { server, paneId };
  }
  const report = (stateDir: string, body: Record<string, unknown>): Promise<void> =>
    new Promise((resolve, reject) => {
      const c = netConnect(agentReportSocketPathFor(stateDir), () => c.end(`${JSON.stringify(body)}\n`));
      c.on("close", () => resolve());
      c.on("error", reject);
    });
  const killAgent = (signal: string) => {
    try {
      execFileSync("pkill", [`-${signal}`, "-f", join(dir, "fake-agent.mjs")]);
    } catch {
      /* 見つからなければ 1 で終わる */
    }
  };
  async function savedRef(stateDir: string): Promise<unknown> {
    const file = join(stateDir, "session.json");
    const data = JSON.parse(await readFile(file, "utf8")) as { workspaces: { tabs: { layout: unknown }[] }[] };
    return JSON.stringify(data).match(/"agentSession":(\{[^}]*\}|null)/)?.[1] ?? "(なし)";
  }

  const resumeLines = async (id: string) =>
    existsSync(join(dir, "claude-args.log")) ? (await readFile(join(dir, "claude-args.log"), "utf8")).trim().split("\n").filter((l) => l === `--resume ${id}`) : [];
  const savedHas = async (stateDir: string, id: string) => JSON.stringify(JSON.parse(await readFile(join(stateDir, "session.json"), "utf8"))).includes(id);

  // AC1 で再現した道: サーバが動いているうちに、エージェントのプロセスだけが先に終わる（システムの停止でプロセスがばらばらに終わる）。
  // 直す前は、判定が「居なくなった」と見た時点で参照を捨てて保存したので、次の起動で再開されなかった。
  for (const signal of ["KILL", "TERM", "HUP"]) {
    it(`(a) エージェントのプロセスが ${signal} で先に終わっても、すぐ後にサーバが止まれば、参照は残り、次の起動で再開される（AC1・AC2）`, async () => {
      const stateDir = await mkdtemp(join(dir, "state-"));
      const id = `conv-${signal}`;
      const { server, paneId } = await bootWithAgent(stateDir, id);
      const before = (await resumeLines(id)).length;
      killAgent(signal);
      await vi.waitFor(() => expect(agentOf(server, paneId)).toBeNull(), { timeout: 15_000, interval: 50 });
      expect(server.session.getPane(paneId)?.agentSession?.sessionId).toBe(id); // 直す前: null
      await server.close();
      expect(await savedHas(stateDir, id)).toBe(true); // 直す前: 保存から消えていた
      const again = await boot(stateDir);
      await vi.waitFor(async () => expect((await resumeLines(id)).length).toBe(before + 1), { timeout: 15_000 });
      await again.close();
    });
  }

  // 猶予（10 秒）の長さを守る: 先に終わってから、猶予より短い間（3 秒。監視の周期より十分長い）待っても、参照は残る。猶予を 0 にすると、この間に捨てられて落ちる。
  it("(a'') エージェントが先に終わって 3 秒後に止めても、参照は残り、次の起動で再開される（猶予の長さ）", async () => {
    const stateDir = await mkdtemp(join(dir, "state-"));
    const id = "conv-grace";
    const { server, paneId } = await bootWithAgent(stateDir, id);
    const before = (await resumeLines(id)).length;
    killAgent("KILL");
    await vi.waitFor(() => expect(agentOf(server, paneId)).toBeNull(), { timeout: 15_000, interval: 50 });
    await sleep(3_000);
    expect(server.session.getPane(paneId)?.agentSession?.sessionId).toBe(id);
    await server.close();
    expect(await savedHas(stateDir, id)).toBe(true);
    const again = await boot(stateDir);
    await vi.waitFor(async () => expect((await resumeLines(id)).length).toBe(before + 1), { timeout: 15_000 });
    await again.close();
  });

  it("(a') 止まる処理に入った後に、先に終わったエージェントがあっても、参照は捨てない（AC2）", async () => {
    const stateDir = await mkdtemp(join(dir, "state-"));
    const { server, paneId } = await bootWithAgent(stateDir, "conv-late");
    server.session.beginShutdown();
    killAgent("KILL");
    await vi.waitFor(() => expect(agentOf(server, paneId)).toBeNull(), { timeout: 15_000, interval: 50 });
    await sleep(12_000); // 猶予（10 秒）を過ぎても捨てない
    expect(server.session.getPane(paneId)?.agentSession?.sessionId).toBe("conv-late");
  });

  // 今の決まり（D9）: エージェントを終了して、別の作業をしている pane は、再開しない。
  it("(AC3) エージェントを終了してシェルに戻り、猶予を過ぎた pane は、参照が捨てられ、次の起動で再開されない", async () => {
    const stateDir = await mkdtemp(join(dir, "state-"));
    const { server, paneId } = await bootWithAgent(stateDir, "conv-quit");
    const before = (await resumeLines("conv-quit")).length;
    server.terminals.get(paneId)!.write("q");
    await vi.waitFor(() => expect(agentOf(server, paneId)).toBeNull(), { timeout: 15_000, interval: 50 });
    expect(server.session.getPane(paneId)?.agentSession?.sessionId).toBe("conv-quit"); // 猶予の間は残る
    await vi.waitFor(() => expect(server.session.getPane(paneId)?.agentSession ?? null).toBeNull(), { timeout: 20_000, interval: 200 });
    await server.close();
    expect(await savedHas(stateDir, "conv-quit")).toBe(false);
    const again = await boot(stateDir);
    await sleep(2_000);
    expect((await resumeLines("conv-quit")).length).toBe(before);
    await again.close();
  });

  it("(b)(c) 再開を打ち込んだ直後（検知の前・検知の直後）に止めても、参照は残り、次の起動でもう一度再開される。二重には打ち込まない（AC4）", async () => {
    const stateDir = await mkdtemp(join(dir, "state-"));
    const first = await bootWithAgent(stateDir, "conv-bc");
    await first.server.close();
    const before = (await resumeLines("conv-bc")).length;
    let n = 0;
    for (const waitDetect of [false, true]) {
      const s = await boot(stateDir);
      const paneId = s.session.snapshot().panes[0]!.id;
      n++;
      await vi.waitFor(async () => expect((await resumeLines("conv-bc")).length).toBe(before + n), { timeout: 15_000 });
      if (waitDetect) await vi.waitFor(() => expect(agentOf(s, paneId)).not.toBeNull(), { timeout: 15_000, interval: 20 });
      expect(s.session.hasPendingResume(paneId) || agentOf(s, paneId) !== null).toBe(true);
      await s.close();
      expect(await savedHas(stateDir, "conv-bc")).toBe(true);
    }
    expect((await resumeLines("conv-bc")).length).toBe(before + 2);
  });
});
