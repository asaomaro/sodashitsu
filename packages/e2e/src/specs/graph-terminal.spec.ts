import type { Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { watchAskSubscriptions } from "../support/ask.js";
import { enableScript, setScriptOk } from "../support/displayScript.js";
import { expect, test } from "../support/fixtures.js";
import { watchReceivedFrames, watchSentInput } from "../support/frames.js";
import { prefixKey } from "../support/keys.js";
import { watchClientViews } from "../support/panes.js";

/**
 * グラフの上の端末の窓（20261008-graph-first の PR2a。T13h）。ノードを押すと、グラフの上に、その pane の端末が動かせる窓として開く。基本画面へは移らない。
 * 判定は利用者が見る場所（DOM・フォーカス・箱・ブラウザが受けた／送ったフレーム）で行う（条項 `e2e-observe-browser`）。端末の中身は WebGL（canvas）で描かれ DOM から文字を取れないので、
 * 出力は「ブラウザが受けた OUTPUT」、見た目は「要素のスクリーンショットの一致」で代わりに観測する。テスト自身のクライアントは前提（pane を足す）とサーバの状態（PTY の大きさ）の確認にだけ使う。
 */

const graphView = (page: Page) => page.locator(".graph-view");
const win = (page: Page) => page.locator("[data-graph-terminal-window]");
const winTextarea = (page: Page) => win(page).locator(".xterm-helper-textarea");
const node = (page: Page, paneId: string) => graphView(page).locator(`[data-node-key="local:${paneId}"]`);

async function setup(page: Page, appServer: AppServer) {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  const created = client.waitForEvent("pane.created", (e) => e.data.pane.id !== p1);
  await client.request("pane.split", { paneId: p1, direction: "right" });
  const p2 = (await created).data.pane.id;
  const input = await watchSentInput(page);
  const frames = await watchReceivedFrames(page);
  const views = await watchClientViews(page);
  const subs = await watchAskSubscriptions(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await subs.waitFor(1);
  await expect(page.locator(".xterm-helper-textarea")).toHaveCount(2);
  await page.locator(".xterm-helper-textarea").first().focus();
  return { client, p1, p2, input, frames, views };
}

async function openGraph(page: Page) {
  await prefixKey(page, "a");
  await expect(graphView(page)).toBeVisible();
}

/** ノードの本体を押す（動かさずに離す＝窓を開く）。 */
async function pressNode(page: Page, paneId: string) {
  const b = (await node(page, paneId).boundingBox())!;
  await page.mouse.click(b.x + 30, b.y + 8);
}

const activeInWindow = (page: Page) => page.evaluate(() => document.activeElement?.closest("[data-graph-terminal-window]") !== null && document.activeElement?.classList.contains("xterm-helper-textarea") === true);
const activeIsBody = (page: Page) => page.evaluate(() => document.activeElement === document.body);

test("ノードを押すと、グラフの上に端末の窓が開く（基本画面へは移らない）。窓の中で打つと pane に届き、出力が窓に出る", async ({ page, appServer }) => {
  const { p1, input, frames } = await setup(page, appServer);
  await openGraph(page);
  await pressNode(page, p1);
  await expect(win(page)).toBeVisible();
  await expect(graphView(page)).toBeVisible(); // 基本画面へは移らない
  await expect.poll(() => activeInWindow(page)).toBe(true);
  await page.keyboard.type("echo from-window-1");
  await page.keyboard.press("Enter");
  await expect.poll(() => input().filter((i) => i.paneId === p1).map((i) => i.text).join("")).toContain("echo from-window-1");
  await expect.poll(() => frames.output(0, p1)).toContain("from-window-1");
});
