import { expect, test } from "../support/fixtures.js";
import { focusTerminal, prefixKey } from "../support/keys.js";
test("system footer settings persist, share across clients, and reserve desktop/mobile space", async ({
  page,
  appServer,
}) => {
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await expect(page.locator("[data-system-footer]")).toHaveCount(0);
  const before = (await page.locator(".pane-layout-leaf").first().boundingBox())!;
  await focusTerminal(page);
  await prefixKey(page, "s");
  const dialog = page.getByRole("dialog", { name: "設定", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "表示", exact: true }).click();
  await expect(dialog.locator("[data-system-footer-settings] input")).toHaveCount(1);
  await dialog.getByLabel("フッターを表示", { exact: true }).check();
  await page.keyboard.press("Escape");
  const footer = page.locator("[data-system-footer]");
  await expect(footer).toContainText("CPU");
  await expect(footer).toContainText("メモリ");
  const box = (await footer.boundingBox())!,
    pane = (await page.locator(".pane-layout-leaf").first().boundingBox())!;
  expect(Math.abs(box.y + box.height - page.viewportSize()!.height)).toBeLessThanOrEqual(1);
  expect(pane.height).toBeLessThan(before.height);
  expect(pane.y + pane.height).toBeLessThanOrEqual(box.y + 1);
  const other = await page.context().newPage();
  await other.goto(`${appServer.origin}/#token=${appServer.token}`);
  await expect(other.locator("[data-system-footer]")).toContainText("メモリ");
  await footer.getByRole("button", { name: "フッターの設定", exact: true }).click();
  const footerDialog = page.getByRole("dialog", { name: "フッターの設定", exact: true });
  await footerDialog.getByLabel("CPU使用率", { exact: true }).uncheck();
  await footerDialog.getByLabel("エージェント総数", { exact: true }).check();
  await footerDialog.getByLabel("メモリ使用率のグラフ", { exact: true }).check();
  await footerDialog
    .getByLabel("メモリ使用率のグラフパターン", { exact: true })
    .selectOption("ascii");
  await expect(footerDialog.locator("output").nth(1)).toContainText("#######--- 65%");
  await page.keyboard.press("Escape");
  await expect(footer).toContainText("エージェント 0");
  await expect(footer).toContainText(/メモリ.*[#-]{10}/);
  await expect(other.locator("[data-system-footer]")).toContainText("エージェント 0");
  await expect(footer).not.toContainText("CPU");
  await expect(other.locator("[data-system-footer]")).not.toContainText("CPU");
  await other.close();
  await page.reload();
  await expect(footer).toContainText("メモリ");
  await expect(footer).not.toContainText("CPU");
  await page.setViewportSize({ width: 390, height: 720 });
  await expect(footer).toContainText("メモリ");
  const mobile = (await footer.boundingBox())!;
  expect(mobile.x + mobile.width).toBeLessThanOrEqual(390);
  expect(mobile.y + mobile.height).toBeLessThanOrEqual(720);
  await page.screenshot({ path: "/tmp/system-footer-mobile.png" });
  const underlyingHeight = (await page.locator(".mobile-shell-pane").boundingBox())!.height;
  await page.getByRole("button", { name: "予約", exact: true }).click();
  await expect
    .poll(async () => (await page.locator(".mobile-shell-pane").boundingBox())!.height)
    .toBe(underlyingHeight);
  await expect(page.locator(".mobile-schedules [data-system-footer]")).toContainText("メモリ");
  await expect(footer).toHaveCount(1);
  const schedulesFooter = (await footer.boundingBox())!,
    schedules = (await page.locator(".mobile-schedules > .schedule-view").boundingBox())!;
  expect(schedules.y + schedules.height).toBeLessThanOrEqual(schedulesFooter.y + 1);
  await footer.getByRole("button", { name: "フッターの設定", exact: true }).click();
  await expect(footerDialog).toBeVisible();
  const mobileDialog = (await footerDialog.boundingBox())!;
  expect(mobileDialog.x).toBeGreaterThanOrEqual(0);
  expect(mobileDialog.x + mobileDialog.width).toBeLessThanOrEqual(390);
  for (const checkbox of await footerDialog
    .locator("fieldset")
    .first()
    .locator("input")
    .all())
    await checkbox.uncheck();
  await page.keyboard.press("Escape");
  await expect(footer.locator(".footer-content")).toBeEmpty();
  await footer.getByRole("button", { name: "フッターの設定", exact: true }).click();
  await footerDialog.getByLabel("CPU使用率", { exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(footer).toContainText("CPU");
});
