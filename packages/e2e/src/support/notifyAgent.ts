import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect } from "../support/fixtures.js";
import { focusTerminal, prefixKey, typeLine } from "./keys.js";
import type { SodaTestClient } from "./wsClient.js";

/**
 * 通知の E2E で共通に使う部品（20261005-notify-bell）。`notifications.spec.ts` の `launchFakeAgent` と同じ手法
 * （`exec -a claude bash <script>` で argv[0] を差し替え、実物のマニフェストに一致する画面を出す）。入力待ちにする時点はテストが決める。
 */

const tempDirs: string[] = [];
export async function cleanupNotifyAgents(): Promise<void> {
  for (const dir of tempDirs) await rm(dir, { recursive: true, force: true });
  tempDirs.length = 0;
}

/** `ManifestEngine.test.ts`「claude: Bash 承認プロンプト」と同じ画面。 */
const BLOCKED_SCREEN = [
  "────────────────────────────────────────────────────────────────",
  " Bash command",
  "",
  "   curl -sS -o /tmp/probe.html https://example.com",
  "   Download example.com to /tmp/probe.html",
  "",
  " This command requires approval",
  "",
  " Do you want to proceed?",
  " ❯ 1. Yes",
  "   2. Yes, and don't ask again for: curl *",
  "   3. No",
  "",
  " Esc to cancel · Tab to amend · ctrl+e to explain",
];

/** 空で静かな入力ボックス（`ManifestEngine.test.ts`「live_prompt_box」と同じ形。静的なタイトルと合わせて idle）。 */
const IDLE_SCREEN = [
  "some earlier conversation turn",
  "────────────────────────────────────────",
  "unrelated older content",
  "────────────────────────────────────────",
  "❯ hello",
  "────────────────────────────────────────",
  "  ? for shortcuts",
];

export interface FakeAgent {
  block(): Promise<void>;
  /** 入力待ちから（または完了から）動き出す。OSC タイトルの braille 接頭辞＝working。 */
  work(): Promise<void>;
  /** 作業中から完了（idle）へ戻る。working → idle なので `completionSeq` が進む。 */
  idle(): Promise<void>;
}

export async function launchFakeAgent(page: Page, client: SodaTestClient, paneId: string, opts: { via?: "keyboard" | "client" } = {}): Promise<FakeAgent> {
  const dir = await mkdtemp(join(tmpdir(), "soda-e2e-notify-"));
  tempDirs.push(dir);
  const scriptPath = join(dir, "fake-claude.sh");
  const nextPath = join(dir, "next");
  let seq = 0;
  const step = async (cmd: "block" | "work" | "idle"): Promise<void> => {
    const tag = `${cmd}${++seq}`;
    // サーバが判定して配信するまで待つ（起動直後の猶予 3 秒の間は判定されないので、その分も待つ）。
    const want = cmd === "block" ? "blocked" : cmd === "work" ? "working" : "idle";
    const published = client.waitForEvent("pane.agent_status_changed", (e) => e.data.paneId === paneId && e.data.agent?.state === want, 30_000);
    await writeFile(nextPath, tag);
    await client.waitForOutput(paneId, `soda-e2e-state-${tag}`); // 画面を替える直前の合図（連番で、前の指示の出力と取り違えない）
    await published;
  };
  const readyMarker = `soda-e2e-ready-${paneId}`;
  const script = [
    "clear",
    `echo ${readyMarker}`,
    // テストからの指示（`next` ファイルの中身）で画面を替える。
    "while true; do",
    `  if [ -f ${JSON.stringify(nextPath)} ]; then`,
    `    cmd=$(cat ${JSON.stringify(nextPath)}); rm -f ${JSON.stringify(nextPath)}`,
    '    echo "soda-e2e-state-$cmd"',
    "    clear",
    '    case "$cmd" in',
    "      block*) " + BLOCKED_SCREEN.map((line) => `printf '%s\\n' ${JSON.stringify(line)}`).join("; ") + " ;;",
    "      work*) printf '\\033]0;⠂ project\\007'; printf '%s\\n' 'Working... (esc to interrupt)' ;;",
    "      idle*) printf '\\033]0;project\\007'; " + IDLE_SCREEN.map((line) => `printf '%s\\n' ${JSON.stringify(line)}`).join("; ") + " ;;",
    "    esac",
    "  fi",
    "  sleep 0.2",
    "done",
  ].join("\n");
  await writeFile(scriptPath, script);
  const firstJudged = client.waitForEvent("pane.agent_status_changed", (e) => e.data.paneId === paneId);
  const command = `exec -a claude bash ${scriptPath}`;
  if (opts.via === "client") client.sendInput(paneId, `${command}\r`);
  else await typeLine(page, command);
  await client.waitForOutput(paneId, readyMarker);
  await firstJudged;
  return {
    block: () => step("block"),
    work: () => step("work"),
    idle: () => step("idle"),
  };
}

/** 通知の設定（トースト入・案内は済み）を `localStorage` へ仕込む。 */
export async function seedNotifyPrefs(page: Page, notify = { toast: true, desktop: false, sound: false }): Promise<void> {
  await page.addInitScript((json) => {
    try {
      localStorage.setItem("soda.prefs.v1", json as string);
    } catch {
      // 仕込めなければ既定のまま走る
    }
  }, JSON.stringify({ notify, notifyHintDone: true }));
}

/** `document.hasFocus()` を false に固定する。 */
export async function blurWindow(page: Page): Promise<void> {
  await page.evaluate(() => Object.defineProperty(document, "hasFocus", { value: () => false, configurable: true }));
}

export async function openNewTab(page: Page): Promise<void> {
  const before = Math.max(await page.locator(".tab-bar-item").count(), 1);
  await prefixKey(page, "c");
  await page.keyboard.press("Enter");
  await expect(page.locator(".tab-bar-item")).toHaveCount(before + 1);
  await expect(page.locator(".tab-bar-item").last()).toHaveClass(/tab-bar-item-active/);
}

export async function openApp(page: Page, appServer: { origin: string; token: string }): Promise<void> {
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);
}
