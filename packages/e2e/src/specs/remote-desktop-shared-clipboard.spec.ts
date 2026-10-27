import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openNativeTab } from "../support/nativeTab.js";
// Generated screenshot and cursor only; no OS capture or input.
for (const mode of ["plain", "encrypted"] as const)
  test(`shared clipboard ownership and isolated rich/text traffic ${mode}`, async ({
    page,
    context,
    appServer,
  }) => {
    test.setTimeout(90000);
    const dir = await mkdtemp(join(tmpdir(), "soda-shared-clipboard-")),
      ledger = join(dir, "lifecycle");
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
        "--rich-delay-read",
        "--lifecycle-ledger",
        ledger,
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
    await context.addInitScript(() => {
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
    const second = await context.newPage();
    try {
      const owner = await provider.openClient(),
        operator = await appServer.openClient();
      await operator.request("prefs.set", { patch: { notifyHintDone: true } });
      const invite = await operator.request("machine.invite", { label: "Shared clipboard B" });
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
          label: "Generated shared clipboard browser",
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
      await first
        .getByLabel("クリップボード経路を共有（全ての窓で同じ選択が必要）", { exact: true })
        .check();
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
      await view
        .getByLabel("クリップボード経路を共有（全ての窓で同じ選択が必要）", { exact: true })
        .check();
      await expect(c2).toHaveAttribute("data-rendered-frames", /^[1-9]/);
      const panel1 = first.locator("[data-desktop-clipboard]"),
        panel2 = view.locator("[data-desktop-clipboard]");
      for (const p of [panel1, panel2]) await p.locator("summary").click();
      await panel1.getByRole("button", { name: "クリップボード共有を許可", exact: true }).click();
      await expect(
        panel1.getByRole("button", { name: "クリップボード共有を解除", exact: true }),
      ).toBeVisible();
      await panel2.getByRole("button", { name: "クリップボード共有を許可", exact: true }).click();
      await expect(panel2.getByRole("status")).toContainText("他の窓がクリップボードを共有中");
      await expect(panel2.getByLabel("共有するクリップボードのテキスト")).toBeDisabled();
      await panel1.getByLabel("共有するクリップボードのテキスト").fill("first generated clipboard");
      await panel1.getByRole("button", { name: "共有元へ送信", exact: true }).click();
      await expect(panel1.getByRole("status")).toContainText("送りました");
      const rich1 = first.locator("[data-rich-clipboard]"),
        rich2 = view.locator("[data-rich-clipboard]");
      await rich1.getByRole("button", { name: "画像・書式を手元へコピー", exact: true }).click();
      await panel1.getByRole("button", { name: "画像・書式の転送を取り消す", exact: true }).click();
      expect(await page.evaluate(() => (window as any).__clip.writes)).toBe(0);
      await rich1.getByRole("button", { name: "画像・書式を共有元へ送信", exact: true }).click();
      await expect(panel1.getByRole("status")).toContainText("送りました");
      await expect(
        rich1.getByRole("button", { name: "画像・書式を手元へコピー", exact: true }),
      ).toBeEnabled();
      await panel1.getByRole("button", { name: "クリップボード共有を解除", exact: true }).click();
      await panel2.getByRole("button", { name: "クリップボード共有を許可", exact: true }).click();
      await expect(
        panel2.getByRole("button", { name: "クリップボード共有を解除", exact: true }),
      ).toBeVisible();
      await panel2.getByRole("button", { name: "共有元から取得", exact: true }).click();
      await expect(panel2.getByLabel("共有するクリップボードのテキスト")).toHaveValue(
        "first generated clipboard",
      );
      await rich2.getByRole("button", { name: "画像・書式を手元へコピー", exact: true }).click();
      await expect.poll(() => second.evaluate(() => (window as any).__clip.writes)).toBe(1);
      expect(await second.evaluate(() => (window as any).__clip.html)).toContain(
        "A generated table",
      );
      // A completed read must release its source route so a second read succeeds.
      await rich2.getByRole("button", { name: "画像・書式を手元へコピー", exact: true }).click();
      await expect.poll(() => second.evaluate(() => (window as any).__clip.writes)).toBe(2);
      await first.getByRole("button", { name: "共有停止", exact: true }).click();
      await expect(first).toHaveCount(0);
      await panel2.getByRole("button", { name: "共有元から取得", exact: true }).click();
      await expect(panel2.getByRole("status")).toContainText("取得しました");
      if (identity) await expect(view.locator("[data-endpoint-encrypted]")).toBeVisible();
      const lifecycle = (await readFile(ledger, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(lifecycle.filter((m) => m.type === "spawn")).toHaveLength(3); // single, default shared, then clipboard shared
      await view.getByRole("button", { name: "共有停止", exact: true }).click();
    } finally {
      await second.close().catch(() => {});
      await page.goto("about:blank").catch(() => {});
      await provider.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

test("old clipboard helper reports unsupported sharing and can return to the default cohort", async ({
  page,
  appServer,
}) => {
  test.setTimeout(60000);
  const savedClipboard = process.env.SODA_DESKTOP_ALLOW_CLIPBOARD;
  process.env.SODA_DESKTOP_ALLOW_CLIPBOARD = "1";
  const saved = process.env.SODA_DESKTOP_COMMAND;
  process.env.SODA_DESKTOP_COMMAND = JSON.stringify([
    process.execPath,
    fileURLToPath(
      new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
    ),
    "--static",
  ]);
  const provider = await startAppServer().finally(() => {
    if (savedClipboard === undefined) delete process.env.SODA_DESKTOP_ALLOW_CLIPBOARD;
    else process.env.SODA_DESKTOP_ALLOW_CLIPBOARD = savedClipboard;
    if (saved === undefined) delete process.env.SODA_DESKTOP_COMMAND;
    else process.env.SODA_DESKTOP_COMMAND = saved;
  });
  try {
    const owner = await provider.openClient(),
      a = await appServer.openClient();
    const invite = await a.request("machine.invite", { label: "Old generated clipboard helper" });
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
      base = view.getByLabel("共有画面"),
      status = view.locator("[data-desktop-status]");
    await expect(base).toHaveAttribute("data-rendered-frames", /^[1-9]/);
    await view.getByLabel("複数viewerで同じ画面を共有", { exact: true }).check();
    await expect(base).toHaveAttribute("data-rendered-frames", /^[1-9]/);
    const toggle = view.getByLabel("クリップボード経路を共有（全ての窓で同じ選択が必要）", {
      exact: true,
    });
    await toggle.check();
    await expect(view.getByRole("alert")).toContainText(
      "補助プログラムがクリップボード共有に対応していません",
    );
    await toggle.uncheck();
    await expect(base).toHaveAttribute("data-rendered-frames", /^[1-9]/);
    await expect(status).toHaveText("閲覧中");
    await expect(view.locator("[data-desktop-clipboard]")).toHaveCount(0);
  } finally {
    await page.goto("about:blank").catch(() => {});
    await provider.close();
  }
});
