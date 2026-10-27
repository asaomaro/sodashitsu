import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openNativeTab } from "../support/nativeTab.js";
// Generated screenshot and cursor only; no OS capture or input.
for (const mode of ["encrypted"] as string[])
  test(`encrypted busy responses and capability drain ${mode}`, async ({
    page,
    context,
    appServer,
  }) => {
    test.setTimeout(90000);
    const dir = await mkdtemp(join(tmpdir(), "soda-shared-cursor-")),
      ledger = join(dir, "lifecycle");
    const savedMedia = process.env.SODA_DESKTOP_ALLOW_MEDIA;
    if (mode === "native") process.env.SODA_DESKTOP_ALLOW_MEDIA = "1";
    const saved = process.env.SODA_DESKTOP_COMMAND;
    process.env.SODA_DESKTOP_COMMAND = JSON.stringify([
      process.execPath,
      fileURLToPath(
        new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
      ),
      "--static",
      "--cursor",
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
      if (savedMedia === undefined) delete process.env.SODA_DESKTOP_ALLOW_MEDIA;
      else process.env.SODA_DESKTOP_ALLOW_MEDIA = savedMedia;
      if (saved === undefined) delete process.env.SODA_DESKTOP_COMMAND;
      else process.env.SODA_DESKTOP_COMMAND = saved;
    });
    const second = await context.newPage();
    try {
      const owner = await provider.openClient(),
        operator = await appServer.openClient();
      await operator.request("prefs.set", { patch: { notifyHintDone: true } });
      const invite = await operator.request("machine.invite", { label: "Shared cursor B" });
      await owner.request("machine.delegate", {
        url: appServer.origin,
        machineId: invite.machineId,
        token: invite.token,
      });
      const identity =
        mode === "encrypted" ? await owner.request("desktop.endpoint.initialize", {}) : undefined;
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
          label: "Generated shared cursor browser",
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
      const toggle = first.getByLabel("独立カーソルを共有（全ての窓で同じ選択が必要）", {
        exact: true,
      });
      await toggle.check();
      const overlay1 = first.locator("[data-remote-cursor]");
      await expect(overlay1).toHaveAttribute("data-cursor-seq", /^[1-9]/);
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
      // The default baked-cursor cohort cannot silently join a separate-cursor source.
      await expect(view.locator("[data-desktop-status]")).toHaveText(/停止|終了/);
      const offered = view.getByLabel("独立カーソルを共有（全ての窓で同じ選択が必要）", {
        exact: true,
      });
      for (let attempt = 0; attempt < 3; attempt++) {
        await expect(offered).toBeVisible();
        await expect(view.getByRole("alert")).toContainText("共有を開始できません");
        await expect(view.getByRole("alert")).not.toContainText("暗号化接続を確立できません");
        await expect(
          view.getByLabel("差分画像を共有（全ての窓で同じ選択が必要）", { exact: true }),
        ).toBeVisible();
        if (attempt < 2) {
          await view.getByRole("button", { name: "再同期", exact: true }).click();
          await expect(view.locator("[data-desktop-status]")).toHaveText(/停止|終了/);
        }
      }
      await offered.check();
      await expect(c2).toHaveAttribute("data-rendered-frames", /^[1-9]/);
      if (mode === "native")
        for (const v of [first, view]) {
          await v.locator("[data-desktop-media] summary").click();
          await v.getByRole("button", { name: "動画共有を依頼", exact: true }).click();
          await expect
            .poll(async () =>
              Number(await v.getByLabel("共有画面").getAttribute("data-video-frames")),
            )
            .toBeGreaterThan(4);
        }
      const overlay2 = view.locator("[data-remote-cursor]");
      await expect(overlay2).toHaveAttribute("data-cursor-seq", /^[1-9]/);
      for (const v of [first, view]) {
        await expect
          .poll(() =>
            v.evaluate((el, native) => {
              const c = el.querySelector("[data-remote-cursor]") as HTMLCanvasElement;
              const x = Math.floor(Number(c.dataset.cursorX) * c.width),
                y = Math.floor(Number(c.dataset.cursorY) * c.height) - 1;
              const ctx = c.getContext("2d")!;
              if (!native)
                return (
                  JSON.stringify(Array.from(ctx.getImageData(x, y, 1, 1).data)) ===
                  JSON.stringify([0, 255, 0, 255])
                );
              // Native fixture resizes the base, so the 4px cursor is scaled too.
              // At its top-left sample, XOR must invert the actual video pixel.
              const b = el.querySelector('[aria-label="共有画面"]') as HTMLCanvasElement;
              const bg = b.getContext("2d")!.getImageData(x - 1, y, 1, 1).data;
              const over = ctx.getImageData(x - 1, y, 1, 1).data;
              return over[3] === 255 && [0, 1, 2].every((i) => over[i] === (bg[i]! ^ 255));
            }, mode === "native"),
          )
          .toBe(true);
      }
      const beforeSeq = Number(await overlay2.getAttribute("data-cursor-seq"));
      await first.getByRole("button", { name: "共有停止", exact: true }).click();
      await expect(first).toHaveCount(0);
      await expect
        .poll(async () => Number(await overlay2.getAttribute("data-cursor-seq")))
        .toBeGreaterThan(beforeSeq);
      if (identity) await expect(view.locator("[data-endpoint-encrypted]")).toBeVisible();
      const lifecycle = (await readFile(ledger, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(lifecycle.filter((m) => m.type === "spawn")).toHaveLength(3); // single, baked shared, then independent-cursor shared
      await view.getByRole("button", { name: "共有停止", exact: true }).click();
    } finally {
      await second.close().catch(() => {});
      await page.goto("about:blank").catch(() => {});
      await provider.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
