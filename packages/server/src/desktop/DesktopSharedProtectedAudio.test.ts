import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { DesktopSharedCapture, type DesktopHelper } from "./DesktopSharedCapture.js";
const f = vi.hoisted(() => ({
  create: vi.fn(),
  stop: vi.fn(),
  entered: false,
  release: undefined as (() => void) | undefined,
  gate: undefined as Promise<void> | undefined,
}));
vi.mock("./DesktopProtectedAudio.js", async () => {
  f.entered = true;
  await f.gate;
  return { createProtectedAudio: f.create };
});
class Helper extends EventEmitter implements DesktopHelper {
  commands: any[] = [];
  stdout = new PassThrough();
  stderr = new PassThrough();
  exitCode: number | null = null;
  signalCode = null;
  stdin = new Writable({
    write: (bytes, _, done) => {
      this.commands.push(JSON.parse(bytes.toString()));
      done();
    },
    final: (done) => {
      this.exitCode = 0;
      this.emit("close", 0, null);
      done();
    },
  });
  kill = () => {
    this.stdin.end();
    return true;
  };
  send(value: unknown) {
    this.stdout.write(JSON.stringify(value) + "\n");
  }
}
const pools: DesktopSharedCapture[] = [];
function setup(failure?: "missing-clock"|"wrong-clock"|"privileged-claim" | "local-video") {
  f.create.mockImplementation(() => ({ stop: f.stop }));
  const pool = new DesktopSharedCapture(),
    child = new Helper();
  pools.push(pool);
  const configuration = {
    type: "configure",
    allowSharedProtected: true,
    allowProtectedVideo: failure !== "local-video",
    allowNativeVideo: true,
    protectedAudioClock: "windows-qpc-v1",
    options: {
      width: 640,
      fps: 30,
      quality: 65,
      features: true,
      protectedVideo: true,
      protectedAudio: true,
      nativeAudio: true,
    },
  };
  const a = pool.attach("generated", () => child),
    b = pool.attach("generated", () => {
      throw Error("Second physical source");
    });
  for (const member of [a, b]) {
    member.stdout.resume();
    member.stderr.resume();
    member.stdin.write(JSON.stringify(configuration) + "\n");
  }
  child.send({
    type: "ready",
    title: "generated",
    allowInput: false,
    width: 640,
    height: 360,
    backend: "windows-gdi",
    secureDesktop: true,
    protectedDesktop: "elevated-uac",
    sharedProtected: true,
    protectedVideo: true,
    nativeVideo: true,
    ...(failure==="missing-clock"?{}:{protectedAudioClock:failure==="wrong-clock"?"process-relative":"windows-qpc-v1"}),
    ...(failure==="privileged-claim"?{protectedAudio:true,nativeAudio:true}:{}),
  });
  const ids = [randomUUID(), randomUUID()];
  if(!failure)for (const [index, member] of [a, b].entries())
    member.stdin.write(
      JSON.stringify({
        type: "native_video",
        enabled: true,
        id: ids[index],
        fps: 30,
        bitrateKbps: 2500,
      }) + "\n",
    );
  const hooks = (index: number) => ({
    id: ids[index]!,
    synthetic: false,
    write: vi.fn(),
    send: vi.fn(() => true),
    state: vi.fn(),
    active: () => true,
    videoTimestamp: () => 0,
  });
  return {
    pool,
    child,
    a,
    b,
    first: () => a.createAudio!(hooks(0)),
    second: () => b.createAudio!(hooks(1)),
  };
}
afterEach(() => {
  for (const pool of pools.splice(0)) pool.dispose();
  f.create.mockReset();
  f.stop.mockReset();
});
it("does not construct an ordinary-user source after all consumers leave during its lazy import", async () => {
  f.gate = new Promise<void>((resolve) => (f.release = resolve));
  const x = setup();
  await vi.waitFor(() => expect((x.pool as any).group.native).toBeDefined());
  const a = x.first(),
    b = x.second();
  await vi.waitFor(() => expect(f.entered).toBe(true));
  a.stop(false);
  b.stop(false);
  f.release!();
  await import("./DesktopProtectedAudio.js");
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(f.create).not.toHaveBeenCalled();
});
it("uses one ordinary-user source and preserves it through first-viewer departure and independent audio OFF", async () => {
  const x = setup();
  await vi.waitFor(() => expect((x.pool as any).group.native).toBeDefined());
  const a = x.first(),
    b = x.second();
  await vi.waitFor(() => expect(f.create).toHaveBeenCalledOnce());
  const master = x.child.commands.find((m) => m.type === "native_video" && m.enabled);
  expect(f.create.mock.calls[0]![0].id).toBe(master.id);
  a.stop(false);
  expect(f.stop).not.toHaveBeenCalled();
  const again=x.first();
  expect(f.create).toHaveBeenCalledOnce();
  x.a.kill();
  expect(f.stop).not.toHaveBeenCalled();
  again.stop(false);
  expect(f.stop).not.toHaveBeenCalled();
  b.stop(false);
  expect(f.stop).toHaveBeenCalledOnce();
});
it("retires the ordinary-user source once when the protected physical source ends", async () => {
  const x = setup();
  await vi.waitFor(() => expect((x.pool as any).group.native).toBeDefined());
  x.first();
  x.second();
  await vi.waitFor(() => expect(f.create).toHaveBeenCalledOnce());
  x.child.send({ type: "protected_desktop_failure", code: "source_changed" });
  await vi.waitFor(() => expect(f.stop).toHaveBeenCalledOnce());
  expect(x.a.exitCode).toBe(0);
  expect(x.b.exitCode).toBe(0);
});

it.each(['missing-clock','wrong-clock','privileged-claim','local-video'] as const)('rejects %s from the protected physical source before any ordinary audio factory',async failure=>{const x=setup(failure);await vi.waitFor(()=>expect(x.a.exitCode).toBe(0));expect(x.b.exitCode).toBe(0);expect(f.create).not.toHaveBeenCalled();});
