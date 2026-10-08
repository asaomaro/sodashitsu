import type { Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { runDisplay } from "../support/display.js";
import { frameLoc, openDisplayBrowser, writeTmp } from "../support/displayBrowser.js";
import { activeTagName, boxOf, centerHitsSelf, clickBlankAppSpace, frameHandle, intersects, trayButton, trayButtons } from "../support/displayLayout.js";
import { enableScript, ok, setScriptOk } from "../support/displayScript.js";
import { focusTerminal, prefixKey } from "../support/keys.js";

/**
 * 表示の面の状態の記憶と既定・帯のたたみと上下・帯の行のボタン（20261008-display-layout の PR-A）。合否はブラウザの側の観測で見る
 * （DOM・箱・`elementFromPoint`・`document.activeElement`・ブラウザが送った `client.view`・`display.*`）。
 */
const set = (appServer: AppServer, paneId: string, name: string, kind: "panel" | "band", extra: string[] = [], text = name) =>
  runDisplay(appServer, paneId, ["set", name, "--kind", kind, "--text", text, ...extra]).then(ok);
const reload = async (page: Page): Promise<void> => {
  await page.reload();
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
};
const panelCount = (page: Page) => page.locator("[data-pane-panel]");
const stored = (page: Page): Promise<{ faces: Record<string, unknown>; names: Record<string, unknown> }> =>
  page.evaluate(() => (JSON.parse(localStorage.getItem("soda.prefs.v1") ?? "{}") as { displayLayout?: never }).displayLayout ?? { faces: {}, names: {} });
/** 面の名前 → 面の id（`data-display-root` は id）。 */
const idsOf = async (appServer: AppServer, paneId: string): Promise<Record<string, string>> => {
  const r = await ok(await runDisplay(appServer, paneId, ["list"]));
  return Object.fromEntries((r.json as { displays: { id: string; name: string }[] }).displays.map((d) => [d.name, d.id]));
};
const openFaceMenu = async (page: Page, appServer: AppServer, paneId: string, name: string): Promise<void> => {
  const id = (await idsOf(appServer, paneId))[name]!;
  await page.locator(`[data-display-root="${id}"] [data-display-menu-button]`).click();
  await expect(page.getByRole("menu")).toBeVisible();
};
const menuItem = (page: Page, label: string) => page.getByRole("menuitem", { name: label, exact: true });

test("(1) たたみの記憶: 再読み込みしても保たれる。別の localStorage は既定のまま。面を閉じて同じ名前で出し直しても同じ状態", async ({ page, appServer, browser }) => {
  const { paneId } = await openDisplayBrowser(page, appServer);
  await set(appServer, paneId, "p", "panel");
  await expect(panelCount(page)).toHaveCount(1);
  await page.locator("[data-pane-panel-fold]").click();
  await expect(panelCount(page)).toHaveCount(0);
  await expect(trayButtons(page)).toHaveCount(1);
  await reload(page);
  await expect(trayButtons(page)).toHaveCount(1);
  await expect(panelCount(page)).toHaveCount(0);
  // 別の context（別の localStorage）は既定（開いたまま）
  const ctx = await browser.newContext();
  const page2 = await ctx.newPage();
  await page2.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page2.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await expect(page2.locator("[data-pane-panel]")).toHaveCount(1);
  await ctx.close();
  // 開く → 再読み込み → 開いたまま
  await trayButton(page, "p").click();
  await expect(panelCount(page)).toHaveCount(1);
  await reload(page);
  await expect(panelCount(page)).toHaveCount(1);
  await expect(trayButtons(page)).toHaveCount(0);
  // たたむ → 面を close → 同じ名前で set → たたんだまま
  await page.locator("[data-pane-panel-fold]").click();
  await expect(trayButtons(page)).toHaveCount(1);
  await ok(await runDisplay(appServer, paneId, ["close", "p"]));
  await expect(trayButtons(page)).toHaveCount(0);
  await set(appServer, paneId, "p", "panel");
  await expect(trayButtons(page)).toHaveCount(1);
  await expect(panelCount(page)).toHaveCount(0);
});

test("(2) 設定「初めの状態」: たたむにすると新しい名前のパネルはボタンで出る。開いた面は開いたまま。--collapsed なしの set で開かない", async ({ page, appServer }) => {
  const { paneId } = await openDisplayBrowser(page, appServer);
  await set(appServer, paneId, "old", "panel");
  await expect(panelCount(page)).toHaveCount(1);
  await page.locator("[data-pane-panel-fold]").click();
  await trayButton(page, "old").click(); // 利用者が開いた（記憶に「開く」）
  await expect(panelCount(page)).toHaveCount(1);
  const c = await appServer.openClient();
  await c.request("prefs.set", { patch: { displayPanelInitial: "collapsed" } });
  c.close();
  await set(appServer, paneId, "fresh", "panel");
  await expect(trayButton(page, "fresh")).toBeVisible();
  await expect(trayButton(page, "old")).toHaveCount(0); // 開いた面は開いたまま
  await expect(panelCount(page)).toHaveCount(1);
  // 「たたむ」の設定で、`--collapsed` なしの set をしても開かない（プログラムは開かせられない）
  await set(appServer, paneId, "fresh", "panel", ["--size", "400"]);
  await expect(trayButton(page, "fresh")).toBeVisible();
});

test("(3)(4) 帯: メニューからたたむと行が消え、端末が高くなり client.view の行数が増える。ボタンで戻る。下へ置くと端末の下に出て覚える。トレイは帯の枠と重ならない", async ({ page, appServer }) => {
  const { paneId, views } = await openDisplayBrowser(page, appServer);
  await expect.poll(() => views.latest()?.visible[0]?.rows).toBeGreaterThan(0);
  const rows0 = views.latest()!.visible[0]!.rows;
  await set(appServer, paneId, "bar", "band", ["--size", "96"]);
  await expect(page.locator("[data-pane-band]")).toHaveCount(1);
  await expect.poll(() => views.latest()!.visible[0]!.rows).toBeLessThan(rows0);
  const rowsWith = views.latest()!.visible[0]!.rows;
  const mainH0 = (await boxOf(page.locator("[data-pane-frame-main]"))).height;
  // トレイ（帯の行の中）: 帯の枠とボタンの箱は重ならず、ボタンの中心は自分自身に当たる
  await openFaceMenu(page, appServer, paneId, "bar");
  await menuItem(page, "たたむ").click();
  await expect(page.locator("[data-pane-band]")).toHaveCount(0);
  await expect(trayButton(page, "bar")).toBeVisible();
  await expect.poll(() => views.latest()!.visible[0]!.rows).toBeGreaterThan(rowsWith);
  // 帯が無いときは 24px の行
  expect((await boxOf(page.locator("[data-display-tray-row]"))).height).toBe(24);
  // 押すと戻る
  await trayButton(page, "bar").click();
  await expect(page.locator("[data-pane-band]")).toHaveCount(1);
  await expect.poll(() => views.latest()!.visible[0]!.rows).toBe(rowsWith);
  // 下へ
  await openFaceMenu(page, appServer, paneId, "bar");
  await menuItem(page, "下に置く").click();
  await expect(page.locator('[data-pane-bands-edge="bottom"] [data-pane-band]')).toHaveCount(1);
  const band = await boxOf(page.locator("[data-pane-band]"));
  const main = await boxOf(page.locator("[data-pane-frame-main]"));
  expect(band.y).toBeGreaterThanOrEqual(main.y + main.height - 1);
  expect(Math.abs(main.height - mainH0)).toBeLessThan(3);
  await reload(page);
  await expect(page.locator('[data-pane-bands-edge="bottom"] [data-pane-band]')).toHaveCount(1);
  expect((await stored(page)).names).toMatchObject({ "band|bar": { edge: "bottom" } });
  // `--edge` と設定の既定（帯は 2 本まで。下の帯を閉じてから）
  await ok(await runDisplay(appServer, paneId, ["close", "bar"]));
  await set(appServer, paneId, "bar2", "band", ["--edge", "bottom"]);
  await expect(page.locator('[data-pane-bands-edge="bottom"] [data-pane-band]')).toHaveCount(1);
  await ok(await runDisplay(appServer, paneId, ["close", "bar2"]));
  await set(appServer, paneId, "bar2", "band", ["--edge", "top"]);
  await expect(page.locator('[data-pane-bands-edge="top"] [data-pane-band]')).toHaveCount(1);
  const c = await appServer.openClient();
  await c.request("prefs.set", { patch: { displayBandEdge: "bottom" } });
  c.close();
  await set(appServer, paneId, "bar3", "band"); // 指定なし → 設定の下
  await expect(page.locator('[data-pane-bands-edge="bottom"] [data-pane-band]')).toHaveCount(1);
});

test("(4) トレイ: 帯の行の中・帯の枠と箱が交わらない・ボタンの中心が自分自身。中身が外へ描こうとしても同じ。狭い pane で「ほか N」が出て、押すと面の一覧が開き、帯の右端の［×］が欠けない", async ({ page, appServer }) => {
  const { paneId } = await openDisplayBrowser(page, appServer);
  const evil = `<!doctype html><body style="margin:0"><div style="position:fixed;left:-500px;top:-500px;width:5000px;height:5000px;background:red;z-index:99999;margin:-9999px"></div><p style="margin-left:-300px">x</p></body>`;
  await set(appServer, paneId, "bar", "band", ["--size", "48"]);
  await runDisplay(appServer, paneId, ["set", "ev", "--kind", "band", "--html-file", await writeTmp(evil), "--size", "48"]).then(ok);
  await set(appServer, paneId, "pa", "panel");
  await page.locator("[data-pane-panel-fold]").click();
  await expect(trayButton(page, "pa")).toBeVisible();
  const btn = page.locator('[data-display-tray-button][data-display-name="pa"]');
  expect(await centerHitsSelf(btn)).toBe(true);
  const frames = page.locator("[data-pane-band] iframe[data-display-frame]");
  for (let i = 0; i < (await frames.count()); i++) {
    expect(intersects(await boxOf(btn), await boxOf(frames.nth(i)))).toBe(false);
  }
  // 4 つたたんで、狭い pane（分割）にすると「ほか N」
  await ok(await runDisplay(appServer, paneId, ["close", "ev"]));
  for (const n of ["x1", "x2", "x3"]) {
    await set(appServer, paneId, n, "panel", ["--collapsed"]);
  }
  const c = await appServer.openClient();
  await c.request("pane.split", { paneId, direction: "right" });
  await c.request("pane.split", { paneId, direction: "right" });
  c.close();
  await expect(page.locator("[data-display-tray-more]")).toBeVisible();
  const more = page.locator("[data-display-tray-more]");
  await more.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("menuitem")).not.toHaveCount(0);
  await page.keyboard.press("Escape");
  const close = page.locator("[data-pane-band-close]").first();
  const bandBox = await boxOf(page.locator("[data-pane-band]").first());
  const closeBox = await boxOf(close);
  expect(closeBox.x + closeBox.width).toBeLessThanOrEqual(bandBox.x + bandBox.width + 1);
  expect(await centerHitsSelf(close)).toBe(true);
});

test("(5) --collapsed・--edge は記憶の無い面に効く。--dock bottom は list に載るが PR-A の画面では右に出る。操作した後は指定を変えても変わらない。帯を下へ移しただけの後、--collapsed つきの set でたたまれない。「プログラムの指定に戻す」で戻る", async ({ page, appServer }) => {
  const { paneId } = await openDisplayBrowser(page, appServer);
  await set(appServer, paneId, "c", "panel", ["--collapsed"]);
  await expect(trayButton(page, "c")).toBeVisible();
  await set(appServer, paneId, "d", "panel", ["--dock", "bottom"]);
  const list = await ok(await runDisplay(appServer, paneId, ["list"]));
  expect((list.json as { displays: { name: string; dock?: string }[] }).displays.find((x) => x.name === "d")?.dock).toBe("bottom");
  await expect(page.locator('[data-pane-panel][data-display-dock="right"]')).toHaveCount(1); // 落ちずに右に出る
  // 利用者が開く → 指定を変えた set でも変わらない
  await trayButton(page, "c").click();
  await expect(page.locator("[data-pane-panel-tab]")).toHaveCount(2);
  await set(appServer, paneId, "c", "panel", ["--collapsed", "--size", "300"]);
  await expect(trayButtons(page)).toHaveCount(0);
  // 帯を下へ移しただけの後、--collapsed つきの set をしても、たたまれない
  await set(appServer, paneId, "bb", "band", ["--collapsed"]);
  await expect(trayButton(page, "bb")).toBeVisible();
  await trayButton(page, "bb").click();
  await openFaceMenu(page, appServer, paneId, "bb");
  await menuItem(page, "下に置く").click();
  await set(appServer, paneId, "bb", "band", ["--collapsed", "--edge", "top"]);
  await expect(page.locator('[data-pane-bands-edge="bottom"] [data-pane-band]')).toHaveCount(1);
  await expect(trayButtons(page)).toHaveCount(0);
  // 「プログラムの指定に戻す」: 指定の collapsed・edge top に戻る
  await openFaceMenu(page, appServer, paneId, "bb");
  await menuItem(page, "プログラムの指定に戻す").click();
  await expect(trayButton(page, "bb")).toBeVisible();
});

test("(6) load と枠の要素: 変えた面の枠は別の要素・変えていない面の枠は同じ要素のまま。どの後も data-display-loads が 1 で、面が残り、navigated を送らない。script-html でも同じ", async ({ page, appServer }) => {
  await enableScript(appServer);
  const { paneId, sent } = await openDisplayBrowser(page, appServer);
  const script = (n: string) => `<!doctype html><body><p>${n}</p><script>document.title='${n}'</script></body>`;
  await setScriptOk(appServer, paneId, "t1", script("t1"), { kind: "band" });
  await setScriptOk(appServer, paneId, "t2", script("t2"), { kind: "band" });
  await setScriptOk(appServer, paneId, "pa", script("pa"));
  await setScriptOk(appServer, paneId, "pb", script("pb"));
  await expect(page.locator("iframe[data-display-frame]")).toHaveCount(3); // 帯 2 + パネル（選んでいる 1 枚）
  const loads = async (): Promise<string[]> => page.locator("iframe[data-display-frame]").evaluateAll((els) => els.map((e) => e.getAttribute("data-display-loads") ?? ""));
  expect(await loads()).toEqual(["1", "1", "1"]);
  // (a) 帯の 1 本目を下へ
  const ids = await idsOf(appServer, paneId);
  const t1 = await frameHandle(page, ids["t1"]!);
  const t2 = await frameHandle(page, ids["t2"]!);
  const pa = await frameHandle(page, ids["pa"]!);
  await openFaceMenu(page, appServer, paneId, "t1");
  await menuItem(page, "下に置く").click();
  await expect(page.locator('[data-pane-bands-edge="bottom"] [data-pane-band]')).toHaveCount(1);
  expect(await t1.evaluate((e) => e.isConnected)).toBe(false); // 移した帯の枠は別の要素
  expect(await t2.evaluate((e) => e.isConnected)).toBe(true); // もう 1 本の帯の枠は同じ要素
  expect(await pa.evaluate((e) => e.isConnected)).toBe(true); // パネルの枠も同じ要素
  expect(await loads()).toEqual(["1", "1", "1"]);
  // (b) パネルの 1 枚をたたむ／開く・タブの切り替え・帯をたたむ／開く
  const t1b = await frameHandle(page, ids["t1"]!);
  const t2b = await frameHandle(page, ids["t2"]!);
  await page.locator("[data-pane-panel-tab]", { hasText: "pb" }).click();
  expect(await t1b.evaluate((e) => e.isConnected)).toBe(true);
  expect(await t2b.evaluate((e) => e.isConnected)).toBe(true);
  await page.locator("[data-pane-panel-fold]").click(); // pb をたたむ
  await trayButton(page, "pb").click();
  expect(await t1b.evaluate((e) => e.isConnected)).toBe(true);
  expect(await t2b.evaluate((e) => e.isConnected)).toBe(true);
  await openFaceMenu(page, appServer, paneId, "t2");
  await menuItem(page, "たたむ").click();
  await trayButton(page, "t2").click();
  expect(await t1b.evaluate((e) => e.isConnected)).toBe(true);
  await expect.poll(async () => (await loads()).every((x) => x === "1")).toBe(true);
  const list = await ok(await runDisplay(appServer, paneId, ["list"]));
  expect((list.json as { displays: unknown[] }).displays).toHaveLength(4);
  expect(sent.reports().filter((r) => r.problem === "navigated")).toHaveLength(0);
  // 開いた直後は覆いがあって操作中でなく、直後の script-html の set が通る（冷却に入っていない）
  await expect(page.locator("[data-pane-panel] [data-display-cover]")).toHaveCount(1);
  await expect(page.locator('[data-pane-panel][data-display-engaged="0"]')).toHaveCount(1);
  await setScriptOk(appServer, paneId, "pa", script("pa2"));
});

// --- (7) フォーカス --------------------------------------------------------------------------------------------------------

const BENIGN = `<!doctype html><body><p>benign</p><script>setInterval(function(){}, 1000);</script></body>`;
const stealReports = (sent: { reports(): { problem: string }[] }): number => sent.reports().filter((r) => r.problem === "focus_steal").length;
const termFocused = (page: Page): Promise<boolean> => page.evaluate(() => document.activeElement?.classList.contains("xterm-helper-textarea") === true);

test("(7)(a)(b)(d) マウスで押しても activeElement は端末のまま（body にならない）。メニューを開いたまま見出しのつかむ場所を押すと端末。キーだけでたためる。静的な枠の中をクリックしてからメニューでたたむと端末", async ({ page, appServer }) => {
  const { paneId, sent } = await openDisplayBrowser(page, appServer);
  await set(appServer, paneId, "pa", "panel");
  await set(appServer, paneId, "pc", "panel", ["--collapsed"]);
  await set(appServer, paneId, "bd", "band");
  await expect(panelCount(page)).toHaveCount(1);
  await focusTerminal(page);
  const typed = async (ch: string): Promise<void> => {
    expect(await termFocused(page)).toBe(true);
    await page.keyboard.type(ch);
  };
  // (a) 1 つずつマウスで押す
  await trayButton(page, "pc").click(); // 開く（パネルの群れが 2 枚になる）
  await expect.poll(() => termFocused(page)).toBe(true);
  await typed("a");
  await page.locator("[data-pane-panel] [data-display-grip]").click();
  await expect.poll(() => termFocused(page)).toBe(true);
  await page.locator(`[data-pane-band][data-display-name="bd"] [data-display-menu-button]`).click(); // 帯の行の［⋮］
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect.poll(() => termFocused(page)).toBe(true);
  // メニューを開いたまま、見出しのつかむ場所を押して閉じる → body でなく端末
  await page.locator("[data-pane-panel] [data-display-menu-button]").click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.locator("[data-pane-panel] [data-display-grip]").click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect(await activeTagName(page)).toBe("TEXTAREA");
  await page.locator("[data-pane-panel-fold]").click(); // 見出しの［たたむ］
  await expect.poll(() => termFocused(page)).toBe(true);
  await typed("b");
  // 打った文字が pane に届く
  const pane = await appServer.openClient();
  await pane.close();
  // (b) prefix+shift+i → 矢印 → Enter → 「たたむ」→ マウス無しでたためる
  await trayButtons(page).first().click(); // 1 枚開き直す（群れに 1〜2 枚）
  const before = await panelCount(page).count();
  expect(before).toBe(1);
  await focusTerminal(page);
  await page.keyboard.press("Control+b");
  await page.keyboard.press("Shift+I");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp"); // 先頭の面
  await page.keyboard.press("Enter"); // その面のメニューへ
  await expect(page.getByRole("menuitem", { name: "たたむ", exact: true })).toBeVisible();
  await page.keyboard.press("Enter"); // 先頭の項目（開く／たたむ）
  await expect.poll(() => termFocused(page)).toBe(true);
  expect(stealReports(sent)).toBe(0);
  // (d) 静的な面の枠の中をクリックしてから、［⋮］のメニューでたたむ → 端末
  const open = await panelCount(page).count();
  if (open === 0) await trayButtons(page).first().click();
  await expect(panelCount(page)).toHaveCount(1);
  await frameLoc(page).first().locator("body").click({ force: true });
  await expect.poll(() => activeTagName(page)).toBe("IFRAME");
  await page.locator("[data-pane-panel] [data-display-menu-button]").click();
  await expect(page.getByRole("menu")).toBeVisible();
  expect(await activeTagName(page)).not.toBe("IFRAME");
  await menuItem(page, "たたむ").click();
  await expect.poll(() => termFocused(page)).toBe(true);
});

test("(7)(c) Tab で届いたボタンを Enter で押し続ける（3 秒に 16 回以上）。script-html の面を載せたまま、activeElement が 1 度も body にならず、スクリプトの枠が止まらず、知らせも出ない", async ({ page, appServer }) => {
  await enableScript(appServer);
  const { paneId, sent } = await openDisplayBrowser(page, appServer);
  await setScriptOk(appServer, paneId, "g", BENIGN, { kind: "panel" });
  await set(appServer, paneId, "st", "band");
  await expect(page.locator("iframe[data-display-script]")).toHaveCount(1);
  await page.evaluate(() => {
    const w = window as unknown as { __bodyHits: number; __samples: number };
    w.__bodyHits = 0;
    w.__samples = 0;
    document.addEventListener("focusout", (e) => { if ((e as FocusEvent).relatedTarget === null && document.activeElement !== null) w.__bodyHits += (document.activeElement === document.body ? 1 : 0); }, true);
    setInterval(() => { w.__samples++; if (document.activeElement === document.body) w.__bodyHits++; }, 25);
  });
  // `Tab` で見出しの［たたむ］へ届いた状態（キーボードの到着。xterm の Tab の扱いは別の筋が見ている）
  await page.locator("[data-pane-panel-fold]").focus();
  const t0 = Date.now();
  let presses = 0;
  while (Date.now() - t0 < 3400 && presses < 24) {
    await page.keyboard.press("Enter");
    presses++;
    await page.waitForTimeout(150);
  }
  expect(presses).toBeGreaterThanOrEqual(16);
  const hits = await page.evaluate(() => (window as unknown as { __bodyHits: number }).__bodyHits);
  expect(hits).toBe(0);
  // 止まっていない: 押した回数の偶奇でたたんだ状態で終わることがあるので、開いてから、枠があり、止めた印（[data-display-note]）が無いことを見る
  if ((await page.locator("[data-pane-panel]").count()) === 0) await trayButton(page, "g").click();
  await expect(page.locator("iframe[data-display-script]")).toHaveCount(1);
  await expect(page.locator("[data-display-note]")).toHaveCount(0);
  await expect(page.locator(".toast", { hasText: "繰り返し外しています" })).toHaveCount(0);
  expect(stealReports(sent)).toBe(0);
});

test("(7)(c') Tab で届いた［×］を Enter で閉じる → 面が消え、activeElement は端末（body にならない）。script-html の面が別に載っていても止まらない", async ({ page, appServer }) => {
  await enableScript(appServer);
  const { paneId, sent } = await openDisplayBrowser(page, appServer);
  await setScriptOk(appServer, paneId, "keep", BENIGN, { kind: "band" });
  await set(appServer, paneId, "gone", "panel");
  await expect(page.locator("[data-pane-panel]")).toHaveCount(1);
  await page.evaluate(() => {
    const w = window as unknown as { __bodyHits: number };
    w.__bodyHits = 0;
    setInterval(() => { if (document.activeElement === document.body) w.__bodyHits++; }, 20);
  });
  await page.locator("[data-pane-panel-close]").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-pane-panel]")).toHaveCount(0);
  await expect.poll(() => termFocused(page)).toBe(true);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as { __bodyHits: number }).__bodyHits)).toBe(0);
  // 帯の行の［×］も同じ
  await page.locator("[data-pane-band] [data-pane-band-close]").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-pane-band]")).toHaveCount(0);
  await expect.poll(() => termFocused(page)).toBe(true);
  expect(stealReports(sent)).toBe(0);
});

test("(7)(e) 操作中の script-html のパネルで、フォーカスを取らない部品（［⋮］・つかむ場所・別の面のトレイのボタン・幅のつまみ・帯の行の［⋮］・別の script-html の帯の覆い）を本物の押下で押しても、focus_steal を 1 回も送らない", async ({ page, appServer }) => {
  await enableScript(appServer);
  const { paneId, sent } = await openDisplayBrowser(page, appServer);
  await setScriptOk(appServer, paneId, "sp", BENIGN, { kind: "panel" });
  await setScriptOk(appServer, paneId, "sb", BENIGN, { kind: "band" });
  await set(appServer, paneId, "cp", "panel", ["--collapsed"]);
  await expect(page.locator("iframe[data-display-script]")).toHaveCount(2);
  const ids = await idsOf(appServer, paneId);
  const engage = page.locator(`[data-display-root="${ids["sp"]}"] [data-display-engage]`);
  const reengage = async (): Promise<void> => {
    await expect(engage).toBeVisible();
    await engage.click();
    await expect(page.locator(`[data-pane-panel][data-display-engaged="1"]`)).toHaveCount(1);
  };
  const presses: { name: string; run: () => Promise<void> }[] = [
    { name: "head ⋮", run: async () => { await page.locator(`[data-display-root="${ids["sp"]}"] [data-display-menu-button]`).click(); await page.keyboard.press("Escape"); } },
    { name: "grip", run: () => page.locator(`[data-display-root="${ids["sp"]}"] [data-display-grip]`).click() },
    { name: "handle", run: async () => { const b = await boxOf(page.locator("[data-pane-panel-resize]")); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.up(); } },
    { name: "band ⋮", run: async () => { await page.locator(`[data-pane-band][data-display-name="sb"] [data-display-menu-button]`).click(); await page.keyboard.press("Escape"); } },
    { name: "other script band cover", run: () => page.locator(`[data-pane-band][data-display-name="sb"] [data-display-cover]`).click({ position: { x: 10, y: 6 } }) },
    { name: "other script band cover (2)", run: () => page.locator(`[data-pane-band][data-display-name="sb"] [data-display-cover]`).click({ position: { x: 30, y: 6 } }) },
    { name: "tray button of another face", run: () => trayButton(page, "cp").click() },
  ];
  for (const p of presses) {
    await reengage();
    await p.run();
    await page.waitForTimeout(450); // 1 拍後の確認が走るまで
    expect(stealReports(sent), p.name).toBe(0);
    await expect.poll(() => activeTagName(page), p.name).not.toBe("IFRAME");
    // 面が残る（別の面のトレイのボタンは、その面を開いて選ぶので、枠は 1 つ入れ替わる）
    const list = await ok(await runDisplay(appServer, paneId, ["list"]));
    expect((list.json as { displays: { name: string }[] }).displays.map((d) => d.name).sort(), p.name).toEqual(["cp", "sb", "sp"]);
    await expect(page.locator("iframe[data-display-script]"), p.name).not.toHaveCount(0);
  }
  expect(presses.length).toBeGreaterThanOrEqual(5);
  expect(stealReports(sent)).toBe(0);
  await expect.poll(() => termFocused(page)).toBe(true);
});

test("(8) 知らせ: 帯を下に置き、知らせを出す → 知らせの箱が [data-display-chrome] のどの箱とも重ならない", async ({ page, appServer }) => {
  const c = await appServer.openClient();
  const paneId = c.helloSnapshot()!.panes[0]!.id;
  await set(appServer, paneId, "pa", "panel");
  await set(appServer, paneId, "bd", "band", ["--edge", "bottom"]);
  await set(appServer, paneId, "bu", "band", ["--edge", "top"]);
  // 最初の pane へのフォーカスで出る「キー一覧」の案内（一度だけ）を知らせとして使う。
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await expect(page.locator(".toast").first()).toBeVisible();
  const toast = await boxOf(page.locator(".toast-list"));
  const chrome = page.locator("[data-display-chrome]");
  const n = await chrome.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const b = await chrome.nth(i).boundingBox();
    if (b && b.width > 0 && b.height > 0) expect(intersects(toast, b), `chrome #${i}`).toBe(false);
  }
});

test("(8b) 知らせが出ている最中に、帯を下に置く・たたむ・開く → 測り直されて、知らせの箱が [data-display-chrome] のどの箱とも重ならない", async ({ page, appServer }) => {
  const c = await appServer.openClient();
  const paneId = c.helloSnapshot()!.panes[0]!.id;
  await set(appServer, paneId, "bu", "band", ["--edge", "top"]);
  const ids = await idsOf(appServer, paneId);
  // 知らせ（キー一覧の案内。一度だけ・4 秒で消える）が出ている最中に、割り付けを変える
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  const toastBox = page.locator(".toast-list");
  const noOverlap = async (label: string): Promise<void> => {
    await expect(page.locator(".toast").first(), `${label}: 知らせが見えている`).toBeVisible();
    const toast = await boxOf(toastBox);
    const chrome = page.locator("[data-display-chrome]");
    for (let i = 0; i < (await chrome.count()); i++) {
      const b = await chrome.nth(i).boundingBox();
      if (b && b.width > 0 && b.height > 0) expect(intersects(toast, b), `${label}: chrome #${i}`).toBe(false);
    }
  };
  await page.locator(`[data-display-root="${ids["bu"]}"] [data-display-menu-button]`).click();
  await menuItem(page, "下に置く").click();
  await expect(page.locator('[data-pane-bands-edge="bottom"] [data-pane-band]')).toHaveCount(1);
  await noOverlap("下に置いた直後");
  await expect(page.locator(".toast-list").first()).toBeVisible();
});

test("(10) 右のパネルを最小の幅（160px）にしても、印「スクリプト」・［操作する］・［⋮］・［たたむ］・［×］の箱がパネルの箱の中に収まり、中心の elementFromPoint が自身", async ({ page, appServer }) => {
  await enableScript(appServer);
  const { paneId } = await openDisplayBrowser(page, appServer);
  await setScriptOk(appServer, paneId, "sp", BENIGN, { kind: "panel", extra: ["--size", "160"] });
  const panel = page.locator("[data-pane-panel]");
  await expect(panel).toBeVisible();
  const pb = await boxOf(panel);
  expect(Math.round(pb.width)).toBe(160);
  for (const sel of ["[data-display-script-mark]", "[data-display-engage]", "[data-display-menu-button]", "[data-pane-panel-fold]", "[data-pane-panel-close]"]) {
    const loc = panel.locator(sel).first();
    const b = await boxOf(loc);
    expect(b.x, sel).toBeGreaterThanOrEqual(pb.x - 1);
    expect(b.x + b.width, sel).toBeLessThanOrEqual(pb.x + pb.width + 1);
    expect(await centerHitsSelf(loc), sel).toBe(true);
  }
});

test("(11) 戻しすぎの確認: 無害な面と、300ms ごとに落とす面。トレイのボタンに Enter・prefix+shift+i のメニューを矢印で動かして Enter・［⋮］のメニュー、の操作の途中のフォーカスが端末へ引き戻されない", async ({ page, appServer }) => {
  test.setTimeout(90_000);
  await enableScript(appServer);
  const { paneId } = await openDisplayBrowser(page, appServer);
  await setScriptOk(appServer, paneId, "g", `<!doctype html><body><p>face</p><script>setInterval(function(){ window.focus(); parent.focus(); }, 300);</script></body>`, { kind: "panel" });
  await set(appServer, paneId, "cp", "panel", ["--collapsed"]);
  await expect(page.locator("iframe[data-display-script]")).toHaveCount(1);
  const inMenu = (): boolean => !!document.querySelector('[role="menu"]')?.contains(document.activeElement);
  const holds = async (pred: () => boolean, ms = 1500): Promise<void> => {
    let falses = 0;
    for (let t = 0; t < ms; t += 50) {
      falses = (await page.evaluate(pred)) ? 0 : falses + 1;
      expect(falses, `${t}ms 時点で続けて偽`).toBeLessThan(2);
      await page.waitForTimeout(50);
    }
  };
  // [⋮] のメニュー
  await page.locator("[data-pane-panel] [data-display-menu-button]").click();
  await expect(page.getByRole("menu")).toBeVisible();
  await holds(inMenu);
  await page.keyboard.press("ArrowDown");
  await holds(inMenu, 800);
  await page.keyboard.press("Escape");
  // prefix+shift+i のメニューを矢印で動かして Enter
  await focusTerminal(page);
  await page.keyboard.press("Control+b");
  await page.keyboard.press("Shift+I");
  await expect(page.getByRole("menu")).toBeVisible();
  await holds(inMenu);
  await page.keyboard.press("ArrowDown");
  await holds(inMenu, 800);
  await page.keyboard.press("Escape");
  // トレイのボタンへ（キーボードで届いた）→ Enter → 開く。操作の途中のフォーカス（開いた先のボタン）が引き戻されない
  await trayButton(page, "cp").focus();
  const onTray = (): boolean => document.activeElement?.hasAttribute("data-display-tray-button") === true;
  await holds(onTray, 1000);
  await page.keyboard.press("Enter");
  const onFold = (): boolean => document.activeElement?.hasAttribute("data-pane-panel-fold") === true;
  await holds(onFold, 1500);
});

test("(12) 固定の文言: 設定で無効のとき各面の枠の箱の中に「設定で無効になっています」。有効に戻し、毎フレーム落とす面で遮断器を働かせると、各面の枠の箱の中に文言と［再開］が見え、押すと戻る", async ({ page, appServer }) => {
  test.setTimeout(90_000);
  await enableScript(appServer);
  const { paneId } = await openDisplayBrowser(page, appServer);
  await setScriptOk(appServer, paneId, "sp", BENIGN, { kind: "panel" });
  await setScriptOk(appServer, paneId, "sb", BENIGN, { kind: "band" });
  await expect(page.locator("iframe[data-display-script]")).toHaveCount(2);
  const setLocal = (on: boolean) =>
    page.evaluate((v) => {
      const pinia = (document.querySelector("#app") as unknown as { __vue_app__: { config: { globalProperties: { $pinia: { _s: Map<string, { displayScriptEnabled: boolean }> } } } } }).__vue_app__.config.globalProperties.$pinia;
      pinia._s.get("settings")!.displayScriptEnabled = v;
    }, on);
  const insideFrameBox = async (text: string): Promise<void> => {
    for (const root of ["[data-pane-panel]", "[data-pane-band]"]) {
      const wraps = page.locator(`${root} .display-frame-wrap`);
      const n = await wraps.count();
      expect(n).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) {
        const note = wraps.nth(i).locator(".display-frame-note", { hasText: text });
        await expect(note, `${root} #${i}: ${text}`).toBeVisible();
        const nb = await boxOf(note);
        const wb = await boxOf(wraps.nth(i));
        expect(nb.x).toBeGreaterThanOrEqual(wb.x - 1);
        expect(nb.y).toBeGreaterThanOrEqual(wb.y - 1);
        expect(nb.x).toBeLessThanOrEqual(wb.x + wb.width);
      }
    }
  };
  // この画面だけ「無効」にする（共有の設定を変えると、サーバが面を閉じてしまうので、ストアだけを変える）
  await setLocal(false);
  await insideFrameBox("設定で無効になっています");
  await setLocal(true);
  await expect(page.locator(".display-frame-note", { hasText: "設定で無効になっています" })).toHaveCount(0);
  // 遮断器: 毎フレームフォーカスを落とす面を足して、利用者が端末を触る
  await setScriptOk(appServer, paneId, "drop", `<!doctype html><body><script>(function f(){window.focus();parent.focus();requestAnimationFrame(f);})();</script></body>`, { kind: "band" });
  await expect(page.locator("iframe[data-display-script]")).toHaveCount(3);
  await page.locator(".xterm-screen").first().click();
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("a");
    await page.waitForTimeout(25);
  }
  await expect(page.locator("[data-display-note]").first()).toContainText("入力のフォーカスが繰り返し外されたので");
  await insideFrameBox("入力のフォーカスが繰り返し外されたので");
  const redisplay = page.locator("[data-display-redisplay]");
  await expect(redisplay.first()).toBeVisible();
  await redisplay.first().click();
  await expect(page.locator("iframe[data-display-script]")).not.toHaveCount(0); // 押すと戻る
});

// --- (13) 帯の行の固定の部品は、どの幅でも欠けない・押せる --------------------------------------------------------------------

test("(13) 帯・最小の幅・script-html・トレイあり: pane をどれだけ細くしても、出ている帯の印「スクリプト」・［操作する］・［⋮］・［×］が帯の箱の中に収まり、中心の elementFromPoint が自身。出さない幅では、帯はたたまれてトレイのボタンが押せない理由つきで残る", async ({ page, appServer }) => {
  await enableScript(appServer);
  const { paneId } = await openDisplayBrowser(page, appServer);
  await setScriptOk(appServer, paneId, "sb", BENIGN, { kind: "band", extra: ["--size", "24"] });
  for (const n of ["x1", "x2", "x3"]) await set(appServer, paneId, n, "panel", ["--collapsed"]);
  const c = await appServer.openClient();
  await c.request("pane.split", { paneId, direction: "right" });
  await c.request("pane.split", { paneId, direction: "right" });
  c.close();
  const first = page.locator(`[data-pane-id="${paneId}"]`);
  let shownWide = 0;
  let collapsedNarrow = 0;
  for (const w of [1800, 1600, 1440, 1280, 1100, 1000, 900, 800, 768]) {  // 768 未満はモバイルの画面
    await page.setViewportSize({ width: w, height: 800 });
    await page.waitForTimeout(250);
    const paneW = (await boxOf(first)).width;
    const band = first.locator("[data-pane-band]");
    const n = await band.count();
    if (n > 0) {
      shownWide++;
      const bb = await boxOf(band.first());
      for (const sel of ["[data-display-script-mark]", "[data-display-engage]", "[data-display-menu-button]", "[data-pane-band-close]"]) {
        const loc = band.first().locator(sel).first();
        const b = await boxOf(loc);
        expect(b.x, `${w}/${paneW} ${sel} 左`).toBeGreaterThanOrEqual(bb.x - 1);
        expect(b.x + b.width, `${w}/${paneW} ${sel} 右`).toBeLessThanOrEqual(bb.x + bb.width + 1);
        expect(b.y, `${w}/${paneW} ${sel} 上`).toBeGreaterThanOrEqual(bb.y - 0.5);
        expect(b.y + b.height, `${w}/${paneW} ${sel} 下`).toBeLessThanOrEqual(bb.y + bb.height + 0.5);
        expect(await centerHitsSelf(loc), `${w}/${paneW} ${sel} 中心`).toBe(true);
      }
    } else {
      collapsedNarrow++;
      const btn = first.locator('[data-display-tray-button][data-display-name="sb"]');
      // 帯のボタンは、トレイに収まれば押せない理由（title）つきで、収まらなければ「ほか N」の中に残る
      if ((await btn.count()) > 0) {
        await expect(btn, `${w}/${paneW} 帯のトレイのボタン`).toBeDisabled();
        await expect(btn).toHaveAttribute("title", /狭い/);
      } else {
        await expect(first.locator("[data-display-tray-more]"), `${w}/${paneW} ほか N`).toBeVisible();
      }
    }
  }
  expect(shownWide, "広い幅では帯が出る").toBeGreaterThan(0);
  expect(collapsedNarrow, "細い幅では帯をたたむ").toBeGreaterThan(0);
});
