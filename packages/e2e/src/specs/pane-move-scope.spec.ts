import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Locator, Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { routeRecordingWebSocket, watchReceivedEvents, type RecordingWebSocketRoute } from "../support/frames.js";
import type { SodaTestClient } from "../support/wsClient.js";

/**
 * pane を別の workspace へ移せるのを、同じ worktree の workspace の間だけに制限する（20261008-web-tab-dnd の T11。AC11〜AC18）。
 *
 * **合否は、ブラウザの DOM（行のクラス・`opacity`・トースト・tab の数・表示中の行）と、ブラウザが送った要求（`routeRecordingWebSocket` の
 * `sent`）、ブラウザが受けたイベント（`watchReceivedEvents`。(5) だけ）で決める**（条項 e2e-observe-browser）。ドラッグは実際のポインタの
 * 操作（`page.mouse`）。テスト自身のクライアントは、前提づくり（workspace・分割・名前）と、(5) の「画面の確認を通らない入口」の呼び出しにだけ使う。
 * git の判定が入ったことは、サイドバーの行にブランチ名（`branch` のトークン）が出るのをブラウザで待って確かめる。固定時間の待ちは根拠にしない。
 */

const exec = promisify(execFile);
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
const SETTLE = 20_000;
const SCREENSHOT_DIR = process.env["PANE_MOVE_SCOPE_SCREENSHOT_DIR"];
const MESSAGE = "別の worktree の workspace へは移せません";

const madePaths = new Set<string>();
test.afterEach(async () => {
  for (const p of madePaths) await rm(p, { recursive: true, force: true });
  madePaths.clear();
});

async function makeDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "soda-e2e-pms-"));
  madePaths.add(dir);
  return dir;
}
async function git(cwd: string, args: string[]): Promise<void> {
  await exec("git", args, { cwd, env: GIT_ENV });
}
/** 使い捨ての git リポジトリ（空のコミット 1 つ。ブランチ `main`）。 */
async function makeRepo(): Promise<string> {
  const dir = await makeDir();
  await git(dir, ["init", "-q", "-b", "main"]);
  await git(dir, ["config", "user.email", "e2e@example.com"]);
  await git(dir, ["config", "user.name", "soda e2e"]);
  await git(dir, ["commit", "-q", "--allow-empty", "-m", "init"]);
  return dir;
}

interface World {
  client: SodaTestClient;
  rec: RecordingWebSocketRoute | null;
  /** workspace の id（A1・A2 は同じフォルダ、AW は A の linked worktree、B は別のリポジトリ、U1・U2 は同じ管理外のフォルダ）。 */
  ws: Record<"A1" | "A2" | "AW" | "B" | "U1" | "U2", string>;
  tabs: Record<"A1" | "A2" | "AW" | "B" | "U1" | "U2", string>;
  panes: Record<"A1" | "U1", { mover: string; other: string }>;
}

/** 動かす pane の名前（名前の無い pane の枠にも `.pane-frame-name` が出るので、`mover` に絞る）。 */
const mover = (page: Page): Locator => page.locator(".pane-frame-name", { hasText: "mover" });

const row = (page: Page, workspaceId: string): Locator => page.locator(`.sidebar-spaces .sidebar-row[data-drop-workspace-id="${workspaceId}"]`);

/**
 * 前提を作ってブラウザで開く。最初から居る workspace は閉じる。`mover` と名付けた pane を A1 と U1 に持たせる（どちらも tab に 2 pane）。
 * サイドバーの行の並びに `branch` を足し、判定が入った workspace（A1・A2・AW・B）の行にブランチ名が出るのを待つ。
 */
async function boot(page: Page, appServer: AppServer, opts: { record: boolean }): Promise<World> {
  const client = await appServer.openClient();
  const initialId = client.helloSnapshot()!.workspaces[0]!.id;
  const repoA = await makeRepo();
  const repoB = await makeRepo();
  const plain = await makeDir();
  await git(repoA, ["worktree", "add", "-q", "-b", "wt", `${repoA}-wt`]);
  madePaths.add(`${repoA}-wt`);

  const open = (cwd: string, label: string) => client.request("workspace.create", { cwd, label });
  const a1 = await open(repoA, "A1");
  const a2 = await open(repoA, "A2");
  const aw = await open(`${repoA}-wt`, "AW");
  const b = await open(repoB, "B");
  const u1 = await open(plain, "U1");
  const u2 = await open(plain, "U2");
  const split = async (paneId: string) => {
    const r = await client.request("pane.split", { paneId, direction: "right" });
    await client.request("pane.rename", { paneId, label: "mover" });
    return { mover: paneId, other: r.pane.id };
  };
  const panes = { A1: await split(a1.pane.id), U1: await split(u1.pane.id) };
  await client.request("workspace.close", { workspaceId: initialId });

  const rec = opts.record ? await routeRecordingWebSocket(page) : null;
  await page.addInitScript(
    (prefs) => localStorage.setItem("soda.prefs.v1", prefs),
    JSON.stringify({ paneAgentNameVisible: true, sidebarRows: { spaces: [[{ token: "workspace" }], [{ token: "branch" }]] } }),
  );
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  const ws = { A1: a1.workspace.id, A2: a2.workspace.id, AW: aw.workspace.id, B: b.workspace.id, U1: u1.workspace.id, U2: u2.workspace.id };
  // 判定が入ったことをブラウザで待つ（ブランチ名が行に出る）。U1・U2 は判定の前後で結果が同じなので待たない。
  for (const id of [ws.A1, ws.A2, ws.B]) await expect(row(page, id)).toContainText("main", { timeout: SETTLE });
  await expect(row(page, ws.AW)).toContainText("wt", { timeout: SETTLE });
  const tabs = { A1: a1.tab.id, A2: a2.tab.id, AW: aw.tab.id, B: b.tab.id, U1: u1.tab.id, U2: u2.tab.id };
  return { client, rec, ws, tabs, panes };
}

/** その workspace を表示する（行をクリックして、選ばれるのを待つ）。 */
async function show(page: Page, w: World, key: keyof World["ws"]): Promise<void> {
  await row(page, w.ws[key]).click();
  await expect(row(page, w.ws[key])).toHaveAttribute("aria-current", "true");
  await expect(mover(page)).toBeVisible();
}

/** pane の名前をつかんで 12px 動かし、`target`（行・tab の要素）の中央まで動かす（まだ離さない）。 */
async function grabAndMoveTo(page: Page, target: Locator | null): Promise<void> {
  const name = mover(page);
  const b = (await name.boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 12, y + 12, { steps: 3 });
  if (target) {
    const t = (await target.boundingBox())!;
    await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 10 });
  }
}

const sentCount = (rec: RecordingWebSocketRoute, method: string): number => rec.sent(0).filter((s) => s.method === method).length;
const dropClasses = (page: Page) => ({
  disabled: page.locator(".sidebar-row-pane-drop-disabled"),
  target: page.locator(".sidebar-row-pane-drop-target"),
  invalid: page.locator(".sidebar-row-drop-invalid"),
});
async function shot(page: Page, name: string): Promise<void> {
  if (!SCREENSHOT_DIR) return;
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: join(SCREENSHOT_DIR, name) });
}

test("(1) 見せ方：ドラッグが始まると、落とせない行が薄くなる。落とせない行の上では点線の枠、落とせる行の上では破線。Esc で全部消える（AC18）", async ({ page, appServer }) => {
  const w = await boot(page, appServer, { record: true });
  await show(page, w, "A1");

  await grabAndMoveTo(page, null);
  const c = dropClasses(page);
  for (const k of ["AW", "B", "U1", "U2"] as const) {
    await expect(row(page, w.ws[k]), k).toHaveClass(/sidebar-row-pane-drop-disabled/);
    expect(Number(await row(page, w.ws[k]).evaluate((el) => getComputedStyle(el).opacity)), `${k} の opacity`).toBeLessThan(1);
  }
  for (const k of ["A1", "A2"] as const) {
    await expect(row(page, w.ws[k]), k).not.toHaveClass(/sidebar-row-pane-drop-disabled/);
    expect(Number(await row(page, w.ws[k]).evaluate((el) => getComputedStyle(el).opacity)), `${k} の opacity`).toBe(1);
  }
  await expect(c.disabled).toHaveCount(4);

  await page.mouse.move(...(await center(row(page, w.ws.B))), { steps: 8 });
  await expect(row(page, w.ws.B)).toHaveClass(/sidebar-row-drop-invalid/);
  await expect(row(page, w.ws.B)).not.toHaveClass(/sidebar-row-pane-drop-target/);
  await shot(page, "dragging-blocked-row.png");

  await page.mouse.move(...(await center(row(page, w.ws.A2))), { steps: 8 });
  await expect(row(page, w.ws.A2)).toHaveClass(/sidebar-row-pane-drop-target/);
  await expect(row(page, w.ws.A2)).not.toHaveClass(/sidebar-row-drop-invalid/);
  await expect(row(page, w.ws.B)).not.toHaveClass(/sidebar-row-drop-invalid/);

  await page.keyboard.press("Escape");
  await expect(c.disabled).toHaveCount(0);
  await expect(c.target).toHaveCount(0);
  await expect(c.invalid).toHaveCount(0);
  await page.mouse.up();
  expect(sentCount(w.rec!, "pane.move_to_new_tab")).toBe(0);
});

async function center(l: Locator): Promise<[number, number]> {
  const b = (await l.boundingBox())!;
  return [b.x + b.width / 2, b.y + b.height / 2];
}

test("(2) 断る：別のリポジトリ・同じリポジトリの別の worktree の行で離すと、要求を送らず、理由のトーストが出て、何も変わらない（AC12・AC18）", async ({ page, appServer }) => {
  const w = await boot(page, appServer, { record: true });
  await show(page, w, "A1");
  const tabsBefore = await page.locator(".tab-bar-item").count();
  const panesBefore = await page.locator(".pane-frame").count();

  for (const k of ["B", "AW"] as const) {
    await grabAndMoveTo(page, row(page, w.ws[k]));
    await expect(row(page, w.ws[k])).toHaveClass(/sidebar-row-drop-invalid/);
    await page.mouse.up();
    const toasts = page.locator(".toast", { hasText: MESSAGE });
    await expect(toasts.last()).toBeVisible();
    if (k === "B") await shot(page, "declined-toast.png");
    await expect(dropClasses(page).disabled).toHaveCount(0); // ドラッグが終わった
    expect(sentCount(w.rec!, "pane.move_to_new_tab"), `${k} へは送らない`).toBe(0);
    await expect(row(page, w.ws.A1)).toHaveAttribute("aria-current", "true");
    await expect(mover(page)).toBeVisible();
    expect(await page.locator(".tab-bar-item").count()).toBe(tabsBefore);
    expect(await page.locator(".pane-frame").count()).toBe(panesBefore);
  }
});

test("(3) 移せる：同じフォルダを開いた 2 つ目の workspace の行で離すと、要求が 1 つ送られ、表示がその新しい tab に移る（AC11）", async ({ page, appServer }) => {
  const w = await boot(page, appServer, { record: true });
  await show(page, w, "A1");
  const before = sentCount(w.rec!, "pane.move_to_new_tab");

  await grabAndMoveTo(page, row(page, w.ws.A2));
  await expect(row(page, w.ws.A2)).toHaveClass(/sidebar-row-pane-drop-target/);
  await page.mouse.up();

  await expect(row(page, w.ws.A2)).toHaveAttribute("aria-current", "true");
  await expect(mover(page)).toBeVisible();
  await expect(page.locator(".tab-bar-item")).toHaveCount(2); // A2 の元の tab と、新しい tab
  expect(sentCount(w.rec!, "pane.move_to_new_tab") - before).toBe(1);
  await expect(page.locator(".toast", { hasText: MESSAGE })).toHaveCount(0);
});

test("(4) 管理外：同じフォルダの管理外の workspace へは移り、git の workspace へは断られる（AC13）", async ({ page, appServer }) => {
  const w = await boot(page, appServer, { record: true });
  await show(page, w, "U1");

  await grabAndMoveTo(page, row(page, w.ws.A1));
  await expect(row(page, w.ws.A1)).toHaveClass(/sidebar-row-drop-invalid/);
  await page.mouse.up();
  await expect(page.locator(".toast", { hasText: MESSAGE }).last()).toBeVisible();
  expect(sentCount(w.rec!, "pane.move_to_new_tab")).toBe(0);
  await expect(row(page, w.ws.U1)).toHaveAttribute("aria-current", "true");

  await grabAndMoveTo(page, row(page, w.ws.U2));
  await expect(row(page, w.ws.U2)).toHaveClass(/sidebar-row-pane-drop-target/);
  await page.mouse.up();
  await expect(row(page, w.ws.U2)).toHaveAttribute("aria-current", "true");
  await expect(mover(page)).toBeVisible();
  expect(sentCount(w.rec!, "pane.move_to_new_tab")).toBe(1);
});

test("(5) サーバで断る：画面の確認を通らない入口（直接の RPC）でも断られ、ブラウザにイベントが 1 つも届かない。同じ worktree への呼び出しは届く（対照。AC12・AC16・AC17）", async ({ page, appServer }) => {
  const w = await boot(page, appServer, { record: false });
  // `routeRecordingWebSocket` を使わず、CDP でブラウザが受けたイベントを数える（`boot` の中で既に開いた後なので、開き直す）。
  const events = await watchReceivedEvents(page);
  await page.reload();
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await expect(row(page, w.ws.B)).toContainText("main", { timeout: SETTLE });
  const MOVE_EVENTS = ["pane.updated", "tab.created", "layout.updated"];
  const moveEvents = () => events().filter((e) => MOVE_EVENTS.includes(e.event)).length;
  const labelsBefore = await page.locator(".sidebar-spaces .sidebar-label").allTextContents();

  const p = w.panes.A1.mover;
  const refused = { ok: false, reason: "different_worktree" };
  const baseline = moveEvents();
  expect(await w.client.request("pane.move_to_new_tab", { paneId: p, targetWorkspaceId: w.ws.B })).toEqual(refused);
  expect(await w.client.request("pane.move_to_tab", { paneId: p, targetTabId: w.tabs.B })).toEqual(refused);
  expect(await w.client.request("pane.move_to_tab", { paneId: p, targetTabId: w.tabs.AW })).toEqual(refused);
  expect(await w.client.request("pane.move_to_new_tab", { paneId: p, targetWorkspaceId: w.ws.AW })).toEqual(refused);
  // 流れが生きていることを、無関係な変更（U2 の名前の変更）がブラウザに届くことで示す（これが届いた後で「増えていない」を見る）。
  await w.client.request("workspace.rename", { workspaceId: w.ws.U2, label: "U2-renamed" });
  await expect(row(page, w.ws.U2)).toContainText("U2-renamed");
  expect(moveEvents() - baseline, "断った間に、移動に関わるイベントが届いていない").toBe(0);
  expect(await page.locator(".sidebar-spaces .sidebar-label").allTextContents()).toEqual(labelsBefore.map((l) => (l === "U2" ? "U2-renamed" : l)));
  await expect(row(page, w.ws.A1)).not.toContainText("U2");

  // 対照：同じ呼び方で A2 の tab へは通り、同じ数え方で、ブラウザにイベントが届く。
  const afterRefusals = moveEvents();
  const ok = await w.client.request("pane.move_to_tab", { paneId: p, targetTabId: w.tabs.A2 });
  expect(ok).toEqual({ ok: true });
  await expect.poll(() => moveEvents() - afterRefusals, { timeout: SETTLE }).toBeGreaterThanOrEqual(2);
  expect(events().some((e) => e.event === "pane.updated" && (e.data as { pane: { id: string } }).pane.id === p)).toBe(true);
});

test("(6) 同じ workspace の中：別の tab へ移り、自分の workspace の行へ落とすと新しい tab へ切り出される（AC15）", async ({ page, appServer }) => {
  const w = await boot(page, appServer, { record: true });
  // A1 に 2 つ目の tab を足す。
  await w.client.request("tab.create", { workspaceId: w.ws.A1 });
  await row(page, w.ws.A1).click();
  await expect(row(page, w.ws.A1)).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".tab-bar-item")).toHaveCount(2);
  const items = page.locator(".tab-bar-item");
  await items.nth(0).click();
  await expect(mover(page)).toBeVisible();

  // 別の tab へ（pane の名前を tab バーの 2 番目の tab へ）。
  await grabAndMoveTo(page, items.nth(1));
  await expect(items.nth(1)).toHaveClass(/tab-bar-item-drop-target/);
  await page.mouse.up();
  await expect.poll(() => sentCount(w.rec!, "pane.move_to_tab")).toBe(1);
  await expect(items.nth(1)).toHaveClass(/tab-bar-item-active/);
  await expect(mover(page)).toBeVisible();
  await expect(page.locator(".toast", { hasText: MESSAGE })).toHaveCount(0);

  // 自分の workspace の行へ（新しい tab へ切り出す）。
  const before = sentCount(w.rec!, "pane.move_to_new_tab");
  await grabAndMoveTo(page, row(page, w.ws.A1));
  await expect(row(page, w.ws.A1)).toHaveClass(/sidebar-row-pane-drop-target/);
  await page.mouse.up();
  await expect(page.locator(".tab-bar-item")).toHaveCount(3);
  expect(sentCount(w.rec!, "pane.move_to_new_tab") - before).toBe(1);
  await expect(mover(page)).toBeVisible();
  await expect(page.locator(".toast", { hasText: MESSAGE })).toHaveCount(0);
});
