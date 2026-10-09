import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ThemeName } from "@sodashitsu/protocol";
import { devices, type Browser, type Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { set } from "../support/displayLayout.js";
import { prefixKey } from "../support/keys.js";
import { watchClientViews } from "../support/panes.js";

/**
 * 画面の様式（20261008-ui-style）の見た目を撮る道具。`scripts/ui-style-compare.mjs` が、変更の前後のコードでこの spec を流し、画像を画素で比べる。
 * **判定はしない（撮るだけ）**。`UI_STYLE_SHOTS_DIR` を渡したときだけ動く（ふだんの E2E では飛ばす）。
 *
 * - `UI_STYLE_SHOTS_DIR`: 画像の出力先ディレクトリ。
 * - `UI_STYLE`: `classic`（既定）か `modern`。起動のときに localStorage の設定（`soda.prefs.v1`）に `uiStyle` を入れる（設定の項目が無いコードでは、読まれずに捨てられる）。
 *
 * 撮り方の決まり（design 追補 01 D12）: トーストが消えるのを待つ・端末（`.xterm`）は `visibility: hidden` で隠す・`animations: "disabled"`・`caret: "hide"`・
 * `document.fonts.ready` と `client.view` の落ち着き（一定の間、新しく送られない）を待つ。
 */
const OUT = process.env["UI_STYLE_SHOTS_DIR"];
const STYLE = process.env["UI_STYLE"] === "modern" ? "modern" : "classic";
test.skip(OUT === undefined, "UI_STYLE_SHOTS_DIR を渡したときだけ撮る");
test.use({ viewport: { width: 1700, height: 900 } });
test.setTimeout(180_000);

const dirs: string[] = [];
test.afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

const THEMES = [
  { key: "dark", theme: "dracula" as ThemeName },
  { key: "light", theme: "catppuccin-latte" as ThemeName },
] as const;
type ThemeKey = (typeof THEMES)[number]["key"];

function prefsFor(theme: string): string {
  return JSON.stringify({ theme, themeAuto: false, ...(STYLE === "modern" ? { uiStyle: "modern" } : {}) });
}

interface Shooter {
  shot(name: string, opts?: { keepToast?: boolean }): Promise<void>;
}

/** 撮る道具。`settle` は、`client.view` が一定の間送られず、フォントが読めて、トーストが無い状態を待つ。 */
function shooter(page: Page, themeKey: ThemeKey, views?: { count: () => number }): Shooter {
  let n = 0;
  return {
    async shot(name: string, opts: { keepToast?: boolean } = {}): Promise<void> {
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      if (!opts.keepToast) {
        for (const t of await page.locator(".toast").all()) await t.dispatchEvent("click"); // 自動で消えない形がある（ヒント）。クリックで閉じる
        await expect(page.locator(".toast")).toHaveCount(0, { timeout: 20_000 });
      }
      if (views) {
        let last = -1;
        for (let i = 0; i < 40; i++) {
          const c = views.count();
          if (c === last) break;
          last = c;
          await page.waitForTimeout(250);
        }
      }
      await page.waitForTimeout(300);
      n++;
      await page.screenshot({
        path: join(OUT!, `${String(n).padStart(2, "0")}-${name}-${themeKey}.png`),
        animations: "disabled",
        caret: "hide",
        // 端末の文字は、時間・パスで揺れるので描かない（`.xterm` は pane より大きいので、`mask` では隣まで隠れる。`visibility` なら配置は変わらない）。
        style: ".xterm, .ext-path { visibility: hidden !important; }", // .ext-path: 拡張の設定の置き場所（一時の state dir の名前が入る）
      });
    },
  };
}

/**
 * 様式が当たっていること（撮った画像が、頼んだ様式のものだと確かめる）。`<html data-ui-style>` が、頼んだ様式と同じ（属性が無いのはクラシック）。
 * PR1a の時点では設定が無いので、classic のときだけ成り立つ（`UI_STYLE=modern` は、設定が入る PR1b から撮れる）。
 */
async function expectStyleApplied(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset["uiStyle"] ?? "classic"), { message: `UI_STYLE=${STYLE} が当たっていない` }).toBe(STYLE);
}

async function openApp(page: Page, appServer: AppServer): Promise<{ views: { count: () => number } }> {
  const views = await watchClientViews(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await expectStyleApplied(page);
  return { views };
}

for (const { key, theme } of THEMES) {
  test(`デスクトップ（${key}）`, async ({ page, appServer }) => {
    await mkdir(OUT!, { recursive: true });
    const client = await appServer.openClient();
    const initial = client.helloSnapshot()!.workspaces[0]!;
    // 作業フォルダ（git の枝・変更の数が出る）に頼らないよう、git の外の決まった場所に workspace を作る。
    const cwd = await mkdtemp(join(tmpdir(), "soda-ui-style-"));
    dirs.push(cwd);
    const created = await client.request("workspace.create", { cwd, label: "alpha" });
    const ws = created.workspace;
    const paneId = created.pane.id;
    await client.request("workspace.close", { workspaceId: initial.id });
    // 基本画面: pane 2 つ・tab 2 つ・サイドバーにグループ。
    await client.request("tab.rename", { tabId: ws.tabIds[0]!, label: "main" });
    const second = await client.request("tab.create", { workspaceId: ws.id, label: "second" });
    await client.request("tab.focus", { tabId: ws.tabIds[0]! });
    const split = await client.request("pane.split", { paneId, direction: "right" });
    const beta = await client.request("workspace.create", { cwd, label: "beta" });
    await client.request("group.create", { label: "team", workspaceId: beta.workspace.id });
    await client.request("workspace.focus", { workspaceId: ws.id });
    await client.request("prefs.set", { patch: { theme, themeAuto: false } });
    await page.addInitScript((p) => localStorage.setItem("soda.prefs.v1", p), prefsFor(theme));
    const { views } = await openApp(page, appServer);
    await expect(page.locator(".tab-bar-item")).toHaveCount(2);
    await expect(page.locator(".xterm-helper-textarea")).toHaveCount(2);
    const { shot } = shooter(page, key, views);

    // 起動のときのヒントのトースト（消えない形）をそのまま撮る。決まった文面なので、揺れない。
    await expect(page.locator(".toast")).toHaveCount(1);
    await shot("toast", { keepToast: true });
    await shot("base");

    // 右クリックのメニュー（サイドバーの行・tab）。
    await page.locator(".tab-bar-item").first().click({ button: "right" });
    await expect(page.getByRole("menu")).toBeVisible();
    await shot("context-menu-tab");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);

    // 設定のダイアログの各節。
    await prefixKey(page, "s");
    const dlg = page.locator("dialog.settings-dialog");
    await expect(dlg).toHaveAttribute("open", "");
    const items = dlg.locator("nav.settings-menu button");
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      await items.nth(i).click();
      await shot(`settings-${i}`);
    }
    await page.keyboard.press("Escape");
    await expect(dlg).not.toHaveAttribute("open", "");

    // ヘルプ（キー一覧）。
    await prefixKey(page, "?");
    await expect(page.locator("dialog[open]")).toHaveCount(1);
    await shot("help");
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);

    // 確認のダイアログ（workspace を閉じる）。
    await prefixKey(page, "D");
    await expect(page.locator("dialog[open]")).toHaveCount(1);
    await shot("confirm");
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);

    // グラフの画面。ノードの初めの置き場所は pane の id（実行ごとに違う UUID）の順で決まるので、pane の作った順に、決まった場所へ置く。
    const graph = await client.request("graph.get", {});
    const order = [paneId, split.pane.id, second.pane.id, beta.pane.id].map((id) => `local:${id}` as const);
    const known = new Set(graph.nodes.map((n: { key: string }) => n.key));
    const keys = order.filter((k) => known.has(k));
    // 1 つずつ動かすと、途中で重なって断られる——まず全部を遠くへ逃がし、そこから決まった場所へ置く。
    await client.request("graph.update", { baseRev: graph.rev, ops: keys.map((key, i) => ({ op: "move_node" as const, key, x: 5000 + i * 600, y: 5000 })) });
    const moved = await client.request("graph.get", {});
    await client.request("graph.update", { baseRev: moved.rev, ops: keys.map((key, i) => ({ op: "move_node" as const, key, ...(i < 3 ? { x: 100 + (i % 2) * 600, y: 100 + Math.floor(i / 2) * 400 } : { x: 1600, y: 100 }) })) }); // 3 つ目まで alpha（同じ workspace の枠は 1 つ）・4 つ目は beta（枠が重ならない所）
    await prefixKey(page, "a");
    await expect(page.locator("dialog.graph-view")).toBeVisible();
    await expect(page.locator("dialog.graph-view [data-node-key]").first()).toBeVisible();
    await shot("graph");
    await prefixKey(page, "a");
    await expect(page.locator("dialog.graph-view")).toBeHidden();

    // 表示の面: パネル（4 つの側）と帯。
    for (const side of ["right", "left", "top", "bottom"]) await set(appServer, paneId, `panel-${side}`, "panel", ["--dock", side, "--size", "160", "--title", `パネル ${side}`], `パネル（${side}）`);
    await set(appServer, paneId, "band-top", "band", ["--edge", "top", "--title", "帯 上"], "帯（上）");
    await set(appServer, paneId, "band-bottom", "band", ["--edge", "bottom", "--title", "帯 下"], "帯（下）");
    await expect(page.locator("[data-display-root]")).toHaveCount(6, { timeout: 15_000 });
    await expect(page.locator("iframe[data-display-frame]")).toHaveCount(6);
    for (const f of await page.locator("iframe[data-display-frame]").all()) {
      await expect.poll(() => f.evaluate((el) => (el as HTMLElement).getAttribute("data-display-loads") ?? "")).not.toBe("");
    }
    await page.waitForTimeout(800);
    await shot("display");

    client.close();
  });

  test(`ログイン・モバイル（${key}）`, async ({ browser, appServer }) => {
    await mkdir(OUT!, { recursive: true });
    await appServer.openClient().then((c) => c.close());
    // ログインの画面（トークン無し）。
    const loginCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await loginCtx.addInitScript((p) => localStorage.setItem("soda.prefs.v1", p), prefsFor(theme));
    const loginPage = await loginCtx.newPage();
    await loginPage.goto(appServer.origin);
    await expect(loginPage.locator("input").first()).toBeVisible({ timeout: 15_000 });
    await shooter(loginPage, key).shot("login");
    await loginCtx.close();

    // モバイルの 1 列の画面。
    await mobile(browser, appServer, theme, key);
  });
}

async function mobile(browser: Browser, appServer: AppServer, theme: ThemeName, key: ThemeKey): Promise<void> {
  const client = await appServer.openClient();
  const initial = client.helloSnapshot()!.workspaces[0]!;
  const cwd = await mkdtemp(join(tmpdir(), "soda-ui-style-"));
  dirs.push(cwd);
  await client.request("workspace.create", { cwd, label: "alpha" });
  await client.request("workspace.close", { workspaceId: initial.id });
  await client.request("prefs.set", { patch: { theme, themeAuto: false } });
  const ctx = await browser.newContext({ ...devices["Pixel 7"], colorScheme: key });
  await ctx.addInitScript((p) => localStorage.setItem("soda.prefs.v1", p), prefsFor(theme));
  const page = await ctx.newPage();
  const { views } = await openApp(page, appServer);
  const { shot } = shooter(page, key, views);
  await shot("mobile");
  client.close();
  await ctx.close();
}
