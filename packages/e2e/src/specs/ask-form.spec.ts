import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { askFixture, runAsk, runAskWithoutLogin, watchAskSubscriptions } from "../support/ask.js";
import { watchReceivedFrames, watchSentInput } from "../support/frames.js";
import { focusTerminal, prefixKey, typeLine } from "../support/keys.js";

/**
 * 質問のフォーム（`sodactl ask`。20261002-sodactl-ask）の E2E。ビルドした `sodactl` を子プロセスで起動し（pane の中と同じ環境変数）、
 * 合否はブラウザの側で見る（`e2e-observe-browser`）: ダイアログの DOM・フォーカス・ブラウザが送った INPUT（CDP）・`sodactl` の stdout と終了コード。
 * テストのクライアントに届いた `ask.opened` を、ブラウザにダイアログが出た合図にしない（出るまで DOM で待つ）。
 */

const SPEC = {
  title: "配布先",
  questions: [
    { id: "channel", label: "チャンネル", default: "beta", options: [{ value: "beta", label: "ベータ", recommended: true }, { value: "stable", label: "安定版" }], allowOther: true },
    { id: "rollout", label: "段階", showIf: { channel: "stable" }, default: "10", options: ["10", "100"] },
    { id: "notes", label: "告知", type: "multi", options: ["changelog", "blog", "mail"], default: ["changelog"] },
  ],
};

const dialog = (page: Page) => page.locator("dialog#soda-ask-dialog[open]");

/** ブラウザを開いて「質問を出せる画面」として登録されるまで待つ。 */
async function openBrowser(page: Page, appServer: { origin: string; token: string }) {
  const subs = await watchAskSubscriptions(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await subs.waitFor(1);
  return subs;
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
  await expect(page.locator("[data-ask-question]")).toHaveCount(7); // design・motion は条件を満たしているので出ている
  // テーマの最後の 1 つ（スクロールして選ぶ）と、mode を print にする（motion が隠れる）。
  const last = page.locator(`input[type=radio][value="${themes[12]!.value}"]`);
  await last.scrollIntoViewIfNeeded();
  await last.check();
  await page.locator('input[type=radio][value="print"]').check();
  await expect(page.locator("[data-ask-question]")).toHaveCount(6);
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
  await page.locator(".ask-other-text").fill("  金曜は避ける  ");
  await page.locator("textarea[aria-label=補足]").fill("メモです");
  await page.keyboard.press("Control+Enter");
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

test("対応していない型（edit）の質問がある定義は、ダイアログを出さず unavailable（終了コード 0）。黙って落とさない（追補）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await openBrowser(page, appServer);
  const r = await (await runAsk(appServer, p1, { questions: [{ id: "a", label: "A", options: ["x"] }, { id: "e", label: "E", type: "edit", text: "文面" }] })).done;
  expect(r.code).toBe(0);
  expect(r.json).toMatchObject({ status: "unavailable", reason: expect.stringContaining('"edit"') });
  await expect(dialog(page)).toHaveCount(0);
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
    await expect(origin).toHaveText(/^pane「.+」.*のプログラムからの質問$/);
    await expect(page.locator("[data-ask-title]")).toHaveText("配布先");
    const originBox = (await origin.boundingBox())!;
    const titleBox = (await page.locator("[data-ask-title]").boundingBox())!;
    expect(originBox.y + originBox.height).toBeLessThanOrEqual(titleBox.y);
    expect(await dialog(page).evaluate((d) => d.querySelector("h1, h2, h3, [data-ask-title], [data-ask-question]")?.hasAttribute("data-ask-origin"))).toBe(true);
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
  const run = await runAsk(appServer, p1, SPEC);
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator("[data-ask-origin]")).toBeFocused(); // 開いたら見出し（AC-I4）
  await page.keyboard.press("Tab");
  // 見出しの次の Tab 停止は、最初の質問のチェック済みのラジオ（ベータ）。
  await expect(page.locator("input[type=radio][value=beta]")).toBeFocused();
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
  expect(await page.locator("dialog#soda-ask-dialog script, dialog#soda-ask-dialog img").count()).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { __askXss?: number }).__askXss)).toBeUndefined();
  await expect(page.locator("[data-ask-origin]")).toContainText("のプログラムからの質問");
  await page.locator("[data-ask-submit]").click();
  expect((await run.done).json).toEqual({ status: "answered", answers: { q: evil } });
});

test("質問が 1 つだけ・single・補足なしなら、選択肢のカード（label）のクリックで確定する。矢印キーで移っただけでは確定しない（D3 (l)）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await openBrowser(page, appServer);
  const ONE = { note: false, questions: [{ id: "a", label: "A", default: "x", options: [{ value: "x", label: "エックス" }, { value: "y", label: "ワイ" }, { value: "z", label: "ゼット" }] }] };
  const first = await runAsk(appServer, p1, ONE);
  await expect(dialog(page)).toBeVisible();
  await page.locator("[data-ask-origin]").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("input[type=radio][value=x]")).toBeFocused();
  await page.keyboard.press("ArrowDown"); // y へ移っただけ
  await expect(page.locator("input[type=radio][value=y]")).toBeChecked();
  await page.waitForTimeout(300);
  await expect(dialog(page)).toBeVisible();
  expect(first.finished()).toBe(false);
  await page.locator("label.ask-opt", { hasText: "ゼット" }).click(); // カードの文字をクリック（label → input へ転送されるクリック）
  expect((await first.done).json).toEqual({ status: "answered", answers: { a: "z" } });
  await expect(dialog(page)).toHaveCount(0);
  // Space で選んで確定する。
  const second = await runAsk(appServer, p1, ONE);
  await expect(dialog(page)).toBeVisible();
  await page.locator("[data-ask-origin]").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Space");
  expect((await second.done).json).toEqual({ status: "answered", answers: { a: "x" } });
});
