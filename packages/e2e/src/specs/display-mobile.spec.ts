import { devices } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { runDisplay, watchDisplaySubscriptions } from "../support/display.js";
import { writeTmp } from "../support/displayBrowser.js";
import { watchClientViews } from "../support/panes.js";

/**
 * モバイルの表示の面（20261007-soda-extensions。AC9）の E2E。幅 767px 以下の画面（`devices["iPhone 13"]` の viewport・タッチ・UA を借りて chromium で動かす。`mobile.spec.ts` と同じ）。
 * パネルは端末の横に出さず、バーのボタンから重ね表示（`<dialog>`）で開く。帯は端末の上に出る。パネルの前後で `client.view` の列数が変わらない。
 */
test.use({ ...devices["iPhone 13"], defaultBrowserType: "chromium" });

test("パネルは端末の横に出ず、バーのボタンから重ね表示で開いて中身が出る。帯は端末の上に出る。パネルの前後で列数が変わらない（AC9）", async ({ page, appServer }) => {
  const client = await appServer.openClient("mobile");
  const paneId = client.helloSnapshot()!.panes[0]!.id;
  const subs = await watchDisplaySubscriptions(page);
  const views = await watchClientViews(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await subs.waitFor(1);
  await expect(page.locator(".mobile-shell")).toBeVisible();
  await expect.poll(() => views.latest()?.visible[0]?.cols).toBeGreaterThan(0);
  const colsBefore = views.latest()!.visible[0]!.cols;
  const paneBefore = (await page.locator(".mobile-shell-pane").boundingBox())!;

  // パネル: 端末の横には出ない。バーのボタンだけが出る。
  const r = await runDisplay(appServer, paneId, ["set", "side", "--kind", "panel", "--title", "横", "--html-file", await writeTmp("<h1 id=h>モバイルのパネル</h1>")]);
  expect((await r.done).code).toBe(0);
  await expect(page.locator("[data-mobile-display-btn]")).toHaveText("表示1");
  await expect(page.locator("[data-pane-panel]")).toHaveCount(0); // 端末の横のパネルは出ない
  const paneAfter = (await page.locator(".mobile-shell-pane").boundingBox())!;
  expect(paneAfter).toEqual(paneBefore); // 端末の箱は変わらない
  // 開く前のブラウザの申告は変わらず、開いても変わらない。
  await page.locator("[data-mobile-display-btn]").click();
  await expect(page.locator("[data-mobile-display-sheet]")).toBeVisible();
  await expect(page.locator("[data-mobile-display-label]")).toHaveText("pane のプログラムの表示（隔離）· side");
  await expect(page.frameLocator("[data-mobile-display-sheet] iframe[data-display-frame]").locator("h1#h")).toHaveText("モバイルのパネル");
  expect(views.latest()!.visible[0]!.cols).toBe(colsBefore);
  // ［閉じる］でシートだけ閉じる（面は残る）。
  await page.locator("[data-mobile-display-close]").click();
  await expect(page.locator("[data-mobile-display-sheet]")).toHaveCount(0);
  await expect(page.locator("[data-mobile-display-btn]")).toHaveText("表示1");
  expect(views.latest()!.visible[0]!.cols).toBe(colsBefore);

  // 帯: 端末（.mobile-shell-pane）の上に出る。
  const b = await runDisplay(appServer, paneId, ["set", "top", "--kind", "band", "--text", "帯の文字"]);
  expect((await b.done).code).toBe(0);
  await expect(page.frameLocator("[data-pane-bands] iframe[data-display-frame]").locator("pre")).toHaveText("帯の文字");
  const band = (await page.locator("[data-pane-bands]").boundingBox())!;
  const pane = (await page.locator(".mobile-shell-pane").boundingBox())!;
  expect(band.y + band.height).toBeLessThanOrEqual(pane.y + 1);
});
