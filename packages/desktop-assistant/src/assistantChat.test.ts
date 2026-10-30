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
    activate: true,
    launchSettings: {model: "", effort: ""},
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

it("uses main-owned profiles at explicit start without starting anything when settings change", async () => {
 const f=fixture(); await connected(f);
 f.request.mockClear();
 f.chat.configure({codex:{model:"custom-model",effort:"high"}});
 expect(f.request).not.toHaveBeenCalled();
 await f.chat.start({revision:f.chat.snapshot().revision,kind:"codex"});
 expect(f.request).toHaveBeenCalledWith("assistant.ensure",expect.objectContaining({launchSettings:{model:"custom-model",effort:"high"}}));
});
const generatedImage=()=>Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPuoAAAAASUVORK5CYII=","base64");
async function audioFixture() {
 const f=fixture();f.info(f.ready);await connected(f);const fallback=f.request.getMockImplementation()!,uploadId=randomUUID();
 f.request.mockImplementation(async(method,input)=>{
  if(method==="assistant.audio_begin")return{uploadId};
  if(method==="assistant.audio_commit")return{sent:true,turnId:"generated-audio-turn"};
  if(method==="assistant.audio_chunk"||method==="assistant.audio_cancel")return{};
  return fallback(method,input);
 });return{...f,uploadId};
}
it("pins reviewed audio to the main-owned Codex actor and transfers bytes without a renderer path",async()=>{
 const f=await audioFixture();await f.chat.audio(new Uint8Array([1,2,3]),"audio/webm;codecs=opus",new AbortController().signal);
 expect(f.request).toHaveBeenCalledWith("assistant.audio_begin",{deviceId:f.deviceId,instanceId:f.ready.agent!.instanceId,mime:"audio/webm",size:3,ttlMs:expect.any(Number)});
 expect(f.request).toHaveBeenCalledWith("assistant.audio_chunk",{uploadId:f.uploadId,offset:0,data:"AQID"});
 expect(f.request.mock.calls.filter(c=>c[0]==="assistant.audio_commit")).toHaveLength(1);
 expect(f.request.mock.calls.some(c=>c[0]==="assistant.prompt")).toBe(false);
});
it("cancels physical audio when a pending begin is aborted and never commits it",async()=>{
 const f=await audioFixture(),controller=new AbortController(),fallback=f.request.getMockImplementation()!;
 f.request.mockImplementation(async(method,input)=>{if(method==="assistant.audio_begin"){controller.abort();return{uploadId:f.uploadId};}return fallback(method,input);});
 await expect(f.chat.audio(new Uint8Array([1]),"audio/wav",controller.signal)).rejects.toThrow();
 expect(f.request).toHaveBeenCalledWith("assistant.audio_cancel",{uploadId:f.uploadId});
 expect(f.request.mock.calls.some(c=>c[0]==="assistant.audio_commit")).toBe(false);
});
it("refuses audio for a different or working agent without trying another provider",async()=>{
 const f=await audioFixture();f.info({...f.ready,kind:"claude",agent:{...f.ready.agent!,kind:"claude"}});await f.chat.refresh();
 f.request.mockClear();expect(()=>f.chat.audio(new Uint8Array([1]),"audio/wav",new AbortController().signal)).toThrow("Codex");
 expect(f.request).not.toHaveBeenCalled();
});
it("binds the destination before the audio picker/read and keeps the original remaining deadline",async()=>{
 const f=await audioFixture(),send=f.chat.prepareAudio();
 await expect(send({bytes:new Uint8Array([1]),mime:"audio/wav"},new AbortController().signal,performance.now()-1)).rejects.toThrow();
 expect(f.request.mock.calls.some(c=>c[0]==="assistant.audio_begin")).toBe(false);
 f.info({...f.ready,agent:{...f.ready.agent!,instanceId:randomUUID()}});await f.chat.refresh();
 expect(()=>send({bytes:new Uint8Array([1]),mime:"audio/wav"},new AbortController().signal,performance.now()+10000)).toThrow("送信先");
 expect(f.request.mock.calls.some(c=>c[0]==="assistant.audio_begin")).toBe(false);
});
async function imageFixture() {
 const f=fixture();f.info(f.ready);await connected(f);
 const fallback=f.request.getMockImplementation()!;
 f.request.mockImplementation(async(method,input)=>{
  if(method==="pane.image.begin")return{uploadId:"generated-upload"};
  if(method==="pane.image.commit")return{path:"/generated/state/images/approved.png"};
  if(method==="pane.image.chunk"||method==="pane.image.cancel")return{};
  return fallback(method,input);
 });
 return f;
}
it("sends approved pixels through the existing upload and pins the image prompt to the selected actor", async () => {
 const f=await imageFixture();
 await f.chat.image(generatedImage(),new AbortController().signal);
 expect(f.request).toHaveBeenCalledWith("pane.image.begin",{paneId:f.ready.paneId,mime:"image/png",size:generatedImage().length});
 expect(f.request).toHaveBeenCalledWith("pane.image.chunk",expect.objectContaining({offset:0,data:generatedImage().toString("base64")}));
 expect(f.request).toHaveBeenCalledWith("assistant.prompt",expect.objectContaining({deviceId:f.deviceId,instanceId:f.ready.agent!.instanceId,text:expect.stringContaining("/generated/state/images/approved.png")}));
 expect(f.request).not.toHaveBeenCalledWith("pane.image.cancel",expect.anything());
});
it("aborts an image upload without committing or sending a prompt and cancels the owned upload", async () => {
 const f=await imageFixture(),abort=new AbortController(),fallback=f.request.getMockImplementation()!;
 f.request.mockImplementation(async(method,input)=>{if(method==="pane.image.chunk")abort.abort();return fallback(method,input);});
 await expect(f.chat.image(generatedImage(),abort.signal)).rejects.toThrow();
 expect(f.request).toHaveBeenCalledWith("pane.image.cancel",{uploadId:"generated-upload"});
 expect(f.request).not.toHaveBeenCalledWith("assistant.prompt",expect.anything());
 expect(f.request).not.toHaveBeenCalledWith("pane.image.commit",expect.anything());
});
it("refuses a retargeted image after upload instead of addressing the replacement actor", async () => {
 const f=await imageFixture(),fallback=f.request.getMockImplementation()!;
 f.request.mockImplementation(async(method,input)=>{if(method==="pane.image.chunk"){f.info({...f.ready,agent:{...f.ready.agent!,instanceId:randomUUID()}});await f.chat.refresh();}return fallback(method,input);});
 await expect(f.chat.image(generatedImage(),new AbortController().signal)).rejects.toThrow("変更");
 expect(f.request).not.toHaveBeenCalledWith("assistant.prompt",expect.anything());
});
it("keeps one original upload deadline and refuses malformed returned paths", async () => {
 const f=await imageFixture(),fallback=f.request.getMockImplementation()!;
 const now=vi.spyOn(performance,"now").mockReturnValue(0);
 try {f.request.mockImplementation(async(method,input)=>{if(method==="pane.image.begin")now.mockReturnValue(60001);return fallback(method,input);});
  await expect(f.chat.image(generatedImage(),new AbortController().signal)).rejects.toThrow("期限");
 } finally {now.mockRestore();}
 f.request.mockImplementation(async(method,input)=>method==="pane.image.commit"?{path:"/bad\npath"}:fallback(method,input));
 await expect(f.chat.image(generatedImage(),new AbortController().signal)).rejects.toThrow();
 expect(f.request).not.toHaveBeenCalledWith("assistant.prompt",expect.anything());
});
it("revokes a held image prompt on abort and keeps the physical operation until settled", async () => {
 const f=await imageFixture(),abort=new AbortController(),fallback=f.request.getMockImplementation()!;let release!:(value:unknown)=>void;
 f.request.mockImplementation(async(method,input)=>method==="assistant.prompt"?new Promise(resolve=>{release=resolve;}):fallback(method,input));
 const pending=f.chat.image(generatedImage(),abort.signal);
 await vi.waitFor(()=>expect(release).toBeTypeOf("function"));abort.abort();
 await vi.waitFor(()=>expect(f.request).toHaveBeenCalledWith("assistant.cancel_image",expect.objectContaining({requestId:expect.any(String)})));
 expect(f.chat.snapshot().busy).toBe(true);release({});await pending;
 expect(f.chat.snapshot().busy).toBe(false);
});
it("requires an idle actor before approving image upload", async () => {
 const f=await imageFixture();f.info({...f.ready,agent:{...f.ready.agent!,state:"working"}});await f.chat.refresh();f.request.mockClear();
 expect(()=>f.chat.image(generatedImage(),new AbortController().signal)).toThrow();
 expect(f.request).not.toHaveBeenCalledWith("pane.image.begin",expect.anything());
});
