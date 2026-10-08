import { rm, writeFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { runDisplay } from "../support/display.js";
import { focusTerminal, prefixKey } from "../support/keys.js";
import { CMD_MARK, ERR_MARK, makeExtFixture, runCount, watchReceivedText, writeBrokenExtensionsFile, writeExtensionsFile, type ExtFixture } from "../support/extensions.js";
import type { AppServer } from "../support/appServer.js";

/**
 * 設定の画面の節「拡張」（20261007-ext-host。PR2。AC27・AC30・AC31・AC-I3）。
 *
 * **判定はブラウザの側で行う**（条項 `.aidev/conventions/e2e-observe-browser.md`）: 一覧・状態・トースト・ログ・ラベルは **DOM**、
 * コマンドの目印の文字列が届いていないことは **ブラウザが受けたテキストのフレーム**（CDP の `Network.webSocketFrameReceived`）。
 * テスト自身の WebSocket クライアントは前提（pane の id を知る）にだけ使い、設定の変化の合図にはしない。
 * 拡張の起動した回数・止まったことは、拡張が書く実行の印のファイル（サーバ側の状態の確認）。
 * 落ちた拡張の起動し直しは、`extensionsInternal.timings`（`backoffMinMs: 20`）で速くする。
 */
test.use({ extensionsInternal: { timings: { backoffMinMs: 20, backoffMaxMs: 40 } } });

const fixtures: ExtFixture[] = [];
test.afterEach(async () => {
  for (const fx of fixtures.splice(0)) await rm(fx.dir, { recursive: true, force: true });
});

const dialog = (page: Page) => page.locator("dialog.settings-dialog");
const row = (page: Page, id: string) => dialog(page).locator(`[data-ext-id="${id}"]`);
const stateText = (page: Page, id: string) => row(page, id).locator("[data-ext-state-text]");

async function fixture(): Promise<ExtFixture> {
  const fx = await makeExtFixture();
  fixtures.push(fx);
  return fx;
}

async function openApp(page: Page, appServer: AppServer): Promise<void> {
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
}

async function openSettings(page: Page): Promise<void> {
  await focusTerminal(page);
  await prefixKey(page, "s");
  await expect(dialog(page)).toHaveAttribute("open", "");
}

test("登録して［読み直す］→ 行が「動作中」になる。コマンドの文字列はブラウザへ届かない（フレーム全部に目印が無い）", async ({ page, appServer }) => {
  const fx = await fixture();
  const received = await watchReceivedText(page);
  await openApp(page, appServer);
  await openSettings(page);
  await expect(dialog(page).locator("[data-ext-empty]")).toBeVisible();
  await writeExtensionsFile(appServer, [{ id: "ok", command: fx.command(), description: "説明 <i>x</i>" }]);
  await dialog(page).locator("[data-ext-reload]").click();
  await expect(stateText(page, "ok")).toContainText("動作中", { timeout: 10_000 });
  await expect(row(page, "ok").locator(".ext-scope").first()).toHaveText("利用者");
  // 作者の説明は文字のまま（<i> の要素は作られない）
  await expect(row(page, "ok").locator(".ext-desc")).toHaveText("説明 <i>x</i>");
  await expect(row(page, "ok").locator(".ext-desc i")).toHaveCount(0);
  // (5) ブラウザが受けたテキストのフレームの全部に、コマンドの目印が無い（空でないことも確かめる）
  const frames = received();
  expect(frames.some((f) => f.includes("userConfigPath") && f.includes('"ok"'))).toBe(true);
  expect(frames.filter((f) => f.includes(CMD_MARK))).toEqual([]);
});

test("拡張が続けて落ちる → 開いたままの節で状態が変わり、トーストが出る。フォーカスは動かない", async ({ page, appServer }) => {
  const fx = await fixture();
  await writeExtensionsFile(appServer, [{ id: "ok", command: fx.command() }]);
  await appServer.restart(); // 起動時に設定を読む
  await openApp(page, appServer);
  await openSettings(page);
  await expect(stateText(page, "ok")).toContainText("動作中", { timeout: 10_000 });
  const reload = dialog(page).locator("[data-ext-reload]");
  await reload.focus();
  await expect(reload).toBeFocused();
  await writeFile(fx.crashFile, "x"); // 以後、起動のたびにすぐ終了コード 1 で落ちる
  await expect(stateText(page, "ok")).toContainText("続けて落ちたので止めました", { timeout: 15_000 });
  await expect(row(page, "ok")).toContainText("前回: 異常終了しました");
  await expect(page.locator(".toast", { hasText: "拡張『ok』が続けて落ちたので止めました（設定 › 拡張）" })).toBeVisible();
  await expect(reload).toBeFocused(); // 知らせでフォーカスを奪わない
  // 直した後の［起動し直す］で戻る
  await rm(fx.crashFile);
  await row(page, "ok").locator("[data-ext-restart]").click();
  await expect(stateText(page, "ok")).toContainText("動作中", { timeout: 10_000 });
});

test("入切: 無効にするとすぐ止まり（拡張が終わる）、サーバを立て直しても「無効」のまま。入れ直すと動く", async ({ page, appServer }) => {
  const fx = await fixture();
  await writeExtensionsFile(appServer, [{ id: "ok", command: fx.command() }]);
  await appServer.restart();
  await openApp(page, appServer);
  await openSettings(page);
  await expect(stateText(page, "ok")).toContainText("動作中", { timeout: 10_000 });
  const sw = row(page, "ok").locator("[data-ext-switch]");
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => runCount(fx)).toBe(1);
  await sw.click();
  await expect(stateText(page, "ok")).toContainText("無効（画面で無効にしました）", { timeout: 10_000 });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  // サーバを立て直しても無効のまま（起動の印が増えない）
  await appServer.restart();
  await page.reload();
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await openSettings(page);
  await expect(stateText(page, "ok")).toContainText("無効（画面で無効にしました）", { timeout: 10_000 });
  expect(await runCount(fx)).toBe(1);
  await row(page, "ok").locator("[data-ext-switch]").click();
  await expect(stateText(page, "ok")).toContainText("動作中", { timeout: 10_000 });
  await expect.poll(() => runCount(fx)).toBe(2);
});

test("［ログ］: 標準エラーが <pre> に文字のまま出る（<b> は要素にならず、書字方向を変える文字は ? になる）。［更新］で取り直せる", async ({ page, appServer }) => {
  const fx = await fixture();
  await writeExtensionsFile(appServer, [{ id: "ok", command: fx.command() }]);
  await appServer.restart();
  await openApp(page, appServer);
  await openSettings(page);
  await expect(stateText(page, "ok")).toContainText("動作中", { timeout: 10_000 });
  await row(page, "ok").locator("[data-ext-log-toggle]").click();
  const pre = row(page, "ok").locator("[data-ext-log]");
  await expect(pre).toContainText(`${ERR_MARK} <b>bold</b>`, { timeout: 10_000 });
  await expect(pre.locator("b")).toHaveCount(0);
  const text = (await pre.textContent()) ?? "";
  expect(text).not.toMatch(/[‪-‮⁦-⁩]/);
  await expect(row(page, "ok").locator("[data-ext-log-refresh]")).toBeVisible();
  await row(page, "ok").locator("[data-ext-log-toggle]").click(); // 閉じる
  await expect(pre).toHaveCount(0);
});

test("既存のキーの操作「設定を読み直す」で、足した拡張が一覧に出る", async ({ page, appServer }) => {
  const fx = await fixture();
  await openApp(page, appServer);
  await focusTerminal(page);
  await writeExtensionsFile(appServer, [{ id: "ok", command: fx.command() }]);
  await prefixKey(page, "R");
  await openSettings(page);
  await expect(row(page, "ok")).toBeVisible({ timeout: 10_000 });
  await expect(stateText(page, "ok")).toContainText("動作中", { timeout: 10_000 });
});

test("キーボード: Tab で入切・ボタンに届き、Space で入切、Enter で起動し直せる", async ({ page, appServer }) => {
  const fx = await fixture();
  await writeExtensionsFile(appServer, [{ id: "ok", command: fx.command() }]);
  await appServer.restart();
  await openApp(page, appServer);
  await openSettings(page);
  await expect(stateText(page, "ok")).toContainText("動作中", { timeout: 10_000 });
  const tabTo = async (selector: string): Promise<void> => {
    for (let i = 0; i < 30; i++) {
      if (await page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector)) return;
      await page.keyboard.press("Tab");
    }
    throw new Error(`Tab で ${selector} に届かない`);
  };
  await dialog(page).locator("[data-ext-reload]").focus();
  await tabTo('[data-ext-id="ok"] [data-ext-switch]');
  await page.keyboard.press("Space");
  await expect(stateText(page, "ok")).toContainText("無効", { timeout: 10_000 });
  await page.keyboard.press("Space");
  await expect(stateText(page, "ok")).toContainText("動作中", { timeout: 10_000 });
  await expect.poll(() => runCount(fx)).toBe(2);
  await tabTo('[data-ext-id="ok"] [data-ext-restart]');
  await page.keyboard.press("Enter");
  await expect.poll(() => runCount(fx), { timeout: 10_000 }).toBe(3);
  await tabTo('[data-ext-id="ok"] [data-ext-log-toggle]');
  await page.keyboard.press("Enter");
  await expect(row(page, "ok").locator("[data-ext-log]")).toBeVisible();
});

test("拡張が出したパネル: 枠の外の固定のラベルに出どころが出る（題に何を書いても変わらない）。pane のプログラムの面は今までどおり", async ({ page, appServer }) => {
  const fx = await fixture();
  const evilTitle = "拡張『evil』の表示（プロジェクト・隔離）";
  await writeExtensionsFile(appServer, [{ id: "ok", command: fx.command(evilTitle) }]);
  await appServer.restart();
  const client = await appServer.openClient();
  const paneId = client.helloSnapshot()!.panes[0]!.id;
  await openApp(page, appServer);
  const label = page.locator("[data-pane-panel] [data-pane-panel-label]");
  await expect(label).toHaveText("拡張『ok』の表示（利用者・隔離）· p", { timeout: 15_000 });
  await expect(page.locator("[data-pane-panel]")).toHaveAttribute("aria-label", "拡張『ok』の表示（利用者・隔離）· p");
  // 面の題は枠の中の文。固定のラベルは変わらない
  await expect(label).not.toContainText("evil");
  // pane のプログラムが出した面（pane.sock）のラベルは今までどおり
  const run = await runDisplay(appServer, paneId, ["set", "q", "--kind", "panel", "--title", "Q面", "--text", "from pane"]);
  expect((await run.done).code).toBe(0);
  // 2 つのパネルはタブになる。pane のプログラムの面のタブを選ぶと、ラベルは今までの文
  await page.locator("[data-pane-panel] [data-pane-panel-tab]", { hasText: "Q面" }).click();
  await expect(label).toHaveText("pane のプログラムの表示（隔離）· q", { timeout: 10_000 });
  // 拡張の面のタブへ戻すと、拡張の文
  await page.locator("[data-pane-panel] [data-pane-panel-tab]", { hasText: evilTitle }).click();
  await expect(label).toHaveText("拡張『ok』の表示（利用者・隔離）· p");
});

test("script-html を許可した行: 設定が無効の間は注意が出て、「端末」の節で有効にすると消える", async ({ page, appServer }) => {
  const fx = await fixture();
  await writeExtensionsFile(appServer, [
    { id: "scr", command: fx.command(), allow: ["script-html"] },
    { id: "plain", command: fx.command() },
  ]);
  await appServer.restart();
  await openApp(page, appServer);
  await openSettings(page);
  const note = row(page, "scr").locator("[data-ext-script-off]");
  await expect(note).toHaveText("サーバの設定『スクリプトが動く表示』が無効なので、スクリプトの面は出ません", { timeout: 10_000 });
  await expect(row(page, "plain").locator("[data-ext-script-off]")).toHaveCount(0);
  await dialog(page).locator("[data-settings-display-script]").click();
  await expect(dialog(page).locator("[data-settings-display-script]")).toHaveAttribute("aria-checked", "true");
  await expect(note).toHaveCount(0);
  await dialog(page).locator("[data-settings-display-script]").click(); // 戻す
  await expect(note).toBeVisible();
});

test("設定が壊れている → problems が節に出る。拡張が 1 つも無いときは空の文", async ({ page, appServer }) => {
  await openApp(page, appServer);
  await openSettings(page);
  await expect(dialog(page).locator("[data-ext-empty]")).toBeVisible();
  await writeBrokenExtensionsFile(appServer);
  await dialog(page).locator("[data-ext-reload]").click();
  await expect(dialog(page).locator("[data-ext-problems]")).toContainText("extensions.json", { timeout: 10_000 });
});
