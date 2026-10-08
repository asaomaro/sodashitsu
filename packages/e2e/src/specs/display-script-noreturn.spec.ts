import type { Locator, Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { runAsk, watchAskSubscriptions } from "../support/ask.js";
import { dialog } from "../support/askForm.js";
import { runDisplay, watchDisplaySubscriptions } from "../support/display.js";
import { enableScript, ok, scriptFrameEl, setScriptOk } from "../support/displayScript.js";
import { watchSentInput } from "../support/frames.js";
import { focusTerminal, prefixKey } from "../support/keys.js";
import type { SodaTestClient } from "../support/wsClient.js";

/**
 * 戻しすぎの確認（20261007-soda-extensions の 6 回目の再レビュー後）。「利用者が自分で外した」の免除を無くしたので、スクリプトの面が載っている間に、
 * 既存の操作（ask のダイアログ・tab と pane の D&D・つまみのドラッグ・名前の変更・メニュー・キー一覧・copy モードの検索・モバイルの重ね表示）の
 * フォーカスが、端末へ引き戻されないことを、実際のポインタとキーで確かめる。面は、何もしない無害な面と、300ms ごとにフォーカスを落とす面の 2 通り。
 * 合否はブラウザの DOM（フォーカスのある要素・幅・順・値）とブラウザが送った入力（CDP）で決める。この筋は `--workers=1` で単独で流す。
 */
const FACES: Record<string, string> = {
  benign: "setInterval(function(){}, 1000);",
  drop300: "setInterval(function(){ window.focus(); parent.focus(); }, 300);",
};
const html = (script: string): string => `<!doctype html><body><p>face</p><script>${script}</script></body>`;

interface World {
  client: SodaTestClient;
  /** 面を載せた pane（`mover`）と、同じ tab の隣の pane（`other`）。 */
  mover: string;
  other: string;
  /** 同じフォルダの 2 つの workspace の id と、2 つ目の tab の id。 */
  ws: { a: string; b: string };
  tabs: { t1: string; t2: string };
  input: () => { paneId: string; text: string }[];
}

/** 前提を作ってブラウザで開き、面を載せる。 */
async function boot(page: Page, appServer: AppServer, face: string, opts: { twoTabs?: boolean } = {}): Promise<World> {
  await enableScript(appServer);
  const client = await appServer.openClient();
  const initial = client.helloSnapshot()!.workspaces[0]!.id;
  const cwd = process.cwd();
  const a = await client.request("workspace.create", { cwd, label: "wsA" });
  const b = await client.request("workspace.create", { cwd, label: "wsB" });
  const split = await client.request("pane.split", { paneId: a.pane.id, direction: "right" });
  await client.request("pane.rename", { paneId: a.pane.id, label: "mover" });
  await client.request("tab.rename", { tabId: a.tab.id, label: "t1" });
  let t2 = "";
  if (opts.twoTabs) {
    const t = await client.request("tab.create", { workspaceId: a.workspace.id, label: "t2" });
    t2 = (t as { tab: { id: string } }).tab.id;
  }
  await client.request("workspace.close", { workspaceId: initial });
  await page.addInitScript((p) => localStorage.setItem("soda.prefs.v1", p), JSON.stringify({ paneAgentNameVisible: true }));
  const input = await watchSentInput(page);
  const dsubs = await watchDisplaySubscriptions(page);
  const asubs = await watchAskSubscriptions(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await dsubs.waitFor(1);
  await asubs.waitFor(1);
  await page.locator(".sidebar-spaces .sidebar-row", { hasText: "wsA" }).click();
  if (opts.twoTabs) await page.locator(".tab-bar-item", { hasText: "t1" }).click();
  await setScriptOk(appServer, a.pane.id, "g", html(FACES[face]!));
  await expect(scriptFrameEl(page)).toHaveCount(1);
  return { client, mover: a.pane.id, other: split.pane.id, ws: { a: a.workspace.id, b: b.workspace.id }, tabs: { t1: a.tab.id, t2 }, input };
}

/**
 * `ms` のあいだ 50ms ごとに `pred` を評価する。落とす面は、フォーカスを一瞬 body へ落とす（戻すまでの数 ms。限界として docs に書いてある）ので、
 * 1 回の偽は許す。**続けて 2 回（約 100ms）偽なら失敗**＝戻っていない（引き戻された・戻らない）。
 */
async function holds(page: Page, pred: () => boolean, ms = 1500): Promise<void> {
  let falses = 0;
  for (let t = 0; t < ms; t += 50) {
    falses = (await page.evaluate(pred)) ? 0 : falses + 1;
    expect(falses, `${t}ms 時点で続けて偽`).toBeLessThan(2);
    await page.waitForTimeout(50);
  }
}
const inAskDialog = (): boolean => !!document.querySelector("dialog#soda-ask-dialog")?.contains(document.activeElement);

const box = async (l: Locator) => (await l.boundingBox())!;
const center = async (l: Locator): Promise<{ x: number; y: number }> => {
  const b = await box(l);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
/** 実際のポインタでドラッグ（つかんで 12px 動かしてから目的まで。離す）。 */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 12, from.y + 12, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.waitForTimeout(400); // 面の落としが何度か挟まる
  await page.mouse.up();
}

for (const face of Object.keys(FACES)) {
  test.describe(`面: ${face}`, () => {
    test.describe.configure({ timeout: 120_000 });

    // D39: 落とす面が載っていると、ask のダイアログの中（Shadow DOM の中の入力）のフォーカスが body へ落ちたまま戻らなかった。戻し先に実際の要素を覚えて直した。
    test("ask のダイアログ: キーで選び、欄に打った文字が欄に入り、端末へ漏れない。途中でダイアログのフォーカスが外れない", async ({ page, appServer }) => {
      const w = await boot(page, appServer, face);
      const n = w.input().length;
      const run = await runAsk(appServer, w.mover, {
        title: "確認",
        questions: [
          { id: "c", label: "選択", type: "single", options: ["aaa", "bbb", "ccc"], default: "aaa" },
          { id: "memo", label: "メモ", type: "text" },
        ],
      });
      await expect(dialog(page)).toBeVisible();
      await holds(page, inAskDialog);
      const radio = dialog(page).locator("input[type=radio]").first();
      await radio.focus();
      await page.keyboard.press("ArrowDown"); // キーで選ぶ
      await holds(page, inAskDialog, 800);
      await expect(dialog(page).locator("input[type=radio]:checked")).toHaveCount(1);
      const field = dialog(page).locator('[data-ask-question="memo"]').locator("textarea:visible, input[type=text]:visible").first();
      await field.click();
      await page.keyboard.type("hello", { delay: 120 });
      await holds(page, inAskDialog);
      // 戻すまでの間のキーは失われうる（限界）。大半が入ることを見る。
      const typedValue = await field.inputValue();
      expect(typedValue.length).toBeGreaterThanOrEqual(4);
      await field.fill("hello");
      const leaked = w.input().slice(n).filter((i) => i.paneId === w.mover).map((i) => i.text).join("");
      expect(leaked).not.toContain("hello");
      expect(leaked).not.toContain("h");
      await page.keyboard.press("Control+Enter");
      const r = await run.done;
      expect(r.code).toBe(0);
      expect((r.json as { answers: { c: string; memo: string } }).answers.memo).toBe("hello");
      expect((r.json as { answers: { c: string } }).answers.c).toBe("bbb");
    });

    for (const gap of [25, 50]) {
      test(`ask のダイアログの欄に ${gap}ms 間隔で 40 文字打つ: 大半が入る（端末と同じ程度。戻すまでの間のキーは失われる限界）`, async ({ page, appServer }) => {
        const w = await boot(page, appServer, face);
        const n = w.input().length;
        const run = await runAsk(appServer, w.mover, { title: "確認", questions: [{ id: "memo", label: "メモ", type: "text" }] });
        await expect(dialog(page)).toBeVisible();
        const field = dialog(page).locator('[data-ask-question="memo"]').locator("textarea:visible, input[type=text]:visible").first();
        await field.click();
        await page.keyboard.type("x".repeat(40), { delay: gap });
        const got = (await field.inputValue()).length;
        console.log(`MEASURE ask-text face=${face} gap=${gap}ms typed=40 reached=${got}`);
        expect(got).toBeGreaterThanOrEqual(36);
        expect(w.input().slice(n).filter((i) => i.paneId === w.mover).map((i) => i.text).join("")).not.toContain("x");
        await page.keyboard.press("Escape");
        await run.done;
      });
    }

    test("ask のダイアログの radio に矢印キーを 50ms 間隔で 8 回: 大半が届く", async ({ page, appServer }) => {
      const w = await boot(page, appServer, face);
      const options = Array.from({ length: 10 }, (_, i) => `o${i}`);
      const run = await runAsk(appServer, w.mover, { title: "確認", questions: [{ id: "c", label: "選択", type: "single", options, default: "o0" }] });
      await expect(dialog(page)).toBeVisible();
      await dialog(page).locator("input[type=radio]").first().focus();
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(50);
      }
      const idx = await dialog(page).locator("input[type=radio]").evaluateAll((els) => els.findIndex((e) => (e as HTMLInputElement).checked));
      console.log(`MEASURE ask-radio face=${face} gap=50ms pressed=8 reached=${idx}`);
      // 落とす面では、戻すまでの間のキーが失われうる（docs の限界。再レビューの実測で 6/8 の回があった）。無害な面は 1 つも失わない。
      expect(idx).toBeGreaterThanOrEqual(face === "drop300" ? 5 : 8);
      await page.keyboard.press("Escape");
      await run.done;
    });

    test("tab のドラッグ: 最後まで行え、並べ替わる", async ({ page, appServer }) => {
      await boot(page, appServer, face, { twoTabs: true });
      const t1 = page.locator(".tab-bar-item", { hasText: "t1" });
      const t2 = page.locator(".tab-bar-item", { hasText: "t2" });
      const b2 = await box(t2);
      await drag(page, await center(t1), { x: b2.x + b2.width * 0.8, y: b2.y + b2.height / 2 });
      await expect.poll(() => page.locator(".tab-bar-item .tab-bar-label").allTextContents()).toEqual(["t2", "t1"]);
    });

    test("pane の名前のドラッグ: 別の pane の縁へ落として並びが替わる", async ({ page, appServer }) => {
      const w = await boot(page, appServer, face);
      const name = page.locator(".pane-frame-name", { hasText: "mover" });
      const other = page.locator(`[data-pane-id="${w.other}"]`);
      const xOf = async (id: string) => (await box(page.locator(`[data-pane-id="${id}"]`))).x;
      expect(await xOf(w.mover)).toBeLessThan(await xOf(w.other));
      const o = await box(other);
      await drag(page, await center(name), { x: o.x + o.width - 4, y: o.y + o.height / 2 });
      await expect.poll(async () => (await xOf(w.mover)) > (await xOf(w.other))).toBe(true);
    });

    test("pane の名前のドラッグ: サイドバーの落とせる行へ落とすと移る", async ({ page, appServer }) => {
      const w = await boot(page, appServer, face);
      const name = page.locator(".pane-frame-name", { hasText: "mover" });
      const row = page.locator(`.sidebar-spaces .sidebar-row[data-drop-workspace-id="${w.ws.b}"]`);
      await drag(page, await center(name), await center(row));
      await expect(row).toHaveAttribute("aria-current", "true");
      await expect(page.locator(".pane-frame-name", { hasText: "mover" })).toBeVisible();
    });

    test("つまみのドラッグ: パネルの幅・pane の間の境目・サイドバーの幅が、最後まで動かせる", async ({ page, appServer }) => {
      await boot(page, appServer, face);
      const widthOf = async (sel: string) => (await box(page.locator(sel).first())).width;
      const panelBefore = await widthOf("[data-pane-panel]");
      const handle = page.locator("[data-pane-panel-resize]");
      const h = await center(handle);
      await drag(page, h, { x: h.x + 40, y: h.y }); // パネルは pane の右側。右へ引くと狭くなる
      await expect.poll(() => widthOf("[data-pane-panel]")).toBeLessThan(panelBefore - 20);
      const sbBefore = await widthOf(".sidebar");
      const d = await center(page.locator(".sidebar-divider"));
      await drag(page, d, { x: d.x + 50, y: d.y });
      await expect.poll(() => widthOf(".sidebar")).toBeGreaterThan(sbBefore + 20);
      const paneBefore = await widthOf(".terminal-pane");
      const s = await center(page.locator(".splitter").first());
      await drag(page, s, { x: s.x + 60, y: s.y });
      await expect.poll(() => widthOf(".terminal-pane")).toBeGreaterThan(paneBefore + 20);
    });

    test("名前の変更（入力欄）: 打った文字が欄に入り、端末へ漏れない。決定で変わる", async ({ page, appServer }) => {
      const w = await boot(page, appServer, face);
      await focusTerminal(page);
      await prefixKey(page, "W");
      const dlg = page.locator(".name-dialog");
      await expect(dlg).toBeVisible();
      const n = w.input().length;
      const field = dlg.locator(".name-dialog-input");
      await field.fill("");
      await page.keyboard.type("renamed", { delay: 120 });
      await holds(page, () => !!document.querySelector(".name-dialog")?.contains(document.activeElement));
      await expect(field).toHaveValue("renamed");
      expect(w.input().slice(n).map((i) => i.text).join("")).not.toContain("renamed");
      await page.keyboard.press("Enter");
      await expect(dlg).toBeHidden();
      await expect(page.locator(".sidebar-spaces .sidebar-row", { hasText: "renamed" })).toHaveCount(1);
    });

    test("右クリックのメニューのキー操作: 開いたまま、矢印で項目へ移り、Enter で実行される", async ({ page, appServer }) => {
      const w = await boot(page, appServer, face);
      await focusTerminal(page);
      await page.locator(`[data-pane-id="${w.other}"] .terminal-pane, .terminal-pane`).first().click({ button: "right" });
      const menu = page.locator(".context-menu");
      await expect(menu).toBeVisible();
      await holds(page, () => !!document.querySelector(".context-menu")?.contains(document.activeElement));
      const before = await page.locator(".terminal-pane").count();
      const active = (): Promise<string> => page.evaluate(() => document.querySelector(".context-menu-active")?.textContent?.trim() ?? "");
      for (let i = 0; i < 12 && (await active()) !== "右へ分割"; i++) await page.keyboard.press("ArrowDown");
      expect(await active()).toBe("右へ分割");
      await page.keyboard.press("Enter");
      await expect(page.locator(".terminal-pane")).toHaveCount(before + 1);
    });

    test("キー一覧: 開いたまま保たれ、Esc で閉じて端末へ戻る", async ({ page, appServer }) => {
      await boot(page, appServer, face);
      await focusTerminal(page);
      await prefixKey(page, "?");
      const help = page.locator("dialog.help-dialog");
      await expect(help).toHaveAttribute("open", "");
      await holds(page, () => !!document.querySelector("dialog.help-dialog")?.contains(document.activeElement));
      await page.keyboard.press("Escape");
      await expect(help).not.toHaveAttribute("open", "");
      await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe("TEXTAREA");
    });

    test("copy モードの検索: 検索語が検索欄に入り、該当行を取れる", async ({ page, context, appServer }) => {
      const w = await boot(page, appServer, face);
      await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: appServer.origin });
      await w.client.request("pane.subscribe", { paneId: w.mover, scrollbackLines: 4000 });
      await focusTerminal(page);
      const needle = `QZ${Date.now() % 100000}`;
      // 準備はテストのクライアントから打つ（落とす面の脱落の隙間にキーを落とさないため）
      w.client.sendInput(w.mover, `for i in $(seq 1 40); do echo f_$i; done; echo ${needle}; for i in $(seq 41 80); do echo f_$i; done\n`);
      await w.client.waitForOutput(w.mover, "f_80");
      await page.waitForTimeout(300);
      await prefixKey(page, "[");
      await page.keyboard.press("?");
      await page.keyboard.type(needle, { delay: 60 });
      await page.keyboard.press("Enter");
      await page.waitForTimeout(500);
      await page.keyboard.press("V");
      await page.keyboard.press("y");
      await page.waitForTimeout(300);
      expect((await page.evaluate(() => navigator.clipboard.readText())).trim()).toBe(needle);
    });
  });
}
