import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ThemeName } from "@sodashitsu/protocol";
import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { launchFakeAgent, cleanupNotifyAgents } from "../support/notifyAgent.js";
import { prefixKey } from "../support/keys.js";

/**
 * グラフの上の端末の窓（3 つ・留め）の絵（20261008-graph-first の PR2b）。`GRAPH_TERMINAL_SHOTS_DIR` を渡したときだけ撮る。**判定はしない**（撮るだけ）。
 * 3 つの pane に偽のエージェント（作業中・入力待ち・完了）を動かし、3 つの窓を開いて留め、窓を広げて並べる。名前は `<様式>-<テーマ>-<場面>.png`。
 */
const OUT = process.env["GRAPH_TERMINAL_SHOTS_DIR"];
test.skip(OUT === undefined, "GRAPH_TERMINAL_SHOTS_DIR を渡したときだけ撮る");
test.use({ viewport: { width: 1700, height: 900 } });
test.setTimeout(120_000);

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
   for (const scene of ["three", "default"] as const)
    test(`${style}-${key}-${scene}`, async ({ page, appServer }) => {
      await mkdir(OUT!, { recursive: true });
      const prefix = `${style}-${key}`;
      const three = scene === "three";
      const client = await appServer.openClient();
      const initial = client.helloSnapshot()!.workspaces[0]!;
      const cwd = await mkdtemp(join(tmpdir(), "soda-graph-terminal-"));
      dirs.push(cwd);
      const created = await client.request("workspace.create", { cwd, label: "alpha" });
      const ids = [created.pane.id];
      await client.request("workspace.close", { workspaceId: initial.id });
      for (let i = 0; i < 2; i++) {
        const s = await client.request("pane.split", { paneId: ids[ids.length - 1]!, direction: "right" });
        ids.push(s.pane.id);
      }
      await client.request("prefs.set", { patch: { theme, themeAuto: false, uiStyle: style } });
      // 3 つの窓の位置と大きさ（左・中・右。45 桁 × 26 行）を、記憶に仕込む（開くと、そこに出る）。
      const mem = { geometry: Object.fromEntries(ids.map((id, i) => [id, { fx: i / 2, fy: 0.3, cols: 45, rows: 26 }])), pinned: [] };
      if (three) await page.addInitScript((m) => localStorage.setItem("soda.graphTerminalWindows.v1", JSON.stringify(m)), mem);
      await page.goto(`${appServer.origin}/#token=${appServer.token}`);
      await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
      await expect(page.locator(".xterm-helper-textarea")).toHaveCount(3);
      for (const id of ids) await client.request("pane.subscribe", { paneId: id, scrollbackLines: 200 });
      const a1 = await launchFakeAgent(page, client, ids[0]!, { via: "client" });
      const a2 = await launchFakeAgent(page, client, ids[1]!, { via: "client" });
      const a3 = await launchFakeAgent(page, client, ids[2]!, { via: "client" });
      await a1.work();
      await a2.block();
      await a3.work();
      await a3.idle();
      await page.locator(".xterm-helper-textarea").first().focus();
      await page.keyboard.press("Enter");
      await prefixKey(page, "a");
      const graph = page.locator(".graph-view");
      await expect(graph.locator("[data-node-key]").first()).toBeVisible();
      const win = (id: string) => page.locator(`[data-graph-terminal-window][data-pane-id="${id}"]`);
      for (const id of three ? ids : [ids[1]!]) {
        await graph.locator(`[data-node-key="local:${id}"]`).focus();
        await page.keyboard.press("Enter");
        await expect(win(id)).toHaveAttribute("data-status", "attached");
        if (three) {
          await win(id).locator("[data-graph-terminal-pin]").focus();
          await page.keyboard.press("Enter");
          await expect(win(id)).toHaveAttribute("data-pinned", "1");
        }
      }
      await page.waitForTimeout(500);
      await shot(page, three ? `${prefix}-1-three-windows` : `${prefix}-2-default-size`);
    });
