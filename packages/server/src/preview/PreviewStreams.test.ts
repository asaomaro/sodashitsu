import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { afterEach, describe, expect, it } from "vitest";
import type { PreviewApp } from "@sodashitsu/protocol";
import { PreviewStreams } from "./PreviewStreams.js";

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn(); });
async function setup() {
  let seenCookie = "";
  const server = createServer((req, res) => {
    seenCookie = req.headers.cookie ?? "";
    if (req.url === "/sse") { res.writeHead(200, { "Content-Type": "text/event-stream" }); res.write("data: first\n\n"); req.once("close", () => res.end()); }
    else if (req.url === "/large") res.end(Buffer.alloc(256 * 1024, 42));
    else if (req.url === "/redirect") res.writeHead(302, { Location: `http://127.0.0.1:${app.port}/done` }).end();
    else { const chunks: Buffer[] = []; req.on("data", (b: Buffer) => chunks.push(b)); req.on("end", () => { res.writeHead(201, { "Content-Type": "application/octet-stream" }); res.end(Buffer.concat(chunks)); }); }
  });
  const wss = new WebSocketServer({ server, handleProtocols: () => "selected" });
  wss.on("connection", (ws, req) => { if (req.url === "/empty") { for (let i = 0; i < 1000; i++) ws.send(""); } else ws.on("message", (b, binary) => ws.send(b, { binary })); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(async () => { for (const s of wss.clients) s.terminate(); wss.close(); server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); });
  const app: PreviewApp = { id: randomUUID(), generation: randomUUID(), paneId: randomUUID(), workspaceId: randomUUID(), name: "web", port: (server.address() as { port: number }).port, state: "registered" };
  let allowed = true, blocked = false;
  const streams = new PreviewStreams((owner) => { if (owner !== "helper" || !allowed) throw new Error("revoked"); return { app, origin: "http://p00000000000000000000000000000000.localhost:1234" }; }, async () => { if (blocked) throw new Error("management port"); });
  cleanup.push(() => streams.dispose());
  return { streams, app, cookie: () => seenCookie, setBlocked: () => { blocked = true; }, revoke: () => { allowed = false; } };
}
describe("PreviewStreams", () => {
  it("streams binary HTTP upload/response, preserves status and isolates stream ownership", async () => {
    const x = await setup();
    const { streamId } = await x.streams.begin("helper", { requestId: randomUUID(), method: "POST", path: "/upload", headers: { cookie: "session=app" } });
    expect(() => x.streams.wsRead("other", streamId)).toThrow();
    const data = Buffer.from([0, 1, 2, 128, 255]);
    await x.streams.write("helper", { streamId, data: data.toString("base64"), end: true });
    let head = await x.streams.read("helper", streamId);
    while (head.kind === "wait") { await new Promise((resolve) => setImmediate(resolve)); head = await x.streams.read("helper", streamId); }
    expect(head).toMatchObject({ kind: "head", status: 201 });
    const received: Buffer[] = [];
    for (;;) { const r = await x.streams.read("helper", streamId); if (r.kind === "end") break; if (r.kind === "data") received.push(Buffer.from(r.data, "base64")); }
    expect(Buffer.concat(received)).toEqual(data); expect(x.cookie()).toBe("session=app"); expect(x.streams.stats().streams).toBe(0);
  });
  it("delivers an SSE event before response completion and cancels on revocation", async () => {
    const x = await setup(); const { streamId } = await x.streams.begin("helper", { requestId: randomUUID(), method: "GET", path: "/sse", headers: {} });
    await x.streams.write("helper", { streamId, data: "", end: true });
    let r = await x.streams.read("helper", streamId);
    while (r.kind === "wait") { await new Promise((resolve) => setImmediate(resolve)); r = await x.streams.read("helper", streamId); }
    expect(r.kind).toBe("head");
    const event = await x.streams.read("helper", streamId);
    expect(event.kind === "data" && Buffer.from(event.data, "base64").toString()).toBe("data: first\n\n");
    x.revoke(); await expect(x.streams.read("helper", streamId)).rejects.toThrow("revoked"); expect(x.streams.stats().streams).toBe(0);
  });
  it("rechecks management ports at every HTTP and WS connection", async () => {
    const x = await setup(); x.setBlocked();
    await expect(x.streams.begin("helper", { requestId: randomUUID(), method: "GET", path: "/api/session", headers: {} })).rejects.toThrow("management port");
    await expect(x.streams.wsBegin("helper", { requestId: randomUUID(), path: "/ws", headers: {}, protocols: [] })).rejects.toThrow("management port");
    expect(x.streams.stats().streams).toBe(0);
  });
  it("negotiates the upstream-selected WS protocol and carries binary messages", async () => {
    const x = await setup(); const ws = await x.streams.wsBegin("helper", { requestId: randomUUID(), path: "/hmr", headers: {}, protocols: ["first", "selected"] });
    expect(ws.protocol).toBe("selected");
    await x.streams.wsWrite("helper", { streamId: ws.streamId, data: Buffer.from([0, 255, 1]).toString("base64"), binary: true });
    let r = x.streams.wsRead("helper", ws.streamId);
    while (r.kind === "wait") { await new Promise((resolve) => setImmediate(resolve)); r = x.streams.wsRead("helper", ws.streamId); }
    expect(r).toEqual({ kind: "data", data: Buffer.from([0, 255, 1]).toString("base64"), binary: true });
    x.streams.clientGone("helper"); expect(x.streams.stats().streams).toBe(0);
  });
  it("bounds the message count even when every incoming WS message is empty", async () => {
    const x = await setup();
    await x.streams.wsBegin("helper", { requestId: randomUUID(), path: "/empty", headers: {}, protocols: ["selected"] }).catch((error: Error) => { expect(error.message).toContain("connection failed"); });
    await expect.poll(() => x.streams.stats().streams === 0 || x.streams.stats().queuedMessages >= 128).toBe(true);
    expect(x.streams.stats().queuedMessages).toBeLessThanOrEqual(256);
  });
});

it("negotiated downloads batch buffered data above 32KiB while legacy readers stay bounded", async () => {
  const x = await setup();
  for (const maxBytes of [undefined, 256 * 1024]) {
    const { streamId } = await x.streams.begin("helper", { requestId: randomUUID(), method: "GET", path: "/large", headers: {} });
    await x.streams.write("helper", { streamId, data: "", end: true });
    await new Promise<void>(resolve => setTimeout(resolve, 30));
    const chunks: Buffer[] = [];
    for (;;) {
      const r = await x.streams.read("helper", streamId, maxBytes);
      if (r.kind === "end") break;
      if (r.kind === "data") chunks.push(Buffer.from(r.data, "base64"));
      if (r.kind === "wait") await new Promise<void>(resolve => setImmediate(resolve));
    }
    expect(Buffer.concat(chunks)).toEqual(Buffer.alloc(256 * 1024, 42));
    if (maxBytes) {
      expect(Math.max(...chunks.map(c => c.length))).toBeGreaterThan(32 * 1024);
      expect(chunks.every(c => c.length <= maxBytes)).toBe(true);
    } else expect(chunks.every(c => c.length <= 32 * 1024)).toBe(true);
  }
}, 15_000);
