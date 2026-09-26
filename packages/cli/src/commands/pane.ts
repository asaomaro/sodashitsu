import type { ParamsOf } from "@wtm/protocol";
import { stripAnsi } from "../ansiStrip.js";
import type { Command } from "../cliArgs.js";
import { printJson, printLine, printRaw } from "../output.js";
import type { SessionStore } from "../session.js";
import { assertNotSelfPane } from "../selfGuard.js";
import { withSession } from "../withSession.js";
import { RpcFailure, type WtmClient } from "../wsClient.js";

/**
 * `pane split` / `close` / `input` / `run` / `read`
 * （design.md「`workspace create` / `tab create` / `pane split`」節・「`workspace close/rename` / `tab close` /
 * `pane close`」節・「`pane input` / `pane run`」節・「`pane read`」節）。
 */

type PaneSplitCmd = Extract<Command, { kind: "pane-split" }>;
type PaneCloseCmd = Extract<Command, { kind: "pane-close" }>;
type PaneInputCmd = Extract<Command, { kind: "pane-input" }>;
type PaneRunCmd = Extract<Command, { kind: "pane-run" }>;
type PaneReadCmd = Extract<Command, { kind: "pane-read" }>;

export async function runPaneSplit(cmd: PaneSplitCmd, store: SessionStore): Promise<void> {
  const result = await withSession(cmd.opts, store, async (client) => {
    await client.hello();
    const params: ParamsOf<"pane.split"> = { paneId: cmd.paneId, direction: cmd.direction };
    if (cmd.ratio !== undefined) params.ratio = cmd.ratio;
    return client.request("pane.split", params);
  });
  printJson(result);
}

export async function runPaneClose(cmd: PaneCloseCmd, store: SessionStore): Promise<void> {
  assertNotSelfPane(cmd.opts, cmd.paneId, "close"); // 自分の pane は閉じない（20260926-agent-skill-file。接続する前に断る）
  const result = await withSession(cmd.opts, store, async (client) => {
    await client.hello();
    return client.request("pane.close", { paneId: cmd.paneId });
  });
  printJson(result);
}

/**
 * `hello()` で得た snapshot に対象 `paneId` が無ければ、サーバへ行かずに `not_found` で即エラーにする
 * （design「依拠する既存の事実」：INPUT フレームにサーバからの ack は無く、存在しない pane への送信は
 * 黙って無視されるため。pane が hello の後・送信の前に閉じる TOCTOU は許容する — 既知の限界）。
 */
async function requirePaneExists(client: WtmClient, paneId: string): Promise<void> {
  const hello = await client.hello();
  if (!hello.snapshot.panes.some((p) => p.id === paneId)) {
    throw new RpcFailure("not_found", `pane not found: ${paneId}`);
  }
}

export async function runPaneInput(cmd: PaneInputCmd, store: SessionStore): Promise<void> {
  assertNotSelfPane(cmd.opts, cmd.paneId, "send input to"); // 自分の入力欄に混ざる（20260926-agent-skill-file）
  await withSession(cmd.opts, store, async (client) => {
    await requirePaneExists(client, cmd.paneId);
    client.sendInput(cmd.paneId, new TextEncoder().encode(cmd.text));
  });
  printJson({ ok: true, paneId: cmd.paneId });
}

export async function runPaneRun(cmd: PaneRunCmd, store: SessionStore): Promise<void> {
  assertNotSelfPane(cmd.opts, cmd.paneId, "run a command in"); // 同上（20260926-agent-skill-file）
  await withSession(cmd.opts, store, async (client) => {
    await requirePaneExists(client, cmd.paneId);
    client.sendInput(cmd.paneId, new TextEncoder().encode(`${cmd.command}\n`));
  });
  printJson({ ok: true, paneId: cmd.paneId });
}

/** タイムアウト付きで、対象 pane の最初の SNAPSHOT を待つ（design「`pane read`」節・手順3）。 */
function waitForSnapshot(client: WtmClient, paneId: string, timeoutMs: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new RpcFailure("timeout", `timed out waiting for pane snapshot (paneId=${paneId})`));
    }, timeoutMs);
    client.onSnapshot((snapPaneId, _cols, _rows, text) => {
      if (snapPaneId !== paneId) return;
      clearTimeout(timer);
      resolve(text);
    });
  });
}

/** Ctrl-C（既定の SIGINT 処理）か、サーバ側の切断まで OUTPUT を出し続ける（design「`pane read`」節・手順4）。 */
function followOutput(client: WtmClient, paneId: string, raw: boolean): Promise<never> {
  const decoder = new TextDecoder("utf-8");
  client.onOutput((chunkPaneId, chunk) => {
    if (chunkPaneId !== paneId) return;
    const text = decoder.decode(chunk, { stream: true });
    printRaw(raw ? text : stripAnsi(text));
  });
  return new Promise<never>((_resolve, reject) => {
    client.onClose((_code, reason) => {
      reject(new RpcFailure("connection_closed", `server closed the connection: ${reason || "(no reason given)"}`));
    });
  });
}

/**
 * 購読して最初の SNAPSHOT を読む（hello は呼び出し側が済ませておく）。購読の解除も呼び出し側が行う
 * （`pane read` は表示してから解除する・`--follow` なら解除しない）。`agent read` も同じ経路を使う。
 */
export async function readPaneSnapshot(client: WtmClient, paneId: string, scrollbackLines: number, timeoutMs: number): Promise<string> {
  const snapshotPromise = waitForSnapshot(client, paneId, timeoutMs);
  await client.request("pane.subscribe", { paneId, scrollbackLines });
  return snapshotPromise;
}

export async function runPaneRead(cmd: PaneReadCmd, store: SessionStore): Promise<void> {
  await withSession(cmd.opts, store, async (client) => {
    const hello = await client.hello();
    const text = await readPaneSnapshot(client, cmd.paneId, hello.snapshot.limits.scrollbackLines, cmd.timeoutMs);
    printLine(cmd.raw ? text : stripAnsi(text));

    if (!cmd.follow) {
      await client.request("pane.unsubscribe", { paneId: cmd.paneId });
      return;
    }
    await followOutput(client, cmd.paneId, cmd.raw);
  });
}
