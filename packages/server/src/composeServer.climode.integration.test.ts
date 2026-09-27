import { rm } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { PREFS_MAX_BYTES } from "@sodashitsu/protocol";
import { makeTempDir } from "./persist/atomicFile.js";
import { composeServerOnFreePort } from "./composeServerOnFreePort.js";
import type { ComposedServer } from "./composeServer.js";

/**
 * 20260927-cli-mode の 02-server：サーバの口（`prefs.*`・`prefs.changed`）を実物の `composeServer`（乱数ポート・一時の状態ディレクトリ）で確かめる。
 */
vi.setConfig({ testTimeout: 20_000 });

interface Client {
  ws: WebSocket;
  clientId: string;
  request(method: string, params: unknown): Promise<unknown>;
  /** 届いたイベント（`event`/`data`）。 */
  events: { event: string; data: unknown }[];
  waitEvent(name: string, pred?: (data: unknown) => boolean, timeoutMs?: number): Promise<unknown>;
}

describe("composeServer: 02-server の口（20260927-cli-mode）", () => {
  const cleanups: (() => Promise<unknown> | unknown)[] = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  async function tempStateDir(): Promise<string> {
    const stateDir = await makeTempDir("soda-climode-");
    cleanups.push(() =>
      rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
    );
    return stateDir;
  }

  async function start(stateDir: string): Promise<ComposedServer> {
    const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
    let closed = false;
    const close = server.close.bind(server);
    server.close = async () => {
      if (closed) return;
      closed = true;
      await close();
    };
    cleanups.push(() => server.close());
    return server;
  }

  async function tokenLogin(server: ComposedServer, token: string): Promise<string> {
    const port = server.options.port;
    const origin = `http://127.0.0.1:${port}`;
    const res = await fetch(`${origin}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
      body: JSON.stringify({ token }),
    });
    expect(res.status).toBe(204);
    return res.headers.get("set-cookie")!.split(";")[0]!;
  }

  async function connect(server: ComposedServer, cookie: string): Promise<Client> {
    const port = server.options.port;
    const origin = `http://127.0.0.1:${port}`;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { cookie, origin, host: `127.0.0.1:${port}` },
    });
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    cleanups.push(() => ws.close());
    const events: { event: string; data: unknown }[] = [];
    const pending = new Map<string, { resolve(v: unknown): void; reject(e: Error): void }>();
    const waiters = new Set<() => void>();
    ws.on("message", (raw, isBinary) => {
      if (isBinary) return;
      const msg = JSON.parse(raw.toString()) as {
        id?: string;
        result?: unknown;
        error?: unknown;
        event?: string;
        data?: unknown;
      };
      if (msg.id !== undefined) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error !== undefined) p?.reject(new Error(JSON.stringify(msg.error)));
        else p?.resolve(msg.result);
        return;
      }
      if (msg.event !== undefined) {
        events.push({ event: msg.event, data: msg.data });
        for (const w of [...waiters]) w();
      }
    });
    let seq = 0;
    const request = (method: string, params: unknown): Promise<unknown> =>
      new Promise((resolve, reject) => {
        const id = `r${++seq}`;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    const waitEvent = (
      name: string,
      pred: (data: unknown) => boolean = () => true,
      timeoutMs = 5000,
    ): Promise<unknown> =>
      new Promise((resolve, reject) => {
        const check = (): void => {
          const hit = events.find((e) => e.event === name && pred(e.data));
          if (hit === undefined) return;
          waiters.delete(check);
          clearTimeout(timer);
          resolve(hit.data);
        };
        const timer = setTimeout(() => {
          waiters.delete(check);
          reject(new Error(`timed out waiting for ${name}`));
        }, timeoutMs);
        waiters.add(check);
        check();
      });
    const hello = (await request("client.hello", { protocol: 1, kind: "desktop" })) as {
      clientId: string;
    };
    return { ws, clientId: hello.clientId, request, events, waitEvent };
  }

  describe("prefs.*（T2）", () => {
    it("prefs.get は最初 rev 0。prefs.set は項目ごとに上書きし、保存した本人を含む全クライアントへ prefs.changed を配る", async () => {
      const stateDir = await tempStateDir();
      const server = await start(stateDir);
      const cookie = await tokenLogin(server, server.freshToken!);
      const a = await connect(server, cookie);
      const b = await connect(server, cookie);
      expect(await a.request("prefs.get", {})).toEqual({ prefs: {}, rev: 0 });
      expect(
        await a.request("prefs.set", {
          patch: { theme: "nord", keys: { prefix: "ctrl+a" } },
          baseRev: 0,
        }),
      ).toEqual({
        prefs: { theme: "nord", keys: { prefix: "ctrl+a" } },
        rev: 1,
      });
      const changed = {
        prefs: { theme: "nord", keys: { prefix: "ctrl+a" } },
        rev: 1,
        byClientId: a.clientId,
      };
      expect(await b.waitEvent("prefs.changed")).toEqual(changed);
      expect(await a.waitEvent("prefs.changed")).toEqual(changed);
      expect(await b.request("prefs.set", { patch: { future: { x: 1 } } })).toEqual({
        prefs: { theme: "nord", keys: { prefix: "ctrl+a" }, future: { x: 1 } },
        rev: 2,
      });
      expect(await a.request("prefs.get", {})).toEqual({
        prefs: { theme: "nord", keys: { prefix: "ctrl+a" }, future: { x: 1 } },
        rev: 2,
      });
    });

    it("上限を超える prefs.set は invalid_params で断り、保存しない", async () => {
      const stateDir = await tempStateDir();
      const server = await start(stateDir);
      const a = await connect(server, await tokenLogin(server, server.freshToken!));
      const half = "x".repeat(PREFS_MAX_BYTES / 2);
      await a.request("prefs.set", { patch: { a: half } });
      await expect(a.request("prefs.set", { patch: { b: half } })).rejects.toThrow(
        /invalid_params/,
      );
      await expect(
        a.request("prefs.set", { patch: { c: "y".repeat(PREFS_MAX_BYTES) } }),
      ).rejects.toThrow(/invalid_params/);
      expect(((await a.request("prefs.get", {})) as { rev: number }).rev).toBe(1);
    });

    it("保存した設定は再起動の後も読める", async () => {
      const stateDir = await tempStateDir();
      const first = await start(stateDir);
      const token = first.freshToken!;
      const a = await connect(first, await tokenLogin(first, token));
      await a.request("prefs.set", { patch: { theme: "nord" } });
      a.ws.close();
      await first.close();
      const second = await start(stateDir);
      const b = await connect(second, await tokenLogin(second, token));
      expect(await b.request("prefs.get", {})).toEqual({ prefs: { theme: "nord" }, rev: 1 });
    });
  });
});
