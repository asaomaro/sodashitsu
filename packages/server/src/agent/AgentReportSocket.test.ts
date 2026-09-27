import { connect } from "node:net";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTempDir } from "../persist/atomicFile.js";
import { MemoryLogger } from "../log/Logger.js";
import { startAgentReportSocket, type AgentReportSocket } from "./AgentReportSocket.js";

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
    const reports: Array<[string, string, string]> = [];
    socket = await startAgentReportSocket(socketPath, (paneId, kind, sessionId) => reports.push([paneId, kind, sessionId]), logger);

    await send(socketPath, `${JSON.stringify({ paneId: "p1", kind: "claude", sessionId: "abc-123" })}\n`);

    expect(reports).toEqual([["p1", "claude", "abc-123"]]);
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
    const reports: Array<[string, string, string]> = [];
    socket = await startAgentReportSocket(socketPath, (paneId, kind, sessionId) => reports.push([paneId, kind, sessionId]), logger);

    await send(socketPath, `${JSON.stringify({ paneId: "p2", kind: "codex", sessionId: "xyz" })}\n`);

    expect(reports).toEqual([["p2", "codex", "xyz"]]);
  });
});
