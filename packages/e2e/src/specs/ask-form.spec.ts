import type { BrowserContext, Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { askFixture, runAsk, runAskWithoutLogin } from "../support/ask.js";
import { dialog, indexItems, openBrowser, settle, shownQuestions } from "../support/askForm.js";
import { watchReceivedFrames, watchSentInput } from "../support/frames.js";
import { focusTerminal, prefixKey, typeLine } from "../support/keys.js";

/**
 * 質問のフォーム（`sodactl ask`。20261002-sodactl-ask）の E2E。ビルドした `sodactl` を子プロセスで起動し（pane の中と同じ環境変数）、
 * 合否はブラウザの側で見る（`e2e-observe-browser`）: ダイアログの DOM・フォーカス・ブラウザが送った INPUT（CDP）・`sodactl` の stdout と終了コード。
 * テストのクライアントに届いた `ask.opened` を、ブラウザにダイアログが出た合図にしない（出るまで DOM で待つ）。
 *
 * ダイアログは枠（`AskDialog.vue`。固定の行 `[data-ask-origin]`）と、中身を描く部品 `<ask-form>`（Shadow DOM。20261003-ask-form-component）でできている。
 * - Playwright の CSS ロケータは open の Shadow DOM を越える（`[data-ask-title]`・`label.opt`・`input[...]` は部品の中に届く）。`evaluate` の中の
 *   `querySelector` は越えないので、部品の中は `shadowRoot` から探す。
 * - 部品（1.2.1）は質問を 1 枚に並べ、与えられた高さに収まらない定義には左に**質問の目次**（`nav.index`・項目は `[data-ask-index]`）を出す。表示条件で隠れた質問も DOM に残るので、
 *   出ている質問は見え方（`:visible`）で絞る。補足欄は最後。`Tab` の最初の行き先は、目次が出ていれば目次の項目。目次の出し分けは `ask-form-index.spec.ts`。
 * - この spec の画面（1280×720）での出方（確かめた値）: `SPEC`（3 問）は目次が出ない（収まる）。確かめ用の定義（7 問）は目次が出る（テーマの 13 件だけで高さを超える）。`SPEC` の件は目次の有無を決め打ちにしない。
 */

// `SPEC` は、この画面（1280×720）では 1 枚に収まり、目次は出ない（部品 1.2.1 で確かめた値。以前のページ分けでは 2 ページに分かれていた）。回答の JSON の期待は目次が出ても出なくても同じで、
// 件の意図は回答・キー・フォーカスの確認なので、`SPEC` を目次が出る側へ変えず、目次の有無を決め打ちにしない書き方にしてある（出し分けは `ask-form-index.spec.ts`）。
const SPEC = {
  title: "配布先",
  questions: [
    { id: "channel", label: "チャンネル", default: "beta", options: [{ value: "beta", label: "ベータ", recommended: true }, { value: "stable", label: "安定版" }], allowOther: true },
    { id: "rollout", label: "段階", showIf: { channel: "stable" }, default: "10", options: ["10", "100"] },
    { id: "notes", label: "告知", type: "multi", options: ["changelog", "blog", "mail"], default: ["changelog"], help: "告知の経路は複数選べます。変更履歴だけでよい場合は、そのままにしてください。メールは配布の直前にまとめて送ります。" },
  ],
};

/** 固定の行（どの pane からの質問か）の文言の形。 */
const ORIGIN_LINE = /^pane「.+」.*のプログラムからの質問$/;

/** 固定の行（枠）が、部品の題（定義の title）より上にある。 */
async function expectOriginAboveTitle(page: Page): Promise<void> {
  const originBox = (await page.locator("[data-ask-origin]").boundingBox())!;
  const titleBox = (await page.locator("[data-ask-title]").boundingBox())!;
  expect(originBox.y + originBox.height).toBeLessThanOrEqual(titleBox.y);
}

/** これから新しいページ（タブ・ウィンドウ）が開かないことを見張る（見張り始めの後に開いた数を返す）。 */
function watchNewPages(context: BrowserContext): () => number {
  let n = 0;
  context.on("page", () => void n++);
  return () => n;
}

test("別のタブ・ウィンドウを開かず、画面の上にダイアログが出て、決定で結果の 1 行（answered・終了コード 0）が返る（AC1・AC2）", async ({ page, context, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  const newPages = watchNewPages(context);
  await openBrowser(page, appServer);
  const run = await runAsk(appServer, p1, SPEC);
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator("[data-ask-origin]")).toContainText("のプログラムからの質問"); // どの pane からか（AC11）
  await expect(page.locator("[data-ask-origin]")).toBeFocused(); // 開いたらフォーカスは見出し（AC-I4）
  await expect(page.locator("[data-ask-title]")).toHaveText("配布先");
  await page.locator("[data-ask-submit]").click();
  const r = await run.done;
  expect(r.code).toBe(0);
  expect(r.json).toEqual({ status: "answered", answers: { channel: "beta", notes: ["changelog"] } });
  await expect(dialog(page)).toHaveCount(0);
  expect(newPages()).toBe(0);
});

test("確かめ用の定義（7 問・テーマ 13 件・出し分け 2 つ）: showIf・既定・最後の選択肢の選択が、ask-form と同じ結果になる（AC3）", async ({ page, appServer }) => {
  const fixture = await askFixture();
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await openBrowser(page, appServer);
  const run = await runAsk(appServer, p1, fixture);
  await expect(dialog(page)).toBeVisible();
  const themes = fixture.questions[0]!.options;
  expect(themes).toHaveLength(13);
  // この定義は高さに収まらない（テーマの 13 件だけで超える）ので、左に目次が出る。質問は 1 枚に並んだまま、7 つとも DOM にあり、出ている（表示条件を満たす）。
  await expect(page.locator("[data-ask-question]")).toHaveCount(7);
  // 目次を出すかは高さの当て直しの後に決まるので、出るまで待って読む。
  await expect(page.locator("nav.index")).toBeVisible();
  // 7 問が定義の順に出ている（design・motion は条件を満たしているので出ている）。目次の項目も同じ（補足の項目は値が空）。
  const ids = fixture.questions.map((q) => q.id);
  expect(ids).toHaveLength(7);
  await expect.poll(() => shownQuestions(page)).toEqual(ids);
  expect((await indexItems(page)).filter((v) => v !== "")).toEqual(ids);
  // テーマの最後の 1 つ（本文をスクロールして選ぶ）と、mode を print にする（motion が隠れる）。
  const last = page.locator(`input[type=radio][value="${themes[12]!.value}"]`);
  await last.scrollIntoViewIfNeeded();
  await last.check();
  const print = page.locator('input[type=radio][value="print"]');
  await print.scrollIntoViewIfNeeded();
  await print.check();
  await expect.poll(() => shownQuestions(page)).toEqual(ids.filter((id) => id !== "motion"));
  expect((await indexItems(page)).filter((v) => v !== "")).toEqual(ids.filter((id) => id !== "motion")); // 隠れた質問は目次にも出ない
  await expect(page.locator('[data-ask-question="motion"]')).toBeHidden();
  // 決定はどこからでもでき、全部の回答が入る。
  await page.locator("[data-ask-submit]").click();
  const r = await run.done;
  expect(r.code).toBe(0);
  expect(r.json).toEqual({
    status: "answered",
    answers: { theme: themes[12]!.value, mode: "print", toc: "sidebar", layout: "plain", design: "deterministic", "auto-figure": "off" },
  });
});

test("「その他」の自由入力は custom に id が入り、補足は note に入る（AC3）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await openBrowser(page, appServer);
  const run = await runAsk(appServer, p1, SPEC);
  await expect(dialog(page)).toBeVisible();
  await page.locator('[data-ask-question="channel"] label.opt.other input[type=text]').fill("  金曜は避ける  ");
  await expect(page.locator('[data-ask-question="channel"] input[data-other]')).toBeChecked(); // 書くと「その他」が選ばれる
  // 補足欄は最後（本文をスクロールして書く。`fill` が見える所までスクロールする）。
  const note = page.locator("textarea[aria-label=補足]");
  await note.fill("メモです");
  await expect(note).toBeInViewport();
  await page.keyboard.press("Control+Enter"); // フォーカスは補足欄（部品の中）
  const r = await run.done;
  expect(r.json).toEqual({ status: "answered", answers: { channel: "金曜は避ける", notes: ["changelog"] }, custom: ["channel"], note: "メモです" });
});

test("キャンセル（Esc）→ cancelled、時間切れ → timeout、ブラウザなし → unavailable。どれも終了コード 0（AC5）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  // ブラウザが 1 つも居ない
  const none = await (await runAsk(appServer, p1, SPEC)).done;
  expect(none.code).toBe(0);
  expect(none.json).toMatchObject({ status: "unavailable", reason: expect.any(String) });

  await openBrowser(page, appServer);
  const cancelled = await runAsk(appServer, p1, SPEC);
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  const c = await cancelled.done;
  expect(c.code).toBe(0);
  expect(c.json).toEqual({ status: "cancelled" });
  await expect(dialog(page)).toHaveCount(0);

  const timeout = await runAsk(appServer, p1, SPEC, ["--timeout", "1500"]);
  await expect(dialog(page)).toBeVisible();
  const t = await timeout.done;
  expect(t.code).toBe(0);
  expect(t.json).toEqual({ status: "timeout" });
  await expect(dialog(page)).toHaveCount(0); // 時間切れでダイアログが閉じる（AC10）
});

test("定義の誤りは終了コード 2 で何も出さない。pane の外では caller_pane_unknown（AC6）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await openBrowser(page, appServer);
  const bad = await (await runAsk(appServer, p1, { questions: [{ id: "a", label: "A", options: [] }] })).done;
  expect(bad.code).toBe(2);
  expect(bad.stderr).toContain("invalid ask spec");
  await expect(dialog(page)).toHaveCount(0);
  const notJson = await (await runAsk(appServer, p1, "not json")).done;
  expect(notJson.code).toBe(2);
});

test("対応していない型（edit・rank・table）の質問がある定義は、ダイアログを出さず unavailable（終了コード 0）。黙って落とさない（追補）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await openBrowser(page, appServer);
  // 部品はこの 3 つの型も描けるが、sodactl ask は扱わない（回答の形が決まっていない）。
  const unsupported = [
    { id: "e", label: "E", type: "edit", text: "文面" },
    { id: "r", label: "R", type: "rank", options: ["p", "q"] },
    { id: "t", label: "T", type: "table", rows: ["row1"], options: ["p", "q"] },
  ];
  for (const q of unsupported) {
    const r = await (await runAsk(appServer, p1, { questions: [{ id: "a", label: "A", options: ["x"] }, q] })).done;
    expect(r.code, q.type).toBe(0);
    expect(r.json, q.type).toMatchObject({ status: "unavailable", reason: expect.stringContaining(`"${q.type}"`) });
    await expect(dialog(page)).toHaveCount(0);
  }
});

test("同じ pane の 2 つめの質問は ask_busy（終了コード 1）で、前の質問はそのまま（AC13）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await openBrowser(page, appServer);
  const first = await runAsk(appServer, p1, SPEC);
  await expect(dialog(page)).toBeVisible();
  const second = await (await runAsk(appServer, p1, SPEC)).done;
  expect(second.code).toBe(1);
  expect(second.stderr).toContain("ask_busy");
  await expect(dialog(page)).toBeVisible();
  await page.locator("[data-ask-submit]").click();
  expect((await first.done).json).toMatchObject({ status: "answered" });
});

test("2 つのブラウザの両方にダイアログが出て、片方で決定するともう片方が閉じる。結果は 1 つだけ（AC8）", async ({ browser, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  const c1 = await browser.newContext();
  const c2 = await browser.newContext();
  const page1 = await c1.newPage();
  const page2 = await c2.newPage();
  await openBrowser(page1, appServer);
  await openBrowser(page2, appServer);
  const run = await runAsk(appServer, p1, SPEC);
  await expect(dialog(page1)).toBeVisible();
  await expect(dialog(page2)).toBeVisible();
  await page2.locator("input[type=radio][value=stable]").check();
  await page2.locator("[data-ask-submit]").click();
  await expect(dialog(page1)).toHaveCount(0);
  await expect(dialog(page2)).toHaveCount(0);
  const r = await run.done;
  expect(r.json).toMatchObject({ status: "answered", answers: { channel: "stable", rollout: "10" } });
  await c1.close();
  await c2.close();
});

test("回答を待つ間にブラウザを再読み込みすると、同じ質問のダイアログが出し直される（AC9）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  const subs = await openBrowser(page, appServer);
  const run = await runAsk(appServer, p1, SPEC);
  await expect(dialog(page)).toBeVisible();
  await page.reload();
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await subs.waitFor(2);
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator("[data-ask-title]")).toHaveText("配布先");
  await page.locator("[data-ask-submit]").click();
  expect((await run.done).json).toMatchObject({ status: "answered" });
});

test("sodactl を止める（SIGINT）とダイアログが閉じる。サーバが止まっても閉じる（AC10）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await openBrowser(page, appServer);
  const run = await runAsk(appServer, p1, SPEC);
  await expect(dialog(page)).toBeVisible();
  run.child.kill("SIGINT");
  await run.done;
  await expect(dialog(page)).toHaveCount(0);
  // 閉じた後は同じ pane に出し直せる。
  const again = await runAsk(appServer, p1, SPEC);
  await expect(dialog(page)).toBeVisible();
  await appServer.restart();
  await expect(dialog(page)).toHaveCount(0);
  const r = await again.done;
  expect(r.code).toBe(1); // 接続が閉じた（connection_closed）
});

// 20261003-sodactl-ask-socket（AC1・AC4・AC6）。受け口は Unix ドメイン socket なので Windows では走らせない（sodactl も使わない）。
test.describe("ログインなし（token なし・セッションのキャッシュなし）で、pane の受け口（pane.sock）から出す", () => {
  test.skip(process.platform === "win32", "the pane socket is not available on Windows");

  test("ダイアログが出て、最上部に「どの pane からの質問か」が出る。決定で answered・終了コード 0", async ({ page, appServer }) => {
    const client = await appServer.openClient();
    const p1 = client.helloSnapshot()!.panes[0]!.id;
    await openBrowser(page, appServer);
    const run = await runAskWithoutLogin(appServer, p1, SPEC);
    await expect(dialog(page)).toBeVisible();
    // どの pane からか（表示はブラウザが paneId から作る。経路に依らない）。定義の title より上＝ダイアログの最上部に出る。
    const origin = page.locator("[data-ask-origin]");
    await expect(origin).toHaveText(ORIGIN_LINE);
    await expect(page.locator("[data-ask-title]")).toHaveText("配布先");
    await expectOriginAboveTitle(page);
    // 出どころの行は枠（light DOM）の最初の見出しで（`querySelector` は部品の Shadow DOM の中へは入らないので、部品の中の題・質問は数えない）、部品より前にある。部品の中に出どころの行は無く、題・質問は部品の中にだけある。
    expect(
      await dialog(page).evaluate((d) => {
        const origin = d.querySelector("[data-ask-origin]");
        const form = d.querySelector("ask-form");
        const inner = form?.shadowRoot;
        return {
          firstLightDomHeadingIsOrigin: origin !== null && d.querySelector("h1, h2, h3, [data-ask-title], [data-ask-question]") === origin,
          originBeforeForm: !!origin && !!form && (origin.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
          originInForm: inner?.querySelector("[data-ask-origin]") != null,
          titleInForm: inner?.querySelector("h1[data-ask-title]") != null,
          questionsInForm: inner?.querySelectorAll("[data-ask-question]").length,
        };
      }),
    ).toEqual({ firstLightDomHeadingIsOrigin: true, originBeforeForm: true, originInForm: false, titleInForm: true, questionsInForm: 3 });
    await page.locator("[data-ask-submit]").click();
    const r = await run.done;
    // ログインしていないので、受け口を通らなければ unauthenticated（終了コード 1）になる。
    expect(r.stderr).not.toContain("unauthenticated");
    expect(r.code).toBe(0);
    expect(r.json).toEqual({ status: "answered", answers: { channel: "beta", notes: ["changelog"] } });
    await expect(dialog(page)).toHaveCount(0);
  });

  test("sodactl を止める（SIGINT）とダイアログが閉じ、同じ pane に出し直せる", async ({ page, appServer }) => {
    const client = await appServer.openClient();
    const p1 = client.helloSnapshot()!.panes[0]!.id;
    await openBrowser(page, appServer);
    const run = await runAskWithoutLogin(appServer, p1, SPEC);
    await expect(dialog(page)).toBeVisible();
    run.child.kill("SIGINT");
    const stopped = await run.done;
    expect(stopped.stdout).toBe(""); // 結果は出していない（答えられていない）
    await expect(dialog(page)).toHaveCount(0);
    // 閉じた後は同じ pane に出し直せる（前の質問が残っていれば ask_busy・終了コード 1 になる）。
    const again = await runAskWithoutLogin(appServer, p1, SPEC);
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    const c = await again.done;
    expect(c.code).toBe(0);
    expect(c.json).toEqual({ status: "cancelled" });
  });

  test("陰性対照: 受け口のパスを渡さなければ、ログインなしの ask は unauthenticated（終了コード 1）でダイアログは出ない", async ({ page, appServer }) => {
    const client = await appServer.openClient();
    const p1 = client.helloSnapshot()!.panes[0]!.id;
    const subs = await openBrowser(page, appServer);
    const r = await (await runAskWithoutLogin(appServer, p1, SPEC, [], { paneSocket: false })).done;
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("unauthenticated");
    expect(r.stdout).toBe("");
    expect(subs.count()).toBe(1); // 画面は登録済みのまま（出せる状態で、出ていない）
    await expect(dialog(page)).toHaveCount(0);
  });
});

test("質問した pane が別の tab にあっても（表示していない）、ダイアログが出る。閉じたら開く前の場所へ戻る（AC10・AC-I4）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await openBrowser(page, appServer);
  await focusTerminal(page);
  await prefixKey(page, "c"); // 新しい tab（名前の入力が出る。表示が移り、p1 は表示されなくなる）
  await page.keyboard.press("Enter");
  await expect(page.locator(".tab-bar-item")).toHaveCount(2);
  const run = await runAsk(appServer, p1, SPEC);
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator("[data-ask-origin]")).toBeFocused(); // 開いたら見出し（AC-I4）
  await page.locator("[data-ask-cancel]").click();
  expect((await run.done).json).toEqual({ status: "cancelled" });
  await expect(dialog(page)).toHaveCount(0);
  // 表示は切り替わらず、いま表示している tab の端末へフォーカスが戻る。
  await expect(page.locator(".xterm-helper-textarea:focus")).toHaveCount(1);
});

test("質問の pane を表示しているときは、閉じたらその pane の端末にフォーカスが戻る（AC-I4）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await openBrowser(page, appServer);
  await focusTerminal(page);
  const run = await runAsk(appServer, p1, SPEC);
  await expect(dialog(page)).toBeVisible();
  await page.locator("[data-ask-submit]").click();
  await run.done;
  await expect(page.locator(".xterm-helper-textarea").first()).toBeFocused();
});

test("設定のダイアログが開いているときに質問が来ても、両方操作でき、閉じたら設定のダイアログの中へ戻る（AC-I4・AC-I5）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await openBrowser(page, appServer);
  await focusTerminal(page);
  await prefixKey(page, "s"); // 設定
  const settings = page.locator("dialog.settings-dialog[open]");
  await expect(settings).toBeVisible();
  const run = await runAsk(appServer, p1, SPEC);
  await expect(dialog(page)).toBeVisible();
  await page.locator("[data-ask-submit]").click();
  expect((await run.done).json).toMatchObject({ status: "answered" });
  await expect(dialog(page)).toHaveCount(0);
  await expect(settings).toBeVisible(); // 設定は潰れていない
  await page.keyboard.press("Tab"); // 閉じた後に設定を操作できる（フォーカスが設定の中を動く）
  const inSettings = await page.evaluate(() => document.activeElement?.closest("dialog.settings-dialog") !== null);
  expect(inSettings).toBe(true);
  await page.keyboard.press("Escape");
  await expect(settings).toHaveCount(0);
});

test("キーボードだけで答えられる（見出し → Tab → 矢印 → Ctrl+Enter）（AC-I3）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await openBrowser(page, appServer);
  // 部品 1.3.0 で各質問に自由記述のボタンが付いて背が高くなり、画面の高さに収まらず目次が出るようになった。この件は目次なしの Tab を見るので、目次を出さない（paging: false）。
  const run = await runAsk(appServer, p1, { ...SPEC, paging: false });
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator("[data-ask-origin]")).toBeFocused(); // 開いたら見出し（AC-I4）
  // 見出しの次の Tab 停止は、目次が出ていれば目次の項目（出ている数だけ）、その次が最初の質問のチェック済みのラジオ（ベータ）。
  // 目次を出すかは描画が落ち着いてから決まる。落ち着いた後に読む。
  await settle(page);
  // 目次は出さない（目次つきの Tab は ask-form-index.spec.ts の「キーだけで完結」で見る）。
  expect((await indexItems(page)).length).toBe(0);
  await page.keyboard.press("Tab");
  await expect(page.locator("input[type=radio][value=beta]")).toBeFocused();
  // フォーカスが部品の中にある間、ページから見たフォーカスは部品の要素（中の要素は shadowRoot.activeElement）。
  expect(await page.evaluate(() => [document.activeElement?.localName, (document.activeElement?.shadowRoot?.activeElement as HTMLInputElement | null)?.value])).toEqual(["ask-form", "beta"]);
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("input[type=radio][value=stable]")).toBeChecked();
  await expect(dialog(page)).toBeVisible(); // 矢印で移っただけでは決まらない
  await page.keyboard.press("Control+Enter");
  expect((await run.done).json).toMatchObject({ status: "answered", answers: { channel: "stable", rollout: "10" } });
});

test("Tab を回し続けても、背面（サイドバー・tab バー・pane・端末）へはフォーカスが移らない（AC-I3・AC-I5）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await openBrowser(page, appServer);
  await focusTerminal(page);
  const run = await runAsk(appServer, p1, SPEC);
  await expect(dialog(page)).toBeVisible();
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.closest(".sidebar, .tab-bar, .app-panes, .terminal-pane") ?? null)).toBeNull();
  }
  await page.keyboard.press("Escape");
  expect((await run.done).json).toEqual({ status: "cancelled" });
});

test("ダイアログが開いている間のキー（文字・prefix・貼り付け）は pane へ届かず、tab も増えない（AC-I5）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  const sent = await watchSentInput(page);
  const frames = await watchReceivedFrames(page);
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 100 });
  await openBrowser(page, appServer);
  await focusTerminal(page);
  const before = sent().length;
  const run = await runAsk(appServer, p1, SPEC);
  await expect(dialog(page)).toBeVisible();
  // 質問が出ている間も、ほかから pane へ送った入力の出力はブラウザへ届き続ける（質問を出していない pane の入出力は止まらない）。
  client.sendInput(p1, "echo soda-ask-alive-$((6*7))\r");
  await expect.poll(() => frames.output(0, p1), { message: "質問が出ている間も pane の出力がブラウザへ届く" }).toContain("soda-ask-alive-42");
  await page.keyboard.press("x");
  await page.keyboard.press("Control+b");
  await page.keyboard.press("c"); // prefix+c は新しい tab
  await page.keyboard.press("Control+v");
  await page.waitForTimeout(400);
  expect(sent().slice(before).filter((i) => i.paneId === p1 && [...i.text].some((ch) => "xc\x02\x16".includes(ch)))).toEqual([]);
  await expect(page.locator("dialog.name-dialog[open]")).toHaveCount(0); // prefix+c が漏れていれば、新しい tab の名前の入力が開く
  await page.locator("[data-ask-cancel]").click();
  await run.done;
});

test("ダイアログの上と背景でホイールを回しても、背面の端末へマウスの報告（ホイール）が送られない（AC-I5）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  const sent = await watchSentInput(page);
  await openBrowser(page, appServer);
  await focusTerminal(page);
  // pane のアプリにマウスの報告を求めさせる（DECSET 1000。端末へのホイールは `^[[<64;…M`・`^[[<65;…M` の報告になる）。
  await typeLine(page, "printf '\\e[?1000h\\e[?1006h'; cat -v");
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 100 });
  await page.waitForTimeout(500);
  const box = (await page.locator(".xterm-screen").first().boundingBox())!;
  const wheelReports = () => sent().filter((i) => i.paneId === p1 && (i.text.includes("\x1b[<64;") || i.text.includes("\x1b[<65;"))).length;
  // 対照: ダイアログが無いときは、端末の上のホイールが報告として送られる。
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -300);
  await expect.poll(wheelReports, { message: "対照: ダイアログが無ければ端末へホイールの報告が届く" }).toBeGreaterThan(0);
  const before = wheelReports();
  const run = await runAsk(appServer, p1, SPEC);
  await expect(dialog(page)).toBeVisible();
  const d = (await page.locator("dialog#soda-ask-dialog").boundingBox())!;
  await page.mouse.move(d.x + d.width / 2, d.y + 40); // ダイアログの上
  await page.mouse.wheel(0, -600);
  await page.mouse.move(box.x + 4, box.y + 4); // 背景（ダイアログの外。背面の端末の上）
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(400);
  expect(wheelReports()).toBe(before);
  await page.locator("[data-ask-cancel]").click();
  await run.done;
});

test("定義に <script>・HTML を入れても文字として表示され、実行されない。定義の title で出どころの行は消せない（AC11・AC12）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await openBrowser(page, appServer);
  const evil = '<script>window.__askXss=1</script><img src=x onerror="window.__askXss=2">';
  const run = await runAsk(appServer, p1, {
    title: evil,
    intro: evil,
    questions: [{ id: "q", label: evil, help: evil, default: evil, options: [{ value: evil, label: evil, desc: evil, colors: ["red; background:url(javascript:1)", "#1a56db"] }] }],
  });
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator("[data-ask-title]")).toHaveText(evil);
  await expect(page.locator("label.opt .name").first()).toHaveText(evil); // 選択肢の名前も文字のまま（部品の中に描かれている）。描画を待ってから数える
  // ロケータは部品（Shadow DOM）の中も数える。部品の中を直接数えても、script・img は無い（拡大表示の img は、開いたときにだけ入る）。
  expect(await page.locator("dialog#soda-ask-dialog script, dialog#soda-ask-dialog img").count()).toBe(0);
  expect(await page.locator("ask-form").evaluate((f) => f.shadowRoot?.querySelectorAll("script, img").length)).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { __askXss?: number }).__askXss)).toBeUndefined();
  await expect(page.locator("[data-ask-origin]")).toHaveText(ORIGIN_LINE);
  await expectOriginAboveTitle(page);
  await page.locator("[data-ask-submit]").click();
  expect((await run.done).json).toEqual({ status: "answered", answers: { q: evil } });
});

test("定義の title に何を書いても、出どころの行の文言は変わらず、部品の題より上にある（AC3）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await openBrowser(page, appServer);
  let originText: string | null = null;
  // 題なし・ふつうの題・長い題・出どころの行そのものに見える題。
  for (const title of [undefined, "配布先", "あ".repeat(120), "pane「偽物」（どこか／別の tab）のプログラムからの質問"]) {
    const run = await runAsk(appServer, p1, { ...SPEC, title });
    await expect(dialog(page)).toBeVisible();
    const origin = page.locator("[data-ask-origin]");
    await expect(origin).toHaveText(ORIGIN_LINE);
    originText ??= await origin.textContent();
    await expect(origin).toHaveText(originText!); // 定義の title に依らず同じ文言
    expect(originText).not.toContain("偽物");
    await expect(page.locator("[data-ask-title]")).toHaveText(title ?? "質問"); // 定義の title は、部品の中の別の行（書かなければ「質問」）
    await expectOriginAboveTitle(page);
    await page.keyboard.press("Escape");
    expect((await run.done).json).toEqual({ status: "cancelled" });
    await expect(dialog(page)).toHaveCount(0);
  }
});

// --- 即確定（質問が 1 つだけ・single・補足なし。部品の動き。AC9） -------------------------------------------------------
// 部品（ask-form 1.1.1）の決まり: 選択肢のクリック・タップ・`Space`・`Enter` で、その時点で確定する（既に選ばれている選択肢でも）。矢印キーで移っただけでは
// 確定しない。ask-form の側はプログラムから起こしたイベントで確かめているので、ここでは実際のクリックとキー入力（`page.keyboard`）で確かめる
// （タップは `ask-form-mobile.spec.ts`）。「確定した」の観測は、sodactl の stdout（回答の 1 行）とダイアログが閉じたこと、そして**ブラウザが送った `ask.answer` のフレーム**
// （確定は 1 回だけ。矢印で移っただけの間は 0 件）。
// `Space`: Chromium は、既に選ばれているラジオで `Space` を押しても `click` を出さない（keydown・keyup だけ）。部品 1.1.0 は `Space` を `click` で見ていたため、
// 既定の選択肢に `Tab` で入って `Space`・矢印で移った先で `Space` が確定しなかった。1.1.1 は `Space` を `Enter` と同じく keydown で受ける——実際のキー入力で確定することを
// 確かめた（下の件）。

/** `x` が既定で選ばれている。 */
const ONE = { note: false, questions: [{ id: "a", label: "A", default: "x", options: [{ value: "x", label: "エックス" }, { value: "y", label: "ワイ" }, { value: "z", label: "ゼット" }] }] };
/** 既定なし（どれも選ばれていない。`Tab` は最初の選択肢 `x` に止まる）。 */
const ONE_UNSET = { note: false, questions: [{ id: "a", label: "A", options: ONE.questions[0]!.options }] };

/** 即確定の定義を出し、固定の行から `Tab` で選択肢（ラジオ）へ入る（1 問なので目次は出ず、項目への停止も無い）。 */
async function openInstant(page: Page, appServer: AppServer, paneId: string, spec: unknown, focused: string) {
  const run = await runAsk(appServer, paneId, spec);
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator("[data-ask-origin]")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator(`input[type=radio][value=${focused}]`)).toBeFocused();
  return run;
}

test("即確定: 選択肢のカード（label）のクリックで確定する。選ばれていない選択肢でも、既に選ばれている選択肢でも（AC9）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  const { sentAnswers } = await openBrowser(page, appServer);
  // 選ばれていない選択肢。カードの文字をクリック（label → input へ転送されるクリック）。
  const first = await runAsk(appServer, p1, ONE);
  await expect(dialog(page)).toBeVisible();
  await page.locator("label.opt", { hasText: "ゼット" }).click();
  expect((await first.done).json).toEqual({ status: "answered", answers: { a: "z" } });
  await expect(dialog(page)).toHaveCount(0);
  expect(sentAnswers()).toBe(1); // クリックで二重に決定しない（label のクリックは input へ転送されるが、回答は 1 回）
  // 既に選ばれている選択肢（既定の x）。
  const second = await runAsk(appServer, p1, ONE);
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator("input[type=radio][value=x]")).toBeChecked();
  await page.locator("label.opt", { hasText: "エックス" }).click();
  expect((await second.done).json).toEqual({ status: "answered", answers: { a: "x" } });
  await expect(dialog(page)).toHaveCount(0);
  expect(sentAnswers()).toBe(2);
  // ラジオそのもののクリックでも同じ（既に選ばれている選択肢）。
  const third = await runAsk(appServer, p1, ONE);
  await expect(dialog(page)).toBeVisible();
  await page.locator("input[type=radio][value=x]").click();
  expect((await third.done).json).toEqual({ status: "answered", answers: { a: "x" } });
  await expect(dialog(page)).toHaveCount(0);
  expect(sentAnswers()).toBe(3);
});

test("即確定: 矢印キーで移っただけでは確定しない。Enter で確定する（選ばれていない・既に選ばれている・矢印で移った先）（AC9）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  const { sentAnswers } = await openBrowser(page, appServer);
  // 矢印で y → z と移る。移っただけで確定していれば、回答は y で、次の矢印の前にダイアログが閉じている。
  // 「確定していない」は、**ブラウザが送った `ask.answer` が 0 件**であること（矢印の間）と、sodactl がまだ終わっていないこと、
  // 最後に出る回答が z であること、`Enter` の後に初めて 1 件出ることで見る。
  const first = await openInstant(page, appServer, p1, ONE, "x");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("input[type=radio][value=y]")).toBeChecked();
  await expect(page.locator("input[type=radio][value=y]")).toBeFocused();
  expect(sentAnswers()).toBe(0);
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("input[type=radio][value=z]")).toBeChecked();
  await expect(dialog(page)).toBeVisible();
  expect(first.finished()).toBe(false);
  expect(sentAnswers()).toBe(0);
  await page.keyboard.press("Enter"); // 矢印で移った先（既に選ばれている）で Enter
  expect((await first.done).json).toEqual({ status: "answered", answers: { a: "z" } });
  await expect(dialog(page)).toHaveCount(0);
  expect(sentAnswers()).toBe(1);
  // 既に選ばれている選択肢（既定の x）で Enter。
  const second = await openInstant(page, appServer, p1, ONE, "x");
  await page.keyboard.press("Enter");
  expect((await second.done).json).toEqual({ status: "answered", answers: { a: "x" } });
  await expect(dialog(page)).toHaveCount(0);
  expect(sentAnswers()).toBe(2);
  // 選ばれていない選択肢で Enter（既定なし。選んで確定する）。
  const third = await openInstant(page, appServer, p1, ONE_UNSET, "x");
  await expect(dialog(page).locator("input[type=radio]:checked")).toHaveCount(0); // 画面のほかの所にもラジオがあるので、ダイアログの中で数える
  await page.keyboard.press("Enter");
  expect((await third.done).json).toEqual({ status: "answered", answers: { a: "x" } });
  await expect(dialog(page)).toHaveCount(0);
  expect(sentAnswers()).toBe(3);
});

test("即確定: 選ばれていない選択肢で Space を押すと、選んで確定する。回答は 1 回だけ（AC9）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  const { sentAnswers } = await openBrowser(page, appServer);
  const run = await openInstant(page, appServer, p1, ONE_UNSET, "x");
  await expect(dialog(page).locator("input[type=radio]:checked")).toHaveCount(0); // 画面のほかの所にもラジオがあるので、ダイアログの中で数える
  await page.keyboard.press("Space");
  expect((await run.done).json).toEqual({ status: "answered", answers: { a: "x" } });
  await expect(dialog(page)).toHaveCount(0);
  expect(sentAnswers()).toBe(1); // keydown で決め、ブラウザが出す click では決めない（二重に決定しない）
});

test("即確定: 既に選ばれている選択肢で Space を押すと確定する（既定の選択肢・矢印で移った先）。回答は 1 回ずつ（AC9）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  const { sentAnswers } = await openBrowser(page, appServer);
  const first = await openInstant(page, appServer, p1, ONE, "x");
  await expect(page.locator("input[type=radio][value=x]")).toBeChecked();
  expect(sentAnswers()).toBe(0);
  await page.keyboard.press("Space");
  expect((await first.done).json).toEqual({ status: "answered", answers: { a: "x" } });
  await expect(dialog(page)).toHaveCount(0);
  expect(sentAnswers()).toBe(1);
  const second = await openInstant(page, appServer, p1, ONE, "x");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("input[type=radio][value=y]")).toBeChecked();
  expect(sentAnswers()).toBe(1); // 矢印で移っただけでは送らない
  await page.keyboard.press("Space");
  expect((await second.done).json).toEqual({ status: "answered", answers: { a: "y" } });
  await expect(dialog(page)).toHaveCount(0);
  expect(sentAnswers()).toBe(2);
});
