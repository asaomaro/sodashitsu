import { createHmac } from "node:crypto";
import { test, expect } from "../support/fixtures.js";
import { prefixKey, focusTerminal } from "../support/keys.js";
// RFC 6238 browser-flow fixture; the service is separately verified against RFC vectors.
function code(secret: string, counter: number) {
  let bits = 0,
    value = 0;
  const bytes: number[] = [];
  for (const char of secret) {
    value = (value << 5) | "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 255);
    }
  }
  const input = Buffer.alloc(8);
  input.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac("sha1", Buffer.from(bytes)).update(input).digest(),
    offset = hash[hash.length - 1]! & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, "0");
}
test.setTimeout(90_000);
test("設定から使い切りコードと認証アプリを登録し、別ブラウザでログインする", async ({
  page,
  appServer,
  browser,
}) => {
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await focusTerminal(page);
  await prefixKey(page, "s");
  const settings = page.locator('section[aria-labelledby="settings-login"]');
  await settings.getByRole("button", { name: "使い切りコードを発行", exact: true }).click();
  const issued = settings.locator(".login-code code");
  await expect(issued).toHaveText(/^\d{12}$/);
  const oneTime = (await issued.textContent())!.trim();
  const other = await browser.newContext(),
    totp = await browser.newContext();
  try {
    const loginPage = await other.newPage();
    await loginPage.goto(appServer.origin);
    await loginPage.getByLabel("ログイン方法", { exact: true }).selectOption("otp");
    await loginPage.getByLabel("使い切りコード（12桁）", { exact: true }).fill(oneTime);
    await loginPage.getByRole("button", { name: "ログイン", exact: true }).click();
    await expect(loginPage.locator("[data-pane-id]").first()).toBeVisible();
    await other.clearCookies();
    await loginPage.goto(appServer.origin);
    await loginPage.getByLabel("ログイン方法", { exact: true }).selectOption("otp");
    await loginPage.getByLabel("使い切りコード（12桁）", { exact: true }).fill(oneTime);
    await loginPage.getByRole("button", { name: "ログイン", exact: true }).click();
    await expect(loginPage.getByRole("alert")).toContainText("使用済み");
    await settings.getByLabel("登録名", { exact: true }).fill("E2E phone");
    await settings.getByRole("button", { name: "認証アプリを登録", exact: true }).click();
    const qr = settings.getByRole("img", { name: "認証アプリ登録用QRコード", exact: true });
    await expect(qr).toBeVisible();
    await expect(qr.locator("path")).toHaveAttribute("d", /^M.{100,}/);
    const secret = (await settings.locator(".enrollment details code").textContent())!.trim();
    const counter = Math.floor(Date.now() / 30000);
    await settings.getByLabel("確認コード", { exact: true }).fill(code(secret, counter));
    await settings.getByRole("button", { name: "登録を確定", exact: true }).click();
    await expect(
      settings.getByRole("button", { name: "E2E phoneの登録を削除", exact: true }),
    ).toBeVisible();
    await expect(qr).toBeHidden();
    const appPage = await totp.newPage();
    await appPage.goto(appServer.origin);
    await appPage.getByLabel("ログイン方法", { exact: true }).selectOption("totp");
    // The next step is accepted within the supported one-step clock skew, and avoids reusing the confirmation code.
    await appPage
      .getByLabel("認証アプリのコード（6桁）", { exact: true })
      .fill(code(secret, counter + 1));
    await appPage.getByRole("button", { name: "ログイン", exact: true }).click();
    await expect(appPage.locator("[data-pane-id]").first()).toBeVisible();
    await settings.getByRole("button", { name: "E2E phoneの登録を削除", exact: true }).click();
    await expect(
      settings.getByRole("button", { name: "E2E phoneの登録を削除", exact: true }),
    ).toBeHidden();
  } finally {
    await other.close().catch(() => {});
    await totp.close().catch(() => {});
  }
});
