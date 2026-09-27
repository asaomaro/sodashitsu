import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contrastRatio, TERMINAL_PALETTES, type ThemeName } from "@sodashitsu/protocol";
import { devices, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { watchReceivedFrames, watchSentInput, type ReceivedFrames, type SentInput } from "../support/frames.js";
import { focusTerminal, grantClipboard, prefixKey, typeLine } from "../support/keys.js";
import { watchClientViews, watchShownPanes } from "../support/panes.js";

/**
 * テーマ（20260921-theme-settings。herdr のテーマ）の E2E。
 *
 * **判定はブラウザの側で行う**（条項 `.aidev/conventions/e2e-observe-browser.md`）:
 * - 画面の枠の色は **DOM の計算済みの色**（サイドバー・ダイアログ・モバイルの上のバーの `background-color`）、明暗は `<html>` の `color-scheme`。
 * - 端末の色は xterm.js 6 が背景を塗る要素（`.xterm-scrollable-element` の `background-color`。xterm.js の `Viewport` が `onChangeColors`
 *   で当てる）——WebGL で描く文字の色は DOM から読めないので、背景で代わりに見る。
 * - 最初の描画は、**本体（main.ts）が走る前**の `<html>` の inline の変数（`readystatechange` の `interactive`——classic の
 *   `theme-boot.js` は走り終え、module の本体はまだ——で記録する）。
 * - 色の問い合わせの答えは、pane の中で `node` に OSC 11 を問い合わせさせ、答えを表示させて、**ブラウザが受けた画面**（OUTPUT・SNAPSHOT）で読む。
 * - 選択は copy モードで選んだ文字をクリップボードで見る。スクロールの位置は xterm.js のスクロールバーのつまみの位置（`style.top`）で見る——
 *   xterm.js 6 は `.xterm-viewport` の `scrollTop` を使わず常に 0 のまま（design の AC-I5 の「scrollTop」から替えた。decisions D12）。
 */

/** 画面の枠の背景（design の表の `--soda-menu-bg`＝herdr の `panel_bg`。dracula は今の値）。 */
const MENU_BG: Partial<Record<ThemeName, string>> = {
  dracula: "#282a36",
  nord: "#2e3440",
  "catppuccin-latte": "#eff1f5",
  catppuccin: "#181825",
  "gruvbox-light": "#fbf1c7",
  "tokyo-night": "#1a1b26",
};

const tempDirs: string[] = [];
test.afterEach(async () => {
  for (const dir of tempDirs) await rm(dir, { recursive: true, force: true });
  tempDirs.length = 0;
});

function hexToRgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

function rgbToHex(rgb: string): string {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
  if (!m) throw new Error(`rgb() でない: ${rgb}`);
  return `#${[m[1], m[2], m[3]].map((c) => Number(c).toString(16).padStart(2, "0")).join("")}`;
}

/** `#rrggbb` → xterm の色の答えの形（`rgb:RRRR/GGGG/BBBB`）。 */
function xtermRgb(hex: string): string {
  const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)];
  return `rgb:${r}${r}/${g}${g}/${b}${b}`;
}

interface Opened {
  context: BrowserContext;
  page: Page;
  frames: ReceivedFrames;
  shown: () => string[];
  sent: () => SentInput[];
  views: { count: () => number };
}

/** 新しいブラウザで開く。`prefs` があれば `soda.prefs.v1` に入れておく。最初の描画の記録も仕掛ける。 */
async function openBrowser(
  browser: Browser,
  appServer: AppServer,
  opts: { prefs?: Record<string, unknown>; colorScheme?: "light" | "dark" } = {},
): Promise<Opened> {
  const context = await browser.newContext({
    colorScheme: opts.colorScheme ?? "light",
    ...(opts.prefs
      ? { storageState: { cookies: [], origins: [{ origin: appServer.origin, localStorage: [{ name: "soda.prefs.v1", value: JSON.stringify(opts.prefs) }] }] } }
      : {}),
  });
  await recordFirstPaint(context);
  const page = await context.newPage();
  const frames = await watchReceivedFrames(page);
  const sent = await watchSentInput(page);
  const shown = await watchShownPanes(page);
  const views = await watchClientViews(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await waitForTerminal(page, shown);
  return { context, page, frames, shown, sent, views };
}

async function waitForTerminal(page: Page, shown: () => string[]): Promise<void> {
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await expect.poll(shown, { timeout: 10_000 }).not.toEqual([]);
}

/** 開き直し、**開き直した後の** `client.view` が届くまで待つ（`shown` は前のページの値を持ったままなので、それでは待てない）。 */
async function reloadAndWait(o: Opened): Promise<void> {
  const before = o.views.count();
  await o.page.reload();
  await o.page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await expect.poll(() => o.views.count(), { timeout: 10_000 }).toBeGreaterThan(before);
}

/** 本体（module）が走る前の `<html>` の inline の変数と color-scheme を記録する（`theme-boot.js` が当てた値）。 */
async function recordFirstPaint(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    document.addEventListener("readystatechange", () => {
      if (document.readyState !== "interactive") return;
      const s = document.documentElement.style;
      (window as unknown as { __sodaFirstPaint: unknown }).__sodaFirstPaint = {
        menuBg: s.getPropertyValue("--soda-menu-bg"),
        colorScheme: s.colorScheme,
      };
    });
  });
}

const firstPaint = (page: Page) =>
  page.evaluate(() => (window as unknown as { __sodaFirstPaint?: { menuBg: string; colorScheme: string } }).__sodaFirstPaint ?? null);

/**
 * 20260922-theme-custom-overrides：本体（module）が走る前の `--soda-accent`（上書きが控えに含まれるか。AC9）。
 * 既存の `recordFirstPaint`（`menuBg`・`colorScheme` だけを記録）とは別の window の印にする——形を変えると、
 * 既存の `toEqual({ menuBg, colorScheme })` の各所を直すことになるため。
 */
async function recordFirstPaintAccent(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    document.addEventListener("readystatechange", () => {
      if (document.readyState !== "interactive") return;
      (window as unknown as { __sodaFirstPaintAccent: unknown }).__sodaFirstPaintAccent =
        document.documentElement.style.getPropertyValue("--soda-accent");
    });
  });
}

const firstPaintAccent = (page: Page) =>
  page.evaluate(() => (window as unknown as { __sodaFirstPaintAccent?: string }).__sodaFirstPaintAccent ?? null);
const dialog = (page: Page) => page.locator("dialog.settings-dialog");
const themeSection = (page: Page) => dialog(page).locator('section[aria-labelledby="settings-theme"]');
const themeSelect = (page: Page) => themeSection(page).locator("select").first();
const sidebarBg = (page: Page) => page.locator(".sidebar").evaluate((el) => getComputedStyle(el).backgroundColor);
const dialogBg = (page: Page) => dialog(page).evaluate((el) => getComputedStyle(el).backgroundColor);
/** 全ての端末の背景（上から・左から）。 */
const terminalBgs = (page: Page) =>
  page.locator(".xterm-scrollable-element").evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
const colorScheme = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
const dataTheme = (page: Page) => page.evaluate(() => document.documentElement.dataset["theme"] ?? null);
const isFocused = (page: Page, locator: ReturnType<typeof themeSelect>) => locator.evaluate((el) => el === document.activeElement);

/** ブラウザが受けた、その pane の画面（SNAPSHOT と OUTPUT。全ての接続）。 */
function seen(o: Opened, paneId: string): string {
  const out: string[] = [];
  for (let c = 0; c < o.frames.connectionCount(); c++) out.push(...o.frames.snapshots(c, paneId), o.frames.output(c, paneId));
  return out.join("\n");
}

async function openSettingsByKey(page: Page): Promise<void> {
  await focusTerminal(page);
  await prefixKey(page, "s");
  await expect(dialog(page)).toHaveAttribute("open", "");
}

/** キーだけで「テーマ」の選択肢へ移る（Tab で進める。AC-I3）。 */
async function tabToThemeSelect(page: Page): Promise<void> {
  for (let i = 0; i < 15 && !(await isFocused(page, themeSelect(page))); i++) await page.keyboard.press("Tab");
  await expect(themeSelect(page)).toBeFocused();
}

/** 全ての端末の背景が、そのテーマの端末の背景になるまで待つ。 */
async function expectTerminals(page: Page, name: ThemeName, count: number): Promise<void> {
  await expect.poll(() => terminalBgs(page)).toEqual(Array(count).fill(hexToRgb(TERMINAL_PALETTES[name].background)));
}

/**
 * ブラウザが描く入力欄の枠と、キーボードで移ったときのフォーカスの枠が、**実際のダイアログの背景**に対して 3:1 以上（decisions D4。Chromium で
 * 測る）。ダイアログの背景がそのテーマの値であることも確かめる。いまフォーカスは「テーマ」の選択肢にある前提。
 */
async function expectBordersReadable(page: Page, name: ThemeName): Promise<void> {
  const bg = rgbToHex(await dialogBg(page));
  expect(bg, `${name}：ダイアログの背景`).toBe(MENU_BG[name]);
  const input = dialog(page).locator("input.settings-path");
  await expect(input).toBeEnabled();
  const border = rgbToHex(await input.evaluate((el) => getComputedStyle(el).borderTopColor));
  expect(contrastRatio(border, bg), `${name}：入力欄の枠 ${border}`).toBeGreaterThanOrEqual(3);
  const outline = await themeSelect(page).evaluate((el) => {
    const cs = getComputedStyle(el);
    return { color: cs.outlineColor, style: cs.outlineStyle };
  });
  expect(outline.style, `${name}：フォーカスの枠がある`).not.toBe("none");
  expect(contrastRatio(rgbToHex(outline.color), bg), `${name}：フォーカスの枠 ${outline.color}`).toBeGreaterThanOrEqual(3);
}

test("キーだけでテーマを選ぶと、画面の枠と開いている全ての端末の色がその場で替わる。自動の切替もキーで入れられ、閉じると端末へ戻り、選び直せば元に戻る（AC1・AC2・AC5・AC7・AC10・AC-I1〜AC-I4）", async ({
  browser,
  appServer,
}) => {
  test.setTimeout(90_000);
  // 「指定した場所」にしておくと、設定ダイアログの入力欄が使える（枠の比を測る。decisions D4）。OS は暗い。
  const o = await openBrowser(browser, appServer, { prefs: { newCwdPolicy: "path" }, colorScheme: "dark" });
  await focusTerminal(o.page);
  await prefixKey(o.page, "v"); // 端末を 2 つにしておく（開いている全ての端末が替わることを見る）
  await expect(o.page.locator(".xterm-scrollable-element")).toHaveCount(2);
  expect(await sidebarBg(o.page), "何も設定していなければ今と同じ dracula").toBe(hexToRgb(MENU_BG.dracula!));
  await expectTerminals(o.page, "dracula", 2);
  expect(await colorScheme(o.page)).toBe("dark");

  await openSettingsByKey(o.page);
  await expect(themeSection(o.page).locator("h3")).toHaveText("テーマ");
  await expect(themeSelect(o.page).locator("option")).toHaveCount(17);
  await tabToThemeSelect(o.page);
  // 閉じたまま上下キーで選ぶと、そのたびに反映される（確定ボタンは無い。design D4）。暗いテーマの並びで dracula の次は nord。
  await o.page.keyboard.press("ArrowDown");
  await expect(themeSelect(o.page)).toHaveValue("nord");
  await expect(themeSelect(o.page), "フォーカスは選んだ部品に残る").toBeFocused();
  await expect.poll(() => sidebarBg(o.page)).toBe(hexToRgb(MENU_BG.nord!));
  await expectTerminals(o.page, "nord", 2);
  await expectBordersReadable(o.page, "nord");

  // 明るいテーマまで下る（暗い 10 の後に明るい 7。最初は catppuccin-latte）。
  for (let i = 0; i < 12 && (await themeSelect(o.page).inputValue()) !== "catppuccin-latte"; i++) await o.page.keyboard.press("ArrowDown");
  await expect(themeSelect(o.page)).toHaveValue("catppuccin-latte");
  await expect.poll(() => sidebarBg(o.page)).toBe(hexToRgb(MENU_BG["catppuccin-latte"]!));
  await expectTerminals(o.page, "catppuccin-latte", 2);
  expect(await colorScheme(o.page), "ブラウザ標準の部品も明るく描く（AC10）").toBe("light");
  await expectBordersReadable(o.page, "catppuccin-latte");
  // 選ばれている pane の枠は、明るいテーマでも周りの背景と端末の背景から 3:1 以上（入力先の pane が分かる。decisions D15）。
  const edge = rgbToHex(await o.page.locator(".pane-frame-edge-current").first().evaluate((el) => getComputedStyle(el).borderTopColor));
  const pageBg = rgbToHex(await o.page.evaluate(() => getComputedStyle(document.body).backgroundColor));
  expect(contrastRatio(edge, pageBg), `選ばれている pane の枠 ${edge} と背景 ${pageBg}`).toBeGreaterThanOrEqual(3);
  expect(contrastRatio(edge, TERMINAL_PALETTES["catppuccin-latte"].background)).toBeGreaterThanOrEqual(3);

  // 自動の切替もキーだけで：Tab で切り替えへ、Space で入れる（OS は暗いので latte の対の暗い側＝catppuccin）。
  await o.page.keyboard.press("Tab");
  const autoSwitch = themeSection(o.page).locator('[role="switch"]');
  await expect(autoSwitch).toBeFocused();
  await o.page.keyboard.press("Space");
  await expect(autoSwitch).toHaveAttribute("aria-checked", "true");
  await expect(autoSwitch, "押しても切り替えに残る").toBeFocused();
  await expect.poll(() => dataTheme(o.page)).toBe("catppuccin");
  // 「暗いとき」へ Tab で移り、上下キーで選ぶ（既定 → catppuccin → tokyo-night）。
  const darkSelect = themeSection(o.page).locator("select").nth(2);
  for (let i = 0; i < 4 && !(await isFocused(o.page, darkSelect)); i++) await o.page.keyboard.press("Tab");
  await expect(darkSelect).toBeFocused();
  await o.page.keyboard.press("ArrowDown");
  await o.page.keyboard.press("ArrowDown");
  await expect(darkSelect).toHaveValue("tokyo-night");
  await expect.poll(() => dataTheme(o.page)).toBe("tokyo-night");
  await expect(themeSection(o.page).locator("#settings-theme-note")).toHaveText("いま使っているテーマ：Tokyo Night（OS の設定が暗いため）");
  // 切り替えへ戻って切ると、1 つのテーマ（latte）に戻る（AC7）。
  for (let i = 0; i < 4 && !(await isFocused(o.page, autoSwitch)); i++) await o.page.keyboard.press("Shift+Tab");
  await o.page.keyboard.press("Space");
  await expect.poll(() => dataTheme(o.page)).toBe("catppuccin-latte");

  // Esc で閉じても選んだ結果は残り（AC-I1・AC-I2）、フォーカスは端末へ戻る（AC-I4）。
  await o.page.keyboard.press("Escape");
  await expect(dialog(o.page)).not.toHaveAttribute("open", "");
  expect(await dataTheme(o.page)).toBe("catppuccin-latte");
  await expect.poll(() => o.page.evaluate(() => document.activeElement?.classList.contains("xterm-helper-textarea") ?? false)).toBe(true);

  // 開く前のテーマ（dracula）を選び直せば元に戻る（AC-I2）。
  await openSettingsByKey(o.page);
  await tabToThemeSelect(o.page);
  for (let i = 0; i < 20 && (await themeSelect(o.page).inputValue()) !== "dracula"; i++) await o.page.keyboard.press("ArrowUp");
  await expect(themeSelect(o.page)).toHaveValue("dracula");
  await expect.poll(() => sidebarBg(o.page)).toBe(hexToRgb(MENU_BG.dracula!));
  await expectTerminals(o.page, "dracula", 2);
  expect(await colorScheme(o.page)).toBe("dark");
  await o.context.close();
});

test("選んだテーマはこのブラウザに残り、開き直すと本体が走る前から出る。開き直した後に作る端末もそのテーマ。別のブラウザは既定のまま（AC3・AC4）", async ({
  browser,
  appServer,
}) => {
  // OS は暗いが自動の切替は切：固定の latte（OS で選ぶなら catppuccin）。控えの `auto` を見分ける。
  const o = await openBrowser(browser, appServer, { prefs: { theme: "catppuccin-latte" }, colorScheme: "dark" });
  expect(await firstPaint(o.page), "最初は控えが無い（本体が起動の後に書く）").toEqual({ menuBg: "", colorScheme: "" });
  expect(await sidebarBg(o.page)).toBe(hexToRgb(MENU_BG["catppuccin-latte"]!));
  await reloadAndWait(o);
  expect(await firstPaint(o.page)).toEqual({ menuBg: MENU_BG["catppuccin-latte"], colorScheme: "light" });
  expect(await sidebarBg(o.page)).toBe(hexToRgb(MENU_BG["catppuccin-latte"]!));
  await expectTerminals(o.page, "catppuccin-latte", 1);
  await focusTerminal(o.page);
  await prefixKey(o.page, "v");
  await expect(o.page.locator(".xterm-scrollable-element")).toHaveCount(2);
  await expectTerminals(o.page, "catppuccin-latte", 2);

  const other = await openBrowser(browser, appServer);
  expect(await sidebarBg(other.page)).toBe(hexToRgb(MENU_BG.dracula!));
  await reloadAndWait(other);
  expect(await firstPaint(other.page), "設定していないブラウザの控えは dracula").toEqual({ menuBg: MENU_BG.dracula, colorScheme: "dark" });
  await other.context.close();
  await o.context.close();
});

test("OS の明暗に合わせる：OS を切り替えると再読み込み無しで追従し、開き直しの最初の描画もそのときの OS に合ったほう（AC5・AC3・AC7）", async ({
  browser,
  appServer,
}) => {
  const o = await openBrowser(browser, appServer, { prefs: { theme: "catppuccin", themeAuto: true }, colorScheme: "light" });
  expect(await dataTheme(o.page), "OS が明るいので対の明るい側").toBe("catppuccin-latte");
  expect(await sidebarBg(o.page)).toBe(hexToRgb(MENU_BG["catppuccin-latte"]!));

  await o.page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => dataTheme(o.page)).toBe("catppuccin");
  expect(await sidebarBg(o.page)).toBe(hexToRgb(MENU_BG.catppuccin!));
  await expectTerminals(o.page, "catppuccin", 1);

  await openSettingsByKey(o.page);
  await expect(themeSection(o.page).locator('[role="switch"]')).toHaveAttribute("aria-checked", "true");
  await expect(themeSection(o.page).locator("#settings-theme-note")).toHaveText("いま使っているテーマ：Catppuccin Mocha（OS の設定が暗いため）");
  await o.page.keyboard.press("Escape");

  await reloadAndWait(o);
  expect(await firstPaint(o.page), "OS が暗いまま開き直す").toEqual({ menuBg: MENU_BG.catppuccin, colorScheme: "dark" });
  await o.page.emulateMedia({ colorScheme: "light" });
  await reloadAndWait(o);
  expect(await firstPaint(o.page), "OS を明るくして開き直すと、控えの明るい側").toEqual({ menuBg: MENU_BG["catppuccin-latte"], colorScheme: "light" });
  await o.context.close();
});

/** 問い合わせのスクリプト（OSC 11 を書き、答えを `ANS<印>:` の後に JSON で表示する）。打つ行を短くするためにファイルに置く。 */
async function writeAskScript(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "soda-e2e-theme-"));
  tempDirs.push(dir);
  const path = join(dir, "ask-bg.cjs");
  await writeFile(
    path,
    [
      "const tag = process.argv[2];",
      "process.stdin.setRawMode(true);",
      'process.stdout.write("\\x1b]11;?\\x07");',
      'process.stdin.once("data", (d) => { console.log("ANS" + tag + ":" + JSON.stringify(d.toString())); process.exit(0); });',
      "",
    ].join("\n"),
  );
  return path;
}

/**
 * pane の中で問い合わせのスクリプトを走らせ、答え（`rgb:…`）を返す。答えは PTY の入力として届く（サーバの Mirror が答える）。
 * 打った行のエコーには `ANS<印>:"\u001b` は現れないので、表示された答えだけが一致する。**このブラウザが打つ**＝このブラウザが操作している。
 */
async function askBackground(o: Opened, paneId: string, script: string, tag: string): Promise<string> {
  await focusTerminal(o.page);
  await typeLine(o.page, `node '${script}' ${tag}`);
  const marker = `ANS${tag}:"\\u001b]11;`;
  await expect.poll(() => seen(o, paneId).includes(marker), { message: `${tag} の答えがブラウザに届く`, timeout: 15_000 }).toBe(true);
  const text = seen(o, paneId);
  const start = text.indexOf(marker) + marker.length;
  return text.slice(start, text.indexOf("\\u0007", start));
}

test("色の問い合わせには、その tab の大きさを決めている——操作している——ブラウザのテーマの色で答える。開いた直後から（AC8）", async ({
  browser,
  appServer,
}) => {
  test.setTimeout(90_000);
  const script = await writeAskScript();
  // 開いた直後、設定に触れる前に問い合わせる：接続のたびにテーマをサーバへ送り直していなければ dracula で答える。
  const a = await openBrowser(browser, appServer, { prefs: { theme: "gruvbox-light" } });
  const paneId = a.shown()[0]!;
  expect(await askBackground(a, paneId, script, "1")).toBe(xtermRgb(TERMINAL_PALETTES["gruvbox-light"].background));

  // もう 1 つのブラウザ（vesper）が同じ pane を見ているだけなら、答えは操作している a のまま。
  const b = await openBrowser(browser, appServer, { prefs: { theme: "vesper" } });
  expect(await askBackground(a, paneId, script, "2")).toBe(xtermRgb(TERMINAL_PALETTES["gruvbox-light"].background));
  // b が操作する（入力する）と、b の配色で答える。
  expect(await askBackground(b, paneId, script, "3")).toBe(xtermRgb(TERMINAL_PALETTES.vesper.background));

  // a が操作してテーマを替えると、以後の答えも替わる。
  await openSettingsByKey(a.page);
  await themeSelect(a.page).selectOption("tokyo-night");
  await a.page.keyboard.press("Escape");
  await expect(dialog(a.page)).not.toHaveAttribute("open", "");
  expect(await askBackground(a, paneId, script, "4")).toBe(xtermRgb(TERMINAL_PALETTES["tokyo-night"].background));
  await b.context.close();
  await a.context.close();
});

/** 描画の 2 回分を待つ（xterm.js はスクロールの位置の同期を次の描画の回で行う）。 */
const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

test("テーマが替わっても、選択・スクロールの位置・打ちかけの入力は保たれる（AC-I5）", async ({ browser, appServer }) => {
  test.setTimeout(90_000);
  const o = await openBrowser(browser, appServer, { prefs: { theme: "tokyo-night", themeAuto: true }, colorScheme: "light" });
  await grantClipboard(o.context, appServer.origin);
  const paneId = o.shown()[0]!;
  const tag = `t${Date.now() % 100000}`;
  await focusTerminal(o.page);
  await typeLine(o.page, `for i in $(seq 1 80); do echo L_${tag}_$i; done`);
  await expect.poll(() => seen(o, paneId).includes(`L_${tag}_80`), { timeout: 15_000 }).toBe(true);
  await o.page.waitForTimeout(300); // ブラウザの xterm.js が書き終えるのを一呼吸待つ（scrollback-copy.spec.ts と同じ）

  // スクロール：ホイールで遡り、つまみの位置を覚えてから OS の明暗を替える。
  const slider = o.page.locator(".xterm-scrollable-element .scrollbar.vertical .slider").first();
  const sliderTop = () => slider.evaluate((el) => (el as HTMLElement).style.top);
  const bottomTop = await sliderTop();
  const box = (await o.page.locator(".xterm-screen").first().boundingBox())!;
  await o.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await o.page.mouse.wheel(0, -800);
  await expect.poll(sliderTop).not.toBe(bottomTop);
  await nextFrames(o.page);
  const scrolledTop = await sliderTop();
  await o.page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => dataTheme(o.page)).toBe("tokyo-night");
  await nextFrames(o.page);
  expect(await sliderTop(), "スクロールの位置が変わらない").toBe(scrolledTop);

  // 選択：copy モードで 5 行遡って選んだまま、OS の明暗を替えてから yank する。
  await focusTerminal(o.page);
  await prefixKey(o.page, "[");
  for (let i = 0; i < 5; i++) await o.page.keyboard.press("k");
  await o.page.keyboard.press("V");
  await o.page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => dataTheme(o.page)).toBe("tokyo-night-day");
  await o.page.keyboard.press("y");
  await expect.poll(() => o.page.evaluate(() => navigator.clipboard.readText()).then((t) => t.trim())).toBe(`L_${tag}_76`);

  // 打ちかけの入力：Enter を押す前に OS の明暗を替え、押した後にシェルが実行する（エコーには出ない `keep-42` で見る）。
  await focusTerminal(o.page);
  await o.page.keyboard.type("echo keep-$((40+2))");
  await o.page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => dataTheme(o.page)).toBe("tokyo-night");
  await o.page.keyboard.press("Enter");
  await expect.poll(() => seen(o, paneId).includes("keep-42"), { timeout: 10_000 }).toBe(true);
  await o.context.close();
});

test("設定ダイアログの上のキーは、ショートカットにも端末にも漏れない（AC-I5）", async ({ browser, appServer }) => {
  const o = await openBrowser(browser, appServer);
  await openSettingsByKey(o.page);
  await tabToThemeSelect(o.page);
  const sentBefore = o.sent().length;
  await o.page.keyboard.press("Control+b");
  await o.page.keyboard.press("c"); // prefix+c は新しい tab の名前を尋ねるダイアログを開く——漏れればそれが開き、設定ダイアログは閉じる
  await o.page.keyboard.press("ArrowUp");
  await expect(o.page.locator("dialog.name-dialog")).not.toHaveAttribute("open", "");
  await expect(dialog(o.page)).toHaveAttribute("open", "");
  // 端末へ送っていないこと：閉じた後に印を打ち、ブラウザがそれを送ったのを見てから、印より前に何も送っていないことを見る
  // （固定の待ちに頼らない。keys-mouse-dialogs.spec.ts の先例）。
  await o.page.keyboard.press("Escape");
  await expect(dialog(o.page)).not.toHaveAttribute("open", "");
  const marker = `mk${Date.now() % 100000}`;
  await focusTerminal(o.page);
  await o.page.keyboard.type(marker);
  await expect.poll(() => o.sent().slice(sentBefore).map((s) => s.text).join("")).toContain(marker);
  const before = o.sent().slice(sentBefore).map((s) => s.text).join("");
  expect(before.slice(0, before.indexOf(marker)), "設定ダイアログの上のキーは端末へ送らない").toBe("");
  await o.context.close();
});

// **`defaultBrowserType` は describe の中では使えない**（`settings.spec.ts` と同じ事情）。端末の条件だけを借りる。
const IPHONE_13 = { ...devices["iPhone 13"] };
delete (IPHONE_13 as { defaultBrowserType?: string }).defaultBrowserType;

// ---------------------------------------------------------------------------------------------------------------------
// 20260922-theme-custom-overrides：色の個別の上書き（AC1・AC2・AC3・AC4・AC5・AC6・AC7・AC9）
// ---------------------------------------------------------------------------------------------------------------------

const overridesDetails = (page: Page) => themeSection(page).locator("details.settings-theme-overrides");
const overrideInput = (page: Page, key: string, bucket: "light" | "dark") =>
  overridesDetails(page).locator(`[data-override-input="${bucket}:${key}"]`);
const overrideStatus = (page: Page) => overridesDetails(page).locator('[role="status"]');
const computedAccent = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--soda-accent").trim());

async function openOverrides(page: Page): Promise<void> {
  await openSettingsByKey(page);
  await overridesDetails(page).locator("summary").click();
}

test("色を上書きすると、その場で画面の枠に反映され、再読み込みでも最初から当たる（ちらつかない。AC1・AC2・AC9）", async ({ browser, appServer }) => {
  const o = await openBrowser(browser, appServer); // 既定は dracula（暗い）
  await recordFirstPaintAccent(o.context);
  await openOverrides(o.page);
  const before = await computedAccent(o.page);
  const input = overrideInput(o.page, "--soda-accent", "dark");
  await input.fill("#ff00ff");
  await input.press("Enter");
  await expect(overrideStatus(o.page)).toContainText("を #ff00ff にしました");
  expect(await computedAccent(o.page), "確定した瞬間に反映").toBe("#ff00ff");
  expect(await computedAccent(o.page)).not.toBe(before);
  await o.page.keyboard.press("Escape"); // 取り込み中ではないので設定画面が閉じる
  await expect(dialog(o.page)).not.toHaveAttribute("open", "");

  await reloadAndWait(o);
  expect(await firstPaintAccent(o.page), "本体が走る前の控えにも上書きが入っている").toBe("#ff00ff");
  expect(await computedAccent(o.page)).toBe("#ff00ff");
});

test("「明るいとき」「暗いとき」は、いま当たっている明暗にだけ効く。テーマを替えると切り替わる（AC3・AC4）", async ({ browser, appServer }) => {
  const o = await openBrowser(browser, appServer); // dracula（暗い）
  await openOverrides(o.page);
  await overrideInput(o.page, "--soda-accent", "dark").fill("#111111");
  await overrideInput(o.page, "--soda-accent", "dark").press("Enter");
  await overrideInput(o.page, "--soda-accent", "light").fill("#eeeeee");
  await overrideInput(o.page, "--soda-accent", "light").press("Enter");
  expect(await computedAccent(o.page), "暗いテーマなので暗いときの上書きが効く").toBe("#111111");

  await themeSelect(o.page).selectOption("one-light"); // 明るいテーマへ
  await expect.poll(() => computedAccent(o.page), "明るいテーマに替わると明るいときの上書きに切り替わる").toBe("#eeeeee");

  await themeSelect(o.page).selectOption("dracula"); // 暗いテーマへ戻す
  await expect.poll(() => computedAccent(o.page)).toBe("#111111");
});

test("妥当でない値は理由を示して拒否し、既定に戻すとその 1 色だけ既定に戻る（AC5・AC6）", async ({ browser, appServer }) => {
  const o = await openBrowser(browser, appServer);
  await openOverrides(o.page);
  const before = await computedAccent(o.page);
  const input = overrideInput(o.page, "--soda-accent", "dark");
  await input.fill("notacolor");
  await input.press("Enter");
  await expect(overrideStatus(o.page)).toContainText("notacolor は色として読めません");
  expect(await computedAccent(o.page), "拒否されたので変わらない").toBe(before);
  await expect(input).toHaveValue("");

  await input.fill("#123456");
  await input.press("Enter");
  expect(await computedAccent(o.page)).toBe("#123456");
  const row = o.page.locator(".theme-override-row").filter({ hasText: "強調の色" });
  await row.getByRole("button", { name: /既定に戻す/ }).first().click();
  await expect.poll(() => computedAccent(o.page), "既定に戻すとその色だけ既定に戻る").toBe(before);
});

test("すべての上書きを既定に戻す：確認を挟み、戻すとすべて消え、再読み込みしても既定のまま（AC7）", async ({ browser, appServer }) => {
  const o = await openBrowser(browser, appServer);
  await openOverrides(o.page);
  const defaultAccent = await computedAccent(o.page); // 既定の値を、上書きを当てる前に測る
  await overrideInput(o.page, "--soda-accent", "dark").fill("#222222");
  await overrideInput(o.page, "--soda-accent", "dark").press("Enter");
  expect(await computedAccent(o.page)).toBe("#222222");

  await overridesDetails(o.page).locator("[data-reset-all-overrides]").click();
  await overridesDetails(o.page).locator("[data-confirm-yes-overrides]").click();
  await expect.poll(() => computedAccent(o.page), "既定の値そのものに戻る").toBe(defaultAccent);
  await expect(overrideStatus(o.page)).toContainText("すべての色の上書きを既定へ戻しました");

  await o.page.keyboard.press("Escape");
  await reloadAndWait(o);
  const afterReload = await computedAccent(o.page);
  await openOverrides(o.page);
  expect(await overrideInput(o.page, "--soda-accent", "dark")).toHaveValue("");
  expect(afterReload, "再読み込みしても既定の値のまま").toBe(defaultAccent);
});

test.describe("モバイル", () => {
  test.use(IPHONE_13);

  test("上のバーの［設定］からテーマを選べ、上のバー・追加のキー・端末の色が替わり、開き直しても残る（AC13）", async ({ page, appServer }) => {
    await recordFirstPaint(page.context());
    const shown = await watchShownPanes(page);
    const views = await watchClientViews(page);
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    await waitForTerminal(page, shown);
    const barBg = () => page.locator(".mobile-shell-bar").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await barBg()).toBe(hexToRgb(MENU_BG.dracula!));

    await page.locator(".mobile-shell-settings-btn").click();
    await expect(dialog(page)).toHaveAttribute("open", "");
    await themeSelect(page).selectOption("gruvbox-light");
    await dialog(page).getByRole("button", { name: "閉じる" }).click();
    await expect(dialog(page)).not.toHaveAttribute("open", "");
    await expect.poll(barBg).toBe(hexToRgb(MENU_BG["gruvbox-light"]!));
    await expectTerminals(page, "gruvbox-light", 1);
    // 追加のキーの文字と背景は、そのテーマの文字の色・選択の行の背景（CSS 変数の値）。
    await page.locator(".mobile-shell-keyboard-btn").click();
    const key = page.locator(".extra-keys-btn").first();
    await expect(key).toBeVisible();
    const vars = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return { fg: cs.getPropertyValue("--soda-fg").trim(), active: cs.getPropertyValue("--soda-menu-active-bg").trim() };
    });
    expect(vars.fg, "gruvbox-light の文字は dracula の文字と違う").not.toBe("#f8f8f2");
    expect(await key.evaluate((el) => getComputedStyle(el).color)).toBe(hexToRgb(vars.fg));
    expect(await key.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(hexToRgb(vars.active));

    // OS を暗くしても、自動の切替は切なので固定の gruvbox-light（控えの `auto` を見分ける）。
    await page.emulateMedia({ colorScheme: "dark" });
    const before = views.count();
    await page.reload();
    await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
    await expect.poll(() => views.count(), { timeout: 10_000 }).toBeGreaterThan(before);
    expect(await firstPaint(page)).toEqual({ menuBg: MENU_BG["gruvbox-light"], colorScheme: "light" });
    expect(await barBg()).toBe(hexToRgb(MENU_BG["gruvbox-light"]!));
  });

  test("自動の切替もモバイルで効く：OS の明暗を替えると上のバーと端末の色が追従する（AC13・AC5）", async ({ page, appServer }) => {
    await page.addInitScript(() => localStorage.setItem("soda.prefs.v1", JSON.stringify({ theme: "catppuccin", themeAuto: true })));
    await page.emulateMedia({ colorScheme: "light" });
    const shown = await watchShownPanes(page);
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    await waitForTerminal(page, shown);
    const barBg = () => page.locator(".mobile-shell-bar").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await barBg(), "OS が明るいので対の明るい側").toBe(hexToRgb(MENU_BG["catppuccin-latte"]!));
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(barBg).toBe(hexToRgb(MENU_BG.catppuccin!));
    await expectTerminals(page, "catppuccin", 1);
  });
});
