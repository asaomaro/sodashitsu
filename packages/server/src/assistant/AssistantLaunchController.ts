import { watch, type FSWatcher } from "node:fs";
import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ManagedAssistant, assistantLaunchFromEnv } from "./ManagedAssistant.js";
const NAME = "assistant-launch.json";
export async function readAssistantEnabled(dir: string, fallback = false): Promise<boolean> {
  let text: string;
  try { text = await readFile(join(dir, NAME), "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback; throw error; }
  if (text.length > 1024) throw Error("アシスタントの起動設定が大きすぎます");
  const value = JSON.parse(text) as Record<string, unknown>;
  if (!value || typeof value !== "object" || Object.keys(value).join() !== "enabled" || typeof value.enabled !== "boolean") throw Error("アシスタントの起動設定を確認してください");
  return value.enabled;
}
export async function writeAssistantEnabled(dir: string, enabled: boolean): Promise<void> {
  await mkdir(dir, {recursive: true, mode: 0o700});
  const temporary = join(dir, `.assistant-launch-${randomUUID()}.tmp`);
  try { await writeFile(temporary, JSON.stringify({enabled}) + "\n", {mode: 0o600, flag: "wx"}); await rename(temporary, join(dir, NAME)); }
  finally { await unlink(temporary).catch(() => {}); }
}
/** File watch owns no worker process. Disabled state never probes or starts an executable. */
export class AssistantLaunchController {
  private watcher: FSWatcher | null = null;
  private active = false;
  private wanted = false;
  private deviceId: string | null = null;
  private generation = 0;
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
    if (this.env.SODA_ASSISTANT_COMMAND) {
      this.watcher = watch(this.dir, (_event, filename) => { if (filename?.toString() === NAME) this.apply(); });
      this.watcher.on("error", () => { this.warn("アシスタントの設定監視が停止しました"); void this.stop().catch(() => {}); });
    }
    this.apply();
  }
  private apply(): void {
    const generation = this.generation;
    this.queue = this.queue.then(async () => {
      if (!this.active || generation !== this.generation) return;
      try {
        const enabled = await readAssistantEnabled(this.dir, this.env.SODA_ASSISTANT_ENABLED === "1");
        if (!this.active || generation !== this.generation) return;
        this.wanted = enabled;
        if (enabled) this.app.start(assistantLaunchFromEnv({...this.env, SODA_ASSISTANT_ENABLED:"1"}, this.origin()));
        else {
          try { await this.app.stop(); }
          finally { if (this.deviceId) await this.agent?.requestStop(this.deviceId); }
        }
      } catch { this.warn("アシスタントの起動設定を確認してください"); await this.app.stop(); }
    }).catch(() => { this.warn("アシスタントの終了を確認できません"); });
  }
  async stop(): Promise<void> {
    this.active = false; ++this.generation;
    this.watcher?.close(); this.watcher = null;
    await this.queue;
    const results = await Promise.allSettled([this.app.stop(), ...this.saves]);
    const failure = results.find(result => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }
}
