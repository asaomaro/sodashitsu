import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ThemeName } from "@sodashitsu/protocol";
import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { launchFakeAgent, cleanupNotifyAgents } from "../support/notifyAgent.js";

/**
 * モダンの配置の絵（利用者が見る。20261008-ui-style の PR4）。`UI_STYLE_PR4_SHOTS_DIR` を渡したときだけ撮る。**判定はしない**（撮るだけ）。端末の中身を隠さない。
 * 組: クラシック・モダン × 暗い・明るい × 場面。名前は `<様式>-<テーマ>-<番号>-<場面>.png`（番号は、様式が違っても同じ場面なら同じ）。
 * 場面: 1 tab が 1 つの基本画面・2 tab が 3 つの基本画面・3 畳んだサイドバー・4 「新規」のメニュー（クラシックは、spaces の区画の中の［メニュー］）・5 全体のメニュー・6 workspace の右クリック。
 */
const OUT = process.env["UI_STYLE_PR4_SHOTS_DIR"];
test.skip(OUT === undefined, "UI_STYLE_PR4_SHOTS_DIR を渡したときだけ撮る");
test.use({ viewport: { width: 1500, height: 820 } });
test.setTimeout(90_000);

const dirs: string[] = [];
test.afterEach(async () => {
  await cleanupNotifyAgents();
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

const THEMES: { key: string; theme: ThemeName }[] = [
  { key: "dark", theme: "dracula" },
  { key: "light", theme: "catppuccin-latte" },
];

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  for (let i = 0; i < 10 && (await page.locator(".toast").count()) > 0; i++) await page.locator(".toast").first().dispatchEvent("click", undefined, { timeout: 1000 }).catch(() => undefined);
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT!, `${name}.png`), animations: "disabled", caret: "hide" });
}

for (const { key, theme } of THEMES)
  for (const style of ["classic", "modern"] as const)
    test(`${style}-${key}`, async ({ page, appServer }) => {
      await mkdir(OUT!, { recursive: true });
      const prefix = `${style}-${key}`;
      const client = await appServer.openClient();
      const initial = client.helloSnapshot()!.workspaces[0]!;
      const cwd = await mkdtemp(join(tmpdir(), "soda-ui-style-"));
      dirs.push(cwd);
      const created = await client.request("workspace.create", { cwd, label: "alpha" });
      const ws = created.workspace;
      const p1 = created.pane.id;
      await client.request("workspace.close", { workspaceId: initial.id });
      await client.request("tab.rename", { tabId: ws.tabIds[0]!, label: "main" });
      const split = await client.request("pane.split", { paneId: p1, direction: "right" });
      const beta = await client.request("workspace.create", { cwd, label: "beta" });
      await client.request("group.create", { label: "team", workspaceId: beta.workspace.id });
      await client.request("workspace.focus", { workspaceId: ws.id });
      await client.request("prefs.set", { patch: { theme, themeAuto: false, uiStyle: style } });
      await page.goto(`${appServer.origin}/#token=${appServer.token}`);
      await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset["uiStyle"])).toBe(style);
      await expect(page.locator(".xterm-helper-textarea")).toHaveCount(2);
      for (const id of [p1, split.pane.id]) await client.request("pane.subscribe", { paneId: id, scrollbackLines: 200 });
      const a1 = await launchFakeAgent(page, client, p1, { via: "client" });
      const a2 = await launchFakeAgent(page, client, split.pane.id, { via: "client" });
      await a1.work();
      await a2.block();
      // 1: tab が 1 つ。
      await shot(page, `${prefix}-1-single-tab`);
      // 2: tab が 3 つ。
      await client.request("tab.create", { workspaceId: ws.id, label: "second" });
      await client.request("tab.create", { workspaceId: ws.id, label: "logs" });
      await client.request("tab.focus", { tabId: ws.tabIds[0]! });
      await expect(page.locator(".tab-bar-item")).toHaveCount(3);
      await shot(page, `${prefix}-2-tabs`);
      // 3: 畳んだサイドバー。
      await page.locator(".sidebar-collapse-btn, .sidebar-edge-toggle").first().click();
      await expect(page.locator(".sidebar-collapsed")).toHaveCount(1);
      await page.mouse.move(900, 500);
      await shot(page, `${prefix}-3-collapsed`);
      await page.locator(".sidebar-collapse-btn, .sidebar-edge-toggle").first().click();
      await expect(page.locator(".sidebar-collapsed")).toHaveCount(0);
      await page.mouse.move(900, 500);
      // 4: 「新規」のメニュー（クラシックは、spaces の区画の中の［メニュー］）。
      await page.locator(style === "modern" ? '[data-sidebar-act="new"]' : ".sidebar-section-footer .sidebar-btn-right").click();
      await expect(page.getByRole("menu")).toBeVisible();
      await shot(page, `${prefix}-4-new-menu`);
      await page.keyboard.press("Escape");
      // 5: 全体のメニュー。
      await page.locator(style === "modern" ? '[data-sidebar-act="menu"]' : ".sidebar-section-footer .sidebar-btn-right").click();
      await expect(page.getByRole("menu")).toBeVisible();
      await shot(page, `${prefix}-5-global-menu`);
      await page.keyboard.press("Escape");
      // 6: workspace の右クリック。
      await page.locator("[data-workspace-row-key]").filter({ hasText: "beta" }).first().click({ button: "right" });
      await expect(page.getByRole("menu")).toBeVisible();
      await shot(page, `${prefix}-6-row-menu`);
      await page.keyboard.press("Escape");
      client.close();
    });

/**
 * pane の操作ボタン（モダンだけ。AC19〜AC22）の絵。名前は `<様式>-<テーマ>-<番号>-actions-<場面>.png`。
 * 場面: 1 ふつう（名前の行の右端）・2 最大化している間（同じ場所が「元に戻す」）・3 小さな pane（分割を隠す）・4 名前の行が無い設定（右上の隅。ポインタが載っている pane）。
 * クラシックは、同じ場面を撮る（ボタンは出ない）。
 */
for (const { key, theme } of THEMES)
  for (const style of ["classic", "modern"] as const)
    test(`actions-${style}-${key}`, async ({ page, appServer }) => {
      await mkdir(OUT!, { recursive: true });
      const prefix = `${style}-${key}`;
      const client = await appServer.openClient();
      const p1 = client.helloSnapshot()!.panes[0]!.id;
      await client.request("pane.rename", { paneId: p1, label: "alpha" });
      const split = await client.request("pane.split", { paneId: p1, direction: "right" });
      await client.request("pane.rename", { paneId: split.pane.id, label: "beta" });
      await client.request("prefs.set", { patch: { theme, themeAuto: false, uiStyle: style, paneAgentNameVisible: true } });
      await page.goto(`${appServer.origin}/#token=${appServer.token}`);
      await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset["uiStyle"])).toBe(style);
      await expect(page.locator(".xterm-helper-textarea")).toHaveCount(2);
      await page.mouse.move(700, 700);
      await shot(page, `${prefix}-7-actions-1-normal`);
      // 2: 最大化している間。
      await client.request("pane.zoom", { paneId: split.pane.id, mode: "toggle" });
      await expect(page.locator("[data-pane-frame-main]")).toHaveCount(1);
      await shot(page, `${prefix}-7-actions-2-zoomed`);
      await client.request("pane.zoom", { paneId: split.pane.id, mode: "toggle" });
      await expect(page.locator("[data-pane-frame-main]")).toHaveCount(2);
      // 3: 小さな pane（さらに分割して、狭くする）。
      await client.request("pane.split", { paneId: p1, direction: "right" });
      await client.request("pane.split", { paneId: p1, direction: "right" });
      await expect(page.locator("[data-pane-frame-main]")).toHaveCount(4);
      await page.mouse.move(700, 700);
      await shot(page, `${prefix}-7-actions-3-small`);
      // 4: 名前の行が無い設定（右上の隅。ポインタを載せた pane に出る）。
      await client.request("prefs.set", { patch: { paneAgentNameVisible: false } });
      await expect(page.locator(".pane-frame-name")).toHaveCount(0);
      const box = (await page.locator(".pane-frame-center").last().boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(300);
      await shot(page, `${prefix}-7-actions-4-corner`);
      client.close();
    });
