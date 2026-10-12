import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "../support/fixtures.js";
test("statusline follows pane focus and closing it removes the saved view", async ({
  page,
  appServer,
}) => {
  const client = await appServer.openClient();
  const pane = client.helloSnapshot()!.panes.find((p) => !p.virtual)!;
  await client.request("pane.rename", { paneId: pane.id, label: "StatusAlpha" });
  const split = await client.request("pane.split", { paneId: pane.id, direction: "right" });
  await client.request("pane.rename", { paneId: split.pane.id, label: "StatusBeta" });
  await client.request("pane.focus", { paneId: pane.id });
  await client.request("tab.add_view", {
    tabId: pane.tabId,
    extensionKey: "builtin:workspace",
    viewId: "statusline",
    target: "tab",
    placement: "band-bottom",
  });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  const bands = page.locator(".pane-bands");
  const body = page.frameLocator(".pane-bands iframe").locator("body");
  await expect(body).toContainText("StatusAlpha");
  await client.request("pane.focus", { paneId: split.pane.id });
  await expect(body).toContainText("StatusBeta");
  await page.screenshot({ path: "/tmp/status-native-statusline-web.png" });
  await expect(page.locator(".tab-view-instance")).toHaveCount(0);
  await page.locator("[data-pane-band-close]").click();
  await expect(bands).toHaveCount(0);
  const check = await appServer.openClient();
  const state = check.helloSnapshot()!;
  expect(state.tabs.find((t) => t.id === pane.tabId)?.views ?? []).toHaveLength(0);
  check.close();
  client.close();
});
test("band heights resize at the inner boundary and persist after reload", async ({
  page,
  appServer,
}) => {
  const client = await appServer.openClient(),
    pane = client.helloSnapshot()!.panes.find((p) => !p.virtual)!;
  await client.request("tab.add_view", {
    tabId: pane.tabId,
    extensionKey: "builtin:workspace",
    viewId: "statusline",
    target: "tab",
    placement: "band-bottom",
  });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  const handle = page.locator("[data-band-resize]");
  await expect(handle).toBeVisible();
  const band = page.locator(".pane-band").filter({ has: handle });
  const before = await band.boundingBox();
  expect(before).not.toBeNull();
  const grip = await handle.boundingBox();
  expect(grip).not.toBeNull();
  await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + 2);
  await page.mouse.down();
  await page.mouse.move(grip!.x + grip!.width / 2, grip!.y - 25, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(async () => (await band.boundingBox())?.height)
    .toBeGreaterThan(before!.height + 20);
  const height = (await band.boundingBox())!.height;
  await page.reload();
  await expect(handle).toBeVisible();
  await expect.poll(async () => (await band.boundingBox())?.height).toBe(height);
  await page.screenshot({ path: "/tmp/view-controls-band-height.png" });
  client.close();
});
test("band grip moves a tab view into a visible floating window", async ({ page, appServer }) => {
  const client = await appServer.openClient(),
    pane = client.helloSnapshot()!.panes.find((p) => !p.virtual)!;
  await client.request("tab.add_view", {
    tabId: pane.tabId,
    extensionKey: "builtin:workspace",
    viewId: "statusline",
    target: "tab",
    placement: "band-top",
  });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  const grip = page.locator(".band-grip");
  await expect(grip).toBeVisible();
  const start = await grip.boundingBox();
  const area = await page
    .locator("[data-display-pane-id] .pane-frame-body-displays")
    .last()
    .boundingBox();
  expect(area).not.toBeNull();
  await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2);
  await page.mouse.down();
  await page.mouse.move(area!.x + area!.width / 2, area!.y + area!.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".display-float")).toBeVisible();
  await expect(page.locator(".band-grip")).toHaveCount(0);
  client.close();
});
test("pane menu and band menu/fold/close buttons work and statusline segments have distinct colors", async ({
  page,
  appServer,
}) => {
  const client = await appServer.openClient(),
    pane = client.helloSnapshot()!.panes.find((p) => !p.virtual)!;
  await client.request("tab.add_view", {
    tabId: pane.tabId,
    extensionKey: "builtin:workspace",
    viewId: "statusline",
    target: "tab",
    placement: "band-bottom",
  });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  const paneMenu = page.locator(`[data-pane-id="${pane.id}"] [data-pane-action="menu"]`);
  await paneMenu.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.locator(".pane-band-actions > button")).toHaveCount(3);
  const frame = page.frameLocator(".pane-band iframe"),
    name = frame.locator('[data-soda-color="name"]').first(),
    muted = frame.locator('[data-soda-color="muted"]').first();
  await expect(name).toBeVisible();
  const nameColor = await name.evaluate((e) => getComputedStyle(e).color);
  expect(await muted.evaluate((e) => getComputedStyle(e).color)).not.toBe(nameColor);
  await page.locator(".pane-band [data-display-menu-button]").click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator("[data-pane-band-fold]").click();
  await expect(page.locator(".pane-band")).toHaveCount(0);
  const tray = page.locator("[data-display-tray-button]");
  await expect(tray).toBeVisible();
  await tray.click();
  await expect(page.locator(".pane-band")).toBeVisible();
  await page.screenshot({ path: "/tmp/header-menu-status-colors.png" });
  await page.locator("[data-pane-band-close]").click();
  await expect(page.locator(".pane-band")).toHaveCount(0);
  client.close();
});
test("notification test displays a snackbar at the top right without changing agent state", async ({
  page,
  appServer,
}) => {
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.locator("[data-pane-actions]").first().waitFor();
  const client = await appServer.openClient();
  const before = client.helloSnapshot()!.panes.map((p) => ({ id: p.id, agent: p.agent }));
  await client.request("notification.test", {});
  const toast = page
    .locator(".toast")
    .filter({ hasText: "通知テスト：右上のスナックバーの動作確認です" });
  await expect(toast).toBeVisible();
  const box = await toast.boundingBox(),
    viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThan(viewport.width / 2);
  expect(box!.y).toBeLessThan(viewport.height / 3);
  const check = await appServer.openClient();
  expect(check.helloSnapshot()!.panes.map((p) => ({ id: p.id, agent: p.agent }))).toEqual(before);
  check.close();
  client.close();
});
test("collapsed views use an independent tray beside an open band and title visibility is configurable", async ({
  page,
  appServer,
}) => {
  const client = await appServer.openClient(),
    pane = client.helloSnapshot()!.panes.find((p) => !p.virtual)!;
  await client.request("workspace.set_project_folder", {
    workspaceId: client.helloSnapshot()!.workspaces[0]!.id,
    path: appServer.stateDir,
  });
  await client.request("tab.add_view", {
    tabId: pane.tabId,
    extensionKey: "builtin:workspace",
    viewId: "files",
    target: "tab",
    placement: "left",
  });
  await client.request("tab.add_view", {
    tabId: pane.tabId,
    extensionKey: "builtin:workspace",
    viewId: "statusline",
    target: "tab",
    placement: "band-bottom",
  });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  const panelGrip = page.locator("[data-pane-panel] [data-display-grip]");
  const bandGrip = page.locator("[data-pane-band] [data-display-grip]");
  await expect(panelGrip).toBeVisible();
  await expect(bandGrip).toBeVisible();
  const appearance = async (grip: typeof panelGrip, container: string) =>
    grip.evaluate((el, selector) => {
      const css = getComputedStyle(el),
        icon = el.querySelector("svg")!.getBoundingClientRect();
      const parent = el.closest(selector)!.getBoundingClientRect();
      return {
        fontSize: css.fontSize,
        fontWeight: css.fontWeight,
        minHeight: css.minHeight,
        iconWidth: icon.width,
        iconHeight: icon.height,
        leftInset: icon.x - parent.x,
      };
    }, container);
  expect(await appearance(bandGrip, "[data-pane-band]")).toEqual(
    await appearance(panelGrip, "[data-display-head]"),
  );
  await page.screenshot({ path: "/tmp/band-panel-heading-matched.png" });
  await page.locator("[data-pane-panel-fold]").click();
  const tray = page.locator("[data-display-tray-row]");
  await expect(tray).toBeVisible();
  await expect(page.locator("[data-pane-band] [data-display-tray]")).toHaveCount(0);
  const band = page.locator("[data-pane-band]"),
    trayBox = await tray.boundingBox(),
    bandBox = await band.boundingBox();
  expect(trayBox!.y + trayBox!.height).toBeLessThanOrEqual(bandBox!.y);
  const grip = band.locator("[data-display-grip]");
  await expect(grip.locator("[data-view-drag-icon] circle")).toHaveCount(6);
  await expect(grip).toContainText("Statusline");
  await client.request("prefs.set", { patch: { viewTitleVisible: false } });
  await expect(grip).not.toContainText("Statusline");
  await expect(grip.locator("[data-view-drag-icon]")).toBeVisible();
  await expect(band.locator("[data-display-menu-button]")).toBeVisible();
  await page.screenshot({ path: "/tmp/band-tray-separated.png" });
  await client.request("prefs.set", { patch: { viewTitleVisible: true } });
  await expect(grip.locator("[data-view-drag-icon] circle")).toHaveCount(6);
  await expect(grip).toContainText("Statusline");
  client.close();
});

test("file view has one function title and remains draggable when titles are hidden", async ({
  page,
  appServer,
}) => {
  const root = await mkdtemp(join(tmpdir(), "soda-view-title-"));
  const client = await appServer.openClient();
  try {
    await writeFile(join(root, "example.txt"), "sample");
    const pane = client.helloSnapshot()!.panes.find((p) => !p.virtual)!;
    const ws = client.helloSnapshot()!.tabs.find((t) => t.id === pane.tabId)!.workspaceId;
    await client.request("workspace.set_project_folder", { workspaceId: ws, path: root });
    await client.request("tab.add_view", {
      tabId: pane.tabId,
      extensionKey: "builtin:workspace",
      viewId: "files",
      target: "tab",
      placement: "left",
    });
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    const panel = page.locator("[data-pane-panel]");
    await expect(panel.locator(".display-head-label")).toHaveText("ファイルツリー");
    await expect(panel.locator("[data-pane-panel-title]")).toHaveCount(0);
    await expect(panel.locator(".workspace-view strong")).toHaveCount(0);
    await expect(panel.locator(".workspace-list")).toContainText("example.txt");
    await client.request("prefs.set", { patch: { viewTitleVisible: false } });
    await expect(panel.locator(".display-head-label")).toHaveCount(0);
    const grip = panel.locator("[data-display-grip]");
    await expect(grip).toBeVisible();
    await expect(grip.locator("[data-view-drag-icon] circle")).toHaveCount(6);
    const start = (await grip.boundingBox())!;
    expect(start.height).toBeGreaterThanOrEqual(24);
    const area = (await page
      .locator("[data-display-pane-id] .pane-frame-body-displays")
      .last()
      .boundingBox())!;
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2, { steps: 8 });
    await expect(page.locator('[data-display-drop-zone="float"][data-active="1"]')).toBeVisible();
    await page.mouse.up();
    const floating = page.locator(".display-float");
    await expect(floating).toBeVisible();
    await expect(floating.locator(".workspace-list")).toContainText("example.txt");
    await expect(floating.locator("[data-display-float-title]")).toHaveCount(0);
    await page.screenshot({ path: "/tmp/view-hidden-title-drag.png" });
    await client.request("prefs.set", { patch: { viewTitleVisible: true } });
    await expect(floating.locator(".display-head-label")).toHaveText("ファイルツリー");
    await expect(floating.locator("[data-display-float-title]")).toHaveCount(0);
    await page.screenshot({ path: "/tmp/view-function-title.png" });
  } finally {
    client.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("new floating view opens centrally without a tray click and reload preserves folding", async ({
  page,
  appServer,
}) => {
  const client = await appServer.openClient();
  try {
    const pane = client.helloSnapshot()!.panes.find((p) => !p.virtual)!;
    await client.request("workspace.set_project_folder", {
      workspaceId: client.helloSnapshot()!.workspaces[0]!.id,
      path: appServer.stateDir,
    });
    await client.request("tab.add_view", {
      tabId: pane.tabId,
      extensionKey: "builtin:workspace",
      viewId: "files",
      target: "tab",
      placement: "float",
    });
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    const floating = page.locator(".display-float");
    await expect(floating).toBeVisible();
    const box = (await floating.boundingBox())!;
    const host = (await floating.evaluate((el) =>
      el.closest(".pane-frame-center")!.getBoundingClientRect().toJSON(),
    )) as { x: number; y: number; width: number; height: number };
    expect(Math.abs(box.x + box.width / 2 - host.x - host.width / 2)).toBeLessThan(4);
    expect(Math.abs(box.y + box.height / 2 - host.y - host.height / 2)).toBeLessThan(4);
    expect(box.width).toBeGreaterThan(host.width * 0.55);
    const icon = floating.locator("[data-view-drag-icon]");
    const iconBox = (await icon.boundingBox())!;
    const buttonFont = await floating
      .locator("[data-display-menu-button]")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(iconBox.height).toBeLessThanOrEqual(buttonFont + 1);
    await page.screenshot({ path: "/tmp/view-floating-centered.png" });
    const resize = (await floating.locator('[data-display-float-handle="e"]').boundingBox())!;
    await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2);
    await page.mouse.down();
    await page.mouse.move(resize.x + resize.width / 2 + 30, resize.y + resize.height / 2, {
      steps: 5,
    });
    await page.mouse.up();
    await expect(floating).toBeVisible();
    await expect
      .poll(async () => (await floating.boundingBox())!.width)
      .toBeGreaterThan(box.width + 20);
    await floating.locator("[data-pane-panel-fold]").click();
    await expect(floating).toHaveCount(0);
    await page.reload();
    await expect(page.locator("[data-display-tray-button]")).toBeVisible();
    await expect(floating).toHaveCount(0);
    await page.locator("[data-display-tray-button]").click();
    await expect(floating).toBeVisible();
    await page
      .locator(".xterm")
      .first()
      .click({ position: { x: 8, y: 8 } });
    await expect(floating).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(floating).toHaveCount(0);
  } finally {
    client.close();
  }
});

for (const placement of ["band-top", "band-bottom"] as const) {
  test(`statusline band centers text without vertical overflow at compact and narrow sizes (${placement})`, async ({
    page,
    appServer,
  }) => {
    const client = await appServer.openClient();
    const pane = client.helloSnapshot()!.panes.find((p) => !p.virtual)!;
    await client.request("pane.rename", { paneId: pane.id, label: "CompactStatusline" });
    await client.request("tab.add_view", {
      tabId: pane.tabId,
      extensionKey: "builtin:workspace",
      viewId: "statusline",
      target: "tab",
      placement,
    });
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    const text = page.frameLocator(".pane-bands iframe").locator("[data-soda-statusline]");
    await expect(text).toContainText("CompactStatusline");
    const assertLayout = async (hasGrip = true) => {
      await expect
        .poll(() =>
          text.evaluate((el) => ({
            overflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
            centered: Math.abs(
              el.getBoundingClientRect().top +
                el.getBoundingClientRect().height / 2 -
                Math.min(innerHeight, 24) / 2,
            ),
          })),
        )
        .toEqual({ overflow: 0, centered: 0 });
      if (hasGrip) {
        const grip = await page.locator(".band-grip").boundingBox();
        const frame = await page.locator(".pane-bands iframe").boundingBox();
        expect(
          Math.abs(grip!.y + grip!.height / 2 - frame!.y - frame!.height / 2),
        ).toBeLessThanOrEqual(1);
      }
    };
    await assertLayout();
    const handle = await page.locator("[data-band-resize]").boundingBox();
    await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + 2);
    await page.mouse.down();
    await page.mouse.move(
      handle!.x + handle!.width / 2,
      handle!.y + (placement === "band-top" ? 60 : -60),
      { steps: 5 },
    );
    await page.mouse.up();
    await expect
      .poll(async () => (await page.locator(".pane-band").boundingBox())!.height)
      .toBeGreaterThan(60);
    const gripTop = await page.locator(".band-grip").boundingBox();
    const bandTop = await page.locator(".pane-band").boundingBox();
    expect(Math.abs(gripTop!.y - bandTop!.y)).toBeLessThanOrEqual(1);
    await expect
      .poll(() =>
        text.evaluate((el) =>
          Math.abs(el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2 - 12),
        ),
      )
      .toBe(0);
    await page.setViewportSize({ width: 720, height: 600 });
    await assertLayout(false);
    await page.screenshot({ path: "/tmp/statusline-band-compact.png" });
    client.close();
  });
}

test("statusline menu opens shared display settings, updates the line and persists after reload", async ({
  page,
  appServer,
}) => {
  const client = await appServer.openClient(),
    pane = client.helloSnapshot()!.panes.find((p) => !p.virtual)!;
  await client.request("pane.rename", { paneId: pane.id, label: "ConfiguredPane" });
  await client.request("tab.add_view", {
    tabId: pane.tabId,
    extensionKey: "builtin:workspace",
    viewId: "statusline",
    target: "tab",
    placement: "band-bottom",
  });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  const body = page.frameLocator(".pane-band iframe").locator("body");
  await expect(body).toContainText("ConfiguredPane");
  for (const button of await page.locator(".toast-sticky .toast-close").all()) await button.click();
  await page.locator(".pane-band [data-display-menu-button]").click();
  await page.getByRole("menuitem", { name: "Statuslineの設定…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Statuslineの設定", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("checkbox", { name: "ペイン名", exact: true }).uncheck();
  await expect(body).not.toContainText("ConfiguredPane");
  await dialog.getByRole("checkbox", { name: "コンテキスト", exact: true }).uncheck();
  await expect(body).not.toContainText("Context");
  await dialog.getByRole("checkbox", { name: "コンテキストのグラフ", exact: true }).uncheck();
  await dialog.getByLabel("週制限のグラフパターン", { exact: true }).selectOption("dots");
  await expect(dialog.locator("output").nth(2)).toContainText("●");
  await expect
    .poll(async () => (await client.request("prefs.get", {})).prefs.statuslineSettings)
    .toMatchObject({
      fields: { pane: false, context: false },
      graphs: { context: { visible: false }, weekly: { pattern: "dots" } },
    });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(body).not.toContainText("ConfiguredPane");
  await page.locator(".pane-band [data-display-menu-button]").click();
  await page.getByRole("menuitem", { name: "Statuslineの設定…", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: "ペイン名", exact: true })).not.toBeChecked();
  await expect(dialog.getByLabel("週制限のグラフパターン", { exact: true })).toHaveValue("dots");
  await page.setViewportSize({ width: 390, height: 720 });
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  const saved = (await client.request("prefs.get", {})).prefs.statuslineSettings!;
  saved.fields.model = false;
  await client.request("prefs.set", { patch: { statuslineSettings: saved } });
  await expect(dialog.getByRole("checkbox", { name: "モデル", exact: true })).not.toBeChecked();
  await expect(dialog.getByLabel("週制限のグラフパターン", { exact: true })).toHaveValue("dots");
  await page.screenshot({ path: "/tmp/statusline-settings-mobile.png" });
  client.close();
});
