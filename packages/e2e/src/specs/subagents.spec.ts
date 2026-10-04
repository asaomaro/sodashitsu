import { mkdtemp, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import type { AppServer } from "../support/appServer.js";
import { focusTerminal, prefixKey, typeLine } from "../support/keys.js";
import type { SodaTestClient } from "../support/wsClient.js";

/**
 * 20261004-subagent-display の E2E（T16。グラフと、キー・ホイールの漏れは T21）。**実物の Claude Code は使わない**: 偽の `claude`（`exec -a claude` の
 * 長く居座るプロセス。`agent-detection.spec.ts` と同じ検出の仕組み）を pane で動かして検出させ、テスト側から、テストが立てたサーバの
 * `stateDir` の `agent-report.sock` **だけ**へ電文（フックのスクリプトが送るものと同じ 1 行の JSON）を送る（環境変数から受け口のパスを拾わない。
 * この試験を動かしている pane から継いだ `SODA_*` が、利用者のサーバへ報告を届けないように）。
 * 観測は条項 `e2e-observe-browser` に従い、ブラウザの描画（DOM・フォーカス）と、ブラウザが送ったフレーム（CDP の `framesent`）で行う。
 * テスト自身の WebSocket クライアントは、前提を作る（偽のエージェントを動かす・終わらせる）ためと、端末への入力が漏れていないことの確認（pane の出力）にだけ使う。
 */

const SESSION = "sess-e2e";

async function startFakeClaude(
  page: Page,
  appServer: AppServer,
): Promise<{ client: SodaTestClient; paneId: string }> {
  const client = await appServer.openClient();
  const paneId = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId, scrollbackLines: 4000 });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);
  const dir = await mkdtemp(join(tmpdir(), "soda-e2e-subagents-"));
  const scriptPath = join(dir, "fake-claude.sh");
  const ready = `soda-e2e-subagents-ready-${Date.now()}`;
  await writeFile(scriptPath, [`echo ${ready}`, "sleep 600"].join("\n"));
  const detected = client.waitForEvent(
    "pane.agent_status_changed",
    (e) => e.data.paneId === paneId && e.data.agent !== null,
    25_000,
  );
  // 子プロセスとして動かす（`exec` でシェルを置き換えない）。Ctrl+C で終わらせるとシェルへ戻り、検出が外れる。
  await typeLine(page, `bash -c 'exec -a claude bash ${scriptPath}'`);
  await client.waitForOutput(paneId, ready);
  await detected;
  return { client, paneId };
}

/** 受け口（テストが立てたサーバの `stateDir`）へ、種類つきの電文を 1 接続 1 行で送る（Linux・macOS の Unix socket。Windows の named pipe は対象外）。 */
function report(
  appServer: AppServer,
  paneId: string,
  body: Record<string, unknown>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const c = connect(join(appServer.stateDir, "agent-report.sock"), () =>
      c.end(`${JSON.stringify({ paneId, kind: "claude", sessionId: SESSION, ...body })}\n`),
    );
    c.on("close", () => resolve());
    c.on("error", reject);
  });
}
const startSub = (a: AppServer, p: string, id: string, extra: Record<string, unknown> = {}) =>
  report(a, p, { type: "subagent_start", agentId: id, ...extra });
const stopSub = (a: AppServer, p: string, id: string) =>
  report(a, p, { type: "subagent_stop", agentId: id });
const pending = (
  a: AppServer,
  p: string,
  description: string,
  agentType = "Explore",
  background = false,
) => report(a, p, { type: "subagent_pending", description, agentType, background });

const countBtn = (page: Page) => page.locator(".sidebar-agents .sidebar-subagent-btn");
const dialog = (page: Page) => page.locator("dialog.subagent-dialog");

test("件数のボタン: 起動で出て、増減し、0 件で消える。作業の終わりの突き合わせで直る（AC1・AC2）", async ({
  page,
  appServer,
}) => {
  const { paneId } = await startFakeClaude(page, appServer);
  await expect(countBtn(page)).toHaveCount(0); // 報告を受けていない（分からない）間は出さない
  await startSub(appServer, paneId, "a1");
  await expect(countBtn(page)).toHaveText("1", { timeout: 5000 });
  await expect(countBtn(page)).toHaveAttribute("aria-label", "サブエージェント 1 件を表示");
  await startSub(appServer, paneId, "a2");
  await expect(countBtn(page)).toHaveText("2");
  await stopSub(appServer, paneId, "a1");
  await expect(countBtn(page)).toHaveText("1");
  // 終了の報告が来なかった a2 は、作業の終わり（動いているものが無い）で外れる。
  await report(appServer, paneId, { type: "agent_stop", running: [], truncated: false });
  await expect(countBtn(page)).toHaveCount(0);
  // 動いているバックグラウンドのものは、作業の終わりの報告で足される。
  await report(appServer, paneId, {
    type: "agent_stop",
    running: [{ id: "bg1", agentType: "Plan", description: "遅い調査" }],
    truncated: false,
  });
  await expect(countBtn(page)).toHaveText("1");
});

test("ボタンを押しても pane へ移らない（焦点は p2 のまま。ブラウザが pane.focus を送らない）。一覧が開く（AC-I1・AC-I2）", async ({
  page,
  appServer,
}) => {
  const { paneId, client } = await startFakeClaude(page, appServer);
  // 別の pane（p2）へ分割して、焦点をそちらへ置く。ボタンを押しても焦点が p1 へ移らないことを、ブラウザの描画で見る。
  const p2Created = client.waitForEvent("pane.created");
  await prefixKey(page, "v");
  const p2 = (await p2Created).data.pane.id;
  expect(p2).not.toBe(paneId);
  const current = (id: string) => page.locator(`[data-pane-id="${id}"][aria-current="true"]`);
  await expect(current(p2)).toHaveCount(1); // ブラウザが p2 を現在の pane として描いている
  await expect(current(paneId)).toHaveCount(0);
  await startSub(appServer, paneId, "a1");
  await expect(countBtn(page)).toHaveText("1");
  // ブラウザが送ったフレームを CDP で見る（接続は既にあるので、有効にした後に送られるものだけを集める）。
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  const sent: string[] = [];
  cdp.on("Network.webSocketFrameSent", (e) => sent.push(e.response.payloadData));
  const focusRequests = () => sent.filter((f) => f.includes('"pane.focus"'));
  const row = page.locator(".sidebar-agents .sidebar-row").first();
  // 観測が効いていること（陽性の対照）: 行そのもの（ボタン以外）を押すと、pane.focus がブラウザから送られ、p1 が現在の pane になる。
  await row.click({ position: { x: 20, y: 6 } });
  await expect.poll(() => focusRequests().length).toBeGreaterThan(0);
  await expect(current(paneId)).toHaveCount(1);
  // p2 へ戻して（その pane の端末をクリック）、ボタンを押す。
  await page.locator(`[data-pane-id="${p2}"] .xterm-helper-textarea`).click({ force: true });
  await expect(current(p2)).toHaveCount(1);
  await new Promise((r) => setTimeout(r, 300)); // 先の押下で遅れて届くフレームを巻き込まない
  sent.length = 0;
  await countBtn(page).click();
  await expect(dialog(page)).toBeVisible();
  await new Promise((r) => setTimeout(r, 500)); // 送られるものがあれば届くのに足りる時間
  expect(focusRequests()).toEqual([]); // ボタンの click は行へ伝わらず、pane.focus を送らない
  await expect(current(p2)).toHaveCount(1); // 現在の pane は p2 のまま
  await expect(current(paneId)).toHaveCount(0);
  // 閉じて、行そのものを押せば今までどおり pane へ移る。
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await row.click({ position: { x: 20, y: 6 } });
  await expect.poll(() => focusRequests().length).toBeGreaterThan(0);
  await expect(current(paneId)).toHaveCount(1);
});

test("一覧: 種類・説明・経過時間・バックグラウンドの印。0 件の文言（開いたまま）。64 件を超えたら「ほか n 件」（AC4・AC17）", async ({
  page,
  appServer,
}) => {
  const { paneId } = await startFakeClaude(page, appServer);
  await pending(appServer, paneId, "テストを足す", "general-purpose", true);
  await startSub(appServer, paneId, "a1", { agentType: "general-purpose" });
  await startSub(appServer, paneId, "a2"); // 説明・種類なし
  await expect(countBtn(page)).toHaveText("2");
  await countBtn(page).click();
  const items = dialog(page).locator(".subagent-list-item");
  await expect(items).toHaveCount(2);
  await expect(dialog(page).locator("h2")).toContainText("サブエージェント — ");
  await expect(items.nth(0)).toContainText("general-purpose");
  await expect(items.nth(0)).toContainText("テストを足す");
  await expect(items.nth(0)).toContainText("バックグラウンド");
  await expect(items.nth(0).locator(".subagent-list-elapsed")).toHaveText(/^\d+秒$/);
  await expect(items.nth(1)).toContainText("サブエージェント"); // 種類が分からないとき
  // 開いたまま増える・減る。
  for (let i = 0; i < 70; i++) await startSub(appServer, paneId, `many${i}`);
  await expect(dialog(page).locator(".subagent-list-more")).toHaveText("ほか 8 件", {
    timeout: 8000,
  }); // 72 件のうち表示は 64 件
  await expect(items).toHaveCount(64);
  // 全部終わらせると 0 件の文言（開いたまま）。ボタンは消える。
  await report(appServer, paneId, { type: "agent_stop", running: [], truncated: false });
  await expect(dialog(page).locator(".subagent-list-empty")).toHaveText(
    "実行中のサブエージェントはありません",
  );
  await expect(dialog(page)).toBeVisible();
  await expect(countBtn(page)).toHaveCount(0);
  // 開いたボタンはもう無いので、閉じたときのフォーカスは、その行（tabindex=-1）へ戻る。
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await expect(page.locator(`.sidebar-agents [data-agent-pane="${paneId}"]`)).toBeFocused();
});

test("キーボードだけ: Tab でボタンへ → Enter で開く → ↓ で一覧がスクロール → Esc で閉じてボタンへ戻る。端末へ入力が漏れない（AC-I3・AC-I4・AC-I5）", async ({
  page,
  appServer,
}) => {
  const { paneId, client } = await startFakeClaude(page, appServer);
  for (let i = 0; i < 40; i++) await startSub(appServer, paneId, `k${i}`, { agentType: "Explore" });
  await expect(countBtn(page)).toHaveText("40");
  // サイドバーの agents の並び順のボタンから Tab 1 回で、件数のボタンへ（行は tabindex=-1 で Tab の順に入らない）。
  await page.locator(".sidebar-agents .sidebar-sort-btn").focus();
  await page.keyboard.press("Tab");
  await expect(countBtn(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog(page)).toBeVisible();
  const list = dialog(page).locator(".subagent-list");
  await expect(list).toBeFocused();
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  // 観測が効いていること（陽性の対照）: 端末にフォーカスがあるとき（一覧を開く前）に打った文字は、偽のエージェントの前面の pty がエコーして出力に出る。
  // 一覧を開いている間に漏れた入力があれば、同じ形（文字・矢印の `^[[B`）で出力に出る。
  const arrows = () => (client.rawOutput(paneId).match(/\^\[\[B/g) ?? []).length;
  const controlMarker = "CTRLQZ";
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await focusTerminal(page);
  await page.keyboard.type(controlMarker);
  await client.waitForOutput(paneId, controlMarker);
  const arrowsBefore = arrows();
  await page.keyboard.press("ArrowDown");
  await expect.poll(arrows).toBeGreaterThan(arrowsBefore);
  // 開き直す（件数のボタンへ Tab で）。
  await page.locator(".sidebar-agents .sidebar-sort-btn").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(list).toBeFocused();
  // 一覧を読むキー（文字・矢印・PageDown）は、一覧のスクロールになり、端末へは届かない。
  const marker = "ZQXJ";
  const arrowsAtOpen = arrows();
  const top = await list.evaluate((el) => el.scrollTop);
  for (const ch of marker) await page.keyboard.press(ch);
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("PageDown");
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(top);
  // ホイールも一覧のスクロールになる（キーとは別に確かめる。先頭へ戻してから回す）。
  await list.evaluate((el) => (el.scrollTop = 0));
  await list.hover();
  await page.mouse.wheel(0, 300);
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await expect(countBtn(page)).toBeFocused(); // 開いたボタンへ戻る
  await new Promise((r) => setTimeout(r, 400)); // 漏れた入力があれば、エコーが届くのに足りる時間
  expect(client.rawOutput(paneId)).not.toContain(marker);
  expect(arrows()).toBe(arrowsAtOpen);
  // 背景（dialog 自身）のクリックでも閉じる。
  await page.keyboard.press("Enter");
  await expect(dialog(page)).toBeVisible();
  await dialog(page).click({ position: { x: 2, y: 2 } });
  await expect(dialog(page)).toBeHidden();
});

test("開いている間に対象のエージェントが居なくなったら、一覧は閉じる（AC-I4）。件数が変われば一覧も変わる", async ({
  page,
  appServer,
}) => {
  const { paneId, client } = await startFakeClaude(page, appServer);
  await startSub(appServer, paneId, "a1", { agentType: "Explore" });
  await expect(countBtn(page)).toHaveText("1");
  await countBtn(page).click();
  const items = dialog(page).locator(".subagent-list-item");
  await expect(items).toHaveCount(1);
  await startSub(appServer, paneId, "a2", { agentType: "Plan" });
  await expect(items).toHaveCount(2);
  // 偽のエージェントを Ctrl+C で終わらせる（前面の sleep が終わり、シェルへ戻る）→ 検出が外れる。
  const gone = client.waitForEvent(
    "pane.agent_status_changed",
    (e) => e.data.paneId === paneId && e.data.agent === null,
    15_000,
  );
  client.sendInput(paneId, "\x03");
  await gone;
  await expect(dialog(page)).toBeHidden({ timeout: 5000 });
  await expect(countBtn(page)).toHaveCount(0);
});

test("短い説明に HTML を書いても動かない（文字として出る）（AC12）", async ({
  page,
  appServer,
}) => {
  const { paneId } = await startFakeClaude(page, appServer);
  const evil = '<img src=x onerror="window.__pwned=1"><b>太字</b>';
  await pending(appServer, paneId, evil, "<i>種類</i>");
  await startSub(appServer, paneId, "a1", { agentType: "<i>種類</i>" });
  await expect(countBtn(page)).toHaveText("1");
  await countBtn(page).click();
  await expect(dialog(page).locator(".subagent-list-desc")).toHaveText(evil);
  await expect(dialog(page).locator(".subagent-list-type")).toHaveText("<i>種類</i>");
  expect(await dialog(page).locator("img, b, i").count()).toBe(0);
  // 画像が作られていれば `onerror` は非同期に動く。動く時間を置いてから、何も実行されていないことを見る。
  await new Promise((r) => setTimeout(r, 500));
  expect(
    await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned),
  ).toBeUndefined();
});
