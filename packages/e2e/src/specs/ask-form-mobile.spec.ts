import { devices } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { askFixture, runAsk, watchAskSubscriptions } from "../support/ask.js";

/**
 * 質問のフォーム（`sodactl ask`。20261002-sodactl-ask）をモバイルの画面で（AC4・AC-I3）。`mobile.spec.ts` と同じく、実機の代わりに Playwright の
 * `devices["iPhone 13"]`（タッチ・狭い viewport・モバイル UA）を chromium で使う。
 */
test.use({ ...devices["iPhone 13"], defaultBrowserType: "chromium" });

test("モバイルの画面で、13 件のテーマ一覧を最後までスクロールして選び（タップ）、決定できる（AC4・AC-I3）", async ({ page, appServer }) => {
  const fixture = await askFixture();
  const client = await appServer.openClient("mobile");
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  const subs = await watchAskSubscriptions(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await subs.waitFor(1);
  const run = await runAsk(appServer, p1, fixture);
  const dialog = page.locator("dialog#soda-ask-dialog[open]");
  await expect(dialog).toBeVisible();
  // 画面の幅に収まり（はみ出さない）、選択肢は 1 列。
  const box = (await dialog.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  const themes = fixture.questions[0]!.options;
  const last = page.locator(`label.ask-opt:has(input[value="${themes[12]!.value}"])`);
  await last.scrollIntoViewIfNeeded();
  await last.tap();
  await expect(page.locator(`input[type=radio][value="${themes[12]!.value}"]`)).toBeChecked();
  // 決定ボタンは常に見える（下部に固定）。
  const submit = page.locator("[data-ask-submit]");
  await expect(submit).toBeVisible();
  await submit.tap();
  const r = await run.done;
  expect(r.code).toBe(0);
  expect(r.json).toMatchObject({ status: "answered", answers: { theme: themes[12]!.value } });
  await expect(dialog).toHaveCount(0);
});
