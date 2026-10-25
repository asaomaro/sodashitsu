import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openNativeTab } from "../support/nativeTab.js";

test.use({
  trace: process.env.SODA_DESKTOP_BENCH_COMMAND ? "off" : "retain-on-failure",
  screenshot: "off",
  video: "off",
});

for (const { fixtureName, failDecoder, stallImages } of [
  { fixtureName: "h264-generated.json", failDecoder: false, stallImages:false },
  { fixtureName: "h264-sr-pc-generated.json", failDecoder: false, stallImages:false },
  { fixtureName: "h264-generated.json", failDecoder: true, stallImages:false },
  { fixtureName: "h264-generated.json", failDecoder: false, stallImages:true },
])
  test(`hardware-produced ${fixtureName} H264 ${stallImages ? "drag continues while image snapshots stall" : failDecoder ? "decoder failure restores images" : "pixels reach the canvas with draw ACK and stop"}`, async ({
    page,
    appServer,
  }) => {
    test.setTimeout(45000);
    const keys = ["SODA_DESKTOP_COMMAND", "SODA_DESKTOP_ALLOW_MEDIA", "SODA_DESKTOP_ALLOW_INPUT"],
      saved = keys.map((k) => process.env[k]);
    process.env.SODA_DESKTOP_COMMAND = JSON.stringify([
      process.execPath,
      fileURLToPath(
        new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
      ),
      "--static",
      "--allow-input",
      ...(stallImages ? ["--stall-images-during-native"] : []),
      "--native-fixture",
      fileURLToPath(
        new URL(`../../../../scripts/remote-desktop/fixtures/${fixtureName}`, import.meta.url),
      ),
    ]);
    process.env.SODA_DESKTOP_ALLOW_MEDIA = "1";
    process.env.SODA_DESKTOP_ALLOW_INPUT = "1";
    const provider = await startAppServer().finally(() =>
      keys.forEach((k, i) => {
        if (saved[i] === undefined) delete process.env[k];
        else process.env[k] = saved[i];
      }),
    );
    const sent: Record<string, unknown>[] = [], received: Record<string, unknown>[] = [];
    page.on("websocket", (socket) => {
      if (socket.url().endsWith("/desktop-share")) {
        socket.on("framesent", ({ payload }) => {
          if (typeof payload === "string") sent.push(JSON.parse(payload));
        });
        socket.on("framereceived", ({ payload }) => {
          if (typeof payload === "string") received.push(JSON.parse(payload));
        });
      }
    });
    // Only generated test pixels are decoded. No OS capture picker, desktop or input.
    if (failDecoder)
      await page.addInitScript(() => {
        VideoDecoder.isConfigSupported = async () => ({
          supported: false,
          config: { codec: "avc1.42041f" },
        });
      });
    try {
      const owner = await provider.openClient(),
        a = await appServer.openClient(),
        invite = await a.request("machine.invite", { label: "Native H264 B" });
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
        canvas = view.getByLabel("共有画面");
      await expect(canvas).toHaveAttribute("data-rendered-frames", /^[1-9][0-9]*$/);
      const before = Number(await canvas.getAttribute("data-rendered-frames"));
      await view.locator("[data-desktop-media] summary").click();
      await view.getByLabel("動画の経路").selectOption("native");
      await view.getByRole("button", { name: "動画共有を依頼", exact: true }).click();
      if (failDecoder) {
        await expect(view).toContainText("GPU動画を利用できないため画像配信に戻しました");
        await expect(view.locator("[data-media-state]")).toHaveText("画像配信");
        await expect
          .poll(async () => Number(await canvas.getAttribute("data-rendered-frames")))
          .toBeGreaterThan(before);
        expect(sent.filter((m) => m.type === "native_video_ack")).toHaveLength(0);
      } else {
        await expect(view.locator("[data-media-state]")).toHaveText("GPU H.264");
        await expect
          .poll(async () => Number(await canvas.getAttribute("data-video-frames")))
          .toBeGreaterThanOrEqual(8);
        const samples = await canvas.evaluate((el) => {
          const c = (el as HTMLCanvasElement).getContext("2d")!;
          return [
            [80, 60],
            [560, 60],
            [80, 300],
            [560, 300],
            [320, 180],
          ].map(([x, y]) => Array.from(c.getImageData(x!, y!, 1, 1).data));
        });
        const expected = [
          [255, 0, 0],
          [0, 255, 0],
          [0, 0, 255],
          [255, 255, 0],
          [128, 128, 128],
        ];
        for (let i = 0; i < 5; i++)
          for (let channel = 0; channel < 3; channel++)
            expect(Math.abs(samples[i]![channel]! - expected[i]![channel]!)).toBeLessThan(
              i === 4 ? 8 : 20,
            );
        expect(sent.filter((m) => m.type === "native_video_ack").length).toBeGreaterThanOrEqual(8);
        expect(sent.filter((m) => m.type === "control" && m.enabled)).toHaveLength(0);
        await view.getByRole("button", { name: "操作する", exact: true }).click();
        await expect(view.locator("[data-desktop-status]")).toHaveText("操作中");
        await canvas.focus();
        if (stallImages) {
          const imageCount = await canvas.getAttribute("data-rendered-frames");
          const videoBefore = Number(await canvas.getAttribute("data-video-frames"));
          const staleAt = Date.now();
          // Time establishes that both former image-age limits have expired;
          // advancing canvas frames and returned input ACKs prove continued work.
          await expect.poll(async () => Date.now()-staleAt>5500 && Number(await canvas.getAttribute("data-video-frames"))>videoBefore+5,{timeout:15000}).toBe(true);
          expect(await canvas.getAttribute("data-rendered-frames")).toBe(imageCount);
          const startInput = sent.length, box=(await canvas.boundingBox())!;
          await page.mouse.move(box.x+box.width*.3,box.y+box.height*.4);
          await page.mouse.down();
          for(let step=1;step<=5;step++)await page.mouse.move(box.x+box.width*(.3+step*.05),box.y+box.height*.4,{steps:3});
          await page.mouse.up();
          await page.keyboard.press("ArrowRight");
          await expect.poll(()=>sent.slice(startInput).some(m=>m.type==="input"&&(m.input as {code?:string;down?:boolean})?.code==="ArrowRight"&&(m.input as {down?:boolean}).down===false)).toBe(true);
          const ids=sent.slice(startInput).filter(m=>m.type==="input").map(m=>m.seq);
          await expect.poll(()=>ids.every(id=>received.some(m=>m.type==="input_ack"&&m.seq===id))).toBe(true);
        }
        await page.keyboard.press("Control+Space");
        await page.keyboard.press("Escape");
        await expect(view.locator("[data-desktop-status]")).toHaveText("操作中");
        expect(
          sent.some(
            (m) =>
              m.type === "input" &&
              (m.input as { code?: string; down?: boolean })?.code === "Space" &&
              (m.input as { down?: boolean }).down,
          ),
        ).toBe(true);
        await expect
          .poll(async () => Number(await canvas.getAttribute("data-video-frames")))
          .toBeGreaterThanOrEqual(12);

        await view.getByRole("button", { name: "動画・音声を停止", exact: true }).click();
        await expect(view.locator("[data-media-state]")).toHaveText("画像配信");
        await expect
          .poll(async () => Number(await canvas.getAttribute("data-rendered-frames")))
          .toBeGreaterThan(before);
        await expect(canvas).toHaveAttribute("width", "1280");
      }
      await view.getByRole("button", { name: "共有停止", exact: true }).click();
    } finally {
      await provider.close();
    }
  });

test("native hardware video performance (explicit opt-in)", async ({
  page,
  appServer,
}, testInfo) => {
  const command = process.env.SODA_DESKTOP_BENCH_COMMAND;
  test.skip(
    process.env.SODA_DESKTOP_NATIVE_BENCH !== "1" || !command,
    "Use benchmark-native-video.mjs explicitly",
  );
  const width = Number(process.env.SODA_DESKTOP_BENCH_WIDTH ?? 1280),
    fps = Number(process.env.SODA_DESKTOP_BENCH_FPS ?? 30),
    frames = Number(process.env.SODA_DESKTOP_BENCH_FRAMES ?? 180),
    bitrate = Number(process.env.SODA_DESKTOP_BENCH_BITRATE ?? 2500),
    ackDelay = Number(process.env.SODA_DESKTOP_BENCH_ACK_DELAY_MS ?? 0);
  if (
    ![640, 1280, 1920].includes(width) ||
    ![5, 10, 20, 30].includes(fps) ||
    !Number.isInteger(frames) ||
    frames < 30 ||
    frames > 900 ||
    !Number.isInteger(bitrate) ||
    bitrate < 128 ||
    bitrate > 12000 ||
    !Number.isInteger(ackDelay) ||
    ackDelay < 0 ||
    ackDelay > 2000
  )
    throw Error("Invalid native video benchmark options");
  test.setTimeout(60000 + frames * 1000);
  const keys = ["SODA_DESKTOP_COMMAND", "SODA_DESKTOP_ALLOW_MEDIA"],
    saved = keys.map((k) => process.env[k]);
  process.env.SODA_DESKTOP_COMMAND = command;
  process.env.SODA_DESKTOP_ALLOW_MEDIA = "1";
  const provider = await startAppServer().finally(() =>
    keys.forEach((k, i) => {
      if (saved[i] === undefined) delete process.env[k];
      else process.env[k] = saved[i];
    }),
  );
  try {
    await page.addInitScript(
      ({ width, fps, ackDelay }) => {
        const probe = {
          arrivals: [] as number[],
          draws: [] as number[],
          bytes: 0,
          images: [] as { at: number; cpu: number; rss: number }[],
        };
        (window as unknown as { __nativeProbe: typeof probe }).__nativeProbe = probe;
        const Base = window.WebSocket;
        window.WebSocket = class extends Base {
          constructor(url: string | URL, protocols?: string | string[]) {
            super(url, protocols);
            if (this.url.endsWith("/desktop-share"))
              this.addEventListener("message", (event) => {
                if (!(event.data instanceof ArrayBuffer)) return;
                const b = new Uint8Array(event.data);
                if (b[0] === 83 && b[1] === 68 && b[2] === 77 && b[3] === 49) {
                  probe.arrivals.push(performance.now());
                  probe.bytes += b.length;
                } else {
                  const n = new DataView(event.data).getUint16(0),
                    info = JSON.parse(new TextDecoder().decode(b.subarray(2, n + 2)));
                  probe.images.push({
                    at: performance.now(),
                    cpu: info.sourceCpuMs ?? 0,
                    rss: info.sourceMemoryBytes ?? 0,
                  });
                }
              });
          }
          override send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
            if (this.url.endsWith("/desktop-share") && typeof data === "string") {
              const m = JSON.parse(data);
              if (m.type === "start")
                data = JSON.stringify({
                  ...m,
                  options: { ...m.options, width, fps, deltas: false, adaptive: false },
                });
              if (m.type === "native_video_ack") {
                probe.draws.push(performance.now());
                if (ackDelay) {
                  setTimeout(() => {
                    if (this.readyState === Base.OPEN) super.send(data);
                  }, ackDelay);
                  return;
                }
              }
            }
            super.send(data);
          }
        } as typeof WebSocket;
      },
      { width, fps, ackDelay },
    );
    const owner = await provider.openClient(),
      a = await appServer.openClient(),
      invite = await a.request("machine.invite", { label: "Native hardware benchmark B" });
    await owner.request("machine.delegate", {
      url: appServer.origin,
      machineId: invite.machineId,
      token: invite.token,
    });
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    const header = page.locator(`[data-machine-id="${invite.machineId}"]`);
    await expect(header.locator('[data-state="online"]')).toBeVisible({ timeout: 15000 });
    await openNativeTab(page, "desktop", header);
    const view = page.locator("[data-remote-desktop]"),
      canvas = view.getByLabel("共有画面");
    await expect(canvas).toHaveAttribute("data-rendered-frames", /^[1-9][0-9]*$/);
    await view.locator("[data-desktop-media] summary").click();
    await view.getByLabel("動画の経路").selectOption("native");
    await view.getByLabel("動画帯域の上限").fill(String(bitrate));
    await view.getByRole("button", { name: "動画共有を依頼", exact: true }).click();
    await expect(view.locator("[data-media-state]")).toHaveText("GPU H.264");
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-video-frames")), {
        timeout: frames * 1000 + 30000,
      })
      .toBeGreaterThanOrEqual(frames);
    const sample = await page.evaluate(
      () =>
        (
          window as unknown as {
            __nativeProbe: {
              arrivals: number[];
              draws: number[];
              bytes: number;
              images: { at: number; cpu: number; rss: number }[];
            };
          }
        ).__nativeProbe,
    );
    const times = sample.draws,
      span = times.at(-1)! - times[0]!,
      latencies = times.map((at, i) => at - sample.arrivals[i]!).sort((a, b) => a - b),
      first = sample.images[0]!,
      last = sample.images.at(-1)!;
    const report = {
      kind: "windows-hardware-h264-product-browser",
      width,
      targetFps: fps,
      bitrateKbps: bitrate,
      ackDelayMs: ackDelay,
      frames: times.length,
      achievedDrawFps: ((times.length - 1) * 1000) / span,
      videoMbps: (sample.bytes * 8) / span / 1000,
      arrivalToDrawP95Ms: latencies[Math.ceil(latencies.length * 0.95) - 1],
      sourceCpuSampleOneCorePercent: ((last.cpu - first.cpu) * 100) / (last.at - first.at),
      sourcePeakRssMiB: Math.max(...sample.images.map((v) => v.rss)) / 1048576,
      browser: page.context().browser()?.version(),
      limitations:
        "Explicit Windows native helper; actual desktop images remain in private browser memory. No input, screenshots, traces or capture permissions requested. Hardware-only MFT + CPU BT.709 NV12 conversion; not zero-copy. Video bandwidth excludes JPEG snapshots (1fps), and CPU/RSS are sampled from their wider interval, including video startup. Same-host Windows→WSL A/B→Chromium; screen not fixed. No sr-pc/WAN/input-latency/GPU-utilization conclusion. ACK delay is injected.",
    };
    expect(report.frames).toBeGreaterThanOrEqual(frames);
    await writeFile(
      join(process.env.SODA_DESKTOP_BENCH_OUT ?? tmpdir(), "soda-desktop-native-video.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    await testInfo.attach("native-video-performance", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json",
    });
    console.log("NATIVE_VIDEO_BENCH " + JSON.stringify(report));
    await view.getByRole("button", { name: "共有停止", exact: true }).click();
  } finally {
    await provider.close();
  }
});

for (const pipelined of [false, true])
  test(`native video ${pipelined ? "three-frame" : "legacy one-frame"} window under 100ms draw ACK delay`, async ({
    page,
    appServer,
  }) => {
    test.setTimeout(45000);
    const keys = ["SODA_DESKTOP_COMMAND", "SODA_DESKTOP_ALLOW_MEDIA"],
      saved = keys.map((k) => process.env[k]);
    process.env.SODA_DESKTOP_COMMAND = JSON.stringify([
      process.execPath,
      fileURLToPath(
        new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
      ),
      "--static",
      "--native-fixture",
      fileURLToPath(
        new URL("../../../../scripts/remote-desktop/fixtures/h264-generated.json", import.meta.url),
      ),
    ]);
    process.env.SODA_DESKTOP_ALLOW_MEDIA = "1";
    const provider = await startAppServer().finally(() =>
      keys.forEach((k, i) => {
        if (saved[i] === undefined) delete process.env[k];
        else process.env[k] = saved[i];
      }),
    );
    await page.addInitScript(
      ({ pipelined }) => {
        const Base = WebSocket;
        (window as unknown as { __windowDraws: number[] }).__windowDraws = [];
        window.WebSocket = class extends Base {
          constructor(url: string | URL, protocols?: string | string[]) {
            super(
              url,
              Array.isArray(protocols) && !pipelined
                ? protocols.filter((v) => v !== "soda-desktop-native-video-v2")
                : protocols,
            );
          }
          override send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
            if (this.url.endsWith("/desktop-share") && typeof data === "string") {
              const m = JSON.parse(data);
              if (m.type === "start")
                data = JSON.stringify({ ...m, options: { ...m.options, fps: 30 } });
              if (m.type === "native_video_ack") {
                (window as unknown as { __windowDraws: number[] }).__windowDraws.push(
                  performance.now(),
                );
                setTimeout(() => {
                  if (this.readyState === Base.OPEN) super.send(data);
                }, 100);
                return;
              }
            }
            super.send(data);
          }
        };
      },
      { pipelined },
    );
    try {
      const owner = await provider.openClient(),
        a = await appServer.openClient(),
        invite = await a.request("machine.invite", { label: "Native ACK window B" });
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
        canvas = view.getByLabel("共有画面");
      await expect(canvas).toHaveAttribute("data-rendered-frames", /^[1-9][0-9]*$/);
      await view.locator("[data-desktop-media] summary").click();
      await view.getByLabel("動画の経路").selectOption("native");
      await view.getByRole("button", { name: "動画共有を依頼", exact: true }).click();
      await expect
        .poll(async () => Number(await canvas.getAttribute("data-video-frames")), {
          timeout: 20000,
        })
        .toBeGreaterThanOrEqual(60);
      const times = await page.evaluate(
          () => (window as unknown as { __windowDraws: number[] }).__windowDraws,
        ),
        fps = ((times.length - 1) * 1000) / (times.at(-1)! - times[0]!);
      if (pipelined) {
        expect(fps).toBeGreaterThan(18);
        await expect(view.locator("[data-native-video-stats]")).toContainText("3枚");
      } else expect(fps).toBeLessThan(12);
      console.log(
        "NATIVE_WINDOW_BENCH " +
          JSON.stringify({
            pipelined,
            frames: times.length,
            fps,
            ackDelayMs: 100,
            source: "hardware-generated fixture; no actual desktop or physical network",
          }),
      );
      await view.getByRole("button", { name: "共有停止", exact: true }).click();
    } finally {
      await provider.close();
    }
  });
