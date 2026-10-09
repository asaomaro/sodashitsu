import type { Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { watchAskSubscriptions } from "../support/ask.js";
import { enableScript, setScriptOk } from "../support/displayScript.js";
import { expect, test } from "../support/fixtures.js";
import { watchSentInput } from "../support/frames.js";
import { grantClipboard, prefixKey } from "../support/keys.js";
import { watchClientViews } from "../support/panes.js";

/**
 * グラフの上の端末の窓の続き（20261008-graph-first の PR2b。T18e）。3 つまでの窓・留める・位置と大きさの記憶・8 つの縁と角・キーボード。
 * 判定は利用者が見る場所（DOM・フォーカス・箱・ブラウザが送ったフレーム）で行う（条項 `e2e-observe-browser`）。端末の中身は WebGL（canvas）なので、copy モード→クリップボードで読む。
 * テスト自身のクライアントは、前提（pane を足す）とサーバの状態（PTY の大きさ・直結が残っていないか）の確認にだけ使う。
 */
const graphView = (page: Page) => page.locator(".graph-view");
const win = (page: Page, paneId: string) => page.locator(`[data-graph-terminal-window][data-pane-id="${paneId}"]`);
const anyWin = (page: Page) => page.locator("[data-graph-terminal-window]");
const node = (page: Page, paneId: string) => graphView(page).locator(`[data-node-key="local:${paneId}"]`);

/** 4 つの pane（p1〜p4）を作り、ブラウザを開いて、このブラウザが tab のサイズ権限を取る。 */
async function setup(page: Page, appServer: AppServer) {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  const ids = [p1];
  for (let i = 0; i < 3; i++) {
    const created = client.waitForEvent("pane.created", (e) => !ids.includes(e.data.pane.id));
    await client.request("pane.split", { paneId: ids[ids.length - 1]!, direction: "right" });
    ids.push((await created).data.pane.id);
  }
  const input = await watchSentInput(page);
  const views = await watchClientViews(page);
  const subs = await watchAskSubscriptions(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await subs.waitFor(1);
  await expect(page.locator(".xterm-helper-textarea")).toHaveCount(4);
  await page.locator(".xterm-helper-textarea").first().focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => views.latest()?.visible.length).toBe(4);
  return { client, ids, input, views };
}

async function openGraph(page: Page) {
  await prefixKey(page, "a");
  await expect(graphView(page)).toBeVisible();
}

/** ノードを選んで Enter（窓が邪魔でノードを押せないときも使える）。 */
async function openByKey(page: Page, paneId: string) {
  await node(page, paneId).focus();
  await page.keyboard.press("Enter");
}

const pinOf = (page: Page, paneId: string) => win(page, paneId).locator("[data-graph-terminal-pin]");
/** ボタンを、フォーカスして Enter で押す（窓どうしが重なっていて、ポインタでは押せないことがあるため）。 */
async function press(page: Page, button: ReturnType<typeof pinOf>) {
  await button.focus();
  await page.keyboard.press("Enter");
}
async function openPinned(page: Page, paneId: string) {
  await openByKey(page, paneId);
  await expect(win(page, paneId)).toHaveAttribute("data-status", "attached");
  await press(page, pinOf(page, paneId));
  await expect(win(page, paneId)).toHaveAttribute("data-pinned", "1");
}

const textareaOf = (page: Page, paneId: string) => win(page, paneId).locator(".xterm-helper-textarea");
const sentTo = (input: () => { paneId: string; text: string }[], paneId: string, from = 0): string => input().slice(from).filter((i) => i.paneId === paneId).map((i) => i.text).join("");

async function expectFree(appServer: AppServer, paneId: string) {
  await expect
    .poll(async () => {
      const other = await appServer.openClient();
      try {
        await other.request("pane.attach", { paneId, cols: 33, rows: 11 });
        await other.request("pane.detach", { paneId });
        return "free";
      } catch {
        return "held";
      } finally {
        other.close();
      }
    })
    .toBe("free");
}

async function readLineContaining(page: Page, text: string): Promise<string> {
  await prefixKey(page, "[");
  await page.keyboard.press("?");
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  await page.keyboard.press("V");
  await page.keyboard.press("y");
  await page.waitForTimeout(200);
  return page.evaluate(() => navigator.clipboard.readText());
}

const activeIsBody = (page: Page) => page.evaluate(() => document.activeElement === document.body);

test("3 つの窓を開いて、それぞれで打った文字が、それぞれの pane に届く。窓は別々の直結", async ({ page, appServer }) => {
  const { client, ids, input } = await setup(page, appServer);
  const [p1, p2, p3] = ids as [string, string, string];
  await openGraph(page);
  await openPinned(page, p1);
  await openPinned(page, p2);
  await openByKey(page, p3);
  await expect(win(page, p3)).toHaveAttribute("data-status", "attached");
  await expect(anyWin(page)).toHaveCount(3);
  for (const [id, text] of [[p1, "aaa1"], [p2, "bbb2"], [p3, "ccc3"]] as const) {
    await textareaOf(page, id).focus();
    const n = input().length;
    await page.keyboard.type(text);
    await expect.poll(() => sentTo(input, id, n)).toContain(text);
    // ほかの pane には届いていない
    for (const other of [p1, p2, p3].filter((x) => x !== id)) expect(sentTo(input, other, n)).not.toContain(text);
  }
  // それぞれの窓の桁と行が、それぞれの pane の PTY の大きさ
  for (const id of [p1, p2, p3]) {
    const t = (await win(page, id).locator("[data-graph-terminal-size]").innerText()).trim();
    const [c, r] = t.split(" × ").map(Number);
    await expect.poll(() => client.paneSize(id)).toMatchObject({ cols: c, rows: r });
  }
});

test("留めた窓は替わらない。留めていない窓は高々 1 つで、別のノードを押すと中身が替わる。3 つとも留めてあれば、4 つ目は開かず知らせる", async ({ page, appServer }) => {
  const { ids } = await setup(page, appServer);
  const [p1, p2, p3, p4] = ids as [string, string, string, string];
  await openGraph(page);
  await openPinned(page, p1);
  await openByKey(page, p2); // 留めていない窓
  await expect(anyWin(page)).toHaveCount(2);
  await openByKey(page, p3); // p2 の窓の中身が p3 に替わる
  await expect(anyWin(page)).toHaveCount(2);
  await expect(win(page, p2)).toHaveCount(0);
  await expect(win(page, p3)).toHaveAttribute("data-status", "attached");
  await expect(win(page, p1)).toHaveAttribute("data-pinned", "1");
  await press(page, pinOf(page, p3));
  await openPinned(page, p2);
  await expect(anyWin(page)).toHaveCount(3);
  // 4 つ目: 開かずに知らせる
  await openByKey(page, p4);
  await expect(page.getByText("窓は 3 つまでです")).toBeVisible();
  await expect(anyWin(page)).toHaveCount(3);
  await expect(win(page, p4)).toHaveCount(0);
  // 留めを外すと、その窓が「替わる窓」になる
  await press(page, pinOf(page, p3));
  await openByKey(page, p4);
  await expect(win(page, p4)).toHaveAttribute("data-status", "attached");
  await expect(win(page, p3)).toHaveCount(0);
  await expect(anyWin(page)).toHaveCount(3);
});

test("同じ pane は 2 つの窓に出さない（もう一度押すと、その窓が前へ出てフォーカスが入る）", async ({ page, appServer }) => {
  const { ids } = await setup(page, appServer);
  const [p1, p2] = ids as [string, string];
  await openGraph(page);
  await openPinned(page, p1);
  await openPinned(page, p2);
  await openByKey(page, p1);
  await expect(anyWin(page)).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest("[data-graph-terminal-window]")?.getAttribute("data-pane-id"))).toBe(await win(page, p1).getAttribute("data-pane-id"));
  const z = async (id: string) => Number(await win(page, id).evaluate((el) => (el as HTMLElement).style.zIndex));
  expect(await z(p1)).toBeGreaterThan(await z(p2));
});

test("フォーカスのある窓の pane に、copy モードが効く（窓ごとに。サイドバーが別の pane を選んでいても）", async ({ page, appServer, context }) => {
  await grantClipboard(context, appServer.origin);
  const { ids } = await setup(page, appServer);
  const [p1, p2, p3] = ids as [string, string, string];
  await openGraph(page);
  await openPinned(page, p1);
  await openPinned(page, p2);
  for (const [id, marker] of [[p1, "mark-one-p1"], [p2, "mark-two-p2"]] as const) {
    await textareaOf(page, id).focus();
    await page.keyboard.type(`echo ${marker}`);
    await page.keyboard.press("Enter");
  }
  await page.waitForTimeout(600);
  // サイドバーが p3 を選ぶ（窓は p1・p2 のまま）
  await node(page, p3).click({ position: { x: 20, y: 8 }, force: true }).catch(() => undefined);
  for (const [id, marker] of [[p2, "mark-two-p2"], [p1, "mark-one-p1"], [p2, "mark-two-p2"]] as const) {
    await textareaOf(page, id).focus();
    expect(await readLineContaining(page, marker)).toContain(marker);
    await page.keyboard.press("Escape");
  }
});

test("位置と大きさを覚える: 窓を動かして閉じ、同じ pane をもう一度開くと、同じ位置・同じ桁と行で開く（点線は出ない）", async ({ page, appServer }) => {
  const { ids } = await setup(page, appServer);
  const [p1] = ids as [string];
  await openGraph(page);
  await openByKey(page, p1);
  await expect(win(page, p1)).toHaveAttribute("data-status", "attached");
  const grip = win(page, p1).locator("[data-graph-terminal-grip]");
  await grip.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("Alt+Shift+ArrowLeft");
  await page.waitForTimeout(500); // 大きさの変化が、桁と行に反映される（間引き）のを待つ
  const moved = (await win(page, p1).boundingBox())!;
  const size = (await win(page, p1).locator("[data-graph-terminal-size]").innerText()).trim();
  await win(page, p1).locator("[data-graph-terminal-close]").click();
  await expect(anyWin(page)).toHaveCount(0);
  await openByKey(page, p1);
  await expect(win(page, p1)).toHaveAttribute("data-status", "attached");
  // 位置は、余白に対する割合で覚えるので、1px 未満の丸めの差は許す
  await expect.poll(async () => Math.abs((await win(page, p1).boundingBox())!.x - moved.x)).toBeLessThanOrEqual(2);
  const again = (await win(page, p1).boundingBox())!;
  expect(Math.abs(again.y - moved.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(again.width - moved.width)).toBeLessThanOrEqual(2);
  await expect.poll(async () => (await win(page, p1).locator("[data-graph-terminal-size]").innerText()).trim()).toBe(size);
  await expect(page.locator("[data-graph-terminal-link]")).toHaveCount(0);
});

test("再読み込みの後、グラフの画面を開くと、留めた窓だけが開き直る（直結は取り直す）。留めていない窓は開き直さない", async ({ page, appServer }) => {
  const { ids } = await setup(page, appServer);
  const [p1, p2] = ids as [string, string];
  await openGraph(page);
  await openPinned(page, p1);
  await openByKey(page, p2); // 留めていない
  await expect(anyWin(page)).toHaveCount(2);
  await page.reload();
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await expectFree(appServer, p2);
  await openGraph(page);
  await expect(win(page, p1)).toHaveAttribute("data-status", "attached");
  await expect(win(page, p1)).toHaveAttribute("data-pinned", "1");
  await expect(win(page, p2)).toHaveCount(0);
  await expect(anyWin(page)).toHaveCount(1);
});

test("基本画面へ切り替えると、3 つとも直結が残らない。グラフへ戻ると、留めた窓が開き直る。再読み込み・ブラウザを閉じても残らない", async ({ page, appServer }) => {
  const { ids } = await setup(page, appServer);
  const [p1, p2, p3] = ids as [string, string, string];
  await openGraph(page);
  for (const id of [p1, p2, p3]) await openPinned(page, id);
  await expect(anyWin(page)).toHaveCount(3);
  // 窓にフォーカス → prefix+a でグラフの面 → prefix+a で基本画面
  await textareaOf(page, p1).focus();
  await prefixKey(page, "a");
  await prefixKey(page, "a");
  await expect(graphView(page)).toBeHidden();
  await expect(anyWin(page)).toHaveCount(0);
  for (const id of [p1, p2, p3]) await expectFree(appServer, id);
  expect(await activeIsBody(page)).toBe(false);
  // 戻ると開き直す
  await openGraph(page);
  await expect(anyWin(page)).toHaveCount(3);
  for (const id of [p1, p2, p3]) await expect(win(page, id)).toHaveAttribute("data-status", "attached");
  // 1 列の幅
  await page.setViewportSize({ width: 560, height: 800 });
  await expect(anyWin(page)).toHaveCount(0);
  for (const id of [p1, p2, p3]) await expectFree(appServer, id);
  await page.setViewportSize({ width: 1280, height: 720 });
  // ブラウザを閉じる
  await openGraph(page);
  await expect(anyWin(page)).toHaveCount(3);
  for (const id of [p1, p2, p3]) await expect(win(page, id)).toHaveAttribute("data-status", "attached");
  await page.close();
  for (const id of [p1, p2, p3]) await expectFree(appServer, id);
});

test("8 つの縁と角で大きさが変わる（左上の角を引くと、広がる）。最小は 40×10。窓の端末では矢印は pane に届き、見出しにフォーカスがあるときだけ窓が動く", async ({ page, appServer }) => {
  const { client, ids, input } = await setup(page, appServer);
  const [p1] = ids as [string];
  await openGraph(page);
  await openByKey(page, p1);
  await expect(win(page, p1)).toHaveAttribute("data-status", "attached");
  await expect(win(page, p1).locator("[data-graph-terminal-handle]")).toHaveCount(8);
  const sizeOf = async () => {
    const t = (await win(page, p1).locator("[data-graph-terminal-size]").innerText()).trim();
    const [c, r] = t.split(" × ").map(Number);
    return { cols: c!, rows: r! };
  };
  const before = await sizeOf();
  // 縁（左）を引いて広げる
  const wh = (await win(page, p1).locator("[data-graph-terminal-handle='w']").boundingBox())!;
  await page.mouse.move(wh.x + 3, wh.y + wh.height / 2);
  await page.mouse.down();
  await page.mouse.move(wh.x - 120, wh.y + wh.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await sizeOf()).cols).toBeGreaterThan(before.cols);
  await expect.poll(async () => JSON.stringify(client.paneSize(p1))).toBe(JSON.stringify(await sizeOf()));
  // 角（北東）を引き下げて、最小まで縮める
  const ne = (await win(page, p1).locator("[data-graph-terminal-handle='ne']").boundingBox())!;
  await page.mouse.move(ne.x + 6, ne.y + 6);
  await page.mouse.down();
  await page.mouse.move(ne.x - 2000, ne.y + 2000, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => JSON.stringify(await sizeOf())).toBe(JSON.stringify({ cols: 40, rows: 10 }));
  // 端末にフォーカスがある間、矢印は pane に届き、窓は動かない
  await textareaOf(page, p1).focus();
  const box0 = (await win(page, p1).boundingBox())!;
  const n = input().length;
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => sentTo(input, p1, n)).toContain("\x1b[D");
  expect(Math.round((await win(page, p1).boundingBox())!.x)).toBe(Math.round(box0.x));
  // 見出しにフォーカスがあるときは、矢印で窓が動く（pane には届かない）
  await win(page, p1).locator("[data-graph-terminal-grip]").focus();
  const n2 = input().length;
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => Math.round((await win(page, p1).boundingBox())!.x)).toBeLessThan(Math.round(box0.x));
  expect(sentTo(input, p1, n2)).not.toContain("\x1b[D");
});

test("スクリプトの面を載せた画面で、3 つの窓の開閉をくり返しても、フォーカスは body に落ちず、遮断器も知らせも働かない", async ({ page, appServer }) => {
  await enableScript(appServer);
  const { ids } = await setup(page, appServer);
  const [p1, p2, p3] = ids as [string, string, string];
  await setScriptOk(appServer, p1, "g", "<!doctype html><body><p>quiet panel</p></body>");
  const frame = page.locator("[data-pane-panel] iframe[data-display-script]");
  await expect(frame).toHaveCount(1);
  await page.evaluate(() => {
    const w = window as unknown as { __bodySamples: number };
    w.__bodySamples = 0;
    setInterval(() => {
      if (document.activeElement === document.body) w.__bodySamples++;
    }, 4);
  });
  await openGraph(page);
  await page.waitForTimeout(200);
  const baseline = await page.evaluate(() => (window as unknown as { __bodySamples: number }).__bodySamples);
  for (let i = 0; i < 8; i++) {
    for (const id of [p1, p2, p3]) await openPinned(page, id);
    await expect(anyWin(page)).toHaveCount(3);
    for (const id of [p1, p2, p3]) {
      await press(page, win(page, id).locator("[data-graph-terminal-close]"));
      await expect(win(page, id)).toHaveCount(0);
    }
  }
  // 画面の切り替えでの一括の閉じ（3 つ）
  for (const id of [p1, p2, p3]) await openPinned(page, id);
  await textareaOf(page, p1).focus();
  await prefixKey(page, "a");
  await prefixKey(page, "a");
  await expect(anyWin(page)).toHaveCount(0);
  await page.waitForTimeout(300);
  const samples = await page.evaluate(() => (window as unknown as { __bodySamples: number }).__bodySamples);
  expect(samples - baseline, "窓の開閉の間に body がフォーカスを持った回数").toBe(0);
  await expect(frame).toHaveCount(1);
  await expect(page.getByText(/繰り返し外しています/)).toHaveCount(0);
});
