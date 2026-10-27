import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openNativeTab, closeNativeTab } from "../support/nativeTab.js";

// Real product A/B, actual pairing/viewer UI and private B helper. Generated
// PNG/key records only; no OS capture/input/devices or real endpoint keys.
test("product pairing encrypts dedicated image and raw input, persists keys and revokes B ownership", async ({
  page,
  appServer,
}) => {
  test.setTimeout(90000);
  const dir = await mkdtemp(join(tmpdir(), "soda-encrypted-viewer-")),
    record = join(dir, "input.jsonl"),
    lifecycle = join(dir, "lifecycle.jsonl");
  const env = {
    SODA_DESKTOP_COMMAND: JSON.stringify([
      process.execPath,
      fileURLToPath(
        new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
      ),
      "--allow-input",
      "--record",
      record,
      "--lifecycle-ledger",
      lifecycle,
    ]),
    SODA_DESKTOP_ALLOW_INPUT: "1",
  };
  const saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  const provider = await startAppServer().finally(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const encrypted: Buffer[] = [],
    publicText: string[] = [],
    connections: string[] = [];
  page.on("websocket", (socket) => {
    connections.push(socket.url());
    if (socket.url().endsWith("/desktop-e2e")) {
      socket.on("framesent", ({ payload }) => {
        if (typeof payload === "string") publicText.push(payload);
        else encrypted.push(Buffer.from(payload));
      });
      socket.on("framereceived", ({ payload }) => {
        if (typeof payload === "string") publicText.push(payload);
        else encrypted.push(Buffer.from(payload));
      });
    }
  });
  try {
    const owner = await provider.openClient(),
      operator = await appServer.openClient();
    await operator.request("prefs.set", { patch: { notifyHintDone: true } });
    await operator.request("workspace.set_project_folder", {
      workspaceId: operator.helloSnapshot()!.workspaces[0]!.id,
      path: appServer.stateDir,
    });
    const invite = await operator.request("machine.invite", { label: "Generated encrypted B" });
    await owner.request("machine.delegate", {
      url: appServer.origin,
      machineId: invite.machineId,
      token: invite.token,
    });
    const identity = await owner.request("desktop.endpoint.initialize", {});
    expect(identity.initialized).toBe(true);
    await owner.request("desktop.endpoint.required", { required: true });
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    const header = page.locator(`[data-machine-id="${invite.machineId}"]`);
    await expect(header.locator('[data-state="online"]')).toBeVisible();
    await openNativeTab(page, "desktop", header);
    const view = page.locator("[data-remote-desktop]"),
      canvas = view.getByLabel("共有画面");
    await expect(view).toContainText("暗号化接続が必須");
    expect(await readFile(lifecycle, "utf8").catch(() => "")).toBe("");
    const pairing = view.locator("[data-desktop-endpoint]");
    if (!(await pairing.locator("summary").isVisible()))
      await view.getByRole("button", { name: "情報・設定", exact: true }).click();
    await pairing.locator("summary").click();
    await pairing.getByRole("button", { name: "このブラウザの鍵を作成", exact: true }).click();
    const fingerprint = pairing.locator("[data-browser-fingerprint]");
    await expect(fingerprint).toHaveText(/^[a-f0-9]{64}$/);
    const browserFingerprint = (await fingerprint.textContent())!;
    await owner.request("desktop.endpoint.trust", {
      fingerprint: browserFingerprint,
      role: "viewer",
      label: "Generated browser",
    });
    await pairing.getByLabel("接続先PCで確認した指紋", { exact: true }).fill("aa".repeat(32));
    await pairing
      .getByLabel("接続先PCのlocalhost画面に表示された指紋と一致することを確認しました", {
        exact: true,
      })
      .check();
    await pairing
      .getByRole("button", { name: "この接続先を記憶して暗号化で接続", exact: true })
      .click();
    await expect(view.locator("[data-desktop-status]")).toHaveText(/停止|終了/);
    expect(await readFile(lifecycle, "utf8").catch(() => "")).toBe("");
    await pairing.getByLabel("接続先PCで確認した指紋", { exact: true }).fill(identity.fingerprint!);
    await pairing
      .getByLabel("接続先PCのlocalhost画面に表示された指紋と一致することを確認しました", {
        exact: true,
      })
      .check();
    await pairing
      .getByRole("button", { name: "この接続先を記憶して暗号化で接続", exact: true })
      .click();
    await expect(view.locator("[data-desktop-status]")).toHaveText("閲覧中", { timeout: 15000 });
    await expect(canvas).toHaveAttribute("data-rendered-frames", /^[1-9]/);
    await expect(view.locator("[data-endpoint-encrypted]")).toBeVisible();
    expect(
      await canvas.evaluate((el) => {
        const c = el as HTMLCanvasElement,
          p = c.getContext("2d")!.getImageData(100, 80, 1, 1).data;
        return c.width === 1280 && p[3] === 255 && p[0]! + p[1]! + p[2]! > 0;
      }),
    ).toBe(true);
    expect(connections.filter((url) => url.endsWith("/desktop-e2e")).length).toBeGreaterThanOrEqual(
      2,
    );
    await view.getByRole("button", { name: "操作する", exact: true }).click();
    await expect(view.locator("[data-desktop-status]")).toHaveText("操作中");
    await canvas.focus();
    await page.keyboard.press("Control+Space");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(view.locator("[data-desktop-status]")).toHaveText("閲覧中");
    await view.getByRole("button", { name: "操作する", exact: true }).click();
    await expect(view.locator("[data-desktop-status]")).toHaveText("操作中");
    const input = view.getByLabel("確定した文字を送る");
    await input.fill("generated-private-日本語");
    await view.getByRole("button", { name: "文字を送る", exact: true }).click();
    await expect
      .poll(() => readFile(record, "utf8").catch(() => ""))
      .toContain("generated-private-日本語");
    const rows = (await readFile(record, "utf8"))
      .trim()
      .split("\n")
      .map((row) => JSON.parse(row));
    expect(rows).toEqual(
      expect.arrayContaining([
        { kind: "key", code: "ControlLeft", down: true },
        { kind: "key", code: "Space", down: true },
        { kind: "key", code: "Space", down: false },
        { kind: "key", code: "ControlLeft", down: false },
      ]),
    );
    expect(
      publicText.some(
        (text) =>
          text.includes("generated-private") ||
          text.includes("ControlLeft") ||
          text.includes("video_viewer"),
      ),
    ).toBe(false);
    expect(encrypted.length).toBeGreaterThan(10);
    expect(
      encrypted.some(
        (packet) =>
          packet.includes(Buffer.from("generated-private")) ||
          packet.includes(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      ),
    ).toBe(false);
    const beforeReopen = connections.length;
    await page.evaluate(
      (machine) => localStorage.removeItem("soda.desktop.e2e.required." + machine),
      invite.machineId,
    );
    await closeNativeTab(page);
    await openNativeTab(page, "desktop", header);
    await expect(page.locator("[data-desktop-status]")).toHaveText("閲覧中");
    await expect(page.locator("[data-remote-desktop] [data-endpoint-encrypted]")).toHaveCount(1);
    expect(connections.slice(beforeReopen).some((url) => url.endsWith("/desktop-share"))).toBe(
      false,
    );
    const stored = await page.evaluate(async () => {
      const request = indexedDB.open("soda-desktop-endpoints-v1", 1);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const key = await new Promise<CryptoKey>((resolve, reject) => {
          const read = db
            .transaction("identity", "readonly")
            .objectStore("identity")
            .get("browser");
          read.onsuccess = () => resolve(read.result.key);
          read.onerror = () => reject(read.error);
        });
        let exportDenied = false;
        try {
          await crypto.subtle.exportKey("pkcs8", key);
        } catch {
          exportDenied = true;
        }
        return { extractable: key.extractable, exportDenied };
      } finally {
        db.close();
      }
    });
    expect(stored).toEqual({ extractable: false, exportDenied: true });
    await owner.request("desktop.endpoint.revoke", {
      fingerprint: browserFingerprint,
      role: "viewer",
    });
    await expect(page.locator("[data-desktop-status]")).not.toHaveText("閲覧中");
    await expect(page.locator("[data-desktop-status]")).not.toHaveText("操作中");
    expect((await owner.request("desktop.endpoint.status", {})).peers).toEqual([]);
  } finally {
    try {
      await page.goto("about:blank").catch(() => {});
    } finally {
      try {
        await provider.close();
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }
  }
});

for (const transport of ["wss", "udp"] as const)
  test(`encrypted product children carry generated video/audio, microphone and files: ${transport}`, async ({
    page,
    appServer,
  }) => {
    test.setTimeout(90000);
    const dir = await mkdtemp(join(tmpdir(), "soda-encrypted-media-")),
      ledger = join(dir, "microphone.jsonl"),
      files = join(dir, "files");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(files);
    const env = {
      SODA_DESKTOP_COMMAND: JSON.stringify([
        process.execPath,
        fileURLToPath(
          new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
        ),
        "--static",
        "--allow-input",
        "--allow-clipboard",
        "--rich-clipboard",
        "--microphone-fixture",
        "--native-datagrams",
        "--native-audio",
        "--native-fixture",
        fileURLToPath(
          new URL(
            "../../../../scripts/remote-desktop/fixtures/h264-generated.json",
            import.meta.url,
          ),
        ),
        "--lifecycle-ledger",
        ledger,
      ]),
      SODA_DESKTOP_ALLOW_MEDIA: "1",
      SODA_DESKTOP_ALLOW_INPUT: "1",
      SODA_DESKTOP_ALLOW_CLIPBOARD: "1",
    };
    const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
    Object.assign(process.env, env);
    const provider = await startAppServer().finally(() => {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });
    const publicText: string[] = [],
      connections: string[] = [];
    page.on("websocket", (ws) => {
      connections.push(ws.url());
      if (ws.url().endsWith("/desktop-e2e")) {
        const capture = ({ payload }: { payload: string | Buffer }) => {
          if (typeof payload === "string") publicText.push(payload);
        };
        ws.on("framesent", capture);
        ws.on("framereceived", capture);
      }
    });
    // All source and sink samples are generated. Neither recording devices nor
    // speakers are opened: even the product destination is a virtual stream.
    await page.addInitScript(() => {
      const w = window as any,
        Context = AudioContext,
        Decoder = AudioDecoder;
      w.__generated = { requests: 0, stops: 0, outputs: 0, energy: 0 };
      w.__clip = { text: "A encrypted generated", html: "<b>A encrypted generated</b>", writes: 0 };
      Object.defineProperty(navigator, "clipboard", {
        value: {
          readText: async () => w.__clip.text,
          writeText: async (v: string) => {
            w.__clip.text = v;
            w.__clip.writes++;
          },
          read: async () => [
            new ClipboardItem({
              "text/plain": new Blob([w.__clip.text], { type: "text/plain" }),
              "text/html": new Blob([w.__clip.html], { type: "text/html" }),
            }),
          ],
          write: async (items: ClipboardItem[]) => {
            for (const item of items)
              for (const type of item.types) {
                const blob = await item.getType(type);
                if (type === "text/plain") w.__clip.text = await blob.text();
                if (type === "text/html") w.__clip.html = await blob.text();
              }
            w.__clip.writes++;
          },
        },
      });
      window.AudioContext = class extends Context {
        private silent: MediaStreamAudioDestinationNode | undefined;
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
              const samples = new Float32Array(data.numberOfFrames);
              data.copyTo(samples, { planeIndex: 0, format: "f32-planar" });
              w.__generated.outputs++;
              w.__generated.energy = Math.max(
                w.__generated.energy,
                Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length),
              );
              init.output(data);
            },
          });
        }
      };
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        value: async () => {
          w.__generated.requests++;
          const context = new AudioContext({ sampleRate: 48000 }),
            osc = context.createOscillator(),
            destination = context.createMediaStreamDestination();
          osc.frequency.value = 440;
          osc.connect(destination);
          osc.start();
          await context.resume();
          const track = destination.stream.getAudioTracks()[0]!,
            stop = track.stop.bind(track);
          track.stop = () => {
            w.__generated.stops++;
            stop();
            osc.stop();
            void context.close();
          };
          return destination.stream;
        },
      });
    });
    try {
      const owner = await provider.openClient(),
        operator = await appServer.openClient();
      await operator.request("prefs.set", { patch: { notifyHintDone: true } });
      await owner.request("desktop.settings.set", {
        enabled: true,
        allowInput: true,
        allowClipboard: true,
        allowDisplayResize: false,
        allowSystemAudio: true,
        allowMicrophone: true,
        microphoneEndpoint: "synthetic-virtual-render",
        fileRoot: files,
      });
      const invite = await operator.request("machine.invite", {
        label: "Encrypted generated media",
      });
      await owner.request("machine.delegate", {
        url: appServer.origin,
        machineId: invite.machineId,
        token: invite.token,
      });
      const identity = await owner.request("desktop.endpoint.initialize", {});
      await owner.request("desktop.endpoint.required", { required: true });
      await page.goto(`${appServer.origin}/#token=${appServer.token}`);
      const header = page.locator(`[data-machine-id="${invite.machineId}"]`);
      await expect(header.locator('[data-state="online"]')).toBeVisible();
      await openNativeTab(page, "desktop", header);
      const view = page.locator("[data-remote-desktop]"),
        canvas = view.getByLabel("共有画面"),
        pairing = view.locator("[data-desktop-endpoint]");
      await pairing.locator("summary").click();
      await pairing.getByRole("button", { name: "このブラウザの鍵を作成", exact: true }).click();
      const fingerprint = pairing.locator("[data-browser-fingerprint]");
      await expect(fingerprint).toHaveText(/^[a-f0-9]{64}$/);
      await owner.request("desktop.endpoint.trust", {
        fingerprint: (await fingerprint.textContent())!,
        role: "viewer",
        label: "Generated media browser",
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
      await expect(canvas).toHaveAttribute("data-rendered-frames", /^[1-9]/);
      await expect(view.locator("[data-endpoint-encrypted]")).toBeVisible();
      await view.locator("[data-desktop-media] summary").click();
      await view.getByLabel("動画の経路").selectOption("native");
      if (transport === "wss")
        await view.getByLabel("UDPを優先（利用できない場合はWSS）").uncheck();
      await view.getByLabel("システム音声を要求").check();
      await view.getByRole("button", { name: "動画共有を依頼", exact: true }).click();
      await expect
        .poll(async () => Number(await canvas.getAttribute("data-video-frames")), {
          timeout: 20000,
        })
        .toBeGreaterThan(5);
      if (transport === "udp") await expect(view.locator("[data-native-datagrams]")).toBeVisible();
      await expect(view.locator("[data-native-audio]")).toContainText("ミュート");
      await view.getByRole("button", { name: "音声を再生", exact: true }).click();
      await expect(view.locator("[data-native-audio]")).toContainText("再生中");
      await expect
        .poll(() => page.evaluate(() => (window as any).__generated.outputs))
        .toBeGreaterThan(10);
      expect(await page.evaluate(() => (window as any).__generated.energy)).toBeGreaterThan(0.05);
      const mic = view.locator("[data-desktop-microphone]");
      await mic.locator("summary").click();
      expect(await page.evaluate(() => (window as any).__generated.requests)).toBe(0);
      await mic.getByRole("button", { name: "マイク転送を開始", exact: true }).click();
      await expect(mic.locator("[data-microphone-state]")).toHaveText("マイク転送中");
      await expect
        .poll(async () => {
          const rows = (await readFile(ledger, "utf8").catch(() => ""))
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((s) => JSON.parse(s));
          return rows.some((r) => r.type === "microphone_frame" && r.rms > 1000);
        })
        .toBe(true);
      await mic.getByRole("button", { name: "マイク転送を停止", exact: true }).click();
      await expect(mic.locator("[data-microphone-state]")).toHaveText("マイク停止");
      expect(await page.evaluate(() => (window as any).__generated.stops)).toBe(1);
      const panel = view.locator("[data-desktop-files]");
      await panel.locator("summary").click();
      await panel.getByRole("button", { name: "ファイル転送を許可", exact: true }).click();
      await expect(panel.getByText("共有フォルダ:", { exact: false })).toContainText(files);
      const data = await page.evaluateHandle(() => {
        const transfer = new DataTransfer();
        transfer.items.add(
          new File([new Uint8Array(120000).fill(0xab)], "generated.bin", {
            type: "application/octet-stream",
          }),
        );
        return transfer;
      });
      await view.dispatchEvent("drop", { dataTransfer: data });
      await data.dispose();
      const jobs = panel.getByRole("list", { name: "ファイル転送の一覧" });
      await expect(jobs).toContainText("完了");
      expect(await readFile(join(files, "generated.bin"))).toEqual(Buffer.alloc(120000, 0xab));
      const downloading = page.waitForEvent("download");
      await panel.getByRole("button", { name: "ダウンロード", exact: true }).click();
      const downloaded = await downloading;
      expect(await readFile((await downloaded.path())!)).toEqual(Buffer.alloc(120000, 0xab));
      await expect(jobs).toContainText("ブラウザのダウンロードへ渡しました");
      await view.locator("[data-desktop-clipboard] summary").click();
      await view.getByRole("button", { name: "クリップボード共有を許可", exact: true }).click();
      const rich = view.locator("[data-rich-clipboard]");
      await rich.getByRole("button", { name: "画像・書式を手元へコピー", exact: true }).click();
      await expect.poll(() => page.evaluate(() => (window as any).__clip.writes)).toBe(1);
      expect(await page.evaluate(() => (window as any).__clip.text)).toBe("B generated table");
      await page.evaluate(() => {
        (window as any).__clip.text = "A encrypted generated";
        (window as any).__clip.html = "<b>A encrypted generated</b>";
      });
      await rich.getByRole("button", { name: "画像・書式を共有元へ送信", exact: true }).click();
      await expect(view.locator('[data-desktop-clipboard] [role="status"]')).toContainText(
        "送りました",
      );
      expect(
        connections.filter((url) => url.endsWith("/desktop-e2e")).length,
      ).toBeGreaterThanOrEqual(5);
      expect(
        publicText.some((text) =>
          /microphone_frame|generated.bin|A encrypted generated|B generated table|synthetic-virtual-render|a=fingerprint|candidate:/.test(
            text,
          ),
        ),
      ).toBe(false);
      expect(connections.some((url) => url.endsWith("/desktop-share"))).toBe(true); // Initial unpaired legacy attempt is refused by B.
      await view.getByRole("button", { name: "動画・音声を停止", exact: true }).click();
      await closeNativeTab(page);
      await openNativeTab(page, "desktop", header);
      await expect(page.locator("[data-remote-desktop]").getByLabel("共有画面")).toHaveAttribute(
        "data-rendered-frames",
        /^[1-9]/,
      );
      expect(await page.evaluate(() => (window as any).__generated.requests)).toBe(1);
    } finally {
      try {
        await page.goto("about:blank").catch(() => {});
      } finally {
        try {
          await provider.close();
        } finally {
          await rm(dir, { recursive: true, force: true });
        }
      }
    }
  });
