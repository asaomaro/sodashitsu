import { watch, type FSWatcher } from "node:fs";
import { ManagedAssistant, assistantLaunchFromEnv } from "./ManagedAssistant.js";
import { ASSISTANT_PACKAGE_FILE, readAssistantPackage } from "./AssistantPackageState.js";
import {ASSISTANT_ENABLED_FILE as NAME,readAssistantEnabled,writeAssistantEnabled} from "./AssistantEnabledState.js";
export {readAssistantEnabled,writeAssistantEnabled} from "./AssistantEnabledState.js";
/** File watch owns no worker process. Disabled state never probes or starts an executable. */
export class AssistantLaunchController {
  private watcher: FSWatcher | null = null;
  private active = false;
  private wanted = false;
  private deviceId: string | null = null;
  private generation = 0;
  private revision = 0;
  private launchKey: string | null = null;
  private queue = Promise.resolve();
  private readonly app: ManagedAssistant;
  private readonly saves = new Set<Promise<void>>();
  constructor(private readonly dir: string, private readonly env: NodeJS.ProcessEnv,
    private readonly origin: () => string, private readonly warn: (message: string) => void,
    app?: ManagedAssistant | ((disabled: () => void, attached: (deviceId: string) => void) => ManagedAssistant),
    private readonly save: typeof writeAssistantEnabled = writeAssistantEnabled,
    private readonly agent?: {activate(deviceId: string):void; requestStop(deviceId: string):Promise<void>}) {
    const disabled = () => {
      if (!this.active) return;
      const pending = this.save(dir, false).catch(() => warn("アシスタントの無効設定を保存できません"));
      this.saves.add(pending);
      void pending.finally(() => this.saves.delete(pending));
    };
    const attached = (deviceId: string) => {
      if (!this.active) return;
      this.deviceId = deviceId;
      if (this.wanted) this.agent?.activate(deviceId);
    };
    this.app = typeof app === "function" ? app(disabled, attached) : app ?? new ManagedAssistant(warn, undefined, disabled, attached);
  }
  start(): void {
    if (this.active) return;
    this.active = true; ++this.generation;
    {
      this.watcher = watch(this.dir, (_event, filename) => { if ([NAME,ASSISTANT_PACKAGE_FILE].includes(filename?.toString() ?? "")) this.apply(); });
      this.watcher.on("error", () => { this.warn("アシスタントの設定監視が停止しました"); void this.stop().catch(() => {}); });
    }
    this.apply();
  }
  private apply(): void {
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
          // Read installation metadata only when enabled. Explicit local command takes precedence.
          const installed=this.env.SODA_ASSISTANT_COMMAND ? null : await readAssistantPackage(this.dir);
          if (!live()) return;
          const config=assistantLaunchFromEnv({...this.env,SODA_ASSISTANT_ENABLED:"1",
            SODA_ASSISTANT_COMMAND:this.env.SODA_ASSISTANT_COMMAND ?? (installed ? JSON.stringify(installed.current.command) : undefined)},this.origin());
          const key=JSON.stringify(config);
          if(this.launchKey!==null && this.launchKey!==key) {
            await this.app.stop();
            if(!live()) return;
            // A disable/write may have committed before its fs.watch event was delivered.
            const stillEnabled=await readAssistantEnabled(this.dir,this.env.SODA_ASSISTANT_ENABLED==="1");
            const latest=this.env.SODA_ASSISTANT_COMMAND?null:await readAssistantPackage(this.dir);
            if(!live()) return;
            if(!stillEnabled || JSON.stringify(latest)!==JSON.stringify(installed)) {this.apply();return;}
          }
          if (!live()) return;
          this.app.start(config);this.launchKey=key;
        }
        else {
          try { await this.app.stop();this.launchKey=null; }
          finally { if (this.deviceId) await this.agent?.requestStop(this.deviceId); }
        }
      } catch { this.warn("アシスタントの起動設定を確認してください"); await this.app.stop();this.launchKey=null; }
    }).catch(() => { this.warn("アシスタントの終了を確認できません"); });
  }
  async stop(): Promise<void> {
    this.active = false; ++this.generation;
    this.watcher?.close(); this.watcher = null;
    await this.queue;
    const results = await Promise.allSettled([this.app.stop(), ...this.saves]);
    this.launchKey=null;
    const failure = results.find(result => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }
}
