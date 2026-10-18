import { expect, test } from "../support/fixtures.js";
import { focusTerminal, prefixKey } from "../support/keys.js";

// Observe real settings DOM and persistence across reload, without enabling screen capture.
test("local desktop sharing permissions are configurable and persist without starting capture", async ({
  page,
  appServer,
}) => {
  async function open() {
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    await page.waitForSelector(".xterm-helper-textarea");
    await focusTerminal(page);
    await prefixKey(page, "s");
    const dialog = page.locator("dialog.settings-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "デスクトップ共有", exact: true }).click();
    return dialog.locator('section[aria-labelledby="settings-desktop-sharing"]');
  }
  let section = await open();
  await expect(section.getByRole("button", { name: "共有設定を保存" })).toBeEnabled();
  await expect(section.getByLabel("画面共有を許可", { exact: true })).not.toBeChecked();
  await section.getByLabel("マウス・キーボードの操作を許可").check();
  await section.getByRole("button", { name: "共有設定を保存" }).click();
  await expect(section.getByRole("status")).toContainText("保存しました");
  await page.reload();
  section = await open();
  await expect(section.getByLabel("マウス・キーボードの操作を許可")).toBeChecked();
  await expect(section.getByLabel("画面共有を許可", { exact: true })).not.toBeChecked();
});
