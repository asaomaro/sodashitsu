import { expect, type Page, type Locator } from "@playwright/test";

/** Exercise the user-facing tab chooser, rather than bypassing it with an RPC. */
export async function openNativeTab(page: Page, kind: "web-preview" | "desktop" | "vscode", machine?: Locator): Promise<void> {
  if (machine) await machine.locator(".machine-select").click();
  // Fresh fixture notices can overlap the toolbar.
  for (const notice of await page.locator(".toast-close").all()) await notice.click();
  await page.getByRole("button", { name: "接続ビューを追加・選択", exact: true }).click();
  const labels = { "web-preview": "Webプレビュー", desktop: "デスクトップ", vscode: "VSCode" };
  const notice = page.locator(".toast-close").first();
  await page.addLocatorHandler(notice, async button => { await button.click(); });
  try {
    await page.getByRole("menuitem", { name: `＋ ${labels[kind]}`, exact: true }).click();
    await expect(page.locator(`[data-native-tab="${kind}"]`)).toBeVisible();
    // Secondary desktop controls are explicitly opened for feature tests.
    if (kind === "desktop") await page.locator("[data-remote-desktop]").getByRole("button", {name:"情報・設定",exact:true}).click();
  } finally {
    await page.removeLocatorHandler(notice);
  }
  // Fresh fixture servers can offer extension approval notices above the tab toolbar.
  for (const notice of await page.locator(".toast-close").all()) await notice.click();
}

export async function closeNativeTab(page: Page): Promise<void> {
  await page.locator(".viewer-item.active .viewer-close").click();
}
