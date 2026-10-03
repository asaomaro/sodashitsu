import type { ParamsOf } from "@sodashitsu/protocol";
import type { Command } from "../cliArgs.js";
import { printJson } from "../output.js";
import type { SessionStore } from "../session.js";
import { assertNotSelfWorkspace, callerPaneParam } from "../selfGuard.js";
import { withSession } from "../withSession.js";

/**
 * `workspace create` / `close` / `rename`（design.md「`workspace create` / `tab create` / `pane split`」節・
 * 「`workspace close/rename` / `tab close` / `pane close`」節）。
 * すべて `client.hello()` を先に送ってから RPC を呼ぶ（`kind: "external"` を確定させてから操作する。
 * decisions.md D4）。RPC の `result` は変換せずそのまま JSON で出す（decisions.md D7）。
 */

type WorkspaceCreateCmd = Extract<Command, { kind: "workspace-create" }>;
type WorkspaceCloseCmd = Extract<Command, { kind: "workspace-close" }>;
type WorkspaceRenameCmd = Extract<Command, { kind: "workspace-rename" }>;
type WorkspaceReportMetadataCmd = Extract<Command, { kind: "workspace-report-metadata" }>;

export async function runWorkspaceCreate(cmd: WorkspaceCreateCmd, store: SessionStore): Promise<void> {
  const result = await withSession(cmd.opts, store, async (client) => {
    await client.hello();
    // `exactOptionalPropertyTypes` のため、値が無いキーはそもそも代入しない（`undefined` を明示しない）。
    const params: ParamsOf<"workspace.create"> = {};
    if (cmd.cwd !== undefined) params.cwd = cmd.cwd;
    if (cmd.label !== undefined) params.label = cmd.label;
    Object.assign(params, callerPaneParam(cmd.opts));
    return client.request("workspace.create", params);
  });
  printJson(result);
}

export async function runWorkspaceClose(cmd: WorkspaceCloseCmd, store: SessionStore): Promise<void> {
  const result = await withSession(cmd.opts, store, async (client) => {
    const hello = await client.hello();
    assertNotSelfWorkspace(cmd.opts, hello.snapshot, cmd.workspaceId, "close"); // 自分の pane を含む workspace は閉じない（20260926-agent-skill-file）
    return client.request("workspace.close", { workspaceId: cmd.workspaceId });
  });
  printJson(result);
}

export async function runWorkspaceRename(cmd: WorkspaceRenameCmd, store: SessionStore): Promise<void> {
  const result = await withSession(cmd.opts, store, async (client) => {
    await client.hello();
    return client.request("workspace.rename", { workspaceId: cmd.workspaceId, label: cmd.label });
  });
  printJson(result);
}

/**
 * 独自トークンの報告（20260927-sidebar-row-tokens。herdr の `workspace report-metadata`）。自分の pane を含む workspace への報告は断らない
 * （フックが自分の workspace に報告するのが主な使い方。歯止め〔`selfGuard`〕は壊す操作だけ）。結果は `{}`。
 */
export async function runWorkspaceReportMetadata(cmd: WorkspaceReportMetadataCmd, store: SessionStore): Promise<void> {
  const result = await withSession(cmd.opts, store, async (client) => {
    await client.hello();
    return client.request("workspace.report_metadata", { workspaceId: cmd.workspaceId, ...metadataParams(cmd.report) });
  });
  printJson(result);
}

/** `exactOptionalPropertyTypes` のため、無い `seq`・`ttlMs` はキーごと付けない。 */
export function metadataParams(report: WorkspaceReportMetadataCmd["report"]): Omit<ParamsOf<"workspace.report_metadata">, "workspaceId"> {
  const params: Omit<ParamsOf<"workspace.report_metadata">, "workspaceId"> = { source: report.source, tokens: report.tokens };
  if (report.seq !== undefined) params.seq = report.seq;
  if (report.ttlMs !== undefined) params.ttlMs = report.ttlMs;
  return params;
}
