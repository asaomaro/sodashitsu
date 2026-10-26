import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openNativeTab } from "../support/nativeTab.js";

// Actual A/B servers and two browser pages. All desktop pixels/input are generated.
// Success uses each browser's canvas, DOM and its own received control ACKs.
test("two viewers share capture, keep input exclusive, and survive another viewer closing", async ({ page, context, appServer }) => {
  test.setTimeout(90000);
  const dir = await mkdtemp(join(tmpdir(), "soda-shared-e2e-")), lifecycle = join(dir, "children.jsonl");
  const env = {
    SODA_DESKTOP_COMMAND: JSON.stringify([process.execPath, fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url)), "--allow-input", "--lifecycle-ledger", lifecycle]),
    SODA_DESKTOP_ALLOW_INPUT: "1",
  };
  const saved = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  Object.assign(process.env, env);
  const provider = await startAppServer().finally(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  const second = await context.newPage();
  const messages: any[][] = [[], []];
  for (const [i, browserPage] of [page, second].entries()) browserPage.on("websocket", socket => {
    if (!socket.url().endsWith("/desktop-share")) return;
    socket.on("framereceived", ({ payload }) => { if (typeof payload === "string") try { messages[i]!.push(JSON.parse(payload)); } catch {} });
  });
  try {
    const b = await provider.openClient(), a = await appServer.openClient();
    await a.request("prefs.set", { patch: { notifyHintDone: true } });
    await a.request("workspace.set_project_folder", { workspaceId: a.helloSnapshot()!.workspaces[0]!.id, path: appServer.stateDir });
    const invite = await a.request("machine.invite", { label: "Generated shared desktop B" });
    await b.request("machine.delegate", { url: appServer.origin, machineId: invite.machineId, token: invite.token });
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    await expect(page.locator(`[data-machine-id="${invite.machineId}"] [data-state="online"]`)).toBeVisible();
    await openNativeTab(page, "desktop", page.locator(`[data-machine-id="${invite.machineId}"]`));
    const firstView = page.locator("[data-remote-desktop]"), firstCanvas = firstView.getByLabel("共有画面");
    await expect(firstCanvas).toHaveAttribute("data-rendered-frames", /^[1-9]/);
    await firstView.getByLabel("複数viewerで同じ画面を共有", { exact: true }).check();
    await expect(firstView.locator("[data-desktop-shared]")).toBeVisible();
    await expect(firstCanvas).toHaveAttribute("data-rendered-frames", /^[1-9]/);
    await second.goto(`${appServer.origin}/#token=${appServer.token}`);
    await openNativeTab(second, "desktop", second.locator(`[data-machine-id="${invite.machineId}"]`));
    const secondView = second.locator("[data-remote-desktop]"), secondCanvas = secondView.getByLabel("共有画面");
    // The initial single-view request cannot join a shared generation. Explicit opt-in is required.
    await expect(secondView.locator("[data-desktop-status]")).toHaveText(/停止|終了/);
    await secondView.getByLabel("複数viewerで同じ画面を共有", { exact: true }).check();
    await expect(secondCanvas).toHaveAttribute("data-rendered-frames", /^[1-9]/);
    for (const view of [firstView, secondView]) {
      await expect(view.locator("[data-desktop-media]")).toHaveCount(0);
      await expect(view.locator("[data-desktop-clipboard]")).toHaveCount(0);
      await expect(view.getByLabel("接続先を最大解像度にする", { exact: true })).toHaveCount(0);
    }
    for (const canvas of [firstCanvas, secondCanvas]) expect(await canvas.evaluate(el => {
      const c = el as HTMLCanvasElement;
      return c.width === 1280 && c.getContext("2d")!.getImageData(20, 20, 1, 1).data[3] === 255;
    })).toBe(true);
    const children = (await readFile(lifecycle, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    expect(children).toHaveLength(2); // initial single-view helper, then exactly one shared helper
    await page.bringToFront();
    await firstView.getByRole("button", { name: "操作する", exact: true }).click();
    await expect(firstView.locator("[data-desktop-status]")).toHaveText("操作中");
    const deniedBefore = messages[1]!.filter(m => m.type === "control").length;
    // Clicking via DOM keeps the first page focused: a real blur intentionally revokes control.
    await secondView.getByRole("button", { name: "操作する", exact: true }).evaluate(el => (el as HTMLButtonElement).click());
    await expect.poll(() => messages[1]!.filter(m => m.type === "control").length).toBeGreaterThan(deniedBefore);
    expect(messages[1]!.filter(m => m.type === "control").at(-1)).toMatchObject({ enabled: false });
    await expect(firstView.locator("[data-desktop-status]")).toHaveText("操作中");
    const count = Number(await secondCanvas.getAttribute("data-rendered-frames"));
    await firstView.getByRole("button", { name: "共有停止", exact: true }).click();
    await expect(firstView).toHaveCount(0);
    await second.bringToFront();
    await expect.poll(async () => Number(await secondCanvas.getAttribute("data-rendered-frames"))).toBeGreaterThan(count);
    await secondView.getByRole("button", { name: "操作する", exact: true }).click();
    await expect(secondView.locator("[data-desktop-status]")).toHaveText("操作中");
    await secondCanvas.focus(); await second.keyboard.press("ArrowRight");
    await expect.poll(() => messages[1]!.some(m => m.type === "input_ack")).toBe(true);
    expect((await readFile(lifecycle, "utf8")).trim().split("\n")).toHaveLength(2);
    await secondView.getByRole("button", { name: "共有停止", exact: true }).click();
  } finally { await second.close(); await provider.close(); await rm(dir, { recursive: true, force: true }); }
});
