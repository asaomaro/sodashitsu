import { createServer } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { DelegationPairing } from "./DelegationPairing.js";
const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f();
});
it("expires pending requests without minting credentials and removes operator notifications", async () => {
  let now = 10_000;
  const changed = vi.fn(),
    invite = vi.fn();
  const operator = new DelegationPairing({ invite, changed, now: () => now });
  const provider = new DelegationPairing({ invite: vi.fn(), changed: vi.fn(), now: () => now });
  const http = createServer();
  http.on("upgrade", (req, socket, head) => operator.upgrade(req, socket, head));
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  cleanup.push(() => new Promise<void>((resolve) => http.close(() => resolve())));
  cleanup.push(() => {
    provider.close();
    operator.close();
  });
  const addr = http.address();
  if (!addr || typeof addr === "string") throw Error("listen");
  const pending = await provider.request(`http://127.0.0.1:${addr.port}`, "Expiring PC");
  const request = operator.list().requests[0]!;
  expect(changed).toHaveBeenCalledWith(expect.objectContaining({ code: request.code }), false);
  now += 5 * 60_000;
  expect(operator.list().requests).toEqual([]);
  await vi.waitFor(() =>
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ id: request.id }), true),
  );
  expect(() => provider.confirm(pending.id, request.code)).toThrow();
  expect(invite).not.toHaveBeenCalled();
});

it("ignores buffered frames after the fifth wrong guess terminates a request", async () => {
  const invite = vi.fn().mockResolvedValue({ machineId: "a".repeat(32), token: "b".repeat(43) });
  const operator = new DelegationPairing({ invite, changed: vi.fn() });
  const http = createServer();
  http.on("upgrade", (req, socket, head) => operator.upgrade(req, socket, head));
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  cleanup.push(() => new Promise<void>((resolve) => http.close(() => resolve())));
  cleanup.push(() => operator.close());
  const addr = http.address();
  if (!addr || typeof addr === "string") throw Error("listen");
  const { default: WebSocket } = await import("ws");
  const ws = new WebSocket(`ws://127.0.0.1:${addr.port}/machine-pairing`);
  ws.on("error", () => undefined);
  cleanup.push(() => ws.terminate());
  await new Promise<void>((resolve) => ws.once("open", resolve));
  const pending = new Promise<void>((resolve) => ws.once("message", () => resolve()));
  ws.send(JSON.stringify({ type: "request", label: "Buffered guesses" }));
  await pending;
  const code = operator.list().requests[0]!.code;
  const wrong = code === "00000000" ? "11111111" : "00000000";
  const closed = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  // One TCP write makes all frames available before terminate() stops future network reads.
  const socket = (ws as unknown as { _socket: import("node:net").Socket })._socket;
  socket.cork();
  for (let i = 0; i < 5; i++) ws.send(JSON.stringify({ type: "confirm", code: wrong }));
  ws.send(JSON.stringify({ type: "confirm", code }));
  socket.uncork();
  await closed;
  expect(invite).not.toHaveBeenCalled();
});

it("reports a rejected HTTP upgrade promptly without response text or credentials", async () => {
  const http = createServer(), provider = new DelegationPairing({ invite: vi.fn(), changed: vi.fn() });
  http.on("upgrade", (_req, socket) => {
    socket.end("HTTP/1.1 503 private-status-secret\r\nContent-Length: 19\r\nConnection: close\r\n\r\nprivate-body-secret");
  });
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
  cleanup.push(() => new Promise<void>(resolve => http.close(() => resolve())));
  cleanup.push(() => provider.close());
  const addr = http.address();
  if (!addr || typeof addr === "string") throw Error("listen");
  const result = await provider.request(`http://127.0.0.1:${addr.port}`, "Rejected PC").catch(e => e);
  expect(result).toBeInstanceOf(Error);
  expect(result.message).toContain("HTTP 503");
  expect(result.message).not.toContain("private");
  expect(provider.list().requests).toEqual([]);
});

it("reports a refused transport by code", async () => {
  const http = createServer();
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
  const addr = http.address();
  if (!addr || typeof addr === "string") throw Error("listen");
  await new Promise<void>(resolve => http.close(() => resolve()));
  const provider = new DelegationPairing({ invite: vi.fn(), changed: vi.fn() });
  cleanup.push(() => provider.close());
  await expect(provider.request(`http://127.0.0.1:${addr.port}`, "Offline PC")).rejects.toThrow("ECONNREFUSED");
});
