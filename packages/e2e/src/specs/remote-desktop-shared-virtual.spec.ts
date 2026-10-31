// Generated virtual markers and pixels only; no OS driver, monitor or service is created.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openNativeTab } from "../support/nativeTab.js";

// Allow an installed browser override when the host Chromium build stalls at startup.
const executablePath = process.env["SODA_E2E_CHROMIUM_PATH"];
if (executablePath) test.use({ launchOptions: { executablePath } });

test("two virtual viewers share one owned source and encoder until the last viewer closes", async ({ page, context, appServer },testInfo) => {
  test.setTimeout(90000);
  const dir = await mkdtemp(join(tmpdir(), "soda-shared-native-")), lifecycle = join(dir, "children.jsonl");
  const env = {
    SODA_DESKTOP_COMMAND: JSON.stringify([process.execPath, fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url)), "--allow-input", "--virtual-display", "--static", "--native-60fps", "--native-fixture", fileURLToPath(new URL("../../../../scripts/remote-desktop/fixtures/h264-generated.json", import.meta.url)), "--lifecycle-ledger", lifecycle]),
    SODA_DESKTOP_ALLOW_INPUT: "1", SODA_DESKTOP_ALLOW_MEDIA: "1",SODA_DESKTOP_ALLOW_VIRTUAL_DISPLAY:"1",
  };
  const saved = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]])); Object.assign(process.env, env);
  const provider = await startAppServer().finally(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  const slow = await context.newPage();
  await slow.addInitScript(() => {
    (window as any).__ackDelay = 300;
    const Base = WebSocket;
    window.WebSocket = class extends Base {
      private lastAckDue = 0;
      override send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
        if (typeof data === "string" && this.url.endsWith("/desktop-share") && JSON.parse(data).type === "native_video_ack") {
          // Delay only generated viewer ACKs. Keep FIFO when the delay is removed.
          const due = Math.max(performance.now() + (window as any).__ackDelay, this.lastAckDue + 1); this.lastAckDue = due;
          setTimeout(() => { if (this.readyState === Base.OPEN) super.send(data); }, Math.max(0, due - performance.now())); return;
        }
        super.send(data);
      }
    };
  });
  const received: any[][] = [[], []];
  for (const [i, browserPage] of [page, slow].entries()) browserPage.on("websocket", socket => {
    if (socket.url().endsWith("/desktop-share")) socket.on("framereceived", ({ payload }) => { if (typeof payload === "string") try { received[i]!.push(JSON.parse(payload)); } catch {} });
  });
  const ledger = async () => (await readFile(lifecycle, "utf8")).trim().split("\n").map(line => JSON.parse(line));
  try {
    const b = await provider.openClient(), a = await appServer.openClient();
    await a.request("prefs.set", { patch: { notifyHintDone: true } });
    await a.request("workspace.set_project_folder", { workspaceId: a.helloSnapshot()!.workspaces[0]!.id, path: appServer.stateDir });
    const invite = await a.request("machine.invite", { label: "Generated shared encoder B" });
    await b.request("machine.delegate", { url: appServer.origin, machineId: invite.machineId, token: invite.token });
    const separator=appServer.cookie.indexOf("=");await context.addCookies([{name:appServer.cookie.slice(0,separator),value:appServer.cookie.slice(separator+1),url:appServer.origin,httpOnly:true,sameSite:"Strict"}]);
    for (const browserPage of [page, slow]) {
      await browserPage.goto(appServer.origin);
      const header=browserPage.locator(`[data-machine-id="${invite.machineId}"]`);
      await expect(header.locator('[data-state="online"]')).toBeVisible();
      await openNativeTab(browserPage,"desktop",header);
      const view = browserPage.locator("[data-remote-desktop]");
      await expect(view.locator("[data-shared-virtual-available]")).toBeVisible();
      await view.getByLabel("複数viewerで同じ画面を共有", { exact: true }).check();
      await view.getByLabel("一時的な仮想画面を使う",{exact:true}).check();
      await expect(view.locator("[data-virtual-display-active]")).toBeVisible();
      await expect(view.getByLabel("共有画面")).toHaveAttribute("data-rendered-frames", /^[1-9]/);
      await view.locator("[data-desktop-media] summary").click();
      await expect(view.getByLabel("動画の経路")).toHaveValue("native");
      await expect(view.getByLabel("システム音声を要求", { exact: true })).toBeDisabled();
      await view.getByRole("button", { name: "動画共有を依頼", exact: true }).click();
      await expect(view.locator("[data-media-state]")).toHaveText("GPU H.264");
      await expect.poll(async () => Number(await view.getByLabel("共有画面").getAttribute("data-video-frames"))).toBeGreaterThanOrEqual(6);
    }
    const fastView = page.locator("[data-remote-desktop]"), slowView = slow.locator("[data-remote-desktop]");
    const fastCanvas = fastView.getByLabel("共有画面"), slowCanvas = slowView.getByLabel("共有画面");
    for (const canvas of [fastCanvas, slowCanvas]) expect(await canvas.evaluate(el => {
      const c = el as HTMLCanvasElement, p = c.getContext("2d")!.getImageData(80, 60, 1, 1).data;
      return c.width === 640 && p[0]! > 220 && p[1]! < 35 && p[2]! < 35;
    })).toBe(true);
    const fastBefore = Number(await fastCanvas.getAttribute("data-video-frames"));
    const slowBefore = Number(await slowCanvas.getAttribute("data-video-frames"));
    await expect.poll(async () => Number(await fastCanvas.getAttribute("data-video-frames"))).toBeGreaterThan(fastBefore + 10);
    await slow.evaluate(() => { (window as any).__ackDelay = 0; });
    await expect.poll(async () => Number(await slowCanvas.getAttribute("data-video-frames"))).toBeGreaterThan(slowBefore + 6);
    expect((await ledger()).filter(m => m.type === "spawn")).toHaveLength(3);
    expect((await ledger()).filter(m => m.type === "native_start")).toHaveLength(1);
    await fastView.getByRole("button", { name: "共有停止", exact: true }).click();
    const remaining = Number(await slowCanvas.getAttribute("data-video-frames"));
    await expect.poll(async () => Number(await slowCanvas.getAttribute("data-video-frames"))).toBeGreaterThan(remaining + 4);
    expect((await ledger()).filter(m => m.type === "native_stop")).toHaveLength(0);
    await slow.bringToFront(); await slowView.getByRole("button", { name: "操作する", exact: true }).click();
    await expect(slowView.locator("[data-desktop-status]")).toHaveText("操作中");
    await slowCanvas.focus(); await slow.keyboard.press("ArrowRight");
    await expect.poll(() => received[1]!.some(m => m.type === "input_ack")).toBe(true);
    await expect(slowView.locator("[data-virtual-display-active]")).toBeVisible();
    await slow.screenshot({path:testInfo.outputPath("shared-virtual-surviving-viewer.png")});
    await slowView.getByRole("button", { name: "動画・音声を停止", exact: true }).click();
    await expect(slowView.locator("[data-media-state]")).toHaveText("画像配信");
    await expect.poll(async () => (await ledger()).filter(m => m.type === "native_stop").length).toBe(1);
    await slowView.getByRole("button", { name: "共有停止", exact: true }).click();
  } finally { await page.goto("about:blank").catch(()=>{}); await slow.close().catch(()=>{}); await provider.close(); await rm(dir, { recursive: true, force: true }); }
});
