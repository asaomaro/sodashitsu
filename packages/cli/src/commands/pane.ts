import type { ParamsOf } from "@sodashitsu/protocol";
import { stripAnsi } from "../ansiStrip.js";
import type { Command, GlobalOpts } from "../cliArgs.js";
import { printJson, printLine, printRaw } from "../output.js";
import { resolvePaneRef } from "../idRef.js";
import { paneTargetIdBeforeConnect, resolveFocusedPane } from "../paneTarget.js";
import type { SessionStore } from "../session.js";
import { assertNotSelfPane, callerPaneParam } from "../selfGuard.js";
import { withSession } from "../withSession.js";
import { metadataParams } from "./workspace.js";
import { RpcFailure, type SodaClient } from "../wsClient.js";

/**
 * `pane split` / `close` / `input` / `run` / `read`
 * （design.md「`workspace create` / `tab create` / `pane split`」節・「`workspace close/rename` / `tab close` /
 * `pane close`」節・「`pane input` / `pane run`」節・「`pane read`」節）。
 */

type PaneSplitCmd = Extract<Command, { kind: "pane-split" }>;
type PaneCurrentCmd = Extract<Command, { kind: "pane-current" }>;
type PaneCloseCmd = Extract<Command, { kind: "pane-close" }>;
type PaneInputCmd = Extract<Command, { kind: "pane-input" }>;
type PaneRunCmd = Extract<Command, { kind: "pane-run" }>;
type PaneReadCmd = Extract<Command, { kind: "pane-read" }>;
type PaneReportMetadataCmd = Extract<Command, { kind: "pane-report-metadata" }>;

/**
 * 対象は明示の ID・呼び出し元の pane・フォーカスの pane（20260927-caller-pane-default）。呼び出し元は接続する前に同じサーバかを確かめ、
 * フォーカスは hello の snapshot で決める。自分の pane を分けるのは断らない（`self_target` の対象外）。
 */
export async function runPaneSplit(cmd: PaneSplitCmd, store: SessionStore): Promise<void> {
  const knownPaneId = paneTargetIdBeforeConnect(cmd.opts, cmd.target);
  const result = await withSession(cmd.opts, store, async (client) => {
    const hello = await client.hello();
    const paneId = knownPaneId === undefined ? resolveFocusedPane(hello.snapshot) : resolvePaneRef(hello.snapshot, knownPaneId);
    const params: ParamsOf<"pane.split"> = { paneId, direction: cmd.direction };
    if (cmd.ratio !== undefined) params.ratio = cmd.ratio;
    Object.assign(params, callerPaneParam(cmd.opts));
    return client.request("pane.split", params);
  });
  printJson(result);
}

/**
 * 対象の pane の今の情報（herdr の `pane current`。20260927-caller-pane-default）。`tabId`・`workspaceId` は接続したときのサーバの状態から引くので、
 * pane が別の tab・workspace へ移された後でも今の値になる（環境変数のように古くならない）。hello のほかは何も送らない。
 */
export async function runPaneCurrent(cmd: PaneCurrentCmd, store: SessionStore): Promise<void> {
  const knownPaneId = paneTargetIdBeforeConnect(cmd.opts, cmd.target);
  const snapshot = await withSession(cmd.opts, store, async (client) => (await client.hello()).snapshot);
  const paneId = knownPaneId === undefined ? resolveFocusedPane(snapshot) : resolvePaneRef(snapshot, knownPaneId);
  const pane = snapshot.panes.find((p) => p.id === paneId);
  if (pane === undefined) throw new RpcFailure("not_found", `pane not found: ${paneId}`);
  const workspaceId = snapshot.tabs.find((t) => t.id === pane.tabId)?.workspaceId ?? null;
  printJson({ pane: { ...pane, workspaceId, focused: snapshot.focus?.paneId === pane.id } });
}

export async function runPaneClose(cmd: PaneCloseCmd, store: SessionStore): Promise<void> {
  assertNotSelfPane(cmd.opts, cmd.paneId, "close"); // 自分の pane は閉じない（20260926-agent-skill-file。接続する前に断る）
  const result = await withSession(cmd.opts, store, async (client) => {
    const hello = await client.hello();
    const paneId = resolvePaneRef(hello.snapshot, cmd.paneId);
    assertNotSelfPane(cmd.opts, paneId, "close"); // 部分の指定が自分の pane に当たっていたときもここで断る
    return client.request("pane.close", { paneId });
  });
  printJson(result);
}

/**
 * `hello()` で得た snapshot に対象 `paneId` が無ければ、サーバへ行かずに `not_found` で即エラーにする
 * （design「依拠する既存の事実」：INPUT フレームにサーバからの ack は無く、存在しない pane への送信は
 * 黙って無視されるため。pane が hello の後・送信の前に閉じる TOCTOU は許容する — 既知の限界）。
 */
async function requirePaneExists(client: SodaClient, spec: string, opts: GlobalOpts, action: string): Promise<string> {
  const hello = await client.hello();
  const paneId = resolvePaneRef(hello.snapshot, spec);
  if (!hello.snapshot.panes.some((p) => p.id === paneId)) {
    throw new RpcFailure("not_found", `pane not found: ${paneId}`);
  }
  assertNotSelfPane(opts, paneId, action); // 部分の指定が自分の pane に当たっていたときもここで断る
  return paneId;
}

export async function runPaneInput(cmd: PaneInputCmd, store: SessionStore): Promise<void> {
  assertNotSelfPane(cmd.opts, cmd.paneId, "send input to"); // 自分の入力欄に混ざる（20260926-agent-skill-file）
  const paneId = await withSession(cmd.opts, store, async (client) => {
    const id = await requirePaneExists(client, cmd.paneId, cmd.opts, "send input to");
    client.sendInput(id, new TextEncoder().encode(cmd.text));
    return id;
  });
  printJson({ ok: true, paneId });
}

export async function runPaneRun(cmd: PaneRunCmd, store: SessionStore): Promise<void> {
  assertNotSelfPane(cmd.opts, cmd.paneId, "run a command in"); // 同上（20260926-agent-skill-file）
  const paneId = await withSession(cmd.opts, store, async (client) => {
    const id = await requirePaneExists(client, cmd.paneId, cmd.opts, "run a command in");
    client.sendInput(id, new TextEncoder().encode(`${cmd.command}\n`));
    return id;
  });
  printJson({ ok: true, paneId });
}

/** タイムアウト付きで、対象 pane の最初の SNAPSHOT を待つ（design「`pane read`」節・手順3）。 */
function waitForSnapshot(client: SodaClient, paneId: string, timeoutMs: number): Promise<string> {
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
function followOutput(client: SodaClient, paneId: string, raw: boolean): Promise<never> {
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
export async function readPaneSnapshot(client: SodaClient, paneId: string, scrollbackLines: number, timeoutMs: number): Promise<string> {
  const snapshotPromise = waitForSnapshot(client, paneId, timeoutMs);
  await client.request("pane.subscribe", { paneId, scrollbackLines });
  return snapshotPromise;
}

export async function runPaneRead(cmd: PaneReadCmd, store: SessionStore): Promise<void> {
  await withSession(cmd.opts, store, async (client) => {
    const hello = await client.hello();
    const paneId = resolvePaneRef(hello.snapshot, cmd.paneId);
    const text = await readPaneSnapshot(client, paneId, hello.snapshot.limits.scrollbackLines, cmd.timeoutMs);
    printLine(cmd.raw ? text : stripAnsi(text));

    if (!cmd.follow) {
      await client.request("pane.unsubscribe", { paneId });
      return;
    }
    await followOutput(client, paneId, cmd.raw);
  });
}

/** 独自トークンの報告（20260927-sidebar-row-tokens。herdr の `pane report-metadata` のトークンの部分）。自分の pane への報告は断らない。結果は `{}`。 */
export async function runPaneReportMetadata(cmd: PaneReportMetadataCmd, store: SessionStore): Promise<void> {
  const result = await withSession(cmd.opts, store, async (client) => {
    const hello = await client.hello();
    return client.request("pane.report_metadata", { paneId: resolvePaneRef(hello.snapshot, cmd.paneId), ...metadataParams(cmd.report) });
  });
  printJson(result);
}
