import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { prefixKey } from "../support/keys.js";
import { watchClientViews } from "../support/panes.js";

/**
 * グラフで移す（20261008-graph-first の PR4。T15a・T15c・T15d）。判定は利用者が見る場所（DOM・トースト・見た目の class）と、ブラウザが送ったフレーム（CDP）、
 * サーバの構成（新しい接続のスナップショット）で行う（条項 `e2e-observe-browser`）。テスト自身のクライアントは、前提（workspace・tab・pane・線）を作る・サーバの状態を読むことにだけ使う。
 * 構成: ws0（p0 と、分割で足した pX）・B（ws0 と同じフォルダ＝同じ worktree。tab が 2 つ）・C（別のフォルダ＝別の worktree）。
 */
const graphView = (page: Page) => page.locator(".graph-view");
const nodeOf = (page: Page, paneId: string) => graphView(page).locator(`[data-node-key="local:${paneId}"]`);
const frameOf = (page: Page, id: string) => graphView(page).locator(`[data-frame-id="${id}"]`);
const win = (page: Page) => page.locator("[data-graph-terminal-window]");
const hint = (page: Page) => page.locator("[data-graph-drag-hint]");

async function watchSent(page: Page): Promise<() => { method: string; params: unknown }[]> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  const sent: { method: string; params: unknown }[] = [];
  cdp.on("Network.webSocketFrameSent", (e) => {
    if (e.response.opcode !== 1) return;
    try {
      const msg = JSON.parse(e.response.payloadData) as { method?: string; params?: unknown };
      if (msg.method) sent.push({ method: msg.method, params: msg.params });
    } catch {
      // JSON でないテキストは無い想定
    }
  });
  return () => [...sent];
}

/**
 * `fakeMove`: ブラウザが送る `pane.move_to_tab` を、サーバへ流さずに、このテストが答える（`page.routeWebSocket`）。
 * `decline`: サーバだけが断る道（画面の判定を通った後の `ok: false`・理由つき）。`ok_not_moved`: 「移した」と答えるが、実際は移らない（所属の変化が届かない道）。
 */
async function setup(page: Page, appServer: AppServer, opts: { fakeMove?: "decline" | "ok_not_moved" } = {}) {
  // `routeWebSocket` の下では、ページの WebSocket は CDP の `webSocketFrameSent` に出ない。送ったものは、ここ（ルート）で数える。
  const routed: { method: string; params: unknown }[] = [];
  if (opts.fakeMove) {
    await page.routeWebSocket(/\/ws$/, (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((m) => {
        if (typeof m === "string") {
          try {
            const j = JSON.parse(m) as { id?: string; method?: string; params?: unknown };
            if (typeof j.method === "string") routed.push({ method: j.method, params: j.params });
            if (j.method === "pane.move_to_tab" && typeof j.id === "string") {
              const result = opts.fakeMove === "decline" ? { ok: false, reason: "different_worktree" } : { ok: true };
              ws.send(JSON.stringify({ id: j.id, result }));
              return;
            }
          } catch {
            // JSON でないものは、そのまま流す
          }
        }
        server.send(m);
      });
      server.onMessage((m) => ws.send(m));
    });
  }
  const client = await appServer.openClient();
  const snap = client.helloSnapshot()!;
  const ws0 = snap.workspaces[0]!;
  const p0 = snap.panes[0]!.id;
  const cdpSent = await watchSent(page);
  const sent = opts.fakeMove ? () => [...routed] : cdpSent;
  const views = await watchClientViews(page);
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await page.locator(".xterm-helper-textarea").first().focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => views.latest()?.visible.length).toBe(1);
  // 前提: 同じフォルダの workspace B（tab 2 つ）と、別のフォルダの workspace C。ws0 に、動かす pane pX を足す。
  const b = await client.request("workspace.create", { cwd: ws0.cwd, label: "move-b" });
  const bTab2 = await client.request("tab.create", { workspaceId: b.workspace.id, label: "second" });
  const c = await client.request("workspace.create", { cwd: "/tmp", label: "move-c" });
  const split = await client.request("pane.split", { paneId: p0, direction: "right" });
  const pX = split.pane.id;
  // 線: pX → p0（監督）。移した後も残ることを見る。
  await expect.poll(async () => (await client.request("graph.get", {})).nodes.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(5);
  const g = await client.request("graph.get", {});
  await client.request("graph.update", {
    baseRev: g.rev,
    ops: [{ op: "add_link", kind: "supervise", from: `local:${pX}`, to: `local:${p0}` }],
  });
  return { client, ws0, p0, pX, b, bTab2, c, sent };
}

async function openGraph(page: Page) {
  await prefixKey(page, "a");
  await expect(graphView(page)).toBeVisible();
  await graphView(page).locator(".graph-toolbar .graph-fit").first().click();
}

/** 新しい接続で見たサーバの構成: pane の workspace と tab。 */
async function placeOf(appServer: AppServer, paneId: string) {
  const c = await appServer.openClient();
  try {
    const s = c.helloSnapshot()!;
    const pane = s.panes.find((p) => p.id === paneId);
    const tab = pane && s.tabs.find((t) => t.id === pane.tabId);
    return { workspaceId: tab?.workspaceId ?? null, tabId: pane?.tabId ?? null };
  } finally {
    c.close();
  }
}

async function center(page: Page, loc: ReturnType<typeof nodeOf>) {
  const b = (await loc.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** ノード `from` をつかんで `to` の点まで運ぶ（離さない）。 */
async function grabAndMove(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 12, from.y + 12, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
}

test.describe("グラフで pane を別の workspace へ移す（T15a）", () => {
  test("同じ worktree の workspace の囲いの上で離すと pane が移る。落とせる見た目が出て、線は残る。見ている画面（基本画面の選び）は変わらない", async ({ page, appServer }) => {
    const { client, ws0, p0, pX, b, sent } = await setup(page, appServer);
    await openGraph(page);
    const node = nodeOf(page, pX);
    await expect(node).toBeVisible();
    const target = await center(page, frameOf(page, b.workspace.id));
    const from = await center(page, node);
    // 囲いの上で離したときの行き先は、その workspace で選んでいる tab（サーバの `activeTabId`）。
    const bActive = await (async () => {
      const c2 = await appServer.openClient();
      try {
        return c2.helloSnapshot()!.workspaces.find((w) => w.id === b.workspace.id)!.activeTabId;
      } finally {
        c2.close();
      }
    })();
    const selectedBefore = await page.locator(".sidebar-row-current .sidebar-label").first().innerText();
    await grabAndMove(page, from, { x: target.x, y: target.y + 40 });
    await expect(frameOf(page, b.workspace.id)).toHaveClass(/graph-frame-drop/);
    await expect(hint(page)).toContainText("へ移します");
    await page.mouse.up();
    await expect.poll(async () => (await placeOf(appServer, pX)).workspaceId, { timeout: 15_000 }).toBe(b.workspace.id);
    const moves = sent().filter((m) => m.method === "pane.move_to_tab");
    expect(moves).toHaveLength(1);
    expect(moves[0]!.params).toMatchObject({ paneId: pX, targetTabId: bActive }); // 選んでいる tab
    // 線は残る（pane の id が変わらない）。
    const g = await client.request("graph.get", {});
    expect(g.links.some((l) => l.from === `local:${pX}` && l.to === `local:${p0}`)).toBe(true);
    // ノードは、落とした囲いの中にある。
    await expect.poll(async () => {
      const nb = (await nodeOf(page, pX).boundingBox())!;
      const fb = (await frameOf(page, b.workspace.id).boundingBox())!;
      return nb.x >= fb.x - 1 && nb.y >= fb.y - 1 && nb.x + nb.width <= fb.x + fb.width + 1 && nb.y + nb.height <= fb.y + fb.height + 1;
    }, { timeout: 15_000 }).toBe(true);
    // 移したことで、見ている workspace は切り替わらない。
    expect(await page.locator(".sidebar-row-current .sidebar-label").first().innerText()).toBe(selectedBefore);
    expect(ws0.id).not.toBe(b.workspace.id);
  });

  test("tab のタグの上で離すと、その tab へ移る", async ({ page, appServer }) => {
    const { pX, b, bTab2, sent } = await setup(page, appServer);
    await openGraph(page);
    const node = nodeOf(page, pX);
    const tag = frameOf(page, b.workspace.id).locator(`[data-tab-tag][data-tab-id="${bTab2.tab.id}"]`);
    await expect(tag).toBeVisible();
    const t = (await tag.boundingBox())!;
    await grabAndMove(page, await center(page, node), { x: t.x + t.width / 2, y: t.y + t.height / 2 });
    await expect(tag).toHaveClass(/graph-frame-tag-drop/);
    await page.mouse.up();
    await expect.poll(async () => (await placeOf(appServer, pX)).tabId, { timeout: 15_000 }).toBe(bTab2.tab.id);
    expect(sent().filter((m) => m.method === "pane.move_to_tab")[0]!.params).toMatchObject({ paneId: pX, targetTabId: bTab2.tab.id });
  });

  test("別の worktree の workspace の囲いの上は、落とせない見た目と理由が出て、離しても何も送られず元へ戻る", async ({ page, appServer }) => {
    const { pX, ws0, c, sent } = await setup(page, appServer);
    await openGraph(page);
    const node = nodeOf(page, pX);
    const from = await center(page, node);
    const target = await center(page, frameOf(page, c.workspace.id));
    const before = await placeOf(appServer, pX);
    const sent0 = sent().length;
    await grabAndMove(page, from, { x: target.x, y: target.y + 40 });
    await expect(frameOf(page, c.workspace.id)).toHaveClass(/graph-frame-blocked/);
    await expect(node).toHaveClass(/graph-node-blocked/);
    await expect(hint(page)).toContainText("別の worktree の workspace へは移せません");
    await page.mouse.up();
    await expect(page.locator(".toast-list .toast").filter({ hasText: "別の worktree の workspace へは移せません" })).toHaveCount(1);
    await expect(node).not.toHaveClass(/graph-node-blocked/);
    expect(sent().slice(sent0).filter((m) => m.method === "pane.move_to_tab" || m.method === "graph.update")).toHaveLength(0);
    expect(await placeOf(appServer, pX)).toEqual(before);
    expect(before.workspaceId).toBe(ws0.id);
  });

  test("Esc で取りやめると、何も送られず元の場所に戻る（落とせる囲いの上でも）", async ({ page, appServer }) => {
    const { pX, b, sent } = await setup(page, appServer);
    await openGraph(page);
    const node = nodeOf(page, pX);
    const before = await placeOf(appServer, pX);
    const sent0 = sent().length;
    const target = await center(page, frameOf(page, b.workspace.id));
    await grabAndMove(page, await center(page, node), { x: target.x, y: target.y + 40 });
    await expect(frameOf(page, b.workspace.id)).toHaveClass(/graph-frame-drop/);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(frameOf(page, b.workspace.id)).not.toHaveClass(/graph-frame-drop/);
    await expect(graphView(page)).toBeVisible(); // Esc でグラフの画面は閉じない
    expect(sent().slice(sent0).filter((m) => m.method === "pane.move_to_tab" || m.method === "graph.update")).toHaveLength(0);
    expect(await placeOf(appServer, pX)).toEqual(before);
  });

  test("自分の囲いの中・空いた所では、今までどおり位置の変更だけ（pane は移らない）", async ({ page, appServer }) => {
    const { pX, ws0, sent } = await setup(page, appServer);
    await openGraph(page);
    const node = nodeOf(page, pX);
    const c0 = await center(page, node);
    const sent0 = sent().length;
    await grabAndMove(page, c0, { x: c0.x + 30, y: c0.y + 0 });
    await expect(hint(page)).toHaveCount(0);
    await page.mouse.up();
    await expect.poll(() => sent().slice(sent0).filter((m) => m.method === "graph.update").length).toBeGreaterThan(0);
    expect(sent().slice(sent0).filter((m) => m.method === "pane.move_to_tab")).toHaveLength(0);
    expect((await placeOf(appServer, pX)).workspaceId).toBe(ws0.id);
  });
});

test.describe("サーバの答えが正（T15a。応答を差し替える）", () => {
  test("画面の判定を通った後、サーバだけが断ると、元の位置へ戻り、理由のトーストが 1 つ出て、位置も書かない", async ({ page, appServer }) => {
    const { pX, ws0, b, sent } = await setup(page, appServer, { fakeMove: "decline" });
    await openGraph(page);
    const node = nodeOf(page, pX);
    const before = await center(page, node);
    const sent0 = sent().length;
    const target = await center(page, frameOf(page, b.workspace.id));
    await grabAndMove(page, before, { x: target.x, y: target.y + 40 });
    await expect(frameOf(page, b.workspace.id)).toHaveClass(/graph-frame-drop/); // 画面の判定は「移せる」
    await page.mouse.up();
    await expect(page.locator(".toast-list .toast").filter({ hasText: "別の worktree の workspace へは移せません" })).toHaveCount(1);
    expect(sent().slice(sent0).filter((m) => m.method === "pane.move_to_tab")).toHaveLength(1);
    expect(sent().slice(sent0).filter((m) => m.method === "graph.update")).toHaveLength(0);
    await expect.poll(async () => Math.round((await center(page, node)).x)).toBe(Math.round(before.x)); // 元の位置へ戻る
    expect((await placeOf(appServer, pX)).workspaceId).toBe(ws0.id);
  });

  test("「移した」と答えても所属の変化が届かないとき（待ちが切れる）は、位置を書かず、知らせる", async ({ page, appServer }) => {
    const { pX, b, sent } = await setup(page, appServer, { fakeMove: "ok_not_moved" });
    await openGraph(page);
    const node = nodeOf(page, pX);
    const sent0 = sent().length;
    const target = await center(page, frameOf(page, b.workspace.id));
    await grabAndMove(page, await center(page, node), { x: target.x, y: target.y + 40 });
    await page.mouse.up();
    await expect(page.locator(".toast-list .toast").filter({ hasText: "表示が追いついたら、置き場所は自動で決まります" })).toHaveCount(1, { timeout: 10_000 });
    expect(sent().slice(sent0).filter((m) => m.method === "graph.update")).toHaveLength(0);
  });
});

test.describe("キーだけで移す（T15c）", () => {
  test("ノードのメニュー「別の workspace へ移す…」で、落とせる先は選べ、落とせない先は理由つきで薄い。選ぶと移る。端末の窓は開いたまま付いていく", async ({ page, appServer }) => {
    const { client, pX, b, c, sent } = await setup(page, appServer);
    await openGraph(page);
    const node = nodeOf(page, pX);
    // 端末の窓を開く（押す）。
    await node.click();
    await expect(win(page)).toBeVisible();
    // 窓を動かさずに、ノードをキーで選んでメニューを開く（右クリック）。
    await node.focus();
    await page.keyboard.press("ContextMenu");
    await page.getByRole("menuitem", { name: "別の workspace へ移す…" }).click();
    const cItem = page.getByRole("menuitem", { name: /move-c/ });
    await expect(cItem).toHaveClass(/context-menu-disabled/);
    await expect(cItem).toContainText("別の worktree の workspace へは移せません");
    const bItem = page.getByRole("menuitem", { name: /^move-b$/ });
    await expect(bItem).not.toHaveClass(/context-menu-disabled/);
    // キーで選ぶ: 矢印で move-b へ、Enter。
    const items = page.getByRole("menuitem");
    const n = await items.count();
    let idx = -1;
    for (let i = 0; i < n; i++) if ((await items.nth(i).innerText()).trim() === "move-b") idx = i;
    expect(idx).toBeGreaterThanOrEqual(0);
    // いま強調されている行（開いた位置の下にマウスがあると、その行）から、move-b まで矢印で進む。
    const active = await page.locator(".context-menu .context-menu-active").evaluate((el) => [...(el.parentElement?.children ?? [])].indexOf(el));
    for (let i = 0; i < (idx - active + n) % n; i++) await page.keyboard.press("ArrowDown");
    await expect(page.locator(".context-menu .context-menu-active")).toHaveText(/^move-b$/);
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await placeOf(appServer, pX)).workspaceId, { timeout: 15_000 }).toBe(b.workspace.id);
    expect(sent().filter((m) => m.method === "pane.move_to_tab")).toHaveLength(1);
    // 窓は開いたまま（同じ pane）。線も残る。
    await expect(win(page)).toBeVisible();
    const g = await client.request("graph.get", {});
    expect(g.links.some((l) => l.from === `local:${pX}`)).toBe(true);
    expect(c.workspace.id).not.toBe(b.workspace.id);
  });

  test("落とせない先を選ぶと、理由のトーストだけが出て、何も送られない", async ({ page, appServer }) => {
    const { pX, ws0, sent } = await setup(page, appServer);
    await openGraph(page);
    const node = nodeOf(page, pX);
    await node.click({ button: "right" });
    await page.getByRole("menuitem", { name: "別の workspace へ移す…" }).click();
    await page.getByRole("menuitem", { name: /move-c/ }).click({ force: true }); // 薄く出している（aria-disabled）が、押すと理由が出る
    await expect(page.locator(".toast-list .toast").filter({ hasText: "別の worktree の workspace へは移せません" })).toHaveCount(1);
    expect(sent().filter((m) => m.method === "pane.move_to_tab")).toHaveLength(0);
    expect((await placeOf(appServer, pX)).workspaceId).toBe(ws0.id);
  });
});

test("スクリーンショット（PR4）: つかんでいる途中（落とせる・落とせない）・移した後（クラシック・モダン）", async ({ page, appServer }) => {
  const dir = process.env["GRAPH_SHOTS_DIR"];
  test.skip(dir === undefined, "GRAPH_SHOTS_DIR を渡したときだけ撮る");
  const { pX, b, c } = await setup(page, appServer);
  await openGraph(page);
  const node = nodeOf(page, pX);
  for (const style of ["classic", "modern"] as const) {
    await page.evaluate((st) => document.documentElement.setAttribute("data-ui-style", st), style);
    const from = await center(page, node);
    const tb = await center(page, frameOf(page, b.workspace.id));
    await grabAndMove(page, from, { x: tb.x, y: tb.y + 40 });
    await expect(hint(page)).toBeVisible();
    await page.screenshot({ path: join(dir!, `graph-move-ok-${style}.png`) });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    const from2 = await center(page, node);
    const tc = await center(page, frameOf(page, c.workspace.id));
    await grabAndMove(page, from2, { x: tc.x, y: tc.y + 40 });
    await expect(hint(page)).toBeVisible();
    await page.screenshot({ path: join(dir!, `graph-move-blocked-${style}.png`) });
    await page.keyboard.press("Escape");
    await page.mouse.up();
  }
  const from3 = await center(page, node);
  const tb3 = await center(page, frameOf(page, b.workspace.id));
  await grabAndMove(page, from3, { x: tb3.x, y: tb3.y + 40 });
  await page.mouse.up();
  await expect.poll(async () => (await placeOf(appServer, pX)).workspaceId, { timeout: 15_000 }).toBe(b.workspace.id);
  for (const style of ["classic", "modern"] as const) {
    await page.evaluate((st) => document.documentElement.setAttribute("data-ui-style", st), style);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(dir!, `graph-move-after-${style}.png`) });
  }
});

// --- グループへ移す（T15b）---------------------------------------------------------------------------------------

const exec = promisify(execFile);
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
const made = new Set<string>();
test.afterEach(async () => {
  for (const d of made) await rm(d, { recursive: true, force: true }).catch(() => undefined);
  made.clear();
});
async function makeDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), "soda-move-"));
  made.add(d);
  return d;
}
async function git(cwd: string, args: string[]): Promise<void> {
  await exec("git", args, { cwd, env: GIT_ENV });
}
const spaceBtn = (page: Page, label: string | RegExp) => page.locator("[data-space-id]").filter({ hasText: label });

/** グループ「甲」（alpha）・「乙」（beta）と、グループなしの worktree グループ（main-ws・wt-a-ws・wt-b-ws）。 */
async function setupGroups(page: Page, appServer: AppServer) {
  const client = await appServer.openClient();
  const initialId = client.helloSnapshot()!.workspaces[0]!.id;
  const sent = await watchSent(page);
  const views = await watchClientViews(page);
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await page.locator(".xterm-helper-textarea").first().focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => views.latest()?.visible.length).toBe(1);
  const repo = await makeDir();
  await git(repo, ["init", "-q", "-b", "main"]);
  await git(repo, ["config", "user.email", "e2e@example.com"]);
  await git(repo, ["config", "user.name", "soda e2e"]);
  await git(repo, ["commit", "-q", "--allow-empty", "-m", "init"]);
  const wts: string[] = [];
  for (const b of ["wt-a", "wt-b"]) {
    const path = `${repo}-${b}`;
    made.add(path);
    await git(repo, ["worktree", "add", "-q", "-b", b, path]);
    wts.push(path);
  }
  const open = async (cwd: string, label: string) => (await client.request("workspace.create", { cwd, label })).workspace;
  const main = await open(repo, "main-ws");
  const wa = await open(wts[0]!, "wt-a-ws");
  const wb = await open(wts[1]!, "wt-b-ws");
  const alpha = await open(await makeDir(), "alpha");
  const beta = await open(await makeDir(), "beta");
  await client.request("workspace.close", { workspaceId: initialId });
  const koh = await client.request("group.create", { label: "甲", workspaceId: alpha.id });
  const otsu = await client.request("group.create", { label: "乙", workspaceId: beta.id });
  return { client, sent, main, wa, wb, alpha, beta, koh: koh.group.id, otsu: otsu.group.id };
}
async function groupOf(appServer: AppServer, workspaceId: string): Promise<string | null> {
  const c = await appServer.openClient();
  try {
    return c.helloSnapshot()!.workspaces.find((w) => w.id === workspaceId)?.groupId ?? null;
  } finally {
    c.close();
  }
}
async function headCenter(page: Page, frame: ReturnType<typeof frameOf>) {
  const b = (await frame.locator(".graph-frame-head").boundingBox())!;
  return { x: b.x + 30, y: b.y + b.height / 2 };
}

test.describe("グラフで workspace・worktree グループを別のグループへ移す（T15b）", () => {
  test("worktree グループの外側の囲いの見出しをつかんで、空間の見出し「乙」へ落とすと、グループ全体（3 つの workspace）が移る。位置の変更ではない", async ({ page, appServer }) => {
    const w = await setupGroups(page, appServer);
    await prefixKey(page, "a");
    await expect(graphView(page)).toBeVisible();
    await spaceBtn(page, /グループなし/).click();
    const outer = graphView(page).locator('[data-frame-kind="worktree"]');
    await expect(outer).toHaveCount(1);
    const from = await headCenter(page, outer);
    const to = (await spaceBtn(page, /^乙/).boundingBox())!;
    const sent0 = w.sent().length;
    await grabAndMove(page, from, { x: to.x + to.width / 2, y: to.y + to.height / 2 });
    await expect(hint(page)).toContainText("「乙」へ移します");
    await page.mouse.up();
    for (const id of [w.main.id, w.wa.id, w.wb.id]) await expect.poll(() => groupOf(appServer, id), { timeout: 15_000 }).toBe(w.otsu);
    const sent = w.sent().slice(sent0);
    expect(sent.filter((m) => m.method === "group.add_member")).toHaveLength(1); // 項目ごと 1 回（ひとかたまり）
    expect(sent.filter((m) => m.method === "graph.update")).toHaveLength(0); // 位置は変えない
    // 移った先の空間が見える。
    await expect(spaceBtn(page, /^乙/)).toHaveAttribute("aria-current", "true");
    await expect(graphView(page).locator('[data-frame-kind="worktree"]')).toHaveCount(1);
  });

  test("workspace の囲いの見出しを、「グループなし」の空間の見出しへ落とすと、グループから外れる", async ({ page, appServer }) => {
    const w = await setupGroups(page, appServer);
    await prefixKey(page, "a");
    await spaceBtn(page, /^甲/).click();
    const frame = frameOf(page, w.alpha.id);
    await expect(frame).toBeVisible();
    const to = (await spaceBtn(page, /グループなし/).boundingBox())!;
    await grabAndMove(page, await headCenter(page, frame), { x: to.x + to.width / 2, y: to.y + to.height / 2 });
    await expect(hint(page)).toContainText("「グループなし」へ移します");
    await page.mouse.up();
    await expect.poll(() => groupOf(appServer, w.alpha.id), { timeout: 15_000 }).toBe(null);
  });

  test("Esc で取りやめると、何も送られず移らない", async ({ page, appServer }) => {
    const w = await setupGroups(page, appServer);
    await prefixKey(page, "a");
    await spaceBtn(page, /^甲/).click();
    const frame = frameOf(page, w.alpha.id);
    const to = (await spaceBtn(page, /^乙/).boundingBox())!;
    const sent0 = w.sent().length;
    await grabAndMove(page, await headCenter(page, frame), { x: to.x + to.width / 2, y: to.y + to.height / 2 });
    await expect(hint(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(hint(page)).toHaveCount(0);
    expect(w.sent().slice(sent0).filter((m) => m.method === "group.add_member" || m.method === "graph.update")).toHaveLength(0);
    expect(await groupOf(appServer, w.alpha.id)).toBe(w.koh);
  });

  test("見出しのメニュー: workspace は「別のグループへ移す…」が出て選べる。worktree グループの中の workspace には出ない。外側の囲いには出る", async ({ page, appServer }) => {
    const w = await setupGroups(page, appServer);
    await prefixKey(page, "a");
    // alpha（甲）: 出る → グループの一覧から「乙」を選ぶ。
    await spaceBtn(page, /^甲/).click();
    await frameOf(page, w.alpha.id).locator(".graph-frame-head").click({ button: "right", position: { x: 30, y: 20 } });
    await page.getByRole("menuitem", { name: "別のグループへ移す…" }).click();
    await page.locator("dialog.group-picker-dialog li").filter({ hasText: "乙" }).click();
    await expect.poll(() => groupOf(appServer, w.alpha.id), { timeout: 15_000 }).toBe(w.otsu);
    // worktree グループ（グループなし）: 中の workspace の囲いには出ない。外側の囲いには出る。
    await spaceBtn(page, /グループなし/).click();
    await frameOf(page, w.wa.id).locator(".graph-frame-head").click({ button: "right", position: { x: 30, y: 20 } });
    await expect(page.getByRole("menuitem", { name: "pane を足す" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "別のグループへ移す…" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await graphView(page).locator('[data-frame-kind="worktree"] .graph-frame-head').click({ button: "right", position: { x: 20, y: 20 } });
    await expect(page.getByRole("menuitem", { name: "別のグループへ移す…" })).toBeVisible();
  });
});
