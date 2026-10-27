import { fileURLToPath } from "node:url";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openNativeTab } from "../support/nativeTab.js";

for (const mode of [
  "roundtrip",
  "cancel",
  "local-change",
  "old-helper",
  "auto-stop",
  "busy-start",
  "pipe-fallback",
  "copy-race",
] as const)
  test(`rich clipboard memory-only ${mode}: HTML/PNG and isolated bounded traffic`, async ({
    page,
    appServer,
  }) => {
    test.setTimeout(60000);
    const env = {
      SODA_DESKTOP_COMMAND: JSON.stringify([
        process.execPath,
        fileURLToPath(
          new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
        ),
        "--static",
        "--allow-input",
        "--allow-clipboard",
        ...(mode === "old-helper" ? [] : ["--rich-clipboard"]),
        ...(["cancel", "auto-stop", "busy-start"].includes(mode) ? ["--rich-delay-read"] : []),
        ...(mode === "auto-stop" ? ["--rich-delay-push"] : []),
        ...(mode === "local-change" ? ["--rich-mutate-on-commit"] : []),
      ]),
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
    await page.addInitScript(() => {
      const w = window as any;
      w.__clip = {
        text: "A generated table",
        html: '<table><tr><td style="color:red">A generated table</td></tr></table>',
        png: undefined,
        writes: 0,
        events: [],
        sockets: [],
      };
      Object.defineProperty(navigator, "clipboard", {
        value: {
          readText: async () => w.__clip.text,
          writeText: async (v: string) => {
            w.__clip.text = v;
            w.__clip.writes++;
          },
          read: async () => {
            const c = w.__clip,
              values: Record<string, Blob> = {
                "text/plain": new Blob([c.text], { type: "text/plain" }),
                "text/html": new Blob([c.html], { type: "text/html" }),
              };
            if (c.png) values["image/png"] = new Blob([c.png], { type: "image/png" });
            return [new ClipboardItem(values)];
          },
          write: async (items: ClipboardItem[]) => {
            const c = w.__clip;
            for (const item of items) {
              for (const type of item.types) {
                const blob = await item.getType(type);
                if (type === "text/plain") c.text = await blob.text();
                else if (type === "text/html") c.html = await blob.text();
                else if (type === "image/png") c.png = new Uint8Array(await blob.arrayBuffer());
              }
            }
            c.writes++;
            if (c.copyRace) {
              c.copyRace = false;
              c.text = "A copied during remote apply";
              c.html = "<b>A copied during remote apply</b>";
            }
          },
        },
      });
      // Both sides are generated memory clipboards. Never invoke an OS clipboard API.
      document.hasFocus = () => true;
      const Base = WebSocket;
      window.WebSocket = class extends Base {
        constructor(
          url: string | URL,
          readonly offered?: string | string[],
        ) {
          super(url, offered);
          if (
            (typeof offered === "string"
              ? offered
              : offered?.length === 1
                ? offered[0]
                : undefined) === "soda-desktop-rich-clipboard-v1"
          )
            w.__clip.sockets.push(this);
        }
        send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
          if (typeof data === "string") {
            const m = JSON.parse(data);
            if (m.type === "clipboard_rich")
              w.__clip.events.push({
                protocol:
                  typeof this.offered === "string"
                    ? this.offered
                    : this.offered?.length === 1
                      ? this.offered[0]
                      : this.offered,
                operation: m.operation,
              });
          }
          super.send(data);
        }
      };
    });
    try {
      const owner = await provider.openClient(),
        a = await appServer.openClient(),
        invite = await a.request("machine.invite", { label: "Generated clipboard B" });
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
      await view.locator("[data-desktop-clipboard] summary").click();
      await view.getByRole("button", { name: "クリップボード共有を許可", exact: true }).click();
      await expect(
        view.getByRole("button", { name: "クリップボード共有を解除", exact: true }),
      ).toBeVisible();
      const rich = view.locator("[data-rich-clipboard]");
      if (mode === "old-helper") {
        await expect(rich).toHaveCount(0);
        await view.getByLabel("共有するクリップボードのテキスト").fill("old helper generated text");
        await view.getByRole("button", { name: "共有元へ送信", exact: true }).click();
        await expect(view.locator('[data-desktop-clipboard] [role="status"]')).toContainText(
          "送りました",
        );
        return;
      }
      await expect(rich).toBeVisible();
      const read = rich.getByRole("button", { name: "画像・書式を手元へコピー", exact: true }),
        write = rich.getByRole("button", { name: "画像・書式を共有元へ送信", exact: true });
      await expect(read).toBeEnabled();
      if (mode === "copy-race") {
        await page.evaluate(() => {
          (window as any).__clip.copyRace = true;
        });
        await view.getByLabel("画像・書式も自動同期する").check();
        await view.getByRole("button", { name: "双方向の自動同期を開始", exact: true }).click();
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                (window as any).__clip.events.filter((e: any) => e.operation === "commit").length,
            ),
          )
          .toBeGreaterThan(0);
        await view.getByRole("button", { name: "自動同期を停止", exact: true }).click();
        await expect(read).toBeEnabled();
        await read.click();
        await expect
          .poll(() => page.evaluate(() => (window as any).__clip.writes))
          .toBeGreaterThanOrEqual(2);
        expect(await page.evaluate(() => (window as any).__clip.text)).toBe(
          "A copied during remote apply",
        );
        return;
      }
      if (mode === "busy-start") {
        await view.getByLabel("画像・書式も自動同期する").check();
        await read.click();
        const auto = view.getByRole("button", { name: "双方向の自動同期を開始", exact: true });
        await expect(auto).toBeDisabled();
        await auto.dispatchEvent("click");
        await expect.poll(() => page.evaluate(() => (window as any).__clip.writes)).toBe(1);
        await expect(auto).toBeEnabled();
        await expect(write).toBeEnabled();
        return;
      }
      if (mode === "auto-stop" || mode === "pipe-fallback") {
        if (mode === "pipe-fallback") {
          await view
            .getByLabel("共有するクリップボードのテキスト")
            .fill("legacy fallback generated");
          await view.getByRole("button", { name: "共有元へ送信", exact: true }).click();
          await expect(view.locator('[data-desktop-clipboard] [role="status"]')).toContainText(
            "送りました",
          );
        }
        await view.getByLabel("画像・書式も自動同期する").check();
        await view.getByRole("button", { name: "双方向の自動同期を開始", exact: true }).click();
        await expect.poll(() => page.evaluate(() => (window as any).__clip.writes)).toBe(1);
        if (mode === "pipe-fallback") {
          await page.evaluate(() => {
            for (const s of (window as any).__clip.sockets as WebSocket[]) s.close();
          });
          await expect(rich).toHaveCount(0);
          await view.getByRole("button", { name: "双方向の自動同期を開始", exact: true }).click();
          await expect
            .poll(() => page.evaluate(() => (window as any).__clip.text))
            .toBe("legacy fallback generated");
          return;
        }
        await page.evaluate(() => {
          (window as any).__clip.html = "<b>" + "changed".repeat(20000) + "</b>";
        });
        await expect
          .poll(() =>
            page.evaluate(
              () => (window as any).__clip.events.filter((e: any) => e.operation === "push").length,
            ),
          )
          .toBeGreaterThan(0);
        await view.getByRole("button", { name: "自動同期を停止", exact: true }).click();
        const before = await page.evaluate(
          () => (window as any).__clip.events.filter((e: any) => e.operation === "push").length,
        );
        await expect(read).toBeEnabled();
        await read.click();
        await expect.poll(() => page.evaluate(() => (window as any).__clip.writes)).toBe(2);
        const events = await page.evaluate(() => (window as any).__clip.events);
        expect(events.filter((e: any) => e.operation === "push")).toHaveLength(before);
        expect(events.filter((e: any) => e.operation === "commit")).toHaveLength(0);
        expect(await page.evaluate(() => (window as any).__clip.text)).toBe("B generated table");
        return;
      }
      if (mode === "cancel") {
        await read.click();
        await expect
          .poll(() =>
            page.evaluate(() =>
              (window as any).__clip.events.some((e: any) => e.operation === "read"),
            ),
          )
          .toBe(true);
        await page.evaluate(() => window.dispatchEvent(new Event("blur")));
        await expect(
          view.getByRole("button", { name: "クリップボード共有を許可", exact: true }),
        ).toBeVisible();
        expect(await page.evaluate(() => (window as any).__clip.writes)).toBe(0);
        await view.getByRole("button", { name: "クリップボード共有を許可", exact: true }).click();
        await expect(read).toBeEnabled();
        await read.click();
        await expect.poll(() => page.evaluate(() => (window as any).__clip.writes)).toBe(1);
        expect(await page.evaluate(() => (window as any).__clip.text)).toBe("B generated table");
        return;
      }
      if (mode === "local-change") {
        await write.click();
        await expect(view.locator('[data-desktop-clipboard] [role="status"]')).toContainText(
          "現地のコピー変更",
        );
        await expect(canvas).toHaveAttribute("data-rendered-frames", /^[1-9]/);
        await expect(read).toBeEnabled();
        return;
      }
      await read.click();
      await expect.poll(() => page.evaluate(() => (window as any).__clip.writes)).toBe(1);
      expect(await page.evaluate(() => (window as any).__clip.html)).toContain(
        'style="color:green"',
      );
      const pixel = await page.evaluate(async () => {
        const bitmap = await createImageBitmap(
            new Blob([(window as any).__clip.png], { type: "image/png" }),
          ),
          canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
        bitmap.close();
        return Array.from(canvas.getContext("2d")!.getImageData(20, 20, 1, 1).data);
      });
      expect(pixel).toEqual([0, 255, 0, 255]);
      const html =
        '<table><tr><td style="color:red">' + "生成😀".repeat(12000) + "</td></tr></table>";
      await page.evaluate((value) => {
        (window as any).__clip.text = "A changed generated";
        (window as any).__clip.html = value;
      }, html);
      await write.click();
      await expect(view.locator('[data-desktop-clipboard] [role="status"]')).toContainText(
        "共有元へ送りました",
      );
      await page.evaluate(() => {
        (window as any).__clip.text = "temporary";
        (window as any).__clip.html = "temporary";
      });
      await read.click();
      await expect.poll(() => page.evaluate(() => (window as any).__clip.writes)).toBe(2);
      expect(await page.evaluate(() => (window as any).__clip.html)).toBe(html);
      expect(await page.evaluate(() => (window as any).__clip.text)).toBe("A changed generated");
      const events = await page.evaluate(
        () => (window as any).__clip.events as { operation: string; protocol: unknown }[],
      );
      expect(events.filter((e) => e.operation === "push").length).toBeGreaterThan(3);
      expect(events.every((e) => e.protocol === "soda-desktop-rich-clipboard-v1")).toBe(true);
    } finally {
      await provider.close();
    }
  });
