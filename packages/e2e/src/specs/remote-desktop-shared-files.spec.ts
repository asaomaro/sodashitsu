import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openNativeTab } from "../support/nativeTab.js";
// Generated oscillator/private sink only. Never opens a physical microphone or speaker.
for (const mode of ["plain", "encrypted"] as const)
  test(`shared file grants and independent cancellation ${mode}`, async ({
    page,
    context,
    appServer,
  }) => {
    test.setTimeout(90000);
    const dir = await mkdtemp(join(tmpdir(), "soda-shared-files-")),
      ledger = join(dir, "lifecycle");
    const saved = process.env.SODA_DESKTOP_COMMAND;
    process.env.SODA_DESKTOP_COMMAND = JSON.stringify([
      process.execPath,
      fileURLToPath(
        new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
      ),
      "--static",
      "--lifecycle-ledger",
      ledger,
    ]);
    const provider = await startAppServer().finally(() => {
      if (saved === undefined) delete process.env.SODA_DESKTOP_COMMAND;
      else process.env.SODA_DESKTOP_COMMAND = saved;
    });
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
        fileRoot: dir,
      });
      const invite = await operator.request("machine.invite", { label: "Shared files B" });
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
          label: "Generated shared file browser",
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
      const panel1 = first.locator("[data-desktop-files]"),
        panel2 = view.locator("[data-desktop-files]");
      for (const panel of [panel1, panel2]) {
        await expect(panel).toBeVisible();
        await panel.locator("summary").click();
      }
      await panel1.getByRole("button", { name: "ファイル転送を許可", exact: true }).click();
      // A grant in one viewer must not grant the second viewer.
      await expect(panel2.getByLabel("送信するファイル", { exact: true })).toHaveCount(0);
      await panel2.getByRole("button", { name: "ファイル転送を許可", exact: true }).click();
      await panel1
        .getByLabel("送信するファイル", { exact: true })
        .setInputFiles({
          name: "first.bin",
          mimeType: "application/octet-stream",
          buffer: Buffer.alloc(120000, 0x41),
        });
      await expect(panel1.getByRole("list", { name: "ファイル転送の一覧" })).toContainText("完了");
      await panel1.getByRole("button", { name: "ファイル転送を解除", exact: true }).click();
      await expect(panel2.getByLabel("送信するファイル", { exact: true })).toBeVisible();
      await panel2
        .getByLabel("送信するファイル", { exact: true })
        .setInputFiles({
          name: "second.bin",
          mimeType: "application/octet-stream",
          buffer: Buffer.alloc(240000, 0x42),
        });
      await expect(panel2.getByRole("list", { name: "ファイル転送の一覧" })).toContainText("完了");
      expect(await readFile(join(dir, "first.bin"))).toEqual(Buffer.alloc(120000, 0x41));
      expect(await readFile(join(dir, "second.bin"))).toEqual(Buffer.alloc(240000, 0x42));
      await first.getByRole("button", { name: "共有停止", exact: true }).click();
      await expect(first).toHaveCount(0);
      await panel2.getByRole("button", { name: "一覧を更新", exact: true }).click();
      const entry = panel2.locator("li").filter({ hasText: "second.bin" }).first();
      const download = second.waitForEvent("download");
      await entry.getByRole("button", { name: "ダウンロード", exact: true }).click();
      const result = await download;
      expect(await readFile((await result.path())!)).toEqual(Buffer.alloc(240000, 0x42));
      if (identity) await expect(view.locator("[data-endpoint-encrypted]")).toBeVisible();
      const lifecycle = (await readFile(ledger, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(lifecycle.filter((m) => m.type === "spawn")).toHaveLength(2); // initial single source, then one shared source
      await view.getByRole("button", { name: "共有停止", exact: true }).click();
    } finally {
      await second.close().catch(() => {});
      await page.goto("about:blank").catch(() => {});
      await provider.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
