import { createHash, randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import { RpcError, type RemoteDesktopInput, type DesktopFrameInfo } from "@sodashitsu/protocol";

export type AgentFrame = { info: DesktopFrameInfo; image: Uint8Array; at: number };
export interface AgentTarget {
  frame(): AgentFrame | undefined;
  capture?(afterFrameSeq?: number): Promise<void>;
  control(enabled: boolean): void;
  state(active: boolean, expiresAt: number): void;
  input(input: RemoteDesktopInput): Promise<void>;
  releaseInputs(): void;
}
/** Provider-private binding. active includes the recipient trust revision and
 * viewer/source/origin/machine lifetime; never construct from public RPC data. */
export interface DesktopAgentRecipient {fingerprint:string;scope?:string;active():boolean}
type Grant = {
  recipient?:DesktopAgentRecipient;
  ownerActive?:()=>boolean;
  target: AgentTarget;
  expires: number;
  ticketExpires: number;
  owner?: string;
  lease?: string;
  observation?: { id: string; digest: string };
  busy: boolean;
  dead: boolean;
  lastObserve?: number;
  preparing?: boolean;
};
const secret = () => randomBytes(32).toString("base64url");
const digest = (image: Uint8Array) => createHash("sha256").update(image).digest("hex");
/** Explicit viewer-issued capabilities. No enumeration, persistence, or authority from machine login. */
export class DesktopAgentAccess {
  private readonly ownerRevoked=new Map<string,Set<()=>void>>();
  /** Provider-local owner notification; never exposed through RPC. */
  onOwnerRevoked(owner:string,callback:()=>void):()=>void{const callbacks=this.ownerRevoked.get(owner)??new Set<()=>void>();callbacks.add(callback);this.ownerRevoked.set(owner,callbacks);return()=>{callbacks.delete(callback);if(!callbacks.size&&this.ownerRevoked.get(owner)===callbacks)this.ownerRevoked.delete(owner);};}
  private grants = new Map<AgentTarget, Grant>();
  private tickets = new Map<string, Grant>();
  private leases = new Map<string, Grant>();
  grant(target: AgentTarget,recipient?:DesktopAgentRecipient) {
    if(recipient&&(!/^[a-f0-9]{64}$/.test(recipient.fingerprint)||recipient.scope!==undefined&&!/^[A-Za-z0-9_-]{43}$/.test(recipient.scope)||!this.bindingActive(recipient)))throw new RpcError("unauthorized","Agent recipient is unavailable");
    this.revoke(target);
    const now = performance.now(),
      ticket = secret();
    const g: Grant = {
      target,
      ...(recipient?{recipient:{fingerprint:recipient.fingerprint,...(recipient.scope?{scope:recipient.scope}:{}),active:recipient.active}}:{}),
      expires: now + 120000,
      ticketExpires: now + 30000,
      busy: false,
      dead: false,
    };
    this.grants.set(target, g);
    this.tickets.set(digest(Buffer.from(ticket)), g);
    target.control(false);
    target.state(false, Date.now() + 120000);
    if(!this.validBinding(g)){this.revoke(target);throw new RpcError("unauthorized","Agent recipient is unavailable");}
    return { ticket, expiresAt: Date.now() + 30000 };
  }
  private bindingActive(recipient:DesktopAgentRecipient):boolean {try{return recipient.active()===true;}catch{return false;}}
  private validBinding(g:Grant):boolean {return (!g.recipient||this.bindingActive(g.recipient))&&(!g.ownerActive||this.bindingActive({fingerprint:"",active:g.ownerActive}));}
  attach(owner: string, ticket: string) {return this.claim(owner,ticket);}
  /** Only the authenticated provider endpoint path may supply this fingerprint. */
  attachRecipient(owner:string,ticket:string,fingerprint:string,ownerActive?:()=>boolean,scope?:string) {
    if(!/^[a-f0-9]{64}$/.test(fingerprint)||scope!==undefined&&!/^[A-Za-z0-9_-]{43}$/.test(scope))throw new RpcError("unauthorized","Agent recipient is unavailable");
    return this.claim(owner,ticket,fingerprint,ownerActive,scope);
  }
  private claim(owner: string, ticket: string,fingerprint?:string,ownerActive?:()=>boolean,scope?:string) {
    const key = digest(Buffer.from(ticket)),
      g = this.tickets.get(key);
    if(g&&!this.validBinding(g)){this.revoke(g.target);throw new RpcError("unauthorized","Agent grant is missing or expired");}
    // A wrong or legacy recipient must not consume somebody else's ticket.
    if(!g||g.dead||g.recipient?.fingerprint!==fingerprint||g.recipient?.scope!==scope||performance.now()>=g.ticketExpires||performance.now()>=g.expires)throw new RpcError("unauthorized","Agent grant is missing or expired");
    this.tickets.delete(key);
    g.owner = owner;
    if(ownerActive)g.ownerActive=ownerActive;
    g.lease = secret();
    this.leases.set(g.lease, g);
    g.target.control(true);
    g.target.state(true, Date.now() + Math.max(0, g.expires - performance.now()));
    this.require(owner,g.lease);
    return { leaseId: g.lease, expiresAt: Date.now() + Math.max(0, g.expires - performance.now()) };
  }
  private require(owner: string, lease: string) {
    const g = this.leases.get(lease);
    if (!g || g.dead || g.owner !== owner || !this.validBinding(g) || performance.now() >= g.expires) {
      if (g && (!this.validBinding(g)||performance.now() >= g.expires)) this.revoke(g.target);
      throw new RpcError("unauthorized", "Agent lease is missing or expired");
    }
    return g;
  }
  async refresh(owner: string, lease: string, afterFrameSeq?: number) {
    const g = this.require(owner, lease);
    if (g.busy || g.preparing)
      throw new RpcError("server_busy", "Action or observation is in progress");
    if (g.lastObserve !== undefined && performance.now() - g.lastObserve < 200)
      throw new RpcError("server_busy", "Observe is limited to five images per second");
    g.preparing = true;
    try {
      await g.target.capture?.(afterFrameSeq);
      this.require(owner, lease);
    } finally {
      g.preparing = false;
    }
  }
  observe(owner: string, lease: string, afterFrameSeq?: number) {
    const g = this.require(owner, lease);
    if (g.busy || g.preparing) throw new RpcError("server_busy", "Action is in progress");
    const frame = g.target.frame();
    if (!frame || performance.now() - frame.at >= 2000)
      throw new RpcError("server_busy", "Fresh desktop frame is unavailable");
    if (afterFrameSeq !== undefined && frame.info.seq <= afterFrameSeq)
      throw new RpcError("server_busy", "Wait for a frame after the action");
    if (g.lastObserve !== undefined && performance.now() - g.lastObserve < 200)
      throw new RpcError("server_busy", "Observe is limited to five images per second");
    this.require(owner,lease);
    g.lastObserve = performance.now();
    const id = secret();
    g.observation = { id, digest: digest(frame.image) };
    return {
      observationId: id,
      frameSeq: frame.info.seq,
      width: frame.info.width,
      height: frame.info.height,
      format: frame.info.format,
      imageBase64: Buffer.from(frame.image).toString("base64"),
      latestFrameMaxAgeMs: 2000,
    };
  }
  async act(owner: string, lease: string, observationId: string, inputs: RemoteDesktopInput[]) {
    const g = this.require(owner, lease);
    if (g.busy || g.preparing) throw new RpcError("server_busy", "Action is in progress");
    const observed = g.observation;
    delete g.observation;
    const frame = g.target.frame();
    if (
      !observed ||
      observed.id !== observationId ||
      !frame ||
      performance.now() - frame.at >= 2000 ||
      digest(frame.image) !== observed.digest
    )
      throw new RpcError("invalid_params", "Desktop changed; observe and decide again");
    g.busy = true;
    try {
      for (const input of inputs) {
        this.require(owner, lease);
        await g.target.input(input);
        this.require(owner, lease);
      }
      return {
        acknowledged: inputs.length,
        afterFrameSeq: g.target.frame()?.info.seq ?? frame.info.seq,
      };
    } catch (e) {
      if (!g.dead) this.revoke(g.target);
      throw e;
    } finally {
      if (!g.dead) g.target.releaseInputs();
      g.busy = false;
    }
  }
  release(owner: string, lease: string) {
    const g = this.require(owner, lease);
    this.revoke(g.target);
    return { released: true as const };
  }
  occupied(target: AgentTarget) {
    const g=this.grants.get(target);if(g&&!this.validBinding(g)){this.revoke(target);return false;}return !!g?.owner;
  }
  revoke(target: AgentTarget) {
    const g = this.grants.get(target);
    if (!g) return;
    g.dead = true;
    delete g.observation;
    this.grants.delete(target);
    if (g.lease) this.leases.delete(g.lease);
    for (const [key, value] of this.tickets) if (value === g) this.tickets.delete(key);
    if(g.owner)for(const callback of [...(this.ownerRevoked.get(g.owner)??[])])try{callback();}catch{/* Continue all revocations. */}
    // Revocation remains complete even if a helper cleanup callback throws.
    for(const cleanup of [()=>target.releaseInputs(),()=>target.control(false),()=>target.state(false,0)])try{cleanup();}catch{/* best effort after authority was destroyed */}
  }
  tick() {
    for (const g of this.grants.values())
      if (!this.validBinding(g)||performance.now() >= (g.owner ? g.expires : g.ticketExpires)) this.revoke(g.target);
  }
  clientGone(owner: string) {
    for (const g of this.grants.values()) if (g.owner === owner) this.revoke(g.target);
  }
}
