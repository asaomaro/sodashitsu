import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { makeTempDir } from "../src/persist/atomicFile.js";
import { rm, writeFile } from "node:fs/promises";

// 20260923-other-agents-session-resume（design「hook スクリプト」）。この hook スクリプトは
// `packages/server/src/agent/AgentIntegrationInstaller.ts` からコピーされて各エージェントの
// hook として実際に spawn される想定なので、`node <script> <kind>` として本当に動かし、
// stdin の `session_id`/`sessionId` の両方から拾えることを確認する（AgentIntegrationInstaller.test.ts は
// スクリプトが「コピーされること」しか見ておらず、中身の実行は見ていない）。

const SCRIPT_PATH = join(fileURLToPath(new URL(".", import.meta.url)), "agent-hook-report.cjs");

type Report = Record<string, unknown>;

// 親（pane の中で動く開発セッション等）から継いだ SODA_* を子プロセスへ渡さない。値が undefined のものは消す。
function cleanEnv(set: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith("SODA_")) delete env[k];
  delete env["CLAUDE_PID"]; // フックを動かしている開発セッション自身の値を継がない（報告の `agentPid` に入る）
  for (const [k, v] of Object.entries(set)) if (v !== undefined) env[k] = v;
  return env;
}

async function runHook(
  kind: string,
  stdin: string,
  env: Record<string, string | undefined> = {},
): Promise<Report | null> {
  const workDir = await makeTempDir("soda-agent-hook-report-test-");
  const sockPath = join(workDir, "report.sock");
  try {
    const received = await new Promise<Report | null>((resolve) => {
      const server = createServer((conn) => {
        let data = "";
        conn.on("data", (chunk) => (data += chunk));
        conn.on("end", () => {
          server.close();
          try {
            resolve(JSON.parse(data.trim()));
          } catch {
            resolve(null);
          }
        });
      });
      server.listen(sockPath, () => {
        const child = spawn("node", [SCRIPT_PATH, kind], {
          env: cleanEnv({ SODA_PANE_ID: "p1", SODA_AGENT_REPORT_SOCKET: sockPath, ...env }),
          stdio: ["pipe", "ignore", "ignore"],
        });
        child.stdin.end(stdin);
        // レポートが来ないまま終わるケース（`sessionId` が拾えない等）のため、タイムアウトで打ち切る。
        const timer = setTimeout(() => {
          server.close();
          resolve(null);
        }, 3000);
        timer.unref();
      });
    });
    return received;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

describe("agent-hook-report.cjs", () => {
  it("reports the session id from snake_case session_id (Claude Code・Codex・Cursor・Devin・Droid・Qwen Code)", async () => {
    const result = await runHook("claude", JSON.stringify({ session_id: "sess-snake" }));
    expect(result).toEqual({ paneId: "p1", kind: "claude", sessionId: "sess-snake" });
  });

  it("reports the session id from camelCase sessionId (Grok CLI・GitHub Copilot CLI)", async () => {
    const result = await runHook("grok", JSON.stringify({ sessionId: "sess-camel" }));
    expect(result).toEqual({ paneId: "p1", kind: "grok", sessionId: "sess-camel" });
  });

  it("prefers session_id when both are present", async () => {
    const result = await runHook(
      "copilot",
      JSON.stringify({ session_id: "snake-wins", sessionId: "camel-loses" }),
    );
    expect(result?.sessionId).toBe("snake-wins");
  });

  it("does nothing when neither field is present", async () => {
    const result = await runHook("qwen", JSON.stringify({ cwd: "/tmp" }));
    expect(result).toBeNull();
  });

  // 報告に失敗する状況（socket が無い・サーバが止まっている・pane の外）では、何も出力せず（標準出力にも標準エラーにも）、終了コード 0 で終わる
  // （20261004-subagent-display の AC12。フックの出力は Claude Code の会話・画面に出うるし、非ゼロはエラーとして見える）。
  describe("報告に失敗する状況で、黙って正常に終わる（AC12）", () => {
    async function runRaw(
      env: Record<string, string | undefined>,
      input: unknown,
      kind = "claude",
    ) {
      return await new Promise<{ code: number | null; stdout: string; stderr: string }>(
        (resolve, reject) => {
          const child = spawn("node", [SCRIPT_PATH, kind], {
            env: cleanEnv(env),
            stdio: ["pipe", "pipe", "pipe"],
          });
          let stdout = "";
          let stderr = "";
          child.stdout.on("data", (d) => (stdout += d));
          child.stderr.on("data", (d) => (stderr += d));
          child.on("error", reject);
          child.on("close", (code) => resolve({ code, stdout, stderr }));
          child.stdin.end(JSON.stringify(input));
        },
      );
    }
    const inputs = [
      { session_id: "s1", hook_event_name: "SessionStart", source: "startup" },
      {
        session_id: "s1",
        hook_event_name: "PreToolUse",
        tool_name: "Agent",
        tool_input: { description: "d" },
      },
      { session_id: "s1", hook_event_name: "SubagentStart", agent_id: "a1" },
      { session_id: "s1", hook_event_name: "SubagentStop", agent_id: "a1" },
      {
        session_id: "s1",
        hook_event_name: "Stop",
        background_tasks: [{ id: "a1", type: "subagent", status: "running" }],
      },
      { session_id: "s1", hook_event_name: "SessionEnd", reason: "other" },
    ];

    it.each([
      [
        "socket が無い（パスのファイルが無い）",
        (dir: string) => ({
          SODA_PANE_ID: "p1",
          SODA_AGENT_REPORT_SOCKET: join(dir, "no-such.sock"),
        }),
      ],
      [
        "サーバが止まっている（socket のファイルだけが残り、待ち受けていない）",
        (dir: string) => ({
          SODA_PANE_ID: "p1",
          SODA_AGENT_REPORT_SOCKET: join(dir, "stale.sock"),
        }),
      ],
      ["pane の外（環境変数が無い）", (_dir: string) => ({})],
    ])("%s", async (_name, envOf) => {
      const dir = await makeTempDir("soda-agent-hook-fail-");
      try {
        await writeFile(join(dir, "stale.sock"), ""); // 普通のファイル（接続は拒まれる）
        for (const input of inputs) {
          const r = await runRaw(envOf(dir), input);
          expect(r, String(input.hook_event_name)).toEqual({ code: 0, stdout: "", stderr: "" });
        }
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it("stdin が JSON でない・空でも、黙って正常に終わる", async () => {
      const dir = await makeTempDir("soda-agent-hook-fail-");
      try {
        const env = { SODA_PANE_ID: "p1", SODA_AGENT_REPORT_SOCKET: join(dir, "no-such.sock") };
        for (const raw of ["", "not json", "[1,2]", "null"]) {
          const r = await new Promise<{ code: number | null; stdout: string; stderr: string }>(
            (resolve, reject) => {
              const child = spawn("node", [SCRIPT_PATH, "claude"], {
                env: cleanEnv(env),
                stdio: ["pipe", "pipe", "pipe"],
              });
              let stdout = "";
              let stderr = "";
              child.stdout.on("data", (d) => (stdout += d));
              child.stderr.on("data", (d) => (stderr += d));
              child.on("error", reject);
              child.on("close", (code) => resolve({ code, stdout, stderr }));
              child.stdin.end(raw);
            },
          );
          expect(r, JSON.stringify(raw)).toEqual({ code: 0, stdout: "", stderr: "" });
        }
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe("claude のサブエージェント関連のフック（20261004-subagent-display）", () => {
    const base = { session_id: "s1" };
    const common = { paneId: "p1", kind: "claude", sessionId: "s1" };

    it("PreToolUse（Agent）は subagent_pending。description・種類・background を載せ、prompt は送らない", async () => {
      const result = await runHook(
        "claude",
        JSON.stringify({
          ...base,
          hook_event_name: "PreToolUse",
          tool_name: "Agent",
          tool_input: {
            description: "調べる",
            subagent_type: "Explore",
            run_in_background: true,
            prompt: "秘密の指示",
          },
        }),
      );
      expect(result).toEqual({
        ...common,
        type: "subagent_pending",
        description: "調べる",
        agentType: "Explore",
        background: true,
      });
      expect(JSON.stringify(result)).not.toContain("秘密の指示");
    });

    it("入れ子の親の id（PreToolUse の agent_id）と親の記録の場所（transcript_path）を載せる。メインが呼ぶとき（agent_id 無し）は親の項目が無い", async () => {
      const tp = "/home/u/.claude/projects/-w/s1.jsonl";
      expect(
        await runHook(
          "claude",
          JSON.stringify({ ...base, hook_event_name: "PreToolUse", tool_name: "Agent", agent_id: "outer1", transcript_path: tp, tool_input: {} }),
        ),
      ).toEqual({ ...common, type: "subagent_pending", parentAgentId: "outer1", transcriptPath: tp });
      expect(
        await runHook(
          "claude",
          JSON.stringify({ ...base, hook_event_name: "PreToolUse", tool_name: "Agent", transcript_path: tp, tool_input: {} }),
        ),
      ).toEqual({ ...common, type: "subagent_pending", transcriptPath: tp });
    });

    it("SubagentStart に transcript_path を載せる。長すぎる（1024 文字超）・文字列でない場所は送らない（切らない）。last_assistant_message・agent_transcript_path は送らない", async () => {
      const tp = "/home/u/.claude/projects/-w/s1.jsonl";
      const start = { ...base, hook_event_name: "SubagentStart", agent_id: "a1" };
      expect(await runHook("claude", JSON.stringify({ ...start, transcript_path: tp, agent_transcript_path: "/x/y.jsonl", last_assistant_message: "秘密" }))).toEqual({
        ...common,
        type: "subagent_start",
        agentId: "a1",
        transcriptPath: tp,
      });
      expect(await runHook("claude", JSON.stringify({ ...start, transcript_path: "/" + "x".repeat(1024) }))).toEqual({ ...common, type: "subagent_start", agentId: "a1" });
      expect(await runHook("claude", JSON.stringify({ ...start, transcript_path: 5 }))).toEqual({ ...common, type: "subagent_start", agentId: "a1" });
    });

    it("PreToolUse は tool_name が Agent・Task のときだけ。Task も受け、ほか（Bash・TaskCreate）は何も送らない", async () => {
      const task = await runHook(
        "claude",
        JSON.stringify({
          ...base,
          hook_event_name: "PreToolUse",
          tool_name: "Task",
          tool_input: {},
        }),
      );
      expect(task).toEqual({ ...common, type: "subagent_pending" });
      for (const tool_name of ["Bash", "TaskCreate"]) {
        expect(
          await runHook(
            "claude",
            JSON.stringify({ ...base, hook_event_name: "PreToolUse", tool_name, tool_input: {} }),
          ),
        ).toBeNull();
      }
    });

    it("SubagentStart は subagent_start（agentId・agentType）。agent_id が無ければ送らない", async () => {
      expect(
        await runHook(
          "claude",
          JSON.stringify({
            ...base,
            hook_event_name: "SubagentStart",
            agent_id: "a1",
            agent_type: "Plan",
          }),
        ),
      ).toEqual({
        ...common,
        type: "subagent_start",
        agentId: "a1",
        agentType: "Plan",
      });
      expect(
        await runHook("claude", JSON.stringify({ ...base, hook_event_name: "SubagentStart" })),
      ).toBeNull();
    });

    it("SubagentStop は subagent_stop。last_assistant_message・background_tasks は送らない", async () => {
      const result = await runHook(
        "claude",
        JSON.stringify({
          ...base,
          hook_event_name: "SubagentStop",
          agent_id: "a1",
          last_assistant_message: "発言の本文",
          background_tasks: [{ id: "x" }],
        }),
      );
      expect(result).toEqual({ ...common, type: "subagent_stop", agentId: "a1" });
    });

    it("Stop は agent_stop。type が subagent で status が running のものだけを running に載せる（128 文字を超える ID は飛ばす）", async () => {
      const result = await runHook(
        "claude",
        JSON.stringify({
          ...base,
          hook_event_name: "Stop",
          last_assistant_message: "発言の本文",
          background_tasks: [
            {
              id: "a1",
              type: "subagent",
              status: "running",
              description: "d1",
              agent_type: "Explore",
            },
            { id: "a2", type: "subagent", status: "completed" },
            { id: "b1", type: "shell", status: "running" },
            { id: "x".repeat(129), type: "subagent", status: "running" },
            { id: "a3", type: "subagent", status: "running" },
          ],
        }),
      );
      expect(result).toEqual({
        ...common,
        type: "agent_stop",
        running: [{ id: "a1", agentType: "Explore", description: "d1" }, { id: "a3" }],
      });
      expect(JSON.stringify(result)).not.toContain("発言の本文");
    });

    it("Stop の running は 64 件まで。超えたら truncated: true", async () => {
      const tasks = Array.from({ length: 70 }, (_, i) => ({
        id: `a${i}`,
        type: "subagent",
        status: "running",
      }));
      const result = await runHook(
        "claude",
        JSON.stringify({ ...base, hook_event_name: "Stop", background_tasks: tasks }),
      );
      expect((result?.running as unknown[]).length).toBe(64);
      expect(result?.truncated).toBe(true);
      const exact = await runHook(
        "claude",
        JSON.stringify({ ...base, hook_event_name: "Stop", background_tasks: tasks.slice(0, 64) }),
      );
      expect(exact?.truncated).toBeUndefined();
    });

    it("Stop に background_tasks が無い（古い Claude Code）ときは、外さない印（truncated）つきで空の running を送る", async () => {
      expect(await runHook("claude", JSON.stringify({ ...base, hook_event_name: "Stop" }))).toEqual(
        {
          ...common,
          type: "agent_stop",
          running: [],
          truncated: true,
        },
      );
    });

    it("SessionEnd は session_end", async () => {
      expect(
        await runHook(
          "claude",
          JSON.stringify({ ...base, hook_event_name: "SessionEnd", reason: "other" }),
        ),
      ).toEqual({ ...common, type: "session_end" });
    });

    it("description は 200 文字、agentType は 64 文字に切る（コードポイント単位）", async () => {
      const result = await runHook(
        "claude",
        JSON.stringify({
          ...base,
          hook_event_name: "PreToolUse",
          tool_name: "Agent",
          tool_input: { description: "あ".repeat(300), subagent_type: "t".repeat(100) },
        }),
      );
      expect(Array.from(result?.description as string).length).toBe(200);
      expect((result?.agentType as string).length).toBe(64);
      const emoji = await runHook(
        "claude",
        JSON.stringify({
          ...base,
          hook_event_name: "PreToolUse",
          tool_name: "Agent",
          tool_input: { description: "😀".repeat(201) },
        }),
      );
      expect(emoji?.description).toBe("😀".repeat(200));
    });

    it("agent_id は 129 文字まで残す（128 文字を超える ID は受け口が捨てる）。SubagentStart の agentType は 64 文字、Stop の running の項目も切る", async () => {
      const start = await runHook(
        "claude",
        JSON.stringify({
          ...base,
          hook_event_name: "SubagentStart",
          agent_id: "x".repeat(300),
          agent_type: "t".repeat(100),
        }),
      );
      expect((start?.agentId as string).length).toBe(129);
      expect((start?.agentType as string).length).toBe(64);
      const stop = await runHook(
        "claude",
        JSON.stringify({ ...base, hook_event_name: "SubagentStop", agent_id: "y".repeat(300) }),
      );
      expect((stop?.agentId as string).length).toBe(129);
      const agentStop = await runHook(
        "claude",
        JSON.stringify({
          ...base,
          hook_event_name: "Stop",
          background_tasks: [
            {
              id: "a1",
              type: "subagent",
              status: "running",
              description: "あ".repeat(300),
              agent_type: "t".repeat(100),
            },
          ],
        }),
      );
      const [item] = agentStop?.running as { description: string; agentType: string }[];
      expect(Array.from(item?.description ?? "").length).toBe(200);
      expect(item?.agentType.length).toBe(64);
    });

    it("session_id が無ければ type つきでも何も送らない", async () => {
      expect(
        await runHook(
          "claude",
          JSON.stringify({ hook_event_name: "SubagentStop", agent_id: "a1" }),
        ),
      ).toBeNull();
    });

    it("知らないイベント・hook_event_name が無い入力は、今までどおりセッション ID の報告（type なし）", async () => {
      expect(
        await runHook(
          "claude",
          JSON.stringify({ ...base, hook_event_name: "SessionStart", source: "startup" }),
        ),
      ).toEqual(common);
      expect(await runHook("claude", JSON.stringify(base))).toEqual(common);
    });

    it("kind が claude でなければ type つきを送らない（Agent 以外の PreToolUse でも、今までどおりセッション ID の報告）", async () => {
      expect(
        await runHook(
          "codex",
          JSON.stringify({ ...base, hook_event_name: "SubagentStart", agent_id: "a1" }),
        ),
      ).toEqual({ paneId: "p1", kind: "codex", sessionId: "s1" });
      expect(
        await runHook(
          "codex",
          JSON.stringify({ ...base, hook_event_name: "PreToolUse", tool_name: "Bash" }),
        ),
      ).toEqual({
        paneId: "p1",
        kind: "codex",
        sessionId: "s1",
      });
    });

    it("環境変数が無ければ（本製品の pane の外）何も送らない", async () => {
      expect(
        await runHook("claude", JSON.stringify({ ...base, hook_event_name: "SessionEnd" }), {
          SODA_PANE_ID: undefined,
        }),
      ).toBeNull();
    });
  });
}, 20000);

// 20261009-agent-session-attribution: 報告したエージェント自身の pid を足す。
describe("報告したエージェントの pid（agentPid）", () => {
  it("claude: 環境変数 CLAUDE_PID（正の整数）を agentPid に足す", async () => {
    const result = await runHook("claude", JSON.stringify({ session_id: "s1" }), { CLAUDE_PID: "4321" });
    expect(result).toEqual({ paneId: "p1", kind: "claude", sessionId: "s1", agentPid: 4321 });
  });

  it("CLAUDE_PID が数でない・0 以下・大きすぎるときは付けない（/proc の祖先にも名前の合うものが無ければ、付かない）", async () => {
    for (const bad of ["abc", "0", "-5", "99999999999", ""]) {
      const result = await runHook("claude", JSON.stringify({ session_id: "s1" }), { CLAUDE_PID: bad });
      expect(result, bad).toEqual({ paneId: "p1", kind: "claude", sessionId: "s1" });
    }
  });

  it("CLAUDE_PID が無いとき、Linux では、親をたどって最も近い、名前が kind のプロセスの pid を付ける（node <dir>/claude.js のような起動も）", async () => {
    if (process.platform !== "linux") return;
    const workDir = await makeTempDir("soda-agent-hook-pid-test-");
    try {
      const sockPath = join(workDir, "report.sock");
      const launcher = join(workDir, "claude.js");
      // 「claude」という名前のプロセス（node claude.js）が、フックを起動する。
      await writeFile(
        launcher,
        `const { spawn } = require("node:child_process");
const c = spawn("node", [${JSON.stringify(SCRIPT_PATH)}, "claude"], { env: process.env, stdio: ["pipe", "ignore", "ignore"] });
c.stdin.end(JSON.stringify({ session_id: "s-proc" }));
c.on("close", () => process.exit(0));
console.log("PID=" + process.pid);
`,
      );
      const { received, launcherPid } = await new Promise<{ received: Report | null; launcherPid: number }>((resolve) => {
        let launcherPid = 0;
        const server = createServer((conn) => {
          let data = "";
          conn.on("data", (c) => (data += c));
          conn.on("end", () => {
            server.close();
            resolve({ received: JSON.parse(data.trim()), launcherPid });
          });
        });
        server.listen(sockPath, () => {
          const child = spawn("node", [launcher], {
            env: cleanEnv({ SODA_PANE_ID: "p1", SODA_AGENT_REPORT_SOCKET: sockPath }),
            stdio: ["ignore", "pipe", "ignore"],
          });
          launcherPid = child.pid ?? 0;
          const t = setTimeout(() => {
            server.close();
            resolve({ received: null, launcherPid });
          }, 4000);
          t.unref();
        });
      });
      expect(received).toEqual({ paneId: "p1", kind: "claude", sessionId: "s-proc", agentPid: launcherPid });
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it("名前の合うプロセスが祖先に無いときは、付けない（今までどおり）", async () => {
    const result = await runHook("codex", JSON.stringify({ session_id: "s2" }));
    expect(result).toEqual({ paneId: "p1", kind: "codex", sessionId: "s2" });
  });
});
