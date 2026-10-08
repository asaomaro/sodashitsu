import { devices } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { runDisplay, watchDisplaySubscriptions } from "../support/display.js";
import { writeTmp } from "../support/displayBrowser.js";
import { ok, setScriptOk } from "../support/displayScript.js";

/**
 * モバイルの重ね表示でも、覆い・［操作する］・固定の印・操作中が同じに動く（T28 の (10)）。
 * (9)「script-html を名乗らない画面」は、`display.subscribe` の `features` から外した接続を E2E で用意できないため、`DisplayFrameScript.test.ts`
 * （`scriptCapable` が偽のとき固定の文言が出て、枠を作らない）と `DisplayController.test.ts`（名乗らない設定）に任せる。
 */
test.use({ ...devices["iPhone 13"], defaultBrowserType: "chromium" });

test("(10) モバイルの重ね表示: 固定の印・覆い・［操作する］。覆いを押しても始まらず、［操作する］で操作中になり、枠の中の欄に打てる", async ({ page, appServer }) => {
  const client = await appServer.openClient("mobile");
  const paneId = client.helloSnapshot()!.panes[0]!.id;
  const subs = await watchDisplaySubscriptions(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await subs.waitFor(1);
  await setScriptOk(appServer, paneId, "g", `<!doctype html><body><input id=i><script>
window.addEventListener('focus', function () { document.getElementById('i').focus(); });
</script></body>`);
  await ok(await runDisplay(appServer, paneId, ["set", "st", "--kind", "panel", "--html-file", await writeTmp("<p>static</p>")]));
  await page.locator("[data-mobile-display-btn]").click();
  const sheet = page.locator("[data-mobile-display-sheet]");
  await expect(sheet).toBeVisible();
  await expect(sheet.locator("[data-mobile-display-label] [data-display-script-mark]")).toHaveText("スクリプト");
  await expect(sheet.locator("[data-display-engage]")).toBeVisible();
  await expect(sheet.locator("[data-display-cover]")).toHaveCount(1);
  // 覆いを押しても始まらない
  await sheet.locator("[data-display-cover]").click({ position: { x: 10, y: 10 } });
  await expect(sheet.locator("[data-display-cover]")).toHaveCount(1);
  await expect(sheet.locator("[data-display-engage]")).toHaveClass(/display-engage-hint/);
  // ［操作する］で操作中になる
  await sheet.locator("[data-display-engage]").click();
  await expect(sheet.locator("[data-display-cover]")).toHaveCount(0);
  await expect(sheet.locator("[data-display-engage]")).toHaveCount(0);
  await expect(sheet.locator(".mobile-display-engaged-note")).toHaveText("入力はこの表示に届きます（Esc で端末へ）");
  await page.keyboard.type("ab");
  await expect(sheet.frameLocator("iframe[data-display-script]").locator("#i")).toHaveValue("ab");
  // 静的なパネルに切り替えると、印も［操作する］も出ない
  await page.locator("[data-mobile-display-close]").click();
});
