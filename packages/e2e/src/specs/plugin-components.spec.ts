import type { WebSocketRoute } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import {
  openScriptBrowser,
  enableScript,
  setScriptOk,
  engageBtn,
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
  await frame.locator("#remove").click();
  await expect(terminal).toHaveCount(0);
  c.close();
});

test("a background terminal in another tab is visible, survives reconnect, and is removed when closed", async ({
  page,
  appServer,
}) => {
  let allowConnect = true;
  let socket: WebSocketRoute | null = null;
  await page.routeWebSocket(/\/ws$/, (ws) => {
    if (!allowConnect) {
      void ws.close();
      return;
    }
    socket = ws;
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
  await (socket as WebSocketRoute | null)?.close();
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
