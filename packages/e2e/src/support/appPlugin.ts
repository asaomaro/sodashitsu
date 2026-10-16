import { mkdtemp, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect } from "@playwright/test";
import type { AppServer } from "./appServer.js";

/**
 * アプリタブ（プラグインのメイン画面）の E2E の補助。本物のプラグインの配布物（`soda-plugin.json` ＋ `extension.mjs`）を作って、
 * `sodactl plugin pack/install/enable` で入れる。拡張は、アプリタブのアンカー pane に script-html の面 `app` を出す
 * （`ext.panes` の `plugin.display` が合う pane だけ。作業 pane には出さない）。
 */
const CLI = resolve("../cli/dist/main.js");
const EXT = `
import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
const [, , htmlFile] = process.argv;
const html = readFileSync(htmlFile, "utf8");
let key = "";
const seen = new Set();
const call = (method, params) => process.stdout.write(JSON.stringify({ method, params }) + "\\n");
const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.type === "ext.hello") key = "user:" + msg.extension.id;
  if (msg.type === "ext.panes") {
    for (const pane of msg.panes) {
      if (pane.plugin?.extensionKey !== key || seen.has(pane.id)) continue;
      seen.add(pane.id);
      call("display.set", { paneId: pane.id, name: pane.plugin.display, kind: "panel", format: "script-html", title: "app", content: html });
    }
  }
});
lines.on("close", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
`;

function cli(args: string[]): void {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  expect(r.status, `${args.join(" ")}\n${r.stderr}${r.stdout}`).toBe(0);
}

/** プラグイン `app-e2e`（タブの種類 `app`）を入れて有効にし、サーバに読み直させる。 */
export async function installAppPlugin(appServer: AppServer, html: string): Promise<{ extensionKey: string; display: string }> {
  const dir = await mkdtemp(join(tmpdir(), "soda-e2e-appplugin-"));
  const htmlFile = join(dir, "app.html");
  await writeFile(htmlFile, html);
  await writeFile(join(dir, "extension.mjs"), EXT);
  await writeFile(join(dir, "README.md"), "# app-e2e\n");
  await writeFile(join(dir, "LICENSE"), "MIT\n");
  await writeFile(
    join(dir, "soda-plugin.json"),
    JSON.stringify({
      schemaVersion: 1,
      id: "app-e2e",
      version: "0.0.1",
      name: "App E2E",
      description: "E2E 用のアプリ",
      entry: "extension.mjs",
      files: ["extension.mjs", "README.md", "LICENSE"],
      allow: ["script-html"],
      tabView: { title: "App", display: "app", requiresProject: false },
    }),
  );
  const bundle = join(dir, "app-e2e.sodaplugin");
  cli(["plugin", "pack", dir, "--out", bundle]);
  cli(["plugin", "install", bundle, "--state-dir", appServer.stateDir]);
  cli(["plugin", "enable", "app-e2e", "--state-dir", appServer.stateDir]);
  // 拡張の子プロセスは、中身の HTML をファイル名の引数で受ける。登録（extensions.json）の command に引数を足す。
  const { readFile } = await import("node:fs/promises");
  const regPath = join(appServer.stateDir, "extensions.json");
  const reg = JSON.parse(await readFile(regPath, "utf8")) as { extensions: { id: string; command: string }[] };
  for (const e of reg.extensions) if (e.id === "app-e2e") e.command = `${e.command} "${htmlFile}"`;
  await writeFile(regPath, JSON.stringify(reg), { mode: 0o600 });
  await appServer.restart();
  return { extensionKey: "user:app-e2e", display: "app" };
}
