import { expect, test } from "../support/fixtures.js";
import { enableScript, openScriptBrowser, setScriptOk } from "../support/displayScript.js";
import { startScriptHtmlExtension } from "../support/extensions.js";

/**
 * `soda.mount` は、Sodashitsu が起動した拡張が出した面（`DisplayInfo.source` つき）だけに許す。
 * pane のプログラム（`sodactl display set --script-html-file`）が出した面からは、同じワークスペースの別の pane でも埋め込めない。
 * 判定は、ブラウザに届く面の見出しの `source` と、描画された埋め込み端末の有無（DOM）で見る。
 */
const MOUNT_HTML = (target: string) =>
  `<div id="terminal" style="height:160px"></div><p id="error"></p>
  <script>
    soda.onMessage(function(m){if(m.type==='component-error')document.getElementById('error').textContent=m.error;});
    soda.mount('terminal',document.getElementById('terminal'),{paneId:'${target}',interactive:true});
  </script>`;

test("pane のプログラムが出した script の面からは、同じワークスペースの別 pane の端末を埋め込めない", async ({
  page,
  appServer,
}) => {
  const { paneId, client, input } = await openScriptBrowser(page, appServer);
  const target = await client.request("tab.create", {
    workspaceId: client.helloSnapshot()!.workspaces[0]!.id,
    label: "Target",
  });
  await setScriptOk(appServer, paneId, "from-pane", MOUNT_HTML(target.pane.id));
  const frame = page.frameLocator("iframe[data-display-script]");
  await expect(frame.locator("#error")).toHaveText("pane_not_available");
  await expect(page.locator("[data-embedded-terminal]")).toHaveCount(0);
  expect(input().filter((x) => x.paneId === target.pane.id)).toHaveLength(0);
  client.close();
});

test("拡張が出した script の面からは、同じワークスペースの別 pane の端末を埋め込める", async ({
  page,
  appServer,
}) => {
  await enableScript(appServer);
  const ext = await startScriptHtmlExtension(appServer);
  const { paneId, client } = await openScriptBrowser(page, appServer);
  const target = await client.request("tab.create", {
    workspaceId: client.helloSnapshot()!.workspaces[0]!.id,
    label: "Target",
  });
  await ext.show(paneId, "from-ext", MOUNT_HTML(target.pane.id));
  const terminal = page.locator('[data-embedded-terminal][data-interactive="1"]');
  await expect(terminal).toBeVisible();
  await expect(terminal.locator(".xterm-helper-textarea")).toBeAttached();
  await expect(page.frameLocator("iframe[data-display-script]").locator("#error")).toHaveText("");
  client.close();
});
