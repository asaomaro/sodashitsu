import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, getActivePinia } from "pinia";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import type { SubagentHistoryItem, Pane, Tab, Workspace } from "@sodashitsu/protocol";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";
import { useMachinesStore } from "../store/machines.js";
import { useChildConversationStore } from "../store/childConversation.js";
import { ConnectionKey } from "../injection.js";
import ChildConversationWindow from "./ChildConversationWindow.vue";
const flush = async () => {
  for (let i = 0; i < 20; i++) await nextTick();
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
  control: () => unknown | Promise<unknown> = () => ({
    mode: "parent-draft",
    reason: "transport-unavailable",
  }),
  historical?: SubagentHistoryItem,
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
  if (historical) store.openHistorical("p", historical);
  else store.open("p", "c");
  const rpc = vi.fn(async (method: string, params: unknown) =>
    method === "agent.subagent_control" ? control() : request(method, params),
  );
  const wrapper = mount(ChildConversationWindow, {
    global: {
      plugins: [getActivePinia()!],
      provide: { [ConnectionKey as symbol]: { request: rpc } },
    },
  });
  return { wrapper, session, view, store, request, rpc, pane };
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
  f.session.paneUpserted({
    ...f.pane,
    agent: { ...f.pane.agent!, subagents: { count: 0, items: [] } },
  });
  await flush();
  await vi.advanceTimersByTimeAsync(1500);
  expect(f.request).toHaveBeenCalledTimes(2);
  expect(f.wrapper.text()).toContain("GENERATED CHILD REPLY");
  f.session.paneUpserted({
    ...f.pane,
    agent: {
      ...f.pane.agent!,
      subagents: { count: 1, items: [{ id: "c", startedAt: 1, hasTranscript: false }] },
    },
  });
  await flush();
  expect(f.wrapper.find("[data-subagent-transcript]").exists()).toBe(false);
  await vi.advanceTimersByTimeAsync(3000);
  expect(f.request).toHaveBeenCalledTimes(2);
  f.wrapper.unmount();
});

const lease = "11111111-1111-4111-8111-111111111111";
const ready = () => ({
  mode: "direct",
  reason: "ready",
  leaseId: lease,
  expiresAt: Date.now() + 10000,
});
it("uses a new lease after typing for eleven seconds and sends only to the explicit child target", async () => {
  let checks = 0;
  const f = fixture(
    false,
    vi.fn(async () => ({ status: "accepted", reason: "accepted", turnId: "generated" })) as never,
    () => {
      checks++;
      return ready();
    },
  );
  await flush();
  expect(f.wrapper.text()).toContain("送信先: 子「Child task」");
  expect(f.wrapper.find(".sat-head").exists()).toBe(false);
  await f.wrapper.get('[aria-label="子へのメッセージ"]').setValue("generated direct message");
  await vi.advanceTimersByTimeAsync(11000);
  const before = checks;
  await f.wrapper.get("[data-child-compose]").trigger("submit");
  await flush();
  expect(checks).toBe(before + 1);
  expect(f.request).toHaveBeenCalledTimes(1);
  expect(f.request.mock.calls[0]?.[0]).toBe("agent.subagent_send");
  expect(f.request.mock.calls[0]?.[1]).toMatchObject({
    paneId: "p",
    agentId: "c",
    leaseId: lease,
    text: "generated direct message",
  });
  expect(f.wrapper.get<HTMLTextAreaElement>('[aria-label="子へのメッセージ"]').element.value).toBe(
    "",
  );
  expect(f.wrapper.text()).toContain("処理の完了ではありません");
  f.wrapper.unmount();
});
it.each([
  null,
  {},
  { mode: "direct", reason: "ready" },
  { mode: "parent-draft", reason: "transport-not-connected" },
])("does not compose direct messages without a complete capability %#", async (raw) => {
  const f = fixture(false, undefined, () => raw);
  await flush();
  expect(f.wrapper.find('[aria-label="子へのメッセージ"]').exists()).toBe(false);
  expect(f.request).not.toHaveBeenCalled();
  f.wrapper.unmount();
});
it.each(["unknown", "throw"])(
  "retains the child draft and locks direct input after %s",
  async (why) => {
    const f = fixture(
      false,
      vi.fn(async () => {
        if (why === "throw") throw Error("generated timeout");
        return { status: "delivery-unknown", reason: "delivery-unknown" };
      }) as never,
      ready,
    );
    await flush();
    await f.wrapper.get('[aria-label="子へのメッセージ"]').setValue("keep generated draft");
    await f.wrapper.get("[data-child-compose]").trigger("submit");
    await flush();
    expect(f.wrapper.text()).toContain("自動再送しません");
    expect(
      f.wrapper.get<HTMLTextAreaElement>('[aria-label="子へのメッセージ"]').element.value,
    ).toBe("keep generated draft");
    expect(f.wrapper.get('[aria-label="子へのメッセージ"]').attributes("readonly")).toBeDefined();
    await f.wrapper.get("[data-child-compose]").trigger("submit");
    await flush();
    expect(f.request).toHaveBeenCalledTimes(1);
    await f.wrapper.get("footer>button").trigger("click");
    expect(
      f.wrapper.get<HTMLTextAreaElement>('[aria-label="親への依頼の下書き"]').element.value,
    ).toContain("keep generated draft");
    expect(f.request).toHaveBeenCalledTimes(1);
    f.wrapper.unmount();
  },
);
it("distinguishes a failed fresh capability read from attempted delivery", async () => {
  let checks = 0;
  const f = fixture(false, undefined, () => {
    if (++checks > 1) throw Error("generated read failure");
    return ready();
  });
  await flush();
  await f.wrapper.get('[aria-label="子へのメッセージ"]').setValue("not sent");
  await f.wrapper.get("[data-child-compose]").trigger("submit");
  await flush();
  expect(f.wrapper.text()).toContain("まだ送信していません");
  expect(f.request).not.toHaveBeenCalled();
  f.wrapper.unmount();
});
it.each(["scope", "draft", "close"])(
  "does not send after %s changes during the fresh capability read",
  async (why) => {
    let checks = 0,
      finish!: (value: unknown) => void;
    const f = fixture(false, undefined, () =>
      ++checks === 1
        ? ready()
        : new Promise((r) => {
            finish = r;
          }),
    );
    await flush();
    await f.wrapper.get('[aria-label="子へのメッセージ"]').setValue("old generated draft");
    await f.wrapper.get("[data-child-compose]").trigger("submit");
    await flush();
    if (why === "scope") f.session.clientId = "replacement";
    else if (why === "close") f.store.close();
    else
      (
        f.wrapper.vm as unknown as { $: { setupState: Record<string, unknown> } }
      ).$.setupState.childDraft = "replacement draft";
    await flush();
    finish(ready());
    await flush();
    expect(f.request).not.toHaveBeenCalled();
    f.wrapper.unmount();
  },
);

const historicalRow: SubagentHistoryItem = {
  id: "c",
  entryId: "99999999-9999-4999-8999-999999999999",
  terminalStatus: "completed",
  description: "Finished generated child",
  model: "history-model",
  modelBasis: "turn",
  hasTranscript: true,
};
it("uses only exact history methods for a historical selection, even with a same-id current child", async () => {
  const request = vi.fn(async (method: string) =>
    method === "agent.subagent_history_transcript"
      ? {
          status: "ok",
          entries: [{ kind: "say", text: "EXACT GENERATED HISTORY" }],
          offset: 1,
          reset: false,
          omittedBefore: false,
          running: false,
          terminalStatus: "completed",
        }
      : method === "agent.subagent_history_usage"
        ? {
            status: "ok",
            usage: {
              source: "rollout",
              consumptionScope: "self",
              tokens: { basis: "transcript", input: 7 },
              partial: true,
            },
          }
        : {},
  );
  const f = fixture(
    false,
    request as never,
    () => {
      throw Error("historical control must not be queried");
    },
    historicalRow,
  );
  await flush();
  expect(f.wrapper.text()).toContain("EXACT GENERATED HISTORY");
  expect(f.wrapper.text()).toContain("終了履歴 · 完了");
  expect(f.wrapper.find('[aria-label="子へのメッセージ"]').exists()).toBe(false);
  await f.wrapper.get(".child-usage>button").trigger("click");
  await flush();
  expect(f.request.mock.calls.map((c) => c[0])).toEqual([
    "agent.subagent_history_transcript",
    "agent.subagent_history_usage",
  ]);
  for (const call of f.request.mock.calls)
    expect(call[1]).toMatchObject({ entryId: historicalRow.entryId });
  expect(f.rpc.mock.calls.some((c) => c[0] === "agent.subagent_control")).toBe(false);
  await f.wrapper.get("footer>button").trigger("click");
  await f.wrapper
    .get('[aria-label="親への依頼の下書き"]')
    .setValue("Generated explicit parent request");
  expect(f.request).toHaveBeenCalledTimes(2);
  await f.wrapper.get("form").trigger("submit");
  await flush();
  expect(f.request.mock.calls.at(-1)?.[0]).toBe("agent.prompt_checked");
  f.wrapper.unmount();
});
it("never retries an unavailable historical transcript through the current child route", async () => {
  const f = fixture(
    false,
    vi.fn(async () => {
      throw { code: "method_not_found" };
    }) as never,
    undefined,
    historicalRow,
  );
  await flush();
  await vi.advanceTimersByTimeAsync(6000);
  expect(f.request).toHaveBeenCalledTimes(1);
  expect(f.request.mock.calls[0]?.[0]).toBe("agent.subagent_history_transcript");
  expect(f.rpc.mock.calls.some((c) => c[0] === "agent.subagent_control")).toBe(false);
  f.wrapper.unmount();
});
