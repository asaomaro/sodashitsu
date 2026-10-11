import { afterEach, expect, it, vi } from "vitest";
import { request as httpRequest } from "node:http";
import { rm } from "node:fs/promises";
import { makeTempDir } from "../persist/atomicFile.js";
import { FsAuthFile } from "../persist/AuthFile.js";
import { DefaultAuthService } from "../auth/AuthService.js";
import { OtpAuth, totpCode } from "../auth/OtpAuth.js";
import { DefaultLoginRateLimiter } from "../auth/LoginRateLimiter.js";
import { DefaultOriginPolicy } from "../auth/OriginPolicy.js";
import { OriginRejectionLog } from "../auth/OriginRejectionLog.js";
import { MemoryLogger } from "../log/Logger.js";
import { listenOnFreePort } from "../composeServerOnFreePort.js";
import { HttpServer } from "./HttpServer.js";
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function setup() {
  const dir = await makeTempDir("soda-http-otp-");
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  const auth = new DefaultAuthService(new FsAuthFile(dir));
  const { token } = await auth.ensureToken();
  const session = await auth.login(token!);
  if (!session.ok) throw new Error("fixture login failed");
  const cookie = auth.buildSetCookieHeader(session.sessionId, false).split(";")[0]!;
  let now = 1_700_000_000_000;
  const otp = new OtpAuth(
    dir,
    () => auth.credentialVersion(),
    () => now,
  );
  const opts = { host: "127.0.0.1", port: 0, secure: false, extraOrigins: [] };
  const policy = new DefaultOriginPolicy(opts, {
      addresses: () => [],
      lanAddresses: () => [],
      hostnames: () => [],
    }),
    logger = new MemoryLogger();
  const server = new HttpServer(
    auth,
    new OriginRejectionLog(logger, policy),
    new DefaultLoginRateLimiter(),
    { webDistDir: dir, logger, otpAuth: otp },
  );
  opts.port = await listenOnFreePort(server.server);
  cleanups.push(() => new Promise<void>((resolve) => server.server.close(() => resolve())));
  const origin = `http://127.0.0.1:${opts.port}`;
  const settings = (body?: unknown, sessionCookie: string = cookie, headerOrigin = origin) =>
    fetch(origin + "/api/login-settings", {
      method: body ? "POST" : "GET",
      headers: { cookie: sessionCookie, origin: headerOrigin, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const login = (method: string, code: string) =>
    fetch(origin + "/api/login", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ method, token: code }),
    });
  return {
    auth,
    otp,
    settings,
    login,
    origin,
    cookie,
    advance: () => (now += 30_000),
    now: () => now,
  };
}
it("only authenticated same-origin settings can issue a code; login consumes it once and retains token login", async () => {
  const f = await setup();
  expect((await f.settings(undefined, "")).status).toBe(401);
  expect((await f.settings({ action: "issue" }, "invalid")).status).toBe(401);
  expect((await f.settings({ action: "issue" }, undefined, "https://other.invalid")).status).toBe(
    403,
  );
  const { code } = await (await f.settings({ action: "issue" })).json();
  const accepted = await f.login("otp", code);
  expect(accepted.status).toBe(204);
  expect(accepted.headers.get("set-cookie")).toContain("HttpOnly");
  expect((await f.login("otp", code)).status).toBe(401);
  const enrollment = await (await f.settings({ action: "begin", label: "phone" })).json();
  const current = () => totpCode(enrollment.secret, Math.floor(f.now() / 30_000));
  expect((await f.settings({ action: "confirm", code: current() })).status).toBe(200);
  expect(JSON.stringify(await (await f.settings()).json())).not.toContain(enrollment.secret);
  f.advance();
  expect((await f.login("totp", current())).status).toBe(204);
  expect((await f.login("totp", current())).status).toBe(401);
  const newToken = await f.auth.resetToken();
  f.advance();
  expect((await f.login("totp", current())).status).toBe(401);
  expect((await f.login("token", newToken)).status).toBe(204);
});
it("uses the existing rate limit for wrong alternative codes", async () => {
  const f = await setup();
  const { code } = await (await f.settings({ action: "issue" })).json();
  for (let i = 0; i < 5; i++) expect((await f.login("otp", "invalid")).status).toBe(401);
  expect((await f.login("otp", code)).status).toBe(429);
});

it("rejects a settings body received after its authenticated session was revoked", async () => {
  const f = await setup(),
    verified = vi.spyOn(f.auth, "verifySession");
  const body = JSON.stringify({ action: "issue" });
  let request: ReturnType<typeof httpRequest>;
  const response = new Promise<number>((resolve) => {
    request = httpRequest(
      f.origin + "/api/login-settings",
      {
        method: "POST",
        headers: {
          cookie: f.cookie,
          origin: f.origin,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode!);
      },
    );
    request.flushHeaders();
  });
  await vi.waitFor(() => expect(verified).toHaveBeenCalled());
  await f.auth.resetToken();
  request!.end(body);
  expect(await response).toBe(401);
});
