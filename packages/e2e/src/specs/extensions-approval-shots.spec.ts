import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { makeRepoFixture, openRepoWorkspace, type RepoFixture } from "../support/extensions.js";
import { focusTerminal, prefixKey } from "../support/keys.js";

/**
 * 承認の画面のスクリーンショット（レビュー用。`SODA_E2E_SHOTS=<出力先ディレクトリ>` を渡したときだけ撮る。明るい配色と暗い配色）。判定はしない（撮るだけ）。
 * 撮る場面: 承認待ちの行・承認のダイアログ（長いコマンド・script-html の注意つき）・承認した後・「承認しない」の後・登録が変わって承認待ちへ戻ったとき。
 */
const OUT = process.env["SODA_E2E_SHOTS"];
test.skip(OUT === undefined, "SODA_E2E_SHOTS を渡したときだけ撮る");
test.use({ extensionsInternal: { timings: { backoffMinMs: 20, backoffMaxMs: 40, approvalsPollMs: 200 } }, viewport: { width: 1000, height: 1100 } });

const repos: RepoFixture[] = [];
test.afterEach(async () => {
  for (const r of repos.splice(0)) await rm(r.dir, { recursive: true, force: true });
});

const settingsDialog = (page: Page) => page.locator("dialog.settings-dialog");
const approvalDialog = (page: Page) => page.locator("dialog[data-ext-approval-dialog]");
const row = (page: Page, id: string) => settingsDialog(page).locator(`[data-ext-id="${id}"]`);

async function scenario(page: Page, appServer: AppServer, theme: "light" | "dark"): Promise<void> {
  const shot = async (name: string): Promise<void> => {
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT!, `${name}-${theme}.png`) });
  };
  const r = await makeRepoFixture("repo");
  repos.push(r);
  const long = r.command("deploy", "ビルドして配布する <b>x</b> а ");
  const entries = (cmd: string) => [
    { id: "deploy", command: cmd + "q".repeat(Math.max(0, 900 - cmd.length)), description: "ビルドして配布する拡張", allow: ["script-html"] },
    { id: "hello", command: r.command("hello"), description: "あいさつを出す" },
  ];
  await r.write(entries(long), 0o660);
  const client = await appServer.openClient();
  await client.request("prefs.set", { patch: { theme: theme === "light" ? "catppuccin-latte" : "dracula", themeAuto: false } });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await openRepoWorkspace(appServer, r.root);
  await expect(page.locator(".toast-sticky")).toContainText("承認を待っています（2 件）");
  await shot("1-toast");
  await focusTerminal(page);
  await prefixKey(page, "s");
  await expect(settingsDialog(page)).toHaveAttribute("open", "");
  await settingsDialog(page).locator("nav.settings-menu button", { hasText: "拡張" }).click();
  await shot("2-settings-pending-rows");
  await row(page, "deploy").locator("[data-ext-review]").click();
  await expect(approvalDialog(page)).toHaveAttribute("open", "");
  await shot("3-dialog-long-command-script-html");
  await page.locator("[data-ext-approval-deny]").click(); // 「承認しない」→ 次の 1 件（hello）
  await expect(approvalDialog(page).locator("[data-ext-approval-id]")).toContainText("hello");
  await shot("4-dialog-next-of-two");
  await expect(page.locator("[data-ext-approval-approve]")).toBeEnabled({ timeout: 5000 });
  await page.locator("[data-ext-approval-approve]").click();
  await expect(approvalDialog(page)).not.toHaveAttribute("open", "");
  await expect(row(page, "hello").locator("[data-ext-state-text]")).toContainText("動作中", { timeout: 10_000 });
  await row(page, "deploy").scrollIntoViewIfNeeded();
  await shot("5-after-approve-and-deny");
  // 登録が変わって承認待ちへ戻る（hello の登録を書き換えて読み直す）。
  await r.write(
    [
      { id: "deploy", command: r.command("deploy") + "x".repeat(10), description: "ビルドして配布する拡張", allow: ["script-html"] },
      { id: "hello", command: `${r.command("hello")} --changed`, description: "あいさつを出す" },
    ],
    0o660,
  );
  await settingsDialog(page).locator("[data-ext-reload]").click();
  await expect(row(page, "hello").locator("[data-ext-state-text]")).toContainText("承認待ち", { timeout: 10_000 });
  await shot("6-registration-changed-back-to-pending");
  await row(page, "hello").locator("[data-ext-review]").click();
  await expect(approvalDialog(page).locator("[data-ext-approval-diff]")).toBeVisible();
  await shot("7-dialog-changed-since-approved");
  client.close();
}

for (const theme of ["light", "dark"] as const) {
  test(`承認の画面の撮影（${theme}）`, async ({ page, appServer }) => {
    test.setTimeout(90_000);
    await scenario(page, appServer, theme);
  });
}
