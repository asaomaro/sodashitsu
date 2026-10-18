import { fileURLToPath } from "node:url";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openNativeTab } from "../support/nativeTab.js";

test.use({ deviceScaleFactor: 1.5 });

test("fitted desktop uses the visible image bounds for clicks through resize and 1:1 scrolling", async ({ page, appServer }) => {
  test.setTimeout(60000);
  const keys = ["SODA_DESKTOP_COMMAND", "SODA_DESKTOP_ALLOW_INPUT"], saved = keys.map(k => process.env[k]);
  process.env.SODA_DESKTOP_COMMAND = JSON.stringify([process.execPath,
    fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url)), "--static", "--delta-test", "--allow-input"]);
  process.env.SODA_DESKTOP_ALLOW_INPUT = "1";
  const provider = await startAppServer().finally(() => keys.forEach((k, i) => {
    if (saved[i] === undefined) delete process.env[k]; else process.env[k] = saved[i];
  }));
  const clicks: { x: number; y: number; event: string }[] = [];
  page.on("websocket", socket => {
    if (socket.url().endsWith("/desktop-share")) socket.on("framesent", ({ payload }) => {
      if (typeof payload !== "string") return;
      const m = JSON.parse(payload);
      if (m.type === "input" && m.input.kind === "pointer" && m.input.event !== "move") clicks.push(m.input);
    });
  });
  try {
    const a = await appServer.openClient(), b = await provider.openClient();
    for (const [client, server] of [[a, appServer], [b, provider]] as const) {
      await client.request("prefs.set", { patch: { notifyHintDone: true } });
      await client.request("workspace.set_project_folder", { workspaceId: client.helloSnapshot()!.workspaces[0]!.id, path: server.stateDir });
    }
    const invite = await a.request("machine.invite", { label: "Fitted B" });
    await b.request("machine.delegate", { url: appServer.origin, machineId: invite.machineId, token: invite.token });
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    const header = page.locator(`[data-machine-id="${invite.machineId}"]`);
    await expect(header.locator('[data-state="online"]')).toBeVisible();
    await openNativeTab(page, "desktop", header);
    const view = page.locator("[data-remote-desktop]"), canvas = view.getByLabel("共有画面");
    await expect(canvas).toHaveAttribute("data-rendered-frames", /^[1-9]/);
    await view.getByRole("button", { name: "情報・設定", exact: true }).click();
    await view.getByRole("button", { name: "最大化", exact: true }).click();
    await view.getByRole("button", { name: "操作する", exact: true }).click();
    await expect(view.locator("[data-desktop-status]")).toHaveText("操作中");

    for (const viewport of [{ width: 1500, height: 800 }, { width: 850, height: 1000 }]) {
      await page.setViewportSize(viewport);
      // The canvas box must be the actual fitted image, rather than including
      // hidden object-fit padding. Neither axis needs a scrollbar in fit mode.
      await expect.poll(() => canvas.evaluate(el => {
        const c = el as HTMLCanvasElement, r = c.getBoundingClientRect();
        return Math.abs(r.width / r.height - c.width / c.height);
      })).toBeLessThan(0.001);
      await expect.poll(() => view.locator("[data-desktop-screen]").evaluate(el =>
        el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight,
      )).toBe(true);

      // Find the green synthetic target in a screenshot of the rendered CSS
      // image. This does not reuse the product's coordinate/fit calculation.
      const screenshot = await canvas.screenshot({ scale: "css" });
      const target = await page.evaluate(async data => {
        const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)], { type: "image/png" }));
        const sample = document.createElement("canvas"); sample.width = bitmap.width; sample.height = bitmap.height;
        const ctx = sample.getContext("2d")!; ctx.drawImage(bitmap, 0, 0); bitmap.close();
        const pixels = ctx.getImageData(0, 0, sample.width, sample.height).data;
        let x = 0, y = 0, count = 0;
        for (let row = 0; row < sample.height / 2; row++) for (let col = 0; col < sample.width / 2; col++) {
          const i = (row * sample.width + col) * 4;
          if (pixels[i]! < 4 && pixels[i + 1]! > 251 && pixels[i + 2]! < 4) { x += col + 0.5; y += row + 0.5; count++; }
        }
        return { x: x / count, y: y / count, count };
      }, Array.from(screenshot));
      expect(target.count).toBeGreaterThan(100);
      const box = (await canvas.boundingBox())!, before = clicks.length;
      await page.mouse.click(box.x + target.x, box.y + target.y);
      await expect.poll(() => clicks.length).toBe(before + 2);
      expect(clicks.at(-2)!.x).toBeCloseTo(32 / 1280, 2);
      expect(clicks.at(-2)!.y).toBeCloseTo(32 / 720, 2);
    }
    await view.getByRole("button", { name: "情報・設定", exact: true }).click();
    await view.getByLabel("画面に合わせる", { exact: true }).uncheck();
    await view.getByRole("button", { name: "情報・設定", exact: true }).click();
    const screen = view.locator("[data-desktop-screen]");
    await screen.evaluate(el => { el.scrollLeft = 200; el.scrollTop = 80; });
    const screenBox = (await screen.boundingBox())!, imageBox = (await canvas.boundingBox())!;
    const before = clicks.length;
    await page.mouse.click(screenBox.x + 180, screenBox.y + 400);
    await expect.poll(() => clicks.length).toBe(before + 2);
    expect(clicks.at(-2)!.x).toBeCloseTo((screenBox.x + 180 - imageBox.x) / 1280, 3);
    expect(clicks.at(-2)!.y).toBeCloseTo((screenBox.y + 400 - imageBox.y) / 720, 3);
    await view.getByRole("button", { name: "閉じる", exact: true }).click();
  } finally { await provider.close(); }
});
