import { fileURLToPath } from "node:url";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openNativeTab } from "../support/nativeTab.js";

for (const mode of ["udp", "wss", "unavailable", "unsupported", "resume-race", "resume-failure", "soak"] as const)
  test(`native system audio generated tone: ${mode}, initially muted, bounded decode, mute/stop`, async ({
    page,
    appServer,
  }) => {
    const soak = mode === "soak";
    test.skip(soak && !process.env.SODA_DESKTOP_SOAK_MS, "Explicit generated-data endurance run");
    const duration = Number(process.env.SODA_DESKTOP_SOAK_MS ?? 0);
    test.setTimeout(soak ? duration + 120000 : 60000);
    const env = {
      SODA_DESKTOP_COMMAND: JSON.stringify([
        process.execPath,
        fileURLToPath(
          new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
        ),
        "--static",
        "--native-datagrams",
        "--native-audio",
        ...(mode === "unavailable" ? ["--audio-unavailable"] : []),
        "--native-fixture",
        fileURLToPath(
          new URL(
            "../../../../scripts/remote-desktop/fixtures/h264-generated.json",
            import.meta.url,
          ),
        ),
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
    });
    const sent: any[] = [],
      received: any[] = [];
    page.on("websocket", (ws) => {
      if (ws.url().endsWith("/desktop-share")) {
        ws.on("framesent", ({ payload }) => {
          if (typeof payload === "string") sent.push(JSON.parse(payload));
        });
        ws.on("framereceived", ({ payload }) => {
          if (typeof payload === "string") received.push(JSON.parse(payload));
        });
      }
    });
    await page.addInitScript(
      ({ unsupported, soak, resumeMode }) => {
        const w = window as any;
        w.__resumeGates = [];
        w.__audio = {
          decoders: [],
          contexts: [],
          outputs: 0,
          energy: 0,
          maxQueue: 0,
          active: 0,
          maxActive: 0,
        };
        if (unsupported) {
          Object.defineProperty(window, "AudioDecoder", { value: undefined });
          return;
        }
        {
          const Peer = RTCPeerConnection;
          w.__nativePeers = [];
          w.__audioChannels = [];
          w.__lostVideo = 0;
          w.__lostAudio = 0;
          window.RTCPeerConnection = class extends Peer {
            constructor(config?: RTCConfiguration) {
              super(config);
              w.__nativePeers.push(this);
              const start = performance.now();
              this.addEventListener("datachannel", ({ channel }) => {
                if (channel.label === "soda-opus-v1") w.__audioChannels.push(channel);
                if (!soak) return;
                if (!["soda-h264-v1", "soda-opus-v1"].includes(channel.label)) return;
                let count = 0;
                const descriptor = Object.getOwnPropertyDescriptor(
                  RTCDataChannel.prototype,
                  "onmessage",
                )!;
                Object.defineProperty(channel, "onmessage", {
                  get: () => descriptor.get!.call(channel),
                  set: (handler) =>
                    descriptor.set!.call(channel, (event: MessageEvent) => {
                      count++;
                      if (
                        channel.label === "soda-h264-v1" &&
                        performance.now() - start > 5000 &&
                        (performance.now() - start) % 30000 < 220
                      ) {
                        w.__lostVideo++;
                        return;
                      }
                      if (channel.label === "soda-opus-v1" && count % 20 === 0) {
                        w.__lostAudio++;
                        return;
                      }
                      if (count % 13 === 0) setTimeout(() => handler?.call(channel, event), 40);
                      else handler?.call(channel, event);
                    }),
                });
              });
            }
          };
        }
        const Decoder = AudioDecoder,
          Context = AudioContext;
        window.AudioDecoder = class extends Decoder {
          constructor(init: AudioDecoderInit) {
            super({
              ...init,
              output: (data) => {
                const f = new Float32Array(data.numberOfFrames);
                data.copyTo(f, { planeIndex: 0, format: "f32-planar" });
                w.__audio.outputs++;
                w.__audio.energy = Math.max(
                  w.__audio.energy,
                  Math.sqrt(f.reduce((a, v) => a + v * v, 0) / f.length),
                );
                init.output(data);
              },
            });
            w.__audio.decoders = w.__audio.decoders.filter((d: AudioDecoder) => d.state !== "closed");
            w.__audio.decoders.push(this);
          }
          decode(chunk: EncodedAudioChunk) {
            super.decode(chunk);
            w.__audio.maxQueue = Math.max(w.__audio.maxQueue, this.decodeQueueSize);
          }
        };
        // Real AudioContext/decoder/scheduling, but route output through zero gain so
        // the generated tone never reaches the test machine's speakers.
        window.AudioContext = class extends Context {
          constructor(options?: AudioContextOptions) {
            super(options);
            w.__audio.contexts.push(this);
            const silent = super.createGain();
            silent.gain.value = 0;
            silent.connect(this.destination);
            Object.defineProperty(this, "destination", { get: () => silent });
          }
          async resume() {
            await super.resume();
            const gates=(window as any).__resumeGates;
            if(resumeMode&&gates.length<(resumeMode==="resume-race"?2:1))await new Promise<void>(resolve=>gates.push(resolve));
          }
          createBufferSource() {
            const s = super.createBufferSource(),
              start = s.start.bind(s),
              stop = s.stop.bind(s);
            let active = false;
            const done = () => {
              if (active) {
                active = false;
                w.__audio.active--;
              }
            };
            s.addEventListener("ended", done);
            s.start = (...args: Parameters<AudioBufferSourceNode["start"]>) => {
              active = true;
              w.__audio.active++;
              w.__audio.maxActive = Math.max(w.__audio.maxActive, w.__audio.active);
              start(...args);
            };
            s.stop = (...args: Parameters<AudioBufferSourceNode["stop"]>) => {
              done();
              stop(...args);
            };
            return s;
          }
        };
      },
      { unsupported: mode === "unsupported", soak, resumeMode:mode.startsWith("resume-")?mode:"" },
    );
    try {
      const owner = await provider.openClient(),
        a = await appServer.openClient(),
        invite = await a.request("machine.invite", { label: "Generated audio B" });
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
      await expect(canvas).toHaveAttribute("data-rendered-frames", /^[1-9]/);
      await view.locator("[data-desktop-media] summary").click();
      await view.getByLabel("動画の経路").selectOption("native");
      await expect(view.getByLabel("システム音声を要求")).not.toBeChecked();
      if (mode === "wss") await view.getByLabel("UDPを優先（利用できない場合はWSS）").uncheck();
      if (mode === "unsupported") {
        await expect(view.getByLabel("システム音声を要求")).toBeDisabled();
        return;
      }
      await expect(view.getByLabel("システム音声を要求")).toBeEnabled();
      await view.getByLabel("システム音声を要求").check();
      await view.getByRole("button", { name: "動画共有を依頼", exact: true }).click();
      await expect
        .poll(async () => Number(await canvas.getAttribute("data-video-frames")), {
          timeout: 20000,
        })
        .toBeGreaterThan(5);
      if (mode === "unavailable") {
        await expect(view.locator("[data-native-audio]")).toContainText("利用できません");
        const count = Number(await canvas.getAttribute("data-video-frames"));
        await expect
          .poll(async () => Number(await canvas.getAttribute("data-video-frames")))
          .toBeGreaterThan(count + 10);
        return;
      }
      await expect(view.locator("[data-native-audio]")).toContainText("ミュート");
      expect(await page.evaluate(() => (window as any).__audio.contexts.length)).toBe(0);
      expect(await page.evaluate(() => (window as any).__audio.decoders.length)).toBe(0);
      await view.getByRole("button", { name: "音声を再生", exact: true }).click();
      if(mode==="resume-race"||mode==="resume-failure"){
        await expect.poll(()=>page.evaluate(()=>(window as any).__resumeGates.length)).toBe(1);
        if(mode==="resume-race"){
          await view.getByRole("button",{name:"音声を再生",exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__resumeGates.length)).toBe(2);
          await page.evaluate(async()=>{(window as any).__resumeGates[0]();await new Promise(requestAnimationFrame);});
          await expect(view.locator("[data-native-audio]")).toContainText("ミュート");expect(await page.evaluate(()=>(window as any).__audio.decoders.length)).toBe(0);
          await page.evaluate(()=>(window as any).__resumeGates[1]());
        }else{
          const before=Number(await canvas.getAttribute("data-video-frames"));await page.evaluate(()=>{for(const c of (window as any).__audioChannels as RTCDataChannel[])c.close();});await expect(view.locator("[data-native-audio]")).toContainText("利用できません");await page.evaluate(async()=>{(window as any).__resumeGates[0]();await new Promise(requestAnimationFrame);});await expect(view.getByRole("button",{name:"音声を止める",exact:true})).toHaveCount(0);await expect.poll(async()=>Number(await canvas.getAttribute("data-video-frames"))).toBeGreaterThan(before+10);expect(await page.evaluate(()=>(window as any).__audio.contexts.every((c:AudioContext)=>c.state==="closed"))).toBe(true);return;
        }
      }
      await expect(view.locator("[data-native-audio]")).toContainText("再生中");
      await expect
        .poll(() => page.evaluate(() => (window as any).__audio.outputs))
        .toBeGreaterThan(10);
      if (soak) {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Performance.enable");
        const records: any[] = [];
        const started = Date.now();
        let previous = 0;
        while (Date.now() - started < duration) {
          const sampleAt = Date.now(),
            before = Number(await canvas.getAttribute("data-video-frames"));
          await expect
            .poll(
              async () =>
                Date.now() - sampleAt >= 5000 &&
                Number(await canvas.getAttribute("data-video-frames")) > before + 5,
              { timeout: 15000, intervals: [1000] },
            )
            .toBe(true);
          await expect(view.locator("[data-native-datagrams]")).toBeVisible();
          await expect(view.locator("[data-native-audio]")).toContainText("再生中");
          const audio = await page.evaluate(() => {
            const a = (window as any).__audio;
            return {
              outputs: a.outputs,
              queue: a.maxQueue,
              active: a.active,
              maxActive: a.maxActive,
              lostVideo: (window as any).__lostVideo,
              lostAudio: (window as any).__lostAudio,
            };
          });
          expect(audio.outputs).toBeGreaterThan(previous);
          previous = audio.outputs;
          expect(audio.queue).toBeLessThanOrEqual(2);
          expect(audio.maxActive).toBeLessThanOrEqual(6);
          const metrics = (await cdp.send("Performance.getMetrics")).metrics;
          records.push({
            elapsed: Date.now() - started,
            frames: Number(await canvas.getAttribute("data-video-frames")),
            ...audio,
            heap: metrics.find((m) => m.name === "JSHeapUsedSize")?.value,
          });
          if (records.length % 12 === 0)
            console.log("generated_audio_soak", JSON.stringify(records.at(-1)));
        }
        console.log(
          "generated_audio_soak_complete",
          JSON.stringify({
            duration,
            first: records[0],
            last: records.at(-1),
            samples: records.length,
            maxHeap: Math.max(...records.map((r) => r.heap)),
            maxActive: Math.max(...records.map((r) => r.maxActive)),
          }),
        );
        await test
          .info()
          .attach("generated-soak-metrics.json", {
            body: JSON.stringify(records, null, 2),
            contentType: "application/json",
          });
      }
      const stats = await page.evaluate(() => {
        const a = (window as any).__audio;
        return { energy: a.energy, maxQueue: a.maxQueue, maxActive: a.maxActive };
      });
      expect(stats.energy).toBeGreaterThan(0.05);
      expect(stats.maxQueue).toBeLessThanOrEqual(2);
      expect(stats.maxActive).toBeLessThanOrEqual(6);
      await view.getByRole("button", { name: "音声を止める", exact: true }).click();
      await expect(view.locator("[data-native-audio]")).toContainText("ミュート");
      await expect
        .poll(() =>
          page.evaluate(() =>
            (window as any).__audio.contexts.every((c: AudioContext) => c.state === "suspended"),
          ),
        )
        .toBe(true);
      expect(await page.evaluate(() => (window as any).__audio.active)).toBe(0);
      await view.getByRole("button", { name: "音声を再生", exact: true }).click();
      await expect(view.locator("[data-native-audio]")).toContainText("再生中");
      if (mode === "udp") {
        const before = Number(await canvas.getAttribute("data-video-frames"));
        await page.evaluate(() => {
          for (const c of (window as any).__audioChannels as RTCDataChannel[]) c.close();
        });
        await expect(view.locator("[data-native-audio]")).toContainText("利用できません");
        await expect
          .poll(async () => Number(await canvas.getAttribute("data-video-frames")))
          .toBeGreaterThan(before + 10);
        await expect(view.locator("[data-native-datagrams]")).toBeVisible();
        await view.getByRole("button", { name: "動画共有を依頼", exact: true }).click();
        await expect(view.locator("[data-native-audio]")).toContainText("ミュート");
      }
      await view.getByRole("button", { name: "動画・音声を停止", exact: true }).click();
      await expect(view.locator("[data-media-state]")).toHaveText("画像配信");
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as any).__audio.contexts.every((c: AudioContext) => c.state === "closed") &&
              (window as any).__audio.decoders.every((d: AudioDecoder) => d.state === "closed"),
          ),
        )
        .toBe(true);
      expect(await page.evaluate(() => (window as any).__audio.active)).toBe(0);
      expect(sent.some((m) => m.type === "media" && m.enabled && m.settings.audio)).toBe(true);
      expect(received.some((m) => m.type === "native_audio_status" && m.state === "running")).toBe(
        true,
      );
    } finally {
      await provider.close();
    }
  });
