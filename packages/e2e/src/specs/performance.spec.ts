import { expect, test } from "../support/fixtures.js";

/**
 * AC17 の計測の仕組み（05-e2e-docs T11）。design「非機能要件」：
 * 「遅延：1 文字の INPUT を送ってから、その文字を含む OUTPUT がブラウザで描かれるまで。200 回の p95。
 * LAN の計測は別のマシンのブラウザから行う」
 * 「規模：pane を 16 個開き、うち 1 個で大量出力（`yes` 相当）を流したまま、別の pane の遅延を測る」
 * 「状態の反映：判定ルールに当たる画面を出してから、pane.agent_status_changed を受けるまで」。
 *
 * tasks.md「リスク / 留意点」のとおり、**ここで作るのは計測の仕組み**——出力された数値を記録するだけで、
 * 閾値超過を pass/fail に直結させない（CI・重い開発機では絶対値が環境依存でぶれるため。合否判定は
 * 環境を選べる親の統合 test に委ねる）。「状態の反映」は T5（`agent-detection.spec.ts`）で
 * 2 秒以内であることを既に実地に計測・アサートしているので、ここでは重複させない。
 * この spec のレイテンシ計測は、ブラウザの `page.keyboard` を経由すると Playwright 自身の入力遅延が
 * 上乗せされて「サーバ〜ネットワーク」の遅延が見えなくなるため、生の `SodaTestClient`（`sendInput`/
 * `armNextOutput`）を使う——ブラウザを経由しない分、実際のブラウザでの体感より小さい値が出る
 * （design の「別のマシンのブラウザから行う」LAN 計測は親の統合 test の担当。ここは仕組みの検証）。
 * 計測は他の spec と同時に走らせない（`playwright.config.ts` の `workers: 1`。05-e2e-docs T13・decisions.md D104）——
 * 大量出力の `yes` が他の spec を時間切れで落とし、他の spec の負荷が計測値に混ざるため。
 */

function percentile(sortedMs: number[], p: number): number {
  const idx = Math.min(sortedMs.length - 1, Math.ceil((p / 100) * sortedMs.length) - 1);
  return sortedMs[Math.max(0, idx)]!;
}

async function measureRoundTrips(client: { sendInput(paneId: string, bytes: string): void; armNextOutput(paneId: string): () => Promise<void> }, paneId: string, rounds: number): Promise<number[]> {
  const samples: number[] = [];
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < rounds; i++) {
    const wait = client.armNextOutput(paneId);
    const start = performance.now();
    client.sendInput(paneId, chars[i % chars.length]!);
    await wait();
    samples.push(performance.now() - start);
  }
  return samples;
}

test("遅延の計測：1文字のINPUT→OUTPUTの往復を200回測り、p95を記録する（AC17）", async ({ appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 200 });

  const samples = await measureRoundTrips(client, p1, 200);
  const sorted = [...samples].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const max = sorted[sorted.length - 1]!;
  console.log(`[AC17 遅延] 200 回・p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms max=${max.toFixed(1)}ms`);

  // 「計測の仕組み」の検証であって、絶対値の合否判定はしない（環境依存でぶれるため。tasks.md のリスク参照）。
  // 数値自体が正しく取れていること（有限・非負）だけを確かめる。
  expect(Number.isFinite(p95)).toBe(true);
  expect(p95).toBeGreaterThanOrEqual(0);
  expect(samples).toHaveLength(200);
});

test("規模の計測：pane を16個開き、1個で大量出力を流したまま別の pane の遅延を測る（AC17）", async ({ appServer }) => {
  const client = await appServer.openClient();
  const firstPaneId = client.helloSnapshot()!.panes[0]!.id;

  // 16 個の pane を作る（最初の 1 個 + tab.create で 15 個。同じ workspace 内）。
  const paneIds = [firstPaneId];
  for (let i = 0; i < 15; i++) {
    const { pane } = await client.request("tab.create", { workspaceId: undefined, label: `perf-${i}` });
    paneIds.push(pane.id);
  }
  expect(paneIds).toHaveLength(16);
  // そのうち 1 個で大量出力を流し続ける（design「大量出力（yes 相当）」）。この計測はサーバ側の混み具合（PTY・ミラーの処理）
  // だけを見るので、大量出力の pane はこのクライアントでは購読しない——購読すると、このテスト用クライアント自身が
  // 洪水を受け取って遅い受け手になり、その遅れが混ざる（親の統合 test で発見）。ブラウザ込みの計測は下の test が担う。
  const busyPaneId = paneIds[0]!;
  const quietPaneId = paneIds[1]!;
  for (const id of paneIds) if (id !== busyPaneId) await client.request("pane.subscribe", { paneId: id, scrollbackLines: 200 });
  // 出力を実際に端末（PTY → ミラー → 配信）へ流す。以前は `yes > /dev/null &` で、出力が端末を通らず
  // 「大量出力が流れる pane」になっていなかった（親の統合 test で発見・修正）。
  client.sendInput(busyPaneId, "yes &\n");
  await new Promise((r) => setTimeout(r, 500)); // yes が実際に回り始めるのを待つ

  const samples = await measureRoundTrips(client, quietPaneId, 50);
  const sorted = [...samples].sort((a, b) => a - b);
  const p95 = percentile(sorted, 95);
  console.log(`[AC17 規模] pane16個・うち1個大量出力中・別 pane の遅延 50 回・p95=${p95.toFixed(1)}ms`);

  expect(Number.isFinite(p95)).toBe(true);
  expect(samples).toHaveLength(50);

  // 後始末（yes を止める）。
  await client.request("pane.close", { paneId: busyPaneId }).catch(() => undefined);
});

// --- ここから親の統合 test で追加：ブラウザの受信と描画までを含む計測（requirements「応答性」の「キー入力から画面へ
// 反映されるまで」に近づける）。入力は生の WebSocket クライアントから送る（Playwright のキー入力の遅延を含めない）。
// 出力は、ブラウザ側で WebSocket の OUTPUT フレームを受けた時刻と、その直後の描画フレーム（requestAnimationFrame）の
// 時刻を記録して測る。同じマシンの Node とブラウザの `Date.now()` を比べる（ms 単位）。

/** ブラウザ側の記録（`page.addInitScript` で WebSocket を包む）。 */
async function installPaintProbe(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    const probe = { count: {} as Record<string, number>, paint: {} as Record<string, number>, maxGap: 0, lastFrame: 0 };
    (window as unknown as { __probe: typeof probe }).__probe = probe;
    const tick = (): void => {
      const now = performance.now();
      if (probe.lastFrame > 0) probe.maxGap = Math.max(probe.maxGap, now - probe.lastFrame);
      probe.lastFrame = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const Base = window.WebSocket;
    window.WebSocket = class extends Base {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        this.addEventListener("message", (ev) => {
          if (!(ev.data instanceof ArrayBuffer)) return;
          const b = new Uint8Array(ev.data);
          if (b[0] !== 0x01 && b[0] !== 0x02) return; // OUTPUT・SNAPSHOT（止めた購読の再開は SNAPSHOT で届く）
          const id = new TextDecoder().decode(b.subarray(2, 2 + b[1]!));
          requestAnimationFrame(() => {
            probe.count[id] = (probe.count[id] ?? 0) + 1;
            probe.paint[id] = Date.now();
          });
        });
      }
    } as typeof WebSocket;
  });
}

/** 1 文字送ってから、その pane の OUTPUT がブラウザに届いて次の描画フレームが来るまで（ms）を rounds 回測る。 */
async function measureToPaint(page: import("@playwright/test").Page, client: { sendInput(paneId: string, bytes: string): void }, paneId: string, rounds: number): Promise<number[]> {
  const samples: number[] = [];
  const chars = "abcdefghijklmnopqrstuvwxyz";
  for (let i = 0; i < rounds; i++) {
    const before = await page.evaluate((id) => (window as unknown as { __probe: { count: Record<string, number> } }).__probe.count[id] ?? 0, paneId);
    const t0 = Date.now();
    client.sendInput(paneId, chars[i % chars.length]!);
    const handle = await page.waitForFunction(
      ([id, c]) => {
        const p = (window as unknown as { __probe: { count: Record<string, number>; paint: Record<string, number> } }).__probe;
        return (p.count[id] ?? 0) > c ? p.paint[id] : false;
      },
      [paneId, before] as const,
      { timeout: 10_000 },
    );
    samples.push(((await handle.jsonValue()) as number) - t0);
    if (i % 40 === 39) client.sendInput(paneId, "\x15"); // Ctrl+U：行が長くなりすぎないように消す
  }
  return samples;
}

test("遅延の計測（ブラウザの描画まで）：1 pane・200 回の p95（AC17。親の統合 test で追加）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await installPaintProbe(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await page.waitForTimeout(500); // 初回の SNAPSHOT・プロンプトの描画が落ち着くのを待つ

  const samples = await measureToPaint(page, client, p1, 200);
  const sorted = [...samples].sort((a, b) => a - b);
  console.log(`[AC17 遅延・描画まで] 1 pane・200 回・p50=${percentile(sorted, 50)}ms p95=${percentile(sorted, 95)}ms max=${sorted[sorted.length - 1]}ms`);
  expect(samples).toHaveLength(200);
});

test("規模の計測（ブラウザの描画まで）：1 つの tab に 16 pane を同時に表示し、1 つで大量出力を流したまま別の pane を測る（AC17。親の統合 test で追加）", async ({ page, appServer }) => {
  test.setTimeout(120_000);
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  // 4 列 × 4 行の 16 pane（各 pane が同じ大きさになる分け方）。
  const split = async (paneId: string, direction: "right" | "down"): Promise<string> => (await client.request("pane.split", { paneId, direction })).pane.id;
  const colB = await split(p1, "right");
  const colC = await split(p1, "right");
  const colD = await split(colB, "right");
  const panes: string[] = [];
  for (const top of [p1, colC, colB, colD]) {
    const mid = await split(top, "down");
    const q2 = await split(top, "down");
    const q4 = await split(mid, "down");
    panes.push(top, q2, mid, q4);
  }
  expect(new Set(panes).size).toBe(16);

  await installPaintProbe(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await expect(page.locator(".terminal-pane")).toHaveCount(16, { timeout: 15_000 });
  await page.waitForTimeout(1000);

  const busy = panes[0]!;
  const quiet = panes[15]!;
  client.sendInput(busy, "yes &\n"); // 端末へ大量出力を流し続ける（ブラウザが購読・描画している pane）
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    (window as unknown as { __probe: { maxGap: number } }).__probe.maxGap = 0;
  });

  const samples = await measureToPaint(page, client, quiet, 50);
  const maxGap = await page.evaluate(() => (window as unknown as { __probe: { maxGap: number } }).__probe.maxGap);
  const sorted = [...samples].sort((a, b) => a - b);
  console.log(
    `[AC17 規模・描画まで] 16 pane 同時表示・うち 1 つで yes・別 pane の 50 回・p50=${percentile(sorted, 50)}ms p95=${percentile(sorted, 95)}ms max=${sorted[sorted.length - 1]}ms・描画フレームの最大間隔=${Math.round(maxGap)}ms`,
  );
  expect(samples).toHaveLength(50);
  client.sendInput(busy, "\x03kill %1\n");
});
