import type { WorkBinding } from "@sodashitsu/protocol";
import type { Command } from "../cliArgs.js";
import type { SessionStore } from "../session.js";
import { withSession } from "../withSession.js";
import { RpcFailure } from "../wsClient.js";
import { selfPaneId } from "../selfGuard.js";
import { resolvePaneRef, resolveWorkspaceRef } from "../idRef.js";
import { printJson } from "../output.js";
import { printExec, readExec } from "./exec.js";

type WorkCommand = Extract<Command, { kind: "work" }>;
function instructions(binding: WorkBinding, paneId: string): string {
  return `対象PJの読み取り・検索・編集・コマンド実行はすべて sodactl work 経由で行う。実行先は ${binding.machineId} / ${binding.folder}。手元のRead/Edit/Shellに接続先のパスを渡さない。\n` +
    `スキルは work skills で選び、work skill <id> で必要時に読む。相対参照は work skill <id> --path <相対パス>。スキル内のスクリプトも work exec -- <command> で接続先のシェルで実行する。\n` +
    `メモは work memory write <name> の標準入力で接続先に残す。更新時はread結果の--versionを渡す。引継ぎは work handoff。呼出元pane=${paneId}。切断やPJ変更で失敗したらローカルで代行せず停止する。\n` +
    `これはCLIの作業先指定であり、エージェント組込みツールやMCPをリダイレクトするものではない。スキル本文を実行するときは同じ経路を維持する。`;
}
export async function workInput(limit = 262144): Promise<string> {
  if (process.stdin.isTTY) throw new RpcFailure("invalid_params", "本文を標準入力で渡してください");
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > limit) throw new RpcFailure("invalid_params", "本文が上限を超えています");
    chunks.push(bytes);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
}
export async function workTarget(cmd: WorkCommand, store: SessionStore): Promise<{ paneId: string; binding: WorkBinding }> {
  if (cmd.opts.machine) throw new RpcFailure("invalid_params", "workは呼出元サーバに接続します。--machineを外しwork bindで作業先を選んでください");
  return withSession(cmd.opts, store, async c => {
    const hello = await c.hello(), ref = cmd.values["--pane"] ?? selfPaneId(cmd.opts);
    if (!ref) throw new RpcFailure("caller_pane_unknown", "呼出元のpaneを確認できません。--paneを指定してください");
    const paneId = resolvePaneRef(hello.snapshot, ref);
    const { binding } = await c.request("work.binding", { action: "get", paneId });
    if (!binding) throw new RpcFailure("not_found", "作業先がありません。work bindを実行してください");
    return { paneId, binding };
  });
}
export async function runWork(cmd: WorkCommand, store: SessionStore, input = workInput): Promise<void> {
  if (cmd.opts.machine) throw new RpcFailure("invalid_params", "workと--machineは併用できません。work bindで作業先を選んでください");
  if (cmd.action === "bind" || cmd.action === "status" || cmd.action === "unbind") {
    const result = await withSession(cmd.opts, store, async c => {
      const hello = await c.hello(), ref = cmd.values["--pane"] ?? selfPaneId(cmd.opts);
      if (!ref) throw new RpcFailure("caller_pane_unknown", "--paneを指定するかpane内で実行してください");
      const paneId = resolvePaneRef(hello.snapshot, ref);
      if (cmd.action !== "bind") return c.request("work.binding", { action: cmd.action === "unbind" ? "clear" : "get", paneId });
      const machines = (await c.request("machine.list", {})).machines;
      const matches = machines.filter(m => m.id === cmd.args[0] || m.label === cmd.args[0] || (cmd.args[0]!.length >= 4 && m.id.startsWith(cmd.args[0]!)));
      if (matches.length !== 1) throw new RpcFailure("not_found", "接続先マシンを一意に指定してください");
      const machineId = matches[0]!.id;
      if (matches[0]!.state !== "online") throw new RpcFailure("machine_unavailable", "接続先マシンが未接続です");
      const agentKind = cmd.values["--kind"] ?? hello.snapshot.panes.find(p => p.id === paneId)?.agentSession?.kind ?? hello.snapshot.panes.find(p => p.id === paneId)?.agent?.kind;
      if (agentKind !== "claude" && agentKind !== "codex") throw new RpcFailure("invalid_params", "--kind claude|codexを指定してください");
      const target = await withSession({ ...cmd.opts, machine: machineId }, store, async remote => {
        const snapshot = (await remote.hello()).snapshot, workspaceId = resolveWorkspaceRef(snapshot, cmd.args[1]!);
        const folder = snapshot.workspaces.find(w => w.id === workspaceId)?.projectDir;
        if (!folder) throw new RpcFailure("invalid_params", "接続先ワークスペースのPJを設定してください");
        const catalog = await remote.request("work.inspect", { workspaceId, expectedFolder: folder, agentKind });
        const binding: WorkBinding = { machineId, workspaceId, folder, root: catalog.root, identity: catalog.identity, agentKind, sourceSession: null };
        return { binding, catalog };
      });
      const saved = await c.request("work.binding", { action: "set", paneId, binding: target.binding });
      return { ...saved, ...target.catalog, instructionsForAgent: instructions(target.binding, paneId) };
    });
    printJson(result); return;
  }
  const { paneId, binding } = await workTarget(cmd, store);
  const targetOpts = { ...cmd.opts, machine: binding.machineId }, scope = { workspaceId: binding.workspaceId, expectedFolder: binding.folder, expectedRoot: binding.root, expectedIdentity: binding.identity, agentKind: binding.agentKind };
  if (cmd.action === "handoff") {
    const result = await withSession(cmd.opts, store, source => withSession(targetOpts, store, async remote => {
      const exported = await source.request("work.export_start", { paneId });
      if (exported.meta.kind !== binding.agentKind || (binding.sourceSession !== null && exported.meta.sessionId !== binding.sourceSession)) throw new RpcFailure("invalid_params", "会話が変わりました。work bindをやり直してください");
      const imported = await remote.request("work.import_start", { ...scope, meta: exported.meta });
      let offset = 0;
      for (;;) {
        const part = await source.request("work.export_read", { id: exported.id, offset });
        const received = await remote.request("work.import_chunk", { id: imported.id, offset, data: part.data });
        offset = received.offset;
        if (part.done) break;
      }
      return remote.request("work.import_finish", { id: imported.id });
    }));
    printJson(result); return;
  }
  if (cmd.action === "exec") {
    const result = await withSession(targetOpts, store, async c => {
      const { id } = await c.request("work.exec", { ...scope, command: cmd.args[0]!, timeoutMs: Number(cmd.values["--timeout"] ?? 30000), encoding: (cmd.values["--encoding"] ?? "utf-8") as "utf-8" | "shift_jis" | "utf-16le" });
      return readExec(c, id);
    });
    printExec(result); return;
  }
  const result = await withSession(targetOpts, store, async c => {
    if (cmd.action === "skills") return { ...(await c.request("work.inspect", scope)), instructionsForAgent: instructions(binding, paneId) };
    if (cmd.action === "skill") return { ...(await c.request("work.skill", { ...scope, id: cmd.args[0]!, path: cmd.values["--path"] ?? "SKILL.md" })), instructionsForAgent: instructions(binding, paneId) };
    if (cmd.action === "memory") return c.request("work.memory", { ...scope, sourcePaneId: paneId, action: cmd.args[0] as "list" | "read" | "write", name: cmd.args[1] ?? "MEMORY.md", ...(cmd.args[0] === "write" ? { content: await input() } : {}), ...(cmd.values["--version"] ? { version: cmd.values["--version"] } : {}) });
    if (cmd.action === "file") {
      return c.request("workspace.tools", { ...scope, operation: cmd.args[0] as "list" | "read" | "write" | "search", path: cmd.values["--path"] ?? "", ...(cmd.values["--query"] ? { query: cmd.values["--query"], grep: true } : {}), ...(cmd.values["--version"] ? { version: cmd.values["--version"] } : {}), ...(cmd.args[0] === "write" ? { content: await input(524288) } : {}) });
    }
    throw new RpcFailure("not_found", "handoff is not available");
  });
  printJson(result);
}
