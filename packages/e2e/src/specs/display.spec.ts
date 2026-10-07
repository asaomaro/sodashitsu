import type { Frame, Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import type { AppServer } from "../support/appServer.js";
import { runDisplay, watchDisplaySubscriptions, watchSentDisplay } from "../support/display.js";
import { watchClientViews } from "../support/panes.js";

/**
 * 表示の面（`sodactl display`。20261007-soda-extensions）の E2E。ビルドした `sodactl` を子プロセスで起動し、合否はブラウザの側の実測で見る
 * （`e2e-observe-browser`）: 枠の中の DOM（`frameLocator`）・要素の箱・計算済みのスタイル・ブラウザが送った要求（CDP）。
 * テスト自身の接続は、pane の用意にだけ使う。
 */

export const frameLoc = (page: Page) => page.frameLocator("iframe[data-display-frame]");
export const frameEl = (page: Page) => page.locator("iframe[data-display-frame]");

/** ブラウザを開き、「表示を出せる画面」として登録されるまで待つ。pane の id と、ブラウザの観測を返す。 */
export async function openDisplayBrowser(page: Page, appServer: AppServer) {
  const client = await appServer.openClient();
  const paneId = client.helloSnapshot()!.panes[0]!.id;
  const subs = await watchDisplaySubscriptions(page);
  const sent = await watchSentDisplay(page);
  const views = await watchClientViews(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await subs.waitFor(1);
  return { client, paneId, sent, views };
}

export async function contentFrame(page: Page): Promise<Frame> {
  const h = await frameEl(page).elementHandle();
  const f = await h!.contentFrame();
  if (!f) throw new Error("no content frame");
  return f;
}

const box = async (loc: ReturnType<Page["locator"]>) => (await loc.boundingBox())!;

test("ログインなしの set --kind panel / band で、枠の中に中身が出る・パネルは端末の右・帯は端末の上（AC1）", async ({ page, appServer }) => {
  const { paneId } = await openDisplayBrowser(page, appServer);
  const panel = await runDisplay(appServer, paneId, ["set", "side", "--kind", "panel", "--title", "横", "--html-file", await tmpFile("<h1 id=h>パネルの見出し</h1><p>本文</p>")]);
  expect((await panel.done).code).toBe(0);
  const panelFrame = page.locator("[data-pane-panel] iframe[data-display-frame]");
  await expect(panelFrame).toHaveCount(1);
  await expect(page.frameLocator("[data-pane-panel] iframe[data-display-frame]").locator("h1#h")).toHaveText("パネルの見出し");
  const band = await runDisplay(appServer, paneId, ["set", "top", "--kind", "band", "--text", "帯の文字"]);
  expect((await band.done).code).toBe(0);
  await expect(page.frameLocator("[data-pane-bands] iframe[data-display-frame]").locator("pre")).toHaveText("帯の文字");

  const main = await box(page.locator("[data-pane-frame-main]"));
  const pnl = await box(page.locator("[data-pane-panel]"));
  const bnd = await box(page.locator("[data-pane-bands]"));
  expect(pnl.x).toBeGreaterThanOrEqual(main.x + main.width - 1); // パネルは端末の右
  expect(bnd.y + bnd.height).toBeLessThanOrEqual(main.y + 1); // 帯は端末の上
  expect(main.x + main.width).toBeLessThanOrEqual(pnl.x + 1);
  // 枠の sandbox は design の値（allow-same-origin なし）。
  await expect(panelFrame).toHaveAttribute("sandbox", "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox");
});

test("実測 (a) 中身が port 経由で届く／(b) frame.evaluate が script-src 'self' の枠で動く（不確かな点 1・2）", async ({ page, appServer }) => {
  const { paneId } = await openDisplayBrowser(page, appServer);
  await (await runDisplay(appServer, paneId, ["set", "m", "--kind", "panel", "--text", "port 経由"])).done;
  // (a) 中身が見える＝MessageChannel の port が不透明 origin の枠へ渡り、render が届いた。
  await expect(frameLoc(page).locator("pre")).toHaveText("port 経由");
  // (b) 枠の文書の中で式を評価できる。
  const f = await contentFrame(page);
  expect(await f.evaluate(() => 1 + 1)).toBe(2);
  // 枠の origin は不透明（親から文書に触れない）。
  expect(await frameEl(page).evaluate((el) => (el as HTMLIFrameElement).contentDocument === null)).toBe(true);
  const probe = await f.evaluate(() => {
    const r: Record<string, string> = { locationOrigin: location.origin, selfOrigin: String(self.origin) };
    try { r.ls = String(localStorage.length); } catch (e) { r.ls = (e as Error).name; }
    try { r.parent = String(parent.document.title); } catch (e) { r.parent = (e as Error).name; }
    return r;
  });
  // `location.origin` は URL から出る値なので不透明 origin の証拠にならない。`self.origin` が "null"・保存領域と親の文書が SecurityError。
  expect(probe).toMatchObject({ selfOrigin: "null", ls: "SecurityError", parent: "SecurityError" });
});

async function tmpFile(content: string): Promise<string> {
  const { mkdtemp, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "soda-e2e-display-file-"));
  const p = join(dir, "c.html");
  await writeFile(p, content);
  return p;
}
