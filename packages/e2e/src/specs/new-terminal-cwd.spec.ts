import { mkdtemp, realpath, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { watchReceivedFrames, watchSentInput, type ReceivedFrames, type SentInput } from "../support/frames.js";
import { focusTerminal, prefixKey, typeLine } from "../support/keys.js";
import { watchShownPanes } from "../support/panes.js";

/**
 * 新しい workspace・tab・分割を開く場所（20260921-new-terminal-cwd。herdr の `terminal.new_cwd`）の E2E。
 *
 * **判定はブラウザの側で行う**（条項 `.aidev/conventions/e2e-observe-browser.md`）:
 * - 開いた場所は、新しい pane で打った `printf 'pwd=%s\n' "$(pwd)"` の出力を **ブラウザが受けたフレーム**（`watchReceivedFrames`）で読む。
 *   打った入力のエコーには `pwd=/` が現れないので、エコーを出力と取り違えない。
 * - 新しい pane の id は **ブラウザが送った `client.view`**（`watchShownPanes`）で知り、ブラウザがその pane を描いたのを待ってから打つ
 *   （描いた時点で焦点と入力の関所もその pane へ移っている。`support/panes.ts`）。
 * - `cd` の合図は `printf 'cd-%s\n' <tag>` の**実行した結果にだけ出る印**（`echo <印>` だとエコーの時点で立ち、`cd` の前に作る競走になる。
 *   design「テストの置き方」・D90）。
 * - トーストは DOM。
 *
 * **E2E は「読み直し」を見分けない**（`cd` から作成までにエージェントの監視が `Pane.cwd` を追従させると、読み直さなくても通る）。
 * 読み直しは `composeServer.integration.test.ts` とサーバの単体で見る。分割（AC3）は以前から Linux では追従していた（research F9）ので、
 * ここでは振る舞いを固定するだけ。方針は `storageState` で `soda.prefs.v1` を先に入れる（`settings.spec.ts` の流儀）。AC-I3 だけは
 * ダイアログをキーで操作して選ぶ。
 */

const tempDirs: string[] = [];

test.afterEach(async () => {
  for (const dir of tempDirs) await rm(dir, { recursive: true, force: true });
  tempDirs.length = 0;
});

/** 一時ディレクトリ（`pwd` と突き合わせるので実体のパス）。 */
async function tempDir(tag: string): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), `soda-e2e-cwd-${tag}-`)));
  tempDirs.push(dir);
  return dir;
}

interface Opened {
  context: BrowserContext;
  page: Page;
  frames: ReceivedFrames;
  shown: () => string[];
  /** ブラウザが送った INPUT（送った順）。 */
  sent: () => SentInput[];
}

/** 新しいブラウザで開く。`prefs` があれば `soda.prefs.v1` に入れておく（無ければ何も設定していない利用者）。 */
async function openBrowser(browser: Browser, appServer: AppServer, prefs?: Record<string, unknown>): Promise<Opened> {
  const context = await browser.newContext(
    prefs
      ? { storageState: { cookies: [], origins: [{ origin: appServer.origin, localStorage: [{ name: "soda.prefs.v1", value: JSON.stringify(prefs) }] }] } }
      : {},
  );
  const page = await context.newPage();
  const frames = await watchReceivedFrames(page); // goto の前に（CDP の Network.enable より前の接続は見えない）
  const shown = await watchShownPanes(page);
  const sent = await watchSentInput(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await expect.poll(shown, { timeout: 10_000 }).not.toEqual([]);
  return { context, page, frames, shown, sent };
}

/** ブラウザが受けた、その pane の画面（SNAPSHOT と OUTPUT。購読より前に出た分は SNAPSHOT に入る）。 */
function seen(o: Opened, paneId: string): string {
  return [...o.frames.snapshots(0, paneId), o.frames.output(0, paneId)].join("\n");
}

/** 焦点の pane で `cd` し、実行されたことをブラウザが受けたフレームで待つ。 */
async function cdIn(o: Opened, paneId: string, dir: string, tag: string): Promise<void> {
  await typeLine(o.page, `cd '${dir}' && printf 'cd-%s\\n' ${tag}`);
  await expect.poll(() => seen(o, paneId), { message: `cd-${tag} がブラウザに届く`, timeout: 10_000 }).toContain(`cd-${tag}`);
}

/** `action` で新しい pane を開き、ブラウザがそれを描いたのを待って id を返す。 */
async function openNewPane(o: Opened, action: () => Promise<void>): Promise<string> {
  const before = new Set(o.shown());
  await action();
  await expect.poll(() => o.shown().filter((id) => !before.has(id)).length, { message: "新しい pane が描かれる", timeout: 10_000 }).toBe(1);
  return o.shown().find((id) => !before.has(id))!;
}

/** 焦点の pane（`paneId`）で `pwd` を打ち、その場所であることをブラウザが受けたフレームで確かめる。 */
async function expectPwd(o: Opened, paneId: string, expected: string, message: string): Promise<void> {
  await typeLine(o.page, `printf 'pwd=%s\\n' "$(pwd)"`);
  await expect.poll(() => seen(o, paneId), { message, timeout: 10_000 }).toContain(`pwd=${expected}\r\n`);
}

const newTab = (page: Page) => async () => {
  await prefixKey(page, "c");
  await page.keyboard.press("Enter"); // tab の名前は既定のまま
};
const split = (page: Page) => () => prefixKey(page, "v");
const newWorkspace = (page: Page) => () => prefixKey(page, "N");

test("引き継ぐ（何も設定していない利用者の既定）：cd した先で新しい tab・分割・workspace が開く（AC1〜AC4）", async ({ browser, appServer }) => {
  test.setTimeout(60_000); // 3 つの作成を順に通すので、既定の 30 秒では混んだマシンで足りない
  const o = await openBrowser(browser, appServer); // 何も設定していない＝既定（AC4）
  const p1 = o.shown()[0]!;
  const a = await tempDir("a");
  const b = await tempDir("b");
  const c = await tempDir("c");
  await focusTerminal(o.page);

  // AC2：新しい tab。以前はその workspace を作った場所（＝サーバを起動した場所）で開いていた。
  await cdIn(o, p1, a, "a");
  const tabPane = await openNewPane(o, newTab(o.page));
  await expectPwd(o, tabPane, a, "新しい tab は cd した先で開く");

  // AC3：分割。新しい tab の pane で別の場所へ移ってから分割する（開いた場所 a ではなく、いまの場所 b）。
  await cdIn(o, tabPane, b, "b");
  const splitPane = await openNewPane(o, split(o.page));
  await expectPwd(o, splitPane, b, "分割した pane は cd した先で開く");

  // AC1：新しい workspace。焦点の pane（分割した pane）で別の場所 c へ移ってから作る——以前の振る舞い（サーバを起動した場所）とも、
  // 同じ tab のもう 1 つの pane（b にいる）とも見分けられる。
  await cdIn(o, splitPane, c, "c");
  const wsPane = await openNewPane(o, newWorkspace(o.page));
  await expectPwd(o, wsPane, c, "新しい workspace は焦点の pane のいまの場所で開く");
  await o.context.close();
});

// 方針は共有の設定（サーバが持つ。20260927-cli-mode）。**1 つのサーバの中では、最初のブラウザが移した値が後のブラウザの localStorage に勝つ**
// （「サーバに無い項目だけを移す」。`PrefsSync`）ので、方針ごとに別のサーバ（＝別のテスト）で確かめる。

test("ホームを選ぶと、新しい tab はホームで開く（AC6）", async ({ browser, appServer }) => {
  test.setTimeout(60_000);
  const elsewhere = await tempDir("elsewhere");
  const home = await openBrowser(browser, appServer, { newCwdPolicy: "home" });
  await focusTerminal(home.page);
  await cdIn(home, home.shown()[0]!, elsewhere, "h");
  const homePane = await openNewPane(home, newTab(home.page));
  await expectPwd(home, homePane, await realpath(homedir()), "ホームで開く");
  await home.context.close();
});

test("サーバを起動した場所を選ぶと、分割はそこで開く（cd した先ではない。AC7）", async ({ browser, appServer }) => {
  test.setTimeout(60_000);
  const elsewhere = await tempDir("elsewhere");
  // サーバを起動した場所（E2E のサーバはテストのプロセスの中で動くので `process.cwd()`。appServer.ts）。**分割で見分ける**——
  // 新しい tab・workspace は以前からそこで開いていたが、分割は以前なら元の pane の記録された場所で開いていた。その記録が `cd` した先へ
  // 追従した（エージェントの監視が `Pane.cwd` を書き換えた）のを**サーバの状態として**待ってから分割する（前提を作るための確認。条項が
  // 認めるテストのクライアントの使い方）——待たないと、以前の振る舞いでも記録がまだ起動した場所のままで通りうる。
  const current = await openBrowser(browser, appServer, { newCwdPolicy: "current" });
  const client = await appServer.openClient();
  const source = current.shown()[0]!;
  await focusTerminal(current.page);
  await cdIn(current, source, elsewhere, "c");
  await client.waitForEvent("pane.updated", (e) => e.data.pane.id === source && e.data.pane.cwd === elsewhere, 10_000);
  const currentPane = await openNewPane(current, split(current.page));
  await expectPwd(current, currentPane, await realpath(process.cwd()), "サーバを起動した場所で開く（cd した先ではない）");
  await current.context.close();
});

test("指定した場所を選ぶと、新しい workspace はそこで開く（AC8）", async ({ browser, appServer }) => {
  test.setTimeout(60_000);
  // `~` の展開と相対パスの拒否はサーバの単体（newCwd.test.ts）。
  const picked = await tempDir("picked");
  const path = await openBrowser(browser, appServer, { newCwdPolicy: "path", newCwdPath: picked });
  await focusTerminal(path.page);
  const pathPane = await openNewPane(path, newWorkspace(path.page));
  await expectPwd(path, pathPane, picked, "指定した場所で開く");
  await path.context.close();
});

test("指定した場所が使えなければ、知らせて以前と同じ場所で開く（AC9）", async ({ browser, appServer }) => {
  const missing = join(await tempDir("gone"), "missing");
  const o = await openBrowser(browser, appServer, { newCwdPolicy: "path", newCwdPath: missing });
  await focusTerminal(o.page);
  const tabPane = await openNewPane(o, newTab(o.page));
  await expect(o.page.locator(".toast", { hasText: "新しく開く場所が使えないため、代わりの場所で開きました" })).toBeVisible({ timeout: 5000 });
  // 新しい tab の以前の場所＝その workspace の場所（サーバが起動時に作った workspace なので、サーバを起動した場所）。
  await expectPwd(o, tabPane, await realpath(process.cwd()), "その workspace の場所で開く");
  await o.context.close();
});

test("キーだけで「指定した場所」を選んでパスを入れ、閉じると、新しい tab がそこで開く（AC-I3・AC-I5）", async ({ browser, appServer }) => {
  const picked = await tempDir("keys");
  const o = await openBrowser(browser, appServer);
  const p1 = o.shown()[0]!;
  const dialog = o.page.locator("dialog.settings-dialog");
  const active = () =>
    o.page.evaluate(() => {
      const el = document.activeElement as HTMLInputElement | null;
      return el ? { name: el.name, value: el.value, type: el.type } : null;
    });
  await focusTerminal(o.page);
  await prefixKey(o.page, "s");
  await expect(dialog).toHaveAttribute("open", "");
  const sentWhileOpen = o.sent().length; // prefix（Ctrl+B）とその次のキーは端末へ送らない（KeyRouter が消費する）

  // Tab で「新しく開く場所」のラジオの組に入る（組の中の選ばれた行に止まる）。
  for (let i = 0; i < 20 && (await active())?.name !== "settings-new-cwd"; i++) await o.page.keyboard.press("Tab");
  expect(await active(), "ラジオの組に入り、既定の「引き継ぐ」に止まる").toEqual({ name: "settings-new-cwd", value: "follow", type: "radio" });
  // 矢印で「指定した場所」まで選ぶ（ホーム → 起動した場所 → 指定した場所）。選んだ時点で保存され、入力欄が使えるようになる。
  for (let i = 0; i < 3; i++) await o.page.keyboard.press("ArrowDown");
  await expect(dialog.locator('input[name="settings-new-cwd"]:checked')).toHaveValue("path");
  await o.page.keyboard.press("Tab");
  expect((await active())?.type, "Tab で入力欄へ").toBe("text");
  await o.page.keyboard.type(picked);
  await o.page.keyboard.press("Enter");
  await o.page.keyboard.press("Escape");
  await expect(dialog).not.toHaveAttribute("open", "");

  // AC-I5：ダイアログの中で押したキー（Tab・矢印・文字・Enter・Esc）は、ブラウザから端末へ 1 つも送られていない。
  expect(o.sent().slice(sentWhileOpen), "ダイアログの間に INPUT を送っていない").toEqual([]);
  // 閉じた後の焦点は元の pane（AC-I4）。閉じた後に打った印が p1 に届けば、それより前に送られた文字も届き終えている（同じ接続・同じ
  // PTY を順に通る）——その時点で p1 の画面にパスが無いことを見る。
  await typeLine(o.page, `printf 'after-%s\\n' dialog`);
  await expect.poll(() => seen(o, p1), { message: "閉じた後の入力は p1 へ届く", timeout: 10_000 }).toContain("after-dialog");
  expect(o.sent().slice(sentWhileOpen).length, "対照：閉じた後に打った文字は INPUT として見えている（観測の手段が生きている）").toBeGreaterThan(0);
  expect(seen(o, p1), "パスが端末へ漏れていない").not.toContain(picked);

  const tabPane = await openNewPane(o, newTab(o.page));
  await expectPwd(o, tabPane, picked, "キーで入れた場所で開く");
  await o.context.close();
});
