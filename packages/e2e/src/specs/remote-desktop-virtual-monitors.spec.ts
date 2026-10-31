// Generated monitor rosters/pixels only. No OS capture, input, service or virtual driver.
import { fileURLToPath } from "node:url";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openNativeTab } from "../support/nativeTab.js";
const executablePath = process.env["SODA_E2E_CHROMIUM_PATH"];
if (executablePath) test.use({ launchOptions: { executablePath } });
for (const otherViewer of [false, true])
  test(`virtual to explicit physical selection preserves scopes; other viewer=${otherViewer}`, async ({
    page,
    context,
    appServer,
  }) => {
    test.setTimeout(60000);
    const env = {
      SODA_DESKTOP_COMMAND: JSON.stringify([
        process.execPath,
        fileURLToPath(
          new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
        ),
        "--static",
        "--allow-input",
        "--virtual-display",
        "--monitors",
      ]),
      SODA_DESKTOP_ALLOW_INPUT: "1",
      SODA_DESKTOP_ALLOW_VIRTUAL_DISPLAY: "1",
      SODA_DESKTOP_ALLOW_MONITORS: "1",
    };
    const saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
    Object.assign(process.env, env);
    const provider = await startAppServer().finally(() => {
        for (const [key, value] of Object.entries(saved)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }),
      other = otherViewer ? await context.newPage() : undefined;
    const received: any[] = [];
    page.on("websocket", (socket) =>
      socket.on("framereceived", ({ payload }) => {
        if (typeof payload === "string") {
          try {
            received.push(JSON.parse(payload));
          } catch {}
        }
      }),
    );
    try {
      const b = await provider.openClient(),
        a = await appServer.openClient(),
        invite = await a.request("machine.invite", { label: "Generated virtual monitor B" });
      await b.request("machine.delegate", {
        url: appServer.origin,
        machineId: invite.machineId,
        token: invite.token,
      });
      for (const browser of [page, ...(other ? [other] : [])]) {
        await browser.goto(`${appServer.origin}/#token=${appServer.token}`);
        const header = browser.locator(`[data-machine-id="${invite.machineId}"]`);
        await expect(header.locator('[data-state="online"]')).toBeVisible();
        await openNativeTab(browser, "desktop", header);
        const view = browser.locator("[data-remote-desktop]");
        await expect(view.locator("[data-shared-virtual-available]")).toBeVisible();
        await view.getByLabel("複数viewerで同じ画面を共有", { exact: true }).check();
        await view.getByLabel("一時的な仮想画面を使う", { exact: true }).check();
        await expect(view.locator("[data-virtual-monitor-selection]")).toBeVisible();
        await expect(view.locator("[data-monitor-selector] select")).toHaveValue("owned-virtual");
        await expect(view.getByLabel("共有画面")).toHaveAttribute("data-rendered-frames", /^[1-9]/);
      }
      const view = page.locator("[data-remote-desktop]");
      await view.getByRole("button", { name: "操作する", exact: true }).click();
      await expect(view.locator("[data-desktop-status]")).toHaveText("操作中");
      await view.locator("[data-monitor-selector] select").selectOption("left");
      await expect.poll(()=>received.filter(m=>m.type==='ready').at(-1)?.monitorLayout?.selected).toBe('left');
      const ready=received.filter(m=>m.type==='ready').at(-1);expect(ready).not.toHaveProperty('virtualDisplay');expect(ready).not.toHaveProperty('virtualMonitors');
      await expect(view.locator('[data-desktop-status]')).toHaveText('閲覧中');await expect(view.locator('[data-monitor-selector] select')).toHaveValue('left');await expect(view.locator('[data-virtual-display-active]')).toHaveCount(0);await expect(view.getByLabel('共有画面')).toHaveAttribute('data-rendered-frames',/^[1-9]/);
      expect(await view.getByLabel('共有画面').evaluate(el=>(el as HTMLCanvasElement).getContext('2d')!.getImageData(80,60,1,1).data[3])).toBe(255);
      if(other){const remaining=other.locator('[data-remote-desktop]'),canvas=remaining.getByLabel('共有画面');await expect(remaining.locator('[data-monitor-selector] select')).toHaveValue('owned-virtual');await expect(remaining.locator('[data-virtual-display-active]')).toBeVisible();const before=Number(await canvas.getAttribute('data-rendered-frames'));await expect.poll(async()=>Number(await canvas.getAttribute('data-rendered-frames'))).toBeGreaterThan(before);}
      await page.screenshot({
        path: test.info().outputPath(`virtual-physical-selection-${otherViewer}.png`),
      });
    } finally {
      await page.goto("about:blank").catch(() => {});
      await other?.close().catch(() => {});
      await provider.close();
    }
  });
