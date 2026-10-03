import type { Page } from "@playwright/test";
import type { AppServer } from "./appServer.js";
import { watchAskSubscriptions } from "./ask.js";
import { watchSentAsk } from "./askSent.js";

/**
 * 質問のフォームの E2E（`ask-form.spec.ts`・`ask-form-paging.spec.ts`・`ask-form-extras.spec.ts`）の共通の補助。
 * 部品 `<ask-form>`（`third_party/ask-form/ask-form.js`）の内部の属性（`data-ask-question`・`data-ask-page`・`data-ask-next` など）に依る箇所はここに集める
 * （部品を取り込み直して属性名が変わったときの直し先。手順は `third_party/ask-form/README.md`）。
 */

export const dialog = (page: Page) => page.locator("dialog#soda-ask-dialog[open]");

/** ページごとの、ブラウザが送った `ask.answer`・`ask.cancel` の数（`openBrowser` が `goto` の前に張る）。 */
const sentOf = new WeakMap<Page, Awaited<ReturnType<typeof watchSentAsk>>>();
export const sent = (page: Page) => sentOf.get(page)!;

/**
 * ブラウザを開いて「質問を出せる画面」として登録されるまで待つ。`before` は `goto` の前に呼ぶ（そのページの監視を足したいとき）。
 * 戻り値の `sentAnswers` は、ブラウザが送った `ask.answer` の累計（`support/askSent.ts`）。
 */
export async function openBrowser(
  page: Page,
  appServer: { origin: string; token: string },
  before?: (page: Page) => Promise<void>,
) {
  const subs = await watchAskSubscriptions(page);
  const watched = await watchSentAsk(page);
  sentOf.set(page, watched);
  await before?.(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await subs.waitFor(1);
  return Object.assign(subs, { sentAnswers: watched.answers });
}

/** ブラウザを開き、pane の id を返す。 */
export async function setup(
  page: Page,
  appServer: AppServer,
  before?: (page: Page) => Promise<void>,
): Promise<string> {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await openBrowser(page, appServer, before);
  return p1;
}

/** いま出ている質問の id（いまのページにあり、表示条件を満たしているもの）。 */
export async function shownQuestions(page: Page): Promise<string[]> {
  return page
    .locator("[data-ask-question]:visible")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-ask-question") ?? ""));
}

/** 出ているページの番号のボタン（1 枚のときは 0 個）。 */
export const pageButtons = (page: Page) => page.locator("[data-ask-page]:visible");

/**
 * 最初のページから［次へ］で最後のページまで回り、ページごとの「出ている質問の id」を返す（1 枚ならそのまま 1 つ）。終わると最後のページに居る。
 * ページを移るのは部品のクリックの処理の中（同期）なので、クリックが返った時点で DOM は移った後。
 */
export async function walkPages(page: Page): Promise<string[][]> {
  if ((await pageButtons(page).count()) > 0) await pageButtons(page).first().click();
  const pages = [await shownQuestions(page)];
  const next = page.locator("[data-ask-next]");
  while (await next.isVisible()) {
    await next.click();
    pages.push(await shownQuestions(page));
    if (pages.length > 50) throw new Error("ページが終わらない");
  }
  return pages;
}

export const question = (page: Page, id: string) => page.locator(`[data-ask-question="${id}"]`);

export const opts = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ value: `o${i + 1}`, label: `選択肢${i + 1}` }));
/** 2 択の単一選択（既定は o1）。 */
export const q = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  label: `質問 ${id}`,
  default: "o1",
  options: opts(2),
  ...extra,
});
