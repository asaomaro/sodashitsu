import { rm } from "node:fs/promises";
import type { Page } from "@playwright/test";
import type { ExtensionListResult } from "@sodashitsu/protocol";
import { askFixture, runAsk } from "../support/ask.js";
import { dialog as askDialog, setup as askSetup } from "../support/askForm.js";
import type { AppServer } from "../support/appServer.js";
import { watchSentInput } from "../support/frames.js";
import { expect, test } from "../support/fixtures.js";
import { makeRepoFixture, openRepoWorkspace, watchTextFrames, type ProjectEntry, type RepoFixture } from "../support/extensions.js";
import { focusTerminal, prefixKey } from "../support/keys.js";

/**
 * プロジェクトの拡張と承認（20261007-ext-host PR3。AC22・AC29・AC30・AC-I1〜AC-I5）。
 *
 * **判定はブラウザの側で行う**（条項 `.aidev/conventions/e2e-observe-browser.md`）: トースト・ダイアログ・一覧・フォーカスは **DOM**、ブラウザが送った
 * `extension.approve` の `digest` と、端末へ送った入力は **CDP のフレーム**。拡張が実行されたかは、**拡張が起動のたびに書く実行の印のファイル**（サーバ側の状態の確認。AC18）。
 * テスト自身のクライアントは前提（workspace を開く・サーバ側の `extension.list`）にだけ使い、画面の反映の合図にはしない。
 * 一時のリポジトリ（`.git/HEAD`・`.soda/extensions.json`）を作る。**このリポジトリには `.soda/` を作らない。**
 */
test.use({ extensionsInternal: { timings: { backoffMinMs: 20, backoffMaxMs: 40, approvalsPollMs: 200 } } });

const repos: RepoFixture[] = [];
test.afterEach(async () => {
  for (const r of repos.splice(0)) await rm(r.dir, { recursive: true, force: true });
});
async function repo(name = "repo"): Promise<RepoFixture> {
  const r = await makeRepoFixture(name);
  repos.push(r);
  return r;
}

const approvalDialog = (page: Page) => page.locator("dialog[data-ext-approval-dialog]");
const toast = (page: Page) => page.locator(".toast-sticky");
const deny = (page: Page) => page.locator("[data-ext-approval-deny]");
const approve = (page: Page) => page.locator("[data-ext-approval-approve]");
const settingsDialog = (page: Page) => page.locator("dialog.settings-dialog");
const row = (page: Page, id: string) => settingsDialog(page).locator(`[data-ext-id="${id}"]`);
const stateText = (page: Page, id: string) => row(page, id).locator("[data-ext-state-text]");

async function openApp(page: Page, appServer: AppServer): Promise<void> {
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
}
async function openSettings(page: Page): Promise<void> {
  await focusTerminal(page);
  await prefixKey(page, "s");
  await expect(settingsDialog(page)).toHaveAttribute("open", "");
}
const active = (page: Page): Promise<string> => page.evaluate(() => `${document.activeElement?.tagName}.${document.activeElement?.className}#${document.activeElement?.id}`);
/** サーバ側の一覧（テスト自身のクライアント。前提・サーバ側の確認用）。 */
async function serverList(appServer: AppServer): Promise<ExtensionListResult> {
  const c = await appServer.openClient();
  try {
    return await c.request("extension.list", {});
  } finally {
    c.close();
  }
}
const serverInfo = async (appServer: AppServer, id: string) => (await serverList(appServer)).extensions.find((e) => e.id === id && e.scope === "project");

/** 1024 文字・`<b>x</b>`・ASCII でない文字（キリル文字の а）を含む、長いコマンド。 */
function longCommand(r: RepoFixture, id: string): string {
  const head = r.command(id, "<b>x</b> а ");
  return head + "p".repeat(1024 - head.length);
}

test("(1) 承認待ちが出ると、消えないトースト（件数 1・［確認する］）が出る。フォーカスは動かず、ダイアログは開かない", async ({ page, appServer }) => {
  const r = await repo();
  await r.write([{ id: "a", command: r.command("a") }]);
  await openApp(page, appServer);
  await focusTerminal(page);
  const before = await active(page);
  await openRepoWorkspace(appServer, r.root);
  await expect(toast(page)).toContainText("承認を待っています（1 件）");
  await expect(toast(page).locator(".toast-action")).toHaveText("確認する");
  expect(await active(page)).toBe(before); // フォーカスは、出る前と同じ
  await expect(approvalDialog(page)).not.toHaveAttribute("open", "");
  expect(await r.starts()).toBe(0); // 承認前は実行されない
});

test("(2)(3) ［確認する］で開く: 全文のコマンド（<b> は要素にならない・高さの上限なし）・根・設定ファイル・id・固定の文言・許可・ASCII でない文字。開いた直後のフォーカスは［承認しない］で、［承認して動かす］は disabled。Enter を 2 回打っても承認にならない", async ({ page, appServer }) => {
  const r = await repo();
  const command = longCommand(r, "a");
  expect(command).toHaveLength(1024);
  await r.write([{ id: "a", command, description: "作者の説明 <i>x</i>" }]);
  await openApp(page, appServer);
  await openRepoWorkspace(appServer, r.root);
  await toast(page).locator(".toast-action").click();
  const dlg = approvalDialog(page);
  await expect(dlg).toHaveAttribute("open", "");
  const pre = dlg.locator("[data-ext-approval-command]");
  expect(await pre.textContent()).toBe(command);
  await expect(pre.locator("b")).toHaveCount(0);
  expect(await pre.evaluate((el) => el.scrollHeight === el.clientHeight)).toBe(true); // 内側のスクロールが無い
  await expect(dlg.locator("[data-ext-approval-root]")).toContainText(r.root);
  await expect(dlg.locator("[data-ext-approval-config]")).toContainText(r.configPath);
  await expect(dlg.locator("[data-ext-approval-id]")).toContainText("a");
  await expect(dlg.locator("[data-ext-approval-cwd]")).toContainText(r.root);
  await expect(dlg.locator("[data-ext-approval-fixed]")).toContainText("隔離されません");
  await expect(dlg.locator("[data-ext-approval-fixed]")).toContainText("後で変わっても、確認は出ません");
  await expect(dlg.locator("[data-ext-approval-allow]")).toContainText("なし");
  await expect(dlg.locator("[data-ext-approval-unresponsive]")).toContainText("素通し");
  await expect(dlg.locator("[data-ext-approval-description]")).toHaveText("作者の説明 <i>x</i>");
  await expect(dlg.locator("[data-ext-approval-description] i")).toHaveCount(0);
  await expect(dlg).toContainText("作者が書いた説明");
  await expect(dlg.locator("[data-ext-approval-nonascii]")).toContainText("а (U+0430)");
  // フォーカスと待ち。
  await expect(deny(page)).toBeFocused();
  await expect(approve(page)).toBeDisabled();
  // 開いた直後に Enter を 2 回打っても、承認にならない（押されるのは［承認しない］）。
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await serverInfo(appServer, "a"))?.state).toBe("denied");
  expect(await r.starts()).toBe(0);
  await expect(dlg).not.toHaveAttribute("open", "");
});

test("(4) 設定の節から［確認］で開き直し、［承認して動かす］→ 行が「動作中」になり、実行の印が出来る。ブラウザが送った approve の digest は、サーバの approval.digest と同じ", async ({ page, appServer }) => {
  const r = await repo();
  await r.write([{ id: "a", command: r.command("a") }]);
  const frames = await watchTextFrames(page);
  await openApp(page, appServer);
  await openRepoWorkspace(appServer, r.root);
  await expect(toast(page)).toBeVisible();
  const digest = (await serverInfo(appServer, "a"))!.approval!.digest;
  await openSettings(page);
  await expect(stateText(page, "a")).toContainText("承認待ち");
  await row(page, "a").locator("[data-ext-review]").click();
  const dlg = approvalDialog(page);
  await expect(dlg).toHaveAttribute("open", "");
  await expect(approve(page)).toBeEnabled({ timeout: 5000 }); // 1 秒後に押せる
  await approve(page).click();
  await expect(dlg).not.toHaveAttribute("open", "");
  await expect(stateText(page, "a")).toContainText("動作中", { timeout: 10_000 });
  await expect.poll(() => r.starts("a")).toBe(1);
  const sent = frames.sent().map((f) => JSON.parse(f) as { method?: string; params?: { key?: string; digest?: string } }).filter((m) => m.method === "extension.approve");
  expect(sent).toHaveLength(1);
  expect(sent[0]!.params!.digest).toBe(digest);
  // 設定の画面は、ダイアログの開閉のあとも残っている。
  await expect(settingsDialog(page)).toHaveAttribute("open", "");
});

test("(5)(6)(7) 登録を書き換えて読み直す → トースト・ダイアログに「前に承認した登録からの変更」。開いたまま書き換えると「登録が変わりました」で中身が替わり、待ちとフォーカスがやり直される。Esc は［後で］で、同じ登録のトーストは出し直されない", async ({ page, appServer }) => {
  const r = await repo();
  await r.write([{ id: "a", command: r.command("a") }]);
  await openApp(page, appServer);
  await openRepoWorkspace(appServer, r.root);
  await expect.poll(async () => (await serverInfo(appServer, "a"))?.state).toBe("pending");
  const first = (await serverInfo(appServer, "a"))!;
  void first;
  const client = await appServer.openClient();
  // 画面から承認する。
  await toast(page).locator(".toast-action").click();
  await expect(approve(page)).toBeEnabled({ timeout: 5000 });
  await approve(page).click();
  await expect.poll(() => r.starts("a")).toBe(1);
  // (5) 登録を書き換えて読み直す → 止まって pending。トースト。ダイアログに変更の前と後・記録が残っている旨。
  await r.write([{ id: "a", command: `${r.command("a")} --changed` }]);
  await client.request("extension.reload", {});
  await expect(toast(page)).toContainText("承認を待っています（1 件）");
  await toast(page).locator(".toast-action").click();
  const dlg = approvalDialog(page);
  await expect(dlg.locator("[data-ext-approval-diff]")).toContainText("--changed");
  await expect(dlg.locator("[data-ext-approval-diff]")).toContainText(r.command("a"));
  await expect(dlg.locator("[data-ext-approval-previous]")).toContainText("前に承認した中身の記録は、残っています");
  // (6) 開いたまま、また書き換えて読み直す → 「登録が変わりました」・中身が替わり、［承認して動かす］は disabled・フォーカスは［承認しない］。
  await expect(approve(page)).toBeEnabled({ timeout: 5000 });
  await approve(page).focus();
  await r.write([{ id: "a", command: `${r.command("a")} --changed-again` }]);
  await client.request("extension.reload", {});
  await expect(dlg.locator("[data-ext-approval-stale]")).toBeVisible();
  await expect(dlg.locator("[data-ext-approval-command]")).toContainText("--changed-again");
  await expect(approve(page)).toBeDisabled();
  await expect(deny(page)).toBeFocused();
  // (7) Esc で閉じる → pending のまま・印が増えない・フォーカスは端末へ戻る。同じ登録ではトーストが出し直されない。
  await page.keyboard.press("Escape");
  await expect(dlg).not.toHaveAttribute("open", "");
  expect((await serverInfo(appServer, "a"))!.state).toBe("pending");
  expect(await r.starts("a")).toBe(1);
  await expect(page.locator(".xterm-helper-textarea").first()).toBeFocused();
  await client.request("extension.reload", {});
  await page.waitForTimeout(500);
  await expect(toast(page)).toHaveCount(0);
  client.close();
});

test("(8) キーボードだけ: トーストの［確認する］へ Tab → Enter → Tab でボタンを巡り → Enter で決める", async ({ page, appServer }) => {
  const r = await repo();
  await r.write([{ id: "a", command: r.command("a") }]);
  await openApp(page, appServer);
  await openRepoWorkspace(appServer, r.root);
  await expect(toast(page)).toBeVisible();
  // 端末は Tab を奪うので、ページの末尾（トーストは DOM の最後）から Shift+Tab で戻って、［確認する］へ届く。
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    document.body.tabIndex = -1;
    document.body.focus();
  });
  for (let i = 0; i < 12 && !(await page.evaluate(() => document.activeElement?.classList.contains("toast-action") ?? false)); i++) await page.keyboard.press("Shift+Tab");
  await expect(toast(page).locator(".toast-action")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(approvalDialog(page)).toHaveAttribute("open", "");
  await expect(deny(page)).toBeFocused();
  await page.keyboard.press("Tab"); // ［後で］
  await expect(page.locator("[data-ext-approval-later]")).toBeFocused();
  await page.keyboard.press("Tab"); // ［承認して動かす］（disabled の間は飛ばされるので、押せるまで待ってから）
  await expect(approve(page)).toBeEnabled({ timeout: 5000 });
  await approve(page).focus();
  await page.keyboard.press("Enter");
  await expect(approvalDialog(page)).not.toHaveAttribute("open", "");
  await expect.poll(() => r.starts("a")).toBe(1);
});

test("(9) 設定の画面を開いたまま、ダイアログを開いて閉じても、設定が残っている。開いている間に打ったキーは、端末へ届かない", async ({ page, appServer }) => {
  const r = await repo();
  await r.write([{ id: "a", command: r.command("a") }]);
  const sentInput = await watchSentInput(page);
  await openApp(page, appServer);
  await openRepoWorkspace(appServer, r.root);
  await openSettings(page);
  await row(page, "a").locator("[data-ext-review]").click();
  await expect(approvalDialog(page)).toHaveAttribute("open", "");
  const n = sentInput().length;
  await page.keyboard.type("xyz");
  await page.waitForTimeout(200);
  expect(sentInput().slice(n)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(approvalDialog(page)).not.toHaveAttribute("open", "");
  await expect(settingsDialog(page)).toHaveAttribute("open", "");
  await expect(row(page, "a")).toBeVisible();
});

test("(10) 同じリポジトリの承認待ちが 2 件: 「2 件中 1 件目」で、1 件を決めると次へ。別のリポジトリの承認待ちへは替わらずに閉じる。「すべて承認」は無い", async ({ page, appServer }) => {
  const r = await repo("one");
  const other = await repo("other");
  await r.write([{ id: "a", command: r.command("a") }, { id: "b", command: r.command("b") }]);
  await other.write([{ id: "z", command: other.command("z") }]);
  await openApp(page, appServer);
  await openRepoWorkspace(appServer, r.root);
  await openRepoWorkspace(appServer, other.root, "other");
  await expect(toast(page)).toContainText("（3 件）");
  await openSettings(page);
  await row(page, "a").locator("[data-ext-review]").click();
  const dlg = approvalDialog(page);
  await expect(dlg.locator("[data-ext-approval-position]")).toContainText("2 件中 1 件目");
  await expect(dlg.getByRole("button", { name: /すべて/ })).toHaveCount(0);
  await deny(page).click();
  await expect(dlg.locator("[data-ext-approval-position]")).toContainText("2 件中 2 件目");
  await expect(dlg.locator("[data-ext-approval-id]")).toContainText("b");
  await expect(deny(page)).toBeFocused();
  await deny(page).click();
  await expect(dlg).not.toHaveAttribute("open", "");
  expect((await serverInfo(appServer, "z"))!.state).toBe("pending"); // 別のリポジトリは、決めていない
});

test("(11) ダイアログを開いて［承認して動かす］へ移ったまま、pane から sodactl ask の質問を出して閉じる → その直後、［承認して動かす］は disabled に戻り、フォーカスは［承認しない］", async ({ page, appServer }) => {
  const r = await repo();
  await r.write([{ id: "a", command: r.command("a") }]);
  const p1 = await askSetup(page, appServer);
  await openRepoWorkspace(appServer, r.root);
  await expect(toast(page)).toBeVisible();
  await toast(page).locator(".toast-action").click();
  await expect(approve(page)).toBeEnabled({ timeout: 5000 });
  await approve(page).focus();
  await expect(approve(page)).toBeFocused();
  // 質問を出す（承認のダイアログの上に重なる）。
  const fx = await askFixture();
  const run = await runAsk(appServer, p1, { title: "重なり", questions: [{ id: "q", label: "q", options: [{ value: "x", label: "x" }, { value: "y", label: "y" }] }] });
  void fx;
  await expect(askDialog(page)).toBeVisible();
  await page.keyboard.press("Escape"); // 質問を取り消して閉じる
  await expect(askDialog(page)).toHaveCount(0);
  await run.done;
  await expect(approve(page)).toBeDisabled();
  await expect(deny(page)).toBeFocused();
  expect(await r.starts()).toBe(0);
});

test("(12) workspace を全部消す → 設定の「承認の記録」にそのリポジトリの行が出て、［記録を消す］で消える", async ({ page, appServer }) => {
  const r = await repo();
  await r.write([{ id: "a", command: r.command("a") }]);
  await openApp(page, appServer);
  const ws = await openRepoWorkspace(appServer, r.root);
  await expect(toast(page)).toBeVisible();
  const info = (await serverInfo(appServer, "a"))!;
  const client = await appServer.openClient();
  // 画面（ブラウザ）から承認する。
  await openSettings(page);
  await row(page, "a").locator("[data-ext-review]").click();
  await expect(approve(page)).toBeEnabled({ timeout: 5000 });
  await approve(page).click();
  await expect(stateText(page, "a")).toContainText("動作中", { timeout: 10_000 });
  await client.request("workspace.close", { workspaceId: ws.workspaceId });
  const records = settingsDialog(page).locator("[data-ext-records]");
  await expect(records).toBeVisible({ timeout: 10_000 });
  await records.locator("summary").click();
  await expect(records.locator("[data-ext-record]")).toContainText(r.root);
  await expect(records.locator("[data-ext-record]")).toContainText("いま開いていません");
  await records.locator("[data-ext-record-delete]").click();
  await expect(records.locator("[data-ext-record]")).toHaveCount(0);
  void info;
  client.close();
});

test("(13)(14) script-html を求める登録: 固定の文 3 つと「いまは、無効です」。設定を有効にすると、開いたままで「有効です」になる。グループが書ける設定には注意。前に「承認しない」とした注意。画面の入切で切った行にも承認の有無", async ({ page, appServer }) => {
  const r = await repo();
  const entry = (command: string): ProjectEntry => ({ id: "s", command, allow: ["script-html"] });
  await r.write([entry(r.command("s"))], 0o660);
  await openApp(page, appServer);
  await openRepoWorkspace(appServer, r.root);
  await expect(toast(page)).toBeVisible();
  await openSettings(page);
  // グループが書ける → 一覧の行に注意。
  await expect(row(page, "s").locator("[data-ext-group-writable]")).toBeVisible();
  await row(page, "s").locator("[data-ext-review]").click();
  const dlg = approvalDialog(page);
  await expect(dlg.locator("[data-ext-approval-group]")).toContainText("同じグループ");
  const box = dlg.locator("[data-ext-approval-script]");
  await expect(box).toContainText("スクリプトが動く表示: ブラウザの中で、この拡張のスクリプトが動きます");
  await expect(box).toContainText("有効のときだけ動きます");
  await expect(box).toContainText("拡張からの守りではありません");
  await expect(dlg.locator("[data-ext-approval-script-state]")).toContainText("いまは、無効です");
  // 設定を有効にする（サーバの共有の設定。開いたままのダイアログに届く）。
  const client = await appServer.openClient();
  await client.request("prefs.set", { patch: { displayScriptEnabled: true } });
  await expect(dlg.locator("[data-ext-approval-script-state]")).toContainText("いまは、有効です");
  await client.request("prefs.set", { patch: { displayScriptEnabled: false } });
  await expect(dlg.locator("[data-ext-approval-script-state]")).toContainText("いまは、無効です");
  // 「承認しない」→ 別の中身に書き換え → 「前に『承認しない』とした」。
  await deny(page).click();
  await expect(dlg).not.toHaveAttribute("open", "");
  await r.write([entry(`${r.command("s")} --c`)], 0o660);
  await client.request("extension.reload", {});
  await row(page, "s").locator("[data-ext-review]").click();
  await expect(dlg.locator("[data-ext-approval-denied-before]")).toContainText("前に、別の中身を「承認しない」");
  await page.keyboard.press("Escape");
  // 画面の入切で切った行にも、承認の有無が出る。
  const sw = row(page, "s").locator("[data-ext-switch]");
  await sw.click();
  await expect(stateText(page, "s")).toContainText("無効");
  await expect(row(page, "s").locator("[data-ext-approval-status]")).toContainText("未承認");
  client.close();
});
