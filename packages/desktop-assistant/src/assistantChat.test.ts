import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import type { AssistantSessionInfo, ConversationPage } from "@sodashitsu/protocol";
import { AssistantChat } from "./assistantChat.js";
import type { AssistantRpc } from "./assistantRpc.js";

const chats: AssistantChat[] = [];
afterEach(() => {
  for (const chat of chats.splice(0)) chat.stop();
});
function fixture() {
  const deviceId = randomUUID();
  let info: AssistantSessionInfo | null = null;
  let conversation: () => Promise<ConversationPage> = async () => {
    throw Error("No generated record yet");
  };
  const request = vi.fn(async (method: string, _input: unknown): Promise<unknown> => {
    if (method === "assistant.get" || method === "assistant.ensure") return structuredClone(info);
    if (method === "agent.kinds")
      return { kinds: [{ kind: "codex", label: "Codex", available: true }] };
    if (method === "agent.conversation") return conversation();
    return {};
  });
  const changed = vi.fn();
  const chat = new AssistantChat(
    deviceId,
    { request } as unknown as Pick<AssistantRpc, "request">,
    changed,
  );
  chats.push(chat);
  const actor = {
    instanceId: randomUUID(),
    kind: "codex",
    label: "generated",
    state: "idle" as const,
    completionSeq: 0,
    serverSeenSeq: 0,
    verified: true,
    since: 1,
  };
  const ready: AssistantSessionInfo = {
    deviceId,
    workspaceId: randomUUID(),
    paneId: randomUUID(),
    tabId: randomUUID(),
    kind: "codex",
    state: "ready",
    agent: actor,
    observedAgent: actor,
  };
  return {
    chat,
    request,
    changed,
    deviceId,
    ready,
    info(value: AssistantSessionInfo | null) {
      info = value;
    },
    page(read: () => Promise<ConversationPage>) {
      conversation = read;
    },
  };
}
async function connected(f: ReturnType<typeof fixture>) {
  f.chat.connection(true);
  await vi.waitFor(() => expect(f.chat.snapshot().kinds).toHaveLength(1));
  await vi.waitFor(() => expect(f.chat.snapshot().hint).not.toContain("確認しています"));
}
it("does not launch an agent while discovering a new installation; start is an explicit available-kind choice", async () => {
  const f = fixture();
  await connected(f);
  expect(f.request.mock.calls.some((call) => call[0] === "assistant.ensure")).toBe(false);
  const revision = f.chat.snapshot().revision;
  await f.chat.start({ revision, kind: "codex" });
  expect(f.request).toHaveBeenCalledWith("assistant.ensure", {
    deviceId: f.deviceId,
    kind: "codex",
    retry: false,
  });
  expect(() => f.chat.start({ revision: f.chat.snapshot().revision, kind: "claude" })).toThrow(
    "利用できません",
  );
});
it("sends only to the main-owned device and currently displayed instance; rejects stale or arbitrary pane claims", async () => {
  const f = fixture();
  f.info(f.ready);
  await connected(f);
  const revision = f.chat.snapshot().revision;
  expect(() =>
    f.chat.send({
      revision,
      instanceId: f.ready.agent!.instanceId,
      paneId: randomUUID(),
      text: "hello",
    }),
  ).toThrow();
  expect(() =>
    f.chat.send({ revision: revision - 1, instanceId: f.ready.agent!.instanceId, text: "hello" }),
  ).toThrow("状態が変わり");
  expect(() => f.chat.send({ revision, instanceId: randomUUID(), text: "wrong actor" })).toThrow("送信先");
  await f.chat.send({ revision, instanceId: f.ready.agent!.instanceId, text: "こんにちは" });
  expect(f.request).toHaveBeenCalledWith("assistant.prompt", {
    deviceId: f.deviceId,
    instanceId: f.ready.agent!.instanceId,
    text: "こんにちは",
  });
  f.chat.connection(false);
  expect(() =>
    f.chat.send({
      revision: f.chat.snapshot().revision,
      instanceId: f.ready.agent!.instanceId,
      text: "retry",
    }),
  ).toThrow();
  await connected(f);
  expect(f.request.mock.calls.filter((call) => call[0] === "assistant.prompt")).toHaveLength(1);
});
it("refuses to turn a blocked confirmation into a chat prompt and requires the exact observed actor for adoption", async () => {
  const f = fixture();
  f.info({ ...f.ready, agent: { ...f.ready.agent!, state: "blocked" } });
  await connected(f);
  expect(() =>
    f.chat.send({
      revision: f.chat.snapshot().revision,
      instanceId: f.ready.agent!.instanceId,
      text: "yes",
    }),
  ).toThrow("質問や承認");
  expect(() =>
    f.chat.adopt({ revision: f.chat.snapshot().revision, instanceId: randomUUID() }),
  ).toThrow("変わり");
  await f.chat.adopt({
    revision: f.chat.snapshot().revision,
    instanceId: f.ready.agent!.instanceId,
  });
  expect(f.request).toHaveBeenCalledWith("assistant.adopt", {
    deviceId: f.deviceId,
    instanceId: f.ready.agent!.instanceId,
  });
});
it("discards old conversation output when the scoped actor changes during the read", async () => {
  const f = fixture();
  f.info(f.ready);
  let release!: (page: ConversationPage) => void;
  f.page(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  f.chat.connection(true);
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  const next = { ...f.ready, agent: { ...f.ready.agent!, instanceId: randomUUID() } };
  f.info(next);
  release({
    kind: "codex",
    sessionId: randomUUID(),
    messages: [{ id: "old", role: "assistant", text: "old actor" }],
    nextOffset: null,
    endOffset: 32,
    partial: false,
  });
  await vi.waitFor(() =>
    expect(f.chat.snapshot().session?.agent?.instanceId).toBe(next.agent.instanceId),
  );
  expect(f.chat.snapshot().messages).toEqual([]);
});
it("keeps literal bounded conversation bubbles and resumes at the last complete record", async () => {
  const f = fixture();
  f.info(f.ready);
  const sessionId = randomUUID();
  f.page(async () => ({
    kind: "codex",
    sessionId,
    messages: [{ id: "a", role: "assistant", text: "<script>generated</script>" }],
    nextOffset: null,
    endOffset: 42,
    partial: false,
  }));
  await connected(f);
  await vi.waitFor(() => expect(f.chat.snapshot().messages).toHaveLength(1));
  await f.chat.refresh();
  expect(f.request).toHaveBeenCalledWith("agent.conversation", {
    paneId: f.ready.paneId,
    offset: 42,
  });
  expect(f.chat.snapshot().messages).toHaveLength(1);
  expect(f.chat.snapshot().messages[0]!.text).toBe("<script>generated</script>");
});

it("restarts at offset zero when a live actor clears its conversation", async () => {
  const f = fixture();
  f.info(f.ready);
  let sessionId = randomUUID();
  f.page(async () => ({
    kind: "codex",
    sessionId,
    messages: [{ id: sessionId, role: "assistant", text: "generated" }],
    nextOffset: null,
    endOffset: 42,
    partial: false,
  }));
  await connected(f);
  await vi.waitFor(() => expect(f.chat.snapshot().messages).toHaveLength(1));
  sessionId = randomUUID();
  await f.chat.refresh();
  expect(f.chat.snapshot().messages).toEqual([]);
  await f.chat.refresh();
  expect(f.request).toHaveBeenLastCalledWith("assistant.get", { deviceId: f.deviceId });
  const reads = f.request.mock.calls.filter((call) => call[0] === "agent.conversation");
  expect(reads.at(-1)?.[1]).toEqual({ paneId: f.ready.paneId, offset: 0 });
  expect(f.chat.snapshot().messages[0]?.id).toBe(sessionId);
});
