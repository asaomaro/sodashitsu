import { devices } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { runDisplay, watchDisplaySubscriptions } from "../support/display.js";
import { enableScript, ok, setScriptOk } from "../support/displayScript.js";

/** 戻しすぎの確認のモバイル版（`display-script-noreturn.spec.ts` の続き。`test.use` は先頭に置く必要があるので別のファイル）。`--workers=1` で流す。 */
test.use({ ...devices["iPhone 13"], defaultBrowserType: "chromium" });

const FACES: Record<string, string> = {
  benign: "setInterval(function(){}, 1000);",
  drop300: "setInterval(function(){ window.focus(); parent.focus(); }, 300);",
};
const html = (script: string): string => `<!doctype html><body><p>face</p><script>${script}</script></body>`;

test.describe("モバイルの幅での重ね表示", () => {
  test.describe.configure({ timeout: 120_000 });
  for (const face of Object.keys(FACES)) {
    test(`面: ${face}: 開く・中のボタンを押す・閉じる`, async ({ page, appServer }) => {
      await enableScript(appServer);
      const client = await appServer.openClient("mobile");
      const paneId = client.helloSnapshot()!.panes[0]!.id;
      const subs = await watchDisplaySubscriptions(page);
      await page.goto(`${appServer.origin}/#token=${appServer.token}`);
      await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
      await subs.waitFor(1);
      await setScriptOk(appServer, paneId, "g", html(FACES[face]!));
      await ok(await runDisplay(appServer, paneId, ["list"]));
      await page.locator("[data-mobile-display-btn]").click();
      const sheet = page.locator("[data-mobile-display-sheet]");
      await expect(sheet).toBeVisible();
      for (let t = 0; t < 1500; t += 100) {
        await expect(sheet).toBeVisible(); // 引き戻しで閉じない
        await page.waitForTimeout(100);
      }
      await sheet.locator("[data-display-engage]").click(); // 中のボタン
      await expect(sheet.locator(".mobile-display-engaged-note")).toBeVisible();
      await page.locator("[data-mobile-display-close]").click();
      await expect(sheet).toBeHidden();
    });
  }
});
