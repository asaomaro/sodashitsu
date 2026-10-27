import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openNativeTab } from "../support/nativeTab.js";
// Generated oscillator/private sink only. Never opens a physical microphone or speaker.
for (const mode of ["pcm", "encrypted-opus"] as const)
  test(`shared microphone handover ${mode}`, async ({ page, context, appServer }) => {
    test.setTimeout(90000);
    const dir = await mkdtemp(join(tmpdir(), "soda-shared-mic-")),
      ledger = join(dir, "lifecycle");
    const saved = process.env.SODA_DESKTOP_COMMAND;
    process.env.SODA_DESKTOP_COMMAND = JSON.stringify([
      process.execPath,
      fileURLToPath(
        new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
      ),
      "--microphone-fixture",
      "--lifecycle-ledger",
      ledger,
    ]);
    const provider = await startAppServer().finally(() => {
      if (saved === undefined) delete process.env.SODA_DESKTOP_COMMAND;
      else process.env.SODA_DESKTOP_COMMAND = saved;
    });
    await context.addInitScript(
      ({ mode }) => {
        if (mode === "pcm") Object.defineProperty(window, "AudioEncoder", { value: undefined });
        const w = window as any,
          Context = AudioContext;
        w.__mic = { requests: 0, stops: 0 };
        window.AudioContext = class extends Context {
          private silent: MediaStreamAudioDestinationNode | undefined;
          override get destination() {
            return (this.silent ??=
              this.createMediaStreamDestination()) as unknown as AudioDestinationNode;
          }
        };
        Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
          value: async () => {
            w.__mic.requests++;
            const audio = new AudioContext({ sampleRate: 48000 }),
              osc = audio.createOscillator(),
              destination = audio.createMediaStreamDestination();
            osc.frequency.value = 440;
            osc.connect(destination);
            osc.start();
            await audio.resume();
            const track = destination.stream.getAudioTracks()[0]!,
              stop = track.stop.bind(track);
            track.stop = () => {
              w.__mic.stops++;
              stop();
              osc.stop();
              void audio.close();
            };
            return destination.stream;
          },
        });
      },
      { mode },
    );
    const second = await context.newPage();
    try {
      const owner = await provider.openClient(),
        operator = await appServer.openClient();
      await operator.request("prefs.set", { patch: { notifyHintDone: true } });
      await owner.request("desktop.settings.set", {
        enabled: true,
        allowInput: false,
        allowClipboard: false,
        allowDisplayResize: false,
        allowMicrophone: true,
        microphoneEndpoint: "synthetic-virtual-render",
      });
      const invite = await operator.request("machine.invite", { label: "Shared microphone B" });
      await owner.request("machine.delegate", {
        url: appServer.origin,
        machineId: invite.machineId,
        token: invite.token,
      });
      const identity =
        mode === "encrypted-opus"
          ? await owner.request("desktop.endpoint.initialize", {})
          : undefined;
      if (identity) await owner.request("desktop.endpoint.required", { required: true });
      await page.goto(`${appServer.origin}/#token=${appServer.token}`);
      const header = page.locator(`[data-machine-id="${invite.machineId}"]`);
      await expect(header.locator('[data-state="online"]')).toBeVisible();
      await openNativeTab(page, "desktop", header);
      const first = page.locator("[data-remote-desktop]"),
        c1 = first.getByLabel("共有画面");
      if (identity) {
        const pairing = first.locator("[data-desktop-endpoint]");
        await pairing.locator("summary").click();
        await pairing.getByRole("button", { name: "このブラウザの鍵を作成", exact: true }).click();
        const fingerprint = pairing.locator("[data-browser-fingerprint]");
        await expect(fingerprint).toHaveText(/^[a-f0-9]{64}$/);
        await owner.request("desktop.endpoint.trust", {
          fingerprint: (await fingerprint.textContent())!,
          role: "viewer",
          label: "Generated shared mic browser",
        });
        await pairing
          .getByLabel("接続先PCで確認した指紋", { exact: true })
          .fill(identity.fingerprint!);
        await pairing
          .getByLabel("接続先PCのlocalhost画面に表示された指紋と一致することを確認しました", {
            exact: true,
          })
          .check();
        await pairing
          .getByRole("button", { name: "この接続先を記憶して暗号化で接続", exact: true })
          .click();
      }
      await expect(c1).toHaveAttribute("data-rendered-frames", /^[1-9]/);
      await first.getByLabel("複数viewerで同じ画面を共有", { exact: true }).check();
      await expect(c1).toHaveAttribute("data-rendered-frames", /^[1-9]/);
      await second.goto(`${appServer.origin}/#token=${appServer.token}`);
      await openNativeTab(
        second,
        "desktop",
        second.locator(`[data-machine-id="${invite.machineId}"]`),
      );
      const view = second.locator("[data-remote-desktop]"),
        c2 = view.getByLabel("共有画面");
      await expect(view.locator("[data-desktop-status]")).toHaveText(/停止|終了/);
      await view.getByLabel("複数viewerで同じ画面を共有", { exact: true }).check();
      await expect(c2).toHaveAttribute("data-rendered-frames", /^[1-9]/);
      const m1 = first.locator("[data-desktop-microphone]"),
        m2 = view.locator("[data-desktop-microphone]");
      for (const m of [m1, m2]) {
        await expect(m).toBeVisible();
        await m.locator("summary").click();
      }
      expect(await page.evaluate(() => (window as any).__mic.requests)).toBe(0);
      expect(await second.evaluate(() => (window as any).__mic.requests)).toBe(0);
      const rows = async () =>
        (await readFile(ledger, "utf8"))
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line));
      await m1.getByRole("button", { name: "マイク転送を開始", exact: true }).click();
      await expect(m1.locator("[data-microphone-state]")).toHaveText("マイク転送中");
      await expect
        .poll(async () => (await rows()).some((m) => m.type === "microphone_frame" && m.rms > 1000))
        .toBe(true);
      await m2.getByRole("button", { name: "マイク転送を開始", exact: true }).click();
      await expect(m2.locator("[data-microphone-state]")).toContainText("マイクを利用できません");
      await expect(m1.locator("[data-microphone-state]")).toHaveText("マイク転送中");
      expect((await rows()).filter((m) => m.type === "microphone_start")).toHaveLength(1);
      await m1.getByRole("button", { name: "マイク転送を停止", exact: true }).click();
      await expect(m1.locator("[data-microphone-state]")).toHaveText("マイク停止");
      await m2.getByRole("button", { name: "マイク転送を開始", exact: true }).click();
      await expect(m2.locator("[data-microphone-state]")).toHaveText("マイク転送中");
      if (identity) {
        await expect(view.locator("[data-endpoint-encrypted]")).toBeVisible();
        await expect(m2.locator("[data-microphone-codec]")).toHaveText("Opus 32 kbps");
      }
      const count = (await rows()).filter((m) => m.type === "microphone_frame").length;
      await first.getByRole("button", { name: "共有停止", exact: true }).click();
      await expect(first).toHaveCount(0);
      await expect
        .poll(async () => (await rows()).filter((m) => m.type === "microphone_frame").length)
        .toBeGreaterThan(count);
      await expect(m2.locator("[data-microphone-state]")).toHaveText("マイク転送中");
      expect((await rows()).filter((m) => m.type === "spawn")).toHaveLength(2);
      await m2.getByRole("button", { name: "マイク転送を停止", exact: true }).click();
      await expect(m2.locator("[data-microphone-state]")).toHaveText("マイク停止");
      expect(await second.evaluate(() => (window as any).__mic.stops)).toBe(2);
      await view.getByRole("button", { name: "共有停止", exact: true }).click();
    } finally {
      await page.goto("about:blank");
      await second.close();
      await provider.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
