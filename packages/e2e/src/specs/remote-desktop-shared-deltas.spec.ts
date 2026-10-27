import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openNativeTab } from "../support/nativeTab.js";
// Generated screenshot and cursor only; no OS capture or input.
for (const mode of ["plain", "encrypted", "slow", "native", "saved-off"] as const)
  test(`shared delta image recovery with independent viewer ACKs ${mode}`, async ({
    page,
    context,
    appServer,
  }) => {
    test.setTimeout(90000);
    const dir = await mkdtemp(join(tmpdir(), "soda-shared-deltas-")),
      ledger = join(dir, "lifecycle");
    const savedInput = process.env.SODA_DESKTOP_ALLOW_INPUT;
    process.env.SODA_DESKTOP_ALLOW_INPUT = "1";
    const savedMedia = process.env.SODA_DESKTOP_ALLOW_MEDIA;
    if (mode === "native") process.env.SODA_DESKTOP_ALLOW_MEDIA = "1";
    const saved = process.env.SODA_DESKTOP_COMMAND;
    process.env.SODA_DESKTOP_COMMAND = JSON.stringify([
      process.execPath,
      fileURLToPath(
        new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
      ),
      "--static",
      "--allow-input",
      "--delta-test",
      "--input-ack-pipe",
      ...(mode === "native"
        ? [
            "--native-60fps",
            "--native-fixture",
            fileURLToPath(
              new URL(
                "../../../../scripts/remote-desktop/fixtures/h264-generated.json",
                import.meta.url,
              ),
            ),
          ]
        : []),
      "--lifecycle-ledger",
      ledger,
    ]);
    const provider = await startAppServer().finally(() => {
      if (savedInput === undefined) delete process.env.SODA_DESKTOP_ALLOW_INPUT;
      else process.env.SODA_DESKTOP_ALLOW_INPUT = savedInput;
      if (savedMedia === undefined) delete process.env.SODA_DESKTOP_ALLOW_MEDIA;
      else process.env.SODA_DESKTOP_ALLOW_MEDIA = savedMedia;
      if (saved === undefined) delete process.env.SODA_DESKTOP_COMMAND;
      else process.env.SODA_DESKTOP_COMMAND = saved;
    });
    const second = await context.newPage();
    if (mode === "slow")
      await second.addInitScript(() => {
        (window as any).__imageAckDelay = 0;
        const Base = WebSocket;
        window.WebSocket = class extends Base {
          private due = 0;
          override send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
            if (
              typeof data === "string" &&
              this.url.endsWith("/desktop-share") &&
              JSON.parse(data).type === "ack"
            ) {
              this.due = Math.max(
                performance.now() + (window as any).__imageAckDelay,
                this.due + 1,
              );
              setTimeout(
                () => {
                  if (this.readyState === Base.OPEN) super.send(data);
                },
                Math.max(0, this.due - performance.now()),
              );
              return;
            }
            super.send(data);
          }
        };
      });
    try {
      const owner = await provider.openClient(),
        operator = await appServer.openClient();
      await operator.request("prefs.set", { patch: { notifyHintDone: true } });
      const invite = await operator.request("machine.invite", { label: "Shared delta B" });
      await owner.request("machine.delegate", {
        url: appServer.origin,
        machineId: invite.machineId,
        token: invite.token,
      });
      const identity =
        mode === "encrypted" ? await owner.request("desktop.endpoint.initialize", {}) : undefined;
      if (identity) await owner.request("desktop.endpoint.required", { required: true });
      if (mode === "saved-off")
        await page.addInitScript(
          ({ id, origin }) => {
            if (location.origin === origin)
              localStorage.setItem(
                `soda:desktop:connection:v1:${id}`,
                JSON.stringify({ deltas: false }),
              );
          },
          { id: invite.machineId, origin: appServer.origin },
        );
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
          label: "Generated shared delta browser",
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
      if (mode === "saved-off") {
        await expect(
          first.getByLabel("差分画像を共有（全ての窓で同じ選択が必要）", { exact: true }),
        ).toBeDisabled();
        await first.getByText("画質・計測", { exact: true }).click();
        const preference = first.getByLabel("差分転送", { exact: true });
        await expect(preference).not.toBeChecked();
        await expect(preference).toBeEnabled();
        await preference.check();
        await first.getByRole("button", { name: "適用して再接続", exact: true }).click();
        await expect(c1).toHaveAttribute("data-rendered-frames", /^[1-9]/);
      }
      await first.getByLabel("差分画像を共有（全ての窓で同じ選択が必要）", { exact: true }).check();
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
      await expect(view.locator("[data-desktop-status]")).toHaveText(/停止|終了/);
      await view.getByLabel("差分画像を共有（全ての窓で同じ選択が必要）", { exact: true }).check();
      await expect(c2).toHaveAttribute("data-rendered-frames", /^[1-9]/);
      const pixel = async (c: typeof c1) =>
        c.evaluate((el) =>
          Array.from((el as HTMLCanvasElement).getContext("2d")!.getImageData(20, 20, 1, 1).data),
        );
      for (const c of [c1, c2]) await expect.poll(() => pixel(c)).toEqual([0, 255, 0, 255]);
      if (mode === "native") {
        await first.locator("[data-desktop-media] summary").click();
        await first.getByRole("button", { name: "動画共有を依頼", exact: true }).click();
        await expect
          .poll(async () => Number(await c1.getAttribute("data-video-frames")))
          .toBeGreaterThan(4);
      }
      if (mode === "slow") await second.evaluate(() => ((window as any).__imageAckDelay = 2500));
      await page.bringToFront();
      await first.getByRole("button", { name: "操作する", exact: true }).click();
      await expect(first.locator("[data-desktop-status]")).toHaveText("操作中");
      const sendText = async (text: string) => {
        await first.getByPlaceholder("日本語はここで変換を確定", { exact: true }).fill(text);
        await first.getByRole("button", { name: "文字を送る", exact: true }).click();
      };
      await sendText("first generated change");
      await expect.poll(() => pixel(c2)).toEqual([255, 0, 0, 255]);
      if (mode !== "native") await expect.poll(() => pixel(c1)).toEqual([255, 0, 0, 255]);
      await sendText("second generated change");
      if (mode !== "native") await expect.poll(() => pixel(c1)).toEqual([0, 255, 0, 255]);
      if (mode === "slow") {
        expect(await pixel(c2)).toEqual([255, 0, 0, 255]);
        await second.evaluate(() => ((window as any).__imageAckDelay = 0));
      }
      await expect.poll(() => pixel(c2), { timeout: 10000 }).toEqual([0, 255, 0, 255]);
      if (mode === "native") {
        await first.getByRole("button", { name: "動画・音声を停止", exact: true }).click();
        await expect(first.locator("[data-media-state]")).toHaveText("画像配信");
        await expect.poll(() => pixel(c1)).toEqual([0, 255, 0, 255]);
        await sendText("third generated change");
        for (const c of [c1, c2]) await expect.poll(() => pixel(c)).toEqual([255, 0, 0, 255]);
      }
      await first.getByRole("button", { name: "共有停止", exact: true }).click();
      await expect(first).toHaveCount(0);
      const before = Number(await c2.getAttribute("data-rendered-frames"));
      await expect
        .poll(async () => Number(await c2.getAttribute("data-rendered-frames")))
        .toBeGreaterThan(before);
      if (identity) await expect(view.locator("[data-endpoint-encrypted]")).toBeVisible();
      const lifecycle = (await readFile(ledger, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(lifecycle.filter((m) => m.type === "spawn")).toHaveLength(
        mode === "saved-off" ? 4 : 3,
      ); // optional preference apply adds one capture source
      await view.getByRole("button", { name: "共有停止", exact: true }).click();
    } finally {
      await second.close().catch(() => {});
      await page.goto("about:blank").catch(() => {});
      await provider.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
