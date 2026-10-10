import { connect } from "node:net";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTempDir } from "../persist/atomicFile.js";
import { MemoryLogger } from "../log/Logger.js";
import { startAgentReportSocket, type AgentReport, type AgentReportSocket } from "./AgentReportSocket.js";

function send(path: string, payload: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const sock = connect(path, () => sock.end(payload));
    sock.on("close", () => resolve());
    sock.on("error", reject);
  });
}

describe("AgentReportSocket", () => {
  let dir: string;
  let socketPath: string;
  let socket: AgentReportSocket | undefined;
  let logger: MemoryLogger;

  beforeEach(async () => {
    dir = await makeTempDir("soda-agent-report-");
    socketPath = join(dir, "agent-report.sock");
    logger = new MemoryLogger();
  });

  afterEach(async () => {
    await socket?.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("delivers a well-formed report", async () => {
    const reports: AgentReport[] = [];
    socket = await startAgentReportSocket(socketPath, (r) => reports.push(r), logger);

    await send(socketPath, `${JSON.stringify({ paneId: "p1", kind: "claude", sessionId: "abc-123" })}\n`);

    expect(reports).toEqual([{ type: "session", paneId: "p1", kind: "claude", sessionId: "abc-123" }]);
  });

  it("type: usage（ステータスラインの包み）: 数字と短い文字列だけを通す。範囲外・形の違う項目は落とし、知らない項目（名前・場所・cwd）は持ち上げない", async () => {
    const reports: AgentReport[] = [];
    socket = await startAgentReportSocket(socketPath, (r) => reports.push(r), logger);
    const ID = "3e81f9a7-a757-461a-b21c-196db1d9196e";
    const body = {
      type: "usage",
      paneId: "p1",
      kind: "claude",
      sessionId: ID,
      agentPid: 4242,
      model: "claude-opus-5-5",
      costUsd: 1.5,
      contextUsedPct: 40,
      contextWindowSize: 200000,
      contextTokens: 80000,
      fiveHour: { usedPct: 12, resetsAt: 1792000000 },
      sevenDay: { usedPct: "high" },
      spendLimit: { usedPct: 5, usedUsd: 10, limitUsd: 200, period: "month" },
      configKey: "0123456789abcdef",
      configDirName: ".claude-work",
      sessionName: "SECRET",
      sessionNameX: "SECRET",
      transcript_path: "/secret",
      costBad: 1,
    };
    await send(socketPath, `${JSON.stringify(body)}\n`);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ type: "usage", paneId: "p1", kind: "claude", sessionId: ID, agentPid: 4242, costUsd: 1.5, contextUsedPct: 40, fiveHour: { usedPct: 12, resetsAt: 1792000000 }, spendLimit: { usedUsd: 10, limitUsd: 200, period: "month" }, configKey: "0123456789abcdef", configDirName: ".claude-work" });
    expect((reports[0] as { sevenDay?: unknown }).sevenDay).toBeUndefined(); // 形の違う枠は落とす
    const json = JSON.stringify(reports[0]);
    expect(json).not.toContain("SECRET");
    expect(json).not.toContain("/secret");
  });

  it("type: usage: 会話の id が UUID の形でなければ捨てる。範囲外の数・不正な configKey は、その項目だけ落とす", async () => {
    const reports: AgentReport[] = [];
    socket = await startAgentReportSocket(socketPath, (r) => reports.push(r), logger);
    await send(socketPath, `${JSON.stringify({ type: "usage", paneId: "p1", kind: "claude", sessionId: "not-uuid", costUsd: 1 })}\n`);
    expect(reports).toHaveLength(0);
    const ID = "3e81f9a7-a757-461a-b21c-196db1d9196e";
    await send(socketPath, `${JSON.stringify({ type: "usage", paneId: "p1", kind: "claude", sessionId: ID, costUsd: -1, contextUsedPct: 1e30, configKey: "../etc", contextTokens: 5 })}\n`);
    expect(reports).toHaveLength(1);
    const r = reports[0] as Record<string, unknown>;
    expect(r["costUsd"]).toBeUndefined();
    expect(r["contextUsedPct"]).toBeUndefined();
    expect(r["configKey"]).toBeUndefined();
    expect(r["contextTokens"]).toBe(5);
  });

  it("ignores invalid JSON without throwing", async () => {
    const reports: unknown[] = [];
    socket = await startAgentReportSocket(socketPath, (...args) => reports.push(args), logger);

    await send(socketPath, "not json\n");

    expect(reports).toEqual([]);
  });

  it("ignores a payload missing required fields", async () => {
    const reports: unknown[] = [];
    socket = await startAgentReportSocket(socketPath, (...args) => reports.push(args), logger);

    await send(socketPath, `${JSON.stringify({ paneId: "p1" })}\n`);

    expect(reports).toEqual([]);
  });

  it("recreates a stale socket file left by a previous unclean exit (design D12)", async () => {
    await writeFile(socketPath, "stale"); // 前回の不正終了の残骸（ソケットではない普通のファイル）を模す
    const reports: AgentReport[] = [];
    socket = await startAgentReportSocket(socketPath, (r) => reports.push(r), logger);

    await send(socketPath, `${JSON.stringify({ paneId: "p2", kind: "codex", sessionId: "xyz" })}\n`);

    expect(reports).toEqual([{ type: "session", paneId: "p2", kind: "codex", sessionId: "xyz" }]);
  });

  it("残っている socket のファイルを作り直せたときは、警告を出さない（`soda handoff` のたびに EADDRINUSE の警告が出ていた）", async () => {
    await writeFile(socketPath, "stale");
    socket = await startAgentReportSocket(socketPath, () => undefined, logger);
    expect(logger.lines.filter((e) => e.level === "warn")).toEqual([]);
  });

  it("session の報告の transcriptPath（記録の場所）は、形が正しいときだけ通す（20261010-agent-usage）", async () => {
    const got: AgentReport[] = [];
    socket = await startAgentReportSocket(socketPath, (r) => got.push(r), logger);
    for (const [sid, p] of [["s1", "/a/b/s1.jsonl"], ["s2", "x".repeat(2000)], ["s3", "a\u0000b"]] as const) {
      await send(socketPath, JSON.stringify({ paneId: "p1", kind: "claude", sessionId: sid, transcriptPath: p }) + "\n");
    }
    await vi.waitFor(() => expect(got).toHaveLength(3));
    expect(got[0]).toMatchObject({ type: "session", sessionId: "s1", transcriptPath: "/a/b/s1.jsonl" });
    expect(got[1]).not.toHaveProperty("transcriptPath");
    expect(got[2]).not.toHaveProperty("transcriptPath");
  });

  describe("type つきの報告（20261004-subagent-display）", () => {
    const base = { paneId: "p1", kind: "claude", sessionId: "s1" };

    async function deliver(payload: unknown): Promise<AgentReport[]> {
      const reports: AgentReport[] = [];
      socket = await startAgentReportSocket(socketPath, (r) => reports.push(r), logger);
      await send(socketPath, `${JSON.stringify(payload)}\n`);
      return reports;
    }

    it("各 type を解釈する", async () => {
      expect(await deliver({ ...base, type: "subagent_pending", description: "d", agentType: "Explore", background: true })).toEqual([
        { type: "subagent_pending", ...base, description: "d", agentType: "Explore", background: true },
      ]);
    });

    it("親の id（128 文字まで）と記録の場所（1024 文字まで・NUL なし）を通す。超えるものは項目ごと捨てる（切らない）", async () => {
      const tp = "/home/u/.claude/projects/-w/s1.jsonl";
      expect(await deliver({ ...base, type: "subagent_pending", parentAgentId: "outer", transcriptPath: tp })).toEqual([
        { type: "subagent_pending", ...base, parentAgentId: "outer", transcriptPath: tp },
      ]);
      expect(await deliver({ ...base, type: "subagent_pending", parentAgentId: "x".repeat(129), transcriptPath: "/" + "x".repeat(1024) })).toEqual([
        { type: "subagent_pending", ...base },
      ]);
      expect(await deliver({ ...base, type: "subagent_start", agentId: "a1", transcriptPath: "/a\u0000b" })).toEqual([
        { type: "subagent_start", ...base, agentId: "a1" },
      ]);
      expect(await deliver({ ...base, type: "subagent_start", agentId: "a1", transcriptPath: tp })).toEqual([
        { type: "subagent_start", ...base, agentId: "a1", transcriptPath: tp },
      ]);
    });

    it("subagent_start・subagent_stop・session_end・agent_stop", async () => {
      const reports: AgentReport[] = [];
      socket = await startAgentReportSocket(socketPath, (r) => reports.push(r), logger);
      for (const p of [
        { ...base, type: "subagent_start", agentId: "a1", agentType: "Plan" },
        { ...base, type: "subagent_stop", agentId: "a1" },
        { ...base, type: "agent_stop", running: [{ id: "a2", agentType: "Explore", description: "d" }, { id: "a3" }] },
        { ...base, type: "session_end" },
      ]) {
        await send(socketPath, `${JSON.stringify(p)}\n`);
      }
      expect(reports).toEqual([
        { type: "subagent_start", ...base, agentId: "a1", agentType: "Plan" },
        { type: "subagent_stop", ...base, agentId: "a1" },
        { type: "agent_stop", ...base, running: [{ id: "a2", agentType: "Explore", description: "d" }, { id: "a3" }], truncated: false },
        { type: "session_end", ...base },
      ]);
    });

    it("description は 200 文字、agentType は 64 文字に切る", async () => {
      const [r] = await deliver({ ...base, type: "subagent_pending", description: "あ".repeat(300), agentType: "t".repeat(100) });
      expect(r).toMatchObject({ type: "subagent_pending" });
      expect(Array.from((r as { description: string }).description).length).toBe(200);
      expect((r as { agentType: string }).agentType.length).toBe(64);
    });

    it("128 文字を超える agentId の電文は捨てる。running の 128 文字を超える ID の項目は飛ばす", async () => {
      expect(await deliver({ ...base, type: "subagent_start", agentId: "x".repeat(129) })).toEqual([]);
      await socket?.close();
      const reports = await deliver({ ...base, type: "agent_stop", running: [{ id: "x".repeat(129) }, { id: "ok" }] });
      expect(reports).toEqual([{ type: "agent_stop", ...base, running: [{ id: "ok" }], truncated: false }]);
    });

    it("running は 64 件まで。削ったら truncated を立てる（スクリプトが立てていなくても）", async () => {
      const running = Array.from({ length: 70 }, (_, i) => ({ id: `a${i}` }));
      const [r] = await deliver({ ...base, type: "agent_stop", running });
      expect((r as { running: unknown[] }).running).toHaveLength(64);
      expect(r).toMatchObject({ truncated: true });
    });

    it("running がちょうど 64 件なら truncated は立てない（65 件目で立てる）", async () => {
      const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `a${i}` }));
      const [r64] = await deliver({ ...base, type: "agent_stop", running: mk(64) });
      expect(r64).toMatchObject({ truncated: false });
      await socket?.close();
      const [r65] = await deliver({ ...base, type: "agent_stop", running: mk(65) });
      expect(r65).toMatchObject({ truncated: true });
    });

    it("スクリプトが truncated: true を立てていればそのまま保つ", async () => {
      const [r] = await deliver({ ...base, type: "agent_stop", running: [], truncated: true });
      expect(r).toMatchObject({ truncated: true });
    });

    it("知らない type・型が違う項目は捨てる", async () => {
      expect(await deliver({ ...base, type: "unknown" })).toEqual([]);
      await socket?.close();
      expect(await deliver({ ...base, type: 3 })).toEqual([]);
      await socket?.close();
      expect(await deliver({ ...base, type: "agent_stop", running: "x" })).toEqual([]);
    });

    it("4096 文字を超えても、32768 文字までは受ける。超えたら捨てる", async () => {
      const big = await deliver({ ...base, type: "agent_stop", running: Array.from({ length: 64 }, (_, i) => ({ id: `a${i}`.padEnd(128, "i"), agentType: "t".repeat(64), description: "あ".repeat(200) })) });
      expect(big).toHaveLength(1);
      await socket?.close();
      expect(await deliver({ ...base, type: "subagent_pending", description: "x".repeat(40000) })).toEqual([]);
    });

    it("ログに説明の中身を出さない", async () => {
      socket = await startAgentReportSocket(socketPath, () => undefined, logger);
      await send(socketPath, `${JSON.stringify({ ...base, type: "subagent_pending", description: "秘密の説明" })}\n`);
      await send(socketPath, `${JSON.stringify({ ...base, type: "unknown", description: "秘密の説明" })}\n`);
      expect(logger.lines.length).toBeGreaterThan(0); // 捨てた電文は debug に出る
      expect(JSON.stringify(logger.lines)).not.toContain("秘密の説明");
    });
  });
});
