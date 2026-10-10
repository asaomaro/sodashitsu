import type { AgentForkProgress, AgentInfo, ServerEvent } from "@sodashitsu/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionStore } from "../session.js";
import { RpcFailure, type SodaClient } from "../wsClient.js";
import { runAgentFork, formatFork } from "./agentFork.js";

/** `sodactl agent fork`（20261009-agent-fork の T5）。 */

vi.mock("../withSession.js", () => ({ withSession: vi.fn() }));
vi.mock("../output.js", () => ({ printJson: vi.fn(), printLine: vi.fn(), printRaw: vi.fn() }));

import { printJson, printLine } from "../output.js";
import { withSession } from "../withSession.js";

const agent: AgentInfo = { instanceId: "a1", kind: "claude", label: "Claude Code", state: "idle", completionSeq: 0, serverSeenSeq: 0, verified: true, since: 0 };

interface Harness {
  request: ReturnType<typeof vi.fn>;
  emit(evt: ServerEvent): void;
}
function harness(request: (method: string, params: unknown) => Promise<unknown>): Harness {
  const eventCbs: ((evt: ServerEvent) => void)[] = [];
  const requestFn = vi.fn(request);
  const client = {
    hello: vi.fn((cb?: (evt: ServerEvent) => void) => {
      if (cb) eventCbs.push(cb);
      return Promise.resolve({ clientId: "c1", snapshot: { panes: [{ id: "p3", tabId: "t1", agent }], tabs: [{ id: "t1", workspaceId: "w1" }], limits: { scrollbackLines: 5000 } } });
    }),
    request: requestFn,
    onClose: vi.fn(),
  } as unknown as SodaClient;
  vi.mocked(withSession).mockImplementation(async (_o, _s, fn) => fn(client));
  return { request: requestFn, emit: (evt) => eventCbs.forEach((cb) => cb(evt)) };
}

const base = { kind: "agent-fork" as const, opts: { url: "http://127.0.0.1:7780", token: undefined, urlExplicit: false }, paneId: "p3", worktree: undefined as string | undefined, note: true, wait: true, timeoutMs: undefined as number | undefined, json: true };
const store = {} as SessionStore;
const RESULT = { paneId: "p9", workspaceId: "w1", name: "fork-p3", target: "same", noteStatus: "off", annotated: true };
const progress = (stage: AgentForkProgress["stage"], extra: Partial<AgentForkProgress> = {}): ServerEvent => ({ event: "agent.fork_progress", data: { sourcePaneId: "p3", paneId: "p9", stage, ...extra } });

beforeEach(() => {
  vi.mocked(printJson).mockReset();
  vi.mocked(printLine).mockReset();
});

describe("runAgentFork", () => {
  it("同じフォルダ: 会話の id もコマンドも送らず、pane・行き先だけ。最後（done）まで待って結果を出す", async () => {
    const h = harness(async () => {
      h.emit(progress("pane_created"));
      h.emit(progress("launched"));
      return RESULT;
    });
    const run = runAgentFork(base, store);
    await vi.waitFor(() => expect(h.request).toHaveBeenCalled());
    expect(h.request).toHaveBeenCalledWith("agent.fork", { paneId: "p3", target: { kind: "same" } });
    h.emit(progress("detected"));
    h.emit(progress("ready"));
    h.emit(progress("done"));
    await run;
    expect(vi.mocked(printJson).mock.calls[0]![0]).toMatchObject({ paneId: "p9", stage: "done", target: "same" });
  });

  it("--worktree: 行き先とブランチ名、--no-note で note: false。最初の知らせの最後の状態を結果に載せる", async () => {
    const h = harness(async () => ({ ...RESULT, target: "worktree", worktreePath: "/wt/x", noteStatus: "pending" }));
    const run = runAgentFork({ ...base, worktree: "fork/x", note: false }, store);
    await vi.waitFor(() => expect(h.request).toHaveBeenCalled());
    expect(h.request).toHaveBeenCalledWith("agent.fork", { paneId: "p3", target: { kind: "worktree", branch: "fork/x" }, note: false });
    h.emit(progress("note", { noteStatus: "sent" }));
    h.emit(progress("done", { noteStatus: "sent" }));
    await run;
    expect(vi.mocked(printJson).mock.calls[0]![0]).toMatchObject({ noteStatus: "sent", worktreePath: "/wt/x" });
  });

  it("--no-wait: 応答だけで返る（進み具合を待たない）", async () => {
    harness(async () => RESULT);
    await runAgentFork({ ...base, wait: false }, store);
    expect(vi.mocked(printJson).mock.calls[0]![0]).toMatchObject({ paneId: "p9", stage: "launched" });
  });

  it("途中の失敗（failed）は RpcFailure（理由と、残したものを含む）", async () => {
    const h = harness(async () => RESULT);
    const run = runAgentFork(base, store);
    const settled = run.catch((e) => e);
    await vi.waitFor(() => expect(h.request).toHaveBeenCalled());
    h.emit(progress("failed", { code: "fork_failed", message: "会話の記録が見つかりません", created: { worktreePath: "/wt/x" } }));
    const err = await settled;
    expect(err).toBeInstanceOf(RpcFailure);
    expect((err as RpcFailure).code).toBe("fork_failed");
    expect((err as RpcFailure).message).toContain("会話の記録が見つかりません");
    expect((err as RpcFailure).message).toContain("/wt/x");
  });

  it("別の pane の fork の進み具合は見ない。サーバの断り（fork_unavailable など）はそのまま失敗", async () => {
    const h = harness(async () => RESULT);
    const run = runAgentFork({ ...base, timeoutMs: 200 }, store);
    const settled = run.catch((e) => e);
    await vi.waitFor(() => expect(h.request).toHaveBeenCalled());
    h.emit({ event: "agent.fork_progress", data: { sourcePaneId: "p3", paneId: "other", stage: "done" } });
    h.emit({ event: "agent.fork_progress", data: { sourcePaneId: "p77", paneId: "p9", stage: "done" } });
    expect(((await settled) as RpcFailure).code).toBe("timeout");
    harness(async () => {
      throw new RpcFailure("fork_unavailable", "no_session_id: x");
    });
    await expect(runAgentFork(base, store)).rejects.toMatchObject({ code: "fork_unavailable" });
  });

  it("人が読む出力（--json なし）", async () => {
    harness(async () => ({ ...RESULT, target: "worktree", worktreePath: "/wt/x", noteStatus: "pending" }));
    await runAgentFork({ ...base, json: false, wait: false }, store);
    expect(vi.mocked(printLine).mock.calls[0]![0]).toContain("pane p9");
    expect(formatFork({ ...RESULT, target: "worktree", worktreePath: "/wt/x", noteStatus: "skipped", noteReason: "制御文字", stage: "done" } as never)).toContain("送れませんでした（制御文字）");
  });
});
