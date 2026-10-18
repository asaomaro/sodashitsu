import { test, expect } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openNativeTab } from "../support/nativeTab.js";

test("viewers stay on the controller, share between its clients, and collapse into a management dropdown", async ({
  page,
  appServer,
  browser,
}) => {
  const provider = await startAppServer(),
    owner = await provider.openClient(),
    operator = await appServer.openClient();
  let other: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  try {
    const invite = await operator.request("machine.invite", { label: "Viewer source B" });
    await owner.request("machine.delegate", {
      url: appServer.origin,
      machineId: invite.machineId,
      token: invite.token,
    });
    const before = await owner.request("client.hello", { protocol: 1, kind: "external" });
    // This is a layout/ownership test, with the one-time keyboard onboarding already read.
    await page.addInitScript(() => localStorage.setItem("soda.hint.prefixHelp.v1", "1"));
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    const header = page.locator(`[data-machine-id="${invite.machineId}"]`);
    await expect(header.locator('[data-state="online"]')).toBeVisible({ timeout: 15000 });
    await header.locator(".machine-select").click();
    for (const notice of await page.locator(".toast-close").all()) await notice.click();
    await page.getByRole("button", { name: "新しいタブ", exact: true }).click();
    const nameDialog = page.locator("dialog.name-dialog");
    await expect(nameDialog).toBeVisible();
    const kinds = nameDialog.getByRole("combobox", { name: "タブの種類", exact: true });
    for (const label of ["Webプレビュー", "デスクトップ", "VSCode"]) await expect(kinds).not.toContainText(label);
    await nameDialog.getByRole("button", { name: "キャンセル", exact: true }).click();
    await expect(page.getByRole("button", { name: "＋作業ビュー", exact: true })).toBeVisible();
    await openNativeTab(page, "vscode");
    await expect(page.locator(".viewer-item.active")).toContainText("Viewer source B");
    const work = await page.locator(".tab-bar-tabs").boundingBox(),
      viewers = await page.locator(".viewer-tabs").boundingBox();
    expect(viewers!.x).toBeGreaterThan(work!.x + work!.width - 1);
    const local = await operator.request("viewer_tabs.list", {});
    expect(local.tabs).toHaveLength(1);
    expect(local.tabs[0]!.machineId).toBe(invite.machineId);
    expect((await owner.request("viewer_tabs.list", {})).tabs).toHaveLength(0);
    const after = await owner.request("client.hello", { protocol: 1, kind: "external" });
    expect(after.snapshot.tabs.map((t) => ({ id: t.id, layout: t.layout }))).toEqual(
      before.snapshot.tabs.map((t) => ({ id: t.id, layout: t.layout })),
    );
    expect(after.snapshot.panes.map((p) => p.id)).toEqual(before.snapshot.panes.map((p) => p.id));
    await openNativeTab(page, "web-preview");
    const connectionItems = page.locator(".viewer-item");
    await expect(connectionItems).toHaveCount(2);
    const previewBox = await page.getByRole("tab", {name:"Webプレビュー",exact:true}).boundingBox();
    const codeBox = await page.getByRole("tab", {name:"VSCode",exact:true}).boundingBox();
    expect(previewBox!.x).toBeLessThan(codeBox!.x);
    for (const uiStyle of ["classic", "modern"] as const) {
      // Appearance preferences are controller-local and are applied while the local machine is selected.
      await page.locator('[data-machine-id="local"] .machine-select').click();
      await operator.request("prefs.set", {patch:{uiStyle}});
      if (uiStyle === "modern") await expect(page.locator("html")).toHaveAttribute("data-ui-style", uiStyle);
      else await expect(page.locator("html")).not.toHaveAttribute("data-ui-style", "modern");
      await header.locator(".machine-select").click();
      await page.getByRole("tab", {name:"Webプレビュー",exact:true}).click();
      const controls = page.locator(".viewer-actions");
      const workButton = page.getByRole("button", {name:"＋作業ビュー",exact:true});
      const connectButton = page.getByRole("button", {name:"接続ビューを追加・選択",exact:true});
      await expect(workButton).toBeVisible(); await expect(connectButton).toHaveText("＋接続ビュー");
      const workBox = (await workButton.boundingBox())!, connectBox = (await connectButton.boundingBox())!;
      expect(Math.abs(workBox.y - connectBox.y)).toBeLessThan(1);
      expect(Math.abs(workBox.height - connectBox.height)).toBeLessThan(1);
      expect(connectBox.x - (workBox.x + workBox.width)).toBeGreaterThanOrEqual(0);
      expect(connectBox.x - (workBox.x + workBox.width)).toBeLessThan(8);
      const controlsBox = (await controls.boundingBox())!;
      expect(page.viewportSize()!.width - (controlsBox.x + controlsBox.width)).toBeLessThan(8);
      const padding = await page.locator(".tab-bar-new, .tab-bar-add-view, .viewer-menu-button").evaluateAll(nodes => nodes.map(node => ({left:getComputedStyle(node).paddingLeft,right:getComputedStyle(node).paddingRight})));
      expect(new Set(padding.map(p => JSON.stringify(p))).size).toBe(1);
    }
    other = await browser.newContext();
    const p = await other.newPage();
    await p.goto(`${appServer.origin}/#token=${appServer.token}`);
    const secondHeader = p.locator(`[data-machine-id="${invite.machineId}"]`);
    await expect(secondHeader.locator('[data-state="online"]')).toBeVisible({ timeout: 15000 });
    await secondHeader.locator(".machine-select").click();
    await expect(p.locator(".viewer-item")).toHaveCount(2); // controller config is shared, selection is per client
    await page.bringToFront();
    // The new fixture can offer extension approval after its first workspace opens.
    for (const notice of await page.locator(".toast-close").all()) await notice.click();
    await page.screenshot({ path: "/tmp/sodashitsu-viewer-tabs-wide.png" });
    await page.setViewportSize({ width: 800, height: 720 });
    await page.getByRole("button", { name: "接続ビューを追加・選択", exact: true }).click();
    await page.screenshot({ path: "/tmp/sodashitsu-viewer-tabs-narrow.png" });
    await page.getByRole("menuitem", { name: "VSCodeの閲覧タブを閉じる", exact: true }).click();
    await page.getByRole("menuitem", { name: "Webプレビューの閲覧タブを閉じる", exact: true }).click();
    await expect(page.locator("[data-viewer-tab]")).toHaveCount(0);
    await expect(p.locator(".viewer-item")).toHaveCount(0);
    expect(
      (await owner.request("client.hello", { protocol: 1, kind: "external" })).snapshot.tabs.map(
        (t) => t.id,
      ),
    ).toEqual(before.snapshot.tabs.map((t) => t.id));
  } finally {
    await other?.close();
    await owner.close();
    await operator.close();
    await provider.close();
  }
});
