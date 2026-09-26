import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { printRaw } from "./output.js";

/**
 * `wtmctl skill`（20260926-agent-skill-file）。エージェントに wtmctl の使い方を教える Markdown（skill ファイル）を、そのまま標準出力へ書く。
 * herdr の `herdr --skill` に当たる。ファイルはパッケージの `skills/wtmctl/SKILL.md`（`src`・`dist` のどちらからも `../skills/...`。
 * サーバの `agentHookScriptFor` と同じ引き方）なので、使っている wtmctl と同じ版のものが出る。サーバへはつながない。
 */

export function skillFilePath(): string {
  return fileURLToPath(new URL("../skills/wtmctl/SKILL.md", import.meta.url));
}

export function readSkill(): Promise<string> {
  return readFile(skillFilePath(), "utf8");
}

export async function runSkill(): Promise<void> {
  printRaw(await readSkill());
}
