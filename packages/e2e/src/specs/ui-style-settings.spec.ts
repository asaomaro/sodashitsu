import type { BrowserContext, Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { focusTerminal, prefixKey } from "../support/keys.js";
import { watchClientViews } from "../support/panes.js";

/**
 * 画面の様式（20261008-ui-style。`data-ui-style`）の E2E。**判定は、ブラウザの側（`<html>` の属性・設定の画面の部品）で行う**（条項 e2e-observe-browser）。
 * - 最初の描画は、**本体（main.ts）が走る前**の `<html>` の属性（`readystatechange` の `interactive`——classic の `theme-boot.js` は走り終え、module の本体はまだ）で記録する。
 */

/** 本体（module）が走る前の `<html data-ui-style>` を記録する（`theme-boot.js` が当てた値）。 */
async function recordFirstPaint(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    document.addEventListener("readystatechange", () => {
      if (document.readyState !== "interactive") return;
      (window as unknown as { __sodaFirstUiStyle: unknown }).__sodaFirstUiStyle = document.documentElement.getAttribute("data-ui-style");
    });
  });
}
const firstUiStyle = (page: Page) => page.evaluate(() => (window as unknown as { __sodaFirstUiStyle?: string | null }).__sodaFirstUiStyle);
const uiStyleAttr = (page: Page) => page.evaluate(() => document.documentElement.getAttribute("data-ui-style"));

async function open(page: Page, appServer: AppServer): Promise<void> {
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
}

test("再読み込みのとき、最初の描画（本体が走る前）の時点で、前の様式（modern）が当たっている。classic のときは属性が無い", async ({ page, appServer, context }) => {
  await recordFirstPaint(context);
  const client = await appServer.openClient();
  // 1 回目: 設定が無い → classic（本体が走った後に、classic が当たる）。最初の描画の時点では、属性は無い（クラシック）。
  await open(page, appServer);
  expect(await firstUiStyle(page)).toBeNull();
  await expect.poll(() => uiStyleAttr(page)).toBe("classic");
  // modern にする（共有の設定。別のブラウザ・端末から変えた形）。動いている間に、再読み込みなしで変わる。
  await client.request("prefs.set", { patch: { uiStyle: "modern" } });
  await expect.poll(() => uiStyleAttr(page)).toBe("modern");
  // 控えが書き直されるのを待ってから、再読み込み。
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("soda.themeBoot.v1") ?? "null")?.uiStyle ?? null)).toBe("modern");
  await page.reload();
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  expect(await firstUiStyle(page), "本体が走る前の時点で、modern が当たっている").toBe("modern");
  expect(await uiStyleAttr(page)).toBe("modern");
  // classic へ戻す → 再読み込みの最初の描画で、modern が一瞬見えない。
  await client.request("prefs.set", { patch: { uiStyle: "classic" } });
  await expect.poll(() => uiStyleAttr(page)).toBe("classic");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("soda.themeBoot.v1") ?? "null")?.uiStyle ?? null)).toBe("classic");
  await page.reload();
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  expect(await firstUiStyle(page)).toBeNull();
  client.close();
});

test("控えが壊れていても、アプリは classic で起動する（属性は本体が当てる）", async ({ page, appServer, context }) => {
  await recordFirstPaint(context);
  await context.addInitScript(() => localStorage.setItem("soda.themeBoot.v1", "{oops"));
  await open(page, appServer);
  expect(await firstUiStyle(page)).toBeNull();
  await expect.poll(() => uiStyleAttr(page)).toBe("classic");
});

test("設定の画面のラジオ「画面の様式」: 選ぶと再読み込みなしで data-ui-style が変わり、同じ利用者の別のブラウザにも反映される。再読み込みしても残る", async ({ page, appServer, browser }) => {
  await open(page, appServer);
  // 別のブラウザ（別の context）。
  const otherCtx = await browser.newContext();
  const other = await otherCtx.newPage();
  await open(other, appServer);
  await expect.poll(() => uiStyleAttr(page)).toBe("classic");
  await expect.poll(() => uiStyleAttr(other)).toBe("classic");

  await focusTerminal(page);
  await prefixKey(page, "s");
  const dialog = page.locator("dialog.settings-dialog");
  await expect(dialog).toHaveAttribute("open", "");
  await dialog.locator("nav.settings-menu button", { hasText: "表示" }).click();
  const radio = (value: string) => dialog.locator(`input[type="radio"][name="settings-ui-style"][value="${value}"]`);
  await expect(radio("classic")).toBeChecked();
  await expect(dialog.locator('fieldset:has(input[name="settings-ui-style"]) legend')).toHaveText("画面の様式");

  await radio("modern").check();
  await expect.poll(() => uiStyleAttr(page), "再読み込みなしで変わる").toBe("modern");
  await expect.poll(() => uiStyleAttr(other), "別のブラウザにも反映される").toBe("modern");
  // 設定の画面を開いたままでも、ラジオの選びは保たれる。
  await expect(radio("modern")).toBeChecked();

  // 再読み込みしても残る（最初の描画の時点で modern）。
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("soda.themeBoot.v1") ?? "null")?.uiStyle ?? null)).toBe("modern");
  await page.reload();
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  expect(await uiStyleAttr(page)).toBe("modern");

  // クラシックへ戻す（別のブラウザ側の画面から）→ こちらにも反映。
  await focusTerminal(other);
  await prefixKey(other, "s");
  const dialogOther = other.locator("dialog.settings-dialog");
  await expect(dialogOther).toHaveAttribute("open", "");
  await dialogOther.locator("nav.settings-menu button", { hasText: "表示" }).click();
  await dialogOther.locator('input[type="radio"][name="settings-ui-style"][value="classic"]').check();
  await expect.poll(() => uiStyleAttr(other)).toBe("classic");
  await expect.poll(() => uiStyleAttr(page)).toBe("classic");
  await otherCtx.close();
});

/** 箱（`[data-pane-frame-main]`）の大きさ。2 つの pane は、幅・高さの順に並べる。 */
const boxSizes = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-pane-frame-main]"))
      .map((main) => {
        const r = main.getBoundingClientRect();
        return { w: r.width, h: r.height };
      })
      .sort((a, b) => a.w - b.w || a.h - b.h),
  );

/** 升目の大きさの範囲（cols = floor(幅 / 升目の幅) を満たす）。1 つの箱と、その桁・行から出す。 */
function cellRange(size: number, count: number): { lo: number; hi: number } {
  return { lo: size / (count + 1), hi: size / count };
}

test("様式の切り替え（すき間が変わる）で、client.view が落ち着き、端末が箱に合ったまま崩れない。分割の比率は変わらない", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const paneId = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.split", { paneId, direction: "right" });
  const views = await watchClientViews(page);
  await open(page, appServer);
  await expect(page.locator(".xterm-helper-textarea")).toHaveCount(2);
  const settle = async (): Promise<void> => {
    let last = -1;
    for (let i = 0; i < 40; i++) {
      const c = views.count();
      if (c === last) return;
      last = c;
      await page.waitForTimeout(300);
    }
  };
  const widths = () => page.locator("[data-pane-frame-main]").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
  await settle();
  const classicWidths = await widths();
  // 最初（クラシック）の箱と、申告した桁・行から、升目の大きさの範囲を出す（文字の大きさは様式で変わらない）。以後の申告は、この範囲の升目で、箱に収まる桁・行でなければならない。
  const box0 = (await boxSizes(page))[0]!;
  const v0 = [...views.latest()!.visible].sort((a, b) => a.cols - b.cols)[0]!;
  const cw = cellRange(box0.w, v0.cols);
  const ch = cellRange(box0.h, v0.rows);
  const expectFits = async (label: string): Promise<void> => {
    const boxes = await boxSizes(page);
    const vs = [...views.latest()!.visible].sort((a, b) => a.cols - b.cols);
    expect(vs.length, label).toBe(boxes.length);
    boxes.forEach((b, i) => {
      const v = vs[i]!;
      const detail = `${label}: box ${b.w}x${b.h} 申告 ${v.cols}x${v.rows}`;
      // 申告の桁・行は、どれかの升目（範囲の中）で、箱にちょうど収まる数（もう 1 つ増やすと溢れる）。
      expect(v.cols, detail).toBeGreaterThanOrEqual(Math.floor(b.w / cw.hi));
      expect(v.cols, detail).toBeLessThanOrEqual(Math.floor(b.w / cw.lo));
      expect(v.rows, detail).toBeGreaterThanOrEqual(Math.floor(b.h / ch.hi));
      expect(v.rows, detail).toBeLessThanOrEqual(Math.floor(b.h / ch.lo));
    });
  };
  await expectFits("classic");
  const snapshotCols = () => views.latest()!.visible.map((v) => `${v.cols}x${v.rows}`);
  const classicCells = snapshotCols();

  for (const [style, thickness] of [["modern", "default"], ["modern", "thick"], ["modern", "thin"], ["classic", "default"]] as const) {
    const before = views.count();
    await client.request("prefs.set", { patch: { uiStyle: style, paneFrameThickness: thickness } });
    await expect.poll(() => uiStyleAttr(page)).toBe(style);
    await settle();
    const sent = views.count() - before;
    expect(sent, `${style}/${thickness}: 切り替えの後に送られた client.view`).toBeLessThanOrEqual(2);
    // ブラウザが最後に申告した桁と行が、いまの箱に合っている（古い値のまま残らない）。
    await expectFits(`${style}/${thickness}`);
    // 陽性の対照: モダンの太さは、クラシックの既定（4px）より広い（細い 4px は同じなので除く）ので、箱が実際に狭くなっている（検査が、何も動かない状態で通っていない）。
    if (style === "modern" && thickness !== "thin") expect((await boxSizes(page))[0]!.w, `${style}/${thickness} の箱の幅`).toBeLessThan(box0.w);
    const gapPx = await page.evaluate(() => getComputedStyle(document.querySelector(".app-shell")!).getPropertyValue("--soda-pane-gap"));
    expect(gapPx.trim()).toBe(`${{ "modern/thin": 4, "modern/default": 8, "modern/thick": 12, "classic/default": 4 }[`${style}/${thickness}` as "modern/thin"]}px`);
  }
  // クラシック（既定）へ戻すと、桁と行・箱の幅も、元の値に戻る（分割の比率は変わらない）。
  expect(snapshotCols()).toEqual(classicCells);
  expect(await widths()).toEqual(classicWidths);
  client.close();
});
