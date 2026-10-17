import { request } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { LoopbackGateway, type PreviewGatewayTransport, type PreviewHeaders } from "./LoopbackGateway.js";

const gateways: LoopbackGateway[] = [];
afterEach(async () => { await Promise.all(gateways.splice(0).map((g) => g.close())); });

async function setup() {
  const calls: { path: string; headers: PreviewHeaders; body: string }[] = [];
  const transport: PreviewGatewayTransport = {
    http: async (req, res) => {
      const chunks = []; for await (const chunk of req.body) chunks.push(Buffer.from(chunk));
      calls.push({ path: req.path, headers: req.headers, body: Buffer.concat(chunks).toString() });
      res.head(200, { "content-type": "text/plain", "set-cookie": ["session=app; Domain=localhost; Path=/", "__Host-soda-preview=bad; Path=/; Secure"], connection: "x-private", "x-private": "hidden" });
      await res.write(Buffer.from("application")); res.end();
    },
    websocket: async (_req, socket) => { socket.close(); },
  };
  const gateway = await LoopbackGateway.listen(transport, "https://soda.example.test");
  gateways.push(gateway);
  const bootstrap = gateway.bootstrap();
  const url = new URL(bootstrap.origin);
  const call = (path = "/", headers: Record<string, string> = {}, body?: string) => new Promise<{ status: number; headers: Record<string, unknown>; body: string }>((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port: url.port, path, method: body === undefined ? "GET" : "POST", headers: { host: url.host, ...headers } }, (res) => {
      const chunks: Buffer[] = []; res.on("data", (b: Buffer) => chunks.push(b));
      res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on("error", reject); req.end(body);
  });
  const authorize = () => call("/.soda-preview/authorize", { origin: url.origin, "content-type": "text/plain" }, new URL(bootstrap.url).hash.slice(1));
  const auth = async () => { const r = await authorize(); expect(r.status).toBe(204); return (r.headers["set-cookie"] as string[])[0]!.split(";")[0]!; };
  return { gateway, url, call, calls, auth, authorize, bootstrap };
}

describe("LoopbackGateway", () => {
  it("never forwards unauthenticated asset/API requests or an unexpected Host", async () => {
    const s = await setup();
    expect((await s.call("/api")).status).toBe(403);
    const cookie = await s.auth();
    expect((await s.call("/api", { cookie, host: `localhost:${s.url.port}` })).status).toBe(403);
    expect((await s.call("/api", { cookie, host: `evil.test:${s.url.port}` })).status).toBe(403);
    expect(s.calls).toEqual([]);
  });

  it("uses a one-time ticket, HTTP-only host cookie, nonce bootstrap and no token-bearing query", async () => {
    const s = await setup();
    const page = await s.call("/.soda-preview/bootstrap");
    expect(page.status).toBe(200);
    expect(page.headers["content-security-policy"]).toContain("frame-ancestors https://soda.example.test");
    expect(page.headers["content-security-policy"]).toContain("script-src 'nonce-");
    expect(page.body).not.toContain(new URL(s.bootstrap.url).hash.slice(1));
    expect(new URL(s.bootstrap.url).search).toBe("");
    const first = await s.authorize();
    expect(first.status).toBe(204);
    expect((first.headers["set-cookie"] as string[])[0]).toMatch(/Path=\/; HttpOnly; Secure; SameSite=None/);
    expect((await s.authorize()).status).toBe(403);
    const cookie = (first.headers["set-cookie"] as string[])[0]!.split(";")[0]!;
    expect((await s.call("/.soda-preview/bootstrap", { cookie })).status).toBe(303);
  });

  it("rejects duplicate auth cookies, foreign Origin, absolute targets and private routes", async () => {
    const s = await setup(); const cookie = await s.auth();
    expect((await s.call("/", { cookie: `${cookie}; ${cookie}` })).status).toBe(403);
    expect((await s.call("/api", { cookie, origin: "https://evil.test" }, "mutate")).status).toBe(403);
    expect((await s.call("http://169.254.169.254/latest/", { cookie })).status).toBe(403);
    expect((await s.call("//169.254.169.254/latest/", { cookie })).status).toBe(403);
    expect((await s.call("/.soda-preview/unknown", { cookie })).status).toBe(403);
    expect(s.calls).toEqual([]);
  });

  it("preserves app paths/bodies/credentials, strips gateway credentials and sanitizes response cookies", async () => {
    const s = await setup(); const cookie = await s.auth();
    const r = await s.call("/api?value=1", { cookie: `${cookie}; session=app`, origin: s.url.origin, authorization: "Bearer application-token", forwarded: "for=evil", "x-forwarded-host": "evil.test", connection: "x-secret", "x-secret": "hidden" }, "body");
    expect(r.status).toBe(200); expect(r.body).toBe("application");
    expect(s.calls).toEqual([{ path: "/api?value=1", body: "body", headers: expect.objectContaining({ cookie: "session=app", authorization: "Bearer application-token", origin: s.url.origin }) }]);
    for (const h of ["host", "forwarded", "x-forwarded-host", "x-secret"]) expect(s.calls[0]!.headers[h]).toBeUndefined();
    expect(r.headers["set-cookie"]).toEqual(["session=app; Path=/"]);
    expect(r.headers["x-private"]).toBeUndefined();
  });

  it("does not accept a ticket from a foreign Origin", async () => {
    const s = await setup();
    expect((await s.call("/.soda-preview/authorize", { origin: "https://evil.test", "content-type": "text/plain" }, new URL(s.bootstrap.url).hash.slice(1))).status).toBe(403);
    expect((await s.authorize()).status).toBe(204);
  });

  it("releases concurrency slots when a WebSocket handshake is rejected", async () => {
    const s = await setup(); const cookie = await s.auth();
    for (let i = 0; i < 32; i++) {
      expect((await s.call("/hmr", { cookie, origin: s.url.origin, connection: "Upgrade", upgrade: "websocket", "sec-websocket-version": "14", "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==" })).status).toBe(400);
    }
    expect((await s.call("/", { cookie })).status).toBe(200);
  });

  it("rejects non-ASCII auth values without throwing or breaking later HTTP/WS requests", async () => {
    const s = await setup();
    const cookie = "__Host-soda-preview=" + "é" + "a".repeat(42);
    expect((await s.call("/", { cookie })).status).toBe(403);
    expect((await s.call("/hmr", { cookie, origin: s.url.origin, connection: "Upgrade", upgrade: "websocket", "sec-websocket-version": "13", "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==" })).status).toBe(403);
    expect((await s.call("/", { cookie: await s.auth() })).status).toBe(200);
  });
});
