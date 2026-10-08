#!/usr/bin/env node
/**
 * 更新時の引き継ぎ（live handoff。20260926-live-handoff）の起動確認。**ビルドした `dist/main.js`** を子プロセスで `soda serve` として起動し、
 * 実物の `soda handoff` で入れ替えて、次を確かめてから後始末する（Linux/macOS。Windows では何もせず成功で終わる——非対応）:
 * - 動いていないとき `soda handoff` は終了コード 3 で、何も作らない（AC12）
 * - 入れ替えの前後でサーバの pid が同じ・pane の id とシェルの pid が同じ（AC1）
 * - 前の画面の印が、入れ替えの後に繋いだクライアントの SNAPSHOT に入っている（AC3）
 * - 入れ替えの後も同じ Cookie で `/ws` に繋がり（AC5）、入力がシェルに届き出力が返り、大きさの変更がシェルに見える（AC2）
 * - `handoff.json` が残らない（AC8）・シェルが終わると pane が閉じる（AC7）
 * - 入れ替えの後、handoff より前からある pane の環境（`SODA_PANE_SOCKET` が無く `SODA_AGENT_REPORT_SOCKET` だけ）でも、ビルドした `sodactl ask` が
 *   ログインなしで通る（20261003-sodactl-ask-socket の AC11。新しい版が置き直した `pane.sock` を、同じ状態ディレクトリから導く）
 * - 表示の面（20261007-soda-extensions の AC24）: 入れ替えの前に出した面は消え、待っていた `sodactl display events` は終わらずに `display.reset` を出す。
 *   `display list` は空で、出し直すと見え、`display close` すると待ち続けている `events` に `display.closed` が届く。サーバを止めると `display.end`（connection_closed）・終了コード 1
 * - 拡張（20261007-ext-host の AC14・不確かな点 2）: 状態ディレクトリの `extensions.json` に登録した拡張（起動のたびに、自分の pid と孫の `sleep` の pid を記録する）が、
 *   入れ替えの前に動いていて、入れ替えの後は**前の拡張と孫の pid が消えていて、新しい pid で動いている**。サーバを止めると、その拡張と孫も消える
 * pane のシェルは `/bin/sh`（`--shell`）——印に `$$`・`$((…))` を使うため。
 * vitest の中では確かめられない（execve の先の新しい版がビルドした成果物であるため。tasks.md「実装方針」）。
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeFrame, encodeInputFrame, FRAME_TYPE } from "@sodashitsu/protocol";
import WebSocket from "ws";

const MAIN = join(import.meta.dirname, "main.js");
/** ビルドした sodactl（`packages/cli/dist/main.js`。この smoke は `packages/server/dist/` にある）。 */
const SODACTL_MAIN = join(import.meta.dirname, "..", "..", "cli", "dist", "main.js");
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

/**
 * 失敗した場合の後始末: 拡張（プロセスのグループの先頭）のグループごと止める。記録した pid へ直に SIGKILL を送らない（pid の再利用で別のプロセスを殺す窓を避ける）。
 * 先頭がまだ居るなら、コマンドラインに自分の一時ディレクトリが入っているものだけ。先頭が居ないとき、グループが残っていれば（POSIX: 残りがいる間、その番号は再利用されない）それは自分のもの。
 */
function killOurGroup(leaderPid: number, dir: string): void {
  if (!isGone(leaderPid)) {
    try {
      if (!readFileSync(`/proc/${leaderPid}/cmdline`, "utf8").includes(dir)) return;
    } catch {
      return;
    }
  }
  try {
    process.kill(-leaderPid, "SIGKILL");
  } catch {
    // グループが無い（もう居ない）
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

function runSoda(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [MAIN, ...args], { encoding: "utf8", timeout: 60_000 });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** ビルドした `sodactl ask` に定義を標準入力で渡して呼ぶ。 */
function runSodactlAsk(env: NodeJS.ProcessEnv): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const spec = JSON.stringify({
    title: "handoff-smoke",
    questions: [{ id: "a", label: "A", options: ["x", "y"] }],
  });
  const r = spawnSync(process.execPath, [SODACTL_MAIN, "ask"], {
    env,
    input: spec,
    encoding: "utf8",
    timeout: 30_000,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** ビルドした `sodactl <args>`（標準入力なし）を同期で呼ぶ。 */
function runSodactl(env: NodeJS.ProcessEnv, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [SODACTL_MAIN, ...args], { env, encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** 出し続ける `sodactl display events` を子プロセスで動かす（stdout の行を溜め、終わったら終了コードを返す）。 */
function spawnDisplayEvents(env: NodeJS.ProcessEnv): { lines: Record<string, unknown>[]; exited: Promise<number | null>; child: ChildProcess; stderr: () => string } {
  const child = spawn(process.execPath, [SODACTL_MAIN, "display", "events"], { env, stdio: ["ignore", "pipe", "pipe"] });
  const lines: Record<string, unknown>[] = [];
  let err = "";
  let buf = "";
  child.stdout!.setEncoding("utf8");
  child.stderr!.setEncoding("utf8");
  child.stdout!.on("data", (c: string) => {
    buf += c;
    for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      try {
        lines.push(JSON.parse(line) as Record<string, unknown>);
      } catch {
        // 行でないものは数えない。
      }
    }
  });
  child.stderr!.on("data", (c: string) => (err += c));
  const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));
  return { lines, exited, child, stderr: () => err };
}

async function main(): Promise<void> {
  if (process.platform === "win32") {
    log("skipped (live handoff is not supported on Windows)");
    return;
  }
  const stateDir = await mkdtemp(join(tmpdir(), "soda-handoff-smoke-"));
  /** セッションのキャッシュの無い HOME（`sodactl ask` をログインなしで呼ぶ）。 */
  const homeDir = await mkdtemp(join(tmpdir(), "soda-handoff-smoke-home-"));
  /** 拡張のスクリプトと、起動の記録を置く場所。 */
  const extDir = await mkdtemp(join(tmpdir(), "soda-handoff-smoke-ext-"));
  const extMarks = join(extDir, "starts.txt");
  let server: ChildProcess | undefined;
  let shellPid: number | undefined;
  let serverOut = "";
  const extPidsSeen: number[] = [];
  try {
    // 1. 動いていないとき（AC12）
    const idle = runSoda(["handoff", "--state-dir", stateDir]);
    if (idle.status !== 3)
      throw new Error(`expected exit 3 when not running, got ${idle.status}: ${idle.stderr}`);
    if (readdirSync(stateDir).length !== 0)
      throw new Error(
        `soda handoff created files while no server ran: ${readdirSync(stateDir).join(",")}`,
      );
    log("not running → exit 3, nothing created ok");

    // 1b. 拡張を登録する（20261007-ext-host）。起動のたびに、自分の pid と孫の `sleep` の pid を記録し、標準入力が閉じたら終わる。
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
      join(stateDir, "extensions.json"),
      JSON.stringify({ extensions: [{ id: "smoke", command: `"${process.execPath}" "${extScript}" "${extMarks}"` }] }),
      { mode: 0o600 },
    );

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

    // 3b. 表示の面（20261007-soda-extensions の AC24）。ログインなし（受け口の経路）で面を出し、`sodactl display events` を待たせておく。
    const displayEnv: NodeJS.ProcessEnv = { ...process.env, HOME: homeDir, USERPROFILE: homeDir, SODA_PANE_ID: paneId, SODA_SERVER_URL: origin, SODA_PANE_SOCKET: join(stateDir, "pane.sock") };
    for (const name of ["SODA_AGENT_REPORT_SOCKET", "SODACTL_TOKEN", "SODACTL_URL"]) delete displayEnv[name];
    const setBefore = runSodactl(displayEnv, ["display", "set", "before", "--kind", "panel", "--text", "hello"]);
    if (setBefore.status !== 0 || (JSON.parse(setBefore.stdout.trim()) as { status?: unknown }).status !== "ok")
      throw new Error(`sodactl display set (before the handoff) failed (exit ${setBefore.status}): ${setBefore.stdout} ${setBefore.stderr}`);
    const events = spawnDisplayEvents(displayEnv);
    await until("display events ready", () => (events.lines.some((l) => l["type"] === "display.ready") ? true : undefined), 10_000);
    log("sodactl display set / events without a login (pane socket) ok");

    // 3c. 拡張が動いている（記録が 1 行）。
    const extBefore = await until("extension started before the handoff", () => (extStarts(extMarks).length >= 1 ? extStarts(extMarks)[0] : undefined), 15_000);
    extPidsSeen.push(extBefore.ext);
    if (!isAlive(extBefore.ext) || !isAlive(extBefore.grand)) throw new Error(`the extension or its child is not alive before the handoff: ${JSON.stringify(extBefore)}`);
    log(`extension running before the handoff: pid ${extBefore.ext}, child ${extBefore.grand}`);

    // 4. 入れ替え
    const handoff = runSoda(["handoff", "--state-dir", stateDir]);
    if (
      handoff.status !== 0 ||
      !handoff.stdout.includes("handoff complete: 1 pane(s) kept running")
    ) {
      throw new Error(
        `soda handoff failed (exit ${handoff.status}): ${handoff.stdout} ${handoff.stderr}\n--- server ---\n${serverOut}`,
      );
    }
    log(`soda handoff → exit 0: ${handoff.stdout.trim().split("\n").pop()}`);
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

    // 5b. 表示の面は入れ替えで消え、待っていた `sodactl display events` は終わらずに `display.reset` を出す（AC24）。
    await until("display.reset after the handoff", () => (events.lines.some((l) => l["type"] === "display.reset") ? true : undefined), 15_000);
    if (events.child.exitCode !== null) throw new Error(`sodactl display events ended across the handoff: ${events.stderr()}`);
    const listAfter = runSodactl(displayEnv, ["display", "list"]);
    const listed = JSON.parse(listAfter.stdout.trim()) as { status?: unknown; displays?: unknown[] };
    if (listAfter.status !== 0 || listed.status !== "ok" || (listed.displays ?? []).length !== 0)
      throw new Error(`display list after the handoff should be empty (exit ${listAfter.status}): ${listAfter.stdout} ${listAfter.stderr}`);
    const setAfter = runSodactl(displayEnv, ["display", "set", "after", "--kind", "band", "--text", "again"]);
    if (setAfter.status !== 0) throw new Error(`display set after the handoff failed: ${setAfter.stdout} ${setAfter.stderr}`);
    const listAfter2 = JSON.parse(runSodactl(displayEnv, ["display", "list"]).stdout.trim()) as { displays?: { name: string }[] };
    if (listAfter2.displays?.length !== 1 || listAfter2.displays[0]!.name !== "after") throw new Error(`display list should show the re-set display: ${JSON.stringify(listAfter2)}`);
    const closeAfter = runSodactl(displayEnv, ["display", "close", "after"]);
    if (closeAfter.status !== 0) throw new Error(`display close failed: ${closeAfter.stdout} ${closeAfter.stderr}`);
    await until("display.closed on the waiting events", () => (events.lines.some((l) => l["type"] === "display.closed" && l["reason"] === "closed" && l["name"] === "after") ? true : undefined), 10_000);
    log("display events survived the handoff (display.reset), list was empty, re-set and close reach the waiting events ok");

    // 5c. 拡張（AC14・u2）: 前の拡張と孫は消えていて、新しい pid で動いている。
    const extAfter = await until("extension restarted after the handoff", () => (extStarts(extMarks).length >= 2 ? extStarts(extMarks)[1] : undefined), 15_000);
    extPidsSeen.push(extAfter.ext);
    await until("the previous extension and its child are gone", () => (isGone(extBefore.ext) && isGone(extBefore.grand) ? true : undefined), 10_000);
    if (extAfter.ext === extBefore.ext || extAfter.grand === extBefore.grand) throw new Error(`the extension was not restarted with new pids: ${JSON.stringify({ extBefore, extAfter })}`);
    if (isGone(extAfter.ext) || isGone(extAfter.grand)) throw new Error(`the new extension or its child is not alive: ${JSON.stringify(extAfter)}`);
    if (extStarts(extMarks).length !== 2) throw new Error(`the extension was started ${extStarts(extMarks).length} times (expected 2)`);
    log(`extension replaced across the handoff: ${extBefore.ext}/${extBefore.grand} gone, new ${extAfter.ext}/${extAfter.grand} running ok`);

    // 6b. handoff より前からある pane の環境で、ログインなしの `sodactl ask`（20261003-sodactl-ask-socket の AC11）。
    // 古い版が起動した pane には `SODA_PANE_SOCKET` が無く、`SODA_AGENT_REPORT_SOCKET` だけがある。sodactl は同じ状態ディレクトリの `pane.sock` を導く。
    // 画面（`ask.subscribe` したクライアント）は居ないので、受け口を通れば `unavailable`・終了コード 0。
    if (!existsSync(join(stateDir, "pane.sock")))
      throw new Error("pane.sock is missing after the handoff");
    // この smoke を soda の pane の中で走らせても、その pane のサーバ（開発者の本物のサーバ）の受け口・token・接続先を子へ渡さない。
    const oldPaneEnv: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: homeDir,
      USERPROFILE: homeDir,
      SODA_PANE_ID: paneId,
      SODA_SERVER_URL: origin,
    };
    for (const name of [
      "SODA_PANE_SOCKET",
      "SODA_AGENT_REPORT_SOCKET",
      "SODACTL_TOKEN",
      "SODACTL_URL",
    ])
      delete oldPaneEnv[name];
    // 陰性対照: 受け口のパスを導けなければログインが要る（下の成功が、どこかに残ったログインによるものではない）。
    const noSocket = runSodactlAsk(oldPaneEnv);
    if (noSocket.status !== 1 || !noSocket.stderr.includes("unauthenticated"))
      throw new Error(
        `sodactl ask without a login and a socket should be unauthenticated (exit ${noSocket.status}): ${noSocket.stdout} ${noSocket.stderr}`,
      );
    const asked = runSodactlAsk({
      ...oldPaneEnv,
      SODA_AGENT_REPORT_SOCKET: join(stateDir, "agent-report.sock"),
    });
    let askedStatus: unknown;
    try {
      askedStatus = (JSON.parse(asked.stdout.trim()) as { status?: unknown }).status;
    } catch {
      askedStatus = undefined;
    }
    if (asked.status !== 0 || askedStatus !== "unavailable")
      throw new Error(
        `sodactl ask in a pre-handoff pane environment returned exit ${asked.status}: ${asked.stdout} ${asked.stderr}\n--- server ---\n${serverOut}`,
      );
    log(
      "sodactl ask without a login in a pre-handoff pane environment (SODA_AGENT_REPORT_SOCKET only) → unavailable, exit 0 ok",
    );

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
    // 8. サーバを止めると、待っていた `sodactl display events` は繋ぎ直しが尽きて `display.end`（connection_closed）を出し、終了コード 1 で終わる（AC24）。
    // 最初の pane は閉じたので、新しい workspace の pane で試す。
    const created = (await after.c.request("workspace.create", {})) as { pane: { id: string } };
    const stopEnv = { ...displayEnv, SODA_PANE_ID: created.pane.id };
    const stopEvents = spawnDisplayEvents(stopEnv);
    await until("display events ready (second pane)", () => (stopEvents.lines.some((l) => l["type"] === "display.ready") ? true : undefined), 10_000);
    after.ws.close();
    server.kill("SIGTERM");
    const stopCode = await Promise.race([stopEvents.exited, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("display events did not end after the server stopped")), 20_000))]);
    const last = stopEvents.lines.at(-1);
    if (stopCode !== 1 || last?.["type"] !== "display.end" || last["reason"] !== "connection_closed")
      throw new Error(`display events after the server stopped: exit ${stopCode}, last line ${JSON.stringify(last)}, stderr ${stopEvents.stderr()}`);
    log("display events after the server stopped → display.end (connection_closed), exit 1 ok");
    // 9. サーバが止まると、拡張と孫も消える（AC13・AC14）。
    await until("the server exits", () => (server!.exitCode !== null || serverExited ? true : undefined), 20_000);
    await until("the extension and its child are gone after the server stopped", () => (isGone(extAfter.ext) && isGone(extAfter.grand) ? true : undefined), 10_000);
    log("extension and its child gone after the server stopped ok");
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
    // 拡張と孫を、残さない（失敗した場合の後始末。生きていれば止める）。
    for (const leader of extPidsSeen) killOurGroup(leader, extDir);
    await rm(stateDir, { recursive: true, force: true });
    await rm(homeDir, { recursive: true, force: true });
    await rm(extDir, { recursive: true, force: true });
  }
  log("ok");
}

main().catch((err: unknown) => {
  console.error("handoff-smoke: FAILED", err);
  process.exit(1);
});
