import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import type { DesktopFrameInfo } from "@sodashitsu/protocol";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";

type Probe = { info: DesktopFrameInfo[]; arrivals: number[]; bytes: number; stats: { ackP95Ms: number }; echo: number[]; terminal?: WebSocket; echoStart?: number; echoPane?: string };
const percentile = (values: number[]) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * .95) - 1)] ?? 0;

test("synthetic desktop performance over real B outbound delegation (opt-in)", async ({ page, appServer }, testInfo) => {
  test.skip(process.env.SODA_DESKTOP_BENCH !== "1", "Run scripts/remote-desktop/benchmark.mjs explicitly");
  const width = Number(process.env.SODA_DESKTOP_BENCH_WIDTH ?? 1280), fps = Number(process.env.SODA_DESKTOP_BENCH_FPS ?? 10), frames = Number(process.env.SODA_DESKTOP_BENCH_FRAMES ?? 100);
  if (![640, 1280, 1920].includes(width) || ![5, 10, 20, 30].includes(fps) || !Number.isInteger(frames) || frames < 20 || frames > 900) throw new Error("Invalid benchmark options");
  const frameWaitMs = Math.max(100000, Math.ceil(frames / fps * 2500));
  test.setTimeout(frameWaitMs + 60000);
  const helper = fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url));
  const saved = process.env.SODA_DESKTOP_COMMAND;
  process.env.SODA_DESKTOP_COMMAND = JSON.stringify([process.execPath, helper]);
  const provider = await startAppServer().finally(() => { if (saved === undefined) delete process.env.SODA_DESKTOP_COMMAND; else process.env.SODA_DESKTOP_COMMAND = saved; });
  const owner = await provider.openClient(), operator = await appServer.openClient();
  try {
    await page.addInitScript(({ width, fps }) => {
      const p: Probe = { info: [], arrivals: [], bytes: 0, stats: { ackP95Ms: 0 }, echo: [] };
      (window as unknown as { __desktopProbe: Probe }).__desktopProbe = p;
      const Base = window.WebSocket;
      window.WebSocket = class extends Base {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          const desktop = String(url).endsWith("/desktop-share");
          if (String(url).endsWith("/ws")) this.addEventListener("open", () => { p.terminal = this; });
          this.addEventListener("message", (ev) => {
            if (desktop) {
              if (ev.data instanceof ArrayBuffer) {
                const b = new Uint8Array(ev.data), n = new DataView(ev.data).getUint16(0);
                p.info.push(JSON.parse(new TextDecoder().decode(b.subarray(2, n + 2)))); p.arrivals.push(performance.now()); p.bytes += b.length;
              } else { const m = JSON.parse(String(ev.data)); if (m.type === "stats") p.stats = m; }
            } else if (ev.data instanceof ArrayBuffer && p.echoStart !== undefined) {
              const b = new Uint8Array(ev.data);
              if (b[0] !== 1 || new TextDecoder().decode(b.subarray(2, 2 + b[1]!)) !== p.echoPane || !new TextDecoder().decode(b.subarray(2 + b[1]!)).includes("x")) return;
              const started = p.echoStart; delete p.echoStart;
              requestAnimationFrame(() => p.echo.push(performance.now() - started));
            }
          });
        }
        override send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
          if (this.url.endsWith("/desktop-share") && typeof data === "string") { const m = JSON.parse(data); if (m.type === "start") data = JSON.stringify({ ...m, options: { ...m.options, width, fps } }); }
          super.send(data);
        }
      } as typeof WebSocket;
    }, { width, fps });
    const invitation = await operator.request("machine.invite", { label: "Desktop benchmark B" });
    await owner.request("machine.delegate", { url: appServer.origin, machineId: invitation.machineId, token: invitation.token });
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    const header = page.locator(`[data-machine-id="${invitation.machineId}"]`);
    await expect(header.locator('[data-state="online"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".xterm-helper-textarea").first()).toBeAttached();
    const paneId = operator.helloSnapshot()!.panes[0]!.id;
    async function echoSample(count: number) {
      await page.evaluate(() => { (window as unknown as { __desktopProbe: Probe }).__desktopProbe.echo = []; });
      for (let i = 0; i < count; i++) {
        await page.evaluate((id) => {
          const p = (window as unknown as { __desktopProbe: Probe }).__desktopProbe, key = new TextEncoder().encode(id), b = new Uint8Array(key.length + 3);
          b[0] = 3; b[1] = key.length; b.set(key, 2); b[b.length - 1] = 120;
          p.echoPane = id; p.echoStart = performance.now(); p.terminal!.send(b);
        }, paneId);
        await page.waitForFunction((n) => (window as unknown as { __desktopProbe: Probe }).__desktopProbe.echo.length > n, i, { timeout: 5000 });
      }
      return page.evaluate(() => (window as unknown as { __desktopProbe: Probe }).__desktopProbe.echo);
    }
    const baseline = await echoSample(30);
    const cdp = await page.context().newCDPSession(page); await cdp.send("Performance.enable");
    const beforeBrowser = await cdp.send("Performance.getMetrics"), beforeCpu = process.cpuUsage(), before = performance.now();
    await header.locator("[data-desktop-open]").click();
    const canvas = page.locator("[data-remote-desktop] canvas");
    await expect(canvas).toHaveAttribute("data-rendered-frames", /^[1-9][0-9]*$/);
    const loaded = await echoSample(30);
    await page.waitForFunction((n) => Number(document.querySelector("[data-remote-desktop] canvas")?.getAttribute("data-rendered-frames")) >= n, frames, { timeout: frameWaitMs });
    const afterCpu = process.cpuUsage(beforeCpu), duration = performance.now() - before, afterBrowser = await cdp.send("Performance.getMetrics");
    const measured = await page.evaluate(() => { const { info, arrivals, bytes, stats } = (window as unknown as { __desktopProbe: Probe }).__desktopProbe; return { info, arrivals, bytes, stats }; });
    const sourceSpan = measured.arrivals.at(-1)! - measured.arrivals[0]!, first = measured.info[0]!, last = measured.info.at(-1)!;
    const metric = (data: { metrics: { name: string; value: number }[] }, name: string) => data.metrics.find((m) => m.name === name)?.value ?? 0;
    const report = {
      kind: "synthetic-png-transport-and-browser-only", os: process.platform, architecture: process.arch, node: process.version, browser: page.context().browser()?.version(), width, height: last.height, targetFps: fps,
      frames: measured.info.length, measuredSeconds: sourceSpan / 1000, achievedFps: (measured.info.length - 1) * 1000 / sourceSpan,
      averageFrameBytes: measured.bytes / measured.info.length, averageMbps: measured.bytes * 8 / sourceSpan / 1000,
      relayToDrawAckP95Ms: measured.stats.ackP95Ms, sourceGenerateP95Ms: percentile(measured.info.map((m) => m.captureMs)), sourcePngEncodeP95Ms: percentile(measured.info.map((m) => m.encodeMs)),
      sourceCpuOneCorePercent: ((last.sourceCpuMs ?? 0) - (first.sourceCpuMs ?? 0)) * 100 / sourceSpan,
      sourcePeakRssMiB: Math.max(...measured.info.map((m) => m.sourceMemoryBytes ?? 0)) / 1048576,
      combinedServersCpuOneCorePercent: (afterCpu.user + afterCpu.system) / 10 / duration,
      combinedServersRssMiB: process.memoryUsage().rss / 1048576,
      browserTaskPercent: (metric(afterBrowser, "TaskDuration") - metric(beforeBrowser, "TaskDuration")) * 100000 / duration,
      browserJsHeapMiB: metric(afterBrowser, "JSHeapUsedSize") / 1048576,
      terminalBrowserEchoPaintP95Ms: { withoutShare: percentile(baseline), withShare: percentile(loaded), samplesEach: 30 },
      limitations: "Loopback A/B and Chromium on one Linux host. Source generates PNG; no Windows capture/input, physical network, or GPU benchmark. Echo ends at browser receipt plus next animation frame; not pixel verification. No real desktop performance conclusion.",
    };
    expect(report.frames).toBeGreaterThanOrEqual(frames); expect(report.achievedFps).toBeGreaterThan(0);
    const out = join(process.env.SODA_DESKTOP_BENCH_OUT ?? tmpdir(), `soda-desktop-perf-${width}-${fps}.json`);
    await writeFile(out, JSON.stringify(report, null, 2) + "\n");
    await testInfo.attach("desktop-performance", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
    console.log("DESKTOP_BENCH " + JSON.stringify(report));
    await page.locator("[data-remote-desktop]").getByRole("button", { name: "共有停止", exact: true }).click();
  } finally { await provider.close(); }
});
