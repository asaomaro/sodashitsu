import type { WebSocketRoute } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import {
  openScriptBrowser,
  enableScript,
  setScriptOk,
  engageBtn,
  settleEngage,
} from "../support/displayScript.js";

test("native terminal embedded in a plugin: live output, own textarea, clipping, mobile and cleanup", async ({
  page,
  appServer,
}) => {
  const { paneId, input } = await openScriptBrowser(page, appServer);
  const c = await appServer.openClient();
  const other = await c.request("workspace.create", { label: "Other" });
  await setScriptOk(
    appServer,
    paneId,
    "embedded",
    `<style>
    #scroll{height:210px;overflow:auto}#terminal{height:140px;margin:12px}#spacer{height:500px}
    textarea{display:block;width:90%;height:45px}
  </style><div id="scroll"><div id="terminal"></div><div id="spacer"></div></div>
  <textarea id="reply" aria-label="返信"></textarea><button id="send">送信</button><button id="remove">端末を外す</button><p id="error"></p>
  <script>
    var embedded = soda.mount('terminal',document.getElementById('terminal'),{paneId:'${paneId}'});
    document.getElementById('send').onclick = function(){soda.action('reply',{text:document.getElementById('reply').value});};
    document.getElementById('remove').onclick = function(){embedded.dispose();};
    soda.onMessage(function(m){if(m.type==='component-error')document.getElementById('error').textContent=m.error;});
    window.tryOther = function(){soda.mount('terminal',document.getElementById('spacer'),{paneId:'${other.pane.id}'});};
  </script>`,
  );
  const terminal = page.locator("[data-embedded-terminal]");
  await expect(terminal).toBeVisible();
  const appPane = async () =>
    (await c.request("client.hello", { protocol: 1, kind: "external" })).snapshot.panes.find(
      (p) => p.id === paneId,
    )!;
  await expect.poll(async () => (await appPane()).rows).toBeLessThan(12);
  const initialCols = (await appPane()).cols;
  const appFrame = page.frameLocator("iframe[data-display-script]");
  await appFrame.locator("#terminal").evaluate((el) => {
    (el as HTMLElement).style.width = "240px";
  });
  await expect.poll(async () => (await appPane()).cols).toBeLessThan(initialCols);
  const appGrid = await appPane();
  expect(appGrid.cols).toBeLessThan(40);
  c.sendInput(paneId, "printf 'APP_GRID_%s_%s\\n' $(stty size)\r");
  await expect(terminal.locator(".xterm-accessibility-tree")).toContainText(
    `APP_GRID_${appGrid.rows}_${appGrid.cols}`,
  );
  // Setup uses CLI input; outcome is inspected in the real rendered terminal DOM.
  c.sendInput(paneId, "printf '\\033[32mEMBED_%s\\033[0m\\n' LIVE_938\r");
  await expect(terminal.locator(".xterm-accessibility-tree")).toContainText("EMBED_LIVE_938");
  await expect(page.locator(`[data-pane-id="${paneId}"] .xterm`).first()).toBeVisible();
  const frame = page.frameLocator("iframe[data-display-script]");
  await engageBtn(page).click();
  await frame.locator("#reply").fill("アプリ専用の入力");
  await expect(frame.locator("#reply")).toHaveValue("アプリ専用の入力");
  const before = input().length;
  await terminal.locator(".xterm-helper-textarea").focus();
  await page.keyboard.type("THIS_MUST_NOT_BE_SENT");
  expect(input().length).toBe(before);
  await frame.locator("#terminal").evaluate((el) => (el.style.height = "90px"));
  await expect.poll(async () => (await terminal.boundingBox())?.height).toBe(90);
  await frame.locator("#scroll").evaluate((el) => (el.scrollTop = 180));
  await expect(terminal).toHaveCount(0);
  await frame.locator("#scroll").evaluate((el) => (el.scrollTop = 0));
  await expect(terminal).toBeVisible();
  await frame.locator("#terminal").evaluate((el) => (el.style.visibility = "hidden"));
  await expect(terminal).toHaveCount(0);
  await frame.locator("#terminal").evaluate((el) => (el.style.visibility = "visible"));
  await expect(terminal).toBeVisible();
  await frame
    .locator("#spacer")
    .evaluate(() => (window as unknown as { tryOther(): void }).tryOther());
  await expect(frame.locator("#error")).toHaveText("pane_not_available");
  await expect(terminal).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("[data-mobile-display-btn]").click();
  await expect(terminal).toBeVisible();
  await expect(terminal.locator(".xterm-accessibility-tree")).toContainText("EMBED_LIVE_938");
  await page.screenshot({ path: "/tmp/plugin-component-mobile.png" });
  await page.locator("[data-mobile-display-sheet] [data-display-engage]").click();
  const beforeCloseCols = (await appPane()).cols;
  await frame.locator("#remove").click();
  await expect.poll(async () => (await appPane()).cols).toBeGreaterThan(beforeCloseCols);
  await expect(terminal).toHaveCount(0);
  c.close();
});

test("a background terminal in another tab is visible, survives reconnect, and is removed when closed", async ({
  page,
  appServer,
}) => {
  let allowConnect = true;
  const sockets = new Set<WebSocketRoute>();
  await page.routeWebSocket(/\/ws$/, (ws) => {
    if (!allowConnect) {
      void ws.close();
      return;
    }
    sockets.add(ws);
    ws.connectToServer();
  });
  await enableScript(appServer);
  const client = await appServer.openClient();
  const paneId = client.helloSnapshot()!.panes[0]!.id;
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await expect(page.locator(".xterm-helper-textarea")).toBeAttached();
  const ws = client.helloSnapshot()!.workspaces[0]!.id;
  const background = await client.request("tab.create", { workspaceId: ws, label: "Background" });
  client.sendInput(background.pane.id, "printf 'BACKGROUND_%s\\n' READY\r");
  await setScriptOk(
    appServer,
    paneId,
    "background",
    `<div id="terminal" style="height:180px"></div><script>soda.mount('terminal',document.getElementById('terminal'),{paneId:'${background.pane.id}'});</script>`,
  );
  const terminal = page.locator("[data-embedded-terminal]");
  await expect(terminal.locator(".xterm-accessibility-tree")).toContainText("BACKGROUND_READY");
  allowConnect = false;
  await Promise.all([...sockets].map((socket) => socket.close()));
  await expect(page.locator(".reconnect-overlay")).toBeVisible();
  allowConnect = true;
  await expect(page.locator(".reconnect-overlay")).toBeHidden({ timeout: 15000 });
  await expect(terminal.locator(".xterm-accessibility-tree")).toContainText("BACKGROUND_READY");
  const reconnected = await appServer.openClient();
  reconnected.sendInput(background.pane.id, "printf 'AFTER_%s\\n' RECONNECT\r");
  await expect(terminal.locator(".xterm-accessibility-tree")).toContainText("AFTER_RECONNECT");
  await reconnected.request("pane.close", { paneId: background.pane.id });
  await expect(terminal).toHaveCount(0);
  reconnected.close();
  client.close();
});

test("embedded input terminal sends to its background pane in Web and mobile, after user engagement", async ({
  page,
  appServer,
}) => {
  const { paneId, client, input } = await openScriptBrowser(page, appServer);
  const background = await client.request("tab.create", {
    workspaceId: client.helloSnapshot()!.workspaces[0]!.id,
    label: "Input target",
  });
  await setScriptOk(
    appServer,
    paneId,
    "input-terminal",
    `<div id="terminal" style="height:220px"></div><div id="output" style="height:160px"></div><script>soda.mount('terminal',document.getElementById('terminal'),{paneId:'${background.pane.id}',interactive:true});soda.mount('terminal',document.getElementById('output'),{paneId:'${background.pane.id}'});</script>`,
  );
  const terminal = page.locator('[data-embedded-terminal][data-interactive="1"]');
  const output = page.locator('[data-embedded-terminal][data-interactive="0"]');
  const textarea = terminal.locator(".xterm-helper-textarea");
  await expect(terminal).toHaveAttribute("data-interactive", "1");
  await expect(textarea).toHaveAttribute("readonly", "");
  await settleEngage(page);
  await engageBtn(page).focus();
  await page.keyboard.press("Enter");
  await expect(textarea).not.toHaveAttribute("readonly", "");
  await textarea.focus();
  await textarea.evaluate((el) => {
    el.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    el.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", isComposing: true, bubbles: true }),
    );
    el.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
  });
  await expect(page.locator('[data-display-phase][data-display-engaged="1"]')).toBeVisible();
  await expect(textarea).not.toHaveAttribute("readonly", "");
  await page.keyboard.type("printf 'INPUT_%s\\n' WEB");
  await page.keyboard.press("Enter");
  await expect(output.locator(".xterm-accessibility-tree")).toContainText("INPUT_WEB");
  expect(
    input()
      .filter((x) => x.paneId === background.pane.id)
      .map((x) => x.text)
      .join(""),
  ).toContain("WEB");
  expect(
    input()
      .filter((x) => x.paneId === paneId)
      .map((x) => x.text)
      .join(""),
  ).not.toContain("WEB");
  await page.keyboard.press("Escape");
  await expect(textarea).toHaveAttribute("readonly", "");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("[data-mobile-display-btn]").click();
  await page.locator("[data-mobile-display-sheet] [data-display-engage]").click();
  await terminal.locator(".xterm-helper-textarea").focus();
  await page.keyboard.insertText("日本語");
  await expect
    .poll(() =>
      input()
        .filter((x) => x.paneId === background.pane.id)
        .map((x) => x.text)
        .join(""),
    )
    .toContain("日本語");
  await page.keyboard.press("Control+u");
  await page.keyboard.type("printf 'INPUT_%s\\n' MOBILE");
  await page.keyboard.press("Enter");
  await expect(output.locator(".xterm-accessibility-tree")).toContainText("INPUT_MOBILE");
  expect(
    input()
      .filter((x) => x.paneId === background.pane.id)
      .map((x) => x.text)
      .join(""),
  ).toContain("日本語");
  client.close();
});
