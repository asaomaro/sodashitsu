import type { AgentInfo, ServerEvent } from "@wtm/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionStore } from "../session.js";
import { RpcFailure, type WtmClient } from "../wsClient.js";
import {
  runAgentGet,
  runAgentPrompt,
  runAgentRead,
  runAgentRename,
  runAgentSendKeys,
  runAgentWait,
} from "./agent.js";

/**
 * 名前による対象指定（20260926-agent-start-rename design「CLI の対象の解決」。AC7・AC11）。
 * 解決そのものの規則は `agentTarget.test.ts`、ここは各サブコマンドが解決した pane と instanceId で動くことを見る。
 */

vi.mock("../withSession.js", () => ({ withSession: vi.fn() }));
vi.mock("../output.js", () => ({ printJson: vi.fn(), printLine: vi.fn(), printRaw: vi.fn() }));

import { printJson, printLine } from "../output.js";
import { withSession } from "../withSession.js";

const mockedWithSession = vi.mocked(withSession);
const mockedPrintJson = vi.mocked(printJson);
const mockedPrintLine = vi.mocked(printLine);

function agent(patch: Partial<AgentInfo> = {}): AgentInfo {
  return {
    instanceId: "a1",
    kind: "claude",
    label: "Claude Code",
    state: "idle",
    completionSeq: 0,
    serverSeenSeq: 0,
    verified: true,
    since: 1000,
    ...patch,
  };
}

const REVIEWER = agent({ instanceId: "a2", name: "reviewer" });

interface Harness {
  client: WtmClient;
  emitEvent(evt: ServerEvent): void;
  emitSnapshot(paneId: string, text: string): void;
}

/** p1 は名前なし、p2（tab t2・workspace w2）は reviewer。 */
function harness(requestResult: (method: string) => unknown = () => ({})): Harness {
  const eventCbs: ((evt: ServerEvent) => void)[] = [];
  const snapshotCbs: ((paneId: string, cols: number, rows: number, text: string) => void)[] = [];
  const client = {
    hello: vi.fn((cb?: (evt: ServerEvent) => void) => {
      if (cb) eventCbs.push(cb);
      return Promise.resolve({
        clientId: "c1",
        snapshot: {
          panes: [
            { id: "p1", tabId: "t1", agent: agent() },
            { id: "p2", tabId: "t2", agent: REVIEWER },
          ],
          tabs: [
            { id: "t1", workspaceId: "w1" },
            { id: "t2", workspaceId: "w2" },
          ],
          limits: { scrollbackLines: 5000 },
        },
      });
    }),
    request: vi.fn((method: string) => Promise.resolve(requestResult(method))),
    onEvent: vi.fn(),
    onSnapshot: vi.fn((cb: (paneId: string, cols: number, rows: number, text: string) => void) =>
      snapshotCbs.push(cb),
    ),
    onClose: vi.fn(),
    close: vi.fn(),
  } as unknown as WtmClient;
  mockedWithSession.mockImplementation(async (_o, _s, fn) => fn(client));
  return {
    client,
    emitEvent: (evt) => eventCbs.forEach((cb) => cb(evt)),
    emitSnapshot: (paneId, text) => snapshotCbs.forEach((cb) => cb(paneId, 80, 24, text)),
  };
}

const OPTS = { url: "http://127.0.0.1:7780", token: undefined };
const store = {} as SessionStore;

beforeEach(() => {
  mockedWithSession.mockReset();
  mockedPrintJson.mockReset();
  mockedPrintLine.mockReset();
});

describe("名前による対象指定", () => {
  it("agent get は名前のエージェントを pane ID・workspace・name つきで出す（AC7・AC9）", async () => {
    harness();
    await runAgentGet({ kind: "agent-get", opts: OPTS, paneId: "reviewer" }, store);
    expect(mockedPrintJson).toHaveBeenCalledWith({
      agent: expect.objectContaining({
        paneId: "p2",
        workspaceId: "w2",
        tabId: "t2",
        name: "reviewer",
        instanceId: "a2",
      }),
    });
  });

  it("agent get の pane ID 指定は今までどおりで、名前が無ければ name は null（AC15）", async () => {
    harness();
    await runAgentGet({ kind: "agent-get", opts: OPTS, paneId: "p1" }, store);
    expect(mockedPrintJson).toHaveBeenCalledWith({
      agent: expect.objectContaining({ paneId: "p1", name: null }),
    });
  });

  it("誰も持たない名前は agent_not_found で、何も送らない（AC5）", async () => {
    const h = harness();
    await expect(
      runAgentGet({ kind: "agent-get", opts: OPTS, paneId: "writer" }, store),
    ).rejects.toMatchObject({
      code: "agent_not_found",
    });
    await expect(
      runAgentSendKeys(
        { kind: "agent-send-keys", opts: OPTS, paneId: "writer", keys: ["esc"] },
        store,
      ),
    ).rejects.toBeInstanceOf(RpcFailure);
    expect(h.client.request).not.toHaveBeenCalled();
  });

  it("agent wait は名前で解決した pane の状態変化を待つ（AC7）", async () => {
    const h = harness();
    const p = runAgentWait(
      {
        kind: "agent-wait",
        opts: OPTS,
        paneId: "reviewer",
        until: ["working"],
        timeoutMs: undefined,
      },
      store,
    );
    await vi.waitFor(() => expect(h.client.hello).toHaveBeenCalled());
    await Promise.resolve();
    h.emitEvent({
      event: "pane.agent_status_changed",
      data: { paneId: "p1", agent: agent({ state: "working" }) },
    });
    h.emitEvent({
      event: "pane.agent_status_changed",
      data: { paneId: "p2", agent: { ...REVIEWER, state: "working" } },
    });
    await p;
    expect(mockedPrintJson).toHaveBeenCalledWith({
      agent: expect.objectContaining({ paneId: "p2", status: "working", name: "reviewer" }),
    });
  });

  it("agent read は名前で解決した pane を購読して読み、購読を解除する（AC7）", async () => {
    const h = harness();
    const p = runAgentRead(
      {
        kind: "agent-read",
        opts: OPTS,
        paneId: "reviewer",
        lines: 80,
        raw: false,
        timeoutMs: 5000,
      },
      store,
    );
    await vi.waitFor(() =>
      expect(h.client.request).toHaveBeenCalledWith("pane.subscribe", {
        paneId: "p2",
        scrollbackLines: 5000,
      }),
    );
    h.emitSnapshot("p2", "hello from reviewer\r\n");
    await p;
    expect(mockedPrintLine).toHaveBeenCalledWith("hello from reviewer");
    expect(h.client.request).toHaveBeenCalledWith("pane.unsubscribe", { paneId: "p2" });
  });

  it("agent prompt は名前で解決した pane と instanceId で送る（AC7・AC11）", async () => {
    const h = harness((method) => (method === "agent.prompt" ? { agent: REVIEWER } : {}));
    await runAgentPrompt(
      {
        kind: "agent-prompt",
        opts: OPTS,
        paneId: "reviewer",
        text: "hi",
        wait: false,
        until: [],
        timeoutMs: undefined,
      },
      store,
    );
    expect(h.client.request).toHaveBeenCalledWith("agent.prompt", {
      paneId: "p2",
      instanceId: "a2",
      text: "hi",
    });
    expect(mockedPrintJson).toHaveBeenCalledWith({
      agent: expect.objectContaining({ paneId: "p2", name: "reviewer" }),
    });
  });

  it("agent send-keys は名前で解決した pane と instanceId で送り、解決した pane ID を出す（AC7・AC11）", async () => {
    const h = harness();
    await runAgentSendKeys(
      { kind: "agent-send-keys", opts: OPTS, paneId: "reviewer", keys: ["esc"] },
      store,
    );
    expect(h.client.request).toHaveBeenCalledWith("agent.send_keys", {
      paneId: "p2",
      instanceId: "a2",
      keys: ["esc"],
    });
    expect(mockedPrintJson).toHaveBeenCalledWith({ ok: true, paneId: "p2" });
  });
});

describe("runAgentRename", () => {
  it("名前で解決した pane と instanceId に agent.rename を送り、応答のエージェントを { agent } で出す（AC1・AC9・AC11）", async () => {
    const renamed = { ...REVIEWER, name: "lead" };
    const h = harness((method) => (method === "agent.rename" ? { agent: renamed } : {}));
    await runAgentRename(
      { kind: "agent-rename", opts: OPTS, paneId: "reviewer", name: "lead" },
      store,
    );
    expect(h.client.request).toHaveBeenCalledWith("agent.rename", {
      paneId: "p2",
      instanceId: "a2",
      name: "lead",
    });
    expect(mockedPrintJson).toHaveBeenCalledWith({
      agent: expect.objectContaining({
        paneId: "p2",
        workspaceId: "w2",
        tabId: "t2",
        name: "lead",
      }),
    });
  });

  it("--clear は name: null を送り、名前の無いエージェントは name: null で出る（AC2）", async () => {
    const cleared = agent({ instanceId: "a2" });
    const h = harness((method) => (method === "agent.rename" ? { agent: cleared } : {}));
    await runAgentRename({ kind: "agent-rename", opts: OPTS, paneId: "p2", name: null }, store);
    expect(h.client.request).toHaveBeenCalledWith("agent.rename", {
      paneId: "p2",
      instanceId: "a2",
      name: null,
    });
    expect(mockedPrintJson).toHaveBeenCalledWith({
      agent: expect.objectContaining({ paneId: "p2", name: null }),
    });
  });

  it("サーバの失敗（invalid_agent_name・agent_name_taken 等）はそのまま投げ、何も出さない（AC3・AC4）", async () => {
    const h = harness();
    vi.mocked(h.client.request).mockRejectedValueOnce(
      new RpcFailure("agent_name_taken", "agent name reviewer is already used by pane p2"),
    );
    await expect(
      runAgentRename({ kind: "agent-rename", opts: OPTS, paneId: "p1", name: "reviewer" }, store),
    ).rejects.toMatchObject({
      code: "agent_name_taken",
    });
    expect(mockedPrintJson).not.toHaveBeenCalled();
  });

  it("対象が見つからなければ agent_not_found で、agent.rename を送らない（AC5）", async () => {
    const h = harness();
    await expect(
      runAgentRename({ kind: "agent-rename", opts: OPTS, paneId: "writer", name: "x" }, store),
    ).rejects.toMatchObject({
      code: "agent_not_found",
    });
    expect(h.client.request).not.toHaveBeenCalled();
  });
});

describe("自分の pane の歯止め（20260926-agent-skill-file。AC11・AC14）", () => {
  // 呼び出し元は p2（reviewer の居る pane）。接続先は pane のサーバと同じ origin。
  const IN_P2 = { ...OPTS, caller: { paneId: "p2", serverUrl: "http://127.0.0.1:7780" } };

  async function refusal(p: Promise<unknown>): Promise<RpcFailure> {
    try {
      await p;
    } catch (err) {
      if (err instanceof RpcFailure) return err;
      throw err;
    }
    throw new Error("expected self_target");
  }

  it.each([
    ["reviewer", false],
    ["p2", false],
    ["reviewer", true],
  ])("agent prompt %s（--wait=%s）は自分の pane なので送らない", async (target, wait) => {
    const h = harness();
    const err = await refusal(
      runAgentPrompt(
        {
          kind: "agent-prompt",
          opts: IN_P2,
          paneId: target,
          text: "hi",
          wait,
          until: [],
          timeoutMs: undefined,
        },
        store,
      ),
    );
    expect(err.code).toBe("self_target");
    expect(err.message).toContain("WTM_PANE_ID= wtmctl");
    expect(h.client.request).not.toHaveBeenCalled();
  });

  it.each(["reviewer", "p2"])("agent send-keys %s は自分の pane なので送らない", async (target) => {
    const h = harness();
    const err = await refusal(
      runAgentSendKeys(
        { kind: "agent-send-keys", opts: IN_P2, paneId: target, keys: ["esc"] },
        store,
      ),
    );
    expect(err.code).toBe("self_target");
    expect(h.client.request).not.toHaveBeenCalled();
  });

  it("別の pane のエージェントへは送る", async () => {
    const h = harness(() => ({ agent: agent() }));
    await runAgentPrompt(
      {
        kind: "agent-prompt",
        opts: IN_P2,
        paneId: "p1",
        text: "hi",
        wait: false,
        until: [],
        timeoutMs: undefined,
      },
      store,
    );
    await runAgentSendKeys(
      { kind: "agent-send-keys", opts: IN_P2, paneId: "p1", keys: ["esc"] },
      store,
    );
    expect(h.client.request).toHaveBeenCalledWith(
      "agent.prompt",
      expect.objectContaining({ paneId: "p1" }),
    );
    expect(h.client.request).toHaveBeenCalledWith(
      "agent.send_keys",
      expect.objectContaining({ paneId: "p1" }),
    );
  });

  it("別のサーバにつなぐときは断らない", async () => {
    const h = harness(() => ({ agent: REVIEWER }));
    await runAgentSendKeys(
      {
        kind: "agent-send-keys",
        opts: { ...IN_P2, url: "http://127.0.0.1:7781" },
        paneId: "reviewer",
        keys: ["esc"],
      },
      store,
    );
    expect(h.client.request).toHaveBeenCalledWith(
      "agent.send_keys",
      expect.objectContaining({ paneId: "p2" }),
    );
  });

  it("自分の pane の agent get・rename は断らない", async () => {
    const h = harness(() => ({ agent: REVIEWER }));
    await runAgentGet({ kind: "agent-get", opts: IN_P2, paneId: "reviewer" }, store);
    await runAgentRename(
      { kind: "agent-rename", opts: IN_P2, paneId: "reviewer", name: "me" },
      store,
    );
    expect(h.client.request).toHaveBeenCalledWith(
      "agent.rename",
      expect.objectContaining({ paneId: "p2" }),
    );
  });
});
