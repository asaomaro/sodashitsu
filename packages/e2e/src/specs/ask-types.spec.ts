import { expect, test } from "../support/fixtures.js";
import { runAsk } from "../support/ask.js";
import { dialog, question, setup } from "../support/askForm.js";
import { makeMediaDir, makePng } from "../support/media.js";

/**
 * `edit`・`rank`・`table`（20261004-ask-media-popup の AC6・AC7）の E2E。ビルドした `sodactl` を子プロセスで起動し、ブラウザで部品を操作して、
 * `sodactl` の標準出力の JSON（回答の形）で合否を見る（`e2e-observe-browser`）。
 */

const SPEC = {
  title: "設計の確認",
  questions: [
    { id: "plan", label: "進め方の案", type: "edit", text: "1. 定義を書く\n2. 渡す\n" },
    {
      id: "prio",
      label: "優先順位",
      type: "rank",
      options: [
        { value: "speed", label: "速さ" },
        { value: "quality", label: "品質" },
        { value: "cost", label: "費用" },
      ],
    },
    {
      id: "sec",
      label: "節ごと",
      type: "table",
      rowLabel: "節",
      pickLabel: "判断",
      options: ["ok", "ng"],
      default: "ok",
      rows: ["導入", { value: "手順", default: "ng" }],
    },
  ],
};

test("edit・rank・table を画面内で操作して決定すると、回答の形（文字列・並べた配列・{行: 値}）と edited が sodactl の結果に載る（AC6）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, SPEC);
  await expect(dialog(page)).toBeVisible();
  // 何も触らずに決定すると、既定の回答（edited なし）。
  await expect(question(page, "plan").locator(`textarea[name="plan"]`)).toHaveValue(
    "1. 定義を書く\n2. 渡す\n",
  );
  // 直す: 文面を書き換える。並べ替え: 先頭を 1 つ下へ。表: 1 行目を ng にする。
  await question(page, "plan")
    .locator(`textarea[name="plan"]`)
    .fill("1. 定義を書く\n2. 渡す\n3. 結果を読む\n\n");
  await question(page, "prio").locator('li button[aria-label="下へ"]').first().click();
  await question(page, "sec").locator('label:has(input[name="sec/導入"][value="ng"])').click();
  await page.keyboard.press("Control+Enter");
  const r = await run.done;
  expect(r.json).toEqual({
    status: "answered",
    answers: {
      plan: "1. 定義を書く\n2. 渡す\n3. 結果を読む",
      prio: ["quality", "speed", "cost"],
      sec: { 導入: "ng", 手順: "ng" },
    },
    edited: ["plan"],
  });
  await expect(dialog(page)).toHaveCount(0);
});

test("触らずに決定すると既定の回答で、edited は付かない（rank は定義の順・table は行の default → 質問の default）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, SPEC);
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("Control+Enter");
  expect((await run.done).json).toEqual({
    status: "answered",
    answers: {
      plan: "1. 定義を書く\n2. 渡す",
      prio: ["speed", "quality", "cost"],
      sec: { 導入: "ok", 手順: "ng" },
    },
  });
});

test("rank はキーボードだけで並べ替えられる（↓）。必須の edit を空にすると決定できず未回答が示される", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, SPEC);
  await expect(dialog(page)).toBeVisible();
  await question(page, "plan").locator(`textarea[name="plan"]`).fill("");
  await page.keyboard.press("Control+Enter");
  await expect(question(page, "plan")).toHaveAttribute("aria-invalid", "true"); // 決定されず、その質問が未回答として示される
  expect(run.finished()).toBe(false);
  await question(page, "plan").locator(`textarea[name="plan"]`).fill("直した");
  const first = question(page, "prio").locator("li").first();
  await first.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Control+Enter");
  expect((await run.done).json).toMatchObject({
    status: "answered",
    answers: { plan: "直した", prio: ["quality", "speed", "cost"] },
    edited: ["plan"],
  });
});

test("画像付きの質問と edit・rank・table が 1 つのフォームに混ざっても、画面内に出る（窓に落ちる条件が無い。AC7）", async ({
  page,
  appServer,
}) => {
  const media = await makeMediaDir();
  try {
    const p1 = await setup(page, appServer);
    const png = await media.write("a.png", makePng(40, 30));
    const run = await runAsk(appServer, p1, {
      questions: [
        {
          id: "img",
          label: "案",
          default: "a",
          options: [
            { value: "a", label: "A", image: png },
            { value: "b", label: "B" },
          ],
        },
        ...SPEC.questions,
      ],
    });
    await expect(dialog(page)).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator("ask-form")
          .evaluate(
            (f) =>
              Array.from(f.shadowRoot!.querySelectorAll("img")).filter((i) => i.naturalWidth === 40)
                .length,
          ),
      )
      .toBeGreaterThanOrEqual(1);
    for (const id of ["plan", "prio", "sec"]) await expect(question(page, id)).toBeVisible();
    await page.keyboard.press("Control+Enter");
    const r = await run.done;
    expect(r.code).toBe(0);
    expect(r.json).toMatchObject({ status: "answered", answers: { img: "a" } });
  } finally {
    await media.cleanup();
  }
});

test("サーバは回答を検査する: 並べ替えでない rank・行が足りない table の回答は invalid_params で断る（質問は開いたまま）（AC6）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, SPEC);
  await expect(dialog(page)).toBeVisible();
  const ws = await appServer.openClient("desktop");
  await ws.request("ask.subscribe", {});
  const { asks } = (await ws.request("ask.subscribe", {})) as { asks: { askId: string }[] };
  const askId = asks[0]!.askId;
  const bad = (answers: unknown) => ws.request("ask.answer", { askId, answers: answers as never });
  const rejected = async (answers: unknown): Promise<string> =>
    bad(answers).then(
      () => "accepted",
      (e: Error) => e.message,
    );
  const ok = { plan: "x", prio: ["speed", "quality", "cost"], sec: { 導入: "ok", 手順: "ng" } };
  expect(await rejected({ ...ok, prio: ["speed", "quality"] })).toMatch(/invalid_params/);
  expect(await rejected({ ...ok, prio: ["speed", "speed", "cost"] })).toMatch(/invalid_params/);
  expect(await rejected({ ...ok, sec: { 導入: "ok" } })).toMatch(/invalid_params/);
  expect(await rejected({ ...ok, sec: { 導入: "ok", 手順: "zzz" } })).toMatch(/invalid_params/);
  expect(run.finished()).toBe(false);
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  expect((await run.done).json).toEqual({ status: "cancelled" });
});
