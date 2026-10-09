import type { ElementHandle, Locator, Page } from "@playwright/test";
import type { AppServer } from "./appServer.js";
import { runDisplay } from "./display.js";
import { ok } from "./displayScript.js";
import { expect } from "./fixtures.js";

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

// --- 配置の E2E の共通の道具（display-layout-state・display-layout-dock） -------------------------------------------------------------
export const set = (appServer: AppServer, paneId: string, name: string, kind: "panel" | "band", extra: string[] = [], text = name) =>
  runDisplay(appServer, paneId, ["set", name, "--kind", kind, "--text", text, ...extra]).then(ok);
/** 面の名前 → 面の id（`data-display-root` は id）。 */
export const idsOf = async (appServer: AppServer, paneId: string): Promise<Record<string, string>> => {
  const r = await ok(await runDisplay(appServer, paneId, ["list"]));
  return Object.fromEntries((r.json as { displays: { id: string; name: string }[] }).displays.map((d) => [d.name, d.id]));
};
export const openFaceMenu = async (page: Page, appServer: AppServer, paneId: string, name: string): Promise<void> => {
  const id = (await idsOf(appServer, paneId))[name]!;
  await page.locator(`[data-display-root="${id}"] [data-display-menu-button]`).click();
  await expect(page.getByRole("menu")).toBeVisible();
};
export const menuItem = (page: Page, label: string) => page.getByRole("menuitem", { name: label, exact: true });
export const stealReports = (sent: { reports(): { problem: string }[] }): number => sent.reports().filter((r) => r.problem === "focus_steal").length;
export const termFocused = (page: Page): Promise<boolean> => page.evaluate(() => document.activeElement?.classList.contains("xterm-helper-textarea") === true);

/**
 * 枠（iframe）の出入りを記録する。Chromium は、iframe を DOM の中で動かすと（同じ要素のまま）`load` が 1 増える（`isConnected` は常に真）ので、
 * 動かしたことは `data-display-loads` の比較と、この記録（`removedNodes`・`addedNodes`）でしか見つからない。記録の `id` は面の id。
 */
export const watchFrames = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const w = window as unknown as { __frameLog: { kind: string; id: string }[] };
    w.__frameLog = [];
    const ids = new WeakMap<Element, string>();
    const idOf = (f: Element): string => {
      let v = ids.get(f);
      if (!v) {
        v = f.closest("[data-display-root]")?.getAttribute("data-display-root") ?? "?";
        ids.set(f, v);
      }
      return v;
    };
    const frames = (n: Node): Element[] => (n instanceof Element ? (n.matches("iframe[data-display-frame]") ? [n] : Array.from(n.querySelectorAll("iframe[data-display-frame]"))) : []);
    document.querySelectorAll("iframe[data-display-frame]").forEach(idOf);
    new MutationObserver((ms) => {
      for (const m of ms) {
        for (const n of Array.from(m.removedNodes)) for (const f of frames(n)) w.__frameLog.push({ kind: "removed", id: idOf(f) });
        for (const n of Array.from(m.addedNodes)) for (const f of frames(n)) w.__frameLog.push({ kind: "added", id: idOf(f) });
      }
    }).observe(document, { childList: true, subtree: true });
  });
/** 記録を取り出して空にする（面の id の重複を除く）。 */
export const takeFrameLog = async (page: Page): Promise<string[]> => {
  await page.waitForTimeout(150);
  const log = await page.evaluate(() => {
    const w = window as unknown as { __frameLog: { kind: string; id: string }[] };
    return w.__frameLog.splice(0);
  });
  return [...new Set(log.map((l) => l.id))];
};
export const frameLoads = (page: Page): Promise<string[]> => page.locator("iframe[data-display-frame]").evaluateAll((els) => els.map((e) => e.getAttribute("data-display-loads") ?? ""));


/**
 * `activeElement` が `body` になった回数を数え始める（25ms ごとの標本。`focusout` の瞬間も数えるのは `transient` が真のとき）。
 * フォーカスのある要素が DOM から消える瞬間は、ブラウザが一瞬 `body` にする（描き直しの後の備えが同じ周期のうちに端末へ移すので、利用者には見えない）ので、消える操作では標本だけで数える。
 */
export const trackBodyHits = (page: Page, transient = true): Promise<void> =>
  page.evaluate((withFocusout) => {
    const w = window as unknown as { __bodyHits: number };
    w.__bodyHits = 0;
    if (withFocusout) document.addEventListener("focusout", (e) => { if ((e as FocusEvent).relatedTarget === null && document.activeElement === document.body) w.__bodyHits++; }, true);
    setInterval(() => { if (document.activeElement === document.body) w.__bodyHits++; }, 25);
  }, transient);
export const bodyHits = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __bodyHits: number }).__bodyHits);

// --- 浮いた窓（20261008-display-layout PR-C） -------------------------------------------------------------------------------------------
/** 浮いた窓の要素（根）。面の名前や id で絞らないときは全部。 */
export const floatWins = (page: Page): Locator => page.locator("[data-display-float]");
export const floatWin = (page: Page, faceId: string): Locator => page.locator(`[data-display-float][data-display-root="${faceId}"]`);
/** 窓の枠（iframe）。 */
export const floatFrames = (page: Page): Locator => page.locator("[data-display-float] iframe[data-display-frame]");
/** 端末の領域の箱（窓が動けるのは、この箱の中だけ）。 */
export const terminalBox = (page: Page): Promise<Box> => boxOf(page.locator("[data-pane-frame-main]").first());
export const insideBox = (inner: Box, outer: Box, tol = 1): boolean =>
  inner.x >= outer.x - tol && inner.y >= outer.y - tol && inner.x + inner.width <= outer.x + outer.width + tol && inner.y + inner.height <= outer.y + outer.height + tol;
/** 窓のボタン（トレイの ❐）で開く。 */
export async function openFloatByTray(page: Page, name: string): Promise<void> {
  await trayButton(page, name).click();
  await expect(trayButton(page, name)).toHaveAttribute("aria-pressed", "true");
}
/** 窓の中の点を、マウスでつかんで動かす（`steps` 回に分けて）。 */
export async function dragFrom(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 6): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}
/** 箱の中心。 */
export const centerOf = (b: Box): { x: number; y: number } => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
/** 窓の縁・角のつかむ場所の箱。 */
export const handleOf = (win: Locator, h: string): Locator => win.locator(`[data-display-float-handle="${h}"]`);
/** 窓の見出しのつかむ場所（ボタンでない側）。 */
export const gripOf = (win: Locator): Locator => win.locator("[data-display-grip]");
