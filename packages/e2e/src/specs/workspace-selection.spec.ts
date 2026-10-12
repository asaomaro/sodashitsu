import { expect, test } from "../support/fixtures.js";
test("returning to a workspace restores the browser tab/pane despite other-client focus changes", async ({
  page,
  appServer,
}) => {
  const client = await appServer.openClient();
  const a = await client.request("workspace.create", { label: "History A" });
  const second = await client.request("tab.create", {
    workspaceId: a.workspace.id,
    label: "Remembered tab",
  });
  const split = await client.request("pane.split", { paneId: second.pane.id, direction: "right" });
  await client.request("pane.rename", { paneId: split.pane.id, label: "Remembered pane" });
  const b = await client.request("workspace.create", { label: "History B" });
  await client.request("prefs.set", { patch: { uiStyle: "modern" } });
  await client.request("workspace.focus", { workspaceId: a.workspace.id });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  const aRow = page
      .locator(".sidebar-spaces [data-workspace-row-key]")
      .filter({ hasText: "History A" }),
    bRow = page
      .locator(".sidebar-spaces [data-workspace-row-key]")
      .filter({ hasText: "History B" });
  await aRow.click();
  await page.locator(`[data-tab-id="${second.tab.id}"]`).click();
  await page.locator(`[data-pane-id="${split.pane.id}"] .xterm-helper-textarea`).focus();
  await page.locator(`[data-pane-id="${split.pane.id}"]`).click();
  await bRow.click();
  // Another client changes shared focus; this browser must keep its own remembered selection.
  await client.request("pane.focus", { paneId: a.pane.id });
  await aRow.click();
  await expect(page.locator(`[data-tab-id="${second.tab.id}"]`)).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect
    .poll(() =>
      page
        .locator(`[data-pane-id="${split.pane.id}"]`)
        .evaluate((el) => el.contains(document.activeElement)),
    )
    .toBe(true);
});
