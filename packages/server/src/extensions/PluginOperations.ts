import { randomUUID } from "node:crypto";
import {
  RpcError,
  PluginRegisterSchema,
  PluginResultSchema,
  type PluginOperation,
  type PluginTarget,
  type PluginCall,
  type PluginOperationsResult,
  type ExtPane,
  type ExtLine,
  type ExtRequest,
} from "@sodashitsu/protocol";

interface Runtime {
  runId: string;
  panes: ExtPane[];
  send: (line: ExtLine) => boolean;
}
/** Correlates requests with one live extension process and one scoped app instance. */
export class PluginOperations {
  private readonly operations = new Map<string, { runId: string; operations: PluginOperation[] }>();
  private readonly pending = new Map<
    string,
    {
      key: string;
      runId: string;
      target: PluginOperationsResult;
      timer: ReturnType<typeof setTimeout>;
      resolve: (v: { result: unknown }) => void;
      reject: (e: Error) => void;
    }
  >();
  constructor(private readonly runtime: (key: string) => Runtime | undefined) {}
  handle(key: string, runId: string, req: ExtRequest): boolean {
    if (req.method !== "app.register" && req.method !== "app.result") return false;
    const run = this.runtime(key);
    if (!run || run.runId !== runId) return true;
    const reply = (ok: boolean, result: unknown) => {
      if (req.id !== undefined)
        run.send(
          ok
            ? { type: "ext.result", id: req.id, ok: true, result }
            : {
                type: "ext.result",
                id: req.id,
                ok: false,
                error: { code: "invalid_params", message: "プラグイン操作の指定が不正です" },
              },
        );
    };
    if (req.method === "app.register") {
      const parsed = PluginRegisterSchema.safeParse(req.params);
      if (!parsed.success) {
        reply(false, {});
        return true;
      }
      this.operations.set(key, { runId, operations: parsed.data.operations });
      reply(true, {});
      return true;
    }
    const parsed = PluginResultSchema.safeParse(req.params);
    if (!parsed.success) {
      reply(false, {});
      return true;
    }
    const p = this.pending.get(parsed.data.callId);
    if (!p || p.key !== key || p.runId !== runId) {
      reply(false, {});
      return true;
    }
    clearTimeout(p.timer);
    this.pending.delete(parsed.data.callId);
    const still = run.panes.find(
      (x) =>
        x.id === p.target.paneId &&
        x.tabId === p.target.tabId &&
        x.workspaceId === p.target.workspaceId &&
        this.attached(key, x),
    );
    if (!still)
      p.reject(new RpcError("not_found", "対象のプラグイン画面が移動または閉じられました"));
    else if (parsed.data.ok) p.resolve({ result: parsed.data.result ?? null });
    else
      p.reject(new RpcError("invalid_params", parsed.data.error || "プラグイン操作に失敗しました"));
    reply(true, {});
    return true;
  }
  private attached(key: string, p: ExtPane) {
    return p.plugin?.extensionKey === key || p.views?.some((v) => v.extensionKey === key);
  }
  list(target: PluginTarget): PluginOperationsResult {
    const r = this.runtime(target.key),
      defs = this.operations.get(target.key);
    if (!r || !defs || defs.runId !== r.runId)
      throw new RpcError(
        "not_found",
        "プラグインが操作を公開していません（有効化と起動状態を確認してください）",
      );
    const panes = r.panes.filter(
      (p) =>
        this.attached(target.key, p) &&
        (!target.paneId || p.id === target.paneId) &&
        (!target.tabId || p.tabId === target.tabId) &&
        (!target.workspaceId || p.workspaceId === target.workspaceId),
    );
    if (panes.length !== 1)
      throw new RpcError(
        "invalid_params",
        panes.length
          ? "複数のプラグイン画面があります。paneを指定してください"
          : "対象のプラグイン画面がありません",
      );
    const p = panes[0]!;
    if (!p.tabId) throw new RpcError("not_found", "対象のタブがありません");
    return {
      key: target.key,
      paneId: p.id,
      tabId: p.tabId,
      workspaceId: p.workspaceId!,
      operations: defs.operations,
    };
  }
  call(params: PluginCall): Promise<{ result: unknown }> {
    const target = this.list(params),
      run = this.runtime(params.key)!;
    if (!target.operations.some((o) => o.name === params.operation))
      throw new RpcError("not_found", "公開されていないプラグイン操作です");
    if (this.pending.size >= 32)
      throw new RpcError("invalid_params", "プラグイン操作の同時実行上限です");
    const callId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(callId);
        reject(
          new RpcError(
            "invalid_params",
            "プラグイン操作が時間内に応答しませんでした。実行済みの場合があるため、状態を確認してください",
          ),
        );
      }, 30_000);
      this.pending.set(callId, {
        key: params.key,
        runId: run.runId,
        target,
        timer,
        resolve,
        reject,
      });
      if (
        !run.send({
          type: "app.call",
          callId,
          operation: params.operation,
          params: params.params,
          target: { paneId: target.paneId, tabId: target.tabId, workspaceId: target.workspaceId },
        })
      ) {
        clearTimeout(timer);
        this.pending.delete(callId);
        reject(new RpcError("not_found", "プラグインへ操作を送信できません"));
      }
    });
  }
  stopped(key: string, runId: string) {
    if (this.operations.get(key)?.runId === runId) this.operations.delete(key);
    for (const [id, p] of this.pending)
      if (p.key === key && p.runId === runId) {
        clearTimeout(p.timer);
        this.pending.delete(id);
        p.reject(
          new RpcError("not_found", "プラグインが停止しました。操作が実行済みか確認してください"),
        );
      }
  }
}
