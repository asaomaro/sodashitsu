import { expect, type Page, type Locator } from "@playwright/test";

/** Exercise the user-facing tab chooser, rather than bypassing it with an RPC. */
export async function openNativeTab(page: Page, kind: "web-preview" | "desktop" | "vscode", machine?: Locator): Promise<void> {
  if (machine) await machine.locator(".machine-select").click();
  await page.getByRole("button", { name: "新しいタブ", exact: true }).click();
  const dialog = page.locator("dialog.name-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox", { name: "タブの種類" }).selectOption(kind);
  await dialog.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.locator(`[data-native-tab="${kind}"]`)).toBeVisible();
  // Fresh fixture servers can offer extension approval notices above the tab toolbar.
  for (const notice of await page.locator(".toast-close").all()) await notice.click();
}

export async function closeNativeTab(page: Page): Promise<void> {
  await page.getByRole("tab", { selected: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "閉じる", exact: true }).click();
}
