import { rm } from "node:fs/promises";
import { connect } from "node:net";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import { decodeFrame, encodeInputFrame, FRAME_TYPE, type MachineStatus } from "@wtm/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { composeServerOnFreePort } from "../composeServerOnFreePort.js";
import type { ComposedServer } from "../composeServer.js";
import { makeTempDir } from "../persist/atomicFile.js";
import { bridgeSocketPathFor } from "./BridgeEndpoint.js";
import { saveCatalog } from "./MachineCatalog.js";
import type { ChildLike, SpawnFn } from "./MachineLink.js";

/**
 * 2 つの実物の `composeServer`（手元・リモート）を同じプロセスで起こし、手元の `/ws?machine=` がリモートの `wtm serve` と今までと同じ通信を
 * 中継することを確かめる（20260927-multi-host-machines の T8）。ssh と `wtm bridge` の代わりに、リモートの `bridge.sock` へ直接繋ぐ偽の子を渡す
 * （本物の子プロセスの通しは smoke の `machineSmoke.ts`）。
 */
vi.setConfig({ testTimeout: 30_000 });

const MACHINE_ID = "c".repeat(32);

/** ssh ＋ `wtm bridge` の代わり: 引数を記録し、`bridge.sock` と標準入出力を素通しで繋ぐ。 */
function fakeSshTo(
  bridgePath: () => string,
  calls: string[][],
  children: ChildLike[] = [],
): SpawnFn {
  return (command, args) => {
    calls.push([command, ...args]);
    const child = new EventEmitter() as EventEmitter & ChildLike;
    children.push(child);
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const sock = connect(bridgePath());
    let exited = false;
    const exit = (code: number): void => {
      if (exited) return;
      exited = true;
      stdout.end();
      stderr.end();
      setImmediate(() => child.emit("close", code, null));
    };
    sock.on("error", () => {
      stderr.write("wtm: no running wtm serve for session default\n");
      exit(3);
    });
    sock.on("close", () => exit(0));
    stdin.pipe(sock);
    sock.pipe(stdout, { end: false });
    Object.assign(child, {
      stdin,
      stdout,
      stderr,
      kill: () => {
        sock.destroy();
        exit(143);
        return true;
      },
    });
    return child;
  };
}

async function login(
  server: ComposedServer,
): Promise<{ origin: string; cookie: string; port: number }> {
  const port = server.options.port;
  const origin = `http://127.0.0.1:${port}`;
  const res = await fetch(`${origin}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
    body: JSON.stringify({ token: server.freshToken }),
  });
  expect(res.status).toBe(204);
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0]!;
  return { origin, cookie, port };
}

/** `/ws`（クエリつき）を開く。断られたら状態コードを返す。 */
function openWs(
  port: number,
  query: string,
  cookie: string | undefined,
): Promise<WebSocket | number> {
  return new Promise((resolve, reject) => {
    const origin = `http://127.0.0.1:${port}`;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws${query}`, {
      headers: { origin, host: `127.0.0.1:${port}`, ...(cookie ? { cookie } : {}) },
    });
    ws.once("open", () => resolve(ws));
    ws.once("unexpected-response", (_req, res) => {
      ws.terminate();
      resolve(res.statusCode ?? 0);
    });
    ws.once("error", reject);
  });
}

class Client {
  private seq = 0;
  private readonly pending = new Map<
    string,
    (v: { result?: unknown; error?: { code: string } }) => void
  >();
  readonly events: { event: string; data: unknown }[] = [];
  output = "";
  closedWith: number | undefined;
  constructor(readonly ws: WebSocket) {
    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        const f = decodeFrame(new Uint8Array(data as Buffer));
        if (f.type === FRAME_TYPE.OUTPUT) this.output += new TextDecoder().decode(f.chunk);
        if (f.type === FRAME_TYPE.SNAPSHOT) this.output += f.text;
        return;
      }
      const msg = JSON.parse(String(data)) as {
        id?: string;
        event?: string;
        data?: unknown;
        result?: unknown;
        error?: { code: string };
      };
      if (msg.id !== undefined) this.pending.get(msg.id)?.(msg);
      else if (msg.event) this.events.push({ event: msg.event, data: msg.data });
    });
    ws.on("close", (code) => {
      this.closedWith = code;
    });
  }
  request<T>(method: string, params: unknown): Promise<T> {
    const id = String(++this.seq);
    return new Promise((resolve, reject) => {
      this.pending.set(id, (m) =>
        m.error ? reject(new Error(m.error.code)) : resolve(m.result as T),
      );
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function until<T>(
  what: string,
  fn: () => T | undefined | Promise<T | undefined>,
  timeoutMs = 15_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v !== undefined) return v;
    if (Date.now() > deadline) throw new Error(`timed out: ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe.skipIf(process.platform === "win32")(
  "保存した SSH のマシン（2 つの composeServer。T8）",
  () => {
    const cleanups: (() => Promise<unknown> | unknown)[] = [];
    afterEach(async () => {
      for (const fn of cleanups.splice(0).reverse()) await fn();
    });

    async function startPair(opts: { withMachine: boolean }) {
      const remoteDir = await makeTempDir("wtm-machine-remote-");
      const localDir = await makeTempDir("wtm-machine-local-");
      cleanups.push(() =>
        rm(remoteDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
      );
      cleanups.push(() =>
        rm(localDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
      );
      let remote: ComposedServer | undefined = await composeServerOnFreePort({
        host: "127.0.0.1",
        stateDir: remoteDir,
        origin: [],
      });
      const closeRemote = async (): Promise<void> => {
        const r = remote;
        remote = undefined;
        await r?.close();
      };
      cleanups.push(closeRemote);
      if (opts.withMachine) {
        await saveCatalog(localDir, {
          version: 1,
          machines: [{ id: MACHINE_ID, label: "Remote", target: "you@remote", enabled: true }],
        });
      }
      const calls: string[][] = [];
      const children: ChildLike[] = [];
      const local = await composeServerOnFreePort(
        { host: "127.0.0.1", stateDir: localDir, origin: [] },
        {
          internal: {
            machineSpawn: fakeSshTo(() => bridgeSocketPathFor(remoteDir), calls, children),
          },
        },
      );
      cleanups.push(() => local.close());
      return {
        local,
        remoteDir,
        localDir,
        calls,
        children,
        closeRemote,
        remoteServer: () => remote,
      };
    }

    it("/ws?machine= で hello・workspace の作成・入出力がリモートの wtm serve に届く。名前でも id でも。machine.list と machine.changed", async () => {
      const { local, calls, remoteServer, localDir } = await startPair({ withMachine: true });
      const { cookie, port } = await login(local);
      const localWs = new Client((await openWs(port, "", cookie)) as WebSocket);
      await localWs.request("client.hello", { protocol: 1, kind: "external" });
      const online = await until("online", async () => {
        const r = await localWs.request<{ machines: MachineStatus[] }>("machine.list", {});
        return r.machines[0]?.state === "online" ? r.machines : undefined;
      });
      expect(online).toEqual([{ id: MACHINE_ID, label: "Remote", state: "online", message: null }]);
      expect(calls[0]!.slice(0, 1)).toEqual(["ssh"]);
      expect(calls[0]!.slice(-4)).toEqual(["--", "you@remote", "wtm", "bridge"]);

      for (const q of ["?machine=Remote", `?machine=${MACHINE_ID}`]) {
        const c = new Client((await openWs(port, q, cookie)) as WebSocket);
        const hello = await c.request<{
          snapshot: { host: { hostname: string }; workspaces: { id: string }[] };
        }>("client.hello", { protocol: 1, kind: "desktop" });
        const remoteWorkspaces = remoteServer()!
          .session.snapshot()
          .workspaces.map((w) => w.id);
        expect(hello.snapshot.workspaces.map((w) => w.id)).toEqual(remoteWorkspaces);
        c.ws.close();
      }

      const c = new Client((await openWs(port, "?machine=Remote", cookie)) as WebSocket);
      await c.request("client.hello", { protocol: 1, kind: "desktop" });
      const created = await c.request<{ workspace: { id: string }; pane: { id: string } }>(
        "workspace.create",
        { label: "via-relay" },
      );
      expect(
        remoteServer()!
          .session.snapshot()
          .workspaces.some((w) => w.id === created.workspace.id && w.label === "via-relay"),
      ).toBe(true);
      expect(local.session.snapshot().workspaces.some((w) => w.label === "via-relay")).toBe(false); // 手元には作らない
      await c.request("pane.subscribe", { paneId: created.pane.id, scrollbackLines: 100 });
      c.ws.send(
        encodeInputFrame(created.pane.id, new TextEncoder().encode("echo relay-$((40+2))\r")),
      );
      await until("echo", () => (c.output.includes("relay-42") ? true : undefined));
      c.ws.close();

      // 名前を変えると、繋ぎ直さずに machine.changed が届く（登録簿の変化は 2 秒以内に反映）
      const callsBefore = calls.length;
      await saveCatalog(localDir, {
        version: 1,
        machines: [{ id: MACHINE_ID, label: "Renamed", target: "you@remote", enabled: true }],
      });
      const changed = await until(
        "machine.changed",
        () =>
          localWs.events.find(
            (e) =>
              e.event === "machine.changed" &&
              (e.data as { machines: MachineStatus[] }).machines[0]?.label === "Renamed",
          ),
        3000,
      );
      expect((changed.data as { machines: MachineStatus[] }).machines[0]!.state).toBe("online");
      expect(calls.length).toBe(callsBefore);
      localWs.ws.close();
    });

    it("認証なしは 401、不正なクエリは 400、知らない・無効は 404、繋がっていないは 503（認証を先に見る）", async () => {
      const { local, closeRemote } = await startPair({ withMachine: true });
      const { cookie, port } = await login(local);
      expect(await openWs(port, "?machine=Remote", undefined)).toBe(401);
      expect(await openWs(port, "?machine=nope", undefined)).toBe(401);
      expect(await openWs(port, "?machine=", cookie)).toBe(400);
      expect(await openWs(port, "?machine=a&machine=b", cookie)).toBe(400);
      expect(await openWs(port, `?machine=${"x".repeat(257)}`, cookie)).toBe(400);
      expect(await openWs(port, "?machine=nope", cookie)).toBe(404);
      const ok = await openWs(port, "?machine=local", cookie);
      expect(ok).toBeInstanceOf(WebSocket);
      (ok as WebSocket).close();
      // 繋がるまで待ってから、リモートを止めると 503
      const statusOf = async (q: string): Promise<number> => {
        const r = await openWs(port, q, cookie);
        if (typeof r === "number") return r;
        r.close();
        return 101;
      };
      await until("online", async () =>
        (await statusOf("?machine=Remote")) === 101 ? true : undefined,
      );
      await closeRemote();
      await until("offline", async () =>
        (await statusOf("?machine=Remote")) === 503 ? true : undefined,
      );
    });

    it("ssh が切れると中継の接続は 1012（繋ぎ直し）で閉じる。手元のログアウト（セッションの失効）で中継の接続は 4401 で閉じる", async () => {
      const { local, children } = await startPair({ withMachine: true });
      const { cookie, port, origin } = await login(local);
      const localWs = new Client((await openWs(port, "", cookie)) as WebSocket);
      await localWs.request("client.hello", { protocol: 1, kind: "external" });
      const waitOnline = () =>
        until("online", async () =>
          (await localWs.request<{ machines: MachineStatus[] }>("machine.list", {})).machines[0]
            ?.state === "online"
            ? true
            : undefined,
        );
      await waitOnline();
      const a = new Client((await openWs(port, "?machine=Remote", cookie)) as WebSocket);
      await a.request("client.hello", { protocol: 1, kind: "external" });
      children[children.length - 1]!.kill("SIGTERM"); // ssh が落ちた
      expect(await until("relay closed", () => a.closedWith)).toBe(1012);
      await waitOnline(); // 1 秒後に繋ぎ直す
      const b = new Client((await openWs(port, "?machine=Remote", cookie)) as WebSocket);
      await b.request("client.hello", { protocol: 1, kind: "external" });
      const res = await fetch(`${origin}/api/logout`, {
        method: "POST",
        headers: { cookie, origin, host: `127.0.0.1:${port}` },
      });
      expect(res.status).toBe(204);
      expect(await until("revoked", () => b.closedWith)).toBe(4401);
      localWs.ws.close();
    });

    it("リモートが止まると中継の接続は閉じ、状態は再接続中→要対応（動いていない）。手元の /ws は動き続ける", async () => {
      const { local, closeRemote } = await startPair({ withMachine: true });
      const { cookie, port } = await login(local);
      const localWs = new Client((await openWs(port, "", cookie)) as WebSocket);
      await localWs.request("client.hello", { protocol: 1, kind: "external" });
      await until("online", async () =>
        (await localWs.request<{ machines: MachineStatus[] }>("machine.list", {})).machines[0]
          ?.state === "online"
          ? true
          : undefined,
      );
      const relayed = new Client((await openWs(port, "?machine=Remote", cookie)) as WebSocket);
      await relayed.request("client.hello", { protocol: 1, kind: "external" });
      await closeRemote();
      // リモートの停止は「停止」（1001）を伝えてから切れる（手元の ssh が先に切れたと見れば 1012）。どちらもブラウザは繋ぎ直す。
      await until("relay closed", () => relayed.closedWith);
      expect([1012, 1001]).toContain(relayed.closedWith);
      const state = await until("not online", async () => {
        const m = (await localWs.request<{ machines: MachineStatus[] }>("machine.list", {}))
          .machines[0];
        return m && m.state !== "online" ? m : undefined;
      });
      expect(["reconnecting", "attention"]).toContain(state.state);
      // 1 秒後の試みで bridge.sock が無い → 終了コード 3 → 要対応
      const attention = await until("attention", async () => {
        const m = (await localWs.request<{ machines: MachineStatus[] }>("machine.list", {}))
          .machines[0];
        return m?.state === "attention" ? m : undefined;
      });
      expect(attention.message).toMatch(/動いていません/);
      // 手元はそのまま使える
      expect(
        (
          await localWs.request<{ snapshot: unknown }>("client.hello", {
            protocol: 1,
            kind: "external",
          })
        ).snapshot,
      ).toBeDefined();
      localWs.ws.close();
    });

    it("登録簿が無ければ ssh を起こさず、machine.list は空、?machine= は 404（AC15）", async () => {
      const { local, calls } = await startPair({ withMachine: false });
      const { cookie, port } = await login(local);
      const c = new Client((await openWs(port, "", cookie)) as WebSocket);
      await c.request("client.hello", { protocol: 1, kind: "external" });
      expect(await c.request("machine.list", {})).toEqual({ machines: [] });
      expect(await openWs(port, "?machine=Remote", cookie)).toBe(404);
      await new Promise((r) => setTimeout(r, 1200));
      expect(calls).toEqual([]);
      c.ws.close();
    });
  },
);
