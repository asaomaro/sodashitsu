import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, getActivePinia } from "pinia";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import type { Pane, Tab, Workspace } from "@sodashitsu/protocol";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";
import { useMachinesStore } from "../store/machines.js";
import { ConnectionKey } from "../injection.js";
import SubagentHistoryList from "./SubagentHistoryList.vue";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = (n: number) => ({
  id: `child-${n}`,
  entryId: uuid(n),
  terminalStatus: "completed",
  description: `Generated finished ${n}`,
  model: "observed-model",
  modelBasis: "turn",
  reasoningEffort: "low",
  reasoningEffortBasis: "turn",
  hasTranscript: true,
});
const page = (items: unknown[], other: Record<string, unknown> = {}) => ({
  status: "ok",
  items,
  offset: items.length,
  revision: uuid(999),
  reset: false,
  more: false,
  omittedBefore: false,
  incomplete: false,
  ...other,
});
const flush = async () => {
  for (let i = 0; i < 16; i++) await nextTick();
};
const wrappers: Array<{ unmount: () => void }> = [];
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.useFakeTimers();
});
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount();
  vi.useRealTimers();
});
function fixture(reply: (params: unknown) => unknown | Promise<unknown> = () => page([row(1)])) {
  const session = useSessionStore(),
    view = useViewStore();
  view.onConnectionState("open");
  session.clientId = "generated-client";
  session.workspaceUpserted({ id: "w", projectDir: "/generated", tabIds: ["t"] } as Workspace);
  session.tabUpserted({ id: "t", workspaceId: "w", focusedPaneId: "p" } as Tab);
  const pane = {
    id: "p",
    tabId: "t",
    agent: {
      instanceId: "i",
      kind: "codex",
      name: "generated-parent",
      state: "idle",
      subagents: { count: 0, items: [] },
    },
    agentSession: { kind: "codex", sessionId: "s", reportedAt: 1 },
  } as Pane;
  session.paneUpserted(pane);
  const request = vi.fn(async (_m: string, p: unknown) => reply(p));
  const wrapper = mount(SubagentHistoryList, {
    props: { paneId: "p" },
    global: { plugins: [getActivePinia()!], provide: { [ConnectionKey as symbol]: { request } } },
  });
  wrappers.push(wrapper);
  return { wrapper, session, view, pane, request };
}
it("selects a formal history entry with no current children, without adding active counts or guessed timestamps", async () => {
  const f = fixture();
  await flush();
  expect(f.wrapper.text()).toContain("Generated finished 1");
  expect(f.wrapper.text()).toContain("observed-model low");
  expect(f.wrapper.findAll(".history-date")).toHaveLength(0);
  await f.wrapper.get("[data-history-entry]").trigger("click");
  expect(f.wrapper.emitted("select")?.[0]?.[0]).toMatchObject({
    entryId: uuid(1),
    terminalStatus: "completed",
  });
  expect(f.session.panes.get("p")?.agent?.subagents?.count).toBe(0);
  expect(f.request.mock.calls[0]?.[0]).toBe("agent.subagent_history");
});
it.each(["instance", "kind", "refkind", "session", "client", "machine", "connection"])(
  "does not query a replacement actor or display a late page after %s changes",
  async (why) => {
    let finish!: (v: unknown) => void;
    const f = fixture(
      () =>
        new Promise((r) => {
          finish = r;
        }),
    );
    await flush();
    if (why === "client") f.session.clientId = "new";
    else if (why === "machine") useMachinesStore().selectedId = "new";
    else if (why === "connection") f.view.onConnectionState("reconnecting");
    else
      f.session.paneUpserted({
        ...f.pane,
        agent: {
          ...f.pane.agent!,
          ...(why === "instance"
            ? { instanceId: "new" }
            : why === "kind"
              ? { kind: "claude" }
              : {}),
        },
        agentSession: {
          ...f.pane.agentSession!,
          ...(why === "refkind"
            ? { kind: "claude" }
            : why === "session"
              ? { sessionId: "new" }
              : {}),
        },
      });
    await flush();
    finish(page([row(1)]));
    await flush();
    await vi.advanceTimersByTimeAsync(30000);
    expect(f.wrapper.findAll("[data-history-entry]")).toHaveLength(0);
    expect(f.request).toHaveBeenCalledTimes(1);
  },
);
it("replaces pages rather than mixing a new revision", async () => {
  const f = fixture((p) =>
    (p as { offset: number }).offset === 0
      ? page([row(1)], { offset: 1, more: true })
      : page([row(2)], { offset: 1, revision: uuid(998), reset: true }),
  );
  await flush();
  await f.wrapper.findAll("button").find(b=>b.text()==="さらに表示")!.trigger("click");
  await flush();
  expect(f.wrapper.text()).toContain("Generated finished 2");
  expect(f.wrapper.text()).not.toContain("Generated finished 1");
});
it("reports old peer/pending as unavailable or pending instead of zero, and never invokes a current child method", async () => {
  const old = fixture(() => {
    throw { code: "method_not_found" };
  });
  await flush();
  expect(old.wrapper.text()).toContain("この操舵室の接続経路");
  await vi.advanceTimersByTimeAsync(30000);
  expect(old.request).toHaveBeenCalledTimes(1);
  expect(old.request.mock.calls.every((c) => c[0] === "agent.subagent_history")).toBe(true);
  const waiting = fixture(() => page([], { status: "pending" }));
  await flush();
  expect(waiting.wrapper.text()).toContain("確認しています");
  expect(waiting.wrapper.text()).not.toContain("ありません");
});
