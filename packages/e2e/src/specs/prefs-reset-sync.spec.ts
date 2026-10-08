import type { Browser, BrowserContext, Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { focusTerminal } from "../support/keys.js";

/**
 * 「既定へ戻す」（消す）が、サーバの共有の設定にも伝わる（20261008-main-e2e-failures A2）。
 * 設定の大半はサーバの共有の設定（20260927-cli-mode）。ストアは消すとき `writePrefs({ key: undefined })` を呼ぶが、
 * `prefs.set` は JSON で運ぶのでキーごと落ち、サーバに古い値が残って再読み込み・別の画面で戻っていた。
 * 判定: サーバ側の状態（テスト自身のクライアントの `prefs.get`。前提・サーバ側の確認用）と、ブラウザの画面（開き直した後の見え方）。
 */

const dialog = (page: Page) => page.locator("dialog.settings-dialog");

async function openWithPrefs(browser: Browser, appServer: AppServer, prefs: Record<string, unknown>): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [{ origin: appServer.origin, localStorage: [{ name: "soda.prefs.v1", value: JSON.stringify(prefs) }] }] },
  });
  const page = await context.newPage();
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  return { context, page };
}

async function openSettings(page: Page, prefix = "Control+b"): Promise<void> {
  await focusTerminal(page);
  await page.keyboard.press(prefix);
  await page.keyboard.press("s");
  await expect(dialog(page)).toHaveAttribute("open", "");
}

/** サーバの共有の設定の、いまの最上位の項目名。 */
async function serverKeys(appServer: AppServer): Promise<string[]> {
  const client = await appServer.openClient();
  try {
    return Object.keys((await client.request("prefs.get", {})).prefs);
  } finally {
    client.close();
  }
}

test("キーの割り当てを「すべて既定に戻す」と、サーバの共有の設定から keys が消え、再読み込みしても戻らない", async ({ browser, appServer }) => {
  const { context, page } = await openWithPrefs(browser, appServer, { keys: { prefix: "ctrl+a", bindings: { zoom: ["prefix+y"] } } });
  // 前提: 手元の値が、サーバへ移っている（移っていなければ、消えたことの確認が何も守らない）。
  await expect.poll(() => serverKeys(appServer), { message: "前提: keys がサーバに保存された" }).toContain("keys");
  await openSettings(page, "Control+a");
  const keys = dialog(page).locator('section[aria-labelledby="settings-keys"]');
  await expect(keys.locator(".keys-prefix .keys-binding")).toHaveText("ctrl+a");

  await keys.locator("[data-reset-all]").click();
  await keys.locator("[data-confirm-yes]").click();
  await expect(keys.locator(".keys-prefix .keys-binding")).toHaveText("ctrl+b");
  await expect.poll(() => serverKeys(appServer), { message: "サーバの keys が消える" }).not.toContain("keys");

  await page.keyboard.press("Escape");
  await page.reload();
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await openSettings(page); // 既定の prefix（ctrl+b）で開ける
  await expect(keys.locator(".keys-prefix .keys-binding")).toHaveText("ctrl+b");
  await expect(keys.locator('[data-action="zoom"] .keys-bindings')).toHaveText("prefix+z");
  await context.close();
});

test("テーマの色の上書きを「すべて既定に戻す」と、サーバの共有の設定から themeOverrides が消え、別のブラウザにも出ない", async ({ browser, appServer }) => {
  const { context, page } = await openWithPrefs(browser, appServer, { themeOverrides: { dark: { "--soda-accent": "#222222" } } });
  await expect.poll(() => serverKeys(appServer), { message: "前提: themeOverrides がサーバに保存された" }).toContain("themeOverrides");
  await openSettings(page);
  const theme = dialog(page).locator('section[aria-labelledby="settings-theme"]');
  const details = theme.locator("details.settings-theme-overrides");
  await details.locator("summary").click();
  await expect(details.locator('[data-override-input="dark:--soda-accent"]')).toHaveValue("#222222");

  await details.locator("[data-reset-all-overrides]").click();
  await details.locator("[data-confirm-yes-overrides]").click();
  await expect(details.locator('[data-override-input="dark:--soda-accent"]')).toHaveValue("");
  await expect.poll(() => serverKeys(appServer), { message: "サーバの themeOverrides が消える" }).not.toContain("themeOverrides");

  // 別のブラウザ（新しいプロファイル）にも出ない。
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto(`${appServer.origin}/#token=${appServer.token}`);
  await otherPage.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await openSettings(otherPage);
  const otherDetails = dialog(otherPage).locator('section[aria-labelledby="settings-theme"] details.settings-theme-overrides');
  await otherDetails.locator("summary").click();
  await expect(otherDetails.locator('[data-override-input="dark:--soda-accent"]')).toHaveValue("");
  await other.close();
  await context.close();
});
