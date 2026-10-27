import { unzipSync } from "fflate";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openNativeTab } from "../support/nativeTab.js";
for (const mode of [
  "upload",
  "download",
  "final-download",
  "encrypted-upload",
  "encrypted-download",
  "other-window-upload",
  "storage-unavailable-upload",
  "full-store-upload",
] as const)
  test(`desktop folder checkpoint reload ${mode}`, async ({ page, context, appServer }) => {
    test.setTimeout(90000);
    const root = await mkdtemp(join(tmpdir(), "soda-checkpoint-e2e-")),
      saved = process.env.SODA_DESKTOP_COMMAND;
    process.env.SODA_DESKTOP_COMMAND = JSON.stringify([
      process.execPath,
      fileURLToPath(
        new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
      ),
      "--static",
    ]);
    const provider = await startAppServer().finally(() => {
      if (saved === undefined) delete process.env.SODA_DESKTOP_COMMAND;
      else process.env.SODA_DESKTOP_COMMAND = saved;
    });
    const upload = mode.endsWith("upload"),
      data = Buffer.alloc(1048576, 0x6a);
    let finalZipSize = 0;
    // Delay chunks in the test transport so UI pause has a deterministic opportunity.
    // The browser still uses the production WS/endpoint lane and file actions.
    await page.addInitScript(() => {
      const w = window as any;
      w.__folderCheckpointRequests = [];
      const stringify = JSON.stringify;
      JSON.stringify = function (...args: any[]) {
        const value = args[0];
        if (value?.type === "desktop_file")
          w.__folderCheckpointRequests.push({
            action: value.request.request?.action ?? value.request.action,
            offset: value.request.request?.offset ?? value.request.offset,
          });
        return (stringify as any)(...args);
      };
      w.showDirectoryPicker = async () => ({
        kind: "directory",
        name: "資料",
        async *values() {
          yield { kind: "directory", name: "empty", async *values() {} };
          yield {
            kind: "file",
            name: "generated.bin",
            getFile: async () => new File([new Uint8Array(1048576).fill(0x6a)], "generated.bin"),
          };
          yield { kind: "file", name: "zero", getFile: async () => new File([], "zero") };
        },
      });
      const send = WebSocket.prototype.send;
      WebSocket.prototype.send = function (data) {
        if (typeof data === "string") {
          try {
            const m = JSON.parse(data);
            if (
              m.type === "desktop_file" &&
              ["folder_read", "folder_write"].includes(
                m.request.request?.action ?? m.request.action,
              )
            ) {
              setTimeout(() => {
                if (this.readyState === WebSocket.OPEN) send.call(this, data);
              }, 100);
              return;
            }
          } catch {}
        }
        return send.call(this, data);
      };
    });
    if (mode === "final-download")
      await page.addInitScript(() => {
        const original = URL.createObjectURL;
        URL.createObjectURL = function (blob) {
          if (
            blob instanceof Blob &&
            blob.size > 1048576 &&
            !sessionStorage.getItem("generated-final-zip-interruption")
          ) {
            sessionStorage.setItem("generated-final-zip-interruption", "1");
            throw Error("generated interruption after saved ZIP final chunk");
          }
          return original.call(this, blob);
        };
      });
    if (mode === "storage-unavailable-upload")
      await page.addInitScript(() => {
        const open = indexedDB.open.bind(indexedDB);
        indexedDB.open = (name, version) => {
          if (name === "soda-desktop-file-resume-v1") throw Error("生成した保存不可");
          return version === undefined ? open(name) : open(name, version);
        };
      });
    try {
      if (!upload) {
        await mkdir(join(root, "資料"));
        await writeFile(join(root, "資料/generated.bin"), data);
      }
      const owner = await provider.openClient(),
        operator = await appServer.openClient();
      await operator.request("prefs.set", { patch: { notifyHintDone: true } });
      await owner.request("desktop.settings.set", {
        enabled: true,
        allowInput: false,
        allowClipboard: false,
        allowDisplayResize: false,
        fileRoot: root,
      });
      const invite = await operator.request("machine.invite", { label: "Checkpoint B" });
      await owner.request("machine.delegate", {
        url: appServer.origin,
        machineId: invite.machineId,
        token: invite.token,
      });
      const identity = mode.startsWith("encrypted")
        ? await owner.request("desktop.endpoint.initialize", {})
        : undefined;
      if (identity) await owner.request("desktop.endpoint.required", { required: true });
      await page.goto(`${appServer.origin}/#token=${appServer.token}`);
      const header = page.locator(`[data-machine-id="${invite.machineId}"]`);
      await expect(header.locator('[data-state="online"]')).toBeVisible();
      await openNativeTab(page, "desktop", header);
      const view = page.locator("[data-remote-desktop]"),
        panel = view.locator("[data-desktop-files]"),
        jobs = panel.getByRole("list", { name: "ファイル転送の一覧" });
      if (identity) {
        const pairing = view.locator("[data-desktop-endpoint]");
        await pairing.locator("summary").click();
        await pairing.getByRole("button", { name: "このブラウザの鍵を作成", exact: true }).click();
        const fingerprint = pairing.locator("[data-browser-fingerprint]");
        await expect(fingerprint).toHaveText(/^[a-f0-9]{64}$/);
        await owner.request("desktop.endpoint.trust", {
          fingerprint: (await fingerprint.textContent())!,
          role: "viewer",
          label: "Generated file resume",
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
      await expect(view.getByLabel("共有画面")).toHaveAttribute("data-rendered-frames", /^[1-9]/);
      if (mode === "other-window-upload") {
        await view.getByLabel("複数viewerで同じ画面を共有", { exact: true }).check();
        await expect(view.getByLabel("共有画面")).toHaveAttribute("data-rendered-frames", /^[1-9]/);
      }
      await panel.locator("summary").click();
      await expect(panel.locator("[data-file-resume-notice]")).toBeVisible();
      await panel.getByRole("button", { name: "ファイル転送を許可", exact: true }).click();
      await panel
        .getByLabel("切断後の再開用に転送データをこのブラウザへ保存", { exact: true })
        .check();
      if (mode === "full-store-upload")
        await page.evaluate(async () => {
          const open = indexedDB.open("soda-desktop-file-resume-v1", 1);
          await new Promise<void>((resolve) => {
            open.onsuccess = () => {
              const d = open.result,
                t = d.transaction("jobs", "readwrite");
              t.objectStore("jobs").put({
                key: crypto.randomUUID(),
                machine: "fixture-other-machine",
                root: "fixture-private",
                path: "reserved",
                name: "reserved",
                direction: "upload",
                size: 104857600,
                offset: 0,
                checkpoint: "0".repeat(64),
                hash: "0".repeat(64),
                expires: Date.now() + 900000,
              });
              t.oncomplete = () => {
                d.close();
                resolve();
              };
            };
          });
        });
      if (upload)
        await panel.getByRole("button", { name: "フォルダを選んで送信", exact: true }).click();
      else
        await panel
          .locator("li")
          .filter({ hasText: "資料" })
          .getByRole("button", { name: "資料 をZIPで受信", exact: true })
          .click();
      if (mode === "storage-unavailable-upload" || mode === "full-store-upload") {
        await expect(jobs).toContainText("失敗");
        await expect(jobs).toContainText(mode === "full-store-upload" ? "100MiB" : "保存不可");
        await expect
          .poll(async () => {
            try {
              await readFile(join(root, "資料/generated.bin"));
              return true;
            } catch {
              return false;
            }
          })
          .toBe(false);
        return;
      }
      await expect(jobs).toContainText(
        /65536|131072|196608|262144|327680|393216|458752|524288|589824|655360|720896|786432|851968|917504|983040/,
      );
      await jobs.getByRole("button", { name: "一時停止", exact: true }).click();
      await expect(jobs.getByRole("button", { name: "再開", exact: true })).toBeVisible();
      // Confirm durable browser progress rather than relying on a test RPC observer.
      const before = await page.evaluate(async () => {
        const r = indexedDB.open("soda-desktop-file-resume-v1", 1);
        return new Promise<number>((resolve, reject) => {
          r.onerror = () => reject(r.error);
          r.onsuccess = () => {
            const d = r.result,
              q = d.transaction("jobs").objectStore("jobs").getAll();
            q.onsuccess = () => {
              resolve(q.result[0].offset);
              d.close();
            };
          };
        });
      });
      expect(before).toBeGreaterThan(0);
      expect(before).toBeLessThan(data.length);
      if (mode === "other-window-upload") {
        const other = await context.newPage();
        try {
          await other.goto(`${appServer.origin}/`);
          await openNativeTab(
            other,
            "desktop",
            other.locator(`[data-machine-id="${invite.machineId}"]`),
          );
          const otherView = other.locator("[data-remote-desktop]");
          await expect(otherView.locator("[data-desktop-status]")).toHaveText(/停止|終了/);
          await otherView.getByLabel("複数viewerで同じ画面を共有", { exact: true }).check();
          await expect(otherView.getByLabel("共有画面")).toHaveAttribute(
            "data-rendered-frames",
            /^[1-9]/,
          );
          const otherPanel = otherView.locator("[data-desktop-files]");
          await otherPanel.locator("summary").click();
          await otherPanel.getByRole("button", { name: "ファイル転送を許可", exact: true }).click();
          await expect(
            otherPanel.getByRole("list", { name: "ファイル転送の一覧" }).locator("li"),
          ).toHaveCount(0);
          await jobs.getByRole("button", { name: "再開", exact: true }).click();
          await expect(jobs).toContainText("完了");
          expect(await readFile(join(root, "資料/generated.bin"))).toEqual(data);
        } finally {
          await other.close();
        }
        return;
      }
      await page.reload();
      await openNativeTab(page, "desktop", page.locator(`[data-machine-id="${invite.machineId}"]`));
      await expect(view.getByLabel("共有画面")).toHaveAttribute("data-rendered-frames", /^[1-9]/);
      await panel.locator("summary").click();
      await expect(jobs.locator("li")).toHaveCount(0); // No old grant and no automatic transfer on reload.
      await panel.getByRole("button", { name: "ファイル転送を許可", exact: true }).click();
      await expect(jobs).toContainText("保存済みです");
      expect(
        await page.evaluate(() =>
          (window as any).__folderCheckpointRequests.filter((r: any) =>
            ["folder_read", "folder_write", "folder_file_finish", "folder_finish"].includes(
              r.action,
            ),
          ),
        ),
      ).toEqual([]);
      const download = upload ? undefined : page.waitForEvent("download");
      await jobs.getByRole("button", { name: "再開", exact: true }).click();
      if (mode === "final-download") {
        await expect(jobs).toContainText("generated interruption after saved ZIP final chunk");
        const completedOffset = (await jobs.textContent())!.match(/(\d+)\s*\/\s*(\d+)\s*bytes/)!;
        expect(completedOffset).toBeTruthy();
        expect(completedOffset[1]).toBe(completedOffset[2]);
        finalZipSize = Number(completedOffset[2]);
        expect(finalZipSize).toBeGreaterThan(data.length);
        await page.reload();
        await openNativeTab(
          page,
          "desktop",
          page.locator(`[data-machine-id="${invite.machineId}"]`),
        );
        await expect(view.getByLabel("共有画面")).toHaveAttribute("data-rendered-frames", /^[1-9]/);
        await panel.locator("summary").click();
        await panel.getByRole("button", { name: "ファイル転送を許可", exact: true }).click();
        await expect(jobs).toContainText("保存済みです");
        await jobs.getByRole("button", { name: "再開", exact: true }).click();
      }
      await expect(jobs).toContainText("完了");
      if (upload) {
        expect(await readFile(join(root, "資料/generated.bin"))).toEqual(data);
        expect(await readFile(join(root, "資料/zero"))).toHaveLength(0);
        await expect
          .poll(async () => {
            try {
              await import("node:fs/promises").then((fs) => fs.readdir(join(root, "資料/empty")));
              return true;
            } catch {
              return false;
            }
          })
          .toBe(true);
      } else
        expect(
          unzipSync(await readFile((await (await download!).path())!))["資料/generated.bin"],
        ).toEqual(new Uint8Array(data));
      const sent = await page.evaluate(
        () =>
          (window as any).__folderCheckpointRequests as Array<{ action: string; offset?: number }>,
      );
      const resumed = sent.find((r) => r.action === (upload ? "folder_write" : "folder_read"));
      expect(resumed?.offset).toBeGreaterThanOrEqual(before);
      if (mode === "final-download") expect(resumed?.offset).toBe(finalZipSize);
      if (identity) await expect(view.locator("[data-endpoint-encrypted]")).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(async () => {
            const r = indexedDB.open("soda-desktop-file-resume-v1", 1);
            return new Promise<number>((resolve) => {
              r.onsuccess = () => {
                const d = r.result,
                  q = d.transaction("jobs").objectStore("jobs").count();
                q.onsuccess = () => {
                  resolve(q.result);
                  d.close();
                };
              };
            });
          }),
        )
        .toBe(0);
    } finally {
      await page.goto("about:blank").catch(() => {});
      await provider.close();
      await rm(root, { recursive: true, force: true });
    }
  });
