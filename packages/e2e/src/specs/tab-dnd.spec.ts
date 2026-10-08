import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { BrowserContext, Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { routeRecordingWebSocket, type RecordingWebSocketRoute } from "../support/frames.js";
import { prefixKey } from "../support/keys.js";
import type { SodaTestClient } from "../support/wsClient.js";

/**
 * ブラウザ版の tab のドラッグでの並べ替え（20261008-web-tab-dnd の T4。AC1〜AC9・AC-I1〜AC-I5）。
 *
 * **合否は、ブラウザの DOM（tab の順・クラス・フォーカス）と、ブラウザが送った要求（`routeRecordingWebSocket` の `sent`）で決める**
 * （条項 e2e-observe-browser）。ドラッグは実際のポインタの操作（`page.mouse`）。テスト自身のクライアントは、前提づくり（tab を増やす）と、
 * サーバの順の確認（**新しく開いた**クライアントの snapshot）にだけ使う。固定時間の待ちは根拠にしない（ブラウザ側の印を待つ）。
 */

const TAB = ".tab-bar-item";
const SCREENSHOT_DIR = process.env["TAB_DND_SCREENSHOT_DIR"];

interface Env {
  client: SodaTestClient;
  workspaceId: string;
  rec: RecordingWebSocketRoute;
}

/** ラベル `t1`〜`tN` の tab を持つ workspace を用意してブラウザで開く。`routeRecordingWebSocket` は `goto` の前に呼ぶ。 */
async function boot(page: Page, appServer: AppServer, n: number, opts: { prefs?: Record<string, unknown>; record?: boolean; label?: (i: number) => string } = {}): Promise<Env> {
  const client = await appServer.openClient();
  const snap = client.helloSnapshot()!;
  const ws = snap.workspaces[0]!;
  const label = opts.label ?? ((i: number) => `t${i}`);
  await client.request("tab.rename", { tabId: ws.tabIds[0]!, label: label(1) });
  for (let i = 2; i <= n; i++) await client.request("tab.create", { workspaceId: ws.id, label: label(i) });
  let rec: RecordingWebSocketRoute | undefined;
  if (opts.record !== false) rec = await routeRecordingWebSocket(page);
  if (opts.prefs) await page.addInitScript((p) => localStorage.setItem("soda.prefs.v1", p), JSON.stringify(opts.prefs));
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await expect(page.locator(TAB)).toHaveCount(n);
  return { client, workspaceId: ws.id, rec: rec as RecordingWebSocketRoute };
}

const labels = (page: Page) => page.locator(`${TAB} .tab-bar-label`).allTextContents();
const tabByLabel = (page: Page, label: string) => page.locator(TAB).filter({ has: page.locator(".tab-bar-label", { hasText: new RegExp(`^${label}$`) }) });

/** 選びたい tab をクリックして、選ばれる（active）のを待つ。 */
async function select(page: Page, label: string): Promise<void> {
  await tabByLabel(page, label).click();
  await expect(tabByLabel(page, label)).toHaveClass(/tab-bar-item-active/);
}

/** ブラウザが送った tab.move・tab.focus の数（`connection` 番目の接続）。ドラッグの直前の値との差で数える。 */
function sentCounts(rec: RecordingWebSocketRoute, connection = 0): { moves: { tabId: string; direction: string }[]; focuses: number } {
  const sent = rec.sent(connection);
  return {
    moves: sent.filter((s) => s.method === "tab.move").map((s) => s.params as { tabId: string; direction: string }),
    focuses: sent.filter((s) => s.method === "tab.focus").length,
  };
}
function diff(after: ReturnType<typeof sentCounts>, before: ReturnType<typeof sentCounts>) {
  return { moves: after.moves.slice(before.moves.length), focuses: after.focuses - before.focuses };
}

/** tab の左半分（0.25）・右半分（0.75）の座標。 */
async function pos(page: Page, label: string, half: "left" | "right"): Promise<{ x: number; y: number }> {
  const b = (await tabByLabel(page, label).boundingBox())!;
  return { x: b.x + b.width * (half === "left" ? 0.25 : 0.75), y: b.y + b.height / 2 };
}

/** つかんで 12px 動かし、目的の座標まで動かす（まだ離さない）。 */
async function grabAndMove(page: Page, from: string, to: { x: number; y: number }): Promise<void> {
  const b = (await tabByLabel(page, from).boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 12, y, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
}

const insertClasses = (page: Page) => page.locator(".tab-bar-item-insert-before, .tab-bar-item-insert-after").count();
const noDragClasses = async (page: Page) => {
  await expect(page.locator(".tab-bar-dragging")).toHaveCount(0);
  await expect(page.locator(".tab-bar-item-dragging")).toHaveCount(0);
  expect(await insertClasses(page)).toBe(0);
};
const terminalFocused = (page: Page) => page.evaluate(() => document.activeElement?.classList.contains("xterm-helper-textarea") === true);

/** 新しく開いたクライアントの snapshot で、サーバの tab の順（ラベル）を読む。 */
async function serverOrder(appServer: AppServer, workspaceId: string): Promise<string[]> {
  const c = await appServer.openClient();
  try {
    const snap = c.helloSnapshot()!;
    const ws = snap.workspaces.find((w) => w.id === workspaceId)!;
    return ws.tabIds.map((id) => snap.tabs.find((t) => t.id === id)!.label);
  } finally {
    c.close();
  }
}

test("4 個の tab：先頭を 3 番目の右半分へ → 線が出て、離すと入る。つかんだ tab が選ばれ、フォーカスは端末（AC1・AC2・AC8・AC-I4）", async ({ page, appServer }) => {
  const { rec, workspaceId } = await boot(page, appServer, 4);
  await select(page, "t4"); // 先頭の t1 は選ばれていない
  const before = sentCounts(rec);

  await grabAndMove(page, "t1", await pos(page, "t3", "right"));
  // 離す前：先頭が薄くなり、4 番目の前に線が 1 つだけ出る。
  await expect(page.locator(".tab-bar")).toHaveClass(/tab-bar-dragging/);
  await expect(tabByLabel(page, "t1")).toHaveClass(/tab-bar-item-dragging/);
  await expect(tabByLabel(page, "t4")).toHaveClass(/tab-bar-item-insert-before/);
  expect(await insertClasses(page)).toBe(1);
  await page.mouse.up();

  await expect.poll(() => labels(page)).toEqual(["t2", "t3", "t1", "t4"]);
  await expect(tabByLabel(page, "t1")).toHaveClass(/tab-bar-item-active/);
  await noDragClasses(page);
  await expect.poll(() => terminalFocused(page)).toBe(true);
  const d = diff(sentCounts(rec), before);
  expect(d.moves).toEqual([
    { tabId: expect.any(String), direction: "next" },
    { tabId: expect.any(String), direction: "next" },
  ]);
  expect(d.focuses).toBe(1);
  expect(await serverOrder(appServer, workspaceId)).toEqual(["t2", "t3", "t1", "t4"]);
  await page.reload();
  await expect(page.locator(TAB)).toHaveCount(4);
  expect(await labels(page)).toEqual(["t2", "t3", "t1", "t4"]);
});

test("最後の tab を先頭の左半分へ。先頭を「＋」の上で離すと末尾へ入り、新しい tab の名前の入力は開かない（AC1・AC-I5）", async ({ page, appServer }) => {
  const { rec } = await boot(page, appServer, 4);
  let before = sentCounts(rec);
  await grabAndMove(page, "t4", await pos(page, "t1", "left"));
  await expect(tabByLabel(page, "t1")).toHaveClass(/tab-bar-item-insert-before/);
  await page.mouse.up();
  await expect.poll(() => labels(page)).toEqual(["t4", "t1", "t2", "t3"]);
  let d = diff(sentCounts(rec), before);
  expect(d.moves.map((m) => m.direction)).toEqual(["previous", "previous", "previous"]);

  before = sentCounts(rec);
  const plus = (await page.locator(".tab-bar-new").boundingBox())!;
  await grabAndMove(page, "t4", { x: plus.x + plus.width / 2, y: plus.y + plus.height / 2 });
  expect(await insertClasses(page)).toBe(1);
  await page.mouse.up();
  await expect.poll(() => labels(page)).toEqual(["t1", "t2", "t3", "t4"]);
  d = diff(sentCounts(rec), before);
  expect(d.moves.map((m) => m.direction)).toEqual(["next", "next", "next"]);
  await expect(page.locator(".name-dialog")).toBeHidden(); // <dialog> は DOM に常に居る。開いていないことを見る
  await expect(page.locator(TAB)).toHaveCount(4);
});

test("取り消し：Escape・端末の上で離す・つかんだ tab の上へ戻して離す → 順も選択も変わらず何も送らない（AC-I2・AC-I4・AC8）", async ({ page, appServer }) => {
  const { rec } = await boot(page, appServer, 4);
  await select(page, "t4");
  const before = sentCounts(rec);

  // (a) Escape
  await grabAndMove(page, "t1", await pos(page, "t3", "right"));
  expect(await insertClasses(page)).toBe(1);
  await page.keyboard.press("Escape");
  await noDragClasses(page);
  await page.mouse.up();
  // (b) 端末の上で離す
  await grabAndMove(page, "t1", await pos(page, "t3", "right"));
  await page.mouse.move(400, 400, { steps: 4 });
  await expect.poll(() => insertClasses(page)).toBe(0);
  await page.mouse.up();
  await noDragClasses(page);
  // (c) つかんだ tab の上へ戻して離す
  await grabAndMove(page, "t1", await pos(page, "t3", "right"));
  const self = await pos(page, "t1", "right");
  await page.mouse.move(self.x, self.y, { steps: 6 });
  await expect.poll(() => insertClasses(page)).toBe(0);
  await page.mouse.up();
  await noDragClasses(page);

  expect(await labels(page)).toEqual(["t1", "t2", "t3", "t4"]);
  await expect(tabByLabel(page, "t4")).toHaveClass(/tab-bar-item-active/);
  const d = diff(sentCounts(rec), before);
  expect(d).toEqual({ moves: [], focuses: 0 }); // (1) で 2 と 1 を数えている同じ関数なので、空振りではない
  await expect.poll(() => terminalFocused(page)).toBe(true);
});

test("既存の操作：3px 動かして離す → 切り替わる。右クリックのメニュー。ホイールで隣へ（AC-I1・AC-I5）", async ({ page, appServer }) => {
  const { rec } = await boot(page, appServer, 3);
  const before = sentCounts(rec);
  const b = (await tabByLabel(page, "t2").boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 3, y, { steps: 2 });
  await page.mouse.up();
  await expect(tabByLabel(page, "t2")).toHaveClass(/tab-bar-item-active/);
  const d = diff(sentCounts(rec), before);
  expect(d).toEqual({ moves: [], focuses: 1 });

  await tabByLabel(page, "t3").click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "名前の変更" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem", { name: "名前の変更" })).toHaveCount(0);

  await select(page, "t1");
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, 100);
  await expect(tabByLabel(page, "t2")).toHaveClass(/tab-bar-item-active/);
});

test("pane の名前を tab へ落とす移動は今までどおり：tab-bar-item-drop-target だけが付き、離すと pane.move_to_tab（AC7）", async ({ page, appServer }) => {
  const prefs = { paneAgentNameVisible: true };
  const client = await appServer.openClient();
  const ws = client.helloSnapshot()!.workspaces[0]!;
  const t1 = ws.tabIds[0]!;
  await client.request("tab.rename", { tabId: t1, label: "t1" });
  await client.request("tab.create", { workspaceId: ws.id, label: "t2" });
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.split", { paneId: p1, direction: "right" });
  await client.request("pane.rename", { paneId: p1, label: "mover" });
  const rec = await routeRecordingWebSocket(page);
  await page.addInitScript((p) => localStorage.setItem("soda.prefs.v1", p), JSON.stringify(prefs));
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await expect(page.locator(TAB)).toHaveCount(2);
  await select(page, "t1");
  const name = page.locator(".pane-frame-name", { hasText: "mover" });
  await expect(name).toBeVisible();

  const nb = (await name.boundingBox())!;
  const target = await pos(page, "t2", "left");
  await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2);
  await page.mouse.down();
  await page.mouse.move(nb.x + nb.width / 2 + 12, nb.y + nb.height / 2, { steps: 3 });
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await expect(tabByLabel(page, "t2")).toHaveClass(/tab-bar-item-drop-target/);
  await expect(page.locator(".tab-bar-dragging")).toHaveCount(0);
  expect(await insertClasses(page)).toBe(0);
  await page.mouse.up();
  await expect.poll(() => rec.sent(0).filter((s) => s.method === "pane.move_to_tab").length).toBe(1);
  expect(await labels(page)).toEqual(["t1", "t2"]);
  expect(rec.sent(0).filter((s) => s.method === "tab.move")).toHaveLength(0);
});

test("ドラッグ中のキーは効かない（prefix+c が名前の入力を開かない）。ドラッグしていないときは開く（AC-I5）", async ({ page, appServer }) => {
  // routeRecordingWebSocket の下では端末への入力が観測できないので、記録を使わない。観測は DOM（ダイアログの有無）。
  await boot(page, appServer, 3, { record: false });
  // 対照：ドラッグしていないときは、新しい tab を作る既定のキー操作でダイアログが開く。
  await page.locator(".xterm-helper-textarea").first().click();
  await prefixKey(page, "c");
  await expect(page.locator(".name-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".name-dialog")).toBeHidden(); // <dialog> は DOM に常に居る。開いていないことを見る

  await grabAndMove(page, "t1", await pos(page, "t3", "right"));
  await expect(page.locator(".tab-bar-dragging")).toHaveCount(1);
  await prefixKey(page, "c");
  await expect(page.locator(".name-dialog")).toBeHidden(); // <dialog> は DOM に常に居る。開いていないことを見る
  await page.keyboard.press("Escape"); // 取り消し
  await noDragClasses(page);
  await page.mouse.up();
  expect(await labels(page)).toEqual(["t1", "t2", "t3"]);
  await expect(page.locator(TAB)).toHaveCount(3);
});

test("あふれ：端で自動スクロールし、最後の tab の右半分へ離すと末尾に入る（AC3）", async ({ page, appServer }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  const long = (i: number) => `t${i}-${"x".repeat(18)}`;
  const { client, workspaceId } = await boot(page, appServer, 12, { label: long });
  void client;
  const overflow = () => page.locator(".tab-bar-tabs").evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(await overflow()).toBe(true);
  const row = (await page.locator(".tab-bar-tabs").boundingBox())!;
  const first = (await page.locator(TAB).first().boundingBox())!;
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + first.width / 2 + 12, first.y + first.height / 2, { steps: 3 });
  await page.mouse.move(row.x + row.width - 10, first.y + first.height / 2, { steps: 8 });
  // 動かさずに止める。scrollLeft が増えていき、最後の tab の右端が列の中に入るまで待つ。
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const r = document.querySelector(".tab-bar-tabs")!.getBoundingClientRect();
          const items = document.querySelectorAll(".tab-bar-item");
          return items[items.length - 1]!.getBoundingClientRect().right <= r.right + 1;
        }),
      { timeout: 15_000 },
    )
    .toBe(true);
  expect(await page.locator(".tab-bar-tabs").evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  const lastLabel = long(12);
  await page.mouse.move(...((p) => [p.x, p.y] as [number, number])(await pos(page, lastLabel, "right")), { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await labels(page))[11]).toBe(long(1));
  await expect.poll(() => serverOrder(appServer, workspaceId).then((o) => o[11])).toBe(long(1));
});

test("tab バーを「下」にしても同じ（AC4）", async ({ page, appServer }) => {
  const { rec } = await boot(page, appServer, 4, { prefs: { tabBarPosition: "bottom" } });
  await expect(page.locator(".tab-bar-bottom")).toBeVisible();
  const before = sentCounts(rec);
  await grabAndMove(page, "t1", await pos(page, "t3", "right"));
  await expect(tabByLabel(page, "t4")).toHaveClass(/tab-bar-item-insert-before/);
  await page.mouse.up();
  await expect.poll(() => labels(page)).toEqual(["t2", "t3", "t1", "t4"]);
  expect(diff(sentCounts(rec), before).moves).toHaveLength(2);
});

test("外からの変化：ドラッグ中に tab が閉じられる／別の tab が動かされる（AC6）", async ({ page, appServer }) => {
  const { client, rec } = await boot(page, appServer, 4);
  const fresh = await appServer.openClient(); // helloSnapshot は接続した時点のもの。tab を増やした後に開き直す
  const snap = fresh.helloSnapshot()!;
  fresh.close();
  const idOf = (label: string) => snap.tabs.find((t) => t.label === label)!.id;

  // つかんだ tab を閉じられる → 線も薄さも消え、離しても tab.move は送られない。
  let before = sentCounts(rec);
  await grabAndMove(page, "t1", await pos(page, "t3", "right"));
  expect(await insertClasses(page)).toBe(1);
  await client.request("tab.close", { tabId: idOf("t1") });
  await expect(page.locator(TAB)).toHaveCount(3);
  await noDragClasses(page);
  await page.mouse.up();
  expect(diff(sentCounts(rec), before).moves).toEqual([]);

  // ドラッグ中に別の tab を動かされる。Chromium で「続く」か「取り消し」のどちらになるかは、spec の最後のコメントに書く。
  before = sentCounts(rec);
  await grabAndMove(page, "t2", await pos(page, "t4", "right"));
  await client.request("tab.move", { tabId: idOf("t4"), direction: "previous" });
  await expect.poll(() => labels(page)).toEqual(["t2", "t4", "t3"]);
  await page.mouse.move(...((p) => [p.x, p.y] as [number, number])(await pos(page, "t3", "right")), { steps: 3 });
  await page.mouse.up();
  await noDragClasses(page);
  const d = diff(sentCounts(rec), before);
  const order = await labels(page);
  // 続いた場合は t2 が末尾へ入る。取り消しなら何も送らず順は変わらない。どちらでも残り物が無い。
  test.info().annotations.push({ type: "chromium-actual", description: d.moves.length > 0 ? "ドラッグが続いた" : "取り消しになった" });
  if (d.moves.length > 0) expect(order).toEqual(["t4", "t3", "t2"]);
  else expect(order).toEqual(["t2", "t4", "t3"]);
  // その後のキー操作（prefix+c でダイアログ）が効く。
  await page.locator(".xterm-helper-textarea").first().click();
  await prefixKey(page, "c");
  await expect(page.locator(".name-dialog")).toBeVisible();
});

test("2 つのブラウザ：片方でドラッグして離すと、もう片方の順が再読み込みなしで同じになる（AC5）", async ({ browser, appServer }) => {
  const client = await appServer.openClient();
  const ws = client.helloSnapshot()!.workspaces[0]!;
  await client.request("tab.rename", { tabId: ws.tabIds[0]!, label: "t1" });
  for (const l of ["t2", "t3"]) await client.request("tab.create", { workspaceId: ws.id, label: l });
  const open = async (): Promise<{ ctx: BrowserContext; page: Page }> => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
    await expect(page.locator(TAB)).toHaveCount(3);
    return { ctx, page };
  };
  const a = await open();
  const b = await open();
  await grabAndMove(a.page, "t1", await pos(a.page, "t3", "right"));
  await a.page.mouse.up();
  await expect.poll(() => labels(b.page)).toEqual(["t2", "t3", "t1"]);
  expect(await labels(a.page)).toEqual(["t2", "t3", "t1"]);
  await a.ctx.close();
  await b.ctx.close();
});

test("タッチ：タップは切り替わり、指のなぞりでは並べ替えが始まらない（AC9）", async ({ browser, appServer }) => {
  const client = await appServer.openClient();
  const ws = client.helloSnapshot()!.workspaces[0]!;
  await client.request("tab.rename", { tabId: ws.tabIds[0]!, label: "t1" });
  for (const l of ["t2", "t3"]) await client.request("tab.create", { workspaceId: ws.id, label: l });
  const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 1000, height: 700 } });
  const page = await ctx.newPage();
  const rec = await routeRecordingWebSocket(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await expect(page.locator(TAB)).toHaveCount(3);
  await page.locator(TAB).filter({ hasText: "t2" }).tap();
  await expect(tabByLabel(page, "t2")).toHaveClass(/tab-bar-item-active/);

  const cdp = await ctx.newCDPSession(page);
  const from = await pos(page, "t1", "left");
  const to = await pos(page, "t3", "right");
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + ((to.x - from.x) * i) / 8, y: from.y }] });
  }
  expect(await page.locator(".tab-bar-dragging").count()).toBe(0);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await noDragClasses(page);
  expect(rec.sent(0).filter((s) => s.method === "tab.move")).toHaveLength(0);
  expect(await labels(page)).toEqual(["t1", "t2", "t3"]);
  await ctx.close();
});

for (const scheme of ["light", "dark"] as const) {
  test(`ドラッグ中の見た目（${scheme}）：入る位置の線が出る。スクリーンショットは TAB_DND_SCREENSHOT_DIR に置く`, async ({ page, appServer }) => {
    await page.emulateMedia({ colorScheme: scheme });
    // 明るい配色は、テーマを明るいもの（catppuccin-latte）に固定して作る。暗い方は既定。
    await boot(page, appServer, 4, scheme === "light" ? { prefs: { theme: "catppuccin-latte", themeAuto: false } } : {});
    await grabAndMove(page, "t1", await pos(page, "t3", "right"));
    await expect(tabByLabel(page, "t4")).toHaveClass(/tab-bar-item-insert-before/);
    if (SCREENSHOT_DIR) {
      await mkdir(SCREENSHOT_DIR, { recursive: true });
      const bar = (await page.locator(".tab-bar").boundingBox())!;
      await page.screenshot({ path: join(SCREENSHOT_DIR, `tab-dnd-${scheme}.png`), clip: { x: 0, y: 0, width: Math.min(1280, bar.width), height: 160 } });
    }
    await page.keyboard.press("Escape");
    await page.mouse.up();
  });
}

// 「ドラッグ中に別の tab を動かされたとき」（AC6）の Chromium での実際（2026-10-08 に実測）：ドラッグは取り消されず続き、
// 離した位置（そのときの順）で tab.move の回数が決まる。Vue が keyed の並べ替えをしても、ポインタの捕捉は保たれた。
