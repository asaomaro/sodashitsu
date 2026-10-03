import type { AgentInfo, ServerEvent } from "@sodashitsu/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionStore } from "../session.js";
import { RpcFailure, type SodaClient } from "../wsClient.js";
import { runAgentStart, type AgentStartDeps } from "./agentStart.js";

/** `sodactl agent start`（20260926-agent-start design「CLI `runAgentStart`」。AC12〜AC14・AC16）。 */

vi.mock("../withSession.js", () => ({ withSession: vi.fn() }));
vi.mock("../output.js", () => ({ printJson: vi.fn(), printLine: vi.fn(), printRaw: vi.fn() }));

import { printJson } from "../output.js";
import { withSession } from "../withSession.js";

const mockedWithSession = vi.mocked(withSession);
const mockedPrintJson = vi.mocked(printJson);

function agent(patch: Partial<AgentInfo> = {}): AgentInfo {
  return {
    instanceId: "a9",
    kind: "claude",
    label: "Claude Code",
    state: "unknown",
    completionSeq: 0,
    serverSeenSeq: 0,
    verified: true,
    since: 0,
    name: "reviewer",
    ...patch,
  };
}

function unnamed(patch: Partial<AgentInfo> = {}): AgentInfo {
  const a = agent(patch);
  delete a.name;
  return a;
}

interface Harness {
  request: ReturnType<typeof vi.fn>;
  emit(evt: ServerEvent): void;
  close(): void;
}

function harness(request: (method: string, params: unknown) => Promise<unknown>): Harness {
  const eventCbs: ((evt: ServerEvent) => void)[] = [];
  const closeCbs: ((code: number, reason: string) => void)[] = [];
  const requestFn = vi.fn(request);
  const client = {
    hello: vi.fn((cb?: (evt: ServerEvent) => void) => {
      if (cb) eventCbs.push(cb);
      return Promise.resolve({
        clientId: "c1",
        snapshot: {
          panes: [{ id: "p3", tabId: "t1", agent: null }],
          tabs: [{ id: "t1", workspaceId: "w1" }],
          limits: { scrollbackLines: 5000 },
        },
      });
    }),
    request: requestFn,
    onClose: vi.fn((cb: (code: number, reason: string) => void) => closeCbs.push(cb)),
  } as unknown as SodaClient;
  mockedWithSession.mockImplementation(async (_o, _s, fn) => fn(client));
  return {
    request: requestFn,
    emit: (evt) => eventCbs.forEach((cb) => cb(evt)),
    close: () => closeCbs.forEach((cb) => cb(1006, "")),
  };
}

const CMD = {
  kind: "agent-start" as const,
  opts: { url: "http://127.0.0.1:7780", token: undefined, urlExplicit: false },
  name: "reviewer",
  agentKind: "claude",
  paneId: "p3",
  timeoutMs: undefined as number | undefined,
  args: ["--model", "x"],
};
const store = {} as SessionStore;
const status = (a: AgentInfo | null): ServerEvent => ({
  event: "pane.agent_status_changed",
  data: { paneId: "p3", agent: a },
});

/** フェイクタイマーの時計（Date.now）と sleep を使う。 */
const deps: AgentStartDeps = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

async function failureCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    if (err instanceof RpcFailure) return err.code;
    throw err;
  }
  throw new Error("expected an RpcFailure");
}

beforeEach(() => {
  vi.useFakeTimers();
  mockedWithSession.mockReset();
  mockedPrintJson.mockReset();
});
afterEach(() => vi.useRealTimers());

const OK = { paneId: "p3", name: "reviewer", kind: "claude", argv: ["claude"] };

describe("runAgentStart", () => {
  it("agent.start を送り、名前付きの検出が unknown・working を経て idle になったら出力する（AC13）", async () => {
    const h = harness(() => Promise.resolve(OK));
    const run = runAgentStart(CMD, store, deps);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.request).toHaveBeenCalledWith("agent.start", {
      name: "reviewer",
      kind: "claude",
      paneId: "p3",
      args: ["--model", "x"],
    });
    h.emit(status(agent()));
    h.emit(status(agent({ state: "working" })));
    expect(mockedPrintJson).not.toHaveBeenCalled();
    h.emit(status(agent({ state: "idle" })));
    await run;
    expect(mockedPrintJson).toHaveBeenCalledWith({
      agent: expect.objectContaining({
        paneId: "p3",
        name: "reviewer",
        kind: "claude",
        status: "idle",
        workspaceId: "w1",
      }),
    });
  });

  it("--timeout を渡すとそのまま送る", async () => {
    const h = harness(() => Promise.resolve(OK));
    const run = runAgentStart({ ...CMD, timeoutMs: 5000 }, store, deps);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.request.mock.calls[0]![1]).toMatchObject({ timeoutMs: 5000 });
    h.emit(status(agent({ state: "idle" })));
    await run;
  });

  it("応答の前に届いた検出（idle）も、応答の後に判定する", async () => {
    let respond!: (v: unknown) => void;
    const h = harness(() => new Promise((resolve) => (respond = resolve)));
    const run = runAgentStart(CMD, store, deps);
    await vi.advanceTimersByTimeAsync(0);
    h.emit(status(agent({ state: "idle" })));
    expect(mockedPrintJson).not.toHaveBeenCalled();
    respond(OK);
    await run;
    expect(mockedPrintJson).toHaveBeenCalled();
  });

  it("blocked は agent_not_ready、別の種類は agent_kind_mismatch、名前付きの後の消失・pane の close は agent_start_failed（AC12・AC14）", async () => {
    const cases: [ServerEvent[], string][] = [
      [[status(agent({ state: "blocked" }))], "agent_not_ready"],
      [[status(unnamed({ kind: "codex" }))], "agent_kind_mismatch"],
      [[status(agent()), status(null)], "agent_start_failed"],
      [[{ event: "pane.closed", data: { paneId: "p3" } } as ServerEvent], "agent_start_failed"],
    ];
    for (const [evts, code] of cases) {
      const h = harness(() => Promise.resolve(OK));
      const run = runAgentStart(CMD, store, deps);
      const result = failureCode(run);
      await vi.advanceTimersByTimeAsync(0);
      for (const e of evts) h.emit(e);
      expect(await result).toBe(code);
    }
  });

  it("締め切り（既定 30000 ms・--timeout）を過ぎたら timeout（AC14）", async () => {
    harness(() => Promise.resolve(OK));
    const result = failureCode(runAgentStart(CMD, store, deps));
    await vi.advanceTimersByTimeAsync(29_999);
    let done = false;
    void result.then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toBe("timeout");

    harness(() => Promise.resolve(OK));
    const short = failureCode(runAgentStart({ ...CMD, timeoutMs: 4000 }, store, deps));
    await vi.advanceTimersByTimeAsync(4000);
    expect(await short).toBe("timeout");
  });

  it("サーバの誤り（busy 以外）はそのまま返し、再試行しない", async () => {
    const h = harness(() => Promise.reject(new RpcFailure("unsupported_agent_shell", "fish")));
    expect(await failureCode(runAgentStart(CMD, store, deps))).toBe("unsupported_agent_shell");
    expect(h.request).toHaveBeenCalledTimes(1);
  });

  it("agent_pane_busy は 100 ms おきに再試行し、空けば起動して待つ（AC16）", async () => {
    let calls = 0;
    const h = harness(() =>
      ++calls <= 2
        ? Promise.reject(new RpcFailure("agent_pane_busy", "busy"))
        : Promise.resolve(OK),
    );
    const run = runAgentStart(CMD, store, deps);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(99);
    expect(h.request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.request).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(100);
    expect(h.request).toHaveBeenCalledTimes(3);
    h.emit(status(agent({ state: "idle" })));
    await run;
  });

  it("2 秒 busy のままなら最後の agent_pane_busy を返す（AC16）", async () => {
    const h = harness(() => Promise.reject(new RpcFailure("agent_pane_busy", "busy")));
    const result = failureCode(runAgentStart(CMD, store, deps));
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toBe("agent_pane_busy");
    expect(h.request).toHaveBeenCalledTimes(21);
  });

  // 以下 3 本は test 工程の負の確認（変異が全テストを通った箇所）で追加した。
  it("応答の前に届いた別の種類の検出（busy の間に居た前のエージェント）では失敗せず、応答の後の検出で判定する", async () => {
    let respond!: (v: unknown) => void;
    const h = harness(() => new Promise((resolve) => (respond = resolve)));
    const result = runAgentStart(CMD, store, deps).then(
      () => "ok",
      (err: unknown) => (err instanceof RpcFailure ? err.code : String(err)),
    );
    await vi.advanceTimersByTimeAsync(0);
    h.emit(status(unnamed({ instanceId: "a1", kind: "codex", state: "idle" })));
    h.emit(status(null));
    await vi.advanceTimersByTimeAsync(0);
    respond(OK);
    await vi.advanceTimersByTimeAsync(0);
    h.emit(status(agent({ state: "idle" })));
    expect(await result).toBe("ok");
  });

  it("他の pane の検出は判定に使わない", async () => {
    const h = harness(() => Promise.resolve(OK));
    const run = runAgentStart(CMD, store, deps);
    await vi.advanceTimersByTimeAsync(0);
    h.emit({
      event: "pane.agent_status_changed",
      data: { paneId: "p4", agent: unnamed({ instanceId: "b1", kind: "codex", state: "idle" }) },
    });
    h.emit({
      event: "pane.agent_status_changed",
      data: { paneId: "p4", agent: agent({ instanceId: "b2", state: "idle" }) },
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(mockedPrintJson).not.toHaveBeenCalled();
    h.emit(status(agent({ state: "idle" })));
    await run;
    expect(mockedPrintJson).toHaveBeenCalledWith({
      agent: expect.objectContaining({ paneId: "p3", instanceId: "a9" }),
    });
  });

  it("応答の前に接続が切れたら、後から応答が来ても締め切りのタイマーを残さない", async () => {
    let respond!: (v: unknown) => void;
    const h = harness(() => new Promise((resolve) => (respond = resolve)));
    const result = failureCode(runAgentStart(CMD, store, deps));
    await vi.advanceTimersByTimeAsync(0);
    h.close();
    expect(await result).toBe("connection_closed");
    respond(OK);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("接続が切れたら connection_closed", async () => {
    const h = harness(() => Promise.resolve(OK));
    const result = failureCode(runAgentStart(CMD, store, deps));
    await vi.advanceTimersByTimeAsync(0);
    h.close();
    expect(await result).toBe("connection_closed");
  });
});

describe("runAgentStart — 自分の pane（20260926-agent-skill-file。AC11）", () => {
  it("自分の pane には接続せずに self_target", async () => {
    const own = {
      ...CMD,
      opts: { ...CMD.opts, caller: { paneId: "p3", serverUrl: "http://127.0.0.1:7780" } },
    };
    await expect(runAgentStart(own, store, deps)).rejects.toMatchObject({
      code: "self_target",
      message: expect.stringContaining("SODA_PANE_ID= sodactl"),
    });
    expect(mockedWithSession).not.toHaveBeenCalled();
  });
});
