import { z } from "zod";
import { PreviewId, PreviewOrigin, PREVIEW_READ_BYTES, RpcError } from "@sodashitsu/protocol";
import { LoopbackGateway } from "@sodashitsu/client-core/preview/LoopbackGateway";
import { rpcPreviewTransport, type PreviewRpc } from "@sodashitsu/client-core/preview/RpcPreviewTransport";

const Scope = z.object({ origin: PreviewOrigin, httpReadMaxBytes: z.number().int().min(1).max(PREVIEW_READ_BYTES).optional() });
const Work = z.object({active:z.array(PreviewId).max(32),jobs:z.array(z.object({requestId:PreviewId})).max(32)});
type Client = PreviewRpc & { close(): void };
type Entry = { owner: string; machine: string; viewer: string; stopped: boolean; client?: Client; gateways: Map<string, LoopbackGateway>; ready: Promise<void>; done: Promise<void> };
/** Controller-side helpers own only loopback gateways, never PTYs or shell commands. */
export class ManagedPreviewHelpers {
  private entries = new Map<string, Entry>();
  private closing = new Set<Promise<void>>();
  private disposed = false;
  constructor(private connect: (machine: string, gone: () => void) => Promise<Client>) {}
  async start(owner: string, machine: string, viewer: string): Promise<void> {
    if (this.disposed) throw new RpcError("not_found", "preview helper stopped");
    const key = JSON.stringify([owner, viewer]);
    const old = this.entries.get(key);
    if (old) {
      if (old.machine !== machine) throw new RpcError("invalid_params", "viewer target changed");
      return old.ready;
    }
    if (this.entries.size >= 32 || [...this.entries.values()].filter(e => e.owner === owner).length >= 8)
      throw new RpcError("server_busy", "preview helper limit");
    let resolve!: () => void, reject!: (e: unknown) => void;
    const ready = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    const entry: Entry = { owner, machine, viewer, stopped: false, gateways: new Map(), ready, done: Promise.resolve() };
    this.entries.set(key, entry);
    entry.done = (async () => {
      try {
        entry.client = await this.connect(machine, () => { void this.stop(owner, viewer); });
        if (entry.stopped) throw new Error("preview cancelled");
        const scope = Scope.parse(await entry.client.request("preview.helper", {viewerId: viewer}));
        if (entry.stopped) throw new Error("preview cancelled");
        resolve();
        while (!entry.stopped) {
          const work = Work.parse(await entry.client.request("preview.work", {}));
          for (const [id, gateway] of entry.gateways) if (!work.active.includes(id)) {
            await gateway.close(); entry.gateways.delete(id);
          }
          for (const job of work.jobs) {
            let gateway: LoopbackGateway | undefined;
            try {
              if (entry.stopped) break;
              if (entry.gateways.has(job.requestId)) continue;
              if (entry.gateways.size >= 32) break;
              gateway = await LoopbackGateway.listen(rpcPreviewTransport(entry.client, job.requestId, scope.httpReadMaxBytes), scope.origin);
              if (entry.stopped) { await gateway.close(); break; }
              entry.gateways.set(job.requestId, gateway);
              await entry.client.request("preview.ready", {requestId: job.requestId, ...gateway.bootstrap()});
            } catch { await gateway?.close(); entry.gateways.delete(job.requestId); }
          }
          if (!entry.stopped) await new Promise<void>(r => setTimeout(r, 250));
        }
      } catch (e) { reject(e); }
      finally {
        entry.stopped = true;
        entry.client?.close();
        await Promise.all([...entry.gateways.values()].map(g => g.close()));
        entry.gateways.clear();
        if (this.entries.get(key) === entry) this.entries.delete(key);
      }
    })();
    return ready;
  }
  async stop(owner: string, viewer: string): Promise<void> {
    const key = JSON.stringify([owner, viewer]), entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key); entry.stopped = true;
    entry.client?.close();
    this.closing.add(entry.done);
    try { await entry.done; } finally { this.closing.delete(entry.done); }
  }
  clientGone(owner: string): void {
    for (const entry of [...this.entries.values()]) if (entry.owner === owner) void this.stop(owner, entry.viewer);
  }
  async dispose(): Promise<void> {
    this.disposed = true;
    await Promise.all([...this.entries.values()].map(e => this.stop(e.owner, e.viewer)));
    await Promise.all(this.closing);
  }
}
