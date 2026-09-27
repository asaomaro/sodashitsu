import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { focusTerminal, typeLine } from "../support/keys.js";

/**
 * AC9 の E2E（05-e2e-docs T7）。design「受け入れ基準との対応」：
 * 「2 つ目のクライアントも hello / view で同じ pane を購読し、INPUT はどちらからでも受け付ける」
 * 「サイズはサイズ権限に従う。イベントはすべてのクライアントに配る」。
 * design「サイズ権限（AC9・D13）」：「誰も権限を持たない tab は、最初に client.view を送ったクライアントが
 * 持つ」「権限を取る操作：入力・focus・レイアウトの操作」。
 */

/**
 * ブラウザ自身の `client.hello` 応答から、そのページの `clientId` を CDP 経由で拾う準備をする
 *  （テストの検証専用の窓——SodaTestClient は別接続なので、ブラウザ自身の clientId は分からない）。
 * **`await` してから `page.goto()` を呼ぶこと**（CDP の `Network.enable` を先に済ませておかないと、
 * 接続直後の最初のフレームを取りこぼす）。戻り値の関数（`waitForClientId`）を navigate の**後**に
 * 呼んで待つ——1 つの async 関数が「セットアップの Promise」と「フレーム待ちの Promise」の 2 段を
 * 同時に返すと、両方をまとめて `await` してしまい（Promise の自動フラット化）、navigate 前に
 * フレーム待ちまで完了してしまうデッドロックになる（実装時に実際にハマった）。
 */
async function prepareClientIdCapture(page: Page): Promise<() => Promise<string>> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  let resolveId: ((id: string) => void) | null = null;
  const captured = new Promise<string>((resolve) => {
    resolveId = resolve;
  });
  cdp.on("Network.webSocketFrameReceived", (e) => {
    try {
      const msg = JSON.parse(e.response.payloadData) as { id?: string; result?: { clientId?: string } };
      if (msg.id === "1" && msg.result?.clientId) resolveId?.(msg.result.clientId);
    } catch {
      // バイナリ（OUTPUT/SNAPSHOT）フレームは JSON でないので無視する。
    }
  });
  return () => captured;
}

test("2つのブラウザが同じ pane を同時に見て、どちらからも入力できる（AC9）", async ({ browser, appServer }) => {
  const client = await appServer.openClient(); // 検証用の観測窓（イベント・snapshot を見るだけ）
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 500 });

  const context1 = await browser.newContext();
  const page1 = await context1.newPage();
  const waitForClientId1 = await prepareClientIdCapture(page1); // CDP の Network.enable を待ってから navigate する
  await page1.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page1.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  const clientId1 = await waitForClientId1();

  const context2 = await browser.newContext();
  const page2 = await context2.newPage();
  const waitForClientId2 = await prepareClientIdCapture(page2);
  await page2.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page2.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  const clientId2 = await waitForClientId2();
  expect(clientId1).not.toBe(clientId2);

  // サイズ権限：誰も持っていない tab は、最初に client.view を送ったクライアント（page1）が持つ。
  await expect
    .poll(async () => (await client.request("client.hello", { protocol: 1, kind: "desktop" })).snapshot.tabs[0]?.sizeOwnerClientId, { timeout: 3000 })
    .toBe(clientId1);

  // page1 からの入力が、page2（別のブラウザ）にも見える（design「INPUT はどちらからでも受け付ける」＋
  // イベント／OUTPUT は全クライアントに配る）。
  const markerFrom1 = `soda-e2e-from-page1-${Date.now()}`;
  await focusTerminal(page1);
  await typeLine(page1, `echo ${markerFrom1}`);
  await client.waitForOutput(p1, markerFrom1);

  // page2 からも入力できる（design「INPUT はどちらからでも受け付ける」）。同時に、入力はサイズ権限を
  // 取る操作でもあるので、権限が page2 へ移ることも確かめる（design「サイズ権限」の「権限を取る操作」）。
  const markerFrom2 = `soda-e2e-from-page2-${Date.now()}`;
  await focusTerminal(page2);
  await typeLine(page2, `echo ${markerFrom2}`);
  await client.waitForOutput(p1, markerFrom2);

  await expect
    .poll(async () => (await client.request("client.hello", { protocol: 1, kind: "desktop" })).snapshot.tabs[0]?.sizeOwnerClientId, { timeout: 3000 })
    .toBe(clientId2);

  await context1.close();
  await context2.close();
});
