import { tmpdir } from "node:os";
import { expect, test } from "../support/fixtures.js";

// 目的地へ移る前の「掴んでいる」表示・追従・終了をブラウザで確認する。
for (const uiStyle of ["classic", "modern"] as const) {
  test(`${uiStyle}: workspace を掴むと名前がカーソルに付いてきて、Esc と領域外での解放で消える`, async ({ page, appServer }) => {
    const client = await appServer.openClient();
    await client.request("workspace.create", { cwd: tmpdir(), label: "drag workspace" });
    await client.request("prefs.set", { patch: { uiStyle } });
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    const row = page.locator('.sidebar-row[data-drop-workspace-id]').filter({ hasText: "drag workspace" });
    await expect(row).toBeVisible();
    const r = (await row.boundingBox())!;
    const x = r.x + r.width / 2;
    const y = r.y + r.height / 2;
    const preview = page.locator("[data-drag-preview]");
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 2, y);
    await expect(preview).toHaveCount(0); // クリックの微小な動きでは出ない。
    await page.mouse.move(x + 8, y);
    await expect(preview).toContainText("drag workspace");
    await expect(row).toHaveClass(/sidebar-row-drag-source/);
    const before = (await preview.boundingBox())!;
    await page.mouse.move(x + 24, y + 10);
    await expect.poll(async () => (await preview.boundingBox())!.x).toBeGreaterThan(before.x + 10);
    expect(await preview.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
    await page.keyboard.press("Escape");
    await expect(preview).toHaveCount(0);
    await expect(row).not.toHaveClass(/sidebar-row-drag-source/);
    await page.mouse.up();
    // 再度掴み、一覧の外で解放しても残らない。
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 8, y);
    await expect(preview).toBeVisible();
    await page.mouse.move(page.viewportSize()!.width - 2, page.viewportSize()!.height - 2);
    const nearEdge = (await preview.boundingBox())!;
    expect(nearEdge.x + nearEdge.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(nearEdge.y + nearEdge.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await page.mouse.up();
    await expect(preview).toHaveCount(0);
    client.close();
  });

  test(`${uiStyle}: pane は目的地へ移る前から表示が出て、ドロップ後に消える`, async ({ page, appServer }) => {
    const client = await appServer.openClient();
    const paneId = client.helloSnapshot()!.panes[0]!.id;
    await client.request("pane.rename", { paneId, label: "drag pane" });
    await client.request("pane.split", { paneId, direction: "right" });
    await client.request("prefs.set", { patch: { uiStyle, paneAgentNameVisible: true } });
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    const name = page.locator(".pane-frame-name").filter({ hasText: "drag pane" });
    await expect(name).toBeVisible();
    const source = page.locator(`[data-pane-id="${paneId}"]`);
    const r = (await name.boundingBox())!;
    const x = r.x + r.width / 2;
    const y = r.y + r.height / 2;
    const preview = page.locator("[data-drag-preview]");
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 8, y);
    await expect(preview).toContainText("drag pane");
    await expect(source).toHaveClass(/pane-frame-drag-source/);
    await page.keyboard.press("Escape");
    await expect(preview).toHaveCount(0);
    await expect(source).not.toHaveClass(/pane-frame-drag-source/);
    await page.mouse.up();
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 8, y);
    await expect(preview).toBeVisible();
    const target = (await page.locator(".pane-frame-body").nth(1).boundingBox())!;
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator("[data-pane-frame-main]")).toHaveCount(1);
    await expect(preview).toHaveCount(0);
    await expect(page.locator(".pane-frame-drag-source")).toHaveCount(0);
    client.close();
  });
}
