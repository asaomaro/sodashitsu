import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { runDisplay } from "../support/display.js";
import { writeTmp } from "../support/displayBrowser.js";
import { ok, openScriptBrowser, scriptFrameEl, scriptFrameLoc, setScript, setScriptOk } from "../support/displayScript.js";

/**
 * スクリプトが動く表示の設定（`displayScriptEnabled`。**既定は無効**。利用者の決定。20261007-soda-extensions）。
 * 検査の本物はサーバ（`DisplayService` の `set`・`send`）。設定の画面で切り替えられ、無効にすると出ている面が閉じる。
 */
const dialog = (page: Page) => page.locator("dialog.settings-dialog");
const toggle = (page: Page) => dialog(page).locator("[data-settings-display-script]");

async function openSettings(page: Page): Promise<void> {
  await page.locator(".xterm-helper-textarea").first().focus();
  await page.keyboard.press("Control+b");
  await page.keyboard.press("s");
  await expect(dialog(page)).toHaveAttribute("open", "");
}

test("既定は無効: script-html の set は display_script_disabled（終了コード 1）で断られ、面は出ない。静的な形式は出せる。--features が「無効」を示す（未対応とは別）", async ({ page, appServer }) => {
  const { paneId } = await openScriptBrowser(page, appServer, { disabled: true });
  const r = await (await setScript(appServer, paneId, "g", "<p>x</p>")).done;
  expect(r.code).toBe(1);
  expect(r.stderr).toMatch(/display_script_disabled/);
  expect(r.stdout).not.toMatch(/unsupported/);
  await expect(scriptFrameEl(page)).toHaveCount(0);
  await ok(await runDisplay(appServer, paneId, ["set", "st", "--kind", "panel", "--html-file", await writeTmp("<p id=s>static</p>")]));
  await expect(page.frameLocator("[data-pane-panel] iframe[data-display-frame]").locator("#s")).toHaveText("static");
  const f = (await ok(await runDisplay(appServer, paneId, ["--features"]))).json as { server: { scriptEnabled: boolean; features: string[] } };
  expect(f.server.scriptEnabled).toBe(false);
  expect(f.server.features).toContain("format:script-html");
  // 設定が無効なままなら、pane の中（ログインなしの受け口）からは出せない（認証の情報を読んでログインすれば変えられる。それは防がない）
  expect((await (await setScript(appServer, paneId, "g", "<p>x</p>")).done).code).toBe(1);
});

test("設定の画面で切り替える: 有効にすると script-html の面が出て（印・［操作する］）、無効にすると出ている面が閉じる（display.closed の理由 script_disabled・トースト）", async ({ page, appServer }) => {
  const { paneId } = await openScriptBrowser(page, appServer, { disabled: true });
  const ev = await runDisplay(appServer, paneId, ["events", "g"]);
  await ev.nextLine();
  await openSettings(page);
  await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
  await expect(dialog(page).locator("#settings-display-script-note")).toContainText("信頼できるプログラムだけ");
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  // 有効になった: 次の set から出せる
  await expect.poll(async () => (await (await setScript(appServer, paneId, "g", "<p id=p>on</p>")).done).code, { timeout: 8000 }).toBe(0);
  await expect(scriptFrameLoc(page).locator("#p")).toHaveText("on");
  await expect(page.locator("[data-pane-panel] [data-display-script-mark]")).toBeVisible();
  // 無効に戻す: 出ている面が閉じる
  await openSettings(page);
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");
  await expect(scriptFrameEl(page)).toHaveCount(0, { timeout: 8000 });
  expect(await ev.nextLine(8000)).toMatchObject({ type: "display.closed", name: "g", reason: "script_disabled" });
  await expect(page.locator(".toast", { hasText: "設定で無効にされたので閉じました" }).first()).toBeAttached();
  expect((await (await setScript(appServer, paneId, "g", "<p>x</p>")).done).stderr).toMatch(/display_script_disabled/);
  ev.kill();
});

test("有効にしてあれば、PR3 の筋と同じに出せる（helper で有効にして始める）", async ({ page, appServer }) => {
  const { paneId } = await openScriptBrowser(page, appServer);
  await setScriptOk(appServer, paneId, "g", "<p id=p>ok</p>");
  await expect(scriptFrameLoc(page).locator("#p")).toHaveText("ok");
});
