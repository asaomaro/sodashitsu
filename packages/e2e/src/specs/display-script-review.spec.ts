import { expect, test } from "../support/fixtures.js";
import { runDisplay } from "../support/display.js";
import { writeTmp } from "../support/displayBrowser.js";
import { activeTag, engageBtn, focusTerminal, ok, openScriptBrowser, scriptFrame, scriptFrameEl, scriptFrameLoc, setScript, setScriptOk } from "../support/displayScript.js";

/**
 * PR3 の独立レビューを受けた直しの E2E（フォーカスの追い出し・フォーカスの脱落・土台の乗っ取り・［操作を終える］）。
 */
const staticFrame = (page: import("@playwright/test").Page) => page.frameLocator("[data-pane-bands] iframe[data-display-frame]");
const stealReports = (sent: { reports(): { problem: string }[] }) => sent.reports().filter((r) => r.problem === "focus_steal").length;

test.describe("静的な面へのプログラムによるフォーカス（レビュー 1）", () => {
  test("スクリプトの面が載っていないとき: 静的な面の欄へプログラムでフォーカスを入れても、端末へ戻されない（支援技術・拡張機能と同じ）", async ({ page, appServer }) => {
    const { paneId } = await openScriptBrowser(page, appServer);
    await ok(await runDisplay(appServer, paneId, ["set", "s", "--kind", "band", "--html-file", await writeTmp("<input id=v>")]));
    await expect(staticFrame(page).locator("#v")).toBeAttached();
    await focusTerminal(page);
    await staticFrame(page).locator("#v").fill("入力中の値"); // ポインタ無しでフォーカスが入る
    await staticFrame(page).locator("#v").focus();
    await page.waitForTimeout(1200);
    expect(await activeTag(page)).toContain("IFRAME");
    await expect(staticFrame(page).locator("#v")).toHaveValue("入力中の値");
    await page.keyboard.type("abc");
    await expect(staticFrame(page).locator("#v")).toHaveValue("入力中の値abc");
  });

  test("スクリプトの面が載っているとき: 静的な面へプログラムでフォーカスが入ると、元の場所へ戻される（兄弟のスクリプトが移す場合に備える）", async ({ page, appServer }) => {
    const { paneId } = await openScriptBrowser(page, appServer);
    await ok(await runDisplay(appServer, paneId, ["set", "s", "--kind", "band", "--html-file", await writeTmp("<input id=v>")]));
    await setScriptOk(appServer, paneId, "g", "<p>script</p>");
    await expect(scriptFrameEl(page)).toHaveCount(1);
    await expect(staticFrame(page).locator("#v")).toBeAttached();
    await focusTerminal(page);
    await staticFrame(page).locator("#v").focus();
    await expect.poll(() => activeTag(page), { timeout: 5000 }).not.toContain("IFRAME");
  });
});

test.describe("フォーカスの脱落（レビュー 2）", () => {
  const PAGE = `<!doctype html><body><p>drop</p><script>
window.__drop = function () { window.focus(); parent.focus(); };
</script></body>`;

  test("単発: window.focus(); parent.focus() で親の activeElement が body になっても、元の場所へ戻り、打った文字が端末に届く。取られた回数が進む", async ({ page, appServer }) => {
    const { paneId, input, sent } = await openScriptBrowser(page, appServer);
    await setScriptOk(appServer, paneId, "g", PAGE);
    await expect(scriptFrameLoc(page).locator("p")).toBeAttached();
    const f = await scriptFrame(page);
    await focusTerminal(page);
    await f.evaluate(() => (window as unknown as { __drop(): void }).__drop());
    await expect.poll(() => stealReports(sent), { timeout: 5000 }).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(300);
    const n = input().length;
    await page.keyboard.type("hello");
    await expect.poll(() => input().slice(n).filter((i) => i.paneId === paneId).map((i) => i.text).join("")).toContain("hello");
  });

  test("4ms ごとの繰り返し: 打った文字が端末に届き（全部ではなくてもよいが、止まらない）、回数が進んで 3 回で面が閉じ、その pane は冷却に入る", async ({ page, appServer }) => {
    const { paneId, input, sent } = await openScriptBrowser(page, appServer);
    await setScriptOk(appServer, paneId, "g", PAGE.replace("</script>", "setInterval(window.__drop, 4);</script>"));
    await focusTerminal(page);
    const n = input().length;
    let typed = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 4000) {
      await page.keyboard.press("x");
      typed++;
      await page.waitForTimeout(20);
    }
    const toPane = input().slice(n).filter((i) => i.paneId === paneId).length;
    console.log(`MEASURE focus-drop-loop: typed=${typed} reached-pane=${toPane} steal-reports=${stealReports(sent)}`);
    expect(stealReports(sent)).toBeGreaterThanOrEqual(3);
    await expect(scriptFrameEl(page)).toHaveCount(0, { timeout: 8000 });
    expect(toPane).toBeGreaterThan(typed * 0.5);
    const again = await (await setScript(appServer, paneId, "g2", "<p>x</p>")).done;
    expect(again.code).toBe(1);
    // 閉じた後は、打った文字が全部届く
    const m = input().length;
    await page.keyboard.type("after");
    await expect.poll(() => input().slice(m).map((i) => i.text).join("")).toContain("after");
  });

  test("利用者が余白を押して端末からフォーカスが外れても、数えない（本物のポインタの直後）", async ({ page, appServer }) => {
    const { paneId, sent } = await openScriptBrowser(page, appServer);
    await setScriptOk(appServer, paneId, "g", PAGE);
    await expect(scriptFrameLoc(page).locator("p")).toBeAttached();
    await focusTerminal(page);
    await page.waitForTimeout(300);
    const box = (await page.locator(".pane-panel-head").boundingBox())!;
    await page.mouse.click(box.x + box.width - 70, box.y + box.height / 2);
    await page.waitForTimeout(1500);
    expect(stealReports(sent)).toBe(0);
  });
});

test.describe("土台の乗っ取りと［操作を終える］（レビュー 3）", () => {
  const HOSTILE = `<!doctype html><body><input id=i><script>
Object.defineProperty(KeyboardEvent.prototype, 'isComposing', { get: function () { return true; } });
window.__stolen = 0;
var oc = Function.prototype.call, oa = Function.prototype.apply;
Function.prototype.call = function () { for (var i = 0; i < arguments.length; i++) { if (typeof MessagePort === 'function' && arguments[i] instanceof MessagePort) window.__stolen++; } return oc.apply(this, arguments); };
Function.prototype.apply = function () { for (var i = 0; i < arguments.length; i++) { if (typeof MessagePort === 'function' && arguments[i] instanceof MessagePort) window.__stolen++; } return Reflect.apply(oa, this, arguments); };
window.addEventListener('focus', function () { document.getElementById('i').focus(); });
setInterval(function () { soda.action('tick'); }, 300);
</script></body>`;

  test("isComposing・Function.prototype.call を差し替えた中身でも、土台の Esc が効き、port は拾われず、［操作を終える］でも端末へ戻れる", async ({ page, appServer }) => {
    const { paneId, input } = await openScriptBrowser(page, appServer);
    const w = await runDisplay(appServer, paneId, ["wait", "g"]);
    await setScriptOk(appServer, paneId, "g", HOSTILE);
    await expect(scriptFrameLoc(page).locator("#i")).toBeAttached();
    const f = await scriptFrame(page);
    await engageBtn(page).click();
    await expect(page.locator("[data-pane-panel]")).toHaveAttribute("data-display-engaged", "1");
    await expect(page.locator("[data-pane-panel] [data-display-end]")).toBeVisible();
    await expect(page.locator("[data-pane-panel-engaged-note]")).toHaveText("入力はこの表示に届きます（Esc か［操作を終える］で端末へ）");
    // (a) 土台の Esc が効く
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-pane-panel]")).toHaveAttribute("data-display-engaged", "0");
    // (b) ［操作を終える］で戻れる
    await engageBtn(page).click();
    await expect(page.locator("[data-pane-panel]")).toHaveAttribute("data-display-engaged", "1");
    await page.locator("[data-pane-panel] [data-display-end]").click();
    await expect(page.locator("[data-pane-panel]")).toHaveAttribute("data-display-engaged", "0");
    await expect.poll(() => activeTag(page)).not.toContain("IFRAME");
    const n = input().length;
    await page.keyboard.type("z");
    await expect.poll(() => input().slice(n).map((i) => i.text).join("")).toContain("z");
    // (c) 差し替えた call・apply が port を受け取っていない（pong・soda.action・rendered は土台の控えた関数で送られている）
    await page.waitForTimeout(1500);
    expect(await f.evaluate(() => (window as unknown as { __stolen: number }).__stolen)).toBe(0);
    expect((await w.done).lines[0]).toMatchObject({ type: "display.action", action: "tick", source: "script" });
    await expect(scriptFrameEl(page)).toHaveCount(1); // 親からは健全（pong が返り続けている）
  });
});

test("(5) 知らせ（トースト）が、スクリプトの面の見出し（固定のラベル・印・［操作する］・［×］）に重ならない", async ({ page, appServer }) => {
  const { paneId } = await openScriptBrowser(page, appServer);
  await setScriptOk(appServer, paneId, "a", "<p>a</p>");
  await expect(page.locator("[data-pane-panel] [data-display-script-mark]")).toBeVisible();
  // 静的な面が移って閉じる（スクリプトの面は閉じない）→ 知らせが出る（4 秒で消える。初回の案内も出ている）
  await ok(await runDisplay(appServer, paneId, ["set", "b", "--kind", "band", "--html-file", await writeTmp("<p>b</p>")]));
  const bh = await page.locator("[data-pane-bands] iframe[data-display-frame]").elementHandle();
  await (await bh!.contentFrame())!.goto(`${appServer.origin}/display-view/frame.html?moved`).catch(() => undefined);
  await expect(page.locator(".toast", { hasText: "別のページへ移ろうとしたので閉じました" }).first()).toBeVisible({ timeout: 8000 });
  // 知らせは 4 秒で消えるので、同じ瞬間に、箱を全部読む。
  const r = await page.evaluate(() => {
    const rect = (e: Element) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
    const sels = ["[data-pane-panel] .pane-panel-head", "[data-pane-panel] [data-display-script-mark]", "[data-pane-panel] [data-display-engage]", "[data-pane-panel] [data-pane-panel-close]"];
    return { heads: sels.map((s) => ({ s, r: document.querySelector(s) ? rect(document.querySelector(s)!) : null })), toasts: [...document.querySelectorAll(".toast")].map(rect) };
  });
  const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  expect(r.toasts.length).toBeGreaterThan(0);
  for (const h of r.heads) {
    expect(h.r, `${h.s} がある`).not.toBeNull();
    for (const t of r.toasts) expect(overlap(h.r!, t), `${h.s} と知らせが重ならない`).toBe(false);
  }
});
