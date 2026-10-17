import { fileURLToPath } from "node:url";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import type { DesktopFrameInfo } from "@sodashitsu/protocol";

test("static images are suppressed; distant lossless patches preserve the canvas and API snapshots", async ({
  page,
  appServer,
}) => {
  test.setTimeout(45000);
  const saved = process.env.SODA_DESKTOP_COMMAND,
    savedInput = process.env.SODA_DESKTOP_ALLOW_INPUT;
  process.env.SODA_DESKTOP_COMMAND = JSON.stringify([
    process.execPath,
    fileURLToPath(
      new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
    ),
    "--delta-test",
    "--allow-input",
  ]);
  process.env.SODA_DESKTOP_ALLOW_INPUT = "1";
  const provider = await startAppServer().finally(() => {
    if (saved === undefined) delete process.env.SODA_DESKTOP_COMMAND;
    else process.env.SODA_DESKTOP_COMMAND = saved;
    if (savedInput === undefined) delete process.env.SODA_DESKTOP_ALLOW_INPUT;
    else process.env.SODA_DESKTOP_ALLOW_INPUT = savedInput;
  });
  const received: { info: DesktopFrameInfo; imageBytes: number; packetBytes: number }[] = [];
  page.on("websocket", (socket) => {
    if (socket.url().endsWith("/desktop-share"))
      socket.on("framereceived", ({ payload }) => {
        if (Buffer.isBuffer(payload)) {
          const n = payload.readUInt16BE();
          received.push({
            info: JSON.parse(payload.subarray(2, 2 + n).toString()),
            imageBytes: payload.length - 2 - n,
            packetBytes: payload.length,
          });
        }
      });
  });
  try {
    const owner = await provider.openClient(),
      agent = await appServer.openClient();
    const invite = await agent.request("machine.invite", { label: "Delta B" });
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
    const pixel = async (x: number, y: number) =>
      canvas.evaluate(
        (el, p) =>
          Array.from((el as HTMLCanvasElement).getContext("2d")!.getImageData(p.x, p.y, 1, 1).data),
        { x, y },
      );
    expect(await pixel(32, 32)).toEqual([0, 255, 0, 255]);
    const unchangedPixel = await pixel(300, 100);
    await expect
      .poll(() => received.filter((f) => f.info.update?.kind === "unchanged").length, {
        timeout: 5000,
      })
      .toBeGreaterThanOrEqual(2);
    expect(received.filter((f) => !f.info.update)).toHaveLength(1);
    const idle = received.filter((f) => f.info.update?.kind === "unchanged");
    expect(idle.every((f) => f.imageBytes === 0)).toBe(true);
    expect(idle.reduce((s, f) => s + f.packetBytes, 0)).toBeLessThan(received[0]!.imageBytes / 100);
    await view.getByRole("button", { name: "操作する", exact: true }).click();
    await expect(view.locator("[data-desktop-status]")).toHaveText("操作中");
    await view.getByLabel("確定した文字を送る").fill("change");
    await view.getByRole("button", { name: "文字を送る", exact: true }).click();
    await expect.poll(() => pixel(32, 32)).toEqual([255, 0, 0, 255]);
    expect(await pixel(1248, 688)).toEqual([255, 0, 0, 255]);
    expect(await pixel(300, 100)).toEqual(unchangedPixel);
    const patch = received.find((f) => f.info.update?.kind === "patch")!;
    expect(patch.info.update?.kind).toBe("patch");
    if (patch.info.update?.kind === "patch") expect(patch.info.update.patches).toHaveLength(2);
    expect(patch.imageBytes).toBeLessThan(received[0]!.imageBytes / 100);
    expect(
      await canvas.evaluate((el) => [
        (el as HTMLCanvasElement).width,
        (el as HTMLCanvasElement).height,
      ]),
    ).toEqual([1280, 720]);
    await view.locator("[data-agent-access] summary").click();
    await view
      .getByRole("button", { name: "エージェントへの画面提供・操作を許可", exact: true })
      .click();
    const code = view.getByLabel("エージェント接続コード");
    await expect(code).toHaveValue(/^[A-Za-z0-9_-]{43}$/);
    const lease = await agent.request("desktop.agent.attach", { ticket: await code.inputValue() });
    await expect(view.locator("[data-desktop-status]")).toHaveText("エージェント操作中");
    const observation = await agent.request("desktop.agent.observe", { leaseId: lease.leaseId });
    expect(
      await canvas.evaluate(async (el, o) => {
        const bitmap = await createImageBitmap(
          new Blob([Uint8Array.from(atob(o.imageBase64), (c) => c.charCodeAt(0))], {
            type: o.format,
          }),
        );
        const c = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = c.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        return [
          c.width,
          c.height,
          ...Array.from(ctx.getImageData(32, 32, 1, 1).data),
          ...Array.from(ctx.getImageData(1248, 688, 1, 1).data),
        ];
      }, observation),
    ).toEqual([1280, 720, 255, 0, 0, 255, 255, 0, 0, 255]);
    await expect
      .poll(() => received.filter((f) => !f.info.update).length)
      .toBeGreaterThanOrEqual(2);
    await agent.request("desktop.agent.act", {
      leaseId: lease.leaseId,
      observationId: observation.observationId,
      inputs: [{ kind: "text", text: "again" }],
    });
    await expect.poll(() => pixel(32, 32)).toEqual([0, 255, 0, 255]);
    expect(await pixel(300, 100)).toEqual(unchangedPixel);
    await agent.request("desktop.agent.release", { leaseId: lease.leaseId });
    await expect(view.locator("[data-desktop-status]")).toHaveText("閲覧中");
    const fullCount = received.filter((f) => !f.info.update).length;
    await view.getByRole("button", { name: "再同期", exact: true }).click();
    await expect
      .poll(() => received.filter((f) => !f.info.update).length)
      .toBeGreaterThan(fullCount);
    expect(await pixel(32, 32)).toEqual([0, 255, 0, 255]);
    await view.getByRole("button", { name: "共有停止", exact: true }).click();
    await expect(view).toHaveCount(0);
    await expect(header.locator('[data-state="online"]')).toBeVisible();
  } finally {
    await provider.close();
  }
});
