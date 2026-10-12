import { expect, test } from "../support/fixtures.js";
test("classic screen buttons share the available sidebar width at narrow and wide sizes", async ({
  page,
  appServer,
}) => {
  const client = await appServer.openClient();
  await client.request("prefs.set", { patch: { uiStyle: "classic" } });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await expect(page.locator(".screen-switcher")).toBeVisible();
  for (const button of await page.locator(".toast-sticky .toast-close").all()) await button.click();
  const sizes = () =>
    page.locator(".screen-switcher").evaluate((el) => {
      const r = el.getBoundingClientRect(),
        buttons = Array.from(el.querySelectorAll("button")).map((b) => b.getBoundingClientRect());
      return {
        widths: buttons.map((b) => b.width),
        right: buttons.at(-1)!.right,
        edge: r.right,
        left: buttons[0]!.left,
        start: r.left,
      };
    });
  const check = async () => {
    await expect
      .poll(async () => {
        const r = await sizes();
        return Math.max(...r.widths) - Math.min(...r.widths);
      })
      .toBeLessThanOrEqual(1);
    const r = await sizes();
    expect(Math.abs(r.right - r.edge)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.left - r.start)).toBeLessThanOrEqual(1);
    return r.widths[0]!;
  };
  const checkHeight = async () => {
    await expect(page.locator(".tab-bar-item").first()).toBeVisible();
    await expect.poll(async () => {
      const tab = await page.locator(".tab-bar-item").first().boundingBox();
      const heights = await page.locator(".screen-switcher-btn").evaluateAll(
        (els) => els.map((el) => el.getBoundingClientRect().height),
      );
      return Math.max(...heights.map((height) => Math.abs(height - tab!.height)));
    }).toBeLessThanOrEqual(1);
  };
  const before = await check();
  await checkHeight();
  const divider = page.getByRole("separator", { name: "サイドバーの幅", exact: true });
  await divider.focus();
  for (let i = 0; i < 8; i++) await divider.press("ArrowRight");
  expect(await check()).toBeGreaterThan(before + 10);
  await checkHeight();
  await page.screenshot({ path: "/tmp/classic-screen-switcher-wide.png" });
  await divider.press("Home");
  await check();
  await checkHeight();
  const labels = await page
    .locator(".screen-switcher-label")
    .evaluateAll((els) => els.map((el) => el.scrollWidth <= el.clientWidth));
  expect(labels).toEqual([true, true, true, true]);
  await page.screenshot({ path: "/tmp/classic-screen-switcher-narrow.png" });
  await page.getByRole("button", { name: "サイドバーを畳む", exact: true }).click();
  await expect(page.locator(".screen-switcher")).toHaveClass(/collapsed/);
  const boxes = await page
    .locator(".screen-switcher-btn")
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(Math.min(...boxes)).toBeGreaterThan(10);
  client.close();
});
