import {DesktopEndpointAgentRequest,DesktopEndpointAgentAttach,formatDesktopAgentGrant} from "@sodashitsu/protocol";
import type {DesktopEndpointAgentRpc} from "./DesktopEndpointAgentRpc.js";
import {DesktopEndpointDrain} from "./DesktopEndpointDrain.js";
import {desktopFeaturesFromProtocols} from "@sodashitsu/protocol";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { WebSocket } from "ws";
import { z } from "zod";
import {
  DESKTOP_ENDPOINT_PROTOCOL,
  DESKTOP_ENDPOINT_CHILDREN,
  DesktopEndpointStart,
  DesktopEndpointConnect,
  desktopEndpointLane,
  type DesktopEndpointStatus,
  type DesktopEndpointPeer,
} from "@sodashitsu/protocol";
import { DesktopEndpointWire } from "@sodashitsu/client-core/desktop/DesktopEndpointWire";
import { verifyDesktopEndpointChild } from "@sodashitsu/client-core/desktop/DesktopEndpointBinding";
import type { DesktopE2eLane } from "@sodashitsu/client-core/desktop/DesktopE2e";
import { DesktopEndpointStore } from "./DesktopEndpointStore.js";
import {
  DesktopEndpointBackplane,
  type DesktopEndpointRoot,
  type DesktopEndpointLocalSocket,
} from "./DesktopEndpointBackplane.js";
import type { DesktopProviderApi as DesktopProvider } from "./DesktopProvider.js";

type Permit = Awaited<ReturnType<DesktopEndpointStore["endpoint"]>>;
type Invite = { ticket: string; protocol: string; at: number; busy: boolean };
type AgentGrant = {hash:string;scope:string;fingerprint:string;permit:Permit;revision:number;expires:number};
type Context = {
  role:"viewer"|"agent";
  grant?:AgentGrant|undefined;
  grantRevision:number;
  agentFeature:boolean;
  agentPending:boolean;
  agentAt:number;
  agent?:DesktopEndpointAgentRpc;
  agentEnding?:boolean;
  agentDeadline?:number;
  agentTimer?:ReturnType<typeof setTimeout>;
  owner: string;
  session: string;
  machine: string;
  fingerprint: string;
  origin: string;
  permit: Permit;
  closed: boolean;
  active(): boolean;
  root?: DesktopEndpointRoot;
  opened: boolean;
  closeNegotiated:boolean;
  invites: Map<string, Invite>;
  connections: Set<Connection>;
  close(): void;
};
type Connection = {
  session: string;
  wire: DesktopEndpointWire;
  transport: WebSocket;
  local?: DesktopEndpointLocalSocket;
  closed: boolean;
  agentBusy?:boolean;
  close(): void;
};
const unavailable = () => Error("暗号化デスクトップの相手・鍵・接続先の許可を確認してください。");
const quiet = (fn: () => void) => {
  try {
    fn();
  } catch {
    /* Finish all revocations. */
  }
};
const encode = new TextEncoder(),
  decode = new TextDecoder("utf-8", { fatal: true });
/** One instance per StateDirLock owner. Constructing is read/write-free;
 * activate only AFTER acquiring that lock, close BEFORE releasing it. */
export class DesktopEndpointService {
  private readonly store: DesktopEndpointStore;
  private owner = false;
  private activated = false;
  private closed = false;
  private lifetime = 0;
  private policy = 0;
  private changingPolicy = false;
  private policyMutation = 0;
  private refreshing: Promise<void> = Promise.resolve();
  private required = true;
  private snapshot: DesktopEndpointStatus = {
    available: false,
    initialized: false,
    required: true,
    peers: [],
  };
  private agentCredentials=0;
  private readonly contexts = new Map<string, Context>();
  private readonly connections = new Map<string, Connection>();
  private readonly pending = new Set<{
    owner: string;
    session: string;
    parent: string | undefined;
    role:"viewer"|"agent";
    cancelled: boolean;
  }>();
  private plane: Promise<DesktopEndpointBackplane> | undefined;
  private closing: Promise<void> | undefined;
  constructor(
    private readonly options: {
      stateDir: string;
      provider: DesktopProvider;
      origins(): readonly string[];
      store?: DesktopEndpointStore;
    },
  ) {
    this.store =
      options.store ??
      new DesktopEndpointStore({
        stateDir: options.stateDir,
        revoke: (peer) => this.stopPeer(peer.fingerprint, peer.role),
      });
  }
  private async savedState(): Promise<boolean> {
    for (const path of [
      join(this.options.stateDir, "desktop-endpoint"),
      join(this.options.stateDir, "desktop-endpoint-required.json"),
    ])
      try {
        await lstat(path);
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") return true;
      }
    return false;
  }
  private refresh(revision = this.policy): Promise<DesktopEndpointStatus> {
    const run = this.refreshing.then(() => this.readStatus(revision));
    this.refreshing = run.then(
      () => {},
      () => {},
    );
    return run;
  }
  private async readStatus(revision: number): Promise<DesktopEndpointStatus> {
    let result: DesktopEndpointStatus;
    try {
      const saved = await this.savedState(),
        state = saved
          ? await this.store.status()
          : { initialized: false as const, required: false };
      if (saved && !state.initialized) throw unavailable();
      result = {
        available: true,
        initialized: state.initialized,
        required: state.required === true || this.changingPolicy,
        peers: state.initialized ? state.peers : [],
        ...(state.initialized ? { fingerprint: state.fingerprint } : {}),
      };
    } catch {
      result = {
        available: false,
        initialized: false,
        required: true,
        peers: [],
        message:
          "鍵または必須設定を確認できません。通常接続へは切り替えません。接続先PCで保存先と権限を確認してください。",
      };
    }
    if (!this.closed && revision === this.policy) {
      this.snapshot = result;
      this.required = result.required;
      if (!result.available) this.stopAll();
      if (this.owner || !this.activated) this.options.provider.requireEndpoint(this.required);
    }
    return { ...this.snapshot, peers: this.snapshot.peers.map((peer) => ({ ...peer })) };
  }
  async activate(): Promise<void> {
    if (this.closed || this.activated) throw unavailable();
    const epoch = ++this.lifetime;
    await this.refresh();
    if (this.closed || epoch !== this.lifetime) throw unavailable();
    this.owner = true;
    this.activated = true;
  }
  suspend(): void {
    this.owner = false;
    this.lifetime++;
    this.policy++;
    this.stopAll();
  }
  resume(): void {
    if (this.closed || !this.activated) throw unavailable();
    this.lifetime++;
    this.owner = true;
    this.options.provider.requireEndpoint(this.required);
    const revision = this.policy;
    void this.store
      .settled()
      .then(() => this.refresh(revision))
      .catch(() => {});
  }
  async prepareHandoff(): Promise<void> {
    await this.store.settled();
    if (!this.closed && this.activated && !this.owner) await this.refresh();
  }
  private ensureOwner(): void {
    if (this.closed || !this.owner) throw unavailable();
  }
  private ensureLifetime(epoch: number): void {
    this.ensureOwner();
    if (epoch !== this.lifetime) throw unavailable();
  }
  async status(): Promise<DesktopEndpointStatus> {
    this.ensureOwner();
    const epoch = this.lifetime,
      result = await this.refresh();
    this.ensureLifetime(epoch);
    return result;
  }
  async initialize(): Promise<DesktopEndpointStatus> {
    this.ensureOwner();
    const epoch = this.lifetime,
      state = await this.refresh();
    this.ensureLifetime(epoch);
    if (!state.available || (!state.initialized && state.required)) throw unavailable();
    await this.store.initialize();
    this.ensureLifetime(epoch);
    return this.refresh();
  }
  async setRequired(required: boolean): Promise<DesktopEndpointStatus> {
    this.ensureOwner();
    z.boolean().parse(required);
    if (!this.snapshot.initialized) throw unavailable();
    const epoch=this.lifetime;
    await this.options.provider.invalidateSavedTransfers();
    let result:DesktopEndpointStatus;
    try {
      this.ensureLifetime(epoch);
      const operation=++this.policyMutation;
      this.policy++;
      this.changingPolicy=true;
      this.stopAll();
      this.required=true;
      this.snapshot={...this.snapshot,required:true};
      this.options.provider.requireEndpoint(true);
      await this.store.setRequired(required);
      if(operation===this.policyMutation)this.changingPolicy=false;
      this.policy++;
      this.ensureLifetime(epoch);
      result=await this.refresh();
    }finally{await this.options.provider.bindSavedTransfers();}
    this.ensureLifetime(epoch);
    await this.options.provider.settleSavedTransfers();
    this.ensureLifetime(epoch);
    return result;
  }

  async trust(peer: DesktopEndpointPeer): Promise<DesktopEndpointStatus> {
    this.ensureOwner();
    const epoch = this.lifetime;
    this.stopPeer(peer.fingerprint, peer.role);
    await this.store.trust(peer);
    this.ensureLifetime(epoch);
    return this.refresh();
  }
  async revoke(
    fingerprint: string,
    role: DesktopEndpointPeer["role"],
  ): Promise<DesktopEndpointStatus> {
    this.ensureOwner();
    const epoch = this.lifetime;
    this.stopPeer(fingerprint, role);
    await this.store.revoke(fingerprint, role);
    this.ensureLifetime(epoch);
    return this.refresh();
  }
  private stopPeer(fingerprint: string, role: string): void {
    for (const context of [...this.contexts.values()]) {
      if(context.role===role&&context.fingerprint===fingerprint)quiet(context.close);
      if(role==="agent"&&context.grant?.fingerprint===fingerprint){context.grantRevision++;context.grant=undefined;quiet(()=>context.root?.revokeAgent());}
    }
  }
  private stopAll(): void {
    for (const pending of this.pending) pending.cancelled = true;
    for (const context of [...this.contexts.values()]) quiet(context.close);
  }
  clientGone(owner: string): void {
    for (const pending of this.pending) if (pending.owner === owner) pending.cancelled = true;
    for (const context of [...this.contexts.values()])
      if (context.owner === owner) quiet(context.close);
  }
  private relayUrl(raw: string): URL {
    const url = new URL(raw);
    if (
      url.pathname !== "/desktop-e2e" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      (url.protocol !== "wss:" &&
        !(url.protocol === "ws:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))) ||
      !this.options.origins().some((origin) => {
        try {
          return (
            new URL(origin).origin.replace(/^ws/, "http") === url.origin.replace(/^ws/, "http")
          );
        } catch {
          return false;
        }
      })
    )
      throw unavailable();
    return url;
  }
  async start(owner: string, raw: DesktopEndpointStart): Promise<{ started: true }> {
    this.ensureOwner();
    const p = DesktopEndpointStart.parse(raw),
      url = this.relayUrl(p.url);
    if (
      !this.required ||
      !this.snapshot.available ||
      !this.snapshot.initialized ||
      !this.options.provider.capabilities().available ||
      (p.hello.role !== "viewer" && p.hello.role !== "agent") ||
      (p.hello.role==="agent"&&!!p.parent) ||
      this.pending.size + this.agentCredentials >= 8 ||
      this.connections.size +
        [...this.pending].filter((pending) => !this.connections.has(pending.session)).length >=
        64 ||
      this.connections.has(p.session) ||
      [...this.pending].some((pending) => pending.session === p.session)
    )
      throw unavailable();
    if (
      !p.parent &&
      [...this.contexts.values()].filter(context=>context.role===p.hello.role).length +
        [...this.pending].filter(
          (pending) => pending.role===p.hello.role && !pending.parent && !this.contexts.has(pending.session),
        ).length >= 8
    )
      throw unavailable();
    const pending = { owner, session: p.session, parent: p.parent, role:p.hello.role as "viewer"|"agent", cancelled: false },
      epoch = this.lifetime,
      source = this.options.provider.epoch;
    this.pending.add(pending);
    const fingerprint = createHash("sha256")
      .update(Buffer.from(p.hello.identity, "hex"))
      .digest("hex");
    let context: Context | undefined, invite: Invite | undefined;
    try {
      if (p.parent) {
        context = this.contexts.get(p.parent);
        invite = context?.invites.get(p.attachment!);
        if (
          !context ||
          context.role!=="viewer" ||
          context.owner !== owner ||
          context.machine !== p.machineId ||
          context.fingerprint !== fingerprint ||
          context.origin !== url.origin ||
          !context.opened ||
          !context.active() ||
          !invite ||
          invite.busy ||
          performance.now() - invite.at >= 10000 ||
          context.connections.size +
            [...this.pending].filter(
              (pending) => pending.parent === p.parent && !this.connections.has(pending.session),
            ).length >
            8
        )
          throw unavailable();
        invite.busy = true;
        if (
          !(await verifyDesktopEndpointChild(
            crypto,
            invite.ticket,
            p.parent,
            p.attachment!,
            invite.protocol,
            p.hello,
            p.binding!,
          )) ||
          !context.active() ||
          pending.cancelled ||
          epoch !== this.lifetime ||
          source !== this.options.provider.epoch
        )
          throw unavailable();
        context.invites.delete(p.attachment!);
      } else {
        if ([...this.contexts.values()].filter(context=>context.role===p.hello.role).length >= 8) throw unavailable();
        const role=p.hello.role as "viewer"|"agent",permit = await this.store.endpoint(fingerprint, role);
        const active = () =>
          !this.closed &&
          this.owner &&
          this.required &&
          this.snapshot.available &&
          this.snapshot.initialized &&
          !pending.cancelled &&
          epoch === this.lifetime &&
          source === this.options.provider.epoch &&
          permit.active();
        if (!active()) throw unavailable();
        const created: Context = {
          role,grantRevision:0,agentFeature:false,agentPending:false,agentAt:-Infinity,
          owner,
          session: p.session,
          machine: p.machineId,
          fingerprint,
          origin: url.origin,
          permit,
          closed: false,
          opened: false,
          closeNegotiated:role==="agent",
          invites: new Map(),
          connections: new Set(),
          active: () => !created.closed && active(),
          close: () => {
            if (created.closed) return;
            created.closed = true;
            clearTimeout(created.agentTimer);created.grantRevision++;created.grant=undefined;
            quiet(()=>created.agent?.close());
            quiet(() => created.root?.close());
            this.contexts.delete(created.session);
            created.invites.clear();
            for (const connection of [...created.connections]) quiet(connection.close);
            created.connections.clear();
          },
        };
        context = created;
        this.contexts.set(p.session, context);
      }
      if (!context.active()) throw unavailable();
      await this.connect(context, p, invite?.protocol);
      return { started: true };
    } catch {
      if (context && !p.parent) context.close();
      if (invite) invite.busy = false;
      throw unavailable();
    } finally {
      this.pending.delete(pending);
    }
  }
  private async agentViewerRequest(context:Context,raw:unknown,emit:(value:unknown)=>void,bootstrap=false):Promise<void>{
    if(context.role!=="viewer"||!context.agentFeature||!context.opened||!context.root||!context.active())throw unavailable();
    const message=DesktopEndpointAgentRequest.parse(raw);
    if(message.type==="agent_endpoint_grant"&&!message.enabled){context.grantRevision++;context.grant=undefined;context.root.revokeAgent();return;}
    const now=performance.now();
    if(context.agentPending||this.pending.size+this.agentCredentials>=8||!bootstrap&&now-context.agentAt<1000){emit({type:"agent_endpoint_error",message:"処理中です。少し待ってから再度お試しください。"});return;}
    if(!bootstrap)context.agentAt=now;context.agentPending=true;this.agentCredentials++;
    const revision=message.type==="agent_endpoint_grant"?++context.grantRevision:context.grantRevision;
    try{
      if(message.type==="agent_endpoint_peers"){
        const status=await this.store.status();if(!context.active())throw unavailable();
        emit({type:"agent_endpoint_available",peers:status.initialized?status.peers.filter(peer=>peer.role==="agent").map(({fingerprint,label})=>({fingerprint,label})):[]});return;
      }
      context.grant=undefined;context.root.revokeAgent();
      const [permit,provider]=await Promise.all([this.store.endpoint(message.recipient!,"agent"),context.permit.identity.fingerprint()]);
      if(!context.active()||revision!==context.grantRevision||!permit.active())throw unavailable();
      const at=performance.now(),granted=context.root.grantAgent({fingerprint:message.recipient!,active:()=>context.active()&&revision===context.grantRevision&&permit.active()});
      context.grant={hash:createHash("sha256").update(granted.ticket).digest("hex"),scope:granted.scope,fingerprint:message.recipient!,permit,revision,expires:at+30000};
      const code=formatDesktopAgentGrant({version:1,machineId:context.machine,origin:context.origin.replace(/^ws/,"http"),provider,recipient:message.recipient!,scope:granted.scope,ticket:granted.ticket,expiresAt:granted.expiresAt});
      emit({type:"agent_endpoint_ticket",code,expiresAt:granted.expiresAt});
    }catch{
      if(context.active()&&revision===context.grantRevision)emit({type:"agent_endpoint_error",message:"接続先で許可したエージェントと共有状態を確認してください。"});
    }finally{context.agentPending=false;this.agentCredentials--;}
  }
  private async agentRequest(context:Context,raw:Uint8Array):Promise<string>{
    if(!context.active()||context.role!=="agent"||context.agentEnding)throw unavailable();
    const text=decode.decode(raw);
    if(context.agent)return context.agent.request(text);
    if(context.agentDeadline===undefined||performance.now()>=context.agentDeadline)throw unavailable();
    const request=DesktopEndpointAgentAttach.parse(JSON.parse(text)),hash=createHash("sha256").update(request.params.ticket).digest("hex");
    const viewer=[...this.contexts.values()].find(value=>value.role==="viewer"&&value.grant?.hash===hash),grant=viewer?.grant;
    if(!viewer||!grant||!viewer.active()||grant.scope!==request.params.scope||grant.fingerprint!==context.fingerprint||viewer.machine!==context.machine||viewer.origin!==context.origin||grant.revision!==viewer.grantRevision||!grant.permit.active()||performance.now()>=grant.expires)throw unavailable();
    const plane=await this.getPlane();
    if(!context.active()||!viewer.active()||viewer.grant!==grant||!grant.permit.active()||performance.now()>=grant.expires||performance.now()>=context.agentDeadline)throw unavailable();
    const rpc=plane.agent(context.fingerprint,grant.scope,()=>context.active()&&viewer.active()&&grant.permit.active()&&grant.revision===viewer.grantRevision,reason=>{if(reason==="released")context.agentEnding=true;else context.close();});
    context.agent=rpc;
    const response=await rpc.request(JSON.stringify({id:request.id,method:request.method,params:{ticket:request.params.ticket}}));
    if(!context.active()||!viewer.active()||viewer.grant!==grant||!grant.permit.active())throw unavailable();
    viewer.grant=undefined;context.opened=true;clearTimeout(context.agentTimer);return response;
  }
  private async getPlane(): Promise<DesktopEndpointBackplane> {
    this.plane ??= DesktopEndpointBackplane.create(this.options.provider);
    const plane = await this.plane;
    if (this.closed) {
      await plane.close();
      throw unavailable();
    }
    return plane;
  }
  private async connect(
    context: Context,
    p: DesktopEndpointStart,
    childProtocol?: string,
  ): Promise<void> {
    const transport = new WebSocket(p.url, DESKTOP_ENDPOINT_PROTOCOL, {
      maxPayload: 4 * 1024 * 1024,
      handshakeTimeout: 5000,
      followRedirects: false,
      perMessageDeflate: false,
    });
    let connecting = false,
      opened = false;
    const connection: Connection = {
      session: p.session,
      transport,
      closed: false,
      wire: undefined as unknown as DesktopEndpointWire,
      close: () => {
        if (connection.closed) return;
        connection.closed = true;
        this.connections.delete(connection.session);
        context.connections.delete(connection);
        drain.dispose();
        quiet(() => connection.local?.close());
        quiet(() => connection.wire?.close());
        transport.terminate();
        if (!childProtocol) context.close();
      },
    };
    const active = () => !connection.closed && context.active();
    const drain=new DesktopEndpointDrain({active,terminal:()=>connection.wire.send("control",new Uint8Array([4])),close:connection.close});
    const send = (lane: DesktopE2eLane, kind: number, data: Uint8Array) => {
      if (!active()) {
        connection.close();
        return;
      }
      if(drain.closing)return;
      if (lane === "audio" && connection.wire.bufferedAmount > 4096) return;
      const record = new Uint8Array(data.length + 1);
      record[0] = kind;
      record.set(data, 1);
      drain.track(connection.wire.send(lane, record));
    };
    const receive = (lane: DesktopE2eLane, record: Uint8Array) => {
      if (!active() || !record.length) throw unavailable();
      const kind = record[0],
        data = record.subarray(1);
      if(drain.closing){if(kind===5&&lane==="control"&&data.length===0)drain.acknowledge();else if(kind!==0&&kind!==1)throw unavailable();return;}
      if(context.role==="agent"){
        if(kind!==1||lane!=="agent"||data.length>65536||connection.agentBusy||context.agentEnding)throw unavailable();
        connection.agentBusy=true;const owned=new Uint8Array(data);
        void this.agentRequest(context,owned).then(response=>{
          if(!active())throw unavailable();send("agent",1,encode.encode(response));if(context.agentEnding)drain.begin(true);
        }).catch(connection.close).finally(()=>{owned.fill(0);connection.agentBusy=false;});return;
      }
      if (kind === 2) {
        if (lane !== "control" || connecting || opened || data.length > 8192) throw unavailable();
        connecting = true;
        const request = DesktopEndpointConnect.parse(JSON.parse(decode.decode(data)));
        if(!childProtocol){const features=desktopFeaturesFromProtocols(request.protocols);context.closeNegotiated=features.has("endpointClose");context.agentFeature=features.has("endpointAgent");}
        if (
          (childProtocol &&
            (request.protocols.length !== 1 || request.protocols[0] !== childProtocol)) ||
          (!childProtocol &&
            request.protocols.length === 1 &&
            [...DESKTOP_ENDPOINT_CHILDREN.values()].includes(request.protocols[0]!))
        )
          throw unavailable();
        void (async () => {
          try {
            if (!childProtocol) {
              const plane = await this.getPlane();
              if (!active()) throw unavailable();
              context.root = plane.root(context.machine, active,context.origin.replace(/^ws/,"http"));
            }
            if (!context.root || !active()) throw unavailable();
            const local = await context.root.open(
              request.protocols,
              (bytes, binary) => {
                if (!active()) {
                  connection.close();
                  return;
                }
                let payload = bytes;
                if (!binary && !childProtocol) {
                  const message = JSON.parse(decode.decode(bytes)) as {
                      type: string;
                      ticket?: string;
                      e2eAttach?: unknown;
                    },
                    protocol = DESKTOP_ENDPOINT_CHILDREN.get(message.type);
                  if (protocol) {
                    if (!message.ticket || !/^[A-Za-z0-9_-]{43}$/.test(message.ticket))
                      throw unavailable();
                    for (const [id, invite] of context.invites)
                      if (performance.now() - invite.at >= 10000) context.invites.delete(id);
                    if (context.invites.size >= 16) throw unavailable();
                    const id = randomUUID();
                    context.invites.set(id, {
                      ticket: message.ticket,
                      protocol,
                      at: performance.now(),
                      busy: false,
                    });
                    message.e2eAttach = { parent: context.session, id, protocol };
                    payload = encode.encode(JSON.stringify(message));
                  }
                }
                send(desktopEndpointLane(childProtocol, payload, binary), binary ? 0 : 1, payload);
              },
              () => drain.begin(opened&&context.closeNegotiated),
            );
            if (!active()) {
              local.close();
              throw unavailable();
            }
            connection.local = local;
            opened = true;
            if (!childProtocol) context.opened = true;
            send("control", 3, new Uint8Array());
            if(!childProtocol&&context.agentFeature){send("agent",1,encode.encode(JSON.stringify({type:"agent_endpoint_available",peers:[]})));void this.agentViewerRequest(context,{type:"agent_endpoint_peers"},value=>send("agent",1,encode.encode(JSON.stringify(value))),true).catch(connection.close);}
          } catch {
            connection.close();
          }
        })();
        return;
      }
      if (
        !opened ||
        !connection.local ||
        (kind !== 0 && kind !== 1) ||
        lane !== desktopEndpointLane(childProtocol, data, kind === 0)
      )
        throw unavailable();
      if(!childProtocol&&kind===1){
        const message=JSON.parse(decode.decode(data)) as {type?:string;enabled?:unknown};
        if(message.type==="agent_grant"&&message.enabled!==false)throw unavailable();
        if(message.type==="stop"||message.type==="control"&&message.enabled===true||message.type==="agent_grant"&&message.enabled===false){context.grantRevision++;context.grant=undefined;context.root?.revokeAgent();}
        if(lane==="agent"&&(message.type==="agent_endpoint_grant"||message.type==="agent_endpoint_peers")){
          void this.agentViewerRequest(context,message,value=>send("agent",1,encode.encode(JSON.stringify(value)))).catch(connection.close);return;
        }
      }
      connection.local.send(kind === 0 ? data : decode.decode(data));
    };
    connection.wire = new DesktopEndpointWire({
      crypto,
      identity: context.permit.identity,
      session: p.session,
      role: "provider",
      peerRole: context.role,
      expectedFingerprint: context.fingerprint,
      active,
      sendRaw: (data) => {
        if (
          !active() ||
          transport.readyState !== WebSocket.OPEN ||
          transport.bufferedAmount > 8 * 1024 * 1024
        )
          throw unavailable();
        transport.send(data);
      },
      onRecord: receive,
      onReady: () => {if(context.role==="agent"){context.agentDeadline=performance.now()+10000;context.agentTimer=setTimeout(connection.close,10000);context.agentTimer.unref();}},
      onClose: connection.close,
    });
    this.connections.set(connection.session, connection);
    context.connections.add(connection);
    transport.on("error", connection.close);
    transport.on("close", connection.close);
    transport.on("message", (raw, binary) => {
      const data = Buffer.isBuffer(raw)
        ? raw
        : Array.isArray(raw)
          ? Buffer.concat(raw)
          : Buffer.from(raw);
      void connection.wire
        .receive(binary ? new Uint8Array(data) : data.toString())
        .catch(connection.close);
    });
    const open = new Promise<void>((resolve, reject) => {
      const fail = () => reject(unavailable());
      transport.once("error", fail);
      transport.once("close", fail);
      transport.once("open", () => {
        transport.off("error", fail);
        transport.off("close", fail);
        if (!active()) {
          connection.close();
          reject(unavailable());
          return;
        }
        transport.send(JSON.stringify({ type: "provider", ticket: p.ticket }));
        resolve();
      });
    });
    try {
      await Promise.all([open, connection.wire.start()]);
      if (!active()) throw unavailable();
    } catch {
      connection.close();
      throw unavailable();
    }
  }
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    this.owner = false;
    this.lifetime++;
    this.store.close();
    this.stopAll();
    const plane = this.plane
      ? this.plane.then(
          (plane) => plane.close(),
          () => {},
        )
      : Promise.resolve();
    this.closing = Promise.all([plane, this.store.settled()]).then(() => {});
    return this.closing;
  }
}
