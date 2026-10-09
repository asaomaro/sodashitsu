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
  // 戻しが 10 秒に 5 回数えられると出る知らせ（`focusDrop.ts` の `FOCUS_DROP_NOTICE_COUNT`）が出ていない＝切り替えのたびにフォーカスが脱落して数えられた、ということが無い
  await expect(page.getByText(/入力のフォーカスを繰り返し外しています/)).toHaveCount(0);
  ev.kill();
});

// --- PR1b（20261008-graph-first）で足した検証: 主な領域の画面 --------------------------------------------------------------------------

/** ブラウザが送った `client.view`（`visible` の有無を問わず）の数。大きさの申告が送り直されていないことを数で見る。 */
async function watchAllClientViews(page: Page): Promise<{ count: () => number }> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  let count = 0;
  cdp.on("Network.webSocketFrameSent", (e) => {
    if (e.response.opcode !== 1) return;
    try {
      const msg = JSON.parse(e.response.payloadData) as { method?: string };
      if (msg.method === "client.view") count++;
    } catch {
      // JSON でないテキストは無視する
    }
  });
  return { count: () => count };
}

const baseScreen = (page: Page) => page.locator('[data-screen="base"]');
/** サイドバーの中でフォーカスできるボタン（workspace の行は tabindex を持たない）。 */
const sidebarButton = (page: Page) => page.locator(".sidebar button.sidebar-btn").first();
const switcherBtn = (page: Page, id: "base" | "graph") => page.locator(`[data-screen-id="${id}"]`);
const paneBoxes = (page: Page) => page.locator(".pane-frame").evaluateAll((els) => els.map((e) => {
  const r = e.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
}));

test("画面を切り替えても、client.view は送られず、PTY の大きさ・pane の箱は変わらない。基本画面は描かれたまま見えず、押せない（AC-S7・D11）", async ({ page, appServer }) => {
  const { client, p1, p2, views: shownViews } = await setup(page, appServer);
  const views = await watchAllClientViews(page); // 開いた後に送られる分を数える（起動の申告は含まない）
  await page.waitForTimeout(800); // 起動直後の申告が落ち着くまで
  const sizes0 = { p1: client.paneSize(p1), p2: client.paneSize(p2) };
  expect(sizes0.p1).toBeDefined();
  const boxes0 = await paneBoxes(page);
  const count0 = views.count();
  for (let i = 0; i < 3; i++) {
    // キーで
    await openByKey(page);
    expect(await baseScreen(page).evaluate((el) => ({ inert: el.hasAttribute("inert"), visibility: getComputedStyle(el).visibility, display: getComputedStyle(el).display }))).toEqual({ inert: true, visibility: "hidden", display: "block" });
    expect(await paneBoxes(page)).toEqual(boxes0); // 隠れていても箱は同じ（0×0 にならない）
    await expect(page.locator(".xterm-helper-textarea")).toHaveCount(2); // 描かれたまま
    await prefixKey(page, "a");
    await expect(graphView(page)).toBeHidden();
    // 切り替えの部品で
    await switcherBtn(page, "graph").click();
    await expect(graphView(page)).toBeVisible();
    await switcherBtn(page, "base").click();
    await expect(graphView(page)).toBeHidden();
  }
  await page.waitForTimeout(600); // 遅れて送られる申告を巻き込む
  expect(views.count(), "切り替えで client.view が送られていない").toBe(count0);
  expect(await paneBoxes(page)).toEqual(boxes0);
  expect({ p1: client.paneSize(p1), p2: client.paneSize(p2) }).toEqual(sizes0);
  // 申告の中身も、2 つの pane が表示のまま（1×1 になっていない）
  const last = shownViews.latest();
  expect(last?.visible.length).toBe(2);
  for (const v of last!.visible) expect(v.cols).toBeGreaterThan(10);
});

test("グラフの画面にもサイドバーが出て、操作できる（workspace を選び直す）。基本画面へは切り替わらない。戻ると選んだ workspace が出る（AC-S1・AC-S3）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const cwd = process.cwd();
  await client.request("workspace.create", { cwd, label: "wsB" });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  const rows = page.locator(".sidebar-spaces .sidebar-row");
  await expect(rows).toHaveCount(2);
  await focusTerminal(page);
  await openByKey(page);
  // サイドバーは見えていて、押せる（グラフの面に隠れていない）
  await expect(page.locator(".sidebar")).toBeVisible();
  const row = rows.filter({ hasText: "wsB" });
  await expect(row).toBeVisible();
  const hit = await row.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return t !== null && el.contains(t);
  });
  expect(hit).toBe(true);
  await row.click();
  await expect(graphView(page)).toBeVisible(); // 基本画面へ切り替わらない
  await expect(rows.filter({ hasText: "wsB" })).toHaveClass(/sidebar-row-current/);
  // グラフの面に戻ると、グラフのキーが働く（フォーカスはサイドバーの行にある間は働かない）
  await graphView(page).locator("[data-node-key]").first().focus();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(graphView(page)).toBeHidden();
  // 基本画面に、選んだ workspace の pane が出ている
  await expect(rows.filter({ hasText: "wsB" })).toHaveClass(/sidebar-row-current/);
  await expect(page.locator(".xterm-helper-textarea")).toHaveCount(1);
  await expect.poll(() => activeIsTerminal(page)).toBe(true);
});

test("切り替えの部品: 押すとグラフの面（フォーカスはグラフの中）／基本画面（フォーカスは端末）へ。選んでいる pane は保たれる", async ({ page, appServer }) => {
  const { p2, input } = await setup(page, appServer);
  await page.locator(".xterm-helper-textarea").nth(1).focus();
  await switcherBtn(page, "graph").click();
  await expect(graphView(page)).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest(".graph-view") !== null)).toBe(true);
  await expect(switcherBtn(page, "graph")).toHaveAttribute("aria-pressed", "true");
  await switcherBtn(page, "base").click();
  await expect(graphView(page)).toBeHidden();
  await expect.poll(() => activeIsTerminal(page)).toBe(true);
  const before = input().length;
  await page.keyboard.type("Z");
  await expect.poll(() => input().slice(before).map((i) => `${i.paneId}:${i.text}`).join("")).toContain(`${p2}:Z`); // 2 つ目の pane のまま
});

test("グラフの面の外（サイドバー）にフォーカスがあるときは prefix+a で基本画面へ戻れる。ノードを開いて「pane へ」で基本画面のその pane へ", async ({ page, appServer }) => {
  const { p1, p2, input } = await setup(page, appServer);
  await openByKey(page);
  await page.locator(".sidebar-spaces .sidebar-row").first().focus(); // サイドバーにフォーカス
  await prefixKey(page, "a");
  await expect(graphView(page)).toBeHidden();
  // ノードの［pane へ］
  await openByKey(page);
  const goto = node(page, p2).locator(".graph-node-goto");
  await node(page, p2).hover();
  await goto.click({ force: true });
  await expect(graphView(page)).toBeHidden();
  await expect.poll(() => activeIsTerminal(page)).toBe(true);
  const before = input().length;
  await page.keyboard.type("Q");
  await expect.poll(() => input().slice(before).map((i) => `${i.paneId}:${i.text}`).join("")).toContain(`${p2}:Q`);
  expect(p1).not.toBe(p2);
});

test("窓を狭めてモバイル（1 列）の画面になると基本画面へ戻り、グラフは重ねるダイアログのまま。広げても開き直さない", async ({ page, appServer }) => {
  await setup(page, appServer);
  await openByKey(page);
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(page.locator(".mobile-shell")).toBeVisible();
  await expect(page.locator(".sidebar")).toHaveCount(0);
  await expect(graphView(page)).toBeHidden(); // 画面は基本画面へ戻っている
  // 1 列のグラフ: 重ねる dialog
  await page.locator(".mobile-shell-graph-btn").click();
  const dlg = page.locator("dialog.graph-dialog");
  await expect(dlg).toHaveAttribute("open", "");
  await expect(dlg.locator(".graph-toolbar")).toBeVisible();
  await dlg.locator(".graph-close").click();
  await expect(dlg).not.toHaveAttribute("open", "");
  // 広げると、サイドバーのある画面（基本画面）に戻る。グラフは開き直さない
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(graphView(page)).toBeHidden();
});

test("スクリプトの面を載せた状態で、切り替え・サイドバーの操作・ask のダイアログをくり返しても、フォーカスの脱落が数えられない（面が止まらない）", async ({ page, appServer }) => {
  await enableScript(appServer);
  const { p1 } = await setup(page, appServer);
  const ev = await runDisplay(appServer, p1, ["events", "g"]);
  expect((await ev.nextLine())["type"]).toBe("display.ready");
  await setScriptOk(appServer, p1, "g", `<!doctype html><body><p id=x>ok</p></body>`);
  await expect(scriptFrameEl(page)).toHaveCount(1);
  await focusTerminal(page);
  const row = page.locator(".sidebar-spaces .sidebar-row").first();
  for (let i = 0; i < 6; i++) {
    await switcherBtn(page, "graph").click();
    await expect(graphView(page)).toBeVisible();
    await row.click(); // サイドバーの操作
    await expect(graphView(page)).toBeVisible();
    const run = await runAsk(appServer, p1, { title: "確認", questions: [{ id: "a", label: "どれ", options: ["x", "y"] }] });
    await expect(askDialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await run.done;
    await expect(askDialog(page)).toBeHidden();
    await switcherBtn(page, "base").click();
    await expect(graphView(page)).toBeHidden();
    await expect.poll(() => activeIsTerminal(page)).toBe(true);
  }
  await page.waitForTimeout(3500);
  await expect(scriptFrameEl(page)).toHaveCount(1);
  await expect(page.getByText(/キー入力を取ろうとし続けたので閉じました/)).toHaveCount(0);
  await expect(page.getByText(/入力のフォーカスを繰り返し外しています/)).toHaveCount(0);
  ev.kill();
});

// 画面の見た目の確認用（結果に載せるスクリーンショット）。`GRAPH_SHOTS_DIR` を渡したときだけ撮る。
/** 画面の store（pinia）の `view.toast` を呼ぶ（トーストを出す手段。利用者の操作では出しにくい）。 */
async function toastFromStore(page: Page, message: string): Promise<void> {
  await page.evaluate((m) => {
    const pinia = (document.querySelector("#app") as unknown as { __vue_app__: { config: { globalProperties: { $pinia: { _s: Map<string, { toast(msg: string): void }> } } } } }).__vue_app__.config.globalProperties.$pinia;
    pinia._s.get("view")!.toast(m);
  }, message);
}

test("デスクトップで起動して窓を狭めた後に 1 列のグラフを開いても、例外にならず、トーストは dialog の中に出る（レビュー指摘 1）", async ({ page, appServer }) => {
  await setup(page, appServer);
  const errors: string[] = []; // 読み込みが済んでから（最初の認証前の 401 を数えない）
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.setViewportSize({ width: 700, height: 800 });
  await expect(page.locator(".mobile-shell")).toBeVisible();
  await page.locator(".mobile-shell-graph-btn").click();
  const dlg = page.locator("dialog#soda-graph-dialog");
  await expect(dlg).toHaveAttribute("open", "");
  await toastFromStore(page, "TOASTMSG");
  // トーストは top layer の dialog の中（外だと隠れて inert）
  await expect(dlg.locator(".toast-list")).toContainText("TOASTMSG");
  expect(await page.locator(".toast-list").count()).toBe(1);
  expect(errors, "console / pageerror にエラーが出ていない").toEqual([]);
});

test("たたんだサイドバーでも、画面の切り替えのボタンは潰れず、文字が読める高さがある（レビュー指摘 2）", async ({ page, appServer }) => {
  await setup(page, appServer);
  await prefixKey(page, "b"); // サイドバーをたたむ
  await expect(page.locator(".sidebar-collapsed")).toBeVisible();
  for (const id of ["base", "graph"] as const) {
    const box = await switcherBtn(page, id).boundingBox();
    expect(box?.height ?? 0, `${id} のボタンの高さ`).toBeGreaterThan(14);
  }
});

test("グラフの画面の間、グラフの面の外（body・サイドバー）の prefix のキーは、見えない基本画面を変えない。画面の切り替えと設定は働く（レビュー指摘 3）", async ({ page, appServer }) => {
  const { input } = await setup(page, appServer);
  await openByKey(page);
  const tabs = page.locator(".tab-bar-item");
  const panes = page.locator(".xterm-helper-textarea");
  const tabCount = await tabs.count();
  await expect(panes).toHaveCount(2);
  const toBody = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const toSidebar = async () => {
    await sidebarButton(page).focus();
    await expect.poll(() => page.evaluate(() => document.activeElement?.closest(".sidebar") != null)).toBe(true);
  };
  for (const place of [toBody, toSidebar]) {
    await place();
    const before = input().length;
    for (const k of ["c", "x", "v", "-", "z"]) {
      await prefixKey(page, k);
      await page.waitForTimeout(150);
      await expect(page.locator("dialog[open]"), `prefix+${k} で何も開かない`).toHaveCount(0);
      await expect(tabs).toHaveCount(tabCount);
      await expect(panes).toHaveCount(2);
    }
    await page.keyboard.press("Control+b"); // prefix の二度押し（端末へ prefix の列を送る操作）
    await page.keyboard.press("Control+b");
    await page.waitForTimeout(150);
    expect(input().length, "端末へ何も届かない").toBe(before);
    await expect(graphView(page)).toBeVisible();
  }
  // 働くもの: 設定（prefix+s）・画面の切り替え（prefix+a）
  await toBody();
  await prefixKey(page, "s");
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await toBody();
  await prefixKey(page, "a");
  await expect(graphView(page)).toBeHidden();
  // 基本画面に戻れば、同じキーは効く（絞りは画面の間だけ）
  await focusTerminal(page);
  await prefixKey(page, "x");
  await expect(panes).toHaveCount(1);
});

test("グラフの画面で、サイドバーの行を押した・navigate で選んだ後は、フォーカスがグラフの面へ戻り、Esc が効く（レビュー指摘 4）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  await client.request("workspace.create", { cwd: process.cwd(), label: "wsB" });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  const rows = page.locator(".sidebar-spaces .sidebar-row");
  await expect(rows).toHaveCount(2);
  await focusTerminal(page);
  const inGraph = () => page.evaluate(() => document.activeElement?.closest(".graph-view") != null);
  const escToBase = async () => {
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(graphView(page)).toBeHidden();
  };
  // 行を押す
  await openByKey(page);
  await rows.filter({ hasText: "wsB" }).click();
  await expect(rows.filter({ hasText: "wsB" })).toHaveClass(/sidebar-row-current/);
  await expect.poll(inGraph).toBe(true);
  await escToBase();
  // 選んでいない行を押す
  await openByKey(page);
  await rows.filter({ hasNotText: "wsB" }).click();
  await expect(rows.filter({ hasNotText: "wsB" })).toHaveClass(/sidebar-row-current/);
  await expect.poll(inGraph).toBe(true);
  await escToBase();
  // navigate（prefix+w → 移動 → Enter）
  await openByKey(page);
  await expect(graphView(page).locator("[data-node-key]:focus")).toHaveCount(1); // 開いた直後のフォーカスが落ち着いてから
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()); // body から（ボタンは Enter を自分で扱う）
  await prefixKey(page, "w");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  await expect.poll(inGraph).toBe(true);
  await escToBase();
});

test("スクリーンショット: グラフの画面にサイドバーが出ている（暗い・明るい）", async ({ browser, appServer }) => {
  const dir = process.env["GRAPH_SHOTS_DIR"];
  test.skip(dir === undefined, "GRAPH_SHOTS_DIR を渡したときだけ撮る");
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  const cwd = process.cwd();
  await client.request("workspace.create", { cwd, label: "wsB" });
  await client.request("pane.split", { paneId: p1, direction: "right" });
  for (const scheme of ["dark", "light"] as const) {
    await client.request("prefs.set", { patch: { theme: scheme === "light" ? "catppuccin-latte" : "dracula" } });
    const context = await browser.newContext({ colorScheme: scheme, viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
    await page.keyboard.press("Control+b");
    await page.keyboard.press("a");
    await expect(graphView(page)).toBeVisible();
    await expect(graphView(page).locator("[data-node-key]").first()).toBeVisible();
    // 最初の案内のトースト（押すと消える）を消してから撮る
    await page.evaluate(() => document.querySelectorAll<HTMLElement>(".toast-list .toast").forEach((t) => t.click()));
    await expect(page.locator(".toast-list .toast")).toHaveCount(0);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/graph-screen-${scheme}.png` });
    await context.close();
  }
});
