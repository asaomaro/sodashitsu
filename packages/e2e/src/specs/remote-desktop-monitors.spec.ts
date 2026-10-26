import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openNativeTab } from "../support/nativeTab.js";
for (const mode of ["switch", "no-permission", "old-helper", "secure", "topology-display"] as const)
  test(`desktop generated monitors ${mode}`, async ({ page, appServer }) => {
    test.setTimeout(60000);
    const dir = await mkdtemp(join(tmpdir(), "soda-monitor-e2e-")),
      marker = join(dir, "topology-change");
    const env = {
      SODA_DESKTOP_COMMAND: JSON.stringify([
        process.execPath,
        fileURLToPath(
          new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
        ),
        "--static",
        "--allow-input",
        ...(mode === "topology-display" ? ["--monitors-one", "--allow-display-resize"] : []),
        ...(mode !== "old-helper" ? ["--monitors"] : []),
        ...(mode === "secure" ? ["--secure"] : []),
        "--topology-marker",
        marker,
      ]),
      SODA_DESKTOP_ALLOW_INPUT: "1",
      SODA_DESKTOP_ALLOW_MONITORS: mode === "no-permission" ? "0" : "1",
      ...(mode === "secure" ? { SODA_DESKTOP_ALLOW_UNLOCK: "1" } : {}),
      ...(mode === "topology-display" ? { SODA_DESKTOP_ALLOW_DISPLAY_RESIZE: "1" } : {}),
    };
    const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
    Object.assign(process.env, env);
    const provider = await startAppServer().finally(() => {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });
    const inputs: any[] = [],
      starts: any[] = [];
    page.on("websocket", (socket) =>
      socket.on("framesent", ({ payload }) => {
        if (typeof payload !== "string") return;
        try {
          const m = JSON.parse(payload);
          if (m.type === "input") inputs.push(m.input);
          if (m.type === "start") starts.push(m);
        } catch {}
      }),
    );
    try {
      const owner = await provider.openClient(),
        a = await appServer.openClient(),
        invite = await a.request("machine.invite", { label: "Generated mixed-scale monitors B" });
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
        canvas = view.getByLabel("共有画面"),
        selector = view.getByLabel("表示モニター");
      await expect(canvas).toHaveAttribute("data-rendered-frames", /^[1-9]/);
      if (mode !== "switch" && mode !== "topology-display") {
        await expect(view.locator("[data-monitor-selector]")).toHaveCount(0);
        await expect(view.locator("[data-desktop-status]")).toContainText("閲覧中");
        return;
      }
      await expect(selector).toHaveValue("right");
      await expect(selector).toContainText("150%");
      const pixel = (x: number, y: number) =>
        canvas.evaluate(
          (el, { x, y }) => {
            const c = el as HTMLCanvasElement;
            return Array.from(
              c
                .getContext("2d")!
                .getImageData(Math.floor((c.width - 1) * x), Math.floor((c.height - 1) * y), 1, 1)
                .data,
            );
          },
          { x, y },
        );
      if (mode === "topology-display") {
        await view.getByLabel("接続先を最大解像度にする").check();
        await expect(view.locator("[data-desktop-applied]")).toContainText("等倍");
        await expect
          .poll(() => canvas.evaluate((el) => (el as HTMLCanvasElement).width))
          .toBe(1920);
        await writeFile(marker, "generated topology change after resize");
        await expect(view.getByRole("alert")).toContainText("モニター構成が変更");
        await expect(view.locator("[data-desktop-status]")).toHaveText("停止");
        await expect(
          view.getByRole("button", { name: "既定のモニターで接続し直す", exact: true }),
        ).toBeVisible();
        return;
      }
      expect(await pixel(0.5, 0.5)).toEqual([255, 0, 0, 255]);
      await view.getByRole("button", { name: "操作する", exact: true }).click();
      await expect(view.locator("[data-desktop-status]")).toHaveText("操作中");
      await selector.selectOption("left");
      await expect(canvas).toHaveAttribute("data-rendered-frames", /^[1-9]/);
      await expect.poll(() => pixel(0.5, 0.5)).toEqual([0, 0, 255, 255]);
      await expect(view.locator("[data-desktop-status]")).toHaveText("閲覧中");
      await expect(selector).toHaveValue("left");
      await selector.selectOption("all");
      await expect.poll(() => canvas.evaluate((el) => (el as HTMLCanvasElement).width)).toBe(1280);
      await expect.poll(() => pixel(40 / 1439, 100 / 799)).toEqual([0, 0, 255, 255]);
      expect(await pixel(1340 / 1439, 700 / 799)).toEqual([255, 0, 0, 255]);
      expect(await pixel(1140 / 1439, 100 / 799)).toEqual([0, 0, 0, 255]);
      await view.getByRole("button", { name: "情報・設定", exact: true }).click();
      await view.getByRole("button", { name: "操作する", exact: true }).click();
      await expect(view.locator("[data-desktop-status]")).toHaveText("操作中");
      const rect = (await canvas.boundingBox())!,
        at = (x: number, y: number) => ({
          x: rect.x + rect.width * x,
          y: rect.y + rect.height * y,
        });
      const gap = at(1140 / 1439, 100 / 799),
        left = at(40 / 1439, 100 / 799);
      const before = inputs.filter((v) => v.kind === "pointer" && v.event === "down").length;
      await page.mouse.move(gap.x, gap.y);
      await page.mouse.down();
      await page.mouse.move(left.x, left.y);
      await page.mouse.up();
      await page.keyboard.press("ArrowRight");
      await expect
        .poll(() => inputs.some((v) => v.kind === "key" && v.code === "ArrowRight"))
        .toBe(true);
      expect(inputs.filter((v) => v.kind === "pointer" && v.event === "down")).toHaveLength(before);
      await page.mouse.click(left.x, left.y);
      await expect
        .poll(() => inputs.filter((v) => v.kind === "pointer" && v.event === "down").length)
        .toBe(before + 1);
      await page.keyboard.down("a");
      await writeFile(marker, "generated topology changed");
      await expect(view.getByRole("alert")).toContainText("モニター構成が変更");
      await expect(view.locator("[data-desktop-status]")).not.toHaveText("操作中");
      await page.keyboard.up("a");
      const count = starts.length;
      await rm(marker);
      await view.getByRole("button", { name: "既定のモニターで接続し直す", exact: true }).click();
      await expect.poll(() => canvas.evaluate((el) => (el as HTMLCanvasElement).width)).toBe(800);
      await expect.poll(() => pixel(0.5, 0.5)).toEqual([255, 0, 0, 255]);
      await expect(view.locator("[data-desktop-status]")).toHaveText("閲覧中");
      expect(starts.length).toBe(count + 1);
    } finally {
      await provider.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
