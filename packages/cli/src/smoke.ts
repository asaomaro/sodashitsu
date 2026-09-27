#!/usr/bin/env node
/**
 * `wtmctl` の起動確認（design.md「対象範囲」T14、`aidev-50-test`「この work が新しい入口を足したなら
 * smokeCommands に1行足す」）。`packages/server/src/smoke.ts` と同じ形（実サーバを空きポートで起動し、
 * ビルド済みの成果物〔`dist/main.js`〕を**子プロセスとして実際に起動して**一巡を確かめる。exit 0=pass、
 * 例外・想定外の結果で exit 1）。
 *
 * `packages/server/src/smoke.ts` との違い：あちらは生の WebSocket 接続でプロトコル層を確かめるのに対し、
 * こちらは `node dist/main.js <args>` を子プロセスとして呼び、**利用者が実際に打つコマンドそのもの**が
 * 動くかを確かめる（CLI 引数解析・セッションキャッシュ・終了コードまで含めた「最初の使える状態」）。
 * セッションキャッシュ（既定 `~/.wtmctl/session.json`）は `HOME`（Windows は `USERPROFILE`）を差し替えて
 * 一時ディレクトリへ逃がし、実行者の実際のキャッシュに触れない。
 */
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { composeServer, NodePtyBackend, type ComposedServer } from "@wtm/server";

async function getFreePort(): Promise<number> {
  return new Promise((resolvePromise, rejectPromise) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const port = (probe.address() as AddressInfo).port;
      probe.close((err) => (err ? rejectPromise(err) : resolvePromise(port)));
    });
    probe.on("error", rejectPromise);
  });
}

const execFileAsync = promisify(execFile);
const CLI_ENTRY = fileURLToPath(new URL("./main.js", import.meta.url));

interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCli(args: string[], env: NodeJS.ProcessEnv): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI_ENTRY, ...args], { env, timeout: 15_000 });
    return { stdout, stderr, exitCode: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", exitCode: typeof e.code === "number" ? e.code : 1 };
  }
}

/** `cond` が真になるまで待つ（100ms ごと・上限つき）。 */
async function until(cond: () => boolean, message: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(message);
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** 出力の中に、印だけの行（コマンドを打った行ではなく実行された結果の行）があるか。 */
function hasOutputLine(text: string, marker: string): boolean {
  return text.split(/\r?\n/).some((l) => l.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").trim() === marker);
}

/**
 * 20260926-pane-direct-connect: ビルド済みの `wtmctl pane attach` を本物の端末（node-pty の PTY）の中で動かし、
 * 大きさが PTY の大きさに揃うこと・打鍵の往復・大きさの追従・`Ctrl+B q` で終了コード 0・pane が残ることを確かめる。
 */
async function smokeAttach(server: ComposedServer, paneId: string, url: string, env: NodeJS.ProcessEnv): Promise<void> {
  const ptyEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (v !== undefined) ptyEnv[k] = v;
  const pty = new NodePtyBackend().spawn({
    shell: process.execPath,
    args: [CLI_ENTRY, "pane", "attach", paneId, "--url", url],
    cwd: process.cwd(),
    env: ptyEnv,
    cols: 100,
    rows: 30,
  });
  let out = "";
  pty.onData((d) => {
    out += d;
  });
  let exitCode: number | null = null;
  pty.onExit((e) => {
    exitCode = e.exitCode;
  });
  const size = (): string => {
    const p = server.session.getPane(paneId);
    return p ? `${p.cols}x${p.rows}` : "gone";
  };
  try {
    await until(() => size() === "100x30" && out.includes("\x1b[?1049h"), `pane attach did not take the terminal size (pane ${size()}): ${JSON.stringify(out.slice(-300))}`);
    const marker = `wtmctl-smoke-attach-${Date.now()}`;
    pty.write(`echo ${marker}\r`);
    await until(() => hasOutputLine(out, marker), `pane attach did not round-trip the input: ${JSON.stringify(out.slice(-300))}`);
    pty.resize(90, 25);
    await until(() => size() === "90x25", `pane attach did not follow the terminal resize (pane ${size()})`);
    pty.write("\x02q");
    await until(() => exitCode !== null, "pane attach did not exit after Ctrl+B q");
    if (exitCode !== 0) throw new Error(`pane attach exited with ${exitCode} after Ctrl+B q: ${JSON.stringify(out.slice(-300))}`);
    if (!server.session.getPane(paneId)) throw new Error("the pane was closed by detaching");
    // 切り離したら手元の端末を戻している（最後に代替画面から出る列を書いた）。
    if (out.lastIndexOf("\x1b[?1049l") < out.lastIndexOf(marker)) throw new Error(`pane attach did not leave the alternate screen: ${JSON.stringify(out.slice(-300))}`);
  } finally {
    if (exitCode === null) pty.kill();
  }
}

/** 子プロセスの stdout を行ごとに集め、終了コードを覚える。 */
function track(child: ChildProcess): { lines: string[]; stderr(): string; exitCode(): number | null } {
  const lines: string[] = [];
  let buf = "";
  let err = "";
  let code: number | null = null;
  child.stdout!.setEncoding("utf8");
  child.stdout!.on("data", (d: string) => {
    buf += d;
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      lines.push(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  });
  child.stderr!.setEncoding("utf8");
  child.stderr!.on("data", (d: string) => {
    err += d;
  });
  // 'exit' は stdout を読み切る前にも出うるので、stdio が閉じた後の 'close' で確定させる（最後の terminal.closed を取りこぼさない）。
  child.on("close", (c) => {
    if (buf !== "") lines.push(buf);
    buf = "";
    code = c ?? -1;
  });
  return { lines, stderr: () => err, exitCode: () => code };
}

interface SmokeFrame {
  type: string;
  seq?: number;
  width?: number;
  height?: number;
  full?: boolean;
  bytes?: string;
  reason?: string;
}

const framesOf = (lines: string[]): SmokeFrame[] =>
  lines.map((l, i) => {
    try {
      return JSON.parse(l) as SmokeFrame;
    } catch {
      throw new Error(`stdout line ${i + 1} is not JSON: ${JSON.stringify(l.slice(0, 200))}`);
    }
  });
const frameText = (lines: string[]): string =>
  framesOf(lines)
    .filter((f) => f.type === "terminal.frame")
    .map((f) => Buffer.from(f.bytes ?? "", "base64").toString("utf8"))
    .join("");

/**
 * 20260926-pane-observe-control: ビルド済みの `wtmctl pane observe` と `pane control` を子プロセス（stdin/stdout はパイプ）として動かし、
 * observe の最初の行が full の画面・control が pane の大きさを変えたこと（所有者になった）・stdin の NDJSON の入力の往復・release で終了コード 0・pane の close で observe が
 * pane_closed で終了コード 0 になり、どちらのプロセスも自分で終わることを確かめる。
 */
async function smokeStreams(server: ComposedServer, basePaneId: string, url: string, env: NodeJS.ProcessEnv): Promise<void> {
  const split = await runCli(["pane", "split", basePaneId, "--direction", "down", "--url", url], env);
  if (split.exitCode !== 0) throw new Error(`pane split failed (exit ${split.exitCode}): ${split.stderr}`);
  const paneId = (JSON.parse(split.stdout) as { pane: { id: string } }).pane.id;
  const size = (): string => {
    const p = server.session.getPane(paneId);
    return p ? `${p.cols}x${p.rows}` : "gone";
  };
  const observe = spawn(process.execPath, [CLI_ENTRY, "pane", "observe", paneId, "--url", url], { env, stdio: ["ignore", "pipe", "pipe"] });
  const control = spawn(process.execPath, [CLI_ENTRY, "pane", "control", paneId, "--cols", "100", "--rows", "30", "--url", url], {
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const obs = track(observe);
  const ctl = track(control);
  // control が先に終わった後の書き込みの失敗（EPIPE）で smoke ごと落ちず、下の until の文言で失敗させる。
  control.stdin!.on("error", () => undefined);
  try {
    await until(() => obs.lines.length > 0, `pane observe printed nothing: ${obs.stderr()}`);
    const first = framesOf(obs.lines)[0]!;
    if (first.type !== "terminal.frame" || first.seq !== 1 || first.full !== true) throw new Error(`pane observe's first record is not a full frame: ${obs.lines[0]}`);
    await until(() => size() === "100x30" && ctl.lines.length > 0, `pane control did not take the size (pane ${size()}): ${ctl.stderr()}`);
    const marker = `wtmctl-smoke-stream-${Date.now()}`;
    control.stdin!.write(`${JSON.stringify({ type: "terminal.input", text: `echo ${marker}\r` })}\n`);
    control.stdin!.write('{"type":"terminal.bogus"}\n');
    await until(() => hasOutputLine(frameText(obs.lines), marker), `pane observe did not see the control input: ${JSON.stringify(frameText(obs.lines).slice(-300))}`);
    await until(() => hasOutputLine(frameText(ctl.lines), marker), "pane control did not see its own input");
    if (!ctl.stderr().includes("wtmctl: pane control input ignored: unknown command type")) throw new Error(`pane control did not warn about the invalid line: ${ctl.stderr()}`);
    control.stdin!.write('{"type":"terminal.release"}\n');
    await until(() => ctl.exitCode() !== null, "pane control did not exit after terminal.release");
    const ctlLast = framesOf(ctl.lines).at(-1);
    if (ctl.exitCode() !== 0 || ctlLast?.type !== "terminal.closed" || ctlLast.reason !== "released") {
      throw new Error(`pane control should end released with exit 0 (exit ${ctl.exitCode()}): ${ctl.lines.at(-1)} ${ctl.stderr()}`);
    }
    if (!server.session.getPane(paneId)) throw new Error("the pane was closed by releasing");
    const closed = await runCli(["pane", "close", paneId, "--url", url], env);
    if (closed.exitCode !== 0) throw new Error(`pane close failed (exit ${closed.exitCode}): ${closed.stderr}`);
    await until(() => obs.exitCode() !== null, "pane observe did not exit after the pane was closed");
    const obsLast = framesOf(obs.lines).at(-1);
    if (obs.exitCode() !== 0 || obsLast?.type !== "terminal.closed" || obsLast.reason !== "pane_closed") {
      throw new Error(`pane observe should end pane_closed with exit 0 (exit ${obs.exitCode()}): ${obs.lines.at(-1)} ${obs.stderr()}`);
    }
  } finally {
    if (obs.exitCode() === null) observe.kill();
    if (ctl.exitCode() === null) control.kill();
  }
}

async function main(): Promise<void> {
  const serverStateDir = await mkdtemp(join(tmpdir(), "wtmctl-smoke-state-"));
  const homeDir = await mkdtemp(join(tmpdir(), "wtmctl-smoke-home-"));
  console.log(`smoke(cli): temp server state dir ${serverStateDir}, sandboxed HOME ${homeDir}`);

  // pane のシェルに本物のエージェント（この機械の claude 等）を起動させない（20260926-agent-start decisions.md D11）。
  // 利用者の rc を読ませず（HOME）、PATH の先頭に「呼ばれたら印を残して失敗する」偽の claude を置く。pane のシェルはこの環境を継承する。
  const stubBin = join(homeDir, "stub-bin");
  const stubMarker = join(homeDir, "stub-claude-called");
  await mkdir(stubBin, { recursive: true });
  await writeFile(join(stubBin, "claude"), `#!/bin/sh\ntouch '${stubMarker}'\nexit 1\n`, { mode: 0o755 });
  process.env["HOME"] = homeDir;
  process.env["PATH"] = `${stubBin}${delimiter}${process.env["PATH"] ?? ""}`;

  const port = await getFreePort();
  const server = await composeServer({ host: "127.0.0.1", port: String(port), stateDir: serverStateDir, origin: [] });
  await server.listen();
  try {
    const { host } = server.options;
    if (!server.freshToken) throw new Error("expected a freshly generated token");
    const token = server.freshToken;
    const url = `http://${host}:${port}`;
    console.log(`smoke(cli): server listening on ${url}`);

    // `USERPROFILE` は Windows 版 Node の `os.homedir()` が見る変数（`HOME` だけ差し替えても Windows では効かない）。
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: homeDir, USERPROFILE: homeDir };

    const created = await runCli(["workspace", "create", "--cwd", process.cwd(), "--label", "smoke", "--url", url, "--token", token], env);
    if (created.exitCode !== 0) throw new Error(`workspace create failed (exit ${created.exitCode}): ${created.stderr}`);
    const { pane, workspace, tab } = JSON.parse(created.stdout) as { pane: { id: string }; workspace: { id: string }; tab: { id: string } };
    console.log(`smoke(cli): wtmctl workspace create ok (pane ${pane.id})`);

    // 2回目以降は --token を渡さない：セッションキャッシュが再利用されることの確認を兼ねる（AC7）。
    const marker = `wtmctl-smoke-${Date.now()}`;
    const ran = await runCli(["pane", "run", pane.id, `echo ${marker}`, "--url", url], env);
    if (ran.exitCode !== 0) throw new Error(`pane run failed (exit ${ran.exitCode}): ${ran.stderr}`);
    console.log("smoke(cli): wtmctl pane run ok (no --token needed; cached session reused)");

    let sawMarker = false;
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline && !sawMarker) {
      const read = await runCli(["pane", "read", pane.id, "--url", url], env);
      if (read.exitCode !== 0) throw new Error(`pane read failed (exit ${read.exitCode}): ${read.stderr}`);
      if (read.stdout.includes(marker)) sawMarker = true;
      else await new Promise((r) => setTimeout(r, 200));
    }
    if (!sawMarker) throw new Error(`pane read never showed marker "${marker}"`);
    console.log("smoke(cli): wtmctl pane read ok (echo round trip confirmed)");

    const snap = await runCli(["snapshot", "--url", url], env);
    if (snap.exitCode !== 0) throw new Error(`snapshot failed (exit ${snap.exitCode}): ${snap.stderr}`);
    const snapshot = JSON.parse(snap.stdout) as { panes: { id: string }[] };
    if (!snapshot.panes.some((p) => p.id === pane.id)) throw new Error("snapshot did not include the created pane");
    console.log("smoke(cli): wtmctl snapshot ok");

    // 20260927-caller-pane-default: pane の中の環境（WTM_PANE_ID・WTM_SERVER_URL）を与えたビルド済みの wtmctl で、`pane current` が
    // その pane の tab・workspace を返し、対象を省いた `pane split` がその pane の隣（同じ tab）に作ること。--url は渡さない（WTM_SERVER_URL につなぐ）。
    // フォーカスを別の workspace へ移しておく（呼び出し元とフォーカスの pane を別にし、フォーカスの pane に落ちる実装を見分ける。タスク点検 T5 の指摘）。
    const other = await runCli(["workspace", "create", "--label", "smoke-focus", "--url", url], env);
    if (other.exitCode !== 0) throw new Error(`workspace create failed (exit ${other.exitCode}): ${other.stderr}`);
    const otherWorkspaceId = (JSON.parse(other.stdout) as { workspace: { id: string } }).workspace.id;
    const inPaneEnv: NodeJS.ProcessEnv = { ...env, WTM_PANE_ID: pane.id, WTM_SERVER_URL: url };
    delete inPaneEnv["WTMCTL_URL"];
    const current = await runCli(["pane", "current"], inPaneEnv);
    if (current.exitCode !== 0) throw new Error(`pane current failed (exit ${current.exitCode}): ${current.stderr}`);
    const here = (JSON.parse(current.stdout) as { pane: { id: string; tabId: string; workspaceId: string | null } }).pane;
    if (here.id !== pane.id || here.tabId !== tab.id || here.workspaceId !== workspace.id) throw new Error(`pane current returned ${current.stdout}`);
    const splitHere = await runCli(["pane", "split", "--direction", "right"], inPaneEnv);
    if (splitHere.exitCode !== 0) throw new Error(`pane split (caller) failed (exit ${splitHere.exitCode}): ${splitHere.stderr}`);
    const sibling = (JSON.parse(splitHere.stdout) as { pane: { id: string; tabId: string } }).pane;
    if (sibling.tabId !== tab.id || sibling.id === pane.id) throw new Error(`pane split (caller) returned ${splitHere.stdout}`);
    const closedSibling = await runCli(["pane", "close", sibling.id, "--url", url], env);
    if (closedSibling.exitCode !== 0) throw new Error(`pane close failed (exit ${closedSibling.exitCode}): ${closedSibling.stderr}`);
    const closedOther = await runCli(["workspace", "close", otherWorkspaceId, "--url", url], env);
    if (closedOther.exitCode !== 0) throw new Error(`workspace close failed (exit ${closedOther.exitCode}): ${closedOther.stderr}`);
    console.log(`smoke(cli): wtmctl pane current / pane split (caller pane, not the focused one) ok (tab ${here.tabId})`);

    // 20260927-sidebar-row-tokens: 独自トークンの報告。`--token` を接続の token（= を含まない）と独自トークン（NAME=VALUE）の両方に使い、
    // 値が整えられて snapshot の workspace・pane に載ること、消去で消えることを、ビルドした wtmctl で確かめる。**接続の token が実際に使われるよう、
    // この 1 回はセッションのキャッシュの無い HOME で打つ**（キャッシュがあると `--token` は読まれない——`withSession.ts`。タスク点検 T11 の指摘）。
    const freshHome = join(homeDir, "fresh-home");
    await mkdir(freshHome, { recursive: true });
    const reported = await runCli(
      ["workspace", "report-metadata", workspace.id, "--source", "smoke", "--token", "build= green\t", "--token", token, "--url", url],
      { ...env, HOME: freshHome, USERPROFILE: freshHome },
    );
    if (reported.exitCode !== 0 || reported.stdout.trim() !== "{}") {
      throw new Error(`workspace report-metadata failed (exit ${reported.exitCode}): ${reported.stdout} ${reported.stderr}`);
    }
    const paneReported = await runCli(["pane", "report-metadata", pane.id, "--source", "smoke", "--token", "summary=smoke-ok", "--ttl-ms", "600000", "--url", url], env);
    if (paneReported.exitCode !== 0) throw new Error(`pane report-metadata failed (exit ${paneReported.exitCode}): ${paneReported.stderr}`);
    const snapWithTokens = await runCli(["snapshot", "--url", url], env);
    if (snapWithTokens.exitCode !== 0) throw new Error(`snapshot failed (exit ${snapWithTokens.exitCode}): ${snapWithTokens.stderr}`);
    const withTokens = JSON.parse(snapWithTokens.stdout) as {
      workspaces: { id: string; tokens?: Record<string, string> }[];
      panes: { id: string; tokens?: Record<string, string> }[];
    };
    // 名前が build ちょうど 1 つ（接続の token が独自トークンとして載っていない。decisions D5）。
    const wsTokens = withTokens.workspaces.find((w) => w.id === workspace.id)?.tokens;
    if (JSON.stringify(wsTokens) !== JSON.stringify({ build: "green" })) throw new Error(`unexpected workspace tokens: ${JSON.stringify(wsTokens)}`);
    if (withTokens.panes.find((p) => p.id === pane.id)?.tokens?.["summary"] !== "smoke-ok") throw new Error("snapshot did not include the pane token");
    const badSource = await runCli(["workspace", "report-metadata", workspace.id, "--source", "bad source", "--token", "a=1", "--url", url], env);
    if (badSource.exitCode !== 1 || !badSource.stderr.includes("invalid_metadata_source")) {
      throw new Error(`report-metadata with a bad source should fail with invalid_metadata_source (exit ${badSource.exitCode}): ${badSource.stderr}`);
    }
    const tokenCleared = await runCli(["workspace", "report-metadata", workspace.id, "--source", "smoke", "--clear-token", "build", "--url", url], env);
    if (tokenCleared.exitCode !== 0) throw new Error(`report-metadata --clear-token failed (exit ${tokenCleared.exitCode}): ${tokenCleared.stderr}`);
    const snapAfterClear = await runCli(["snapshot", "--url", url], env);
    if (snapAfterClear.exitCode !== 0) throw new Error(`snapshot failed (exit ${snapAfterClear.exitCode}): ${snapAfterClear.stderr}`);
    const afterClear = JSON.parse(snapAfterClear.stdout) as { workspaces: { id: string; tokens?: unknown }[] };
    if (afterClear.workspaces.find((w) => w.id === workspace.id)?.tokens !== undefined) throw new Error("--clear-token did not clear the workspace token");
    console.log("smoke(cli): wtmctl workspace/pane report-metadata ok (normalized, in snapshot, cleared, bad source refused)");

    // エージェントを起動していないので空の一覧になる（`agent` コマンド群の配線とセッション再利用の確認）。
    const agents = await runCli(["agent", "list", "--url", url], env);
    if (agents.exitCode !== 0) throw new Error(`agent list failed (exit ${agents.exitCode}): ${agents.stderr}`);
    const listed = JSON.parse(agents.stdout) as { agents: unknown[] };
    if (!Array.isArray(listed.agents) || listed.agents.length !== 0) throw new Error(`agent list should be an empty agents array: ${agents.stdout}`);
    console.log("smoke(cli): wtmctl agent list ok (no agents)");

    // 20260926-agent-prompt-send-keys: ビルド済みの RPC（agent.prompt / agent.send_keys）までの配線を確かめる。
    // 検出したエージェントは居ないので状態を注入する（前面はシェルなので AgentMonitor は上書きしない）。prompt はシェルに
    // 「本文 → 300ms → Enter」で届くので、echo の往復で確定されたことを見る。
    server.session.updatePaneRuntime(pane.id, {
      agent: { instanceId: "smoke-agent", kind: "claude", label: "Claude Code", state: "idle", completionSeq: 0, serverSeenSeq: 0, verified: true, since: Date.now() },
    });
    // 20260926-agent-start-rename: agent.rename の RPC と名前による対象指定の配線（名前を付ける → 名前で引く → 外す）。
    const renamed = await runCli(["agent", "rename", pane.id, "smoke-agent", "--url", url], env);
    if (renamed.exitCode !== 0) throw new Error(`agent rename failed (exit ${renamed.exitCode}): ${renamed.stderr}`);
    const byName = await runCli(["agent", "get", "smoke-agent", "--url", url], env);
    const named = JSON.parse(byName.stdout || "{}") as { agent?: { paneId?: string; name?: string | null } };
    if (byName.exitCode !== 0 || named.agent?.paneId !== pane.id || named.agent?.name !== "smoke-agent") {
      throw new Error(`agent get by name failed (exit ${byName.exitCode}): ${byName.stdout} ${byName.stderr}`);
    }
    const cleared = await runCli(["agent", "rename", "smoke-agent", "--clear", "--url", url], env);
    const unnamed = JSON.parse(cleared.stdout || "{}") as { agent?: { name?: string | null } };
    if (cleared.exitCode !== 0 || unnamed.agent?.name !== null) throw new Error(`agent rename --clear failed (exit ${cleared.exitCode}): ${cleared.stdout} ${cleared.stderr}`);
    const gone = await runCli(["agent", "get", "smoke-agent", "--url", url], env);
    if (gone.exitCode !== 1 || !gone.stderr.includes("agent_not_found")) throw new Error(`the cleared name should not resolve (exit ${gone.exitCode}): ${gone.stderr}`);
    const byId = await runCli(["agent", "get", pane.id, "--url", url], env);
    if (byId.exitCode !== 0 || (JSON.parse(byId.stdout) as { agent: { name: string | null } }).agent.name !== null) {
      throw new Error(`agent get by pane id should show no name after --clear (exit ${byId.exitCode}): ${byId.stdout} ${byId.stderr}`);
    }
    console.log("smoke(cli): wtmctl agent rename ok (named, resolved by name, cleared)");
    // 20260926-agent-start: ビルド済みの wtmctl → RPC agent.start → AgentStarter の配線。エージェントの居る pane には何も打ち込まず
    // agent_pane_busy（本物のエージェントは起動しない）。表に無い kind は使用誤り（2）。
    const badKind = await runCli(["agent", "start", "smoke-start", "--kind", "sh", "--pane", pane.id, "--url", url], env);
    if (badKind.exitCode !== 2) throw new Error(`agent start with an unknown kind should be a usage error (exit ${badKind.exitCode}): ${badKind.stderr}`);
    const busy = await runCli(["agent", "start", "smoke-start", "--kind", "claude", "--pane", pane.id, "--url", url, "--", "$(echo x)"], env);
    if (busy.exitCode !== 1 || !busy.stderr.includes("agent_pane_busy")) {
      throw new Error(`agent start on a pane with an agent should be agent_pane_busy (exit ${busy.exitCode}): ${busy.stdout} ${busy.stderr}`);
    }
    if (existsSync(stubMarker)) throw new Error("agent start must not have typed anything into the pane");
    console.log("smoke(cli): wtmctl agent start ok (usage error for an unknown kind, agent_pane_busy on a pane with an agent)");
    const keys = await runCli(["agent", "send-keys", pane.id, "C-c", "--url", url], env);
    if (keys.exitCode !== 0) throw new Error(`agent send-keys failed (exit ${keys.exitCode}): ${keys.stderr}`);
    console.log("smoke(cli): wtmctl agent send-keys ok (the RPC accepted the keys)");
    const promptMarker = `wtmctl-smoke-prompt-${Date.now()}`;
    const prompted = await runCli(["agent", "prompt", pane.id, `echo ${promptMarker}`, "--url", url], env);
    if (prompted.exitCode !== 0) throw new Error(`agent prompt failed (exit ${prompted.exitCode}): ${prompted.stderr}`);
    let sawPrompt = false;
    const promptDeadline = Date.now() + 8_000;
    while (Date.now() < promptDeadline && !sawPrompt) {
      const read = await runCli(["pane", "read", pane.id, "--url", url], env);
      if (read.exitCode !== 0) throw new Error(`pane read failed (exit ${read.exitCode}): ${read.stderr}`);
      // 入力の行（echo …）だけでなく、実行された結果の行（マーカーだけの行）が出ていること。
      if (read.stdout.split("\n").some((l) => l.trim() === promptMarker)) sawPrompt = true;
      else await new Promise((r) => setTimeout(r, 200));
    }
    if (!sawPrompt) throw new Error(`agent prompt was not submitted (marker "${promptMarker}" never printed)`);
    console.log("smoke(cli): wtmctl agent prompt ok (submitted; the shell printed the marker)");

    // 20260926-pane-direct-connect: 端末でなければ繋がない（execFile の stdin は端末ではない）。
    const notTty = await runCli(["pane", "attach", pane.id, "--url", url], env);
    if (notTty.exitCode !== 1 || !notTty.stderr.includes("not_a_tty")) {
      throw new Error(`pane attach without a terminal should fail with not_a_tty (exit ${notTty.exitCode}): ${notTty.stderr}`);
    }
    console.log("smoke(cli): wtmctl pane attach refuses a non-terminal (not_a_tty)");
    await smokeAttach(server, pane.id, url, env);
    console.log("smoke(cli): wtmctl pane attach ok (in a real PTY: size 100x30, echo round trip, resize 90x25, Ctrl+B q exit 0, left the alternate screen)");
    await smokeStreams(server, pane.id, url, env);
    console.log("smoke(cli): wtmctl pane observe/control ok (pipes: full first frame, control size 100x30, NDJSON input round trip, invalid line warned, release exit 0, observe pane_closed exit 0)");

    console.log("smoke(cli): PASS");
    process.exitCode = 0;
  } finally {
    await server.close();
    await rm(serverStateDir, { recursive: true, force: true });
    await rm(homeDir, { recursive: true, force: true });
  }
}

main().catch((err: unknown) => {
  console.error("smoke(cli): FAIL", err);
  process.exitCode = 1;
});
