import type { Frame, Page } from "@playwright/test";
import type { AppServer } from "./appServer.js";
import { runDisplay, type DisplayRun } from "./display.js";
import { openDisplayBrowser, writeTmp } from "./displayBrowser.js";
import { watchSentInput } from "./frames.js";

/** スクリプトが動く形式の E2E の共通の補助。 */

export const SCRIPT_FRAME = "[data-pane-panel] iframe[data-display-script]";
export const scriptFrameLoc = (page: Page) => page.frameLocator(SCRIPT_FRAME);
export const scriptFrameEl = (page: Page) => page.locator(SCRIPT_FRAME);
export const engageBtn = (page: Page) => page.locator("[data-pane-panel] [data-display-engage]");

/** ブラウザを開き、ブラウザが pane へ送った入力のフレームの記録つきで返す。 */
export async function openScriptBrowser(page: Page, appServer: AppServer) {
  const input = await watchSentInput(page);
  const b = await openDisplayBrowser(page, appServer);
  return { ...b, input };
}

export async function ok(run: DisplayRun): Promise<Awaited<DisplayRun["done"]>> {
  const r = await run.done;
  if (r.code !== 0) throw new Error(`sodactl exited ${r.code}: ${r.stderr}${r.stdout}`);
  return r;
}

/** `--script-html-file` で面を出す（既定は panel）。 */
export async function setScript(
  appServer: AppServer,
  paneId: string,
  name: string,
  html: string,
  opts: { kind?: "panel" | "band"; extra?: string[]; login?: boolean } = {},
) {
  const path = await writeTmp(html, `${name}.html`);
  return runDisplay(appServer, paneId, ["set", name, "--kind", opts.kind ?? "panel", "--script-html-file", path, ...(opts.extra ?? [])], opts.login ? { login: true } : {});
}

export async function setScriptOk(appServer: AppServer, paneId: string, name: string, html: string, opts: { kind?: "panel" | "band"; extra?: string[] } = {}) {
  return ok(await setScript(appServer, paneId, name, html, opts));
}

export async function scriptFrame(page: Page): Promise<Frame> {
  const h = await scriptFrameEl(page).first().elementHandle();
  const f = await h!.contentFrame();
  if (!f) throw new Error("no script content frame");
  return f;
}

/** 親の文書で、いまフォーカスのある要素（`iframe` ならそのタグ）。 */
export const activeTag = (page: Page): Promise<string> => page.evaluate(() => `${document.activeElement?.tagName ?? ""}${(document.activeElement as HTMLElement | null)?.hasAttribute?.("data-display-script") ? "[script]" : ""}`);

/** ブラウザの名前と版。 */
export const browserVersion = (page: Page): string => `${page.context().browser()?.browserType().name() ?? "?"} ${page.context().browser()?.version() ?? "?"}`;

/** pane の端末にフォーカスを置く。 */
export async function focusTerminal(page: Page): Promise<void> {
  await page.locator(".xterm-helper-textarea").first().focus();
}
