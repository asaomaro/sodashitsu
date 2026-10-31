import { openNativeTab } from "../support/nativeTab.js";
import { fileURLToPath } from "node:url";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";

const executablePath=process.env["SODA_E2E_CHROMIUM_PATH"];
if(executablePath)test.use({launchOptions:{executablePath}});
test("macos-sck selects the maximum supported display mode regardless of window size, renders 1:1 and revokes grants", async ({
  page,
  appServer,
}) => {
  test.setTimeout(60000);
  const keys = [
      "SODA_DESKTOP_COMMAND",
      "SODA_DESKTOP_ALLOW_INPUT",
      "SODA_DESKTOP_ALLOW_DISPLAY_RESIZE",
      "SODA_DESKTOP_NATIVE_PLATFORM",
    ],
    saved = keys.map((k) => process.env[k]);
  process.env.SODA_DESKTOP_COMMAND = JSON.stringify([
    process.execPath,
    fileURLToPath(
      new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
    ),
    "--static",
    "--allow-input",
    "--allow-display-resize",
    "--native-platform","macos-sck",
  ]);
  process.env.SODA_DESKTOP_NATIVE_PLATFORM="macos-sck";
  process.env.SODA_DESKTOP_ALLOW_INPUT = "1";
  process.env.SODA_DESKTOP_ALLOW_DISPLAY_RESIZE = "1";
  const provider = await startAppServer().finally(() =>
    keys.forEach((k, i) => {
      if (saved[i] === undefined) delete process.env[k];
      else process.env[k] = saved[i];
    }),
  );
  const starts: any[] = [];
  page.on("websocket", (socket) => {
    if (socket.url().endsWith("/desktop-share"))
      socket.on("framesent", ({ payload }) => {
        if (typeof payload === "string") {
          const m = JSON.parse(payload);
          if (m.type === "start") starts.push(m);
        }
      });
  });
  try {
    await page.setViewportSize({ width: 1600, height: 900 });
    const owner = await provider.openClient(),
      agent = await appServer.openClient(),
      invite = await agent.request("machine.invite", { label: "Display B" });
    await owner.request("machine.delegate", {
      url: appServer.origin,
      machineId: invite.machineId,
      token: invite.token,
    });
    for (const [client, server] of [[agent, appServer], [owner, provider]] as const) {
      await client.request("prefs.set", {patch:{notifyHintDone:true}});
      await client.request("workspace.set_project_folder", {workspaceId:client.helloSnapshot()!.workspaces[0]!.id,path:server.stateDir});
    }
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    const header = page.locator(`[data-machine-id="${invite.machineId}"]`);
    await expect(header.locator('[data-state="online"]')).toBeVisible();
    await openNativeTab(page, "desktop", header);
    const view = page.locator("[data-remote-desktop]"),
      canvas = view.getByLabel("共有画面"),
      toggle = view.getByLabel("接続先を最大解像度にする");
    await expect(canvas).toHaveAttribute("data-rendered-frames", /^[1-9][0-9]*$/);
    await view.locator("[data-agent-access] summary").click();
    await view
      .getByRole("button", { name: "エージェントへの画面提供・操作を許可", exact: true })
      .click();
    const ticket = view.getByLabel("エージェント接続コード");
    await expect(ticket).toHaveValue(/^[A-Za-z0-9_-]{43}$/);
    const lease = await agent.request("desktop.agent.attach", {
      ticket: await ticket.inputValue(),
    });
    await view.locator("[data-agent-access] summary").click();
    await view.evaluate((el) => {
      const e = el as HTMLElement;
      e.style.width = "1400px";
      e.style.height = "1100px";
    });
    await view.getByLabel("画面に合わせる", { exact: true }).uncheck();
    await toggle.check();
    await expect(view.locator("[data-applied-display]")).toContainText("1画素＝1 CSS px");
    await expect(canvas).toHaveAttribute("data-rendered-frames", /^[1-9][0-9]*$/);
    await expect(view.locator("[data-desktop-status]")).toHaveText("閲覧中");
    await expect(
      agent.request("desktop.agent.observe", { leaseId: lease.leaseId }),
    ).rejects.toThrow();
    const oneToOne = () =>
      canvas.evaluate((el) => {
        const c = el as HTMLCanvasElement,
          r = c.getBoundingClientRect();
        return {
          pixelWidth: c.width,
          pixelHeight: c.height,
          cssWidth: r.width,
          cssHeight: r.height,
        };
      });
    const initial = await oneToOne();
    expect(initial.cssWidth).toBe(initial.pixelWidth);
    expect(initial.cssHeight).toBe(initial.pixelHeight);
    expect(initial.pixelWidth).toBe(1920);
    expect(initial.pixelHeight).toBe(1080);
    await expect(view.locator("[data-applied-display]")).toContainText("1920×1080");
    const before = starts.length;
    // A smaller viewer must keep the maximum source resolution; 1:1 uses scrolling.
    await view.evaluate((el) => {
      const e = el as HTMLElement;
      e.style.width = "720px";
      e.style.height = "760px";
    });
    await expect.poll(() => view.locator("[data-desktop-screen]").evaluate(el => el.clientWidth)).toBeLessThan(1920);
    await expect(view.locator("[data-applied-display]")).toContainText("1920×1080");
    await expect(canvas).toHaveAttribute("data-rendered-frames", /^[1-9][0-9]*$/);
    expect(await oneToOne()).toEqual({
      pixelWidth: 1920,
      pixelHeight: 1080,
      cssWidth: 1920,
      cssHeight: 1080,
    });
    expect(starts.at(-1).options.display).toEqual({ width: 1920, height: 1080 });
    const maximize = view.locator("[data-desktop-maximize]");
    await maximize.click();
    await expect(maximize).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => view.boundingBox()).toEqual({ x: 0, y: 0, width: 1600, height: 900 });
    await expect.poll(async () => (await oneToOne()).pixelWidth).toBe(1920);
    await expect(view.locator("[data-desktop-display]")).not.toBeVisible();
    await expect.poll(()=>view.locator("[data-desktop-screen]").boundingBox()).toEqual({x:0,y:0,width:1600,height:900});
    await page.screenshot({path:"/workspaces/sodashitsu-check-logs/20261018-maximize/desktop-content-maximized.png"});
    await expect(canvas).toHaveAttribute("data-rendered-frames", /^[1-9][0-9]*$/);
    const enlarged = await oneToOne();
    expect(enlarged.cssWidth).toBe(enlarged.pixelWidth);
    expect(enlarged.cssHeight).toBe(enlarged.pixelHeight);
    // Double-clicking the title returns an embedded desktop to its tab bounds.
    await view.locator("header strong").dblclick();
    await expect(maximize).toHaveAttribute("aria-pressed", "false");
    await expect.poll(async () => {
      const bounds = await view.boundingBox();
      return bounds && { width: bounds.width, height: bounds.height };
    }).toEqual(await page.locator('[data-native-tab="desktop"]').evaluate(el => {
      const r = el.getBoundingClientRect(); return { width: r.width, height: r.height };
    }));
    await expect(view.locator("[data-applied-display]")).toContainText("1920×1080");
    await expect(canvas).toHaveAttribute("data-rendered-frames", /^[1-9][0-9]*$/);

    expect(
      JSON.parse(
        (await page.evaluate(
          (id) => localStorage.getItem(`soda:desktop:connection:v1:${id}`),
          invite.machineId,
        )) ?? "{}",
      ),
    ).not.toHaveProperty("display");
    await view.getByRole("button", {name:"情報・設定",exact:true}).click();
    // Maximum source resolution must not disable fitting the resulting image.
    const fit = view.getByLabel("画面に合わせる", { exact: true });
    await expect(fit).toBeEnabled();
    await fit.check();
    await expect(toggle).toBeChecked();
    await expect(view.locator("[data-applied-display]")).toContainText("画面に合わせて表示");
    await expect.poll(() => view.locator("[data-desktop-screen]").evaluate(el =>
      el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight,
    )).toBe(true);
    // All resize/maximize/fit operations above keep the same stream and source mode.
    expect(starts.length).toBe(before);
    await toggle.uncheck();
    await expect.poll(() => starts.at(-1).options.display).toBeUndefined();
    await expect(canvas).toHaveAttribute("data-rendered-frames", /^[1-9][0-9]*$/);
    await view.getByRole("button", { name: "閉じる", exact: true }).click();
    await openNativeTab(page, "desktop", header);
    await expect(toggle).not.toBeChecked();
    await expect(canvas).toHaveAttribute("data-rendered-frames", /^[1-9][0-9]*$/);
    await view.getByRole("button", { name: "共有停止", exact: true }).click();
  } finally {
    await provider.close();
  }
});
