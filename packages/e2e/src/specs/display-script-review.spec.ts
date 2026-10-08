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

test.describe("フォーカスの脱落（レビュー 2。戻すだけ。数えない・冷却に入れない）", () => {
  const PAGE = `<!doctype html><body><p>drop</p><script>
window.__drop = function () { window.focus(); parent.focus(); };
</script></body>`;
  const dropEvery = (ms: number) => PAGE.replace("</script>", `setInterval(window.__drop, ${ms});</script>`);

  test("単発: window.focus(); parent.focus() で親の activeElement が body になっても、元の場所へ戻り、打った文字が端末に届く。数えず、面は閉じず、冷却に入らない", async ({ page, appServer }) => {
    const { paneId, input, sent } = await openScriptBrowser(page, appServer);
    await setScriptOk(appServer, paneId, "g", PAGE);
    await expect(scriptFrameLoc(page).locator("p")).toBeAttached();
    const f = await scriptFrame(page);
    await focusTerminal(page);
    await f.evaluate(() => (window as unknown as { __drop(): void }).__drop());
    await expect.poll(() => activeTag(page), { timeout: 5000 }).toContain("TEXTAREA");
    const n = input().length;
    await page.keyboard.type("hello");
    await expect.poll(() => input().slice(n).filter((i) => i.paneId === paneId).map((i) => i.text).join("")).toContain("hello");
    expect(stealReports(sent)).toBe(0);
    await expect(scriptFrameEl(page)).toHaveCount(1);
    await setScriptOk(appServer, paneId, "g2", "<p>ok</p>"); // 冷却に入っていない
  });

  test("4ms ごとの繰り返し: 打った文字が端末に届き、面は自動では閉じず・冷却に入らず、利用者への知らせが 1 回出る", async ({ page, appServer }) => {
    const { paneId, input, sent } = await openScriptBrowser(page, appServer);
    await setScriptOk(appServer, paneId, "g", dropEvery(4));
    await focusTerminal(page);
    await page.evaluate(() => {
      const w = window as unknown as { __noticed: boolean };
      w.__noticed = false;
      new MutationObserver(() => {
        if (Array.from(document.querySelectorAll(".toast")).some((t) => t.textContent?.includes("入力のフォーカスを繰り返し外しています"))) w.__noticed = true;
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    const n = input().length;
    let typed = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 4000) {
      await page.keyboard.press("x");
      typed++;
      await page.waitForTimeout(20);
    }
    const toPane = input().slice(n).filter((i) => i.paneId === paneId).length;
    console.log(`MEASURE focus-drop-loop-4ms: typed=${typed} reached-pane=${toPane}`);
    expect(toPane).toBeGreaterThan(typed * 0.5);
    expect(stealReports(sent)).toBe(0);
    await expect(scriptFrameEl(page)).toHaveCount(1); // 自動では閉じない
    expect(await page.evaluate(() => (window as unknown as { __noticed: boolean }).__noticed)).toBe(true); // 利用者への知らせが出た
    await setScriptOk(appServer, paneId, "g2", "<p>ok</p>"); // 冷却に入っていない
  });

  for (const ms of [300, 500, 900]) {
    test(`実測: 利用者が端末を実際にクリックしてから 10 キーずつ 6 回打つ。${ms}ms ごとに落とす面でも、失われるキーは少数`, async ({ page, appServer }) => {
      test.setTimeout(60_000);
      const { paneId, input } = await openScriptBrowser(page, appServer);
      await setScriptOk(appServer, paneId, "g", dropEvery(ms));
      await expect(scriptFrameEl(page)).toHaveCount(1);
      // 最初のクリックは端末の初期化（このテストの道具の都合）で入力が 1 回分届かないので、数えない準備の 1 回を先に行う。
      {
        const b0 = (await page.locator(".xterm-screen").first().boundingBox())!;
        await page.mouse.click(b0.x + 40, b0.y + 40);
        for (let k = 0; k < 10; k++) {
          await page.keyboard.press("w");
          await page.waitForTimeout(25);
        }
        await page.waitForTimeout(400);
      }
      const n = input().length;
      let typed = 0;
      const rounds: number[] = [];
      for (let round = 0; round < 6; round++) {
        const box = (await page.locator(".xterm-screen").first().boundingBox())!;
        await page.mouse.click(box.x + 40, box.y + 40); // 本物のクリック
        for (let k = 0; k < 10; k++) {
          await page.keyboard.press("k");
          typed++;
          await page.waitForTimeout(25);
        }
        await page.waitForTimeout(400);
        rounds.push(input().slice(n).filter((i) => i.paneId === paneId).length);
      }
      console.log(`MEASURE focus-drop-rounds: interval=${ms}ms cumulative-reached=${JSON.stringify(rounds)}`);
      const reached = input().slice(n).filter((i) => i.paneId === paneId).length;
      console.log(`MEASURE focus-drop-after-click: interval=${ms}ms typed=${typed} reached-pane=${reached} lost=${typed - reached}`);
      expect(reached).toBeGreaterThan(typed * 0.8);
      await expect(scriptFrameEl(page)).toHaveCount(1);
    });
  }

  test("無関係な pane を冷却に入れない: p1 に無害な面・p2 に落とす面。p1 も p2 も冷却に入らず、p1 の面は閉じない", async ({ page, appServer }) => {
    test.setTimeout(60_000);
    const { paneId, client, sent, input } = await openScriptBrowser(page, appServer);
    const p2 = (await client.request("pane.split", { paneId, direction: "right" })).pane.id;
    await setScriptOk(appServer, paneId, "benign", "<p id=b>benign</p>");
    await setScriptOk(appServer, p2, "evil", dropEvery(4));
    await expect(page.locator("[data-pane-panel] iframe[data-display-script]")).toHaveCount(2);
    await page.locator(".xterm-screen").first().click(); // p1 を選ぶ
    const n = input().length;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("p");
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(500);
    expect(stealReports(sent)).toBe(0);
    await expect(page.locator("[data-pane-panel] iframe[data-display-script]")).toHaveCount(2);
    expect(input().slice(n).filter((i) => i.paneId === paneId).length).toBeGreaterThan(30);
    // どちらの pane も、script-html を出し直せる（冷却に入っていない）
    expect((await (await setScript(appServer, paneId, "benign2", "<p>x</p>")).done).code).toBe(0);
    expect((await (await setScript(appServer, p2, "evil2", "<p>x</p>")).done).code).toBe(0);
  });

  test("不要な戻しが起きない: 余白を押して外したフォーカスは、端末へ引き戻されない", async ({ page, appServer }) => {
    const { paneId, sent } = await openScriptBrowser(page, appServer);
    await setScriptOk(appServer, paneId, "g", PAGE);
    await expect(scriptFrameLoc(page).locator("p")).toBeAttached();
    await focusTerminal(page);
    await page.waitForTimeout(300);
    await page.locator("[data-pane-panel-label]").click({ position: { x: 2, y: 2 } }); // フォーカスを受けない見出しの余白
    await page.waitForTimeout(1500);
    expect(await activeTag(page)).toBe("BODY");
    expect(stealReports(sent)).toBe(0);
  });

  test("不要な戻しが起きない: キー一覧のダイアログを開いて閉じる・タブを替える・pane を閉じる、のあと、フォーカスは利用者の側（いまの pane の端末）にあり、知らせも出ない", async ({ page, appServer }) => {
    test.setTimeout(60_000);
    const { paneId, client, input } = await openScriptBrowser(page, appServer);
    await setScriptOk(appServer, paneId, "g", PAGE);
    await expect(scriptFrameLoc(page).locator("p")).toBeAttached();
    await focusTerminal(page);
    // キー一覧（ダイアログ）を開いて閉じる
    await page.keyboard.press("Control+b");
    await page.keyboard.press("?");
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    // pane を分割して閉じる（フォーカスのある要素が文書から消える）
    const p2 = (await client.request("pane.split", { paneId, direction: "right" })).pane.id;
    await page.locator(".xterm-screen").nth(1).click();
    await client.request("pane.close", { paneId: p2 });
    await page.waitForTimeout(1200);
    const n = input().length;
    await page.keyboard.type("w");
    await page.waitForTimeout(500);
    console.log(`MEASURE no-unwanted-pull: active-after=${await activeTag(page)} typed-reached=${JSON.stringify(input().slice(n).map((i) => i.text).join(""))}`);
    await expect(page.locator(".toast", { hasText: "入力のフォーカスを繰り返し外しています" })).toHaveCount(0);
    await expect(scriptFrameEl(page)).toHaveCount(1);
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
    return { heads: sels.map((s) => ({ s, r: document.querySelector(s) ? rect(document.querySelector(s)!) : null })), toasts: Array.from(document.querySelectorAll(".toast")).map(rect) };
  });
  const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  expect(r.toasts.length).toBeGreaterThan(0);
  for (const h of r.heads) {
    expect(h.r, `${h.s} がある`).not.toBeNull();
    for (const t of r.toasts) expect(overlap(h.r!, t), `${h.s} と知らせが重ならない`).toBe(false);
  }
});
