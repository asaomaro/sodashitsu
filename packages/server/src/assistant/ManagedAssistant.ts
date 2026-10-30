import { spawn, type ChildProcess } from "node:child_process";
import { desktopAssistantOrigin } from "@sodashitsu/protocol";

export interface AssistantLaunch { command: string[]; origin: string }
/** No discovery, executable probes, timers or children when disabled. Local configuration only. */
export function assistantLaunchFromEnv(env: NodeJS.ProcessEnv, origin: string): AssistantLaunch | null {
  if (env.SODA_ASSISTANT_ENABLED !== "1") return null;
  const raw = env.SODA_ASSISTANT_COMMAND;
  if (!raw || raw.length > 8192) throw Error("SODA_ASSISTANT_COMMANDにJSON配列でアシスタントの起動コマンドを指定してください");
  const command: unknown = JSON.parse(raw);
  if (!Array.isArray(command) || !command.length || command.length > 16 || command.some(v => typeof v !== "string" || !v || v.length > 2048 || /[\x00-\x1f\x7f]/.test(v)))
    throw Error("アシスタントの起動コマンドを確認してください");
  return {command: command as string[], origin: desktopAssistantOrigin(env.SODA_ASSISTANT_ORIGIN ?? origin)};
}
/** Owned app only. EOF is also observed by the Windows app across WSL; no idle watchdog process. */
export class ManagedAssistant {
  private child: ChildProcess | null = null;
  private closing: Promise<void> | null = null;
  constructor(private readonly warn: (message: string) => void, private readonly launch: typeof spawn = spawn, private readonly disabled: () => void = () => {}) {}
  start(config: AssistantLaunch | null): void {
    if (!config || this.child || this.closing) return;
    const child = this.launch(config.command[0]!, [...config.command.slice(1), "--soda-managed"], {
      shell: false, windowsHide: true, stdio: ["pipe", "pipe", "ignore"],
    });
    this.child = child;
    let output = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      output += chunk;
      if (output.length > 4096) { output = ""; return; }
      while (output.includes("\n")) {
        const end=output.indexOf("\n"), line=output.slice(0,end); output=output.slice(end+1);
        if (line === '{"type":"disabled"}' && this.child === child) this.disabled();
      }
    });
    child.once("error", () => this.warn("デスクトップアシスタントを起動できません。起動コマンドを確認してください。"));
    child.once("close", code => {
      if (this.child === child) this.child = null;
      if (code && !this.closing) this.warn(code === 75
        ? "既存のアシスタントを終了してから、soda assistant enableで再試行してください。"
        : "デスクトップアシスタントが終了しました。自動再起動は行いません。");
    });
    child.stdin?.on("error", () => {});
    child.stdin?.write(JSON.stringify({version: 1, serverOrigin: config.origin}) + "\n");
  }
  stop(): Promise<void> {
    if (this.closing) return this.closing;
    const child = this.child;
    if (!child) return Promise.resolve();
    this.closing = new Promise<void>((resolve, reject) => {
      let force: ReturnType<typeof setTimeout>;
      let deadline: ReturnType<typeof setTimeout>;
      const closed = () => { clearTimeout(force); clearTimeout(deadline); resolve(); };
      child.once("close", closed);
      child.stdin?.end();
      force = setTimeout(() => child.kill(), 3000);
      deadline = setTimeout(() => { child.off("close", closed); reject(Error("アシスタントの終了を確認できません")); }, 5000);
    }).finally(() => { this.closing = null; });
    return this.closing;
  }
}
