import { randomUUID } from "node:crypto";
import { PREVIEW_READ_BYTES, RpcError, PreviewLocalOrigin, type PreviewApp, type PreviewDisplay, type PreviewViewer } from "@sodashitsu/protocol";
import { PreviewStreams } from "./PreviewStreams.js";

type Viewer = PreviewViewer & { viewId?: string | undefined; clientId: string; expires: number };
type Helper = { clientId: string; viewerId: string; expires: number };
type Open = { id: string; owner: string; viewerId: string; helper: string; app: PreviewApp; expires: number; pulled: boolean; display?: PreviewDisplay; acknowledged: boolean; resolve(value: { requestId: string; status: "view_opened" }): void; reject(error: Error): void };

/** Volatile, explicit registrations. Nothing is automatically re-exposed after restart. */
export class PreviewService {
  private readonly apps = new Map<string, PreviewApp>();
  private readonly viewers = new Map<string, Viewer>();
  private readonly helpers = new Map<string, Helper>();
  private readonly pending = new Set<{ owner: string; appId: string; cancelled: boolean }>();
  private readonly opens = new Map<string, Open>();
  private readonly timer: ReturnType<typeof setInterval>;
  readonly streams: PreviewStreams;
  constructor(private readonly deps: {
    scope(paneId: string): string | undefined;
    kind(clientId: string): string | undefined;
    blockedPorts(): Promise<number[]> | number[];
  }) {
    this.streams = new PreviewStreams((owner, id) => this.authorize(owner, id), async (port) => {
      if ((await deps.blockedPorts()).includes(port)) throw new RpcError("invalid_params", "Sodashitsu management ports cannot be previewed");
    });
    this.timer = setInterval(() => this.sweep(), 1000); this.timer.unref();
  }
  async register(p: { paneId: string; name: string; port: number; replace?: boolean | undefined }): Promise<PreviewApp> {
    const workspaceId = this.deps.scope(p.paneId);
    if (!workspaceId) throw new RpcError("not_found", "pane not found");
    if ((await this.deps.blockedPorts()).includes(p.port)) throw new RpcError("invalid_params", "Sodashitsu management ports cannot be previewed");
    const existing = [...this.apps.values()].find((a) => a.paneId === p.paneId && a.name === p.name);
    if (existing && !p.replace) throw new RpcError("invalid_params", "preview name exists; use --replace");
    if (!existing && (this.apps.size >= 32 || this.list(p.paneId).apps.length >= 8)) throw new RpcError("server_busy", "preview registration limit");
    if (existing) this.invalidate(existing.id);
    const app: PreviewApp = { id: existing?.id ?? randomUUID(), generation: randomUUID(), paneId: p.paneId, workspaceId, name: p.name, port: p.port, state: "registered" };
    this.apps.set(app.id, app); return { ...app };
  }
  list(paneId?: string): { apps: PreviewApp[] } { return { apps: [...this.apps.values()].filter((a) => (!paneId || a.paneId === paneId) && this.deps.scope(a.paneId) === a.workspaceId).map((a) => ({ ...a })) }; }
  app(id: string, paneId?: string): PreviewApp {
    const app = this.apps.get(id);
    if (!app || paneId && app.paneId !== paneId || this.deps.scope(app.paneId) !== app.workspaceId) throw new RpcError("not_found", "preview not found");
    return app;
  }
  stop(id: string, remove = false, paneId?: string): {} {
    const app = this.app(id, paneId); this.invalidate(id);
    if (remove) this.apps.delete(id); else { app.state = "stopped"; app.generation = randomUUID(); }
    return {};
  }
  watch(clientId: string, paneId: string, origin: string, viewId?: string): { viewerId: string } {
    if (!["desktop", "mobile"].includes(this.deps.kind(clientId) ?? "") || !this.deps.scope(paneId)) throw new RpcError("unauthorized", "a browser and an existing pane are required");
    const old = [...this.viewers.values()].find((v) => v.clientId === clientId && v.viewId === viewId);
    if (old?.paneId === paneId && old.origin === origin) { old.expires = Date.now() + 90_000; return { viewerId: old.id }; }
    if (old) this.removeViewer(old);
    if (this.viewers.size >= 32) throw new RpcError("server_busy", "preview viewer limit");
    const viewer: Viewer = { id: randomUUID(), paneId, origin, helper: false, clientId, viewId, expires: Date.now() + 90_000 };
    this.viewers.set(viewer.id, viewer); return { viewerId: viewer.id };
  }
  unwatch(clientId: string, viewId?: string): {} {
    for (const viewer of this.viewers.values()) if (viewer.clientId === clientId && (viewId === undefined || viewer.viewId === viewId)) this.removeViewer(viewer);
    return {};
  }
  private removeViewer(viewer: Viewer): void {
    for (const helper of this.helpers.values()) if (helper.viewerId === viewer.id) this.helperGone(helper.clientId);
    for (const open of this.opens.values()) if (open.viewerId === viewer.id) this.drop(open.id);
    this.viewers.delete(viewer.id);
  }
  viewerList(paneId?: string): { viewers: PreviewViewer[] } {
    this.sweep();
    return { viewers: [...this.viewers.values()].filter((v) => !paneId || v.paneId === paneId).map(({ id, paneId, origin }) => ({ id, paneId, origin, helper: [...this.helpers.values()].some((h) => h.viewerId === id) })) };
  }
  helper(clientId: string, viewerId: string): { viewerId: string; paneId: string; origin: string; httpReadMaxBytes: number } {
    this.sweep();
    const v = this.viewers.get(viewerId);
    if (!v) throw new RpcError("not_found", "viewer expired; enable Web preview in Sodashitsu");
    if ([...this.helpers.values()].some((h) => h.viewerId === viewerId && h.clientId !== clientId)) throw new RpcError("server_busy", "viewer already has a helper");
    const old = this.helpers.get(clientId);
    if (old && old.viewerId !== viewerId) this.helperGone(clientId);
    this.helpers.set(clientId, { clientId, viewerId, expires: Date.now() + 30_000 });
    return { viewerId, paneId: v.paneId, origin: v.origin, httpReadMaxBytes: PREVIEW_READ_BYTES };
  }
  work(clientId: string): { jobs: { requestId: string; app: PreviewApp }[]; active: string[] } {
    this.sweep(); const helper = this.helpers.get(clientId);
    if (!helper) throw new RpcError("unauthorized", "helper is not active");
    helper.expires = Date.now() + 30_000;
    const active = [...this.opens.values()].filter((o) => o.helper === clientId);
    const jobs = active.filter((o) => !o.pulled).map((o) => { o.pulled = true; return { requestId: o.id, app: { ...o.app } }; });
    return { jobs, active: active.map((o) => o.id) };
  }
  async open(clientId: string, appId: string, viewerId?: string, callerPane?: string): Promise<{ requestId: string; status: "view_opened" }> {
    this.sweep(); const app = { ...this.app(appId, callerPane) };
    if (app.state !== "registered") throw new RpcError("not_found", "preview is stopped; register it again");
    const choices = [...this.viewers.values()].filter((v) => v.paneId === app.paneId && (!viewerId || v.id === viewerId));
    if (choices.length !== 1) throw new RpcError("invalid_params", choices.length ? "viewer_required: choose a viewer explicitly" : "no_viewer: enable Web preview for the pane");
    const viewer = choices[0]!;
    const helper = [...this.helpers.values()].find((h) => h.viewerId === viewer.id);
    if (!helper) throw new RpcError("not_found", "gateway_unavailable: start sodactl preview helper on the browser PC");
    if (this.opens.size >= 16) throw new RpcError("server_busy", "preview view limit");
    if (this.pending.size >= 16) throw new RpcError("server_busy", "preview validation limit");
    const attempt = { owner: clientId, appId, cancelled: false };
    this.pending.add(attempt);
    try {
    if ((await this.deps.blockedPorts()).includes(app.port)) throw new RpcError("invalid_params", "management port is blocked");
    const current = this.app(appId, callerPane);
    if (attempt.cancelled || current.state !== "registered" || current.generation !== app.generation || this.viewers.get(viewer.id) !== viewer || this.helpers.get(helper.clientId) !== helper)
      throw new RpcError("not_found", "preview permissions changed during validation");
    if (this.opens.size >= 16) throw new RpcError("server_busy", "preview view limit");
    return await new Promise((resolve, reject) => {
      const id = randomUUID();
      this.opens.set(id, { id, owner: clientId, viewerId: viewer.id, helper: helper.clientId, app: { ...app }, pulled: false, acknowledged: false, expires: Date.now() + 25_000, resolve, reject });
    });
    } finally { this.pending.delete(attempt); }
  }
  ready(clientId: string, p: { requestId: string; origin: string; url: string; expiresAt: number }): {} {
    this.sweep(); const open = this.opens.get(p.requestId);
    if (!open || open.helper !== clientId || open.display) throw new RpcError("not_found", "open request expired");
    const u = new URL(p.url);
    if (!PreviewLocalOrigin.safeParse(p.origin).success || u.origin !== p.origin || u.pathname !== "/.soda-preview/bootstrap" || u.search || !/^#[A-Za-z0-9_-]{43}$/.test(u.hash) || p.expiresAt <= Date.now() || p.expiresAt > Date.now() + 30 * 60_000)
      throw new RpcError("invalid_params", "invalid gateway offer");
    open.display = { app: { ...open.app }, ...p }; return {};
  }
  poll(clientId: string, viewId?: string): { displays: PreviewDisplay[]; helper: boolean } {
    this.sweep(); const v = [...this.viewers.values()].find((v) => v.clientId === clientId && v.viewId === viewId);
    if (!v) throw new RpcError("not_found", "viewer expired");
    v.expires = Date.now() + 90_000;
    return { helper: [...this.helpers.values()].some(h => h.viewerId === v.id), displays: [...this.opens.values()].filter((o) => o.viewerId === v.id && o.display).map((o) => o.display!) };
  }
  ack(clientId: string, requestId: string): {} {
    const open = this.opens.get(requestId), viewer = open && this.viewers.get(open.viewerId);
    if (!open || !open.display || viewer?.clientId !== clientId || open.expires <= Date.now()) throw new RpcError("not_found", "view expired");
    open.acknowledged = true; open.expires = open.display.expiresAt;
    open.resolve({ requestId, status: "view_opened" }); return {};
  }
  closeView(clientId: string, requestId: string): {} {
    const open = this.opens.get(requestId);
    if (open && this.viewers.get(open.viewerId)?.clientId !== clientId) throw new RpcError("unauthorized", "not this viewer");
    this.drop(requestId); return {};
  }
  abortOpen(clientId: string, appId: string): {} { for (const p of this.pending) if (p.owner === clientId && p.appId === appId) p.cancelled = true; for (const o of this.opens.values()) if (o.owner === clientId && o.app.id === appId && !o.acknowledged) this.drop(o.id); return {}; }
  authorize(clientId: string, requestId: string): { app: PreviewApp; origin: string } {
    const open = this.opens.get(requestId), helper = this.helpers.get(clientId), viewer = open && this.viewers.get(open.viewerId);
    if (!open?.display || open.helper !== clientId || !helper || !viewer || viewer.expires <= Date.now() || helper.expires <= Date.now() || open.expires <= Date.now() || this.app(open.app.id).state !== "registered" || this.app(open.app.id).generation !== open.app.generation)
      throw new RpcError("unauthorized", "preview lease is not active");
    return { app: open.app, origin: open.display.origin };
  }
  clientGone(clientId: string): void {
    for (const p of this.pending) if (p.owner === clientId) p.cancelled = true;
    this.unwatch(clientId); this.helperGone(clientId); this.streams.clientGone(clientId);
    for (const o of this.opens.values()) if (o.owner === clientId && !o.acknowledged) this.drop(o.id);
  }
  private helperGone(id: string): void { this.helpers.delete(id); for (const o of this.opens.values()) if (o.helper === id) this.drop(o.id); this.streams.clientGone(id); }
  private invalidate(appId: string): void { for (const o of this.opens.values()) if (o.app.id === appId) this.drop(o.id); }
  private drop(id: string): void { const open = this.opens.get(id); if (!open) return; this.opens.delete(id); this.streams.cancelRequest(id); if (!open.acknowledged) open.reject(new RpcError("not_found", "preview open cancelled or timed out")); }
  private sweep(): void {
    const now = Date.now();
    for (const v of this.viewers.values()) if (v.expires <= now || !this.deps.scope(v.paneId)) this.removeViewer(v);
    for (const h of this.helpers.values()) if (h.expires <= now) this.helperGone(h.clientId);
    for (const o of this.opens.values()) if (o.expires <= now || !this.deps.scope(o.app.paneId)) this.drop(o.id);
    for (const a of this.apps.values()) if (this.deps.scope(a.paneId) !== a.workspaceId) { this.invalidate(a.id); this.apps.delete(a.id); }
  }
  dispose(): void { for (const p of this.pending) p.cancelled = true; clearInterval(this.timer); for (const o of this.opens.values()) this.drop(o.id); this.streams.dispose(); this.viewers.clear(); this.helpers.clear(); this.apps.clear(); }
}
