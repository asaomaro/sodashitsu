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

export interface FakeAgent {
  block(): Promise<void>;
}

export async function launchFakeAgent(page: Page, client: SodaTestClient, paneId: string, opts: { via?: "keyboard" | "client" } = {}): Promise<FakeAgent> {
  const dir = await mkdtemp(join(tmpdir(), "soda-e2e-notify-"));
  tempDirs.push(dir);
  const scriptPath = join(dir, "fake-claude.sh");
  const triggerPath = join(dir, "block-now");
  const readyMarker = `soda-e2e-ready-${paneId}`;
  const script = [
    "clear",
    `echo ${readyMarker}`,
    `while [ ! -f ${JSON.stringify(triggerPath)} ]; do sleep 0.2; done`,
    "clear",
    ...BLOCKED_SCREEN.map((line) => `printf '%s\\n' ${JSON.stringify(line)}`),
    "sleep 60",
  ].join("\n");
  await writeFile(scriptPath, script);
  const firstJudged = client.waitForEvent("pane.agent_status_changed", (e) => e.data.paneId === paneId);
  const command = `exec -a claude bash ${scriptPath}`;
  if (opts.via === "client") client.sendInput(paneId, `${command}\r`);
  else await typeLine(page, command);
  await client.waitForOutput(paneId, readyMarker);
  await firstJudged;
  return {
    block: async () => {
      await writeFile(triggerPath, "go");
      await client.waitForOutput(paneId, "Esc to cancel");
    },
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
