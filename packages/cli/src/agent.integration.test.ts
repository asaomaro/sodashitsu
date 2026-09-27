import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentInfo } from "@sodashitsu/protocol";
import { composeServerOnFreePort, type ComposedServer } from "@sodashitsu/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runAgentGet, runAgentList, runAgentRead, runAgentWait } from "./commands/agent.js";
import { runPaneRun, runPaneSplit } from "./commands/pane.js";
import { FsSessionStore } from "./session.js";

/**
 * `sodactl agent` を実サーバ・実 PTY で確かめる（20260926-agent-automation-api tasks.md T6）。
 * エージェントの状態は `session.updatePaneRuntime` で注入する（シェルが前面の pane では AgentMonitor が上書きしない）。
 * `agent wait` が hello を終えたことを観測してから状態を変えるため、`connect` が返すクライアントの `hello` を包む。
 */

const helloWaiters: (() => void)[] = [];

vi.mock("./wsClient.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./wsClient.js")>();
  return {
    ...actual,
    connect: async (url: string, cookie: string) => {
      const client = await actual.connect(url, cookie);
      const hello = client.hello.bind(client);
      client.hello = async (onEventAfterHello) => {
        const result = await hello(onEventAfterHello);
        helloWaiters.splice(0).forEach((notify) => notify());
        return result;
      };
      return client;
    },
  };
});

function nextHello(): Promise<void> {
  return new Promise((resolve) => helloWaiters.push(resolve));
}

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

function agentInfo(patch: Partial<AgentInfo> = {}): AgentInfo {
  return {
    instanceId: "it-agent-1",
    kind: "claude",
    label: "Claude Code",
    state: "working",
    completionSeq: 0,
    serverSeenSeq: 0,
    verified: true,
    since: Date.now(),
    ...patch,
  };
}

describe("sodactl agent integration（実サーバ・実 PTY）", () => {
  let server: ComposedServer;
  let stateDir: string;
  let sessionDir: string;
  let store: FsSessionStore;
  let url: string;
  let agentPaneId: string;
  let plainPaneId: string;
  let workspaceId: string;

  beforeAll(async () => {
    stateDir = await mkdtemp(join(tmpdir(), "sodactl-agent-it-state-"));
    server = await composeServerOnFreePort({
      host: "127.0.0.1",
      stateDir,
      origin: [],
    });
    if (!server.freshToken) throw new Error("expected a freshly generated token");
    url = `http://${server.options.host}:${server.options.port}`;
    sessionDir = await mkdtemp(join(tmpdir(), "sodactl-agent-it-session-"));
    store = new FsSessionStore(join(sessionDir, "session.json"));

    const snap = server.session.snapshot();
    agentPaneId = snap.panes[0]!.id;
    workspaceId = snap.tabs.find((t) => t.id === snap.panes[0]!.tabId)!.workspaceId;
    const out = captureStdout();
    try {
      await runPaneSplit(
        {
          kind: "pane-split",
          opts: { url, token: server.freshToken },
          target: { kind: "id", paneId: agentPaneId },
          direction: "right",
          ratio: undefined,
        },
        store,
      );
    } finally {
      out.restore();
    }
    plainPaneId = (JSON.parse(out.text()) as { pane: { id: string } }).pane.id;
  }, 30_000);

  afterAll(async () => {
    await server.close();
    await rm(stateDir, { recursive: true, force: true });
    await rm(sessionDir, { recursive: true, force: true });
  });

  const opts = () => ({ url, token: undefined });

  it("list: エージェントの居る pane だけを出す（AC1）", async () => {
    server.session.updatePaneRuntime(agentPaneId, { agent: agentInfo() });
    const out = captureStdout();
    try {
      await runAgentList({ kind: "agent-list", opts: opts() }, store);
    } finally {
      out.restore();
    }
    const { agents } = JSON.parse(out.text()) as {
      agents: { paneId: string; workspaceId: string; status: string }[];
    };
    expect(agents).toEqual([
      expect.objectContaining({ paneId: agentPaneId, workspaceId, status: "working" }),
    ]);
  });

  it("get: エージェントの居ない pane は agent_not_found（AC8）", async () => {
    await expect(
      runAgentGet({ kind: "agent-get", opts: opts(), paneId: plainPaneId }, store),
    ).rejects.toMatchObject({
      code: "agent_not_found",
    });
  });

  it("wait: 待ち始めた後の状態変化のイベントで done として返る（AC4）", async () => {
    server.session.updatePaneRuntime(agentPaneId, { agent: agentInfo({ state: "working" }) });
    const helloDone = nextHello();
    const out = captureStdout();
    try {
      const waiting = runAgentWait(
        { kind: "agent-wait", opts: opts(), paneId: agentPaneId, until: [], timeoutMs: 10_000 },
        store,
      );
      // hello より前に失敗したらその原因で落ちるよう、wait 自体とも競わせる。
      await Promise.race([helloDone, waiting]);
      server.session.updatePaneRuntime(agentPaneId, {
        agent: agentInfo({ state: "idle", completionSeq: 1 }),
      });
      await waiting;
    } finally {
      out.restore();
    }
    const { agent } = JSON.parse(out.text()) as {
      agent: { paneId: string; status: string; completionSeq: number };
    };
    expect(agent).toMatchObject({ paneId: agentPaneId, status: "done", completionSeq: 1 });
  }, 15_000);

  it("wait: 待っている間にエージェントが居なくなると agent_not_running（AC6）", async () => {
    server.session.updatePaneRuntime(agentPaneId, { agent: agentInfo({ state: "working" }) });
    const helloDone = nextHello();
    const waiting = runAgentWait(
      { kind: "agent-wait", opts: opts(), paneId: agentPaneId, until: [], timeoutMs: 10_000 },
      store,
    );
    const settled = waiting.then(
      () => "resolved",
      (e: unknown) => e,
    );
    await Promise.race([helloDone, waiting]);
    server.session.updatePaneRuntime(agentPaneId, { agent: null });
    expect(await settled).toMatchObject({ code: "agent_not_running" });
  }, 15_000);

  it("read: エージェントの居る pane の画面を読む（AC7）", async () => {
    server.session.updatePaneRuntime(agentPaneId, {
      agent: agentInfo({ instanceId: "it-agent-2", state: "idle" }),
    });
    const marker = `sodactl-agent-read-${Date.now()}`;
    const runOut = captureStdout();
    try {
      await runPaneRun(
        { kind: "pane-run", opts: opts(), paneId: agentPaneId, command: `echo ${marker}` },
        store,
      );
    } finally {
      runOut.restore();
    }

    const deadline = Date.now() + 8_000;
    let seen = "";
    for (;;) {
      const out = captureStdout();
      try {
        await runAgentRead(
          {
            kind: "agent-read",
            opts: opts(),
            paneId: agentPaneId,
            lines: 80,
            raw: false,
            timeoutMs: 3_000,
          },
          store,
        );
      } finally {
        out.restore();
      }
      seen = out.text();
      if (seen.includes(marker)) break;
      if (Date.now() > deadline)
        throw new Error(`marker not observed; last read: ${JSON.stringify(seen)}`);
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(seen).not.toContain("\u001B[");
  }, 20_000);
});
