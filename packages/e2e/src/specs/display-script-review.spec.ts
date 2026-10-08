import { expect, test } from "../support/fixtures.js";
import { runDisplay } from "../support/display.js";
import { writeTmp } from "../support/displayBrowser.js";
import { clickBlankAppSpace } from "../support/displayLayout.js";
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

  test("4ms ごとの繰り返し: 遮断器がこの画面のスクリプトの枠を止め（サーバの面は閉じず・冷却に入らず）、打った文字が端末に届く。知らせが出る", async ({ page, appServer }) => {
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
    expect(toPane).toBeGreaterThan(typed * 0.8);
    expect(stealReports(sent)).toBe(0);
    await expect(scriptFrameEl(page)).toHaveCount(0); // 遮断器が、この画面の枠を DOM から外した
    await expect(page.locator("[data-pane-panel] [data-display-note]")).toContainText("入力のフォーカスが繰り返し外されたので、この画面ではスクリプトの表示を止めました");
    const listed = await ok(await runDisplay(appServer, paneId, ["list"]));
    expect((listed.json as { displays: unknown[] }).displays).toHaveLength(1); // サーバの面は閉じない
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

  test("実測: 端末を実クリック → 覆いを実クリック → 10 キー、を 6 回。400ms ごとに落とす面でも、失われるキーは少数（覆いを押した後の脱落も戻す）", async ({ page, appServer }) => {
    test.setTimeout(60_000);
    const { paneId, input } = await openScriptBrowser(page, appServer);
    await setScriptOk(appServer, paneId, "g", dropEvery(400));
    await expect(scriptFrameEl(page)).toHaveCount(1);
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
    for (let round = 0; round < 6; round++) {
      const box = (await page.locator(".xterm-screen").first().boundingBox())!;
      await page.mouse.click(box.x + 40, box.y + 40); // 端末を実クリック
      const cover = (await page.locator("[data-pane-panel] [data-display-cover]").boundingBox())!;
      await page.mouse.click(cover.x + 20, cover.y + 20); // 覆いを実クリック（フォーカスは動かない）
      for (let k = 0; k < 10; k++) {
        await page.keyboard.press("k");
        typed++;
        await page.waitForTimeout(25);
      }
      await page.waitForTimeout(300);
    }
    const reached = input().slice(n).filter((i) => i.paneId === paneId).length;
    console.log(`MEASURE focus-drop-cover-click: interval=400ms typed=${typed} reached-pane=${reached} lost=${typed - reached}`);
    expect(reached).toBeGreaterThan(typed * 0.8);
    await expect(scriptFrameEl(page)).toHaveCount(1); // 400ms ごとでは遮断器は働かない（戻すだけ）
  });

  for (const kind of ["requestAnimationFrame", "MessageChannel"] as const) {
    test(`遮断器: ${kind} で落とし続ける面は、この画面のスクリプトの枠を全部止める（無害な面も）。打ったキーは全部端末に届く。［再開］で面ごとに戻る。数えず、冷却に入らない`, async ({ page, appServer }) => {
      test.setTimeout(60_000);
      const { paneId, input, sent } = await openScriptBrowser(page, appServer);
      const loop =
        kind === "requestAnimationFrame"
          ? "function f() { window.__drop(); requestAnimationFrame(f); } requestAnimationFrame(f);"
          : "var ch = new MessageChannel(); ch.port1.onmessage = function () { window.__drop(); ch.port2.postMessage(0); }; ch.port2.postMessage(0);";
      await setScriptOk(appServer, paneId, "benign", "<p id=b>benign</p>");
      await expect(scriptFrameEl(page)).toHaveCount(1);
      await focusTerminal(page);
      await setScriptOk(appServer, paneId, "evil", PAGE.replace("</script>", `${loop}</script>`), { kind: "band" }); // 帯（パネルのタブに隠れず、枠が動く）
      // 止まるまで（数秒）にも打ち続ける。止まったあとに打つキーは全部届く。
      await expect(page.locator("[data-display-note]").first()).toContainText("入力のフォーカスが繰り返し外されたので", { timeout: 15_000 });
      await expect(scriptFrameEl(page)).toHaveCount(0);
      await page.screenshot({ path: `/tmp/claude-1000/-workspaces-sodashitsu/957621e5-6a11-4044-ad8d-c86e30053090/scratchpad/display-pr3/05-breaker-${kind}.png` });
      await focusTerminal(page);
      const n = input().length;
      for (let k = 0; k < 20; k++) {
        await page.keyboard.press("q");
        await page.waitForTimeout(20);
      }
      await page.waitForTimeout(300);
      const reached = input().slice(n).filter((i) => i.paneId === paneId).length;
      console.log(`MEASURE breaker-${kind}: typed-after-trip=20 reached-pane=${reached}`);
      expect(reached).toBe(20);
      expect(stealReports(sent)).toBe(0);
      await expect(page.locator(".toast", { hasText: "入力のフォーカスが繰り返し外されたので" }).first()).toBeAttached();
      // サーバの面は閉じず、冷却にも入っていない
      expect(((await ok(await runDisplay(appServer, paneId, ["list"]))).json as { displays: unknown[] }).displays).toHaveLength(2);
      expect((await (await setScript(appServer, paneId, "again", "<p>x</p>")).done).code).toBe(0);
      // 無害な面は［再開］で戻る（表示している面の分）
      const resume = page.locator("[data-display-redisplay]").first();
      await expect(resume).toHaveText("再開");
    });
  }

  for (const kind of ["requestAnimationFrame", "MessageChannel"] as const) {
    test(`第4回の再レビューの手順: 端末をクリック → 面を出して**すぐ**80 キー打つ、を 3 回。${kind} でも毎回、遮断器が働き、その後のキーは全部届く（時機に頼らない順序の確かめは focusDrop.test.ts。ここは、手順の通しで毎回働くことの確認）`, async ({ page, appServer }) => {
      test.setTimeout(120_000);
      const { paneId, input } = await openScriptBrowser(page, appServer);
      const loop =
        kind === "requestAnimationFrame"
          ? "function f() { window.__drop(); requestAnimationFrame(f); } requestAnimationFrame(f);"
          : "var ch = new MessageChannel(); ch.port1.onmessage = function () { window.__drop(); ch.port2.postMessage(0); }; ch.port2.postMessage(0);";
      for (let round = 0; round < 3; round++) {
        await focusTerminal(page); // 本物のクリック
        const name = `evil${round}`;
        const n = input().length;
        await setScriptOk(appServer, paneId, name, PAGE.replace("</script>", `${loop}</script>`), { kind: "band" });
        // すぐ打つ（出す直後から。見回りの位相は、回ごとにずれる）
        for (let k = 0; k < 80; k++) {
          await page.keyboard.press("x");
          await page.waitForTimeout(15);
        }
        const during = input().slice(n).filter((i) => i.paneId === paneId).length;
        console.log(`MEASURE breaker-immediate-${kind}: round=${round} typed=80 reached-pane=${during}`);
        await expect(page.locator("[data-display-note]").first()).toContainText("入力のフォーカスが繰り返し外されたので", { timeout: 15_000 });
        await expect(scriptFrameEl(page)).toHaveCount(0);
        await focusTerminal(page);
        const m = input().length;
        for (let k = 0; k < 20; k++) {
          await page.keyboard.press("q");
          await page.waitForTimeout(20);
        }
        await page.waitForTimeout(300);
        const after = input().slice(m).filter((i) => i.paneId === paneId).length;
        console.log(`MEASURE breaker-after-${kind}: round=${round} typed=20 reached-pane=${after}`);
        expect(after).toBe(20);
        expect(during).toBeGreaterThan(0); // 直す前は 0/80（戻らないまま、遮断器も数えない）
        await ok(await runDisplay(appServer, paneId, ["close", name]));
        await expect(page.locator("[data-display-note]")).toHaveCount(0);
      }
    });
  }

  test("無関係な pane を冷却に入れない: p1 に無害な面・p2 に落とす面。p1 も p2 も冷却に入らず、サーバの面はどちらも閉じない（この画面の枠は、遮断器で両方止まる）", async ({ page, appServer }) => {
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
    // サーバの面は、どちらも閉じない（遮断器は、この画面の枠を止めるだけ。無害な面も止まる）
    const l1 = await ok(await runDisplay(appServer, paneId, ["list"]));
    const l2 = await ok(await runDisplay(appServer, p2, ["list"]));
    expect((l1.json as { displays: unknown[] }).displays).toHaveLength(1);
    expect((l2.json as { displays: unknown[] }).displays).toHaveLength(1);
    expect(input().slice(n).filter((i) => i.paneId === paneId).length).toBeGreaterThan(30);
    // どちらの pane も、script-html を出し直せる（冷却に入っていない）
    expect((await (await setScript(appServer, paneId, "benign2", "<p>x</p>")).done).code).toBe(0);
    expect((await (await setScript(appServer, p2, "evil2", "<p>x</p>")).done).code).toBe(0);
  });

  test("余白を押して外したフォーカスは、スクリプトの面が載っている間は端末へ戻る（免除は無い。代償）。知らせは出ず、サーバへも知らせない", async ({ page, appServer }) => {
    const { paneId, sent } = await openScriptBrowser(page, appServer);
    await setScriptOk(appServer, paneId, "g", PAGE);
    await expect(scriptFrameLoc(page).locator("p")).toBeAttached();
    await focusTerminal(page);
    await page.waitForTimeout(300);
    await clickBlankAppSpace(page); // フォーカスを受けないサイドバーの空き（見出しのつかむ場所は、いまは押してもフォーカスを取らない部品）
    await page.waitForTimeout(500);
    expect(await activeTag(page)).toBe("TEXTAREA");
    expect(stealReports(sent)).toBe(0);
    await expect(page.locator(".toast", { hasText: "入力のフォーカスを繰り返し外しています" })).toHaveCount(0);
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
