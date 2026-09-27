#!/usr/bin/env node
/**
 * 更新時の引き継ぎ（live handoff。20260926-live-handoff）の起動確認。**ビルドした `dist/main.js`** を子プロセスで `wtm serve` として起動し、
 * 実物の `wtm handoff` で入れ替えて、次を確かめてから後始末する（Linux/macOS。Windows では何もせず成功で終わる——非対応）:
 * - 動いていないとき `wtm handoff` は終了コード 3 で、何も作らない（AC12）
 * - 入れ替えの前後でサーバの pid が同じ・pane の id とシェルの pid が同じ（AC1）
 * - 前の画面の印が、入れ替えの後に繋いだクライアントの SNAPSHOT に入っている（AC3）
 * - 入れ替えの後も同じ Cookie で `/ws` に繋がり（AC5）、入力がシェルに届き出力が返り、大きさの変更がシェルに見える（AC2）
 * - `handoff.json` が残らない（AC8）・シェルが終わると pane が閉じる（AC7）
 * pane のシェルは `/bin/sh`（`--shell`）——印に `$$`・`$((…))` を使うため。
 * vitest の中では確かめられない（execve の先の新しい版がビルドした成果物であるため。tasks.md「実装方針」）。
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeFrame, encodeInputFrame, FRAME_TYPE } from "@wtm/protocol";
import WebSocket from "ws";

const MAIN = join(import.meta.dirname, "main.js");
const log = (msg: string): void => console.log(`handoff-smoke: ${msg}`);

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const port = (probe.address() as AddressInfo).port;
      probe.close((err) => (err ? reject(err) : resolve(port)));
    });
    probe.on("error", reject);
  });
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

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** 1 本の持続的な message ハンドラで、応答・イベント・pane の出力（SNAPSHOT と OUTPUT）を溜める。 */
function client(ws: WebSocket) {
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  const events: { event: string; data: unknown }[] = [];
  const screens = new Map<string, string>();
  let nextId = 1;
  ws.on("message", (data: Buffer, isBinary: boolean) => {
    if (isBinary) {
      const f = decodeFrame(new Uint8Array(data));
      if (f.type === FRAME_TYPE.OUTPUT)
        screens.set(f.paneId, (screens.get(f.paneId) ?? "") + new TextDecoder().decode(f.chunk));
      if (f.type === FRAME_TYPE.SNAPSHOT)
        screens.set(f.paneId, (screens.get(f.paneId) ?? "") + f.text);
      return;
    }
    const msg = JSON.parse(data.toString("utf8")) as {
      id?: string;
      result?: unknown;
      error?: unknown;
      event?: string;
      data?: unknown;
    };
    if (msg.id === undefined) {
      if (msg.event !== undefined) events.push({ event: msg.event, data: msg.data });
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(`${JSON.stringify(msg.error)}`));
    else p.resolve(msg.result);
  });
  return {
    events,
    screen: (paneId: string) => screens.get(paneId) ?? "",
    request(method: string, params: unknown): Promise<unknown> {
      const id = String(nextId++);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timed out: ${method}`)), 10_000);
        pending.set(id, {
          resolve: (v) => {
            clearTimeout(timer);
            resolve(v);
          },
          reject: (e) => {
            clearTimeout(timer);
            reject(e);
          },
        });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    type(paneId: string, text: string): void {
      ws.send(encodeInputFrame(paneId, new TextEncoder().encode(text)));
    },
  };
}

async function connect(
  port: number,
  cookie: string,
): Promise<{ ws: WebSocket; c: ReturnType<typeof client> }> {
  const origin = `http://127.0.0.1:${port}`;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
    headers: { cookie, origin, host: `127.0.0.1:${port}` },
  });
  const c = client(ws);
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
    ws.once("unexpected-response", (_req, res) =>
      reject(new Error(`/ws rejected: HTTP ${res.statusCode}`)),
    );
  });
  return { ws, c };
}

function runWtm(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [MAIN, ...args], { encoding: "utf8", timeout: 60_000 });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

async function main(): Promise<void> {
  if (process.platform === "win32") {
    log("skipped (live handoff is not supported on Windows)");
    return;
  }
  const stateDir = await mkdtemp(join(tmpdir(), "wtm-handoff-smoke-"));
  let server: ChildProcess | undefined;
  let shellPid: number | undefined;
  let serverOut = "";
  try {
    // 1. 動いていないとき（AC12）
    const idle = runWtm(["handoff", "--state-dir", stateDir]);
    if (idle.status !== 3)
      throw new Error(`expected exit 3 when not running, got ${idle.status}: ${idle.stderr}`);
    if (readdirSync(stateDir).length !== 0)
      throw new Error(
        `wtm handoff created files while no server ran: ${readdirSync(stateDir).join(",")}`,
      );
    log("not running → exit 3, nothing created ok");

    // 2. サーバを起動し、token 付きの URL から token を取る
    const port = await freePort();
    server = spawn(
      process.execPath,
      [
        MAIN,
        "serve",
        "--state-dir",
        stateDir,
        "--port",
        String(port),
        "--host",
        "127.0.0.1",
        "--shell",
        "/bin/sh",
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    server.stdout!.setEncoding("utf8");
    server.stderr!.setEncoding("utf8");
    server.stdout!.on("data", (c: string) => (serverOut += c));
    server.stderr!.on("data", (c: string) => (serverOut += c));
    let serverExited = false;
    server.on("exit", () => (serverExited = true));
    const token = await until("server start", () => {
      if (serverExited) throw new Error(`the server exited while starting:\n${serverOut}`);
      return /#token=([A-Za-z0-9_-]+)/.exec(serverOut)?.[1];
    });
    const serverPid = server.pid!;
    const origin = `http://127.0.0.1:${port}`;
    const login = await fetch(`${origin}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
      body: JSON.stringify({ token }),
    });
    if (login.status !== 204) throw new Error(`login failed: HTTP ${login.status}`);
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;

    // 3. 入れ替えの前: pane の id・シェルの pid・画面の印
    const before = await connect(port, cookie);
    const hello = (await before.c.request("client.hello", { protocol: 1, kind: "desktop" })) as {
      snapshot: { panes: { id: string }[] };
    };
    const paneId = hello.snapshot.panes[0]!.id;
    await before.c.request("pane.subscribe", { paneId, scrollbackLines: 200 });
    before.c.type(paneId, "echo PANE-PID-$$; echo HANDOFF-$((6*7))-BEFORE\n");
    shellPid = await until("shell pid before", () => {
      const m = /PANE-PID-(\d+)/.exec(before.c.screen(paneId));
      return m && before.c.screen(paneId).includes("HANDOFF-42-BEFORE") ? Number(m[1]) : undefined;
    });
    const closedBefore = new Promise<number>((resolve) =>
      before.ws.once("close", (code) => resolve(code)),
    );
    log(`before: server pid ${serverPid}, pane ${paneId}, shell pid ${shellPid}`);

    // 4. 入れ替え
    const handoff = runWtm(["handoff", "--state-dir", stateDir]);
    if (
      handoff.status !== 0 ||
      !handoff.stdout.includes("handoff complete: 1 pane(s) kept running")
    ) {
      throw new Error(
        `wtm handoff failed (exit ${handoff.status}): ${handoff.stdout} ${handoff.stderr}\n--- server ---\n${serverOut}`,
      );
    }
    log(`wtm handoff → exit 0: ${handoff.stdout.trim().split("\n").pop()}`);
    const closeCode = await Promise.race([
      closedBefore,
      new Promise<number>((_, reject) =>
        setTimeout(() => reject(new Error("the old /ws did not close within 10s")), 10_000),
      ),
    ]);
    if (closeCode !== 1012)
      throw new Error(`expected the old /ws to close with 1012, got ${closeCode}`);
    if (serverExited || !isAlive(serverPid))
      throw new Error("the server process exited (pid must stay the same)");
    if (existsSync(join(stateDir, "handoff.json"))) throw new Error("handoff.json was left behind");
    log("same server pid, /ws closed with 1012, handoff.json removed ok");

    // 5. 入れ替えの後: 同じ Cookie で繋ぎ、同じ pane・同じシェル・前の画面
    const after = await connect(port, cookie);
    const hello2 = (await after.c.request("client.hello", { protocol: 1, kind: "desktop" })) as {
      snapshot: { panes: { id: string }[] };
    };
    if (!hello2.snapshot.panes.some((p) => p.id === paneId))
      throw new Error(`pane ${paneId} is missing after the handoff`);
    await after.c.request("pane.subscribe", { paneId, scrollbackLines: 200 });
    await until(
      "previous screen after handoff",
      () => (after.c.screen(paneId).includes("HANDOFF-42-BEFORE") ? true : undefined),
      5000,
    );
    after.c.type(paneId, "echo PANE-PID-$$ AFTER-$((6*7))\n");
    const pidAfter = await until("shell pid after", () => {
      const m = /PANE-PID-(\d+) AFTER-42/.exec(after.c.screen(paneId));
      return m ? Number(m[1]) : undefined;
    });
    if (pidAfter !== shellPid) throw new Error(`shell pid changed: ${shellPid} → ${pidAfter}`);
    log("same pane, same shell pid, previous screen visible, input/output ok");

    // 6. 大きさの変更がシェルに見える（pane への直結で大きさを決める）
    await after.c.request("pane.attach", { paneId, cols: 101, rows: 29 });
    after.c.type(paneId, "stty size\n");
    await until(
      "stty size 29 101",
      () => (after.c.screen(paneId).includes("29 101") ? true : undefined),
      5000,
    );
    await after.c.request("pane.detach", { paneId });
    log("resize reaches the adopted pty ok");

    // 7. シェルが終わると pane が閉じる
    after.c.type(paneId, "exit\n");
    await until(
      "pane closed after the shell exited",
      () =>
        after.c.events.some(
          (e) => e.event === "pane.closed" && (e.data as { paneId?: string }).paneId === paneId,
        )
          ? true
          : undefined,
      10_000,
    );
    shellPid = undefined; // 終わった（pid が再利用されうるので後始末で送らない）
    log("pane closes when the adopted shell exits ok");
    after.ws.close();
  } finally {
    if (server !== undefined && server.exitCode === null) {
      const exited = new Promise<void>((resolve) => server!.once("exit", () => resolve()));
      server.kill("SIGTERM");
      await Promise.race([exited, new Promise((r) => setTimeout(r, 10_000))]);
      if (server.exitCode === null) server.kill("SIGKILL");
    }
    if (shellPid !== undefined && isAlive(shellPid)) {
      try {
        process.kill(shellPid, "SIGKILL");
      } catch {
        // 既に終わっている。
      }
    }
    await rm(stateDir, { recursive: true, force: true });
  }
  log("ok");
}

main().catch((err: unknown) => {
  console.error("handoff-smoke: FAILED", err);
  process.exit(1);
});
