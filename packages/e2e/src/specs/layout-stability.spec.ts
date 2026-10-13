import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "../support/fixtures.js";
import { focusTerminal, typeLine } from "../support/keys.js";

test("desktop layout remains inside the viewport and stops resizing with an agent statusline", async ({
  page,
  appServer,
}) => {
  const client = await appServer.openClient();
  const root = await mkdtemp(join(tmpdir(), "soda-layout-stability-"));
  try {
    const pane = client.helloSnapshot()!.panes.find((p) => !p.virtual)!;
    await client.request("prefs.set", { patch: { uiStyle: "modern", paneOuterBorders: true } });
    const script = join(root, "fake-claude.sh");
    await writeFile(script, "sleep 600\n");
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    await focusTerminal(page);
    await typeLine(page, `bash -c 'exec -a claude bash ${script}'`);
    const bar = page.locator("[data-pane-statusline]");
    await expect(bar).toBeVisible();
    await page.addStyleTag({
      content: "::-webkit-scrollbar { width: 15px; height: 15px; } body { font-size:20px; }",
    });
    for (const size of [
      { width: 2048, height: 1224 },
      { width: 2056, height: 1179 },
      { width: 1280, height: 720 },
      { width: 1040, height: 620 },
      { width: 800, height: 60 },
      { width: 800, height: 360 },
      { width: 1280, height: 720 },
    ]) {
      await page.setViewportSize(size);
      const samples = await page.evaluate(async () => {
        const result: string[] = [];
        // Measure actual rendered boxes for two seconds, including observer/PTY updates.
        for (let i = 0; i < 120; i++) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          const pane = document
            .querySelector("[data-pane-statusline]")!
            .previousElementSibling!.getBoundingClientRect();
          const root = document.documentElement;
          result.push(
            JSON.stringify([
              root.clientWidth,
              root.clientHeight,
              root.scrollWidth,
              root.scrollHeight,
              pane.width,
              pane.height,
            ]),
          );
        }
        return result;
      });
      console.log(size, [...new Set(samples)]);
      const settled = samples.slice(-60);
      expect(new Set(settled).size).toBe(1);
      const [width, height, scrollWidth, scrollHeight] = JSON.parse(settled.at(-1)!);
      expect(scrollWidth).toBeLessThanOrEqual(width);
      expect(scrollHeight).toBeLessThanOrEqual(height);
    }
    // Internal views must keep their own mouse scrolling after document clipping.
    await Promise.all(
      Array.from({ length: 60 }, (_, i) =>
        writeFile(join(root, `entry-${String(i).padStart(3, "0")}.txt`), "sample"),
      ),
    );
    const workspaceId = client.helloSnapshot()!.tabs.find((t) => t.id === pane.tabId)!.workspaceId;
    await client.request("workspace.set_project_folder", { workspaceId, path: root });
    await client.request("tab.add_view", {
      tabId: pane.tabId,
      extensionKey: "builtin:workspace",
      viewId: "files",
      target: "tab",
      placement: "left",
    });
    const list = page.locator(".workspace-list");
    await expect(list).toContainText("entry-059.txt");
    await list.hover();
    await page.mouse.wheel(0, 1000);
    await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await page.screenshot({ path: "/tmp/web-layout-stability.png" });
  } finally {
    client.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("short login screens retain document scrolling", async ({ page, appServer }) => {
  await page.setViewportSize({ width: 800, height: 100 });
  await page.goto(appServer.origin);
  const login = page.getByRole("button", { name: "ログイン", exact: true });
  await expect(login).toBeVisible();
  await login.scrollIntoViewIfNeeded();
  const box = (await login.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  // Chromium rounds scroll offsets to pixels while button bounds are fractional.
  expect(box.y + box.height).toBeLessThanOrEqual(101);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(100);
});
