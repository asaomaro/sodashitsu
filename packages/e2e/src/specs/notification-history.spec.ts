import { devices, type Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { focusTerminal, prefixKey } from "../support/keys.js";
import { blurWindow, cleanupNotifyAgents, launchFakeAgent, openApp, openNewTab, seedNotifyPrefs } from "../support/notifyAgent.js";
import type { SodaTestClient } from "../support/wsClient.js";

/**
 * 確認の通知の右上の積みと、先送りした通知の履歴・ベル（20261005-notify-bell の AC1〜AC3・AC5・AC7・AC9〜AC11・AC13・AC14・AC16・AC-I3・AC-I4）。
 *
 * **判定はブラウザの DOM と `getBoundingClientRect`**（条項 e2e-observe-browser）。位置は CSS の効き目なので、実ブラウザでしか確かめられない。
 * 否定の主張（重ならない・消えている）は、肯定の合図（トーストが出た・ベルの数が出た）を待ってから測る。
 */

test.afterEach(async () => {
  await cleanupNotifyAgents();
});

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
async function rectOf(page: Page, selector: string, index = 0): Promise<Rect> {
  return page.locator(selector).nth(index).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  });
}
const intersects = (a: Rect, b: Rect): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** 別の tab へ移って入力待ちの知らせを 1 件出す（トーストが出るまで待つ）。 */
async function blockedToast(page: Page, client: SodaTestClient, paneId: string, via: "keyboard" | "client" = "keyboard") {
  await blurWindow(page);
  const agent = await launchFakeAgent(page, client, paneId, { via });
  if (via === "keyboard") await openNewTab(page);
  await agent.block();
  const toast = page.locator(".toast", { hasText: "入力待ちです" });
  await expect(toast).toBeVisible({ timeout: 15_000 });
  return toast;
}

test("トースト：右上に出て、端末の入力位置（カーソル）と重ならない・積んでも重ならない（AC1・AC2）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 4000 });
  await seedNotifyPrefs(page);
  await openApp(page, appServer);

  // 入力位置を画面の下端へ寄せる（プロンプトが下にある通常の使い方。以前の「下・中央」はここへ被さっていた）。
  await page.keyboard.type("clear; for i in $(seq 1 100); do echo; done; echo bottom-prompt");
  await page.keyboard.press("Enter");
  await client.waitForOutput(p1, "bottom-prompt");

  // 短い知らせを 3 つ重ねる（prefix+o は空のとき短い知らせを出す）＋消えない知らせを 1 つ。
  for (let i = 0; i < 3; i++) await prefixKey(page, "o");
  await expect(page.locator(".toast")).toHaveCount(3);
  const rects = await page.locator(".toast").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }),
  );
  const vp = page.viewportSize()!;
  expect(rects[0]!.top, "先頭は上端に近い（右上）").toBeLessThan(40);
  for (const r of rects) expect(vp.width - r.right, "右端に近い").toBeLessThan(40);
  for (let i = 1; i < rects.length; i++) {
    expect(rects[i]!.top, "古い順に下へ積む").toBeGreaterThanOrEqual(rects[i - 1]!.bottom - 0.5);
    expect(intersects(rects[i]!, rects[i - 1]!), "互いに重ならない").toBe(false);
  }

  // 入力位置（xterm のカーソル位置の textarea）と、どのトーストも交差しない。
  const input = await rectOf(page, ".xterm-helper-textarea");
  expect(input.top, "入力位置は画面の下半分にある（前提）").toBeGreaterThan(vp.height / 2);
  for (const r of rects) expect(intersects(r, input), "入力位置に被さらない").toBe(false);
});

test("トースト：消えない知らせも右上で、入力位置と重ならない。動きを減らす設定では出る動きが付かない（AC1・AC4）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 4000 });
  await seedNotifyPrefs(page);
  await openApp(page, appServer);
  const toast = await blockedToast(page, client, p1);

  const r = await rectOf(page, ".toast");
  const vp = page.viewportSize()!;
  expect(r.top).toBeLessThan(80);
  expect(vp.width - r.right).toBeLessThan(40);
  await expect(page.locator(".toast-list")).toHaveAttribute("role", "status");
  await expect(toast.locator(".toast-close")).toHaveAttribute("aria-label", "閉じる");
  // 出る動き: 既定では付き、「動きを減らす」では付かない（付いていれば animationName が none でない）。
  await page.emulateMedia({ reducedMotion: "no-preference" });
  expect(await toast.evaluate((el) => getComputedStyle(el).animationName)).not.toBe("none");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await toast.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
});

test("履歴：閉じた知らせがベルの件数に数えられ、ポップアップに出て、キーだけで移動できる（AC5・AC9〜AC11・AC-I3・AC-I4）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 4000 });
  await seedNotifyPrefs(page);
  await openApp(page, appServer);
  const toast = await blockedToast(page, client, p1);

  const bell = page.locator("[data-notification-bell]");
  await expect(bell, "閉じる前は数えない（二重に数えない）").toHaveAttribute("aria-label", "通知の一覧");
  await expect(bell.locator(".notify-bell-badge")).toHaveCount(0);

  await toast.locator(".toast-close").click();
  await expect(toast).toHaveCount(0);
  await expect(bell.locator(".notify-bell-badge")).toHaveText("1");
  await expect(bell).toHaveAttribute("aria-label", "通知の一覧（1 件）");

  // ベルで開く。最初の行へフォーカス・Esc で閉じてベルへ戻る。
  await bell.click();
  const dialog = page.locator(".nh-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".nh-row")).toHaveCount(1);
  await expect(dialog.locator(".nh-row .nh-kind")).toHaveText("入力待ち");
  await expect(dialog.locator(".nh-go")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(bell, "ベルから開いたのでベルへ戻る").toBeFocused();
  await expect(bell.locator(".notify-bell-badge"), "閉じても履歴は変わらない").toHaveText("1");

  // キー（prefix+shift+o）で開き、Enter で pane の tab へ移る。行は消える。
  await focusTerminal(page).catch(() => undefined);
  await expect(page.locator(".tab-bar-item").last()).toHaveClass(/tab-bar-item-active/);
  await prefixKey(page, "Shift+O");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(page.locator(".tab-bar-item").first(), "知らせの pane の tab へ移った").toHaveClass(/tab-bar-item-active/);
  await expect(bell.locator(".notify-bell-badge"), "移った知らせは履歴から消える").toHaveCount(0);
});

test("履歴：［すべて削除］は 2 段階で、確定すると 0 件になりバッヂが消える（AC16）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 4000 });
  await seedNotifyPrefs(page);
  await openApp(page, appServer);
  const toast = await blockedToast(page, client, p1);
  await toast.locator(".toast-close").click();
  const bell = page.locator("[data-notification-bell]");
  await expect(bell.locator(".notify-bell-badge")).toHaveText("1");

  await bell.click();
  const dialog = page.locator(".nh-dialog");
  await page.locator(".nh-clear").click();
  await expect(page.locator(".nh-confirm-text")).toHaveText("1 件をすべて削除しますか？");
  await page.locator(".nh-cancel").click(); // やめる
  await expect(dialog.locator(".nh-row")).toHaveCount(1);
  await page.locator(".nh-clear").click();
  await page.locator(".nh-confirm").click();
  await expect(dialog.locator(".nh-row")).toHaveCount(0);
  await expect(dialog.locator(".nh-empty")).toBeVisible();
  await expect(page.locator(".nh-clear")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(bell.locator(".notify-bell-badge")).toHaveCount(0);
});

test("履歴：元の出来事が解消したら自動で消える。再読み込みでは残り、開いていない間に解消した分は復活しない（AC7・AC13・AC14）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 4000 });
  await seedNotifyPrefs(page);
  await openApp(page, appServer);
  const toast = await blockedToast(page, client, p1);
  await toast.locator(".toast-close").click();
  const badge = page.locator("[data-notification-bell] .notify-bell-badge");
  await expect(badge).toHaveText("1");

  // 再読み込み：まだ入力待ちのままなので残る（保存されている）。肯定の合図＝1 件が戻ること。
  await page.reload();
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await expect(badge).toHaveText("1");

  // 開いていない間にエージェントが居なくなる（Ctrl+C）。戻ってきたら復活していない。
  // 偽のエージェントは `exec` で shell を置き換えているので、Ctrl+C でプロセスごと終わる（pane が exited になる）。
  const gone = client.waitForEvent("pane.exited", (e) => e.data.paneId === p1, 20_000);
  await page.goto("about:blank");
  client.sendInput(p1, "\x03");
  await gone;
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await expect(page.locator("[data-notification-bell]")).toBeVisible();
  await expect(badge, "解消済みの知らせは残らない").toHaveCount(0);
});

test("履歴：画面を開いている間にエージェントが居なくなると、履歴から自動で消える（AC13）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 4000 });
  await seedNotifyPrefs(page);
  await openApp(page, appServer);
  const toast = await blockedToast(page, client, p1);
  await toast.locator(".toast-close").click();
  const badge = page.locator("[data-notification-bell] .notify-bell-badge");
  await expect(badge).toHaveText("1");
  client.sendInput(p1, "\x03");
  await expect(badge).toHaveCount(0, { timeout: 20_000 });
});

const IPHONE_13 = { ...devices["iPhone 13"] };
delete (IPHONE_13 as { defaultBrowserType?: string }).defaultBrowserType;

test.describe("モバイルの幅", () => {
  test.use(IPHONE_13);

  test("トーストは上部バーのボタンを隠さず、端末の入力位置とも重ならない。ベルは押せる（AC1・AC3・AC9）", async ({ page, appServer }) => {
    const client = await appServer.openClient();
    const p1 = client.helloSnapshot()!.panes[0]!.id;
    await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 4000 });
    await seedNotifyPrefs(page);
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
    const toast = await blockedToast(page, client, p1, "client");

    const t = await rectOf(page, ".toast");
    const bar = await rectOf(page, ".mobile-shell-bar");
    expect(t.top, "上部バーの下に出る").toBeGreaterThanOrEqual(bar.bottom - 0.5);
    const buttons = await page.locator(".mobile-shell-bar button").count();
    for (let i = 0; i < buttons; i++) expect(intersects(t, await rectOf(page, ".mobile-shell-bar button", i)), `バーのボタン ${i} を隠さない`).toBe(false);
    const vp = page.viewportSize()!;
    expect(t.right).toBeLessThanOrEqual(vp.width);
    expect(t.left).toBeGreaterThanOrEqual(0);

    // 閉じるとベルに数えられ、押せる大きさ（高さ 2rem 以上）。
    await toast.locator(".toast-close").click();
    const bell = page.locator("[data-notification-bell]");
    await expect(bell.locator(".notify-bell-badge")).toHaveText("1");
    const b = await rectOf(page, "[data-notification-bell]");
    expect(b.bottom - b.top).toBeGreaterThanOrEqual(31);
    await bell.tap();
    await expect(page.locator(".nh-dialog")).toBeVisible();
    await expect(page.locator(".nh-row")).toHaveCount(1);
  });
});

test("ベル：畳んだサイドバーでも見える（AC9）", async ({ page, appServer }) => {
  await seedNotifyPrefs(page);
  await openApp(page, appServer);
  await page.locator(".sidebar-collapse-btn").click();
  await expect(page.locator(".sidebar")).toHaveClass(/sidebar-collapsed/);
  await expect(page.locator("[data-notification-bell]")).toBeInViewport();
  const bell = await rectOf(page, "[data-notification-bell]");
  const side = await rectOf(page, ".sidebar");
  expect(bell.right, "畳んだ幅の中に収まる").toBeLessThanOrEqual(side.right + 0.5);
});
