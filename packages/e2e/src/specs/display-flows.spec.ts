import { expect, test } from "../support/fixtures.js";
import { runDisplay, startSink, watchDisplaySubscriptions, watchSentDisplay } from "../support/display.js";
import { openDisplayBrowser, panelFrameLoc, writeTmp } from "../support/displayBrowser.js";
import { watchSentInput } from "../support/frames.js";

/**
 * 表示の面（20261007-soda-extensions）の E2E: 出す・更新する・閉じる・操作（T18）。ビルドした `sodactl` を子プロセスで起動し、合否はブラウザの側の実測
 * （枠の中の DOM・要素の箱・計算済みのスタイル・ブラウザが送った要求）で見る。端末（WebGL）の文字は DOM から読めないので、「打ったキーが pane に届いた」は
 * ブラウザが送った入力のフレーム（`watchSentInput`）で見る。
 */

const ok = async (run: Awaited<ReturnType<typeof runDisplay>>) => {
  const r = await run.done;
  expect(r.code, r.stderr).toBe(0);
  return r;
};

/** 開いているブラウザの pane のために、テストの接続をもう 1 本開く（分割など、サーバへの操作用）。 */
async function openedClient(appServer: Parameters<typeof openDisplayBrowser>[1], paneId: string) {
  const client = await appServer.openClient();
  void paneId;
  return { client };
}

/** `wait` は起動してから繋がるまでの間の操作を見ない。終わるまで、押し直す（押した分の最初の 1 行で終わる）。 */
async function clickUntilDone(run: Awaited<ReturnType<typeof runDisplay>>, click: () => Promise<void>): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (!run.finished() && Date.now() < deadline) {
    await click();
    await new Promise((r) => setTimeout(r, 250));
  }
}

test("(2) 同じ名前の set で中身が替わり、枠の要素が同じ・スクロールと入力途中の欄の値が残る・rev が増える", async ({ page, appServer }) => {
  const { paneId } = await openDisplayBrowser(page, appServer);
  const body = (tail: string) => `<div style="height:3000px"><input name="memo" id="memo"></div>${tail}`;
  await ok(await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", "--html-file", await writeTmp(body("<p id=v1>one</p>"))]));
  const f = panelFrameLoc(page);
  await expect(f.locator("#v1")).toBeAttached();
  const handle = await page.locator("[data-pane-panel] iframe").elementHandle();
  await f.locator("#memo").fill("途中の値");
  const frame = (await handle!.contentFrame())!;
  await frame.evaluate(() => window.scrollTo(0, 500));
  await expect.poll(() => frame.evaluate(() => window.scrollY)).toBeGreaterThan(400);
  // 2 回目は標準入力と --format html で渡す。
  const second = await ok(await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", "--format", "html"], { stdin: body("<p id=v2>two</p>") }));
  expect((second.json as { display: { rev: number } }).display.rev).toBe(2);
  await expect(f.locator("#v2")).toBeAttached();
  await expect(f.locator("#memo")).toHaveValue("途中の値");
  expect(await frame.evaluate(() => window.scrollY)).toBeGreaterThan(400);
  await expect(page.locator("[data-pane-panel] iframe")).toHaveAttribute("data-display-loads", "1");
  const again = await page.locator("[data-pane-panel] iframe").elementHandle();
  expect(await again!.evaluate((a, b) => a === b, handle)).toBe(true);
  const list = await ok(await runDisplay(appServer, paneId, ["list"]));
  expect((list.json as { displays: { rev: number }[] }).displays[0]!.rev).toBe(2);
});

test("(3)(4) パネルを出すと端末の列数が減る（ブラウザの client.view もサーバの PTY も）。たたむ・閉じると戻る。端末とパネルの箱は重ならない。パネル 2 つでタブ・帯 2 本で縦積み", async ({ page, appServer }) => {
  const { paneId, client, views } = await openDisplayBrowser(page, appServer);
  await expect.poll(() => views.latest()?.visible[0]?.cols).toBeGreaterThan(0);
  const before = views.latest()!.visible[0]!.cols;
  await ok(await runDisplay(appServer, paneId, ["set", "p1", "--kind", "panel", "--title", "一つ目", "--text", "a"]));
  await ok(await runDisplay(appServer, paneId, ["set", "p2", "--kind", "panel", "--title", "二つ目", "--text", "b"]));
  await expect(page.locator("[data-pane-panel]")).toHaveCount(1);
  await expect.poll(() => views.latest()!.visible[0]!.cols).toBeLessThan(before);
  await expect.poll(() => client.paneSize(paneId)?.cols).toBe(views.latest()!.visible[0]!.cols);
  const main = (await page.locator("[data-pane-frame-main]").boundingBox())!;
  const pnl = (await page.locator("[data-pane-panel]").boundingBox())!;
  expect(main.x + main.width).toBeLessThanOrEqual(pnl.x + 1);
  // タブ 2 つ。選ぶと中身が替わる。
  await expect(page.locator("[data-pane-panel-tab]")).toHaveCount(2);
  await expect(panelFrameLoc(page).locator("pre")).toHaveText("a");
  await page.locator("[data-pane-panel-tab]", { hasText: "二つ目" }).click();
  await expect(panelFrameLoc(page).locator("pre")).toHaveText("b");
  // たたむと列数が戻り、広げると減る。
  const withPanel = views.latest()!.visible[0]!.cols;
  await page.locator("[data-pane-panel-fold]").click();
  await expect.poll(() => views.latest()!.visible[0]!.cols).toBeGreaterThan(withPanel);
  await page.locator("[data-pane-panel-unfold]").click();
  await expect.poll(() => views.latest()!.visible[0]!.cols).toBeLessThan(before);
  // 閉じると戻る。
  await ok(await runDisplay(appServer, paneId, ["close", "--all"]));
  await expect(page.locator("[data-pane-panel]")).toHaveCount(0);
  await expect.poll(() => views.latest()!.visible[0]!.cols).toBe(before);
  // 帯 2 本は縦に積まれる。
  await ok(await runDisplay(appServer, paneId, ["set", "b1", "--kind", "band", "--text", "one"]));
  await ok(await runDisplay(appServer, paneId, ["set", "b2", "--kind", "band", "--text", "two"]));
  await expect(page.locator("[data-pane-band]")).toHaveCount(2);
  const b1 = (await page.locator("[data-pane-band]").nth(0).boundingBox())!;
  const b2 = (await page.locator("[data-pane-band]").nth(1).boundingBox())!;
  expect(b2.y).toBeGreaterThanOrEqual(b1.y + b1.height - 1);
  const m2 = (await page.locator("[data-pane-frame-main]").boundingBox())!;
  expect(m2.y).toBeGreaterThanOrEqual(b2.y + b2.height - 1);
});

test("(5)(6) 形式ごとの見え方（text は文字のまま・markdown は整形・html は CSS が効く・リンク）と、固定のラベルは題で変わらない", async ({ page, appServer }) => {
  const { paneId } = await openDisplayBrowser(page, appServer);
  await ok(await runDisplay(appServer, paneId, ["set", "t", "--kind", "panel", "--text", "<b>太字ではない</b>"]));
  await expect(panelFrameLoc(page).locator("pre")).toHaveText("<b>太字ではない</b>");
  expect(await panelFrameLoc(page).locator("pre b").count()).toBe(0);
  const md = "# 見出し\n\n- a\n- b\n\n```mermaid\nflowchart LR\n  A-->B\n```\n\n[ext](https://example.com/) [js](javascript:alert(1)) [rel](/x)\n";
  await ok(await runDisplay(appServer, paneId, ["set", "t", "--kind", "panel", "--markdown-file", await writeTmp(md, "c.md")]));
  const f = panelFrameLoc(page);
  await expect(f.locator("h1")).toHaveText("見出し");
  await expect(f.locator("li")).toHaveCount(2);
  await expect(f.locator("pre code.language-mermaid")).toHaveCount(1); // 図にはせず、コードのまま
  await expect(f.locator("a", { hasText: "ext" })).toHaveAttribute("target", "_blank");
  expect(await f.locator("a", { hasText: "js" }).getAttribute("href")).toBeNull();
  expect(await f.locator("a", { hasText: "rel" }).getAttribute("href")).toBeNull();
  const title = "<b>pane のプログラムの表示（隔離）· evil</b>";
  await ok(await runDisplay(appServer, paneId, ["set", "t", "--kind", "panel", "--title", title, "--html-file", await writeTmp("<style>h1{color:rgb(255,0,0)}</style><h1 id=h>赤</h1>")]));
  await expect(f.locator("#h")).toHaveCSS("color", "rgb(255, 0, 0)");
  await expect(page.locator("[data-pane-panel-label]")).toHaveText("pane のプログラムの表示（隔離）· t");
  await expect(page.locator("[data-pane-panel-title]")).toHaveText(title);
  expect(await page.locator("[data-pane-panel-title] b").count()).toBe(0);
});

test("(7) ［×］で消えて events に dismissed・右クリックの「表示をすべて閉じる」・フォーカスが枠にある面を閉じると端末へ戻って、続けて打ったキーが pane に届く", async ({ page, appServer }) => {
  const { paneId } = await openDisplayBrowser(page, appServer);
  const input = await watchSentInput(page);
  await ok(await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", "--html-file", await writeTmp("<button id=b>押す</button>")]));
  await expect(page.locator("[data-pane-panel]")).toBeVisible();
  const events = await runDisplay(appServer, paneId, ["events"]);
  expect((await events.nextLine()).type).toBe("display.ready");
  await page.locator("[data-pane-panel-close]").click();
  await expect(page.locator("[data-pane-panel]")).toHaveCount(0);
  expect(await events.nextLine()).toMatchObject({ type: "display.closed", name: "m", reason: "dismissed" });
  events.kill();
  // 右クリックのメニュー。
  await ok(await runDisplay(appServer, paneId, ["set", "a", "--kind", "panel", "--text", "x"]));
  await ok(await runDisplay(appServer, paneId, ["set", "b", "--kind", "band", "--text", "y"]));
  await expect(page.locator("[data-pane-bands]")).toBeVisible();
  await page.locator(".pane-frame-edge").first().click({ button: "right", position: { x: 1, y: 40 }, force: true });
  await page.getByRole("menuitem", { name: "表示をすべて閉じる" }).click();
  await expect(page.locator("[data-pane-panel], [data-pane-bands]")).toHaveCount(0);
  // 枠にフォーカスがあるときに面が消えると、端末へ戻る。
  await ok(await runDisplay(appServer, paneId, ["set", "f", "--kind", "panel", "--html-file", await writeTmp("<input id=i>")]));
  await panelFrameLoc(page).locator("#i").click();
  await expect(page.locator("[data-pane-panel]")).toHaveAttribute("data-display-engaged", "1");
  await ok(await runDisplay(appServer, paneId, ["close", "f"]));
  await expect(page.locator("[data-pane-panel]")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe("IFRAME");
  await page.keyboard.type("hello");
  // 端末（WebGL）の文字は DOM から読めないので、ブラウザが送った入力のフレームで見る。
  await expect.poll(() => input().map((i) => i.text).join("")).toContain("hello");
});

test("(8) ボタンで wait と set --wait が 1 行出して終わる・フォームの送信で値が届き枠が移らず外への要求が無い・markdown の中の button も届く", async ({ page, appServer }) => {
  const { paneId } = await openDisplayBrowser(page, appServer);
  const sink = await startSink();
  try {
    await ok(await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", "--html-file", await writeTmp(`<button id=b data-soda-action="go" data-soda-value="1">go</button>`)]));
    const f = panelFrameLoc(page);
    await expect(f.locator("#b")).toBeVisible();
    // wait: ボタンで 1 行出して終わる。
    const waiter = await runDisplay(appServer, paneId, ["wait", "m"]);
    await clickUntilDone(waiter, () => f.locator("#b").click());
    const w = await waiter.done;
    expect(w.code).toBe(0);
    expect(w.lines[0]).toMatchObject({ type: "display.action", name: "m", action: "go", data: { value: "1" }, rev: 1 });
    // set --wait: set の結果の後に、操作を 1 行出して終わる。
    const sw = await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", "--wait", "--html-file", await writeTmp(`<button id=b data-soda-action="again">again</button>`)]);
    await expect(f.locator("#b")).toHaveText("again");
    await f.locator("#b").click();
    const swd = await sw.done;
    expect(swd.code, swd.stderr).toBe(0);
    expect(swd.lines.some((l) => (l as { type?: string }).type === "display.action" && (l as { action?: string }).action === "again")).toBe(true);
    // フォーム: 値が届き、枠は移らず、外への要求は無い（不確かな点 3）。
    await ok(await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", "--html-file", await writeTmp(`<form id=f data-soda-action="save" action="${sink.origin}/leak"><input name="who" value="me"><button id=s name="btn" value="ok">send</button></form>`)]));
    await expect(f.locator("#f")).toBeVisible();
    const ev = await runDisplay(appServer, paneId, ["wait", "m"]);
    await f.locator("#f input").fill("you");
    await clickUntilDone(ev, () => f.locator("#s").click());
    const done = await ev.done;
    expect(done.lines[0]).toMatchObject({ type: "display.action", action: "save", data: { who: "you", btn: "ok" } });
    await expect(page.locator("[data-pane-panel] iframe")).toHaveAttribute("data-display-loads", "1");
    await page.waitForTimeout(300);
    expect(sink.requests()).toEqual([]);
    // markdown の中の <button data-soda-action> も届く（不確かな点 4）。
    await ok(await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", "--markdown-file", await writeTmp(`# md\n\n<button id="mb" data-soda-action="md">m</button>\n`, "c.md")]));
    await expect(f.locator("#mb")).toBeVisible();
    const mw = await runDisplay(appServer, paneId, ["wait", "m"]);
    await clickUntilDone(mw, () => f.locator("#mb").click());
    expect((await mw.done).lines[0]).toMatchObject({ action: "md" });
  } finally {
    await sink.close();
  }
});

test("(9) 2 つのブラウザ: 両方に出る・どちらで押しても 1 件", async ({ page, appServer, browser }) => {
  const { paneId, sent } = await openDisplayBrowser(page, appServer);
  const ctx2 = await browser.newContext();
  try {
    const page2 = await ctx2.newPage();
    const subs2 = await watchDisplaySubscriptions(page2);
    const sent2 = await watchSentDisplay(page2);
    await page2.goto(`${appServer.origin}/#token=${appServer.token}`);
    await page2.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
    await subs2.waitFor(1);
    await ok(await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", "--html-file", await writeTmp(`<button id=b data-soda-action="go">go</button>`)]));
    await expect(panelFrameLoc(page).locator("#b")).toBeVisible();
    await expect(panelFrameLoc(page2).locator("#b")).toBeVisible();
    const w = await runDisplay(appServer, paneId, ["wait", "m"]);
    await clickUntilDone(w, () => panelFrameLoc(page2).locator("#b").click());
    expect((await w.done).lines[0]).toMatchObject({ action: "go", rev: 1 });
    expect(sent2.actions().length).toBeGreaterThanOrEqual(1); // 押し直した分もあるので、押したのは page2 だけ、で見る
    expect(sent.actions()).toHaveLength(0);
    // set で rev が進んだ後は、新しい rev が付く。
    await ok(await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", "--html-file", await writeTmp(`<button id=b data-soda-action="go">go2</button>`)]));
    await expect(panelFrameLoc(page).locator("#b")).toHaveText("go2");
    const w2 = await runDisplay(appServer, paneId, ["wait", "m"]);
    await clickUntilDone(w2, () => panelFrameLoc(page).locator("#b").click());
    expect((await w2.done).lines[0]).toMatchObject({ rev: 2 });
  } finally {
    await ctx2.close();
  }
});

test("(10) 画面が無いとき set の renderers は 0、後から開くと出る。--features の数", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const paneId = client.helloSnapshot()!.panes[0]!.id;
  const r = await ok(await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", "--text", "later"]));
  expect((r.json as { renderers: Record<string, number> }).renderers).toMatchObject({ panel: 0, band: 0, actions: 0 });
  const subs = await watchDisplaySubscriptions(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await subs.waitFor(1);
  await expect(panelFrameLoc(page).locator("pre")).toHaveText("later");
  const feat = await ok(await runDisplay(appServer, paneId, ["--features"]));
  expect(JSON.stringify(feat.json)).toMatch(/"panel":\s*1/);
});

test("(11) close・--all・--ttl-ms・pane を閉じると消える。無い名前の close は closed: []", async ({ page, appServer }) => {
  const { paneId, client } = await openDisplayBrowser(page, appServer);
  await ok(await runDisplay(appServer, paneId, ["set", "a", "--kind", "panel", "--text", "x"]));
  await ok(await runDisplay(appServer, paneId, ["set", "b", "--kind", "band", "--text", "y"]));
  expect(((await ok(await runDisplay(appServer, paneId, ["close", "zzz"]))).json as { closed: string[] }).closed).toEqual([]);
  expect(((await ok(await runDisplay(appServer, paneId, ["close", "a"]))).json as { closed: string[] }).closed).toEqual(["a"]);
  await expect(page.locator("[data-pane-panel]")).toHaveCount(0);
  await ok(await runDisplay(appServer, paneId, ["close", "--all"]));
  await expect(page.locator("[data-pane-bands]")).toHaveCount(0);
  await ok(await runDisplay(appServer, paneId, ["set", "t", "--kind", "panel", "--ttl-ms", "1000", "--text", "short"]));
  await expect(page.locator("[data-pane-panel]")).toHaveCount(0, { timeout: 8000 });
  // 別の pane を閉じると、その pane の面が消える。
  const split = await client.request("pane.split", { paneId, direction: "right" });
  const p2 = split.pane.id;
  await ok(await runDisplay(appServer, p2, ["set", "q", "--kind", "panel", "--text", "second"]));
  await expect(page.locator("[data-pane-panel]")).toHaveCount(1);
  await client.request("pane.close", { paneId: p2 });
  await expect(page.locator("[data-pane-panel]")).toHaveCount(0);
});

test("(12) 幅の丸め: 狭い pane では半分まで・40 列を下回ると自動でたたむ。帯のあふれは「ほか N 件」", async ({ page, appServer }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  const { paneId } = await openDisplayBrowser(page, appServer);
  await ok(await runDisplay(appServer, paneId, ["set", "w", "--kind", "panel", "--size", "800", "--text", "wide"]));
  await expect(page.locator("[data-pane-panel]")).toBeVisible();
  const paneW = (await page.locator(".pane-frame-body").first().boundingBox())!.width;
  const w = (await page.locator("[data-pane-panel]").boundingBox())!.width;
  expect(w).toBeLessThanOrEqual(Math.floor(paneW / 2));
  // 狭い pane（分割を重ねる）: 端末を 40 列残すと 160px を取れないので、自動でたたむ（広げるボタンは無効）。
  const { client } = await openedClient(appServer, paneId);
  await client.request("pane.split", { paneId, direction: "right" });
  await client.request("pane.split", { paneId, direction: "right" });
  await expect.poll(async () => (await page.locator(".pane-frame-body").first().boundingBox())!.width).toBeLessThan(300);
  await expect(page.locator("[data-pane-panel-unfold]")).toBeDisabled();
  await expect.poll(async () => (await page.locator("[data-pane-panel]").boundingBox())!.width).toBe(24);
  await ok(await runDisplay(appServer, paneId, ["close", "w"]));
  // 帯: 高さの合計が pane の 3 分の 1 を超える分は「ほか N 件」。
  await page.setViewportSize({ width: 900, height: 300 });
  await ok(await runDisplay(appServer, paneId, ["set", "b1", "--kind", "band", "--size", "60", "--text", "1"]));
  await ok(await runDisplay(appServer, paneId, ["set", "b2", "--kind", "band", "--size", "60", "--text", "2"]));
  await expect(page.locator("[data-pane-bands-more]")).toHaveText("ほか 1 件");
  await expect(page.locator("[data-pane-band]")).toHaveCount(1);
});

test("(13) キーボード: prefix+i で枠へ → Enter で操作が届く → Esc で端末へ戻り、続けて打ったキーが pane に届く。操作中の表示が出て、戻ると元に戻る", async ({ page, appServer }) => {
  const { paneId } = await openDisplayBrowser(page, appServer);
  const input = await watchSentInput(page);
  await ok(await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", "--html-file", await writeTmp(`<button id=b data-soda-action="kb">kb</button>`)]));
  await expect(panelFrameLoc(page).locator("#b")).toBeVisible();
  const ring = page.locator("[data-pane-panel-ring]");
  const main = page.locator("[data-pane-frame-main]");
  expect(await main.evaluate((e) => getComputedStyle(e).opacity)).toBe("1");
  const ringColor0 = await ring.evaluate((e) => getComputedStyle(e).borderTopColor);
  await page.locator(".xterm-helper-textarea").focus();
  const w = await runDisplay(appServer, paneId, ["wait", "m"]);
  await page.keyboard.press("Control+b");
  await page.keyboard.press("i");
  await expect(page.locator("[data-pane-panel]")).toHaveAttribute("data-display-engaged", "1");
  await expect(page.locator("[data-pane-panel-engaged-note]")).toHaveText("入力はこの表示に届きます（Esc で端末へ）");
  expect(await ring.evaluate((e) => getComputedStyle(e).borderTopColor)).not.toBe(ringColor0);
  await expect.poll(() => main.evaluate((e) => getComputedStyle(e).opacity)).toBe("0.55");
  await page.keyboard.press("Enter"); // フォーカスは枠の最初のボタン
  expect((await w.done).lines[0]).toMatchObject({ action: "kb" });
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-pane-panel]")).toHaveAttribute("data-display-engaged", "0");
  expect(await main.evaluate((e) => getComputedStyle(e).opacity)).toBe("1");
  expect(await ring.evaluate((e) => getComputedStyle(e).borderTopColor)).toBe(ringColor0);
  const before = input().length;
  await page.keyboard.type("ok");
  await expect.poll(() => input().slice(before).map((i) => i.text).join("")).toContain("ok");
});

test("(14) 面を出した状態で既存の操作が動く: 枠の上のホイールは枠の中をスクロールする・分割しても出ている", async ({ page, appServer }) => {
  const { paneId, client, views } = await openDisplayBrowser(page, appServer);
  await ok(await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", "--html-file", await writeTmp(`<div style="height:4000px">long</div>`)]));
  await expect(panelFrameLoc(page).locator("div[style]")).toBeVisible();
  const h = (await page.locator("[data-pane-panel] iframe").elementHandle())!;
  const frame = (await h.contentFrame())!;
  const pb = (await page.locator("[data-pane-panel] iframe").boundingBox())!;
  await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2);
  await page.mouse.wheel(0, 300);
  await expect.poll(() => frame.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await client.request("pane.split", { paneId, direction: "right" });
  await expect.poll(() => views.latest()?.visible.length).toBe(2);
  await expect(page.locator("[data-pane-panel]")).toBeVisible();
});

test("(15) 2 MiB ちょうどの html（末尾に印の要素）が出て、末尾の印が枠の中に見える", async ({ page, appServer }) => {
  const { paneId } = await openDisplayBrowser(page, appServer);
  const tail = "<p id=tail>END</p>";
  const filler = `<!--${"x".repeat(2 * 1024 * 1024 - Buffer.byteLength(tail) - 7)}-->`;
  const content = filler + tail;
  expect(Buffer.byteLength(content)).toBe(2 * 1024 * 1024);
  const r = await runDisplay(appServer, paneId, ["set", "big", "--kind", "panel", "--html-file", await writeTmp(content)]);
  const done = await r.done;
  expect(done.code, done.stderr).toBe(0);
  await expect(panelFrameLoc(page).locator("#tail")).toHaveText("END", { timeout: 20_000 });
});
