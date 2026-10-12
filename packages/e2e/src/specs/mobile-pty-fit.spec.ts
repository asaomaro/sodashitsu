import { devices, type Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { watchClientView } from "../support/panes.js";
import { focusTerminal, typeLine } from "../support/keys.js";

async function noOverflow(page: Page) {
  const size = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(size.scroll).toBeLessThanOrEqual(size.width);
  const area = await page.locator(".mobile-shell-pane").boundingBox();
  const terminal = await page.locator(".mobile-shell-pane-scale").boundingBox();
  expect(area).not.toBeNull();
  expect(terminal).not.toBeNull();
  expect(terminal!.width).toBeLessThanOrEqual(area!.width + 1);
  expect(terminal!.height).toBeLessThanOrEqual(area!.height + 1);
}
async function terminalText(page: Page, id: string) {
  return page.evaluate((paneId) => {
    const app = (
      document.querySelector("#app") as unknown as {
        __vue_app__: { _context: { provides: Record<symbol, unknown> } };
      }
    ).__vue_app__;
    const provides = app._context.provides;
    const key = Object.getOwnPropertySymbols(provides).find(
      (k) => k.description === "terminalRegistry",
    )!;
    const registry = provides[key] as {
      get(id: string):
        | {
            term: {
              buffer: {
                active: {
                  length: number;
                  getLine(i: number): { translateToString(trim: boolean): string } | undefined;
                };
              };
            };
          }
        | undefined;
    };
    const buffer = registry.get(paneId)?.term.buffer.active;
    return buffer
      ? Array.from(
          { length: buffer.length },
          (_, i) => buffer.getLine(i)?.translateToString(true) ?? "",
        ).join("\n")
      : "";
  }, id);
}

// GPU のない検証環境では WebGL の文字がスクリーンショットに出ないため、
// このレイアウト・描画検証は DOM renderer を使う。通常の WebGL 経路は mobile.spec.ts でも検証する。
test.use({ defaultBrowserType: "chromium", launchOptions: { args: ["--disable-webgl"] } });
test.describe("mobile PTY", () => {
  const { defaultBrowserType: _browser, ...mobile } = devices["iPhone 13"]!;
  test.use(mobile);
  test("touch mobile fits its actual PTY by default, rotates and keeps header controls within the viewport", async ({
    page,
    appServer,
  }) => {
    const client = await appServer.openClient("mobile");
    const pane = client.helloSnapshot()!.panes[0]!;
    await client.request("display.set", {
      paneId: pane.id,
      name: "test-panel",
      kind: "panel",
      format: "text",
      content: "モバイル検証",
    });
    const view = await watchClientView(page);
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    await expect(page.locator(".mobile-shell-fit-btn")).toHaveAttribute("aria-pressed", "true");
    const settled = () => {
      const shown = view()?.visible.find((p) => p.paneId === pane.id),
        actual = client.paneSize(pane.id);
      return (
        shown &&
        actual &&
        shown.cols === actual.cols &&
        shown.rows === actual.rows &&
        actual.cols > 1
      );
    };
    await expect.poll(settled).toBe(true);
    expect(client.paneSize(pane.id)!.cols).toBeLessThan(64);
    await noOverflow(page);
    const portraitCols = client.paneSize(pane.id)!.cols;
    await page.setViewportSize({ width: 320, height: 640 });
    await expect.poll(settled).toBe(true);
    await expect.poll(() => client.paneSize(pane.id)!.cols).toBeLessThan(portraitCols);
    await noOverflow(page);
    await focusTerminal(page);
    await typeLine(page, "printf 'PTY_GRID='; stty size");
    await expect.poll(() => terminalText(page, pane.id)).toMatch(/PTY_GRID=\d+ \d+/);
    await expect(page.locator(".xterm-rows")).toContainText("PTY_GRID=");
    const actual = client.paneSize(pane.id)!;
    expect(await terminalText(page, pane.id)).toContain(`PTY_GRID=${actual.rows} ${actual.cols}`);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.screenshot({ path: "/tmp/sodashitsu-mobile-320.png" });
    await page.setViewportSize({ width: 750, height: 342 });
    await expect.poll(() => client.paneSize(pane.id)!.cols).toBeGreaterThan(actual.cols);
    await expect.poll(settled).toBe(true);
    await noOverflow(page);
    const beforeKeys = client.paneSize(pane.id)!;
    await page.locator(".mobile-shell-keyboard-btn").click();
    await expect(page.locator(".extra-keys")).toBeVisible();
    await expect.poll(() => client.paneSize(pane.id)!.rows).toBeLessThan(beforeKeys.rows);
    await expect.poll(settled).toBe(true);
    await noOverflow(page);
    await focusTerminal(page);
    await typeLine(page, "printf 'LANDSCAPE_GRID='; stty size");
    const landscape = client.paneSize(pane.id)!;
    await expect
      .poll(() => terminalText(page, pane.id))
      .toContain(`LANDSCAPE_GRID=${landscape.rows} ${landscape.cols}`);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.screenshot({ path: "/tmp/sodashitsu-mobile-landscape.png" });
  });
  test("a mobile viewer remains within its viewport when another client takes the PTY size", async ({
    page,
    appServer,
  }) => {
    const desktop = await appServer.openClient("desktop");
    const pane = desktop.helloSnapshot()!.panes[0]!;
    const tab = desktop.helloSnapshot()!.tabs.find((t) => t.id === pane.tabId)!;
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    await expect(page.locator(".mobile-shell-fit-btn")).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => desktop.paneSize(pane.id)!.cols).toBeLessThan(64);
    await desktop.request("client.view", {
      workspaceId: tab.workspaceId,
      tabId: tab.id,
      visible: [{ paneId: pane.id, cols: 120, rows: 60 }],
    });
    await desktop.request("client.fit", { enabled: true });
    await expect.poll(() => desktop.paneSize(pane.id)).toEqual({ cols: 120, rows: 60 });
    await expect
      .poll(async () => {
        const box = await page.locator(".mobile-shell-pane-scale").boundingBox();
        return box?.width ?? 9999;
      })
      .toBeLessThan(400);
    await noOverflow(page);
    await focusTerminal(page);
    await typeLine(page, "echo MOBILE_OWN_SIZE");
    await expect.poll(() => desktop.paneSize(pane.id)!.cols).toBeLessThan(64);
    await noOverflow(page);
  });
});
test("a desktop browser becoming narrow applies mobile sizing on its existing connection", async ({
  page,
  appServer,
}) => {
  const observer = await appServer.openClient("mobile");
  const pane = observer.helloSnapshot()!.panes[0]!;
  const view = await watchClientView(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect.poll(() => observer.paneSize(pane.id)!.cols).toBeGreaterThan(64);
  await page.setViewportSize({ width: 390, height: 700 });
  await expect(page.locator(".mobile-shell")).toBeVisible();
  await expect(page.locator(".mobile-shell-fit-btn")).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() => {
      const declared = view()?.visible.find((p) => p.paneId === pane.id);
      const actual = observer.paneSize(pane.id);
      return declared && actual && declared.cols === actual.cols && actual.cols < 64;
    })
    .toBe(true);
  await noOverflow(page);
  await page.screenshot({ path: "/tmp/sodashitsu-desktop-narrow.png" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator(".mobile-shell")).toHaveCount(0);
  await expect.poll(() => observer.paneSize(pane.id)!.cols).toBeGreaterThan(64);
});
