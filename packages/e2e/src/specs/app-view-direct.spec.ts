import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { enableScript, setScriptOk } from "../support/displayScript.js";
import { startScriptHtmlExtension } from "../support/extensions.js";
import { watchSentInput } from "../support/frames.js";
import { installAppPlugin } from "../support/appPlugin.js";
import type { AppServer } from "../support/appServer.js";

/**
 * アプリタブのメイン画面（承認した拡張が出す script の面）は、［操作する］なしで操作できる（20261016-app-view-direct-operate）。
 * 判定は利用者が見る場所で行う: 覆い・ボタンの有無（DOM）、枠の中のアプリが受けたキー（枠の DOM）、ブラウザが pane へ送った入力のフレーム、
 * フォーカスのある要素（`document.activeElement`）、タブ行の選ばれているタブ。
 */
const APP = `<input id="t" aria-label="アプリの入力"><button id="b">押す</button><p id="keys"></p><p id="clicks">0</p>
<script>
  var log = [], n = 0;
  window.addEventListener('keydown', function (e) { log.push((e.ctrlKey ? 'C-' : '') + e.key); document.getElementById('keys').textContent = log.join(' '); }, true);
  document.getElementById('b').onclick = function () { document.getElementById('clicks').textContent = String(++n); };
</script>`;
const APP_FRAME = "[data-plugin-view] iframe[data-display-script]";
const appFrame = (page: Page) => page.frameLocator(APP_FRAME);
const activeTabLabel = (page: Page) => page.locator('.tab-bar [role="tab"][aria-selected="true"] .tab-bar-label');
/** アプリが受けたキーのうち、修飾キーだけの keydown でないもの。 */
const nonModifierKeys = async (page: Page): Promise<string[]> =>
  ((await appFrame(page).locator("#keys").textContent()) ?? "").split(" ").filter((t) => t !== "" && !/^(C-)?(Control|Shift|Alt|Meta)$/.test(t));
const terminalFocused = (page: Page) => page.evaluate(() => document.activeElement?.closest(".xterm, .terminal-pane") !== null && document.activeElement?.closest(".xterm, .terminal-pane") !== undefined);

/** 「作業 tab」「App」「App2」の順に並べ、App を表示して開く。拡張（user:scrhost）が、App・App2 のメイン画面に script の面を出す。 */
async function openApp(page: Page, appServer: AppServer, opts: { tabs?: number } = {}) {
  await enableScript(appServer);
  const plugin = await installAppPlugin(appServer, APP);
  const input = await watchSentInput(page);
  await page.addInitScript(() => {
    // 偽の知らせを枠から送る試験のため、親が作る MessageChannel の親側の port を控える。
    const W = window as unknown as { __ports: MessagePort[]; MessageChannel: typeof MessageChannel };
    W.__ports = [];
    const Real = W.MessageChannel;
    W.MessageChannel = class extends Real {
      constructor() {
        super();
        W.__ports.push(this.port1);
      }
    } as typeof MessageChannel;
  });
  const client = await appServer.openClient();
  const wsId = client.helloSnapshot()!.workspaces[0]!.id;
  const tabs: { tabId: string; paneId: string }[] = [];
  for (let i = 0; i < (opts.tabs ?? 1); i++) {
    const r = await client.request("tab.create", { workspaceId: wsId, label: i === 0 ? "App" : `App${i + 1}`, plugin });
    tabs.push({ tabId: r.tab.id, paneId: r.pane.id });
  }
  await client.request("tab.focus", { tabId: tabs[0]!.tabId });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await expect(page.locator(APP_FRAME)).toBeVisible({ timeout: 20_000 });
  await expect(appFrame(page).locator("#keys")).toBeAttached();
  return { client, input, tabs, wsId };
}

test("A: メイン画面は覆いも［操作する］も無く、開いた時点でキーとクリックが枠に届く", async ({ page, appServer }) => {
  const { input } = await openApp(page, appServer);
  await expect(page.locator("[data-plugin-view] [data-display-cover]")).toHaveCount(0);
  await expect(page.locator("[data-plugin-view] [data-display-engage]")).toHaveCount(0);
  await expect(page.locator("[data-plugin-view] [data-display-direct]")).toHaveCount(1);
  await expect(page.locator("[data-plugin-view] [data-display-engaged]")).toHaveAttribute("data-display-engaged", "1");
  // 何も押さずにキーを打つ（フォーカスは開いた時点で枠にある）
  await expect.poll(() => page.evaluate(() => (document.activeElement as HTMLElement | null)?.hasAttribute("data-display-script") === true)).toBe(true);
  await page.keyboard.type("abc");
  await expect(appFrame(page).locator("#keys")).toHaveText("a b c");
  await appFrame(page).locator("#b").click();
  await expect(appFrame(page).locator("#clicks")).toHaveText("1");
  expect(input()).toHaveLength(0); // 端末へは 1 文字も届いていない
});

test("B: Esc はアプリに届き、操作は終わらない", async ({ page, appServer }) => {
  await openApp(page, appServer);
  await page.keyboard.press("Escape");
  await expect(appFrame(page).locator("#keys")).toHaveText("Escape");
  await expect(page.locator("[data-plugin-view] [data-display-engaged]")).toHaveAttribute("data-display-engaged", "1");
  await expect.poll(() => page.evaluate(() => (document.activeElement as HTMLElement | null)?.hasAttribute("data-display-script") === true)).toBe(true);
});

test("B: 印「スクリプト」は残り、操作中は［操作を終える］が出る。押すと枠の外へ出る（［操作する］は出ない）", async ({ page, appServer }) => {
  await openApp(page, appServer);
  await expect(page.locator("[data-plugin-view] [data-display-script-mark]")).toBeVisible();
  await expect(page.locator("[data-plugin-view] [data-display-end]")).toBeVisible();
  await page.locator("[data-plugin-view] [data-display-end]").click();
  await expect(page.locator("[data-plugin-view] [data-display-engaged]")).toHaveAttribute("data-display-engaged", "0");
  await expect(page.locator("[data-plugin-view] [data-display-engage]")).toHaveCount(0);
  // 枠を押せば、また操作中
  await appFrame(page).locator("#t").click();
  await expect(page.locator("[data-plugin-view] [data-display-engaged]")).toHaveAttribute("data-display-engaged", "1");
});

test("B: prefix+n でタブが切り替わり、フォーカスは端末に無い。prefix もその次のキーもアプリには届かない", async ({ page, appServer }) => {
  const { input } = await openApp(page, appServer, { tabs: 2 });
  await expect(activeTabLabel(page)).toHaveText("App");
  await page.keyboard.press("Control+b");
  await page.keyboard.press("n");
  await expect(activeTabLabel(page)).toHaveText("App2");
  await expect(appFrame(page).locator("#keys")).toBeAttached();
  // 行き先もアプリのタブ: そちらのメイン画面が操作中。アプリはどちらのキーも見ていない
  await expect(appFrame(page).locator("#keys")).toHaveText("");
  expect(await terminalFocused(page)).toBe(false);
  expect(input()).toHaveLength(0);
});

test("B-1: 端末のタブへ切り替えても、フォーカスは端末に移らない。続けて打ったキーは端末に入らない", async ({ page, appServer }) => {
  const { input } = await openApp(page, appServer);
  await expect(activeTabLabel(page)).toHaveText("App");
  await page.keyboard.press("Control+b");
  await page.keyboard.press("p"); // 前のタブ（作業の tab）へ
  await expect(activeTabLabel(page)).not.toHaveText("App");
  await expect(page.locator(".xterm-helper-textarea").first()).toBeAttached();
  await page.waitForTimeout(500); // 端末が遅れてフォーカスを取りに来る時間（描画・サーバの応答）
  expect(await terminalFocused(page)).toBe(false);
  await expect(page.locator('.tab-bar [role="tab"][aria-selected="true"]')).toBeFocused();
  await page.keyboard.type("SHOULD_NOT_REACH_TERMINAL");
  await page.waitForTimeout(200);
  expect(input().map((x) => x.text).join("")).not.toContain("SHOULD");
  // 端末で打つには、利用者が端末を押す
  await page.locator(".xterm").first().click();
  await expect.poll(() => terminalFocused(page)).toBe(true);
});

test("B: 受けない操作（閉じる・分割・新規）の prefix は効かず、アプリにも届かない", async ({ page, appServer }) => {
  const { client, wsId } = await openApp(page, appServer);
  const tabCount = async () => (await client.request("client.hello", { protocol: 1, kind: "external" })).snapshot.tabs.filter((t) => t.workspaceId === wsId).length;
  const before = await tabCount();
  const panesBefore = await page.locator("[data-work-panes] .terminal-pane").count();
  for (const chord of ["Shift+X", "v", "Minus", "c", "x", "Shift+D"]) {
    await page.keyboard.press("Control+b");
    await page.keyboard.press(chord);
  }
  await page.waitForTimeout(400);
  await expect(page.locator("dialog[open], [role=dialog]")).toHaveCount(0); // 確認・名前入力のダイアログも出ない
  expect(await tabCount()).toBe(before);
  expect(await page.locator("[data-work-panes] .terminal-pane").count()).toBe(panesBefore);
  await expect(activeTabLabel(page)).toHaveText("App");
  // prefix も次のキーも、アプリには届かない（修飾キーだけの keydown は素通しなので除く）
  expect(await nonModifierKeys(page)).toEqual([]);
  // 受けない prefix の後も、通常のキーは枠に届く
  await page.keyboard.type("z");
  await expect(appFrame(page).locator("#keys")).toContainText("z");
  expect(await nonModifierKeys(page)).toEqual(["z"]);
});

test("偽の知らせ: 枠から prefix の中継を偽装しても、タブ・ワークスペースの切り替えより外の操作は起きない", async ({ page, appServer }) => {
  const { client, wsId } = await openApp(page, appServer, { tabs: 2 });
  const tabCount = async () => (await client.request("client.hello", { protocol: 1, kind: "external" })).snapshot.tabs.filter((t) => t.workspaceId === wsId).length;
  const before = await tabCount();
  const forge = (msgs: unknown[]) =>
    page.evaluate((list) => {
      const ports = (window as unknown as { __ports: (MessagePort & { onmessage: ((e: { data: unknown }) => void) | null })[] }).__ports;
      const port = ports[ports.length - 1]!;
      for (const data of list) port.onmessage?.({ data });
    }, msgs);
  const k = (key: string, over: Record<string, boolean> = {}) => ({ type: "prefix-key", input: { key, code: "", ctrl: false, alt: false, shift: false, meta: false, ...over } });
  // 閉じる・分割・新規・pane を閉じる・prefix の二度押し（端末へ送る列）・モード
  await forge([
    { type: "key", key: "prefix" }, k("X", { shift: true }),
    { type: "key", key: "prefix" }, k("v"),
    { type: "key", key: "prefix" }, k("c"),
    { type: "key", key: "prefix" }, k("x"),
    { type: "key", key: "prefix" }, k("b", { ctrl: true }),
    { type: "key", key: "prefix" }, k("w"),
    k("n"), // prefix 無し
  ]);
  await page.waitForTimeout(400);
  expect(await tabCount()).toBe(before);
  await expect(page.locator("dialog[open], [role=dialog]")).toHaveCount(0);
  await expect(activeTabLabel(page)).toHaveText("App");
  // 許可表の操作（タブの切り替え）は、偽でも動く＝その範囲に収まる
  await forge([{ type: "key", key: "prefix" }, k("n")]);
  await expect(activeTabLabel(page)).toHaveText("App2");
  // 連打しても、1 秒の窓の上限を超えて動かない
  const flood: unknown[] = [];
  for (let i = 0; i < 60; i++) flood.push({ type: "key", key: "prefix" }, k("n"));
  await forge(flood);
  expect(await tabCount()).toBe(before);
});

test("C: パネルの script 面（拡張が出したものも）は、今までどおり覆いと［操作する］。Esc で抜ける", async ({ page, appServer }) => {
  await enableScript(appServer);
  const ext = await startScriptHtmlExtension(appServer);
  const client = await appServer.openClient();
  const paneId = client.helloSnapshot()!.panes[0]!.id;
  await ext.show(paneId, "app", APP); // 同じ名前 "app"。メイン画面ではなく、作業 pane のパネル
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  const panel = "[data-pane-panel] iframe[data-display-script]";
  await expect(page.locator(panel)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-pane-panel] [data-display-cover]")).toHaveCount(1);
  await expect(page.locator("[data-pane-panel] [data-display-engage]")).toBeVisible();
  await expect(page.locator("[data-pane-panel] [data-display-direct]")).toHaveCount(0);
  // 操作を始めて Esc で抜けられる
  await page.waitForTimeout(800);
  await page.locator("[data-pane-panel] [data-display-engage]").click();
  await expect(page.locator("[data-pane-panel] [data-display-engaged]")).toHaveAttribute("data-display-engaged", "1");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-pane-panel] [data-display-engaged]")).toHaveAttribute("data-display-engaged", "0");
});

test("pane のプログラムが出した面は、同じ名前でもメイン画面にならず、覆いと［操作する］が残る", async ({ page, appServer }) => {
  await enableScript(appServer);
  const client = await appServer.openClient();
  const paneId = client.helloSnapshot()!.panes[0]!.id;
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea");
  await setScriptOk(appServer, paneId, "app", APP);
  const panel = "[data-pane-panel] iframe[data-display-script]";
  await expect(page.locator(panel)).toBeVisible();
  await expect(page.locator("[data-pane-panel] [data-display-cover]")).toHaveCount(1);
  await expect(page.locator("[data-pane-panel] [data-display-engage]")).toBeVisible();
  await expect(page.locator("[data-display-direct]")).toHaveCount(0);
  await expect(page.locator("[data-pane-panel] [data-display-engaged]")).toHaveAttribute("data-display-engaged", "0");
});

test("モバイル: メイン画面は覆いなしで開き、枠にフォーカスがある", async ({ page, appServer }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMobile(page, appServer);
  await expect(page.locator(".mobile-app-view [data-display-cover]")).toHaveCount(0);
  await expect(page.locator(".mobile-app-view [data-display-engage]")).toHaveCount(0);
  await expect(page.locator(".mobile-app-view [data-display-engaged]")).toHaveAttribute("data-display-engaged", "1");
  await appFrame(page).locator("#b").click();
  await expect(appFrame(page).locator("#clicks")).toHaveText("1");
});

async function openMobile(page: Page, appServer: AppServer) {
  await enableScript(appServer);
  const plugin = await installAppPlugin(appServer, APP);
  const client = await appServer.openClient();
  const wsId = client.helloSnapshot()!.workspaces[0]!.id;
  const r = await client.request("tab.create", { workspaceId: wsId, label: "App", plugin });
  await client.request("tab.focus", { tabId: r.tab.id });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await expect(page.locator(".mobile-app-view iframe[data-display-script]")).toBeVisible({ timeout: 20_000 });
}
