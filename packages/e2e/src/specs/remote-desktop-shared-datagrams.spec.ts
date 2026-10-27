import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openNativeTab } from "../support/nativeTab.js";

// Actual browser/Node DTLS datachannels, generated video only. No desktop capture/input.
test("shared UDP viewers recover packet loss and one peer can fall back to WSS independently", async ({ page, context, appServer }) => {
  test.setTimeout(90000);
  const dir = await mkdtemp(join(tmpdir(), "soda-shared-udp-")), lifecycle = join(dir, "children.jsonl");
  const env = {
    SODA_DESKTOP_COMMAND: JSON.stringify([process.execPath, fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url)), "--static", "--native-datagrams", "--native-60fps", "--native-fixture", fileURLToPath(new URL("../../../../scripts/remote-desktop/fixtures/h264-generated.json", import.meta.url)), "--lifecycle-ledger", lifecycle]),
    SODA_DESKTOP_ALLOW_MEDIA: "1",
  };
  const saved = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]])); Object.assign(process.env, env);
  const provider = await startAppServer().finally(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  const second = await context.newPage(), received: any[][] = [[], []];
  for (const [index, browserPage] of [page, second].entries()) {
    await browserPage.addInitScript(() => {
      const Base = RTCPeerConnection;
      (window as any).__nativePeers = []; (window as any).__dropNext = false; (window as any).__droppedSeq = 0;
      window.RTCPeerConnection = class extends Base {
        constructor(config?: RTCConfiguration) {
          super(config); (window as any).__nativePeers.push(this);
          this.addEventListener("datachannel", ({ channel }) => {
            if (channel.label !== "soda-h264-v1") return;
            const descriptor = Object.getOwnPropertyDescriptor(RTCDataChannel.prototype, "onmessage")!;
            Object.defineProperty(channel, "onmessage", { configurable: true, get: () => descriptor.get!.call(channel), set: handler => descriptor.set!.call(channel, (event: MessageEvent) => {
              if (event.data instanceof ArrayBuffer && event.data.byteLength >= 20) {
                const seq = new DataView(event.data).getUint32(16);
                if ((window as any).__dropNext) { (window as any).__dropNext = false; (window as any).__droppedSeq = seq; }
                if (seq === (window as any).__droppedSeq) return;
              }
              handler?.call(channel, event);
            }) });
          });
        }
      };
    });
    browserPage.on("websocket", socket => { if (socket.url().endsWith("/desktop-share")) socket.on("framereceived", ({ payload }) => { if (typeof payload === "string") try { received[index]!.push(JSON.parse(payload)); } catch {} }); });
  }
  const ledger = async () => (await readFile(lifecycle, "utf8")).trim().split("\n").map(line => JSON.parse(line));
  try {
    const b = await provider.openClient(), a = await appServer.openClient();
    await a.request("prefs.set", { patch: { notifyHintDone: true } });
    await a.request("workspace.set_project_folder", { workspaceId: a.helloSnapshot()!.workspaces[0]!.id, path: appServer.stateDir });
    const invite = await a.request("machine.invite", { label: "Generated shared UDP B" });
    await b.request("machine.delegate", { url: appServer.origin, machineId: invite.machineId, token: invite.token });
    for (const browserPage of [page, second]) {
      await browserPage.goto(`${appServer.origin}/#token=${appServer.token}`);
      await expect(browserPage.locator(`[data-machine-id="${invite.machineId}"] [data-state="online"]`)).toBeVisible();
      await openNativeTab(browserPage, "desktop", browserPage.locator(`[data-machine-id="${invite.machineId}"]`));
      const view = browserPage.locator("[data-remote-desktop]");
      await view.getByLabel("複数viewerで同じ画面を共有", { exact: true }).check();
      await expect(view.getByLabel("共有画面")).toHaveAttribute("data-rendered-frames", /^[1-9]/);
      await view.locator("[data-desktop-media] summary").click();
      await expect(view.getByLabel("UDPを優先（利用できない場合はWSS）")).toBeChecked();
      await view.getByRole("button", { name: "動画共有を依頼", exact: true }).click();
      await expect(view.locator("[data-native-datagrams]")).toBeVisible();
      await expect.poll(async () => Number(await view.getByLabel("共有画面").getAttribute("data-video-frames")), { timeout: 20000 }).toBeGreaterThan(10);
      expect(await browserPage.evaluate(async () => {
        const peer = ((window as any).__nativePeers as RTCPeerConnection[]).find(p => p.connectionState === "connected")!;
        const rows: any[] = []; (await peer.getStats()).forEach(s => rows.push(s));
        const transport = rows.find(s => s.type === "transport" && s.selectedCandidatePairId);
        const pair = transport ? rows.find(s => s.id === transport.selectedCandidatePairId) : rows.find(s => s.type === "candidate-pair" && s.nominated && s.state === "succeeded");
        return [rows.find(s => s.id === pair.localCandidateId)?.protocol, rows.find(s => s.id === pair.remoteCandidateId)?.protocol];
      })).toEqual(["udp", "udp"]);
    }
    const firstView = page.locator("[data-remote-desktop]"), secondView = second.locator("[data-remote-desktop]");
    const firstCanvas = firstView.getByLabel("共有画面"), secondCanvas = secondView.getByLabel("共有画面");
    const beforeLoss = Number(await firstCanvas.getAttribute("data-video-frames"));
    await page.evaluate(() => { (window as any).__dropNext = true; });
    await expect.poll(() => page.evaluate(() => (window as any).__droppedSeq)).toBeGreaterThan(0);
    await expect.poll(async () => Number(await firstCanvas.getAttribute("data-video-frames")), { timeout: 10000 }).toBeGreaterThan(beforeLoss + 20);
    await expect(firstView.locator("[data-native-datagrams]")).toBeVisible();
    expect(received[0]!.filter(m => m.type === "media_stream")).toHaveLength(1);
    const secondBefore = Number(await secondCanvas.getAttribute("data-video-frames"));
    await page.evaluate(() => { for (const peer of (window as any).__nativePeers as RTCPeerConnection[]) if (peer.connectionState === "connected") peer.close(); });
    await expect(firstView.locator("[data-native-datagrams]")).toHaveCount(0);
    await expect.poll(() => received[0]!.filter(m => m.type === "media_stream").length).toBe(2);
    const resumed = Number(await firstCanvas.getAttribute("data-video-frames"));
    await expect.poll(async () => Number(await firstCanvas.getAttribute("data-video-frames"))).toBeGreaterThan(resumed + 8);
    await expect(secondView.locator("[data-native-datagrams]")).toBeVisible();
    await expect.poll(async () => Number(await secondCanvas.getAttribute("data-video-frames"))).toBeGreaterThan(secondBefore + 8);
    expect(received[1]!.filter(m => m.type === "media_stream")).toHaveLength(1);
    expect((await ledger()).filter(m => m.type === "native_start")).toHaveLength(1);
    for (const canvas of [firstCanvas, secondCanvas]) expect(await canvas.evaluate(el => { const c = el as HTMLCanvasElement, p = c.getContext("2d")!.getImageData(80, 60, 1, 1).data; return c.width === 640 && p[0]! > 220 && p[1]! < 35; })).toBe(true);
    await firstView.getByRole("button", { name: "共有停止", exact: true }).click();
    const remaining = Number(await secondCanvas.getAttribute("data-video-frames"));
    await expect.poll(async () => Number(await secondCanvas.getAttribute("data-video-frames"))).toBeGreaterThan(remaining + 8);
    await secondView.getByRole("button", { name: "共有停止", exact: true }).click();
  } finally { await second.close(); await provider.close(); await rm(dir, { recursive: true, force: true }); }
});
