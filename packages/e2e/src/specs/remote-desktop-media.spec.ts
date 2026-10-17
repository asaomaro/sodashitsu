import { openNativeTab } from "../support/nativeTab.js";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";

for (const transport of ["auto", "relay"] as const) {
  test(`synthetic ${transport} video/audio reaches the viewer canvas and stops with the companion`, async ({
    page,
    context,
    appServer,
  }) => {
    test.setTimeout(60000);
    const keys = [
      "SODA_DESKTOP_COMMAND",
      "SODA_DESKTOP_ALLOW_INPUT",
      "SODA_DESKTOP_ALLOW_MEDIA",
      "SODA_DESKTOP_ALLOW_CLIPBOARD",
    ];
    const saved = keys.map((k) => process.env[k]);
    process.env.SODA_DESKTOP_COMMAND = JSON.stringify([
      process.execPath,
      fileURLToPath(
        new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
      ),
      "--static",
      "--allow-input",
      "--allow-clipboard",
    ]);
    for (const key of keys.slice(1)) process.env[key] = "1";
    const provider = await startAppServer().finally(() =>
      keys.forEach((k, i) => {
        if (saved[i] === undefined) delete process.env[k];
        else process.env[k] = saved[i];
      }),
    );
    const host = await context.newPage();
    // This test never opens an OS capture picker, microphone or system clipboard.
    // Real browser codecs and RTC/MSE decode a moving canvas and a synthetic silent audio track.
    await host.addInitScript(() => {
      Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
        value: async (options: DisplayMediaStreamOptions) => {
          const canvas = document.createElement("canvas");
          canvas.width = 1280;
          canvas.height = 720;
          const ctx = canvas.getContext("2d")!;
          const draw = () => {
            ctx.fillStyle = "rgb(12,220,40)";
            ctx.fillRect(0, 0, 1280, 720);
            ctx.fillStyle = "blue";
            ctx.fillRect((Date.now() / 10) % 1000, 200, 100, 100);
          };
          draw();
          const rate = (options.video as MediaTrackConstraints).frameRate;
          const fps = typeof rate === "number" ? rate : (rate as ConstrainDoubleRange)?.max ?? 10;
          const timer = setInterval(draw, 1000 / fps),
            stream = canvas.captureStream(fps),
            track = stream.getVideoTracks()[0]!;
          const settings = track.getSettings.bind(track);
          track.getSettings = () => ({
            ...settings(),
            displaySurface: "monitor",
            width: 1280,
            height: 720,
          });
          const stop = track.stop.bind(track);
          track.stop = () => {
            clearInterval(timer);
            stop();
            (window as any).__captureStopped = true;
          };
          if (options.audio) {
            const audio = new AudioContext(),
              destination = audio.createMediaStreamDestination(),
              oscillator = audio.createOscillator(),
              gain = audio.createGain();
            gain.gain.value = 0;
            oscillator.connect(gain).connect(destination);
            oscillator.start();
            stream.addTrack(destination.stream.getAudioTracks()[0]!);
          }
          return stream;
        },
      });
    });
    try {
      const owner = await provider.openClient(),
        a = await appServer.openClient(),
        invite = await a.request("machine.invite", { label: "Media B" });
      await owner.request("machine.delegate", {
        url: appServer.origin,
        machineId: invite.machineId,
        token: invite.token,
      });
      await host.goto(`${provider.origin}/desktop-host#token=${provider.token}`);
      await expect(host.getByRole("button", { name: "共有補助を接続", exact: true })).toBeEnabled();
      await host.getByRole("button", { name: "共有補助を接続", exact: true }).click();
      await expect(host.getByRole("status")).toHaveText("共有要求を待っています");
      await page.goto(`${appServer.origin}/#token=${appServer.token}`);
      const header = page.locator(`[data-machine-id="${invite.machineId}"]`);
      await expect(header.locator('[data-state="online"]')).toBeVisible();
      await openNativeTab(page, "desktop", header);
      const view = page.locator("[data-remote-desktop]"),
        canvas = view.getByLabel("共有画面");
      await expect(canvas).toHaveAttribute("data-rendered-frames", /^[1-9][0-9]*$/);
      await view.locator("[data-desktop-media] summary").click();
      await view.getByLabel("動画の経路").selectOption(transport);
      await view.getByLabel("システム音声を要求").check();
      await view.getByRole("button", { name: "動画共有を依頼", exact: true }).click();
      await expect(
        host.getByRole("button", { name: "画面を選んで共有開始", exact: true }),
      ).toBeVisible();
      await host.getByRole("checkbox").check();
      await host.getByRole("button", { name: "画面を選んで共有開始", exact: true }).click();
      await expect(view.locator("[data-media-state]")).toHaveText(
        transport === "auto" ? "WebRTC動画" : "圧縮動画の中継",
        { timeout: 15000 },
      );
      await expect(canvas).toHaveAttribute("data-video-frames", /^[1-9][0-9]*$/, {
        timeout: 15000,
      });
      // Decode proof comes from the actual viewer canvas, not a test WebSocket client.
      await expect
        .poll(() =>
          canvas.evaluate((el) =>
            Array.from(
              (el as HTMLCanvasElement).getContext("2d")!.getImageData(20, 20, 1, 1).data,
            ).slice(0, 3),
          ),
        )
        .toEqual([expect.any(Number), expect.any(Number), expect.any(Number)]);
      const pixel = await canvas.evaluate((el) =>
        Array.from((el as HTMLCanvasElement).getContext("2d")!.getImageData(20, 20, 1, 1).data),
      );
      expect(pixel[1]).toBeGreaterThan(180);
      expect(pixel[0]).toBeLessThan(50);
      expect(pixel[2]).toBeLessThan(80);
      await expect(view.getByRole("button", { name: "音声を再生", exact: true })).toBeVisible();
      const first = Number(await canvas.getAttribute("data-video-frames")),
        started = Date.now();
      await expect
        .poll(async () => Number(await canvas.getAttribute("data-video-frames")), {
          timeout: 15000,
        })
        .toBeGreaterThanOrEqual(first + 40);
      const elapsedMs = Date.now() - started,
        frames = Number(await canvas.getAttribute("data-video-frames")) - first;
      await writeFile(
        `/tmp/soda-desktop-media-${transport}.json`,
        JSON.stringify(
          {
            transport,
            synthetic: true,
            requestedFps: 10,
            frames,
            elapsedMs,
            presentedFps: (frames * 1000) / elapsedMs,
            note: "Local synthetic canvas, browser codecs, native snapshots in parallel; not Windows capture or WAN benchmark",
          },
          null,
          2,
        ),
      );
      if (transport === "relay")
        await view.getByRole("button", { name: "動画・音声を停止", exact: true }).click();
      else await host.getByRole("button", { name: "補助を切断", exact: true }).click();
      await expect(view.locator("[data-media-state]")).toHaveText("画像配信");
      await expect.poll(() => host.evaluate(() => (window as any).__captureStopped)).toBe(true);
      await expect
        .poll(() =>
          canvas.evaluate(
            (el) => (el as HTMLCanvasElement).getContext("2d")!.getImageData(20, 20, 1, 1).data[1],
          ),
        )
        .not.toBeGreaterThan(180);
      await view.getByRole("button", { name: "共有停止", exact: true }).click();
      await expect(view).toHaveCount(0);
    } finally {
      await host.close();
      await provider.close();
    }
  });
}
