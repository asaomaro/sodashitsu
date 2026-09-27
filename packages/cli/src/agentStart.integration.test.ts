import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { composeServerOnFreePort, type ComposedServer } from "@sodashitsu/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runAgentGet, runAgentList } from "./commands/agent.js";
import { runAgentStart } from "./commands/agentStart.js";
import { runPaneInput, runPaneRead } from "./commands/pane.js";
import { FsSessionStore } from "./session.js";
import { RpcFailure } from "./wsClient.js";

/**
 * `sodactl agent start` を、実サーバ・実 PTY の bash／dash・実際の検出の上の偽の `claude` で確かめる（20260926-agent-start
 * AC1・AC2・AC7・AC8・AC10）。PATH の先頭に置いた `claude` は bash の `exec -a claude` で node の偽のエージェントを起動し、
 * 受け取った引数を記録する（検出は argv[0] で行う）。本物のエージェントは起動しない。
 */

const FAKE_AGENT = `
import { appendFileSync } from "node:fs";
appendFileSync(process.env.FAKE_ARGV_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");
process.stdin.setRawMode(true);
process.stdout.write("\\u001b]0;\\u2733 fake\\u0007fake agent ready\\r\\n");
process.stdin.on("data", () => {});
`;

const EVIL: readonly string[] = [
  "; touch pwned1",
  "$(touch pwned2)",
  "`touch pwned3`",
  "&& touch pwned4",
  "| touch pwned5",
  "> pwned6",
  "a'b",
  "'",
  'c"d',
  "e\\",
  "$HOME",
  "%PATH%",
  "*",
  "~",
  "!!",
  "",
  "-x",
  "日本語",
];

function captureStdout(): { text(): string; restore(): void } {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    chunks.push(
      typeof chunk === "string"
        ? chunk
        : Buffer.isBuffer(chunk)
          ? chunk.toString("utf8")
          : String(chunk),
    );
    return true;
  });
  return { text: () => chunks.join(""), restore: () => spy.mockRestore() };
}

describe.skipIf(
  process.platform !== "linux" || !existsSync("/bin/bash") || !existsSync("/usr/bin/dash"),
)("sodactl agent start integration（実 PTY の bash／dash・偽の claude・実際の検出）", () => {
  let server: ComposedServer;
  let dir: string;
  let work: string;
  let store: FsSessionStore;
  let url: string;
  let argvLog: string;
  let savedEnv: Record<string, string | undefined> = {};
  const opts = () => ({ url, token: server.freshToken });

  async function quiet<T>(fn: () => Promise<T>): Promise<{ value: T; out: string }> {
    const out = captureStdout();
    try {
      return { value: await fn(), out: out.text() };
    } finally {
      out.restore();
    }
  }
  const type = (paneId: string, text: string) =>
    quiet(() => runPaneInput({ kind: "pane-input", opts: opts(), paneId, text }, store));
  const start = (paneId: string, name: string, args: string[]) =>
    quiet(() =>
      runAgentStart(
        {
          kind: "agent-start",
          opts: opts(),
          name,
          agentKind: "claude",
          paneId,
          timeoutMs: 30_000,
          args,
        },
        store,
      ),
    );
  /** 新しい pane を作り、シェルが `cd` を実行し終えたこと（印のファイル）を待つ。待たずに起動すると、先頭の Ctrl-C が
   *  まだ読まれていない打鍵ごと捨てる。 */
  async function newPane(): Promise<string> {
    const first = server.session.snapshot().panes[0]!.id;
    const { pane } = await server.session.splitPane(first, "down", undefined);
    // 印のファイルには pane のシェルが解決した claude を書かせ、偽物であることも確かめる（本物を起動しないため）。
    const marker = join(dir, `ready-${pane.id}`);
    await type(
      pane.id,
      `cd ${JSON.stringify(work)} && command -v claude > ${JSON.stringify(marker)}\r`,
    );
    await vi.waitFor(
      async () => expect((await readFile(marker, "utf8")).trim()).toBe(join(dir, "bin", "claude")),
      {
        timeout: 10_000,
        interval: 50,
      },
    );
    return pane.id;
  }
  async function screen(paneId: string): Promise<string> {
    return (
      await quiet(() =>
        runPaneRead(
          { kind: "pane-read", opts: opts(), paneId, follow: false, raw: false, timeoutMs: 5000 },
          store,
        ),
      )
    ).out;
  }
  /** シェルが打鍵を読み終え、画面の最後の行が `last` で終わるまで待つ（プロンプトは /etc の rc が決めうる）（まだ読まれていない打鍵は Ctrl-C で消えるため）。 */
  async function waitLastLine(paneId: string, last: string): Promise<void> {
    await vi.waitFor(
      async () => {
        const lines = (await screen(paneId)).split("\n").map((l) => l.trimEnd());
        while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
        expect(lines[lines.length - 1]?.endsWith(last)).toBe(true);
      },
      { timeout: 10_000, interval: 100 },
    );
  }
  async function launched(): Promise<string[][]> {
    const raw = await readFile(argvLog, "utf8").catch(() => "");
    return raw
      .split("\n")
      .filter((l) => l !== "")
      .map((l) => JSON.parse(l) as string[]);
  }

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "sodactl-start-it-"));
    work = join(dir, "work");
    argvLog = join(dir, "argv.jsonl");
    await Promise.all([mkdir(work), mkdir(join(dir, "bin"))]);
    await writeFile(join(dir, "fake-agent.mjs"), FAKE_AGENT);
    const wrapper = join(dir, "bin", "claude");
    await writeFile(
      wrapper,
      `#!/bin/bash\nexec -a claude ${JSON.stringify(process.execPath)} ${JSON.stringify(join(dir, "fake-agent.mjs"))} "$@"\n`,
    );
    await chmod(wrapper, 0o755);
    // pane のシェルの環境：利用者の rc を読ませず（HOME）、PATH の先頭を偽の claude にする。本物の claude を起動しないため。
    savedEnv = {
      HOME: process.env["HOME"],
      PATH: process.env["PATH"],
      ENV: process.env["ENV"],
      PS1: process.env["PS1"],
      FAKE_ARGV_LOG: process.env["FAKE_ARGV_LOG"],
    };
    process.env["HOME"] = dir;
    process.env["PATH"] = `${join(dir, "bin")}:${process.env["PATH"] ?? "/usr/bin:/bin"}`;
    process.env["FAKE_ARGV_LOG"] = argvLog;
    delete process.env["ENV"];
    // 空きポートの取り合いで落ちないよう、EADDRINUSE なら組み立て直す（20260926-load-flaky-tests の D3）。
    server = await composeServerOnFreePort({
      host: "127.0.0.1",
      stateDir: join(dir, "state"),
      origin: [],
      shell: "/bin/bash",
    });
    url = `http://${server.options.host}:${server.options.port}`;
    store = new FsSessionStore(join(dir, "session.json"));
    if (!server.freshToken) throw new Error("expected a freshly generated token");
  }, 60_000);

  afterAll(async () => {
    try {
      await server?.close();
    } finally {
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      if (dir) await rm(dir, { recursive: true, force: true });
    }
  });

  it("継続行（引用符が開いたまま）の bash に悪意のある引数で起動しても、引数はそのまま届き副作用は無く、名前付きの idle で返る（AC1・AC2・AC7・AC10）", async () => {
    const paneId = await newPane();
    await type(paneId, "echo 'unterminated\r");
    await waitLastLine(paneId, ">"); // 継続行（PS2）に入った
    const detectedAt: number[] = [];
    const sub = setInterval(() => {
      if (server.session.getPane(paneId)?.agent && detectedAt.length === 0)
        detectedAt.push(Date.now());
    }, 20);
    const { out } = await start(paneId, "reviewer", [...EVIL]).finally(() => clearInterval(sub));
    const printed = JSON.parse(out) as {
      agent: { name: string; kind: string; status: string; paneId: string };
    };
    expect(printed.agent).toMatchObject({
      name: "reviewer",
      kind: "claude",
      status: "idle",
      paneId,
    });
    expect(Date.now() - detectedAt[0]!).toBeGreaterThanOrEqual(3000 - 100);
    expect(await launched()).toEqual([[...EVIL]]);
    expect(await readdir(work)).toEqual([]);

    const got = JSON.parse(
      (
        await quiet(() =>
          runAgentGet({ kind: "agent-get", opts: opts(), paneId: "reviewer" }, store),
        )
      ).out,
    ) as {
      agent: { paneId: string };
    };
    expect(got.agent.paneId).toBe(paneId);
    const list = JSON.parse(
      (await quiet(() => runAgentList({ kind: "agent-list", opts: opts() }, store))).out,
    ) as {
      agents: { name: string | null }[];
    };
    expect(list.agents.map((a) => a.name)).toContain("reviewer");
  }, 60_000);

  it("打ちかけの行がある dash でも打ちかけは実行されず、起動した引数は渡したものだけ（AC7・AC10）", async () => {
    const paneId = await newPane();
    await type(paneId, `exec dash -i\r`);
    await type(paneId, `echo $0 > shell.txt\r`);
    await vi.waitFor(
      async () => expect((await readFile(join(work, "shell.txt"), "utf8")).trim()).toBe("dash"),
      {
        timeout: 10_000,
        interval: 100,
      },
    );
    await rm(join(work, "shell.txt"));
    await type(paneId, "echo LEFTOVER > leftover.txt");
    await waitLastLine(paneId, "$ echo LEFTOVER > leftover.txt");
    const before = (await launched()).length;
    const { out } = await start(paneId, "second", ["$(touch pwned7)", "x'y"]);
    expect(JSON.parse(out)).toMatchObject({ agent: { name: "second", status: "idle" } });
    expect((await launched()).slice(before)).toEqual([["$(touch pwned7)", "x'y"]]);
    expect(await readdir(work)).toEqual([]);
  }, 60_000);

  it("打ちかけの行がある bash（readline）でも打ちかけは実行されず、起動した引数は渡したものだけ（AC10）", async () => {
    const paneId = await newPane();
    await type(paneId, "echo LEFTOVER > leftover.txt");
    await waitLastLine(paneId, "$ echo LEFTOVER > leftover.txt");
    const before = (await launched()).length;
    const { out } = await start(paneId, "fourth", ["a b"]);
    expect(JSON.parse(out)).toMatchObject({ agent: { name: "fourth", status: "idle" } });
    expect((await launched()).slice(before)).toEqual([["a b"]]);
    expect(await readdir(work)).toEqual([]);
  }, 60_000);

  it("前面がシェル以外（cat の実行中）の pane には何も打ち込まず agent_pane_busy（AC8）", async () => {
    const paneId = await newPane();
    // 前面の cat は受け取った入力をそのままファイルへ書くので、打ち込まれていればファイルに現れる（時間に依らない）。
    const captured = join(dir, `captured-${paneId}`);
    await type(paneId, `cat > ${JSON.stringify(captured)}\r`);
    await vi.waitFor(() => expect(server.session.getPane(paneId)?.busy).toBe(true), {
      timeout: 10_000,
      interval: 100,
    });
    const before = (await launched()).length;
    let code = "";
    try {
      await start(paneId, "third", ["x"]);
    } catch (err) {
      code = err instanceof RpcFailure ? err.code : String(err);
    }
    expect(code).toBe("agent_pane_busy");
    await new Promise((r) => setTimeout(r, 1000));
    expect(await readFile(captured, "utf8")).toBe("");
    expect(server.session.getPane(paneId)?.busy).toBe(true); // cat は Ctrl-C を受けていない
    expect((await launched()).length).toBe(before);
    expect(server.session.getPane(paneId)?.agent ?? null).toBeNull();
  }, 30_000);
});
