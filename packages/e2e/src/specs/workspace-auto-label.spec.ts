import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import type { ServerEvent } from "@sodashitsu/protocol";
import { watchReceivedEvents, watchReceivedFrames, type ReceivedFrames } from "../support/frames.js";
import { focusTerminal, prefixKey, typeLine } from "../support/keys.js";
import { watchShownPanes } from "../support/panes.js";

/**
 * workspace の自動の名前（20260921-workspace-auto-label。herdr の自動の workspace 名）の E2E。
 *
 * **判定はブラウザの側で行う**（条項 `.aidev/conventions/e2e-observe-browser.md`）:
 * - 名前は **DOM**（サイドバーの spaces 欄の `.sidebar-label`・goto の一覧の行）。
 * - 「最初から自動の名前で出る（「1」を経ない）」は、**ほかのブラウザが受けた `workspace.created` の JSON のイベント**（`watchReceivedEvents`）の
 *   `label` で見る——DOM だけでは、一瞬「1」が出て直ったのかを見分けられない。
 * - `cd` の合図は `printf 'cd-%s\n' <tag>` の実行した結果にだけ出る印（前の work の `new-terminal-cwd.spec.ts` と同じ。エコーでは立たない）。
 *
 * agents 欄・モバイル・通知・ブラウザのタブの題名は、同じ `Workspace.label` をそのまま読むので読解で確かめる（design の AC8）。
 */

const run = promisify(execFile);
const tempDirs: string[] = [];

test.afterEach(async () => {
  for (const dir of tempDirs) await rm(dir, { recursive: true, force: true });
  tempDirs.length = 0;
});

interface Opened {
  context: BrowserContext;
  page: Page;
  frames: ReceivedFrames;
  events: () => ServerEvent[];
  shown: () => string[];
}

async function openBrowser(browser: Browser, appServer: AppServer): Promise<Opened> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const frames = await watchReceivedFrames(page); // goto の前に（CDP の Network.enable より前の接続は見えない）
  const events = await watchReceivedEvents(page);
  const shown = await watchShownPanes(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await expect.poll(shown, { timeout: 10_000 }).not.toEqual([]);
  return { context, page, frames, events, shown };
}

/** サイドバーの spaces 欄の名前（上から）。 */
const spaceLabels = (page: Page) => page.locator(".sidebar-spaces .sidebar-row .sidebar-label");

/** ブラウザが受けた、その pane の画面（SNAPSHOT と OUTPUT）。 */
function seen(o: Opened, paneId: string): string {
  return [...o.frames.snapshots(0, paneId), o.frames.output(0, paneId)].join("\n");
}

/**
 * 既定の workspace（起動した場所＝テストのプロセスの `process.cwd()`。appServer.ts）の自動の名前の期待値＝このリポジトリの根のフォルダ名。
 * E2E は git のリポジトリの中で、git のある環境で走らせる前提（名前の規則は git のコマンドを使わないが、期待値を求めるのに使う）。
 */
async function defaultWorkspaceName(): Promise<string> {
  try {
    const { stdout } = await run("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd() });
    return basename(stdout.trim());
  } catch (err) {
    throw new Error(`E2E は git のリポジトリの中で git のある環境で走らせる（既定の workspace の名前の期待値を求めるため）: ${String(err)}`);
  }
}

/** 一時ディレクトリに git のリポジトリを作り、そのサブディレクトリを返す（git のコマンドは前提を作るためだけ。名前の規則は使わない）。 */
async function repoWithSubdir(): Promise<{ repo: string; sub: string }> {
  const base = await realpath(await mkdtemp(join(tmpdir(), "soda-e2e-label-")));
  tempDirs.push(base);
  const repo = join(base, "label-repo");
  const sub = join(repo, "pkg", "deep");
  await mkdir(sub, { recursive: true });
  await run("git", ["init", "-q"], { cwd: repo });
  return { repo, sub };
}

test("既定の workspace と、リポジトリのサブディレクトリで開いた workspace が、どのブラウザにも最初から根の名前で出る（AC1・AC4・AC8・AC9）", async ({
  browser,
  appServer,
}) => {
  test.setTimeout(60_000); // ブラウザを 2 つ開き、goto まで通すので、既定の 30 秒では混んだマシンで足りない
  const defaultName = await defaultWorkspaceName();
  const { repo, sub } = await repoWithSubdir();
  // 絞り込みは大小を問わない部分一致で pane の cwd も見るので、新しい workspace の場所に既定の名前が含まれると判定が成り立たない。
  test.skip(sub.toLowerCase().includes(defaultName.toLowerCase()), `一時ディレクトリ（${sub}）に既定の名前（${defaultName}）が含まれる`);

  const a = await openBrowser(browser, appServer);
  const b = await openBrowser(browser, appServer);
  // AC4：起動時に作った最初の workspace は、起動した場所のリポジトリの根の名前（以前は「1」）。
  await expect(spaceLabels(a.page)).toHaveText([defaultName]);
  await expect(spaceLabels(b.page)).toHaveText([defaultName]);

  // AC1：サブディレクトリへ移ってから新しい workspace（既定の「引き継ぐ」でその場所に開く）→ リポジトリの根の名前。
  // **分割した pane で移る**——既定の workspace の左上の pane で `cd` すると、その workspace の名前も移った先に追従する
  // （20260926-workspace-label-follow-cwd）。ここでは作った workspace の名前だけを見たいので、左上の pane は起動した場所に残す。
  const p1 = a.shown()[0]!;
  await focusTerminal(a.page);
  await prefixKey(a.page, "v");
  await expect.poll(() => a.shown().length, { message: "分割した pane が描かれる", timeout: 10_000 }).toBe(2);
  const p2 = a.shown().find((id) => id !== p1)!;
  await typeLine(a.page, `cd '${sub}' && printf 'cd-%s\\n' done`);
  await expect.poll(() => seen(a, p2), { message: "cd-done がブラウザに届く", timeout: 10_000 }).toContain("cd-done");
  await prefixKey(a.page, "N");
  const name = basename(repo);
  await expect(spaceLabels(a.page)).toHaveText([defaultName, name]);
  // AC9：ほかのブラウザにも再読み込みなしで出る。受けた workspace.created の名前が最初から自動の名前（「1」を経ない）。
  await expect(spaceLabels(b.page)).toHaveText([defaultName, name]);
  const created = b.events().filter((e) => e.event === "workspace.created");
  expect(created.map((e) => (e.event === "workspace.created" ? e.data.workspace : null))).toEqual([
    expect.objectContaining({ label: name, autoLabel: true }),
  ]);

  // AC8：goto の一覧にも同じ名前が出て、絞り込むと当たらない workspace が消える。
  await prefixKey(a.page, "g");
  const picker = a.page.locator(".goto-picker");
  await expect(picker).toBeVisible();
  // workspace の行（開閉の印 `.goto-picker-caret` が付く）の名前。pane の行も題名にパスを含むので、workspace の行だけを見る。
  const workspaceRows = picker.locator(".goto-picker-row:has(.goto-picker-caret) .goto-picker-label");
  await expect(workspaceRows).toHaveText([defaultName, name]);
  // 絞り込みは大小を問わない部分一致で pane の cwd も見て、一致した pane を含む workspace も親として残す。左上の pane（p1）は起動した場所
  // （既定の名前を含む）に残るので、既定の workspace はその pane でも当たる——ここでは、名前も pane の場所も当たらない新しい workspace の
  // 行が消えることだけを見る（workspace の行だけ）。**名前だけで当たること**はこの本では確かめない（どちらの workspace の名前も
  // その pane の場所に含まれ、場所の一致と見分けられない——20260926-workspace-label-follow-cwd の review.md のタスク点検ログ）。
  await picker.locator("input").fill(defaultName);
  await expect(workspaceRows).toHaveText([defaultName]);
  await a.page.keyboard.press("Escape"); // 1 回目は検索欄から離れるだけ（GotoPicker の作法。絞り込みは保たれる）
  await a.page.keyboard.press("Escape");
  await expect(picker).toBeHidden();

  await a.context.close();
  await b.context.close();
});

test("名前を付けるとほかのブラウザにも出て、キーだけで名前を消して確定すると自動の名前に戻る（AC6・AC10・AC-I2・AC-I3）", async ({
  browser,
  appServer,
}) => {
  const a = await openBrowser(browser, appServer);
  const b = await openBrowser(browser, appServer);
  const dialog = a.page.locator("dialog.name-dialog");
  // 自動の名前の規則は 1 件目で確かめた。ここでは付ける前の名前（自動の名前）に戻ることだけを見るので、期待値は画面から読む（git に依らない）。
  await expect(spaceLabels(a.page)).toHaveCount(1);
  const autoName = (await spaceLabels(a.page).textContent())!.trim();
  await focusTerminal(a.page);

  // 名前を付ける（Shift+W）→ 両方のブラウザで付けた名前。
  await prefixKey(a.page, "W");
  await expect(dialog).toHaveAttribute("open", "");
  await expect(dialog.locator("#name-dialog-hint")).toContainText("いまは自動の名前です");
  await expect(dialog.locator("#name-dialog-hint")).toContainText("空にして確定すると、自動の名前");
  await a.page.keyboard.type("mine"); // 開いた時点で今の名前は全選択されているので置き換わる
  await a.page.keyboard.press("Enter");
  await expect(spaceLabels(a.page)).toHaveText(["mine"]);
  await expect(spaceLabels(b.page)).toHaveText(["mine"]);

  // キーだけで名前を消して確定（AC-I3）→ 両方で自動の名前に戻る（AC6・AC10）。
  await prefixKey(a.page, "W");
  await expect(dialog).toHaveAttribute("open", "");
  await expect(dialog.locator("#name-dialog-hint")).toHaveText("空にして確定すると、自動の名前（リポジトリ名かフォルダ名）に戻ります。");
  await a.page.keyboard.press("Backspace"); // 全選択されている名前を消す
  await a.page.keyboard.press("Enter");
  await expect(spaceLabels(a.page)).toHaveText([autoName]);
  await expect(spaceLabels(b.page)).toHaveText([autoName]);
  const updated = b.events().flatMap((e) => (e.event === "workspace.updated" ? [e.data.workspace] : []));
  expect(updated.at(-1)).toMatchObject({ label: autoName, autoLabel: true });

  await a.context.close();
  await b.context.close();
});
