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
  await focusTerminal(page);
  await prefixKey(page, "s");
  await dialog.getByRole("button", { name: "表示", exact: true }).click();
  await dialog.getByLabel("CPU使用率", { exact: true }).uncheck();
  await page.keyboard.press("Escape");
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
  await expect.poll(async () => (await page.locator(".mobile-shell-pane").boundingBox())!.height).toBe(underlyingHeight);
  await expect(page.locator(".mobile-schedules [data-system-footer]")).toContainText("メモリ");
  await expect(footer).toHaveCount(1);
  const schedulesFooter = (await footer.boundingBox())!,
    schedules = (await page.locator(".mobile-schedules > .schedule-view").boundingBox())!;
  expect(schedules.y + schedules.height).toBeLessThanOrEqual(schedulesFooter.y + 1);
});
