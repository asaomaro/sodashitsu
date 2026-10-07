import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import type { AppServer } from "../support/appServer.js";
import { runDisplay, watchDisplaySubscriptions, watchSentDisplay } from "../support/display.js";
import { watchClientViews } from "../support/panes.js";
import { watchSentInput } from "../support/frames.js";

/**
 * パネルの幅のつまみ（20261007-soda-extensions の design「パネルの幅のつまみ」。AC35）の E2E。合否は、ブラウザが送った `client.view`（CDP）・要素の箱・
 * `aria-valuenow`・再読み込みの後の幅で見る。端末（WebGL）の文字は DOM から読めないので、「打った文字が pane へ届いたか」は、ブラウザが送った入力のフレームで見る。
 */
const HANDLE = "[data-pane-panel-resize]";
const PANEL = "[data-pane-panel]";

async function open(page: Page, appServer: AppServer) {
  const client = await appServer.openClient();
  const paneId = client.helloSnapshot()!.panes[0]!.id;
  const subs = await watchDisplaySubscriptions(page);
  const views = await watchClientViews(page);
  const input = await watchSentInput(page);
  await watchSentDisplay(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await subs.waitFor(1);
  return { paneId, views, input };
}
async function setPanel(appServer: AppServer, paneId: string, size = 320): Promise<void> {
  const r = await runDisplay(appServer, paneId, ["set", "side", "--kind", "panel", "--size", String(size), "--text", "x"]);
  expect((await r.done).code).toBe(0);
}
const panelWidth = async (page: Page): Promise<number> => (await page.locator(PANEL).boundingBox())!.width;
const valueNow = async (page: Page): Promise<number> => Number(await page.locator(HANDLE).getAttribute("aria-valuenow"));
async function handleCenter(page: Page): Promise<{ x: number; y: number }> {
  const b = (await page.locator(HANDLE).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
const cols = (views: Awaited<ReturnType<typeof open>>["views"]): number | undefined => views.latest()?.visible[0]?.cols;

test("つまみをドラッグしている間は client.view が増えず、離した後に 1 回だけ増えて列数が変わる。aria-valuenow とパネルの幅が合う", async ({ page, appServer }) => {
  const { paneId, views, input } = await open(page, appServer);
  await setPanel(appServer, paneId);
  await expect(page.locator(PANEL)).toBeVisible();
  await expect.poll(() => panelWidth(page)).toBe(320);
  await expect.poll(() => valueNow(page)).toBe(320);
  await page.waitForTimeout(600); // 開いたときの client.view が落ち着くまで（時間の根拠ではなく、基準の数を取るため）
  const colsBefore = cols(views)!;
  const base = views.count();
  const c = await handleCenter(page);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x - 40, c.y, { steps: 4 });
  await page.mouse.move(c.x - 100, c.y, { steps: 6 });
  // ドラッグ中: 幅は変わらず（案内の線が動き）、aria-valuenow だけが動く。
  expect(await panelWidth(page)).toBe(320);
  await expect.poll(() => valueNow(page)).toBe(420);
  await expect(page.locator("[data-pane-frame-guide]")).toHaveCount(1);
  // ドラッグ中に打った文字は端末へ漏れない。
  await page.keyboard.type("zq");
  expect(views.count()).toBe(base);
  await page.mouse.up();
  await expect.poll(() => panelWidth(page)).toBe(420);
  await expect(page.locator("[data-pane-frame-guide]")).toHaveCount(0);
  await expect.poll(() => views.count()).toBe(base + 1);
  expect(cols(views)!).toBeLessThan(colsBefore);
  expect(input().some((i) => i.text.includes("z") || i.text.includes("q"))).toBe(false);
  expect(await valueNow(page)).toBe(420);
});

test("Esc で元の幅・ダブルクリックで --size の幅に戻る", async ({ page, appServer }) => {
  const { paneId } = await open(page, appServer);
  await setPanel(appServer, paneId, 360);
  await expect.poll(() => panelWidth(page)).toBe(360);
  let c = await handleCenter(page);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x - 80, c.y, { steps: 5 });
  await expect.poll(() => valueNow(page)).toBe(440);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await panelWidth(page)).toBe(360);
  await expect(page.locator("[data-pane-frame-guide]")).toHaveCount(0);
  // 広げて確定してから、ダブルクリックで --size へ。
  c = await handleCenter(page);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x - 60, c.y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => panelWidth(page)).toBe(420);
  await page.locator(HANDLE).dblclick();
  await expect.poll(() => panelWidth(page)).toBe(360);
});

test("キーボード: ←/→/Shift/Home/End/Enter。最小 160 と最大（pane の半分・端末 40 列）で止まる。端末へ流れない", async ({ page, appServer }) => {
  const { paneId, input } = await open(page, appServer);
  await setPanel(appServer, paneId);
  await expect.poll(() => panelWidth(page)).toBe(320);
  await page.locator(HANDLE).focus();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => panelWidth(page)).toBe(336);
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(() => panelWidth(page)).toBe(272);
  await page.keyboard.press("Home");
  await expect.poll(() => panelWidth(page)).toBe(160);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  expect(await panelWidth(page)).toBe(160);
  await page.keyboard.press("End");
  const max = Number(await page.locator(HANDLE).getAttribute("aria-valuemax"));
  await expect.poll(() => panelWidth(page)).toBe(max);
  // 最大は pane の半分と、端末 40 列を残す幅の小さい方。
  const paneW = (await page.locator(".pane-frame-body").first().boundingBox())!.width;
  expect(max).toBeLessThanOrEqual(Math.floor(paneW / 2));
  const mainW = (await page.locator("[data-pane-frame-main]").boundingBox())!.width;
  expect(mainW).toBeGreaterThan(40 * 6);
  await page.keyboard.press("Enter");
  await expect.poll(() => panelWidth(page)).toBe(320);
  expect(input().length).toBe(0); // 端末へ何も送られていない
});

test("覚えた幅は再読み込みの後も残り、--size を変えた set の後も利用者の幅のまま。別のブラウザ（別の画面）の幅は変わらない", async ({ page, appServer, browser }) => {
  const { paneId } = await open(page, appServer);
  await setPanel(appServer, paneId);
  await page.locator(HANDLE).focus();
  await page.keyboard.press("Shift+ArrowLeft");
  await expect.poll(() => panelWidth(page)).toBe(384);
  await setPanel(appServer, paneId, 500); // プログラムが --size を変えても
  await expect.poll(() => page.locator(PANEL).getAttribute("data-display-engaged")).toBe("0");
  await page.waitForTimeout(300);
  expect(await panelWidth(page)).toBe(384);
  await page.reload();
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await expect.poll(() => panelWidth(page)).toBe(384);
  // 2 つ目のブラウザ（別の localStorage）は --size の幅のまま。
  const ctx2 = await browser.newContext();
  try {
    const page2 = await ctx2.newPage();
    await page2.goto(`${appServer.origin}/#token=${appServer.token}`);
    await page2.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
    await expect.poll(async () => (await page2.locator(PANEL).boundingBox())?.width).toBe(500);
  } finally {
    await ctx2.close();
  }
});
