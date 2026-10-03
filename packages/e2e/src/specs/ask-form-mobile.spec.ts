import { devices, type Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { askFixture, runAsk, watchAskSubscriptions } from "../support/ask.js";

/**
 * 質問のフォーム（`sodactl ask`。20261002-sodactl-ask）をモバイルの画面で（AC4・AC-I3）。`mobile.spec.ts` と同じく、実機の代わりに Playwright の
 * `devices["iPhone 13"]`（タッチ・狭い viewport・モバイル UA）を chromium で使う。
 * 中身は部品 `<ask-form>`（Shadow DOM。20261003-ask-form-component）が描く。Playwright の CSS ロケータは Shadow DOM を越える。
 */
test.use({ ...devices["iPhone 13"], defaultBrowserType: "chromium" });

/** ブラウザを開いて「質問を出せる画面」として登録されるまで待つ。 */
async function openBrowser(page: Page, appServer: AppServer): Promise<void> {
  const subs = await watchAskSubscriptions(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await subs.waitFor(1);
}

test("モバイルの画面で、13 件のテーマ一覧を最後までスクロールして選び（タップ）、決定できる（AC4・AC-I3）", async ({ page, appServer }) => {
  const fixture = await askFixture();
  const client = await appServer.openClient("mobile");
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await openBrowser(page, appServer);
  const run = await runAsk(appServer, p1, fixture);
  const dialog = page.locator("dialog#soda-ask-dialog[open]");
  await expect(dialog).toBeVisible();
  // 画面の幅に収まる（はみ出さない）。
  const box = (await dialog.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  // この画面では、定義は 1 問ずつのページに分かれて出る（確かめた値: 8 ページ＝7 問＋補足）。最初のページはテーマだけで、13 件はそのページの中をスクロールして見る。
  expect(await page.locator("[data-ask-page]:visible").count()).toBeGreaterThan(1);
  expect(await page.locator("[data-ask-question]:visible").evaluateAll((els) => els.map((e) => e.getAttribute("data-ask-question")))).toEqual(["theme"]);
  const themes = fixture.questions[0]!.options;
  const cards = page.locator('[data-ask-question="theme"] label.opt');
  await expect(cards).toHaveCount(13);
  // 選択肢は 1 列（どのカードも左端が同じで、上から下へ重ならずに並ぶ）。
  const rects = await cards.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), top: r.top, bottom: r.bottom }; }));
  expect(new Set(rects.map((r) => r.x)).size).toBe(1);
  for (let i = 1; i < rects.length; i++) expect(rects[i]!.top).toBeGreaterThanOrEqual(rects[i - 1]!.bottom);
  // 決定ボタンは常に見える（下部に固定）: 一覧をスクロールする前。最後の選択肢は、まだ画面の外。
  const submit = page.locator("[data-ask-submit]");
  await expect(submit).toBeInViewport({ ratio: 1 });
  const last = page.locator(`label.opt:has(input[value="${themes[12]!.value}"])`);
  await expect(last).not.toBeInViewport();
  await last.scrollIntoViewIfNeeded();
  await last.tap();
  await expect(page.locator(`input[type=radio][value="${themes[12]!.value}"]`)).toBeChecked();
  // 一覧を最後までスクロールした後も、ページを移った後も見える。
  await expect(submit).toBeInViewport({ ratio: 1 });
  await page.locator("[data-ask-next]").tap();
  await expect(page.locator('[data-ask-question="theme"]')).toBeHidden();
  await expect(submit).toBeInViewport({ ratio: 1 });
  await submit.tap();
  const r = await run.done;
  expect(r.code).toBe(0);
  expect(r.json).toMatchObject({ status: "answered", answers: { theme: themes[12]!.value } });
  await expect(dialog).toHaveCount(0);
});

test("即確定（質問が 1 つだけ・single・補足なし）: 選択肢のタップで確定する。選ばれていない選択肢でも、既に選ばれている選択肢でも（AC9）", async ({ page, appServer }) => {
  const client = await appServer.openClient("mobile");
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await openBrowser(page, appServer);
  const ONE = { note: false, questions: [{ id: "a", label: "A", default: "x", options: [{ value: "x", label: "エックス" }, { value: "y", label: "ワイ" }, { value: "z", label: "ゼット" }] }] };
  const dialog = page.locator("dialog#soda-ask-dialog[open]");
  // 選ばれていない選択肢（カードをタップ）。確定したことは、sodactl の stdout（回答の 1 行）とダイアログが閉じたことで見る。
  const first = await runAsk(appServer, p1, ONE);
  await expect(dialog).toBeVisible();
  await page.locator("label.opt", { hasText: "ゼット" }).tap();
  expect((await first.done).json).toEqual({ status: "answered", answers: { a: "z" } });
  await expect(dialog).toHaveCount(0);
  // 既に選ばれている選択肢（既定の x）。
  const second = await runAsk(appServer, p1, ONE);
  await expect(dialog).toBeVisible();
  await expect(page.locator("input[type=radio][value=x]")).toBeChecked();
  await page.locator("label.opt", { hasText: "エックス" }).tap();
  expect((await second.done).json).toEqual({ status: "answered", answers: { a: "x" } });
  await expect(dialog).toHaveCount(0);
});
