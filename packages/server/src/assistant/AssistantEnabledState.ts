import {mkdir,readFile,writeFile,rename,unlink} from "node:fs/promises";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
export const ASSISTANT_ENABLED_FILE = "assistant-launch.json";
const NAME = ASSISTANT_ENABLED_FILE;
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
