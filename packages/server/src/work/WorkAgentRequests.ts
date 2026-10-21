import { randomUUID } from "node:crypto";
import { RpcError, workAgentArgumentError, type WorkAgentRequest } from "@sodashitsu/protocol";
import type { WorkContext } from "./WorkContext.js";
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, join, sep } from "node:path";
import type { WorkAgentPlugin, WorkAgentState } from "@sodashitsu/protocol";
import type { z } from "zod";

export async function checkTaskFile(root: string, path: string) {
  if (!path || path.length > 4096 || isAbsolute(path) || /[\x00-\x1f\x7f]/.test(path) || path.split(/[\\/]/).some(s => !s || s === "." || s === ".."))
    throw new RpcError("invalid_params", "指示ファイルはPJ内の相対パスで指定してください");
  const file = join(root, path), stat = await lstat(file);
  if (!stat.isFile() || stat.size > 65536 || !(await realpath(file)).startsWith(root + sep))
    throw new RpcError("invalid_params", "指示ファイルはPJ内の64KiB以下の通常ファイルが必要です");
}
interface Instruction { id: string; taskFile: string; state: "queued" | "delivering" | "sent" | "failed"; message?: string }
interface PluginTask {
  owner: string; valid: () => void;
  invoke: (request: z.infer<typeof WorkAgentPlugin>) => Promise<unknown>;
  agent?: { paneId: string; state: z.infer<typeof WorkAgentState>; updatedAt: number };
  instruction?: Instruction;
  receipts?: Map<string,Instruction>;
}

/** Volatile requests on B. They never authorize execution on A by themselves. */
export class WorkAgentRequests {
  private readonly entries = new Map<string, { request: WorkAgentRequest; claim?: string; plugin?: PluginTask }>();
  constructor(private readonly work: WorkContext, private readonly pane: (id: string) => { workspaceId: string } | undefined,
    private readonly folder: (workspace: string) => string | undefined, private readonly now = Date.now) {}
  list(paneId?: string) {
    for (const [id, e] of this.entries) {
      let valid = true; try { e.plugin?.valid(); } catch { valid = false; }
      if (!valid || e.request.expiresAt <= this.now() || !this.pane(e.request.paneId)) this.entries.delete(id);
    }
    return { requests: [...this.entries.values()].map(e => ({ ...e.request, args: [...e.request.args] })).filter(r => !paneId || r.paneId === paneId) };
  }
  async create(p: { paneId: string; agentKind: "claude" | "codex"; args: string[] }, plugin?: PluginTask & { taskFile: string; pluginKey: string }): Promise<WorkAgentRequest> {
    this.list();
    const error = workAgentArgumentError(p.agentKind, p.args);
    if (error) throw new RpcError("invalid_params", error);
    const pane = this.pane(p.paneId), folder = pane && this.folder(pane.workspaceId);
    if (!pane || !folder) throw new RpcError("invalid_params", "起動したpaneのワークスペースにPJフォルダを設定してください");
    const inspection = await this.work.inspect({ workspaceId: pane.workspaceId, expectedFolder: folder, agentKind: p.agentKind });
    if (plugin) { await checkTaskFile(inspection.root, plugin.taskFile); plugin.valid(); }
    if (this.pane(p.paneId)?.workspaceId !== pane.workspaceId || this.folder(pane.workspaceId) !== folder)
      throw new RpcError("invalid_params", "起動中にPC/PJが変わりました");
    this.list();
    if (this.entries.size >= 100 || [...this.entries.values()].some(e => e.request.paneId === p.paneId && ["pending", "claimed"].includes(e.request.state)))
      throw new RpcError("server_busy", "このpaneには受付中の起動要求があります");
    const request: WorkAgentRequest = { id: randomUUID(), paneId: p.paneId, workspaceId: pane.workspaceId, folder,
      root: inspection.root, identity: inspection.identity, agentKind: p.agentKind, args: [...p.args], expiresAt: this.now() + 600000, state: "pending",
      ...(plugin ? { task: { pluginKey: plugin.pluginKey, taskFile: plugin.taskFile } } : {}) };
    this.entries.set(request.id, { request, ...(plugin ? { plugin } : {}) });
    return { ...request, args: [...request.args] };
  }
  async claim(id: string) {
    this.list(); const e = this.entries.get(id);
    if (!e || e.request.state !== "pending") throw new RpcError("not_found", "起動要求は期限切れ、または受付済みです");
    const p = e.request;
    await this.work.scope({ workspaceId: p.workspaceId, expectedFolder: p.folder, expectedRoot: p.root, expectedIdentity: p.identity, agentKind: p.agentKind });
    e.plugin?.valid();
    if (e.request.state !== "pending" || !this.entries.has(id) || p.expiresAt <= this.now() || this.pane(p.paneId)?.workspaceId !== p.workspaceId)
      throw new RpcError("not_found", "起動要求が変わりました");
    e.request.state = "claimed"; e.claim = randomUUID();
    return { request: { ...e.request, args: [...e.request.args] }, claim: e.claim };
  }
  finish(id: string, claim: string, state: "launched" | "failed") {
    this.list(); const e = this.entries.get(id);
    if (!e || e.claim !== claim || e.request.state !== "claimed") throw new RpcError("not_found", "起動要求がありません");
    e.request.state = state;
    if (state === "launched" && e.plugin) e.request.expiresAt = this.now() + 24 * 60 * 60 * 1000;
    return {};
  }
  reject(id: string) {
    this.list(); const e = this.entries.get(id);
    if (!e || e.request.state !== "pending") throw new RpcError("not_found", "受付中の起動要求がありません");
    e.request.state = "rejected"; return {};
  }
  status(owner: string, paneId: string, id: string) {
    this.list(); const e = this.entries.get(id);
    if (!e?.plugin || e.plugin.owner !== owner || e.request.paneId !== paneId) throw new RpcError("not_found", "このプラグインの依頼がありません");
    const { request, plugin } = e;
    return { requestId: id, execution: "operator" as const, kind: request.agentKind, status: request.state,
      ...(plugin.agent ? { agent: { ...plugin.agent }, connection: this.now() - plugin.agent.updatedAt <= 15000 ? "online" : "stale" } : {}),
      ...(plugin.instruction ? { instruction: { ...plugin.instruction } } : {}) };
  }
  async prompt(owner: string, paneId: string, id: string, taskFile: string) {
    const status = this.status(owner, paneId, id), e = this.entries.get(id)!;
    const receipt=e.plugin!.receipts?.get(taskFile);
    if (receipt) return {...status,instruction:{...receipt}}; // immutable receipt; never silently resend uncertain input
    if (status.status !== "launched" || status.connection !== "online" || status.agent?.state === "stopped") throw new RpcError("not_found", "操作元の担当が接続されていません");
    if (e.plugin!.instruction && ["queued", "delivering"].includes(e.plugin!.instruction.state)) throw new RpcError("server_busy", "前の追加指示の受信状態を確認してください");
    await this.validate(id, e.claim!);
    await checkTaskFile(e.request.root, taskFile);
    await this.validate(id, e.claim!);
    // A concurrent call may have queued an instruction during filesystem checks.
    const currentReceipt=e.plugin!.receipts?.get(taskFile);
    if(currentReceipt)return {...this.status(owner,paneId,id),instruction:{...currentReceipt}};
    if (e.plugin!.instruction && ["queued", "delivering"].includes(e.plugin!.instruction.state)) throw new RpcError("server_busy", "追加指示は受付中です");
    if((e.plugin!.receipts?.size??0)>=128)throw new RpcError("server_busy","追加指示の件数上限です。新しい担当を起動してください");
    e.plugin!.instruction = { id: randomUUID(), taskFile, state: "queued" };
    (e.plugin!.receipts??=new Map()).set(taskFile,e.plugin!.instruction);
    return this.status(owner, paneId, id);
  }
  private async validate(id: string, claim: string) {
    this.list(); const e = this.entries.get(id);
    if (!e || e.claim !== claim || !["claimed", "launched"].includes(e.request.state)) throw new RpcError("not_found", "担当の接続は終了しました");
    const p = e.request;
    await this.work.scope({ workspaceId: p.workspaceId, expectedFolder: p.folder, expectedRoot: p.root, expectedIdentity: p.identity, agentKind: p.agentKind });
    e.plugin?.valid();
    if (this.entries.get(id) !== e || p.expiresAt<=this.now() || this.pane(p.paneId)?.workspaceId !== p.workspaceId) throw new RpcError("not_found", "依頼元が変わりました");
    return e;
  }
  async poll(id: string, claim: string, paneId: string, state: z.infer<typeof WorkAgentState>) {
    const e = await this.validate(id, claim);
    if (!e.plugin) return {};
    e.plugin.agent = { paneId, state, updatedAt: this.now() };
    const instruction = e.plugin.instruction;
    if (instruction?.state !== "queued" || state !== "idle") return {};
    instruction.state = "delivering";
    return { instruction: { id: instruction.id, taskFile: instruction.taskFile } };
  }
  async instructionResult(id: string, claim: string, instructionId: string, state: "sent" | "failed", message?: string) {
    const e = await this.validate(id, claim), instruction = e.plugin?.instruction;
    if (!instruction || instruction.id !== instructionId || instruction.state !== "delivering") throw new RpcError("not_found", "受付中の指示がありません");
    instruction.state = state; if (message) instruction.message = message;
    return {};
  }
  async plugin(id: string, claim: string, request: z.infer<typeof WorkAgentPlugin>) {
    const e = await this.validate(id, claim);
    if (!e.plugin) throw new RpcError("not_found", "この担当にはプラグインが紐付いていません");
    return e.plugin.invoke(request);
  }
  async check(id: string, claim: string) { await this.validate(id,claim); return {}; }
  async operate<T>(id:string,claim:string,operation:(scope:{workspaceId:string;expectedFolder:string;expectedRoot:string;expectedIdentity:string;agentKind:"claude"|"codex"},sourcePaneId:string,guard:()=>void)=>Promise<T>) {
    const e=await this.validate(id,claim),p=e.request;
    const guard=()=>{
      e.plugin?.valid();
      if(this.entries.get(id)!==e || p.expiresAt<=this.now() || this.pane(p.paneId)?.workspaceId!==p.workspaceId || this.folder(p.workspaceId)!==p.folder)
        throw new RpcError("not_found","依頼元の接続・PJが変わりました");
    };
    guard();
    const result=await operation({workspaceId:p.workspaceId,expectedFolder:p.folder,expectedRoot:p.root,expectedIdentity:p.identity,agentKind:p.agentKind},p.paneId,guard);
    guard();return result;
  }
}
