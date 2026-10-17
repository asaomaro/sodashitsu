import { fileURLToPath } from "node:url";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";

test("connection presets and reduced colors reach the canvas, persist per machine, and reconnect read-only", async ({
  page,
  appServer,
}) => {
  test.setTimeout(60000);
  const saved = process.env.SODA_DESKTOP_COMMAND,
    savedInput = process.env.SODA_DESKTOP_ALLOW_INPUT;
  process.env.SODA_DESKTOP_COMMAND = JSON.stringify([
    process.execPath,
    fileURLToPath(
      new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
    ),
    "--static",
    "--allow-input",
  ]);
  process.env.SODA_DESKTOP_ALLOW_INPUT = "1";
  const provider = await startAppServer().finally(() => {
    if (saved === undefined) delete process.env.SODA_DESKTOP_COMMAND;
    else process.env.SODA_DESKTOP_COMMAND = saved;
    if (savedInput === undefined) delete process.env.SODA_DESKTOP_ALLOW_INPUT;
    else process.env.SODA_DESKTOP_ALLOW_INPUT = savedInput;
  });
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
    const owner = await provider.openClient(),
      agent = await appServer.openClient();
    const invite = await agent.request("machine.invite", { label: "Settings B" });
    await owner.request("machine.delegate", {
      url: appServer.origin,
      machineId: invite.machineId,
      token: invite.token,
    });
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    const header = page.locator(`[data-machine-id="${invite.machineId}"]`);
    await expect(header.locator('[data-state="online"]')).toBeVisible({ timeout: 15000 });
    await header.locator("[data-desktop-open]").click();
    const view = page.locator("[data-remote-desktop]"),
      canvas = view.getByLabel("共有画面");
    await expect(canvas).toHaveAttribute("data-rendered-frames", /^[1-9][0-9]*$/);
    const pixels = () =>
      canvas.evaluate((el) => {
        const c = el as HTMLCanvasElement;
        return Array.from(c.getContext("2d")!.getImageData(0, 0, 64, 64).data);
      });
    const full = await pixels();
    expect(full.some((v, i) => i % 4 === 0 && v !== full[i + 1])).toBe(true);
    await view.getByText("画質・計測", { exact: true }).click();
    await view.getByLabel("接続プリセット").selectOption("low");
    expect(await view.getByLabel("fps上限").inputValue()).toBe("5");
    expect(await view.getByLabel("送信する色").inputValue()).toBe("rgb332");
    await view.getByLabel("共有元のカーソルを表示", { exact: true }).uncheck();
    await view.getByRole("button", { name: "適用して再接続", exact: true }).click();
    await expect(view.locator("[data-desktop-applied]")).toContainText("256色");
    await expect(canvas).toHaveAttribute("data-rendered-frames", /^[1-9][0-9]*$/);
    expect(await canvas.evaluate((el) => (el as HTMLCanvasElement).width)).toBe(960);
    const reduced = await pixels(),
      rg = new Set([0, 36, 73, 109, 146, 182, 219, 255]),
      b = new Set([0, 85, 170, 255]);
    expect(reduced.every((v, i) => (i % 4 === 3 ? v === 255 : (i % 4 === 2 ? b : rg).has(v)))).toBe(
      true,
    );
    expect(starts.at(-1).options).toEqual({
      width: 960,
      fps: 5,
      quality: 40,
      deltas: true,
      adaptive: false,
      features: true,
      image: { colorMode: "rgb332", showCursor: false },
    });
    const count = starts.length;
    await view.getByLabel("fps上限").fill("0");
    await view.getByRole("button", { name: "適用して再接続", exact: true }).click();
    await expect(view.locator("p[role=status]")).toContainText("設定値を確認");
    expect(starts.length).toBe(count);
    await expect(view.locator("[data-desktop-status]")).toHaveText("閲覧中");
    await view.getByLabel("fps上限").fill("5");
    await view.locator("[data-agent-access] summary").click();
    await view
      .getByRole("button", { name: "エージェントへの画面提供・操作を許可", exact: true })
      .click();
    const ticket = view.getByLabel("エージェント接続コード");
    await expect(ticket).toHaveValue(/^[A-Za-z0-9_-]{43}$/);
    const lease = await agent.request("desktop.agent.attach", {
      ticket: await ticket.inputValue(),
    });
    await expect(view.locator("[data-desktop-status]")).toHaveText("エージェント操作中");
    await view.getByLabel("送信する色").selectOption("gray16");
    await view.getByRole("button", { name: "適用して再接続", exact: true }).click();
    await expect(view.locator("[data-desktop-applied]")).toContainText("16階調グレー");
    await expect(canvas).toHaveAttribute("data-rendered-frames", /^[1-9][0-9]*$/);
    await expect(view.locator("[data-desktop-status]")).toHaveText("閲覧中");
    const gray = await pixels();
    expect(
      gray.every((v, i) => (i % 4 === 3 ? v === 255 : v % 17 === 0 && v === gray[i - (i % 4)])),
    ).toBe(true);
    await expect(
      agent.request("desktop.agent.observe", { leaseId: lease.leaseId }),
    ).rejects.toThrow();
    await view.getByRole("button", { name: "閉じる", exact: true }).click();
    await expect(view).toHaveCount(0);
    await header.locator("[data-desktop-open]").click();
    await expect(view.locator("[data-desktop-applied]")).toContainText("16階調グレー");
    await expect(canvas).toHaveAttribute("data-rendered-frames", /^[1-9][0-9]*$/);
    await view.getByText("画質・計測", { exact: true }).click();
    await expect(view.getByLabel("送信する色")).toHaveValue("gray16");
    await expect(view.getByLabel("共有元のカーソルを表示", { exact: true })).not.toBeChecked();
    expect((await canvas.boundingBox())?.height).toBeGreaterThan(80);
    await view.screenshot({ path: "/tmp/soda-desktop-settings-preview.png" }); // Synthetic image only; no desktop or credentials.
    await view.getByRole("button", { name: "共有停止", exact: true }).click();
    await expect(view).toHaveCount(0);
  } finally {
    await provider.close();
  }
});
