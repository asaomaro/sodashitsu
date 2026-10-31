import {createHash} from 'node:crypto';
import type {DesktopSavedTransferState} from './DesktopSavedTransferState.js';
import {RpcError} from '@sodashitsu/protocol';
import type {DesktopProviderApi} from './DesktopProvider.js';
import {desktopProviderCapabilities,type DesktopProviderConfig,type DesktopProviderEndpointScope} from './DesktopProviderCore.js';
import {DesktopCompanionHub} from './DesktopCompanion.js';
type Factory=(config:DesktopProviderConfig,companion:DesktopCompanionHub)=>DesktopProviderApi;
/** The disabled permission boundary owns no media/file/checkpoint implementation. */
export class LazyDesktopProvider implements DesktopProviderApi {
 readonly companion:DesktopCompanionHub;
 private provider:DesktopProviderApi|undefined;
 private loading:Promise<DesktopProviderApi>|undefined;
 private generation=0;
 private initialProviderEpoch=0;
 private starts=new Set<{owner:string;cancelled:boolean}>();
 private state:DesktopSavedTransferState|undefined;
 private stateLoading:Promise<DesktopSavedTransferState>|undefined;
 private policyWork:Promise<void>=Promise.resolve();
 private endpointOnly=false;
 private suspended=false;
 private saved:{directory:string;binding:string}|undefined;
 private holds=0;
 private fault=false;
 constructor(private config:DesktopProviderConfig|undefined,
  private load:()=>Promise<Factory>=async()=>{const{DesktopProvider}=await import('./DesktopProvider.js');return(config,companion)=>new DesktopProvider(config,companion);},
  private warn:()=>void=()=>{}) {
  this.companion=new DesktopCompanionHub(config?.allowMedia===true,config?.iceServers??[]);
 }
 get epoch(){return this.generation+(this.provider?this.provider.epoch-this.initialProviderEpoch:0);}
 capabilities(){return this.provider?.capabilities()??desktopProviderCapabilities(this.config,this.endpointOnly,!!this.saved);}
 configure(config:DesktopProviderConfig|undefined){
  ++this.generation;this.config=config;this.companion.configure(config?.allowMedia===true,config?.iceServers??[]);
  if(this.provider)this.provider.configure(config);else if(this.saved)this.invalidateCold();if(config?.allowUnlock)this.resumeUnlockLease();
 }
 private unavailable(){return new RpcError('unauthorized','Desktop sharing is disabled or changing');}
 private usable(){return !!this.config&&!this.suspended&&!this.holds&&!this.fault;}
 private binding(){return createHash('sha256').update(JSON.stringify({settings:this.saved!.binding,endpointOnly:this.endpointOnly})).digest('hex');}
 private async savedState(){
  if(this.state)return this.state;if(!this.saved)throw this.unavailable();
  if(!this.stateLoading)this.stateLoading=import('./DesktopSavedTransferState.js').then(({createDesktopSavedTransferState})=>{const saved=this.saved!;return this.state=createDesktopSavedTransferState(saved.directory,saved.binding,this.endpointOnly);}).finally(()=>{this.stateLoading=undefined;});
  return this.stateLoading;
 }
 private async stablePolicy(){for(;;){const work=this.policyWork;await work;if(work===this.policyWork)return;}}
 private policy(run:(state:DesktopSavedTransferState)=>Promise<void>,recover=false){const prior=recover?this.policyWork.catch(()=>{}):this.policyWork;const work=prior.then(async()=>{if(this.saved)await run(await this.savedState());});this.policyWork=work;return work;}
 private async ensure(){
  if(!this.usable())throw this.unavailable();if(this.provider)return this.provider;
  if(!this.loading){const generation=this.generation;
   this.loading=(async()=>{const create=await this.load();await this.stablePolicy();const state=this.saved?await this.savedState():undefined;
    if(!this.usable()||generation!==this.generation)throw this.unavailable();
    const provider=create(this.config!,this.companion);provider.requireEndpoint(this.endpointOnly);
    if(this.saved)provider.enableSavedTransfers(this.saved.directory,this.saved.binding,state);
    this.initialProviderEpoch=provider.epoch;this.provider=provider;return provider;
   })().finally(()=>{this.loading=undefined;});
  }
  const provider=await this.loading;if(!this.usable())throw this.unavailable();return provider;
 }
 private async starting<T>(owner:string,active:()=>boolean,run:(provider:DesktopProviderApi)=>Promise<T>){
  const generation=this.generation,pending={owner,cancelled:false};this.starts.add(pending);
  try{const provider=await this.ensure();if(pending.cancelled||generation!==this.generation||!this.usable()||!active())throw this.unavailable();return await run(provider);}
  finally{this.starts.delete(pending);}
 }
 async start(...args:Parameters<DesktopProviderApi['start']>){return this.starting(args[0],()=>true,provider=>provider.start(...args));}
 requireEndpoint(required:boolean){if(this.endpointOnly===required)return;++this.generation;this.endpointOnly=required;if(this.provider)this.provider.requireEndpoint(required);else if(this.saved&&!this.holds){this.holds++;void this.bindSavedTransfers().catch(()=>this.warn());}}
 endpointScope(origin:string,active:()=>boolean,nativeOrigin=origin):DesktopProviderEndpointScope {
  const url=new URL(origin),native=new URL(nativeOrigin);
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.origin!==origin||!['http:','https:'].includes(native.protocol)||native.origin!==nativeOrigin)throw this.unavailable();
  const generation=this.generation;let closed=false,scope:DesktopProviderEndpointScope|undefined;
  const baseLive=()=>!closed&&generation===this.generation&&active();
  const live=()=>baseLive()&&(scope?.active()??true);
  return {active:live,start:async(owner,params)=>{if(!live())throw this.unavailable();return this.starting(owner,live,async provider=>{if(!live())throw this.unavailable();scope??=provider.endpointScope(origin,baseLive,nativeOrigin);return scope.start(owner,params);});},release:owner=>{this.clientGone(owner);scope?.release(owner);},close:()=>{closed=true;scope?.close();}};
 }
 enableSavedTransfers(directory:string,binding:string){if(this.saved)throw Error('転送記録の初期化順が不正です');this.saved={directory,binding};this.provider?.enableSavedTransfers(directory,binding);}
 private async statesWork(run:(registry:DesktopSavedTransferState['files']|DesktopSavedTransferState['folders'])=>Promise<unknown>){
  if(!this.state)return;const results=await Promise.allSettled([run(this.state.files),run(this.state.folders)]);
  const failures=results.filter((r):r is PromiseRejectedResult=>r.status==='rejected');if(failures.length)throw new AggregateError(failures.map(r=>r.reason),'Saved transfer operation failed');
 }
 private invalidateCold(){void this.policy(async()=>{await this.statesWork(registry=>registry.invalidate());},true).catch(()=>{this.fault=true;this.warn();});}
 async invalidateSavedTransfers(){this.holds++;try{if(this.provider)await this.provider.invalidateSavedTransfers();else await this.policy(async state=>{state.files.freeze();state.folders.freeze();await this.statesWork(registry=>registry.invalidate());},true);}catch(error){this.failSavedTransferPolicy();throw error;}}
 async bindSavedTransfers(binding?:string){if(binding&&this.saved)this.saved.binding=binding;try{if(this.provider)await this.provider.bindSavedTransfers(binding);else await this.policy(async state=>{const scope=this.binding();await this.statesWork(registry=>registry.bind(scope));state.scope=scope;});this.fault=false;}catch(error){this.fault=true;throw error;}finally{this.holds=Math.max(0,this.holds-1);this.resumeRegistries();}}
 failSavedTransferPolicy(){this.fault=true;this.holds=Math.max(0,this.holds-1);this.provider?.failSavedTransferPolicy();}
 private async drain(suspend:boolean){
  const failures:unknown[]=[];try{await this.stablePolicy();}catch(error){failures.push(error);}
  try{if(this.provider){if(suspend)await this.provider.suspendSavedTransfers();else await this.provider.settleSavedTransfers();}
   else await this.statesWork(registry=>suspend?registry.suspend():registry.settled());
  }catch(error){failures.push(error);}if(failures.length)throw new AggregateError(failures,'Saved transfer drain failed');
 }
 async settleSavedTransfers(){await this.drain(false);}
 async suspendSavedTransfers(){this.suspended=true;++this.generation;await this.loading?.catch(()=>{});await this.drain(true);}
 private resumeRegistries(){if(this.suspended||this.holds||this.fault)return;if(this.provider)this.provider.resumeSavedTransfers();else{this.state?.files.resume();this.state?.folders.resume();}}
 resumeSavedTransfers(){this.suspended=false;this.resumeRegistries();}
 resumeUnlockLease(){if(this.provider){this.provider.resumeUnlockLease();return;}if(this.config?.allowUnlock&&!this.suspended)void this.ensure().catch(()=>this.warn());}
 clientGone(owner:string){for(const pending of this.starts)if(pending.owner===owner)pending.cancelled=true;this.provider?.clientGone(owner);}
 dispose(preserveTransfers=false){++this.generation;if(this.provider)this.provider.dispose(preserveTransfers);else{this.companion.dispose();if(!preserveTransfers)this.invalidateCold();else{this.state?.files.freeze();this.state?.folders.freeze();}}}
}
