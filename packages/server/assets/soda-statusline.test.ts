import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { rm, writeFile, mkdir, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTempDir } from "../src/persist/atomicFile.js";

/**
 * Claude Code のステータスラインの包み（20261010-agent-usage の PR2。AC1・AC2・AC6）を、実物として動かす結合。
 * 一時のフォルダに、包みのスクリプトを置き、偽の「元のコマンド」を、引数（base64url）で渡す。**出力と終了コードが、包みなしと同じ**こと。
 */

const SCRIPT = join(fileURLToPath(new URL(".", import.meta.url)), "soda-statusline.cjs");
const ID = "3e81f9a7-a757-461a-b21c-196db1d9196e";

let dir: string;
let script: string;
let server: Server | null = null;
let received: string[] = [];

beforeEach(async () => {
  dir = await makeTempDir("soda-statusline-wrap-");
  await mkdir(join(dir, "hooks"), { recursive: true });
  script = join(dir, "hooks", "soda-statusline.cjs");
  await copyFile(SCRIPT, script);
  received = [];
  server = null;
});
afterEach(async () => {
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  await rm(dir, { recursive: true, force: true });
});

const b64 = (v: unknown): string => Buffer.from(JSON.stringify(v), "utf8").toString("base64url");

function cleanEnv(extra: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith("SODA_")) delete env[k];
  delete env["CLAUDE_PID"];
  delete env["CLAUDE_CONFIG_DIR"];
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  return env;
}

async function listen(): Promise<string> {
  const sock = join(dir, "r.sock");
  server = createServer((c) => {
    let data = "";
    c.on("data", (d) => (data += d));
    c.on("end", () => received.push(data));
  });
  await new Promise<void>((r) => server!.listen(sock, r));
  return sock;
}

interface Run {
  stdout: string;
  code: number | null;
  ms: number;
}

function runWrapper(original: unknown, stdin: string, env: Record<string, string | undefined> = {}, argv?: string): Promise<Run> {
  const start = Date.now();
  return new Promise((resolve) => {
    const child = spawn("node", [script, argv ?? b64(original)], { env: cleanEnv(env), stdio: ["pipe", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ stdout: out, code, ms: Date.now() - start }));
    child.stdin.end(stdin);
  });
}

/** 包みなしで、同じコマンドを `sh -c` で動かした結果（比べる基準）。 */
function direct(command: string, stdin: string, env: Record<string, string | undefined> = {}): { stdout: string; code: number | null } {
  const r = spawnSync("sh", ["-c", command], { input: stdin, env: cleanEnv(env), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { stdout: r.stdout, code: r.status };
}

const INPUT = JSON.stringify({
  session_id: ID,
  session_name: "SECRET-SESSION-NAME",
  cwd: "/secret/cwd/path",
  transcript_path: "/secret/transcript.jsonl",
  workspace: { current_dir: "/secret/dir", project_dir: "/secret/proj" },
  repo: { host: "github.com", owner: "SECRET-OWNER", name: "SECRET-REPO" },
  model: { id: "claude-opus-5-5", display_name: "Opus 5.5" },
  cost: { total_cost_usd: 1.25, total_duration_ms: 1000 },
  context_window: { used_percentage: 42.5, context_window_size: 200000, total_input_tokens: 85000, total_output_tokens: 3000, current_usage: { input_tokens: 10, cache_creation_input_tokens: 20, cache_read_input_tokens: 84970, output_tokens: 5 } },
  rate_limits: { five_hour: { used_percentage: 12, resets_at: 1792000000 }, seven_day: { used_percentage: 30.5, resets_at: 1792500000 }, spend_limit: { used_percentage: 5, resets_at: 1792600000, used_usd: 10, limit_usd: 200, period: "month" } },
});

describe("出力と終了コードは、包みなしと同じ", () => {
  const cases: [string, string][] = [
    ["普通", `printf 'line1\\n'`],
    ["複数行と色（ANSI・OSC 8）", `printf '\\033[31mred\\033[0m\\nsecond \\033]8;;http://x\\033\\\\link\\033]8;;\\033\\\\\\n'`],
    ["出力なし", `true`],
    ["落ちる（終了コード 3・標準エラーあり）", `echo oops 1>&2; exit 3`],
    ["標準入力をそのまま読む", `cat`],
    ["環境（COLUMNS・LINES）を渡す", `printf '%s x %s' "$COLUMNS" "$LINES"`],
    ["大きな出力（4 MB）", `head -c 4194304 /dev/zero | tr '\\0' 'a'`],
  ];
  for (const [name, command] of cases) {
    it(name, async () => {
      const env = { COLUMNS: "123", LINES: "45" };
      const w = await runWrapper({ type: "command", command }, INPUT, env);
      const d = direct(command, INPUT, env);
      expect(w.stdout.length).toBe(d.stdout.length);
      expect(w.stdout).toBe(d.stdout);
      expect(w.code).toBe(d.code);
    });
  }

  it("遅い元のコマンド: 包みが足す遅れは小さい（元の時間 + 500ms 以内）", async () => {
    const command = `sleep 0.6; echo done`;
    const w = await runWrapper({ type: "command", command }, INPUT, { SODA_PANE_ID: "p1", SODA_AGENT_REPORT_SOCKET: join(dir, "no-such.sock") });
    expect(w.stdout).toBe("done\n");
    expect(w.ms).toBeLessThan(600 + 500);
  });

  it("元が無い（控えが null）: 何も出さずに 0", async () => {
    const w = await runWrapper(null, INPUT);
    expect(w).toMatchObject({ stdout: "", code: 0 });
  });

  it("元のコマンドが起動できない・存在しないコマンド: シェルの結果のまま（127）", async () => {
    const w = await runWrapper({ type: "command", command: "/no/such/command-xyz" }, INPUT);
    const d = direct("/no/such/command-xyz", INPUT);
    expect(w.code).toBe(d.code);
    expect(w.stdout).toBe(d.stdout);
  });

  it("標準入力が壊れた JSON でも、元は、同じ入力を受けて、同じ出力を返す", async () => {
    const w = await runWrapper({ type: "command", command: "cat" }, "{not json");
    expect(w).toMatchObject({ stdout: "{not json", code: 0 });
  });
});

describe("元の控え（引数を先に読む。読めなければ横のファイル。どちらも読めなければ、何も出さずに 0）", () => {
  it("引数が読めないとき、横のファイル（soda-statusline.orig.json）から読む", async () => {
    await writeFile(join(dir, "hooks", "soda-statusline.orig.json"), JSON.stringify({ schema: 1, original: { type: "command", command: "echo from-sidecar" } }));
    const w = await runWrapper(null, INPUT, {}, "!!!not-base64-json");
    expect(w).toMatchObject({ stdout: "from-sidecar\n", code: 0 });
  });

  it("引数と横のファイルの両方があれば、引数を先に読む", async () => {
    await writeFile(join(dir, "hooks", "soda-statusline.orig.json"), JSON.stringify({ schema: 1, original: { type: "command", command: "echo sidecar" } }));
    const w = await runWrapper({ type: "command", command: "echo arg" }, INPUT);
    expect(w.stdout).toBe("arg\n");
  });

  it("どちらも読めない: 何も出さずに 0（表示は消えるが、落ちない）", async () => {
    const w = await runWrapper(null, INPUT, {}, "%%%");
    expect(w).toMatchObject({ stdout: "", code: 0 });
  });
});

describe("利用状況の報告（agent-report.sock）", () => {
  it("SODA_PANE_ID と SODA_AGENT_REPORT_SOCKET があれば、数字と id だけの 1 行を送る。送らないもの（名前・場所・記録・リポジトリ）は、どこにも出ない", async () => {
    const sock = await listen();
    const w = await runWrapper({ type: "command", command: "echo shown" }, INPUT, { SODA_PANE_ID: "pane-1", SODA_AGENT_REPORT_SOCKET: sock, CLAUDE_PID: "4242" });
    expect(w).toMatchObject({ stdout: "shown\n", code: 0 });
    await new Promise((r) => setTimeout(r, 100));
    expect(received).toHaveLength(1);
    const line = received[0]!;
    expect(line.endsWith("\n")).toBe(true);
    const r = JSON.parse(line) as Record<string, unknown>;
    expect(r).toMatchObject({
      type: "usage",
      paneId: "pane-1",
      kind: "claude",
      sessionId: ID,
      agentPid: 4242,
      model: "claude-opus-5-5",
      modelName: "Opus 5.5",
      costUsd: 1.25,
      contextUsedPct: 42.5,
      contextWindowSize: 200000,
      contextTokens: 10 + 20 + 84970,
      fiveHour: { usedPct: 12, resetsAt: 1792000000 },
      sevenDay: { usedPct: 30.5, resetsAt: 1792500000 },
      spendLimit: { usedPct: 5, resetsAt: 1792600000, usedUsd: 10, limitUsd: 200, period: "month" },
    });
    expect(String(r["configKey"])).toMatch(/^[0-9a-f]{16}$/);
    for (const secret of ["SECRET-SESSION-NAME", "/secret/cwd/path", "/secret/transcript.jsonl", "SECRET-OWNER", "SECRET-REPO", "/secret/dir", "github.com"]) expect(line, secret).not.toContain(secret);
    expect("cwd" in r || "sessionName" in r || "transcriptPath" in r).toBe(false);
  });

  it("別の設定のフォルダ（CLAUDE_CONFIG_DIR）: 場所そのものは送らない。末尾の名前と、一方向の印だけ", async () => {
    const sock = await listen();
    await runWrapper({ type: "command", command: "true" }, INPUT, { SODA_PANE_ID: "p", SODA_AGENT_REPORT_SOCKET: sock, CLAUDE_CONFIG_DIR: "/very/secret/place/.claude-work" });
    await new Promise((r) => setTimeout(r, 100));
    const line = received[0]!;
    expect(line).not.toContain("/very/secret/place");
    expect(JSON.parse(line)).toMatchObject({ configDirName: ".claude-work" });
  });

  it("ソケットが無くても（接続できない）、表示は同じで、遅くならない", async () => {
    const w = await runWrapper({ type: "command", command: "echo shown" }, INPUT, { SODA_PANE_ID: "p", SODA_AGENT_REPORT_SOCKET: join(dir, "nothing.sock") });
    expect(w).toMatchObject({ stdout: "shown\n", code: 0 });
    expect(w.ms).toBeLessThan(1500);
  });

  it("受け手が応答しない（接続したまま読まない）でも、表示は消えず、数百 ms 以内に終わる", async () => {
    const sock = join(dir, "stuck.sock");
    const held: { destroy(): void }[] = [];
    server = createServer((c) => {
      held.push(c); // 読まない（接続したまま）。後で閉じる
    });
    server.on("close", () => held.forEach((c) => c.destroy()));
    await new Promise<void>((r) => server!.listen(sock, r));
    const w = await runWrapper({ type: "command", command: "echo shown" }, INPUT, { SODA_PANE_ID: "p", SODA_AGENT_REPORT_SOCKET: sock });
    expect(w).toMatchObject({ stdout: "shown\n", code: 0 });
    expect(w.ms).toBeLessThan(1500);
    held.forEach((c) => c.destroy());
  });

  it("SODA_PANE_ID が無ければ（Sodashitsu の外）、送らず、元を呼ぶだけ", async () => {
    const sock = await listen();
    const w = await runWrapper({ type: "command", command: "echo shown" }, INPUT, { SODA_AGENT_REPORT_SOCKET: sock });
    expect(w.stdout).toBe("shown\n");
    await new Promise((r) => setTimeout(r, 100));
    expect(received).toHaveLength(0);
  });

  it("session_id が UUID でない・入力が壊れていれば、送らない（表示は同じ）", async () => {
    const sock = await listen();
    await runWrapper({ type: "command", command: "true" }, JSON.stringify({ session_id: "not-a-uuid", cost: { total_cost_usd: 1 } }), { SODA_PANE_ID: "p", SODA_AGENT_REPORT_SOCKET: sock });
    await runWrapper({ type: "command", command: "true" }, "{oops", { SODA_PANE_ID: "p", SODA_AGENT_REPORT_SOCKET: sock });
    await new Promise((r) => setTimeout(r, 100));
    expect(received).toHaveLength(0);
  });

  it("範囲外・有限でない数は、送らない（項目ごと）", async () => {
    const bad = JSON.stringify({ session_id: ID, cost: { total_cost_usd: -5 }, context_window: { used_percentage: 1e30, context_window_size: "x" }, rate_limits: { five_hour: { used_percentage: "high" } } });
    await runWrapper({ type: "command", command: "true" }, bad, { SODA_PANE_ID: "p", SODA_AGENT_REPORT_SOCKET: await listen() });
    await new Promise((r) => setTimeout(r, 100));
    const r = JSON.parse(received[0]!) as Record<string, unknown>;
    expect(r["costUsd"]).toBeUndefined();
    expect(r["contextUsedPct"]).toBeUndefined();
    expect(r["contextWindowSize"]).toBeUndefined();
    expect(r["fiveHour"]).toBeUndefined();
  });
});

describe("取り消し（SIGTERM）は、子へ伝える", () => {
  it("実行中の包みを SIGTERM で止めると、元のコマンドも止まる（取り残さない）", async () => {
    const marker = join(dir, "child.pid");
    const child = spawn("node", [script, b64({ type: "command", command: `echo $$ > ${marker}; exec sleep 30` })], { env: cleanEnv({}), stdio: ["pipe", "ignore", "ignore"] });
    child.stdin.end(INPUT);
    for (let i = 0; i < 50 && !existsSync(marker); i++) await new Promise((r) => setTimeout(r, 50));
    expect(existsSync(marker)).toBe(true);
    const done = new Promise<number | null>((r) => child.on("close", (c) => r(c)));
    child.kill("SIGTERM");
    const code = await Promise.race([done, new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 3000))]);
    expect(code).not.toBe("timeout");
    const pid = Number((await import("node:fs")).readFileSync(marker, "utf8").trim());
    await new Promise((r) => setTimeout(r, 100));
    let alive = true;
    try {
      process.kill(pid, 0);
    } catch {
      alive = false;
    }
    expect(alive, "元のコマンドが残っている").toBe(false);
  });
});
