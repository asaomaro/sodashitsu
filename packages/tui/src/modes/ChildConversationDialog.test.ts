import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SessionModel } from "../model/SessionModel.js";
import { UiState } from "../model/UiState.js";
import { Grid } from "../render/Screen.js";
import { ThemeColors } from "../render/color.js";
import { snapshot } from "../testing/fixtures.js";
import { ChildConversationDialog } from "./ChildConversationDialog.js";
import type { RequestPort } from "../term/PaneRegistry.js";
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const result = () => ({
  status: "ok",
  entries: [{ kind: "say", text: "GENERATED CHILD REPLY" }],
  offset: 1,
  reset: false,
  omittedBefore: false,
  running: false,
  state: "unknown",
});
function fixture(
  request = vi.fn(async (_method: string, _params: unknown) => result()),
  readable = true,
  control: () => unknown | Promise<unknown> = () => ({
    mode: "parent-draft",
    reason: "transport-unavailable",
  }),
) {
  const model = new SessionModel();
  model.applySnapshot(snapshot(), "client");
  const original = model.panes.get("p1")!;
  const p = {
    ...original,
    agent: {
      ...original.agent!,
      kind: "codex",
      instanceId: "i",
      name: "parent-agent",
      state: "idle" as const,
      subagents: {
        count: 1,
        items: [{ id: "c", description: "Generated Child", startedAt: 1, hasTranscript: readable }],
      },
    },
    agentSession: { kind: "codex" as const, sessionId: "s", reportedAt: 1 },
  };
  model.panes.set("p1", p);
  const t = model.tabs.get(p.tabId)!;
  model.workspaces.set(t.workspaceId, {
    ...model.workspaces.get(t.workspaceId)!,
    projectDir: "/generated",
  });
  const ui = new UiState(model);
  let outer: string | null = "machine-client";
  const rpc = vi.fn(async (method: string, params: unknown) =>
    method === "agent.subagent_control" ? control() : request(method, params),
  );
  const dialog = new ChildConversationDialog(
    "p1",
    "c",
    "i",
    model,
    ui,
    { request: rpc } as unknown as RequestPort,
    () => outer,
    vi.fn(),
  );
  const render = () => {
    const grid = new Grid(110, 34);
    dialog.render({ grid, theme: new ThemeColors("dracula") });
    return Array.from({ length: grid.h }, (_, y) => grid.rowText(y)).join("\n");
  };
  return {
    dialog,
    model,
    p,
    request,
    rpc,
    ui,
    render,
    disconnect: () => {
      outer = null;
    },
  };
}
it("opens a dedicated readonly view and only sends a checked parent draft after explicit confirmation", async () => {
  const f = fixture();
  await flush();
  expect(f.render()).toContain("GENERATED CHILD REPLY");
  expect(f.render()).toContain("Generated Child");
  f.dialog.handleKey({ key: "p" } as never);
  f.dialog.handlePaste("generated request");
  expect(f.render()).toContain("送信先: 親");
  expect(f.request).toHaveBeenCalledTimes(1);
  f.dialog.handleKey({ key: "Enter" } as never);
  expect(f.request).toHaveBeenCalledTimes(1);
  f.dialog.handleKey({ key: "Enter" } as never);
  await flush();
  expect(f.request.mock.calls[1]?.[0]).toBe("agent.prompt_checked");
  expect(f.request.mock.calls[1]?.[1]).toMatchObject({
    paneId: "p1",
    instanceId: "i",
    expect: { name: "parent-agent", projectDir: "/generated" },
  });
  f.dialog.dispose();
});
it("opens an unprovided log without fabricating records or zeroes", () => {
  const f = fixture(undefined, false);
  expect(f.render()).toContain("会話記録は未取得");
  expect(f.request).not.toHaveBeenCalled();
  f.dialog.dispose();
});
it.each(["instance", "kind", "refkind", "session", "connection", "close", "proof"])(
  "drops late child data on %s invalidation",
  async (change) => {
    let resolve!: (v: unknown) => void;
    const request = vi.fn(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const f = fixture(request as never);
    if (change === "close") f.dialog.dispose();
    else if (change === "connection") f.disconnect();
    else
      f.model.panes.set("p1", {
        ...f.p,
        agent: {
          ...f.p.agent,
          ...(change === "instance"
            ? { instanceId: "new" }
            : change === "kind"
              ? { kind: "claude" }
              : change === "proof"
                ? {
                    subagents: {
                      count: 1,
                      items: [{ id: "c", startedAt: 1, hasTranscript: false }],
                    },
                  }
                : {}),
        },
        agentSession: {
          ...f.p.agentSession,
          ...(change === "refkind"
            ? { kind: "claude" }
            : change === "session"
              ? { sessionId: "new" }
              : {}),
        },
      });
    f.render();
    resolve(result());
    await flush();
    await vi.advanceTimersByTimeAsync(4500);
    expect(f.render()).not.toContain("GENERATED CHILD REPLY");
    expect(request).toHaveBeenCalledTimes(1);
    f.dialog.dispose();
  },
);
it("never silently sends a parent request when the parent is blocked", async () => {
  const f = fixture(undefined, false);
  f.dialog.handleKey({ key: "p" } as never);
  f.dialog.handlePaste("generated request");
  f.dialog.handleKey({ key: "Tab" } as never);
  f.model.panes.set("p1", { ...f.p, agent: { ...f.p.agent, state: "blocked" } });
  f.dialog.handleKey({ key: "Enter" } as never);
  await flush();
  expect(f.request).not.toHaveBeenCalled();
  f.dialog.dispose();
});

it("clears an edited parent draft when the connection changes before submission", () => {
  const f = fixture(undefined, false);
  f.dialog.handleKey({ key: "p" } as never);
  f.dialog.handlePaste("PRIVATE GENERATED DRAFT");
  expect(f.render()).toContain("PRIVATE GENERATED DRAFT");
  f.disconnect();
  expect(f.render()).not.toContain("PRIVATE GENERATED DRAFT");
  f.dialog.handleKey({ key: "Tab" } as never);
  f.dialog.handleKey({ key: "Enter" } as never);
  expect(f.request).not.toHaveBeenCalled();
  f.dialog.dispose();
});

const lease = "11111111-1111-4111-8111-111111111111";
const ready = () => ({
  mode: "direct",
  reason: "ready",
  leaseId: lease,
  expiresAt: Date.now() + 10000,
});
const key = (f: ReturnType<typeof fixture>, key: string) => f.dialog.handleKey({ key } as never);
it("allows an explicit child send without a transcript and reacquires a lease after typing", async () => {
  let checks = 0;
  const f = fixture(
    vi.fn(async () => ({ status: "accepted", reason: "accepted", turnId: "generated" })) as never,
    false,
    () => {
      checks++;
      return ready();
    },
  );
  await flush();
  expect(f.render()).toContain("C: 子へ送信");
  key(f, "c");
  f.dialog.handlePaste("generated child request");
  expect(f.render()).toContain("送信先: 子");
  await vi.advanceTimersByTimeAsync(11000);
  const before = checks;
  key(f, "Enter");
  expect(f.request).not.toHaveBeenCalled();
  key(f, "Enter");
  key(f, "Enter");
  await flush();
  expect(checks).toBe(before + 1);
  expect(f.request).toHaveBeenCalledTimes(1);
  expect(f.request.mock.calls[0]?.[0]).toBe("agent.subagent_send");
  expect(f.request.mock.calls[0]?.[1]).toMatchObject({
    paneId: "p1",
    agentId: "c",
    leaseId: lease,
    text: "generated child request",
  });
  expect(f.render()).toContain("処理の完了ではありません");
  f.dialog.dispose();
});
it.each([null, {}, { mode: "direct", reason: "ready" }])(
  "keeps incomplete capability readonly %#",
  async (raw) => {
    const f = fixture(undefined, false, () => raw);
    await flush();
    key(f, "c");
    f.dialog.handlePaste("not a draft");
    key(f, "Enter");
    key(f, "Enter");
    await flush();
    expect(f.request).not.toHaveBeenCalled();
    expect(f.render()).not.toContain("送信先: 子");
    f.dialog.dispose();
  },
);
it.each(["unknown", "throw"])("keeps the child draft without resending after %s", async (why) => {
  const f = fixture(
    vi.fn(async () => {
      if (why === "throw") throw Error("generated timeout");
      return { status: "delivery-unknown", reason: "delivery-unknown" };
    }) as never,
    false,
    ready,
  );
  await flush();
  key(f, "c");
  f.dialog.handlePaste("retain generated text");
  key(f, "Enter");
  key(f, "Enter");
  await flush();
  expect(f.render()).toContain("自動再送しません");
  key(f, "Enter");
  await flush();
  expect(f.request).toHaveBeenCalledTimes(1);
  key(f, "Escape");
  key(f, "p");
  expect(f.render()).toContain("retain generated text");
  expect(f.request).toHaveBeenCalledTimes(1);
  f.dialog.dispose();
});
it.each(["instance", "kind", "refkind", "session", "connection", "close", "escape"])(
  "does not send when %s changes during a fresh capability read",
  async (why) => {
    let checks = 0,
      finish!: (value: unknown) => void;
    const f = fixture(undefined, false, () =>
      ++checks === 1
        ? ready()
        : new Promise((r) => {
            finish = r;
          }),
    );
    await flush();
    key(f, "c");
    f.dialog.handlePaste("old draft");
    key(f, "Enter");
    key(f, "Enter");
    await flush();
    if (why === "connection") f.disconnect();
    else if (why === "close") f.dialog.dispose();
    else if (why === "escape") key(f, "Escape");
    else
      f.model.panes.set("p1", {
        ...f.p,
        agent: {
          ...f.p.agent,
          ...(why === "instance"
            ? { instanceId: "new" }
            : why === "kind"
              ? { kind: "claude" }
              : {}),
        },
        agentSession: {
          ...f.p.agentSession,
          ...(why === "refkind"
            ? { kind: "claude" }
            : why === "session"
              ? { sessionId: "new" }
              : {}),
        },
      });
    finish(ready());
    await flush();
    expect(f.request).not.toHaveBeenCalled();
    f.dialog.dispose();
  },
);
it("reports capability failure as unsent and preserves the input", async () => {
  let checks = 0;
  const f = fixture(undefined, false, () => {
    if (++checks > 1) throw Error("generated failure");
    return ready();
  });
  await flush();
  key(f, "c");
  f.dialog.handlePaste("unsent draft");
  key(f, "Enter");
  key(f, "Enter");
  await flush();
  expect(f.render()).toContain("まだ送信していません");
  expect(f.request).not.toHaveBeenCalled();
  f.dialog.dispose();
});
it("accepts a long bounded child draft and rejects oversized edits without silently truncating it", async () => {
  const f = fixture(undefined, false, ready);
  await flush();
  key(f, "c");
  f.dialog.handlePaste("あ".repeat(5000));
  const draft = (f.dialog as unknown as { childDraft: { value: string } }).childDraft;
  expect(draft.value).toHaveLength(5000);
  f.dialog.handlePaste("z".repeat(20000));
  expect(draft.value).toBe("あ".repeat(5000));
  expect(f.render()).toContain("長すぎる");
  expect(f.request).not.toHaveBeenCalled();
  f.dialog.dispose();
});

it("sends the edited child draft from an explicit click on the rendered send row", async () => {
  const f = fixture(
    vi.fn(async () => ({
      status: "accepted",
      reason: "accepted",
      turnId: "generated-mouse",
    })) as never,
    false,
    ready,
  );
  await flush();
  key(f, "c");
  f.dialog.handlePaste("generated mouse request");
  const y = f
    .render()
    .split("\n")
    .findIndex((row) => row.includes("[ 子へ送信 ]"));
  expect(y).toBeGreaterThan(0);
  f.dialog.handleMouse({ action: "down", button: 0, x: 8, y } as never);
  await flush();
  expect(f.request).toHaveBeenCalledTimes(1);
  expect(f.request.mock.calls[0]?.[0]).toBe("agent.subagent_send");
  expect(f.request.mock.calls[0]?.[1]).toMatchObject({ text: "generated mouse request" });
  expect(f.render()).toContain("処理の完了ではありません");
  f.dialog.dispose();
});
