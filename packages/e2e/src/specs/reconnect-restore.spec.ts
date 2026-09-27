import type { WebSocketRoute } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "../support/fixtures.js";
import { routeRecordingWebSocket, watchReceivedFrames } from "../support/frames.js";
import { focusTerminal, grantClipboard, prefixKey, typeLine } from "../support/keys.js";

/**
 * AC8・AC18 の E2E（05-e2e-docs T6）。design「受け入れ基準との対応」：
 * AC8「ブラウザを閉じても、サーバの PTY とミラーは動き続ける。再接続したら client.hello の snapshot で
 * 構成が戻り、client.view の SNAPSHOT で画面と scrollback が戻る」。
 * AC18「soda serve を止めて再び起動し、ブラウザで再接続する。session.json から、workspace / tab / pane の
 * 構成・名前・レイアウト・フォーカスと各 pane の cwd（pwd で確認）が戻ることを確かめる」。
 */

test("ブラウザを閉じて（detach）再接続すると、構成と scrollback が戻る（AC8）", async ({ browser, appServer }) => {
  const client = await appServer.openClient();
  const context1 = await browser.newContext();
  const page1 = await context1.newPage();
  await page1.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page1.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page1);

  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 500 });
  const marker = `soda-e2e-before-detach-${Date.now()}`;
  await typeLine(page1, `echo ${marker}`);
  await client.waitForOutput(p1, marker);

  // prefix+q（client.detach）。design「client.detach：このブラウザの接続だけを切る」。
  // 「切り離しました」の画面が出て、自動では再接続しない（design「client.detach」）ことも確かめる。
  await prefixKey(page1, "q");
  await expect(page1.locator(".detached-view")).toBeVisible({ timeout: 3000 });
  await context1.close();

  // サーバ側の pane はまだ生きている（design「AC8：ブラウザを閉じても、サーバの PTY とミラーは動き続ける」）。
  const raw = await client.request("client.hello", { protocol: 1, kind: "desktop" });
  expect(raw.snapshot.panes.some((p) => p.id === p1)).toBe(true);

  // 別のブラウザコンテキスト（＝ページを開き直した相当）で同じサーバへ再接続する。
  const context2 = await browser.newContext();
  await grantClipboard(context2, appServer.origin);
  const page2 = await context2.newPage();
  await page2.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page2.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });

  // client.view の SNAPSHOT で画面・scrollback が戻る（AC8）ことを、**ブラウザ側の xterm.js**で
  // 実際に確かめる——サーバのミラーが持っているだけでは AC8 の主張（ブラウザに戻ること）の証拠にならない。
  // xterm.js は canvas 描画のため DOM からは読めないので、copy モードで選択・yank してクリップボードで
  // 確かめる（D93/D94 と同じ手法）。何も打っていない（再接続後の初期表示だけの）状態で確認する。
  await focusTerminal(page2);
  await prefixKey(page2, "[");
  await page2.keyboard.press("?"); // 後方検索（現在位置から上へ）
  await page2.keyboard.type(marker);
  await page2.keyboard.press("Enter");
  await page2.waitForTimeout(300);
  await page2.keyboard.press("V");
  await page2.keyboard.press("y");
  await page2.waitForTimeout(200);
  const copied = await page2.evaluate(() => navigator.clipboard.readText());
  expect(copied.trim()).toBe(marker); // detach 前に打ったコマンドの出力が、ブラウザの再接続だけで見えている

  await context2.close();
});

test("soda serve を止めて再び起動しても、workspace/tab/pane の構成と各 pane の cwd が戻る（AC18）", async ({ browser, appServer }) => {
  const client = await appServer.openClient();
  const workDir = await mkdtemp(join(tmpdir(), "soda-e2e-ac18-"));
  const created = await client.request("workspace.create", { cwd: workDir, label: "ac18-workspace" });
  await client.request("tab.rename", { tabId: created.tab.id, label: "ac18-tab" });

  const snapshotBefore = await client.request("client.hello", { protocol: 1, kind: "desktop" });
  const wsBefore = snapshotBefore.snapshot.workspaces.find((w) => w.id === created.workspace.id);
  expect(wsBefore?.label).toBe("ac18-workspace");
  expect(wsBefore?.cwd).toBe(workDir);

  await appServer.restart(); // 「soda serve を止めて再び起動」（AC18）。同じ stateDir・同じポート、新しいトークン。

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${appServer.origin}/#token=${appServer.token}`); // 再起動後も同じトークンで入れる
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });

  const client2 = await appServer.openClient();
  const snapshotAfter = await client2.request("client.hello", { protocol: 1, kind: "desktop" });
  const wsAfter = snapshotAfter.snapshot.workspaces.find((w) => w.id === created.workspace.id);
  expect(wsAfter, "再起動後も同じ id の workspace が復元される").toBeTruthy();
  expect(wsAfter?.label).toBe("ac18-workspace"); // 名前
  expect(wsAfter?.cwd).toBe(workDir); // cwd
  const tabAfter = snapshotAfter.snapshot.tabs.find((t) => t.id === created.tab.id);
  expect(tabAfter?.label).toBe("ac18-tab"); // tab の名前
  expect(tabAfter?.layout).toEqual({ type: "pane", paneId: created.pane.id }); // レイアウト（単一 pane）

  const paneAfter = snapshotAfter.snapshot.panes.find((p) => p.id === created.pane.id);
  expect(paneAfter?.status).toBe("running"); // 新しいシェルが正常に起動している
  expect(paneAfter?.cwd).toBe(workDir); // pane の cwd も戻る

  // design「pwd で確認」：実際にそのディレクトリでシェルが起動していることを、pwd の出力そのもので確かめる。
  // 復元された workspace は唯一のものなので、ブラウザは起動直後の表示（サーバの focus）でそのまま見えている。
  await client2.request("pane.subscribe", { paneId: created.pane.id, scrollbackLines: 200 });
  await focusTerminal(page);
  await typeLine(page, "pwd");
  await client2.waitForOutput(created.pane.id, workDir);

  await context.close();
});

test("切断中は端末への入力を止めて表示し、再接続後は入力が戻る（AC8・D95。親の統合 test で追加）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 200 });

  // ページ側の WebSocket を横取りして、テストから切断・再接続の拒否・許可を操作する。
  let allowConnect = true;
  let current: WebSocketRoute | null = null;
  await page.routeWebSocket(/\/ws$/, (ws) => {
    if (!allowConnect) {
      void ws.close();
      return;
    }
    current = ws;
    ws.connectToServer();
  });

  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);
  const before = `soda-before-${Date.now()}`;
  await typeLine(page, `echo ${before}`);
  await client.waitForOutput(p1, before);

  allowConnect = false;
  await (current as WebSocketRoute | null)?.close();
  const overlay = page.locator(".reconnect-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText("つながるまで入力できません");
  const lost = `soda-lost-${Date.now()}`;
  await typeLine(page, `echo ${lost}`);

  allowConnect = true;
  await expect(overlay).toBeHidden({ timeout: 15_000 });
  const after = `soda-after-${Date.now()}`;
  await typeLine(page, `echo ${after}`);
  await client.waitForOutput(p1, after);

  // 切断中の入力を溜めて後から流していたら、after より先に届いているはず（同じ接続で順に送られる）。
  // 欠けた形（先頭が失われた形）でも届いていないことを、マーカーの後半で確かめる。
  expect(client.rawOutput(p1)).not.toContain(lost.slice(4));
});

/**
 * D107（統合 review ラウンド1 で発見）：**同じページのまま**繋ぎ直した後も、表示中の pane の画面（SNAPSHOT）と出力（OUTPUT）が
 * ブラウザに届く。サーバは接続ごとに新しい clientId を振り、購読・表示（`client.view`）をその clientId に持つ。以前の Web は
 * 前の接続の `client.view` を覚えていて同じ内容を送らず、`pane.subscribe` も xterm.js を新しく作ったときしか送らなかったので、
 * 自動の再接続・つながらない試みの後の再試行・「再接続」ボタンの後は、打った文字は PTY に届くのに画面が止まっていた。上の AC8 の
 * test は新しいブラウザのコンテキスト（xterm.js も作り直す）で、D95 の test は出力をテスト自身のクライアントで見ていたので、
 * どちらもこれを捉えられなかった。ここでは**ブラウザが受けたフレーム**（support/frames.ts）を接続ごとに見る。
 */
/** SNAPSHOT の確かめで止めず、続く OUTPUT の確かめも走らせる（どちらが届かないのかを 1 回の失敗で見分けるため）。 */
const softExpect = expect.configure({ soft: true });

async function openAndEcho(page: import("@playwright/test").Page, appServer: { origin: string; token: string }, marker: string): Promise<void> {
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);
  await typeLine(page, `echo ${marker}`);
}

for (const refused of [0, 2]) {
  const title =
    refused === 0
      ? "切断して同じページのまま自動で繋ぎ直した後も、表示中の pane の画面と出力がブラウザに届く（AC8・D107）"
      : "つながらない試み（起動の途中の 503 等の代わり）を挟んで繋ぎ直した後も、表示中の pane の画面と出力がブラウザに届く（AC8・D107）";
  test(title, async ({ page, appServer }) => {
    test.setTimeout(60_000);
    const client = await appServer.openClient();
    const p1 = client.helloSnapshot()!.panes[0]!.id;
    await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 200 });
    const ws = await routeRecordingWebSocket(page);

    const before = `soda-before-drop-${Date.now()}`;
    await openAndEcho(page, appServer, before);
    await expect.poll(() => ws.frames.output(0, p1), { timeout: 10_000 }).toContain(before); // 最初の接続ではブラウザに届く

    // 接続を切る（ページ側を閉じると、Playwright がサーバ側も閉じる）。繋ぎ直しの最初の `refused` 回はつながらない。
    ws.refuseNext(refused);
    await ws.drop(0);
    const overlay = page.locator(".reconnect-overlay");
    await expect(overlay).toBeVisible();
    await expect(overlay).toBeHidden({ timeout: 30_000 });
    expect(ws.refusedCount()).toBe(refused);
    expect(ws.frames.connectionCount()).toBe(2);

    // 画面の復元：新しい接続でも、表示中の p1 の SNAPSHOT がブラウザに届く（切断の前の出力を含む。AC8）。
    await softExpect.poll(() => ws.frames.snapshots(1, p1).join("\n"), { message: "新しい接続で p1 の SNAPSHOT がブラウザに届く", timeout: 10_000 }).toContain(before);

    // 以後の出力：ブラウザから打ったコマンドは PTY に届き（以前の形でもここまでは通った）、その出力がブラウザにも届く。
    const after = `soda-after-drop-${Date.now()}`;
    await typeLine(page, `echo ${after}`);
    await client.waitForOutput(p1, after);
    await expect.poll(() => ws.frames.output(1, p1), { message: "新しい接続で p1 の OUTPUT がブラウザに届く", timeout: 10_000 }).toContain(after);
    // SNAPSHOT は新しい接続の購読の始めの 1 回だけ（同じ pane を 2 度購読して画面を描き直さない）。
    expect(ws.frames.snapshots(1, p1)).toHaveLength(1);
  });
}

test("切り離し（prefix+q）の後に「再接続」ボタンで同じページのまま繋ぎ直しても、表示中の pane の画面と出力がブラウザに届く（AC8・D107）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 200 });
  const frames = await watchReceivedFrames(page); // 実物の WebSocket（CDP の Network.webSocketFrameReceived）

  const before = `soda-before-detach-${Date.now()}`;
  await openAndEcho(page, appServer, before);
  await expect.poll(() => frames.output(0, p1), { timeout: 10_000 }).toContain(before);

  await prefixKey(page, "q");
  await expect(page.locator(".detached-view")).toBeVisible({ timeout: 3000 });
  await page.locator(".detached-view button").click(); // 「再接続」
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await expect(page.locator(".reconnect-overlay")).toBeHidden({ timeout: 15_000 });
  expect(frames.connectionCount()).toBe(2);
  await softExpect.poll(() => frames.snapshots(1, p1).join("\n"), { message: "新しい接続で p1 の SNAPSHOT がブラウザに届く", timeout: 10_000 }).toContain(before);

  await focusTerminal(page);
  const after = `soda-after-reattach-${Date.now()}`;
  await typeLine(page, `echo ${after}`);
  await client.waitForOutput(p1, after);
  await expect.poll(() => frames.output(1, p1), { message: "新しい接続で p1 の OUTPUT がブラウザに届く", timeout: 10_000 }).toContain(after);
});

test("soda serve を止めて再び起動しても、同じページのまま繋ぎ直して、表示中の pane の画面と出力がブラウザに届く（AC8・AC18・D107）", async ({ page, appServer }) => {
  test.setTimeout(60_000);
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 200 });
  const frames = await watchReceivedFrames(page);

  const before = `soda-before-restart-${Date.now()}`;
  await openAndEcho(page, appServer, before);
  await expect.poll(() => frames.output(0, p1), { timeout: 10_000 }).toContain(before);

  // サーバを止めて起動し直す（同じ state dir・同じポート。ログインのセッションは auth.json に残るので、ログインし直さずに
  // 繋がる）。止まっている間・起動の途中（`/ws` は 503）の試みはつながらず、ブラウザは間隔を空けて繋ぎ直す（D102）。
  await appServer.restart();
  const overlay = page.locator(".reconnect-overlay");
  await expect(overlay).toBeHidden({ timeout: 40_000 });
  await expect(page.locator(".login-view")).toHaveCount(0);
  const connection = frames.connectionCount() - 1;
  expect(connection).toBeGreaterThanOrEqual(1);

  const client2 = await appServer.openClient();
  expect(client2.helloSnapshot()!.panes.some((p) => p.id === p1)).toBe(true); // 同じ id の pane が復元されている（AC18）
  await client2.request("pane.subscribe", { paneId: p1, scrollbackLines: 200 });
  // 復元した pane は新しいシェルなので、画面は切断の前のものではない（AC8 の「復元されないもの」ではなく、PTY ごと新しい）——
  // SNAPSHOT が届くことだけを見る。
  await softExpect.poll(() => frames.snapshots(connection, p1).length, { message: "新しい接続で p1 の SNAPSHOT がブラウザに届く", timeout: 10_000 }).toBeGreaterThan(0);

  await focusTerminal(page);
  const after = `soda-after-restart-${Date.now()}`;
  await typeLine(page, `echo ${after}`);
  await client2.waitForOutput(p1, after);
  await expect.poll(() => frames.output(connection, p1), { message: "新しい接続で p1 の OUTPUT がブラウザに届く", timeout: 10_000 }).toContain(after);
});
