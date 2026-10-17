import { expect, test } from "../support/fixtures.js";
import { engageBtn, openScriptBrowser, scriptFrameEl, scriptFrameLoc, setScriptOk } from "../support/displayScript.js";

test("script display maximizes and restores without recreating its iframe, and trusted links open separately", async ({ page, appServer, context }) => {
  const { paneId } = await openScriptBrowser(page, appServer);
  await context.route("https://preview.example/**", route => route.fulfill({ contentType: "text/html", body: "<h1>External preview</h1>" }));
  await setScriptOk(appServer, paneId, "viewport", `<!doctype html><body>
    <input id="state" value="retained"><button id="max" onclick="soda.maximize(true)">Maximize</button>
    <a id="link" href="https://preview.example/check">External link</a>
  </body>`);
  await expect(scriptFrameLoc(page).locator("#max")).toBeVisible();
  const original = await scriptFrameEl(page).elementHandle();
  await page.waitForTimeout(700); // only preparation for the existing engagement guard
  await engageBtn(page).click();
  await scriptFrameLoc(page).locator("#state").fill("keep this state");
  await scriptFrameLoc(page).locator("#max").click();
  const maximized = page.locator(".display-viewport-maximized");
  await expect(maximized).toBeVisible();
  await expect.poll(async () => maximized.evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(page.viewportSize()!.width);
  expect(await original!.evaluate(el => el.isConnected)).toBe(true);
  await page.getByRole("button", { name: "元の表示へ戻す", exact: true }).click();
  await expect(maximized).toHaveCount(0);
  await expect(scriptFrameLoc(page).locator("#state")).toHaveValue("keep this state");
  expect(await original!.evaluate(el => el.isConnected)).toBe(true);
  const popupPromise = page.waitForEvent("popup");
  await scriptFrameLoc(page).locator("#link").click();
  const popup = await popupPromise;
  await expect(popup.getByRole("heading")).toHaveText("External preview");
  await expect(popup).toHaveURL("https://preview.example/check");
  expect(await popup.evaluate(() => window.opener)).toBeNull();
  await popup.close();
  await expect(scriptFrameEl(page)).toHaveAttribute("sandbox", "allow-scripts");
});
