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
