import { expect, test } from "../support/fixtures.js";
import { runDisplay } from "../support/display.js";
import { writeTmp } from "../support/displayBrowser.js";
import { engageBtn, ok, openScriptBrowser, scriptFrame, scriptFrameEl, scriptFrameLoc, setScriptOk, SCRIPT_FRAME } from "../support/displayScript.js";

/**
 * スクリプトが動く形式（`script-html`。20261007-soda-extensions の T28）の、アプリの部品（`DisplayFrame`・パネル・覆い・［操作する］）を通した筋。
 * 合否はブラウザの側の実測で見る（`e2e-observe-browser`）。土台の頁への差し込みの前提の実測は `display-script.spec.ts`。
 */

test("(1) --script-html-file の中身のスクリプトが動き、window.soda がある。load は 1 回のまま。操作を始めてから soda.action が display.action（source: script）で届く。規則の外は false", async ({ page, appServer }) => {
  const { paneId } = await openScriptBrowser(page, appServer);
  await setScriptOk(
    appServer,
    paneId,
    "g",
    `<!doctype html><body><p id=out>初期</p><input id=i><button id=b>b</button>
<script>
document.getElementById('out').textContent = 'eval:' + eval('1+2') + ' soda:' + (typeof soda) + ' v' + soda.version;
document.getElementById('b').addEventListener('click', function () { document.title = 'r:' + soda.action('pick', { id: '3' }) + ':' + soda.action('bad name') + ':' + soda.action('x', { n: 1 }); });
</script></body>`,
  );
  await expect(scriptFrameLoc(page).locator("#out")).toHaveText("eval:3 soda:object v1");
  await expect(scriptFrameEl(page)).toHaveAttribute("data-display-loads", "1");
  await page.waitForTimeout(800);
  await expect(scriptFrameEl(page)).toHaveAttribute("data-display-loads", "1");
  await expect(page.locator("[data-pane-panel] [data-display-cover]")).toHaveCount(1);
  // 覆いがある間は、枠の中のボタンを押しても何も起きない
  const w = await runDisplay(appServer, paneId, ["wait", "g"]);
  await page.locator("[data-pane-panel] [data-display-cover]").click({ force: true });
  expect(await (await scriptFrame(page)).evaluate(() => document.title)).not.toMatch(/^r:/);
  await page.waitForTimeout(800); // ［操作する］は、出た・動いた直後の 500ms は押しを受けない（engageGuard）
  await engageBtn(page).click();
  await expect(page.locator("[data-pane-panel]")).toHaveAttribute("data-display-engaged", "1");
  await scriptFrameLoc(page).locator("#b").click();
  await expect.poll(async () => (await scriptFrame(page)).evaluate(() => document.title)).toBe("r:true:false:false");
  const r = await w.done;
  expect(r.lines[0]).toMatchObject({ type: "display.action", name: "g", action: "pick", data: { id: "3" }, source: "script", rev: 1 });
});

test("静的な html の面の操作は source: static", async ({ page, appServer }) => {
  const { paneId } = await openScriptBrowser(page, appServer);
  await ok(await runDisplay(appServer, paneId, ["set", "s", "--kind", "panel", "--html-file", await writeTmp(`<button id=b data-soda-action="go">go</button>`)]));
  const f = page.frameLocator("[data-pane-panel] iframe[data-display-frame]");
  await expect(f.locator("#b")).toBeVisible();
  const w = await runDisplay(appServer, paneId, ["wait", "s"]);
  const deadline = Date.now() + 15_000;
  while (!w.finished() && Date.now() < deadline) {
    await f.locator("#b").click();
    await page.waitForTimeout(250);
  }
  expect((await w.done).lines[0]).toMatchObject({ type: "display.action", action: "go", source: "static" });
});

test("(2) sodactl display send のデータが soda.onMessage に届いて DOM に出る。枠は作り直されない（同じ iframe・カウンタが続く）。同じ名前の set では作り直される。2 つのブラウザの両方に届く", async ({ page, appServer, browser }) => {
  const { paneId } = await openScriptBrowser(page, appServer);
  const ctx2 = await browser.newContext();
  try {
    const page2 = await ctx2.newPage();
    await page2.goto(`${appServer.origin}/#token=${appServer.token}`);
    await page2.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
    const html = `<!doctype html><body><ol id=log></ol><script>
var count = 0;
soda.onMessage(function (d) { count++; var li = document.createElement('li'); li.textContent = count + ':' + JSON.stringify(d); document.getElementById('log').appendChild(li); });
</script></body>`;
    await setScriptOk(appServer, paneId, "g", html);
    const f2 = page2.frameLocator(SCRIPT_FRAME);
    await expect(scriptFrameLoc(page).locator("#log")).toBeAttached();
    await expect(f2.locator("#log")).toBeAttached();
    const el = await scriptFrameEl(page).elementHandle();
    const send = async (json: string) => {
      const r = await ok(await runDisplay(appServer, paneId, ["send", "g", "--json", json]));
      return r.json as { status: string; delivered: number };
    };
    await expect.poll(async () => (await send('{"n":1}')).delivered).toBe(2);
    await expect(scriptFrameLoc(page).locator("#log li").first()).toHaveText('1:{"n":1}');
    await expect(f2.locator("#log li").first()).toHaveText('1:{"n":1}');
    await send("[2]");
    await expect(scriptFrameLoc(page).locator("#log li")).toHaveText(['1:{"n":1}', "2:[2]"]); // カウンタが続いている＝枠が作り直されていない
    expect(await el!.evaluate((e) => e.isConnected)).toBe(true);
    // 同じ名前の set では作り直される
    await setScriptOk(appServer, paneId, "g", html.replace("count = 0", "count = 100"));
    await expect.poll(() => el!.evaluate((e) => e.isConnected)).toBe(false);
    await expect(scriptFrameLoc(page).locator("#log")).toBeAttached();
    await send('"again"');
    await expect(scriptFrameLoc(page).locator("#log li")).toHaveText(['101:"again"']);
  } finally {
    await ctx2.close();
  }
});

test("(3) 固定の印「スクリプト」が枠の外にあり、題・中身に何を書いても消えない。静的な形式の面には無い。--features の renderers.scriptHtml がブラウザの数になる", async ({ page, appServer }) => {
  const { paneId } = await openScriptBrowser(page, appServer);
  const set = await setScriptOk(appServer, paneId, "g", "<p>x</p>", { extra: ["--title", "スクリプト 偽の題 <b>x</b>"] });
  expect((set.json as { renderers: { scriptHtml: number } }).renderers.scriptHtml).toBe(1);
  const mark = page.locator("[data-pane-panel] [data-display-script-mark]");
  await expect(mark).toHaveText("スクリプト");
  await expect(mark).toHaveCount(1);
  expect(await mark.evaluate((e) => e.closest("iframe") === null)).toBe(true); // 枠の外
  const f = await ok(await runDisplay(appServer, paneId, ["--features"]));
  expect((f.json as { server: { renderers: { scriptHtml: number } } }).server.renderers.scriptHtml).toBe(1);
  // 静的な面には印も［操作する］も覆いも無い
  await ok(await runDisplay(appServer, paneId, ["set", "g", "--kind", "panel", "--text", "static"]));
  await expect(page.locator("[data-pane-panel] iframe[data-display-frame]")).toHaveCount(1);
  await expect(page.locator("[data-pane-panel] [data-display-script-mark]")).toHaveCount(0);
  await expect(page.locator("[data-pane-panel] [data-display-engage]")).toHaveCount(0);
  await expect(page.locator("[data-pane-panel] [data-display-cover]")).toHaveCount(0);
});

test("(3b) 形式の切り替え html → script-html → html: iframe が別の要素・src と sandbox が形式の値・印と［操作する］が付く／外れる。html に戻すと同じ中身の <script>・onerror が動かない", async ({ page, appServer }) => {
  const { paneId } = await openScriptBrowser(page, appServer);
  const body = `<p id=p>x</p><img src="data:image/png;base64,AAAA" onerror="document.title='ran'"><script>document.title='ran'</script>`;
  const frame = () => page.locator("[data-pane-panel] iframe[data-display-frame]");
  await ok(await runDisplay(appServer, paneId, ["set", "g", "--kind", "panel", "--html-file", await writeTmp(body)]));
  await expect(frame()).toHaveAttribute("src", /frame\.html/);
  const html1 = await frame().elementHandle();
  await expect(frame()).toHaveAttribute("sandbox", "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox");
  expect(await (await html1!.contentFrame())!.evaluate(() => document.title)).not.toBe("ran");
  await setScriptOk(appServer, paneId, "g", `<!doctype html><body><p id=p>script</p><script>document.title='ran'</script></body>`);
  await expect(frame()).toHaveAttribute("src", /script\.html/);
  await expect(frame()).toHaveAttribute("sandbox", "allow-scripts");
  expect(await html1!.evaluate((e) => e.isConnected)).toBe(false);
  await expect(page.locator("[data-pane-panel] [data-display-script-mark]")).toHaveCount(1);
  await expect(engageBtn(page)).toHaveCount(1);
  await expect.poll(async () => (await scriptFrame(page)).evaluate(() => document.title)).toBe("ran");
  const script1 = await frame().elementHandle();
  await ok(await runDisplay(appServer, paneId, ["set", "g", "--kind", "panel", "--html-file", await writeTmp(body)]));
  await expect(frame()).toHaveAttribute("src", /frame\.html/);
  expect(await script1!.evaluate((e) => e.isConnected)).toBe(false);
  await expect(page.locator("[data-pane-panel] [data-display-script-mark]")).toHaveCount(0);
  await expect(engageBtn(page)).toHaveCount(0);
  await expect(page.frameLocator("[data-pane-panel] iframe[data-display-frame]").locator("#p")).toHaveText("x");
  await page.waitForTimeout(600);
  expect(await (await (await frame().elementHandle())!.contentFrame())!.evaluate(() => document.title)).not.toBe("ran");
});
