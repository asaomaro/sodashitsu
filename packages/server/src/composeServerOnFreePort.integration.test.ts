import { rm } from "node:fs/promises";
import { createServer, type AddressInfo, type Server } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTempDir } from "./persist/atomicFile.js";
import { composeServerOnFreePort, getFreePort } from "./composeServerOnFreePort.js";

// 実サーバを組み立てて待ち受ける（実 PTY を起動する）。負荷の下で最大 3.4 秒かかった（20260926-load-flaky-tests の D5 の規則・D8）。
vi.setConfig({ testTimeout: 10_000 });

describe("composeServerOnFreePort（20260926-load-flaky-tests の D3）", () => {
  const cleanups: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0)) await fn();
  });

  async function occupiedPort(): Promise<number> {
    const blocker: Server = createServer();
    await new Promise<void>((res) => blocker.listen(0, "127.0.0.1", res));
    cleanups.push(() => new Promise<void>((res) => blocker.close(() => res())));
    return (blocker.address() as AddressInfo).port;
  }

  async function tempStateDir(): Promise<string> {
    const stateDir = await makeTempDir("soda-freeport-");
    cleanups.push(() =>
      rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
    );
    return stateDir;
  }

  it("選んだポートを別の誰かが使っていたら（EADDRINUSE）、組み立て直して別のポートで待ち受ける", async () => {
    const taken = await occupiedPort();
    let first = true;
    const pickPort = vi.fn(async (host: string) => {
      if (!first) return getFreePort(host);
      first = false;
      return taken;
    });
    const server = await composeServerOnFreePort(
      { host: "127.0.0.1", stateDir: await tempStateDir(), origin: [] },
      { pickPort },
    );
    cleanups.unshift(() => server.close());
    expect(pickPort.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(server.options.port).not.toBe(taken);
    expect(server.httpServer.server.listening).toBe(true);
    expect((server.httpServer.server.address() as AddressInfo).port).toBe(server.options.port);
  });

  it("EADDRINUSE 以外の失敗は取り直さずに投げる", async () => {
    const pickPort = vi.fn(getFreePort);
    const boom = new Error("boom");
    await expect(
      composeServerOnFreePort(
        { host: "127.0.0.1", stateDir: await tempStateDir(), origin: [] },
        { pickPort, start: async () => Promise.reject(boom) },
      ),
    ).rejects.toBe(boom);
    expect(pickPort).toHaveBeenCalledTimes(1);
  });

  it("待ち受けた後に失敗したら、閉じてから投げる（ポートを握ったままにしない）", async () => {
    const boom = new Error("boom");
    let started: { listening: () => boolean; port: number } | undefined;
    await expect(
      composeServerOnFreePort(
        { host: "127.0.0.1", stateDir: await tempStateDir(), origin: [] },
        {
          start: async (s) => {
            await s.listen();
            started = { listening: () => s.httpServer.server.listening, port: s.options.port };
            throw boom;
          },
        },
      ),
    ).rejects.toBe(boom);
    expect(started!.listening()).toBe(false);
    const probe = createServer();
    await new Promise<void>((res, rej) => {
      probe.once("error", rej);
      probe.listen(started!.port, "127.0.0.1", () => res());
    });
    await new Promise<void>((res) => probe.close(() => res()));
  });

  it("上限の回数だけ EADDRINUSE が続いたら、最後の失敗を投げる", async () => {
    const taken = await occupiedPort();
    const pickPort = vi.fn(async () => taken);
    await expect(
      composeServerOnFreePort(
        { host: "127.0.0.1", stateDir: await tempStateDir(), origin: [] },
        { pickPort, attempts: 2 },
      ),
    ).rejects.toMatchObject({
      code: "EADDRINUSE",
    });
    expect(pickPort).toHaveBeenCalledTimes(2);
  });
});
