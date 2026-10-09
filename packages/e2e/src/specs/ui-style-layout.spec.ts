import type { Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { focusTerminal, prefixKey } from "../support/keys.js";
import { watchClientViews } from "../support/panes.js";

/**
 * モダンの配置（20261008-ui-style PR4。AC12〜AC18）の E2E。判定は、ブラウザの側（DOM の位置・大きさ・ブラウザが送る `client.view`）で行う（条項 e2e-observe-browser）。
 * 設定は、サーバの共有の設定（`prefs.set`）で替える（再読み込みなしで効く）。
 */

async function open(page: Page, appServer: AppServer): Promise<void> {
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
}
const uiStyleAttr = (page: Page) => page.evaluate(() => document.documentElement.getAttribute("data-ui-style"));
const sidebarWidth = (page: Page) => page.locator(".sidebar").evaluate((el) => el.getBoundingClientRect().width);
const menuItems = async (page: Page) => (await page.locator(".context-menu [role=menuitem]").allTextContents()).map((t) => t.trim());

async function setStyle(page: Page, client: Awaited<ReturnType<AppServer["openClient"]>>, style: "classic" | "modern"): Promise<void> {
  await client.request("prefs.set", { patch: { uiStyle: style } });
  await expect.poll(() => uiStyleAttr(page)).toBe(style);
}

test("サイドバーの最下部: クラシックは［畳む］、モダンは［新規］［メニュー］［ベル］（spaces の区画の中の［新規］［メニュー］は出さない）。切り替えは再読み込みなし", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  await open(page, appServer);
  // クラシック: 今のまま。
  await expect(page.locator(".sidebar-section-footer")).toHaveCount(1);
  await expect(page.locator(".sidebar-footer .sidebar-collapse-btn")).toHaveCount(1);
  await expect(page.locator(".sidebar-edge-toggle")).toHaveCount(0);
  await setStyle(page, client, "modern");
  await expect(page.locator(".sidebar-section-footer")).toHaveCount(0);
  await expect(page.locator(".sidebar-collapse-btn")).toHaveCount(0);
  const order = await page.locator(".sidebar-footer").evaluate((f) => Array.from(f.children).map((c) => (c as HTMLElement).dataset["sidebarAct"] ?? (c.hasAttribute("data-notification-bell") ? "bell" : "?")));
  expect(order).toEqual(["new", "menu", "bell"]);
  // 最下部: ボタンは、サイドバーの下端にある（nav の下端から 1 つ分の高さの中）。
  const navBox = (await page.locator(".sidebar").boundingBox())!;
  for (const sel of ['[data-sidebar-act="new"]', '[data-sidebar-act="menu"]', "[data-notification-bell]"]) {
    const b = (await page.locator(`.sidebar-footer ${sel}`).boundingBox())!;
    expect(b.y + b.height, sel).toBeGreaterThan(navBox.y + navBox.height - 60);
    expect(b.y + b.height, sel).toBeLessThanOrEqual(navBox.y + navBox.height + 1);
  }
  // クラシックへ戻すと、元の配置に戻る。
  await setStyle(page, client, "classic");
  await expect(page.locator(".sidebar-section-footer")).toHaveCount(1);
  await expect(page.locator(".sidebar-footer .sidebar-collapse-btn")).toHaveCount(1);
  await expect(page.locator("[data-sidebar-act]")).toHaveCount(0);
  client.close();
});

test("たたむ・広げるの印: 境の線の縦の中央にある。押すと畳み・広がる。印の上では幅のドラッグが始まらず、つまみの別の場所では今までどおり動く。畳んだ状態にも同じ印", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  await client.request("prefs.set", { patch: { uiStyle: "modern" } });
  await open(page, appServer);
  await expect.poll(() => uiStyleAttr(page)).toBe("modern");
  const toggle = page.locator(".sidebar-edge-toggle");
  await expect(toggle).toHaveCount(1);
  // 位置: 境の線（nav の右端）の上で、縦の中央（±数画素）。当たりは 24px 以上。
  const nav = (await page.locator(".sidebar").boundingBox())!;
  const t = (await toggle.boundingBox())!;
  expect(Math.abs(t.x + t.width / 2 - (nav.x + nav.width))).toBeLessThanOrEqual(2);
  expect(Math.abs(t.y + t.height / 2 - (nav.y + nav.height / 2))).toBeLessThanOrEqual(2);
  expect(t.width).toBeGreaterThanOrEqual(24);
  expect(t.height).toBeGreaterThanOrEqual(24);
  // 印の上でドラッグしても、幅は変わらない（印の押下は、つまみへ届かない）。
  const before = await sidebarWidth(page);
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
  await page.mouse.down();
  await page.mouse.move(t.x + t.width / 2 + 80, t.y + t.height / 2 + 10, { steps: 4 });
  await page.mouse.up();
  expect(await sidebarWidth(page), "印の上のドラッグでは、幅が動かない").toBeCloseTo(before, 0);
  await expect(page.locator(".sidebar")).not.toHaveClass(/sidebar-collapsed/);
  // 陽性の対照: つまみの別の場所（印の上 100px）では、今までどおり幅が動く。
  const hy = t.y + t.height / 2 - 100;
  const hx = nav.x + nav.width;
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx + 60, hy, { steps: 4 });
  await expect.poll(() => sidebarWidth(page)).toBeGreaterThan(before + 30);
  await page.mouse.up();
  // 押すと畳む（印は読み上げの名前が変わる）。畳んだ状態でも、印が同じ縦の中央にあり、押すと広がる。
  await page.locator(".sidebar-edge-toggle").click();
  await expect(page.locator(".sidebar")).toHaveClass(/sidebar-collapsed/);
  await expect(toggle).toHaveAttribute("aria-label", "サイドバーを開く");
  const nav2 = (await page.locator(".sidebar").boundingBox())!;
  const t2 = (await toggle.boundingBox())!;
  expect(Math.abs(t2.y + t2.height / 2 - (nav2.y + nav2.height / 2))).toBeLessThanOrEqual(2);
  expect(t2.x + t2.width).toBeLessThanOrEqual(nav2.x + nav2.width + 1); // 畳んだ nav の外へはみ出さない（切られない）
  await expect(page.locator(".sidebar-footer")).toBeVisible();
  // 畳んだ状態の［新規］［メニュー］は縦に並ぶ（印だけ。読み上げの名前を保つ）。
  const ys = await page.locator(".sidebar-footer > *").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().y));
  expect(ys).toEqual([...ys].sort((a, b) => a - b));
  expect(new Set(ys.map(Math.round)).size).toBe(ys.length);
  await expect(page.locator('[data-sidebar-act="new"]')).toHaveAttribute("aria-label", "新規");
  await page.locator(".sidebar-edge-toggle").click();
  await expect(page.locator(".sidebar")).not.toHaveClass(/sidebar-collapsed/);
  expect(await sidebarWidth(page)).toBeGreaterThan(before + 30); // 広げると、前の幅
  client.close();
});

test("「新規」: workspace・pane・グループを選べる（キーボードでも）。メニューに「連携（グラフ）」は無く、workspace の右クリックに「新しいグループを作る…」は無い", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  await client.request("prefs.set", { patch: { uiStyle: "modern" } });
  await open(page, appServer);
  await expect.poll(() => uiStyleAttr(page)).toBe("modern");
  const rows = page.locator(".sidebar-spaces .sidebar-row[data-drop-workspace-id]");
  await expect(rows).toHaveCount(1);
  const panes = page.locator("[data-pane-frame-main]");
  await expect(panes).toHaveCount(1);

  const newBtn = page.locator('[data-sidebar-act="new"]');
  await newBtn.click();
  expect(await menuItems(page)).toEqual(["workspace", "pane", "グループ…"]);
  // pane: いまの tab を右へ分割。
  await page.locator(".context-menu").getByRole("menuitem", { name: "pane", exact: true }).click();
  await expect(panes).toHaveCount(2);
  // workspace
  await newBtn.click();
  await page.locator(".context-menu").getByRole("menuitem", { name: "workspace", exact: true }).click();
  await expect(rows).toHaveCount(2);
  // グループ（キーボード: ↓↓ Enter）。名前を入れて確定すると、見出し（グループ）の行が出る。
  await newBtn.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".context-menu")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const dialog = page.locator(".name-dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator(".name-dialog-input").fill("モダン組");
  await dialog.getByRole("button", { name: "OK" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".sidebar-row-group .sidebar-group-label", { hasText: "モダン組" })).toHaveCount(1);
  // 閉じたら、フォーカスは［新規］ボタンへ戻る（メニューを開いた元）。
  await newBtn.click();
  await page.keyboard.press("Escape");
  await expect(newBtn).toBeFocused();

  // 全体のメニュー: 「連携（グラフ）」は出ない。
  await page.locator('[data-sidebar-act="menu"]').click();
  const global = await menuItems(page);
  expect(global).not.toContain("連携（グラフ）");
  expect(global).toContain("設定");
  await page.keyboard.press("Escape");
  // workspace の右クリック: 「新しいグループを作る…」は出ない。
  await rows.first().click({ button: "right" });
  const ws = await menuItems(page);
  expect(ws).not.toContain("新しいグループを作る…");
  expect(ws).toContain("名前の変更");
  await page.keyboard.press("Escape");

  // 陽性の対照: クラシックに戻すと、どちらも出る。
  await setStyle(page, client, "classic");
  await page.locator(".sidebar-section-footer .sidebar-btn-right").click();
  expect(await menuItems(page)).toContain("連携（グラフ）");
  await page.keyboard.press("Escape");
  await rows.first().click({ button: "right" });
  expect(await menuItems(page)).toContain("新しいグループを作る…");
  client.close();
});

test("tab が 1 つのときも tab バーと「＋」が出る（モダン）。クラシックは隠す。切り替え・tab の数の変化で client.view が落ち着き、端末の行が箱に合う。位置（上・下）はどちらでも効く", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const views = await watchClientViews(page);
  await open(page, appServer);
  const settle = async (): Promise<void> => {
    let last = -1;
    for (let i = 0; i < 40; i++) {
      const c = views.count();
      if (c === last) return;
      last = c;
      await page.waitForTimeout(300);
    }
  };
  const barVisible = () => page.locator(".tab-bar").count();
  const boxH = () => page.locator("[data-pane-frame-main]").first().evaluate((e) => e.getBoundingClientRect().height);
  /** ブラウザが最後に申告した行が、いまの箱に合う（箱の高さ ÷ 行の数 が、1 回目の升目の高さの範囲）。 */
  await settle();
  const h0 = await boxH();
  const rows0 = views.latest()!.visible[0]!.rows;
  const cellLo = h0 / (rows0 + 1);
  const cellHi = h0 / rows0;
  const fits = async (label: string): Promise<void> => {
    const h = await boxH();
    const rows = views.latest()!.visible[0]!.rows;
    expect(rows, `${label}: 箱 ${h}px・申告 ${rows} 行`).toBeGreaterThanOrEqual(Math.floor(h / cellHi));
    expect(rows, `${label}: 箱 ${h}px・申告 ${rows} 行`).toBeLessThanOrEqual(Math.floor(h / cellLo));
  };
  expect(await barVisible(), "クラシック: tab が 1 つなら隠す").toBe(0);

  let before = views.count();
  await client.request("prefs.set", { patch: { uiStyle: "modern" } });
  await expect.poll(() => uiStyleAttr(page)).toBe("modern");
  await expect(page.locator(".tab-bar")).toHaveCount(1);
  await expect(page.locator(".tab-bar [role=tab]")).toHaveCount(1);
  await expect(page.locator(".tab-bar .tab-bar-new")).toBeVisible();
  await settle();
  expect(views.count() - before, "tab バーが出た後に送られた client.view").toBeLessThanOrEqual(2);
  const hModern = await boxH();
  expect(hModern, "tab バーの分、箱が低くなる（検査が、何も動かない状態で通っていない）").toBeLessThan(h0);
  await fits("modern・tab 1 つ");

  // 位置（下）でも効く。
  before = views.count();
  await client.request("prefs.set", { patch: { tabBarPosition: "bottom" } });
  await expect(page.locator(".tab-bar-bottom")).toHaveCount(1);
  await settle();
  expect(views.count() - before).toBeLessThanOrEqual(2);
  const bar = (await page.locator(".tab-bar").boundingBox())!;
  const area = (await page.locator(".app-panes").boundingBox())!;
  expect(bar.y, "下に置くと、pane の領域の下").toBeGreaterThanOrEqual(area.y + area.height - 1);
  await fits("modern・下");
  await client.request("prefs.set", { patch: { tabBarPosition: "top" } });
  await expect(page.locator(".tab-bar-top")).toHaveCount(1);
  await settle();

  // 「＋」で tab を作る → 2 つ。もう 1 つ閉じて 1 つに戻っても、tab バーは出たまま（行が落ち着く）。
  before = views.count();
  await page.locator(".tab-bar .tab-bar-new").click();
  const newTabDialog = page.locator(".name-dialog");
  await expect(newTabDialog).toBeVisible();
  await newTabDialog.getByRole("button", { name: "OK" }).click(); // 既定の名前（"2"）で確定
  await expect(newTabDialog).toBeHidden();
  await expect(page.locator(".tab-bar [role=tab]")).toHaveCount(2);
  await settle();
  expect(views.count() - before, "tab を足した後").toBeLessThanOrEqual(3);
  await fits("modern・tab 2 つ");
  before = views.count();
  await page.locator(".tab-bar [role=tab]").nth(1).click({ button: "right" });
  await page.locator(".context-menu").getByRole("menuitem", { name: "閉じる", exact: true }).click();
  const confirm = page.locator("dialog[open]").getByRole("button", { name: /閉じる|OK/ });
  if (await confirm.count()) await confirm.first().click();
  await expect(page.locator(".tab-bar [role=tab]")).toHaveCount(1);
  await expect(page.locator(".tab-bar")).toHaveCount(1);
  await settle();
  expect(views.count() - before, "tab を閉じて 1 つに戻った後（バーは出たまま）").toBeLessThanOrEqual(2);
  await fits("modern・tab 1 つに戻る");

  // tab が 1 つでも、右クリック→名前の変更が働く。
  await page.locator(".tab-bar [role=tab]").first().click({ button: "right" });
  await page.locator(".context-menu").getByRole("menuitem", { name: "名前の変更", exact: true }).click();
  const dialog = page.locator(".name-dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator(".name-dialog-input").fill("only");
  await dialog.getByRole("button", { name: "OK" }).click();
  await expect(page.locator(".tab-bar [role=tab]").first()).toContainText("only");

  // クラシックへ戻す: tab が 1 つなので、tab バーは消え、箱は元の高さに戻る。
  before = views.count();
  await client.request("prefs.set", { patch: { uiStyle: "classic" } });
  await expect.poll(() => uiStyleAttr(page)).toBe("classic");
  await expect(page.locator(".tab-bar")).toHaveCount(0);
  await settle();
  expect(views.count() - before, "tab バーが消えた後").toBeLessThanOrEqual(2);
  expect(await boxH()).toBeCloseTo(h0, 0);
  await fits("classic・戻した後");
  client.close();
});

test("様式を切り替えたとき、消える部品にフォーカスがあれば、対応する新しい部品へ移る（無ければ端末）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  await open(page, appServer);
  // クラシックの畳むボタン → モダンの境の印。
  await page.locator(".sidebar-collapse-btn").focus();
  await setStyle(page, client, "modern");
  await expect(page.locator(".sidebar-edge-toggle")).toBeFocused();
  // モダンの［新規］ → クラシックの spaces の区画の［＋ 新規］。
  await page.locator('[data-sidebar-act="new"]').focus();
  await setStyle(page, client, "classic");
  await expect(page.locator(".sidebar-section-footer .sidebar-btn").first()).toBeFocused();
  // tab バーの中（tab が 1 つ）にフォーカス → クラシックへ切り替えて tab バーが消えたら、端末へ。
  await setStyle(page, client, "modern");
  await page.locator(".tab-bar [role=tab]").first().focus();
  await setStyle(page, client, "classic");
  await expect(page.locator(".tab-bar")).toHaveCount(0);
  await expect(page.locator(".xterm-helper-textarea").first()).toBeFocused();
  client.close();
});

test("モダン: workspace が多いと spaces の区画の中だけがスクロールし、見出し・最下部の［新規］［メニュー］［ベル］・境の印は見えたまま（クラシックの `sidebar-sections` の、モダン版）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  for (let i = 0; i < 15; i++) await client.request("workspace.create", { cwd: process.cwd(), label: `ws-${i}` });
  await client.request("prefs.set", { patch: { uiStyle: "modern" } });
  await open(page, appServer);
  await expect.poll(() => uiStyleAttr(page)).toBe("modern");
  await expect(page.locator(".sidebar-spaces .sidebar-row").nth(12)).toBeAttached();
  const scrolls = await page.locator(".sidebar-spaces .sidebar-section-body").evaluate((el) => el.scrollHeight > el.clientHeight + 4 && getComputedStyle(el).overflowY === "auto");
  expect(scrolls, "spaces の body がスクロールする").toBe(true);
  const vh = page.viewportSize()!.height;
  for (const sel of [".sidebar-spaces .sidebar-section-header", ".sidebar-agents .sidebar-section-header", '.sidebar-footer [data-sidebar-act="new"]', '.sidebar-footer [data-sidebar-act="menu"]', ".sidebar-footer [data-notification-bell]", ".sidebar-edge-toggle"]) {
    const box = (await page.locator(sel).first().boundingBox())!;
    expect(box.y, sel).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, sel).toBeLessThanOrEqual(vh + 0.5);
  }
  expect(await page.locator(".sidebar").evaluate((el) => el.scrollHeight > el.clientHeight + 1), "サイドバー全体はスクロールしない").toBe(false);
  client.close();
});

test("モダン: 境の印・［新規］が、キー操作と同じ結果になる（prefix+b で畳んだものを印で戻せる。［新規］→ workspace は prefix+shift+N と同じ）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  await client.request("prefs.set", { patch: { uiStyle: "modern" } });
  await open(page, appServer);
  await expect.poll(() => uiStyleAttr(page)).toBe("modern");
  await focusTerminal(page);
  await prefixKey(page, "b");
  await expect(page.locator(".sidebar-collapsed")).toHaveCount(1);
  await page.locator(".sidebar-edge-toggle").click(); // キーで畳んだものを、印で戻す（戻せないと行き止まり）
  await expect(page.locator(".sidebar-collapsed")).toHaveCount(0);
  await page.locator(".sidebar-edge-toggle").click(); // 印で畳んだものを、キーで戻す
  await expect(page.locator(".sidebar-collapsed")).toHaveCount(1);
  await focusTerminal(page);
  await prefixKey(page, "b");
  await expect(page.locator(".sidebar-collapsed")).toHaveCount(0);
  // ［新規］→ workspace: prefix+shift+N と同じ（workspace が 1 つ増える）。
  await expect(page.locator(".sidebar-spaces .sidebar-row[data-drop-workspace-id]")).toHaveCount(1);
  await page.locator('[data-sidebar-act="new"]').click();
  await page.locator(".context-menu").getByRole("menuitem", { name: "workspace", exact: true }).click();
  await expect(page.locator(".sidebar-spaces .sidebar-row[data-drop-workspace-id]")).toHaveCount(2);
  // tab バーの「＋」: 新しい tab の名前入力が開く（prefix+c と同じ）。tab が 1 つのうちから押せる。
  await page.locator(".tab-bar-new").click();
  await expect(page.locator(".name-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".name-dialog")).toBeHidden();
  client.close();
});

test("サイドバーの区画の見出し（spaces・agents）と並び順の文字: モダンは行の 0.9 倍以上で薄すぎない。クラシックは今のまま（0.85 倍・0.75）。畳む・区画の高さのつまみは働く", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  await open(page, appServer);
  const metrics = () =>
    page.evaluate(() => {
      const px = (sel: string) => {
        const e = document.querySelector(sel)!;
        const c = getComputedStyle(e);
        return { size: parseFloat(c.fontSize), opacity: Number(c.opacity) };
      };
      return { row: px(".sidebar-spaces .sidebar-row .sidebar-label"), title: px(".sidebar-spaces .sidebar-section-title"), sort: px(".sidebar-spaces .sidebar-sort-btn"), mark: px(".sidebar-spaces .sidebar-section-mark") };
    });
  const c = await metrics();
  expect(c.title.size / c.row.size).toBeCloseTo(0.7225, 2); // ボタン 0.85 の中の 0.85
  expect(c.sort.size / c.row.size).toBeCloseTo(0.85, 2);
  expect(c.title.opacity).toBeCloseTo(0.75, 2);
  await setStyle(page, client, "modern");
  const m = await metrics();
  expect(m.title.size / m.row.size, "見出し").toBeGreaterThanOrEqual(0.9);
  expect(m.sort.size / m.row.size, "並び順").toBeGreaterThanOrEqual(0.9);
  expect(m.title.size, "クラシックより大きい").toBeGreaterThan(c.title.size);
  expect(m.title.opacity, "文字の濃さを、今より下げない").toBeGreaterThanOrEqual(c.title.opacity);
  expect(m.mark.opacity).toBeGreaterThanOrEqual(c.mark.opacity);
  // 見出しの行は、押せる高さの中に収まる（はみ出さない）。畳む・広げるが働き、畳んだサイドバーでも崩れない。
  const head = (await page.locator(".sidebar-spaces .sidebar-section-header").boundingBox())!;
  const title = (await page.locator(".sidebar-spaces .sidebar-section-title").boundingBox())!;
  expect(title.y).toBeGreaterThanOrEqual(head.y);
  expect(title.y + title.height).toBeLessThanOrEqual(head.y + head.height + 0.5);
  await page.locator(".sidebar-spaces .sidebar-section-toggle").click();
  await expect(page.locator(".sidebar-spaces.sidebar-section-folded")).toHaveCount(1);
  await page.locator(".sidebar-spaces .sidebar-section-toggle").click();
  await expect(page.locator(".sidebar-spaces.sidebar-section-folded")).toHaveCount(0);
  const div = (await page.locator(".sidebar-section-divider").boundingBox())!;
  const h0 = (await page.locator(".sidebar-spaces").boundingBox())!.height;
  await page.mouse.move(div.x + 40, div.y + 0.5);
  await page.mouse.down();
  await page.mouse.move(div.x + 40, div.y + 80, { steps: 4 });
  await page.mouse.up();
  expect((await page.locator(".sidebar-spaces").boundingBox())!.height, "区画の高さのつまみが働く").toBeGreaterThan(h0 + 40);
  await page.locator(".sidebar-edge-toggle").click();
  await expect(page.locator(".sidebar-collapsed")).toHaveCount(1);
  expect(await page.locator(".sidebar").evaluate((e) => e.scrollWidth <= e.clientWidth + 1), "畳んだサイドバーは横にはみ出さない").toBe(true);
  client.close();
});
