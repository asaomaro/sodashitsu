import {DesktopNativeMicrophoneHost} from './DesktopNativeMicrophoneHost.js';
import type {DesktopSavedTransferState} from './DesktopSavedTransferState.js';
import {desktopHelperRolePlan,desktopHelperRoleEnvironment} from './DesktopHelperRolePlan.js';
import {DesktopNativePcmPaths} from "./DesktopNativePcmPath.js";
import {DesktopRegionSpec} from "@sodashitsu/protocol";
import {DesktopAudioPipes,desktopWslAudioCommand} from "./DesktopAudioPipes.js";
import {DesktopNativeSelection} from "./DesktopNativeSelection.js";
import {DesktopSourceIdle} from "@sodashitsu/client-core/desktop/DesktopSourceIdle";
import {dirname,join} from "node:path";
import {DesktopHelperInputAck,type DesktopPointerWitness} from "./DesktopPointerWitness.js";
import {createHash} from "node:crypto";
import {DesktopInteractiveOwner,type DesktopInteractiveResource} from "./DesktopInteractiveOwner.js";
import {DesktopResourceChannel} from "./DesktopResourceChannel.js";
import {DesktopFolderCheckpoints} from "./DesktopFolderCheckpoints.js";
import {DesktopTransferStore} from "./DesktopTransferStore.js";
import {DesktopFileCheckpoints} from "./DesktopFileCheckpoints.js";
import {DesktopNativePlatformFailure,desktopNativePlatformFailureMessage,supportsDesktopInput,type DesktopNativePlatform,type DesktopInputCapabilities} from "@sodashitsu/protocol";
import { DesktopMicrophone } from "./DesktopMicrophone.js";
import { DesktopMicrophoneRequest, DESKTOP_MICROPHONE_PROTOCOL } from "@sodashitsu/protocol";
import {DesktopProtectedFailure,desktopProtectedFailureMessage} from "@sodashitsu/protocol";
import {DesktopVirtualFailure} from "@sodashitsu/protocol";
import {DesktopFiles} from "./DesktopFiles.js";
import {DESKTOP_FILES_PROTOCOL,DesktopFileRequest,DesktopFileResult} from "@sodashitsu/protocol";
import {DesktopRichClipboard} from "./DesktopRichClipboard.js";
import {DESKTOP_RICH_CLIPBOARD_PROTOCOL} from "@sodashitsu/protocol";
import { spawn } from "node:child_process";
import { DesktopSharedCapture, type DesktopHelper } from "./DesktopSharedCapture.js";
import { performance } from "node:perf_hooks";
import { unlockFailure } from "./unlockFailure.js";
import { z } from "zod";
import WebSocket from "ws";
import {
  DESKTOP_VIDEO_LANE_PROTOCOL, DESKTOP_IMAGE_LANE_PROTOCOL,
  DESKTOP_CURSOR_MAX_BYTES,
  isExtendedDesktopInput,
  DesktopFrameInfo,
  DesktopFrameChain,
  DesktopReady,
  DesktopStartParams,
  RemoteDesktopViewerMessage,
  DESKTOP_MAX_FRAME_BYTES,
  encodeDesktopFrame,
  decodeDesktopFrame,
  DesktopClipboardResult,
  DesktopIceServers,
  RpcError,
} from "@sodashitsu/protocol";

import { DesktopCursorStream } from "./DesktopCursorStream.js";
import { DesktopInputAcks } from "./DesktopInputAcks.js";
import {DesktopNativeVideo} from "./DesktopNativeVideo.js";
import { DesktopCompanionHub } from "./DesktopCompanion.js";
import { DesktopUnlockLease } from "./DesktopUnlockLease.js";

const HelperFrame = z
  .object({
    type: z.literal("frame"),
    info: DesktopFrameInfo,
    data: z
      .string()
      .min(0)
      .max(Math.ceil(DESKTOP_MAX_FRAME_BYTES / 3) * 4)
      .regex(/^[A-Za-z0-9+/]*={0,2}$/),
  })
  .strict();
import type {DesktopProviderConfig,DesktopProviderEndpointScope} from './DesktopProviderCore.js';
import {desktopProviderCapabilities} from './DesktopProviderCore.js';
export type {DesktopProviderConfig,DesktopProviderEndpointScope} from './DesktopProviderCore.js';
export {desktopConfigFromEnv,desktopOriginsFromEnv} from './DesktopProviderCore.js';
type EndpointScope={origin:string;nativeOrigin:string;epoch:number;active():boolean};
type Share = {
  protectedFilesActive?:boolean;
  agentRegions?:boolean;
  audioPipes?:DesktopAudioPipes;resourcesManaged:boolean;
  independent?:boolean;
  capturePool?:DesktopSharedCapture;
  captureKey?:string;
  microphoneOwned?:boolean;
  endpointActive?:()=>boolean;
  inputCapabilities?:DesktopInputCapabilities;
  microphone?:DesktopMicrophone; microphoneSocket?:WebSocket;
  files?:Promise<DesktopFiles|undefined>;fileSocket?:WebSocket;
  richClipboard?:DesktopRichClipboard;clipboardSocket?:WebSocket;
  imageExpected?:boolean; imageSocket?: WebSocket; imageReady?: boolean; imageFailed?: boolean; heldImage?: Uint8Array;
  videoSocket?: WebSocket;
  videoReady?: boolean;
  inputAcks: DesktopInputAcks;
  pointerWitness?:{seq:number;point:DesktopPointerWitness;source:DesktopResourceChannel;at:number};
  cursor?: DesktopCursorStream;
  native?: DesktopNativeVideo;
  deferNativeSnapshots?: boolean;
  chain: DesktopFrameChain;
  owner: string;
  allowClipboard: boolean;
  dynamicQuality: boolean;
  clipboardGranted: boolean;
  clipboardId: number;
  clipboardGeneration: number;
  clipboardPending: Set<number>;
  quality: number;
  video: boolean;
  ws: WebSocket;
  process?: DesktopHelper;
  shared?: boolean;sharedRate?:boolean;
  dead: boolean;
  attached: boolean;
  ready: boolean;
  control: boolean;
  secureDesktop?: boolean;
  protectedDesktop?: "elevated-default"|"elevated-uac";
  lockScreenCover?: boolean;
  imeKeys?: boolean;
  extendedInput?: boolean;
  allowInput: boolean;
  lastSeen: number;
  seq: number;
  pending: number;
  inputSeq: number;
  frameAt: number;
  sourceIdle:DesktopSourceIdle;
  pendingControl?:{source:DesktopResourceChannel;id:string;epoch:string};
  started: number;
  timer: ReturnType<typeof setInterval>;
};

/** Opt-in B-side provider. Executable and input ceiling are local settings, never RPC arguments. */
export class DesktopProvider {
  private endpointOnly=false;
  private sourceEpoch=0;
  private nativeSelection=new DesktopNativeSelection();
  private fileCheckpoints=new DesktopFileCheckpoints();
  private transferStore:DesktopTransferStore|undefined;
  private savedSettingsBinding:string|undefined;
  private savedBinding(binding:string){return createHash("sha256").update(JSON.stringify({settings:binding,endpointOnly:this.endpointOnly})).digest("hex");}
  private transferBarrier:Promise<void>=Promise.resolve();
  private savedPolicyHolds=0;
  private savedPolicyFault=false;
  failSavedTransferPolicy(){this.savedPolicyFault=true;this.savedPolicyHolds=Math.max(0,this.savedPolicyHolds-1);}
  private async stableTransferBarrier(){for(;;){const pending=this.transferBarrier;await pending;if(pending===this.transferBarrier)return;}}
  enableSavedTransfers(directory:string,binding:string,state?:DesktopSavedTransferState){if(this.transferStore||this.active||this.shared.size)throw Error("転送記録の初期化順が不正です");this.savedSettingsBinding=binding;if(state){if(state.directory!==directory||state.scope!==this.savedBinding(binding))throw Error("転送記録の権限が一致しません");this.transferStore=state.store;this.fileCheckpoints=state.files;this.folderCheckpoints=state.folders;return;}this.transferStore=new DesktopTransferStore({directory,binding:this.savedBinding(binding)});this.fileCheckpoints=new DesktopFileCheckpoints(this.transferStore);this.folderCheckpoints=new DesktopFolderCheckpoints(new DesktopTransferStore({directory:join(dirname(directory),"desktop-folder-transfers"),binding:this.savedBinding(binding),folderRecords:true}));}
  async invalidateSavedTransfers(){this.savedPolicyHolds++;this.freezeSavedTransfers();this.transferBarrier=this.savedTransferWork(registry=>registry.invalidate());this.transferBarrier.catch(()=>{});try{await this.transferBarrier;}catch(error){this.failSavedTransferPolicy();throw error;}}
  async bindSavedTransfers(binding?:string){if(binding)this.savedSettingsBinding=binding;try{for(;;){const pending=this.transferBarrier;await pending;if(pending!==this.transferBarrier)continue;const scope=this.savedSettingsBinding?this.savedBinding(this.savedSettingsBinding):undefined;if(scope)await this.savedTransferWork(registry=>registry.bind(scope));if(pending!==this.transferBarrier||scope!==(this.savedSettingsBinding?this.savedBinding(this.savedSettingsBinding):undefined))continue;break;}this.savedPolicyFault=false;}catch(error){this.savedPolicyFault=true;throw error;}finally{this.savedPolicyHolds=Math.max(0,this.savedPolicyHolds-1);this.resumeSavedTransfers();}}
  async settleSavedTransfers(){await this.stableTransferBarrier();await this.savedTransferWork(registry=>registry.settled());}
  async suspendSavedTransfers(){const draining=this.savedTransferWork(registry=>registry.suspend());const results=await Promise.allSettled([this.stableTransferBarrier(),draining,this.nativeMicrophones.suspend()]);for(const result of results)if(result.status==="rejected")throw result.reason;}
  resumeSavedTransfers(){this.nativeMicrophones.resume();if(!this.savedPolicyHolds&&!this.savedPolicyFault)for(const registry of this.savedRegistries())registry.resume();}
  private folderCheckpoints=new DesktopFolderCheckpoints();
  private savedRegistries(){return [this.fileCheckpoints,this.folderCheckpoints] as const;}
  private freezeSavedTransfers(){for(const registry of this.savedRegistries())registry.freeze();}
  private async savedTransferWork(run:(registry:DesktopFileCheckpoints|DesktopFolderCheckpoints)=>Promise<unknown>){const results=await Promise.allSettled(this.savedRegistries().map(run));const failed=results.filter((r):r is PromiseRejectedResult=>r.status==="rejected");if(failed.length)throw new AggregateError(failed.map(r=>r.reason),"Saved transfer operation failed");}
  private readonly endpointScopes=new WeakSet<EndpointScope>();
  get epoch():number{return this.sourceEpoch;}
  /** Owner-process integration only. Never expose this switch as machine RPC. */
  requireEndpoint(required:boolean):void {
    if(this.endpointOnly===required)return;
    const auto=this.transferStore!==undefined&&this.savedPolicyHolds===0;if(auto){this.savedPolicyHolds++;this.freezeSavedTransfers();}this.dispose();this.endpointOnly=required;if(auto)void this.bindSavedTransfers().catch(()=>{});this.resumeUnlockLease();
  }
  /** A private loopback backplane may reuse the existing permission/input/media
   * implementation without allowing a remote caller to choose a new origin. */
  endpointScope(origin:string,active:()=>boolean,nativeOrigin=origin):DesktopProviderEndpointScope {
    const url=new URL(origin);
    if(url.protocol!=="http:"||url.hostname!=="127.0.0.1"||!url.port||url.origin!==origin)throw new RpcError("unauthorized","Private desktop endpoint unavailable");
    const epoch=this.sourceEpoch,owners=new Set<string>();let closed=false;
    const nativeUrl=new URL(nativeOrigin);if(!["http:","https:"].includes(nativeUrl.protocol)||nativeUrl.origin!==nativeOrigin)throw new RpcError("unauthorized","Native desktop origin unavailable");
    const scope:EndpointScope={origin,nativeOrigin,epoch,active:()=>!closed&&epoch===this.sourceEpoch&&active()};
    this.endpointScopes.add(scope);
    return {active:scope.active,start:async(owner,params)=>{
      if(!scope.active())throw new RpcError("unauthorized","Desktop endpoint expired");
      owners.add(owner);return this.start(owner,params,scope);
    },release:owner=>{owners.delete(owner);this.clientGone(owner);},close:()=>{
      if(closed)return;closed=true;this.endpointScopes.delete(scope);
      for(const owner of owners)this.clientGone(owner);owners.clear();
    }};
  }
  private readonly unlockLease = new DesktopUnlockLease();
  private active: Share | undefined;
  private readonly physicalHelpers=new Set<DesktopHelper>();
  private resourceReset=false;
  private resources=this.createResources();
  private createResources(){return new DesktopInteractiveOwner<Share,DesktopResourceChannel>({begin:(source,epoch,resource)=>source.begin(epoch,resource),clean:(source,epoch)=>source.clean(epoch),send:(source,id,resource)=>source.fence(id,resource),idle:source=>this.resumeControls(source),fault:()=>{if(this.active)this.stop(this.active);for(const s of [...this.shared])this.stop(s);}});}
  private applyControl(s:Share,enabled:boolean){
    s.control=s.process?.requestControl?s.process.requestControl(enabled):enabled;
    this.write(s,{type:"control",enabled:s.control});
    if(!s.control&&s.resourcesManaged)this.resources.release(s,"control");
    this.send(s,{type:"control",enabled:s.control});
  }
  private resumeControls(source:DesktopResourceChannel){
    for(const s of [this.active,...this.shared]){
      const intent=s?.pendingControl;if(!s||!intent||intent.source!==source)continue;
      if(!this.live(s)){delete s.pendingControl;continue;}
      if(!s.ready||!s.allowInput||s.process?.resourceChannel!==source){delete s.pendingControl;this.send(s,{type:"control",enabled:false});continue;}
      const pending=this.resources.releasing(s,"control");
      if(pending?.id===intent.id&&pending.epoch===intent.epoch)continue;
      delete s.pendingControl;
      this.applyControl(s,!pending&&this.claimResource(s,"control"));
    }
  }
  private resetResourcesIfDrained(){if(this.resourceReset&&!this.physicalHelpers.size){if(!this.resources.faulted){this.resources.dispose();this.resources=this.createResources();}this.resourceReset=false;}}
  private claimResource(s:Share,kind:DesktopInteractiveResource):boolean{if(!s.resourcesManaged)return true;const source=s.process?.resourceChannel;return !!source?.supported&&this.resources.acquire(s,source,kind);}
  private ownsResource(s:Share,kind:DesktopInteractiveResource):boolean{return !s.resourcesManaged||this.resources.owns(s,kind);}
  private readonly sharedCapture = new DesktopSharedCapture();
  private readonly shared = new Set<Share>();
  private sharedKey: string | undefined;
  private captureMode:"normal"|"independent"|undefined;
  private monitorTopology:string|undefined;
  private readonly monitorSources=new Map<string,{key:string;pool:DesktopSharedCapture}>();
  private pruneSources(){for(const[id,source]of this.monitorSources)if(!source.pool.running&&![...this.shared].some(s=>s.capturePool===source.pool))this.monitorSources.delete(id);if(!this.active&&!this.shared.size&&!this.physicalHelpers.size){this.captureMode=undefined;this.monitorTopology=undefined;}}
  private stopMonitorGeneration(){for(const s of [...this.shared])if(s.independent){this.send(s,{type:"monitor_topology_changed"});this.stop(s);}}

  private pendingStarts = new Set<{ owner: string; cancelled: boolean }>();
  readonly companion: DesktopCompanionHub;
  private audioPipes=new DesktopAudioPipes();
  private nativePcmPaths=new DesktopNativePcmPaths();
  private readonly nativeMicrophones=new DesktopNativeMicrophoneHost(this.nativePcmPaths);
  constructor(private config: DesktopProviderConfig | undefined, companion?:DesktopCompanionHub) {
    this.companion = companion ?? new DesktopCompanionHub(config?.allowMedia === true, config?.iceServers ?? []);
  }
  configure(config: DesktopProviderConfig | undefined): void {
    this.dispose();
    this.config = config;
    this.companion.configure(config?.allowMedia === true, config?.iceServers ?? []);
    this.resumeUnlockLease();
  }
  /** Handoff rollback reopens the local lease; a successful handoff creates a new provider. */
  resumeUnlockLease(): void {
    this.resumeSavedTransfers();
    if ((this.config?.allowUnlock||this.config?.allowVirtualDisplay||this.config?.allowElevated) && this.config.unlockLeaseCommand)
      this.unlockLease.start(this.config.unlockLeaseCommand);
  }
  capabilities() {return desktopProviderCapabilities(this.config,this.endpointOnly,!!this.transferStore);}

  async start(owner: string, raw: z.infer<typeof DesktopStartParams>,scope?:EndpointScope): Promise<{ started: true }> {
    if(this.resources.faulted)throw new RpcError("server_busy","接続先の入力解放を確認できません。接続先で共有設定を確認して再起動してください。");
    if(this.resourceReset&&this.physicalHelpers.size)throw new RpcError("server_busy","前の補助プログラムの終了を待っています。");
    this.resetResourcesIfDrained();
    const p = DesktopStartParams.parse(raw),
      cfg = this.config;
    const epoch=this.sourceEpoch;
    const endpoint=scope!==undefined&&this.endpointScopes.has(scope)&&scope.epoch===epoch&&scope.active();
    if(scope&&!endpoint||this.endpointOnly&&!endpoint)throw new RpcError("unauthorized","Authenticated desktop endpoint required");
    if (!cfg) throw new RpcError("not_found", "Bでデスクトップ補助プログラムが設定されていません");
    if(cfg.nativePlatform!==p.options.nativePlatform)throw new RpcError("invalid_params","native共有の両端を更新し、対応するOS backendを選択してください。");
    if(cfg.nativePlatform&&(p.options.elevatedDesktop||p.options.virtualDisplay||p.options.monitors||p.options.monitorDevice||p.options.display||p.options.sharedResolution||p.options.sharedRate||p.options.cursor||p.options.adaptive||p.options.deltas||p.options.image&&p.options.image.colorMode!=="full"))throw new RpcError("invalid_params","このnative backendでは対応する通常画面と許可した入力・転送を利用できます。");
    if(p.options.protectedFiles&&(!p.options.elevatedDesktop||!p.options.files||!p.fileTicket||!p.options.features||!cfg.allowElevated||!cfg.allowProtectedFiles||!cfg.fileRoot||cfg.nativePlatform))throw new RpcError("unauthorized","管理者画面中のファイル転送は接続先で許可されていません。");
    if(p.options.folders&&!p.options.files)throw new RpcError("invalid_params","Folders were not negotiated");
    if(p.options.folderCheckpoints&&(!p.options.files||!p.options.folders))throw new RpcError("invalid_params","Folder checkpoints were not negotiated");
    if(p.options.fileCheckpoints&&!p.options.files)throw new RpcError("invalid_params","File checkpoints were not negotiated");
    if(p.options.independentMonitors&&(!p.options.sharedDesktop||!p.options.sharedMonitors||!p.options.monitors||!p.options.monitorDevice||!cfg.allowMonitors||cfg.nativePlatform||p.options.elevatedDesktop||p.options.virtualDisplay||p.options.display))throw new RpcError("invalid_params","独立モニターには通常のモニター共有と明示したモニターIDが必要です");
    this.pruneSources();const requestedMode=p.options.independentMonitors?"independent":"normal";const selectedPool=p.options.independentMonitors?this.monitorSources.get(p.options.monitorDevice!)?.pool:this.sharedCapture;
    if(p.options.sharedMonitors&&(!p.options.sharedDesktop||!p.options.monitors||!cfg.allowMonitors||p.options.elevatedDesktop||p.options.virtualDisplay))throw new RpcError("invalid_params","共有モニターには通常共有とモニター許可が必要です");
    if (p.options.sharedDesktop && (!p.options.features || (p.options.elevatedDesktop&&!p.options.sharedProtected) || (p.options.virtualDisplay&&!p.options.sharedVirtual) || p.options.display || (p.options.nativeVideo && !p.options.sharedNative) || (p.options.nativeAudio&&!p.options.sharedAudio) || (p.options.microphone&&!p.options.sharedMicrophone) || (p.options.nativeDatagrams&&!p.options.sharedDatagrams) || (p.options.nativeAdaptive&&!p.options.sharedResolution) || (p.options.nativeCadence&&!p.options.sharedRate) || (p.options.richClipboard&&!p.options.sharedClipboard) || ((p.options.monitors||p.options.monitorDevice)&&!p.options.sharedMonitors) || (p.options.cursor&&!p.options.sharedCursor)))
      throw new RpcError("invalid_params", "複数viewer共有では管理者画面・仮想画面・解像度変更・音声・クリップボードなどの追加経路を併用できません。");
    if(p.options.sharedVirtual&&(!p.options.sharedDesktop||!p.options.virtualDisplay||!p.options.features||!cfg.allowVirtualDisplay||cfg.nativePlatform||p.options.elevatedDesktop||p.options.monitors||p.options.monitorDevice||p.options.display))throw new RpcError("unauthorized","仮想画面の共有には明示した仮想画面と接続先の許可が必要です。");
    if(p.options.sharedDeltas&&(!p.options.sharedDesktop||!p.options.features||p.options.deltas!==true||p.options.elevatedDesktop||p.options.virtualDisplay&&!p.options.sharedVirtual))throw new RpcError("invalid_params","通常共有の差分画像には両端の更新と差分設定が必要です。");
    if(p.options.sharedClipboard&&(!p.options.sharedDesktop||!p.options.features||p.options.elevatedDesktop||p.options.virtualDisplay&&!p.options.sharedVirtual||!cfg.allowClipboard))throw new RpcError("invalid_params","通常共有のクリップボードには両端の更新と接続先の許可が必要です。");
    if(p.options.sharedCursor&&(!p.options.sharedDesktop||!p.options.cursor||!p.options.features||p.options.elevatedDesktop||p.options.virtualDisplay&&!p.options.sharedVirtual||p.options.image?.showCursor===false))throw new RpcError("invalid_params","通常共有のカーソル表示を有効にしてください。共有独立カーソルは両端の更新が必要です。");
    if(p.options.sharedProtected&&(!p.options.sharedDesktop||!p.options.elevatedDesktop||!p.options.features||!cfg.allowElevated))throw new RpcError("unauthorized","保護画面の複数viewer共有は許可されていません。");
    if(p.options.sharedResolution&&(!p.options.sharedNative||!p.options.nativeAdaptive))throw new RpcError("invalid_params","Shared resolution not negotiated");
    if(p.options.sharedRate&&(!p.options.sharedNative||!p.options.nativeCadence))throw new RpcError("invalid_params","共有動画の自動調整には対応する共有経路が必要です。");
    if(p.options.sharedAudio&&(!p.options.sharedDesktop||!p.options.sharedNative||!p.options.nativeAudio))throw new RpcError("invalid_params","共有音声には対応する共有動画が必要です。");
    if(p.options.sharedMicrophone&&(!p.options.sharedDesktop||!p.options.microphone||!p.options.features||!cfg.allowMicrophone||!cfg.microphoneEndpoint))throw new RpcError("unauthorized","Shared microphone is not permitted");
    if(p.options.microphoneOpus&&!p.options.microphone)throw new RpcError("invalid_params","Microphone codec not negotiated");
    if(p.options.microphone&&(p.options.elevatedDesktop||(p.options.sharedDesktop&&!p.options.sharedMicrophone)))throw new RpcError("invalid_params","マイク転送には通常の単独デスクトップ共有を使用してください。");
    if(p.options.sharedDatagrams&&(!p.options.sharedNative||!p.options.nativeDatagrams||!cfg.allowNativeVideo))throw new RpcError("unauthorized","共有動画のUDP経路が許可されていません。");
    if(p.options.sharedNative&&(!p.options.sharedDesktop||!p.options.nativeVideo||!cfg.allowNativeVideo))throw new RpcError("unauthorized","共有動画が接続先で許可されていません。");
    if(p.options.elevatedDesktop){
      if(!cfg.allowElevated||!p.options.features)throw new RpcError("unauthorized","管理者画面の共有が接続先で許可されていません。");
      if(p.options.virtualDisplay||p.options.monitorDevice||p.options.monitors||p.options.display||(p.options.files&&!p.options.protectedFiles)||p.options.richClipboard||p.options.nativeVideo||p.options.nativeAudio||p.options.microphone||p.options.nativeDatagrams||p.options.nativeCodecs||p.options.nativeAdaptive||p.options.nativeCadence||p.options.nativeVideoWindow||p.options.nativeMaxFps||p.options.cursor)throw new RpcError("invalid_params",desktopProtectedFailureMessage("conflict"));
    }
    if(p.options.virtualDisplay&&(!cfg.allowVirtualDisplay||!p.options.features||p.options.monitorDevice))throw new RpcError("unauthorized","仮想画面の作成が許可されていないか、モニター指定と併用されています");
    if(p.options.monitorDevice&&(!cfg.allowMonitors||p.options.monitors!==true))throw new RpcError("unauthorized","モニター切替が許可されていません");
    if (p.options.display && (!cfg.allowDisplayResize || !p.options.features))
      throw new RpcError("unauthorized", "Bでディスプレイ解像度の変更が許可されていません");
    if(this.captureMode&&this.captureMode!==requestedMode&&(this.active&&!this.active.dead||this.shared.size))throw new RpcError("server_busy","共有方式を切り替える前に、ほかの共有窓を閉じてください");
    const finishing = this.active?.dead ? this.active.process : selectedPool?.retiring??(this.captureMode&&this.captureMode!==requestedMode?[...this.physicalHelpers][0]:undefined);
    if (finishing) {
      const child = finishing,
        pending = { owner, cancelled: false };
      this.pendingStarts.add(pending);
      try {
        await new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer);
            child.off("close", done);
            resolve();
          };
          const timer = setTimeout(done, 2000);
          child.once("close", done);
        });
        if (pending.cancelled) throw new RpcError("unauthorized", "Desktop request cancelled");
      } finally {
        this.pendingStarts.delete(pending);
      }
    }
    if (this.config !== cfg||this.sourceEpoch!==epoch||scope&&!scope.active()) throw new RpcError("unauthorized", "Desktop permissions changed");
    if (selectedPool?.retiring) throw new RpcError("server_busy", "前の共有画面を終了中です。少し待ってから接続し直してください。");
    const sharedKey = JSON.stringify(p.options.sharedDesktop ? {purpose:p.options.sharedProtected?"protected":p.options.sharedVirtual?"virtual":"normal",options:sharedHelperOptions(p.options),...(p.options.sharedClipboard?{clipboard:true}:{})} : p.options);
    this.pruneSources();const monitorSource=p.options.independentMonitors?this.monitorSources.get(p.options.monitorDevice!):undefined;
    if(this.captureMode&&this.captureMode!==requestedMode&&(this.active||this.shared.size||this.physicalHelpers.size))throw new RpcError("server_busy","前の共有方式の終了を確認してから切り替えてください");
    if(p.options.independentMonitors&&(monitorSource&&monitorSource.key!==sharedKey||!monitorSource&&this.physicalHelpers.size>=8))throw new RpcError("server_busy","同じモニターの画質設定が異なるか、補助プログラムの上限です");
    if (this.active || (this.shared.size && (!p.options.sharedDesktop || !p.options.independentMonitors&&this.sharedKey !== sharedKey)) || this.shared.size >= 8)
      throw new RpcError("server_busy", "Bのデスクトップは異なる設定で共有中か、viewer数の上限です。同じ複数viewer設定で接続してください。");
    const url = new URL(p.url);
    if (
      url.pathname !== "/desktop-share" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      !(endpoint?url.protocol==="ws:"&&url.origin.replace(/^ws/,"http")===scope!.origin:allowedRelay(url, cfg.origins()))
    )
      throw new RpcError("unauthorized", "Bで許可されていない共有先です");
    if ((cfg.allowUnlock||cfg.allowVirtualDisplay||cfg.allowElevated)&&cfg.unlockLeaseCommand) this.unlockLease.ensureRunning();
    const ws = new WebSocket(url, {
      handshakeTimeout: 10000,
      maxPayload: 65536,
      perMessageDeflate: false,
      followRedirects: false,
    });
    const s: Share = {
      resourcesManaged:!cfg.nativePlatform,
      independent:p.options.independentMonitors===true,
      captureKey:sharedKey,
      ...(scope?{endpointActive:scope.active}:{}),
      shared: p.options.sharedDesktop === true,
      inputAcks: new DesktopInputAcks(seq => { if (!s.dead) this.send(s,{type:"input_ack",seq}); },(seq,point)=>{
        const source=s.process?.resourceChannel,owner=this.resources.identity(s,"control");
        if(!s.dead&&s.control&&seq===s.inputSeq&&source&&owner?.source===source&&owner.epoch===point.epoch)s.pointerWitness={seq,point,source,at:performance.now()};
      }),
      imageExpected:!!p.imageTicket,
      chain: new DesktopFrameChain(),
      owner,
      allowClipboard: false,
      dynamicQuality: false,
      clipboardGranted: false,
      clipboardId: 0,
      clipboardGeneration: 0,
      clipboardPending: new Set(),
      quality: p.options.quality,
      video: false,
      ws,
      dead: false,
      attached: false,
      ready: false,
      control: false,
      allowInput: false,
      lastSeen: performance.now(),
      seq: 0,
      pending: 0,
      inputSeq: 0,
      frameAt: 0,
      sourceIdle:new DesktopSourceIdle(),
      started: performance.now(),
      timer: setInterval(() => {
        if(!this.live(s))return;s.native?.tick();
        if (
          performance.now() - s.lastSeen > 12000 ||
          (performance.now() - s.started > (cfg.nativePlatform?130000:p.options.virtualDisplay?25000:15000) && !s.ready)
        )
          this.stop(s);
      }, 1000),
    };
    s.timer.unref();
    this.captureMode=requestedMode;
    if(s.independent){let source=this.monitorSources.get(p.options.monitorDevice!);if(!source){source={key:sharedKey,pool:new DesktopSharedCapture()};this.monitorSources.set(p.options.monitorDevice!,source);}s.capturePool=source.pool;}
    if (s.shared) { this.shared.add(s); if(!s.independent)this.sharedKey = sharedKey; }
    else this.active = s;
    ws.on("error", () => this.stop(s));
    ws.on("close", () => this.stop(s));
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = () => {
        if (!settled) {
          settled = true;
          reject(new RpcError("spawn_failed", "共有用の接続を開始できませんでした"));
        }
      };
      ws.once("close", fail);
      ws.once("open", () => {if(this.live(s))ws.send(JSON.stringify({ type: "provider", ticket: p.ticket }));});
      ws.on("message", async (bytes, binary) => {
        if (!this.live(s)) return;
        if (binary) {
          this.stop(s);
          return;
        }
        try {
          const rawMessage = JSON.parse(bytes.toString());
          if (rawMessage.type === "attached" && !s.attached) {
            s.attached = true;
            s.lastSeen = performance.now();
            if (p.videoTicket) {
              const video = s.videoSocket = new WebSocket(url, DESKTOP_VIDEO_LANE_PROTOCOL, {handshakeTimeout:10000,maxPayload:1024,perMessageDeflate:false,followRedirects:false});
              video.on("open", () => video.send(JSON.stringify({type:"video_provider",ticket:p.videoTicket})));
              video.on("error", () => video.terminate());
              video.on("close", () => { s.videoReady=false; s.native?.stop("unavailable"); });
              // A never sends video/application data back over the send-only lane.
              video.on("message", () => video.terminate());
            }
            if(p.imageTicket){
              const image=s.imageSocket=new WebSocket(url,DESKTOP_IMAGE_LANE_PROTOCOL,{handshakeTimeout:10000,maxPayload:1024,perMessageDeflate:false,followRedirects:false});
              image.on("open",()=>image.send(JSON.stringify({type:"video_provider",ticket:p.imageTicket})));
              image.on("error",()=>image.terminate());image.on("message",()=>image.terminate());
              image.on("close",()=>this.failImages(s));
            }
            if(p.fileTicket){
              if(p.options.files!==true||!cfg.fileRoot)throw Error("File transfer not negotiated");
              const socket=s.fileSocket=new WebSocket(p.url,DESKTOP_FILES_PROTOCOL,{handshakeTimeout:10000,followRedirects:false,perMessageDeflate:false,maxPayload:100000});
              s.files=DesktopFiles.open(cfg.fileRoot,()=>this.live(s)&&s.ready&&(!s.secureDesktop||s.protectedFilesActive===true)&&performance.now()-s.lastSeen<5000,p.options.fileCheckpoints?this.fileCheckpoints:undefined,()=>this.config===cfg&&this.sourceEpoch===epoch&&!!cfg.fileRoot,p.options.folders===true,p.options.folderCheckpoints?this.folderCheckpoints:undefined,!cfg.nativePlatform&&!p.options.elevatedDesktop&&!p.options.virtualDisplay?{
                origin:scope?.nativeOrigin??url.origin.replace(/^ws/,"http"),
                runtime:this.nativeSelection,paths:(paths,signal)=>this.nativeSelection.paths(paths,signal),
                pointer:seq=>{
                  const proof=s.pointerWitness,owner=this.resources.identity(s,"control");
                  if(!proof||proof.seq!==seq||!owner||owner.source!==proof.source||owner.epoch!==proof.point.epoch)return;
                  const valid=()=>this.live(s)&&s.control&&s.pointerWitness===proof&&this.resources.identity(s,"control")?.source===proof.source&&this.resources.identity(s,"control")?.epoch===proof.point.epoch&&performance.now()-proof.at<750;
                  if(!valid())return;
                  return {seq,point:proof.point,at:proof.at,valid,release:async()=>{
                    if(!valid())throw Error("元のドラッグ操作が終了しました");
                    s.inputAcks.invalidatePointers();delete s.pointerWitness;s.control=false;
                    s.process?.requestControl?.(false);
                    this.write(s,{type:"control",enabled:false});
                    const receipt=await this.resources.releaseConfirmed(s,"control");
                    if(!this.live(s)||s.process?.resourceChannel!==proof.source)throw Error("共有元が変更されました");
                    return receipt;
                  }};
                },
              }:undefined).then(async worker=>{if(!this.live(s)){await worker.close();return undefined;}return worker;}).catch(()=>undefined);
              socket.on("open",()=>socket.send(JSON.stringify({type:"video_provider",ticket:p.fileTicket})));
              const stop=()=>{void s.files?.then(worker=>worker?.close());socket.terminate();};let pending=0;
              socket.on("error",stop);socket.on("close",stop);socket.on("message",async(raw,binary)=>{if(!this.live(s))return;try{
                const bytes=Buffer.isBuffer(raw)?raw:Array.isArray(raw)?Buffer.concat(raw):Buffer.from(raw);if(++pending>4||binary||bytes.length>100000)throw Error("File request limit");
                const m=DesktopFileRequest.parse(JSON.parse(bytes.toString())),worker=await s.files;
                const result=worker?await worker.run(m):{type:"desktop_file_result",id:m.id,ok:false,message:"共有フォルダを利用できません。接続先で設定を確認してください"};
                if(this.live(s)&&socket.readyState===WebSocket.OPEN&&socket.bufferedAmount<262144)socket.send(JSON.stringify(DesktopFileResult.parse(result)));else stop();
              }catch{stop();}finally{pending--;}});
            }
            if(p.microphoneTicket){
              if(p.options.microphone!==true||!cfg.allowMicrophone||!cfg.microphoneEndpoint)throw Error("Microphone not negotiated");
              const socket=s.microphoneSocket=new WebSocket(p.url,DESKTOP_MICROPHONE_PROTOCOL,{handshakeTimeout:10000,followRedirects:false,perMessageDeflate:false,maxPayload:4096});
              socket.on("open",()=>socket.send(JSON.stringify({type:"video_provider",ticket:p.microphoneTicket})));
              const stop=()=>{s.microphone?.stop();socket.terminate();};socket.on("error",stop);socket.on("close",stop);
              socket.on("message",(raw,binary)=>{if(!this.live(s))return;try{const bytes=Buffer.isBuffer(raw)?raw:Array.isArray(raw)?Buffer.concat(raw):Buffer.from(raw);if(binary||bytes.length>4096||!s.microphone)throw Error("Microphone not ready");s.microphone.fromViewer(DesktopMicrophoneRequest.parse(JSON.parse(bytes.toString())));}catch{stop();}});
            }
            if(p.clipboardTicket){
              if(p.options.richClipboard!==true||cfg.allowClipboard!==true)throw Error("Rich clipboard not negotiated");
              const socket=s.clipboardSocket=new WebSocket(p.url,DESKTOP_RICH_CLIPBOARD_PROTOCOL,{handshakeTimeout:10000,followRedirects:false,perMessageDeflate:false,maxPayload:32768});
              socket.on("open",()=>socket.send(JSON.stringify({type:"video_provider",ticket:p.clipboardTicket})));
              const stop=()=>{s.richClipboard?.stop();delete s.richClipboard;socket.terminate();};
              socket.on("error",stop);socket.on("close",stop);socket.on("message",(raw,binary)=>{if(!this.live(s))return;try{const bytes=Buffer.isBuffer(raw)?raw:Array.isArray(raw)?Buffer.concat(raw):Buffer.from(raw);if(binary||bytes.length>32768)throw Error("Clipboard lane format");if(!s.richClipboard)throw Error("Clipboard not ready");s.richClipboard.fromViewer(JSON.parse(bytes.toString()));}catch{stop();}});
            }
            await this.prepareLaunch(s, cfg, p.options);
            if(!this.live(s))throw new RpcError("unauthorized","Desktop request cancelled");
            settled = true;
            resolve({ started: true });
            return;
          }
          if (!s.attached) {
            this.stop(s);
            return;
          }
          if (rawMessage.type === "video_ready" && p.videoTicket && Object.keys(rawMessage).length === 1) { s.videoReady = s.videoSocket?.readyState === WebSocket.OPEN; return; }
          if(p.imageTicket&&Object.keys(rawMessage).length===1&&rawMessage.type==="image_ready"){
            if(!s.imageFailed&&s.ready&&s.imageSocket?.readyState===WebSocket.OPEN){s.imageReady=true;const held=s.heldImage;delete s.heldImage;if(held)this.sendImage(s,held);}else this.failImages(s);return;
          }
          if(p.imageTicket&&Object.keys(rawMessage).length===1&&rawMessage.type==="image_closed"){this.failImages(s);return;}
          // Private A->B marker, negotiated through RPC capabilities. Browser
          // messages and agent actions retain their existing strict schemas.
          const nativeDraw = rawMessage.type === "input" && rawMessage.nativeDraw === true;
          if (nativeDraw) delete rawMessage.nativeDraw;
          const platformIdleInput=rawMessage.type==="input"&&rawMessage.platformIdleInput===true;
          if(platformIdleInput)delete rawMessage.platformIdleInput;
          const m = RemoteDesktopViewerMessage.parse(rawMessage);
          if(p.options.sharedDesktop&&(!p.options.sharedRate||!s.sharedRate)&&m.type==="media"&&m.settings)m.settings.adaptive=false;
          if(m.type==="media"&&m.enabled&&m.settings?.transport==="native"&&p.videoTicket&&!s.videoReady){this.send(s,{type:"media_unavailable"});return;}
          if(m.type==="media"&&!m.enabled&&s.ready&&!s.secureDesktop){s.native?.fromViewer(m);this.companion.fromViewer(s,m);return;}
          if(m.type==="native_audio_control"&&s.ready&&!s.secureDesktop){s.native?.fromViewer(m);return;}
          if(m.type==="media"&&m.enabled&&m.settings?.audio&&(cfg.allowSystemAudio??cfg.allowMedia)!==true){this.send(s,{type:"media_unavailable"});return;}
          if((m.type==="rtc_signal"||m.type==="media_fallback")&&s.ready&&!s.secureDesktop&&s.native?.fromViewer(m))return;
          if(m.type==="native_codec_fallback"||m.type==="native_format_ack"||m.type==="native_video_ack"||(m.type==="media"&&(m.settings?.transport==="native"||s.native))) {
            if(!s.ready||s.secureDesktop){this.send(s,{type:"media_unavailable"});return;}
            else {
              if(m.type==="media"&&m.settings?.transport==="native")this.companion.fromViewer(s,{type:"media",enabled:false});
              if(s.native?.fromViewer(m))return;
            }
          }
          if (
            m.type === "media" ||
            m.type === "media_fallback" ||
            m.type === "rtc_signal" ||
            m.type === "media_feedback"
          ) {
            if (!s.ready || s.secureDesktop || !this.companion.fromViewer(s, m))
              this.send(s, { type: "media_unavailable" });
          } else if (m.type === "quality") {
            if (
              s.dynamicQuality &&
              p.options.adaptive &&
              m.fps <= p.options.fps &&
              m.quality <= p.options.quality
            ) {
              s.quality = m.quality;
              this.write(s, { type: "policy", fps: s.video ? 1 : m.fps, quality: m.quality });
            }
          } else if (m.type === "clipboard_grant") {
            s.clipboardGeneration++;
            s.clipboardGranted = m.enabled && s.allowClipboard && this.claimResource(s,"clipboard");
            if(p.options.sharedClipboard)s.clipboardGranted=s.process?.requestClipboard?.(s.clipboardGranted,s.clipboardGeneration)===true;
            if(p.options.sharedClipboard&&m.enabled&&s.allowClipboard&&!s.clipboardGranted)this.send(s,{type:"clipboard_busy"});
            s.clipboardPending.clear();
            s.richClipboard?.revoke();
            if (s.allowClipboard&&!p.options.sharedClipboard)
              this.write(s, {
                type: "clipboard_control",
                enabled: s.clipboardGranted,
                generation: s.clipboardGeneration,
              });
            if(!s.clipboardGranted&&s.resourcesManaged)this.resources.release(s,"clipboard");
            this.send(s, { type: "clipboard_state", enabled: s.clipboardGranted });
          } else if (m.type === "clipboard") {
            if (
              !s.clipboardGranted || !this.ownsResource(s,"clipboard") ||
              !s.ready ||
              m.id <= s.clipboardId ||
              s.clipboardPending.size ||
              performance.now() - s.lastSeen > 5000 ||
              (m.operation === "write" && !cfg.allowInput)
            ) {
              this.send(s, { type: "clipboard_result", id: m.id, ok: false });
            } else {
              s.clipboardId = m.id;
              s.clipboardPending.add(m.id);
              this.write(s, {
                ...m,
                generation: s.clipboardGeneration,
                expiresAt: Date.now() + 1000,
              });
            }
          } else if (m.type === "heartbeat") {
            s.lastSeen = performance.now();
            this.write(s, m);
          } else if (m.type === "stop") this.stop(s);
          else if(m.type==="native_pointer_cancel") {s.inputAcks.invalidatePointers();delete s.pointerWitness;}
          else if (m.type === "release") {
            s.inputAcks.invalidatePointers();
            delete s.pointerWitness;
            if (s.control&&this.ownsResource(s,"control")) this.write(s, m);
          } else if (m.type === "ack") {
            if (m.seq !== s.pending) {
              this.stop(s);
              return;
            }
            s.pending = 0;
            this.write(s, m);
          } else if (m.type === "keyframe") {
            if(m.region!==undefined){
              const size=s.chain.last;
              if(!s.agentRegions||!size||m.region&&(m.region.x+m.region.width>size.width||m.region.y+m.region.height>size.height))throw new Error("Invalid agent region");
            }
            this.write(s, s.shared?m:m.region===undefined?m:{type:"keyframe",regions:m.region?[DesktopRegionSpec.parse(m.region)]:[]});
          } else if (m.type === "control") {
            s.inputAcks.invalidatePointers();
            delete s.pointerWitness;
            if(s.pendingControl){delete s.pendingControl;this.send(s,{type:"control",enabled:false});if(!this.live(s))return;}
            const enabled = m.enabled && s.allowInput && s.ready && this.claimResource(s,"control");
            if(m.enabled&&!enabled&&s.allowInput&&s.ready&&s.resourcesManaged){
              const pending=this.resources.releasing(s,"control");
              if(pending&&s.process?.resourceChannel===pending.source){s.pendingControl=pending;s.control=false;return;}
            }
            this.applyControl(s,enabled);
          } else if (m.type === "sas") {
            if (s.secureDesktop && !s.protectedDesktop && !s.lockScreenCover && s.control && this.ownsResource(s,"control") && s.ready && performance.now() - s.lastSeen < 5000)
              this.write(s, m);
          } else if (m.type === "dismiss_lock_screen") {
            if (s.lockScreenCover && s.secureDesktop && s.control && this.ownsResource(s,"control") && s.ready && cfg.allowInput && performance.now() - s.lastSeen < 5000)
              this.write(s, m);
          } else if (m.type === "input") {
            s.inputAcks.invalidatePointers();delete s.pointerWitness;
            if(!supportsDesktopInput(s.inputCapabilities,m.input))return;
            if (isExtendedDesktopInput(m.input) && !s.extendedInput) return;
            if (m.input.kind === "key" && (m.input.code === "ImeOn" || m.input.code === "ImeOff") && !s.imeKeys) return;
            if (
              s.control && this.ownsResource(s,"control") &&
              m.frameSeq >= s.seq - 1 &&
              m.frameSeq <= s.seq &&
              m.seq > s.inputSeq &&
              performance.now() - s.lastSeen < 5000 &&
              s.seq > 0 &&
              (nativeDraw ? s.native?.hasFreshDraw() === true : performance.now() - s.frameAt < 2000||platformIdleInput&&s.sourceIdle.fresh({backend:cfg.nativePlatform,ready:s.ready,pending:s.pending,seq:s.seq}))
            ) {
              s.inputSeq = m.seq;
              s.inputAcks.submitted(m.seq,m.input.kind==="pointer"&&m.input.event==="down"&&m.input.button===0);
              this.write(s, { ...m, expiresAt: Date.now() + 500, ...(nativeDraw && s.deferNativeSnapshots ? {deferNativeSnapshot:true} : {}) });
            }
          } else {
            this.stop(s);
          }
        } catch {
          this.stop(s);
        }
      });
    });
  }
  private async prepareLaunch(
    s: Share,
    cfg: DesktopProviderConfig,
    options: z.infer<typeof DesktopStartParams>["options"],
  ): Promise<void> {
    const pipes=this.audioPipes;
    if(!cfg.nativePlatform&&desktopWslAudioCommand(cfg.command)&&((options.sharedDesktop||options.nativeAudio)&&(cfg.allowSystemAudio??cfg.allowMedia)&&cfg.allowNativeVideo||(options.sharedDesktop||options.microphone)&&cfg.allowMicrophone&&cfg.microphoneEndpoint)){
      const prepared=await pipes.prepare();if(!this.live(s)||this.audioPipes!==pipes)return;if(prepared)s.audioPipes=pipes;
    }
    this.launch(s,cfg,options);
  }
  private launch(s:Share,cfg:DesktopProviderConfig,options:z.infer<typeof DesktopStartParams>["options"]):void {
    const rolePlan=desktopHelperRolePlan(cfg,options);
    const spawnHelper = ():DesktopHelper => {if(options.independentMonitors&&this.physicalHelpers.size>=8)throw new RpcError("server_busy","補助プログラムの終了待ちを含めた上限です");const raw=spawn(cfg.command[0]!, cfg.command.slice(1), {
      shell: false,
      windowsHide: true,
      env:{...process.env,...desktopHelperRoleEnvironment(rolePlan),SODA_DESKTOP_ELEVATED_REQUEST:options.elevatedDesktop===true&&cfg.allowElevated===true?"1":"0",SODA_DESKTOP_VIRTUAL_REQUEST:options.virtualDisplay===true&&cfg.allowVirtualDisplay===true?"1":"0"},
      stdio: ["pipe", "pipe", "pipe"],
    });
      const child:DesktopHelper=cfg.nativePlatform?raw:new DesktopResourceChannel(raw,{ack:(source,id)=>{this.resources.acknowledge(source,id);},close:source=>{this.resources.sourceGone(source);}});
      if(cfg.nativePlatform){
        let exited=false;const closed=new Promise<void>(resolve=>raw.once("close",()=>{exited=true;resolve();}));
        child.nativePcm={paths:this.nativePcmPaths,owner:{closed,exited:()=>exited||raw.exitCode!==null||raw.signalCode!==null}};
      }
      this.physicalHelpers.add(child);child.once("close",()=>{this.physicalHelpers.delete(child);this.resetResourcesIfDrained();queueMicrotask(()=>this.pruneSources());});return child;
    };
    const child = options.sharedDesktop ? (s.capturePool??this.sharedCapture).attach(s.captureKey!, spawnHelper) : spawnHelper();
    s.process = child;
    child.once("error", () => this.stop(s));
    child.once("close", () => {
      if (this.active === s) this.active = undefined;
      this.stop(s);
    });
    child.stdin.on("error", () => this.stop(s));
    // Native errors can contain paths/window titles. Never forward or log stdout/stderr contents.
    child.stderr.on("data", (chunk: Buffer) => { if (!s.dead) s.inputAcks.push(chunk); });
    let buffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (s.dead) return;
      buffer += chunk;
      if (buffer.length > 3 * 1024 * 1024) {
        this.stop(s);
        return;
      }
      let n: number;
      while ((n = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, n).trim();
        buffer = buffer.slice(n + 1);
        if (!line) continue;
        try {
          const raw = JSON.parse(line);
          if(options.elevatedDesktop&&["unlock_failure","session_locked","session_unlocked","lock_screen_changed"].includes(raw.type)){this.send(s,{type:"protected_desktop_failure",code:raw.type==="unlock_failure"?"worker_unavailable":"source_changed"});this.stop(s);return;}
          if(raw.type==="protected_desktop_failure"&&options.elevatedDesktop&&cfg.allowElevated){this.send(s,DesktopProtectedFailure.parse(raw));this.stop(s);return;}
          if(raw.type==="virtual_display_failure"&&options.virtualDisplay&&cfg.allowVirtualDisplay){this.send(s,DesktopVirtualFailure.parse(raw));this.stop(s);return;}
          if(raw.type==="monitor_topology_changed"&&Object.keys(raw).length===1&&s.ready&&!s.secureDesktop&&options.monitors===true&&cfg.allowMonitors===true){if(s.independent)this.stopMonitorGeneration();else{this.send(s,{type:"monitor_topology_changed"});this.stop(s);}return;}
          if (raw.type === "ready" && !s.ready) {
            const {deferNativeSnapshots, inputAckPipe,nativePointerProof, ...wireReady}=raw;
            const ready = DesktopReady.parse(wireReady);
            s.agentRegions=ready.agentRegions===true&&!ready.secureDesktop;
            if(cfg.nativePlatform?(ready.backend!==cfg.nativePlatform||!ready.inputCapabilities):ready.backend==="linux-portal"||ready.backend==="macos-sck")throw Error("Unexpected native backend proof");
            if(!cfg.nativePlatform&&ready.inputCapabilities)throw Error("Unrequested input capabilities");
            if(ready.inputCapabilities)s.inputCapabilities=ready.inputCapabilities;
            if(options.elevatedDesktop&&(!ready.protectedDesktop||!ready.secureDesktop||ready.lockScreenCover)){
              this.send(s,{type:"protected_desktop_failure",code:"service_incompatible"});throw Error("Requested protected worker unavailable");
            }
            if(options.sharedProtected&&ready.sharedProtected!==true){this.send(s,{type:"protected_desktop_failure",code:"service_incompatible"});throw Error("Shared protected worker proof missing");}
            if(ready.protectedDesktop&&(!options.elevatedDesktop||!cfg.allowElevated))throw Error("Unrequested protected worker");
            s.protectedFilesActive=options.protectedFiles===true&&cfg.allowProtectedFiles===true&&!!ready.protectedDesktop&&ready.secureDesktop===true;
            if(ready.protectedDesktop)s.protectedDesktop=ready.protectedDesktop;else delete s.protectedDesktop;
            if(options.independentMonitors){
              if(!ready.resourceFences||!ready.monitorLayout||ready.monitorLayout.selected!==options.monitorDevice||ready.secureDesktop||ready.virtualDisplay||ready.lockScreenCover)throw Error("Independent monitor helper proof missing");
              const topology=JSON.stringify([...ready.monitorLayout.monitors].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0));
              if(this.monitorTopology&&this.monitorTopology!==topology){this.stopMonitorGeneration();throw Error("Monitor generation changed");}this.monitorTopology=topology;
            }
            s.secureDesktop = ready.secureDesktop === true;
            s.inputAcks.enabled = !s.secureDesktop && inputAckPipe === true;
            s.inputAcks.pointerEnabled=!s.secureDesktop&&!ready.virtualDisplay&&!cfg.nativePlatform&&!!cfg.fileRoot&&nativePointerProof===true&&s.process?.resourceChannel?.supported===true;
            if(s.inputAcks.pointerEnabled&&options.files===true)void this.nativeSelection.prepare().catch(()=>{});
            s.deferNativeSnapshots=options.nativeVideo===true&&cfg.allowNativeVideo===true&&!s.secureDesktop&&deferNativeSnapshots===true;
            s.lockScreenCover = ready.lockScreenCover === true;
            s.imeKeys = options.imeKeys === true && ready.imeKeys === true && !s.lockScreenCover;
            s.extendedInput = options.extendedInput === true && ready.extendedInput === true && !s.lockScreenCover;
            if (s.secureDesktop && !s.protectedDesktop && !cfg.allowUnlock) throw new Error("Unlock is not locally permitted");
            if (
              !s.secureDesktop && options.display &&
              (!ready.display ||
                ready.width !== options.display.width ||
                ready.height !== options.display.height)
            )
              throw new Error("Helper did not apply requested display mode");
            if (
              options.image &&
              (ready.image
                ? ready.image.colorMode !== options.image.colorMode ||
                  ready.image.showCursor !== options.image.showCursor
                : options.image.colorMode !== "full" || !options.image.showCursor)
            )
              throw new Error("Helper does not support requested image settings");
            if(options.virtualDisplay&&(ready.virtualDisplay!==true||s.secureDesktop||ready.lockScreenCover)){this.send(s,{type:"virtual_display_failure",code:"helper_incompatible"});throw Error("Helper did not create requested virtual monitor");}
            if(!s.secureDesktop&&options.sharedMonitors&&!ready.monitorLayout){this.send(s,{type:"shared_monitors_failure",code:"helper_incompatible"});this.stop(s);return;}
            if(!s.secureDesktop&&options.monitorDevice&&(!ready.monitorLayout||ready.monitorLayout.selected!==options.monitorDevice))throw Error("Helper did not select requested monitor");
            if(ready.monitorLayout&&(ready.monitorLayout.bounds.width!==ready.width||ready.monitorLayout.bounds.height!==ready.height))throw Error("Monitor capture size mismatch");
            s.ready = true;
            s.allowClipboard = !s.secureDesktop && cfg.allowClipboard === true && ready.allowClipboard === true && (!s.resourcesManaged||s.process?.resourceChannel?.supported===true);
            s.dynamicQuality = ready.dynamicQuality === true;
            s.allowInput = ready.allowInput && cfg.allowInput && (!s.resourcesManaged||s.process?.resourceChannel?.supported===true);
            const {
              imeKeys,
              extendedInput,
              resourceFences:_resourceFences,sharedProtected,sharedProtectedAvailable:_sharedProtectedAvailable,protectedDesktop,virtualDisplay,monitorLayout,files,fileCheckpoints:_helperFileCheckpoints,durableFileCheckpoints:_helperDurable,durableFolderCheckpoints:_helperDurableFolders,folders:_helperFolders,folderCheckpoints:_helperFolderCheckpoints, nativeVideo,nativeDatagrams,nativeAudio,microphone,inputCapabilities,richClipboard,
              nativeVideoWindow,
              nativeMaxFps,nativeCadence,nativeAdaptive,nativeCodecs,nativeCodecCandidates,
              cursor,
              image: appliedImage,
              allowClipboard,
              allowMedia,
              dynamicQuality,
              display,
              ...legacyReady
            } = ready;
            if(options.richClipboard===true&&richClipboard===true&&s.allowClipboard&&s.clipboardSocket)s.richClipboard=new DesktopRichClipboard({allowed:write=>s.ready&&this.live(s)&&!s.secureDesktop&&s.allowClipboard&&s.clipboardGranted&&this.ownsResource(s,"clipboard")&&performance.now()-s.lastSeen<5000&&(!write||s.allowInput),generation:()=>s.clipboardGeneration,write:value=>this.write(s,value),send:value=>{if(!this.live(s))return false;const socket=s.clipboardSocket;if(!socket||socket.readyState!==WebSocket.OPEN||socket.bufferedAmount>65536)return false;socket.send(JSON.stringify(value));return true;}});
            if((!s.resourcesManaged||s.process?.resourceChannel?.supported===true)&&options.microphone&&ready.microphone&&cfg.allowMicrophone&&cfg.microphoneEndpoint&&!s.secureDesktop&&(process.platform==="win32"||ready.backend==="synthetic"||!!s.audioPipes||!!cfg.nativePlatform)&&s.microphoneSocket)s.microphone=new DesktopMicrophone({...(cfg.nativePlatform&&ready.backend!=="synthetic"?{nativeOutput:(name:string,active:()=>boolean)=>this.nativeMicrophones.open(cfg.nativePlatform!,cfg.microphoneEndpoint!,name,active)}:{}),...(s.audioPipes&&ready.backend!=="synthetic"?{bridge:(active:()=>boolean)=>s.audioPipes!.open("microphone",active)}:{}),allowOpus:options.microphoneOpus===true,synthetic:ready.backend==="synthetic",claim:(id:string)=>{if(!this.claimResource(s,"microphone"))return false;if(options.sharedMicrophone&&s.process?.requestMicrophone?.(id,true,cfg.nativePlatform&&ready.backend!=="synthetic"?false:true)!==true){if(s.resourcesManaged)this.resources.release(s,"microphone");return false;}s.microphoneOwned=true;return true;},release:(id:string)=>{if(options.sharedMicrophone)s.process?.requestMicrophone?.(id,false);s.microphoneOwned=false;if(s.resourcesManaged)this.resources.release(s,"microphone");},allowed:()=>this.live(s)&&s.ready&&!s.secureDesktop&&(!s.microphoneOwned||this.ownsResource(s,"microphone"))&&performance.now()-s.lastSeen<5000,write:value=>this.write(s,value),send:value=>{if(!this.live(s))return false;const socket=s.microphoneSocket;if(socket?.readyState!==WebSocket.OPEN||socket.bufferedAmount>8192)return false;socket.send(JSON.stringify(value));return true;}});
            const enabledMedia = !s.secureDesktop && cfg.allowMedia === true && dynamicQuality === true;
            const nativeEnabled=!s.secureDesktop&&options.nativeVideo===true&&cfg.allowNativeVideo===true&&nativeVideo===true;
            if(!s.secureDesktop&&options.sharedClipboard&&allowClipboard!==true){this.send(s,{type:"shared_clipboard_failure",code:"helper_incompatible"});this.stop(s);return;}
            if(!s.secureDesktop&&options.sharedCursor&&cursor!==true){this.send(s,{type:"shared_cursor_failure",code:"helper_incompatible"});this.stop(s);return;}
            if(options.cursor===true&&cursor===true&&!s.secureDesktop)s.cursor=new DesktopCursorStream(bytes=>this.send(s,bytes),()=>s.ws.bufferedAmount);
            const nativeRate=options.nativeMaxFps===60&&nativeMaxFps===60&&nativeEnabled?60:undefined;
            const audioEnabled=options.nativeAudio===true&&nativeAudio===true&&nativeEnabled&&(cfg.allowSystemAudio??cfg.allowMedia)===true&&(process.platform==="win32"||ready.backend==="synthetic"||!!s.audioPipes||!!cfg.nativePlatform&&!!s.process?.nativePcm);
            const udpEnabled=options.nativeDatagrams===true&&(nativeDatagrams===true||!!cfg.nativePlatform)&&nativeEnabled;
            const nativeWindow=options.nativeVideoWindow===3&&nativeVideoWindow===3&&nativeEnabled?3:1;
            s.sharedRate=options.sharedRate===true&&nativeCadence===true&&nativeEnabled;
            s.native=new DesktopNativeVideo({...(s.process?.nativePcm?{nativePcm:s.process.nativePcm}:{}),...(s.audioPipes&&ready.backend!=="synthetic"?{audioBridge:(active:()=>boolean)=>s.audioPipes!.open("audio",active)}:{}),enabled:nativeEnabled,sharedResolution:options.sharedResolution===true&&nativeAdaptive===true,codecs:options.nativeCodecs===true&&nativeCodecs===true,adaptive:options.nativeAdaptive===true&&nativeAdaptive===true,cadence:options.nativeCadence===true&&nativeCadence===true,sharedRate:options.sharedRate===true&&nativeCadence===true,datagrams:udpEnabled,audioEnabled,...(s.shared&&s.process?.createAudio?{audioFactory:hooks=>s.process!.createAudio!(hooks)}:{}),synthetic:ready.backend==="synthetic",iceServers:cfg.iceServers??[],window:nativeWindow,width:options.display?.width??options.width,sourceWidth:ready.width,sourceHeight:ready.height,...(options.display?{exact:options.display}:{}),fps:options.fps,...(nativeRate?{maxFps:nativeRate}:{}),send:value=>this.sendVideo(s,value),write:value=>this.write(s,value),buffered:()=>s.videoReady?s.videoSocket!.bufferedAmount:s.ws.bufferedAmount,policy:video=>{s.video=video;this.write(s,{type:"policy",fps:video?1:options.fps,quality:s.quality});}});
            this.send(s, {
              ...legacyReady,
              ...(options.elevatedDesktop&&protectedDesktop?{protectedDesktop}:{}),
              ...(options.sharedProtected&&sharedProtected?{sharedProtected:true}:{}),
              ...(cfg.nativePlatform&&inputCapabilities?{inputCapabilities}:{}),
              ...(options.virtualDisplay&&virtualDisplay&&!s.secureDesktop?{virtualDisplay:true}:{}),
              ...(options.monitors===true&&cfg.allowMonitors===true&&monitorLayout&&!s.secureDesktop?{monitorLayout}:{}),
              ...(options.files===true&&cfg.fileRoot&&s.fileSocket&&!s.secureDesktop?{files:true,...(options.fileCheckpoints?{fileCheckpoints:true,...(this.transferStore?{durableFileCheckpoints:true}:{})}:{}),...(options.folders?{folders:true}:{}),...(options.folderCheckpoints?{folderCheckpoints:true,...(this.transferStore?{durableFolderCheckpoints:true}:{})}:{})}:{}),
              ...(s.richClipboard?{richClipboard:true}:{}),
              ...(nativeEnabled?{nativeVideo:true}:{}),
              ...(nativeEnabled&&options.nativeCodecs&&nativeCodecs?{nativeCodecs:true,nativeCodecCandidates:nativeCodecCandidates??[]}:{}),
              ...(nativeEnabled&&options.nativeAdaptive&&nativeAdaptive?{nativeAdaptive:true}:{}),
              ...(nativeEnabled&&options.nativeCadence&&(!options.sharedDesktop||options.sharedRate)&&nativeCadence?{nativeCadence:true}:{}),
              ...(udpEnabled?{nativeDatagrams:true}:{}),
              ...(audioEnabled?{nativeAudio:true}:{}),
              ...(s.microphone?{microphone:true,...(options.microphoneOpus?{microphoneOpus:true}:{})}:{}),
              ...(nativeWindow===3?{nativeVideoWindow:3}:{}),
              ...(nativeRate?{nativeMaxFps:nativeRate}:{}),
              ...(s.cursor?{cursor:true}:{}),
              // Keep the existing viewer wire format; capture is a helper detail.
              backend: legacyReady.backend === "windows-dxgi" ? "windows-gdi" : legacyReady.backend,
              ...(s.imeKeys && imeKeys ? { imeKeys: true } : {}),
              ...(s.extendedInput && extendedInput ? { extendedInput: true } : {}),
              ...(options.image ? { image: appliedImage } : {}),
              ...(options.features
                ? {
                    allowClipboard: s.allowClipboard,
                    allowMedia: enabledMedia,
                    dynamicQuality: dynamicQuality === true,
                    ...(!s.secureDesktop && cfg.allowDisplayResize && display ? { display } : {}),
                  }
                : {}),
              allowInput: s.allowInput,
            });
            if(s.protectedFilesActive&&s.fileSocket)this.send(s,{type:"protected_files_ready",files:true,...(options.fileCheckpoints?{fileCheckpoints:true,...(this.transferStore?{durableFileCheckpoints:true}:{})}:{}),...(options.folders?{folders:true}:{}),...(options.folderCheckpoints?{folderCheckpoints:true,...(this.transferStore?{durableFolderCheckpoints:true}:{})}:{})});
            if (options.features && enabledMedia)
              this.companion.bind({
                owner: s,
                options: { ...options, width: options.display?.width ?? options.width },
                ready,
                send: (value) => this.send(s, value),
                buffered: () => s.ws.bufferedAmount,
                policy: (video) => {
                  s.video = video;
                  this.write(s, {
                    type: "policy",
                    fps: video ? 1 : options.fps,
                    quality: s.quality,
                  });
                },
              });
          } else if(raw.type==="platform_idle"){
            const notice=s.sourceIdle.receive(raw,{backend:cfg.nativePlatform,ready:s.ready,pending:s.pending,seq:s.seq});if(notice)this.send(s,notice);
          } else if(raw.type==="platform_failure"&&cfg.nativePlatform){const failure=DesktopNativePlatformFailure.parse(raw);if(failure.backend!==cfg.nativePlatform)throw Error("Wrong platform failure");this.send(s,failure);this.stop(s);
          } else if (raw.type === "session_locked" && cfg.allowUnlock && s.ready && !s.secureDesktop) {
            this.send(s, { type: "session_locked" });
            this.stop(s);
            return;
          } else if (raw.type === "session_unlocked" && s.ready && s.secureDesktop && !s.protectedDesktop) {
            this.send(s, { type: "session_unlocked" });
            this.stop(s);
            return;
          } else if (raw.type === "lock_screen_changed" && cfg.allowUnlock && s.ready && s.secureDesktop && s.lockScreenCover) {
            this.send(s, { type: "lock_screen_changed" });
            this.stop(s);
            return;
          } else if (raw.type === "unlock_failure" && cfg.allowUnlock && (!s.ready || s.secureDesktop) && unlockFailure(raw.code)) {
            // First terminal result wins; a later parent transition must never
            // overwrite an installed worker's explicit failure.
            this.send(s, { type: "unlock_failure", code: raw.code });
            this.stop(s);
            return;
          } else if (raw.type === "frame" && s.ready && !s.lockScreenCover) {
            const frame = HelperFrame.parse(raw);
            if(cfg.nativePlatform?(!frame.info.timing||frame.info.sourceInputSeq===undefined):(frame.info.timing!==undefined||frame.info.sourceInputSeq!==undefined))throw Error("Unnegotiated capture timing");
            if (
              s.pending ||
              frame.info.seq <= s.seq ||
              frame.info.width > (options.display?.width ?? options.width) ||
              (!s.secureDesktop && options.display &&
                (frame.info.width !== options.display.width ||
                  frame.info.height !== options.display.height))
            ) {
              this.stop(s);
              return;
            }
            const image = Buffer.from(frame.data, "base64");
            const packet = encodeDesktopFrame(frame.info, image);
            decodeDesktopFrame(packet);
            s.chain.accept(frame.info);
            s.seq = frame.info.seq;
            s.pending = s.seq;
            s.frameAt = performance.now();
            s.sourceIdle.frame();
            if(s.imageExpected&&!s.imageFailed&&!s.imageReady)s.heldImage=packet;
            else if (!this.sendImage(s, packet)) return;
          } else if (raw.type==="cursor"&&s.ready&&!s.secureDesktop&&s.cursor) {
            const {data,...info}=raw;
            if(data!==undefined&&(typeof data!=="string"||data.length>Math.ceil(DESKTOP_CURSOR_MAX_BYTES/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(data)))throw Error("Invalid cursor bytes");
            s.cursor.accept({info,data:Buffer.from(data??"","base64")});
          } else if (s.ready&&!s.secureDesktop&&s.native?.fromHelper(raw)) {
            // Native video has its own bounded frame/draw ACK.
          } else if(raw.type==="clipboard_rich_result"&&s.ready){
            try{s.richClipboard?.fromHelper(raw);}catch{s.richClipboard?.stop();delete s.richClipboard;s.clipboardSocket?.terminate();}
          } else if (raw.type === "clipboard_result" && s.ready) {
            const result = DesktopClipboardResult.parse(raw);
            if (s.clipboardPending.delete(result.id) && s.clipboardGranted) this.send(s, result);
          } else if (raw.type === "input_ack" && s.ready) {
            const ack = DesktopHelperInputAck.parse(raw);
            s.inputAcks.ack(ack.seq,ack.pointer);
          } else {
            this.stop(s);
            return;
          }
        } catch {
          this.stop(s);
          return;
        }
      }
    });
    const poolMedia=options.sharedDesktop===true&&!options.elevatedDesktop&&!cfg.nativePlatform;
    const poolVideo=options.sharedDesktop===true&&!options.elevatedDesktop;
    const {protectedFiles:_protectedFiles,sharedVirtual:_sharedVirtual,independentMonitors:_independentMonitors,sharedMonitors:_sharedMonitors,sharedDeltas:_sharedDeltas,sharedClipboard:_sharedClipboard,sharedCursor:_sharedCursor,sharedMicrophone:_sharedMicrophone,sharedProtected:_sharedProtected,sharedResolution:_sharedResolution,microphoneOpus:_microphoneOpus,sharedRate:_sharedRate,nativePlatform:_nativePlatform,sharedAudio:_sharedAudio,microphone:_microphone,sharedDatagrams:_sharedDatagrams,sharedNative:_sharedNative,sharedDesktop:_sharedDesktop,folderCheckpoints:_folderCheckpoints,folders:_folders,fileCheckpoints:_fileCheckpoints,files:_files,nativeCadence:_nativeCadence,nativeAdaptive:_nativeAdaptive,nativeCodecs:_nativeCodecs,...helperOptions}=options;
    this.write(s, {
      type: "configure",
      ...(cfg.nativePlatform?{nativePlatform:cfg.nativePlatform}:{}),
      ...(options.sharedDesktop&&cfg.allowUnlock?{allowSharedUnlock:true}:{}),
      ...(options.sharedVirtual&&cfg.allowVirtualDisplay?{allowSharedVirtual:true}:{}),
      options:options.sharedDesktop ? sharedHelperOptions(options) : helperOptions,
      captureBackends: ["dxgi"],
      inputAckPipe: !options.sharedDesktop,
      ...(!cfg.nativePlatform?{resourceFences:true,nativePointerProof:!!cfg.fileRoot&&!options.elevatedDesktop&&!options.virtualDisplay}:{}),
      allowMonitors:options.monitors===true&&cfg.allowMonitors===true,
      allowVirtualDisplay:options.virtualDisplay===true&&cfg.allowVirtualDisplay===true,
      ...(options.elevatedDesktop?{allowElevated:cfg.allowElevated===true}:{}),
      ...(options.sharedProtected?{allowSharedProtected:true}:{}),
      ...rolePlan,
      ...((poolVideo||options.microphone)&&cfg.allowMicrophone&&cfg.microphoneEndpoint?{microphoneEndpoint:cfg.microphoneEndpoint,microphoneClientPid:process.pid}:{}),
      audioClientPid:process.pid,
      ...(s.audioPipes?{audioPipeBridge:true}:{}),
      nativeAdaptive:(poolMedia||options.nativeAdaptive===true)&&cfg.allowNativeVideo===true,
      nativeCadence:(poolMedia||options.nativeCadence===true)&&cfg.allowNativeVideo===true,
      nativeDatagrams:(poolMedia||options.nativeDatagrams===true)&&cfg.allowNativeVideo===true,
      separateCursor: options.cursor===true,
      ...((poolVideo||options.nativeMaxFps===60)&&cfg.allowNativeVideo===true?{nativeMaxFps:60}:{}),
      allowNativeVideo: (poolVideo||options.nativeVideo===true)&&cfg.allowNativeVideo===true,
      deferNativeSnapshots: (poolVideo||options.nativeVideo===true)&&cfg.allowNativeVideo===true,
      ...((poolVideo||options.nativeVideoWindow===3)&&cfg.allowNativeVideo===true?{nativeVideoWindow:3}:{}),
      allowInput: cfg.allowInput,
      allowClipboard: (!options.sharedDesktop||options.sharedClipboard===true) && cfg.allowClipboard === true,
      allowDisplayResize: !options.sharedDesktop && cfg.allowDisplayResize === true,
    });
  }
  private failImages(s:Share){
    if(s.dead||s.imageFailed)return;if(s.imageReady){this.stop(s);return;}s.imageFailed=true;s.imageReady=false;s.imageSocket?.terminate();
    const held=s.heldImage;delete s.heldImage;if(held)this.send(s,held);
  }
  private sendImage(s:Share,data:Uint8Array):boolean{
    if(!s.imageReady)return this.send(s,data);
    const image=s.imageSocket;
    if(!this.live(s))return false;
    if(image?.readyState!==WebSocket.OPEN||image.bufferedAmount>DESKTOP_MAX_FRAME_BYTES+4096){this.stop(s);return false;}
    image.send(data);return true;
  }
  private sendVideo(s: Share, data: unknown): boolean {
    const video = s.videoSocket;
    if (!s.videoReady) return this.send(s, data);
    if (!this.live(s)) return false;
    if (video?.readyState !== WebSocket.OPEN || video.bufferedAmount > 512 * 1024) { s.videoReady=false; video?.terminate(); return false; }
    video.send(data instanceof Uint8Array ? data : JSON.stringify(data));
    return true;
  }
  private send(s: Share, data: unknown): boolean {
    if (
      !this.live(s) ||
      s.ws.readyState !== WebSocket.OPEN ||
      s.ws.bufferedAmount > DESKTOP_MAX_FRAME_BYTES + 4096
    ) {
      this.stop(s);
      return false;
    }
    s.ws.send(data instanceof Uint8Array ? data : JSON.stringify(data));
    return true;
  }
  private write(s: Share, value: unknown): void {
    if (!s.process || !this.live(s)) return;
    if (s.process.stdin.writableLength > 64 * 1024) {
      this.stop(s);
      return;
    }
    s.process.stdin.write(JSON.stringify(value) + "\n", (err) => {
      if (err) this.stop(s);
    });
  }
  private live(s:Share):boolean {
    if(s.dead)return false;
    if(s.endpointActive&&!s.endpointActive()){this.stop(s);return false;}return true;
  }
  private stop(s: Share): void {
    if (s.dead) return;
    s.dead = true;
    delete s.pendingControl;
    s.inputAcks.invalidatePointers();
    delete s.pointerWitness;
    if(s.resourcesManaged)this.resources.releaseAll(s);
    if (s.shared) { this.shared.delete(s); if (!this.shared.size) this.sharedKey = undefined; }
    delete s.heldImage; s.imageSocket?.terminate();
    s.videoSocket?.terminate();
    void s.files?.then(worker=>worker?.close());s.fileSocket?.terminate();
    s.richClipboard?.stop();s.clipboardSocket?.terminate();
    s.microphone?.stop();s.microphoneSocket?.terminate();
    s.native?.stop();
    this.companion.end(s);
    s.clipboardGranted = false;
    s.clipboardPending.clear();
    clearInterval(s.timer);
    const clearActive = () => {
      if (this.active === s) this.active = undefined;
    };
    if (s.process && s.process.exitCode === null && s.process.signalCode === null)
      s.process.once("close", clearActive);
    else clearActive();
    s.process?.stdin.end();
    const child = s.process;
    if (child) {
      const t = setTimeout(() => child.kill(), child.resourceChannel?.fencing?6000:1500);
      t.unref();
      child.once("close", () => clearTimeout(t));
    }
    this.pruneSources();
    s.ws.close(1000, "desktop stopped");
    const timer = setTimeout(() => s.ws.terminate(), 1000);
    timer.unref();
    s.ws.once("close", () => clearTimeout(timer));
  }
  clientGone(owner: string): void {
    for (const pending of this.pendingStarts) if (pending.owner === owner) pending.cancelled = true;
    if (this.active?.owner === owner) this.stop(this.active);
    for (const s of [...this.shared]) if (s.owner === owner) this.stop(s);
  }
  // Also used when pausing clients for handoff; rollback can reuse this provider.
  dispose(preserveTransfers=false): void {
    if(preserveTransfers)this.freezeSavedTransfers();
    this.sourceEpoch++;void this.nativeMicrophones.close().catch(()=>{});
    const audioPipes=this.audioPipes;this.audioPipes=new DesktopAudioPipes();void audioPipes.close().catch(()=>{});
    const nativeSelection=this.nativeSelection;this.nativeSelection=new DesktopNativeSelection();void nativeSelection.close().catch(()=>{});
    if(!preserveTransfers){this.transferBarrier=this.savedTransferWork(registry=>registry.invalidate());this.transferBarrier.catch(()=>{});}
    this.unlockLease.stop();
    this.companion.dispose();
    for (const pending of this.pendingStarts) pending.cancelled = true;
    if (this.active) this.stop(this.active);
    for (const s of [...this.shared]) this.stop(s);
    this.sharedCapture.dispose();for(const source of this.monitorSources.values())source.pool.dispose();
    this.resourceReset=true;this.resetResourcesIfDrained();
  }
}
function sharedHelperOptions(options: z.infer<typeof DesktopStartParams>["options"]) {
  return {width:options.width,fps:options.fps,quality:options.quality,...(options.sharedVirtual?{virtualDisplay:true as const}:{}),...(options.image?{image:options.image}:{}),deltas:options.sharedDeltas===true,adaptive:false,features:true,imeKeys:true,extendedInput:true,...(options.sharedCursor?{cursor:true as const}:{}),...(options.sharedMonitors?{monitors:true as const,...(options.monitorDevice?{monitorDevice:options.monitorDevice}:{})}:{})};
}
function allowedRelay(url: URL, origins: string[]): boolean {
  if (
    url.protocol !== "wss:" &&
    !(url.protocol === "ws:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
  )
    return false;
  const httpOrigin = url.origin.replace(/^ws/, "http");
  return origins.some((origin) => {
    try {
      return new URL(origin).origin.replace(/^ws/, "http") === httpOrigin;
    } catch {
      return false;
    }
  });
}

/** Public permission/data facade contract; implementation remains dynamically loaded. */
export type DesktopProviderApi=Pick<DesktopProvider,keyof DesktopProvider>;
