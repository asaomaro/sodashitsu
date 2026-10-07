import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Frame, Page } from "@playwright/test";
import type { AppServer } from "./appServer.js";
import { watchDisplaySubscriptions, watchSentDisplay } from "./display.js";
import { watchClientViews } from "./panes.js";

/** 表示の面の E2E の共通の補助（ブラウザを開く・枠の取り方・一時ファイル）。 */

export const frameLoc = (page: Page) => page.frameLocator("iframe[data-display-frame]");
export const frameEl = (page: Page) => page.locator("iframe[data-display-frame]");
export const panelFrameLoc = (page: Page) => page.frameLocator("[data-pane-panel] iframe[data-display-frame]");
export const bandFrameLoc = (page: Page) => page.frameLocator("[data-pane-bands] iframe[data-display-frame]");

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

/** 一時ディレクトリにファイルを書いて、そのパスを返す。 */
export async function writeTmp(content: string, name = "c.html"): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "soda-e2e-display-file-"));
  const p = join(dir, name);
  await writeFile(p, content);
  return p;
}
