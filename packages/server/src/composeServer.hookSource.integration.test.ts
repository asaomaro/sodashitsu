import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FsAgentIntegrationInstaller } from "./agent/AgentIntegrationInstaller.js";
import { agentReportSocketPathFor } from "./config.js";
import { fileURLToPath } from "node:url";
import { composeServerOnFreePort } from "./composeServerOnFreePort.js";
import type { ComposedServer } from "./composeServer.js";

/**
 * 20261009-agent-fork の T0b。`/clear`・fork・`compact` の後の `SessionStart` が、導入するフックの matcher を通って報告され、
 * pane の会話の id が新しいものに替わる（実機 2.1.296 の観測: `/clear` と fork は新しい id・source は `clear`・`fork`）。
 * Claude Code の matcher の一致は、ここでは設定の matcher を正規表現として `source` と比べて真似る（実機でも `startup|resume` は `fork` に一致しなかった）。
 * 実物の `composeServer`・実物のインストーラが書いた設定・実物のフックのスクリプトを通す。
 */
vi.setConfig({ testTimeout: 60_000 });

describe.skipIf(process.platform !== "linux" || !existsSync("/bin/bash"))("composeServer: SessionStart の source ごとの報告（T0b）", () => {
  let dir: string;
  let server: ComposedServer;
  let stateDir: string;
  let paneId: string;
  let matcher: string;
  let script: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "soda-hooksource-"));
    stateDir = join(dir, "state");
    const claudeDir = join(dir, "claude");
    const installer = new FsAgentIntegrationInstaller(fileURLToPath(new URL("../assets/agent-hook-report.cjs", import.meta.url)), { PATH: "", CLAUDE_CONFIG_DIR: claudeDir } as NodeJS.ProcessEnv, join(dir, "home"));
    await installer.install("claude");
    const settings = JSON.parse(await readFile(join(claudeDir, "settings.json"), "utf8")) as { hooks: { SessionStart: { matcher: string }[] } };
    matcher = settings.hooks.SessionStart[0]!.matcher;
    script = join(claudeDir, "hooks", "soda-agent-report.cjs");
    server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [], shell: "/bin/bash" });
    paneId = server.session.snapshot().panes[0]!.id;
  });
  afterAll(async () => {
    await server?.close();
    if (dir) await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  /** Claude Code の matcher: 設定の文字列を、`source` に全体一致させる（`|` で区切った候補）。空は全部。 */
  const matches = (source: string): boolean => matcher === "" || matcher.split("|").includes(source);
  function runHook(sessionId: string, source: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [script, "claude"], { env: { ...process.env, SODA_PANE_ID: paneId, SODA_AGENT_REPORT_SOCKET: agentReportSocketPathFor(stateDir) }, stdio: ["pipe", "ignore", "ignore"] });
      child.on("error", reject);
      child.on("close", () => resolve());
      child.stdin.end(JSON.stringify({ session_id: sessionId, hook_event_name: "SessionStart", source }));
    });
  }
  const idOf = () => server.session.getPane(paneId)?.agentSession?.sessionId ?? null;
  async function sessionStart(sessionId: string, source: string): Promise<void> {
    if (matches(source)) await runHook(sessionId, source);
  }

  it("起動 → /clear → fork → compact の順に、報告が届き、会話の id が替わる（compact は同じ id）", async () => {
    await sessionStart("11111111-1111-4111-8111-111111111111", "startup");
    await vi.waitFor(() => expect(idOf()).toBe("11111111-1111-4111-8111-111111111111"), { timeout: 10_000 });
    await sessionStart("22222222-2222-4222-8222-222222222222", "clear");
    await vi.waitFor(() => expect(idOf()).toBe("22222222-2222-4222-8222-222222222222"), { timeout: 10_000 }); // 否定の対照: matcher を `startup|resume` に戻すと、ここで落ちる
    await sessionStart("33333333-3333-4333-8333-333333333333", "fork");
    await vi.waitFor(() => expect(idOf()).toBe("33333333-3333-4333-8333-333333333333"), { timeout: 10_000 });
    await sessionStart("33333333-3333-4333-8333-333333333333", "compact");
    await new Promise((r) => setTimeout(r, 300));
    expect(idOf()).toBe("33333333-3333-4333-8333-333333333333");
  });

  it("知らない source は、matcher が拾わない（空の matcher にしていない）", () => {
    expect(matches("something-new")).toBe(false);
    expect(matcher).not.toBe("");
  });
});
