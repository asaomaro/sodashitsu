import { openNativeTab } from "../support/nativeTab.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import type { DesktopFrameInfo } from "@sodashitsu/protocol";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";

type Probe = { info: DesktopFrameInfo[]; arrivals: number[]; bytes: number; stats: { ackP95Ms: number }; backend?: string };
// Native capture is explicit opt-in; never retain actual desktop screenshots or traces.
test.use({trace:process.env.SODA_DESKTOP_BENCH_COMMAND ? "off" : "retain-on-failure",screenshot:"off",video:"off"});
const percentile = (values: number[]) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * .95) - 1)] ?? 0;

test("desktop performance over real B outbound delegation (opt-in)", async ({ page, appServer }, testInfo) => {
  test.skip(process.env.SODA_DESKTOP_BENCH !== "1", "Run scripts/remote-desktop/benchmark.mjs explicitly");
  const width = Number(process.env.SODA_DESKTOP_BENCH_WIDTH ?? 1280), fps = Number(process.env.SODA_DESKTOP_BENCH_FPS ?? 10), frames = Number(process.env.SODA_DESKTOP_BENCH_FRAMES ?? 100);
  if (![640, 1280, 1920].includes(width) || ![5, 10, 20, 30].includes(fps) || !Number.isInteger(frames) || frames < 20 || frames > 900) throw new Error("Invalid benchmark options");
  const frameWaitMs = Math.max(100000, Math.ceil(frames / fps * 2500));
  test.setTimeout(frameWaitMs + 60000);
  const nativeCommand = process.env.SODA_DESKTOP_BENCH_COMMAND;
  const ackDelayMs = Number(process.env.SODA_DESKTOP_BENCH_ACK_DELAY_MS ?? 0);
  const deltas = process.env.SODA_DESKTOP_BENCH_DELTAS !== "0";
  if (!Number.isInteger(ackDelayMs) || ackDelayMs < 0 || ackDelayMs > 2000) throw new Error("Invalid ACK delay");
  const helper = fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url));
  const saved = process.env.SODA_DESKTOP_COMMAND;
  process.env.SODA_DESKTOP_COMMAND = nativeCommand ?? JSON.stringify([process.execPath, helper]);
  const provider = await startAppServer().finally(() => { if (saved === undefined) delete process.env.SODA_DESKTOP_COMMAND; else process.env.SODA_DESKTOP_COMMAND = saved; });
  const owner = await provider.openClient(), operator = await appServer.openClient();
  try {
    for (const [client,server] of [[owner,provider],[operator,appServer]] as const) {
      await client.request("prefs.set",{patch:{notifyHintDone:true}});
      await client.request("workspace.set_project_folder",{workspaceId:client.helloSnapshot()!.workspaces[0]!.id,path:server.stateDir});
    }
    await page.addInitScript(({ width, fps, ackDelayMs, deltas }) => {
      const p: Probe = { info: [], arrivals: [], bytes: 0, stats: { ackP95Ms: 0 } };
      (window as unknown as { __desktopProbe: Probe }).__desktopProbe = p;
      const Base = window.WebSocket;
      window.WebSocket = class extends Base {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          const desktop = String(url).endsWith("/desktop-share");
          this.addEventListener("message", (ev) => {
            if (desktop) {
              if (ev.data instanceof ArrayBuffer) {
                const b = new Uint8Array(ev.data), n = new DataView(ev.data).getUint16(0);
                p.info.push(JSON.parse(new TextDecoder().decode(b.subarray(2, n + 2)))); p.arrivals.push(performance.now()); p.bytes += b.length;
              } else { const m = JSON.parse(String(ev.data)); if (m.type === "stats") p.stats = m; if (m.type === "ready") p.backend = m.backend; }
            }
          });
        }
        override send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
          if (this.url.endsWith("/desktop-share") && typeof data === "string") {
            const m = JSON.parse(data);
            if (m.type === "ack" && ackDelayMs) { setTimeout(() => { if (this.readyState === Base.OPEN) super.send(data); }, ackDelayMs); return; }
            if (m.type === "start") data = JSON.stringify({ ...m, options: { ...m.options, width, fps, deltas } });
          }
          super.send(data);
        }
      } as typeof WebSocket;
    }, { width, fps, ackDelayMs, deltas });
    const invitation = await operator.request("machine.invite", { label: "Desktop benchmark B" });
    await owner.request("machine.delegate", { url: appServer.origin, machineId: invitation.machineId, token: invitation.token });
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    const header = page.locator(`[data-machine-id="${invitation.machineId}"]`);
    await expect(header.locator('[data-state="online"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".xterm-helper-textarea").first()).toBeAttached();
    const cdp = await page.context().newCDPSession(page); await cdp.send("Performance.enable");
    const beforeBrowser = await cdp.send("Performance.getMetrics"), beforeCpu = process.cpuUsage(), before = performance.now();
    await openNativeTab(page, "desktop", header);
    const canvas = page.locator("[data-remote-desktop] canvas");
    await expect(canvas).toHaveAttribute("data-rendered-frames", /^[1-9][0-9]*$/);
    await page.waitForFunction((n) => Number(document.querySelector("[data-remote-desktop] canvas")?.getAttribute("data-rendered-frames")) >= n, frames, { timeout: frameWaitMs });
    const afterCpu = process.cpuUsage(beforeCpu), duration = performance.now() - before, afterBrowser = await cdp.send("Performance.getMetrics");
    const measured = await page.evaluate(() => { const { info, arrivals, bytes, stats, backend } = (window as unknown as { __desktopProbe: Probe }).__desktopProbe; return { info, arrivals, bytes, stats, backend }; });
    const sourceSpan = measured.arrivals.at(-1)! - measured.arrivals[0]!, first = measured.info[0]!, last = measured.info.at(-1)!;
    const metric = (data: { metrics: { name: string; value: number }[] }, name: string) => data.metrics.find((m) => m.name === name)?.value ?? 0;
    const report = {
      kind: nativeCommand ? "windows-native-capture-transport-browser" : "synthetic-png-transport-and-browser-only", viewerWireBackend: measured.backend, ackDelayMs, deltas, os: process.platform, architecture: process.arch, node: process.version, browser: page.context().browser()?.version(), width, height: last.height, targetFps: fps,
      frames: measured.info.length, measuredSeconds: sourceSpan / 1000, achievedFps: (measured.info.length - 1) * 1000 / sourceSpan,
      averageFrameBytes: measured.bytes / measured.info.length, averageMbps: measured.bytes * 8 / sourceSpan / 1000,
      relayToDrawAckP95Ms: measured.stats.ackP95Ms, sourceGenerateP95Ms: percentile(measured.info.map((m) => m.captureMs)), sourceEncodeP95Ms: percentile(measured.info.map((m) => m.encodeMs)),
      sourceCpuOneCorePercent: ((last.sourceCpuMs ?? 0) - (first.sourceCpuMs ?? 0)) * 100 / sourceSpan,
      sourcePeakRssMiB: Math.max(...measured.info.map((m) => m.sourceMemoryBytes ?? 0)) / 1048576,
      combinedServersCpuOneCorePercent: (afterCpu.user + afterCpu.system) / 10 / duration,
      combinedServersRssMiB: process.memoryUsage().rss / 1048576,
      browserTaskPercent: (metric(afterBrowser, "TaskDuration") - metric(beforeBrowser, "TaskDuration")) * 100000 / duration,
      browserJsHeapMiB: metric(afterBrowser, "JSHeapUsedSize") / 1048576,
      terminalBrowserEchoPaintP95Ms: null,
      limitations: nativeCommand ? "The viewer backend name is wire compatibility metadata, not proof of DXGI usage. Opt-in Windows native helper; images stay in private local test browser. No desktop input permission requested. Input latency is not measured. ACK delay is injected, not measured WAN latency. Same-host loopback A/B; results are not sr-pc/WAN/long-term performance." : "Loopback A/B and Chromium on one Linux host. Source generates PNG; no Windows capture/input, physical network, or GPU benchmark. Input/terminal latency is not measured: the terminal is unsubscribed while its viewer tab is hidden. No real desktop performance conclusion.",
    };
    expect(report.frames).toBeGreaterThanOrEqual(frames); expect(report.achievedFps).toBeGreaterThan(0);
    const out = join(process.env.SODA_DESKTOP_BENCH_OUT ?? tmpdir(), `soda-desktop-perf-${width}-${fps}.json`);
    await writeFile(out, JSON.stringify(report, null, 2) + "\n");
    await testInfo.attach("desktop-performance", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
    console.log("DESKTOP_BENCH " + JSON.stringify(report));
    await page.locator("[data-remote-desktop]").getByRole("button", { name: "共有停止", exact: true }).click();
  } finally { await provider.close(); }
});
