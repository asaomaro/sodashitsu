import { test, expect } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
test("secondary screens have their own menu and session history is independent from usage", async ({
  page,
  appServer,
}) => {
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.locator('[data-screen-id="dashboard"]').click();
  await expect(page.locator('[data-screen="dashboard"] .past-sessions')).toHaveCount(0);
  const more = page.locator("[data-screen-more]");
  await expect(more).toContainText("その他");
  await more.click();
  await page.locator('nav[aria-label="その他の画面"] [data-screen-id="history"]').click();
  await expect(page.locator('[data-screen="history"] h1')).toHaveText("セッション履歴");
  await expect(more).toContainText("セッション履歴");
  await more.click();
  await page.locator('nav[aria-label="その他の画面"] [data-screen-id="schedule"]').click();
  await expect(page.locator('[data-screen="schedule"] h1')).toHaveText("予約");
  await expect(more).toContainText("予約");
  await page.screenshot({ path: "/tmp/secondary-screens-browser.png" });
});
test("connection management targets the controller while another machine is selected", async ({
  page,
  appServer,
}) => {
  const provider = await startAppServer(),
    owner = await provider.openClient(),
    operator = await appServer.openClient();
  try {
    const invitation = await operator.request("machine.invite", { label: "Managed office PC" });
    await owner.request("machine.delegate", { url: appServer.origin, ...invitation });
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    const machine = page.locator(`[data-machine-id="${invitation.machineId}"]`);
    await expect(machine.locator('[data-state="online"]')).toBeVisible({ timeout: 15000 });
    await machine.locator(".machine-select").click();
    await expect(machine.locator(".machine-select")).toHaveAttribute("aria-current", "true");
    await page.locator("[data-screen-more]").click();
    await page.locator('nav [data-screen-id="connections"]').click();
    const row = page.locator(`[data-connection-id="${invitation.machineId}"]`);
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "無効化", exact: true }).click();
    await expect(row).toContainText("無効");
    await row.getByRole("button", { name: "有効化", exact: true }).click();
    await expect(row).toContainText("接続済み", { timeout: 15000 });
    page.once("dialog", (dialog) => dialog.accept());
    await row.getByRole("button", { name: "登録削除", exact: true }).click();
    await expect(row).toHaveCount(0);
  } finally {
    owner.close();
    operator.close();
    await provider.close();
  }
});

test("secondary screens also open in the mobile layout", async ({ page, appServer }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  const menu = page.locator(".mobile-shell details");
  await menu.locator("summary").click();
  await menu.getByRole("button", { name: "外部接続", exact: true }).click();
  await expect(page.locator(".mobile-schedules h1")).toHaveText("外部接続");
  await expect(
    page.locator(".mobile-schedules").getByText("登録された接続はありません。"),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/secondary-screens-mobile.png" });
  await page.locator(".mobile-schedules").getByRole("button", { name: "端末へ戻る" }).click();
  await menu.getByRole("button", { name: "セッション履歴", exact: true }).click();
  await expect(page.locator(".mobile-schedules h1")).toHaveText("セッション履歴");
});

test("registers external SSH connections from the screen and retains them across reload", async ({
  page,
  appServer,
}) => {
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.locator("[data-screen-more]").click();
  await page.locator('nav [data-screen-id="connections"]').click();
  const screen = page.locator('[data-screen="connections"]');
  await screen.getByRole("button", { name: "外部Sodashitsuを追加", exact: true }).click();
  const form = screen.getByRole("group", { name: "外部Sodashitsuを追加（SSH）" });
  await form.getByLabel("接続名", { exact: true }).fill("Test build PC");
  await form.getByLabel("SSH接続先").fill("ssh://127.0.0.1:1");
  await form.getByLabel("相手のセッション名（省略可）").fill("work");
  await form.getByRole("button", { name: "登録して接続" }).click();
  await expect(form).toHaveCount(0);
  const row = screen.locator("[data-connection-id]").filter({ hasText: "Test build PC" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("SSH");
  await page.reload();
  await page.locator("[data-screen-more]").click();
  await page.locator('nav [data-screen-id="connections"]').click();
  await expect(
    screen.locator("[data-connection-id]").filter({ hasText: "Test build PC" }),
  ).toBeVisible();
  await screen.getByRole("button", { name: "操作を委譲する", exact: true }).click();
  await expect(screen.getByLabel("操作する側のURL")).toBeFocused();
  await page.screenshot({ path: "/tmp/sodashitsu-connection-ui.png" });
});
