import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ThemeName } from "@sodashitsu/protocol";
import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { set } from "../support/displayLayout.js";
import { launchFakeAgent, cleanupNotifyAgents } from "../support/notifyAgent.js";
import { prefixKey } from "../support/keys.js";

/**
 * 画面の様式の絵（利用者が、モダンの数値を決めるための絵。20261008-ui-style の PR2）。`UI_STYLE_PR2_SHOTS_DIR` を渡したときだけ撮る。**判定はしない**（撮るだけ）。
 * `scripts/ui-style-compare.mjs` の比較用の画像（`ui-style-shots.spec.ts`。端末の文字を隠す）とは別に、**端末の中身を隠さない**（偽のエージェントの画面の文字つき）。
 * 撮る組: クラシック（既定の太さ）・モダン（細い・既定・太い）× 暗い・明るい × 場面（基本画面・表示の面・グラフ・設定）。名前は `<様式>-<太さ>-<テーマ>-<場面>.png`。
 */
const OUT = process.env["UI_STYLE_PR2_SHOTS_DIR"];
test.skip(OUT === undefined, "UI_STYLE_PR2_SHOTS_DIR を渡したときだけ撮る");
test.use({ viewport: { width: 1700, height: 900 } });
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
const COMBOS = [
  { style: "classic", thickness: "default" },
  { style: "modern", thickness: "thin" },
  { style: "modern", thickness: "default" },
  { style: "modern", thickness: "thick" },
] as const;

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  for (let i = 0; i < 10 && (await page.locator(".toast").count()) > 0; i++) await page.locator(".toast").first().dispatchEvent("click", undefined, { timeout: 1000 }).catch(() => undefined);
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT!, `${name}.png`), animations: "disabled", caret: "hide" });
}

for (const { key, theme } of THEMES)
  for (const { style, thickness } of COMBOS)
    test(`${style}-${thickness}-${key}`, async ({ page, appServer }) => {
      await mkdir(OUT!, { recursive: true });
      const prefix = `${style}-${thickness}-${key}`;
      const client = await appServer.openClient();
      const initial = client.helloSnapshot()!.workspaces[0]!;
      const cwd = await mkdtemp(join(tmpdir(), "soda-ui-style-"));
      dirs.push(cwd);
      const created = await client.request("workspace.create", { cwd, label: "alpha" });
      const ws = created.workspace;
      const p1 = created.pane.id;
      await client.request("workspace.close", { workspaceId: initial.id });
      await client.request("tab.rename", { tabId: ws.tabIds[0]!, label: "main" });
      await client.request("tab.create", { workspaceId: ws.id, label: "second" });
      await client.request("tab.create", { workspaceId: ws.id, label: "logs" });
      await client.request("tab.focus", { tabId: ws.tabIds[0]! });
      const split = await client.request("pane.split", { paneId: p1, direction: "right" });
      const beta = await client.request("workspace.create", { cwd, label: "beta" });
      await client.request("group.create", { label: "team", workspaceId: beta.workspace.id });
      await client.request("workspace.focus", { workspaceId: ws.id });
      await client.request("prefs.set", { patch: { theme, themeAuto: false, uiStyle: style, paneFrameThickness: thickness } });
      await page.goto(`${appServer.origin}/#token=${appServer.token}`);
      await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset["uiStyle"])).toBe(style);
      await expect(page.locator(".xterm-helper-textarea")).toHaveCount(2);
      // 2 つの pane に、偽のエージェント（作業中・入力待ち）を動かす。画面の文字は、端末の中身として見える。
      for (const id of [p1, split.pane.id]) await client.request("pane.subscribe", { paneId: id, scrollbackLines: 200 });
      const a1 = await launchFakeAgent(page, client, p1, { via: "client" });
      const a2 = await launchFakeAgent(page, client, split.pane.id, { via: "client" });
      await a1.work();
      await a2.block();
      await shot(page, `${prefix}-1-base`);
      // 設定（表示の節）。
      await page.mouse.click(700, 400);
      await prefixKey(page, "s");
      const dlg = page.locator("dialog.settings-dialog");
      await expect(dlg).toHaveAttribute("open", "");
      await dlg.locator("nav.settings-menu button", { hasText: "表示" }).click();
      await shot(page, `${prefix}-4-settings`);
      await page.keyboard.press("Escape");
      await expect(dlg).not.toHaveAttribute("open", "");
      // 表示の面。
      for (const side of ["right", "left", "top", "bottom"]) await set(appServer, p1, `panel-${side}`, "panel", ["--dock", side, "--size", "160", "--title", `パネル ${side}`], `パネル（${side}）`);
      await set(appServer, p1, "band-top", "band", ["--edge", "top", "--title", "帯 上"], "帯（上）");
      await expect(page.locator("[data-display-root]")).toHaveCount(5, { timeout: 15_000 });
      await page.waitForTimeout(1500);
      await shot(page, `${prefix}-2-display`);
      // グラフ。
      await prefixKey(page, "a");
      await expect(page.locator(".graph-view [data-node-key]").first()).toBeVisible();
      await shot(page, `${prefix}-3-graph`);
      client.close();
    });
