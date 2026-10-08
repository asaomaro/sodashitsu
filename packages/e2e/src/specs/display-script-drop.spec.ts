import { expect, test } from "../support/fixtures.js";
import { prefixKey } from "../support/keys.js";
import { runDisplay } from "../support/display.js";
import { ok, openScriptBrowser, scriptFrameEl, setScriptOk } from "../support/displayScript.js";

/**
 * フォーカスの脱落（20261007-soda-extensions の 5 回目の再レビュー）。**面を先に出す → 端末を本物のクリック → すぐ 80 キー**。
 * 面自身の落としが、利用者の押下の窓に重なる。以前は「利用者が自分で外した」と取り違えて戻さず、検知が止まった（0/80）。
 * 「利用者が自分で外した」の免除は無くした（脱落の戻しの経路に残していない）。この筋は `--workers=1` で単独で流す。
 */
const DROPS: Record<string, { script: string; breaker: boolean }> = {
  raf: { script: "(function f(){window.focus();parent.focus();requestAnimationFrame(f);})();", breaker: true },
  mc: { script: "var c=new MessageChannel();c.port1.onmessage=function(){window.focus();parent.focus();c.port2.postMessage(0);};c.port2.postMessage(0);", breaker: true },
  interval4: { script: "setInterval(function(){window.focus();parent.focus();},4);", breaker: true },
  interval300: { script: "setInterval(function(){window.focus();parent.focus();},300);", breaker: false },
};
const html = (script: string): string => `<!doctype html><body><p>H</p><script>${script}</script></body>`;
const REPS = 5;

test.describe("面を先に出す → 本物のクリック → すぐ 80 キー", () => {
  test.describe.configure({ timeout: 90_000 });
  for (const [kind, d] of Object.entries(DROPS)) {
    for (let rep = 0; rep < REPS; rep++) {
      test(`${kind} #${rep}`, async ({ page, appServer }) => {
        const { paneId, input } = await openScriptBrowser(page, appServer);
        await setScriptOk(appServer, paneId, "g", html(d.script));
        await expect(scriptFrameEl(page)).toHaveCount(1);
        await page.locator(".xterm-screen").first().click(); // 本物のクリック
        const b = input().length;
        for (let i = 0; i < 80; i++) {
          await page.keyboard.press("a");
          await page.waitForTimeout(25);
        }
        const reached = input().slice(b).filter((x) => x.paneId === paneId).length;
        const frames = await scriptFrameEl(page).count();
        const active = await page.evaluate(() => document.activeElement?.tagName);
        console.log(`MEASURE drop-first ${kind} #${rep}: typed=80 reached=${reached} frames-after=${frames} active=${active}`);
        // 直す前は rAF 6/6・MC 5/6 が 0/80（activeElement=BODY・遮断器は働かない）。
        expect(reached).toBeGreaterThanOrEqual(d.breaker ? 40 : 70);
        if (d.breaker) {
          expect(frames).toBe(0); // 遮断器が働いた
          await expect(page.locator("[data-display-note]").first()).toContainText("入力のフォーカスが繰り返し外されたので");
        } else {
          expect(frames).toBe(1); // ゆっくりした落としは止めない
        }
      });
    }
  }
});

test.describe("面が既に落としている状態で、利用者が操作する（免除が無くても、入力は端末へ届く）", () => {
  test.describe.configure({ timeout: 90_000 });
  const slow = html("setInterval(function(){window.focus();parent.focus();},300);");

  async function typeAndCount(page: import("@playwright/test").Page, input: () => { paneId: string }[], paneId: string, n = 30): Promise<number> {
    const b = input().length;
    for (let i = 0; i < n; i++) {
      await page.keyboard.press("a");
      await page.waitForTimeout(25);
    }
    return input().slice(b).filter((x) => x.paneId === paneId).length;
  }

  test("覆いを押す", async ({ page, appServer }) => {
    const { paneId, input } = await openScriptBrowser(page, appServer);
    await page.locator(".xterm-screen").first().click();
    await setScriptOk(appServer, paneId, "g", slow);
    await expect(scriptFrameEl(page)).toHaveCount(1);
    await page.locator(".display-frame-cover").first().click({ position: { x: 5, y: 5 } });
    expect(await typeAndCount(page, input, paneId)).toBeGreaterThanOrEqual(26);
  });

  test("余白（タブバー・サイドバーの空き）を押す: 端末へ戻る（スクリプトの面が載っている間の代償）", async ({ page, appServer }) => {
    const { paneId, input } = await openScriptBrowser(page, appServer);
    await page.locator(".xterm-screen").first().click();
    await setScriptOk(appServer, paneId, "g", slow);
    await expect(scriptFrameEl(page)).toHaveCount(1);
    await page.mouse.click(2, 2); // 左上の隅（フォーカスを受けない余白）
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
    expect(await typeAndCount(page, input, paneId)).toBeGreaterThanOrEqual(26);
  });

  test("別の pane の端末を押す: そちらへ入力が届く", async ({ page, appServer }) => {
    const { paneId, input } = await openScriptBrowser(page, appServer);
    await page.locator(".xterm-screen").first().click();
    await setScriptOk(appServer, paneId, "g", slow);
    await prefixKey(page, "-"); // 分割
    await expect(page.locator(".xterm-screen")).toHaveCount(2);
    await page.locator(".xterm-screen").nth(1).click();
    const b = input().length;
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("a");
      await page.waitForTimeout(25);
    }
    const all = input().slice(b);
    const second = all.filter((x) => x.paneId !== paneId).length;
    expect(second).toBeGreaterThanOrEqual(26);
  });

  test("設定を開いて閉じる: 閉じたあと、入力が端末へ届く", async ({ page, appServer }) => {
    const { paneId, input } = await openScriptBrowser(page, appServer);
    await page.locator(".xterm-screen").first().click();
    await setScriptOk(appServer, paneId, "g", slow);
    await expect(scriptFrameEl(page)).toHaveCount(1);
    await prefixKey(page, "s");
    const dlg = page.locator("dialog.settings-dialog");
    await expect(dlg).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dlg).toBeHidden();
    await page.waitForTimeout(500);
    expect(await typeAndCount(page, input, paneId)).toBeGreaterThanOrEqual(26);
    expect(((await ok(await runDisplay(appServer, paneId, ["list"]))).json as { displays: unknown[] }).displays).toHaveLength(1);
  });
});
