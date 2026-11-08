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
  for (let i = 0; i < 8; i++) await Promise.resolve();
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
  const dialog = new ChildConversationDialog(
    "p1",
    "c",
    "i",
    model,
    ui,
    { request } as unknown as RequestPort,
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

it("clears an edited parent draft when the connection changes before submission",()=>{
 const f=fixture(undefined,false);f.dialog.handleKey({key:"p"} as never);f.dialog.handlePaste("PRIVATE GENERATED DRAFT");expect(f.render()).toContain("PRIVATE GENERATED DRAFT");f.disconnect();expect(f.render()).not.toContain("PRIVATE GENERATED DRAFT");f.dialog.handleKey({key:"Tab"} as never);f.dialog.handleKey({key:"Enter"} as never);expect(f.request).not.toHaveBeenCalled();f.dialog.dispose();
});
