import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import type { AppServer } from "./appServer.js";

/**
 * 拡張（20261007-ext-host）の E2E の共通の補助。拡張の子プロセスは、一時ディレクトリに書いた小さな `.mjs`（`process.execPath` で動かす）。
 * 設定は状態ディレクトリの `extensions.json`（サーバが `reload` のときに読む）。
 */

/** 設定に書くコマンドの目印（ブラウザが受けたフレームに、これが 1 つも無いことを確かめる。`extension.list` はコマンドを送らない）。 */
export const CMD_MARK = "CMDMARK_7Qx9Zk";
/** 拡張が標準エラーに書く目印（`<b>` と、書字方向を変える文字 U+202E を含む）。 */
export const ERR_MARK = "ERRMARK";

export interface ExtEntry {
  id: string;
  command: string;
  description?: string;
  enabled?: boolean;
  allow?: string[];
  cwd?: string;
}

/** 状態ディレクトリの `extensions.json` を書く（持ち主だけが書ける 0600。サーバは他人が書ける設定を読まない）。 */
export async function writeExtensionsFile(appServer: AppServer, entries: ExtEntry[]): Promise<void> {
  await writeFile(join(appServer.stateDir, "extensions.json"), JSON.stringify({ extensions: entries }), { mode: 0o600 });
}

/** 壊れた `extensions.json`（JSON でない）。設定の問題（`problems`）の確かめ・撮影用。 */
export async function writeBrokenExtensionsFile(appServer: AppServer): Promise<void> {
  await writeFile(join(appServer.stateDir, "extensions.json"), "{ not json", { mode: 0o600 });
}

const SCRIPT = `
import { createInterface } from "node:readline";
import { appendFileSync, existsSync } from "node:fs";
const [, , crashFile, runsFile, title] = process.argv;
if (runsFile) appendFileSync(runsFile, "start\\n");
process.stderr.write("${ERR_MARK} <b>bold</b> \\u202e after-rtl\\n");
const call = (method, params) => process.stdout.write(JSON.stringify({ method, params }) + "\\n");
const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.type === "ext.panes") {
    for (const pane of msg.panes) call("display.set", { paneId: pane.id, name: "p", kind: "panel", format: "markdown", title: title || "t", content: "# ext hello" });
  }
});
setInterval(() => { if (crashFile && crashFile !== "-" && existsSync(crashFile)) process.exit(1); }, 20);
lines.on("close", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
`;

export interface ExtFixture {
  dir: string;
  /** このファイルができると、拡張は終了コード 1 で終わる（起動し直しのたびに、すぐ落ちる）。 */
  crashFile: string;
  /** 起動のたびに 1 行足される。 */
  runsFile: string;
  /** 拡張を動かす `command`（`process.execPath` で動かす。引数の末尾に `CMD_MARK`）。 */
  command(title?: string): string;
}

/** 一時ディレクトリに、小さな拡張を書く。 */
export async function makeExtFixture(): Promise<ExtFixture> {
  const dir = await mkdtemp(join(tmpdir(), "soda-e2e-ext-"));
  const script = join(dir, "ext.mjs");
  await writeFile(script, SCRIPT);
  const crashFile = join(dir, "crash");
  const runsFile = join(dir, "runs");
  await writeFile(runsFile, "");
  return {
    dir,
    crashFile,
    runsFile,
    command: (title = "t") => `"${process.execPath}" "${script}" "${crashFile}" "${runsFile}" "${title}" ${CMD_MARK}`,
  };
}

/** 実行の印のファイルの行数（拡張が起動した回数）。 */
export async function runCount(fx: ExtFixture): Promise<number> {
  return (await readFile(fx.runsFile, "utf8")).split("\n").filter((l) => l !== "").length;
}

/**
 * ブラウザ（ページの実物の WebSocket）が受けた**テキストのフレームすべて**を、受けた順に返す関数を作る。`extension.list` の応答のような
 * `{id, result}` も含む（`watchReceivedEvents` はイベントだけ）。**`page.goto()` の前に `await` して呼ぶ。**
 */
export async function watchReceivedText(page: Page): Promise<() => string[]> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  const received: string[] = [];
  cdp.on("Network.webSocketFrameReceived", (e) => {
    if (e.response.opcode === 1) received.push(e.response.payloadData);
  });
  return () => [...received];
}
