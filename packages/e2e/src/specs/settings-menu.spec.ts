import type { Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { watchSentInput } from "../support/frames.js";
import { focusTerminal, prefixKey } from "../support/keys.js";

/**
 * 設定画面の左のサイドメニュー（節の一覧。20261004-settings-side-menu）の E2E。
 *
 * **判定はブラウザの側で行う**（条項 `.aidev/conventions/e2e-observe-browser.md`）: 描画（`getBoundingClientRect`・`getComputedStyle`・
 * `aria-current`）・フォーカス（`document.activeElement`）・`dialog.scrollTop`・ブラウザが送った INPUT フレーム（`watchSentInput`）。
 * テスト自身の WebSocket クライアントは使わない。キーは Playwright の実物のキー、スクロールは実物のホイール。
 */

const dialog = (page: Page) => page.locator("dialog.settings-dialog");
const menu = (page: Page) => dialog(page).locator("nav.settings-menu");
const items = (page: Page) => menu(page).locator("button");
const currentItems = (page: Page) => menu(page).locator('button[aria-current="true"]');
const SECTIONS = ["通知", "テーマ", "表示", "端末", "エージェント連携", "キー"];
const HEADING_IDS = ["settings-notify", "settings-theme", "settings-display", "settings-terminal", "settings-agent-integration", "settings-keys"];

async function openApp(page: Page, appServer: AppServer) {
  const sent = await watchSentInput(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  return sent;
}

async function openSettings(page: Page): Promise<void> {
  await focusTerminal(page);
  await prefixKey(page, "s");
  await expect(dialog(page)).toHaveAttribute("open", "");
  // 開いた直後のフォーカスは通知の最初の switch（今までどおり）。メニューの項目が作られるまで待つ。
  await expect(items(page)).toHaveCount(6);
}

const activeId = (page: Page) => page.evaluate(() => document.activeElement?.id ?? "");
const scrollTop = (page: Page) => dialog(page).evaluate((d) => d.scrollTop);
const currentLabel = async (page: Page) => (await currentItems(page).allTextContents()).map((t) => t.trim());
/** 2 回の描画を待つ（今の節の更新は `requestAnimationFrame` でまとめて 1 回。否定の確認の前に、更新が済んでいることを保証する）。 */
const settle = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
const prefsJson = (page: Page) => page.evaluate(() => localStorage.getItem("soda.prefs.v1"));

/** 見出しの上端が、題名の行の下端から何 px 下にあるか。 */
const headingBelowHeader = (page: Page, id: string) =>
  dialog(page).evaluate((d, hid) => {
    const header = d.querySelector(".settings-header")!.getBoundingClientRect();
    return document.getElementById(hid)!.getBoundingClientRect().top - header.bottom;
  }, id);

/** ホイールで、設定の本文の上から `dy` だけ回す（実物のホイール。メニューの上ではない）。 */
async function wheelBody(page: Page, dy: number): Promise<void> {
  const box = (await page.locator("dialog.settings-dialog .settings-body").boundingBox())!;
  const d = (await dialog(page).boundingBox())!;
  await page.mouse.move(Math.max(box.x + 20, d.x + 20), d.y + d.height / 2);
  await page.mouse.wheel(0, dy);
}

test.describe("設定のサイドメニュー（幅 1280×720）", () => {
  test("AC1・AC6：左に名前付きのナビゲーションで 6 節が並び、いちばん下までスクロールしても見えたまま。題名の行も固定。幅はメニューの分だけ広い", async ({ page, appServer }) => {
    await openApp(page, appServer);
    await openSettings(page);
    await expect(menu(page)).toBeVisible();
    await expect(menu(page)).toHaveAttribute("aria-label", "設定の節");
    expect(await page.getByRole("navigation", { name: "設定の節" }).count()).toBe(1);
    await expect(items(page)).toHaveText(SECTIONS);
    // 画面の節の見出しと同じ順・同じ文言。
    await expect(dialog(page).locator("section h3")).toHaveText(SECTIONS);

    // 幅: 設定の中身は今までの幅（34em − 余白）のまま、メニューの分だけダイアログが広い。
    const bodyW = (await dialog(page).locator(".settings-body").boundingBox())!.width;
    expect(bodyW).toBeGreaterThan(500);
    expect(bodyW).toBeLessThan(520);
    const dBox = (await dialog(page).boundingBox())!;
    expect(dBox.width).toBeGreaterThan(740);
    const vp = page.viewportSize()!;
    expect(dBox.x).toBeGreaterThanOrEqual(0);
    expect(dBox.x + dBox.width).toBeLessThanOrEqual(vp.width);

    // いちばん下までスクロール（スクロールの入れ物は dialog 自身）。
    await dialog(page).evaluate((d) => (d.scrollTop = d.scrollHeight));
    expect(await scrollTop(page)).toBeGreaterThan(0);
    const dAfter = (await dialog(page).boundingBox())!;
    const m = (await menu(page).boundingBox())!;
    expect(m.y, "メニューは見える範囲の中").toBeGreaterThanOrEqual(dAfter.y);
    expect(m.y + m.height).toBeLessThanOrEqual(dAfter.y + dAfter.height);
    const close = (await dialog(page).getByRole("button", { name: "閉じる" }).boundingBox())!;
    expect(close.y, "［閉じる］は上端に固定").toBeLessThan(dAfter.y + 60);
    expect(close.y).toBeGreaterThanOrEqual(dAfter.y);
  });

  test("AC1：メニューの項目は節の見出しから作られる（見出しを変えて開き直すと、メニューの文言も変わる）", async ({ page, appServer }) => {
    await openApp(page, appServer);
    await openSettings(page);
    await page.keyboard.press("Escape");
    await expect(dialog(page)).not.toHaveAttribute("open", "");
    await page.evaluate(() => (document.getElementById("settings-terminal")!.textContent = "ターミナル"));
    await focusTerminal(page);
    await prefixKey(page, "s");
    await expect(items(page).nth(3)).toHaveText("ターミナル");
  });

  test("AC-I1：メニューの下の空きを押しても閉じない。背景を押すと閉じる", async ({ page, appServer }) => {
    await openApp(page, appServer);
    await openSettings(page);
    const m = (await menu(page).boundingBox())!;
    const d = (await dialog(page).boundingBox())!;
    // メニューの下の、同じ列の空き（見える範囲の中）。
    const y = m.y + m.height + 40;
    expect(y, "クリックする位置はメニューの下の空き（見える範囲の中）").toBeLessThan(d.y + d.height - 10);
    await page.mouse.click(m.x + m.width / 2, y);
    await expect(dialog(page)).toHaveAttribute("open", "");
    // 背景（ダイアログの外）。
    await page.mouse.click(5, 5);
    await expect(dialog(page)).not.toHaveAttribute("open", "");
  });

  test("AC2・AC-I2：項目を押すと、見出しが題名の行のすぐ下に来て、フォーカスが見出しに移り枠が出る。Tab で節の最初の部品へ。Space/Enter で設定は変わらない", async ({ page, appServer }) => {
    await openApp(page, appServer);
    await openSettings(page);
    const before = await prefsJson(page);

    await items(page).nth(2).click(); // 表示
    expect(await activeId(page)).toBe("settings-display");
    const gap = await headingBelowHeader(page, "settings-display");
    expect(gap, "見出しは題名の行のすぐ下").toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThan(24);
    // マウスで押した後でも枠が出る（`:focus-visible` ではなく `:focus`）。
    const outline = await page.locator("#settings-display").evaluate((h) => {
      const s = getComputedStyle(h);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    expect(outline.style).not.toBe("none");
    expect(outline.width).toBeGreaterThan(0);
    expect(await currentLabel(page)).toEqual(["表示"]);

    // 見出しにフォーカスがある間に Space／Enter を押しても、設定は変わらない。
    await page.keyboard.press("Space");
    await page.keyboard.press("Enter");
    expect(await prefsJson(page)).toBe(before);

    // Tab は、その節の最初の部品へ。
    await page.keyboard.press("Tab");
    const inDisplay = await page.evaluate(() => !!document.activeElement?.closest('section[aria-labelledby="settings-display"]') && document.activeElement?.id !== "settings-display");
    expect(inDisplay).toBe(true);
  });

  test("AC2：末尾の節（キー）はスクロールしきれる所まで。見出しが見える", async ({ page, appServer }) => {
    await openApp(page, appServer);
    await openSettings(page);
    await items(page).nth(5).click();
    expect(await activeId(page)).toBe("settings-keys");
    const gap = await headingBelowHeader(page, "settings-keys");
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(await currentLabel(page)).toEqual(["キー"]);
    // 先頭の節は 0 まで戻る。
    await items(page).nth(0).click();
    expect(await scrollTop(page)).toBe(0);
    expect(await activeId(page)).toBe("settings-notify");
  });

  test("AC3：ホイールで印が移る。いちばん上は通知、いちばん下はキー。印は 1 つで、色以外（太さ・左の線）でも示す", async ({ page, appServer }) => {
    await openApp(page, appServer);
    await openSettings(page);
    expect(await currentLabel(page)).toEqual(["通知"]);
    await wheelBody(page, 100_000);
    await expect.poll(() => currentLabel(page)).toEqual(["キー"]);
    await expect(currentItems(page)).toHaveCount(1);
    const style = await currentItems(page).evaluate((b) => {
      const s = getComputedStyle(b);
      return { weight: Number(s.fontWeight), border: parseFloat(s.borderLeftWidth), color: s.borderLeftColor };
    });
    expect(style.weight).toBeGreaterThanOrEqual(600);
    expect(style.border).toBeGreaterThan(0);
    const other = await items(page).first().evaluate((b) => ({ weight: Number(getComputedStyle(b).fontWeight), color: getComputedStyle(b).borderLeftColor }));
    expect(other.weight).toBeLessThan(600);
    expect(other.color).not.toBe(style.color);
    await wheelBody(page, -100_000);
    await expect.poll(() => currentLabel(page)).toEqual(["通知"]);
    // 中ほど: 印は「題名の行のすぐ下の線（見出しの上端が題名の行の下 40px 付近まで）に掛かっている節」。
    await wheelBody(page, 700);
    await expect.poll(async () => (await currentLabel(page))[0]).not.toBe("通知");
    await settle(page);
    const label = (await currentLabel(page))[0]!;
    const idx = SECTIONS.indexOf(label);
    expect(await headingBelowHeader(page, HEADING_IDS[idx]!), "印の節の見出しは線（題名の行の下 40px）より上").toBeLessThanOrEqual(41);
    expect(await headingBelowHeader(page, HEADING_IDS[idx + 1]!), "次の節の見出しは線より下").toBeGreaterThan(40);
  });

  test("AC3：選んだ節（項目を押した）は、ホイールで離れるまで今の節のまま。ホイールで外れる", async ({ page, appServer }) => {
    await openApp(page, appServer);
    await openSettings(page);
    await items(page).nth(4).click(); // エージェント連携
    expect(await currentLabel(page)).toEqual(["エージェント連携"]);
    await wheelBody(page, -100_000);
    await expect.poll(() => currentLabel(page)).toEqual(["通知"]);
  });

  test("AC4・AC-I3・AC-I4：Alt+PageDown を 5 回で 6 節を 1 つずつ。最後で何も起きない。Alt+PageUp も同じ", async ({ page, appServer }) => {
    await openApp(page, appServer);
    await openSettings(page);
    for (let n = 1; n <= 5; n++) {
      await page.keyboard.press("Alt+PageDown");
      await expect.poll(() => currentLabel(page), `${n} 回目`).toEqual([SECTIONS[n]!]);
      expect(await activeId(page), "フォーカスは見出し").toBe(HEADING_IDS[n]);
    }
    const top = await scrollTop(page);
    await page.keyboard.press("Alt+PageDown");
    await settle(page);
    expect(await currentLabel(page)).toEqual(["キー"]);
    expect(await scrollTop(page)).toBe(top);
    for (let n = 4; n >= 0; n--) {
      await page.keyboard.press("Alt+PageUp");
      await expect.poll(() => currentLabel(page)).toEqual([SECTIONS[n]!]);
    }
    await page.keyboard.press("Alt+PageUp");
    await settle(page);
    expect(await currentLabel(page)).toEqual(["通知"]);
    expect(await scrollTop(page)).toBe(0);
  });

  test("AC4・AC-I4：メニューの項目・節の外の段落にフォーカスがあっても Alt+PageDown／PageUp が効き、フォーカスは見出しへ移る", async ({ page, appServer }) => {
    await openApp(page, appServer);
    await openSettings(page);
    await page.keyboard.press("Shift+Tab"); // 開いた直後から 1 回でメニューの今の節の項目
    await expect(items(page).nth(0)).toBeFocused();
    await page.keyboard.press("Alt+PageDown");
    await expect.poll(() => currentLabel(page)).toEqual(["テーマ"]);
    expect(await activeId(page), "メニューにあったフォーカスは見出しへ").toBe("settings-theme");
    // 節の外の段落（最後の節の一部）。
    await dialog(page).locator("[data-open-onboarding]").focus();
    await expect.poll(() => currentLabel(page)).toEqual(["キー"]);
    await page.keyboard.press("Alt+PageUp");
    await expect.poll(() => currentLabel(page)).toEqual(["エージェント連携"]);
    expect(await activeId(page)).toBe("settings-agent-integration");
  });

  test("AC4・AC-I5：<select> にフォーカスがあっても節は移り、<select> の値は変わらない。端末へ漏れない", async ({ page, appServer }) => {
    const sent = await openApp(page, appServer);
    await openSettings(page);
    const select = dialog(page).locator("select").first();
    await select.focus();
    const value = await select.inputValue();
    const n = sent().length;
    // ダイアログ自身の listener（Vue の後に登録）で、既定の動作が止められているかを見る（Chromium は元から値を変えないので、値だけでは見えない）。
    await dialog(page).evaluate((d) => {
      (window as unknown as { __prevented: boolean[] }).__prevented = [];
      d.addEventListener("keydown", (e) => {
        if ((e as KeyboardEvent).key.startsWith("Page")) (window as unknown as { __prevented: boolean[] }).__prevented.push(e.defaultPrevented);
      });
    });
    await page.keyboard.press("Alt+PageDown");
    await page.keyboard.press("Alt+PageUp");
    await page.keyboard.press("Alt+PageDown");
    expect(await select.inputValue()).toBe(value);
    expect(sent().length, "端末へ何も送らない").toBe(n);
    expect(await page.evaluate(() => (window as unknown as { __prevented: boolean[] }).__prevented), "3 回とも既定の動作を止めた").toEqual([true, true, true]);
    await expect.poll(async () => (await currentLabel(page)).length).toBe(1);
  });

  test("AC5：節の中の部品に Tab でフォーカスが入ると、その節に印が付く", async ({ page, appServer }) => {
    await openApp(page, appServer);
    await openSettings(page);
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      const inTheme = await page.evaluate(() => !!document.activeElement?.closest('section[aria-labelledby="settings-terminal"]'));
      if (inTheme) break;
    }
    await expect.poll(() => currentLabel(page)).toEqual(["端末"]);
  });

  test("AC5：スクロールせずに高さが変わる（上の節の展開）と、印が合う", async ({ page, appServer }) => {
    await openApp(page, appServer);
    await openSettings(page);
    // 端末の見出しが題名の行のすぐ下に来る位置へ（プログラムからのスクロール。選んだ節は付かない）。
    await dialog(page).evaluate((d) => {
      const header = d.querySelector(".settings-header")!.getBoundingClientRect();
      d.scrollTop += document.getElementById("settings-terminal")!.getBoundingClientRect().top - header.bottom - 10;
    });
    await expect.poll(() => currentLabel(page)).toEqual(["端末"]);
    const top = await scrollTop(page);
    // 上の節（テーマ）の色の上書きを展開する → 下の見出しが押し下げられる。スクロールの位置は変わらず、scroll のイベントも起きない。
    const details = dialog(page).locator("details.settings-theme-overrides");
    await details.evaluate((el) => ((el as HTMLDetailsElement).open = true));
    expect(await scrollTop(page), "位置は変わらない").toBe(top);
    await expect.poll(async () => (await currentLabel(page))[0], "高さが変わると今の節が決まり直る").not.toBe("端末");
    await settle(page);
    const idx = SECTIONS.indexOf((await currentLabel(page))[0]!);
    expect(await headingBelowHeader(page, HEADING_IDS[idx]!)).toBeLessThanOrEqual(41);
    expect(await headingBelowHeader(page, HEADING_IDS[idx + 1]!)).toBeGreaterThan(40);
  });

  test("AC7・AC-I3：Shift+Tab 1 回でメニューへ。矢印・Home/End で項目を移り、Tab でメニューの外へ出る。Enter でその節へ。Tab の順は今まで通り", async ({ page, appServer }) => {
    await openApp(page, appServer);
    await openSettings(page);
    // 開いた直後のフォーカスは通知の最初の switch。そこから前進の Tab は次の部品。
    const firstSwitch = dialog(page).locator('[role="switch"]').first();
    await expect(firstSwitch).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(firstSwitch).not.toBeFocused();
    expect(
      await page.evaluate(() => !!document.activeElement?.closest('section[aria-labelledby="settings-notify"]')),
      "次の部品は同じ節の中（メニューには入らない）",
    ).toBe(true);
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    // メニューの今の節の項目（通知）。
    await expect(items(page).nth(0)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(items(page).nth(2)).toBeFocused();
    expect(await currentLabel(page), "矢印だけでは節は移らない").toEqual(["通知"]);
    await page.keyboard.press("End");
    await expect(items(page).nth(5)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(items(page).nth(5)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(items(page).nth(0)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    // Tab はメニューの外へ（メニューの次の部品＝本文の部品）。
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("nav.settings-menu"))).toBe(false);
    // Shift+Tab → メニュー → 矢印で動いた項目が 1 つの停止位置ではなく、今の節（通知）に戻っている。
    await page.keyboard.press("Shift+Tab");
    await expect(items(page).nth(0)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    expect(await activeId(page), "Enter でその節へ。フォーカスは見出し").toBe("settings-terminal");
    expect(await currentLabel(page)).toEqual(["端末"]);
    await items(page).nth(3).focus(); // 今の節の項目
    await expect(items(page).nth(3)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Space");
    expect(await activeId(page), "Space でもその節へ").toBe("settings-display");
  });

  test("AC7：Esc・［閉じる］で閉じ、開く前の pane へ戻る", async ({ page, appServer }) => {
    await openApp(page, appServer);
    await openSettings(page);
    await items(page).nth(3).click();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).not.toHaveAttribute("open", "");
    expect(await page.evaluate(() => document.activeElement?.classList.contains("xterm-helper-textarea")), "Esc でも開く前の pane へ").toBe(true);
    await openSettings(page);
    await dialog(page).getByRole("button", { name: "閉じる" }).click();
    await expect(dialog(page)).not.toHaveAttribute("open", "");
    expect(await page.evaluate(() => document.activeElement?.classList.contains("xterm-helper-textarea"))).toBe(true);
  });

  test("AC8：キーの取り込み待ちの間の Alt+PageDown は、節を移さず取り込まれる。メニューの項目を押すと取り込みは元のまま終わり、節へ移る", async ({ page, appServer }) => {
    await openApp(page, appServer);
    await openSettings(page);
    await items(page).nth(5).click();
    await dialog(page).locator("[data-prefix-change]").click();
    const capture = dialog(page).locator(".keys-capture");
    await expect(capture).toBeVisible();
    await expect(capture).toBeFocused();
    const top = await scrollTop(page);
    await page.keyboard.press("Alt+PageDown");
    expect(await currentLabel(page), "節は移らない（最後の節のまま）").toEqual(["キー"]);
    expect(await scrollTop(page)).toBe(top);
    await expect(dialog(page)).toHaveAttribute("open", "");
    // 取り込み待ちを残したまま、メニューの項目を押す。
    await dialog(page).locator("[data-prefix-change]").click(); // 取り込みが終わっていても、続いていても、ここで取り込み待ちになる
    await expect(capture).toBeVisible();
    await items(page).nth(0).click();
    await expect(capture, "取り込み待ちは元のまま終わる").toHaveCount(0);
    expect(await scrollTop(page)).toBe(0);
    expect(await activeId(page)).toBe("settings-notify");
    await expect(dialog(page)).toHaveAttribute("open", "");
    // 題名の行は固定のまま。
    const d = (await dialog(page).boundingBox())!;
    const close = (await dialog(page).getByRole("button", { name: "閉じる" }).boundingBox())!;
    expect(close.y).toBeGreaterThanOrEqual(d.y);
  });

  test("AC8：「すべて既定に戻す」の確認の表示中にメニューの項目を押すと、節へ移り、確認は今までの決まりのまま（壊れた状態で残らない）", async ({ page, appServer }) => {
    await openApp(page, appServer);
    await openSettings(page);
    await items(page).nth(5).click();
    await dialog(page).locator("[data-reset-all]").click();
    const confirm = dialog(page).locator('[role="group"][aria-label="すべて既定に戻す確認"]');
    await expect(confirm).toBeVisible();
    const before = await prefsJson(page);
    await items(page).nth(1).click();
    expect(await activeId(page)).toBe("settings-theme");
    expect(await prefsJson(page), "確認の表示中に移っても、設定は変わらない").toBe(before);
    await expect(dialog(page)).toHaveAttribute("open", "");
    // 確認はそのまま操作できる（［やめる］で閉じる）。
    await items(page).nth(5).click();
    await dialog(page).locator("[data-confirm-no]").click();
    await expect(confirm).toHaveCount(0);
  });

  test("AC8：キーの節の下の帯（結果の文）は、メニューが付いても見える範囲の中に固定される", async ({ page, appServer }) => {
    await openApp(page, appServer);
    await openSettings(page);
    await items(page).nth(5).click();
    await dialog(page).locator("[data-prefix-change]").click();
    await page.keyboard.press("Escape"); // 取り込みを取り消す → 帯に結果の文
    const band = dialog(page).locator(".keys-status-band");
    await expect(band).toBeVisible();
    const d = (await dialog(page).boundingBox())!;
    const b = (await band.boundingBox())!;
    expect(b.y + b.height).toBeLessThanOrEqual(d.y + d.height + 1);
    expect(b.y).toBeGreaterThanOrEqual(d.y);
  });

  test("AC-I2：メニューで移っても、設定の値は何も変わらない", async ({ page, appServer }) => {
    await openApp(page, appServer);
    await openSettings(page);
    const before = await prefsJson(page);
    for (const i of [3, 1, 5, 0]) await items(page).nth(i).click();
    await page.keyboard.press("Alt+PageDown");
    await page.keyboard.press("Alt+PageUp");
    expect(await prefsJson(page)).toBe(before);
  });
});

test.describe("設定のサイドメニュー（高い画面）", () => {
  test.use({ viewport: { width: 1280, height: 1400 } });

  test("AC4：キーの絞り込みで末尾の 2 節が 1 画面に収まる状態でも、6 節を 1 つずつ通る（選んだ節が位置より優先される）", async ({ page, appServer }) => {
    await openApp(page, appServer);
    await openSettings(page);
    // 何も当たらない絞り込み。高い画面（1400px）では「エージェント連携」と「キー」が 1 画面に収まり、位置だけで決めると末尾の節を飛ばす。
    await dialog(page).locator("#keys-filter-input").fill("zzzzzzzz");
    await dialog(page).locator("#settings-notify").focus();
    for (let n = 1; n <= 5; n++) {
      await page.keyboard.press("Alt+PageDown");
      await expect.poll(() => currentLabel(page), `${n} 回目`).toEqual([SECTIONS[n]!]);
    }
  });
});

test.describe("設定のサイドメニュー（低い画面）", () => {
  test.use({ viewport: { width: 1280, height: 320 } });

  test("AC11：メニューが収まらないときはメニューの中がスクロールし、今の節の項目が見える。メニュー上のホイールは本文を動かさない", async ({ page, appServer }) => {
    await openApp(page, appServer);
    await openSettings(page);
    const scrollable = await menu(page).evaluate((n) => n.scrollHeight > n.clientHeight);
    expect(scrollable, "この高さではメニューが収まらない").toBe(true);
    const nav = (await menu(page).boundingBox())!;
    const d = (await dialog(page).boundingBox())!;
    expect(nav.y + nav.height, "メニューはダイアログの見える範囲を越えない").toBeLessThanOrEqual(d.y + d.height + 1);
    // メニューの上のホイール: メニューだけが動く。
    await page.mouse.move(nav.x + nav.width / 2, nav.y + nav.height / 2);
    const bodyBefore = await scrollTop(page);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => menu(page).evaluate((n) => n.scrollTop)).toBeGreaterThan(0);
    expect(await scrollTop(page), "本文は動かない").toBe(bodyBefore);
    // 今の節の項目はメニューの見える位置にある。
    await page.keyboard.press("Escape");
    await openSettings(page);
    for (let n = 0; n < 5; n++) await page.keyboard.press("Alt+PageDown");
    await expect.poll(() => currentLabel(page)).toEqual(["キー"]);
    await expect
      .poll(async () => {
        const n = (await menu(page).boundingBox())!;
        const c = (await currentItems(page).boundingBox())!;
        return c.y >= n.y - 1 && c.y + c.height <= n.y + n.height + 1;
      })
      .toBe(true);
  });
});

test.describe("設定のサイドメニュー（幅）", () => {
  test("AC6：幅 800 ではダイアログが画面からはみ出さずメニューが出る。767 以下では出ず、幅は今まで通り", async ({ page, appServer }) => {
    await page.setViewportSize({ width: 800, height: 720 });
    await openApp(page, appServer);
    await openSettings(page);
    const d800 = (await dialog(page).boundingBox())!;
    expect(d800.x).toBeGreaterThanOrEqual(0);
    expect(d800.x + d800.width).toBeLessThanOrEqual(800);
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 767, height: 720 });
    await focusTerminal(page);
    await prefixKey(page, "s");
    await expect(dialog(page)).toHaveAttribute("open", "");
    await expect(menu(page)).toBeHidden();
    const d767 = (await dialog(page).boundingBox())!;
    expect(d767.width, "今までの幅（34em）").toBeLessThanOrEqual(34 * 16 + 1);
    // メニューが出ていない幅でも Alt+PageDown は効く。
    await page.keyboard.press("Alt+PageDown");
    await expect.poll(() => activeId(page)).toBe("settings-theme");
  });

  test("AC6：開いたまま 768 をまたぐと、メニューが出入りし、メニューにあったフォーカスは今の節の見出しへ移る", async ({ page, appServer }) => {
    await openApp(page, appServer);
    await openSettings(page);
    await items(page).nth(2).focus();
    await expect(items(page).nth(2)).toBeFocused();
    await page.setViewportSize({ width: 700, height: 720 });
    await expect(menu(page)).toBeHidden();
    await expect.poll(() => activeId(page), "今の節（通知）の見出し").toBe("settings-notify");
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(menu(page)).toBeVisible();
  });
});
