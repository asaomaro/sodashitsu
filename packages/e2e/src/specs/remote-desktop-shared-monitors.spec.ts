import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openNativeTab } from "../support/nativeTab.js";
// Synthetic mixed-DPI topology/capture/input only; no real monitor enumeration or input.
for (const mode of ["plain", "primary", "encrypted", "native", "topology", "old-helper"] as const)
  test(`shared selected monitor fresh window join ${mode}`, async ({
    page,
    context,
    appServer,
  }) => {
    test.setTimeout(90000);
    const dir = await mkdtemp(join(tmpdir(), "soda-shared-monitors-")),
      ledger = join(dir, "lifecycle"),
      marker = join(dir, "topology"),
      input = join(dir, "input");
    const env = {
      SODA_DESKTOP_COMMAND: JSON.stringify([
        process.execPath,
        fileURLToPath(
          new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
        ),
        "--static",
        "--allow-input",
        ...(mode === "old-helper" ? [] : ["--monitors"]),
        "--lifecycle-ledger",
        ledger,
        "--topology-marker",
        marker,
        "--input-ledger",
        input,
        ...(mode === "native"
          ? [
              "--monitors-wide",
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
      ]),
      SODA_DESKTOP_ALLOW_INPUT: "1",
      SODA_DESKTOP_ALLOW_MONITORS: "1",
      ...(mode === "native" ? { SODA_DESKTOP_ALLOW_MEDIA: "1" } : {}),
    };
    const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
    Object.assign(process.env, env);
    const provider = await startAppServer().finally(() => {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });
    let second: Awaited<ReturnType<typeof context.newPage>> | undefined;
    try {
      const owner = await provider.openClient(),
        operator = await appServer.openClient();
      await operator.request("prefs.set", { patch: { notifyHintDone: true } });
      const invite = await operator.request("machine.invite", {
        label: "Generated shared monitors B",
      });
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
        const fp = pairing.locator("[data-browser-fingerprint]");
        await expect(fp).toHaveText(/^[a-f0-9]{64}$/);
        await owner.request("desktop.endpoint.trust", {
          fingerprint: (await fp.textContent())!,
          role: "viewer",
          label: "Generated monitor browser",
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
      const label = "モニター選択を共有（全ての窓で同じ選択が必要）",
        toggle = first.getByLabel(label, { exact: true });
      await toggle.check();
      if (mode === "old-helper") {
        await expect(first.getByRole("alert")).toContainText(
          "補助プログラムがモニター共有に対応していません",
        );
        await toggle.uncheck();
        await expect(c1).toHaveAttribute("data-rendered-frames", /^[1-9]/);
        await expect(first.locator("[data-monitor-selector]")).toHaveCount(0);
        return;
      }
      await expect(first.getByLabel("表示モニター")).toHaveValue("right");
      if (mode !== "primary") await first.getByLabel("表示モニター").selectOption("left");
      await expect(first.getByLabel("表示モニター")).toHaveValue(
        mode === "primary" ? "right" : "left",
      );
      await expect(c1).toHaveAttribute("data-rendered-frames", /^[1-9]/);
      // Create the other browser only AFTER the secondary-monitor source is running.
      second = await context.newPage();
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
      await expect(view.getByLabel(label, { exact: true })).toBeVisible();
      await view.getByLabel(label, { exact: true }).check();
      if (mode !== "primary") {
        await expect(view.locator("[data-desktop-status]")).toHaveText(/停止|終了/);
        await view.getByLabel("参加するモニターID", { exact: true }).fill("left");
      } else {
        await expect(view.getByLabel("表示モニター")).toHaveValue("right");
        await expect(view.getByLabel("参加するモニターID", { exact: true })).toHaveValue("");
      }
      await view.getByRole("button", { name: "このモニターで接続", exact: true }).click();
      await expect(view.getByLabel("表示モニター")).toHaveValue(
        mode === "primary" ? "right" : "left",
      );
      if (mode === "primary") {
        await first.getByRole("button", { name: "再同期", exact: true }).click();
        await expect(first.getByLabel("表示モニター")).toHaveValue("right");
        await expect(first.getByLabel("共有画面")).toHaveAttribute(
          "data-rendered-frames",
          /^[1-9]/,
        );
      }

      await expect(c2).toHaveAttribute("data-rendered-frames", /^[1-9]/);
      for (const c of [c1, c2])
        await expect
          .poll(() =>
            c.evaluate((el, mode) => {
              const c = el as HTMLCanvasElement,
                p = c.getContext("2d")!.getImageData(20, 20, 1, 1).data;
              return mode === "primary"
                ? c.width === 800 && c.height === 600 && p[0]! > 200 && p[1]! < 30 && p[2]! < 30
                : c.width === 640 &&
                    c.height === (mode === "native" ? 360 : 480) &&
                    p[2]! > 200 &&
                    p[0]! < 30 &&
                    p[1]! < 30;
            }, mode),
          )
          .toBe(true);
      if (mode === "native")
        for (const v of [first, view]) {
          await v.locator("[data-desktop-media] summary").click();
          await v.getByRole("button", { name: "動画共有を依頼", exact: true }).click();
          await expect
            .poll(async () =>
              Number(await v.getByLabel("共有画面").getAttribute("data-video-frames")),
            )
            .toBeGreaterThan(4);
          await expect(v.getByLabel("表示モニター")).toHaveValue("left");
        }
      const spawns = (await readFile(ledger, "utf8"))
        .trim()
        .split("\n")
        .map((s) => JSON.parse(s))
        .filter((v) => v.type === "spawn");
      expect(spawns).toHaveLength(mode === "primary" ? 3 : 4); // single, legacy shared, shared primary, shared secondary. Joining never spawns.
      if (mode === "topology") {
        await writeFile(marker, "generated");
        for (const v of [first, view]) {
          await expect(v.getByRole("alert")).toContainText("モニター構成が変更");
          await expect(v.locator("[data-desktop-status]")).toHaveText(/停止|終了/);
        }
        return;
      }
      const before = Number(
        await c2.getAttribute(mode === "native" ? "data-video-frames" : "data-rendered-frames"),
      );
      await first.getByRole("button", { name: "共有停止", exact: true }).click();
      await expect(first).toHaveCount(0);
      await expect
        .poll(async () =>
          Number(
            await c2.getAttribute(mode === "native" ? "data-video-frames" : "data-rendered-frames"),
          ),
        )
        .toBeGreaterThan(before);
      await second.bringToFront();
      await view.getByRole("button", { name: "操作する", exact: true }).click();
      await expect(view.locator("[data-desktop-status]")).toHaveText("操作中");
      await c2.focus();
      await second.keyboard.press("Control+Space");
      await expect
        .poll(async () => {
          try {
            return (await readFile(input, "utf8"))
              .trim()
              .split("\n")
              .map((s) => JSON.parse(s))
              .some(
                (v) =>
                  v.type === "key-down" &&
                  v.held.includes("Space") &&
                  v.held.some((k: string) => k === "ControlLeft" || k === "ControlRight"),
              );
          } catch {
            return false;
          }
        })
        .toBe(true);
      if (identity) await expect(view.locator("[data-endpoint-encrypted]")).toBeVisible();
    } catch (error) {
      console.log(
        "Generated monitor failure DOM",
        mode,
        await page.locator("[data-remote-desktop]").allTextContents(),
        second ? await second.locator("[data-remote-desktop]").allTextContents() : [],
      );
      throw error;
    } finally {
      await second?.close().catch(() => {});
      await page.goto("about:blank").catch(() => {});
      await provider.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
