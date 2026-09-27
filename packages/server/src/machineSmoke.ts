#!/usr/bin/env node
/**
 * 保存した SSH のマシン（20260927-multi-host-machines の AC17）の起動確認。**ビルドした `dist/main.js`** を子プロセスで起動し、2 つの状態ディレクトリを
 * 「手元」「リモート」に見立てて通しで確かめ、後始末する（Linux/macOS。Windows では何もせず成功で終わる——中継の受け口が無い）:
 * - 偽の `ssh`（一時ディレクトリの実行可能なスクリプトを `PATH` の先頭に置く）: 渡された引数を記録し、`--` までを読み飛ばして宛先を捨て、続く
 *   `wtm bridge [...]` を `node <dist/main.js> bridge [...] --state-dir <リモートの根>` として実行する（本物の `wtm bridge` の子プロセス・標準入出力の素通し・
 *   リモートの `bridge.sock` を通る）
 * - `wtm machine add` が確かめてから保存し（0）、`wtm machine list` に出る
 * - 手元の `wtm serve` が登録簿を読んで繋ぎ（`machine.list` が online）、`/ws?machine=<名前>` 越しに `client.hello`・`workspace.create`・echo の往復が
 *   リモートの `wtm serve` に届く（手元には作らない）
 * - 偽の `ssh` が受けた引数に `BatchMode=yes`・`--`・宛先・`wtm bridge` がある
 * `main.ts` は単体テストできない（読み込むと起動する）ので、`wtm machine`・`wtm bridge`・`wtm serve` のマシンの配線はここで見る。
 */
import { spawn, type ChildProcess } from "node:child_process";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { decodeFrame, encodeInputFrame, FRAME_TYPE } from "@wtm/protocol";
import WebSocket from "ws";

const MAIN = join(import.meta.dirname, "main.js");
const log = (msg: string): void => console.log(`machine-smoke: ${msg}`);

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
  timeoutMs = 20_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v !== undefined) return v;
    if (Date.now() > deadline) throw new Error(`timed out: ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

interface Serve {
  child: ChildProcess;
  out: () => string;
  exited: Promise<number | null>;
}

function startServe(stateDir: string, port: number, env: NodeJS.ProcessEnv): Serve {
  const child = spawn(
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
      env,
    },
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

/** 子の wtm を実行して終わりを待つ（spawnSync は使わない——`/ws` のクライアントの閉じる握手に答えられなくなる。stopSmoke と同じ）。 */
function runWtm(
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MAIN, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });
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

async function connect(port: number, cookie: string, query = "") {
  const origin = `http://127.0.0.1:${port}`;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws${query}`, {
    headers: { cookie, origin, host: `127.0.0.1:${port}` },
  });
  const pending = new Map<string, (v: { result?: unknown; error?: { code: string } }) => void>();
  let screen = "";
  ws.on("message", (data: Buffer, isBinary: boolean) => {
    if (isBinary) {
      const f = decodeFrame(new Uint8Array(data));
      if (f.type === FRAME_TYPE.OUTPUT) screen += new TextDecoder().decode(f.chunk);
      if (f.type === FRAME_TYPE.SNAPSHOT) screen += f.text;
      return;
    }
    const msg = JSON.parse(data.toString("utf8")) as {
      id?: string;
      result?: unknown;
      error?: { code: string };
    };
    if (msg.id !== undefined) pending.get(msg.id)?.(msg);
  });
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
    ws.once("unexpected-response", (_req, res) =>
      reject(new Error(`/ws${query} rejected: HTTP ${res.statusCode}`)),
    );
  });
  let nextId = 1;
  return {
    ws,
    screen: () => screen,
    request<T>(method: string, params: unknown): Promise<T> {
      const id = String(nextId++);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timed out: ${method}`)), 10_000);
        pending.set(id, (m) => {
          clearTimeout(timer);
          if (m.error) reject(new Error(`${method}: ${m.error.code}`));
          else resolve(m.result as T);
        });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

async function stopChild(s: Serve | undefined): Promise<void> {
  if (s === undefined || s.child.exitCode !== null || s.child.signalCode !== null) return;
  s.child.kill("SIGTERM");
  await Promise.race([s.exited, new Promise((r) => setTimeout(r, 10_000).unref())]);
  if (s.child.exitCode === null && s.child.signalCode === null) s.child.kill("SIGKILL");
}

const FAKE_SSH = `#!/bin/sh
# 20260927-multi-host-machines の machineSmoke の偽の ssh。引数を記録し、-- までを読み飛ばして宛先を捨て、wtm bridge をこのマシンで実行する。
printf '%s\\n' "$@" > "$WTM_SMOKE_SSH_ARGS"
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--" ]; then shift; break; fi
  shift
done
shift
if [ "$1" != "wtm" ]; then echo "unexpected remote command: $*" >&2; exit 97; fi
shift
exec "$WTM_SMOKE_NODE" "$WTM_SMOKE_MAIN" "$@" --state-dir "$WTM_SMOKE_REMOTE_ROOT"
`;

async function main(): Promise<void> {
  if (process.platform === "win32") {
    log("skipped (the bridge socket is not supported on Windows)");
    return;
  }
  const root = await mkdtemp(join(tmpdir(), "wtm-machine-smoke-"));
  const localRoot = join(root, "local");
  const remoteRoot = join(root, "remote");
  const bin = join(root, "bin");
  const argsFile = join(root, "ssh-args.txt");
  let remote: Serve | undefined;
  let local: Serve | undefined;
  /** リモートに作った pane のシェル（後始末でサーバが止めきれなかったときに残さない。stopSmoke と同じ）。 */
  let shellPid: number | undefined;
  try {
    for (const d of [localRoot, remoteRoot, bin]) await mkdir(d, { recursive: true });
    writeFileSync(join(bin, "ssh"), FAKE_SSH);
    chmodSync(join(bin, "ssh"), 0o755);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env["PATH"] ?? ""}`,
      WTM_SMOKE_NODE: process.execPath,
      WTM_SMOKE_MAIN: MAIN,
      WTM_SMOKE_REMOTE_ROOT: remoteRoot,
      WTM_SMOKE_SSH_ARGS: argsFile,
    };
    delete env["WTM_SESSION"];

    // 1. リモートの wtm serve
    const remotePort = await freePort();
    remote = startServe(remoteRoot, remotePort, env);
    const r = remote;
    const remoteToken = await until("remote server start", () => {
      if (r.child.exitCode !== null) throw new Error(`the remote server exited:\n${r.out()}`);
      return /#token=([A-Za-z0-9_-]+)/.exec(r.out())?.[1];
    });
    log(`remote wtm serve started (pid ${remote.child.pid})`);

    // 2. wtm machine add（確かめてから保存）・list
    const add = await runWtm(
      ["machine", "add", "you@remote-box", "--label", "Remote", "--state-dir", localRoot],
      env,
    );
    if (add.status !== 0 || !/saved machine [0-9a-f]{32} \(Remote\)/.test(add.stdout))
      throw new Error(`wtm machine add failed (exit ${add.status}):\n${add.stdout}${add.stderr}`);
    const sshArgs = readFileSync(argsFile, "utf8")
      .split("\n")
      .filter((a) => a.length > 0);
    const dd = sshArgs.indexOf("--");
    if (
      !sshArgs.includes("BatchMode=yes") ||
      dd < 0 ||
      sshArgs.slice(dd + 1).join(" ") !== "you@remote-box wtm bridge"
    )
      throw new Error(`unexpected ssh arguments: ${sshArgs.join(" ")}`);
    const list = await runWtm(["machine", "list", "--state-dir", localRoot], env);
    if (list.status !== 0 || !/\tRemote\tyou@remote-box\tdefault\tenabled/.test(list.stdout))
      throw new Error(`wtm machine list: ${list.stdout}${list.stderr}`);
    log("wtm machine add (probed over the fake ssh) and list ok");

    // 3. 手元の wtm serve が繋ぐ
    const localPort = await freePort();
    local = startServe(localRoot, localPort, env);
    const l = local;
    const token = await until("local server start", () => {
      if (l.child.exitCode !== null) throw new Error(`the local server exited:\n${l.out()}`);
      return /#token=([A-Za-z0-9_-]+)/.exec(l.out())?.[1];
    });
    const cookie = await login(localPort, token);
    const home = await connect(localPort, cookie);
    await home.request("client.hello", { protocol: 1, kind: "external" });
    await until("machine online", async () => {
      const res = await home.request<{
        machines: { label: string; state: string; message: string | null }[];
      }>("machine.list", {});
      return res.machines[0]?.state === "online" ? true : undefined;
    });
    log("local wtm serve connected to the remote machine (machine.list: online)");

    // 4. /ws?machine= 越しの通信
    const via = await connect(localPort, cookie, "?machine=Remote");
    const hello = await via.request<{ snapshot: { host: { hostname: string } } }>("client.hello", {
      protocol: 1,
      kind: "desktop",
    });
    const created = await via.request<{ workspace: { id: string }; pane: { id: string } }>(
      "workspace.create",
      { cwd: tmpdir(), label: "machine-smoke" },
    );
    await via.request("pane.subscribe", { paneId: created.pane.id, scrollbackLines: 100 });
    via.ws.send(
      encodeInputFrame(
        created.pane.id,
        new TextEncoder().encode("echo SHELL-PID-$$; echo MACHINE-SMOKE-$((6*7))\n"),
      ),
    );
    await until("echo over the relay", () =>
      via.screen().includes("MACHINE-SMOKE-42") ? true : undefined,
    );
    shellPid = Number(/SHELL-PID-(\d+)/.exec(via.screen())?.[1]);
    // リモートの wtm serve に直接繋いで、そこに作られたことを確かめる（中継を通ったことの肯定側）。
    const direct = await connect(remotePort, await login(remotePort, remoteToken));
    const remoteSnap = await direct.request<{
      snapshot: { workspaces: { id: string; label: string }[] };
    }>("client.hello", { protocol: 1, kind: "external" });
    if (
      !remoteSnap.snapshot.workspaces.some(
        (w) => w.id === created.workspace.id && w.label === "machine-smoke",
      )
    )
      throw new Error("the workspace created over the relay is not on the remote server");
    direct.ws.close();
    const localSnap = await home.request<{ snapshot: { workspaces: { label: string }[] } }>(
      "client.hello",
      { protocol: 1, kind: "external" },
    );
    if (localSnap.snapshot.workspaces.some((w) => w.label === "machine-smoke"))
      throw new Error("the workspace was created on the local server");
    log(
      `relay ok: hello (hostname ${hello.snapshot.host.hostname}), workspace.create and echo reached the remote wtm serve`,
    );
    via.ws.close();
    home.ws.close();
  } finally {
    await stopChild(local);
    await stopChild(remote);
    if (shellPid !== undefined && Number.isInteger(shellPid) && shellPid > 0) {
      try {
        process.kill(shellPid, "SIGKILL"); // 普通はサーバが閉じたので居ない（ESRCH）
      } catch {
        // 既に居ない
      }
    }
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  log("ok");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
