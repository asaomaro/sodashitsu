import type { Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { focusTerminal, prefixKey } from "../support/keys.js";

/**
 * 境目（サイドバーの幅・pane の間・spaces と agents の区画）の見え方と操作（20261004-ui-interaction-polish）。
 *
 * **判定はブラウザの側で行う**（条項 `e2e-observe-browser`）: 線は `getComputedStyle(el, "::after")` の `opacity`、カーソルは `getComputedStyle(documentElement)` ではなく
 * ドラッグ中に別の要素の上で測った `cursor`、大きさ・位置は DOM の `style.width`・`getBoundingClientRect`・`aria-valuenow`。内部の状態は覗かない。
 * 「ドラッグ中に打った文字が端末へ漏れない」は、端末の中身は DOM から読めない（描画が canvas）ので、PTY が受けた出力（サーバ側の `rawOutput`）に
 * 打った文字が現れないことで見る。打つのはブラウザのキーで、ドラッグを終えた後の入力が届くことを対照にする。
 */

async function openApp(page: Page, appServer: AppServer): Promise<void> {
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
}

const afterOpacity = (page: Page, selector: string): Promise<number> =>
  page.locator(selector).first().evaluate((el) => Number(getComputedStyle(el, "::after").opacity));

const center = async (page: Page, selector: string): Promise<{ x: number; y: number }> => {
  const box = (await page.locator(selector).first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

const sidebarWidth = (page: Page): Promise<number> => page.locator(".sidebar").evaluate((el) => el.getBoundingClientRect().width);

async function splitRight(page: Page): Promise<void> {
  await focusTerminal(page);
  await prefixKey(page, "v");
  await expect(page.locator(".terminal-pane")).toHaveCount(2);
}

test("hover で線が出て（0.15 秒の待ちの後）、離すと消える", async ({ page, appServer }) => {
  await openApp(page, appServer);
  const sel = ".sidebar-divider";
  await expect.poll(() => afterOpacity(page, sel)).toBe(0);
  const c = await center(page, sel);
  await page.mouse.move(c.x, c.y);
  await expect.poll(() => afterOpacity(page, sel)).toBe(1);
  await page.mouse.move(c.x + 300, c.y);
  await expect.poll(() => afterOpacity(page, sel)).toBe(0);
});

test("サイドバーの幅: ドラッグ中は境目から外れても線とカーソルが続き、端末の文字が選択されず、Esc で元の幅へ戻る", async ({ page, appServer }) => {
  await openApp(page, appServer);
  const before = await sidebarWidth(page);
  const c = await center(page, ".sidebar-divider");
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 60, c.y + 200); // 境目の外（縦にも離れる）
  await expect.poll(() => sidebarWidth(page)).toBeGreaterThan(before + 30);
  await expect.poll(() => afterOpacity(page, ".sidebar-divider")).toBe(1);
  await expect(page.locator("html")).toHaveClass(/soda-resizing-x/);
  // 境目の外の要素の上でも、カーソルは col-resize（`html.soda-resizing-x *`）。
  const cursor = await page.locator(".terminal-pane").first().evaluate((el) => getComputedStyle(el).cursor);
  expect(cursor).toBe("col-resize");
  const userSelect = await page.locator(".terminal-pane").first().evaluate((el) => getComputedStyle(el).userSelect);
  expect(userSelect).toBe("none");
  await page.keyboard.press("Escape");
  await expect.poll(() => sidebarWidth(page)).toBeCloseTo(before, 0);
  await page.mouse.up();
  await expect(page.locator("html")).not.toHaveClass(/soda-resizing/);
  expect(await sidebarWidth(page)).toBeCloseTo(before, 0);
});

test("サイドバーの幅: ダブルクリックで既定の幅へ。キー（← → Home End Enter）で動く", async ({ page, appServer }) => {
  await openApp(page, appServer);
  const divider = page.locator(".sidebar-divider");
  await divider.focus();
  await page.keyboard.press("End");
  await expect(divider).toHaveAttribute("aria-valuenow", "360");
  await page.keyboard.press("Home");
  await expect(divider).toHaveAttribute("aria-valuenow", "160");
  await page.keyboard.press("ArrowRight");
  await expect(divider).toHaveAttribute("aria-valuenow", "176");
  await expect.poll(async () => Math.abs((await sidebarWidth(page)) - 176)).toBeLessThanOrEqual(1);
  await page.keyboard.press("ArrowLeft");
  await expect(divider).toHaveAttribute("aria-valuenow", "160");
  await expect(divider).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(divider).toHaveAttribute("aria-valuenow", "240");
  // ダブルクリック
  await page.keyboard.press("End");
  const c = await center(page, ".sidebar-divider");
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(async () => Math.abs((await sidebarWidth(page)) - 240)).toBeLessThanOrEqual(1);
});

test("pane の間: 太さ 2px の境目の中心から 3px 外でも掴める。Esc で元へ・ダブルクリックで半分", async ({ page, appServer }) => {
  await openApp(page, appServer);
  await splitRight(page);
  const sel = ".splitter";
  const left = () => page.locator(".terminal-pane").first().evaluate((el) => el.getBoundingClientRect().width);
  const c = await center(page, sel);
  const w0 = await left();
  await page.mouse.move(c.x + 3, c.y); // 境目の外 3px
  await expect.poll(() => afterOpacity(page, sel)).toBe(1); // 当たり判定が広がっている
  await page.mouse.down();
  await page.mouse.move(c.x + 3 + 120, c.y);
  await expect.poll(left).toBeGreaterThan(w0 + 60);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect.poll(left).toBeCloseTo(w0, 0);
  // 動かしてからダブルクリックで半分へ
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 150, c.y);
  await page.mouse.up();
  await expect.poll(left).toBeGreaterThan(w0 + 60);
  const c2 = await center(page, sel);
  await page.mouse.move(c2.x, c2.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator(sel)).toHaveAttribute("aria-valuenow", "50");
});

test("ドラッグ中に打った文字は端末へ漏れない", async ({ page, appServer }) => {
  await openApp(page, appServer);
  // 端末の中身は DOM から読めない（描画が canvas）ので、PTY が受けた出力（サーバ側の状態）で見る。ただし打つのはブラウザのキー。
  const client = await appServer.openClient();
  const paneId = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId, scrollbackLines: 100 });
  await focusTerminal(page);
  const c = await center(page, ".sidebar-divider");
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 20, c.y);
  const marker = `leak${Date.now()}`;
  await page.keyboard.type(marker);
  await page.mouse.up();
  // 対照: ドラッグを終えた後の入力は届く（届かなければ、漏れていないことの確認にならない）。
  await page.keyboard.type("echo ctl$((1+1))");
  await page.keyboard.press("Enter");
  await client.waitForOutput(paneId, "ctl2");
  expect(client.rawOutput(paneId)).not.toContain(marker);
});

test("「動きを減らす」では線の出入りの時間が 0 秒", async ({ page, appServer }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openApp(page, appServer);
  const d = await page.locator(".sidebar-divider").evaluate((el) => getComputedStyle(el, "::after").transitionDuration);
  expect(d).toBe("0s");
  const c = await center(page, ".sidebar-divider");
  await page.mouse.move(c.x, c.y);
  const dh = await page.locator(".sidebar-divider").evaluate((el) => getComputedStyle(el, "::after").transitionDuration);
  expect(dh).toBe("0s");
});

test("Tab の順に、サイドバーの幅の境目と区画の境目が入る（実際に Tab を押して移る）", async ({ page, appServer }) => {
  await openApp(page, appServer);
  await expect(page.locator(".sidebar-section-divider")).toHaveAttribute("tabindex", "0");
  await expect(page.locator(".sidebar-divider")).toHaveAttribute("tabindex", "0");
  // サイドバーの最初のボタンから Tab を押していき、2 つの境目に止まるまで（上限つき）。止まった要素のクラスを順に集める。
  await page.locator(".sidebar-spaces .sidebar-section-toggle").focus();
  const visited: string[] = [];
  for (let i = 0; i < 80 && visited.length < 2; i++) {
    await page.keyboard.press("Tab");
    const cls = await page.evaluate(() => document.activeElement?.className?.toString() ?? "");
    for (const name of ["sidebar-section-divider", "sidebar-divider"]) {
      if (cls.split(/\s+/).includes(name) && !visited.includes(name)) {
        visited.push(name);
        // focus-visible（キーボード）でも線が出る。
        await expect.poll(() => afterOpacity(page, `.${name}`)).toBe(1);
      }
    }
  }
  expect(visited.sort()).toEqual(["sidebar-divider", "sidebar-section-divider"]);
});

test("区画の境目: ドラッグで高さが変わり、Esc で元の高さへ戻る", async ({ page, appServer }) => {
  await openApp(page, appServer);
  const spaces = () => page.locator(".sidebar-spaces").evaluate((el) => el.getBoundingClientRect().height);
  const h0 = await spaces();
  const c = await center(page, ".sidebar-section-divider");
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x, c.y + 120);
  await expect.poll(spaces).toBeGreaterThan(h0 + 40);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect.poll(spaces).toBeCloseTo(h0, 0);
  await expect(page.locator(".sidebar-section-divider")).toHaveClass(/resize-handle-y/);
});

test("3 か所の境目の線は同じ色・同じ太さで、カーソルは向きの矢印（AC1）", async ({ page, appServer }) => {
  await openApp(page, appServer);
  await splitRight(page);
  const read = (sel: string, axis: "x" | "y") =>
    page.locator(sel).first().evaluate((el, a) => {
      const after = getComputedStyle(el, "::after");
      return { color: after.backgroundColor, thickness: a === "x" ? after.width : after.height, cursor: getComputedStyle(el).cursor };
    }, axis);
  const width = await read(".sidebar-divider", "x");
  const panes = await read(".splitter", "x");
  const sections = await read(".sidebar-section-divider", "y");
  expect(width.thickness).toBe("3px");
  expect(panes.color).toBe(width.color);
  expect(sections.color).toBe(width.color);
  expect(panes.thickness).toBe(width.thickness);
  expect(sections.thickness).toBe(width.thickness);
  expect(width.color).not.toBe("rgba(0, 0, 0, 0)");
  expect([width.cursor, panes.cursor, sections.cursor]).toEqual(["col-resize", "col-resize", "row-resize"]);
});

test("ドラッグ中は、ポインタが通った行・ボタンに hover の見た目が出ない（AC2）。離せば出る", async ({ page, appServer }) => {
  await openApp(page, appServer);
  const isHover = (sel: string) => page.locator(sel).first().evaluate((el) => el.matches(":hover"));
  const row = await center(page, ".sidebar-spaces .sidebar-row");
  const c = await center(page, ".sidebar-divider");
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 20, c.y);
  await page.mouse.move(row.x, row.y); // 境目から外れて、行の上を通る
  await expect(page.locator("html")).toHaveClass(/soda-resizing-x/);
  expect(await isHover(".sidebar-spaces .sidebar-row"), "行に hover が出ない").toBe(false);
  const btn = await center(page, ".sidebar-spaces .sidebar-btn");
  await page.mouse.move(btn.x, btn.y);
  expect(await isHover(".sidebar-spaces .sidebar-btn"), "ボタンに hover が出ない").toBe(false);
  await page.mouse.up();
  // 対照: 離した後は同じ位置で hover が出る（出なければ、上の確認が何も見ていないことになる）。
  const row2 = await center(page, ".sidebar-spaces .sidebar-row");
  await page.mouse.move(row2.x, row2.y);
  await expect.poll(() => isHover(".sidebar-spaces .sidebar-row")).toBe(true);
});
