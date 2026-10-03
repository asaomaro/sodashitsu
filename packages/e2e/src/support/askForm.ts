import type { Page } from "@playwright/test";
import type { AppServer } from "./appServer.js";
import { watchAskSubscriptions } from "./ask.js";
import { watchSentAsk } from "./askSent.js";

/**
 * 質問のフォームの E2E（`ask-form.spec.ts`・`ask-form-index.spec.ts`・`ask-form-extras.spec.ts`）の共通の補助。
 * 部品 `<ask-form>`（`third_party/ask-form/ask-form.js`）の内部の属性（`data-ask-question`・`data-ask-index`・`nav.index` など）に依る箇所はここに集める
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

/** いま出ている質問の id（表示条件を満たしているもの。質問は 1 枚に並んでいるので、スクロールで見えない分も含む）。 */
export async function shownQuestions(page: Page): Promise<string[]> {
  return page
    .locator("[data-ask-question]:visible")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-ask-question") ?? ""));
}

/** 目次の項目（出ているもの）の値。質問の id が定義の順に並び、補足は空文字。目次が出ていなければ空（項目は DOM にあるが `nav.index` が隠れている）。 */
export async function indexItems(page: Page): Promise<string[]> {
  return page
    .locator("[data-ask-index]:visible")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-ask-index") ?? ""));
}

/** 今の項目（`aria-current="true"`）の値。印が無ければ null。 */
export async function currentIndex(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const cur = document
      .querySelector("ask-form")
      ?.shadowRoot?.querySelector('nav.index [data-ask-index][aria-current="true"]');
    return cur ? (cur.getAttribute("data-ask-index") ?? "") : null;
  });
}

/** 目次の幅（部品の `indexWidth`。目次が出ていなければ 0）。出る・出ないは描画が落ち着いてから読む（`settle`）。 */
export const indexWidth = (page: Page): Promise<number> =>
  page.locator("ask-form").evaluate((f) => (f as unknown as { indexWidth: number }).indexWidth);

/**
 * ダイアログの高さが連続 5 フレーム変わらなくなる（描画が落ち着く）まで待つ。部品は高さが決まってから目次を出すか決める（ResizeObserver）ので、
 * 出るまでの途中の 0 を「出ない」と読まないように、「出ない」ことは落ち着いた後に読む。
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const d = document.querySelector("dialog#soda-ask-dialog")!;
        let last = -1;
        let same = 0;
        const tick = () => {
          const h = d.getBoundingClientRect().height;
          same = h === last ? same + 1 : 0;
          last = h;
          if (same >= 5) resolve();
          else requestAnimationFrame(tick);
        };
        tick();
      }),
  );
}

/** 質問が部品の本文（スクロールする領域）の表示範囲に入っている（サブピクセルの許容 ±1px）。 */
export async function inBody(page: Page, id: string): Promise<boolean> {
  return page.evaluate((qid) => {
    const root = document.querySelector("ask-form")!.shadowRoot!;
    const body = root.querySelector(".body")!.getBoundingClientRect();
    const r = root.querySelector(`[data-ask-question="${qid}"]`)!.getBoundingClientRect();
    return r.top >= body.top - 1 && r.bottom <= body.bottom + 1;
  }, id);
}

/** 部品の中でフォーカスのある要素（部品の外にあれば null。フォーカスが部品の中にあると `document.activeElement` は `<ask-form>`、中の要素は `shadowRoot.activeElement`）。 */
export async function formFocus(
  page: Page,
): Promise<{ tag: string; type: string | null; question: string | null } | null> {
  return page.evaluate(() => {
    const a = document.querySelector("ask-form")?.shadowRoot?.activeElement ?? null;
    if (!a) return null;
    return {
      tag: a.localName,
      type: a.getAttribute("type"),
      question: a.closest("fieldset")?.getAttribute("data-ask-question") ?? null,
    };
  });
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
