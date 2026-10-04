import { devices, type Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { askFixture, runAsk, watchAskSubscriptions } from "../support/ask.js";
import { commentBox, commentToggle, indexItems, indexWidth, settle } from "../support/askForm.js";

/**
 * 質問のフォーム（`sodactl ask`。20261002-sodactl-ask）をモバイルの画面で（AC4・AC-I3）。幅 390px では質問の目次は出ない（質問は 1 枚に並ぶ）。`mobile.spec.ts` と同じく、実機の代わりに Playwright の
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
  // この画面（幅 390px）では目次は出ない（部品は viewport の幅 767px 以下で隠す）。質問は 7 つとも 1 枚に並んだまま、本文をスクロールして見る。
  // 目次を出すかは高さの当て直しの後に決まるので、描画が落ち着いてから「出ない」を読む（項目は DOM にあるので、出ているかは可視性と indexWidth で見る）。
  await expect(page.locator('[data-ask-question="theme"]')).toBeVisible();
  await settle(page);
  expect(await indexWidth(page)).toBe(0);
  await expect(page.locator("nav.index")).toBeHidden();
  expect(await indexItems(page)).toEqual([]);
  await expect(page.locator("[data-ask-question]")).toHaveCount(7);
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
  // 一覧を最後までスクロールした後も、さらに最後の質問までスクロールした後も見える。
  await expect(submit).toBeInViewport({ ratio: 1 });
  const lastQuestion = page.locator('[data-ask-question="auto-figure"]');
  await lastQuestion.scrollIntoViewIfNeeded();
  await expect(lastQuestion).toBeInViewport();
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

test("モバイルの画面で、自由記述のボタンをタップして欄を開き、書いて決定すると comments に入る（AC2・AC4）", async ({ page, appServer }) => {
  const client = await appServer.openClient("mobile");
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await openBrowser(page, appServer);
  const run = await runAsk(appServer, p1, {
    questions: [
      { id: "a", label: "A", default: "x", options: ["x", "y"] },
      { id: "b", label: "B", default: "p", options: ["p", "q"] },
    ],
  });
  const dialog = page.locator("dialog#soda-ask-dialog[open]");
  await expect(dialog).toBeVisible();
  const toggle = commentToggle(page, "a");
  await toggle.scrollIntoViewIfNeeded();
  await toggle.tap();
  const box = commentBox(page, "a");
  await expect(box).toBeVisible();
  await expect(toggle).toHaveText("自由記述を閉じる");
  await box.fill("スマホから書いた");
  // 開いた欄は画面（ダイアログ）からはみ出さない。
  const d = (await dialog.boundingBox())!;
  const b = (await box.boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(d.x);
  expect(b.x + b.width).toBeLessThanOrEqual(d.x + d.width);
  const submit = page.locator("[data-ask-submit]");
  await submit.scrollIntoViewIfNeeded();
  await submit.tap();
  const r = await run.done;
  expect(r.code).toBe(0);
  expect(r.json).toEqual({ status: "answered", answers: { a: "x", b: "p" }, comments: { a: "スマホから書いた" } });
  await expect(dialog).toHaveCount(0);
});
