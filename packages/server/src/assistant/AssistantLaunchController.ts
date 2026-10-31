import { watch, type FSWatcher } from "node:fs";
import type {ManagedAssistant} from "./ManagedAssistant.js";
import {assistantLaunchFromEnv} from "./AssistantLaunchConfig.js";
type App = Pick<ManagedAssistant,"start"|"stop">;
type AppFactory = (disabled:()=>void,attached:(deviceId:string)=>void)=>App;
type AppLoader = ()=>Promise<AppFactory>;
import type {AssistantLaunch} from "./AssistantLaunchConfig.js";
import {ASSISTANT_ENABLED_FILE as NAME,readAssistantEnabled,writeAssistantEnabled} from "./AssistantEnabledState.js";
export {readAssistantEnabled,writeAssistantEnabled} from "./AssistantEnabledState.js";
/** File watch owns no worker process. Disabled state never probes or starts an executable. */
export class AssistantLaunchController {
  private hostState:"none"|"starting"|"running"|"stopping"="none";
  private observation=0;
  private desiredEnabled:boolean|undefined;
  private desiredKey:string|null=null;
  private readonly checks=new Set<Promise<void>>();
  private requestKey:string|null=null;
  private activatedDeviceId:string|null=null;
  private appIdentity=Symbol();
  private preparing:AbortController|null=null;
  private phase:"disabled"|"preparing"|"starting"|"running"|"stopping"|"error"="disabled";
  private message="";
  private writes=Promise.resolve();
  private watcher: FSWatcher | null = null;
  private active = false;
  private wanted = false;
  private deviceId: string | null = null;
  private generation = 0;
  private revision = 0;
  private launchKey: string | null = null;
  private queue = Promise.resolve();
  private app: App | null = null;
  private readonly disabled:()=>void;
  private readonly attached:(deviceId:string)=>void;
  private readonly load:AppLoader;
  private readonly saves = new Set<Promise<void>>();
  constructor(private readonly dir: string, private readonly env: NodeJS.ProcessEnv,
    private readonly origin: () => string, private readonly warn: (message: string) => void,
    app?: App | AppFactory,
    private readonly save: typeof writeAssistantEnabled = writeAssistantEnabled,
    private readonly agent?: {activate(deviceId: string):void; requestStop(deviceId: string):Promise<void>},
    load?:AppLoader,
    private readonly resolveBundled=(origin:string,signal:AbortSignal,check:()=>void)=>import("./AssistantBundledLaunch.js").then(module=>module.bundledAssistantLaunch(origin,signal,check))) {
    const disabled = () => {
      if (!this.active) return;
      const pending = this.persist(false).catch(() => warn("アシスタントの無効設定を保存できません"));
      this.saves.add(pending);
      void pending.finally(() => this.saves.delete(pending));
    };
    const attached = (deviceId: string) => {
      if (!this.active) return;
      this.deviceId = deviceId;
      const generation=this.generation,identity=this.appIdentity;
      const pending=readAssistantEnabled(this.dir,this.env.SODA_ASSISTANT_ENABLED==="1").then(enabled=>{
        if(enabled&&this.active&&generation===this.generation&&identity===this.appIdentity&&this.wanted&&this.deviceId===deviceId){this.phase="running";this.hostState="running";if(this.activatedDeviceId!==deviceId){this.activatedDeviceId=deviceId;this.agent?.activate(deviceId);}}
      }).catch(()=>{});this.saves.add(pending);void pending.finally(()=>this.saves.delete(pending));
    };
    this.disabled=disabled;this.attached=attached;
    this.app=app && typeof app!=="function" ? app : null;
    this.load=load ?? (app ? async()=>typeof app==="function" ? app : ()=>app : async()=>{
      const {ManagedAssistant}=await import("./ManagedAssistant.js");
      return (onDisabled,onAttached)=>{
        const identity=this.appIdentity;
        return new ManagedAssistant(warn,undefined,onDisabled,onAttached,(retired)=>{
          if(this.appIdentity!==identity)return;
          if(retired===false){this.appIdentity=Symbol();this.phase="error";this.hostState="stopping";this.message="Windows側アシスタントの終了を確認できません。プロセスを確認してください。";return;}
          this.appIdentity=Symbol();this.app=null;this.hostState="none";this.launchKey=null;this.requestKey=null;this.activatedDeviceId=null;
          if(this.active&&this.wanted){this.phase="error";this.message="アシスタントが終了しました。有効化を再実行してください。";}
        });
      };
    });
  }
  start(): void {
    if (this.active) return;
    this.active = true; ++this.generation;
    {
      this.watcher = watch(this.dir, (_event, filename) => { if (filename?.toString()===NAME) this.apply(); });
      this.watcher.on("error", () => { this.warn("アシスタントの設定監視が停止しました"); void this.stop().catch(() => {}); });
    }
    this.apply();
  }
  private persist(enabled:boolean,guard:()=>void=()=>{}):Promise<void>{
    const pending=this.writes.then(()=>{guard();return this.save(this.dir,enabled);});this.writes=pending.catch(()=>{});return pending;
  }
  async status(canConfigure=true){return{enabled:await readAssistantEnabled(this.dir,this.env.SODA_ASSISTANT_ENABLED==="1"),canConfigure,phase:this.phase,message:this.message};}
  async setEnabled(enabled:boolean,guard:()=>void=()=>{}){
    const pending=this.persist(enabled,guard);this.saves.add(pending);try{await pending;}finally{this.saves.delete(pending);}await this.apply();return this.status();
  }
  private apply():Promise<void>{
    const observation=++this.observation,generation=this.generation;
    const current=()=>this.active&&generation===this.generation&&observation===this.observation;
    const pending=(async()=>{
      if(!current())return;
      try{
        const enabled=await readAssistantEnabled(this.dir,this.env.SODA_ASSISTANT_ENABLED==="1");if(!current())return;
        const key=JSON.stringify({origin:this.origin(),command:this.env.SODA_ASSISTANT_COMMAND??null});
        if(enabled&&this.desiredEnabled===true&&this.desiredKey===key&&["preparing","starting","running"].includes(this.phase)){
          if(this.deviceId&&this.activatedDeviceId!==this.deviceId)this.attached(this.deviceId);return;
        }
        this.desiredEnabled=enabled;this.desiredKey=key;if(!enabled)this.phase="stopping";
        this.scheduleApply();
      }catch{if(current())this.scheduleApply();}
    })();
    this.checks.add(pending);void pending.finally(()=>this.checks.delete(pending));return pending;
  }
  private scheduleApply(): void {
    this.preparing?.abort(Error("アシスタント設定が更新されました"));
    const generation = this.generation;
    const revision = ++this.revision;
    const live=()=>this.active && generation===this.generation && revision===this.revision;
    this.queue = this.queue.then(async () => {
      if (!live()) return;
      try {
        const enabled = await readAssistantEnabled(this.dir, this.env.SODA_ASSISTANT_ENABLED === "1");
        if (!live()) return;
        this.wanted = enabled;
        if (enabled) {
          const requestKey=JSON.stringify({origin:this.origin(),command:this.env.SODA_ASSISTANT_COMMAND??null});
          if(this.app&&this.launchKey&&this.requestKey===requestKey&&(this.hostState==="running"||this.hostState==="starting")){this.phase=this.hostState;if(this.deviceId&&this.activatedDeviceId!==this.deviceId)this.attached(this.deviceId);return;}
          const controller=new AbortController();this.preparing=controller;this.phase="preparing";this.message="初回は共通ランタイムを準備します。";
          const check=()=>{controller.signal.throwIfAborted();if(!live())throw Error("アシスタントの起動を中止しました");};
          let config:AssistantLaunch;
          try{config=this.env.SODA_ASSISTANT_COMMAND?assistantLaunchFromEnv({...this.env,SODA_ASSISTANT_ENABLED:"1"},this.origin())!:await this.resolveBundled(this.origin(),controller.signal,check);check();}
          finally{if(this.preparing===controller)this.preparing=null;}
          const key=JSON.stringify(config);
          if(this.hostState==="stopping"||(this.launchKey!==null && this.launchKey!==key)){this.hostState="stopping";await this.app?.stop();this.hostState="none";this.app=null;this.appIdentity=Symbol();this.deviceId=null;this.activatedDeviceId=null;this.launchKey=null;if(!live())return;}
          if (!live()) return;
          if(!this.app) {
            const create=await this.load();
            if(!live()) return;
            // Settings can commit while the implementation loads, before watch delivery.
            const stillEnabled=await readAssistantEnabled(this.dir,this.env.SODA_ASSISTANT_ENABLED==="1");
            if(!live()) return;
            if(!stillEnabled) {this.apply();return;}
            const identity=Symbol();this.appIdentity=identity;
            this.app=create(()=>{if(this.appIdentity===identity)this.disabled();},deviceId=>{if(this.appIdentity===identity)this.attached(deviceId);});
          }
          const stillEnabled=await readAssistantEnabled(this.dir,this.env.SODA_ASSISTANT_ENABLED==="1");if(!live())return;if(!stillEnabled){this.apply();return;}
          this.phase="starting";this.hostState="starting";this.message="";this.app.start(config);this.launchKey=key;this.requestKey=requestKey;
        }
        else {
          try { this.phase="stopping";this.hostState="stopping";await this.app?.stop();this.hostState="none";this.app=null;this.launchKey=null;this.phase="disabled";this.message=""; }
          finally { try{if(this.deviceId)await this.agent?.requestStop(this.deviceId);}finally{if(!this.app){this.appIdentity=Symbol();this.deviceId=null;this.activatedDeviceId=null;this.requestKey=null;}} }
        }
      } catch { if(!live())return;this.phase="error";this.message="アシスタントを準備・起動できませんでした。通信、空き容量、保存先の権限を確認して再試行してください。";this.warn(this.message);this.hostState="stopping";await this.app?.stop();this.hostState="none";this.launchKey=null; }
    }).catch(() => { this.warn("アシスタントの終了を確認できません"); });
  }
  async stop(): Promise<void> {
    this.active = false; ++this.generation;this.preparing?.abort(Error("sodaを停止しています"));
    this.watcher?.close(); this.watcher = null;
    await Promise.all([...this.checks]);await this.queue;
    const results = await Promise.allSettled([this.app?.stop(), ...this.saves]);
    this.launchKey=null;
    const failure = results.find(result => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    this.app=null;this.hostState="none";this.appIdentity=Symbol();this.deviceId=null;this.activatedDeviceId=null;this.requestKey=null;
  }
}
