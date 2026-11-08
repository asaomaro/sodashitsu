import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, getActivePinia } from "pinia";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import type { Pane, Tab, Workspace } from "@sodashitsu/protocol";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";
import { useMachinesStore } from "../store/machines.js";
import { useChildConversationStore } from "../store/childConversation.js";
import { ConnectionKey } from "../injection.js";
import ChildConversationWindow from "./ChildConversationWindow.vue";
const flush = async () => {
  for (let i = 0; i < 8; i++) await nextTick();
};
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());
function fixture(
  readable = true,
  request = vi.fn(async (_method: string, _params: unknown) => ({
    status: "ok",
    entries: [{ kind: "say", text: "GENERATED CHILD REPLY" }],
    offset: 1,
    reset: false,
    omittedBefore: false,
    running: false,
    state: "unknown",
  })),
) {
  const session = useSessionStore(),
    view = useViewStore(),
    store = useChildConversationStore();
  view.onConnectionState("open");
  session.clientId = "client1";
  session.workspaceUpserted({ id: "w", projectDir: "/generated", tabIds: ["t"] } as Workspace);
  session.tabUpserted({ id: "t", workspaceId: "w", focusedPaneId: "p" } as Tab);
  const pane = {
    id: "p",
    tabId: "t",
    label: "Parent task",
    agent: {
      instanceId: "i",
      kind: "codex",
      name: "parent-agent",
      label: "Codex",
      state: "idle",
      subagents: {
        count: 1,
        items: [{ id: "c", description: "Child task", startedAt: 1, hasTranscript: readable }],
      },
    },
    agentSession: { kind: "codex", sessionId: "s", reportedAt: 1 },
  } as Pane;
  session.paneUpserted(pane);
  store.open("p", "c");
  const wrapper = mount(ChildConversationWindow, {
    global: { plugins: [getActivePinia()!], provide: { [ConnectionKey as symbol]: { request } } },
  });
  return { wrapper, session, view, store, request, pane };
}
it("opens a distinct child conversation with explicit identities, readonly log and a parent draft without sending", async () => {
  const f = fixture();
  await flush();
  expect(f.wrapper.get('[role="dialog"]').attributes("aria-label")).toContain("サブエージェント");
  expect(f.wrapper.text()).toContain("Parent task");
  expect(f.wrapper.text()).toContain("Child task");
  expect(f.wrapper.text()).toContain("GENERATED CHILD REPLY");
  await f.wrapper.get("footer>button").trigger("click");
  await f.wrapper.get("textarea").setValue("Please ask this child to review the result");
  expect(f.wrapper.text()).toContain("送信先: 親「Parent task」");
  expect(f.request.mock.calls.map((c) => c[0])).toEqual(["agent.subagent_transcript"]);
  await f.wrapper.get("form").trigger("submit");
  await flush();
  expect(f.request.mock.calls[1]).toEqual([
    "agent.prompt_checked",
    {
      paneId: "p",
      instanceId: "i",
      text: "Please ask this child to review the result",
      expect: {
        paneId: "p",
        instanceId: "i",
        tabId: "t",
        projectDir: "/generated",
        name: "parent-agent",
      },
    },
  ]);
  f.wrapper.unmount();
});
it("allows selecting a child without a transcript and does not manufacture a readable log", async () => {
  const f = fixture(false);
  await flush();
  expect(f.wrapper.text()).toContain("会話記録は未取得");
  expect(f.request).not.toHaveBeenCalled();
  expect(f.wrapper.find("[data-subagent-transcript]").exists()).toBe(false);
  f.wrapper.unmount();
});
it.each(["instance", "kind", "refkind", "session", "client", "machine", "disconnect"])(
  "closes and discards a late response after %s changes",
  async (change) => {
    let resolve!: (v: unknown) => void;
    const request = vi.fn(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const f = fixture(true, request as never);
    await flush();
    if (change === "client") f.session.clientId = "client2";
    else if (change === "machine") useMachinesStore().selectedId = "other";
    else if (change === "disconnect") f.view.onConnectionState("reconnecting");
    else
      f.session.paneUpserted({
        ...f.pane,
        agent: {
          ...f.pane.agent!,
          ...(change === "instance"
            ? { instanceId: "new" }
            : change === "kind"
              ? { kind: "claude" }
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
    expect(f.store.target).toBeNull();
    expect(f.wrapper.find('[role="dialog"]').exists()).toBe(false);
    resolve({
      status: "ok",
      entries: [{ kind: "say", text: "STALE GENERATED" }],
      offset: 1,
      reset: false,
      omittedBefore: false,
      running: false,
    });
    await flush();
    await vi.advanceTimersByTimeAsync(3000);
    expect(f.wrapper.text()).not.toContain("STALE GENERATED");
    expect(request).toHaveBeenCalledTimes(1);
    f.wrapper.unmount();
  },
);
it("does not send a parent draft to a blocked actor or retry an unknown-method error through unchecked prompt", async () => {
  const f = fixture(
    false,
    vi.fn(async () => {
      throw { code: "method_not_found" };
    }) as never,
  );
  await f.wrapper.get("footer>button").trigger("click");
  await f.wrapper.get("textarea").setValue("draft");
  f.session.paneUpserted({ ...f.pane, agent: { ...f.pane.agent!, state: "blocked" } });
  await f.wrapper.get("form").trigger("submit");
  expect(f.request).not.toHaveBeenCalled();
  f.session.paneUpserted(f.pane);
  await f.wrapper.get("form").trigger("submit");
  await flush();
  expect(f.request).toHaveBeenCalledTimes(1);
  expect(f.request.mock.calls[0]?.[0]).toBe("agent.prompt_checked");
  expect(f.wrapper.get("textarea").element.value).toBe("draft");
  f.wrapper.unmount();
});

it("keeps an already opened historical read when the child leaves active membership, while explicit proof revocation removes the log", async () => {
  const f = fixture();
  await flush();
  f.session.paneUpserted({...f.pane,agent:{...f.pane.agent!,subagents:{count:0,items:[]}}});
  await flush();
  await vi.advanceTimersByTimeAsync(1500);
  expect(f.request).toHaveBeenCalledTimes(2);
  expect(f.wrapper.text()).toContain("GENERATED CHILD REPLY");
  f.session.paneUpserted({...f.pane,agent:{...f.pane.agent!,subagents:{count:1,items:[{id:"c",startedAt:1,hasTranscript:false}]}}});
  await flush();
  expect(f.wrapper.find("[data-subagent-transcript]").exists()).toBe(false);
  await vi.advanceTimersByTimeAsync(3000);
  expect(f.request).toHaveBeenCalledTimes(2);
  f.wrapper.unmount();
});
