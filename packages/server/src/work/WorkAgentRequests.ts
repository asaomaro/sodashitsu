import { randomUUID } from "node:crypto";
import { RpcError, workAgentArgumentError, type WorkAgentRequest } from "@sodashitsu/protocol";
import type { WorkContext } from "./WorkContext.js";

/** Volatile requests on B. They never authorize execution on A by themselves. */
export class WorkAgentRequests {
  private readonly entries = new Map<string, { request: WorkAgentRequest; claim?: string }>();
  constructor(private readonly work: WorkContext, private readonly pane: (id: string) => { workspaceId: string } | undefined,
    private readonly folder: (workspace: string) => string | undefined, private readonly now = Date.now) {}
  list(paneId?: string) {
    for (const [id, e] of this.entries) if (e.request.expiresAt <= this.now() || !this.pane(e.request.paneId)) this.entries.delete(id);
    return { requests: [...this.entries.values()].map(e => ({ ...e.request, args: [...e.request.args] })).filter(r => !paneId || r.paneId === paneId) };
  }
  async create(p: { paneId: string; agentKind: "claude" | "codex"; args: string[] }): Promise<WorkAgentRequest> {
    this.list();
    const error = workAgentArgumentError(p.agentKind, p.args);
    if (error) throw new RpcError("invalid_params", error);
    const pane = this.pane(p.paneId), folder = pane && this.folder(pane.workspaceId);
    if (!pane || !folder) throw new RpcError("invalid_params", "起動したpaneのワークスペースにPJフォルダを設定してください");
    const inspection = await this.work.inspect({ workspaceId: pane.workspaceId, expectedFolder: folder, agentKind: p.agentKind });
    if (this.pane(p.paneId)?.workspaceId !== pane.workspaceId || this.folder(pane.workspaceId) !== folder)
      throw new RpcError("invalid_params", "起動中にPC/PJが変わりました");
    this.list();
    if (this.entries.size >= 100 || [...this.entries.values()].some(e => e.request.paneId === p.paneId && ["pending", "claimed"].includes(e.request.state)))
      throw new RpcError("server_busy", "このpaneには受付中の起動要求があります");
    const request: WorkAgentRequest = { id: randomUUID(), paneId: p.paneId, workspaceId: pane.workspaceId, folder,
      root: inspection.root, identity: inspection.identity, agentKind: p.agentKind, args: [...p.args], expiresAt: this.now() + 600000, state: "pending" };
    this.entries.set(request.id, { request });
    return { ...request, args: [...request.args] };
  }
  async claim(id: string) {
    this.list(); const e = this.entries.get(id);
    if (!e || e.request.state !== "pending") throw new RpcError("not_found", "起動要求は期限切れ、または受付済みです");
    const p = e.request;
    await this.work.scope({ workspaceId: p.workspaceId, expectedFolder: p.folder, expectedRoot: p.root, expectedIdentity: p.identity, agentKind: p.agentKind });
    if (e.request.state !== "pending" || !this.entries.has(id) || p.expiresAt <= this.now() || this.pane(p.paneId)?.workspaceId !== p.workspaceId)
      throw new RpcError("not_found", "起動要求が変わりました");
    e.request.state = "claimed"; e.claim = randomUUID();
    return { request: { ...e.request, args: [...e.request.args] }, claim: e.claim };
  }
  finish(id: string, claim: string, state: "launched" | "failed") {
    this.list(); const e = this.entries.get(id);
    if (!e || e.claim !== claim || e.request.state !== "claimed") throw new RpcError("not_found", "起動要求がありません");
    e.request.state = state; return {};
  }
  reject(id: string) {
    this.list(); const e = this.entries.get(id);
    if (!e || e.request.state !== "pending") throw new RpcError("not_found", "受付中の起動要求がありません");
    e.request.state = "rejected"; return {};
  }
}
