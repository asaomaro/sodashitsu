import { expect, test } from "../support/fixtures.js";
import { runAsk } from "../support/ask.js";
import { choice, commentBox, commentToggle, dialog, q, sent, setup, submitForm as submit } from "../support/askForm.js";

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
