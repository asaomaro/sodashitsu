import { rm } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTempDir } from "../persist/atomicFile.js";
import { FsAuthFile } from "../persist/AuthFile.js";
import { DefaultAuthService } from "../auth/AuthService.js";
import { DefaultOriginPolicy } from "../auth/OriginPolicy.js";
import { OriginRejectionLog } from "../auth/OriginRejectionLog.js";
import { DefaultLoginRateLimiter } from "../auth/LoginRateLimiter.js";
import { MemoryLogger } from "../log/Logger.js";
import { HttpServer } from "./HttpServer.js";
import { listenOnFreePort } from "../composeServerOnFreePort.js";

/**
 * `POST /api/local-login` の「同じマシンから」の判定の配線（20260927-cli-mode の T4）。テストの接続は常に同じマシンからなので、判定（`isSameMachine`）を
 * 差し替えて「別のアドレスから」を作る。判定そのもの（IPv4-mapped の正規化等）は `auth/LocalLogin.test.ts`。
 */
const sameMachine = vi.hoisted(() => ({
  value: true,
  seen: [] as [string | undefined, string | undefined][],
}));
vi.mock("../auth/LocalLogin.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth/LocalLogin.js")>();
  return {
    ...actual,
    isSameMachine: (remote: string | undefined, local: string | undefined) => {
      sameMachine.seen.push([remote, local]);
      return sameMachine.value;
    },
  };
});

describe("HttpServer — /api/local-login の同じマシンの判定", () => {
  const cleanups: (() => Promise<unknown>)[] = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
    sameMachine.value = true;
    sameMachine.seen.length = 0;
  });

  async function startServer(secret: string) {
    const stateDir = await makeTempDir("soda-http-local-");
    cleanups.push(() => rm(stateDir, { recursive: true, force: true }));
    const auth = new DefaultAuthService(new FsAuthFile(stateDir));
    await auth.initialize();
    const originOpts = { host: "127.0.0.1", port: 0, secure: false, extraOrigins: [] };
    const origins = new DefaultOriginPolicy(originOpts, {
      addresses: () => [],
      lanAddresses: () => [],
      hostnames: () => [],
    });
    const logger = new MemoryLogger();
    const http = new HttpServer(
      auth,
      new OriginRejectionLog(logger, origins),
      new DefaultLoginRateLimiter(),
      {
        webDistDir: stateDir,
        logger,
        localLogin: { verify: (s) => s === secret },
      },
    );
    const port = await listenOnFreePort(http.server);
    originOpts.port = port;
    cleanups.push(() => new Promise<void>((r) => http.server.close(() => r())));
    const origin = `http://127.0.0.1:${port}`;
    const post = (body: unknown) =>
      fetch(`${origin}/api/local-login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
        body: JSON.stringify(body),
      });
    return { post };
  }

  it("要求のソケットの remoteAddress と localAddress で判定し、同じマシンなら秘密の一致で 204", async () => {
    const { post } = await startServer("s3cret");
    const res = await post({ secret: "s3cret" });
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toMatch(/^soda_session=/);
    expect(sameMachine.seen).toHaveLength(1);
    const [remote, local] = sameMachine.seen[0]!;
    expect(remote).toMatch(/127\.0\.0\.1$/);
    expect(local).toMatch(/127\.0\.0\.1$/);
  });

  it("別のマシンからなら、秘密が正しくても 403 で cookie を出さず、回数の制限に数える（5 回で 429）", async () => {
    const { post } = await startServer("s3cret");
    sameMachine.value = false;
    for (let i = 0; i < 5; i++) {
      const res = await post({ secret: "s3cret" });
      expect(res.status).toBe(403);
      expect(res.headers.get("set-cookie")).toBeNull();
    }
    sameMachine.value = true;
    expect((await post({ secret: "s3cret" })).status).toBe(429);
  });

  it("手元からのログインを持たないサーバでは 404", async () => {
    const stateDir = await makeTempDir("soda-http-local-");
    cleanups.push(() => rm(stateDir, { recursive: true, force: true }));
    const auth = new DefaultAuthService(new FsAuthFile(stateDir));
    const originOpts = { host: "127.0.0.1", port: 0, secure: false, extraOrigins: [] };
    const origins = new DefaultOriginPolicy(originOpts, {
      addresses: () => [],
      lanAddresses: () => [],
      hostnames: () => [],
    });
    const logger = new MemoryLogger();
    const http = new HttpServer(
      auth,
      new OriginRejectionLog(logger, origins),
      new DefaultLoginRateLimiter(),
      { webDistDir: stateDir, logger },
    );
    const port = await listenOnFreePort(http.server);
    originOpts.port = port;
    cleanups.push(() => new Promise<void>((r) => http.server.close(() => r())));
    const origin = `http://127.0.0.1:${port}`;
    const res = await fetch(`${origin}/api/local-login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
      body: JSON.stringify({ secret: "x" }),
    });
    expect(res.status).toBe(404);
  });
});
