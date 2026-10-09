import type { Locator, Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { runDisplay } from "../support/display.js";
import { openDisplayBrowser, writeTmp } from "../support/displayBrowser.js";
import {
  activeTagName,
  bodyHits,
  boxOf,
  centerHitsSelf,
  frameHandle,
  frameLoads,
  idsOf,
  intersects,
  menuItem,
  openFaceMenu,
  set,
  stealReports,
  takeFrameLog,
  termFocused,
  trackBodyHits,
  trayButton,
  watchFrames,
} from "../support/displayLayout.js";
import { enableScript, ok, setScriptOk } from "../support/displayScript.js";
import { focusTerminal } from "../support/keys.js";

/**
 * 表示のパネルを pane の上・下・左・右に置く・各側のつまみ・見出しをつかむ D&D・既定の置き場所（20261008-display-layout の PR-B。T18）。
 * 合否はブラウザの側の観測（DOM・箱・`elementFromPoint`・`document.activeElement`・ブラウザが送った `client.view`・`display.*`）で見る（規約 `e2e-observe-browser`）。
 */
type Side = "right" | "left" | "top" | "bottom";
const SIDES: Side[] = ["right", "left", "top", "bottom"];
const LABEL: Record<Side, string> = { right: "右", left: "左", top: "上", bottom: "下" };
const BENIGN = `<!doctype html><body><p>benign</p><script>setInterval(function(){}, 1000);</script></body>`;

const dock = (page: Page, side: Side, scope = ""): Locator => page.locator(`${scope}[data-display-dock="${side}"]`);
const bodyBox = (page: Page) => boxOf(page.locator(".pane-frame-body-displays").first());
const mainBox = (page: Page) => boxOf(page.locator("[data-pane-frame-main]").first());
const moveByMenu = async (page: Page, appServer: AppServer, paneId: string, name: string, side: Side): Promise<void> => {
  await openFaceMenu(page, appServer, paneId, name);
  await menuItem(page, `${LABEL[side]}に置く`).click();
  await expect(dock(page, side)).toHaveCount(1);
};

/** 箱の並び: パネルは端末に面した側に付き、上下は本体の幅いっぱい・左右は端末の高さ。端末の箱は本体からはみ出さない。 */
async function expectArrangement(page: Page, side: Side): Promise<void> {
  const p = await boxOf(dock(page, side));
  const m = await mainBox(page);
  const b = await bodyBox(page);
  if (side === "right") expect(p.x).toBeGreaterThanOrEqual(m.x + m.width - 1);
  if (side === "left") expect(p.x + p.width).toBeLessThanOrEqual(m.x + 1);
  if (side === "top") expect(p.y + p.height).toBeLessThanOrEqual(m.y + 1);
  if (side === "bottom") expect(p.y).toBeGreaterThanOrEqual(m.y + m.height - 1);
  if (side === "top" || side === "bottom") expect(Math.abs(p.width - b.width), `${side} の幅＝本体の幅`).toBeLessThanOrEqual(1);
  else expect(Math.abs(p.height - m.height), `${side} の高さ＝端末の高さ`).toBeLessThanOrEqual(2);
  expect(m.x).toBeGreaterThanOrEqual(b.x - 1);
  expect(m.y).toBeGreaterThanOrEqual(b.y - 1);
  expect(m.x + m.width).toBeLessThanOrEqual(b.x + b.width + 1);
  expect(m.y + m.height).toBeLessThanOrEqual(b.y + b.height + 1);
  // 端末の見える領域（xterm の画面）が、端末の箱からはみ出さない
  const screen = await boxOf(page.locator("[data-pane-frame-main] .xterm-screen").first());
  expect(screen.x + screen.width).toBeLessThanOrEqual(m.x + m.width + 1);
  expect(screen.y + screen.height).toBeLessThanOrEqual(m.y + m.height + 1);
}

test("(1) メニューで 右 → 下 → 左 → 上 → 右 と移す。そのたびに箱の並びが合い、client.view が 1 回で、列数・行数が端末の箱に合う", async ({ page, appServer }) => {
  const { paneId, views } = await openDisplayBrowser(page, appServer);
  await set(appServer, paneId, "pa", "panel");
  await expect(dock(page, "right")).toHaveCount(1);
  await expectArrangement(page, "right");
  let prev = views.latest()!.visible[0]!;
  for (const side of ["bottom", "left", "top", "right"] as const) {
    const before = views.count();
    await moveByMenu(page, appServer, paneId, "pa", side);
    for (const other of SIDES.filter((s) => s !== side)) await expect(dock(page, other), `${other} は空`).toHaveCount(0);
    await expect.poll(() => views.count()).toBeGreaterThan(before);
    await page.waitForTimeout(500);
    expect(views.count() - before, `${side}: client.view は 1 回`).toBe(1);
    await expectArrangement(page, side);
    const v = views.latest()!.visible[0]!;
    expect(v.cols).toBeGreaterThanOrEqual(40);
    expect(v.rows).toBeGreaterThanOrEqual(10);
    // 端末の箱の大きさと列数・行数が合う（1 セルの幅・高さが、ふつうの範囲）
    const m = await mainBox(page);
    expect(m.width / v.cols).toBeGreaterThan(5);
    expect(m.width / v.cols).toBeLessThan(15);
    expect(m.height / v.rows).toBeGreaterThan(10);
    expect(m.height / v.rows).toBeLessThan(30);
    if (side === "bottom") expect(v.rows).toBeLessThan(prev.rows);
    prev = v;
  }
});

test("(2) 右と下に同時に置く・同じ側に 2 枚でタブ。再読み込みの後も同じ。別の pane で同じ名前を出すと、最後に決めた置き場所から始まる（たたみは引き継がない）", async ({ page, appServer }) => {
  const { paneId } = await openDisplayBrowser(page, appServer);
  await set(appServer, paneId, "pa", "panel");
  await set(appServer, paneId, "pb", "panel", ["--dock", "bottom"]);
  await set(appServer, paneId, "pc", "panel");
  await expect(dock(page, "right")).toHaveCount(1);
  await expect(dock(page, "bottom")).toHaveCount(1);
  await expect(dock(page, "right").locator("[data-pane-panel-tab]")).toHaveCount(2); // pa・pc
  await moveByMenu(page, appServer, paneId, "pa", "bottom"); // 利用者の決定（記憶に書く）
  await expect(dock(page, "bottom").locator("[data-pane-panel-tab]")).toHaveCount(2); // pb・pa
  await expect(dock(page, "right")).toHaveCount(1);
  await expect(dock(page, "right").locator("[data-pane-panel-tab]")).toHaveCount(0); // pc だけ（タブなし）
  // 移した面は、移った先で選ばれているタブ
  await expect(dock(page, "bottom").locator('[data-pane-panel-tab][aria-selected="true"]')).toHaveText("pa");
  // 再読み込みの後も同じ
  await page.reload();
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await expect(dock(page, "bottom").locator("[data-pane-panel-tab]")).toHaveCount(2);
  await expect(dock(page, "right")).toHaveCount(1);
  // pa をたたむ（利用者）→ 別の pane で同じ名前の面を出すと、置き場所は引き継ぐがたたみは引き継がない
  await dock(page, "bottom").locator("[data-pane-panel-fold]").click();
  await expect(trayButton(page, "pa")).toBeVisible();
  const c = await appServer.openClient();
  const split = await c.request("pane.split", { paneId, direction: "right" });
  const p2 = split.pane.id;
  c.close();
  await set(appServer, p2, "pa", "panel");
  const second = `[data-pane-id="${p2}"] `;
  await expect(dock(page, "bottom", second)).toHaveCount(1);
  await expect(dock(page, "bottom", second)).toBeVisible();
});

test("(3) 横: 左と右の合計が 40 列の残りを超えると縮む。それでも入らなければ左が先にトレイの押せないボタンになり、広げると戻る。記憶は変わらない", async ({ page, appServer }) => {
  test.setTimeout(90_000);
  const { paneId, views } = await openDisplayBrowser(page, appServer);
  await set(appServer, paneId, "pl", "panel", ["--dock", "left", "--size", "420"]);
  await set(appServer, paneId, "pr", "panel", ["--dock", "right", "--size", "420"]);
  await expect(dock(page, "left")).toHaveCount(1);
  await expect(dock(page, "right")).toHaveCount(1);
  const colsOk = async (label: string): Promise<void> => {
    await page.waitForTimeout(400);
    const v = views.latest()!.visible[0]!;
    expect(v.cols, `${label}: 列数`).toBeGreaterThanOrEqual(40);
    expect(v.rows, `${label}: 行数`).toBeGreaterThanOrEqual(10);
  };
  await colsOk("1280");
  const wide = (await boxOf(dock(page, "left"))).width + (await boxOf(dock(page, "right"))).width;
  expect(wide).toBeLessThan(840); // 420 + 420 より縮んでいる（端末の 40 列を残すため）
  // 狭める: 合計の最小（160 + 160）が入らなくなるまで
  for (const w of [1100, 950, 850, 768]) {
    await page.setViewportSize({ width: w, height: 800 });
    await colsOk(`${w}`);
  }
  // 左が先にたたまれ、トレイの押せないボタンになる
  await expect(dock(page, "left")).toHaveCount(0);
  await expect(dock(page, "right")).toHaveCount(1);
  await expect(trayButton(page, "pl")).toBeDisabled();
  await expect(trayButton(page, "pl")).toHaveAttribute("title", /狭い/);
  // 広げると戻る（記憶は変えていない）
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(dock(page, "left")).toHaveCount(1);
  await expect(trayButton(page, "pl")).toHaveCount(0);
});

test("(3) 縦: 上と下の合計が 10 行の残りを超えると縮む。それでも入らなければ上が先にトレイの押せないボタンになり、低くすると…広げると戻る", async ({ page, appServer }) => {
  test.setTimeout(90_000);
  const { paneId, views } = await openDisplayBrowser(page, appServer);
  await set(appServer, paneId, "pt", "panel", ["--dock", "top", "--size", "300"]);
  await set(appServer, paneId, "pb", "panel", ["--dock", "bottom", "--size", "300"]);
  await expect(dock(page, "top")).toHaveCount(1);
  await expect(dock(page, "bottom")).toHaveCount(1);
  const rowsOk = async (label: string): Promise<void> => {
    await page.waitForTimeout(400);
    const v = views.latest()!.visible[0]!;
    expect(v.rows, `${label}: 行数`).toBeGreaterThanOrEqual(10);
    expect(v.cols, `${label}: 列数`).toBeGreaterThanOrEqual(40);
  };
  await rowsOk("800");
  for (const h of [700, 620, 560, 500, 440, 400]) {
    await page.setViewportSize({ width: 1280, height: h });
    await rowsOk(`${h}`);
  }
  await expect(dock(page, "top")).toHaveCount(0);
  await expect(trayButton(page, "pt")).toBeDisabled();
  await expect(dock(page, "bottom")).toHaveCount(1);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(dock(page, "top")).toHaveCount(1);
  await expect(trayButton(page, "pt")).toHaveCount(0);
});

test("(4) つまみ: 4 つの側で、ドラッグの間は client.view を送らず、離して 1 回。Esc・ダブルクリック・キー・aria-valuenow。覚える", async ({ page, appServer }) => {
  test.setTimeout(90_000);
  const { paneId, views } = await openDisplayBrowser(page, appServer);
  await set(appServer, paneId, "pa", "panel", ["--size", "260"]);
  const toward: Record<Side, [number, number]> = { right: [-1, 0], left: [1, 0], top: [0, 1], bottom: [0, -1] };
  const widen: Record<Side, string> = { right: "ArrowLeft", left: "ArrowRight", top: "ArrowDown", bottom: "ArrowUp" };
  for (const side of SIDES) {
    if (side !== "right") await moveByMenu(page, appServer, paneId, "pa", side);
    const panel = dock(page, side);
    const handle = panel.locator("[data-pane-panel-resize]");
    const horizontal = side === "left" || side === "right";
    await expect(handle).toHaveAttribute("aria-orientation", horizontal ? "vertical" : "horizontal");
    const size = async (): Promise<number> => (horizontal ? (await boxOf(panel)).width : (await boxOf(panel)).height);
    await page.waitForTimeout(500);
    const s0 = await size();
    const hb = await boxOf(handle);
    const cx = hb.x + hb.width / 2;
    const cy = hb.y + hb.height / 2;
    const [dx, dy] = toward[side];
    // ドラッグ: 端末の側へ向けて動かすと広がる（右のパネルは左へ・左は右へ・上は下へ・下は上へ）
    const before = views.count();
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + dx * 40, cy + dy * 40, { steps: 4 });
    await page.mouse.move(cx + dx * 70, cy + dy * 70, { steps: 4 });
    await expect(page.locator("[data-pane-frame-guide]")).toBeVisible();
    expect(await size(), `${side}: ドラッグの間は大きさを変えない`).toBe(s0);
    await page.waitForTimeout(300);
    expect(views.count(), `${side}: ドラッグの間は client.view を送らない`).toBe(before);
    await page.mouse.up();
    await expect(page.locator("[data-pane-frame-guide]")).toHaveCount(0);
    await expect.poll(size).toBeGreaterThan(s0 + 40);
    await page.waitForTimeout(500);
    expect(views.count() - before, `${side}: 離して 1 回`).toBe(1);
    const s1 = await size();
    await expect(handle).toHaveAttribute("aria-valuenow", String(Math.round(s1)));
    // Esc: 動かして Esc → 元のまま
    await page.mouse.move(cx + dx * 70, cy + dy * 70);
    const hb2 = await boxOf(handle);
    await page.mouse.move(hb2.x + hb2.width / 2, hb2.y + hb2.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb2.x + hb2.width / 2 + dx * 50, hb2.y + hb2.height / 2 + dy * 50, { steps: 3 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(await size(), `${side}: Esc で元のまま`).toBe(s1);
    // キー: 端末の側へ向く矢印で広く
    await handle.focus();
    await page.keyboard.press(widen[side]);
    await expect.poll(size).toBe(s1 + 16);
    // ダブルクリックで指定の大きさへ
    const hb3 = await boxOf(handle);
    await page.mouse.dblclick(hb3.x + hb3.width / 2, hb3.y + hb3.height / 2);
    await expect.poll(size).toBe(s0);
    // 覚える: 広げて再読み込み
    await handle.focus();
    await page.keyboard.press(widen[side]);
    await expect.poll(size).toBe(s0 + 16);
    await page.reload();
    await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
    await expect(dock(page, side)).toHaveCount(1);
    await expect.poll(async () => Math.round(await (horizontal ? boxOf(dock(page, side)).then((b) => b.width) : boxOf(dock(page, side)).then((b) => b.height)))).toBe(Math.round(s0 + 16));
    await dock(page, side).locator("[data-pane-panel-resize]").focus();
    await page.keyboard.press("Enter"); // 指定の大きさへ戻す
  }
});

test("(5) D&D: 見出しをつかんで各場所へ。落とせる場所の文言が見え、離すと移る。Esc・pane の外・6px 未満は変わらない。ドラッグの間、pane を落とす場所は出ず、キーは流れない", async ({ page, appServer }) => {
  test.setTimeout(90_000);
  const { paneId } = await openDisplayBrowser(page, appServer);
  await set(appServer, paneId, "pa", "panel");
  const grip = (): Locator => page.locator('[data-display-root] [data-display-grip]').first();
  const body = await bodyBox(page);
  const point = (side: Side): [number, number] =>
    side === "top"
      ? [body.x + body.width / 2, body.y + 20]
      : side === "bottom"
        ? [body.x + body.width / 2, body.y + body.height - 20]
        : side === "left"
          ? [body.x + 20, body.y + body.height / 2]
          : [body.x + body.width - 20, body.y + body.height / 2];
  await page.evaluate(() => {
    const w = window as unknown as { __keys: number };
    w.__keys = 0;
    document.addEventListener("keydown", () => w.__keys++); // バブリング（capture で止められたら届かない）
  });
  const drag = async (to: [number, number], opts: { release?: boolean } = {}): Promise<void> => {
    const g = await boxOf(grip());
    await page.mouse.move(g.x + 10, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(to[0], to[1], { steps: 8 });
    if (opts.release !== false) await page.mouse.up();
  };
  let current: Side = "right";
  for (const side of ["bottom", "left", "top", "right"] as const) {
    const g = await boxOf(grip());
    await page.mouse.move(g.x + 10, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(...point(side), { steps: 8 });
    // 落とせる場所の表示
    await expect(page.locator("[data-display-drop-zones]")).toBeVisible();
    await expect(page.locator(`[data-display-drop-zone="${side}"][data-active="1"]`)).toHaveText(new RegExp(`${LABEL[side]}に置く`));
    await expect(page.locator(`[data-display-drop-zone="${current}"]`)).toContainText("ここにあります");
    await expect(page.locator('[data-display-drop-zone="float"]')).toHaveText("浮いた窓にする"); // PR-C: 中央は浮いた窓（落とせる）
    await expect(page.locator(".pane-frame-zone")).toHaveCount(0);
    await page.keyboard.press("a");
    await page.mouse.up();
    await expect(dock(page, side)).toHaveCount(1);
    await expect(page.locator("[data-display-drop-zones]")).toHaveCount(0);
    current = side;
  }
  expect(await page.evaluate(() => (window as unknown as { __keys: number }).__keys), "ドラッグ中のキーは流れない").toBe(0);
  // 中央に落とす → 浮いた窓になる（PR-C。窓の動きは display-layout-float.spec.ts）。ここでは右へ戻して続ける
  await drag([body.x + body.width / 2, body.y + body.height / 2]);
  await expect(dock(page, "right")).toHaveCount(0);
  await expect(page.locator("[data-display-float]")).toHaveCount(1);
  await page.locator("[data-display-float] [data-display-menu-button]").click();
  await menuItem(page, "右に置く").click();
  await expect(dock(page, "right")).toHaveCount(1);
  await expect(page.locator("[data-display-float]")).toHaveCount(0);
  // Esc → 変わらない
  const g = await boxOf(grip());
  await page.mouse.move(g.x + 10, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(...point("left"), { steps: 6 });
  await expect(page.locator("[data-display-drop-zones]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-display-drop-zones]")).toHaveCount(0);
  await page.mouse.up();
  await expect(dock(page, "right")).toHaveCount(1);
  // pane の外（サイドバー）で離す → 変わらない
  await drag([60, body.y + 100]);
  await expect(dock(page, "right")).toHaveCount(1);
  // 6px 未満 → 変わらず、落とせる場所も出ない
  const g2 = await boxOf(grip());
  await page.mouse.move(g2.x + 10, g2.y + g2.height / 2);
  await page.mouse.down();
  await page.mouse.move(g2.x + 13, g2.y + g2.height / 2);
  await expect(page.locator("[data-display-drop-zones]")).toHaveCount(0);
  await page.mouse.up();
  await expect(dock(page, "right")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains("soda-display-dragging"))).toBe(false);
});

for (const kind of ["script-html", "html"] as const) {
test(`(6-${kind}) load と枠の要素: 右 2 枚・下 1 枚・帯 1 本（script-html）。右の 1 枚を左へ移す（メニューと D&D）と、移した面の枠だけが作り直され、ほかの面の枠は同じ要素のまま。どの後も data-display-loads が 1`, async ({ page, appServer }) => {
  test.setTimeout(120_000);
  await enableScript(appServer);
  const { paneId, sent } = await openDisplayBrowser(page, appServer);
  const script = (n: string) => `<!doctype html><body><p>${n}</p><script>document.title='${n}'</script></body>`;
  const put = async (name: string, k: "band" | "panel", extra: string[] = []): Promise<void> => {
    if (kind === "script-html") await setScriptOk(appServer, paneId, name, script(name), { kind: k, extra });
    else await runDisplay(appServer, paneId, ["set", name, "--kind", k, "--html-file", await writeTmp(`<!doctype html><body><p>${name}</p></body>`, `${name}.html`), ...extra]).then(ok);
  };
  await put("ra", "panel");
  await put("rb", "panel");
  await put("bt", "panel", ["--dock", "bottom"]);
  await put("bd", "band");
  await expect(page.locator("iframe[data-display-frame]")).toHaveCount(3); // 右は、選んでいる 1 枚だけ
  const ids = await idsOf(appServer, paneId);
  await expect.poll(() => frameLoads(page)).toEqual(["1", "1", "1"]);
  const rightActive = (await dock(page, "right").locator('[data-pane-panel-tab][aria-selected="true"]').textContent())?.trim() ?? "";
  expect(["ra", "rb"]).toContain(rightActive);
  const other = rightActive === "ra" ? "rb" : "ra";
  const survivors = async (): Promise<Record<string, Awaited<ReturnType<typeof frameHandle>>>> => ({
    bt: await frameHandle(page, ids["bt"]!),
    bd: await frameHandle(page, ids["bd"]!),
  });
  let before = await survivors();
  const oldActive = await frameHandle(page, ids[rightActive]!);
  await watchFrames(page);
  // (a) メニューで、右の選んでいる面を左へ
  await moveByMenu(page, appServer, paneId, rightActive, "left");
  await expect(page.locator("iframe[data-display-frame]")).toHaveCount(4); // 左・右（残った 1 枚）・下・帯
  expect(await oldActive.evaluate((e) => e.isConnected), "移した面の枠は別の要素").toBe(false);
  for (const [name, h] of Object.entries(before)) expect(await h.evaluate((e) => e.isConnected), `${name} は同じ要素のまま`).toBe(true);
  const log = await takeFrameLog(page);
  expect(log, "出入りした枠は、移した面と、右で新しく選ばれた面だけ").toEqual(expect.arrayContaining([ids[rightActive]!]));
  expect(log).not.toContain(ids["bt"]!);
  expect(log).not.toContain(ids["bd"]!);
  await expect.poll(() => frameLoads(page)).toEqual(["1", "1", "1", "1"]);
  // (b) D&D で、下の面を上へ
  before = await survivors();
  const rightFrame = await frameHandle(page, ids[other]!);
  const leftFrame = await frameHandle(page, ids[rightActive]!);
  const grip = page.locator(`[data-display-dock="bottom"] [data-display-grip]`);
  const gb = await boxOf(grip);
  const bb = await bodyBox(page);
  await page.mouse.move(gb.x + 10, gb.y + gb.height / 2);
  await page.mouse.down();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + 25, { steps: 8 });
  await page.mouse.up();
  await expect(dock(page, "top")).toHaveCount(1);
  await expect(dock(page, "bottom")).toHaveCount(0);
  expect(await before["bt"]!.evaluate((e) => e.isConnected), "D&D で移した面の枠は別の要素").toBe(false);
  expect(await before["bd"]!.evaluate((e) => e.isConnected), "帯の枠は同じ要素").toBe(true);
  expect(await rightFrame.evaluate((e) => e.isConnected), "右の枠は同じ要素").toBe(true);
  expect(await leftFrame.evaluate((e) => e.isConnected), "左の枠は同じ要素").toBe(true);
  await expect.poll(() => frameLoads(page)).toEqual(["1", "1", "1", "1"]);
  const list = await ok(await runDisplay(appServer, paneId, ["list"]));
  expect((list.json as { displays: unknown[] }).displays).toHaveLength(4);
  expect(sent.reports().filter((r) => r.problem === "navigated")).toHaveLength(0);
  if (kind !== "script-html") return;
  // 移した後も覆いがあり、［操作する］で始まり、冷却に入っていない（直後の set が通る）
  await expect(page.locator("[data-display-dock=\"top\"] [data-display-cover]")).toHaveCount(1);
  await page.locator('[data-display-dock="top"] [data-display-engage]').click();
  await expect(page.locator('[data-display-dock="top"][data-display-engaged="1"]')).toHaveCount(1);
  await setScriptOk(appServer, paneId, "bt", script("bt2"), { kind: "panel", extra: ["--dock", "bottom"] });
  // 操作中に移すと、操作が終わり、端末にフォーカス
  await moveByMenu(page, appServer, paneId, "bt", "right");
  await expect.poll(() => termFocused(page)).toBe(true);
  expect(stealReports(sent)).toBe(0);
});
}

test("(6c) 操作中の script-html のパネルで、見出しのつかむ場所・各側のつまみ・［⋮］をマウスで 5 回ずつ押しても、focus_steal を 1 回も送らない。activeElement は枠にならない", async ({ page, appServer }) => {
  test.setTimeout(120_000);
  await enableScript(appServer);
  const { paneId, sent } = await openDisplayBrowser(page, appServer);
  await setScriptOk(appServer, paneId, "sp", BENIGN, { kind: "panel" });
  await expect(page.locator("iframe[data-display-script]")).toHaveCount(1);
  const engage = page.locator('[data-display-root] [data-display-engage]').first();
  for (const side of SIDES) {
    if (side !== "right") await moveByMenu(page, appServer, paneId, "sp", side);
    const panel = dock(page, side);
    for (const [name, run] of [
      ["grip", () => panel.locator("[data-display-grip]").click()],
      ["handle", async () => { const b = await boxOf(panel.locator("[data-pane-panel-resize]")); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.up(); }],
      ["⋮", async () => { await panel.locator("[data-display-menu-button]").click(); await page.keyboard.press("Escape"); }],
    ] as const) {
      for (let i = 0; i < (side === "right" ? 5 : 2); i++) {
        await expect(engage).toBeVisible();
        await engage.click();
        await expect(panel).toHaveAttribute("data-display-engaged", "1");
        await run();
        await page.waitForTimeout(350);
        expect(stealReports(sent), `${side}:${name}#${i}`).toBe(0);
        await expect.poll(() => activeTagName(page), `${side}:${name}#${i}`).not.toBe("IFRAME");
      }
    }
  }
  expect(stealReports(sent)).toBe(0);
  await expect(page.locator("iframe[data-display-script]")).toHaveCount(1);
});

test("(7) 固定の部品: 4 つの側 × 最小の大きさで、印「スクリプト」・［操作する］・［⋮］・［たたむ］・［×］の箱がパネルの箱の中に収まり、中心の elementFromPoint が自身", async ({ page, appServer }) => {
  test.setTimeout(90_000);
  await enableScript(appServer);
  const { paneId } = await openDisplayBrowser(page, appServer);
  await setScriptOk(appServer, paneId, "sp", BENIGN, { kind: "panel", extra: ["--size", "160"] });
  for (const side of SIDES) {
    if (side !== "right") await moveByMenu(page, appServer, paneId, "sp", side);
    const panel = dock(page, side);
    // 最小の大きさ（左右は 160px・上下は 96px）へ
    await panel.locator("[data-pane-panel-resize]").focus();
    await page.keyboard.press("Home");
    const min = side === "left" || side === "right" ? 160 : 96;
    await expect.poll(async () => Math.round(side === "left" || side === "right" ? (await boxOf(panel)).width : (await boxOf(panel)).height)).toBe(min);
    const pb = await boxOf(panel);
    for (const sel of ["[data-display-script-mark]", "[data-display-engage]", "[data-display-menu-button]", "[data-pane-panel-fold]", "[data-pane-panel-close]"]) {
      const loc = panel.locator(sel).first();
      const b = await boxOf(loc);
      expect(b.x, `${side} ${sel} 左`).toBeGreaterThanOrEqual(pb.x - 1);
      expect(b.x + b.width, `${side} ${sel} 右`).toBeLessThanOrEqual(pb.x + pb.width + 1);
      expect(b.y, `${side} ${sel} 上`).toBeGreaterThanOrEqual(pb.y - 1);
      expect(b.y + b.height, `${side} ${sel} 下`).toBeLessThanOrEqual(pb.y + pb.height + 1);
      expect(await centerHitsSelf(loc), `${side} ${sel} 中心`).toBe(true);
    }
  }
});

test("(8) 知らせ: パネルが下と右にあるとき、知らせの箱が [data-display-chrome] のどの箱とも重ならない", async ({ page, appServer }) => {
  const c = await appServer.openClient();
  const paneId = c.helloSnapshot()!.panes[0]!.id;
  await set(appServer, paneId, "pr", "panel");
  await set(appServer, paneId, "pb", "panel", ["--dock", "bottom"]);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await expect(page.locator(".toast").first()).toBeVisible();
  const toast = await boxOf(page.locator(".toast-list"));
  const chrome = page.locator("[data-display-chrome]");
  const n = await chrome.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const b = await chrome.nth(i).boundingBox();
    if (b && b.width > 0 && b.height > 0) expect(toast.x < b.x + b.width && toast.x + toast.width > b.x && toast.y < b.y + b.height && toast.y + toast.height > b.y, `chrome #${i}`).toBe(false);
  }
});

test("(9) --dock bottom は記憶の無い面にだけ効く（利用者が移した後は、set で動かない）。設定の既定の置き場所は、指定の無い面に効く", async ({ page, appServer }) => {
  const { paneId } = await openDisplayBrowser(page, appServer);
  await set(appServer, paneId, "pa", "panel", ["--dock", "bottom"]);
  await expect(dock(page, "bottom")).toHaveCount(1);
  const list = await ok(await runDisplay(appServer, paneId, ["list"]));
  expect((list.json as { displays: { dock?: string }[] }).displays[0]!.dock).toBe("bottom");
  // 利用者が左へ移した後は、プログラムが set で --dock top を指定しても動かない
  await moveByMenu(page, appServer, paneId, "pa", "left");
  await set(appServer, paneId, "pa", "panel", ["--dock", "top"]);
  await page.waitForTimeout(400);
  await expect(dock(page, "left")).toHaveCount(1);
  await expect(dock(page, "top")).toHaveCount(0);
  // 設定の既定の置き場所（指定の無い面）
  const c = await appServer.openClient();
  await c.request("prefs.set", { patch: { displayPanelDock: "top" } });
  c.close();
  await set(appServer, paneId, "pz", "panel");
  await expect(dock(page, "top")).toHaveCount(1);
  await expect(dock(page, "top")).toHaveAttribute("data-display-root", (await idsOf(appServer, paneId))["pz"]!);
});

test("(11) 戻しすぎと遮断器: script-html の面を載せたまま、キーボードで置き場所を右 → 下 → 左 → 上 と変え続けても、activeElement が 1 度も body にならず、スクリプトの枠が止まらない。300ms ごとに落とす面を載せたまま D&D・つまみ・メニューが通る", async ({ page, appServer }) => {
  test.setTimeout(240_000);
  await enableScript(appServer);
  const { paneId, sent } = await openDisplayBrowser(page, appServer);
  await setScriptOk(appServer, paneId, "g", BENIGN, { kind: "panel" });
  await setScriptOk(appServer, paneId, "bd", BENIGN, { kind: "band" });
  await expect(page.locator("iframe[data-display-script]")).toHaveCount(2);
  await trackBodyHits(page, false);
  // メニューの項目の並び: 「たたむ」→ 今と違う側（右・左・上・下の順）→ 「この表示を閉じる」。選ぶ側の位置まで矢印で動かして Enter（読み取りを挟まない）。
  let current: Side = "right";
  const keyMove = async (side: Side): Promise<void> => {
    const idx = 1 + SIDES.filter((x) => x !== current).indexOf(side);
    await page.locator('[data-display-root][data-display-dock] [data-display-menu-button]').first().focus();
    await page.keyboard.press("Enter");
    for (let i = 0; i < idx; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    current = side;
  };
  const order: Side[] = ["bottom", "left", "top", "right"];
  // 遮断器は「3 秒に 15 回のフォーカスの脱落」で働く。このテストが意味を持つのは、3 秒の窓に 16 回以上の移動が入った区間が実際にあったとき。
  // マシンが遅くて平均のペースが足りなかった回は、失敗にせず、その区間ができるまで続ける。上限まで続けてもできなければ、試せていないので、最後に「飛ばし」にする（通さない）。
  const stamps: number[] = [];
  const WINDOW_MS = 3000;
  const BURST = 17; // 17 個の時刻 = 16 回分の移動が 3 秒の窓に入る
  const MAX_MOVES = 240;
  const burstFound = (): boolean => stamps.length >= BURST && stamps.some((t, i) => i + BURST - 1 < stamps.length && stamps[i + BURST - 1]! - t < WINDOW_MS);
  for (let round = 0; stamps.length < MAX_MOVES && (stamps.length < 24 || !burstFound()); round++) {
    for (const side of order) {
      await keyMove(side);
      await dock(page, side).waitFor(); // expect の再試行（100ms 刻み）を挟まず、出た瞬間に次へ進む（速さが要る）
      stamps.push(Date.now());
    }
  }
  await expect(dock(page, current)).toHaveCount(1);
  expect(stamps.length).toBeGreaterThanOrEqual(24);
  expect(await bodyHits(page), "activeElement が body になった回数").toBe(0);
  await expect(page.locator("iframe[data-display-script]")).toHaveCount(2);
  await expect(page.locator("[data-display-note]")).toHaveCount(0);
  await expect(page.locator(".toast", { hasText: "繰り返し外しています" })).toHaveCount(0);
  expect(stealReports(sent)).toBe(0);
  // 上の「脱落が 0」は、速さが足りないと遮断器を試したことにならない。3 秒の窓に 16 回分の移動が入った区間が無ければ、通さず、試せなかったものとして飛ばす（失敗にもしない）。
  const fastest16 = Math.min(...stamps.slice(BURST - 1).map((t, i) => t - stamps[i]!));
  test.info().annotations.push({ type: "最速の 16 回分", description: `${fastest16}ms（${stamps.length} 回）` });
  test.skip(!burstFound(), `3 秒の窓に 16 回分の移動が入る速さが出ず、遮断器を試せなかった（${stamps.length} 回、最速の 16 回分: ${fastest16}ms）。マシンの負荷を下げて流し直す`);
});

test("(11b) 300ms ごとに落とす面を載せたまま、D&D・つまみ・メニューの操作が通る（フォーカスが引き戻されて壊れない）", async ({ page, appServer }) => {
  test.setTimeout(120_000);
  await enableScript(appServer);
  const { paneId } = await openDisplayBrowser(page, appServer);
  await setScriptOk(appServer, paneId, "g", `<!doctype html><body><p>face</p><script>setInterval(function(){ window.focus(); parent.focus(); }, 300);</script></body>`, { kind: "panel" });
  await set(appServer, paneId, "pa", "panel", ["--dock", "bottom"]);
  await expect(page.locator("iframe[data-display-script]")).toHaveCount(1);
  // メニュー
  await moveByMenu(page, appServer, paneId, "pa", "left");
  // つまみ（キー）
  const handle = dock(page, "left").locator("[data-pane-panel-resize]");
  await handle.focus();
  const before = (await boxOf(dock(page, "left"))).width;
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await boxOf(dock(page, "left"))).width).toBe(before + 16);
  // D&D
  const grip = dock(page, "left").locator("[data-display-grip]");
  const gb = await boxOf(grip);
  const bb = await bodyBox(page);
  await page.mouse.move(gb.x + 10, gb.y + gb.height / 2);
  await page.mouse.down();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + 20, { steps: 8 });
  await expect(page.locator('[data-display-drop-zone="top"][data-active="1"]')).toBeVisible();
  await page.mouse.up();
  await expect(dock(page, "top")).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.locator("iframe[data-display-script]")).toHaveCount(1);
  await expect.poll(() => termFocused(page)).toBe(true);
});

test("(12) 固定の文言: 4 つの側（最小の大きさ）で、設定で無効のときの文言と、遮断器の後の文言・［再開］が、パネルの箱の中に見えて、［再開］を押せる", async ({ page, appServer }) => {
  test.setTimeout(120_000);
  await enableScript(appServer);
  const { paneId } = await openDisplayBrowser(page, appServer);
  await setScriptOk(appServer, paneId, "sp", BENIGN, { kind: "panel" });
  await expect(page.locator("iframe[data-display-script]")).toHaveCount(1);
  const setLocal = (on: boolean) =>
    page.evaluate((v) => {
      const pinia = (document.querySelector("#app") as unknown as { __vue_app__: { config: { globalProperties: { $pinia: { _s: Map<string, { displayScriptEnabled: boolean }> } } } } }).__vue_app__.config.globalProperties.$pinia;
      pinia._s.get("settings")!.displayScriptEnabled = v;
    }, on);
  for (const side of SIDES) {
    if (side !== "right") await moveByMenu(page, appServer, paneId, "sp", side);
    const panel = dock(page, side);
    await panel.locator("[data-pane-panel-resize]").focus();
    await page.keyboard.press("Home");
    await setLocal(false);
    const wrap = panel.locator(".display-frame-wrap");
    const note = wrap.locator(".display-frame-note", { hasText: "設定で無効になっています" });
    await expect(note, `${side}: 設定で無効`).toBeVisible();
    const wb = await boxOf(wrap);
    const tb = await note.evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      const b = r.getBoundingClientRect();
      return { x: b.left, y: b.top, right: b.right, bottom: b.bottom };
    });
    expect(tb.x).toBeGreaterThanOrEqual(wb.x - 1);
    expect(tb.right).toBeLessThanOrEqual(wb.x + wb.width + 1);
    expect(tb.bottom).toBeLessThanOrEqual(wb.y + wb.height + 1);
    await setLocal(true);
    await expect(note).toHaveCount(0);
  }
});

test("(12b) 遮断器の後の文言と［再開］: 4 つの側（最小の大きさ）で、パネルの枠の箱の中に見えて、［再開］を押すと戻る", async ({ page, appServer }) => {
  test.setTimeout(150_000);
  await enableScript(appServer);
  const { paneId } = await openDisplayBrowser(page, appServer);
  await setScriptOk(appServer, paneId, "sp", BENIGN, { kind: "panel" });
  for (const side of SIDES) {
    if (side !== "right") await moveByMenu(page, appServer, paneId, "sp", side);
    const panel = dock(page, side);
    await panel.locator("[data-pane-panel-resize]").focus();
    await page.keyboard.press("Home");
    // 毎フレームフォーカスを落とす面（帯）を足して、利用者が端末を触る → 遮断器
    await setScriptOk(appServer, paneId, "drop", `<!doctype html><body><script>(function f(){window.focus();parent.focus();requestAnimationFrame(f);})();</script></body>`, { kind: "band" });
    await expect(page.locator("iframe[data-display-script]")).toHaveCount(2);
    await page.locator(".xterm-screen").first().click();
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press("a");
      await page.waitForTimeout(25);
    }
    const wrap = panel.locator(".display-frame-wrap");
    const note = wrap.locator(".display-frame-note", { hasText: "入力のフォーカスが繰り返し外されたので" });
    await expect(note, `${side}: 遮断器の文言`).toBeVisible({ timeout: 10_000 });
    const wb = await boxOf(wrap);
    const nb = await boxOf(note);
    expect(nb.x, side).toBeGreaterThanOrEqual(wb.x - 1);
    expect(nb.x + nb.width, side).toBeLessThanOrEqual(wb.x + wb.width + 1);
    const again = wrap.locator("[data-display-redisplay]");
    await expect(again).toBeVisible();
    expect(await centerHitsSelf(again), `${side}: ［再開］の中心`).toBe(true);
    await again.click();
    await expect(note).toHaveCount(0);
    await ok(await runDisplay(appServer, paneId, ["close", "drop"]));
    await expect(page.locator("iframe[data-display-script]")).not.toHaveCount(0);
  }
});

test("(5b) D&D の途中で、つかんだ面が閉じられて同じ側の別の面の見出しになっても、その別の面は動かない（取り消され、ドラッグの状態が残らない）", async ({ page, appServer }) => {
  test.setTimeout(60_000);
  const { paneId } = await openDisplayBrowser(page, appServer);
  await set(appServer, paneId, "pa", "panel");
  await set(appServer, paneId, "pb", "panel");
  const ids = await idsOf(appServer, paneId);
  await expect(dock(page, "right")).toHaveAttribute("data-display-root", ids["pa"]!); // 見出しは pa（選んでいる 1 枚）
  const g = await boxOf(dock(page, "right").locator("[data-display-grip]"));
  const body = await bodyBox(page);
  await page.mouse.move(g.x + 10, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(body.x + 30, body.y + body.height / 2, { steps: 8 });
  await expect(page.locator('[data-display-drop-zone="left"][data-active="1"]')).toBeVisible();
  // 途中で pa を閉じる → 同じ側の pb の見出しになる（同じ見出しの部品が使い回される）
  await ok(await runDisplay(appServer, paneId, ["close", "pa"]));
  await expect(dock(page, "right")).toHaveAttribute("data-display-root", ids["pb"]!);
  // 取り消されて、落とせる場所の表示・<html> のクラスが残らない
  await expect(page.locator("[data-display-drop-zones]")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains("soda-display-dragging"))).toBe(false);
  // 左の落とせる場所の上で離しても、pb は動かない
  await page.mouse.move(body.x + 40, body.y + body.height / 2, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await expect(dock(page, "right")).toHaveAttribute("data-display-root", ids["pb"]!);
  await expect(dock(page, "left")).toHaveCount(0);
  await expect(page.locator("[data-display-drop-zones]")).toHaveCount(0);
  // ドラッグの状態は残らない: 次のドラッグは、ふつうに始まって落とせる
  const g2 = await boxOf(dock(page, "right").locator("[data-display-grip]"));
  await page.mouse.move(g2.x + 10, g2.y + g2.height / 2);
  await page.mouse.down();
  await page.mouse.move(body.x + 30, body.y + body.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(dock(page, "left")).toHaveAttribute("data-display-root", ids["pb"]!);
});

test("(7b) 操作中（［操作を終える］が出ている間）も、最小の大きさ × 4 つの側 × 広い pane・3 分割の pane で、固定の部品がパネルの箱の中に全部あり、中心がその部品自身で、端末の箱と重ならない（切って隠していない）。細すぎる pane の上下は自動でたたまれる", async ({ page, appServer }) => {
  test.setTimeout(120_000);
  await enableScript(appServer);
  const { paneId } = await openDisplayBrowser(page, appServer);
  await setScriptOk(appServer, paneId, "sp", BENIGN, { kind: "panel", extra: ["--size", "160"] });
  const c = await appServer.openClient();
  const split = async (): Promise<void> => {
    await c.request("pane.split", { paneId, direction: "right" });
  };
  const pane = page.locator(`[data-pane-id="${paneId}"]`);
  const checkSide = async (side: Side, label: string): Promise<void> => {
    const panel = pane.locator(`[data-display-dock="${side}"]`);
    await panel.locator("[data-pane-panel-resize]").focus();
    await page.keyboard.press("Home");
    const min = side === "left" || side === "right" ? 160 : 96;
    await expect.poll(async () => Math.round(side === "left" || side === "right" ? (await boxOf(panel)).width : (await boxOf(panel)).height), `${label}: 最小`).toBe(min);
    // 操作中にする（［操作する］ → ［操作を終える］）
    await panel.locator("[data-display-engage]").click();
    await expect(panel).toHaveAttribute("data-display-engaged", "1");
    const end = panel.locator("[data-display-end]");
    await expect(end, `${label}: ［操作を終える］`).toBeVisible();
    await page.waitForTimeout(200);
    const pb = await boxOf(panel);
    const mb = await boxOf(pane.locator("[data-pane-frame-main]"));
    for (const sel of ["[data-display-script-mark]", "[data-display-end]", "[data-display-menu-button]", "[data-pane-panel-fold]", "[data-pane-panel-close]"]) {
      const loc = panel.locator(sel).first();
      const b = await boxOf(loc);
      expect(b.x, `${label} ${sel} 左`).toBeGreaterThanOrEqual(pb.x - 1);
      expect(b.x + b.width, `${label} ${sel} 右`).toBeLessThanOrEqual(pb.x + pb.width + 1);
      expect(b.y, `${label} ${sel} 上`).toBeGreaterThanOrEqual(pb.y - 1);
      expect(b.y + b.height, `${label} ${sel} 下`).toBeLessThanOrEqual(pb.y + pb.height + 1);
      expect(await centerHitsSelf(loc), `${label} ${sel} 中心`).toBe(true);
      expect(intersects(b, mb), `${label} ${sel} は端末の箱と重ならない`).toBe(false);
    }
    // 切って隠していない: 見出しと操作中の説明文が、自分の箱からはみ出さない（つまみの見えない当たり判定の分は、中身ではないので見ない）
    const noteShown = side === "left" || side === "right";
    for (const sel of noteShown ? ["[data-display-head]", "[data-pane-panel-engaged-note]"] : ["[data-display-head]"]) {
      const over = await panel.locator(sel).first().evaluate((el) => ({ w: el.scrollWidth - el.clientWidth, h: el.scrollHeight - el.clientHeight }));
      expect(over.w, `${label} ${sel}: 横の溢れ`).toBeLessThanOrEqual(1);
      expect(over.h, `${label} ${sel}: 縦の溢れ`).toBeLessThanOrEqual(1);
    }
    // 説明文が見えているときは、パネルの箱の中に収まり、端末の箱と重ならない（低い上下では見せない）
    const note = panel.locator("[data-pane-panel-engaged-note]");
    if (noteShown) {
      const nb = await boxOf(note);
      expect(nb.x + nb.width, `${label}: 説明文の右`).toBeLessThanOrEqual(pb.x + pb.width + 1);
      expect(intersects(nb, mb), `${label}: 説明文は端末の箱と重ならない`).toBe(false);
    }
    // 操作を終えて戻す（次の側へ）
    await end.click();
    await expect(panel).toHaveAttribute("data-display-engaged", "0");
  };
  for (const side of SIDES) {
    if (side !== "right") await moveByMenu(page, appServer, paneId, "sp", side);
    await checkSide(side, `広い ${side}`);
  }
  // 3 分割（pane の幅 約 350px）: 上下は 2 行に折れて収まる。左右は幅が足りず自動でたたまれる
  await split();
  await split();
  await expect.poll(async () => (await boxOf(pane)).width).toBeLessThan(420);
  for (const side of ["top", "bottom"] as const) {
    await moveByMenu(page, appServer, paneId, "sp", side).catch(async () => {
      await trayButton(page, "sp").click();
    });
    await expect(pane.locator(`[data-display-dock="${side}"]`)).toHaveCount(1);
    await checkSide(side, `3 分割 ${side}`);
  }
  // 上下のパネルにある面を左へ（3 分割の幅では 40 列が入らないので、自動でたたまれる。トレイの押せないボタン）
  await openFaceMenu(page, appServer, paneId, "sp");
  await menuItem(page, "左に置く").click();
  await expect(pane.locator('[data-display-dock="left"]')).toHaveCount(0);
  const btn = pane.locator('[data-display-tray-button][data-display-name="sp"]');
  if ((await btn.count()) > 0) await expect(btn).toBeDisabled();
  else await expect(pane.locator("[data-display-tray-more]")).toBeVisible();
  c.close();
});
