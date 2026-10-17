import { openNativeTab } from "../support/nativeTab.js";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";

// Real A/B servers and a synthetic source; all success observations are browser DOM/canvas/frames.
// No real desktop capture, native Windows input, service, or firewall change is performed.
test("B automatically connects back over WSS using the existing machine connection", async ({ page, appServer, browser }) => {
  test.setTimeout(60000);
  const dir = await mkdtemp(join(tmpdir(), "soda-desktop-e2e-")), record = join(dir, "input.jsonl");
  const helper = fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url));
  const saved = process.env.SODA_DESKTOP_COMMAND, savedInput = process.env.SODA_DESKTOP_ALLOW_INPUT;
  process.env.SODA_DESKTOP_COMMAND = JSON.stringify([process.execPath, helper, "--allow-input", "--record", record]);
  process.env.SODA_DESKTOP_ALLOW_INPUT = "1";
  const provider = await startAppServer().finally(() => {
    if (saved === undefined) delete process.env.SODA_DESKTOP_COMMAND; else process.env.SODA_DESKTOP_COMMAND = saved;
    if (savedInput === undefined) delete process.env.SODA_DESKTOP_ALLOW_INPUT; else process.env.SODA_DESKTOP_ALLOW_INPUT = savedInput;
  });
  const owner = await provider.openClient(), operator = await appServer.openClient();
  let other: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  const browserFrames: number[] = [];
  page.on("websocket", (socket) => { if (socket.url().endsWith("/desktop-share")) socket.on("framereceived", ({ payload }) => { if (Buffer.isBuffer(payload)) browserFrames.push(payload.byteLength); }); });
  try {
    const invite = await operator.request("machine.invite", { label: "Desktop test B" });
    await owner.request("machine.delegate", { url: appServer.origin, machineId: invite.machineId, token: invite.token });
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    const header = page.locator(`[data-machine-id="${invite.machineId}"]`);
    await expect(header.locator('[data-state="online"]')).toBeVisible({ timeout: 15000 });
    await openNativeTab(page, "desktop", header);
    const view = page.locator("[data-remote-desktop]"), canvas = view.getByLabel("共有画面");
    await expect(view.locator("[data-desktop-status]")).toHaveText("閲覧中");
    await expect(canvas).toHaveAttribute("data-rendered-frames", /^[1-9][0-9]*$/);
    expect(await canvas.evaluate((el) => { const c = el as HTMLCanvasElement; const rgba = c.getContext("2d")!.getImageData(0, 0, 1, 1).data; return c.width === 1280 && rgba[0]! + rgba[1]! + rgba[2]! > 0; })).toBe(true);
    await expect(view.getByText("模擬画面（実デスクトップではありません）")).toBeVisible();
    await expect.poll(() => browserFrames.length).toBeGreaterThan(1);
    await expect(view.locator("[data-desktop-metrics]")).toContainText("Mbps");
    await view.getByRole("button", { name: "操作する", exact: true }).click();
    await expect(view.locator("[data-desktop-status]")).toHaveText("操作中");
    await canvas.click(); await page.keyboard.press("a");
    await view.getByLabel("確定した文字を送る").fill("日本語😀");
    await view.getByRole("button", { name: "文字を送る", exact: true }).click();
    await expect.poll(async () => readFile(record, "utf8").catch(() => "")).toContain("日本語😀");
    await expect.poll(async () => readFile(record, "utf8").catch(() => "")).toContain('"code":"KeyA"');
    await view.getByRole("button", { name: "最大化", exact: true }).click();
    await expect(view).toHaveClass(/maximized/);
    await view.getByRole("button", { name: "元に戻す", exact: true }).click();
    // A second authenticated browser gets no screen data merely by logging in.
    other = await browser.newContext(); const otherPage = await other.newPage();
    const leaked: number[] = [];
    otherPage.on("websocket", (s) => s.on("framereceived", ({ payload }) => { if (Buffer.isBuffer(payload) && s.url().endsWith("/desktop-share")) leaked.push(payload.byteLength); }));
    await otherPage.goto(`${appServer.origin}/#token=${appServer.token}`);
    await expect(otherPage.locator(`[data-machine-id="${invite.machineId}"]`)).toBeVisible();
    expect(leaked).toHaveLength(0); await expect(otherPage.locator("[data-remote-desktop]")).toHaveCount(0);
    await page.bringToFront();
    await view.getByRole("button", { name: "共有停止", exact: true }).click();
    await expect(view).toHaveCount(0);
    await expect(header.locator('[data-state="online"]')).toBeVisible();
    await openNativeTab(page, "desktop", header);
    await expect(page.locator("[data-desktop-status]")).toHaveText("閲覧中");
    await page.locator("[data-remote-desktop]").getByRole("button", { name: "閉じる", exact: true }).click();
    // Revoking the machine while a share is open must also end the viewer.
    await openNativeTab(page, "desktop", header);
    await expect(page.locator("[data-desktop-status]")).toHaveText("閲覧中");
    await operator.request("machine.manage", { id: invite.machineId, action: "disable" });
    await expect(page.locator("[data-remote-desktop]")).toHaveCount(0);
  } finally { await other?.close(); await provider.close(); await rm(dir, { recursive: true, force: true }); }
});
