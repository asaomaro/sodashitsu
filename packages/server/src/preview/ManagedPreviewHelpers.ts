import { LocalPreviewProbe } from "./LocalPreviewProbe.js";
import { z } from "zod";
import { PreviewId, PreviewOrigin, PREVIEW_READ_BYTES, RpcError, type PreviewHelperProbe } from "@sodashitsu/protocol";
import { LoopbackGateway } from "@sodashitsu/client-core/preview/LoopbackGateway";
import { rpcPreviewTransport, type PreviewRpc } from "@sodashitsu/client-core/preview/RpcPreviewTransport";

const Scope = z.object({ origin: PreviewOrigin, httpReadMaxBytes: z.number().int().min(1).max(PREVIEW_READ_BYTES).optional() });
const Work = z.object({active:z.array(PreviewId).max(32),jobs:z.array(z.object({requestId:PreviewId})).max(32)});
type Client = PreviewRpc & { close(): void };
type Entry = { owner: string; machine: string; viewer: string; stopped: boolean; client?: Client; gateways: Map<string, LoopbackGateway>; ready: Promise<void>; done: Promise<void> };
type ProbeEntry = { owner: string; machine: string; viewer: string; stopped: boolean; expiresAt: number; client?: Client; local?: LocalPreviewProbe; timer: ReturnType<typeof setTimeout>; ready: Promise<PreviewHelperProbe> };
/** Controller-side helpers own only loopback gateways, never PTYs or shell commands. */
export class ManagedPreviewHelpers {
  private entries = new Map<string, Entry>();
  private probes = new Map<string, ProbeEntry>();
  private pendingProbes = new Map<Promise<PreviewHelperProbe>, ProbeEntry>();
  private closing = new Set<Promise<void>>();
  private disposed = false;
  constructor(private connect: (machine: string, gone: () => void) => Promise<Client>) {}
  async probe(owner: string, machine: string, viewer: string): Promise<PreviewHelperProbe> {
    if (this.disposed) throw new RpcError("not_found", "preview helper stopped");
    const key = JSON.stringify([owner, viewer]), old = this.probes.get(key);
    if (old) {
      if (old.machine !== machine) throw new RpcError("invalid_params", "viewer target changed");
      return old.ready;
    }
    const reserved = new Set([...this.probes.values(), ...this.pendingProbes.values()]);
    if (reserved.size >= 32 || [...reserved].filter(p => p.owner === owner).length >= 2)
      throw new RpcError("server_busy", "preview probe limit");
    const entry: ProbeEntry = {owner, machine, viewer, stopped:false, expiresAt:Date.now()+30_000, timer:setTimeout(() => { void this.closeProbe(key, entry); }, 30_000), ready:Promise.resolve(undefined!)};
    entry.timer.unref();
    this.probes.set(key, entry);
    entry.ready = (async () => {
      let released = false;
      try {
        entry.client = await this.connect(machine, () => { if (!released) void this.closeProbe(key, entry); });
        if (entry.stopped) throw new Error("preview cancelled");
        // Inspect without attaching: an unproven helper must not claim the viewer.
        const result = z.object({viewers:z.array(z.object({id:PreviewId,origin:PreviewOrigin})).max(256)}).parse(await entry.client.request("preview.viewers", {}));
        const scope = result.viewers.find(v => v.id === viewer);
        if (!scope) throw new RpcError("not_found", "preview viewer missing");
        if (entry.stopped) throw new Error("preview cancelled");
        entry.local = await LocalPreviewProbe.listen(scope.origin);
        if (entry.stopped) { await entry.local.close(); throw new Error("preview cancelled"); }
        return entry.local.descriptor();
      } catch (e) { await this.closeProbe(key, entry); throw e; }
      finally { released = true; entry.client?.close(); delete entry.client; }
    })();
    this.pendingProbes.set(entry.ready, entry);
    void entry.ready.then(() => this.pendingProbes.delete(entry.ready), () => this.pendingProbes.delete(entry.ready));
    return entry.ready;
  }
  consumeProbe(owner: string, machine: string, viewer: string, proof: {id:string;secret:string} | undefined): boolean {
    const key = JSON.stringify([owner, viewer]), entry = this.probes.get(key);
    if (!proof || !entry || entry.machine !== machine || entry.stopped || Date.now() >= entry.expiresAt || !entry.local || entry.local.id !== proof.id || !entry.local.matches(proof.secret)) return false;
    // Delete synchronously before any await: proof can only start one helper.
    void this.closeProbe(key, entry);
    return true;
  }
  startWithProof(owner: string, machine: string, viewer: string, proof: {id:string;secret:string} | undefined): Promise<void> {
    if (!this.consumeProbe(owner, machine, viewer, proof)) return Promise.reject(new RpcError("unauthorized", "ブラウザPCのhelperを手動で起動してください。"));
    // No await between consuming proof and reserving start: stop must see the attachment.
    return this.start(owner, machine, viewer);
  }
  private async closeProbe(key: string, expected?: ProbeEntry): Promise<void> {
    const entry = this.probes.get(key);
    if (!entry || expected && entry !== expected) return;
    this.probes.delete(key); entry.stopped = true; clearTimeout(entry.timer);
    entry.client?.close();
    if (entry.local) {
      const closing = entry.local.close();
      this.closing.add(closing);
      try { await closing; } finally { this.closing.delete(closing); }
    }
  }
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
    const key = JSON.stringify([owner, viewer]);
    const probeClosing = this.closeProbe(key);
    const entry = this.entries.get(key);
    if (!entry) { await probeClosing; return; }
    this.entries.delete(key); entry.stopped = true;
    entry.client?.close();
    this.closing.add(entry.done);
    try { await Promise.all([probeClosing, entry.done]); } finally { this.closing.delete(entry.done); }
  }
  clientGone(owner: string): void {
    for (const [key, entry] of this.probes) if (entry.owner === owner) void this.closeProbe(key);
    for (const entry of [...this.entries.values()]) if (entry.owner === owner) void this.stop(owner, entry.viewer);
  }
  async dispose(): Promise<void> {
    this.disposed = true;
    const pending = [...this.pendingProbes.keys()].map(p => p.catch(() => {}));
    await Promise.all([...this.probes.keys()].map(key => this.closeProbe(key)));
    await Promise.all(pending);
    await Promise.all([...this.entries.values()].map(e => this.stop(e.owner, e.viewer)));
    await Promise.all(this.closing);
  }
}
