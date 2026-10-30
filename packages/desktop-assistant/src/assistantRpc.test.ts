import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { AssistantRpc, type AssistantRpcOptions } from "./assistantRpc.js";

class Socket {
  handlers = new Map<string, (...args: any[]) => void>();
  sent: any[] = [];
  ping = vi.fn();
  terminate = vi.fn();
  on(name: string, callback: (...args: any[]) => void) {
    this.handlers.set(name, callback);
  }
  send(value: string) {
    this.sent.push(JSON.parse(value));
  }
  message(value: unknown) {
    this.handlers.get("message")?.(Buffer.from(JSON.stringify(value)), false);
  }
}
const connections: AssistantRpc[] = [];
afterEach(() => {
  for (const rpc of connections.splice(0)) rpc.stop();
  vi.useRealTimers();
});
async function fixture(over: Partial<AssistantRpcOptions> = {}) {
  vi.useFakeTimers();
  let now = 0;
  const sockets: Socket[] = [];
  const changed = vi.fn(),
    status = vi.fn();
  const rpc = new AssistantRpc("http://127.0.0.1:7780", {
    cookie: async () => "soda_session=generated",
    status,
    changed,
    now: () => now,
    socket: () => {
      const socket = new Socket();
      sockets.push(socket);
      return socket;
    },
    ...over,
  });
  connections.push(rpc);
  rpc.start();
  for (let i = 0; i < 10; i++) await Promise.resolve();
  const socket = sockets[0];
  const ready = () => {
    socket!.handlers.get("open")?.();
    socket!.message({ id: "assistant-rpc-hello", result: { snapshot: {} } });
  };
  return {
    rpc,
    sockets,
    socket,
    ready,
    changed,
    status,
    now: (value: number) => {
      now = value;
    },
  };
}
it("correlates scoped requests and does not replay a command after reconnect", async () => {
  const f = await fixture();
  f.ready();
  const deviceId = randomUUID();
  const get = f.rpc.request("assistant.get", { deviceId });
  const request = f.socket!.sent.at(-1);
  expect(request).toMatchObject({ method: "assistant.get", params: { deviceId } });
  f.socket!.message({ id: request.id, result: null });
  await expect(get).resolves.toBeNull();
  const prompt = f.rpc.request("assistant.prompt", {
    deviceId,
    instanceId: randomUUID(),
    text: "hello",
  });
  const rejected = expect(prompt).rejects.toThrow("接続が切れ");
  f.socket!.handlers.get("close")?.();
  await rejected;
  await vi.advanceTimersByTimeAsync(1000);
  expect(f.sockets).toHaveLength(2);
  expect(f.sockets[1]!.sent).toEqual([]);
});
it("rejects unknown inputs before sending and bounds outstanding operations", async () => {
  const f = await fixture();
  f.ready();
  expect(() =>
    f.rpc.request("assistant.ensure", {
      deviceId: randomUUID(),
      kind: "codex",
      args: ["generated"],
    } as never),
  ).toThrow();
  const pending = Array.from({ length: 16 }, () =>
    f.rpc.request("assistant.get", { deviceId: randomUUID() }),
  );
  const outcome = Promise.allSettled(pending);
  await expect(f.rpc.request("assistant.get", { deviceId: randomUUID() })).rejects.toThrow(
    "前の操作",
  );
  f.rpc.stop();
  await outcome;
});
it("rejects a late response by monotonic time even if its timeout callback is late", async () => {
  const f = await fixture();
  f.ready();
  const pending = f.rpc.request("assistant.get", { deviceId: randomUUID() });
  const rejection = expect(pending).rejects.toThrow("応答が遅れ");
  f.now(20_001);
  f.socket!.message({ id: f.socket!.sent.at(-1).id, result: null });
  await rejection;
});
it("expires a cookie handshake without opening a socket after it resolves late", async () => {
  let release!: (value: string) => void;
  const f = await fixture({
    cookie: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  f.now(10_001);
  release("soda_session=generated");
  for (let i = 0; i < 10; i++) await Promise.resolve();
  expect(f.sockets).toEqual([]);
  expect(f.status).not.toHaveBeenCalledWith(true);
});
it("rejects a late pong and ignores stale socket responses", async () => {
  const f = await fixture();
  f.ready();
  f.now(20_000);
  await vi.advanceTimersByTimeAsync(250);
  expect(f.socket!.ping).toHaveBeenCalledOnce();
  f.now(30_001);
  f.socket!.handlers.get("pong")?.();
  expect(f.socket!.terminate).toHaveBeenCalledOnce();
  f.socket!.message({ event: "pane.updated", data: {} });
  expect(f.changed).not.toHaveBeenCalled();
});


it("does not publish connected if reading the hello message exhausts the handshake budget", async () => {
  const f = await fixture();
  f.socket!.handlers.get("open")?.();
  const value = JSON.stringify({id:"assistant-rpc-hello",result:{snapshot:{}}});
  const bytes = Buffer.from(value);
  bytes.toString = () => { f.now(10_001); return value; };
  f.socket!.handlers.get("message")?.(bytes,false);
  expect(f.status).not.toHaveBeenCalledWith(true);
  expect(f.socket!.terminate).toHaveBeenCalledOnce();
});
