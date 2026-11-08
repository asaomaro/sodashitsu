import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, getActivePinia } from "pinia";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import type { Pane, Tab, Workspace } from "@sodashitsu/protocol";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";
import { useMachinesStore } from "../store/machines.js";
import { ConnectionKey } from "../injection.js";
import SubagentUsagePanel from "./SubagentUsagePanel.vue";
import PaneInfo from "../dashboard/PaneInfoView.vue";
const flush = async () => {
  for (let i = 0; i < 12; i++) await nextTick();
};
const reply = {
  status: "ok",
  usage: {
    source: "rollout",
    consumptionScope: "self",
    tokens: { basis: "transcript", input: 42, output: 0 },
    contextTokens: 0,
    contextWindowTokens: 1000,
    contextUsedPct: 0,
    partial: true,
  },
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
function fixture(
  request = vi.fn(async (_method: string, _params: unknown) => reply),
  info = false,
) {
  const session = useSessionStore(),
    view = useViewStore();
  view.onConnectionState("open");
  session.clientId = "generated-client";
  session.workspaceUpserted({ id: "w", projectDir: "/generated", tabIds: ["t"] } as Workspace);
  session.tabUpserted({ id: "t", workspaceId: "w", focusedPaneId: "p" } as Tab);
  const pane = {
    id: "p",
    tabId: "t",
    label: "Generated parent",
    agent: {
      instanceId: "i",
      kind: "codex",
      name: "generated-parent",
      label: "Codex",
      state: "idle",
      subagents: {
        count: 2,
        items: [
          { id: "a", startedAt: 1, description: "Child A", hasTranscript: false },
          { id: "b", startedAt: 2, description: "Child B", hasTranscript: false },
        ],
      },
    },
    agentSession: { kind: "codex", sessionId: "s", reportedAt: 1 },
  } as Pane;
  session.paneUpserted(pane);
  const wrapper = info
    ? mount(PaneInfo, {
        props: { paneId: "p", kind: "popover", active: true },
        global: {
          plugins: [getActivePinia()!],
          provide: { [ConnectionKey as symbol]: { request } },
        },
      })
    : mount(SubagentUsagePanel, {
        props: { paneId: "p", agentId: "a" },
        global: {
          plugins: [getActivePinia()!],
          provide: { [ConnectionKey as symbol]: { request } },
        },
      });
  wrappers.push(wrapper);
  return { wrapper, request, session, view, pane };
}
it("lazily reads child-only numeric data without a transcript, keeps zero and omits unreported total/cost", async () => {
  const f = fixture();
  await flush();
  expect(f.request).not.toHaveBeenCalled();
  await f.wrapper.get("button").trigger("click");
  await flush();
  expect(f.request.mock.calls[0]).toEqual(["agent.subagent_usage", { paneId: "p", agentId: "a" }]);
  expect(f.wrapper.text()).toContain("42");
  expect(f.wrapper.text()).toContain("一部取得");
  expect(f.wrapper.find('[role="meter"]').attributes("aria-valuenow")).toBe("0");
  expect(f.wrapper.text()).not.toContain("コスト (USD)");
  expect(f.wrapper.text()).not.toContain("合計");
});
it.each(["instance", "kind", "refkind", "session", "client", "machine", "connection", "birth"])(
  "drops old numeric data when %s changes",
  async (change) => {
    let finish!: (v: unknown) => void;
    const f = fixture(
      vi.fn(
        () =>
          new Promise((r) => {
            finish = r;
          }),
      ) as never,
    );
    await f.wrapper.get("button").trigger("click");
    await flush();
    if (change === "client") f.session.clientId = "new";
    else if (change === "machine") useMachinesStore().selectedId = "new";
    else if (change === "connection") f.view.onConnectionState("reconnecting");
    else
      f.session.paneUpserted({
        ...f.pane,
        agent: {
          ...f.pane.agent!,
          ...(change === "instance"
            ? { instanceId: "new" }
            : change === "kind"
              ? { kind: "claude" }
              : change === "birth"
                ? { subagents: { count: 1, items: [{ id: "a", startedAt: 99 }] } }
                : {}),
        },
        agentSession: {
          ...f.pane.agentSession!,
          ...(change === "refkind"
            ? { kind: "claude" }
            : change === "session"
              ? { sessionId: "new" }
              : {}),
        },
      });
    await flush();
    finish(reply);
    await flush();
    expect(f.wrapper.find("[data-child-usage]").exists()).toBe(false);
    expect(f.wrapper.text()).not.toContain("42");
    await vi.advanceTimersByTimeAsync(30000);
    expect(f.request).toHaveBeenCalledTimes(1);
  },
);
it("shows the backend historical reason without claiming current usage after active membership leaves", async () => {
  let history = false;
  const reason = "確認済みの親子対応による履歴です。現在の子runは再確認できません";
  const f = fixture(vi.fn(async () => (history ? { ...reply, reason } : reply)) as never);
  await f.wrapper.get("button").trigger("click");
  await flush();
  history = true;
  f.session.paneUpserted({
    ...f.pane,
    agent: { ...f.pane.agent!, subagents: { count: 0, items: [] } },
  });
  await vi.advanceTimersByTimeAsync(10000);
  await flush();
  expect(f.wrapper.text()).toContain(reason);
  expect(f.wrapper.text()).toContain("一部取得");
});
it("uses one expanded child in the parent information window and keeps its conversation route absent", async () => {
  const f = fixture(undefined, true);
  await flush();
  expect(f.request).not.toHaveBeenCalled();
  const buttons = f.wrapper.findAll(".child-usage>button");
  expect(buttons).toHaveLength(2);
  await buttons[0]!.trigger("click");
  await flush();
  await buttons[1]!.trigger("click");
  await flush();
  expect(f.wrapper.findAll("[data-child-usage]")).toHaveLength(1);
  expect(f.request.mock.calls.map((c) => c[1])).toEqual([
    { paneId: "p", agentId: "a" },
    { paneId: "p", agentId: "b" },
  ]);
  await vi.advanceTimersByTimeAsync(10000);
  await flush();
  expect(f.request.mock.calls.at(-1)?.[1]).toEqual({ paneId: "p", agentId: "b" });
  expect(f.wrapper.find(".subagent-list-transcript").exists()).toBe(false);
});
it("clears unavailable or old-method data instead of retaining old numbers or reporting zero", async () => {
  let fail = false;
  const f = fixture(
    vi.fn(async () => {
      if (fail) throw { code: "method_not_found" };
      return reply;
    }) as never,
  );
  await f.wrapper.get("button").trigger("click");
  await flush();
  expect(f.wrapper.text()).toContain("42");
  fail = true;
  await vi.advanceTimersByTimeAsync(10000);
  await flush();
  expect(f.wrapper.text()).not.toContain("42");
  expect(f.wrapper.text()).toContain("利用ゼロを意味しません");
});
