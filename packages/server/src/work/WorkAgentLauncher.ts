import { createServer, type Socket } from "node:net";
import { chmod, rm } from "node:fs/promises";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { RpcError, WorkAgentTool, WorkAgentRequestSchema, workAgentArgumentError, checkWorkAgentAsk, type WorkFileRequest, type WorkFileResult, type WorkAgentProxyCloseReason } from "@sodashitsu/protocol";
import type { SessionService } from "../session/SessionService.js";
import type { AskService } from "../ask/AskService.js";
import type { AgentStarter } from "../agent/AgentStarter.js";
import { FileTransfer, copyWorkFile } from "./FileTransfer.js";
import { createExclusive, privateDirs } from "./files.js";

import { DesktopBridgeError } from "../desktop/bridgeRpc.js";
import { WorkAgentReconnect, type WorkAgentRemote, type WorkAgentConnectionCause } from "./WorkAgentReconnect.js";
import type { Logger } from "../log/Logger.js";
export type { WorkAgentRemote } from "./WorkAgentReconnect.js";

/** A owns the general machine channel; children receive only a fixed-scope IPC capability. */
export class WorkAgentLauncher {
  private readonly leases = new Set<(reason?: WorkAgentProxyCloseReason) => void>();
  private readonly active = new Set<string>();
  private stopped = false;
  constructor(private readonly stateDir: string, private readonly session: SessionService,
    private readonly starter: AgentStarter, private readonly connect: (machine: string) => Promise<WorkAgentRemote>,
    private readonly asks?: Pick<AskService, "open" | "onClientGone">,
    private readonly prompt?: (paneId:string,instanceId:string,text:string,signal:AbortSignal,guards:{prepare:()=>Promise<void>;check:()=>void})=>Promise<void>,
    private readonly options: { logger?: Pick<Logger,"info"|"warn">; reconnectGraceMs?: number } = {}) {}

  async launch(machineId: string, requestId: string) {
    if (this.stopped || this.leases.size >= 20) throw new RpcError("server_busy", "エージェント起動の上限です");
    let remote = await this.connect(machineId);
    let claim: string | undefined, cleanup: ((reason?: WorkAgentProxyCloseReason) => void) | undefined, activeKey: string | undefined, reserved = false;
    try {
      const claimed = await remote.request("work.agent_claim", { id: requestId });
      if (typeof claimed.claim !== "string" || !/^[a-f0-9-]{36}$/i.test(claimed.claim)) throw new RpcError("invalid_params", "接続先の起動要求が不正です");
      claim = claimed.claim;
      const parsed = WorkAgentRequestSchema.safeParse(claimed.request);
      if (!parsed.success || parsed.data.id !== requestId || parsed.data.state !== "claimed" || parsed.data.expiresAt <= Date.now()) throw new RpcError("invalid_params", "接続先の起動要求が不正です");
      const p = parsed.data, error = workAgentArgumentError(p.agentKind, p.args);
      if (error) throw new RpcError("invalid_params", error);
      activeKey = `${machineId}/${p.paneId}/${p.agentKind}${p.task?`/${requestId}`:""}`;
      if (this.active.has(activeKey)) throw new RpcError("server_busy", "この作業先のエージェントは起動済みです");
      if (this.active.size >= 20) throw new RpcError("server_busy", "エージェント起動の上限です");
      this.active.add(activeKey);
      reserved = true;
      const scope = { workspaceId: p.workspaceId, expectedFolder: p.folder, expectedRoot: p.root, expectedIdentity: p.identity, agentKind: p.agentKind };
      const projects = await privateDirs(this.stateDir, ["work-agents", "projects"]);
      const project = await privateDirs(projects, [createHash("sha256").update(activeKey).digest("hex")]);
      const directory = await privateDirs(this.stateDir, ["work-agents", "launches", randomUUID()]);
      const socketPath = process.platform === "win32" ? `\\\\.\\pipe\\soda-work-${randomUUID()}` : join(tmpdir(), `soda-work-${randomUUID()}.sock`);
      const secret = randomBytes(32).toString("hex"), sockets = new Set<Socket>();
      let closed = false, busy = false, paneId: string | undefined, launching = true, closeRequested = false;
      const abort = new AbortController();
      const agentName = `remote-${randomUUID().slice(0,8)}`;
      let agentInstance: string | undefined, reporting = false, reportFailed = false, reportTimer: ReturnType<typeof setInterval> | undefined;
      let job: { socket: Socket; cancelled: boolean; execId?: string; remote?: WorkAgentRemote; askOwner?: string } | undefined;
      const cancel = (socket: Socket) => {
        if (job?.socket !== socket) return;
        job.cancelled = true;
        if (job.askOwner) this.asks?.onClientGone(job.askOwner);
        if (job.execId) void job.remote?.request("exec.cancel", { id: job.execId }).catch(() => {});
      };
      let started: (() => void) | undefined, startFailed: (() => void) | undefined;
      const ready = new Promise<void>((resolve, reject) => { started = resolve; startFailed = () => reject(new RpcError("spawn_failed", "操作元のエージェントを起動できませんでした。新しいpaneの表示を確認してください")); });
      void ready.catch(() => {});
      const log = (event: string, reason?: WorkAgentProxyCloseReason, elapsedMs?: number, cause?:WorkAgentConnectionCause) => {
        this.options.logger?.info("work agent proxy lifecycle", { event, machineId, requestId, ...(paneId ? { paneId } : {}), ...(reason ? { reason } : {}), ...(elapsedMs !== undefined ? { elapsedMs } : {}), ...(cause ? { cause } : {}) });
      };
      const connection = new WorkAgentReconnect(remote, () => this.connect(machineId), async candidate => {
        await candidate.request("work.agent_check", { id: requestId, claim: claim! });
        const inspected = await candidate.request("work.inspect", scope);
        if (inspected.folder !== p.folder || inspected.root !== p.root || inspected.identity !== p.identity)
          throw new DesktopBridgeError("rejected", "作業先PJの再確認に失敗しました");
        await candidate.request("work.agent_check", { id: requestId, claim: claim! });
      }, event => log(event.event, event.reason, event.elapsedMs, event.cause), reason => cleanup?.(reason), this.options.reconnectGraceMs);
      remote = connection;
      const check = () => {
        if (closed || this.stopped) throw new RpcError("not_found", "作業先proxyは終了しています。接続先から起動し直してください");
        if (paneId && !this.session.getPane(paneId)) { cleanup?.("pane_closed"); throw new RpcError("not_found", "エージェントのpaneが閉じられました"); }
        if (!remote.valid()) throw new RpcError("not_found", "作業先との接続を再確認中です。操作は自動再送しません");
      };
      const ask = async (raw: unknown, owner: NonNullable<typeof job>) => {
        check();
        await remote.request("work.agent_check",{id:requestId,claim:claim!});
        if (!this.asks || !paneId) throw new RpcError("not_found", "操作元の質問フォームを利用できません");
        const params = checkWorkAgentAsk(raw), files: string[] = [];
        owner.askOwner = `work-agent-${randomUUID()}`;
        try {
          const view = [...params.view];
          for (const document of params.documents) {
            const file = join(directory, `ask-${randomUUID()}.md`);
            await createExclusive(file, document.markdown);
            files.push(file);
            view.push({ title: document.title, file });
          }
          await remote.request("work.agent_check",{id:requestId,claim:claim!});
          check();
          if (owner.cancelled) return { status: "cancelled" };
          return await this.asks.open(owner.askOwner, { paneId, timeoutMs: params.timeoutMs,
            spec: { ...params.spec, ...(view.length ? { view } : {}) } });
        } finally {
          this.asks.onClientGone(owner.askOwner);
          await Promise.allSettled(files.map(file => rm(file, { force: true })));
        }
      };
      const localTransfers = new FileTransfer();
      const execute = async (raw: unknown, owner: NonNullable<typeof job>) => {
        check();
        if (owner.cancelled) throw new RpcError("invalid_params", "操作は中断されました");
        const tool = WorkAgentTool.parse(raw);
        if (tool.operation === "transfer_chunk") throw new RpcError("invalid_params", "内部転送操作は直接呼び出せません");
        if (tool.operation === "transfer") {
          const transferCheck = async () => {
            check();
            if (owner.cancelled) throw new RpcError("invalid_params", "転送は中断されました");
            await remote.request("work.agent_check", { id: requestId, claim: claim! });
            check();
          };
          const local = (request: WorkFileRequest) => localTransfers.run(requestId, project, request, transferCheck, true);
          const distant = async (request: WorkFileRequest): Promise<WorkFileResult> => {
            check();
            if (owner.cancelled && request.action !== "abort") throw new RpcError("invalid_params", "転送は中断されました");
            return await remote.request("work.agent_tool", { id: requestId, claim: claim!, tool: { operation: "transfer_chunk", request } }) as WorkFileResult;
          };
          try {
            const result = tool.action === "upload"
              ? await copyWorkFile(local, distant, tool.sourcePath, tool.destinationPath)
              : await copyWorkFile(distant, local, tool.sourcePath, tool.destinationPath);
            return { status: "completed", direction: tool.action, source: tool.sourcePath, ...result };
          } catch (error) {
            return { status: "failed", direction: tool.action, source: tool.sourcePath, destination: tool.destinationPath,
              message: error instanceof Error ? error.message : "ファイル転送に失敗しました" };
          }
        }
        // B validates the original source pane, claim and project on every operation.
        if(tool.operation!=="exec")return remote.request("work.agent_tool",{id:requestId,claim:claim!,tool});
        // Each command owns a channel: closing it reaps retained output/jobs on B.
        const commandRemote = await this.connect(machineId);
        owner.remote = commandRemote;
        try {
          check();
          if (owner.cancelled) throw new RpcError("invalid_params", "操作は中断されました");
          const result=await commandRemote.request("work.agent_tool",{id:requestId,claim:claim!,tool}) as {id:string};
          const {id}=result;
          owner.execId = id;
          if (owner.cancelled) await commandRemote.request("exec.cancel", { id }).catch(() => {});
          for (;;) {
            check();
            const result = await commandRemote.request("exec.read", { id });
            if (result.status === "exited") return result;
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } finally { commandRemote.close(); }
      };
      const server = createServer(socket => {
        if (sockets.size >= 8) { socket.destroy(); return; }
        sockets.add(socket); socket.on("error", () => {}); socket.on("close", () => { sockets.delete(socket); cancel(socket); });
        socket.setEncoding("utf8"); let buffer = "";
        socket.on("data", chunk => {
          buffer += chunk;
          if (Buffer.byteLength(buffer) > 4 * 1024 * 1024) { socket.destroy(); return; }
          let end: number;
          while ((end = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
            let m: { id?: unknown; secret?: unknown; operation?: unknown; tool?: unknown };
            try { m = JSON.parse(line); } catch { socket.destroy(); return; }
            if (!m || typeof m.id !== "number" || !Number.isSafeInteger(m.id) || m.secret !== secret) { socket.destroy(); return; }
            const respond = (value: unknown) => { if (!socket.writable || socket.writableEnded) return; const line = JSON.stringify({ id: m.id, ...value as object }) + "\n"; if (socket.writableLength > 4 * 1024 * 1024 || Buffer.byteLength(line) > 4 * 1024 * 1024) socket.destroy(); else socket.write(line); };
            if (m.operation === "close") { respond({ result: {} }); closeRequested = true; startFailed?.(); if (!launching) setImmediate(() => cleanup?.("requested_close")); continue; }
            if (m.operation === "started") { respond({ result: {} }); started?.(); continue; }
            if (m.operation === "cancel") {
              if ((m.tool as {reason?:unknown} | undefined)?.reason === "operation_timeout") log("operation_timeout");
              cancel(socket); respond({ result: {} }); continue;
            }
            if (busy) { respond({ error: "別のremote操作が実行中です" }); continue; }
            busy = true;
            const owner: NonNullable<typeof job> = { socket, cancelled: false }; job = owner;
            void (async () => {
              try {
                await connection.ready(); check();
                if (m.operation === "describe") respond({ result: { agentKind: p.agentKind, args: p.args, cwd: project, machineId, workspaceId: p.workspaceId, folder: p.folder, ...(p.task?{task:p.task}:{}) } });
                else if (m.operation === "ask") respond({ result: await ask(m.tool, owner) });
                else if (m.operation === "tool") respond({ result: await execute(m.tool, owner) });
                else respond({ error: "Unknown work agent operation" });
              } catch (e) {
                // Exec owns a separate raw channel; recheck authority on its rejection too.
                if (owner.remote && e instanceof DesktopBridgeError && e.reason === "rejected")
                  await remote.request("work.agent_check", { id: requestId, claim: claim! }).catch(() => {});
                if (e instanceof DesktopBridgeError && e.reason !== "rejected") log("operation_interrupted");
                respond({ error: e instanceof RpcError ? e.message : e instanceof DesktopBridgeError && e.reason !== "rejected"
                  ? "作業先への操作の結果を確認できません。自動再送はしません。接続復旧後に読み取りで状態を確認してください"
                  : "接続先の操作に失敗しました。接続とPJを確認してください" });
              }
              finally { busy = false; if (job === owner) job = undefined; }
            })();
          }
        });
      });
      const timer = setInterval(() => {
        if (paneId && !this.session.getPane(paneId)) cleanup?.("pane_closed");
        else void connection.ready().catch(() => {});
      }, 5000); timer.unref();
      const expiry = setTimeout(() => cleanup?.("lease_expired"), 24 * 60 * 60 * 1000); expiry.unref();
      cleanup = (reason = "requested_close") => {
        if (closed) return; closed = true;
        log("closed", reason);
        abort.abort(); void localTransfers.close(); if(reportTimer)clearInterval(reportTimer);
        clearInterval(timer); clearTimeout(expiry);
        if (job?.askOwner) this.asks?.onClientGone(job.askOwner);
        job?.remote?.close();
        for (const s of sockets) {
          s.end(JSON.stringify({ type: "proxy_closed", reason }) + "\n");
          const force = setTimeout(() => s.destroy(), 1000); force.unref();
        }
        server.close(); remote.close();
        this.active.delete(activeKey!); this.leases.delete(cleanup!);
        void rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
        if (process.platform !== "win32") void rm(socketPath, { force: true });
      };
      this.leases.add(cleanup);
      await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(socketPath, () => { server.off("error", reject); resolve(); }); });
      server.on("error", () => cleanup?.("proxy_error"));
      if (process.platform !== "win32") await chmod(socketPath, 0o600);
      const config = join(directory, "capability.json");
      await createExclusive(config, JSON.stringify({ socketPath, secret }));
      await remote.request("work.inspect", scope); check();
      const created = await this.session.createWorkspace(project, `Remote ${p.agentKind} ${p.paneId.slice(0, 8)}`); paneId = created.pane.id;
      const markers = await privateDirs(this.stateDir, ["work-agents", "panes"]);
      await createExclusive(join(markers, paneId), "Restart with sodactl work agent; plain native resume is not allowed.\n");
      const cli = fileURLToPath(new URL("../../../cli/dist/main.js", import.meta.url));
      // Wait for the freshly spawned shell to become inspectable. Never type into a busy pane.
      for (let i = 0; i < 40 && !await this.starter.isShellAvailable(paneId); i++) await new Promise(resolve => setTimeout(resolve, 100));
      check();
      await this.starter.start({ paneId, kind: p.agentKind, name: agentName, args: [] }, undefined,
        { skipInterrupt: true, command: { executable: process.execPath, args: [cli, "work-agent-run", config] } });
      const bootTimer = setTimeout(() => startFailed?.(), 30000);
      try { await ready; } finally { clearTimeout(bootTimer); }
      await remote.request("work.agent_finish", { id: requestId, claim, state: "launched" });
      if(p.task){
        const report=async()=>{
          if(reporting||closed)return;reporting=true;
          try{
            await connection.ready();check();const agent=this.session.getPane(paneId!)?.agent;
            if(!agentInstance && agent?.kind===p.agentKind && agent.name===agentName)agentInstance=agent.instanceId;
            const same=agentInstance && agent?.instanceId===agentInstance;
            const state=same&&agent!.state!=="unknown"?agent!.state:agentInstance&&!same?"stopped":"starting";
            const result=await remote.request("work.agent_poll",{id:requestId,claim:claim!,paneId:paneId!,state});
            reportFailed=false;
            if(result.instruction){
              const instruction=result.instruction;let message:string|undefined;
              try{
                check();
                const current=this.session.getPane(paneId!)?.agent;
                if(!this.prompt||!agentInstance||current?.instanceId!==agentInstance||current.state!=="idle")throw new RpcError("agent_not_found","同じ担当の入力待ちを確認できません");
                await this.prompt(paneId!,agentInstance,`追加指示です。remote_workで接続先PJの ${JSON.stringify(instruction.taskFile)} を読み、進めてください。`,abort.signal,
                  {prepare:async()=>{check();await remote.request("work.agent_check",{id:requestId,claim:claim!});check();},check});
              }catch{message="送信・受信状態を操作元で確認してください。自動再送はしません";}
              await remote.request("work.agent_instruction_result",{id:requestId,claim:claim!,instructionId:instruction.id,state:message?"failed":"sent",...(message?{message}:{})});
            }
            if(state==="stopped")cleanup?.("agent_stopped");
          }catch{
            if (connection.valid()) { if(!reportFailed)log("status_report_failed");reportFailed=true; }
            else void connection.ready().catch(() => {});
          }
          finally{reporting=false;}
        };
        reportTimer=setInterval(()=>void report(),3000);reportTimer.unref();void report();
      }
      launching = false; if (closeRequested) cleanup("requested_close");
      return { workspaceId: created.workspace.id, tabId: created.tab.id, paneId };
    } catch (e) {
      if (claim) await remote.request("work.agent_finish", { id: requestId, claim, state: "failed" }).catch(() => {});
      cleanup?.("launch_failed"); if (activeKey && reserved) this.active.delete(activeKey); remote.close(); throw e;
    }
  }
  close(reason: WorkAgentProxyCloseReason = "server_stopped") { this.stopped = true; for (const close of [...this.leases]) close(reason); }
}
