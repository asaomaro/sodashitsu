import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openNativeTab } from "../support/nativeTab.js";
for (const mode of [
  "plain",
  "encrypted",
  "shared",
  "drop",
  "cancel",
  "pause",
  "collision",
] as const)
  test(`desktop folder generated ${mode}`, async ({ page, appServer }) => {
    test.setTimeout(90000);
    const root = await mkdtemp(join(tmpdir(), "soda-folder-e2e-")),
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
    const size = ["cancel", "pause"].includes(mode) ? 1048576 : 70000;
    await page.addInitScript(
      ({ mode, size }) => {
        const w = window as any;
        w.__folderWrites = 0;
        const stringify = JSON.stringify;
        JSON.stringify = function (...args: any[]) {
          if (args[0]?.type === "desktop_file" && args[0].request.action === "folder_write")
            w.__folderWrites++;
          return (stringify as any)(...args);
        };
        w.showDirectoryPicker = async () => ({
          kind: "directory",
          name: "資料",
          async *values() {
            yield { kind: "directory", name: "empty", async *values() {} };
            yield {
              kind: "directory",
              name: "nested",
              async *values() {
                yield {
                  kind: "file",
                  name: "本文.bin",
                  getFile: async () => new File([new Uint8Array(size).fill(0x6a)], "本文.bin"),
                };
              },
            };
            yield { kind: "file", name: "zero", getFile: async () => new File([], "zero") };
          },
        });
        if (["cancel", "pause"].includes(mode)) {
          const send = WebSocket.prototype.send;
          WebSocket.prototype.send = function (data) {
            if (typeof data === "string") {
              try {
                const m = JSON.parse(data);
                if (m.type === "desktop_file" && m.request.action === "folder_write") {
                  setTimeout(() => {
                    if (this.readyState === WebSocket.OPEN) send.call(this, data);
                  }, 100);
                  return;
                }
              } catch {}
            }
            return send.call(this, data);
          };
        }
      },
      { mode, size },
    );
    try {
      if (mode === "collision") {
        await mkdir(join(root, "資料"));
        await writeFile(join(root, "資料/keep"), "original");
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
      const invite = await operator.request("machine.invite", { label: "Folder B" });
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
          label: "Generated folder",
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
      if (mode === "shared") {
        await view.getByLabel("複数viewerで同じ画面を共有", { exact: true }).check();
        await expect(view.getByLabel("共有画面")).toHaveAttribute("data-rendered-frames", /^[1-9]/);
      }
      await panel.locator("summary").click();
      await panel.getByRole("button", { name: "ファイル転送を許可", exact: true }).click();
      if (mode === "drop") {
        const transfer = await page.evaluateHandle(
          ({ size }) => {
            const file = new File([new Uint8Array(size).fill(0x6a)], "本文.bin"),
              leaf = (name: string, data: File) => ({
                name,
                isDirectory: false,
                isFile: true,
                file: (ok: (v: File) => void) => ok(data),
              }),
              dir = (name: string, children: any[]) => ({
                name,
                isDirectory: true,
                isFile: false,
                createReader: () => {
                  let done = false;
                  return {
                    readEntries: (ok: (v: any[]) => void) => {
                      ok(done ? [] : children);
                      done = true;
                    },
                  };
                },
              });
            const data = new DataTransfer();
            data.items.add(new File([], "資料"));
            const base = DataTransferItem.prototype.webkitGetAsEntry;
            DataTransferItem.prototype.webkitGetAsEntry = function () {
              return this.getAsFile()?.name === "資料"
                ? (dir("資料", [
                    dir("empty", []),
                    dir("nested", [leaf("本文.bin", file)]),
                    leaf("zero", new File([], "zero")),
                  ]) as unknown as FileSystemEntry)
                : base.call(this);
            };
            return data;
          },
          { size },
        );
        await view.dispatchEvent("drop", { dataTransfer: transfer });
        await transfer.dispose();
      } else await panel.getByRole("button", { name: "フォルダを選んで送信", exact: true }).click();
      if (mode === "collision") {
        await expect(jobs).toContainText("失敗");
        expect(await readFile(join(root, "資料/keep"), "utf8")).toBe("original");
        await panel
          .getByLabel("送信フォルダの保存名（空欄なら元の名前）", { exact: true })
          .fill("資料-copy");
        await panel.getByRole("button", { name: "フォルダを選んで送信", exact: true }).click();
      }
      if (["cancel", "pause"].includes(mode)) {
        await expect
          .poll(() => page.evaluate(() => (window as any).__folderWrites))
          .toBeGreaterThan(0);
        if (mode === "cancel") {
          await jobs.getByRole("button", { name: "取り消す", exact: true }).click();
          await expect(jobs).toContainText("取消済み");
          await expect.poll(() => readdir(root)).toEqual([]);
          return;
        }
        await jobs.getByRole("button", { name: "一時停止", exact: true }).click();
        await expect(jobs.getByRole("button", { name: "再開", exact: true })).toBeVisible();
        await jobs.getByRole("button", { name: "再開", exact: true }).click();
      }
      await expect(jobs.locator("li").last()).toContainText("完了");
      const name = mode === "collision" ? "資料-copy" : "資料";
      expect(await readFile(join(root, name, "nested/本文.bin"))).toEqual(Buffer.alloc(size, 0x6a));
      expect(await readdir(join(root, name, "empty"))).toEqual([]);
      expect(await readFile(join(root, name, "zero"))).toHaveLength(0);
      const waiting = page.waitForEvent("download");
      await panel.getByRole("button", { name: `${name} をZIPで受信`, exact: true }).click();
      const download = await waiting,
        bytes = await readFile((await download.path())!),
        unzipped = unzipSync(bytes);
      expect(Object.keys(unzipped).sort()).toEqual(
        [
          `${name}/`,
          `${name}/empty/`,
          `${name}/nested/`,
          `${name}/nested/本文.bin`,
          `${name}/zero`,
        ].sort(),
      );
      expect(Buffer.from(unzipped[`${name}/nested/本文.bin`]!)).toEqual(Buffer.alloc(size, 0x6a));
      if (identity) await expect(view.locator("[data-endpoint-encrypted]")).toBeVisible();
    } finally {
      await page.goto("about:blank").catch(() => {});
      await provider.close();
      await rm(root, { recursive: true, force: true });
    }
  });
