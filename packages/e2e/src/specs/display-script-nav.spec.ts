import { createServer } from "node:http";
import { expect, test } from "../support/fixtures.js";
import { runDisplay, startSink, watchSentDisplay } from "../support/display.js";
import { writeTmp } from "../support/displayBrowser.js";
import { getFreePort } from "../support/freePort.js";
import { browserVersion, ok, openScriptBrowser, scriptFrameEl, setScript, setScriptOk } from "../support/displayScript.js";

/**
 * 枠が別のページへ移ったときの検知（備え (c)。T28 の (6)）。合否の筋は、必ず移れる同じ origin の宛先（`/display-view/frame.html?moved`）を使う
 * （外の宛先だと、アプリの CSP が止めた場合に筋が空振りになる）。外の origin への移動・204・`window.stop()` は合否にしない実測（`MEASURE`）。
 */
const MOVED = "/display-view/frame.html?moved";

/** 面が閉じ、理由が navigated、その pane は冷却に入り、移った先が中身を受けていない。 */
async function expectNavigatedAndCooling(page: import("@playwright/test").Page, appServer: Parameters<typeof runDisplay>[0], paneId: string, ev: Awaited<ReturnType<typeof runDisplay>>, sent: Awaited<ReturnType<typeof watchSentDisplay>>, name = "g") {
  await expect(scriptFrameEl(page)).toHaveCount(0, { timeout: 8000 });
  expect(await ev.nextLine(8000)).toMatchObject({ type: "display.closed", name, reason: "navigated" });
  await expect(page.getByText(/別のページへ移ろうとしたので閉じました/)).toBeVisible();
  expect(sent.reports().some((r) => r.problem === "navigated" && r.format === "script-html")).toBe(true);
  expect(sent.actions()).toEqual([]);
  const again = await (await setScript(appServer, paneId, "g2", "<p>x</p>")).done;
  expect(again.code).toBe(1);
  expect(again.stderr).toMatch(/display_busy/);
  // 静的な形式は出せる
  await ok(await runDisplay(appServer, paneId, ["set", "h", "--kind", "panel", "--text", "ok"]));
}

test.describe("枠の移動（合否: 同じ origin の宛先）", () => {
  test("(6)(i) location.href で静的ページへ移る → 面が閉じ、トースト、navigated の知らせ、events に display.closed(navigated)、直後の script-html の set は冷却", async ({ page, appServer }) => {
    const { paneId, sent } = await openScriptBrowser(page, appServer);
    const ev = await runDisplay(appServer, paneId, ["events", "g"]);
    await ev.nextLine();
    await setScriptOk(appServer, paneId, "g", `<!doctype html><body><p>x</p><script>setTimeout(function () { location.href = '${MOVED}'; }, 500);</script></body>`);
    await expectNavigatedAndCooling(page, appServer, paneId, ev, sent);
    ev.kill();
  });

  test("(6)(ii) location.href = / （アプリの画面）でも閉じる。枠の中にアプリの画面が残らない", async ({ page, appServer }) => {
    const { paneId, sent } = await openScriptBrowser(page, appServer);
    const ev = await runDisplay(appServer, paneId, ["events", "g"]);
    await ev.nextLine();
    await setScriptOk(appServer, paneId, "g", `<!doctype html><body><script>setTimeout(function () { location.href = '/'; }, 500);</script></body>`);
    await expectNavigatedAndCooling(page, appServer, paneId, ev, sent);
    await expect(page.locator("iframe[data-display-script]")).toHaveCount(0); // アプリの画面が枠の中に残らない
    ev.kill();
  });

  test("(6)(iv) <meta http-equiv=refresh>（同じ宛先）でも閉じる", async ({ page, appServer }) => {
    const { paneId, sent } = await openScriptBrowser(page, appServer);
    const ev = await runDisplay(appServer, paneId, ["events", "g"]);
    await ev.nextLine();
    await setScriptOk(appServer, paneId, "g", `<!doctype html><head><meta http-equiv="refresh" content="1;url=${MOVED}"></head><body><p>x</p></body>`);
    await expectNavigatedAndCooling(page, appServer, paneId, ev, sent);
    ev.kill();
  });

  test("(6)(viii) 差し込みの最中に移る（最初のインラインのスクリプトが location を書き換える）: 10 秒待たずにすぐ閉じる。理由は navigated で、unresponsive ではない", async ({ page, appServer }) => {
    const { paneId, sent } = await openScriptBrowser(page, appServer);
    const ev = await runDisplay(appServer, paneId, ["events", "g"]);
    await ev.nextLine();
    const t0 = Date.now();
    await setScriptOk(appServer, paneId, "g", `<!doctype html><body><script>location.href = '${MOVED}';</script><p>after</p></body>`);
    await expectNavigatedAndCooling(page, appServer, paneId, ev, sent);
    expect(Date.now() - t0).toBeLessThan(7000);
    ev.kill();
  });

  test("(6)(viii) 中身がストアにある状態: パネルをたたんで戻す（枠が作り直され、中身はストアにあるので render が最初の load の後に送られる）と、移る中身は 2 回目の load で閉じる", async ({ page, appServer }) => {
    const { paneId, sent } = await openScriptBrowser(page, appServer);
    const ev = await runDisplay(appServer, paneId, ["events", "g"]);
    await ev.nextLine();
    // 2.5 秒後に移る中身。最初の枠が移る前にたたんで、広げる＝新しい枠（中身はストアにある）。
    await setScriptOk(appServer, paneId, "g", `<!doctype html><body><script>setTimeout(function () { location.href = '${MOVED}'; }, 2500);</script></body>`);
    await expect(scriptFrameEl(page)).toHaveCount(1);
    const first = await scriptFrameEl(page).elementHandle();
    await page.locator("[data-pane-panel-fold]").click();
    await expect(scriptFrameEl(page)).toHaveCount(0);
    await page.locator("[data-pane-panel-unfold]").click();
    await expect(scriptFrameEl(page)).toHaveCount(1);
    expect(await first!.evaluate((e) => e.isConnected)).toBe(false); // 別の枠
    await expectNavigatedAndCooling(page, appServer, paneId, ev, sent);
    ev.kill();
  });

  test("(6)(v) 正当な重い初期化は閉じない: 差し込みの中で同期に 2.5 秒、その後 3 秒ごとに 200ms の処理を続けても、15 秒たっても面が生きていて soda.action が届く", async ({ page, appServer }) => {
    test.setTimeout(60_000);
    const { paneId } = await openScriptBrowser(page, appServer);
    const w = await runDisplay(appServer, paneId, ["wait", "g"]);
    await setScriptOk(
      appServer,
      paneId,
      "g",
      `<!doctype html><body><p>heavy</p><script>
var t = Date.now(); while (Date.now() - t < 2500) {}
setInterval(function () { var u = Date.now(); while (Date.now() - u < 200) {} }, 3000);
setTimeout(function () { soda.action('alive'); }, 14000);
</script></body>`,
    );
    const r = await w.done;
    expect(r.lines[0]).toMatchObject({ type: "display.action", action: "alive", source: "script" });
    await expect(scriptFrameEl(page)).toHaveCount(1);
  });

  test("(6)(vi) 裏に回しても閉じない: 面を出したページを裏に回して 30 秒置き、戻しても面が生きている。裏の間に display.report を送っていない", async ({ page, appServer, context }) => {
    test.setTimeout(90_000);
    const { paneId, sent } = await openScriptBrowser(page, appServer);
    await setScriptOk(appServer, paneId, "g", `<!doctype html><body><p>bg</p></body>`);
    await expect(scriptFrameEl(page)).toHaveCount(1);
    // 別のタブを前に出しても、ヘッドレスの Chromium では visibilityState は hidden にならない（実測）。見えない状態を、getter の上書きで再現する。
    const other = await context.newPage();
    await other.goto("about:blank");
    await other.bringToFront();
    const natural = await page.evaluate(() => document.visibilityState);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(30_000);
    await page.evaluate(() => {
      delete (document as unknown as { visibilityState?: unknown }).visibilityState;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.bringToFront();
    await page.waitForTimeout(1500);
    console.log(`MEASURE background: natural-visibility-while-other-tab-front=${natural} (hidden is emulated for 30s)`);
    await expect(scriptFrameEl(page)).toHaveCount(1);
    expect(sent.reports()).toEqual([]);
  });

  test("(6)(xi)(iii) location.reload() で読み直した文書には、通り道も中身も渡らず（スクリプトがもう 1 回動かない）、navigated で閉じる", async ({ page, appServer }) => {
    const { paneId, sent } = await openScriptBrowser(page, appServer);
    const ev = await runDisplay(appServer, paneId, ["events", "g"]);
    await ev.nextLine();
    await setScriptOk(appServer, paneId, "g", `<!doctype html><body><script>
if (!window.__n) { window.__n = 1; setTimeout(function () { location.reload(); }, 500); }
</script></body>`);
    await expectNavigatedAndCooling(page, appServer, paneId, ev, sent);
    ev.kill();
  });
});

test.describe("枠の移動（合否にしない実測。ブラウザの版つきで test-result.md に書く）", () => {
  // 冷却に入ると同じサーバで続けられないので、1 試行ごとに別のサーバ（test ごとに fixture が起こす）で行う。
  const cases: { name: string; extra: string; target: (p: { sink: string; s204: string; slow: string }) => string }[] = [
    { name: "external-origin", extra: "", target: (p) => `${p.sink}/leak?d=secret` },
    { name: "localhost-other-port", extra: "", target: (p) => `${p.slow}/localhost-service` },
    { name: "http-204", extra: "", target: (p) => `${p.s204}/no-content` },
    { name: "http-204+window.stop", extra: "window.stop();", target: (p) => `${p.s204}/no-content-stop` },
    { name: "slow+window.stop", extra: "window.stop();", target: (p) => `${p.slow}/slow-stop` },
  ];
  for (const c of cases) {
    test(`(6)(ix) 実測: ${c.name}`, async ({ page, appServer }) => {
      test.setTimeout(60_000);
      const { paneId } = await openScriptBrowser(page, appServer);
      const sink = await startSink();
      const port204 = await getFreePort();
      const hits204: string[] = [];
      const s204 = createServer((req, res) => {
        hits204.push(req.url ?? "");
        res.statusCode = 204;
        res.end();
      });
      await new Promise<void>((r) => s204.listen(port204, "127.0.0.1", r));
      const portSlow = await getFreePort();
      const hitsSlow: string[] = [];
      const sSlow = createServer((req) => void hitsSlow.push(req.url ?? ""));
      await new Promise<void>((r) => sSlow.listen(portSlow, "127.0.0.1", r));
      try {
        const ev = await runDisplay(appServer, paneId, ["events", "g"]);
        await ev.nextLine();
        const target = c.target({ sink: sink.origin, s204: `http://127.0.0.1:${port204}`, slow: `http://127.0.0.1:${portSlow}` });
        await setScriptOk(appServer, paneId, "g", `<!doctype html><body><p id=p>x</p><script>window.__alive = 1; setTimeout(function () { location.href = '${target}'; ${c.extra} }, 500);</script></body>`);
        await page.waitForTimeout(6000);
        const closed = (await scriptFrameEl(page).count()) === 0;
        let alive = "n/a";
        if (!closed) alive = await (await (await scriptFrameEl(page).elementHandle())!.contentFrame())!.evaluate(() => String((window as unknown as { __alive?: number }).__alive)).catch((e: Error) => `eval-failed:${e.message.slice(0, 40)}`);
        const reached = { sink: sink.requests(), s204: hits204, slow: hitsSlow };
        console.log(`MEASURE navigate: browser=${browserVersion(page)} case=${c.name} closed=${closed} frame-document-alive=${alive} requests-reached=${JSON.stringify(reached)}`);
        ev.kill();
      } finally {
        await sink.close();
        s204.close();
        sSlow.close();
      }
      expect(true).toBe(true);
    });
  }
});
