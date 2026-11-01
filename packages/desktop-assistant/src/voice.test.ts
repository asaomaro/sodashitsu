import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import { AssistantVoice, VoiceConversation, nativeSpeak } from "./voice.js";
it("serializes OS speech, keeps only the latest pending utterance, and stops without replay", async () => {
  const jobs: Array<{ text: string; signal: AbortSignal; done: () => void }> = [];
  const speak = vi.fn(
    (text: string, signal: AbortSignal) =>
      new Promise<void>((done) => {
        jobs.push({ text, signal, done });
      }),
  );
  const voice = new AssistantVoice(speak);
  voice.say("disabled", "オフの間");
  expect(jobs).toHaveLength(0);
  voice.configure(true);
  voice.say("disabled", "オフの間");
  expect(jobs).toHaveLength(0);
  voice.say("one", "最初");
  voice.say("two", "次");
  voice.say("three", "最新");
  expect(jobs).toHaveLength(1);
  jobs[0]!.done();
  await vi.waitFor(() => expect(jobs).toHaveLength(2));
  expect(jobs[1]!.text).toBe("最新");
  voice.configure(false);
  expect(jobs[1]!.signal.aborted).toBe(true);
  jobs[1]!.done();
  await vi.waitFor(() => expect(voice.snapshot().speaking).toBe(false));
  voice.configure(true);
  voice.say("three", "最新");
  expect(jobs).toHaveLength(2);
});
it("bounds and cleans speech text and reports failure without an unhandled rejection", async () => {
  const speak = vi.fn(async (_text: string, _signal: AbortSignal) => {
    throw Error("no device");
  });
  const voice = new AssistantVoice(speak);
  voice.configure(true);
  voice.say("id", "実装担当 (12345678) ```dangerous code``` **説明** " + "長い文章".repeat(1000));
  expect(speak.mock.calls[0]![0]).not.toContain("dangerous code");
  expect(speak.mock.calls[0]![0].length).toBeLessThanOrEqual(600);
  await vi.waitFor(() => expect(voice.snapshot().message).toContain("読み上げできません"));
  expect(voice.snapshot().speaking).toBe(false);
});
it("warms up each conversation and reads only newly completed responses", () => {
  const observe = new VoiceConversation();
  const state = {
    connected: true,
    conversationSessionId: "session",
    conversationCaughtUp: true,
    session: { state: "ready", agent: { instanceId: "actor", state: "idle" } },
    messages: [{ id: "old", role: "assistant", text: "過去" }],
  };
  expect(observe.observe(state)).toBeNull();
  const next = {
    ...state,
    messages: [...state.messages, { id: "new", role: "assistant", text: "新しい返答" }],
  };
  expect(
    observe.observe({
      ...next,
      session: { ...state.session, agent: { ...state.session.agent, state: "working" } },
    }),
  ).toBeNull();
  expect(observe.observe(next)).toMatchObject({ text: "新しい返答" });
  expect(observe.observe(next)).toBeNull();
  expect(observe.observe({ ...next, conversationSessionId: "cleared" })).toBeNull();
});
it("passes utterances only via stdin to a fixed bounded native command", async () => {
  const end = vi.fn(),
    run = vi.fn((_cmd: unknown, _args: unknown, _opts: unknown, done: (error: null) => void) => {
      queueMicrotask(() => done(null));
      return { stdin: { on: vi.fn(), end } };
    });
  const text = "日本語 $(not-a-command) `literal`";
  await nativeSpeak("win32", run as never)(text, new AbortController().signal);
  expect(run.mock.calls[0]![0]).toMatch(/WindowsPowerShell/);
  expect(JSON.stringify(run.mock.calls[0]![1])).not.toContain(text);
  expect(run.mock.calls[0]![2]).toMatchObject({ timeout: 60000, windowsHide: true });
  expect(JSON.parse(end.mock.calls[0]![0])).toEqual({ text });
  await expect(nativeSpeak("linux")(text, new AbortController().signal)).rejects.toThrow(
    "対応していません",
  );
});

it("baselines every historical page until reaching the conversation tail", () => {
  const reader = new VoiceConversation();
  const base = {
    connected: true,
    conversationSessionId: "large-history",
    session: { state: "ready", agent: { instanceId: "actor", state: "idle" } },
    conversationCaughtUp: false,
  };
  expect(
    reader.observe({ ...base, messages: [{ id: "page1", role: "assistant", text: "過去の先頭" }] }),
  ).toBeNull();
  expect(
    reader.observe({ ...base, messages: [{ id: "page2", role: "assistant", text: "過去の続き" }] }),
  ).toBeNull();
  const tail = {
    ...base,
    conversationCaughtUp: true,
    messages: [{ id: "page3", role: "assistant", text: "過去の末尾" }],
  };
  expect(reader.observe(tail)).toBeNull();
  expect(
    reader.observe({
      ...tail,
      messages: [...tail.messages, { id: "new", role: "assistant", text: "新しい返答" }],
    }),
  ).toMatchObject({ text: "新しい返答" });
});
it("drops queued speech for vanished sources and aborts invalid active speech", async () => {
  const jobs: Array<{ signal: AbortSignal; done: () => void }> = [];
  const voice = new AssistantVoice(
    (_text, signal) =>
      new Promise<void>((done) => {
        jobs.push({ signal, done });
      }),
  );
  voice.configure(true);
  let valid = true;
  voice.say("active", "最初", () => valid);
  voice.say("pending", "次", () => valid);
  valid = false;
  voice.validate();
  expect(jobs[0]!.signal.aborted).toBe(true);
  jobs[0]!.done();
  await vi.waitFor(() => expect(voice.snapshot().speaking).toBe(false));
  expect(jobs).toHaveLength(1);
});

it("waits for the native child to close after an abort before releasing the speech slot", async () => {
  let callback!: (error: Error | null) => void;
  const child = Object.assign(new EventEmitter(), {
    exitCode: null,
    signalCode: null,
    stdin: { on: vi.fn(), end: vi.fn() },
  });
  const run = vi.fn(
    (_command: unknown, _args: unknown, _options: unknown, done: (error: Error | null) => void) => {
      callback = done;
      return child;
    },
  );
  const controller = new AbortController();
  let settled = false;
  const result = nativeSpeak("win32", run as never)("止める", controller.signal).catch(() => {
    settled = true;
  });
  controller.abort();
  callback(Error("aborted"));
  await Promise.resolve();
  expect(settled).toBe(false);
  child.emit("close");
  await result;
  expect(settled).toBe(true);
});
it("previews a draft voice for one utterance without changing the saved speaker",async()=>{
 const saved=vi.fn(async()=>{}),draft=vi.fn(async()=>{}),voice=new AssistantVoice(saved);
 voice.configure(true);voice.say("preview","試聴",()=>true,draft);
 await vi.waitFor(()=>expect(voice.snapshot().speaking).toBe(false));
 expect(draft).toHaveBeenCalledOnce();expect(saved).not.toHaveBeenCalled();
 voice.say("notification","通常通知");await vi.waitFor(()=>expect(saved).toHaveBeenCalledOnce());
});
