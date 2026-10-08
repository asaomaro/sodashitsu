#!/usr/bin/env node
/**
 * `soda session stop`（20260927-session-stop）の起動確認。**ビルドした `dist/main.js`** を子プロセスで `soda serve --session smoke` として起動し、
 * 実物の `soda session stop smoke` で止めて、次を確かめてから後始末する（Linux/macOS。Windows では何もせず成功で終わる——非対応）:
 * - 動いていない名前付き session には終了コード 3 で、何も作らない（AC2）
 * - 動いている session は `soda session stop` で止まり（CLI は 0 と `soda: stopped session smoke`）、サーバは終了コード 0 で終わる。
 *   `soda session list` が stopped、`soda.lock` が無く、`session.json`・`session-history.json` がある（AC1）
 * - 止まった後の `soda session stop` は 3（AC16）
 * - 同じ引数で起動し直すと同じ pane があり、前回の画面（`--pane-history`）が戻る（AC1）
 * - 拡張（20261007-ext-host の AC13・AC14）: session の状態ディレクトリの `extensions.json` に登録した拡張（起動のたびに、自分の pid と孫の `sleep` の pid を記録する）が、
 *   `soda session stop` でサーバが止まった時点で、拡張と孫の pid が消えている（止めた直後に確かめる）。起動し直すと、新しい pid で動く
 * `main.ts` は単体テストできない（読み込むと起動する）ので、止める指示と停止の手順の配線はここで見る。pane のシェルは `/bin/sh`（印に `$((…))`）。
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeFrame, encodeInputFrame, FRAME_TYPE } from "@sodashitsu/protocol";
import WebSocket from "ws";

const MAIN = join(import.meta.dirname, "main.js");
const log = (msg: string): void => console.log(`stop-smoke: ${msg}`);

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

/** `process.kill(pid, 0)` が通るか（このファイルには、これまで `isAlive` に当たる関数が無かった）。 */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** 「生きていない」: `kill(pid, 0)` が失敗するか、Linux でゾンビ（PID 1 が孤児を回収しない環境で起きる）。 */
function isGone(pid: number): boolean {
  if (!isAlive(pid)) return true;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3) === "Z";
  } catch {
    return false;
  }
}

/** 拡張の起動の記録（1 行 = `<拡張の pid> <孫の pid>`）。 */
function extStarts(file: string): { ext: number; grand: number }[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [e, g] = l.split(" ").map(Number);
      return { ext: e!, grand: g! };
    });
}

/**
 * ビルドした `soda` を子で実行して終わりを待つ。**spawnSync は使わない**——このプロセスは `/ws` のクライアントを持っていて、同期で待つと
 * その間 WebSocket の閉じる握手に答えられず、サーバの `close()`（HTTP の待ち受けを閉じる）が繋がったままのクライアントを待って止まりきらない。
 */
function runSoda(
  args: string[],
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MAIN, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c: string) => (stdout += c));
    child.stderr.on("data", (c: string) => (stderr += c));
    const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
    child.on("error", reject);
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

/** 応答と pane の画面（SNAPSHOT と OUTPUT）を溜める最小のクライアント。 */
async function connect(port: number, cookie: string) {
  const origin = `http://127.0.0.1:${port}`;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
    headers: { cookie, origin, host: `127.0.0.1:${port}` },
  });
  const pending = new Map<string, (v: unknown) => void>();
  const screens = new Map<string, string>();
  ws.on("message", (data: Buffer, isBinary: boolean) => {
    if (isBinary) {
      const f = decodeFrame(new Uint8Array(data));
      if (f.type === FRAME_TYPE.OUTPUT)
        screens.set(f.paneId, (screens.get(f.paneId) ?? "") + new TextDecoder().decode(f.chunk));
      if (f.type === FRAME_TYPE.SNAPSHOT)
        screens.set(f.paneId, (screens.get(f.paneId) ?? "") + f.text);
      return;
    }
    const msg = JSON.parse(data.toString("utf8")) as { id?: string; result?: unknown };
    if (msg.id !== undefined) pending.get(msg.id)?.(msg.result);
  });
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
    ws.once("unexpected-response", (_req, res) =>
      reject(new Error(`/ws rejected: HTTP ${res.statusCode}`)),
    );
  });
  let nextId = 1;
  return {
    ws,
    screen: (paneId: string) => screens.get(paneId) ?? "",
    request(method: string, params: unknown): Promise<unknown> {
      const id = String(nextId++);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timed out: ${method}`)), 10_000);
        pending.set(id, (v) => {
          clearTimeout(timer);
          resolve(v);
        });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    type(paneId: string, text: string): void {
      ws.send(encodeInputFrame(paneId, new TextEncoder().encode(text)));
    },
  };
}

interface Serve {
  child: ChildProcess;
  out: () => string;
  exited: Promise<number | null>;
}

function startServe(stateDir: string, port: number): Serve {
  const child = spawn(
    process.execPath,
    [
      MAIN,
      "serve",
      "--state-dir",
      stateDir,
      "--session",
      "smoke",
      "--port",
      String(port),
      "--host",
      "127.0.0.1",
      "--shell",
      "/bin/sh",
      "--pane-history",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let out = "";
  child.stdout!.setEncoding("utf8");
  child.stderr!.setEncoding("utf8");
  child.stdout!.on("data", (c: string) => (out += c));
  child.stderr!.on("data", (c: string) => (out += c));
  const exited = new Promise<number | null>((resolve) =>
    child.once("exit", (code) => resolve(code)),
  );
  return { child, out: () => out, exited };
}

async function login(port: number, token: string): Promise<string> {
  const origin = `http://127.0.0.1:${port}`;
  const res = await fetch(`${origin}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
    body: JSON.stringify({ token }),
  });
  if (res.status !== 204) throw new Error(`login failed: HTTP ${res.status}`);
  return res.headers.get("set-cookie")!.split(";")[0]!;
}

/** 子のサーバを止める。SIGTERM で止まらず SIGKILL に落ちたら true（pane のシェルが残りうる）。 */
async function stopChild(s: Serve | undefined): Promise<boolean> {
  if (s === undefined || s.child.exitCode !== null || s.child.signalCode !== null) return false;
  s.child.kill("SIGTERM");
  await Promise.race([s.exited, new Promise((r) => setTimeout(r, 10_000).unref())]);
  if (s.child.exitCode !== null || s.child.signalCode !== null) return false;
  s.child.kill("SIGKILL");
  return true;
}

async function main(): Promise<void> {
  if (process.platform === "win32") {
    log("skipped (soda session stop is not supported on Windows)");
    return;
  }
  const stateDir = await mkdtemp(join(tmpdir(), "soda-stop-smoke-"));
  const sessionDir = join(stateDir, "sessions", "smoke");
  const extDir = await mkdtemp(join(tmpdir(), "soda-stop-smoke-ext-"));
  const extMarks = join(extDir, "starts.txt");
  const extPidsSeen: number[] = [];
  let first: Serve | undefined;
  let second: Serve | undefined;
  /** 印を打った pane のシェル（後始末でサーバが止めきれなかったときに残さない）。 */
  let shellPid: number | undefined;
  try {
    // 1. 動いていない名前付き session（AC2）
    mkdirSync(sessionDir, { recursive: true });
    const idle = await runSoda(["session", "stop", "smoke", "--state-dir", stateDir]);
    if (idle.status !== 3 || !idle.stderr.includes("session smoke is not running"))
      throw new Error(`expected exit 3 when not running, got ${idle.status}: ${idle.stderr}`);
    if (readdirSync(sessionDir).length !== 0)
      throw new Error(`soda session stop created files: ${readdirSync(sessionDir).join(",")}`);
    log("not running → exit 3, nothing created ok");

    // 1b. 拡張を登録する（session の状態ディレクトリ）。起動のたびに、自分の pid と孫の `sleep` の pid を記録し、標準入力が閉じたら終わる。
    const extScript = join(extDir, "ext.mjs");
    await writeFile(
      extScript,
      `import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
const g = spawn("sleep", ["300"], { stdio: "ignore" });
appendFileSync(process.argv[2], process.pid + " " + g.pid + "\\n");
process.stdin.on("end", () => process.exit(0));
process.stdin.resume();
`,
    );
    await writeFile(
      join(sessionDir, "extensions.json"),
      JSON.stringify({ extensions: [{ id: "smoke", command: `"${process.execPath}" "${extScript}" "${extMarks}"` }] }),
      { mode: 0o600 },
    );

    // 2. 起動し、pane に印を打つ
    const port = await freePort();
    first = startServe(stateDir, port);
    const f = first;
    const token = await until("server start", () => {
      if (f.child.exitCode !== null || f.child.signalCode !== null)
        throw new Error(`the server exited while starting:\n${f.out()}`);
      return /#token=([A-Za-z0-9_-]+)/.exec(f.out())?.[1];
    });
    const c1 = await connect(port, await login(port, token));
    const hello = (await c1.request("client.hello", { protocol: 1, kind: "desktop" })) as {
      snapshot: { panes: { id: string }[] };
    };
    // 2 つ目の workspace を作り、その pane（最初の起動の既定の pane とは別の id）に印を打つ——起動し直して同じ id が在れば、session.json から
    // 戻った（新しく始めた起動では最初の pane の id しかできない）。
    const created = (await c1.request("workspace.create", {
      cwd: tmpdir(),
      label: "stop-smoke",
    })) as {
      pane: { id: string };
    };
    const paneId = created.pane.id;
    if (hello.snapshot.panes.some((p) => p.id === paneId))
      throw new Error(`the new pane reused an existing id: ${paneId}`);
    await c1.request("pane.subscribe", { paneId, scrollbackLines: 200 });
    c1.type(paneId, "echo SHELL-PID-$$; echo STOP-SMOKE-$((6*7))\n");
    await until("marker echoed", () =>
      c1.screen(paneId).includes("STOP-SMOKE-42") ? true : undefined,
    );
    shellPid = Number(/SHELL-PID-(\d+)/.exec(c1.screen(paneId))?.[1]);
    log(`started: pid ${first.child.pid}, pane ${paneId}, marker shown`);
    const ext1 = await until("extension started", () => (extStarts(extMarks).length >= 1 ? extStarts(extMarks)[0] : undefined), 15_000);
    extPidsSeen.push(ext1.ext, ext1.grand);
    if (isGone(ext1.ext) || isGone(ext1.grand)) throw new Error(`the extension or its child is not alive: ${JSON.stringify(ext1)}`);

    // 3. 止める（AC1）
    const stop = await runSoda(["session", "stop", "smoke", "--state-dir", stateDir]);
    if (stop.status !== 0 || stop.stdout.trim() !== "soda: stopped session smoke")
      throw new Error(
        `soda session stop failed (exit ${stop.status}): ${stop.stdout} ${stop.stderr}\n--- server ---\n${first.out()}`,
      );
    const code = await Promise.race([
      first.exited,
      new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 10_000).unref()),
    ]);
    if (code !== 0) throw new Error(`the server exited with ${code} (expected 0):\n${first.out()}`);
    if (!first.out().includes("soda: stop requested (soda session stop), shutting down"))
      throw new Error(`the server did not log the stop request:\n${first.out()}`);
    const list = await runSoda(["session", "list", "--state-dir", stateDir]);
    if (!/^smoke\s+stopped\s/m.test(list.stdout))
      throw new Error(`soda session list does not show smoke as stopped:\n${list.stdout}`);
    if (existsSync(join(sessionDir, "soda.lock"))) throw new Error("soda.lock was left behind");
    for (const file of ["session.json", "session-history.json"])
      if (!existsSync(join(sessionDir, file))) throw new Error(`${file} was not written`);
    c1.ws.close();
    log("stopped: CLI exit 0, server exit 0, list shows stopped, lock released, state saved ok");
    // 拡張と孫は、サーバが止まった時点で消えている（pid の再利用を避けるため、止めた直後に確かめる）。
    if (!isGone(ext1.ext) || !isGone(ext1.grand)) throw new Error(`the extension or its child outlived the server: ${JSON.stringify(ext1)}`);
    log(`extension ${ext1.ext} and its child ${ext1.grand} are gone after the stop ok`);

    // 4. 止まった後（AC16）
    const again = await runSoda(["session", "stop", "smoke", "--state-dir", stateDir]);
    if (again.status !== 3) throw new Error(`expected exit 3 after stopping, got ${again.status}`);
    log("stopped → exit 3 ok");

    // 5. 起動し直すと同じ pane と前回の画面が戻る（AC1）
    second = startServe(stateDir, port);
    const s = second;
    await until("server restart", () => {
      if (s.child.exitCode !== null || s.child.signalCode !== null)
        throw new Error(`the server exited while restarting:\n${s.out()}`);
      return s.out().includes(`:${port}`) ? true : undefined;
    });
    let lastError: unknown;
    const c2 = await until("reconnect", async () => {
      try {
        return await connect(port, await login(port, token));
      } catch (err) {
        lastError = err;
        return undefined;
      }
    }).catch((err: unknown) => {
      throw new Error(`${String(err)} (last error: ${String(lastError)})`);
    });
    const hello2 = (await c2.request("client.hello", { protocol: 1, kind: "desktop" })) as {
      snapshot: { panes: { id: string }[] };
    };
    if (!hello2.snapshot.panes.some((p) => p.id === paneId))
      throw new Error(`pane ${paneId} is missing after restarting`);
    await c2.request("pane.subscribe", { paneId, scrollbackLines: 200 });
    await until(
      "previous screen after restart",
      () => (c2.screen(paneId).includes("STOP-SMOKE-42") ? true : undefined),
      5000,
    );
    c2.ws.close();
    log("restarted: same pane, previous screen restored ok");
    // 起動し直すと、拡張は新しい pid で動く。止めると、また消える。
    const ext2 = await until("extension restarted", () => (extStarts(extMarks).length >= 2 ? extStarts(extMarks)[1] : undefined), 15_000);
    extPidsSeen.push(ext2.ext, ext2.grand);
    if (ext2.ext === ext1.ext || ext2.grand === ext1.grand) throw new Error(`the extension was not restarted with new pids: ${JSON.stringify({ ext1, ext2 })}`);
    await stopChild(second);
    if (!isGone(ext2.ext) || !isGone(ext2.grand)) throw new Error(`the restarted extension or its child outlived the server: ${JSON.stringify(ext2)}`);
    log("extension restarted with new pids and gone after the second stop ok");
  } finally {
    const forced = [await stopChild(first), await stopChild(second)].includes(true);
    // サーバを SIGKILL で止めたときだけ（シェルが残りうる）。普段はサーバが止まった時点でシェルも終わっていて、その pid は別のプロセスに
    // 再利用されうるので送らない（この work が避けたい pid の取り違えそのもの）。
    if (forced && shellPid !== undefined && !Number.isNaN(shellPid)) {
      try {
        process.kill(shellPid, 0);
        process.kill(shellPid, "SIGKILL"); // サーバが止めきれずに残った（普段は止まった時点で終わっている）
      } catch {
        // 終わっている。
      }
    }
    // 拡張と孫を、残さない（失敗した場合の後始末）。
    for (const pid of extPidsSeen) {
      if (!isGone(pid)) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // 既に終わっている。
        }
      }
    }
    await rm(stateDir, { recursive: true, force: true });
    await rm(extDir, { recursive: true, force: true });
  }
  log("ok");
}

main().catch((err: unknown) => {
  console.error("stop-smoke: FAILED", err);
  process.exit(1);
});
