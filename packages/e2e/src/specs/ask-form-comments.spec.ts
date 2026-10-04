import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { runAsk, watchAskSubscriptions } from "../support/ask.js";
import { choice, commentBox, commentToggle, dialog, formFocus, inBody, opts, q, sent, setup, settle, submitForm as submit } from "../support/askForm.js";
import { watchSentInput } from "../support/frames.js";
import { focusTerminal, typeLine } from "../support/keys.js";

/**
 * 質問ごとの自由記述（部品 1.3.0。20261004-ask-form-comments）の E2E。ビルドした `sodactl` を子プロセスで起動し、合否はブラウザの側で見る（`e2e-observe-browser`）:
 * ダイアログの DOM（Shadow DOM の中を含む。CSS ロケータは越える）・ブラウザが送った `ask.answer` の数（`sent`）・`sodactl` の stdout の JSON。
 */

const ADD = "＋ 自由記述";
const CLOSE = "自由記述を閉じる";
const FILLED = "自由記述（入力あり）を開く";

test("各質問（single・multi）の下に「＋ 自由記述」のボタンがあり、押すと欄が開き、もう一度押すと閉じる。閉じても内容は残り、文言が変わる。text の質問には無い（AC2）", async ({ page, appServer }) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, {
    questions: [q("a"), q("m", { type: "multi", default: undefined }), { id: "t", label: "書く", type: "text" }],
  });
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator("[data-ask-comment-toggle]")).toHaveCount(2); // a と m だけ（text には無い）
  await expect(commentToggle(page, "t")).toHaveCount(0);
  await expect(commentToggle(page, "a")).toHaveText(ADD);
  await expect(commentBox(page, "a")).toBeHidden();

  await commentToggle(page, "a").click();
  await expect(commentBox(page, "a")).toBeVisible();
  await expect(commentToggle(page, "a")).toHaveText(CLOSE);
  await commentBox(page, "a").fill("金曜は避けたい");
  await commentToggle(page, "a").click(); // 閉じる
  await expect(commentBox(page, "a")).toBeHidden();
  await expect(commentToggle(page, "a")).toHaveText(FILLED);
  await expect(commentToggle(page, "m")).toHaveText(ADD); // 書いていない質問は変わらない
  await commentToggle(page, "a").click(); // もう一度開く
  await expect(commentBox(page, "a")).toHaveValue("金曜は避けたい"); // 閉じても内容は残っている
  await page.keyboard.press("Escape");
  expect((await run.done).json).toEqual({ status: "cancelled" });
});

test("comments: false の定義ではどの質問にもボタンが出ない。comment: false の質問にだけ出ない定義では、ほかの質問には出る（AC3）", async ({ page, appServer }) => {
  const p1 = await setup(page, appServer);
  const off = await runAsk(appServer, p1, { comments: false, questions: [q("a"), q("b")] });
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator("[data-ask-question]")).toHaveCount(2);
  await expect(page.locator("[data-ask-comment-toggle]")).toHaveCount(0);
  await expect(page.locator("textarea[data-ask-comment]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await off.done;
  await expect(dialog(page)).toHaveCount(0);

  const one = await runAsk(appServer, p1, { questions: [q("a", { comment: false }), q("b")] });
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator("[data-ask-question]")).toHaveCount(2);
  await expect(commentToggle(page, "a")).toHaveCount(0);
  await expect(commentToggle(page, "b")).toHaveText(ADD);
  await page.keyboard.press("Escape");
  await one.done;
});

test("質問が 1 つだけ・single・補足なしのフォームには付かず、選んだ時点で決定する（今までどおり）（AC3）", async ({ page, appServer }) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, { note: false, questions: [q("a")] });
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator("[data-ask-comment-toggle]")).toHaveCount(0);
  expect(sent(page).answers()).toBe(0);
  await choice(page, "a", "o2").click(); // 選んだ時点で決定する
  const r = await run.done;
  expect(r.json).toEqual({ status: "answered", answers: { a: "o2" } }); // comments の項目は無い
  expect(sent(page).answers()).toBe(1);
});

test("端から端まで: 書いた質問の id と文（前後の空白なし）が sodactl の結果の comments に入る。閉じた欄も入る。空白だけは入らない（AC4）", async ({ page, appServer }) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, { questions: [q("a"), q("b"), q("c"), q("d", { type: "multi", default: undefined })] });
  await expect(dialog(page)).toBeVisible();
  // a: 開いたまま書く。b: 書いて閉じる。c: 空白だけ。d（multi）: 書く。
  await commentToggle(page, "a").click();
  await commentBox(page, "a").fill("  金曜は避けたい\n  できれば午前  ");
  await commentToggle(page, "b").click();
  await commentBox(page, "b").fill("閉じても入る");
  await commentToggle(page, "b").click();
  await expect(commentBox(page, "b")).toBeHidden();
  await commentToggle(page, "c").click();
  await commentBox(page, "c").fill("   \n  ");
  await commentToggle(page, "d").click(); // multi の質問にも書ける
  await commentBox(page, "d").fill("複数選択への一言");
  await submit(page);
  const r = await run.done;
  expect(r.code).toBe(0);
  expect(r.json).toEqual({
    status: "answered",
    answers: { a: "o1", b: "o1", c: "o1", d: [] },
    comments: { a: "金曜は避けたい\n  できれば午前", b: "閉じても入る", d: "複数選択への一言" },
  });
  expect(sent(page).answers()).toBe(1);
});

test("表示条件（showIf）で隠れた質問の欄は入らない。いったん隠れて再び見えた質問の欄は、内容が残っていて入る（AC4）", async ({ page, appServer }) => {
  const p1 = await setup(page, appServer);
  const spec = { questions: [q("a", { options: [{ value: "x", label: "X" }, { value: "y", label: "Y" }], default: "y" }), q("b", { showIf: { a: "y" } })] };

  // 隠れたまま決定する: b に書いた後で a を x に替えて b を隠す → b の自由記述は入らない。
  const hidden = await runAsk(appServer, p1, spec);
  await expect(dialog(page)).toBeVisible();
  await commentToggle(page, "b").click();
  await commentBox(page, "b").fill("隠れる前に書いた");
  await choice(page, "a", "x").check();
  await expect(page.locator('[data-ask-question="b"]')).toBeHidden();
  await submit(page);
  expect((await hidden.done).json).toEqual({ status: "answered", answers: { a: "x" } }); // comments の項目ごと無い
  await expect(dialog(page)).toHaveCount(0);

  // 隠れて、再び見えた: 内容が残っていて入る。
  const back = await runAsk(appServer, p1, spec);
  await expect(dialog(page)).toBeVisible();
  await commentToggle(page, "b").click();
  await commentBox(page, "b").fill("戻っても残る");
  await choice(page, "a", "x").check();
  await expect(page.locator('[data-ask-question="b"]')).toBeHidden();
  await choice(page, "a", "y").check();
  await expect(page.locator('[data-ask-question="b"]')).toBeVisible();
  await expect(commentBox(page, "b")).toHaveValue("戻っても残る");
  await submit(page);
  expect((await back.done).json).toEqual({ status: "answered", answers: { a: "y", b: "o1" }, comments: { b: "戻っても残る" } });
});

test("何も書かなければ、結果に comments の項目が無い（今までと同じ出力）（AC4）", async ({ page, appServer }) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, { questions: [q("a"), q("b")] });
  await expect(dialog(page)).toBeVisible();
  await commentToggle(page, "a").click(); // 開いただけで書かない
  await submit(page);
  const r = await run.done;
  expect(r.json).toEqual({ status: "answered", answers: { a: "o1", b: "o1" } });
  expect(r.json).not.toHaveProperty("comments");
});

test("自由記述に HTML（<script>・<img onerror>）を書いても動かず、DOM に要素もできず、結果には書いた文字のまま入る（AC8）", async ({ page, appServer }) => {
  const p1 = await setup(page, appServer, async (p) => {
    await p.addInitScript(() => {
      (window as unknown as { __askXss: number[] }).__askXss = [];
    });
  });
  const html = '<img src=x onerror="window.__askXss.push(1)"><script>window.__askXss.push(2)</script></textarea><b>太字</b>';
  const run = await runAsk(appServer, p1, { questions: [q("a"), q("b")] });
  await expect(dialog(page)).toBeVisible();
  await commentToggle(page, "a").click();
  await commentBox(page, "a").fill(html);
  await expect(commentBox(page, "a")).toHaveValue(html); // 欄の値は文字のまま
  // 要素にならない（Shadow DOM の中を含む）。スクリプトも走らない。
  expect(await page.locator("dialog#soda-ask-dialog script, dialog#soda-ask-dialog img, dialog#soda-ask-dialog b").count()).toBe(0);
  expect(await page.locator("ask-form").evaluate((f) => f.shadowRoot!.querySelectorAll("script, img, b").length)).toBe(0);
  // 閉じて（ボタンの文言が変わる再描画）・開き直しても、要素にならない。
  await commentToggle(page, "a").click();
  await expect(commentToggle(page, "a")).toHaveText("自由記述（入力あり）を開く");
  await commentToggle(page, "a").click();
  await expect(commentBox(page, "a")).toHaveValue(html);
  expect(await page.locator("ask-form").evaluate((f) => f.shadowRoot!.querySelectorAll("script, img, b").length)).toBe(0);
  await submit(page);
  const r = await run.done;
  expect(r.json).toEqual({ status: "answered", answers: { a: "o1", b: "o1" }, comments: { a: html } }); // 書いた文字のまま
  expect(await page.evaluate(() => (window as unknown as { __askXss: number[] }).__askXss)).toEqual([]);
});

// --- 操作（AC-I1〜AC-I5） ------------------------------------------------------------------------------------------------

/** 部品の中でフォーカスのある要素の印（`data-ask-comment`・`data-ask-comment-toggle` の質問の id も読む）。 */
const focusedComment = (page: Page) =>
  page.evaluate(() => {
    const a = document.querySelector("ask-form")?.shadowRoot?.activeElement ?? null;
    return a ? { tag: a.localName, comment: a.getAttribute("data-ask-comment"), toggle: a.getAttribute("data-ask-comment-toggle") } : null;
  });
const dialogHeight = async (page: Page) => (await dialog(page).boundingBox())!.height;

test("ボタンの aria-expanded が開閉に合わせて変わり、欄には質問の名前を含む読み上げ用の名前が付く。クリック・Enter・Space で開閉できる（AC-I1）", async ({ page, appServer }) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, { questions: [q("a"), q("b")] });
  await expect(dialog(page)).toBeVisible();
  const t = commentToggle(page, "a");
  await expect(t).toHaveAttribute("aria-expanded", "false");
  await expect(commentBox(page, "a")).toHaveAttribute("aria-label", "質問 a の自由記述"); // 質問の名前（label）を含む
  await t.click();
  await expect(t).toHaveAttribute("aria-expanded", "true");
  await t.click();
  await expect(t).toHaveAttribute("aria-expanded", "false");
  await t.focus();
  await page.keyboard.press("Enter");
  await expect(t).toHaveAttribute("aria-expanded", "true");
  await t.focus();
  await page.keyboard.press("Enter"); // 同じ操作で閉じる
  await expect(t).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Space");
  await expect(t).toHaveAttribute("aria-expanded", "true");
  await expect(commentBox(page, "a")).toBeVisible();
  await t.focus(); // 欄を開くとフォーカスは欄へ移っているので、ボタンへ戻してから
  await page.keyboard.press("Escape"); // ダイアログ自体の取り消しは今までどおり（ボタンにフォーカスがあるとき）
  expect((await run.done).json).toEqual({ status: "cancelled" });
});

test("欄の中の Enter は改行（決定しない）、Ctrl+Enter で決定する（AC-I2）", async ({ page, appServer }) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, { questions: [q("a"), q("b")] });
  await expect(dialog(page)).toBeVisible();
  await commentToggle(page, "a").click();
  await commentBox(page, "a").pressSequentially("一行目");
  await page.keyboard.press("Enter");
  await page.keyboard.type("二行目");
  await expect(commentBox(page, "a")).toHaveValue("一行目\n二行目"); // 改行が入った
  await page.waitForTimeout(300); // 決定していないことは「送られていない」ことで見る（0 件の観測に少しの猶予）
  expect(sent(page).answers()).toBe(0);
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("Control+Enter");
  const r = await run.done;
  expect(r.json).toEqual({ status: "answered", answers: { a: "o1", b: "o1" }, comments: { a: "一行目\n二行目" } });
  expect(sent(page).answers()).toBe(1);
});

test("欄の中の Esc はフォームを取り消す（ask.cancel が 1 件・ask.answer は 0 件）（AC-I2）", async ({ page, appServer }) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, { questions: [q("a"), q("b")] });
  await expect(dialog(page)).toBeVisible();
  await commentToggle(page, "a").click();
  await commentBox(page, "a").fill("書きかけ");
  await expect(commentBox(page, "a")).toBeFocused();
  await page.keyboard.press("Escape");
  expect((await run.done).json).toEqual({ status: "cancelled" });
  await expect.poll(() => sent(page).cancels()).toBe(1);
  expect(sent(page).answers()).toBe(0);
});

test("キーボードだけで完結する: Tab でボタンへ → Enter で開く → 書く → Ctrl+Enter で決定（AC-I3）", async ({ page, appServer }) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, { questions: [q("a")] }); // 1 問・補足あり（即確定ではない）
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator("[data-ask-origin]")).toBeFocused();
  await settle(page);
  await page.keyboard.press("Tab");
  await expect(page.locator("input[type=radio][value=o1]")).toBeFocused();
  await page.keyboard.press("Tab"); // 選択肢の次は、その質問の自由記述のボタン
  expect(await focusedComment(page)).toEqual({ tag: "button", comment: null, toggle: "a" });
  await page.keyboard.press("Enter");
  expect(await focusedComment(page)).toEqual({ tag: "textarea", comment: "a", toggle: null });
  await page.keyboard.type("キーだけで書いた");
  await page.keyboard.press("Control+Enter");
  expect((await run.done).json).toEqual({ status: "answered", answers: { a: "o1" }, comments: { a: "キーだけで書いた" } });
});

test("開くと欄にフォーカスが移る（もう一度開いても）。キーで閉じるとボタンにフォーカスが残る（AC-I4）", async ({ page, appServer }) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, { questions: [q("a"), q("b")] });
  await expect(dialog(page)).toBeVisible();
  await commentToggle(page, "a").click();
  expect(await focusedComment(page)).toEqual({ tag: "textarea", comment: "a", toggle: null });
  await commentToggle(page, "a").focus();
  await page.keyboard.press("Enter"); // キーで閉じる
  await expect(commentBox(page, "a")).toBeHidden();
  expect(await focusedComment(page)).toEqual({ tag: "button", comment: null, toggle: "a" }); // ボタンに残る
  await page.keyboard.press("Enter"); // もう一度開く
  expect(await focusedComment(page)).toEqual({ tag: "textarea", comment: "a", toggle: null });
  await page.keyboard.press("Escape");
  await run.done;
});

test("目次・Alt+PageDown・未回答への移動で着く先は、自由記述の欄ではなく、その質問の入力（ラジオ）（AC-I4）", async ({ page, appServer }) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, {
    paging: true,
    questions: [q("a", { page: "一" }), q("b", { default: undefined }), q("c", { default: undefined })],
  });
  await expect(dialog(page)).toBeVisible();
  await settle(page);
  await expect(page.locator("nav.index")).toBeVisible();
  // 欄を開いて書いた質問を作っておく（開いた欄がある質問へ移っても、欄へ行かない）。
  await commentToggle(page, "b").click();
  await commentBox(page, "b").fill("先に書いた");
  await choice(page, "a", "o1").focus();
  await page.keyboard.press("Alt+PageDown");
  await expect.poll(() => formFocus(page)).toMatchObject({ tag: "input", type: "radio", question: "b" });
  await page.locator('[data-ask-index="c"]').click();
  await expect.poll(() => formFocus(page)).toMatchObject({ tag: "input", type: "radio", question: "c" });
  await page.locator('[data-ask-index="b"]').click();
  await expect.poll(() => formFocus(page)).toMatchObject({ tag: "input", type: "radio", question: "b" });
  expect(await focusedComment(page)).toMatchObject({ tag: "input" }); // textarea（自由記述の欄）ではない
  // 未回答のまま決定 → 最初の未回答の質問（b）の入力へ。欄にフォーカスがあるまま決定しても、欄に残らない。
  await commentBox(page, "b").focus();
  await page.keyboard.press("Control+Enter");
  await expect.poll(() => formFocus(page)).toMatchObject({ tag: "input", type: "radio", question: "b" });
  expect(sent(page).answers()).toBe(0);
  await page.keyboard.press("Escape");
  await run.done;
});

test("高さ: 上限に達していないフォームで欄を開くと増え、閉じると戻る。絞り込みの入力・表示条件の出し入れでは変わらない（AC-I5）", async ({ page, appServer }) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, {
    note: false,
    questions: [
      q("a", { options: [{ value: "x", label: "X" }, { value: "y", label: "Y" }], default: "y", filter: true }), // 絞り込みの欄が出る（filter: true）
      q("b", { showIf: { a: "y" } }),
    ],
  });
  await expect(dialog(page)).toBeVisible();
  await settle(page);
  const base = await dialogHeight(page);
  expect(base, "上限で頭打ちではない").toBeLessThan(page.viewportSize()!.height - 16 - 100);
  await commentToggle(page, "a").click();
  await expect.poll(() => dialogHeight(page), { message: "欄を開くとダイアログの高さが増える" }).toBeGreaterThan(base + 20);
  const opened = await dialogHeight(page);
  await commentToggle(page, "a").click();
  await expect.poll(() => dialogHeight(page), { message: "閉じると元の高さへ戻る" }).toBeLessThan(base + 1);
  expect(Math.abs((await dialogHeight(page)) - base)).toBeLessThanOrEqual(1);
  expect(opened).toBeGreaterThan(base);
  // 既存の動きは変えない: 絞り込みで選択肢が減っても、表示条件で質問が隠れても、高さは変わらない。
  await page.locator("input[type=search]").fill("X"); // 2 択が 1 択に絞られる
  await settle(page);
  expect(Math.abs((await dialogHeight(page)) - base), "絞り込みでは高さが変わらない").toBeLessThanOrEqual(1);
  await choice(page, "a", "x").check();
  await expect(page.locator('[data-ask-question="b"]')).toBeHidden();
  await settle(page);
  expect(Math.abs((await dialogHeight(page)) - base), "表示条件の出し入れでは高さが変わらない").toBeLessThanOrEqual(1);
  await page.keyboard.press("Escape");
  await run.done;
});

test("高さ: 上限に達しているフォームでは、ダイアログは画面からはみ出さず、開いた欄が見える位置までスクロールする（AC-I5）", async ({ page, appServer }) => {
  const p1 = await setup(page, appServer);
  const questions = Array.from({ length: 8 }, (_, i) => q(`m${i + 1}`, { options: opts(6) }));
  const run = await runAsk(appServer, p1, { paging: false, questions });
  await expect(dialog(page)).toBeVisible();
  await settle(page);
  const vh = page.viewportSize()!.height;
  const box0 = (await dialog(page).boundingBox())!;
  expect(box0.y + box0.height, "上限に達している（画面いっぱい）").toBeGreaterThan(vh - 40);
  // 対照: 一番下の質問のボタンを本文の下端へ寄せてから開く。欄は開いた分だけ下へ伸びるので、欄を見える位置へ動かすものが無ければ本文の外に出る
  // （上限に達したフォームでは、部品が欄を開いたときに `ta.focus()` で見える位置へ動かす。その結果を見る）。
  await commentToggle(page, "m8").scrollIntoViewIfNeeded();
  await page.locator("ask-form").evaluate((f) => { const b = f.shadowRoot!.querySelector(".body")!; b.scrollTop = b.scrollHeight; });
  expect(await commentToggle(page, "m8").evaluate((el) => {
    const body = (el.getRootNode() as ShadowRoot).querySelector(".body")!.getBoundingClientRect();
    return el.getBoundingClientRect().bottom <= body.bottom + 1;
  }), "開く前: ボタンは本文の見える範囲にある").toBe(true);
  await commentToggle(page, "m8").click();
  await expect(commentBox(page, "m8")).toBeVisible();
  const box = (await dialog(page).boundingBox())!;
  expect(Math.abs(box.height - box0.height), "上限に達しているので、開いてもダイアログの高さは増えない").toBeLessThanOrEqual(1);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, "ダイアログは画面からはみ出さない").toBeLessThanOrEqual(vh + 1);
  await expect.poll(() => commentBox(page, "m8").evaluate((el) => {
    const r = el.getBoundingClientRect();
    const body = el.getRootNode() instanceof ShadowRoot ? (el.getRootNode() as ShadowRoot).querySelector(".body")!.getBoundingClientRect() : null;
    return !!body && r.top >= body.top - 1 && r.bottom <= body.bottom + 1;
  }), { message: "開いた欄が本文の見える範囲にある" }).toBe(true);
  expect(await inBody(page, "m8")).toBe(true);
  await page.keyboard.press("Escape");
  await run.done;
});

test("欄にフォーカスがある間のキー・ホイールが、端末の pane へ漏れない（AC-I5）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  const sentInput = await watchSentInput(page);
  const subs = await watchAskSubscriptions(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await subs.waitFor(1);
  await focusTerminal(page);
  // pane のアプリにマウスの報告を求めさせる（DECSET 1000。端末へのホイールは `^[[<64;…M`・`^[[<65;…M` の報告になる）。
  await typeLine(page, "printf '\\e[?1000h\\e[?1006h'; cat -v");
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 100 });
  await page.waitForTimeout(500);
  const wheelReports = () => sentInput().filter((i) => i.paneId === p1 && (i.text.includes("\x1b[<64;") || i.text.includes("\x1b[<65;"))).length;
  const xterm = (await page.locator(".xterm-screen").first().boundingBox())!;
  await page.mouse.move(xterm.x + xterm.width / 2, xterm.y + xterm.height / 2);
  await page.mouse.wheel(0, -300);
  // pane のアプリがマウスの報告を有効にするまでの間は報告にならないので、届くまでホイールを送り直す。
  await expect
    .poll(async () => { await page.mouse.wheel(0, -300); return wheelReports(); }, { message: "対照: ダイアログが無ければ端末へホイールの報告が届く" })
    .toBeGreaterThan(0);

  const run = await runAsk(appServer, p1, { questions: [q("a"), q("b")] });
  await expect(dialog(page)).toBeVisible();
  await commentToggle(page, "a").click();
  await expect(commentBox(page, "a")).toBeFocused();
  const before = sentInput().length;
  const wheelBefore = wheelReports();
  await page.keyboard.type("x");
  await page.keyboard.press("Control+b");
  await page.keyboard.type("c"); // prefix+c が漏れていれば新しい tab の名前の入力が開く
  await page.keyboard.press("Control+v");
  const d = (await commentBox(page, "a").boundingBox())!;
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2); // 欄の上
  await page.mouse.wheel(0, -600);
  await page.mouse.wheel(0, 600);
  // 「届いていない」は起きないことの観測なので、少しの猶予（400ms）の後に読む。キーが欄に入ったこと（値が "xc"）を、キーが処理された印にする。
  await page.waitForTimeout(400);
  await expect(commentBox(page, "a")).toHaveValue("xc"); // キーは欄が受けた
  expect(sentInput().slice(before).filter((i) => i.paneId === p1 && [...i.text].some((ch) => "xc\x02\x16".includes(ch)))).toEqual([]);
  expect(wheelReports()).toBe(wheelBefore);
  await expect(page.locator("dialog.name-dialog[open]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await run.done;
});
