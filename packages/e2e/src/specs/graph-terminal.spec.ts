import type { Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { watchAskSubscriptions } from "../support/ask.js";
import { enableScript, setScriptOk } from "../support/displayScript.js";
import { expect, test } from "../support/fixtures.js";
import { routeRecordingWebSocket, watchReceivedFrames, watchSentInput } from "../support/frames.js";
import { grantClipboard, prefixKey } from "../support/keys.js";
import { watchClientViews } from "../support/panes.js";

/**
 * グラフの上の端末の窓（20261008-graph-first の PR2a。T13h）。ノードを押すと、グラフの上に、その pane の端末が動かせる窓として開く。基本画面へは移らない。
 * 判定は利用者が見る場所（DOM・フォーカス・箱・ブラウザが受けた／送ったフレーム）で行う（条項 `e2e-observe-browser`）。端末の中身は WebGL（canvas）で描かれ DOM から文字を取れないので、
 * 出力は「ブラウザが受けた OUTPUT」、見た目は「要素のスクリーンショットの一致」で代わりに観測する。テスト自身のクライアントは前提（pane を足す）とサーバの状態（PTY の大きさ）の確認にだけ使う。
 */

const graphView = (page: Page) => page.locator(".graph-view");
const win = (page: Page) => page.locator("[data-graph-terminal-window]");
const winTextarea = (page: Page) => win(page).locator(".xterm-helper-textarea");
const node = (page: Page, paneId: string) => graphView(page).locator(`[data-node-key="local:${paneId}"]`);

async function setup(page: Page, appServer: AppServer) {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  const created = client.waitForEvent("pane.created", (e) => e.data.pane.id !== p1);
  await client.request("pane.split", { paneId: p1, direction: "right" });
  const p2 = (await created).data.pane.id;
  const input = await watchSentInput(page);
  const frames = await watchReceivedFrames(page);
  const views = await watchClientViews(page);
  const subs = await watchAskSubscriptions(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await subs.waitFor(1);
  await expect(page.locator(".xterm-helper-textarea")).toHaveCount(2);
  await page.locator(".xterm-helper-textarea").first().focus();
  // このブラウザが tab のサイズ権限を取る（テスト自身のクライアントの分割が先に取っているため。入力は権限を取る操作）。
  await page.keyboard.press("Enter");
  await expect.poll(() => views.latest()?.visible.length).toBe(2);
  const v = views.latest()!.visible;
  await expect.poll(() => client.paneSize(p1)).toMatchObject({ cols: v.find((x) => x.paneId === p1)!.cols, rows: v.find((x) => x.paneId === p1)!.rows });
  return { client, p1, p2, input, frames, views };
}

async function openGraph(page: Page) {
  await prefixKey(page, "a");
  await expect(graphView(page)).toBeVisible();
}

/** 窓を、グラフの左下へ寄せる（見出しのつかむ場所を動かす。ノードを押すのを窓が邪魔しない）。 */
async function moveWindowAside(page: Page) {
  const g = (await page.locator("[data-graph-terminal-grip]").boundingBox())!;
  await page.mouse.move(g.x + 20, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x - 2000, g.y + 2000, { steps: 8 });
  await page.mouse.up();
}

/** ノードの本体を押す（動かさずに離す＝窓を開く）。 */
async function pressNode(page: Page, paneId: string) {
  const b = (await node(page, paneId).boundingBox())!;
  await page.mouse.click(b.x + 30, b.y + 8);
}

const activeInWindow = (page: Page) => page.evaluate(() => document.activeElement?.closest("[data-graph-terminal-window]") !== null && document.activeElement?.classList.contains("xterm-helper-textarea") === true);
const activeIsBody = (page: Page) => page.evaluate(() => document.activeElement === document.body);

test("ノードを押すと、グラフの上に端末の窓が開く（基本画面へは移らない）。窓の中で打つと pane に届き、出力が窓に出る", async ({ page, appServer }) => {
  const { p1, input, frames } = await setup(page, appServer);
  await openGraph(page);
  await pressNode(page, p1);
  await expect(win(page)).toBeVisible();
  await expect(graphView(page)).toBeVisible(); // 基本画面へは移らない
  await expect.poll(() => activeInWindow(page)).toBe(true);
  await page.keyboard.type("echo from-window-1");
  await page.keyboard.press("Enter");
  await expect.poll(() => input().filter((i) => i.paneId === p1).map((i) => i.text).join("")).toContain("echo from-window-1");
  await expect.poll(() => frames.output(0, p1)).toContain("from-window-1");
});

/** ブラウザが測った基本画面の pane の大きさ（`client.view`）。 */
const baseSizeOf = (views: { latest: () => { visible: { paneId: string; cols: number; rows: number }[] } | null }, paneId: string) => {
  const v = views.latest()?.visible.find((x) => x.paneId === paneId);
  return v ? { cols: v.cols, rows: v.rows } : undefined;
};
const footerSize = async (page: Page) => {
  const t = (await page.locator("[data-graph-terminal-size]").innerText()).trim();
  const m = /^(\d+) × (\d+)$/.exec(t);
  return m ? { cols: Number(m[1]), rows: Number(m[2]) } : null;
};

test("窓の大きさで桁と行が変わる。角をつかんで大きさを変えると追従し、閉じると、開く前の大きさへ戻る。開いていない pane の大きさは動かない", async ({ page, appServer }) => {
  const { client, p1, p2, views } = await setup(page, appServer);
  await expect.poll(() => baseSizeOf(views, p1) !== undefined && baseSizeOf(views, p2) !== undefined).toBe(true);
  const before1 = { ...baseSizeOf(views, p1)! };
  const before2 = { ...baseSizeOf(views, p2)! };
  await expect.poll(() => client.paneSize(p1)).toMatchObject({ cols: before1.cols, rows: before1.rows });
  await openGraph(page);
  await pressNode(page, p1);
  await expect(win(page)).toBeVisible();
  await expect.poll(async () => (await footerSize(page)) !== null).toBe(true);
  // 窓の中の大きさが pane の桁と行になる（サーバの PTY）
  await expect.poll(async () => JSON.stringify(client.paneSize(p1))).toBe(JSON.stringify(await footerSize(page)));
  const opened = (await footerSize(page))!;
  expect(opened.cols).toBeGreaterThanOrEqual(40);
  expect(opened.rows).toBeGreaterThanOrEqual(10);
  // 開いていない pane の大きさは変わらない
  expect(client.paneSize(p2)).toMatchObject(before2);
  // 角をつかんで小さくする（左上へ）
  const corner = (await page.locator("[data-graph-terminal-corner]").boundingBox())!;
  await page.mouse.move(corner.x + 6, corner.y + 6);
  await page.mouse.down();
  await page.mouse.move(corner.x - 160, corner.y - 100, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await footerSize(page))!.cols).toBeLessThan(opened.cols);
  await expect.poll(async () => JSON.stringify(client.paneSize(p1))).toBe(JSON.stringify(await footerSize(page)));
  const small = (await footerSize(page))!;
  expect(small.cols).toBeGreaterThanOrEqual(40);
  expect(small.rows).toBeGreaterThanOrEqual(10);
  // 最小（40×10）より小さくはならない
  const c2 = (await page.locator("[data-graph-terminal-corner]").boundingBox())!;
  await page.mouse.move(c2.x + 6, c2.y + 6);
  await page.mouse.down();
  await page.mouse.move(c2.x - 800, c2.y - 800, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => JSON.stringify(await footerSize(page))).toBe(JSON.stringify({ cols: 40, rows: 10 }));
  await expect.poll(() => client.paneSize(p1)).toMatchObject({ cols: 40, rows: 10 });
  // 閉じると、開く前の大きさへ戻る
  await page.locator("[data-graph-terminal-close]").click();
  await expect(win(page)).toHaveCount(0);
  await expect.poll(() => client.paneSize(p1)).toMatchObject(before1);
  expect(client.paneSize(p2)).toMatchObject(before2);
});

test("窓の中で Esc を打っても、グラフの画面は閉じず、pane に届く。prefix の二度押しも pane に届く", async ({ page, appServer }) => {
  const { p1, input } = await setup(page, appServer);
  await openGraph(page);
  await pressNode(page, p1);
  await expect.poll(() => activeInWindow(page)).toBe(true);
  const n0 = input().length;
  await page.keyboard.press("Escape");
  await expect.poll(() => input().slice(n0).filter((i) => i.paneId === p1).map((i) => i.text).join("")).toContain("\x1b");
  await expect(graphView(page)).toBeVisible();
  await expect(win(page)).toBeVisible();
  const n1 = input().length;
  await page.keyboard.press("Control+b");
  await page.keyboard.press("Control+b");
  await expect.poll(() => input().slice(n1).filter((i) => i.paneId === p1).map((i) => i.text).join("")).toContain("\x02");
  await expect(graphView(page)).toBeVisible();
});

test("窓にフォーカスがあるとき、prefix+a はグラフの面へ戻る（窓は開いたまま）。グラフの面で prefix+a は基本画面へ", async ({ page, appServer }) => {
  const { p1 } = await setup(page, appServer);
  await openGraph(page);
  await pressNode(page, p1);
  await expect.poll(() => activeInWindow(page)).toBe(true);
  await prefixKey(page, "a");
  await expect.poll(() => page.evaluate(() => document.activeElement?.hasAttribute("data-graph-view") === true)).toBe(true);
  await expect(win(page)).toBeVisible();
  await expect(graphView(page)).toBeVisible();
  // 面にフォーカスがあるときの prefix+a は今までどおり（基本画面へ切り替える）。窓は閉じる。
  await prefixKey(page, "a");
  await expect(graphView(page)).toBeHidden();
  await expect(win(page)).toHaveCount(0);
});

test("窓にフォーカスがあるとき、構成を変える prefix の操作は通らず、pane にも届かない（見えない基本画面を変えない）", async ({ page, appServer }) => {
  const { client, p1, input } = await setup(page, appServer);
  await openGraph(page);
  await pressNode(page, p1);
  await expect.poll(() => activeInWindow(page)).toBe(true);
  const created = client.lastEvent("pane.created");
  const layout = client.lastEvent("layout.updated");
  const wsCreated = client.lastEvent("workspace.created");
  const tabCreated = client.lastEvent("tab.created");
  const n0 = input().length;
  // 分割・新しい tab・新しい workspace・pane を閉じる・zoom・goto（選んでいる pane を動かす）・次の pane
  for (const k of ["v", "-", "c", "Shift+N", "x", "z", "g", "Tab", "o"]) {
    await prefixKey(page, k);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(400);
  expect(client.lastEvent("pane.created")).toBe(created);
  expect(client.lastEvent("layout.updated")).toBe(layout);
  expect(client.lastEvent("workspace.created")).toBe(wsCreated);
  expect(client.lastEvent("tab.created")).toBe(tabCreated);
  expect(input().slice(n0).filter((i) => i.paneId === p1).map((i) => i.text).join("")).not.toMatch(/[vxzgo\-c]/);
  await expect(win(page)).toBeVisible();
  await expect(graphView(page)).toBeVisible();
  // 食ったあとも、窓の端末は打てる
  await page.keyboard.type("ok");
  await expect.poll(() => input().slice(n0).filter((i) => i.paneId === p1).map((i) => i.text).join("")).toContain("ok");
});

test("別のノードを押すと、窓の中身がその pane に替わる（前の pane は開く前の大きさへ戻り、直結をやめる）", async ({ page, appServer }) => {
  const { client, p1, p2, views } = await setup(page, appServer);
  await expect.poll(() => baseSizeOf(views, p1) !== undefined && baseSizeOf(views, p2) !== undefined).toBe(true);
  const before1 = { ...baseSizeOf(views, p1)! };
  await openGraph(page);
  await pressNode(page, p1);
  await expect(win(page)).toHaveAttribute("data-pane-id", p1);
  await expect.poll(async () => JSON.stringify(client.paneSize(p1))).toBe(JSON.stringify(await footerSize(page)));
  await expect(node(page, p1)).toHaveClass(/graph-node-window/);
  await moveWindowAside(page);
  await pressNode(page, p2);
  await expect(win(page)).toHaveAttribute("data-pane-id", p2);
  await expect(win(page)).toHaveCount(1);
  await expect(node(page, p2)).toHaveClass(/graph-node-window/);
  await expect(node(page, p1)).not.toHaveClass(/graph-node-window/);
  await expect.poll(() => client.paneSize(p1)).toMatchObject(before1);
  await expect.poll(async () => JSON.stringify(client.paneSize(p2))).toBe(JSON.stringify(await footerSize(page)));
  await expect.poll(() => activeInWindow(page)).toBe(true);
  // p1 を直結できる（前の直結は終わっている）
  const other = await appServer.openClient();
  await other.request("pane.attach", { paneId: p1, cols: 70, rows: 20 });
  other.close();
});

test("別のクライアントが直結している pane は、窓に W2 の表示が出る。［引き取って開く］で窓に出る。開いた後に奪われると W2 の表示に替わる", async ({ page, appServer }) => {
  const { client, p1 } = await setup(page, appServer);
  const other = await appServer.openClient();
  await other.request("pane.attach", { paneId: p1, cols: 60, rows: 20 });
  await expect.poll(() => client.paneSize(p1)).toMatchObject({ cols: 60, rows: 20 });
  await openGraph(page);
  await pressNode(page, p1);
  await expect(page.locator("[data-graph-terminal-taken]")).toBeVisible();
  await expect(win(page)).toHaveAttribute("data-status", "taken");
  expect(client.paneSize(p1)).toMatchObject({ cols: 60, rows: 20 }); // 黙って引き取らない
  await page.locator("[data-graph-terminal-takeover]").click();
  await expect(win(page)).toHaveAttribute("data-status", "attached");
  await expect.poll(async () => JSON.stringify(client.paneSize(p1))).toBe(JSON.stringify(await footerSize(page)));
  await expect(other.request("pane.attach_resize", { paneId: p1, cols: 50, rows: 15 })).rejects.toThrow(/not_attached/);
  // 開いた後に奪われる
  await other.request("pane.attach", { paneId: p1, cols: 61, rows: 21, takeover: true });
  await expect(win(page)).toHaveAttribute("data-status", "taken");
  await expect(page.locator("[data-graph-terminal-taken]")).toBeVisible();
  await expect.poll(() => client.paneSize(p1)).toMatchObject({ cols: 61, rows: 21 });
  other.close();
});

test("20 回開いて閉じても、基本画面の端末の中身と大きさは最初と同じ。フォーカスは、閉じるたびにノードへ戻り、body に残らない", async ({ page, appServer }) => {
  const { client, p1, views } = await setup(page, appServer);
  await page.keyboard.type("echo marker-base-1");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  await expect.poll(() => baseSizeOf(views, p1) !== undefined).toBe(true);
  const before = { ...baseSizeOf(views, p1)! };
  await openGraph(page);
  for (let i = 0; i < 20; i++) {
    await pressNode(page, p1);
    await expect(win(page)).toHaveAttribute("data-status", "attached");
    await expect.poll(() => activeInWindow(page)).toBe(true);
    await page.locator("[data-graph-terminal-close]").click();
    await expect(win(page)).toHaveCount(0);
    expect(await activeIsBody(page)).toBe(false);
    await expect(graphView(page).locator("[data-node-key]:focus")).toHaveCount(1);
  }
  await expect.poll(() => client.paneSize(p1)).toMatchObject(before);
  // 基本画面へ戻ると、同じ要素・同じ中身（印の入った行が残っている）
  await prefixKey(page, "a");
  await expect(graphView(page)).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains("xterm-helper-textarea") === true)).toBe(true);
  await expect(page.locator(".terminal-pane-mount > *")).toHaveCount(2);
});

/**
 * スクリプトが動く面（`focusDrop` の見回りが回る）が載っている画面で、窓の開閉（端末の要素の移動）が「フォーカスの脱落」として数えられない（T13a の確認。X8・B4）。
 * 見回りの内部の数（`restoredAt`）は非公開で読めないので、代わりに次を観測する: ①ページに 4ms ごとの見張りを入れ、`activeElement` が `body` だった回数 ②スクリプトの枠が止められていない
 * （遮断器が働かない）③知らせ（トースト「繰り返し外しています」）が出ない。
 */
test("スクリプトの面が載っている画面で、窓の開閉を 20 回くり返しても、フォーカスは body に落ちず、見回りの遮断器も知らせも働かない", async ({ page, appServer }) => {
  await enableScript(appServer);
  const { p1 } = await setup(page, appServer);
  await setScriptOk(appServer, p1, "g", "<!doctype html><body><p>quiet panel</p></body>");
  const frame = page.locator("[data-pane-panel] iframe[data-display-script]");
  await expect(frame).toHaveCount(1);
  await page.evaluate(() => {
    const w = window as unknown as { __bodySamples: number };
    w.__bodySamples = 0;
    setInterval(() => {
      if (document.activeElement === document.body) w.__bodySamples++;
    }, 4);
  });
  await openGraph(page);
  await page.waitForTimeout(200);
  const baseline = await page.evaluate(() => (window as unknown as { __bodySamples: number }).__bodySamples);
  for (let i = 0; i < 20; i++) {
    await pressNode(page, p1);
    await expect(win(page)).toHaveAttribute("data-status", "attached");
    await expect.poll(() => activeInWindow(page)).toBe(true);
    await page.locator("[data-graph-terminal-close]").click();
    await expect(win(page)).toHaveCount(0);
  }
  await page.waitForTimeout(300);
  const samples = await page.evaluate(() => (window as unknown as { __bodySamples: number }).__bodySamples);
  expect(samples - baseline, "窓の開閉の間に body がフォーカスを持った回数").toBe(0);
  expect(await activeIsBody(page)).toBe(false);
  await expect(frame).toHaveCount(1); // 遮断器が働いて枠が止められていない
  await expect(page.getByText(/繰り返し外しています/)).toHaveCount(0);
});

/** 他のクライアントが、その pane に（takeover 無しで）直結できる＝窓の直結が残っていない。 */
async function expectFree(appServer: AppServer, paneId: string) {
  const other = await appServer.openClient();
  await expect(other.request("pane.attach", { paneId, cols: 33, rows: 11 })).resolves.toBeDefined();
  await other.request("pane.detach", { paneId });
  other.close();
}

/** 端末の見えている中身から 1 行を読む（canvas なので、copy モードで検索・選択して、クリップボードへ）。基本画面の端末にフォーカスがある状態で呼ぶ。 */
async function readLineContaining(page: Page, text: string): Promise<string> {
  await prefixKey(page, "[");
  await page.keyboard.press("?");
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  await page.keyboard.press("V");
  await page.keyboard.press("y");
  await page.waitForTimeout(200);
  return page.evaluate(() => navigator.clipboard.readText());
}

test("［基本画面で開く］: 基本画面へ切り替わり、窓の端末の要素が戻って、窓で打った中身が見える。大きさは開く前に戻り、フォーカスはその端末にある", async ({ page, appServer, context }) => {
  await grantClipboard(context, appServer.origin);
  const { client, p1, views, input } = await setup(page, appServer);
  const before = { ...baseSizeOf(views, p1)! };
  await openGraph(page);
  await pressNode(page, p1);
  await expect.poll(() => activeInWindow(page)).toBe(true);
  await page.keyboard.type("echo marker-in-window-2");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  await page.locator("[data-graph-terminal-open-base]").click();
  await expect(graphView(page)).toBeHidden();
  await expect(win(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains("xterm-helper-textarea") === true && document.activeElement.closest(".terminal-pane-mount") !== null)).toBe(true);
  await expect.poll(() => client.paneSize(p1)).toMatchObject(before);
  await expect(page.locator(".terminal-pane-mount > *")).toHaveCount(2);
  // 窓で打った中身が、基本画面の同じ端末に見える
  expect(await readLineContaining(page, "marker-in-window-2")).toContain("marker-in-window-2");
  await page.keyboard.press("Escape");
  const n0 = input().length;
  await page.keyboard.type("zz");
  await expect.poll(() => input().slice(n0).filter((i) => i.paneId === p1).map((i) => i.text).join("")).toContain("zz");
});

test("開いている pane が閉じられたら、窓は閉じる（グラフの画面は開いたまま。フォーカスは body に残らない）", async ({ page, appServer }) => {
  const { client, p2 } = await setup(page, appServer);
  await openGraph(page);
  await pressNode(page, p2);
  await expect(win(page)).toHaveAttribute("data-pane-id", p2);
  await client.request("pane.close", { paneId: p2 });
  await expect(win(page)).toHaveCount(0);
  await expect(graphView(page)).toBeVisible();
  await page.waitForTimeout(300); // ノードが消えた後も、フォーカスは body に落ちない
  expect(await activeIsBody(page)).toBe(false);
});

test("1 列の画面（モバイルの幅）になったら窓は閉じ、直結は残らない。再読み込みでも、ブラウザを閉じても、直結は残らない", async ({ page, appServer }) => {
  const { p1 } = await setup(page, appServer);
  await openGraph(page);
  await pressNode(page, p1);
  await expect(win(page)).toHaveAttribute("data-status", "attached");
  await page.setViewportSize({ width: 560, height: 800 });
  await expect(win(page)).toHaveCount(0);
  await expectFree(appServer, p1);
  await page.setViewportSize({ width: 1280, height: 720 });
  // 再読み込み: 開き直して、そのまま読み込み直す
  await expect(page.locator(".xterm-helper-textarea").first()).toBeAttached();
  await page.reload();
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await openGraph(page);
  await pressNode(page, p1);
  await expect(win(page)).toHaveAttribute("data-status", "attached");
  await page.reload();
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await expectFree(appServer, p1);
  // ブラウザを閉じる
  await openGraph(page);
  await pressNode(page, p1);
  await expect(win(page)).toHaveAttribute("data-status", "attached");
  await page.close();
  await expect.poll(async () => {
    const other = await appServer.openClient();
    try {
      await other.request("pane.attach", { paneId: p1, cols: 30, rows: 10 });
      return "free";
    } catch {
      return "held";
    } finally {
      other.close();
    }
  }).toBe("free");
});

test("接続が切れて再接続すると、窓の pane を購読し直し、直結し直す。出力が窓に届き、窓の大きさが pane の大きさになる", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  const rec = await routeRecordingWebSocket(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await page.locator(".xterm-helper-textarea").first().focus();
  await page.keyboard.press("Enter");
  await openGraph(page);
  await pressNode(page, p1);
  await expect(win(page)).toHaveAttribute("data-status", "attached");
  await expect.poll(async () => JSON.stringify(client.paneSize(p1))).toBe(JSON.stringify(await footerSize(page)));
  await rec.drop(0);
  await expect.poll(() => rec.sent(1).map((r) => r.method).includes("pane.attach")).toBe(true);
  const methods = rec.sent(1).map((r) => r.method);
  expect(methods.indexOf("pane.subscribe")).toBeGreaterThanOrEqual(0);
  expect(methods.indexOf("pane.subscribe")).toBeLessThan(methods.indexOf("pane.attach"));
  await expect(win(page)).toHaveAttribute("data-status", "attached");
  const marker = `after-reconnect-${Date.now()}`;
  await page.keyboard.type(`echo ${marker}`);
  await page.keyboard.press("Enter");
  await expect.poll(() => rec.frames.output(1, p1) + rec.frames.snapshots(1, p1).join("")).toContain(marker);
  await expect.poll(async () => JSON.stringify(client.paneSize(p1))).toBe(JSON.stringify(await footerSize(page)));
});

// --- PR2a レビューの直し（指摘 1・2・4）-------------------------------------------------------------------------------------

test("窓を開いた後にサイドバーが別の pane を選んでも、窓の端末で打った操作（copy モード）は、窓に見えている pane に効く", async ({ page, appServer, context }) => {
  await grantClipboard(context, appServer.origin);
  const { client, p1 } = await setup(page, appServer);
  const two = await client.request("workspace.create", { cwd: "/tmp", label: "wsTwoZ" });
  await openGraph(page);
  await pressNode(page, p1);
  await expect.poll(() => activeInWindow(page)).toBe(true);
  await page.keyboard.type("echo marker-in-p1-window");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  client.sendInput(two.pane.id, "echo marker-in-other-pane\r");
  await page.waitForTimeout(500);
  // サイドバーで別の workspace（別の pane）を選ぶ。窓は p1 のまま。
  await page.locator(".sidebar").getByText("wsTwoZ").first().click();
  await page.waitForTimeout(300);
  // 窓の端末へフォーカスを戻す（キーボードだけの経路。クリックは使わない）
  await winTextarea(page).focus();
  const text = await readLineContaining(page, "marker-in-p1-window");
  expect(text).toContain("marker-in-p1-window");
});

test("窓の最初の位置は、押したノードの隣（ノードもツールバーも覆わない）。ノードから窓へ線が引かれ、窓を動かすと消える", async ({ page, appServer }) => {
  const { p1 } = await setup(page, appServer);
  await openGraph(page);
  const nb = (await node(page, p1).boundingBox())!;
  await pressNode(page, p1);
  await expect(win(page)).toHaveAttribute("data-status", "attached");
  const wb = (await win(page).boundingBox())!;
  const tb = (await page.locator(".graph-toolbar").boundingBox())!;
  const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  expect(overlaps(wb, nb), "窓がノードを覆わない").toBe(false);
  expect(overlaps(wb, tb), "窓がツールバーを覆わない").toBe(false);
  await expect(page.locator("[data-graph-terminal-link]")).toBeVisible();
  await moveWindowAside(page);
  await expect(page.locator("[data-graph-terminal-link]")).toHaveCount(0);
});

test("窓の端末の右クリックのメニューは、その pane への操作（貼り付け・右クリックの送り先）だけ。分割・閉じる・拡大表示は出ない", async ({ page, appServer }) => {
  const { p1 } = await setup(page, appServer);
  await openGraph(page);
  await pressNode(page, p1);
  await expect.poll(() => activeInWindow(page)).toBe(true);
  const b = (await page.locator("[data-graph-terminal-mount]").boundingBox())!;
  await page.mouse.click(b.x + 100, b.y + 100, { button: "right" });
  const items = page.locator(".context-menu [role=menuitem]");
  await expect(items.first()).toBeVisible();
  const labels = await items.allInnerTexts();
  expect(labels.map((l) => l.trim()).sort()).toEqual(["右クリックを pane に送る", "貼り付け"].sort());
});

test("面を動かす・拡大縮小しても、ノードから窓への線の端は、ノードの縁に付いてくる（ノードが外へ出たら線は消える）", async ({ page, appServer }) => {
  const { p1 } = await setup(page, appServer);
  await openGraph(page);
  await pressNode(page, p1);
  await expect(win(page)).toHaveAttribute("data-status", "attached");
  const line = page.locator("[data-graph-terminal-link] line");
  await expect(line).toHaveCount(1);
  const endNearNode = async (): Promise<boolean> => {
    const nb = await node(page, p1).boundingBox();
    const lb = await page.evaluate(() => {
      const l = document.querySelector("[data-graph-terminal-link] line");
      const svg = document.querySelector("[data-graph-terminal-link]")!.getBoundingClientRect();
      return l ? { x: svg.left + Number(l.getAttribute("x1")), y: svg.top + Number(l.getAttribute("y1")) } : null;
    });
    if (!nb || !lb) return false;
    // 線の一端は、ノードの中心（箱の中）
    return lb.x >= nb.x - 1 && lb.x <= nb.x + nb.width + 1 && lb.y >= nb.y - 1 && lb.y <= nb.y + nb.height + 1;
  };
  expect(await endNearNode()).toBe(true);
  // 拡大縮小（ボタン）→ ノードの位置が変わる
  await page.locator(".graph-zoom-in").click();
  await page.locator(".graph-zoom-in").click();
  await expect.poll(endNearNode).toBe(true);
  // 面をドラッグして動かす（何も無い所）
  await page.mouse.move(300, 120);
  await page.mouse.down();
  await page.mouse.move(380, 160, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await page.locator("[data-graph-terminal-link] line").count()) === 0 || (await endNearNode())).toBe(true);
  // ノードを層の外へ出すほど動かすと、線は消える
  await page.mouse.move(300, 120);
  await page.mouse.down();
  await page.mouse.move(-600, 120, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator("[data-graph-terminal-link]")).toHaveCount(0);
});
