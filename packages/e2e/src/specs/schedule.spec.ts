import { expect, test } from "../support/fixtures.js";
test("registers, edits and executes a workspace command, exposes results and a mobile editor", async ({
  page,
  appServer,
}) => {
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.getByRole("button", { name: "処理の予約", exact: true }).click();
  const view = page.getByRole("region", { name: "処理の予約" });
  await view.getByRole("button", { name: "予約を登録", exact: true }).click();
  await view.getByLabel("名前", { exact: true }).fill("command-test");
  await view.getByRole("combobox",{name:"実行内容",exact:true}).selectOption("command");
  await view.getByLabel("コマンド", { exact: true }).fill("printf 'scheduled-ok'");
  await view.getByRole("button", { name: "予約を保存", exact: true }).click();
  const job = view.locator(".schedule-job").filter({ hasText: "command-test" });
  await expect(job).toBeVisible();
  await job.getByRole("button", { name: "編集", exact: true }).click();
  await view.getByLabel("名前", { exact: true }).fill("edited-test");
  await view.getByRole("button", { name: "予約を保存", exact: true }).click();
  await expect(job).toHaveCount(0);
  const edited = view.locator(".schedule-job").filter({ hasText: "edited-test" });
  await edited.getByRole("button", { name: "今すぐ実行", exact: true }).click();
  const result = view.locator("details").filter({ hasText: "edited-test" });
  await expect(result.locator("summary")).toContainText("成功", { timeout: 10000 });
  await result.locator("summary").click();
  await expect(result).toContainText("scheduled-ok");
  await page.setViewportSize({ width: 390, height: 700 });
  await page.locator(".mobile-shell").getByRole("button", { name: "予約", exact: true }).click();
  const mobile = page.locator(".mobile-schedules");
  await mobile.getByRole("button", { name: "予約を登録", exact: true }).click();
  await expect(mobile.getByLabel("名前", { exact: true })).toBeVisible();
  expect(await mobile.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});
