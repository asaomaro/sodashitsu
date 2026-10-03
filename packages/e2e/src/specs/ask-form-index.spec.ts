import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { runAsk } from "../support/ask.js";
import {
  currentIndex,
  dialog,
  formFocus,
  indexItems,
  indexWidth,
  inBody,
  opts,
  q,
  question,
  sent,
  setup,
  settle,
  shownQuestions,
} from "../support/askForm.js";

/**
 * 質問のフォーム（`sodactl ask`）の質問の目次・質問をまたぐ決定・キー（20261003-ask-form-component の AC4・AC5・AC-I2〜AC-I5。部品 1.2.1。decisions.md の D12・D13）の E2E。
 * ビルドした `sodactl` を子プロセスで起動し、合否はブラウザの側で見る（`e2e-observe-browser`）: ダイアログの DOM・フォーカス（部品の中は
 * `shadowRoot.activeElement`）・要素の大きさ・`keydown` の `defaultPrevented`・ブラウザが送った `ask.answer`（CDP）・`sodactl` の stdout と終了コード。
 * テストのクライアントに届いた `ask.opened` を、ブラウザにダイアログが出た合図にしない（出るまで DOM で待つ）。
 *
 * 部品 1.2.1 は質問を 1 枚に並べたまま、高さに収まらないとき（または `page`・`paging: true`／数を書いたとき）だけ、左に質問の題の目次（`nav.index`）を出す。
 * 目次の項目は `[data-ask-index="<質問の id>"]`（補足は値が空）。**目次が出ていなくても項目は DOM にある**ので、「出ているか」は `nav.index` の可視性と `indexWidth`
 * （出ていなければ 0）で見る。今の項目は `aria-current="true"`。`pageCount` はいつも 1 で、`data-ask-page`・`-next`・`-prev` は無い。
 * 画面は 1280×720（Desktop Chrome）。高さで目次が出る定義・出ない定義は、**余裕を持った大きさ**で作る（目次が出る側は 8 問×6 択、出ない側は 1〜2 問×2 択）。
 * 部品は高さが決まってから目次を出すか決める（ResizeObserver）ので、「出ない」ことは描画が落ち着いてから読む（`settle`）。
 */

const radio = (page: Page, id: string, value: string) =>
  page.locator(`[data-ask-question="${id}"] input[type=radio][value="${value}"]`);
const otherText = (page: Page, id: string) =>
  page.locator(`[data-ask-question="${id}"] label.opt.other input[type=text]`);
const navIndex = (page: Page) => page.locator("nav.index");

/** ダイアログが画面に収まっている（サブピクセルの許容 ±1px）。 */
async function expectFitsViewport(page: Page, label: string): Promise<void> {
  const box = (await dialog(page).boundingBox())!;
  expect(box.y, label).toBeGreaterThanOrEqual(-1);
  expect(box.y + box.height, label).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
}

/** 移った先の質問が、本文の表示範囲に見え、今の項目の印がそこにあり、フォーカスがその質問のラジオにある。 */
async function expectOn(page: Page, id: string): Promise<void> {
  await expect.poll(() => currentIndex(page), { message: `今の項目が ${id}` }).toBe(id);
  expect(await inBody(page, id), `${id} が本文の表示範囲に見える`).toBe(true);
  expect(await formFocus(page), `${id} のラジオにフォーカス`).toMatchObject({
    tag: "input",
    type: "radio",
    question: id,
  });
}

/** 目次が出る定義: 8 問×6 択。 */
const many = (extra: (i: number) => Record<string, unknown> = () => ({})) =>
  Array.from({ length: 8 }, (_, i) => q(`m${i + 1}`, { options: opts(6), ...extra(i) }));
const manyIds = Array.from({ length: 8 }, (_, i) => `m${i + 1}`);

// --- 目次の出し分け（AC4） ----------------------------------------------------------------------------------------------

test("page・paging を書かない: 高さを超える定義（8 問×6 択）は目次が出て、収まる定義（2 問×2 択）は出ない（AC4）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  // 出る側。質問は 1 枚に並んだまま（8 問とも見える質問として DOM にあり、ページの数は 1）、左に 8 項目の目次が出る。ダイアログは画面の高さに収まる。
  const tall = await runAsk(appServer, p1, { note: false, questions: many() });
  await expect(dialog(page)).toBeVisible();
  await expect(navIndex(page)).toBeVisible(); // 目次は高さが決まってから出る
  expect(await indexItems(page)).toEqual(manyIds);
  expect(await shownQuestions(page)).toEqual(manyIds);
  const iw = await indexWidth(page);
  expect(iw).toBeGreaterThan(0);
  expect(
    await page
      .locator("ask-form")
      .evaluate((f) => (f as unknown as { pageCount: number }).pageCount),
  ).toBe(1);
  expect(await page.locator("[data-ask-page], [data-ask-next], [data-ask-prev]").count()).toBe(0);
  test.info().annotations.push({
    type: "観測",
    description: `8 問×6 択 (1280×720): 目次 ${manyIds.length} 項目・indexWidth ${iw}`,
  });
  await expectFitsViewport(page, "目次が出る定義でダイアログが画面に収まる");
  await page.keyboard.press("Escape");
  await tall.done;
  await expect(dialog(page)).toHaveCount(0);
  // 出ない側。DOM に項目はあるが、`nav.index` は隠れ、`indexWidth` は 0。描画が落ち着いた後も同じ（対照: 上の tall で、同じ画面の大きさで目次が出ると確かめてある）。
  const small = await runAsk(appServer, p1, { note: false, questions: [q("s1"), q("s2")] });
  await expect(dialog(page)).toBeVisible();
  await expect(question(page, "s2")).toBeVisible();
  await settle(page);
  expect(await indexWidth(page)).toBe(0);
  await expect(navIndex(page)).toBeHidden();
  expect(await shownQuestions(page)).toEqual(["s1", "s2"]);
  await page.keyboard.press("Escape");
  await small.done;
});

test("page を 1 つでも書くと、収まっていても目次が出て、見出しが page の題になる。題が続くあいだが 1 つの見出し（AC4）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const questions = (withPage: boolean) => [
    q("q1", withPage ? { page: "準備" } : {}),
    q("q2"),
    q("q3", withPage ? { page: "仕上げ" } : {}),
  ];
  // 対照: page を書かない同じ 3 問は、収まるので目次が出ない。
  const control = await runAsk(appServer, p1, { note: false, questions: questions(false) });
  await expect(dialog(page)).toBeVisible();
  await settle(page);
  expect(await indexWidth(page), "対照: page が無ければ収まるので目次は出ない").toBe(0);
  await page.keyboard.press("Escape");
  await control.done;
  await expect(dialog(page)).toHaveCount(0);

  const run = await runAsk(appServer, p1, { note: false, questions: questions(true) });
  await expect(dialog(page)).toBeVisible();
  await expect(navIndex(page)).toBeVisible();
  expect(await indexItems(page)).toEqual(["q1", "q2", "q3"]);
  await expect(page.locator("nav.index .sec")).toHaveText(["準備", "仕上げ"]); // q2 は q1 の題に続く
  await page.keyboard.press("Escape");
  expect((await run.done).json).toEqual({ status: "cancelled" });
});

test("paging: true と paging: 2（数）は、収まっていても目次が出る（AC4）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  for (const paging of [true, 2]) {
    const run = await runAsk(appServer, p1, {
      note: false,
      paging,
      questions: ["q1", "q2", "q3", "q4", "q5"].map((id) => q(id)),
    });
    await expect(dialog(page)).toBeVisible();
    await expect(navIndex(page), `paging: ${paging}`).toBeVisible();
    expect(await indexItems(page), `paging: ${paging}`).toEqual(["q1", "q2", "q3", "q4", "q5"]);
    expect(await indexWidth(page)).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
    await run.done;
    await expect(dialog(page)).toHaveCount(0);
  }
});

test("paging: false では、高さを超えても目次が出ない。page を書いても、page と paging: false を両方書いても出ない（AC4）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  // 対照: paging を書かない同じ定義は、目次が出る。
  const control = await runAsk(appServer, p1, { note: false, questions: many() });
  await expect(dialog(page)).toBeVisible();
  await expect(navIndex(page), "対照: paging を書かなければ高さで目次が出る").toBeVisible();
  await page.keyboard.press("Escape");
  await control.done;
  await expect(dialog(page)).toHaveCount(0);

  const cases: { name: string; spec: unknown; ids: string[] }[] = [
    {
      name: "paging: false（高さを超える 8 問）",
      spec: { note: false, paging: false, questions: many() },
      ids: manyIds,
    },
    // 部品のコメントは「page を書いたら必ず出す」だが、実際の動きは paging: false が勝つ（ask-form の側へ食い違いとして伝え済み）。事実として書く。
    {
      name: "page と paging: false の両方",
      spec: {
        note: false,
        paging: false,
        questions: [q("q1", { page: "A" }), q("q2"), q("q3", { page: "B" })],
      },
      ids: ["q1", "q2", "q3"],
    },
  ];
  for (const c of cases) {
    const run = await runAsk(appServer, p1, c.spec);
    await expect(dialog(page)).toBeVisible();
    await expect(question(page, c.ids[c.ids.length - 1]!)).toBeAttached();
    await settle(page);
    expect(await indexWidth(page), c.name).toBe(0);
    await expect(navIndex(page), c.name).toBeHidden();
    expect(await shownQuestions(page), c.name).toEqual(c.ids); // 全部出ている（ダイアログの中をスクロールして見る）
    await page.keyboard.press("Escape");
    await run.done;
    await expect(dialog(page)).toHaveCount(0);
  }
});

// --- 目次の項目 ----------------------------------------------------------------------------------------------------------

test("目次の項目は質問の id が定義の順に並び、補足は値が空の項目になる。showIf で隠れた質問は目次にも出ない（出る・消える）（AC4）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, {
    // note を書かない（補足あり）。page を書いて、収まっていても目次を出す。
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
        showIf: { channel: "stable" },
        default: "10",
        options: ["10", "100"],
      },
      { id: "tag", label: "タグ", options: ["x", "y"], default: "x" },
    ],
  });
  await expect(dialog(page)).toBeVisible();
  await expect(navIndex(page)).toBeVisible();
  await expect(page.locator("nav.index .sec")).toHaveText(["基本"]);
  expect(await indexItems(page)).toEqual(["channel", "tag", ""]); // beta のあいだ rollout は目次に出ない。最後は補足（値が空）
  await radio(page, "channel", "stable").check();
  expect(await indexItems(page)).toEqual(["channel", "rollout", "tag", ""]); // stable にすると定義の順の位置に出る
  await radio(page, "channel", "beta").check();
  expect(await indexItems(page)).toEqual(["channel", "tag", ""]); // 戻すと消える
  await page.keyboard.press("Escape");
  await run.done;
});

// --- 次・前の質問へ移る（AC-I3・AC-I4） -------------------------------------------------------------------------------

test("目次の項目のクリックで、その質問へ移る（見える・今の項目の印が移る・フォーカスがそのラジオへ）。答えは残る（AC4・AC-I2）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, {
    note: false,
    questions: many((i) => (i < 2 ? { allowOther: true } : {})),
  });
  await expect(dialog(page)).toBeVisible();
  await expect(navIndex(page)).toBeVisible();
  await expect.poll(() => currentIndex(page)).toBe("m1");
  await page.locator('[data-ask-index="m7"]').click();
  await expectOn(page, "m7");
  expect(await inBody(page, "m1"), "m1 はもう見えない（本文がスクロールした）").toBe(false);
  await page.locator('[data-ask-index="m3"]').click();
  await expectOn(page, "m3");
  await page.locator('[data-ask-index="m1"]').click();
  await expectOn(page, "m1");
  await radio(page, "m1", "o2").check();
  await page.locator('[data-ask-index="m2"]').click();
  await otherText(page, "m2").fill("二の自由入力");
  await page.locator('[data-ask-index="m1"]').click();
  await expect(radio(page, "m1", "o2")).toBeChecked(); // 移って戻ると選択が残る
  await page.locator('[data-ask-index="m2"]').click();
  await expect(otherText(page, "m2")).toHaveValue("二の自由入力");
  await expect(question(page, "m2").locator("input[data-other]")).toBeChecked();
  await page.keyboard.press("Control+Enter");
  expect((await run.done).json).toEqual({
    status: "answered",
    answers: {
      m1: "o2",
      m2: "二の自由入力",
      ...Object.fromEntries(manyIds.slice(2).map((id) => [id, "o1"])),
    },
    custom: ["m2"],
  });
});

test("Alt+PageDown・Alt+PageUp で次・前の質問へ移る（部品の中から）。端の質問では何も起きない。移っても決定されない（AC-I3・AC-I4）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, { note: false, questions: many() });
  await expect(dialog(page)).toBeVisible();
  await expect(navIndex(page)).toBeVisible();
  await page.locator('[data-ask-index="m1"]').click();
  await expectOn(page, "m1");
  await page.keyboard.press("Alt+PageUp"); // 先頭の質問では何も起きない
  await expectOn(page, "m1");
  await page.keyboard.press("Alt+PageDown");
  await expectOn(page, "m2");
  await page.keyboard.press("Alt+PageDown");
  await expectOn(page, "m3");
  await page.keyboard.press("Alt+PageUp");
  await expectOn(page, "m2");
  await page.locator('[data-ask-index="m8"]').click();
  await expectOn(page, "m8");
  await page.keyboard.press("Alt+PageDown"); // 最後の質問では何も起きない
  await expectOn(page, "m8");
  expect(sent(page).answers()).toBe(0); // 移る操作では決定されない
  expect(run.finished()).toBe(false);
  await page.keyboard.press("Escape");
  await run.done;
});

test("Alt+PageDown・Alt+PageUp は、表示条件で隠れた質問を飛ばす（AC-I3）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, {
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
        showIf: { channel: "stable" },
        default: "10",
        options: ["10", "100"],
      },
      { id: "tag", label: "タグ", options: ["x", "y"], default: "x" },
    ],
  });
  await expect(dialog(page)).toBeVisible();
  await expect(navIndex(page)).toBeVisible();
  await page.locator('[data-ask-index="channel"]').click();
  await expectOn(page, "channel");
  await page.keyboard.press("Alt+PageDown");
  await expectOn(page, "tag"); // beta のあいだ rollout は飛ばす
  await page.keyboard.press("Alt+PageUp");
  await expectOn(page, "channel");
  await radio(page, "channel", "stable").check();
  await page.keyboard.press("Alt+PageDown");
  await expectOn(page, "rollout"); // stable にすると止まる
  await page.keyboard.press("Alt+PageDown");
  await expectOn(page, "tag");
  await page.keyboard.press("Escape");
  await run.done;
});

test("固定の行（[data-ask-origin]）にフォーカスがあるままの Alt+PageDown・Alt+PageUp・Ctrl+Enter が効く（枠が取り次ぐ）（AC-I3・AC-I4）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, { note: false, questions: many() });
  await expect(dialog(page)).toBeVisible();
  await expect(navIndex(page)).toBeVisible();
  const origin = page.locator("[data-ask-origin]");
  await expect(origin).toBeFocused();
  await page.keyboard.press("Alt+PageDown");
  await expectOn(page, "m2"); // 移った先の質問のラジオへフォーカスが移る
  await origin.focus();
  await expect(origin).toBeFocused();
  await page.keyboard.press("Alt+PageDown");
  await expectOn(page, "m3");
  await origin.focus();
  await page.keyboard.press("Alt+PageUp");
  await expectOn(page, "m2");
  // 固定の行から Ctrl+Enter で決定（すべて既定で答えてある）。
  await origin.focus();
  await expect(origin).toBeFocused();
  expect(sent(page).answers()).toBe(0); // 質問を移る操作では決定されない
  expect(run.finished()).toBe(false);
  await page.keyboard.press("Control+Enter");
  expect((await run.done).json).toEqual({
    status: "answered",
    answers: Object.fromEntries(manyIds.map((id) => [id, "o1"])),
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

  const run = await runAsk(appServer, p1, { note: false, questions: many() });
  await expect(dialog(page)).toBeVisible();
  await expect(navIndex(page)).toBeVisible();
  const origin = page.locator("[data-ask-origin]");
  await expect(origin).toBeFocused();
  expect(await press("Alt+PageDown"), "固定の行から（枠が取り次いで止める）").toBe(true);
  await expectOn(page, "m2");
  expect(await press("Alt+PageUp"), "部品の中（ラジオ）から（部品が止める）").toBe(true);
  await expectOn(page, "m1");
  await origin.focus();
  expect(await press("Alt+PageUp"), "固定の行から、先頭の質問で").toBe(true);
  expect(await currentIndex(page)).toBe("m1"); // 移らない
  await radio(page, "m1", "o1").focus();
  expect(await press("Alt+PageDown"), "部品の中（ラジオ）から（部品が止める）").toBe(true);
  await expectOn(page, "m2");
  await page.locator('[data-ask-index="m8"]').click();
  await radio(page, "m8", "o1").focus();
  expect(await press("Alt+PageDown"), "部品の中、最後の質問で").toBe(true);
  expect(await currentIndex(page)).toBe("m8"); // 移らない
  expect(await press("x"), "対照: 誰も扱わないキーは止められない").toBe(false);
  await page.keyboard.press("Escape");
  await run.done;
});

// --- 決定（AC5） ------------------------------------------------------------------------------------------------------

/** m1〜m8。m6・m7 は既定なし（必須）。 */
const withMissing = () => many((i) => (i === 5 || i === 6 ? { default: undefined } : {}));

test("どこからでも決定できる。未回答があると決定されず、最初の未回答の質問へ移り、その質問が未回答の表示になり入力にフォーカスが移る。答えて決定すると全部の回答が出る（AC5・AC-I4）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, { note: false, questions: withMissing() });
  await expect(dialog(page)).toBeVisible();
  await expect(navIndex(page)).toBeVisible();
  // 目次の未回答の印（.lack）は、決定を試みる前から付いている。
  await expect(page.locator('[data-ask-index="m6"]')).toHaveClass(/lack/);
  await expect(page.locator('[data-ask-index="m7"]')).toHaveClass(/lack/);
  await expect(page.locator('[data-ask-index="m1"]')).not.toHaveClass(/lack/);
  await page.locator('[data-ask-index="m1"]').click();
  await radio(page, "m1", "o2").check(); // 先頭の回答は既定以外にしておく（全部の回答が出ることを見分ける）
  // 目次で別の質問へ移らなくても、先頭の質問から決定できる。未回答があるので決定されない。
  await page.locator("[data-ask-submit]").click();
  await expect
    .poll(() => inBody(page, "m6"), { message: "最初の未回答の質問（m6）が見える" })
    .toBe(true);
  await expect(question(page, "m6")).toHaveAttribute("aria-invalid", "true");
  await expect(question(page, "m6")).toHaveClass(/missing/);
  await expect(question(page, "m7")).toHaveAttribute("aria-invalid", "true"); // 未回答の質問は全部、表示が付く
  await expect(question(page, "m1")).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("[data-ask-status]")).toContainText("未回答");
  // フォーカスは、最初の未回答の質問の入力（部品の中。`shadowRoot.activeElement`）。
  expect(await formFocus(page)).toMatchObject({ tag: "input", type: "radio", question: "m6" });
  // 決定はまだ送られていない（ブラウザが送った ask.answer が 0 件）。sodactl もダイアログもそのまま。
  expect(sent(page).answers()).toBe(0);
  expect(run.finished()).toBe(false);
  await expect(dialog(page)).toBeVisible();
  await radio(page, "m6", "o2").check();
  await expect(question(page, "m6")).not.toHaveAttribute("aria-invalid", "true"); // 答えると未回答の表示が消える
  // 次の決定では、残りの未回答（m7）へ移る。
  await page.locator("[data-ask-submit]").click();
  await expect
    .poll(() => formFocus(page))
    .toMatchObject({ tag: "input", type: "radio", question: "m7" });
  expect(await inBody(page, "m7")).toBe(true);
  expect(sent(page).answers()).toBe(0);
  await radio(page, "m7", "o2").check();
  await page.locator("[data-ask-submit]").click();
  const r = await run.done;
  expect(sent(page).answers()).toBe(1); // 決定する操作の後に初めて 1 件
  expect(r.code).toBe(0);
  expect(r.json).toEqual({
    status: "answered",
    answers: { m1: "o2", m2: "o1", m3: "o1", m4: "o1", m5: "o1", m6: "o2", m7: "o2", m8: "o1" },
  });
  await expect(dialog(page)).toHaveCount(0);
});

test("別の質問の入力欄にフォーカスがあるまま決定して未回答の質問へ移されたとき、フォーカスは未回答の質問の入力へ移る（元の欄に残らない）（AC-I4）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  // 先頭の質問の自由入力の欄にフォーカスがある状態で Ctrl+Enter（部品が受ける）。m6 が未回答。
  // 行き先は合否にする: 部品 1.2.1 は、決定で未回答の質問へ移すとき、最初の未回答の質問の最初の入力へフォーカスを移す（ask-form.js の submit）。
  // 元の欄（画面の外へ出た欄）にフォーカスが残らないことは利用者に見える動きで、取り込む版が替わって動きが変わったらここで気づく。
  const run = await runAsk(appServer, p1, {
    note: false,
    questions: many((i) =>
      i === 0 ? { allowOther: true } : i === 5 ? { default: undefined } : {},
    ),
  });
  await expect(dialog(page)).toBeVisible();
  await expect(navIndex(page)).toBeVisible();
  await page.locator('[data-ask-index="m1"]').click();
  await otherText(page, "m1").fill("自由");
  await expect(otherText(page, "m1")).toBeFocused();
  await page.keyboard.press("Control+Enter");
  await expect
    .poll(() => formFocus(page))
    .toMatchObject({ tag: "input", type: "radio", question: "m6" });
  test.info().annotations.push({
    type: "観測",
    description: `先頭の質問の入力欄にフォーカスがあるまま決定した後のフォーカス: ${JSON.stringify(await formFocus(page))}`,
  });
  await expect.poll(() => inBody(page, "m6"), { message: "m6 が見える" }).toBe(true);
  await expect(radio(page, "m6", "o1")).toBeFocused();
  expect(sent(page).answers()).toBe(0);
  expect(run.finished()).toBe(false);
  await page.keyboard.press("Space"); // フォーカスの先で選べる
  await expect(radio(page, "m6", "o1")).toBeChecked();
  await page.keyboard.press("Control+Enter");
  expect((await run.done).json).toEqual({
    status: "answered",
    answers: { m1: "自由", m2: "o1", m3: "o1", m4: "o1", m5: "o1", m6: "o1", m7: "o1", m8: "o1" },
    custom: ["m1"],
  });
});

test("showIf が質問をまたぐ: 答えを変えると離れた質問が出る・消える。消えた質問は answers に入らない（AC5）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  // 条件の質問が先頭、対象が途中。間と後ろに質問があり、`page` で目次を出す（収まっていても出る）。
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
      { id: "tag", label: "タグ", options: ["x", "y"], default: "x" },
      {
        id: "rollout",
        label: "段階",
        showIf: { channel: "stable" },
        default: "10",
        options: ["10", "100"],
      },
      { id: "last", label: "最後", options: ["p", "q"], default: "p" },
    ],
  };
  const run = await runAsk(appServer, p1, spec);
  await expect(dialog(page)).toBeVisible();
  await expect(navIndex(page)).toBeVisible();
  expect(await shownQuestions(page)).toEqual(["channel", "tag", "last"]); // beta のあいだ、rollout は出ない
  await expect(question(page, "rollout")).toBeHidden();
  await radio(page, "channel", "stable").check();
  expect(await shownQuestions(page)).toEqual(["channel", "tag", "rollout", "last"]); // stable にすると出る
  await radio(page, "channel", "beta").check();
  expect(await shownQuestions(page)).toEqual(["channel", "tag", "last"]); // beta に戻すと消える
  await page.locator("[data-ask-submit]").click();
  const r = await run.done;
  expect(r.json).toEqual({ status: "answered", answers: { channel: "beta", tag: "x", last: "p" } }); // 消えた rollout は入らない
  // 対照: stable のままなら入る。
  const again = await runAsk(appServer, p1, spec);
  await expect(dialog(page)).toBeVisible();
  await radio(page, "channel", "stable").check();
  await page.locator("[data-ask-submit]").click();
  expect((await again.done).json).toEqual({
    status: "answered",
    answers: { channel: "stable", tag: "x", rollout: "10", last: "p" },
  });
});

// --- 入力欄の Enter（AC-I2） ------------------------------------------------------------------------------------------

test("目次が出ているとき、1 行の入力欄で Enter を押すと次の質問へ移り（決定されない）、最後の質問の入力欄で Enter を押すと決定する。目次が出ない短いフォームでは決定する（AC-I2）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, {
    note: false,
    questions: [q("a", { page: "一", allowOther: true }), q("b"), q("c", { allowOther: true })],
  });
  await expect(dialog(page)).toBeVisible();
  await expect(navIndex(page)).toBeVisible();
  await otherText(page, "a").fill("x");
  await page.keyboard.press("Enter");
  await expectOn(page, "b"); // 次の質問へ。フォーカスはそのラジオ
  expect(sent(page).answers()).toBe(0); // 決定されていない（ブラウザが ask.answer を送っていない）
  expect(run.finished()).toBe(false);
  await expect(dialog(page)).toBeVisible();
  await page.locator('[data-ask-index="c"]').click();
  await otherText(page, "c").fill("z");
  await page.keyboard.press("Enter"); // 最後の質問
  const r = await run.done;
  expect(sent(page).answers()).toBe(1);
  expect(r.code).toBe(0);
  expect(r.json).toEqual({
    status: "answered",
    answers: { a: "x", b: "o1", c: "z" },
    custom: ["a", "c"],
  });
  await expect(dialog(page)).toHaveCount(0);

  // 対照: 目次が出ない短いフォームでは、入力欄の Enter が決定する。
  const short = await runAsk(appServer, p1, {
    note: false,
    questions: [q("a", { allowOther: true }), q("b")],
  });
  await expect(dialog(page)).toBeVisible();
  await settle(page);
  expect(await indexWidth(page)).toBe(0);
  await otherText(page, "a").fill("y");
  await page.keyboard.press("Enter");
  expect((await short.done).json).toEqual({
    status: "answered",
    answers: { a: "y", b: "o1" },
    custom: ["a"],
  });
});

// --- キー（AC-I3・AC-I4・AC-I5） --------------------------------------------------------------------------------------

test("キーだけで完結する: Tab → 選ぶ → Alt+PageDown → 選ぶ → Ctrl+Enter（AC-I3）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  // 先頭の 2 問は未回答（既定なし）。8 問×6 択にして、本文が先頭にあるあいだ今の項目が先頭になるようにする
  // （収まる短いフォームで目次を出すと、今の項目が最後の質問になり Alt+PageDown が動かない。ask-form の側へ伝えた点。下の test.fixme の件）。
  const run = await runAsk(appServer, p1, {
    note: false,
    questions: many((i) => (i < 2 ? { default: undefined } : {})),
  });
  await expect(dialog(page)).toBeVisible();
  await expect(navIndex(page)).toBeVisible();
  await expect(page.locator("[data-ask-origin]")).toBeFocused();
  // 固定の行の次は、目次の項目（8 つ）、その次が最初の質問のラジオ。
  for (const id of manyIds) {
    await page.keyboard.press("Tab");
    await expect(page.locator(`[data-ask-index="${id}"]`)).toBeFocused();
  }
  await page.keyboard.press("Tab");
  await expect(radio(page, "m1", "o1")).toBeFocused();
  await page.keyboard.press("Space"); // 選ぶ（質問が 8 つなので即確定ではない）
  await expect(radio(page, "m1", "o1")).toBeChecked();
  await page.keyboard.press("Alt+PageDown");
  await expectOn(page, "m2"); // 未回答のラジオ（どれも選ばれていない）の最初へ
  await page.keyboard.press("ArrowDown");
  await expect(radio(page, "m2", "o2")).toBeChecked();
  await page.keyboard.press("Control+Enter");
  expect((await run.done).json).toEqual({
    status: "answered",
    answers: {
      m1: "o1",
      m2: "o2",
      ...Object.fromEntries(manyIds.slice(2).map((id) => [id, "o1"])),
    },
  });
});

// 部品 1.2.1 の動きの食い違い（ask-form の側へ伝える点 (1)）。`page` を書くなどで、収まっている短いフォームに目次を出すと、本文がスクロールしていない
// （全部が 1 画面に収まっている）あいだ、今の項目が最初ではなく**最後の質問**になる。すると 1 問目から Alt+PageDown を押しても次の質問へ移らない。
// 期待は「今の項目が先頭の質問のとき、Alt+PageDown で 2 問目へ移る」。部品が直ったらこの fixme を外す。
test.fixme("収まる短いフォームに目次を出したとき、1 問目から Alt+PageDown で 2 問目へ移る（部品の動きの食い違い。fixme）（AC-I3）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, {
    note: false,
    questions: [q("a", { page: "一" }), q("b")],
  });
  await expect(dialog(page)).toBeVisible();
  await expect(navIndex(page)).toBeVisible();
  await radio(page, "a", "o1").focus();
  expect(await currentIndex(page)).toBe("a");
  await page.keyboard.press("Alt+PageDown");
  await expectOn(page, "b");
  await page.keyboard.press("Escape");
  await run.done;
});

// --- 大きさ（AC4） ----------------------------------------------------------------------------------------------------

test("質問を移っても（目次のクリック・Alt+PageDown・Alt+PageUp）、ダイアログの高さは変わらない（質問が 1 枚に並んだまま。中身の高さで一定）（AC4）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  // 上限（画面の高さ − 16px）より十分低い大きさにする: 高い質問（6 択）と低い質問（2 択）と中くらいの質問（4 択）。`page` で目次を出す。
  const run = await runAsk(appServer, p1, {
    note: false,
    questions: [q("a", { page: "高い", options: opts(6) }), q("b"), q("c", { options: opts(4) })],
  });
  await expect(dialog(page)).toBeVisible();
  await expect(navIndex(page)).toBeVisible();
  await settle(page);
  const measure = async () => ({
    h: (await dialog(page).boundingBox())!.height,
    content: await page
      .locator("ask-form")
      .evaluate((f) => (f as unknown as { contentHeight: number }).contentHeight),
  });
  const first = await measure();
  const seen: { h: number; content: number }[] = [first];
  await page.locator('[data-ask-index="c"]').click();
  await expectOn(page, "c");
  seen.push(await measure());
  await page.keyboard.press("Alt+PageUp");
  await expectOn(page, "b");
  seen.push(await measure());
  await page.keyboard.press("Alt+PageDown");
  await expectOn(page, "c");
  await page.locator('[data-ask-index="a"]').click();
  await expectOn(page, "a");
  seen.push(await measure());
  test.info().annotations.push({
    type: "観測",
    description: `移る前後のダイアログの高さ・contentHeight ${JSON.stringify(seen)}`,
  });
  expect(Math.max(...seen.map((s) => s.h)) - Math.min(...seen.map((s) => s.h))).toBeLessThanOrEqual(
    1,
  );
  expect(
    Math.max(...seen.map((s) => s.content)) - Math.min(...seen.map((s) => s.content)),
  ).toBeLessThanOrEqual(1);
  // 上限で頭打ちになっているだけでも同じになるので、上限より十分小さいことも見る。
  expect(first.h, "上限で頭打ちではない").toBeLessThan(page.viewportSize()!.height - 16 - 100);
  await page.keyboard.press("Escape");
  await run.done;
});

test("目次が出るとき、ダイアログが indexWidth の分だけ広がり、画面の幅 − 16px を超えない。幅 767px 以下では目次が出ず広がらない（AC4）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const measure = async () => ({
    iw: await indexWidth(page),
    dw: (await dialog(page).boundingBox())!.width,
    vw: page.viewportSize()!.width,
    nav: await navIndex(page).isVisible(),
    widened: await dialog(page).evaluate((d) =>
      (d as HTMLElement).style.getPropertyValue("--ask-index-width"),
    ),
  });
  // 基準: 目次が出ない同じ画面（1280）でのダイアログの幅。
  await page.setViewportSize({ width: 1280, height: 720 });
  const base = await runAsk(appServer, p1, { note: false, paging: false, questions: many() });
  await expect(dialog(page)).toBeVisible();
  await settle(page);
  const noIndex = await measure();
  expect(noIndex.iw).toBe(0);
  expect(noIndex.nav).toBe(false);
  await page.keyboard.press("Escape");
  await base.done;
  await expect(dialog(page)).toHaveCount(0);

  const seen: Record<number, unknown> = { 1280: noIndex };
  for (const vw of [1280, 900, 800, 768, 767]) {
    await page.setViewportSize({ width: vw, height: 720 });
    const run = await runAsk(appServer, p1, { note: false, questions: many() });
    await expect(dialog(page)).toBeVisible();
    await settle(page);
    const m = await measure();
    seen[vw] = m;
    if (vw >= 768) {
      expect(m.iw, `幅 ${vw}px で目次が出る`).toBe(212);
      expect(m.nav).toBe(true);
      expect(m.widened).toBe("212px");
      expect(m.dw, `幅 ${vw}px で目次の分だけ広がる`).toBeGreaterThan(noIndex.dw + 1);
      expect(m.dw, `幅 ${vw}px で画面の幅 − 16px を超えない`).toBeLessThanOrEqual(vw - 16 + 1);
      if (vw === 1280) expect(Math.abs(m.dw - (noIndex.dw + 212))).toBeLessThanOrEqual(1);
    } else {
      expect(m.iw, `幅 ${vw}px では目次が出ない`).toBe(0);
      expect(m.nav).toBe(false);
      expect(m.dw, `幅 ${vw}px でも画面の幅 − 16px を超えない`).toBeLessThanOrEqual(vw - 16 + 1);
      // 幅 767px 以下の CSS は「画面の幅 − 16px」（720px の固定ではない）なので、広がっていないことは、幅に足す変数が付いていないことで見る。
      expect(m.widened, "目次が出ないので幅に足す変数が付いていない").toBe("");
    }
    await page.keyboard.press("Escape");
    await run.done;
    await expect(dialog(page)).toHaveCount(0);
  }
  test.info().annotations.push({ type: "観測", description: JSON.stringify(seen) });
});

test("目次が出ても質問の並びは窮屈にならない（質問の幅が 640px 以上・選択肢が 1 列にならない）（AC4）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, { note: false, questions: many() });
  await expect(dialog(page)).toBeVisible();
  await expect(navIndex(page)).toBeVisible();
  await settle(page);
  const layout = await page.evaluate(() => {
    const f = document.querySelector("ask-form")!;
    const fs = f.shadowRoot!.querySelector('[data-ask-question="m2"]')!;
    const xs = Array.from(fs.querySelectorAll("label.opt")).map((e) =>
      Math.round(e.getBoundingClientRect().x),
    );
    return { width: fs.getBoundingClientRect().width, columns: new Set(xs).size };
  });
  test.info().annotations.push({
    type: "観測",
    description: `1280×720: 質問の幅 ${layout.width}px・選択肢 ${layout.columns} 列`,
  });
  expect(layout.width).toBeGreaterThanOrEqual(640);
  expect(layout.columns).toBeGreaterThanOrEqual(2);
  await page.keyboard.press("Escape");
  await run.done;
});

test("画面の幅が変わると目次が出入りする（1280 → 700 → 1000px で indexWidth が 212 → 0 → 212）（AC4）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  await page.setViewportSize({ width: 1280, height: 720 });
  const run = await runAsk(appServer, p1, { note: false, questions: many() });
  await expect(dialog(page)).toBeVisible();
  await expect.poll(() => indexWidth(page)).toBe(212);
  await expect(navIndex(page)).toBeVisible();
  await page.setViewportSize({ width: 700, height: 720 });
  await expect.poll(() => indexWidth(page)).toBe(0);
  await expect(navIndex(page)).toBeHidden();
  expect((await dialog(page).boundingBox())!.width).toBeLessThanOrEqual(700 - 16 + 1);
  await page.setViewportSize({ width: 1000, height: 720 });
  await expect.poll(() => indexWidth(page)).toBe(212);
  await expect(navIndex(page)).toBeVisible();
  expect((await dialog(page).boundingBox())!.width).toBeLessThanOrEqual(1000 - 16 + 1);
  await page.keyboard.press("Escape");
  await run.done;
});

test("ダイアログは画面に収まる（高さ 720px・480px）。目次の最後の質問まで移れる（AC4）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  for (const height of [720, 480]) {
    await page.setViewportSize({ width: 1280, height });
    const run = await runAsk(appServer, p1, { note: false, questions: many() });
    await expect(dialog(page)).toBeVisible();
    await expect(navIndex(page)).toBeVisible();
    await settle(page);
    await expectFitsViewport(page, `高さ ${height}px`);
    await page.locator('[data-ask-index="m1"]').click();
    for (let i = 2; i <= 8; i++) await page.keyboard.press("Alt+PageDown");
    await expectOn(page, "m8");
    await expectFitsViewport(page, `高さ ${height}px、最後の質問へ移った後`);
    await page.keyboard.press("Escape");
    await run.done;
    await expect(dialog(page)).toHaveCount(0);
  }
});
