import type { ElementHandle, Locator, Page } from "@playwright/test";

/**
 * 表示の面の配置（20261008-display-layout）の E2E の道具。判定は、利用者が見る場所（DOM・箱・`elementFromPoint`・`activeElement`）で行う（規約 `e2e-observe-browser`）。
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export const trayButtons = (page: Page): Locator => page.locator("[data-display-tray-button]");
export const trayButton = (page: Page, name: string): Locator => page.locator(`[data-display-tray-button][data-display-name="${name}"]`);

export async function boxOf(loc: Locator): Promise<Box> {
  const b = await loc.boundingBox();
  if (!b) throw new Error("no bounding box");
  return b;
}
export const intersects = (a: Box, b: Box): boolean => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/** その箱の中心の `elementFromPoint` が、要素自身（またはその子孫）か。 */
export async function centerHitsSelf(loc: Locator): Promise<boolean> {
  return loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit !== null && (hit === el || el.contains(hit));
  });
}

/** `document.activeElement` の説明（`TEXTAREA`・`BODY`・`IFRAME` など）。 */
export const activeTagName = (page: Page): Promise<string> => page.evaluate(() => document.activeElement?.tagName ?? "NONE");

/**
 * フォーカスを受けない・押してもフォーカスを取らない部品でもない場所（サイドバーの空き）を探して押す。
 * 見つかった点を返す（見つからなければ例外）。PR3 の元の道（フォーカスを受けない余白を押すと、操作中が解ける）を見るのに使う。
 */
export async function clickBlankAppSpace(page: Page): Promise<{ x: number; y: number }> {
  const pt = await page.evaluate(() => {
    const side = document.querySelector(".sidebar");
    if (!side) return null;
    const r = side.getBoundingClientRect();
    for (let y = r.bottom - 6; y > r.top + 40; y -= 6) {
      for (const x of [r.left + 6, r.left + r.width / 2, r.right - 6]) {
        const el = document.elementFromPoint(x, y);
        if (el && side.contains(el) && el.closest("button, a, input, textarea, select, [tabindex], [role=button], [data-display-keepfocus]") === null) return { x, y };
      }
    }
    return null;
  });
  if (!pt) throw new Error("no blank app space");
  await page.mouse.click(pt.x, pt.y);
  return pt;
}

/** 枠（iframe）の要素の控え。後で `isConnected` で「同じ要素のまま」か「別の要素（作り直し）」かを見る（先例: `display-script-nav.spec.ts`）。 */
export async function frameHandle(page: Page, faceId: string): Promise<ElementHandle<HTMLElement>> {
  const h = await page.locator(`[data-display-root="${faceId}"] iframe[data-display-frame]`).first().elementHandle();
  if (!h) throw new Error(`no frame for ${faceId}`);
  return h as ElementHandle<HTMLElement>;
}
