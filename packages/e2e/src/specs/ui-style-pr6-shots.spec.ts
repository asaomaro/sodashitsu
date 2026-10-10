import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ThemeName } from "@sodashitsu/protocol";
import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { focusTerminal, prefixKey } from "../support/keys.js";

/**
 * tab バーの設定・tab と画面の切り替えのボタンの見た目・モダンのカードの絵（20261008-ui-style の PR6）。`UI_STYLE_PR6_SHOTS_DIR` を渡したときだけ撮る。**判定はしない**（撮るだけ）。
 * 名前は `<様式>-<テーマ>-<番号>-<場面>.png`。場面: 1 tab が 1 つ（既定）・2 tab が 3 つ・3 グラフの画面・4 設定「表示」の tab バーの項目・5 tab が 1 つで「常に出す」を入れた状態（クラシックで見える）。
 */
const OUT = process.env["UI_STYLE_PR6_SHOTS_DIR"];
test.skip(OUT === undefined, "UI_STYLE_PR6_SHOTS_DIR を渡したときだけ撮る");
test.use({ viewport: { width: 1500, height: 820 } });
test.setTimeout(90_000);

const dirs: string[] = [];
test.afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

const THEMES: { key: string; theme: ThemeName }[] = [
  { key: "dark", theme: "dracula" },
  { key: "light", theme: "catppuccin-latte" },
];

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT!, `${name}.png`), animations: "disabled", caret: "hide" });
}

for (const { key, theme } of THEMES)
  for (const style of ["classic", "modern"] as const)
    test(`pr6-${style}-${key}`, async ({ page, appServer }) => {
      await mkdir(OUT!, { recursive: true });
      const prefix = `${style}-${key}`;
      const client = await appServer.openClient();
      const initial = client.helloSnapshot()!.workspaces[0]!;
      const cwd = await mkdtemp(join(tmpdir(), "soda-ui-style-"));
      dirs.push(cwd);
      const created = await client.request("workspace.create", { cwd, label: "alpha" });
      const ws = created.workspace;
      await client.request("workspace.close", { workspaceId: initial.id });
      await client.request("tab.rename", { tabId: ws.tabIds[0]!, label: "main" });
      await client.request("pane.split", { paneId: created.pane.id, direction: "right" });
      const beta = await client.request("workspace.create", { cwd, label: "beta" });
      await client.request("group.create", { label: "team", workspaceId: beta.workspace.id });
      await client.request("workspace.focus", { workspaceId: ws.id });
      await client.request("prefs.set", { patch: { theme, themeAuto: false, uiStyle: style } });
      await page.goto(`${appServer.origin}/#token=${appServer.token}`);
      await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset["uiStyle"])).toBe(style);
      await page.mouse.move(900, 600);
      await shot(page, `${prefix}-1-single-tab`);
      // 5: tab が 1 つで「常に出す」を入れた状態（クラシックで見える）。見終えたら既定に戻す。
      await client.request("prefs.set", { patch: { tabBarAlways: true } });
      await expect(page.locator(".tab-bar")).toHaveCount(1);
      await page.mouse.move(900, 600);
      await shot(page, `${prefix}-5-always`);
      await client.request("prefs.set", { patch: { tabBarAlways: null } });
      await client.request("tab.create", { workspaceId: ws.id, label: "second" });
      await client.request("tab.create", { workspaceId: ws.id, label: "logs" });
      await client.request("tab.focus", { tabId: ws.tabIds[0]! });
      await expect(page.locator(".tab-bar-item")).toHaveCount(3);
      await page.mouse.move(900, 600);
      await shot(page, `${prefix}-2-tabs`);
      // 3: グラフの画面。
      await page.locator('[data-screen-id="graph"]').click();
      await expect(page.locator(".screen-switcher-btn-active")).toHaveAttribute("data-screen-id", "graph");
      await page.mouse.move(900, 700);
      await shot(page, `${prefix}-3-graph`);
      await page.locator('[data-screen-id="base"]').click();
      // 4: 設定「表示」。
      await focusTerminal(page);
      await prefixKey(page, "s");
      const dialog = page.locator("dialog.settings-dialog");
      await expect(dialog).toBeVisible();
      await dialog.locator("nav.settings-menu button", { hasText: "表示" }).click();
      await dialog.locator('[data-setting="tab-bar-always"]').scrollIntoViewIfNeeded();
      await shot(page, `${prefix}-4-settings`);
      await page.keyboard.press("Escape");
      client.close();
    });
