import { contrastRatio, THEME_NAMES } from "@sodashitsu/protocol";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { prefixKey } from "../support/keys.js";

/**
 * 読みやすさ（20261008-ui-style の AC8。PR3 の T13d）。**モダンが重ねる影・角・余白は、文字と地の色を変えない**ことを、全部のテーマ（暗い・明るい）で確かめる:
 * 重なる部品（設定のダイアログ・右クリックのメニュー・トースト）の文字の色・地の色・枠の色が、クラシックと同じで、文字と地の色の比が、クラシックを下回らない。
 * 影は部品の外側にだけ描かれる（`box-shadow`。文字の下に敷かれない）ことと、フォーカスの輪が、モダンでも見える（`outline` が消えない）ことも、あわせて確かめる。
 * 判定は、ブラウザの計算済みの値（DOM）で行う（条項 e2e-observe-browser）。
 */
test.setTimeout(150_000);

interface Surface {
  color: string;
  bg: string;
  border: string;
  shadow: string;
}

const read = (loc: Locator): Promise<Surface> =>
  loc.evaluate((e) => {
    const c = getComputedStyle(e);
    return { color: c.color, bg: c.backgroundColor, border: c.borderTopColor, shadow: c.boxShadow };
  });

const hex = (rgb: string): string => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
  if (!m) throw new Error(`rgb() でない: ${rgb}`);
  return `#${[m[1], m[2], m[3]].map((c) => Number(c).toString(16).padStart(2, "0")).join("")}`;
};

async function setStyle(client: { request: (m: "prefs.set", p: { patch: Record<string, unknown> }) => Promise<unknown> }, page: Page, theme: string, style: "classic" | "modern"): Promise<void> {
  await client.request("prefs.set", { patch: { theme, themeAuto: false, uiStyle: style } });
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset["uiStyle"])).toBe(style);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset["theme"])).toBe(theme);
}

test("全テーマで、重なる部品の文字・地・枠の色が、様式で変わらず、文字と地の比が下がらない。影は外側だけ。フォーカスの輪が消えない", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const ws = client.helloSnapshot()!.workspaces[0]!;
  await client.request("tab.create", { workspaceId: ws.id, label: "second" }); // tab が 1 つだと tab バーが隠れる
  await client.request("tab.focus", { tabId: ws.tabIds[0]! });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await page.mouse.click(700, 400);
  // 消えないトースト（起動のヒント）を、そのまま使う。
  await expect(page.locator(".toast")).toHaveCount(1);

  const results: { theme: string; surface: string; classic: Surface; modern: Surface }[] = [];
  // 段階 1: 設定のダイアログ（開いたまま、テーマ・様式を替える）と、トースト。
  await prefixKey(page, "s");
  const dialog = page.locator("dialog.settings-dialog");
  await expect(dialog).toHaveAttribute("open", "");
  await dialog.locator("nav.settings-menu button", { hasText: "表示" }).click();
  for (const theme of THEME_NAMES) {
    await setStyle(client, page, theme, "classic");
    const c = { dialog: await read(dialog), toast: await read(page.locator(".toast").first()) };
    await setStyle(client, page, theme, "modern");
    const m = { dialog: await read(dialog), toast: await read(page.locator(".toast").first()) };
    for (const k of ["dialog", "toast"] as const) results.push({ theme, surface: k, classic: c[k], modern: m[k] });
  }
  // フォーカスの輪: 設定の中のラジオ・スイッチへ Tab で届いたとき、輪（outline）が見える。モダンでも同じ。
  const outlineOfFocus = async (): Promise<string> => {
    await dialog.locator(".settings-switch").first().focus();
    await page.keyboard.press("Shift+Tab"); // キーボードで届いた状態にする（`:focus-visible` が働く）
    await page.keyboard.press("Tab");
    return page.evaluate(() => {
      const e = document.activeElement as HTMLElement;
      const c = getComputedStyle(e);
      return `${e.className}|${e.matches(":focus-visible")}|${c.outlineStyle}|${c.outlineWidth}`;
    });
  };
  await setStyle(client, page, "dracula", "classic");
  const outlineClassic = await outlineOfFocus();
  await setStyle(client, page, "dracula", "modern");
  const outlineModern = await outlineOfFocus();
  expect(outlineModern, "フォーカスの輪が、モダンでも同じ").toBe(outlineClassic);
  expect(outlineModern.split("|")[1], `キーボードで届いたのに :focus-visible でない: ${outlineModern}`).toBe("true");
  expect(outlineModern.split("|")[2], `輪が消えている: ${outlineModern}`).not.toBe("none");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toHaveAttribute("open", "");

  // 段階 2: 右クリックのメニュー（開いたまま、テーマ・様式を替える）。
  await page.locator(".tab-bar-item").first().click({ button: "right" });
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  for (const theme of THEME_NAMES) {
    await setStyle(client, page, theme, "classic");
    const c = await read(menu);
    const cLi = await read(menu.locator("li").first());
    await setStyle(client, page, theme, "modern");
    const m = await read(menu);
    const mLi = await read(menu.locator("li").first());
    results.push({ theme, surface: "menu", classic: c, modern: m }, { theme, surface: "menu-row", classic: cLi, modern: mLi });
  }

  expect(results.length).toBe(THEME_NAMES.length * 4);
  for (const r of results) {
    const label = `${r.theme}/${r.surface}`;
    expect(r.modern.color, `${label} の文字の色`).toBe(r.classic.color);
    expect(r.modern.bg, `${label} の地の色`).toBe(r.classic.bg);
    expect(r.modern.border, `${label} の枠の色`).toBe(r.classic.border);
    // 比は、色が同じなら同じ。念のため、地が透明でない部品で、比がクラシックを下回らないことを数でも見る。
    if (!r.classic.bg.startsWith("rgba(0, 0, 0, 0)")) {
      const before = contrastRatio(hex(r.classic.color), hex(r.classic.bg));
      const after = contrastRatio(hex(r.modern.color), hex(r.modern.bg));
      expect(after, `${label} の文字と地の比`).toBeGreaterThanOrEqual(before);
    }
    // 影は外側だけ（`inset` でない）。クラシックでは影が無い部品は、モダンで影つき。濃さは、黒の 30% 以下（uiStyle.css の検査と同じ）。
    expect(r.modern.shadow.includes("inset"), `${label} の影が inset`).toBe(false);
    for (const m of r.modern.shadow.matchAll(/rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/g)) expect(Number(m[4]), `${label} の影の濃さ`).toBeLessThanOrEqual(0.3);
  }
  // 重なる部品（ダイアログ・メニュー本体・トースト）は、モダンで影つき（陽性の対照）。メニューの行は影なし。
  for (const r of results.filter((x) => x.surface !== "menu-row")) expect(r.modern.shadow, `${r.theme}/${r.surface} の影`).not.toBe("none");
  for (const r of results.filter((x) => x.surface !== "menu-row")) expect(r.classic.shadow, `${r.theme}/${r.surface} のクラシックの影`).toBe("none");
  client.close();
});
