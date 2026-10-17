import { openNativeTab } from "../support/nativeTab.js";
import { fileURLToPath } from "node:url";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";

test("clipboard text needs a viewer grant, round trips through the memory helper, and is revoked on blur", async ({
  page,
  appServer,
}) => {
  test.setTimeout(45000);
  const keys = ["SODA_DESKTOP_COMMAND", "SODA_DESKTOP_ALLOW_INPUT", "SODA_DESKTOP_ALLOW_CLIPBOARD"],
    saved = keys.map((k) => process.env[k]);
  process.env.SODA_DESKTOP_COMMAND = JSON.stringify([
    process.execPath,
    fileURLToPath(
      new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
    ),
    "--static",
    "--allow-input",
    "--allow-clipboard",
  ]);
  process.env.SODA_DESKTOP_ALLOW_INPUT = "1";
  process.env.SODA_DESKTOP_ALLOW_CLIPBOARD = "1";
  const provider = await startAppServer().finally(() =>
    keys.forEach((k, i) => {
      if (saved[i] === undefined) delete process.env[k];
      else process.env[k] = saved[i];
    }),
  );
  await page.addInitScript(() => {
    let text = "A simulated clipboard";
    Object.defineProperty(navigator, "clipboard", {
      value: {
        readText: async () => text,
        writeText: async (value: string) => {
          text = value;
        },
      },
    });
    // Headless pages have no foreground OS window; simulate focus only for this in-memory test.
    document.hasFocus = () => true;
  });
  try {
    const owner = await provider.openClient(),
      a = await appServer.openClient(),
      invite = await a.request("machine.invite", { label: "Clipboard B" });
    await owner.request("machine.delegate", {
      url: appServer.origin,
      machineId: invite.machineId,
      token: invite.token,
    });
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    const header = page.locator(`[data-machine-id="${invite.machineId}"]`);
    await expect(header.locator('[data-state="online"]')).toBeVisible();
    await openNativeTab(page, "desktop", header);
    const view = page.locator("[data-remote-desktop]"),
      text = view.getByLabel("共有するクリップボードのテキスト");
    await view.locator("[data-desktop-clipboard] summary").click();
    await expect(text).toBeDisabled();
    await view.getByRole("button", { name: "クリップボード共有を許可", exact: true }).click();
    await expect(text).toBeEnabled();
    await text.fill("日本語 😀 memory only");
    await view.getByRole("button", { name: "共有元へ送信", exact: true }).click();
    await expect(view.locator("[data-desktop-clipboard] [role=status]")).toHaveText(
      "共有元へ送りました",
    );
    await text.fill("");
    await view.getByRole("button", { name: "共有元から取得", exact: true }).click();
    await expect(text).toHaveValue("日本語 😀 memory only");
    await view.getByRole("button", { name: "双方向の自動同期を開始", exact: true }).click();
    await page.evaluate(() => navigator.clipboard.writeText("new simulated clipboard"));
    await expect(text).toHaveValue("new simulated clipboard", { timeout: 5000 });
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expect(text).toBeDisabled();
    await expect(
      view.getByRole("button", { name: "クリップボード共有を許可", exact: true }),
    ).toBeVisible();
    await view.getByRole("button", { name: "共有停止", exact: true }).click();
    await expect(view).toHaveCount(0);
  } finally {
    await provider.close();
  }
});
