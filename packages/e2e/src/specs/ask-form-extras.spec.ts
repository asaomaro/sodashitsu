import type { Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { runAsk } from "../support/ask.js";
import { dialog, opts, q, question, sent, setup as setupBase } from "../support/askForm.js";
import { watchReceivedEvents } from "../support/frames.js";
import { focusTerminal, prefixKey } from "../support/keys.js";

/**
 * 質問のフォーム（`sodactl ask`）の、テーマ・絞り込み・`showValue`・安全・定義の誤り・特別な値（20261003-ask-form-component の AC7・AC10・AC11・AC16・AC-I2）の E2E。
 * ビルドした `sodactl` を子プロセスで起動し、合否はブラウザの側で見る（`e2e-observe-browser`）: 計算済みのスタイル（`getComputedStyle`）・ダイアログの DOM
 * （Shadow DOM の中を含む）・ブラウザの `securitypolicyviolation`・`sodactl` の stdout と終了コード。
 * テストのクライアントに届いた `ask.opened` を、ブラウザにダイアログが出た合図にしない（出るまで DOM で待つ）。
 */

/** ページごとの、ブラウザが受けた JSON のイベント（`setup` が `goto` の前に張る）。 */
const receivedOf = new WeakMap<Page, () => { event: string }[]>();

/** ブラウザを開き、pane の id を返す。受けたイベントも記録する（`receivedOf`）。 */
const setup = (page: Page, appServer: AppServer): Promise<string> =>
  setupBase(page, appServer, async (p) => {
    receivedOf.set(p, await watchReceivedEvents(p));
  });

// --- テーマ（AC7） ----------------------------------------------------------------------------------------------------

function hexToRgb(hex: string): string {
  const h = hex.trim();
  const m = /^#([0-9a-f]{6})$/i.exec(h);
  if (!m) throw new Error(`#rrggbb でない: ${h}`);
  const n = parseInt(m[1]!, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

interface Painted {
  vars: { bg: string; fg: string; border: string; accent: string };
  painted: { bg: string; fg: string; border: string; accent: string };
}

/**
 * いま出ているダイアログの部品の色と、画面（`<html>`）のテーマの変数を読む。
 * 部品の地・文字は `<ask-form>` の `background-color`・`color`、質問の枠は `fieldset` の `border-top-color`、選択中の選択肢の枠は
 * `label.opt` のうち中のラジオが選ばれているものの `border-top-color`（どれも計算済みの値。Shadow DOM の中は `shadowRoot` から探す）。
 */
async function readColors(page: Page): Promise<Painted> {
  return page.locator("ask-form").evaluate((form) => {
    const root = getComputedStyle(document.documentElement);
    const inner = form.shadowRoot!;
    const checked = Array.from(inner.querySelectorAll("label.opt")).find(
      (l) => (l.querySelector("input") as HTMLInputElement | null)?.checked,
    );
    const fs = inner.querySelector("fieldset")!;
    return {
      vars: {
        bg: root.getPropertyValue("--soda-menu-bg"),
        fg: root.getPropertyValue("--soda-fg"),
        border: root.getPropertyValue("--soda-menu-border"),
        accent: root.getPropertyValue("--soda-accent"),
      },
      painted: {
        bg: getComputedStyle(form).backgroundColor,
        fg: getComputedStyle(form).color,
        border: getComputedStyle(fs).borderTopColor,
        accent: getComputedStyle(checked!).borderTopColor,
      },
    };
  });
}

test("テーマを切り替えると、部品の地・文字・質問の枠・選択中の選択肢の枠が、そのテーマの --soda-menu-bg・--soda-fg・--soda-menu-border・--soda-accent の色になる（AC7）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const settings = page.locator("dialog.settings-dialog");
  const themeSelect = settings.locator('section[aria-labelledby="settings-theme"] select').first();
  const seen: Record<string, Painted> = {};
  // 暗いテーマ（dracula）→ 明るいテーマ（catppuccin-latte）→ 別の暗いテーマ（nord）。設定のダイアログで実際に切り替える。
  for (const theme of ["dracula", "catppuccin-latte", "nord"]) {
    await focusTerminal(page);
    await prefixKey(page, "s");
    await expect(settings).toHaveAttribute("open", "");
    await themeSelect.selectOption(theme);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset["theme"] ?? null))
      .toBe(theme);
    await page.keyboard.press("Escape");
    await expect(settings).not.toHaveAttribute("open", "");
    const run = await runAsk(appServer, p1, { note: false, questions: [q("a"), q("b")] }); // 質問が 2 つなので即確定ではない
    await expect(dialog(page)).toBeVisible();
    const c = await readColors(page);
    seen[theme] = c;
    // 部品の色 = そのテーマの変数の色。
    expect(c.painted, theme).toEqual({
      bg: hexToRgb(c.vars.bg),
      fg: hexToRgb(c.vars.fg),
      border: hexToRgb(c.vars.border),
      accent: hexToRgb(c.vars.accent),
    });
    await page.keyboard.press("Escape");
    expect((await run.done).json).toEqual({ status: "cancelled" });
    await expect(dialog(page)).toHaveCount(0);
  }
  // 色が実際に替わっている（この観測が区別できる）: 地・文字は暗い／明るいで違い、4 つの色はテーマごとに違う組になる。
  expect(seen["dracula"]!.painted.bg).not.toBe(seen["catppuccin-latte"]!.painted.bg);
  expect(seen["dracula"]!.painted.fg).not.toBe(seen["catppuccin-latte"]!.painted.fg);
  expect(seen["dracula"]!.painted.border).not.toBe(seen["catppuccin-latte"]!.painted.border);
  expect(seen["dracula"]!.painted.accent).not.toBe(seen["catppuccin-latte"]!.painted.accent);
  expect(seen["nord"]!.painted.bg).not.toBe(seen["dracula"]!.painted.bg);
  expect(seen["nord"]!.painted.accent).not.toBe(seen["dracula"]!.painted.accent);
});

// --- 絞り込み・showValue（AC16・AC-I2） -------------------------------------------------------------------------------

test("絞り込みの欄: 選択肢が 13 件で出る。filter: false で出ない。12 件未満では出ず、filter: true で出る（AC16）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const search = page.locator("dialog#soda-ask-dialog input[type=search]");
  const cases: { name: string; q: Record<string, unknown>; count: number }[] = [
    { name: "13 件", q: { options: opts(13) }, count: 1 },
    { name: "13 件で filter: false", q: { options: opts(13), filter: false }, count: 0 },
    { name: "対照: 11 件", q: { options: opts(11) }, count: 0 },
    { name: "11 件で filter: true", q: { options: opts(11), filter: true }, count: 1 },
  ];
  for (const c of cases) {
    const run = await runAsk(appServer, p1, { note: false, questions: [q("a", c.q), q("b")] });
    await expect(dialog(page)).toBeVisible();
    await expect(question(page, "a")).toBeVisible();
    expect(await search.count(), c.name).toBe(c.count);
    await page.keyboard.press("Escape");
    await run.done;
    await expect(dialog(page)).toHaveCount(0);
  }
});

test("絞り込みの欄に文字があるときの Esc は絞り込みを消すだけで取り消さない。欄が空のときの Esc は取り消す（AC-I2）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const run = await runAsk(appServer, p1, { questions: [q("a", { options: opts(13) })] });
  await expect(dialog(page)).toBeVisible();
  const search = page.locator('[data-ask-question="a"] input[type=search]');
  const count = page.locator('[data-ask-question="a"] .cnt');
  await search.fill("選択肢1");
  await expect(search).toBeFocused();
  await expect(count).toHaveText("5 / 13 件"); // 選択肢1・10〜13
  await page.keyboard.press("Escape");
  await expect(search).toHaveValue(""); // 絞り込みが消えた
  await expect(count).toHaveText("13 件");
  await expect(dialog(page)).toBeVisible(); // ダイアログは開いたまま
  // 取り消しも決定も送られていない（ブラウザが送った ask.cancel・ask.answer が 0 件）。sodactl も終わっていない。
  expect(sent(page).cancels()).toBe(0);
  expect(sent(page).answers()).toBe(0);
  expect(run.finished()).toBe(false);
  await expect(search).toBeFocused();
  await page.keyboard.press("Escape"); // 欄が空なので、今度は取り消し
  const r = await run.done;
  expect(sent(page).cancels()).toBe(1); // 欄が空の Esc で初めて取り消しが送られる
  expect(sent(page).answers()).toBe(0);
  expect(r.code).toBe(0);
  expect(r.json).toEqual({ status: "cancelled" });
  await expect(dialog(page)).toHaveCount(0);
});

test("showValue: false で、表示名と値が違う選択肢に値が出ない（既定では値が出る）（AC16）", async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const options = [
    { value: "v-one", label: "いち" },
    { value: "v-two", label: "に" },
  ];
  const run = await runAsk(appServer, p1, {
    note: false,
    questions: [
      q("shown", { options, default: "v-one" }),
      q("hidden", { options, default: "v-one", showValue: false }),
    ],
  });
  await expect(dialog(page)).toBeVisible();
  // 既定（対照）: 表示名の横に値が出る。
  await expect(question(page, "shown").locator("label.opt .key")).toHaveText(["v-one", "v-two"]);
  await expect(question(page, "shown").locator("label.opt").first()).toContainText("v-one");
  // showValue: false: 値は出ない（表示名だけ）。
  await expect(question(page, "hidden").locator("label.opt .name")).toHaveText(["いち", "に"]);
  expect(await question(page, "hidden").locator("label.opt .key").count()).toBe(0);
  await expect(question(page, "hidden").locator("label.opt").first()).not.toContainText("v-one");
  await page.keyboard.press("Escape");
  await run.done;
});

// --- 安全（AC10） -----------------------------------------------------------------------------------------------------

test("題・説明・質問・選択肢・ページの題・決定ボタンの HTML は文字として出て、script・img も実行も CSP 違反も無い（AC10）", async ({
  page,
  appServer,
}) => {
  // 観測のしかた: ページの `securitypolicyviolation`（サーバの CSP は `default-src 'self'; img-src 'self' data:`。外への読み込み・インラインの script は違反になる）を
  // `addInitScript` で置いたリスナーで数える。window の印（`__askXss`）は、`onerror`・`<script>` が走ったかを見る。DOM は `script`・`img` の有無（Shadow DOM の中を含む）と、
  // 部品の中の `style` が 1 つだけ（`</style>` で閉じられて崩れていない）ことを見る。リスナーが効くことは、最後に外への画像を足して違反が数えられる対照で確かめる。
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener(
      "securitypolicyviolation",
      (e) => void w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  const p1 = await setup(page, appServer);
  // 画面を開いた時点で、アプリ自身が出している違反（`script-src eval`・`wasm-eval`。端末の描画の部品）が既にある。フォームを出してからの増えた分を数える。
  const csp = () => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
  const baseline = (await csp()).length;
  const evil = (n: number) =>
    `<img src=x onerror="window.__askXss=${n}"><script>window.__askXss=${n}</script></style><b>太字${n}</b>`;
  const run = await runAsk(appServer, p1, {
    title: evil(1),
    intro: evil(2),
    submit: evil(3),
    note: evil(4),
    questions: [
      {
        id: "q1",
        label: evil(5),
        help: evil(6),
        page: evil(7),
        default: "o1",
        options: [
          { value: "o1", label: evil(8), desc: evil(9) },
          { value: "o2", label: "ふつう" },
        ],
      },
      {
        id: "q2",
        label: evil(10),
        help: evil(11),
        page: evil(12),
        default: "o1",
        options: [
          { value: "o1", label: evil(13), desc: evil(14) },
          { value: "o2", label: "ふつう" },
        ],
      },
    ],
  });
  await expect(dialog(page)).toBeVisible();
  // 1 ページ目（題・説明・質問・help・選択肢・説明・ページの題）が、タグのまま文字として出ている。
  await expect(page.locator("[data-ask-title]")).toHaveText(evil(1));
  await expect(page.locator("ask-form .intro")).toHaveText(evil(2));
  await expect(page.locator('[data-ask-question="q1"] legend')).toContainText(evil(5));
  await expect(page.locator('[data-ask-question="q1"] .help')).toHaveText(evil(6));
  await expect(page.locator('[data-ask-question="q1"] label.opt .name').first()).toHaveText(
    evil(8),
  );
  await expect(page.locator('[data-ask-question="q1"] label.opt .desc').first()).toHaveText(
    evil(9),
  );
  await expect(page.locator("[data-ask-page]:visible")).toHaveCount(2);
  await expect(page.locator("[data-ask-page]:visible").nth(0)).toContainText(evil(7));
  await expect(page.locator("[data-ask-page]:visible").nth(1)).toContainText(evil(12));
  await expect(page.locator("[data-ask-submit]")).toContainText(evil(3)); // 末尾にキーの案内（Ctrl+Enter）が付く
  // 2 ページ目。
  await page.locator("[data-ask-next]").click();
  await expect(page.locator('[data-ask-question="q2"] legend')).toContainText(evil(10));
  await expect(page.locator('[data-ask-question="q2"] .help')).toHaveText(evil(11));
  await expect(page.locator('[data-ask-question="q2"] label.opt .name').first()).toHaveText(
    evil(13),
  );
  await expect(page.locator('[data-ask-question="q2"] label.opt .desc').first()).toHaveText(
    evil(14),
  );
  await expect(page.locator("textarea[aria-label=補足]")).toHaveAttribute("placeholder", evil(4)); // 補足の案内（属性）も文字のまま
  // script も、src を持つ img も無い（ロケータは Shadow DOM の中も数える。ほかの質問・ページの分も DOM にある）。部品の中の style は 1 つだけ。
  expect(await page.locator("dialog#soda-ask-dialog script").count()).toBe(0);
  expect(await page.locator("dialog#soda-ask-dialog img[src]").count()).toBe(0);
  expect(
    await page.locator("ask-form").evaluate((f) => ({
      script: f.shadowRoot!.querySelectorAll("script").length,
      img: f.shadowRoot!.querySelectorAll("img").length,
      style: f.shadowRoot!.querySelectorAll("style").length,
    })),
  ).toEqual({ script: 0, img: 0, style: 1 });
  expect(
    await page.evaluate(() => (window as unknown as { __askXss?: number }).__askXss),
  ).toBeUndefined();
  // 決定して答える間も、違反は無い。
  await page.keyboard.press("Control+Enter");
  const r = await run.done;
  expect(r.json).toEqual({ status: "answered", answers: { q1: "o1", q2: "o1" } });
  await expect(dialog(page)).toHaveCount(0);
  expect((await csp()).slice(baseline)).toEqual([]);
  expect(
    await page.evaluate(() => (window as unknown as { __askXss?: number }).__askXss),
  ).toBeUndefined();
  // 対照: 外への画像を足すと、違反が数えられる（上の 0 が「数えられない」ではない）。
  await page.evaluate(() => {
    const img = document.createElement("img");
    img.src = "https://example.invalid/x.png";
    document.body.append(img);
  });
  await expect
    .poll(async () => (await csp()).slice(baseline))
    .toEqual([expect.stringContaining("img-src")]);
});

// --- 定義の誤り・特別な値（AC11・AC-I2） ------------------------------------------------------------------------------

test('paging: "many" の定義は終了コード 2 で、ダイアログは出ない（AC11）', async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const bad = await (await runAsk(appServer, p1, { paging: "many", questions: [q("a")] })).done;
  expect(bad.code).toBe(2);
  expect(bad.stderr).toContain("invalid ask spec");
  expect(bad.stdout).toBe("");
  await expect(dialog(page)).toHaveCount(0);
  // ブラウザへ質問が届いていない: ブラウザが受けた ask.opened のフレームが 0 件（イベントは質問を開いたときに全接続へ配られる）。
  expect(receivedOf.get(page)!().filter((e) => e.event === "ask.opened")).toEqual([]);
  // 対照: 同じ定義で paging が "auto" なら出る（誤りは paging の値だけ）。
  const ok = await runAsk(appServer, p1, { paging: "auto", questions: [q("a"), q("b")] });
  await expect(dialog(page)).toBeVisible();
  await expect
    .poll(() => receivedOf.get(page)!().filter((e) => e.event === "ask.opened").length)
    .toBe(1); // 対照: 正しい定義ならブラウザが ask.opened を受ける（上の 0 件が「数えられない」ではない）
  await page.keyboard.press("Escape");
  await ok.done;
});

test('値が __other__・空文字の選択肢が選べて、結果の JSON にその値が入る（single は "a": ""・multi は [""]）。「その他」と取り違えない（AC-I2）', async ({
  page,
  appServer,
}) => {
  const p1 = await setup(page, appServer);
  const options = [
    { value: "__other__", label: "アザー" },
    { value: "", label: "空" },
    { value: "x", label: "エックス" },
  ];
  const pick = (id: string, label: string) =>
    question(page, id).locator("label.opt", { hasText: label }).locator("input");
  // __other__ を選ぶ（single）・空文字を multi で選ぶ。
  const first = await runAsk(appServer, p1, {
    note: false,
    questions: [
      { id: "a", label: "A", options },
      { id: "m", label: "M", type: "multi", options },
    ],
  });
  await expect(dialog(page)).toBeVisible();
  await pick("a", "アザー").check();
  await pick("m", "空").check();
  await page.keyboard.press("Control+Enter");
  expect((await first.done).json).toEqual({
    status: "answered",
    answers: { a: "__other__", m: [""] },
  });
  await expect(dialog(page)).toHaveCount(0);
  // 空文字を single で選ぶ。
  const second = await runAsk(appServer, p1, {
    note: false,
    questions: [{ id: "a", label: "A", options }, q("b")],
  });
  await expect(dialog(page)).toBeVisible();
  await pick("a", "空").check();
  await page.keyboard.press("Control+Enter");
  expect((await second.done).json).toEqual({ status: "answered", answers: { a: "", b: "o1" } });
  await expect(dialog(page)).toHaveCount(0);
  // 「その他」(allowOther) と併存しても、値 __other__ の選択肢を選んだ答えは __other__ で、自由入力（custom）にならない。
  const third = await runAsk(appServer, p1, {
    note: false,
    questions: [{ id: "a", label: "A", allowOther: true, options }, q("b")],
  });
  await expect(dialog(page)).toBeVisible();
  await pick("a", "アザー").check();
  await expect(question(page, "a").locator("input[data-other]")).not.toBeChecked();
  await page.keyboard.press("Control+Enter");
  expect((await third.done).json).toEqual({
    status: "answered",
    answers: { a: "__other__", b: "o1" },
  });
  await expect(dialog(page)).toHaveCount(0);
});
