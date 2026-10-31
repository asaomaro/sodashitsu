// Generated H264 and PCM only. No protected OS capture, input, service or audio devices.
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openNativeTab } from "../support/nativeTab.js";
const executablePath = process.env["SODA_E2E_CHROMIUM_PATH"];
if (executablePath) test.use({ launchOptions: { executablePath } });
test("protected viewers share one video and user-audio producer and revoke both on source change", async ({
  page,
  context,
  appServer,
}) => {
  test.setTimeout(60000);
  const dir = await mkdtemp(join(tmpdir(), "soda-shared-protected-")),
    marker = join(dir, "ended"),
    lifecycle = join(dir, "lifecycle.jsonl");
  const env = {
    SODA_DESKTOP_COMMAND: JSON.stringify([
      process.execPath,
      fileURLToPath(
        new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
      ),
      "--static",
      "--native-audio",
      "--allow-input",
      "--protected-mode",
      "elevated-uac",
      "--protected-end-marker",
      marker,
      "--lifecycle-ledger",
      lifecycle,
      "--native-fixture",
      fileURLToPath(
        new URL("../../../../scripts/remote-desktop/fixtures/h264-generated.json", import.meta.url),
      ),
    ]),
    SODA_DESKTOP_ALLOW_INPUT: "1",
    SODA_DESKTOP_ALLOW_ELEVATED: "1",
    SODA_DESKTOP_ALLOW_MEDIA: "1",
  };
  const saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  const provider = await startAppServer().finally(() => {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }),
    other = await context.newPage();
  for (const browser of [page, other])
    await browser.addInitScript(() => {
      const w = window as any,
        Context = AudioContext,
        Audio = AudioDecoder,
        Video = VideoDecoder;
      w.__audioOutputs = 0;
      w.__audios = [];
      w.__videos = [];
      window.AudioContext = class extends Context {
        private silent: MediaStreamAudioDestinationNode | undefined;
        override get destination() {
          return (this.silent ??=
            this.createMediaStreamDestination()) as unknown as AudioDestinationNode;
        }
      };
      window.AudioDecoder = class extends Audio {
        constructor(init: AudioDecoderInit) {
          super({
            ...init,
            output: (frame) => {
              w.__audioOutputs++;
              init.output(frame);
            },
          });
          w.__audios.push(this);
        }
      };
      window.VideoDecoder = class extends Video {
        constructor(init: VideoDecoderInit) {
          super(init);
          w.__videos.push(this);
        }
      };
    });
  const messages: any[][] = [[], []];
  for (const [i, browser] of [page, other].entries())
    browser.on("websocket", (socket) =>
      socket.on("framereceived", ({ payload }) => {
        if (typeof payload === "string") {
          try {
            messages[i]!.push(JSON.parse(payload));
          } catch {}
        }
      }),
    );
  const ledger = async () =>
    (await readFile(lifecycle, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
  try {
    const b = await provider.openClient(),
      a = await appServer.openClient(),
      invite = await a.request("machine.invite", { label: "Generated shared protected B" });
    await b.request("machine.delegate", {
      url: appServer.origin,
      machineId: invite.machineId,
      token: invite.token,
    });
    for (const [i, browser] of [page, other].entries()) {
      await browser.goto(`${appServer.origin}/#token=${appServer.token}`);
      const header = browser.locator(`[data-machine-id="${invite.machineId}"]`);
      await expect(header.locator('[data-state="online"]')).toBeVisible();
      await openNativeTab(browser, "desktop", header);
      const view = browser.locator("[data-remote-desktop]");
      await expect
        .poll(() =>
          messages[i]!.some((m) => m.type === "shared_protected_available" && m.enabled === true),
        )
        .toBe(true);
      await view.getByLabel("複数viewerで同じ画面を共有", { exact: true }).check();
      await view.getByLabel("管理者権限のアプリ・UAC画面を共有", { exact: true }).check();
      await expect
        .poll(() => messages[i]!.filter((m) => m.type === "ready").at(-1))
        .toMatchObject({
          sharedProtected: true,
          sharedProtectedVideo: true,
          protectedVideo: true,
          protectedAudio: true,
          nativeAudio: true,
          nativeVideo: true,
        });
      await view.locator("[data-desktop-media] summary").click();
      await view.getByLabel("動画の経路").selectOption("native");
      await view.getByLabel("システム音声を要求", { exact: true }).check();
      await view.getByRole("button", { name: "動画共有を依頼", exact: true }).click();
      await expect
        .poll(async () =>
          Number(await view.getByLabel("共有画面").getAttribute("data-video-frames")),
        )
        .toBeGreaterThan(5);
      await view.getByRole("button", { name: "音声を再生", exact: true }).click();
      await expect
        .poll(() => browser.evaluate(() => (window as any).__audioOutputs))
        .toBeGreaterThan(3);
      const pixel = await view
        .getByLabel("共有画面")
        .evaluate((el) =>
          Array.from((el as HTMLCanvasElement).getContext("2d")!.getImageData(80, 60, 1, 1).data),
        );
      expect(pixel[0]).toBeGreaterThan(150);
      expect(pixel[1]).toBeLessThan(100);
    }
    expect((await ledger()).filter((m) => m.type === "native_start")).toHaveLength(1);
    expect((await ledger()).filter((m) => m.type === "audio_start")).toHaveLength(1);
    const view = other.locator("[data-remote-desktop]"),
      canvas = view.getByLabel("共有画面"),
      before = Number(await canvas.getAttribute("data-video-frames")),
      audioBefore = await other.evaluate(() => (window as any).__audioOutputs);
    await page
      .locator("[data-remote-desktop]")
      .getByRole("button", { name: "共有停止", exact: true })
      .click();
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-video-frames")))
      .toBeGreaterThan(before + 6);
    await expect
      .poll(() => other.evaluate(() => (window as any).__audioOutputs))
      .toBeGreaterThan(audioBefore + 3);
    expect((await ledger()).filter((m) => m.type === "audio_start")).toHaveLength(1);
    await other.screenshot({
      path: test.info().outputPath("shared-protected-video-audio-survivor.png"),
    });
    await writeFile(marker, "generated source epoch transition");
    await expect(view.getByRole("alert")).toContainText("状態が変わりました");
    await expect(view.locator("[data-desktop-status]")).toHaveText("停止");
    for (const browser of [page, other])
      await expect
        .poll(() =>
          browser.evaluate(
            () =>
              (window as any).__audios
                .concat((window as any).__videos)
                .filter((decoder: AudioDecoder | VideoDecoder) => decoder.state !== "closed")
                .length,
          ),
        )
        .toBe(0);
  } finally {
    await page.goto("about:blank").catch(() => {});
    await other.close().catch(() => {});
    await provider.close();
    await rm(dir, { recursive: true, force: true });
  }
});
