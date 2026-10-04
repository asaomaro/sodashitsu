import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { devices, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { focusTerminal, prefixKey } from "../support/keys.js";
import { watchPaneSubscribes } from "../support/panes.js";

/**
 * このブラウザの設定（20260921-herdr-settings-gaps）の E2E。
 *
 * **判定はブラウザの側で行う**（条項 `.aidev/conventions/e2e-observe-browser.md`）:
 * - 幅・折りたたみ・記号・ダイアログは **DOM**（`style.width`・クラス・文字・`getComputedStyle`・ラジオの `checked`）。
 * - scrollback の行数は **ブラウザが送った `pane.subscribe`**（CDP の `Network.webSocketFrameSent`）。xterm の buffer は DOM に
 *   出ていないので、ブラウザが実際に求めた行数を見る——テスト自身の WebSocket クライアントではない。
 *
 * **「ブラウザを閉じて開き直す」は `storageState` を持ち越した新しい context で再現する**（research F34）。
 * `page.addInitScript` で `soda.prefs.v1` を仕込むと再読み込みのたびに上書きされ、**保存を確かめたことにならない**（F35）ので使わない。
 * ただの `context.close()` → `newContext()` は `localStorage` が空になる＝「別のブラウザ」（AC15）の再現に使う。
 */

const tempDirs: string[] = [];

test.afterEach(async () => {
  for (const dir of tempDirs) await rm(dir, { recursive: true, force: true });
  tempDirs.length = 0;
});

async function openApp(page: Page, appServer: AppServer): Promise<void> {
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
}

/** いまの context の `localStorage` を持ち越して閉じ、新しい context で開き直す（＝ブラウザを閉じて開き直す）。 */
async function reopenBrowser(browser: Browser, page: Page, appServer: AppServer): Promise<{ context: BrowserContext; page: Page }> {
  const storageState = await page.context().storageState();
  await page.context().close();
  const context = await browser.newContext({ storageState });
  const reopened = await context.newPage();
  await openApp(reopened, appServer);
  return { context, page: reopened };
}

const sidebarWidth = (page: Page): Promise<string> => page.locator(".sidebar").evaluate((el) => getComputedStyle(el).width);

/** サイドバーの境目をマウスで `dx` だけ動かす（`pointerdown` → `pointermove` → `pointerup`）。 */
async function dragDivider(page: Page, dx: number): Promise<void> {
  const box = (await page.locator(".sidebar-divider").boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y);
  await page.mouse.move(x + dx, y);
  await page.mouse.up();
}

const dialog = (page: Page) => page.locator("dialog.settings-dialog");
const radioLabels = (page: Page) => dialog(page).locator('label:has(input[name="settings-scrollback"])');
const checkedRadioLabel = (page: Page) => dialog(page).locator('label:has(input[name="settings-scrollback"]:checked)');

async function openSettingsByKey(page: Page): Promise<void> {
  await focusTerminal(page);
  await prefixKey(page, "s");
  await expect(dialog(page)).toHaveAttribute("open", "");
}

/**
 * 入力待ちの画面を出す偽のエージェント（`agent-detection.spec.ts` と同じ手法：`exec -a claude bash <script>` で
 * argv[0] を差し替える）。**ブラウザのキーではなくテストのクライアントから打つ**——この spec の関心は印の見え方で、
 * 打鍵の経路ではない。
 */
async function launchBlockedAgent(appServer: AppServer): Promise<void> {
  const client = await appServer.openClient();
  const paneId = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId, scrollbackLines: 100 });
  const dir = await mkdtemp(join(tmpdir(), "soda-e2e-settings-"));
  tempDirs.push(dir);
  const scriptPath = join(dir, "fake-claude.sh");
  const screen = [
    "────────────────────────────────────────────────────────────────",
    " Bash command",
    "",
    " Do you want to proceed?",
    " ❯ 1. Yes",
    "   2. No",
    "",
    " Esc to cancel · Tab to amend · ctrl+e to explain",
  ];
  await writeFile(
    scriptPath,
    ["clear", "sleep 4", "clear", ...screen.map((l) => `printf '%s\\n' ${JSON.stringify(l)}`), "sleep 60"].join("\n"), // 3 秒の起動猶予を越えてから出す
  );
  client.sendInput(paneId, `exec -a claude bash ${scriptPath}\r`);
}

test("設定：サイドバーの幅はブラウザを閉じて開き直しても残る（AC1）", async ({ page, appServer, browser }) => {
  await openApp(page, appServer);
  expect(await sidebarWidth(page)).toBe("240px");
  await dragDivider(page, 60);
  expect(await sidebarWidth(page)).toBe("300px");

  const { context, page: reopened } = await reopenBrowser(browser, page, appServer);
  expect(await sidebarWidth(reopened), "閉じて開き直しても、変えた幅で開く").toBe("300px");
  await context.close();
});

test("設定：サイドバーを畳むと、ブラウザを閉じて開き直しても畳んだまま（AC2）", async ({ page, appServer, browser }) => {
  await openApp(page, appServer);
  await focusTerminal(page);
  await prefixKey(page, "b");
  await expect(page.locator(".sidebar")).toHaveClass(/sidebar-collapsed/);

  const { context, page: reopened } = await reopenBrowser(browser, page, appServer);
  await expect(reopened.locator(".sidebar"), "閉じて開き直しても畳んだまま").toHaveClass(/sidebar-collapsed/);
  await context.close();
});

test("設定：選んだ scrollback はその後に開く pane から効き、ブラウザを閉じて開き直しても残る（AC9・AC10）", async ({
  page,
  appServer,
  browser,
}) => {
  // `page.goto()` の前に張る——最初の pane の購読（選ぶ前＝自動の 5,000 行）から見て、選んだ後に開いた pane と区別する。
  const subscribes = await watchPaneSubscribes(page);
  await openApp(page, appServer);
  await expect.poll(() => subscribes().length, { timeout: 10_000 }).toBeGreaterThan(0);
  const before = subscribes();
  expect(before.every((s) => s.scrollbackLines === 5000), "選ぶ前の pane は自動（デスクトップはサーバの上限）").toBe(true);
  const existing = new Set(before.map((s) => s.paneId));

  await openSettingsByKey(page);
  await expect(checkedRadioLabel(page)).toHaveText("自動（この端末では 5,000 行）"); // 既定＝以前の振る舞い
  await radioLabels(page).filter({ hasText: /^1,000 行$/ }).click();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).not.toHaveAttribute("open", "");

  // AC9：**同じページのまま**新しい tab を開く。それまでに見ていない pane の購読が 1,000 行を求める。
  await focusTerminal(page);
  await prefixKey(page, "c");
  await page.keyboard.press("Enter"); // tab の名前は既定のまま
  const fresh = () => subscribes().filter((s) => !existing.has(s.paneId));
  await expect.poll(() => fresh().length, { timeout: 10_000 }).toBeGreaterThan(0);
  expect(fresh().map((s) => s.scrollbackLines), "選んだ後に開いた pane は 1,000 行を求める").toEqual(fresh().map(() => 1000));

  // AC10：閉じて開き直しても、選んだ行が選ばれている。
  const { context, page: reopened } = await reopenBrowser(browser, page, appServer);
  await openSettingsByKey(reopened);
  await expect(checkedRadioLabel(reopened)).toHaveText("1,000 行");
  await context.close();
});

/** `soda.prefs.v1` を 1 回だけ仕込んだ context（`addInitScript` は再読み込みのたびに走り直すので使わない。research F35）。 */
async function contextWithPrefs(browser: Browser, appServer: AppServer, value: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [{ origin: appServer.origin, localStorage: [{ name: "soda.prefs.v1", value }] }] },
  });
  const page = await context.newPage();
  await openApp(page, appServer);
  // **前提の確認**（判定ではない）：仕込んだ値がページに届いている。`origin` がずれると保存域は空になり、既定の判定が
  // 仕込みと無関係に通ってしまう。
  expect(await page.evaluate(() => localStorage.getItem("soda.prefs.v1")), "仕込みがページに届いている").toBe(value);
  return { context, page };
}

test("設定：保存された値が壊れていても、既定で起動する（AC3）", async ({ appServer, browser }) => {
  // 対照：同じ経路で**正しい**値を仕込むと、その値で開く（仕込みの経路そのものが効いている証拠）。
  const control = await contextWithPrefs(browser, appServer, JSON.stringify({ sidebarWidth: 300, statusSymbols: false }));
  expect(await sidebarWidth(control.page)).toBe("300px");
  await expect(control.page.locator(".sidebar-spaces .sidebar-state-icon").first()).toHaveAttribute("data-symbols", "off");
  await control.context.close();

  // 範囲外の `statusSymbols` は**偽とみなされる非 boolean**（0）——`"off"` のような真の文字列だと、検証を通さない退行
  // （`?? true` 等）でも「入」になって見逃す。
  for (const value of ["{壊れた JSON", JSON.stringify({ sidebarWidth: 9999, sidebarCollapsed: "yes", statusSymbols: 0, scrollback: -5 })]) {
    const { context, page } = await contextWithPrefs(browser, appServer, value);
    expect(await sidebarWidth(page), value).toBe("240px");
    await expect(page.locator(".sidebar")).not.toHaveClass(/sidebar-collapsed/);
    await expect(page.locator(".sidebar-spaces .sidebar-state-icon").first(), "記号表示は入（既定）").toHaveAttribute("data-symbols", "on");
    await openSettingsByKey(page);
    await expect(checkedRadioLabel(page)).toHaveText("自動（この端末では 5,000 行）");
    await context.close();
  }
});

test("設定：別のブラウザ（別のプロファイル）では、設定は既定のまま（AC15）", async ({ page, appServer, browser }) => {
  await openApp(page, appServer);
  await dragDivider(page, 60);
  await openSettingsByKey(page);
  // `.filter` で絞る——20260922-appearance-settings-rest で表示の節に switch がもう1つ（エージェント名）
  // 増えたので、絞らないと `[role="switch"]` が2つに一致してしまう。
  await dialog(page).locator('section[aria-labelledby="settings-display"] [role="switch"]').filter({ hasText: "状態を記号でも示す" }).click();
  await radioLabels(page).filter({ hasText: /^1,000 行$/ }).click();
  // **前提の確認**：このブラウザの設定が実際に変わった。どれかの操作が効かなければ、別の context の判定は何も守らない。
  await expect(checkedRadioLabel(page)).toHaveText("1,000 行");
  await page.keyboard.press("Escape");
  expect(await sidebarWidth(page)).toBe("300px");
  await expect(page.locator(".sidebar-spaces .sidebar-state-icon").first()).toHaveAttribute("data-symbols", "off");

  // 判定は画面の状態（保存域の中身では判定しない）。
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await openApp(otherPage, appServer);
  expect(await sidebarWidth(otherPage)).toBe("240px");
  await expect(otherPage.locator(".sidebar")).not.toHaveClass(/sidebar-collapsed/);
  await expect(otherPage.locator(".sidebar-spaces .sidebar-state-icon").first()).toHaveAttribute("data-symbols", "on");
  await openSettingsByKey(otherPage);
  await expect(checkedRadioLabel(otherPage)).toHaveText("自動（この端末では 5,000 行）");
  await other.close();
});

test("設定：何も設定しない利用者に記号が出る。入力待ちは赤の ×、居ない行は字形なし、記号を切ると消える（AC5〜AC8）", async ({
  page,
  appServer,
}) => {
  await openApp(page, appServer);
  // AC8：エージェントが居ない行は字形を出さない（以前と同じ薄い丸）。
  const spaceIcon = page.locator(".sidebar-spaces .sidebar-state-icon").first();
  await expect(spaceIcon).toHaveAttribute("data-state", "none");
  await expect(spaceIcon).toHaveText("");
  // 居ない行は字形を出さないが、**以前の薄い丸は残す**（空の箱にすると、畳んだサイドバーでは行に何も描かれない。design「振る舞いの詳細」）。
  expect(await spaceIcon.evaluate((el) => getComputedStyle(el, "::before").content), "居ない行の薄い丸").not.toBe("none");
  // タスク点検 T5 の回帰：印の幅がエージェントの有無で変わると、ラベルが横に動く（以前は約 5.6px ずれた）。
  // vitest は `<style>` を読まないので、単体では原理的に見えない——ブラウザで測る。
  const spaceLabel = page.locator(".sidebar-spaces .sidebar-label").first();
  const labelLeftBefore = (await spaceLabel.boundingBox())!.x;

  await launchBlockedAgent(appServer);
  const agentIcon = page.locator('.sidebar-agents .sidebar-state-icon[data-state="blocked"]').first();
  await expect(agentIcon).toBeVisible({ timeout: 15_000 });
  // AC7・AC4：何も設定していない（既定）のに記号が出る。AC5：色と併記（blocked の赤。WCAG 1.4.11 のため以前の #ff5555 より明るい #ff6e6e。
  // decisions D6）。
  await expect(agentIcon).toHaveText("×");
  await expect(agentIcon).toHaveAttribute("aria-label", "入力待ち");
  expect(await agentIcon.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(255, 110, 110)");
  // design D2 の回帰：呼ぶ側に状態の点の CSS が残ると、字形の後ろに塗りの丸が描かれる。記号「入」の印は背景も `::before` も持たない。
  expect(await agentIcon.evaluate((el) => getComputedStyle(el).backgroundColor), "字形の後ろに丸を描かない").toBe("rgba(0, 0, 0, 0)");
  expect(await agentIcon.evaluate((el) => getComputedStyle(el, "::before").content)).toBe("none");
  // エージェントが現れても（workspace の行が none → blocked）、ラベルの位置は変わらない。
  await expect(spaceIcon).toHaveAttribute("data-state", "blocked");
  expect((await spaceLabel.boundingBox())!.x, "エージェントの有無でラベルが横に動かない").toBe(labelLeftBefore);

  // goto（prefix+g）の印も同じ：以前は goto にも同じ丸の CSS があった（サイドバーだけ見ていると、goto に戻っても通る）。
  await focusTerminal(page);
  await prefixKey(page, "g");
  const gotoIcon = page.locator('.goto-picker-state[data-state="blocked"]').first();
  await expect(gotoIcon).toHaveText("×");
  expect(await gotoIcon.evaluate((el) => getComputedStyle(el).backgroundColor), "goto でも字形の後ろに丸を描かない").toBe("rgba(0, 0, 0, 0)");
  await page.keyboard.press("Escape");

  // AC6：表示の節の switch を切ると字形が消える（色の丸に戻る）。
  // 20260922-appearance-settings-rest で表示の節に switch がもう1つ（エージェント名）増えたので、絞る。
  await openSettingsByKey(page);
  await dialog(page).locator('section[aria-labelledby="settings-display"] [role="switch"]').filter({ hasText: "状態を記号でも示す" }).click();
  await page.keyboard.press("Escape");
  await expect(agentIcon).toHaveText("");
  await expect(agentIcon).toHaveAttribute("data-symbols", "off");
});

test("設定：prefix+s とサイドバーの［メニュー］で開け、6 節（テーマは 20260921-theme-settings、キーは 20260921-keybinding-customization、エージェント連携は 20260923-agent-session-resume で足した）が見え、Esc で閉じる（AC12・AC-I1）", async ({ page, appServer }) => {
  await openApp(page, appServer);
  await openSettingsByKey(page);
  await expect(dialog(page).locator("section h3")).toHaveText(["通知", "テーマ", "表示", "端末", "エージェント連携", "キー"]);
  await page.keyboard.press("Escape");
  await expect(dialog(page)).not.toHaveAttribute("open", "");

  await page.locator(".sidebar-section-footer button", { hasText: "メニュー" }).click();
  await page.locator(".context-menu li", { hasText: /^設定$/ }).click();
  await expect(dialog(page)).toHaveAttribute("open", "");
  await expect(dialog(page).locator("section h3")).toHaveText(["通知", "テーマ", "表示", "端末", "エージェント連携", "キー"]);
  await page.keyboard.press("Escape");
  await expect(dialog(page)).not.toHaveAttribute("open", "");
});

test("設定：キーだけで端末の節のラジオへ入り、矢印で選べる（AC-I3）", async ({ page, appServer }) => {
  await openApp(page, appServer);
  await openSettingsByKey(page);
  // Tab で節をまたいで進む（通知の switch のうち、許可の状態で押せないものは飛ばされるので回数は数えない）。
  // 上限は余裕を持たせる（着いた時点で抜ける。20260926-pane-frame-auto-mode で表示の節に 2 つ増えた）。
  for (let i = 0; i < 40; i++) {
    if (await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.name === "settings-scrollback")) break;
    await page.keyboard.press("Tab");
  }
  await expect(
    dialog(page).locator('input[name="settings-scrollback"][value="auto"]'),
    "Tab で入ると、選ばれている行（既定の「自動」）にフォーカスが来る",
  ).toBeFocused();
  await page.keyboard.press("ArrowDown"); // ネイティブのラジオの組は、移動と同時に選ぶ
  await expect(dialog(page).locator('input[name="settings-scrollback"][value="1000"]')).toBeFocused();
  await page.keyboard.press("Escape");

  await openSettingsByKey(page);
  await expect(checkedRadioLabel(page), "閉じて開き直しても、矢印で選んだ行が選ばれている").toHaveText("1,000 行");
});

// **`defaultBrowserType` は describe の中では使えない**（`notifications.spec.ts` と同じ事情）。端末の条件だけを借りる。
const IPHONE_13 = { ...devices["iPhone 13"] };
delete (IPHONE_13 as { defaultBrowserType?: string }).defaultBrowserType;

test.describe("モバイル", () => {
  test.use(IPHONE_13);

  test("設定：上のバーの［設定］で開き、6 節と「自動（この端末では 1,000 行）」が見える（AC13）", async ({ page, appServer }) => {
    await openApp(page, appServer);
    await page.locator(".mobile-shell-settings-btn").click();
    await expect(dialog(page)).toHaveAttribute("open", "");
    await expect(dialog(page).locator("section h3")).toHaveText(["通知", "テーマ", "表示", "端末", "エージェント連携", "キー"]);
    // `DeviceKindKey` の結線の安全網：provide を落とすとダイアログは既定の "desktop" になり、ここが 5,000 行になる。
    await expect(checkedRadioLabel(page)).toHaveText("自動（この端末では 1,000 行）");
    // モバイルには Esc キーが無い。画面の「閉じる」で閉じられる（review ラウンド1 の指摘）。
    await dialog(page).getByRole("button", { name: "閉じる" }).click();
    await expect(dialog(page)).not.toHaveAttribute("open", "");
  });

  // design D2 の回帰（呼ぶ側に丸の CSS が残ると字形の後ろに丸が描かれる）を、3 か所目のモバイルのピッカーでも見る。
  test("設定：モバイルのピッカーの印も字形だけで、後ろに丸を描かない（AC4・D2）", async ({ page, appServer }) => {
    await openApp(page, appServer);
    await launchBlockedAgent(appServer);
    await page.locator(".mobile-shell-title").click(); // ピッカーは開いている間も状態に追従する
    const icon = page.locator('.pane-picker-state[data-state="blocked"]').first();
    await expect(icon).toBeVisible({ timeout: 15_000 });
    await expect(icon).toHaveText("×");
    expect(await icon.evaluate((el) => getComputedStyle(el).backgroundColor), "ピッカーでも字形の後ろに丸を描かない").toBe("rgba(0, 0, 0, 0)");
  });

  test("設定：モバイルでも数を選べば 1,000 行の固定をやめ、開き直した pane がその行数を求める（AC11）", async ({ page, appServer }) => {
    const subscribes = await watchPaneSubscribes(page);
    await openApp(page, appServer);
    await expect.poll(() => subscribes().map((s) => s.scrollbackLines), { timeout: 10_000 }).toContain(1000); // 自動＝以前と同じ

    await page.locator(".mobile-shell-settings-btn").click();
    await radioLabels(page).filter({ hasText: /^5,000 行$/ }).click();
    await page.keyboard.press("Escape");

    const before = subscribes().length;
    await page.reload(); // 端末は作り直される＝「その後に開く pane」
    await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
    await expect.poll(() => subscribes().slice(before).map((s) => s.scrollbackLines), { timeout: 10_000 }).toContain(5000);
    expect(subscribes().slice(before).every((s) => s.scrollbackLines === 5000)).toBe(true);
  });
});
