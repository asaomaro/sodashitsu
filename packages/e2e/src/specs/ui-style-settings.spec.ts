import type { BrowserContext, Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { focusTerminal, prefixKey } from "../support/keys.js";

/**
 * 画面の様式（20261008-ui-style。`data-ui-style`）の E2E。**判定は、ブラウザの側（`<html>` の属性・設定の画面の部品）で行う**（条項 e2e-observe-browser）。
 * - 最初の描画は、**本体（main.ts）が走る前**の `<html>` の属性（`readystatechange` の `interactive`——classic の `theme-boot.js` は走り終え、module の本体はまだ）で記録する。
 */

/** 本体（module）が走る前の `<html data-ui-style>` を記録する（`theme-boot.js` が当てた値）。 */
async function recordFirstPaint(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    document.addEventListener("readystatechange", () => {
      if (document.readyState !== "interactive") return;
      (window as unknown as { __sodaFirstUiStyle: unknown }).__sodaFirstUiStyle = document.documentElement.getAttribute("data-ui-style");
    });
  });
}
const firstUiStyle = (page: Page) => page.evaluate(() => (window as unknown as { __sodaFirstUiStyle?: string | null }).__sodaFirstUiStyle);
const uiStyleAttr = (page: Page) => page.evaluate(() => document.documentElement.getAttribute("data-ui-style"));

async function open(page: Page, appServer: AppServer): Promise<void> {
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
}

test("再読み込みのとき、最初の描画（本体が走る前）の時点で、前の様式（modern）が当たっている。classic のときは属性が無い", async ({ page, appServer, context }) => {
  await recordFirstPaint(context);
  const client = await appServer.openClient();
  // 1 回目: 設定が無い → classic（本体が走った後に、classic が当たる）。最初の描画の時点では、属性は無い（クラシック）。
  await open(page, appServer);
  expect(await firstUiStyle(page)).toBeNull();
  await expect.poll(() => uiStyleAttr(page)).toBe("classic");
  // modern にする（共有の設定。別のブラウザ・端末から変えた形）。動いている間に、再読み込みなしで変わる。
  await client.request("prefs.set", { patch: { uiStyle: "modern" } });
  await expect.poll(() => uiStyleAttr(page)).toBe("modern");
  // 控えが書き直されるのを待ってから、再読み込み。
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("soda.themeBoot.v1") ?? "null")?.uiStyle ?? null)).toBe("modern");
  await page.reload();
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  expect(await firstUiStyle(page), "本体が走る前の時点で、modern が当たっている").toBe("modern");
  expect(await uiStyleAttr(page)).toBe("modern");
  // classic へ戻す → 再読み込みの最初の描画で、modern が一瞬見えない。
  await client.request("prefs.set", { patch: { uiStyle: "classic" } });
  await expect.poll(() => uiStyleAttr(page)).toBe("classic");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("soda.themeBoot.v1") ?? "null")?.uiStyle ?? null)).toBe("classic");
  await page.reload();
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  expect(await firstUiStyle(page)).toBeNull();
  client.close();
});

test("控えが壊れていても、アプリは classic で起動する（属性は本体が当てる）", async ({ page, appServer, context }) => {
  await recordFirstPaint(context);
  await context.addInitScript(() => localStorage.setItem("soda.themeBoot.v1", "{oops"));
  await open(page, appServer);
  expect(await firstUiStyle(page)).toBeNull();
  await expect.poll(() => uiStyleAttr(page)).toBe("classic");
});

test("設定の画面のラジオ「画面の様式」: 選ぶと再読み込みなしで data-ui-style が変わり、同じ利用者の別のブラウザにも反映される。再読み込みしても残る", async ({ page, appServer, browser }) => {
  await open(page, appServer);
  // 別のブラウザ（別の context）。
  const otherCtx = await browser.newContext();
  const other = await otherCtx.newPage();
  await open(other, appServer);
  await expect.poll(() => uiStyleAttr(page)).toBe("classic");
  await expect.poll(() => uiStyleAttr(other)).toBe("classic");

  await focusTerminal(page);
  await prefixKey(page, "s");
  const dialog = page.locator("dialog.settings-dialog");
  await expect(dialog).toHaveAttribute("open", "");
  await dialog.locator("nav.settings-menu button", { hasText: "表示" }).click();
  const radio = (value: string) => dialog.locator(`input[type="radio"][name="settings-ui-style"][value="${value}"]`);
  await expect(radio("classic")).toBeChecked();
  await expect(dialog.locator('fieldset:has(input[name="settings-ui-style"]) legend')).toHaveText("画面の様式");

  await radio("modern").check();
  await expect.poll(() => uiStyleAttr(page), "再読み込みなしで変わる").toBe("modern");
  await expect.poll(() => uiStyleAttr(other), "別のブラウザにも反映される").toBe("modern");
  // 設定の画面を開いたままでも、ラジオの選びは保たれる。
  await expect(radio("modern")).toBeChecked();

  // 再読み込みしても残る（最初の描画の時点で modern）。
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("soda.themeBoot.v1") ?? "null")?.uiStyle ?? null)).toBe("modern");
  await page.reload();
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  expect(await uiStyleAttr(page)).toBe("modern");

  // クラシックへ戻す（別のブラウザ側の画面から）→ こちらにも反映。
  await focusTerminal(other);
  await prefixKey(other, "s");
  const dialogOther = other.locator("dialog.settings-dialog");
  await expect(dialogOther).toHaveAttribute("open", "");
  await dialogOther.locator("nav.settings-menu button", { hasText: "表示" }).click();
  await dialogOther.locator('input[type="radio"][name="settings-ui-style"][value="classic"]').check();
  await expect.poll(() => uiStyleAttr(other)).toBe("classic");
  await expect.poll(() => uiStyleAttr(page)).toBe("classic");
  await otherCtx.close();
});
