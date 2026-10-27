import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openNativeTab } from "../support/nativeTab.js";

for (const mode of ["wss", "udp", "slow-format", "late-fixed", "late-fixed-udp-drop"] as const)
  test(`shared resolution uses per-viewer barriers and one live audio source: ${mode}`, async ({
    page,
    context,
    appServer,
  }) => {
    test.setTimeout(90000);
    const dir = await mkdtemp(join(tmpdir(), "soda-shared-size-")),
      lifecycle = join(dir, "lifecycle.jsonl"),
      helper = fileURLToPath(
        new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
      );
    const env = {
      SODA_DESKTOP_COMMAND: JSON.stringify([
        process.execPath,
        helper,
        "--static",
        "--native-60fps",
        "--native-adaptive",
        "--native-cadence",
        "--native-datagrams",
        "--native-audio",
        "--native-fixture",
        fileURLToPath(
          new URL(
            "../../../../scripts/remote-desktop/fixtures/h264-native-adaptive.json",
            import.meta.url,
          ),
        ),
        "--lifecycle-ledger",
        lifecycle,
      ]),
      SODA_DESKTOP_ALLOW_MEDIA: "1",
    };
    const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
    Object.assign(process.env, env);
    const provider = await startAppServer().finally(() => {
        for (const [k, v] of Object.entries(saved)) {
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
        }
      }),
      second = await context.newPage(),
      messages: any[][] = [[], []];
    for (const [index, browser] of [page, second].entries()) {
      browser.on("websocket", (socket) => {
        if (socket.url().endsWith("/desktop-share"))
          socket.on("framereceived", ({ payload }) => {
            if (typeof payload === "string") {
              const value = JSON.parse(payload);
              if (
                [
                  "media_stream",
                  "native_profile_pending",
                  "media_status",
                  "native_audio_status",
                ].includes(value.type)
              )
                messages[index]!.push(value);
            }
          });
      });
      // Real generated Opus decoding, but no speakers: the product destination is
      // a virtual stream. A controlled codec gate models a slow or joining decoder.
      await browser.addInitScript(
        ({ slow, gate, drop }) => {
          const w = window as any,
            Context = AudioContext,
            Decoder = AudioDecoder;
          w.__sharedSize = {
            dropNext: false,
            dropped: 0,
            outputs: 0,
            energy: 0,
            decoders: [],
            contexts: [],
            release: undefined,
          };
          window.AudioContext = class extends Context {
            private silent: MediaStreamAudioDestinationNode | undefined;
            constructor(options?: AudioContextOptions) {
              super(options);
              w.__sharedSize.contexts.push(this);
            }
            override get destination() {
              return (this.silent ??=
                this.createMediaStreamDestination()) as unknown as AudioDestinationNode;
            }
          };
          window.AudioDecoder = class extends Decoder {
            constructor(init: AudioDecoderInit) {
              super({
                ...init,
                output: (data) => {
                  const values = new Float32Array(data.numberOfFrames);
                  data.copyTo(values, { planeIndex: 0, format: "f32-planar" });
                  w.__sharedSize.outputs++;
                  w.__sharedSize.energy = Math.max(
                    w.__sharedSize.energy,
                    Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length),
                  );
                  init.output(data);
                },
              });
              w.__sharedSize.decoders.push(this);
            }
          };
          if (drop) {
            const Peer = RTCPeerConnection,
              descriptor = Object.getOwnPropertyDescriptor(RTCDataChannel.prototype, "onmessage")!;
            window.RTCPeerConnection = class extends Peer {
              constructor(config?: RTCConfiguration) {
                super(config);
                this.addEventListener("datachannel", ({ channel }) => {
                  if (channel.label !== "soda-h264-v1") return;
                  Object.defineProperty(channel, "onmessage", {
                    get: () => descriptor.get!.call(channel),
                    set: (handler) =>
                      descriptor.set!.call(channel, (event: MessageEvent) => {
                        if (w.__sharedSize.dropNext) {
                          w.__sharedSize.dropNext = false;
                          w.__sharedSize.dropped++;
                          return;
                        }
                        handler?.call(channel, event);
                      }),
                  });
                });
              }
            };
          }
          if (slow || gate) {
            const support = VideoDecoder.isConfigSupported.bind(VideoDecoder);
            Object.defineProperty(VideoDecoder, "isConfigSupported", {
              value: async (config: VideoDecoderConfig) => {
                if (config.codedWidth === 960 && !w.__sharedSize.gated) {
                  w.__sharedSize.gated = true;
                  if (drop) w.__sharedSize.dropNext = true;
                  if (slow) await new Promise((done) => setTimeout(done, 2200));
                  else await new Promise<void>((done) => (w.__sharedSize.release = done));
                }
                return support(config);
              },
            });
          }
        },
        {
          slow: mode === "slow-format" && index === 1,
          gate: mode.startsWith("late-fixed") && index === 0,
          drop: mode.endsWith("udp-drop") && index === 0,
        },
      );
    }
    const ledger = async () =>
      (await readFile(lifecycle, "utf8"))
        .trim()
        .split("\n")
        .map((s) => JSON.parse(s));
    try {
      const a = await appServer.openClient(),
        b = await provider.openClient(),
        invite = await a.request("machine.invite", { label: "Generated shared resolution" });
      await b.request("machine.delegate", {
        url: appServer.origin,
        machineId: invite.machineId,
        token: invite.token,
      });
      for (const [index, browser] of [page, second].entries()) {
        await browser.goto(`${appServer.origin}/#token=${appServer.token}`);
        const header = browser.locator(`[data-machine-id="${invite.machineId}"]`);
        await expect(header.locator('[data-state="online"]')).toBeVisible();
        await openNativeTab(browser, "desktop", header);
        const view = browser.locator("[data-remote-desktop]");
        await view.getByLabel("複数viewerで同じ画面を共有", { exact: true }).check();
        await expect(view.getByLabel("共有画面")).toHaveAttribute("data-rendered-frames", /^[1-9]/);
        await view.locator("[data-desktop-media] summary").click();
        await view.getByLabel("動画の経路").selectOption("native");
        await expect(view.locator("[data-shared-rate]")).toContainText("解像度");
        await view
          .getByLabel("共有動画のFPS・帯域を自動調整", { exact: true })
          .setChecked(!(mode.startsWith("late-fixed") && index === 1));
        await view.getByLabel("動画FPS上限", { exact: true }).selectOption("30");
        if (!(mode === "udp" || mode.endsWith("udp-drop")))
          await view.getByLabel("UDPを優先（利用できない場合はWSS）").uncheck();
        await view.getByLabel("システム音声を要求").check();
      }
      const views = [
          page.locator("[data-remote-desktop]"),
          second.locator("[data-remote-desktop]"),
        ],
        canvases = views.map((view) => view.getByLabel("共有画面"));
      await views[0]!.getByRole("button", { name: "動画共有を依頼", exact: true }).click();
      await expect
        .poll(async () => Number(await canvases[0]!.getAttribute("data-video-frames")))
        .toBeGreaterThan(5);
      await views[0]!.getByRole("button", { name: "音声を再生", exact: true }).click();
      await expect
        .poll(() => page.evaluate(() => (window as any).__sharedSize.outputs))
        .toBeGreaterThan(10);
      if (mode.startsWith("late-fixed")) {
        await expect
          .poll(() => page.evaluate(() => typeof (window as any).__sharedSize.release), {
            timeout: 20000,
          })
          .toBe("function");
        await views[1]!.getByRole("button", { name: "動画共有を依頼", exact: true }).click();
        await expect
          .poll(() =>
            messages[1]!.some((m) => m.type === "media_status" && m.state === "negotiating"),
          )
          .toBe(true);
        await expect
          .poll(() =>
            messages[1]!.some((m) => m.type === "native_audio_status" && m.state === "running"),
          )
          .toBe(true);
        expect(messages[1]!.some((m) => m.type === "media_stream")).toBe(false);
        await page.evaluate(() => (window as any).__sharedSize.release());
        await expect
          .poll(
            () =>
              messages[0]!
                .filter((m) => m.type === "media_stream")
                .some((m) => m.generation === 3 && m.width === 1280),
            { timeout: 15000 },
          )
          .toBe(true);
        await expect
          .poll(async () => Number(await canvases[1]!.getAttribute("data-video-frames")))
          .toBeGreaterThan(5);
        await expect
          .poll(() => canvases[0]!.evaluate((el) => (el as HTMLCanvasElement).width))
          .toBe(1280);
        expect(messages[1]!.filter((m) => m.type === "media_stream")).toEqual([
          expect.objectContaining({ generation: 1, width: 1280, height: 800 }),
        ]);
        if (mode.endsWith("udp-drop"))
          expect(await page.evaluate(() => (window as any).__sharedSize.dropped)).toBe(1);
      } else {
        await views[1]!.getByRole("button", { name: "動画共有を依頼", exact: true }).click();
        await expect
          .poll(async () => Number(await canvases[1]!.getAttribute("data-video-frames")))
          .toBeGreaterThan(5);
        await views[1]!.getByRole("button", { name: "音声を再生", exact: true }).click();
        await expect
          .poll(() => second.evaluate(() => (window as any).__sharedSize.outputs))
          .toBeGreaterThan(10);
        for (const [index, view] of views.entries())
          await expect
            .poll(
              () =>
                messages[index]!.some(
                  (m) => m.type === "media_stream" && m.generation === 2 && m.width === 960,
                ),
              { timeout: 25000 },
            )
            .toBe(true);
        await expect
          .poll(() => canvases[0]!.evaluate((el) => (el as HTMLCanvasElement).width))
          .toBe(960);
        if (mode === "slow-format") {
          await expect(views[1]!.locator("[data-media-state]")).toHaveText("画像配信", {
            timeout: 10000,
          });
          await expect(views[1]!.locator("[data-desktop-status]")).toHaveText("閲覧中");
        } else {
          await expect
            .poll(() => canvases[1]!.evaluate((el) => (el as HTMLCanvasElement).width))
            .toBe(960);
          if (mode === "udp")
            for (const view of views)
              await expect(view.locator("[data-native-datagrams]")).toBeVisible();
        }
      }
      const before = await page.evaluate(() => (window as any).__sharedSize.outputs),
        drawn = Number(await canvases[0]!.getAttribute("data-video-frames"));
      await expect
        .poll(() => page.evaluate(() => (window as any).__sharedSize.outputs))
        .toBeGreaterThan(before + 20);
      await expect
        .poll(async () => Number(await canvases[0]!.getAttribute("data-video-frames")))
        .toBeGreaterThan(drawn + 5);
      const audio = await page.evaluate(() => {
        const s = (window as any).__sharedSize;
        return {
          energy: s.energy,
          decoders: s.decoders.filter((d: AudioDecoder) => d.state !== "closed").length,
          contexts: s.contexts.length,
        };
      });
      expect(audio.energy).toBeGreaterThan(0.01);
      expect(audio.decoders).toBe(1);
      expect(audio.contexts).toBe(1);
      const rows = await ledger();
      expect(rows.filter((m) => m.type === "native_start")).toHaveLength(1);
      expect(rows.filter((m) => m.type === "audio_start")).toHaveLength(1);
      expect(rows.filter((m) => m.type === "audio_stop")).toHaveLength(0);
      expect(rows.filter((m) => m.type === "native_stop")).toHaveLength(0);
      for (const values of messages)
        expect(new Set(values.filter((m) => m.type === "media_stream").map((m) => m.id)).size).toBe(
          1,
        );
    } catch (error) {
      console.log(
        "SHARED_SIZE_STATUS",
        await Promise.all(
          [page, second].map((p) =>
            p
              .locator("[data-remote-desktop]")
              .innerText()
              .catch(() => "closed"),
          ),
        ),
      );
      console.log("SHARED_SIZE_GENERATIONS", JSON.stringify(messages));
      throw error;
    } finally {
      await page.goto("about:blank").catch(() => {});
      await second.close();
      await provider.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
