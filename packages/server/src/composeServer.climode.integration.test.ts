import { execFileSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { PREFS_MAX_BYTES } from "@sodashitsu/protocol";
import { makeTempDir } from "./persist/atomicFile.js";
import { composeServerOnFreePort } from "./composeServerOnFreePort.js";
import type { ComposedServer } from "./composeServer.js";
import { STATE_DIR_LOCK_FILE } from "./persist/StateDirLock.js";
import { localAuthPath, readLocalAuth } from "./auth/LocalLogin.js";
import { readServeRecord } from "./persist/ServeRecordFile.js";

/**
 * 20260927-cli-mode の 02-server：サーバの口（`prefs.*`・`prefs.changed`・`server.stop`・`/api/local-login`・`serve.json` の指紋）を実物の `composeServer`（乱数ポート・一時の状態ディレクトリ）で確かめる。
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

  async function start(
    stateDir: string,
    tls?: { cert: string; key: string },
  ): Promise<ComposedServer> {
    const server = await composeServerOnFreePort({
      host: "127.0.0.1",
      stateDir,
      origin: [],
      ...(tls ?? {}),
    });
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

  async function connect(server: ComposedServer, cookie: string, kind: "desktop" | "external" = "desktop"): Promise<Client> {
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
    const hello = (await request("client.hello", { protocol: 1, kind })) as {
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
        byKind: "desktop",
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

    it("displayScriptEnabled が無効 → 有効に変わると、prefs.changed に変えた接続の種別（byKind）が付き、サーバのログに残る。有効のままの変更ではログに残らない", async () => {
      const stateDir = await tempStateDir();
      const server = await start(stateDir);
      const cookie = await tokenLogin(server, server.freshToken!);
      const web = await connect(server, cookie, "desktop");
      const ext = await connect(server, cookie, "external");
      await ext.request("prefs.set", { patch: { displayScriptEnabled: true } });
      const seen = (await web.waitEvent("prefs.changed", (d) => (d as { prefs: { displayScriptEnabled?: boolean } }).prefs.displayScriptEnabled === true)) as { byKind?: string; byClientId: string };
      expect(seen.byKind).toBe("external");
      expect(seen.byClientId).toBe(ext.clientId);
      await web.request("prefs.set", { patch: { theme: "nord" } }); // 有効のまま別の項目を変えた
      const log = await readFile(join(stateDir, "server.log"), "utf8");
      const lines = log.split("\n").filter((l) => l.includes("display script enabled"));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('"byKind":"external"');
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

  describe("server.stop（T3）", () => {
    it("応答を返してから onStopRequest の停止の手順を呼ぶ。閉じるとロックが無く、接続は 1001 で閉じる", async () => {
      const stateDir = await tempStateDir();
      const server = await start(stateDir);
      const a = await connect(server, await tokenLogin(server, server.freshToken!));
      let closing: Promise<void> | undefined;
      let calls = 0;
      const sources: string[] = [];
      server.onStopRequest((source) => {
        sources.push(source);
        calls++;
        closing = server.close(); // main.ts の停止の手順と同じく close() を始める
      });
      const closed = new Promise<number>((resolve) => a.ws.once("close", (code) => resolve(code)));
      expect(await a.request("server.stop", {})).toEqual({});
      expect(await closed).toBe(1001);
      await closing;
      expect(calls).toBe(1);
      expect(sources).toEqual(["server.stop"]);
      expect(existsSync(join(stateDir, STATE_DIR_LOCK_FILE))).toBe(false);
    });
  });

  describe("/api/local-login（T4）", () => {
    async function localLogin(server: ComposedServer, secret: string): Promise<Response> {
      const port = server.options.port;
      const origin = `http://127.0.0.1:${port}`;
      return fetch(`${origin}/api/local-login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
        body: JSON.stringify({ secret }),
      });
    }

    it("local-auth.json（このプロセスの pid）の秘密で通常の cookie が出て、その cookie で /ws に繋がる。止めると秘密のファイルを消す", async () => {
      const stateDir = await tempStateDir();
      const server = await start(stateDir);
      const rec = await readLocalAuth(stateDir);
      expect(rec?.pid).toBe(process.pid);
      const res = await localLogin(server, rec!.secret);
      expect(res.status).toBe(204);
      const setCookie = res.headers.get("set-cookie")!;
      expect(setCookie).toMatch(/^soda_session=/);
      expect(setCookie).toContain("HttpOnly");
      const client = await connect(server, setCookie.split(";")[0]!);
      expect(client.clientId).toBeTruthy();
      client.ws.close();
      await server.close();
      expect(existsSync(localAuthPath(stateDir))).toBe(false);
    });

    it("秘密が違えば 401。失敗は /api/login と同じ回数の制限に数え、5 回で正しい秘密も 429", async () => {
      const stateDir = await tempStateDir();
      const server = await start(stateDir);
      const rec = await readLocalAuth(stateDir);
      for (let i = 0; i < 5; i++) expect((await localLogin(server, `wrong-${i}`)).status).toBe(401);
      expect((await localLogin(server, rec!.secret)).status).toBe(429);
      // 同じ制限を共有する（token のログインも止まる）
      const port = server.options.port;
      const origin = `http://127.0.0.1:${port}`;
      const tokenRes = await fetch(`${origin}/api/login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
        body: JSON.stringify({ token: server.freshToken }),
      });
      expect(tokenRes.status).toBe(429);
    });

    it("秘密が無い・Origin が許可外なら通さない", async () => {
      const stateDir = await tempStateDir();
      const server = await start(stateDir);
      const port = server.options.port;
      const origin = `http://127.0.0.1:${port}`;
      const noSecret = await fetch(`${origin}/api/local-login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
        body: "{}",
      });
      expect(noSecret.status).toBe(400);
      const rec = await readLocalAuth(stateDir);
      const badOrigin = await fetch(`${origin}/api/local-login`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://evil.example",
          host: `127.0.0.1:${port}`,
        },
        body: JSON.stringify({ secret: rec!.secret }),
      });
      expect(badOrigin.status).toBe(403);
    });
  });

  describe.skipIf(!hasOpenssl())("serve.json の certSha256（T4）", () => {
    it("https で起動すると serve.json に証明書の SHA-256 の指紋を書く", async () => {
      const stateDir = await tempStateDir();
      const certDir = await tempStateDir();
      const cert = join(certDir, "cert.pem");
      const key = join(certDir, "key.pem");
      execFileSync(
        "openssl",
        [
          "req",
          "-x509",
          "-newkey",
          "ec",
          "-pkeyopt",
          "ec_paramgen_curve:prime256v1",
          "-nodes",
          "-subj",
          "/CN=127.0.0.1",
          "-days",
          "1",
          "-keyout",
          key,
          "-out",
          cert,
        ],
        { stdio: "ignore" },
      );
      await start(stateDir, { cert, key });
      const record = await readServeRecord(stateDir);
      expect(record?.https).toBe(true);
      expect(record?.certSha256).toBe(
        new X509Certificate(await readFile(cert, "utf8")).fingerprint256,
      );
    });

    it("http では certSha256 を書かない", async () => {
      const stateDir = await tempStateDir();
      await start(stateDir);
      expect(await readServeRecord(stateDir)).not.toHaveProperty("certSha256");
    });
  });
});

function hasOpenssl(): boolean {
  try {
    execFileSync("openssl", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
