import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { runAsk } from "../support/ask.js";
import {
  dialog,
  opts,
  pageButtons,
  q,
  question,
  sent,
  setup,
  shownQuestions,
  walkPages,
} from "../support/askForm.js";

/**
 * 質問のフォーム（`sodactl ask`）のページ分け・ページをまたぐ決定・キー（20261003-ask-form-component の AC4・AC5・AC-I2〜AC-I5）の E2E。
 * ビルドした `sodactl` を子プロセスで起動し、合否はブラウザの側で見る（`e2e-observe-browser`）: ダイアログの DOM・フォーカス（部品の中は
 * `shadowRoot.activeElement`）・要素の大きさ・`keydown` の `defaultPrevented`・`sodactl` の stdout と終了コード。
 * テストのクライアントに届いた `ask.opened` を、ブラウザにダイアログが出た合図にしない（出るまで DOM で待つ）。
 *
 * 画面は 1280×720（Desktop Chrome）。高さで分かれる定義・収まる定義は、**余裕を持った大きさ**で作る（`ask-form.spec.ts` の `SPEC` は、全部を並べた高さが
 * 使える高さを 1px 超えるだけで 1 枚か 2 ページかが環境で変わる。ここでは合否に使わない）。分かれる側は 8 問×6 択、収まる側は 2 問×2 択。
 * ページに分かれた定義は、ページを移る操作の前後で、いまのページの番号のボタン（`[data-ask-page][aria-current="page"]`）で位置を見る。
 */

/** いまのページの番号のボタン。 */
const currentTab = (page: Page) => page.locator('[data-ask-page][aria-current="page"]');
/**
 * 部品は高さが決まってから分ける（ResizeObserver）ので、分割の前に番号のボタンの数を読むと 0 個を読む。ダイアログの高さが
 * 連続 5 フレーム変わらなくなる（描画が落ち着く）まで待ってから数える。
 */
async function settledPageCount(page: Page): Promise<number> {
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
  return pageButtons(page).count();
}
/** ダイアログが画面に収まっている（サブピクセルの許容 ±1px）。 */
async function expectFitsViewport(page: Page, label: string): Promise<void> {
  const box = (await dialog(page).boundingBox())!;
  expect(box.y, label).toBeGreaterThanOrEqual(-1);
  expect(box.y + box.height, label).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
}
const radio = (page: Page, id: string, value: string) =>
  page.locator(`[data-ask-question="${id}"] input[type=radio][value="${value}"]`);
const otherText = (page: Page, id: string) =>
  page.locator(`[data-ask-question="${id}"] label.opt.other input[type=text]`);

/** 部品の中でフォーカスのある要素（部品の外にあれば null。フォーカスが部品の中にあると `document.activeElement` は `<ask-form>`、中の要素は `shadowRoot.activeElement`）。 */
async function formFocus(page: Page): Promise<{
  tag: string;
  type: string | null;
  question: string | null;
  tab: string | null;
} | null> {
  return page.evaluate(() => {
    const a = document.querySelector("ask-form")?.shadowRoot?.activeElement ?? null;
    if (!a) return null;
    return {
      tag: a.localName,
      type: a.getAttribute("type"),
      question: a.closest("fieldset")?.getAttribute("data-ask-question") ?? null,
      tab: a.getAttribute("data-ask-page"),
    };
  });
}

/** ページを移った先で、そのページの番号のボタンにフォーカスがあり、そのページの質問が出ている。 */
async function expectOnPage(page: Page, n: number, ids: string[]): Promise<void> {
  await expect(currentTab(page)).toHaveAttribute("data-ask-page", String(n));
  await expect(currentTab(page)).toBeFocused();
  expect(await shownQuestions(page)).toEqual(ids);
}

/** 高さを超える定義: 8 問×6 択。 */
const many = (extra: (i: number) => Record<string, unknown> = () => ({})) =>
  Array.from({ length: 8 }, (_, i) => q(`m${i + 1}`, { options: opts(6), ...extra(i) }));
const manyIds = Array.from({ length: 8 }, (_, i) => `m${i + 1}`);

// --- ページ分け（AC4） ------------------------------------------------------------------------------------------------

test("page の題で分かれる。題の続く質問は同じページ、番号のボタンに題が出る（AC4）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, {
    note: false,
    questions: [q("q1", { page: "準備" }), q("q2"), q("q3", { page: "仕上げ" })],
  });
  await expect(dialog(page)).toBeVisible();
  await expect(pageButtons(page)).toHaveCount(2);
  await expect(pageButtons(page).nth(0)).toContainText("準備");
  await expect(pageButtons(page).nth(1)).toContainText("仕上げ");
  expect(await walkPages(page)).toEqual([["q1", "q2"], ["q3"]]);
  await page.keyboard.press("Escape");
  expect((await run.done).json).toEqual({ status: "cancelled" });
});

test("paging: 2 で 2 問ずつのページに分かれる（AC4）", async ({ page, appServer }) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, {
    note: false,
    paging: 2,
    questions: ["q1", "q2", "q3", "q4", "q5"].map((id) => q(id)),
  });
  await expect(dialog(page)).toBeVisible();
  await expect(pageButtons(page)).toHaveCount(3);
  expect(await walkPages(page)).toEqual([["q1", "q2"], ["q3", "q4"], ["q5"]]);
  await page.keyboard.press("Escape");
  await run.done;
});

test("paging: false では高さを超えても分かれず、番号のボタンが出ない（AC4）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, { note: false, paging: false, questions: many() });
  await expect(dialog(page)).toBeVisible();
  await expect(question(page, "m8")).toBeAttached();
  expect(await settledPageCount(page)).toBe(0); // 高さで分かれる定義（下の「page が無ければ」の件で分かれると確かめてある）が、落ち着いた後も 0
  expect(await shownQuestions(page)).toEqual(manyIds); // 8 問とも出ている（ダイアログの中をスクロールして見る）
  await page.keyboard.press("Escape");
  await run.done;
});

test("page・paging を書かない: 高さを超える定義（8 問×6 択）は分かれ、収まる定義（2 問×2 択）は 1 枚（AC4）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  // 分かれる側。全部のページを回ると 8 問が 1 回ずつ、定義の順に出る。ダイアログは画面の高さに収まる。
  const tall = await runAsk(appServer, p1, { note: false, questions: many() });
  await expect(dialog(page)).toBeVisible();
  await expect.poll(() => pageButtons(page).count()).toBeGreaterThan(1); // 分割は描画が落ち着いてから
  const pages = await pageButtons(page).count();
  test
    .info()
    .annotations.push({ type: "観測", description: `8 問×6 択 (1280×720): ${pages} ページ` });
  if ((await pageButtons(page).count()) > 0) await pageButtons(page).first().click();
  const seen: string[] = [];
  for (let i = 0; i < pages; i++) {
    if (i > 0) await page.locator("[data-ask-next]").click();
    await expectFitsViewport(page, `ページ ${i + 1} でダイアログが画面に収まる`);
    seen.push(...(await shownQuestions(page)));
  }
  expect(seen).toEqual(manyIds);
  await page.keyboard.press("Escape");
  await tall.done;
  await expect(dialog(page)).toHaveCount(0);
  // 収まる側。
  const small = await runAsk(appServer, p1, { note: false, questions: [q("s1"), q("s2")] });
  await expect(dialog(page)).toBeVisible();
  await expect(question(page, "s2")).toBeVisible();
  // 対照（上の tall）で、同じ画面の大きさで分割が起きることを確かめてある。ここは分割が済んだ後も 0 個のまま（描画が落ち着くのを待って読む）。
  expect(await settledPageCount(page)).toBe(0);
  expect(await shownQuestions(page)).toEqual(["s1", "s2"]);
  await page.keyboard.press("Escape");
  await small.done;
});

test("page を 1 つでも書くと高さでは分かれない（書かない同じ定義は分かれる、の対照つき）（AC4）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const control = await runAsk(appServer, p1, { note: false, questions: many() });
  await expect(dialog(page)).toBeVisible();
  await expect
    .poll(() => pageButtons(page).count(), { message: "対照: page が無ければ高さで分かれる" })
    .toBeGreaterThan(1);
  await page.keyboard.press("Escape");
  await control.done;
  await expect(dialog(page)).toHaveCount(0);

  const run = await runAsk(appServer, p1, {
    note: false,
    questions: many((i) => (i === 0 ? { page: "全部" } : {})),
  });
  await expect(dialog(page)).toBeVisible();
  await expect(question(page, "m8")).toBeAttached();
  expect(await settledPageCount(page)).toBe(0); // 1 ページ（題が続くあいだが 1 ページ）。対照が分かれているので、描画が落ち着いた後の 0
  expect(await shownQuestions(page)).toEqual(manyIds);
  await page.keyboard.press("Escape");
  await run.done;
});

test("page と paging: 1 を両方書くと page の題で分かれる。page と paging: false を両方書いても page の題で分かれる（paging だけなら従う、の対照つき）（AC4）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const questions = (withPage: boolean) => [
    q("q1", withPage ? { page: "A" } : {}),
    q("q2"),
    q("q3", withPage ? { page: "B" } : {}),
  ];
  const cases: { name: string; spec: unknown; pages: string[][] }[] = [
    {
      name: "対照: paging: 1 だけ（1 問ずつ）",
      spec: { note: false, paging: 1, questions: questions(false) },
      pages: [["q1"], ["q2"], ["q3"]],
    },
    {
      name: "page と paging: 1",
      spec: { note: false, paging: 1, questions: questions(true) },
      pages: [["q1", "q2"], ["q3"]],
    },
    {
      name: "対照: paging: false だけ（分けない）",
      spec: { note: false, paging: false, questions: questions(false) },
      pages: [["q1", "q2", "q3"]],
    },
    {
      name: "page と paging: false",
      spec: { note: false, paging: false, questions: questions(true) },
      pages: [["q1", "q2"], ["q3"]],
    },
  ];
  for (const c of cases) {
    const run = await runAsk(appServer, p1, c.spec);
    await expect(dialog(page)).toBeVisible();
    expect(await walkPages(page), c.name).toEqual(c.pages);
    await page.keyboard.press("Escape");
    await run.done;
    await expect(dialog(page)).toHaveCount(0);
  }
});

// --- ページをまたぐ決定（AC5） ----------------------------------------------------------------------------------------

/** 1 ページ目 a（既定あり）・2 ページ目 b（既定なし＝必須）。 */
const TWO = {
  note: false,
  questions: [q("a", { page: "基本" }), q("b", { page: "詳細", default: undefined })],
};

test("2 ページ目の必須の質問を答えずに 1 ページ目で決定すると、2 ページ目へ移り、その質問が未回答の表示になり、入力にフォーカスが移る。答えて決定すると両方のページの回答が出る（AC5・AC-I4）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, TWO);
  await expect(dialog(page)).toBeVisible();
  expect(await shownQuestions(page)).toEqual(["a"]);
  await radio(page, "a", "o2").check(); // 1 ページ目の回答は既定以外にしておく（両方のページの回答が出ることを見分ける）
  await page.locator("[data-ask-submit]").click();
  await expect(currentTab(page)).toHaveAttribute("data-ask-page", "2");
  expect(await shownQuestions(page)).toEqual(["b"]);
  await expect(question(page, "b")).toHaveAttribute("aria-invalid", "true");
  await expect(question(page, "b")).toHaveClass(/missing/);
  await expect(question(page, "a")).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("[data-ask-status]")).toContainText("未回答");
  // フォーカスは、その質問の入力（部品の中。`shadowRoot.activeElement`）。
  expect(await formFocus(page)).toMatchObject({ tag: "input", type: "radio", question: "b" });
  // 決定はまだ送られていない（ブラウザが送った ask.answer が 0 件）。sodactl もダイアログもそのまま。
  expect(sent(page).answers()).toBe(0);
  expect(run.finished()).toBe(false);
  await expect(dialog(page)).toBeVisible();
  await radio(page, "b", "o2").check();
  await expect(question(page, "b")).not.toHaveAttribute("aria-invalid", "true"); // 答えると未回答の表示が消える
  await page.locator("[data-ask-submit]").click();
  const r = await run.done;
  expect(sent(page).answers()).toBe(1); // 決定する操作の後に初めて 1 件
  expect(r.code).toBe(0);
  expect(r.json).toEqual({ status: "answered", answers: { a: "o2", b: "o2" } });
  await expect(dialog(page)).toHaveCount(0);
});

test("別のページの入力欄にフォーカスがあるまま決定して未回答のページへ移されたとき、フォーカスは未回答の質問の入力へ移る（見えない要素に残らない）（AC-I4）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  // 1 ページ目の自由入力の欄にフォーカスがある状態で Ctrl+Enter（部品が受ける）。2 ページ目の b が未回答。
  // 行き先は合否にする: 部品 1.1.0 以降は、決定で未回答のページへ移すとき最初の未回答の質問の入力へフォーカスを移す（ask-form.js）。「見えない
  // 要素（別のページの欄）にフォーカスが残らない」ことは利用者に見える動きで、取り込む版が替わって動きが変わったらここで気づく。
  // （design.md の「フォーカスは動かさない」は 1.0.1 の動きで古い。）
  const run = await runAsk(appServer, p1, {
    note: false,
    questions: [
      q("a", { page: "基本", allowOther: true }),
      q("b", { page: "詳細", default: undefined }),
    ],
  });
  await expect(dialog(page)).toBeVisible();
  await otherText(page, "a").fill("自由");
  await expect(otherText(page, "a")).toBeFocused();
  await page.keyboard.press("Control+Enter");
  await expect(currentTab(page)).toHaveAttribute("data-ask-page", "2");
  const f = await formFocus(page);
  test.info().annotations.push({
    type: "観測",
    description: `1 ページ目の入力欄にフォーカスがあるまま決定した後のフォーカス: ${JSON.stringify(f)}`,
  });
  expect(f).toMatchObject({ tag: "input", question: "b" });
  await expect(radio(page, "b", "o1")).toBeFocused();
  expect(sent(page).answers()).toBe(0);
  expect(run.finished()).toBe(false);
  await page.keyboard.press("Space"); // フォーカスの先で選べる（見えない要素ではない）
  await expect(radio(page, "b", "o1")).toBeChecked();
  await page.keyboard.press("Control+Enter");
  expect((await run.done).json).toEqual({
    status: "answered",
    answers: { a: "自由", b: "o1" },
    custom: ["a"],
  });
});

test("showIf の条件が 1 ページ目・対象が 2 ページ目: 答えを変えると 2 ページ目の質問が出る・消える。消えた質問は answers に入らない（AC5）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const spec = {
    note: false,
    questions: [
      {
        id: "channel",
        label: "チャンネル",
        page: "基本",
        default: "beta",
        options: ["beta", "stable"],
      },
      {
        id: "rollout",
        label: "段階",
        page: "詳細",
        showIf: { channel: "stable" },
        default: "10",
        options: ["10", "100"],
      },
      { id: "tag", label: "タグ", options: ["x", "y"], default: "x" },
    ],
  };
  const run = await runAsk(appServer, p1, spec);
  await expect(dialog(page)).toBeVisible();
  await page.locator("[data-ask-next]").click();
  expect(await shownQuestions(page)).toEqual(["tag"]); // beta のあいだ、rollout は出ない
  await expect(question(page, "rollout")).toBeHidden();
  await pageButtons(page).first().click();
  await radio(page, "channel", "stable").check();
  await page.locator("[data-ask-next]").click();
  expect(await shownQuestions(page)).toEqual(["rollout", "tag"]); // stable にすると 2 ページ目に出る
  await pageButtons(page).first().click();
  await radio(page, "channel", "beta").check();
  await page.locator("[data-ask-next]").click();
  expect(await shownQuestions(page)).toEqual(["tag"]); // beta に戻すと消える
  await page.locator("[data-ask-submit]").click();
  const r = await run.done;
  expect(r.json).toEqual({ status: "answered", answers: { channel: "beta", tag: "x" } }); // 消えた rollout は入らない
  // 対照: stable のままなら入る。
  const again = await runAsk(appServer, p1, spec);
  await expect(dialog(page)).toBeVisible();
  await radio(page, "channel", "stable").check();
  await page.locator("[data-ask-submit]").click();
  expect((await again.done).json).toEqual({
    status: "answered",
    answers: { channel: "stable", rollout: "10", tag: "x" },
  });
});

test("ページを移って戻ると、答え（選択・自由入力）が残っている（AC-I2）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, {
    note: false,
    questions: [q("a", { page: "一", allowOther: true }), q("b", { page: "二", allowOther: true })],
  });
  await expect(dialog(page)).toBeVisible();
  await radio(page, "a", "o2").check();
  await page.locator("[data-ask-next]").click();
  await otherText(page, "b").fill("二の自由入力");
  await page.locator("[data-ask-prev]").click();
  await expect(radio(page, "a", "o2")).toBeChecked(); // 戻ると 1 ページ目の選択が残る
  await pageButtons(page).nth(1).click(); // 番号で 2 ページ目へ
  await expect(otherText(page, "b")).toHaveValue("二の自由入力");
  await expect(question(page, "b").locator("input[data-other]")).toBeChecked();
  await page.keyboard.press("Control+Enter");
  expect((await run.done).json).toEqual({
    status: "answered",
    answers: { a: "o2", b: "二の自由入力" },
    custom: ["b"],
  });
});

// --- 入力欄の Enter（AC-I2） ------------------------------------------------------------------------------------------

test("途中のページの 1 行の入力欄で Enter を押すと次のページへ移り（決定されない）、最後のページの入力欄で Enter を押すと決定する（AC-I2）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, {
    note: false,
    questions: [
      q("a", { page: "一", allowOther: true }),
      q("b", { page: "二" }),
      q("c", { page: "三", allowOther: true }),
    ],
  });
  await expect(dialog(page)).toBeVisible();
  await otherText(page, "a").fill("x");
  await page.keyboard.press("Enter");
  await expectOnPage(page, 2, ["b"]);
  expect(sent(page).answers()).toBe(0); // 決定されていない（ブラウザが ask.answer を送っていない）
  expect(run.finished()).toBe(false);
  await expect(dialog(page)).toBeVisible();
  await pageButtons(page).nth(2).click();
  await otherText(page, "c").fill("z");
  await page.keyboard.press("Enter");
  const r = await run.done;
  expect(sent(page).answers()).toBe(1);
  expect(r.code).toBe(0);
  expect(r.json).toEqual({
    status: "answered",
    answers: { a: "x", b: "o1", c: "z" },
    custom: ["a", "c"],
  });
  await expect(dialog(page)).toHaveCount(0);
});

// --- キー（AC-I3・AC-I4・AC-I5） --------------------------------------------------------------------------------------

test("キーだけで完結する: Tab → 選ぶ → Alt+PageDown → 選ぶ → Ctrl+Enter（AC-I3）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, {
    note: false,
    questions: [
      q("a", { page: "一", default: undefined }),
      q("b", { page: "二", default: undefined }),
    ],
  });
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator("[data-ask-origin]")).toBeFocused();
  // 固定の行の次は、ページの番号（2 つ）、その次が最初の質問のラジオ。
  await page.keyboard.press("Tab");
  await expect(pageButtons(page).nth(0)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(pageButtons(page).nth(1)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(radio(page, "a", "o1")).toBeFocused();
  await page.keyboard.press("Space"); // 選ぶ（質問が 2 つなので即確定ではない）
  await expect(radio(page, "a", "o1")).toBeChecked();
  await page.keyboard.press("Alt+PageDown");
  await expectOnPage(page, 2, ["b"]);
  await page.keyboard.press("Tab");
  await expect(radio(page, "b", "o1")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(radio(page, "b", "o2")).toBeChecked();
  await page.keyboard.press("Control+Enter");
  expect((await run.done).json).toEqual({ status: "answered", answers: { a: "o1", b: "o2" } });
});

test("固定の行（[data-ask-origin]）にフォーカスがあるままの Alt+PageDown・Alt+PageUp・Ctrl+Enter が効く（枠が取り次ぐ）（AC-I3・AC-I4）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, {
    note: false,
    questions: [q("a", { page: "一" }), q("b", { page: "二" }), q("c", { page: "三" })],
  });
  await expect(dialog(page)).toBeVisible();
  const origin = page.locator("[data-ask-origin]");
  await expect(origin).toBeFocused();
  await page.keyboard.press("Alt+PageDown");
  await expectOnPage(page, 2, ["b"]); // 移った先のページの番号へフォーカスが移る
  await origin.focus();
  await expect(origin).toBeFocused();
  await page.keyboard.press("Alt+PageDown");
  await expectOnPage(page, 3, ["c"]);
  await origin.focus();
  await page.keyboard.press("Alt+PageUp");
  await expectOnPage(page, 2, ["b"]);
  // 固定の行から Ctrl+Enter で決定（すべて既定で答えてある）。
  await origin.focus();
  await expect(origin).toBeFocused();
  expect(sent(page).answers()).toBe(0); // ページを移る操作では決定されない
  expect(run.finished()).toBe(false);
  await page.keyboard.press("Control+Enter");
  expect((await run.done).json).toEqual({
    status: "answered",
    answers: { a: "o1", b: "o1", c: "o1" },
  });
  expect(sent(page).answers()).toBe(1);
  await expect(dialog(page)).toHaveCount(0);
});

test("Alt+PageDown・Alt+PageUp は、固定の行でも部品の中でも既定の動きを起こさない（keydown の defaultPrevented が真）。ダイアログが無ければ止めない（AC-I5）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  // 観測のしかた: window の capture で `keydown` の Event を取っておく。capture は最初に走るので、その時点ではまだ誰も `preventDefault` していない。
  // ただし Event オブジェクトは配送が終わった後も `defaultPrevented` を持ち続けるので、キーを押し終えた後に読むと「配送のどこかで誰かが止めたか」が分かる
  // （部品は扱ったキーを `stopPropagation` するので、bubble の側のリスナーでは見えない）。誰が止めたかは、対照で分ける:
  //   ダイアログが無いとき（偽: ほかのリスナーは止めない）／固定の行で押したとき（真: 枠が取り次いで止める）／部品の中で押したとき（真: 部品が止める）。
  await page.evaluate(() => {
    const w = window as unknown as { __keys: KeyboardEvent[] };
    w.__keys = [];
    window.addEventListener("keydown", (e) => void w.__keys.push(e), true);
  });
  /** 押したキーの名前（`key`＋修飾）を押してから、その keydown の defaultPrevented を返す。 */
  const press = async (combo: "Alt+PageDown" | "Alt+PageUp" | "x"): Promise<boolean> => {
    const key = combo.split("+").pop()!;
    const before = await page.evaluate(
      () => (window as unknown as { __keys: KeyboardEvent[] }).__keys.length,
    );
    await page.keyboard.press(combo);
    return page.evaluate(
      ([n, k, alt]) => {
        const hit = (window as unknown as { __keys: KeyboardEvent[] }).__keys
          .slice(n as number)
          .filter((e) => e.key === k && e.altKey === alt);
        if (hit.length !== 1) throw new Error(`${k} の keydown が ${hit.length} 件`);
        return hit[0]!.defaultPrevented;
      },
      [before, key, combo.startsWith("Alt+")] as const,
    );
  };
  // 対照: ダイアログが無い（質問が無い）あいだ、同じキーは止められない（ほかのリスナーは止めない）。
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  expect(await press("Alt+PageDown"), "対照: ダイアログが無いときの Alt+PageDown").toBe(false);
  expect(await press("Alt+PageUp"), "対照: ダイアログが無いときの Alt+PageUp").toBe(false);

  const run = await runAsk(appServer, p1, {
    note: false,
    questions: [q("a", { page: "一" }), q("b", { page: "二" })],
  });
  await expect(dialog(page)).toBeVisible();
  const origin = page.locator("[data-ask-origin]");
  await expect(origin).toBeFocused();
  expect(await press("Alt+PageDown"), "固定の行から（枠が取り次いで止める）").toBe(true);
  await expectOnPage(page, 2, ["b"]);
  expect(await press("Alt+PageUp"), "部品の中（ページの番号）から（部品が止める）").toBe(true);
  await expectOnPage(page, 1, ["a"]);
  await origin.focus();
  expect(await press("Alt+PageUp"), "固定の行から、先頭のページで").toBe(true);
  // 先頭のページで移らない: 今のページの番号のボタンが aria-current="page" のまま。
  await expect(currentTab(page)).toHaveAttribute("data-ask-page", "1");
  expect(await shownQuestions(page)).toEqual(["a"]);
  await radio(page, "a", "o1").focus();
  expect(await press("Alt+PageDown"), "部品の中（ラジオ）から（部品が止める）").toBe(true);
  await expectOnPage(page, 2, ["b"]);
  await radio(page, "b", "o1").focus();
  expect(await press("Alt+PageDown"), "部品の中、最後のページで").toBe(true);
  await expect(currentTab(page)).toHaveAttribute("data-ask-page", "2"); // 移らない
  expect(await shownQuestions(page)).toEqual(["b"]);
  expect(await press("x"), "対照: 誰も扱わないキーは止められない").toBe(false);
  await page.keyboard.press("Escape");
  await run.done;
});

test("ページを移る 5 通り（［次へ］・［戻る］・Alt+PageDown／Alt+PageUp・番号のクリック・入力欄の Enter）のどれでも、移った先のページの番号のボタンにフォーカスがある（AC-I4）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, {
    note: false,
    questions: [
      q("a", { page: "一", allowOther: true }),
      q("b", { page: "二" }),
      q("c", { page: "三" }),
    ],
  });
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator("[data-ask-origin]")).toBeFocused(); // 開いた直後は固定の行
  await page.locator("[data-ask-next]").click();
  await expectOnPage(page, 2, ["b"]); // ［次へ］
  await page.keyboard.press("Alt+PageDown");
  await expectOnPage(page, 3, ["c"]); // Alt+PageDown（部品の中）
  await page.locator("[data-ask-prev]").click();
  await expectOnPage(page, 2, ["b"]); // ［戻る］
  await page.keyboard.press("Alt+PageUp");
  await expectOnPage(page, 1, ["a"]); // Alt+PageUp（部品の中）
  await pageButtons(page).nth(2).click();
  await expectOnPage(page, 3, ["c"]); // 番号のクリック
  await pageButtons(page).nth(0).click();
  await expectOnPage(page, 1, ["a"]);
  await otherText(page, "a").fill("x");
  await page.keyboard.press("Enter");
  await expectOnPage(page, 2, ["b"]); // 途中のページの入力欄の Enter
  await page.keyboard.press("Escape");
  await run.done;
});

test("ページを移っても、ダイアログの高さは変わらない（いちばん高いページに合う）（AC4）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  // 1 ページ目は高く（2 問×6 択）、2 ページ目は低く（1 問×2 択）、3 ページ目は中くらい。
  const run = await runAsk(appServer, p1, {
    note: false,
    questions: [
      q("a", { page: "高い", options: opts(6) }),
      q("a2", { options: opts(6) }),
      q("b", { page: "低い" }),
      q("c", { page: "中", options: opts(4) }),
    ],
  });
  await expect(dialog(page)).toBeVisible();
  const heights: number[] = [];
  const contents: number[] = [];
  for (let i = 0; i < 3; i++) {
    await pageButtons(page).nth(i).click();
    await expect(currentTab(page)).toHaveAttribute("data-ask-page", String(i + 1)); // 移った先の番号が current になってから読む
    await expect(currentTab(page)).toBeFocused();
    heights.push((await dialog(page).boundingBox())!.height);
    contents.push(
      await page
        .locator("[data-ask-question]:visible")
        .evaluateAll((els) => els.reduce((s, e) => s + e.getBoundingClientRect().height, 0)),
    );
  }
  test.info().annotations.push({
    type: "観測",
    description: `ダイアログの高さ ${JSON.stringify(heights)} / 出ている質問の高さの合計 ${JSON.stringify(contents)}`,
  });
  expect(contents[0]!, "対照: ページの中身の高さは違う（この観測が区別できる）").toBeGreaterThan(
    contents[1]! + 50,
  );
  // 高さが同じ（サブピクセルの許容 ±1px）。ただし上限（画面の高さ − 16px）で頭打ちになっているだけでも同じになるので、上限より十分小さいこと、
  // 最も高いページの中身以上であることも見る。
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
  expect(heights[0]!, "上限で頭打ちではない").toBeLessThan(page.viewportSize()!.height - 16 - 100);
  expect(heights[0]!, "最も高いページの中身以上").toBeGreaterThanOrEqual(Math.max(...contents));
  await page.keyboard.press("Escape");
  await run.done;
});
