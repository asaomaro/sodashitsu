import { once } from "node:events";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { WebSocket } from "ws";
import { test, expect } from "../support/fixtures.js";
import { enableScript } from "../support/displayScript.js";
import type { AppServer } from "../support/appServer.js";

async function installDesktopPlugin(appServer: AppServer) {
  const bundle = join(appServer.stateDir, "vscode-desktop.sodaplugin");
  for (const args of [
    ["plugin", "pack", resolve("../../plugins/vscode-desktop"), "--out", bundle],
    ["plugin", "install", bundle, "--state-dir", appServer.stateDir],
    ["plugin", "enable", "vscode-desktop", "--state-dir", appServer.stateDir],
  ]) {
    const r = spawnSync(process.execPath, [resolve("../cli/dist/main.js"), ...args], { encoding: "utf8", timeout: 15000 });
    expect(r.status, r.stderr + r.stdout).toBe(0);
  }
  await appServer.restart();
}

// This is real Chromium CDP via Playwright's existing pipe. No TCP debugging endpoint,
// no installed VSCode and no user's desktop session are opened or changed.
const { CdpCapture } = await import(
  pathToFileURL(resolve(import.meta.dirname, "../../../../plugins/vscode-desktop/cdp-client.mjs"))
    .href
);

test("real CDP pixels and input through the app view, explicit permissions and stop", async ({
  page,
  context,
  appServer,
}) => {
  // This flow includes multiple fullscreen/fit transitions as well as pixels,
  // IME, pointer capture and wheel; keep per-assertion timeouts unchanged.
  test.setTimeout(60000);
  await enableScript(appServer);
  await installDesktopPlugin(appServer);
  const client = await appServer.openClient();
  const tab = await client.request("tab.create", {
    workspaceId: client.helloSnapshot()!.workspaces[0]!.id, label: "VSCode Desktop",
    plugin: { extensionKey: "user:vscode-desktop", display: "vscode-desktop" },
  });
  await client.request("tab.focus", { tabId: tab.tab.id });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  const view = page.locator("[data-plugin-view] [data-desktop-cdp]");
  await expect(view).toBeVisible();
  await view.getByRole("button", { name: "共有元を接続", exact: true }).click();
  const command = view.getByRole("textbox", { name: "Windows側の接続コマンド" });
  await expect(command).toBeVisible();
  const token = /--token ([a-f0-9]{64})/.exec(await command.inputValue())![1]!;
  const source = await context.newPage();
  await source.setViewportSize({ width: 800, height: 600 });
  await source.setContent(
    `<style>body{margin:0;background:rgb(22,88,144)}input{position:absolute;left:50px;top:50px;width:300px;height:40px}</style><input id="editor" value="existing" aria-label="Source editor"><script>document.addEventListener("mouseup",()=>document.body.dataset.releases=String(Number(document.body.dataset.releases||0)+1));document.addEventListener("dblclick",()=>document.body.dataset.doubleclick="yes");</script>`,
  );
  const session = await context.newCDPSession(source);
  let sourceFrames = 0;
  const listeners = new Set<(method: string, params: unknown) => void>();
  for (const method of ["Page.screencastFrame", "Page.frameNavigated", "Inspector.detached"])
    session.on(method as never, (p: unknown) => {
      if (method === "Page.screencastFrame") ++sourceFrames;
      for (const l of listeners) l(method, p);
    });
  const cdp = {
    send: (method: string, params: object) => session.send(method as never, params as never),
    onEvent: (l: (method: string, params: unknown) => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
  const bridge = new WebSocket(
    appServer.origin.replace(/^http/, "ws") + "/desktop-cdp?role=bridge",
  );
  const capture = new CdpCapture(cdp, { frame: (f: unknown) => bridge.send(JSON.stringify(f)) });
  let holdAck = false, heldAck = 0;
  bridge.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.type === "paired") void capture.start();
    if (m.type === "ack") { if (holdAck) heldAck = m.seq; else capture.ack(m.seq); }
    if (m.type === "control") void capture.setControl(m.enabled);
    if (m.type === "input") void capture.input(m.input);
    if (m.type === "viewport") void capture.setViewport(m.size);
  });
  bridge.on("close", () => {
    void capture.stop();
  });
  try {
    await once(bridge, "open");
    bridge.send(
      JSON.stringify({
        type: "hello",
        token,
        title: "CDP test existing renderer",
        allowInput: true,
        allowFit: true,
      }),
    );
    await page.bringToFront();
    const canvas = view.locator("canvas");
    await expect(canvas).toHaveAttribute("data-frame", /[1-9]/);
    // Assert actual browser canvas pixels, not the test's server/WebSocket observations.
    await expect
      .poll(() =>
        canvas.evaluate((el) => {
          const c = el as HTMLCanvasElement;
          const pixel = c.getContext("2d")!.getImageData(c.width - 10, c.height - 10, 1, 1).data;
          return Math.max(...[22, 88, 144].map((v, i) => Math.abs(v - pixel[i]!)));
        }),
      )
      .toBeLessThanOrEqual(3); // JPEG permits a small channel error; blank/wrong images fail.
    // Fullscreen is a local viewer action and must not grant remote input.
    const fullscreenButton = view.getByRole("button", { name: "全画面", exact: true });
    const exitFullscreenButton = view.getByRole("button", { name: "全画面を解除", exact: true });
    const ownsFullscreen = () => view.evaluate(el => document.fullscreenElement === el);
    await fullscreenButton.click();
    await expect.poll(ownsFullscreen).toBe(true);
    await expect(view.getByRole("status")).toHaveText("閲覧中");
    await expect(view.getByRole("checkbox", { name: "共有元を登録する", exact: false })).not.toBeVisible();
    await expect(view.getByRole("button", { name: "共有を停止", exact: true })).toBeVisible();
    await expect.poll(() => view.evaluate(el => {
      const r = el.getBoundingClientRect();
      return { x:r.x, y:r.y, width:r.width, height:r.height };
    })).toEqual(await page.evaluate(() => ({ x:0, y:0, width:innerWidth, height:innerHeight })));
    await exitFullscreenButton.click();
    await expect.poll(ownsFullscreen).toBe(false);
    await expect(view.getByRole("status")).toHaveText("閲覧中");
    // Hold the viewer ACK, produce a final repaint, then stop repainting.
    // The receiver must eventually show that final image, without another source event.
    const colorError = (expected: number[]) => canvas.evaluate((el, expected) => {
      const c=el as HTMLCanvasElement,p=c.getContext('2d')!.getImageData(c.width-10,c.height-10,1,1).data;
      return Math.max(...expected.map((v,i)=>Math.abs(v-p[i]!)));
    }, expected);
    holdAck = true;
    await source.evaluate(() => document.body.style.background='rgb(30,140,70)');
    await expect.poll(()=>colorError([30,140,70])).toBeLessThanOrEqual(3);
    const beforeRepaint=sourceFrames;
    await source.evaluate(() => document.body.style.background='rgb(22,88,144)');
    await expect.poll(()=>sourceFrames).toBeGreaterThan(beforeRepaint);
    await expect.poll(()=>heldAck).toBeGreaterThan(0);
    holdAck = false; capture.ack(heldAck);
    await expect.poll(()=>colorError([22,88,144])).toBeLessThanOrEqual(3);
    await expect(view.getByRole("status")).toHaveText("閲覧中");
    // Returning from PowerShell or a parent control leaves native buttons
    // disabled until a real pointer action re-enters the direct app surface.
    await page.evaluate(() => {
      const b = document.createElement("button");
      b.id = "outside-cdp"; b.textContent = "Outside";
      b.style.cssText = "position:fixed;right:0;top:0;z-index:99999";
      document.body.append(b);
    });
    await page.locator("#outside-cdp").click();
    await expect(view.getByRole("button", { name: "操作する", exact: true })).toBeDisabled();
    await view.locator("header strong").click();
    await expect(view.getByRole("button", { name: "操作する", exact: true })).toBeEnabled();
    await page.locator("#outside-cdp").evaluate(el => el.remove());
    await view.getByRole("button", { name: "操作する", exact: true }).click();
    await expect(view.getByRole("status")).toHaveText("操作中");
    const r = (await canvas.boundingBox())!;
    await page.mouse.click(r.x + (r.width * 100) / 800, r.y + (r.height * 70) / 600);
    await page.keyboard.press("End");
    const input = view.getByRole("textbox", { name: "日本語・文字列入力" });
    await input.fill("日本語");
    await view.getByRole("button", { name: "文字を送る" }).click();
    await expect(source.getByRole("textbox", { name: "Source editor" })).toHaveValue(
      "existing日本語",
    );
    const r2 = (await canvas.boundingBox())!;
    await page.mouse.click(r2.x + (r2.width * 100) / 800, r2.y + (r2.height * 70) / 600);
    await page.keyboard.press("End");
    await page.keyboard.type("A");
    await expect(source.getByRole("textbox", { name: "Source editor" })).toHaveValue(
      "existing日本語A",
    );
    const twice=(await canvas.boundingBox())!;
    const visibleScreen=(await view.locator("[data-desktop-screen]").boundingBox())!;
    // At 1:1 the canvas can extend beyond the scroll viewport; click only
    // the visible intersection, rather than assuming the whole image fits.
    await page.mouse.dblclick(twice.x+Math.min(twice.width,visibleScreen.width)*0.8,twice.y+Math.min(twice.height,visibleScreen.height)*0.8);
    await expect(source.locator("body")).toHaveAttribute("data-doubleclick","yes");
    // Captured pointerup outside the image must still release the remote mouse button.
    const releases = Number(await source.locator("body").getAttribute("data-releases"));
    const drag = (await canvas.boundingBox())!;
    const dragX = drag.x + Math.min(drag.width, visibleScreen.width) / 2;
    const dragY = drag.y + Math.min(drag.height, visibleScreen.height) / 2;
    await page.mouse.move(dragX, dragY);
    await page.mouse.down();
    await page.mouse.move(dragX, drag.y - 12);
    await page.mouse.up();
    await expect
      .poll(async () => Number(await source.locator("body").getAttribute("data-releases")))
      .toBe(releases + 1);
    // Simulate a local renderer resize on a HiDPI display. This does not resize
    // a real Windows window: it verifies the image and CSS input coordinate path.
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: 1000, height: 700, deviceScaleFactor: 2, mobile: false,
    });
    await expect.poll(() => source.evaluate(() => window.devicePixelRatio)).toBe(2);
    // Screencast JPEGs may use CSS-sized pixels even when devicePixelRatio is 2.
    await expect.poll(() => canvas.evaluate(el => {
      const c = el as HTMLCanvasElement;
      return c.width > 800 && c.height > 600 && c.width <= 1920 && c.height <= 1200;
    })).toBe(true);
    await expect.poll(() => canvas.evaluate(el => {
      const c = el as HTMLCanvasElement;
      return Math.abs(c.width / c.height - 1000 / 700);
    })).toBeLessThan(0.005);
    await expect.poll(() => colorError([22, 88, 144])).toBeLessThanOrEqual(3);
    // Render source CSS coordinates 1:1 regardless of JPEG pixels / DPR.
    await expect.poll(async () => {
      const b = (await canvas.boundingBox())!;
      return { width: b.width, height: b.height };
    }).toEqual({ width: 1000, height: 700 });
    // A small viewer must scroll rather than scaling the existing renderer.
    await page.setViewportSize({ width: 1050, height: 650 });
    await expect.poll(async () => {
      const b = (await canvas.boundingBox())!;
      return { width: b.width, height: b.height };
    }).toEqual({ width: 1000, height: 700 });
    await expect.poll(() => view.locator("[data-desktop-screen]").evaluate(el =>
      el.scrollWidth > el.clientWidth && el.scrollHeight > el.clientHeight,
    )).toBe(true);
    await page.setViewportSize({ width: 1280, height: 900 });
    const resized = (await canvas.boundingBox())!;
    await page.mouse.click(resized.x + resized.width * 100 / 1000, resized.y + resized.height * 70 / 700);
    await page.keyboard.press("End");
    await page.keyboard.type("R");
    await expect(source.getByRole("textbox", { name: "Source editor" })).toHaveValue("existing日本語AR");
    // Playwright's source viewport is itself an emulation override. Fit owns
    // its override and clears it; record the actual un-emulated baseline.
    await session.send("Emulation.clearDeviceMetricsOverride");
    const restoredSize = await source.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    const fit = view.getByRole("checkbox", { name: "表示領域に合わせる" });
    await fit.check();
    const screen = view.locator("[data-desktop-screen]");
    const size = () => screen.evaluate(el => ({ width: el.clientWidth, height: el.clientHeight }));
    const sourceSize = () => source.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    await expect.poll(async () => ({ source: await sourceSize(), view: await size() }))
      .toEqual({ source: await size(), view: await size() });
    await expect.poll(() => canvas.evaluate(el => {
      const c = el as HTMLCanvasElement;
      const screen = c.parentElement!;
      return Math.abs(c.width / c.height - screen.clientWidth / screen.clientHeight);
    })).toBeLessThan(0.005);
    await expect.poll(() => colorError([22, 88, 144])).toBeLessThanOrEqual(3);
    // Resize the viewing browser and observe an actual new source layout, not
    // just a scaled version of the previous image.
    const previousSize = await sourceSize();
    await page.setViewportSize({ width: 1050, height: 850 });
    // The app view fills the browser's available area.
    await expect.poll(size).not.toEqual(previousSize);
    await expect.poll(async () => ({ source: await sourceSize(), view: await size() }))
      .toEqual({ source: await size(), view: await size() });
    await expect.poll(() => canvas.evaluate(el => {
      const c = el as HTMLCanvasElement, screen = c.parentElement!;
      return Math.abs(c.width / c.height - screen.clientWidth / screen.clientHeight);
    })).toBeLessThan(0.005);
    const fitting = await size(), fitImage = (await canvas.boundingBox())!;
    await page.mouse.click(fitImage.x + fitImage.width * 100 / fitting.width, fitImage.y + fitImage.height * 70 / fitting.height);
    await page.keyboard.press("End");
    await page.keyboard.type("F");
    await expect(source.getByRole("textbox", { name: "Source editor" })).toHaveValue("existing日本語ARF");
    // Fullscreen moves the parent-owned native surface above clipped plugin
    // bounds. Its real CSS box and the existing renderer must both resize.
    const embeddedSize = await size();
    const fullscreenNetwork = await context.newCDPSession(page);
    const escapedInputs: unknown[] = [];
    await fullscreenNetwork.send("Network.enable");
    fullscreenNetwork.on("Network.webSocketFrameSent", event => {
      try {
        const m = JSON.parse(event.response.payloadData);
        if (m.type === "input" && m.input?.kind === "key" && m.input.key === "Escape") escapedInputs.push(m.input);
      } catch { /* Observe only the browser's outgoing desktop input. */ }
    });
    await source.evaluate(() => {
      for (const type of ["keydown", "keyup"])
        document.addEventListener(type, event => {
          if ((event as KeyboardEvent).key === "Escape") document.body.dataset.remoteEscape = "yes";
        });
    });
    await fullscreenButton.click();
    await expect.poll(ownsFullscreen).toBe(true);
    await expect.poll(async () => ({ source:await sourceSize(), view:await size() }))
      .toEqual({ source:await size(), view:await size() });
    expect((await size()).width).toBeGreaterThan(embeddedSize.width);
    await expect.poll(() => colorError([22,88,144])).toBeLessThanOrEqual(3);
    const fullImage = (await canvas.boundingBox())!;
    await page.mouse.click(fullImage.x + 100, fullImage.y + 70);
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowLeft");
    await expect.poll(() => source.getByRole("textbox", { name:"Source editor" }).evaluate(el =>
      (el as HTMLInputElement).selectionStart,
    )).toBe("existing日本語ARF".length - 1);
    await page.screenshot({path:"/tmp/vscode-cdp-fullscreen.png"});
    await page.keyboard.down("Escape");
    await expect.poll(ownsFullscreen).toBe(false);
    await page.keyboard.down("Escape"); // Hold-repeat after fullscreenchange must remain local.
    await page.keyboard.up("Escape");
    await expect.poll(sourceSize).toEqual(embeddedSize);
    await expect.poll(() => capture.inputBlocked).toBe(false);
    await page.keyboard.press("ArrowRight");
    // The following remote action is also a barrier for preceding Escape input.
    await expect.poll(() => source.getByRole("textbox", { name:"Source editor" }).evaluate(el =>
      (el as HTMLInputElement).selectionStart,
    )).toBe("existing日本語ARF".length);
    await expect(source.locator("body")).not.toHaveAttribute("data-remote-escape", "yes");
    expect(escapedInputs).toHaveLength(0);
    await expect.poll(sourceSize).toEqual(embeddedSize);
    await expect(view.getByRole("status")).toHaveText("操作中");
    // API rejection leaves the share/input permission intact and gives a way
    // to retry; do not pretend fullscreen succeeded when the browser denied it.
    await view.evaluate(el => Object.defineProperty(el, "requestFullscreen", { configurable:true,
      value:() => Promise.reject(new DOMException("denied", "NotAllowedError")) }));
    await fullscreenButton.click();
    await expect(view.getByRole("alert")).toContainText("全画面表示に切り替えられませんでした");
    await expect.poll(ownsFullscreen).toBe(false);
    await expect(view.getByRole("status")).toHaveText("操作中");
    await view.evaluate(el => Reflect.deleteProperty(el, "requestFullscreen"));
    await fullscreenButton.click();
    await expect.poll(ownsFullscreen).toBe(true);
    await exitFullscreenButton.click();
    await expect.poll(ownsFullscreen).toBe(false);
    await expect.poll(sourceSize).toEqual(embeddedSize);
    // UA-driven exit can suppress keydown while a later keyup reaches the page.
    await page.keyboard.up("Escape");
    await expect.poll(() => capture.inputBlocked).toBe(false);
    const normalImage = (await canvas.boundingBox())!;
    await page.mouse.click(normalImage.x + 100, normalImage.y + 70);
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => source.getByRole("textbox", { name:"Source editor" }).evaluate(el =>
      (el as HTMLInputElement).selectionStart,
    )).toBe("existing日本語ARF".length);
    expect(escapedInputs).toHaveLength(0);
    await page.keyboard.press("Escape"); // A fresh ordinary Escape must still reach VSCode.
    await expect(source.locator("body")).toHaveAttribute("data-remote-escape", "yes");
    await expect.poll(() => escapedInputs.length).toBe(2);
    await fullscreenNetwork.detach();
    // A real wheel scroll must reach the existing source renderer. Then burst
    // DOM wheel events exercise browser-side aggregation without a server-only
    // fake input client standing in for the viewer.
    await source.evaluate(() => {
      const scroll = document.createElement("div"); scroll.id = "scroll-test";
      scroll.style.cssText = "position:absolute;left:200px;top:130px;width:250px;height:160px;overflow:auto;background:#fff";
      scroll.innerHTML = '<div style="height:6000px;background:linear-gradient(red,blue)"></div>';
      document.body.append(scroll);
    });
    const wheelCanvas = (await canvas.boundingBox())!;
    await page.mouse.move(wheelCanvas.x + 300, wheelCanvas.y + 190);
    await page.mouse.wheel(0, 80);
    const scrollTop = () => source.locator("#scroll-test").evaluate(el => el.scrollTop);
    await expect.poll(scrollTop).toBeGreaterThan(0);
    const beforeScroll = await scrollTop();
    const viewerSession = await context.newCDPSession(page);
    const wheelMessages: { deltaY: number }[] = [];
    await viewerSession.send("Network.enable");
    viewerSession.on("Network.webSocketFrameSent", event => {
      try {
        const m = JSON.parse(event.response.payloadData);
        if (m.type === "input" && m.input?.event === "mouseWheel") wheelMessages.push(m.input);
      } catch { /* Other protocol traffic is outside this observation. */ }
    });
    try {
      await canvas.evaluate(el => {
        const r = el.getBoundingClientRect();
        for (let i = 0; i < 200; ++i)
          el.dispatchEvent(new WheelEvent("wheel", { deltaY: 1, deltaMode: 1,
            clientX: r.x + 300, clientY: r.y + 190, bubbles: true, cancelable: true }));
      });
      await expect.poll(() => wheelMessages.reduce((sum, m) => sum + m.deltaY, 0)).toBe(3200);
      expect(wheelMessages.length).toBeLessThanOrEqual(2);
      await expect.poll(scrollTop).toBeGreaterThan(beforeScroll + 2000);
      await expect(view.getByRole("status")).toHaveText("操作中");
    } finally { await viewerSession.detach(); }
    await fit.uncheck();
    await expect.poll(sourceSize).toEqual(restoredSize);
    await fit.check();
    await expect.poll(async () => ({ source: await sourceSize(), view: await size() }))
      .toEqual({ source: await size(), view: await size() });
    await view.getByRole("button", { name: "閲覧に戻る", exact: true }).click();
    await expect.poll(sourceSize).toEqual(restoredSize);
    await expect(fit).toHaveCount(0);
    await view.getByRole("button", { name: "操作する", exact: true }).click();
    await fit.check();
    await expect.poll(async () => ({ source: await sourceSize(), view: await size() }))
      .toEqual({ source: await size(), view: await size() });
    await expect.poll(() => canvas.evaluate(el => {
      const c = el as HTMLCanvasElement, screen = c.parentElement!;
      return Math.abs(c.width / c.height - screen.clientWidth / screen.clientHeight);
    })).toBeLessThan(0.005);
    const resizedWidth = await canvas.evaluate(el => (el as HTMLCanvasElement).width);
    await page.screenshot({ path: "/tmp/vscode-cdp-app.png" });
    await fullscreenButton.click();
    await expect.poll(ownsFullscreen).toBe(true);
    const ended = once(bridge, "close");
    await view.getByRole("button", { name: "共有を停止", exact: true }).click();
    await expect.poll(ownsFullscreen).toBe(false);
    await ended;
    await expect.poll(sourceSize).toEqual(restoredSize);
    await expect(view.getByRole("status")).toHaveText("共有元が接続されていません");
    await expect(input).toHaveCount(0);
    await expect(canvas).toHaveJSProperty("width", resizedWidth);
    const alpha = await canvas.evaluate(
      (el) => (el as HTMLCanvasElement).getContext("2d")!.getImageData(10, 10, 1, 1).data[3],
    );
    expect(alpha).toBe(0);
    await expect(source.getByRole("textbox", { name: "Source editor" })).toHaveValue(
      "existing日本語ARF",
    );
  } finally {
    await capture.stop();
    bridge.terminate();
    await session.detach().catch(() => {});
    await source.close();
    client.close();
  }
});

test("packaged app on mobile keeps its pairing capability outside the plugin iframe", async ({
  page,
  appServer,
}) => {
  await enableScript(appServer);
  await installDesktopPlugin(appServer);
  const client = await appServer.openClient();
  await expect
    .poll(
      async () =>
        (await client.request("extension.list", {})).extensions.find(
          (e) => e.id === "vscode-desktop",
        )?.state,
    )
    .toBe("running");
  const tab = await client.request("tab.create", {
    workspaceId: client.helloSnapshot()!.workspaces[0]!.id,
    label: "VSCode Desktop",
    plugin: { extensionKey: "user:vscode-desktop", display: "vscode-desktop" },
  });
  await client.request("tab.focus", { tabId: tab.tab.id });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  const view = page.locator("[data-plugin-view] [data-desktop-cdp]");
  await expect(view).toBeVisible();
  await view.getByRole("button", { name: "共有元を接続", exact: true }).click();
  await expect(view.getByRole("textbox", { name: "Windows側の接続コマンド" })).toHaveValue(
    /--token [a-f0-9]{64}/,
  );
  const frame = page.frameLocator("[data-plugin-view] iframe[data-display-script]");
  expect(await frame.locator("body").textContent()).not.toContain("--token");
  expect(
    await frame.locator("body").evaluate(() => {
      try {
        void parent.document;
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  const bounds = (await view.boundingBox())!;
  expect(bounds.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "/tmp/vscode-cdp-mobile.png" });
  client.close();
});
