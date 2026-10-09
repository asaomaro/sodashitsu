import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ThemeName } from "@sodashitsu/protocol";
import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { launchFakeAgent, cleanupNotifyAgents } from "../support/notifyAgent.js";
import { prefixKey } from "../support/keys.js";

/**
 * グラフの上の端末の窓の絵（20261008-graph-first の PR2a）。`GRAPH_TERMINAL_SHOTS_DIR` を渡したときだけ撮る。**判定はしない**（撮るだけ）。
 * 窓の中に、偽のエージェントの画面（作業中・入力待ち）の文字が出る。撮る組: クラシック・モダン × 暗い・明るい。名前は `<様式>-<テーマ>-<場面>.png`。
 */
const OUT = process.env["GRAPH_TERMINAL_SHOTS_DIR"];
test.skip(OUT === undefined, "GRAPH_TERMINAL_SHOTS_DIR を渡したときだけ撮る");
test.use({ viewport: { width: 1500, height: 900 } });
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
      const cwd = await mkdtemp(join(tmpdir(), "soda-graph-terminal-"));
      dirs.push(cwd);
      const created = await client.request("workspace.create", { cwd, label: "alpha" });
      const p1 = created.pane.id;
      await client.request("workspace.close", { workspaceId: initial.id });
      const split = await client.request("pane.split", { paneId: p1, direction: "right" });
      const p2 = split.pane.id;
      await client.request("prefs.set", { patch: { theme, themeAuto: false, uiStyle: style } });
      await page.goto(`${appServer.origin}/#token=${appServer.token}`);
      await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
      await expect(page.locator(".xterm-helper-textarea")).toHaveCount(2);
      for (const id of [p1, p2]) await client.request("pane.subscribe", { paneId: id, scrollbackLines: 200 });
      const a1 = await launchFakeAgent(page, client, p1, { via: "client" });
      const a2 = await launchFakeAgent(page, client, p2, { via: "client" });
      await a1.work();
      await a2.block();
      await page.locator(".xterm-helper-textarea").first().focus();
      await page.keyboard.press("Enter");
      await prefixKey(page, "a");
      const graph = page.locator(".graph-view");
      await expect(graph.locator("[data-node-key]").first()).toBeVisible();
      await shot(page, `${prefix}-1-graph`);
      // 入力待ちのエージェント（p2）の窓。
      const node = graph.locator(`[data-node-key="local:${p2}"]`);
      const b = (await node.boundingBox())!;
      await page.mouse.click(b.x + 30, b.y + 8);
      const win = page.locator("[data-graph-terminal-window]");
      await expect(win).toHaveAttribute("data-status", "attached");
      await page.waitForTimeout(800);
      await shot(page, `${prefix}-2-window`);
      // 別の client が直結を奪った（W2 の表示）。
      if (key === "dark") {
        const other = await appServer.openClient();
        await other.request("pane.attach", { paneId: p2, cols: 60, rows: 20, takeover: true });
        await expect(win).toHaveAttribute("data-status", "taken");
        await shot(page, `${prefix}-3-taken`);
        other.close();
      }
      client.close();
    });
