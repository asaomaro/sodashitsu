import { spawn, type ChildProcess } from "node:child_process";

import type {AssistantLaunch} from "./AssistantLaunchConfig.js";
export {assistantLaunchFromEnv} from "./AssistantLaunchConfig.js";
export type {AssistantLaunch} from "./AssistantLaunchConfig.js";
/** Owned app only. EOF is also observed by the Windows app across WSL; no idle watchdog process. */
export class ManagedAssistant {
  private child: ChildProcess | null = null;
  private closing: Promise<void> | null = null;
  private readonly relayProof=new WeakSet<ChildProcess>();
  private readonly nativeRelays=new WeakSet<ChildProcess>();
  private retirementFault=false;
  constructor(private readonly warn: (message: string) => void, private readonly launch: typeof spawn = spawn, private readonly disabled: () => void = () => {}, private readonly attached: (deviceId: string) => void = () => {}, private readonly ended:(retired?:boolean)=>void=()=>{}) {}
  start(config: AssistantLaunch | null): void {
    if (!config || this.child || this.closing) return;
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;delete env.NODE_PATH;
    if(config.nativeNodeRelay){env.ELECTRON_RUN_AS_NODE="1";env.WSLENV=(env.WSLENV??"").split(":").filter(value=>value&&value.split("/")[0]!=="ELECTRON_RUN_AS_NODE").concat("ELECTRON_RUN_AS_NODE").join(":");}
    const child = this.launch(config.command[0]!, [...config.command.slice(1), "--soda-managed"], {
      shell: false, windowsHide: true, env, stdio: ["pipe", "pipe", "ignore"],
    });
    this.child = child;
    if(config.nativeNodeRelay)this.nativeRelays.add(child);
    let output = "";
    let identity: string | null = null;
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      output += chunk;
      if (output.length > 4096) { output = ""; return; }
      while (output.includes("\n")) {
        const end=output.indexOf("\n"), line=output.slice(0,end); output=output.slice(end+1);
        try {
          const record = JSON.parse(line) as {type?:string;deviceId?:unknown};
          if (!identity && record.type === "attached" && typeof record.deviceId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record.deviceId) && this.child === child) {
            identity = record.deviceId.toLowerCase(); this.attached(identity);
          }
        } catch { /* Other stdout is not control input. */ }
        if(config.nativeNodeRelay&&line==='{"type":"retired"}')this.relayProof.add(child);
        if (line === '{"type":"disabled"}' && this.child === child) this.disabled();
      }
    });
    child.once("error", () => this.warn("デスクトップアシスタントを起動できません。起動コマンドを確認してください。"));
    child.once("close", code => {
      if (this.child === child) {
        if(config.nativeNodeRelay&&!this.relayProof.has(child)){this.retirementFault=true;this.ended(false);this.warn("アシスタントの終了を確認できません。Windows側のプロセスを確認してください。");}
        else {this.child = null;this.ended(true);}
      }
      if (code && !this.closing) this.warn(code === 75
        ? "既存のアシスタントを終了してから、soda assistant enableで再試行してください。"
        : "デスクトップアシスタントが終了しました。自動再起動は行いません。");
    });
    child.stdin?.on("error", () => {});
    child.stdin?.write(JSON.stringify({version: 1, serverOrigin: config.origin}) + "\n");
  }
  stop(): Promise<void> {
    if (this.closing) return this.closing;
    if(this.retirementFault)return Promise.reject(Error("アシスタントの終了を確認できません"));
    const child = this.child;
    if (!child) return Promise.resolve();
    this.closing = new Promise<void>((resolve, reject) => {
      let force: ReturnType<typeof setTimeout>;
      let deadline: ReturnType<typeof setTimeout>;
      const closed = () => { clearTimeout(force); clearTimeout(deadline);if(this.nativeRelays.has(child)&&!this.relayProof.has(child))reject(Error("アシスタントの終了を確認できません"));else resolve(); };
      child.once("close", closed);
      child.stdin?.end();
      force = setTimeout(() => child.kill(), 3000);
      deadline = setTimeout(() => { child.off("close", closed); reject(Error("アシスタントの終了を確認できません")); }, 5000);
    }).finally(() => { this.closing = null; });
    return this.closing;
  }
}
