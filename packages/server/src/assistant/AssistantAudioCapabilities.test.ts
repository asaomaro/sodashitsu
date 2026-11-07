import { expect, it, vi } from "vitest";
import { ControlSurface, type MethodContext } from "../surface/ControlSurface.js";
import { registerAssistantMethods } from "../surface/methods/assistant.js";
import { LazyAssistantAudio } from "./LazyAssistantAudio.js";
const deviceId = "00000000-0000-4000-8000-000000000001";
const ctx = { clientId: "generated", sink: {} as never } as MethodContext;
it.each(["claude", "codex", "muse", "agy", "copilot"])(
  "discovers %s audio routes without loading audio or granting a model turn",
  async (kind) => {
    const load = vi.fn(async () => {
      throw Error("Audio must stay unloaded");
    });
    const audio = new LazyAssistantAudio("/unused", load),
      get = vi.fn(() => ({ kind })),
      audioTarget = vi.fn(() => {
        throw Error("No submission proof requested");
      });
    const surface = new ControlSurface();
    registerAssistantMethods(surface, {
      assistantSessions: { get, audioTarget },
      assistantAudio: audio,
    } as never);
    expect(await surface.invoke(ctx, "assistant.audio_capabilities", { deviceId })).toMatchObject({
      ok: true,
      result: {
        kind,
        nativeAudio: kind === "codex",
        localTranscription: true,
        nativeAudioReason: expect.any(String),
      },
    });
    expect(get).toHaveBeenCalledWith(deviceId);
    expect(audioTarget).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    await audio.close();
    expect(load).not.toHaveBeenCalled();
  },
);
it("discovers the independent local route without a dedicated session or audio service", async () => {
  const surface = new ControlSurface();
  registerAssistantMethods(surface, {} as never);
  expect(await surface.invoke(ctx, "assistant.audio_capabilities", { deviceId })).toMatchObject({
    ok: true,
    result: { kind: null, nativeAudio: false, localTranscription: true },
  });
});
it("rejects arbitrary target/process input and disconnected callers before reading a session", async () => {
  const get = vi.fn(() => ({ kind: "codex" })),
    surface = new ControlSurface();
  registerAssistantMethods(surface, { assistantSessions: { get } } as never);
  expect(
    await surface.invoke(ctx, "assistant.audio_capabilities", { deviceId, command: "codex" }),
  ).toMatchObject({ ok: false, error: { code: "invalid_params" } });
  expect(
    await surface.invoke(
      { ...ctx, connectionAuthorized: () => false },
      "assistant.audio_capabilities",
      { deviceId },
    ),
  ).toMatchObject({ ok: false });
  expect(get).not.toHaveBeenCalled();
});
it("does not return stale discovery after the connection closes during the read", async () => {
  let connected = true;
  const get = vi.fn(() => {
      connected = false;
      return { kind: "codex" };
    }),
    surface = new ControlSurface();
  registerAssistantMethods(surface, { assistantSessions: { get } } as never);
  expect(
    await surface.invoke(
      { ...ctx, connectionAuthorized: () => connected },
      "assistant.audio_capabilities",
      { deviceId },
    ),
  ).toMatchObject({ ok: false, error: { code: "not_found" } });
  expect(get).toHaveBeenCalledOnce();
});
