import type { Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";

/**
 * モダンの pane の操作ボタン（20261008-ui-style PR4 の AC19〜AC22）の E2E。判定は、ブラウザの側（DOM の位置・大きさ・フォーカス・pane の数）で行う（条項 e2e-observe-browser）。
 * 設定は、サーバの共有の設定（`prefs.set`）で、開く前に入れる。
 */
type Client = Awaited<ReturnType<AppServer["openClient"]>>;

async function setup(appServer: AppServer, page: Page, prefs: Record<string, unknown>, opts: { splits?: number; name?: string } = {}): Promise<Client> {
  const client = await appServer.openClient();
  const paneId = client.helloSnapshot()!.panes[0]!.id;
  if (opts.name) await client.request("pane.rename", { paneId, label: opts.name });
  for (let i = 0; i < (opts.splits ?? 0); i++) await client.request("pane.split", { paneId, direction: "right" });
  await client.request("prefs.set", { patch: prefs });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-ui-style"))).toBe(prefs["uiStyle"]);
  await expect(page.locator(".xterm-helper-textarea")).toHaveCount((opts.splits ?? 0) + 1);
  return client;
}
const actionsOf = (page: Page, n = 0) => page.locator("[data-pane-actions]").nth(n);
const btn = (page: Page, action: string, n = 0) => page.locator(`[data-pane-action="${action}"]`).nth(n);
const paneCount = (page: Page) => page.locator("[data-pane-frame-main]").count();
/** フォーカスが body に落ちていない（端末の入力欄にある）。 */
const focusInTerminal = (page: Page) => expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains("xterm-helper-textarea") === true)).toBe(true);

const MODERN_NAMED = { uiStyle: "modern", paneAgentNameVisible: true } as const;

test("名前の行がある: 右端に［右へ分割］［下へ分割］［最大化］［閉じる］の順。24px 以上・閉じるは間を空けて最後・名前の行の内側", async ({ page, appServer }) => {
  const client = await setup(appServer, page, MODERN_NAMED, { name: "alpha", splits: 1 });
  await expect(page.locator("[data-pane-actions]")).toHaveCount(2);
  const g = actionsOf(page);
  await expect(g).toHaveClass(/pane-actions-row/);
  expect(await g.locator("button").evaluateAll((bs) => bs.map((b) => b.getAttribute("data-pane-action")))).toEqual(["split-right", "split-down", "zoom", "close"]);
  expect(await g.locator("button").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")))).toEqual(["右へ分割", "下へ分割", "最大化", "閉じる"]);
  const boxes = await g.locator("button").evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect().toJSON() as { x: number; y: number; width: number; height: number; right: number }));
  for (const b of boxes) {
    expect(b.width).toBeGreaterThanOrEqual(24);
    expect(b.height).toBeGreaterThanOrEqual(24);
  }
  const gaps = boxes.slice(1).map((b, i) => b.x - boxes[i]!.right);
  expect(gaps[2], "閉じるの前は、ほかより広く空ける").toBeGreaterThan(gaps[0]! + 3);
  // 名前の行の内側（pane の枠の上端〜行の高さ）で、枠の右端の内側にある。名前（`.pane-frame-name`）と重ならない。
  const frame = (await page.locator(".pane-frame").first().boundingBox())!;
  const body = (await page.locator(".pane-frame-body").first().boundingBox())!;
  const topSpace = boxes[3]!.y - frame.y;
  const bottomSpace = body.y - (boxes[3]!.y + boxes[3]!.height);
  expect(Math.abs(topSpace - bottomSpace), "閉じるボタンの上下の余白は揃う").toBeLessThan(1);
  expect(boxes[3]!.right).toBeLessThanOrEqual(frame.x + frame.width + 0.5);
  expect(boxes[0]!.y).toBeGreaterThanOrEqual(frame.y - 0.5);
  const name = (await page.locator(".pane-frame-name").first().boundingBox())!;
  expect(name.x + name.width, "名前は、ボタンの手前で終わる").toBeLessThanOrEqual(boxes[0]!.x + 0.5);
  // ボタンの間の空白も掴める（操作の group 全体でポインタを遮らない）。
  await page.mouse.move(boxes[3]!.x - 4, boxes[3]!.y + boxes[3]!.height / 2);
  await page.mouse.down();
  await page.mouse.move(boxes[3]!.x - 20, boxes[3]!.y + boxes[3]!.height / 2);
  await expect(page.locator(".pane-frame-header-dragging")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".pane-frame-header-dragging")).toHaveCount(0);
  client.close();
});

test("名前のないペインも見出しの空白からドラッグして別のペインへ移せる", async ({ page, appServer }) => {
  const client = await setup(appServer, page, MODERN_NAMED, { splits: 1 });
  const header = (await page.locator(".pane-frame-header-drag").first().boundingBox())!;
  const target = (await page.locator(".pane-frame-body").nth(1).boundingBox())!;
  await page.mouse.move(header.x + header.width / 2, header.y + header.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
  await expect(page.locator(".pane-frame-header-dragging")).toHaveCount(1);
  await page.mouse.up();
  await expect.poll(() => paneCount(page)).toBe(1);
  await expect(page.locator(".pane-frame-header-dragging")).toHaveCount(0);
  client.close();
});

test("最大化: 押すとその pane だけになり、同じ場所が「元に戻す」になる。もう一度押すと戻る。フォーカスは端末に残る", async ({ page, appServer }) => {
  const client = await setup(appServer, page, MODERN_NAMED, { name: "alpha", splits: 1 });
  expect(await paneCount(page)).toBe(2);
  const before = (await btn(page, "zoom").boundingBox())!;
  await btn(page, "zoom").click();
  await expect.poll(() => paneCount(page)).toBe(1);
  await expect(btn(page, "zoom")).toHaveAttribute("aria-label", "元に戻す");
  await focusInTerminal(page);
  // 陽性の対照: 同じ操作（拡大表示）の結果。pane が 1 つになり、ボタンは 1 組だけ。
  await expect(page.locator("[data-pane-actions]")).toHaveCount(1);
  await btn(page, "zoom").click();
  await expect.poll(() => paneCount(page)).toBe(2);
  await expect(btn(page, "zoom")).toHaveAttribute("aria-label", "最大化");
  await focusInTerminal(page);
  const after = (await btn(page, "zoom").boundingBox())!;
  expect(Math.abs(after.x - before.x)).toBeLessThan(2);
  client.close();
});

test("閉じる: 押すと必ず確認が出る（素のシェルでも）。取りやめると何も閉じず、フォーカスは端末へ。確認すると閉じる", async ({ page, appServer }) => {
  const client = await setup(appServer, page, MODERN_NAMED, { name: "alpha", splits: 1 });
  expect(await paneCount(page)).toBe(2);
  await btn(page, "close").click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toContainText("閉じますか？");
  await dialog.getByRole("button", { name: "キャンセル" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  expect(await paneCount(page), "取りやめでは、何も閉じない").toBe(2);
  await focusInTerminal(page);
  await btn(page, "close").click();
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  await page.locator("dialog[open]").getByRole("button", { name: "閉じる" }).click();
  await expect.poll(() => paneCount(page)).toBe(1);
  await focusInTerminal(page);
  client.close();
});

test("キー（prefix+x）で閉じる動きは、今のまま（素のシェルは確認なしで閉じる）。ボタンだけが必ず確認する", async ({ page, appServer }) => {
  const client = await setup(appServer, page, MODERN_NAMED, { name: "alpha", splits: 1 });
  expect(await paneCount(page)).toBe(2);
  await page.locator(".xterm-helper-textarea").first().focus();
  await page.keyboard.press("Control+b");
  await page.keyboard.press("x");
  await expect.poll(() => paneCount(page)).toBe(1);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  client.close();
});

test("分割: ［右へ分割］［下へ分割］で pane が増える", async ({ page, appServer }) => {
  const client = await setup(appServer, page, MODERN_NAMED, { name: "alpha" });
  expect(await paneCount(page)).toBe(1);
  await btn(page, "split-right").click();
  await expect.poll(() => paneCount(page)).toBe(2);
  await focusInTerminal(page);
  await btn(page, "split-down").click();
  await expect.poll(() => paneCount(page)).toBe(3);
  await focusInTerminal(page);
  client.close();
});

test("小さな pane: 入りきらないとき、分割の 2 つを先に隠す（最大化と閉じるは残す）。広い pane は 4 つ", async ({ page, appServer }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  const client = await setup(appServer, page, MODERN_NAMED, { name: "a-fairly-long-pane-name", splits: 3 });
  await expect(page.locator("[data-pane-actions]")).toHaveCount(4);
  // 狭い pane（幅 240px 未満）には分割が無く、広い pane（300px 以上）には、ある。最大化と閉じるは、どの pane にも残る。
  await expect.poll(() => page.locator(".pane-frame").evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width < 240).length)).toBeGreaterThanOrEqual(3);
  const perPane = await page.locator(".pane-frame").evaluateAll((els) => els.map((e) => ({ w: e.getBoundingClientRect().width, split: e.querySelectorAll('[data-pane-action^="split"]').length })));
  for (const p of perPane) {
    if (p.w < 240) expect(p.split, `幅 ${p.w}px`).toBe(0);
    if (p.w >= 300) expect(p.split, `幅 ${p.w}px`).toBe(2);
  }
  expect(perPane.some((p) => p.w >= 300 && p.split === 2), "広い pane には分割がある（検査が、全部を隠して通っていない）").toBe(true);
  await expect(page.locator('[data-pane-action="zoom"]')).toHaveCount(4);
  await expect(page.locator('[data-pane-action="close"]')).toHaveCount(4);
  // 名前は省略記号で切れ、ボタンと重ならない（pane ごとに、名前の右端がその pane の最初のボタンの手前）。極端に狭い pane は、名前を出さない。
  const overlaps = await page.locator(".pane-frame").evaluateAll((els) =>
    els.map((f) => {
      const name = f.querySelector(".pane-frame-name");
      const first = f.querySelector("[data-pane-actions] button");
      return { w: f.getBoundingClientRect().width, hasName: name !== null, over: name && first ? name.getBoundingClientRect().right - first.getBoundingClientRect().x : -1 };
    }),
  );
  for (const o of overlaps) expect(o.over, `幅 ${o.w}px`).toBeLessThanOrEqual(0.5);
  expect(overlaps.some((o) => !o.hasName), "極端に狭い pane は、名前を出さない").toBe(true);
  expect(overlaps.some((o) => o.hasName), "広い pane は、名前がある").toBe(true);
  // 陽性の対照: 1 つを最大化すると（広くなる）、分割も戻って 4 つ並ぶ。
  await btn(page, "zoom").click();
  await expect.poll(() => paneCount(page)).toBe(1);
  await expect(actionsOf(page).locator("button")).toHaveCount(4);
  client.close();
});

test("名前の行が無い設定: 右上の隅に、ポインタが載っている間・選ばれている間だけ重ねて出る。24px 以上", async ({ page, appServer }) => {
  const client = await setup(appServer, page, { uiStyle: "modern", paneAgentNameVisible: false }, { splits: 1 });
  await expect(page.locator("[data-pane-actions]")).toHaveCount(2);
  await expect(actionsOf(page)).toHaveClass(/pane-actions-corner/);
  const opacity = (n: number) => actionsOf(page, n).evaluate((e) => Number(getComputedStyle(e).opacity));
  // 選ばれている pane（既定は 2 つ目＝分割で増えた側）は出ている。選ばれていない pane は、ポインタが載るまで見えない（押せない）。
  const selectedIdx = (await page.locator("[data-pane-actions]").evaluateAll((els) => els.map((e) => Number(getComputedStyle(e).opacity)))).findIndex((o) => o === 1);
  expect(selectedIdx).toBeGreaterThanOrEqual(0);
  const other = selectedIdx === 0 ? 1 : 0;
  expect(await opacity(other)).toBe(0);
  expect(await actionsOf(page, other).evaluate((e) => getComputedStyle(e).pointerEvents)).toBe("none");
  const frame = page.locator(".pane-frame-center").nth(other);
  const fb = (await frame.boundingBox())!;
  await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
  await expect.poll(() => opacity(other)).toBe(1);
  // 右上の隅（端末の領域の内側の右上）にあり、24px 以上。
  const ab = (await btn(page, "zoom", other).boundingBox())!;
  expect(ab.width).toBeGreaterThanOrEqual(24);
  expect(ab.height).toBeGreaterThanOrEqual(24);
  expect(ab.x + ab.width).toBeLessThanOrEqual(fb.x + fb.width + 0.5);
  expect(ab.x).toBeGreaterThan(fb.x + fb.width / 2);
  expect(ab.y).toBeLessThan(fb.y + 40);
  // 押せる: 最大化。
  await btn(page, "zoom", other).click();
  await expect.poll(() => paneCount(page)).toBe(1);
  await focusInTerminal(page);
  client.close();
});

test("クラシックでは出ない。名前の行の高さも今のまま。モダンへ切り替えると出て、戻すと消える（再読み込みなし）", async ({ page, appServer }) => {
  const client = await setup(appServer, page, { uiStyle: "classic", paneAgentNameVisible: true }, { name: "alpha", splits: 1 });
  await expect(page.locator("[data-pane-actions]")).toHaveCount(0);
  const topPad = () => page.locator(".pane-frame").first().evaluate((e) => parseFloat(getComputedStyle(e).paddingTop));
  const classicPad = await topPad();
  await client.request("prefs.set", { patch: { uiStyle: "modern" } });
  await expect(page.locator("[data-pane-actions]")).toHaveCount(2);
  expect(await topPad(), "モダンは、名前の行がボタンの高さ分ある").toBeGreaterThan(classicPad);
  await client.request("prefs.set", { patch: { uiStyle: "classic" } });
  await expect(page.locator("[data-pane-actions]")).toHaveCount(0);
  expect(await topPad()).toBeCloseTo(classicPad, 1);
  client.close();
});

test("名前の D&D・右クリックのメニューと取り違えない: ボタンの上の押下は D&D を始めず、右クリックのメニューは名前・枠で今までどおり開く", async ({ page, appServer }) => {
  const client = await setup(appServer, page, MODERN_NAMED, { name: "alpha", splits: 1 });
  const z = (await btn(page, "zoom").boundingBox())!;
  const other = (await page.locator(".pane-frame").nth(1).boundingBox())!;
  await page.mouse.move(z.x + z.width / 2, z.y + z.height / 2);
  await page.mouse.down();
  await page.mouse.move(other.x + other.width / 2, other.y + other.height / 2, { steps: 6 });
  expect(await page.locator(".pane-frame-edge-drop-target").count(), "ボタンの上からは、pane の D&D が始まらない").toBe(0);
  await page.mouse.up();
  // 名前の右クリックは、今までどおり pane のメニューを開く。
  await page.locator(".pane-frame-name").first().click({ button: "right" });
  await expect(page.locator(".context-menu")).toBeVisible();
  await page.keyboard.press("Escape");
  client.close();
});

test("名前の行が無い設定: 隅のボタンが覆うのは、ボタンの大きさだけ（帯にしない）。ボタンの間・ボタンの外では、端末が押せる", async ({ page, appServer }) => {
  const client = await setup(appServer, page, { uiStyle: "modern", paneAgentNameVisible: false }, { splits: 1 });
  const frame = page.locator(".pane-frame-center").nth(0);
  const fb = (await frame.boundingBox())!;
  await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
  const g = actionsOf(page, 0);
  await expect.poll(() => g.evaluate((e) => Number(getComputedStyle(e).opacity))).toBe(1);
  const boxes = await g.locator("button").evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect().toJSON() as { x: number; y: number; width: number; height: number; right: number; bottom: number }));
  // 箱そのものに地も縁も余白も無い。高さはボタン 1 つ分（24px）で、帯にならない。
  const gb = (await g.boundingBox())!;
  expect(gb.height).toBeLessThanOrEqual(24.5);
  expect(await g.evaluate((e) => { const s = getComputedStyle(e); return [s.backgroundColor, s.borderTopWidth, s.paddingTop]; })).toEqual(["rgba(0, 0, 0, 0)", "0px", "0px"]);
  // 箱は何も受けない。ボタンの間（隙間）では、押下は端末へ届く。
  const gapX = (boxes[0]!.right + boxes[1]!.x) / 2;
  const gapY = boxes[0]!.y + boxes[0]!.height / 2;
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest("[data-pane-actions]") === null, [gapX, gapY])).toBe(true);
  // ボタンの上は、ボタン。
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest("[data-pane-action]") !== null, [boxes[0]!.x + 12, gapY])).toBe(true);
  // ポインタが外へ出ると、押せなくなる。
  await page.mouse.move(2, 2);
  await expect.poll(() => g.evaluate((e) => Number(getComputedStyle(e).opacity))).toBe(0);
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest("[data-pane-action]") === null, [boxes[0]!.x + 12, gapY])).toBe(true);
  client.close();
});

/** 最大化している間に分割のボタンを押す（キー〔prefix+v〕と同じ結果になること）。どちらの経路でも、見える結果を返す。 */
async function splitWhileZoomed(page: Page, appServer: AppServer, how: "button" | "key") {
  const client = await setup(appServer, page, MODERN_NAMED, { name: "alpha", splits: 1 });
  await btn(page, "zoom").click();
  await expect.poll(() => paneCount(page)).toBe(1);
  await expect(btn(page, "zoom")).toHaveAttribute("aria-label", "元に戻す");
  await focusInTerminal(page);
  const created = client.waitForEvent("pane.created");
  if (how === "button") await btn(page, "split-right").click();
  else {
    await page.keyboard.press("Control+b");
    await page.keyboard.press("v");
  }
  await created;
  await expect.poll(() => page.locator("[data-pane-frame-main]").count()).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(500);
  const result = { panes: await paneCount(page), zoomLabel: await btn(page, "zoom").getAttribute("aria-label"), terminals: await page.locator(".xterm-helper-textarea").count() };
  client.close();
  return result;
}

/** 最大化中に分割した結果（どちらの経路でも同じ）。新しい pane が増え、最大化は解けて、2 つの pane が並ぶ。 */
const SPLIT_WHILE_ZOOMED = { panes: 3, zoomLabel: "最大化", terminals: 3 } as const;

test("最大化している間に［右へ分割］を押すと、キーと同じ結果になる（ボタン）", async ({ page, appServer }) => {
  expect(await splitWhileZoomed(page, appServer, "button")).toEqual(SPLIT_WHILE_ZOOMED);
});

test("最大化している間に prefix+v で分割した結果（ボタンと同じであることの対照）", async ({ page, appServer }) => {
  expect(await splitWhileZoomed(page, appServer, "key")).toEqual(SPLIT_WHILE_ZOOMED);
});
