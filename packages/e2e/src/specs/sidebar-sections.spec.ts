import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { focusTerminal, prefixKey } from "../support/keys.js";

/**
 * サイドバーの区画（spaces・agents）の区画ごとのスクロール・境目・折りたたみ（20261004-ui-interaction-polish）。
 *
 * **判定はブラウザの側で行う**（条項 `e2e-observe-browser`）: 高さは `getBoundingClientRect`、スクロールは `scrollHeight`/`clientHeight`、
 * 印・開閉は `aria-expanded`・文字・`toBeHidden`、保存は「読み込み直して同じ配分」（`storageState` を持ち越した新しい context。内部の値は覗かない）。
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

async function addWorkspaces(appServer: AppServer, n: number): Promise<void> {
  const client = await appServer.openClient();
  for (let i = 0; i < n; i++) await client.request("workspace.create", { cwd: process.cwd(), label: `ws-${i}` });
}

/** 入力待ちの画面を出す偽のエージェント（`settings.spec.ts` の `launchBlockedAgent` と同じ手法）。 */
async function launchBlockedAgent(appServer: AppServer): Promise<void> {
  const client = await appServer.openClient();
  const paneId = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId, scrollbackLines: 100 });
  const dir = await mkdtemp(join(tmpdir(), "soda-e2e-sections-"));
  tempDirs.push(dir);
  const scriptPath = join(dir, "fake-claude.sh");
  const screen = ["────────────────────────────────────────────────────────────────", " Bash command", "", " Do you want to proceed?", " ❯ 1. Yes", "   2. No", "", " Esc to cancel · Tab to amend · ctrl+e to explain"];
  await writeFile(scriptPath, ["clear", "sleep 4", "clear", ...screen.map((l) => `printf '%s\\n' ${JSON.stringify(l)}`), "sleep 60"].join("\n"));
  client.sendInput(paneId, `exec -a claude bash ${scriptPath}\r`);
}

const height = (page: Page, sel: string): Promise<number> => page.locator(sel).first().evaluate((el) => el.getBoundingClientRect().height);
const toggle = (page: Page, which: "spaces" | "agents") => page.locator(`.sidebar-${which} .sidebar-section-toggle`);

async function reload(page: Page): Promise<Page> {
  const storageState = await page.context().storageState();
  const origin = new URL(page.url()).origin;
  const token = new URL(page.url()).hash;
  await page.context().close();
  const context = await page.context().browser()!.newContext({ storageState });
  const next = await context.newPage();
  await next.goto(`${origin}/${token}`);
  await next.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  return next;
}

test("workspace が多いと spaces の区画の中だけがスクロールし、見出し・＋新規・メニュー・畳むボタンは見えたまま", async ({ page, appServer }) => {
  await addWorkspaces(appServer, 15);
  await openApp(page, appServer);
  await expect(page.locator(".sidebar-spaces .sidebar-row").nth(12)).toBeAttached();
  const body = page.locator(".sidebar-spaces .sidebar-section-body");
  const scrolls = await body.evaluate((el) => el.scrollHeight > el.clientHeight + 4 && getComputedStyle(el).overflowY === "auto");
  expect(scrolls, "spaces の body がスクロールする").toBe(true);
  // サイドバー全体はスクロールしない。見出し・フッタ・畳むボタンは画面の中（ビューポートの下端を越えない）。
  const vh = page.viewportSize()!.height;
  for (const sel of [".sidebar-spaces .sidebar-section-header", ".sidebar-spaces .sidebar-section-footer", ".sidebar-spaces .sidebar-section-footer .sidebar-btn-right", ".sidebar-agents .sidebar-section-header", ".sidebar-footer .sidebar-collapse-btn"]) {
    const box = (await page.locator(sel).first().boundingBox())!;
    expect(box.y, sel).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, sel).toBeLessThanOrEqual(vh + 0.5);
  }
  const sbScrolls = await page.locator(".sidebar").evaluate((el) => el.scrollHeight > el.clientHeight + 1);
  expect(sbScrolls, "サイドバー全体はスクロールしない").toBe(false);
});

test("区画の境目: ドラッグ・キー・読み込み直しで配分が同じ。最小を割らない", async ({ page, appServer }) => {
  await addWorkspaces(appServer, 15);
  await openApp(page, appServer);
  const divider = page.locator(".sidebar-section-divider");
  const spaces = () => height(page, ".sidebar-spaces");
  const agents = () => height(page, ".sidebar-agents");
  // キー: End = agents が最小・Home = spaces が最小。
  await divider.focus();
  await page.keyboard.press("End");
  const aMin = await agents();
  expect(aMin).toBeGreaterThan(60); // 見出し＋2 行分が残る（0 に潰れない）
  await page.keyboard.press("ArrowDown");
  expect(Math.abs((await agents()) - aMin), "最小より小さくならない").toBeLessThan(1.5);
  await page.keyboard.press("Home");
  const sMin = await spaces();
  expect(sMin).toBeGreaterThan(60);
  await page.keyboard.press("ArrowUp");
  expect(Math.abs((await spaces()) - sMin)).toBeLessThan(1.5);
  // ↓ で 24px 動く。
  const s0 = await spaces();
  await page.keyboard.press("ArrowDown");
  await expect.poll(async () => Math.round((await spaces()) - s0)).toBe(24);
  // ドラッグで大きく動かしても最小を割らない。
  const box = (await divider.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + 20, page.viewportSize()!.height - 2);
  await page.mouse.up();
  expect(await agents()).toBeGreaterThanOrEqual(aMin - 1.5);
  // 読み込み直しで同じ配分（保存）。
  const before = await spaces();
  const next = await reload(page);
  expect(Math.abs((await height(next, ".sidebar-spaces")) - before)).toBeLessThan(2);
  // Enter で自動へ戻り、読み込み直しても自動のまま。
  await next.locator(".sidebar-section-divider").focus();
  await next.keyboard.press("Enter");
  await expect(next.locator(".sidebar-spaces")).not.toHaveAttribute("style", /flex/);
  const reloaded = await reload(next);
  await expect(reloaded.locator(".sidebar-spaces")).not.toHaveAttribute("style", /flex/);
});

test("見出しを押して畳む・開く: 印・aria-expanded・片方が空きを使う・両方畳むと境目が消える・読み込み直しで同じ", async ({ page, appServer }) => {
  await openApp(page, appServer);
  const agentsH0 = await height(page, ".sidebar-agents");
  await toggle(page, "spaces").click();
  await expect(toggle(page, "spaces")).toHaveAttribute("aria-expanded", "false");
  await expect(toggle(page, "spaces")).toContainText("▸");
  await expect(page.locator(".sidebar-spaces .sidebar-section-body")).toBeHidden();
  await expect.poll(() => height(page, ".sidebar-agents")).toBeGreaterThan(agentsH0 + 40); // agents が空きを使う
  await expect(page.locator(".sidebar-section-divider")).toHaveCount(0);
  await toggle(page, "agents").click();
  await expect(toggle(page, "agents")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".sidebar-section-divider")).toHaveCount(0);
  // 読み込み直しても両方畳んだまま。
  const next = await reload(page);
  await expect(toggle(next, "spaces")).toHaveAttribute("aria-expanded", "false");
  await expect(toggle(next, "agents")).toHaveAttribute("aria-expanded", "false");
  await toggle(next, "spaces").click();
  await expect(toggle(next, "spaces")).toHaveAttribute("aria-expanded", "true");
  await expect(next.locator(".sidebar-spaces .sidebar-section-body")).toBeVisible();
});

test("畳んだ見出しに件数が出て、agents の入力待ちは印で分かる", async ({ page, appServer }) => {
  await addWorkspaces(appServer, 2);
  await openApp(page, appServer);
  await toggle(page, "spaces").click();
  await expect(toggle(page, "spaces").locator(".sidebar-section-count")).toHaveText("3");
  await launchBlockedAgent(appServer);
  await expect(page.locator('.sidebar-agents .sidebar-state-icon[data-state="blocked"]').first()).toBeVisible({ timeout: 15_000 });
  await toggle(page, "agents").click();
  await expect(toggle(page, "agents").locator(".sidebar-section-count")).toHaveText("1");
  await expect(toggle(page, "agents").locator('.sidebar-state-icon[data-state="blocked"]')).toBeVisible();
});

test("操作のキー（prefix+shift+b・prefix+shift+a）で畳む・開く", async ({ page, appServer }) => {
  await openApp(page, appServer);
  await focusTerminal(page);
  await prefixKey(page, "Shift+B");
  await expect(toggle(page, "spaces")).toHaveAttribute("aria-expanded", "false");
  await prefixKey(page, "Shift+A");
  await expect(toggle(page, "agents")).toHaveAttribute("aria-expanded", "false");
  await prefixKey(page, "Shift+B");
  await expect(toggle(page, "spaces")).toHaveAttribute("aria-expanded", "true");
});

test("サイドバー全体を畳むと、区画の折りたたみに関わらず全部のアイコンが出る", async ({ page, appServer }) => {
  await addWorkspaces(appServer, 2);
  await openApp(page, appServer);
  await toggle(page, "spaces").click();
  await toggle(page, "agents").click();
  await focusTerminal(page);
  await prefixKey(page, "b");
  await expect(page.locator(".sidebar")).toHaveClass(/sidebar-collapsed/);
  await expect(page.locator(".sidebar-spaces .sidebar-row")).toHaveCount(3);
  await expect(page.locator(".sidebar-section-toggle")).toHaveCount(0);
});

test("畳んだ区画の中にあったフォーカスは見出しへ移る。並び順のボタンは開閉を起こさない", async ({ page, appServer }) => {
  await openApp(page, appServer);
  const sort = page.locator(".sidebar-spaces .sidebar-sort-btn");
  const before = await sort.textContent();
  await sort.click();
  await expect(sort).not.toHaveText(before!);
  await expect(toggle(page, "spaces")).toHaveAttribute("aria-expanded", "true");
  // 区画の中（並び順のボタン）にフォーカスがあるまま、操作のキーで畳む。
  await sort.focus();
  await page.keyboard.press("Control+b");
  await page.keyboard.press("Shift+B");
  await expect(toggle(page, "spaces")).toHaveAttribute("aria-expanded", "false");
  await expect(toggle(page, "spaces")).toBeFocused();
});
