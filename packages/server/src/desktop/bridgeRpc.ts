import { RpcError, type MethodName, type ParamsOf, type ResultOf } from "@sodashitsu/protocol";
import type { LinkChannel } from "../machine/MachineLink.js";

/** Owns one existing machine channel until the desktop share ends. Closing it revokes B's work. */
export class DesktopBridgeRpc {
  private counter = 0;
  private closed = false;
  private readonly pending = new Map<
    string,
    { resolve(v: unknown): void; reject(e: Error): void; timer: ReturnType<typeof setTimeout> }
  >();
  constructor(
    private readonly channel: LinkChannel,
    onClose: () => void,
    private readonly options: { closeOnTimeout?: boolean; label?: string } = {},
  ) {
    channel.onText((text) => {
      if (text.length > 4 * 1024 * 1024) {
        this.close();
        return;
      }
      try {
        const msg = JSON.parse(text) as {
          id?: string;
          result?: unknown;
          error?: { message?: string };
        };
        if (!msg.id) return;
        const p = this.pending.get(msg.id);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`リモートの${this.options.label ?? "デスクトップ"}要求が拒否されました`));
        else p.resolve(msg.result);
      } catch {
        this.close();
      }
    });
    channel.onClose(() => {
      this.finish();
      onClose();
    });
  }
  async hello(): Promise<void> {
    await this.request("client.hello", { protocol: 1, kind: "external" });
  }
  request<M extends MethodName>(method: M, params: ParamsOf<M>, opts?: {timeoutMs?: number}): Promise<ResultOf<M>> {
    if (this.closed) return Promise.reject(new RpcError("not_found", "マシンが切断されました"));
    return new Promise((resolve, reject) => {
      const id = String(++this.counter);
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${this.options.label ?? "デスクトップ"}要求が時間切れになりました`));
        if (this.options.closeOnTimeout !== false) this.close();
      }, Math.max(1, Math.min(35000, opts?.timeoutMs ?? 10000)));
      timer.unref();
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.channel.sendText(JSON.stringify({ id, method, params }));
    });
  }
  close(): void {
    this.finish();
    this.channel.close(1000, "desktop stopped");
  }
  private finish(): void {
    if (this.closed) return;
    this.closed = true;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("マシンが切断されました"));
    }
    this.pending.clear();
  }
}
