import { expect, test } from "../support/fixtures.js";
import { runDisplay } from "../support/display.js";
import { writeTmp } from "../support/displayBrowser.js";
import { activeTag, browserVersion, engageBtn, focusTerminal, ok, openScriptBrowser, scriptFrame, scriptFrameEl, scriptFrameLoc, setScript, setScriptOk } from "../support/displayScript.js";

/**
 * フォーカスの番（備え (b)。T28 の (5)・(7)）。端末にフォーカスを置いた状態で、スクリプトが取りに来る。
 * 合否はブラウザの側の観測（親の `document.activeElement`・ブラウザが pane へ送った入力のフレーム・`events` の行・トースト）で見る。
 */

const STEAL = (ms = 50) => `<!doctype html><body><input id=i><script>
window.__steals = 0;
setInterval(function () { window.focus(); document.getElementById('i').focus(); window.__steals++; }, ${ms});
</script></body>`;

test("(5) 端末にフォーカスを置いて 50ms ごとに取り続ける中身: 戻され、3 回で面が閉じ（枠が外れる）、トーストと display.closed(focus_steal)。閉じた後に打ったキーは全部 pane に届く。直後の script-html の set は誤り・html は通る", async ({ page, appServer }) => {
  const { paneId, input } = await openScriptBrowser(page, appServer);
  await focusTerminal(page);
  const ev = await runDisplay(appServer, paneId, ["events", "g"]);
  expect((await ev.nextLine())["type"]).toBe("display.ready");
  const typed: string[] = [];
  await setScriptOk(appServer, paneId, "g", STEAL());
  // 取られたら戻る: 閉じるまでの間、親の activeElement が iframe のまま居座らない
  let stuck = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 8000 && (await scriptFrameEl(page).count()) > 0) {
    if ((await activeTag(page)).includes("IFRAME")) stuck++;
    await page.waitForTimeout(25);
  }
  await expect(scriptFrameEl(page)).toHaveCount(0);
  const closed = await ev.nextLine(15_000);
  expect(closed).toMatchObject({ type: "display.closed", name: "g", reason: "focus_steal" });
  await expect(page.getByText(/キー入力を取ろうとし続けたので閉じました/)).toBeVisible();
  console.log(`MEASURE steal-loop: browser=${browserVersion(page)} samples-with-iframe-active=${stuck}`);
  // 閉じた後に打ったキーは全部 pane に届く
  await expect.poll(() => activeTag(page)).not.toContain("IFRAME");
  const before = input().length;
  await page.keyboard.type("after");
  await expect.poll(() => input().slice(before).map((i) => i.text).join("")).toContain("after");
  typed.push("after");
  // 直後の script-html の set は誤り（冷却）、html の set は通る
  const again = await setScript(appServer, paneId, "g2", "<p>x</p>");
  const r = await again.done;
  expect(r.code).toBe(1);
  expect(r.stderr).toMatch(/display_busy|script-html/);
  await ok(await runDisplay(appServer, paneId, ["set", "h", "--kind", "panel", "--html-file", await writeTmp("<p>static</p>")]));
  await expect(page.locator("[data-pane-panel] iframe[data-display-frame]:not([data-display-script])")).toHaveCount(1);
  ev.kill();
});

test("(5)(ix) 1 回だけ focus() を呼ぶ中身は、元の場所へ戻るだけで、面は閉じない", async ({ page, appServer }) => {
  const { paneId, input } = await openScriptBrowser(page, appServer);
  await focusTerminal(page);
  await setScriptOk(appServer, paneId, "g", `<!doctype html><body><input id=i><script>setTimeout(function () { window.focus(); document.getElementById('i').focus(); document.title = 'did'; }, 300);</script></body>`);
  await expect.poll(async () => (await scriptFrame(page)).evaluate(() => document.title)).toBe("did");
  await page.waitForTimeout(600);
  await expect(scriptFrameEl(page)).toHaveCount(1);
  expect(await activeTag(page)).not.toContain("IFRAME");
  const before = input().length;
  await page.keyboard.type("ok");
  await expect.poll(() => input().slice(before).map((i) => i.text).join("")).toContain("ok");
});
