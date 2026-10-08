import type { Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { runAsk } from "../support/ask.js";
import { dialog as askDialog } from "../support/askForm.js";
import { watchAskSubscriptions } from "../support/ask.js";
import { runDisplay } from "../support/display.js";
import { enableScript, focusTerminal, scriptFrameEl, setScriptOk } from "../support/displayScript.js";
import { expect, test } from "../support/fixtures.js";
import { watchSentInput } from "../support/frames.js";
import { prefixKey } from "../support/keys.js";
import { watchClientViews } from "../support/panes.js";

/**
 * グラフの画面（20261008-graph-first の PR1b。T10a「いまの動きを固定する」）。**重ねるダイアログだった時の動き**を先に固定し、主な領域の画面へ作り替えた後も同じ期待で通す
 * （直した所は結果に一覧で書く）。判定は利用者が見る場所（DOM・フォーカス・箱）と、ブラウザが送ったフレーム（CDP）で行う（条項 `e2e-observe-browser`）。
 * テスト自身のクライアントは、前提（pane を足す・サーバの状態の確認）にだけ使う。
 */

/** グラフの画面の根。 */
const graphView = (page: Page) => page.locator(".graph-view");
const node = (page: Page, paneId: string) => graphView(page).locator(`[data-node-key="local:${paneId}"]`);

/** 2 つの pane（右に分割）を作り、ブラウザを開いて、端末にフォーカスを置く。 */
async function setup(page: Page, appServer: AppServer) {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  const created = client.waitForEvent("pane.created", (e) => e.data.pane.id !== p1);
  await client.request("pane.split", { paneId: p1, direction: "right" });
  const p2 = (await created).data.pane.id;
  const input = await watchSentInput(page);
  const views = await watchClientViews(page);
  const subs = await watchAskSubscriptions(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await subs.waitFor(1);
  await expect(page.locator(".xterm-helper-textarea")).toHaveCount(2);
  await focusTerminal(page);
  return { client, p1, p2, input, views };
}

/** 焦点のある pane の id（DOM の順で何番目か。pane の箱に `data-pane-id` が無いので順で見る）。 */
const activeIsTerminal = (page: Page) => page.evaluate(() => document.activeElement?.classList.contains("xterm-helper-textarea") ?? false);

async function openByKey(page: Page) {
  await prefixKey(page, "a");
  await expect(graphView(page)).toBeVisible();
}

/**
 * Esc で閉じる。Esc は 1 段ずつ戻る（ノードの選択 → 画面）。開いた直後は開く前の pane のノードにフォーカスが移って選ばれているので、
 * 1 回目は選択を外すだけで画面は開いたまま、2 回目で閉じる。
 */
async function closeByEsc(page: Page) {
  await expect(graphView(page).locator("[data-node-key]:focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(graphView(page).locator("[data-node-key]:focus")).toHaveCount(0);
  await expect(graphView(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(graphView(page)).toBeHidden();
}

test("開く（prefix+a）: ノードが 2 つ出る。Esc・×・prefix+a のどれでも閉じる。閉じたら開く前の端末にフォーカスが戻る", async ({ page, appServer }) => {
  const { p1, p2 } = await setup(page, appServer);
  await openByKey(page);
  await expect(node(page, p1)).toBeVisible();
  await expect(node(page, p2)).toBeVisible();
  // Esc
  await closeByEsc(page);
  await expect.poll(() => activeIsTerminal(page)).toBe(true);
  // ×
  await openByKey(page);
  await graphView(page).locator(".graph-close").click();
  await expect(graphView(page)).toBeHidden();
  await expect.poll(() => activeIsTerminal(page)).toBe(true);
  // もう一度 prefix+a
  await openByKey(page);
  await prefixKey(page, "a");
  await expect(graphView(page)).toBeHidden();
  await expect.poll(() => activeIsTerminal(page)).toBe(true);
});

test("開く（右クリックのメニュー「連携（グラフ）」）", async ({ page, appServer }) => {
  await setup(page, appServer);
  // どこにも属さない全体のメニュー: サイドバーの［メニュー］ボタン
  await page.locator(".sidebar-btn-right").click();
  await page.getByRole("menuitem", { name: "連携（グラフ）" }).click();
  await expect(graphView(page)).toBeVisible();
  await closeByEsc(page);
});

test("閉じた後に、開く前に焦点のあった pane（2 つ目）へフォーカスが戻る", async ({ page, appServer }) => {
  const { p2, input } = await setup(page, appServer);
  // 焦点を 2 つ目の pane へ（クリック）。そこで開いて閉じても、2 つ目のまま。
  await page.locator(".xterm-helper-textarea").nth(1).focus();
  await page.keyboard.type("A");
  await expect.poll(() => input().filter((i) => i.paneId === p2).map((i) => i.text).join("")).toContain("A");
  await openByKey(page);
  await closeByEsc(page);
  const before = input().length;
  await page.keyboard.type("B");
  await expect.poll(() => input().slice(before).map((i) => `${i.paneId}:${i.text}`).join("")).toContain(`${p2}:B`);
});

test("ノードを押すと選ばれる。ドラッグで位置が変わり、サーバに保存される。線を結べる", async ({ page, appServer }) => {
  const { client, p1, p2 } = await setup(page, appServer);
  await openByKey(page);
  const n1 = node(page, p1);
  const n2 = node(page, p2);
  await expect(n1).toBeVisible();
  // 選択: 開いた直後は開く前の pane のノードが選ばれている。もう一方を押すと、そちらに移る
  const initiallySelected = (await n1.getAttribute("class"))!.includes("graph-node-selected") ? n1 : n2;
  const other = initiallySelected === n1 ? n2 : n1;
  await expect(initiallySelected).toHaveClass(/graph-node-selected/);
  const ob = (await other.boundingBox())!;
  await page.mouse.click(ob.x + 30, ob.y + 8);
  await expect(other).toHaveClass(/graph-node-selected/);
  await expect(initiallySelected).not.toHaveClass(/graph-node-selected/);
  const b1 = (await n1.boundingBox())!;
  // ドラッグ
  const posOf = async () => {
    const g = await client.request("graph.get", {});
    const n = g.nodes.find((x) => x.key === `local:${p1}`)!;
    return { x: n.x, y: n.y };
  };
  const before = await posOf();
  const rev0 = (await client.request("graph.get", {})).rev;
  await page.mouse.move(b1.x + 30, b1.y + 8);
  await page.mouse.down();
  await page.mouse.move(b1.x + 30 + 120, b1.y + 8 + 80, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await client.request("graph.get", {})).rev).toBeGreaterThan(rev0);
  const after = await posOf();
  expect(after).not.toEqual(before);
  // 線を結ぶ（ハンドルから別のノードへドラッグ → 設定のパネル → 保存）
  const h = (await n1.locator(".graph-node-handle").boundingBox())!;
  const b2 = (await n2.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(b2.x + 40, b2.y + 30, { steps: 8 });
  await page.mouse.up();
  const panel = graphView(page).locator(".link-panel");
  await expect(panel).toBeVisible();
  await panel.locator('input[type="radio"][value="supervise"]').check();
  await panel.locator(".link-panel-save").click();
  await expect.poll(async () => (await client.request("graph.get", {})).links.length).toBe(1);
  await expect(graphView(page).locator(".graph-chip")).toHaveCount(1);
});

test("開いている間のキーは端末へ届かない（文字・Enter）。閉じた後は届く", async ({ page, appServer }) => {
  const { input } = await setup(page, appServer);
  await openByKey(page);
  const before = input().length;
  await page.keyboard.type("hello");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  expect(input().slice(before)).toEqual([]);
  await page.keyboard.press("Escape"); // 選択を外す
  await page.keyboard.press("Escape");
  await expect(graphView(page)).toBeHidden();
  const b2 = input().length;
  await page.keyboard.type("back");
  await expect.poll(() => input().slice(b2).map((i) => i.text).join("")).toContain("back");
});

test("sodactl ask のダイアログはグラフの上に出る。閉じるとグラフへ戻る（グラフは開いたまま）", async ({ page, appServer }) => {
  const { p1, input } = await setup(page, appServer);
  await openByKey(page);
  const run = await runAsk(appServer, p1, { title: "確認", questions: [{ id: "a", label: "どれ", options: ["x", "y"] }] });
  await expect(askDialog(page)).toBeVisible();
  // ダイアログがグラフより手前（最上位）にある
  const onTop = await page.evaluate(() => {
    const d = document.querySelector("dialog#soda-ask-dialog");
    const r = d!.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 20);
    return hit !== null && d!.contains(hit);
  });
  expect(onTop).toBe(true);
  const before = input().length;
  await page.keyboard.press("Escape"); // 取り消し
  await run.done;
  await expect(askDialog(page)).toBeHidden();
  await expect(graphView(page)).toBeVisible(); // グラフへ戻る（グラフは閉じていない）
  await page.waitForTimeout(300);
  expect(input().slice(before)).toEqual([]); // 質問の間もグラフに戻った後も、端末へキーは届いていない
  // グラフのキーが働く（フォーカスがグラフの中にある）。ノードの選択は外れて（Esc 1 回）、画面が閉じる（2 回目）
  await page.keyboard.press("Escape");
  await expect(graphView(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(graphView(page)).toBeHidden();
});

test("スクリプトの面（script-html）を載せた pane がある状態で、開閉を 10 回くり返しても面は止まらない（フォーカスの脱落が数えられない）", async ({ page, appServer }) => {
  await enableScript(appServer);
  const { p1 } = await setup(page, appServer);
  const ev = await runDisplay(appServer, p1, ["events", "g"]);
  expect((await ev.nextLine())["type"]).toBe("display.ready");
  await setScriptOk(appServer, p1, "g", `<!doctype html><body><p id=x>ok</p></body>`);
  await expect(scriptFrameEl(page)).toHaveCount(1);
  await focusTerminal(page);
  for (let i = 0; i < 10; i++) {
    await openByKey(page);
    await closeByEsc(page);
    await expect.poll(() => activeIsTerminal(page)).toBe(true);
  }
  // 見回りは 3 秒に 15 回で止める。落ち着くまで待ってから、面が居て、閉じる知らせが出ていないことを見る。
  await page.waitForTimeout(3500);
  await expect(scriptFrameEl(page)).toHaveCount(1);
  await expect(page.getByText(/キー入力を取ろうとし続けたので閉じました/)).toHaveCount(0);
  ev.kill();
});
