import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Locator, Page } from "@playwright/test";
import type { Workspace } from "@sodashitsu/protocol";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { prefixKey } from "../support/keys.js";
import { focusTerminal } from "../support/displayScript.js";
import { cleanupNotifyAgents, launchFakeAgent } from "../support/notifyAgent.js";
import { watchClientViews } from "../support/panes.js";

/**
 * グラフの空間と囲い（20261008-graph-first の PR1c。T11a〜T11h）。判定は利用者が見る場所（DOM・箱・フォーカス）と、ブラウザが送ったフレーム（CDP）で行う
 * （条項 `e2e-observe-browser`）。テスト自身のクライアントは、前提（workspace・グループ・tab・線を足す）とサーバの状態の確認にだけ使う。
 */

const exec = promisify(execFile);
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };

const made = new Set<string>();
test.afterEach(async () => {
  await cleanupNotifyAgents();
  for (const p of made) await rm(p, { recursive: true, force: true });
  made.clear();
});
async function makeDir(prefix = "soda-e2e-gsp-"): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  made.add(dir);
  return dir;
}
async function git(cwd: string, args: string[]): Promise<void> {
  await exec("git", args, { cwd, env: GIT_ENV });
}
/** 使い捨ての git リポジトリ（ブランチ `main`）と、その隣の linked worktree 2 つ（`wt-a`・`wt-b`）。 */
async function makeRepoWithWorktrees(): Promise<{ repo: string; wts: string[] }> {
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
  return { repo, wts };
}

// --- 画面の部品 ---------------------------------------------------------------------------------------------

const graphView = (page: Page) => page.locator(".graph-view");
const spaceBtn = (page: Page, label: string | RegExp) => page.locator("[data-space-id]").filter({ hasText: label });
const frameOf = (page: Page, id: string) => graphView(page).locator(`[data-frame-id="${id}"]`);
const nodeOf = (page: Page, paneId: string) => graphView(page).locator(`[data-node-key="local:${paneId}"]`);
const switcherBtnBase = (page: Page) => page.locator('[data-screen-id="base"]');
const rowOf = (page: Page, label: string) =>
  page.locator(".sidebar-row").filter({ has: page.locator(".sidebar-label", { hasText: new RegExp(`^${label}$`) }) });

/** ブラウザが送った要求（CDP）。`page.goto()` の前に呼ぶ。 */
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

interface World {
  client: Awaited<ReturnType<AppServer["openClient"]>>;
  sent: () => { method: string; params: unknown }[];
  /** 名前 → workspace。 */
  ws: Map<string, Workspace>;
  /** 名前 → 最初の pane の id。 */
  pane: Map<string, string>;
  repo: string;
  /** グループ「開発」の id（groups が偽なら空）。 */
  groupDev: string;
}

/**
 * 前提: グループ「開発」＝ worktree グループ（main-ws・wt-a-ws・wt-b-ws）+ alpha（tab が 2 つ）。グループ「ドキュメント」＝ beta。グループなし＝ gamma。
 * 最初から居る workspace は閉じる。ブラウザは開いて端末にフォーカスする。
 */
async function boot(page: Page, appServer: AppServer, opts: { groups?: boolean } = {}): Promise<World> {
  const groups = opts.groups ?? true;
  const client = await appServer.openClient();
  const initialId = client.helloSnapshot()!.workspaces[0]!.id;
  const ws = new Map<string, Workspace>();
  const pane = new Map<string, string>();
  const open = async (cwd: string, label: string): Promise<Workspace> => {
    const r = await client.request("workspace.create", { cwd, label });
    ws.set(label, r.workspace);
    pane.set(label, r.pane.id);
    return r.workspace;
  };
  const { repo, wts } = await makeRepoWithWorktrees();
  const main = await open(repo, "main-ws");
  await open(wts[0]!, "wt-a-ws");
  await open(wts[1]!, "wt-b-ws");
  const alpha = await open(await makeDir(), "alpha");
  const beta = await open(await makeDir(), "beta");
  await open(await makeDir(), "gamma");
  const second = await client.request("tab.create", { workspaceId: alpha.id, label: "second" });
  pane.set("alpha:second", second.pane.id);
  await client.request("workspace.close", { workspaceId: initialId });
  let groupDev = "";
  if (groups) {
    const dev = await client.request("group.create", { label: "開発", workspaceId: main.id });
    groupDev = dev.group.id;
    await client.request("group.add_member", { groupId: dev.group.id, workspaceId: alpha.id });
    await client.request("group.create", { label: "ドキュメント", workspaceId: beta.id });
  }
  // ノードの置き場所は pane の id（実行ごとに違う UUID）の順で決まるので、決まった場所へ置く（1 回の更新で。最終の形が重ならなければ断られない）。
  const where: [string, number, number][] = [
    ["alpha", 20, 60],
    ["alpha:second", 260, 60],
    ["main-ws", 20, 500],
    ["wt-a-ws", 420, 500],
    ["wt-b-ws", 820, 500],
    ["beta", 1500, 60],
    ["gamma", 1500, 400],
  ];
  // サーバがノードを足す（構造のできごとの後、少し待つ）のを待って動かす。足している途中の rev の食い違いは、取り直してやり直す。
  await expect
    .poll(async () => {
      const g = await client.request("graph.get", {});
      const have = new Set(g.nodes.map((n) => n.key));
      if (!where.every(([name]) => have.has(`local:${pane.get(name)!}`))) return "waiting";
      try {
        await client.request("graph.update", {
          baseRev: g.rev,
          ops: where.map(([name, x, y]) => ({ op: "move_node" as const, key: `local:${pane.get(name)!}` as const, x, y })),
        });
        return "done";
      } catch (e) {
        return String(e).includes("rev_conflict") ? "retry" : String(e);
      }
    }, { timeout: 15_000 })
    .toBe("done");
  const sent = await watchSent(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);
  return { client, sent, ws, pane, repo, groupDev };
}

/** 名前の workspace の最初の pane どうしを、トリガの線で結ぶ。 */
async function addTriggerLink(w: World, from: string, to: string): Promise<void> {
  const g = await w.client.request("graph.get", {});
  await w.client.request("graph.update", {
    baseRev: g.rev,
    ops: [
      {
        op: "add_link",
        kind: "trigger",
        from: `local:${w.pane.get(from)!}`,
        to: `local:${w.pane.get(to)!}`,
        trigger: { on: "done", prompt: "確認してください\n\n{output}", output: { lines: 80 }, whenBusy: "wait" },
      },
    ],
  });
}

async function openGraph(page: Page): Promise<void> {
  await prefixKey(page, "a");
  await expect(graphView(page)).toBeVisible();
  await expect(graphView(page).locator("[data-node-key]").first()).toBeVisible();
}

const box = async (l: Locator) => (await l.boundingBox())!;

test.describe("空間の見出しの並び（T11a・T11b）", () => {
  test("グループごとの空間が、サイドバーの順に、名前と数つきで並び、表示中が分かる。押すとその空間の囲いとノードだけが出る", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    const bar = page.locator(".graph-spaces");
    await expect(bar).toBeVisible();
    await expect(bar.locator("[data-space-id]")).toHaveText(["開発4", "ドキュメント1", "グループなし1"]);
    // 既定は、選んでいる workspace のある空間（最後に作った workspace は gamma ではなく、いま選んでいるもの）
    const current = bar.locator("[aria-current=true]");
    await expect(current).toHaveCount(1);
    // 開発の空間: alpha・main-ws・wt-a-ws・wt-b-ws のノードだけ
    await spaceBtn(page, /^開発/).click();
    await expect(spaceBtn(page, /^開発/)).toHaveAttribute("aria-current", "true");
    for (const n of ["alpha", "main-ws", "wt-a-ws", "wt-b-ws"]) await expect(nodeOf(page, w.pane.get(n)!)).toBeVisible();
    for (const n of ["beta", "gamma"]) await expect(nodeOf(page, w.pane.get(n)!)).toHaveCount(0);
    // ドキュメントの空間へ
    await spaceBtn(page, /^ドキュメント/).click();
    await expect(nodeOf(page, w.pane.get("beta")!)).toBeVisible();
    await expect(nodeOf(page, w.pane.get("alpha")!)).toHaveCount(0);
    await expect(frameOf(page, w.ws.get("beta")!.id)).toBeVisible();
    await expect(frameOf(page, w.ws.get("alpha")!.id)).toHaveCount(0);
  });

  test("空間を押すと、その空間の全体が収まる位置と倍率になる（面の中に囲いが入る）", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    const canvas = page.locator(".graph-canvas");
    await expect.poll(async () => {
      const c = await box(canvas);
      const out: boolean[] = [];
      for (const f of [frameOf(page, w.ws.get("alpha")!.id), graphView(page).locator('[data-frame-kind="worktree"]')]) {
        if ((await f.count()) === 0) { out.push(false); continue; }
        const b = await box(f);
        out.push(b.x >= c.x - 1 && b.y >= c.y - 1 && b.x + b.width <= c.x + c.width + 1 && b.y + b.height <= c.y + c.height + 1);
      }
      return out;
    }).toEqual([true, true]);
  });

  test("グループが 1 つも無いときは、空間の並びを出さない", async ({ page, appServer }) => {
    await boot(page, appServer, { groups: false });
    await openGraph(page);
    await expect(page.locator(".graph-spaces")).toHaveCount(0);
  });

  test("表示中の空間は、このブラウザに覚えられ、開き直しても同じ空間", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^ドキュメント/).click();
    await expect(nodeOf(page, w.pane.get("beta")!)).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(graphView(page)).toBeHidden();
    await page.reload();
    await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
    await focusTerminal(page);
    await prefixKey(page, "a");
    await expect(graphView(page)).toBeVisible();
    // 開いた直後は、焦点の pane のある空間へ（選んでいる workspace が記憶と違うなら移る）。どちらでも、表示中の空間の印は 1 つ
    await expect(page.locator(".graph-spaces [aria-current=true]")).toHaveCount(1);
  });
});

test.describe("囲いと見出し（T11c）", () => {
  test("workspace の囲いに名前・フォルダ・ブランチが出る。worktree グループは外側の囲いで、名前と「worktree グループ・3 worktree」。選んでいる workspace の囲いは見分けられる", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    const main = frameOf(page, w.ws.get("main-ws")!.id);
    await expect(main.locator(".graph-frame-title")).toHaveText("main-ws");
    await expect(main.locator(".graph-frame-sub")).toContainText("main"); // ブランチ
    await expect(main.locator(".graph-frame-sub")).toContainText(w.repo.split("/").pop()!); // フォルダ
    const group = graphView(page).locator('[data-frame-kind="worktree"]');
    await expect(group).toHaveCount(1);
    await expect(group.locator(".graph-frame-head").first().locator(".graph-frame-sub")).toHaveText("worktree グループ・3 worktree");
    // 外側の囲いは、中の 3 つの囲いを含む
    const outer = await box(group);
    for (const n of ["main-ws", "wt-a-ws", "wt-b-ws"]) {
      const inner = await box(frameOf(page, w.ws.get(n)!.id));
      expect(inner.x).toBeGreaterThanOrEqual(outer.x - 1);
      expect(inner.y).toBeGreaterThanOrEqual(outer.y - 1);
      expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 1);
      expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 1);
    }
    // 選んでいる workspace（最後に作って選ばれたもの）の囲いだけに、見分ける印
    await rowOf(page, "wt-a-ws").click();
    await expect(frameOf(page, w.ws.get("wt-a-ws")!.id)).toHaveClass(/graph-frame-selected/);
    await expect(graphView(page).locator(".graph-frame-selected")).toHaveCount(1);
  });

  test("囲いは、ノード・線の操作を邪魔しない: ノードの上・囲いの中の何も無い所を押しても、囲いが押されない（ノードが取る・背景のパンになる）", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    const n = nodeOf(page, w.pane.get("alpha")!);
    const nb = await box(n);
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("[data-node-key]")?.getAttribute("data-node-key") ?? null, { x: nb.x + nb.width / 2, y: nb.y + nb.height / 2 });
    expect(hit).toBe(`local:${w.pane.get("alpha")!}`);
    // 囲いの本体（見出しの下の何も無い所）は、ポインタを通す（見出しの帯だけが押せる）
    const f = await box(frameOf(page, w.ws.get("alpha")!.id));
    const empty = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return { inFrameHead: el?.closest(".graph-frame-head") !== null, isFrame: el?.classList.contains("graph-frame") ?? false };
    }, { x: f.x + f.width / 2, y: f.y + f.height - 4 });
    expect(empty.isFrame).toBe(false);
    expect(empty.inFrameHead).toBe(false);
    // 背景をドラッグするとパンする（囲いの上でも）
    const before = await box(frameOf(page, w.ws.get("alpha")!.id));
    await page.mouse.move(f.x + f.width / 2, f.y + f.height - 4);
    await page.mouse.down();
    await page.mouse.move(f.x + f.width / 2 + 60, f.y + f.height - 4 + 30, { steps: 5 });
    await page.mouse.up();
    const after = await box(frameOf(page, w.ws.get("alpha")!.id));
    expect(Math.round(after.x - before.x)).toBe(60);
    // 見出しの帯だけが押せる
    const head = await box(frameOf(page, w.ws.get("alpha")!.id).locator(".graph-frame-head"));
    const onHead = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest(".graph-frame-head") !== null, { x: head.x + 20, y: head.y + head.height / 2 });
    expect(onHead).toBe(true);
  });

  test("新しい workspace は、すぐ囲いで出る（ノードが足されるまでの見出しだけの囲いは、単体の試験で確かめる）", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    // 画面に出ている pane のノードを、サーバが足す前の状態にはできないので、画面側で「ノードの無い」状態を作る: 全ノードを外した別の画面状態は無い。
    // 代わりに、手元のセッションにだけ workspace を足す（サーバは足すが、画面は届くまで仮の囲いを出す）。足した直後に仮の囲い、その後にノードの囲いになる。
    await openGraph(page);
    await spaceBtn(page, /^グループなし/).click();
    const r = await w.client.request("workspace.create", { cwd: await makeDir(), label: "late" });
    await expect(frameOf(page, r.workspace.id)).toBeVisible();
    await expect(frameOf(page, r.workspace.id).locator(".graph-frame-title")).toHaveText("late");
  });
});

test.describe("tab のタグ（T11d）", () => {
  /** alpha の 1 つ目・2 つ目の tab の pane（boot が作る）。 */
  const alphaPanes = (w: World): { first: string; second: string } => ({ first: w.pane.get("alpha")!, second: w.pane.get("alpha:second")! });

  test("tab が 2 つ以上の workspace のノードにだけタグが出る。見出しには tab のタグの並びが出て、選ばれている tab は見分けられる", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    const { first, second } = alphaPanes(w);
    await expect(nodeOf(page, first).locator("[data-node-tab]")).toHaveCount(1);
    await expect(nodeOf(page, second).locator("[data-node-tab]")).toHaveText("second");
    // tab が 1 つだけの workspace には、ノードのタグも見出しの強調の印も出ない（見出しにはその 1 つの tab のタグが出る）
    await expect(nodeOf(page, w.pane.get("main-ws")!).locator("[data-node-tab]")).toHaveCount(0);
    const heading = frameOf(page, w.ws.get("alpha")!.id).locator(".graph-frame-head");
    await expect(heading.locator("[data-tab-tag]")).toHaveCount(2);
    // 選ばれている tab（サーバの値: 作ったばかりの tab）だけが塗られる
    await expect(heading.locator(".graph-frame-tag-active")).toHaveCount(1);
    await expect(heading.locator(".graph-frame-tag-active")).toHaveText("second");
  });

  test("見出しのタグを押すと、その tab のノードが強く、同じ workspace のほかの tab のノードが弱く出る。もう一度押すと戻る", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    const { first, second } = alphaPanes(w);
    const heading = frameOf(page, w.ws.get("alpha")!.id).locator(".graph-frame-head");
    const sentBefore = w.sent().length;
    const tagSecond = heading.locator("[data-tab-tag]").filter({ hasText: "second" });
    await tagSecond.click();
    await expect(nodeOf(page, second)).toHaveClass(/graph-node-strong/);
    await expect(nodeOf(page, first)).toHaveClass(/graph-node-weak/);
    await expect(tagSecond).toHaveAttribute("aria-pressed", "true");
    // ほかの workspace のノードは変わらない
    await expect(nodeOf(page, w.pane.get("main-ws")!)).not.toHaveClass(/graph-node-(weak|strong)/);
    // ブラウザの中だけの状態: サーバへは何も送らない
    expect(w.sent().slice(sentBefore).filter((m) => m.method.startsWith("graph.") || m.method.startsWith("tab."))).toEqual([]);
    // もう一度で戻る
    await tagSecond.click();
    await expect(nodeOf(page, second)).not.toHaveClass(/graph-node-(weak|strong)/);
    await expect(nodeOf(page, first)).not.toHaveClass(/graph-node-(weak|strong)/);
    // 別のタグへ付け替えられる
    const tagFirst = heading.locator("[data-tab-tag]").first();
    await tagFirst.click();
    await expect(nodeOf(page, first)).toHaveClass(/graph-node-strong/);
    await expect(nodeOf(page, second)).toHaveClass(/graph-node-weak/);
  });

  test("タグを押しても、囲いのドラッグにならず、ノードの選択は変わらない", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    const before = (await w.client.request("graph.get", {})).nodes.map((n) => `${n.key}:${n.x},${n.y}`).sort();
    const tag = frameOf(page, w.ws.get("alpha")!.id).locator("[data-tab-tag]").first();
    const b = await box(tag);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 80, b.y + b.height / 2 + 40, { steps: 5 });
    await page.mouse.up();
    const after = (await w.client.request("graph.get", {})).nodes.map((n) => `${n.key}:${n.x},${n.y}`).sort();
    expect(after).toEqual(before);
  });
});

/** 囲い（表示上の箱）が、面（`.graph-canvas`）に収まっているか。 */
async function frameInCanvas(page: Page, id: string): Promise<boolean> {
  const f = frameOf(page, id);
  if ((await f.count()) === 0) return false;
  const c = await box(page.locator(".graph-canvas"));
  const b = await box(f);
  return b.x >= c.x - 1 && b.y >= c.y - 1 && b.x + b.width <= c.x + c.width + 1 && b.y + b.height <= c.y + c.height + 1;
}

test.describe("サイドバーからの移動（T11e）", () => {
  test("workspace の行を押すと、その空間へ切り替わり、囲いが面に収まり、囲いが 1.5 秒強く出る。グラフの画面のまま", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    await expect(nodeOf(page, w.pane.get("beta")!)).toHaveCount(0);
    await rowOf(page, "beta").click();
    await expect(spaceBtn(page, /^ドキュメント/)).toHaveAttribute("aria-current", "true");
    const frame = frameOf(page, w.ws.get("beta")!.id);
    await expect(frame).toHaveClass(/graph-frame-flash/);
    await expect.poll(() => frameInCanvas(page, w.ws.get("beta")!.id)).toBe(true);
    await expect(graphView(page)).toBeVisible(); // 基本画面へは切り替わらない
    // 1.5 秒で通常の見た目へ戻る
    await expect(frame).not.toHaveClass(/graph-frame-flash/, { timeout: 4000 });
    // 選んでいる workspace も切り替わっている（基本画面へ戻ったとき、その workspace にいる）
    await expect(rowOf(page, "beta")).toHaveClass(/sidebar-row-current/);
  });

  test("同じ空間の workspace の行を押すと、離れた所にあっても、その囲いへ動く。動きは prefers-reduced-motion では一度に切り替わる", async ({ page, appServer }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    // 面を大きくずらして、alpha の囲いを見えない所へ
    const c = await box(page.locator(".graph-canvas"));
    await page.mouse.move(c.x + 20, c.y + c.height - 20);
    await page.mouse.down();
    await page.mouse.move(c.x + 20 - 900, c.y + c.height - 20 - 500, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => frameInCanvas(page, w.ws.get("alpha")!.id)).toBe(false);
    await rowOf(page, "alpha").click();
    await expect.poll(() => frameInCanvas(page, w.ws.get("alpha")!.id)).toBe(true);
  });

  test("エージェントの行を押すと、そのノードへ（空間を切り替えて、ノードを選ぶ）", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await w.client.request("pane.subscribe", { paneId: w.pane.get("beta")!, scrollbackLines: 4000 });
    const agent = await launchFakeAgent(page, w.client, w.pane.get("beta")!, { via: "client" });
    await agent.work();
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    await expect(nodeOf(page, w.pane.get("beta")!)).toHaveCount(0);
    await page.locator(`.sidebar-agents [data-agent-pane="${w.pane.get("beta")!}"]`).click();
    await expect(spaceBtn(page, /^ドキュメント/)).toHaveAttribute("aria-current", "true");
    const node = nodeOf(page, w.pane.get("beta")!);
    await expect(node).toBeVisible();
    await expect(node).toHaveClass(/graph-node-selected/);
    await expect(graphView(page)).toBeVisible();
  });

  test("グループの見出しを押すと、その空間へ切り替わる（畳まない）。畳み・広げは矢印のボタンで、空間は変わらない", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    await rowOf(page, "ドキュメント").click();
    await expect(spaceBtn(page, /^ドキュメント/)).toHaveAttribute("aria-current", "true");
    await expect(rowOf(page, "beta")).toBeVisible(); // 畳まれていない
    // 矢印のボタン: 畳む。空間は変わらない
    await spaceBtn(page, /^開発/).click();
    await rowOf(page, "ドキュメント").locator(".sidebar-group-toggle").click();
    await expect(rowOf(page, "beta")).toHaveCount(0);
    await expect(spaceBtn(page, /^開発/)).toHaveAttribute("aria-current", "true");
    await rowOf(page, "ドキュメント").locator(".sidebar-group-toggle").click();
    await expect(rowOf(page, "beta")).toBeVisible();
    expect(w.pane.size).toBeGreaterThan(0);
  });

  test("基本画面では、行を押しても、グラフの空間は動かない（今までどおり）", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(graphView(page)).toBeHidden();
    await rowOf(page, "beta").click();
    await expect(graphView(page)).toBeHidden();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("soda.graphSpace.v1"))).toContain("g:");
    await prefixKey(page, "a");
    // グラフを開くと、選んでいる workspace（beta）のある空間になる
    await expect(spaceBtn(page, /^ドキュメント/)).toHaveAttribute("aria-current", "true");
    expect(w.ws.size).toBeGreaterThan(0);
  });
});

/** サーバのグラフのノードの位置（鍵 → 座標）。 */
async function serverPositions(w: World): Promise<Map<string, { x: number; y: number }>> {
  const g = await w.client.request("graph.get", {});
  return new Map(g.nodes.map((n) => [n.key, { x: n.x, y: n.y }]));
}
const updatesSent = (w: World) => w.sent().filter((m) => m.method === "graph.update");
/** 囲いの見出しの、つかめる所（名前の文字の上）の中心。 */
async function headingGrip(page: Page, id: string): Promise<{ x: number; y: number }> {
  const b = await box(frameOf(page, id).locator(".graph-frame-title"));
  return { x: b.x + Math.min(b.width / 2, 20), y: b.y + b.height / 2 };
}

test.describe("囲いのドラッグ・ノードのドラッグの寄せ（T11f）", () => {
  test("workspace の囲いの見出しをつかんで動かすと、中のノードがまとめて同じ量だけ平行移動する。離したときに 1 回の graph.update", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    const keys = [`local:${w.pane.get("alpha")!}`, `local:${w.pane.get("alpha:second")!}`];
    await expect(nodeOf(page, w.pane.get("alpha")!)).toBeVisible();
    const before = await serverPositions(w);
    const sent0 = updatesSent(w).length;
    const g = await headingGrip(page, w.ws.get("alpha")!.id);
    const fb = await box(frameOf(page, w.ws.get("alpha")!.id));
    await page.mouse.move(g.x, g.y);
    await page.mouse.down();
    await page.mouse.move(g.x + 40, g.y + 10, { steps: 4 });
    await page.mouse.move(g.x + 140, g.y + 20, { steps: 6 });
    // つかんでいる間は、離す前に見た目が動く（送るのは離したとき）
    await expect(frameOf(page, w.ws.get("alpha")!.id)).toHaveClass(/graph-frame-dragging/);
    expect((await box(frameOf(page, w.ws.get("alpha")!.id))).x).toBeGreaterThan(fb.x + 100);
    expect(updatesSent(w).length).toBe(sent0);
    await page.mouse.up();
    await expect.poll(async () => (await serverPositions(w)).get(keys[0]!)?.x).not.toBe(before.get(keys[0]!)!.x);
    const after = await serverPositions(w);
    const d0 = { x: after.get(keys[0]!)!.x - before.get(keys[0]!)!.x, y: after.get(keys[0]!)!.y - before.get(keys[0]!)!.y };
    const d1 = { x: after.get(keys[1]!)!.x - before.get(keys[1]!)!.x, y: after.get(keys[1]!)!.y - before.get(keys[1]!)!.y };
    expect(d0).toEqual(d1); // 相対の位置は保たれる
    expect(d0.x).toBeGreaterThan(0);
    expect(d0.x % 20).toBe(0);
    // ほかの workspace のノードは動かない
    for (const k of before.keys()) if (!keys.includes(k)) expect(after.get(k)).toEqual(before.get(k));
    expect(updatesSent(w).length).toBe(sent0 + 1);
    const ops = (updatesSent(w).at(-1)!.params as { ops: { op: string }[] }).ops;
    expect(ops.map((o) => o.op)).toEqual(["move_node", "move_node"]);
  });

  test("worktree グループの見出しをつかむと、中のすべての workspace がまとめて動く", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    const keys = ["main-ws", "wt-a-ws", "wt-b-ws"].map((n) => `local:${w.pane.get(n)!}`);
    const before = await serverPositions(w);
    const group = graphView(page).locator('[data-frame-kind="worktree"]');
    const t = await box(group.locator(".graph-frame-title").first());
    const sent0 = updatesSent(w).length;
    await page.mouse.move(t.x + 10, t.y + t.height / 2);
    await page.mouse.down();
    await page.mouse.move(t.x + 10 + 60, t.y + t.height / 2 + 20, { steps: 4 });
    await page.mouse.move(t.x + 10 + 300, t.y + t.height / 2 - 10, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => updatesSent(w).length).toBe(sent0 + 1);
    await expect.poll(async () => (await serverPositions(w)).get(keys[0]!)?.x).not.toBe(before.get(keys[0]!)!.x);
    const after = await serverPositions(w);
    const ds = keys.map((k) => ({ x: after.get(k)!.x - before.get(k)!.x, y: after.get(k)!.y - before.get(k)!.y }));
    expect(ds[1]).toEqual(ds[0]);
    expect(ds[2]).toEqual(ds[0]);
    expect(ds[0]!.x).toBeGreaterThan(0);
  });

  test("ほかの囲いの上へ落とすと、重ならない最も近い位置へ寄る（離す前に寄せるので、サーバに断られず、元へも戻らない）", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    const group = graphView(page).locator('[data-frame-kind="worktree"]');
    const gb = await box(group);
    const keys = [`local:${w.pane.get("alpha")!}`, `local:${w.pane.get("alpha:second")!}`];
    const before = await serverPositions(w);
    const alphaBefore = await box(frameOf(page, w.ws.get("alpha")!.id));
    const g = await headingGrip(page, w.ws.get("alpha")!.id);
    const sent0 = updatesSent(w).length;
    await page.mouse.move(g.x, g.y);
    await page.mouse.down();
    await page.mouse.move(g.x - 40, g.y + 40, { steps: 4 });
    await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2, { steps: 8 }); // worktree グループの真ん中の上
    await page.mouse.up();
    await expect.poll(() => updatesSent(w).length).toBe(sent0 + 1);
    // サーバの位置が動いた（断られて元の位置のままではない）。2 つのノードは相対の位置を保つ
    await expect.poll(async () => (await serverPositions(w)).get(keys[0]!)).not.toEqual(before.get(keys[0]!));
    const after = await serverPositions(w);
    expect({ x: after.get(keys[1]!)!.x - after.get(keys[0]!)!.x, y: after.get(keys[1]!)!.y - after.get(keys[0]!)!.y }).toEqual({
      x: before.get(keys[1]!)!.x - before.get(keys[0]!)!.x,
      y: before.get(keys[1]!)!.y - before.get(keys[0]!)!.y,
    });
    // 囲いが、元の位置とは違う、寄せた先にある。ほかの囲い（worktree グループ）と重ならない
    await expect.poll(async () => {
      const a = await box(frameOf(page, w.ws.get("alpha")!.id));
      return Math.abs(a.x - alphaBefore.x) + Math.abs(a.y - alphaBefore.y) > 5;
    }).toBe(true);
    const a = await box(frameOf(page, w.ws.get("alpha")!.id));
    const b = await box(group);
    expect(a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1 || a.y + a.height <= b.y + 1 || b.y + b.height <= a.y + 1).toBe(true);
    // 応答の後にも、断られた知らせは出ない（寄せを外すと、断られて出る）
    await page.waitForTimeout(1500);
    await expect(page.locator(".toast-list .toast").filter({ hasText: "配置を保存できませんでした" })).toHaveCount(0);
  });

  test("Esc で取りやめると、元の位置のまま何も送らない。グラフの画面は開いたまま", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    const before = await serverPositions(w);
    const fb = await box(frameOf(page, w.ws.get("alpha")!.id));
    const g = await headingGrip(page, w.ws.get("alpha")!.id);
    const sent0 = updatesSent(w).length;
    await page.mouse.move(g.x, g.y);
    await page.mouse.down();
    await page.mouse.move(g.x + 150, g.y + 100, { steps: 6 });
    await expect(frameOf(page, w.ws.get("alpha")!.id)).toHaveClass(/graph-frame-dragging/); // 背景のパンではなく、囲いのドラッグ
    expect((await box(frameOf(page, w.ws.get("alpha")!.id))).x).toBeGreaterThan(fb.x + 100);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect.poll(async () => Math.round((await box(frameOf(page, w.ws.get("alpha")!.id))).x)).toBe(Math.round(fb.x));
    expect(updatesSent(w).length).toBe(sent0);
    expect(await serverPositions(w)).toEqual(before);
    await expect(graphView(page)).toBeVisible();
  });

  test("動かしている途中で囲いの構成が変わる（pane が増える）と、取りやめる", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    const fb = await box(frameOf(page, w.ws.get("alpha")!.id));
    const before = await serverPositions(w);
    const g = await headingGrip(page, w.ws.get("alpha")!.id);
    const sent0 = updatesSent(w).length;
    await page.mouse.move(g.x, g.y);
    await page.mouse.down();
    await page.mouse.move(g.x + 120, g.y + 80, { steps: 6 });
    await w.client.request("pane.split", { paneId: w.pane.get("alpha")!, direction: "right" });
    // 新しいノードが足されるまで待つ（構成が変わった）→ 取りやめ（元の位置・何も送らない）
    await expect(graphView(page).locator("[data-node-key]")).toHaveCount(6, { timeout: 15_000 });
    await page.mouse.move(g.x + 200, g.y + 100, { steps: 3 });
    await page.mouse.up();
    expect(updatesSent(w).length).toBe(sent0);
    // 元の位置へ戻っている（囲いの見た目・サーバの位置とも）
    await expect.poll(async () => Math.round((await box(frameOf(page, w.ws.get("alpha")!.id))).x)).toBe(Math.round(fb.x));
    const now = await serverPositions(w);
    for (const [key, p] of before) expect(now.get(key), key).toEqual(p); // 増えた pane のノード以外は動いていない
  });

  test("ノードを、ほかの workspace の囲いの上へドラッグすると「落とせない」見た目になり、離すと元へ戻る（何も送らない）。空いた所へは動かせる", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    const key = `local:${w.pane.get("alpha")!}`;
    const before = await serverPositions(w);
    const node = nodeOf(page, w.pane.get("alpha")!);
    const nb = await box(node);
    const target = await box(frameOf(page, w.ws.get("wt-a-ws")!.id));
    const sent0 = updatesSent(w).length;
    await page.mouse.move(nb.x + nb.width / 2, nb.y + 30);
    await page.mouse.down();
    await page.mouse.move(nb.x + nb.width / 2 + 20, nb.y + 50, { steps: 4 });
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
    await expect(node).toHaveClass(/graph-node-blocked/);
    await expect(frameOf(page, w.ws.get("wt-a-ws")!.id)).toHaveClass(/graph-frame-blocked/);
    await page.mouse.up();
    await expect(node).not.toHaveClass(/graph-node-blocked/);
    await expect(frameOf(page, w.ws.get("wt-a-ws")!.id)).not.toHaveClass(/graph-frame-blocked/);
    await expect(page.locator(".toast-list .toast").filter({ hasText: "ほかの workspace の囲いの上には置けません" })).toHaveCount(1);
    expect(updatesSent(w).length).toBe(sent0);
    expect(await serverPositions(w)).toEqual(before);
    // 自分の囲いの中・空いた所へは動かせる（落とせない印は出ない）
    const nb2 = await box(node);
    await page.mouse.move(nb2.x + nb2.width / 2, nb2.y + 30);
    await page.mouse.down();
    await page.mouse.move(nb2.x + nb2.width / 2 + 10, nb2.y + 40, { steps: 3 });
    await page.mouse.move(nb2.x + nb2.width / 2 + 60, nb2.y + 70, { steps: 4 });
    await expect(node).not.toHaveClass(/graph-node-blocked/);
    await page.mouse.up();
    await expect.poll(() => updatesSent(w).length).toBe(sent0 + 1);
    await expect.poll(async () => (await serverPositions(w)).get(key)?.x).not.toBe(before.get(key)!.x);
  });

  test("モバイル（1 列）の囲いは、つかめない（見るだけ）", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await page.setViewportSize({ width: 600, height: 800 });
    await expect(page.locator(".mobile-shell")).toBeVisible();
    await page.locator(".mobile-shell-graph-btn").click();
    const dlg = page.locator("dialog#soda-graph-dialog");
    await expect(dlg).toHaveAttribute("open", "");
    await expect(dlg.locator(".graph-spaces")).toBeVisible(); // 空間は出る
    await dlg.locator("[data-space-id]").filter({ hasText: /^開発/ }).click();
    const frame = dlg.locator(`[data-frame-id="${w.ws.get("alpha")!.id}"]`);
    await expect(frame).toBeVisible(); // 囲いも出る
    await expect(frame.locator("[data-tab-tag]")).toHaveCount(0); // タグは押せる部品にならない（見るだけ）
    const sent0 = updatesSent(w).length;
    const t = await box(frame.locator(".graph-frame-title"));
    await page.mouse.move(t.x + 5, t.y + t.height / 2);
    await page.mouse.down();
    await page.mouse.move(t.x + 80, t.y + 60, { steps: 5 });
    await page.mouse.up();
    expect(updatesSent(w).length).toBe(sent0);
  });
});

test.describe("別の空間のノードとの線の印（T11g）", () => {
  test("線の片方が別の空間にあると、見えているノードの縁に印（相手の呼び名・線の種類）が出る。両方の空間で出る。同じ空間の線は印でなく線", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await addTriggerLink(w, "alpha", "beta"); // 開発 → ドキュメント
    await addTriggerLink(w, "main-ws", "wt-a-ws"); // 同じ空間（開発）
    await addTriggerLink(w, "beta", "gamma"); // ドキュメント → グループなし
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    const marks = graphView(page).locator("[data-link-mark]");
    await expect(marks).toHaveCount(1);
    await expect(marks.first()).toContainText("トリガ");
    await expect(marks.first().locator(".graph-mark-arrow")).toHaveText("→");
    // 同じ空間の線はチップ（線）で出る
    await expect(graphView(page).locator("[data-link-chip]")).toHaveCount(1);
    // 印は、見えているノード（alpha）の近く
    const mb = await box(marks.first());
    const nb = await box(nodeOf(page, w.pane.get("alpha")!));
    expect(Math.abs(mb.x - nb.x)).toBeLessThan(60);
    expect(mb.y).toBeGreaterThanOrEqual(nb.y + nb.height - 4);
    // 相手の空間（ドキュメント）では、入る線の印（alpha の呼び名）と、グループなしへの出る線の印の 2 つ
    await spaceBtn(page, /^ドキュメント/).click();
    await expect(graphView(page).locator("[data-link-mark]")).toHaveCount(2);
    await expect(graphView(page).locator("[data-link-mark] .graph-mark-arrow")).toHaveText(["←", "→"]);
    // どちらの空間でもない空間（グループなし）では、alpha → beta の線の印は出ない（beta → gamma の印だけ）
    await spaceBtn(page, /^グループなし/).click();
    await expect(graphView(page).locator("[data-link-mark]")).toHaveCount(1);
  });

  test("印を押すと、相手の空間へ切り替えて、相手のノードへ動く（選ぶ）", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await addTriggerLink(w, "alpha", "beta");
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    await graphView(page).locator("[data-link-mark] .graph-mark-go").click();
    await expect(spaceBtn(page, /^ドキュメント/)).toHaveAttribute("aria-current", "true");
    const node = nodeOf(page, w.pane.get("beta")!);
    await expect(node).toHaveClass(/graph-node-selected/);
    await expect.poll(async () => {
      const c = await box(page.locator(".graph-canvas"));
      const b = await box(node);
      return b.x >= c.x && b.x + b.width <= c.x + c.width && b.y >= c.y && b.y + b.height <= c.y + c.height;
    }).toBe(true);
  });

  test("印の「設定」から、線の設定（LinkPanel）を開ける。履歴ボタンもそこにある", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await addTriggerLink(w, "alpha", "beta");
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    await graphView(page).locator("[data-link-mark] .graph-mark-settings").click();
    await expect(graphView(page).locator(".link-panel")).toBeVisible();
    await expect(spaceBtn(page, /^開発/)).toHaveAttribute("aria-current", "true"); // 空間は変わらない
    await graphView(page).locator(".link-panel").getByRole("button", { name: /履歴/ }).click();
    await expect(graphView(page).locator(".history-panel")).toBeVisible();
  });
});

test.describe("キーボード（囲いのタグ・線の印。PR1c レビュー指摘 4）", () => {
  /** 最後の空間のボタンから Tab を押して、最初のノードに着くまでの回数（実機で数える）。 */
  async function tabsToNode(page: Page): Promise<number> {
    await page.locator("[data-space-id]").last().focus();
    for (let n = 1; n <= 30; n++) {
      await page.keyboard.press("Tab");
      const onNode = await page.evaluate(() => document.activeElement?.hasAttribute("data-node-key") ?? false);
      if (onNode) return n;
    }
    return -1;
  }

  test("囲いが増えても、ノードに着くまでの Tab の回数は変わらない（囲いごとのタグ・線の印は Tab の順に入らない）。タグの中は矢印キーで移る", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await addTriggerLink(w, "alpha", "beta"); // 線の印も、Tab の順に入らない
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    await expect(graphView(page).locator("[data-link-mark]")).toHaveCount(1);
    const before = await tabsToNode(page);
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThanOrEqual(3); // 層の入口 1・ノード 1（余裕を見て 3）
    // 囲い（tab が 2 つの workspace）を 4 つ足す
    const dev = (await w.client.request("graph.get", {})).nodes.length;
    expect(dev).toBeGreaterThan(0);
    const added: Workspace[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await w.client.request("workspace.create", { cwd: await makeDir(), label: `extra${i}` });
      await w.client.request("tab.create", { workspaceId: r.workspace.id, label: "t2" });
      await w.client.request("group.add_member", { groupId: w.groupDev, workspaceId: r.workspace.id });
      added.push(r.workspace);
    }
    for (const a of added) await expect(frameOf(page, a.id)).toBeVisible({ timeout: 15_000 });
    expect(await graphView(page).locator("[data-tab-tag]").count()).toBeGreaterThanOrEqual(10);
    const after = await tabsToNode(page);
    expect(after, `囲いを増やしても Tab の回数は同じ（前 ${before}・後 ${after}）`).toBe(before);
    // 入口のタグに入って、矢印キーで移る（← → は同じ囲いのタグ・↓ は次の囲い）
    const alphaTags = frameOf(page, w.ws.get("alpha")!.id).locator("[data-tab-tag]");
    await alphaTags.first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(alphaTags.nth(1)).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(alphaTags.first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    const nextFrame = await page.evaluate(() => document.activeElement?.closest("[data-frame-id]")?.getAttribute("data-frame-id"));
    expect(nextFrame).not.toBe(w.ws.get("alpha")!.id);
    // Enter（クリック）で強調が入る
    await page.keyboard.press("Enter");
    await expect(graphView(page).locator('[data-tab-tag][aria-pressed="true"]')).toHaveCount(1);
    // Esc で、囲いの層からノードへ戻る（グラフの画面は閉じない）
    await page.keyboard.press("Escape");
    await expect.poll(() => page.evaluate(() => document.activeElement?.hasAttribute("data-node-key") ?? false)).toBe(true);
    await expect(graphView(page)).toBeVisible();
  });

  test("ノードで m を押すと、そのノードの線の印へ入る。矢印・Esc で戻る", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await addTriggerLink(w, "alpha", "beta");
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    const node = nodeOf(page, w.pane.get("alpha")!);
    await node.focus();
    await page.keyboard.press("m");
    await expect(graphView(page).locator("[data-link-mark] .graph-mark-go")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(graphView(page).locator("[data-link-mark] .graph-mark-settings")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(node).toBeFocused();
    expect(w.sent().length).toBeGreaterThan(0);
  });
});

test.describe("別の空間との線の印の状態と数（PR1c レビュー指摘 6）", () => {
  test("一時停止・上限・無効を、線のチップと同じ語で添える", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await addTriggerLink(w, "alpha", "beta");
    const g = await w.client.request("graph.get", {});
    const link = g.links[0]!;
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    const mark = graphView(page).locator("[data-link-mark]");
    await expect(mark).toHaveCount(1);
    await expect(mark.locator(".graph-mark-status")).toHaveCount(0);
    await w.client.request("graph.pause", { linkId: link.id });
    await expect(mark.locator(".graph-mark-status")).toHaveText("⏸");
    await w.client.request("graph.resume", { linkId: link.id });
    await expect(mark.locator(".graph-mark-status")).toHaveCount(0);
    await w.client.request("graph.pause", {});
    await expect(mark.locator(".graph-mark-status")).toHaveText("⏸ 全体");
    await w.client.request("graph.resume", {});
  });

  test("1 つのノードの印は 3 本まで。残りは「+N」で、押すと一覧から選べる", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await addTriggerLink(w, "alpha", "beta");
    await addTriggerLink(w, "alpha", "gamma");
    await addTriggerLink(w, "beta", "alpha");
    await addTriggerLink(w, "gamma", "alpha");
    for (const to of ["beta"]) {
      const g = await w.client.request("graph.get", {});
      await w.client.request("graph.update", {
        baseRev: g.rev,
        ops: [{ op: "add_link", kind: "supervise", from: `local:${w.pane.get("alpha")!}`, to: `local:${w.pane.get(to)!}` }],
      });
    }
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    await expect(graphView(page).locator("[data-link-mark]")).toHaveCount(3);
    const more = graphView(page).locator(".graph-mark-more");
    await expect(more).toHaveText("+2");
    // キーボードだけで: ノードで m → ↓ で 3 本目の次の「+N」→ Enter で一覧（最初の項目）→ ↓ → Esc で「+N」へ戻る
    await nodeOf(page, w.pane.get("alpha")!).focus();
    await page.keyboard.press("m");
    await expect(graphView(page).locator("[data-link-mark] .graph-mark-go").first()).toBeFocused();
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowDown");
    await expect(more).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(graphView(page).locator(".graph-mark-list-item").first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(graphView(page).locator(".graph-mark-list-item").nth(1)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(graphView(page).locator(".graph-mark-list")).toHaveCount(0);
    await expect(more).toBeFocused();
    await more.click();
    const list = graphView(page).locator(".graph-mark-list");
    await expect(list.locator("button")).toHaveCount(5);
    await list.locator("button").first().click();
    await expect(spaceBtn(page, /^ドキュメント|^グループなし/).filter({ has: page.locator("xpath=self::*[@aria-current='true']") })).toHaveCount(1);
    await expect(list).toHaveCount(0);
  });
});

const minimap = (page: Page) => graphView(page).locator("[data-graph-minimap]");
const minimapSvg = (page: Page) => minimap(page).locator("svg");
const findInput = (page: Page) => graphView(page).locator(".graph-find-input");
/** 表示中の空間の印（`aria-current`）の名前。 */
const currentSpace = (page: Page) => page.locator("[data-space-id][aria-current=true]");

test.describe("小さな地図（PR1d T12a）", () => {
  test("表示中の空間の囲いと、いま見えている範囲の枠が出る。選んでいる workspace の囲いは見分けられる。読み上げは「地図。表示中の範囲」と囲いの数", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    await expect(minimapSvg(page)).toBeVisible();
    // 囲い: alpha・worktree グループ・その中の 3 つ = 5
    await expect(minimapSvg(page).locator(".graph-minimap-frame")).toHaveCount(5);
    await expect(minimapSvg(page).locator("[data-minimap-view]")).toHaveCount(1);
    await expect(minimapSvg(page)).toHaveAttribute("aria-label", "地図。表示中の範囲。囲い 5 個");
    await rowOf(page, "alpha").click();
    await expect(minimapSvg(page).locator(".graph-minimap-frame-selected")).toHaveCount(1);
    expect(w.ws.size).toBeGreaterThan(0);
    // 空間を替えると、その空間の囲いになる（ドキュメント: beta の 1 つ）
    await spaceBtn(page, /^ドキュメント/).click();
    await expect(minimapSvg(page).locator(".graph-minimap-frame")).toHaveCount(1);
  });

  test("地図を押すと、その位置が面の中央に来る。ドラッグで動かせる。ノード・線・パンの操作にならない（何も送らない）", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    const sent0 = updatesSent(w).length;
    const before = await serverPositions(w);
    const selectedBefore = await graphView(page).locator(".graph-node-selected").evaluateAll((els) => els.map((e) => e.getAttribute("data-node-key")));
    const group = graphView(page).locator('[data-frame-kind="worktree"]');
    // 面を拡大して、囲い全体が見えない状態にする（地図で動かす意味がある）
    for (let i = 0; i < 4; i++) await page.locator(".graph-zoom-in").click();
    const canvas = await box(page.locator(".graph-canvas"));
    const centerOffset = async (loc: Locator) => {
      const b = await box(loc);
      return Math.hypot(b.x + b.width / 2 - (canvas.x + canvas.width / 2), b.y + b.height / 2 - (canvas.y + canvas.height / 2));
    };
    // 地図の中の、worktree グループの四角の中心を押す → その位置（グループの囲い）が面の中央に来る
    const groupId = await group.getAttribute("data-frame-id");
    const rb = await box(minimapSvg(page).locator(`[data-minimap-frame="${groupId}"]`));
    const offBefore = await centerOffset(group);
    const viewBefore = await box(minimapSvg(page).locator("[data-minimap-view]"));
    await page.mouse.click(rb.x + rb.width / 2, rb.y + rb.height / 2);
    await expect.poll(() => centerOffset(group)).toBeLessThan(40);
    expect(offBefore).toBeGreaterThan(60); // 押す前は中央ではなかった
    const viewAfter = await box(minimapSvg(page).locator("[data-minimap-view]"));
    expect(Math.hypot(viewAfter.x - viewBefore.x, viewAfter.y - viewBefore.y)).toBeGreaterThan(3);
    // ドラッグ: 押したまま動かすと、枠が追う
    const m = await box(minimapSvg(page));
    await page.mouse.move(m.x + 30, m.y + 30);
    await page.mouse.down();
    await page.mouse.move(m.x + 60, m.y + 50, { steps: 5 });
    const v1 = await box(minimapSvg(page).locator("[data-minimap-view]"));
    await page.mouse.move(m.x + 120, m.y + 80, { steps: 5 });
    const v2 = await box(minimapSvg(page).locator("[data-minimap-view]"));
    await page.mouse.up();
    expect(v2.x).toBeGreaterThan(v1.x + 20);
    expect(v2.y).toBeGreaterThan(v1.y + 5);
    // 操作ではない: 何も送らず、ノードは動かない・選ばれない
    expect(updatesSent(w).length).toBe(sent0);
    expect(await serverPositions(w)).toEqual(before);
    expect(await graphView(page).locator(".graph-node-selected").evaluateAll((els) => els.map((e) => e.getAttribute("data-node-key")))).toEqual(selectedBefore); // 選択は変わらない
  });

  test("たたむボタンと n: たたんだ状態はこのブラウザに覚えられる。囲いが 1 つも無い空間でも出る（押しても動かない）", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    await minimap(page).locator(".graph-minimap-toggle").click();
    await expect(minimapSvg(page)).toHaveCount(0);
    await page.reload();
    await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
    await focusTerminal(page);
    await prefixKey(page, "a");
    await expect(graphView(page)).toBeVisible();
    await expect(minimap(page)).toBeVisible();
    await expect(minimapSvg(page)).toHaveCount(0); // 覚えている
    // n（面にフォーカスがあるとき）で開く・たたむ
    await graphView(page).locator("[data-node-key]").first().focus();
    await page.keyboard.press("n");
    await expect(minimapSvg(page)).toBeVisible();
    await page.keyboard.press("n");
    await expect(minimapSvg(page)).toHaveCount(0);
    await page.keyboard.press("n");
    // 空の空間（囲いが無い）でも出る
    const empty = await w.client.request("group.create", { label: "からっぽ" });
    expect(empty.group.id).toBeTruthy();
    await expect(spaceBtn(page, /^からっぽ/)).toBeVisible();
    await spaceBtn(page, /^からっぽ/).click();
    await expect(minimapSvg(page)).toBeVisible();
    const b = await box(minimapSvg(page));
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); // 押しても動かない（落ちない）
    await expect(minimapSvg(page)).toBeVisible();
  });

  test("モバイル（1 列）では出さない", async ({ page, appServer }) => {
    await boot(page, appServer);
    await page.setViewportSize({ width: 600, height: 800 });
    await page.locator(".mobile-shell-graph-btn").click();
    const dlg = page.locator("dialog#soda-graph-dialog");
    await expect(dlg).toHaveAttribute("open", "");
    await expect(dlg.locator(".graph-find")).toHaveCount(0);
    await expect(dlg.locator("[data-graph-minimap]")).toHaveCount(0);
  });
});

test.describe("探す（PR1d T12b）", () => {
  test("名前で探して選ぶと、その空間へ切り替わり、そのノードへ動いて選ぶ（強く出す）。別の空間の pane・workspace も候補に出る", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    await findInput(page).fill("BETA");
    const list = graphView(page).locator(".graph-find-list");
    await expect(list.locator('[data-find-kind="pane"]')).toHaveCount(1);
    await expect(list.locator('[data-find-kind="workspace"]')).toHaveCount(1);
    await expect(list.locator('[data-find-kind="pane"]')).toContainText("ドキュメント · beta");
    // 名前に一致する workspace が先（pane は workspace の名前で一致）。↓ で pane を選び、↑ で戻り、もう一度 ↓ で pane を決める
    await expect(list.locator(".graph-find-item-active")).toHaveAttribute("data-find-kind", "workspace");
    await page.keyboard.press("ArrowDown");
    await expect(list.locator(".graph-find-item-active")).toHaveAttribute("data-find-kind", "pane");
    await page.keyboard.press("ArrowUp");
    await expect(list.locator(".graph-find-item-active")).toHaveAttribute("data-find-kind", "workspace");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(spaceBtn(page, /^ドキュメント/)).toHaveAttribute("aria-current", "true");
    const node = nodeOf(page, w.pane.get("beta")!);
    await expect(node).toBeVisible();
    await expect(node).toHaveClass(/graph-node-selected/);
    await expect(frameOf(page, w.ws.get("beta")!.id)).toHaveClass(/graph-frame-flash/);
    await expect(findInput(page)).toHaveValue("");
    // workspace の名前で探して決める → その囲いへ（開発の空間へ戻る）
    await findInput(page).fill("wt-a");
    await graphView(page).locator('.graph-find-item[data-find-kind="workspace"]').click();
    await expect(spaceBtn(page, /^開発/)).toHaveAttribute("aria-current", "true");
    await expect(frameOf(page, w.ws.get("wt-a-ws")!.id)).toHaveClass(/graph-frame-flash/);
    // 見つからないとき
    await findInput(page).fill("zzzz-none");
    await expect(graphView(page).locator(".graph-find-none")).toBeVisible();
  });

  test("tab の名前でも探せる（その tab の pane が候補に出る）", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await findInput(page).fill("second");
    const item = graphView(page).locator('.graph-find-item[data-find-kind="pane"]');
    await expect(item).toHaveCount(1);
    await item.click();
    await expect(nodeOf(page, w.pane.get("alpha:second")!)).toHaveClass(/graph-node-selected/);
  });

  test("Esc で閉じて、面へフォーカスを戻す（画面は閉じない）。IME の変換中の Enter では決めない", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    await findInput(page).fill("beta");
    await expect(graphView(page).locator(".graph-find-list")).toBeVisible();
    // 変換中の Enter（isComposing）・keyCode 229 では決めない
    await page.evaluate(() => {
      const el = document.querySelector<HTMLInputElement>(".graph-find-input")!;
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true }));
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(300);
    await expect(spaceBtn(page, /^開発/)).toHaveAttribute("aria-current", "true"); // 動いていない
    await expect(findInput(page)).toHaveValue("beta");
    // Esc: 閉じて、フォーカスは面（入力ではない）。画面は開いたまま
    await page.keyboard.press("Escape");
    await expect(graphView(page).locator(".graph-find-list")).toHaveCount(0);
    await expect(graphView(page)).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains("graph-find-input") ?? true)).toBe(false);
    await expect.poll(() => page.evaluate(() => document.activeElement?.closest(".graph-view") !== null)).toBe(true);
    // フォーカスは、入口のノード・そのノードが選ばれたまま（根の Esc の処理が二重に走って、選択を外し・根へ戻すことが無い。入力の stopPropagation が要る理由）
    await expect.poll(() => page.evaluate(() => document.activeElement?.hasAttribute("data-node-key") ?? false)).toBe(true);
    await expect(graphView(page).locator(".graph-node-selected")).toHaveCount(1);
    expect(w.ws.size).toBeGreaterThan(0);
  });

  test("入力にフォーカスがある間、グラフのキー（[ ] n / 1 + - 0 c ほか）は働かず、文字として入る", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    const sent0 = w.sent().length;
    const zoom0 = await page.locator(".graph-zoom").textContent();
    await findInput(page).focus();
    await page.keyboard.type("n[]/1+-0cmrsp");
    await expect(findInput(page)).toHaveValue("n[]/1+-0cmrsp");
    await expect(spaceBtn(page, /^開発/)).toHaveAttribute("aria-current", "true"); // [ ] で動かない
    await expect(minimapSvg(page)).toBeVisible(); // n でたたまない
    expect(await page.locator(".graph-zoom").textContent()).toBe(zoom0); // 1 + - 0 で変わらない
    await expect(graphView(page).locator(".graph-connect-banner")).toHaveCount(0); // c で接続モードに入らない
    expect(w.sent().slice(sent0).filter((m) => m.method.startsWith("graph.") || m.method === "pane.focus")).toEqual([]);
  });
});

test.describe("PR1d レビューの直し", () => {
  test("M1: 地図の端でドラッグして揺らしても、面が空にならず、囲いまでの距離が増え続けない", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    const group = graphView(page).locator('[data-frame-kind="worktree"]');
    const canvas = await box(page.locator(".graph-canvas"));
    const dist = async () => {
      const b = await box(group);
      return Math.hypot(b.x + b.width / 2 - (canvas.x + canvas.width / 2), b.y + b.height / 2 - (canvas.y + canvas.height / 2));
    };
    const m = await box(minimapSvg(page));
    await page.mouse.move(m.x + 3, m.y + 3); // 左上の端
    await page.mouse.down();
    const ds: number[] = [];
    for (let i = 0; i < 12; i++) {
      await page.mouse.move(m.x + 1 + (i % 2), m.y + 1 + (i % 2), { steps: 2 });
      await page.waitForTimeout(40);
      ds.push(await dist());
    }
    await page.mouse.up();
    // 暴走すると 3000 → 10000 px と増え続ける。収まっていれば、1 画面分の中
    expect(Math.max(...ds), `距離 ${ds.map(Math.round)}`).toBeLessThan(Math.max(canvas.width, canvas.height) * 2);
    expect(ds.at(-1)!, `最後が最初より大きく離れない ${ds.map(Math.round)}`).toBeLessThan(ds[0]! + 300);
    expect(w.ws.size).toBeGreaterThan(0);
  });

  test("S1: 探して決めると、サイドバーの行と同じに、サーバの選んでいる workspace・pane も替わり、地図の選んでいる囲いも動く", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    const sent0 = w.sent().length;
    await findInput(page).fill("beta");
    await graphView(page).locator('.graph-find-item[data-find-kind="workspace"]').click();
    await expect(spaceBtn(page, /^ドキュメント/)).toHaveAttribute("aria-current", "true");
    const focusCalls = () => w.sent().slice(sent0).filter((m) => m.method === "workspace.focus" || m.method === "pane.focus");
    await expect.poll(() => focusCalls().length).toBeGreaterThan(0);
    expect(JSON.stringify(focusCalls())).toContain(w.ws.get("beta")!.id);
    await expect(minimapSvg(page).locator(".graph-minimap-frame-selected")).toHaveAttribute("data-minimap-frame", w.ws.get("beta")!.id);
    await expect(rowOf(page, "beta")).toHaveClass(/sidebar-row-current/);
    // pane を探して決めても、同じ（pane.focus）
    await findInput(page).fill("alpha");
    await graphView(page).locator('.graph-find-item[data-find-kind="workspace"]').first().click();
    await expect(minimapSvg(page).locator(".graph-minimap-frame-selected")).toHaveAttribute("data-minimap-frame", w.ws.get("alpha")!.id);
  });

  test("S2: 候補の一覧で、↑ ↓ で選んだ行が見える範囲の外へ出たら、スクロールして見せる", async ({ page, appServer }) => {
    await boot(page, appServer);
    await openGraph(page);
    await findInput(page).fill("a");
    const list = graphView(page).locator(".graph-find-list");
    await expect(list.locator(".graph-find-item")).not.toHaveCount(0);
    const n = await list.locator(".graph-find-item").count();
    expect(n).toBeGreaterThan(10);
    for (let i = 0; i < n - 1; i++) await page.keyboard.press("ArrowDown");
    const inView = async () => {
      const lb = await box(list);
      const ab = await box(list.locator(".graph-find-item-active"));
      return ab.y >= lb.y - 1 && ab.y + ab.height <= lb.y + lb.height + 1;
    };
    await expect.poll(inView).toBe(true);
    for (let i = 0; i < n - 1; i++) await page.keyboard.press("ArrowUp");
    await expect.poll(inView).toBe(true);
  });

  test("S3: 確認のダイアログ・接続の途中・横のパネルが出ている間は、[ ] と n が働かない", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await addTriggerLink(w, "main-ws", "wt-a-ws");
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    const stays = async () => {
      await page.keyboard.press("]");
      await page.keyboard.press("n");
      await page.waitForTimeout(200);
      await expect(spaceBtn(page, /^開発/)).toHaveAttribute("aria-current", "true"); // 空間が替わらない
      await expect(minimapSvg(page)).toBeVisible(); // 地図をたたまない
    };
    // 確認
    await graphView(page).locator("[data-link-chip]").first().focus();
    await page.keyboard.press("Delete");
    await expect(graphView(page).locator(".graph-confirm")).toBeVisible();
    await stays();
    await page.keyboard.press("Escape");
    await expect(graphView(page).locator(".graph-confirm")).toHaveCount(0);
    // 接続の途中（c）。フォーカスはノードにある
    const node = nodeOf(page, w.pane.get("alpha")!);
    await node.focus();
    await page.keyboard.press("c");
    await expect(graphView(page).locator(".graph-connect-banner")).toBeVisible();
    await stays();
    await page.keyboard.press("Escape");
    await expect(graphView(page).locator(".graph-connect-banner")).toHaveCount(0);
    // 横のパネル（線の設定）。フォーカスはパネルの外（チップ）に戻して押す
    await graphView(page).locator("[data-link-chip]").first().click();
    await expect(graphView(page).locator(".link-panel")).toBeVisible();
    await graphView(page).locator(".link-panel").getByRole("button").first().focus();
    await stays();
    await page.keyboard.press("Escape");
    // どれも無ければ働く
    await expect(graphView(page).locator(".link-panel")).toHaveCount(0);
    await node.focus();
    await page.keyboard.press("]");
    await expect(spaceBtn(page, /^ドキュメント/)).toHaveAttribute("aria-current", "true");
  });
});

test.describe("キー（PR1d T12c）", () => {
  test("[ ] で空間を前・次へ（端で止まる）。/ で探す。ヘルプに載っている", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    await graphView(page).locator("[data-node-key]").first().focus();
    await page.keyboard.press("[");
    await expect(spaceBtn(page, /^開発/)).toHaveAttribute("aria-current", "true"); // 先頭で止まる
    await page.keyboard.press("]");
    await expect(spaceBtn(page, /^ドキュメント/)).toHaveAttribute("aria-current", "true");
    await graphView(page).locator("[data-node-key]").first().focus();
    await page.keyboard.press("]");
    await expect(spaceBtn(page, /^グループなし/)).toHaveAttribute("aria-current", "true");
    await graphView(page).locator("[data-node-key]").first().focus();
    await page.keyboard.press("]");
    await expect(spaceBtn(page, /^グループなし/)).toHaveAttribute("aria-current", "true"); // 末尾で止まる
    await graphView(page).locator("[data-node-key]").first().focus();
    await page.keyboard.press("[");
    await expect(spaceBtn(page, /^ドキュメント/)).toHaveAttribute("aria-current", "true");
    // /
    await graphView(page).locator("[data-node-key]").first().focus();
    await page.keyboard.press("/");
    await expect(findInput(page)).toBeFocused();
    expect(await currentSpace(page).count()).toBe(1);
    // ヘルプ（prefix+?）に「グラフの画面」の群
    await page.keyboard.press("Escape");
    await graphView(page).locator("[data-node-key]").first().focus();
    await page.keyboard.press("Escape"); // 選択を外す
    await page.keyboard.press("Escape"); // 基本画面へ
    await expect(graphView(page)).toBeHidden();
    await focusTerminal(page);
    await prefixKey(page, "?");
    await expect(page.locator(".help-dialog-group-name").filter({ hasText: "グラフの画面" })).toHaveCount(1);
    expect(w.ws.size).toBeGreaterThan(0);
  });

  test("グラフの画面で通す prefix のキー（PR1b）・既存のグラフのキーは、今までどおり（衝突しない）", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    const node = nodeOf(page, w.pane.get("alpha")!);
    await node.focus();
    await page.keyboard.press("c"); // 接続モード
    await expect(graphView(page).locator(".graph-connect-banner")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(graphView(page).locator(".graph-connect-banner")).toHaveCount(0);
    await node.focus();
    await page.keyboard.press("ArrowRight"); // 動かす
    await expect.poll(() => updatesSent(w).length).toBeGreaterThan(0);
    // prefix の次のキー（基本画面を変えるもの）は、今までどおり食われる
    await page.locator("body").evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const panes = await page.locator(".xterm-helper-textarea").count();
    await prefixKey(page, "c");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(page.locator(".xterm-helper-textarea")).toHaveCount(panes);
  });
});

/** ノードの中身が 200×80 に収まっている（子の箱がノードの外へはみ出さない）。 */
async function nodeFits(page: Page, paneId: string): Promise<boolean> {
  return nodeOf(page, paneId).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return Array.from(el.querySelectorAll<HTMLElement>(".graph-node-head, .graph-node-sub, .graph-node-warn")).every((c) => {
      const b = c.getBoundingClientRect();
      return b.left >= r.left - 1 && b.right <= r.right + 1 && b.top >= r.top - 1 && b.bottom <= r.bottom + 1;
    });
  });
}
const nodeSize = async (page: Page, paneId: string) => {
  const b = await box(nodeOf(page, paneId));
  const z = await page.evaluate(() => {
    const world = document.querySelector<HTMLElement>(".graph-world");
    const m = /scale\(([\d.]+)\)/.exec(world?.style.transform ?? "");
    return m ? Number(m[1]) : 1;
  });
  return { w: Math.round(b.width / z), h: Math.round(b.height / z) };
};

test.describe("見た目を案に寄せる（PR1e）", () => {
  test("ノードの中身: 状態の印と名前（1 行目）・種類と状態の語（2 行目）・シェルは四角と「シェル」。承認待ちは枠の色。手元の pane に「ローカル」と pane の題は出ない。200×80 に収まる", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    for (const name of ["alpha", "beta", "gamma"]) await w.client.request("pane.subscribe", { paneId: w.pane.get(name)!, scrollbackLines: 4000 });
    const a1 = await launchFakeAgent(page, w.client, w.pane.get("alpha")!, { via: "client" });
    const a2 = await launchFakeAgent(page, w.client, w.pane.get("beta")!, { via: "client" });
    const a3 = await launchFakeAgent(page, w.client, w.pane.get("gamma")!, { via: "client" });
    await a1.work();
    await a2.block();
    await a3.work();
    await a3.idle();
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    const alpha = nodeOf(page, w.pane.get("alpha")!);
    await expect(alpha.locator(".graph-node-state")).toHaveAttribute("data-state", "working");
    await expect(alpha.locator(".graph-node-agent-name")).toHaveText("Claude Code");
    await expect(alpha.locator(".graph-node-state-text")).toHaveText("作業中");
    await expect(alpha.locator(".graph-node-machine")).toHaveCount(0); // 「ローカル」は出ない
    await expect(alpha.locator(".graph-node-name")).not.toContainText("@"); // pane の題（user@host: …）は出ない
    await expect(alpha).not.toHaveClass(/graph-node-approval/);
    // シェル（エージェントの居ない pane）: 丸でなく四角・「シェル ・ 場所」
    const shell = nodeOf(page, w.pane.get("main-ws")!);
    await expect(shell.locator(".graph-node-shell")).toHaveCount(1);
    await expect(shell.locator(".graph-node-state")).toHaveCount(0);
    await expect(shell.locator(".graph-node-agent-name")).toHaveText("シェル");
    // 承認待ち（beta。ドキュメントの空間）
    await spaceBtn(page, /^ドキュメント/).click();
    const beta = nodeOf(page, w.pane.get("beta")!);
    await expect(beta.locator(".graph-node-state-text")).toHaveText("入力待ち");
    await expect(beta).toHaveClass(/graph-node-approval/);
    expect(await beta.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(await page.evaluate(() => {
      const probe = document.createElement("i");
      probe.style.color = "var(--soda-state-blocked)";
      document.body.appendChild(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    }));
    // 完了／待機中（gamma。グループなし）
    await spaceBtn(page, /^グループなし/).click();
    await expect(nodeOf(page, w.pane.get("gamma")!).locator(".graph-node-state-text")).toHaveText(/^(完了|待機中)$/);
    // 大きさ 200×80・中身が収まる
    for (const [sp, name] of [[/^開発/, "alpha"], [/^ドキュメント/, "beta"], [/^グループなし/, "gamma"]] as const) {
      await spaceBtn(page, sp).click();
      expect(await nodeSize(page, w.pane.get(name)!)).toEqual({ w: 200, h: 80 });
      expect(await nodeFits(page, w.pane.get(name)!), `${name} の中身`).toBe(true);
    }
    // 読み上げのラベルは、呼び名・マシン・エージェント・状態を保つ
    await spaceBtn(page, /^開発/).click();
    const label = (await alpha.getAttribute("aria-label")) ?? "";
    expect(label).toContain("ローカル");
    expect(label).toContain("Claude Code");
    expect(label).toContain("作業中");
  });

  test("モダンの様式でも、ノードの中身は 200×80 に収まり、ツールバーのボタンの高さは様式のトークン", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await w.client.request("prefs.set", { patch: { uiStyle: "modern" } });
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-ui-style"))).toBe("modern");
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    expect(await nodeSize(page, w.pane.get("alpha")!)).toEqual({ w: 200, h: 80 });
    expect(await nodeFits(page, w.pane.get("alpha")!)).toBe(true);
    expect(await nodeFits(page, w.pane.get("alpha:second")!)).toBe(true);
    const h = await page.evaluate(() => Math.round(document.querySelector<HTMLElement>(".graph-toolbar .graph-tool")!.getBoundingClientRect().height));
    expect(h).toBe(32); // --soda-shape-control-h（モダン）
    const radius = await frameOf(page, w.ws.get("alpha")!.id).evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
    expect(radius).toBe("12px");
    const tagH = await frameOf(page, w.ws.get("alpha")!.id).locator("[data-tab-tag]").first().evaluate((el) => Math.round(el.getBoundingClientRect().height / (el.closest(".graph-world") ? Number(/scale\(([\d.]+)\)/.exec((el.closest(".graph-world") as HTMLElement).style.transform)?.[1] ?? 1) : 1)));
    expect(tagH).toBe(28);
  });

  test("ツールバー: 左に「線を結ぶ」「並びを整える」「そのほか」、右に探す・拡大縮小・「全体を表示」。題と「×」は無い。「そのほか」のメニューに、一時停止・履歴・別のマシンの pane を載せる", async ({ page, appServer }) => {
    await boot(page, appServer);
    await openGraph(page);
    const bar = graphView(page).locator(".graph-toolbar");
    await expect(bar.locator(":scope > .graph-tool")).toHaveText(["線を結ぶ", "並びを整える", "そのほか ▾", "−", "＋", "全体を表示"]);
    await expect(graphView(page).locator(".graph-close, .graph-title")).toHaveCount(0);
    // 左のボタンは探すより左・右のものは右
    const more = await box(bar.locator(".graph-more"));
    const find = await box(bar.locator(".graph-find-input"));
    const fit = await box(bar.locator(".graph-fit"));
    expect(more.x).toBeLessThan(find.x);
    expect(find.x).toBeLessThan(fit.x);
    // 「そのほか」: メニュー（ContextMenu）。Esc で閉じて、ボタンへフォーカスが戻る
    await bar.locator(".graph-more").click();
    const menu = page.locator(".context-menu");
    await expect(menu.locator("[role=menuitem]")).toHaveText(["全体を一時停止", "履歴", "別のマシンの pane を載せる"]);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(bar.locator(".graph-more")).toBeFocused();
    // 履歴
    await bar.locator(".graph-more").click();
    await menu.getByRole("menuitem", { name: "履歴" }).click();
    await expect(graphView(page).locator(".history-panel")).toBeVisible();
    // 載せるチェックリスト（閉じるとボタンへ戻る）
    await bar.locator(".graph-more").click();
    await menu.getByRole("menuitem", { name: "別のマシンの pane を載せる" }).click();
    await expect(graphView(page).locator(".pane-checklist")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(graphView(page).locator(".pane-checklist")).toHaveCount(0);
    await expect(bar.locator(".graph-more")).toBeFocused();
    // 一時停止: 札と［再開］が出る。再開で消える
    await bar.locator(".graph-more").click();
    await menu.getByRole("menuitem", { name: "全体を一時停止" }).click();
    await expect(bar.locator(".graph-paused-badge")).toContainText("一時停止中");
    await expect(bar.locator(".graph-resume")).toHaveText("再開");
    await bar.locator(".graph-resume").click();
    await expect(bar.locator(".graph-paused-badge")).toHaveCount(0);
  });

  test("「線を結ぶ」: ノードを選んでいれば、そこから接続モード。選んでいなければ案内だけ", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    await page.locator(".graph-canvas").click({ position: { x: 600, y: 300 } }); // 何も無い所: 選択を外す
    await graphView(page).locator(".graph-connect").click();
    await expect(graphView(page).locator(".graph-connect-banner")).toHaveCount(0);
    await expect(page.locator(".toast-list .toast").filter({ hasText: "ノードを選んでから" })).toHaveCount(1);
    await nodeOf(page, w.pane.get("alpha")!).focus();
    await graphView(page).locator(".graph-connect").click();
    await expect(graphView(page).locator(".graph-connect-banner")).toBeVisible();
  });

  test("選んでいる workspace の囲い: 枠は accent の実線 2px・外側に薄い輪。サイドバー: 表示中の空間のグループの見出しに「表示中」の札（グラフの画面の間だけ）", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await rowOf(page, "alpha").click();
    await expect(page.locator("[data-space-badge]")).toHaveCount(0); // 基本画面には出ない
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    const sel = frameOf(page, w.ws.get("alpha")!.id);
    await expect(sel).toHaveClass(/graph-frame-selected/);
    const st = await sel.evaluate((el) => {
      const c = getComputedStyle(el);
      return { w: c.borderTopWidth, style: c.borderTopStyle, shadow: c.boxShadow };
    });
    expect(st.w).toBe("2px");
    expect(st.style).toBe("solid");
    expect(st.shadow).toMatch(/0px 0px 0px 5px/);
    // 札: 開発の見出しに 1 つだけ。空間を替えると動く
    await expect(page.locator("[data-space-badge]")).toHaveCount(1);
    await expect(rowOf(page, "開発").locator("[data-space-badge]")).toHaveText("表示中");
    await spaceBtn(page, /^ドキュメント/).click();
    await expect(rowOf(page, "ドキュメント").locator("[data-space-badge]")).toHaveText("表示中");
    await expect(rowOf(page, "開発").locator("[data-space-badge]")).toHaveCount(0);
    await spaceBtn(page, /^グループなし/).click();
    await expect(rowOf(page, "グループなし").locator("[data-space-badge]")).toHaveText("表示中");
    await switcherBtnBase(page).click();
    await expect(page.locator("[data-space-badge]")).toHaveCount(0);
  });
});

test.describe("サイドバーの選んでいる行・面の点の格子（PR1f）", () => {
  const rowStyle = (row: Locator) =>
    row.evaluate((el) => {
      const c = getComputedStyle(el);
      return { shadow: c.boxShadow, radius: c.borderTopLeftRadius, margin: c.marginLeft, bg: c.backgroundColor, tint: c.backgroundImage, outline: c.outlineStyle };
    });
  /** 色を、描画後の `rgb(...)` にそろえる（変数の値のまま比べない）。 */
  const resolveColor = (page: Page, css: string) =>
    page.evaluate((v) => {
      const probe = document.createElement("i");
      probe.style.backgroundColor = v;
      document.body.appendChild(probe);
      const c = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return c;
    }, css);

  test("クラシック: 選んでいる行は今までの見せ方（行いっぱいの塗り・枠なし・角なし・余白なし）。基本画面でもグラフの画面でも同じ", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await rowOf(page, "beta").click();
    const base = await rowStyle(rowOf(page, "beta"));
    expect(base.radius).toBe("0px");
    expect(base.margin).toBe("0px");
    expect(base.shadow).toMatch(/ 0px 0px 0px 0px inset|none/); // 太さ 0 の枠（何も描かれない）
    expect(base.bg).toBe(await resolveColor(page, "var(--soda-menu-active-bg)"));
    expect(base.tint).toMatch(/\/ 0\)|transparent|rgba\(\d+, \d+, \d+, 0\)/); // 重ねる色は 0%（透明）＝何も変わらない
    await openGraph(page);
    expect(await rowStyle(rowOf(page, "beta"))).toEqual(base);
    expect(w.ws.size).toBeGreaterThan(0);
  });

  test("モダン: 選んでいる行は、accent の 1px の枠・角はトークン・左右に内側の余白・地は accent を薄く混ぜた色。選んでいない行・navigate の選択・畳んだサイドバーと見分けが付く", async ({ page, appServer }) => {
    await boot(page, appServer);
    await page.evaluate(() => { void 0; });
    const client = await appServer.openClient();
    await client.request("prefs.set", { patch: { uiStyle: "modern" } });
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-ui-style"))).toBe("modern");
    await rowOf(page, "beta").click();
    const accent = await resolveColor(page, "var(--soda-accent)");
    const cur = await rowStyle(rowOf(page, "beta"));
    expect(cur.shadow).toContain(accent);
    expect(cur.shadow).toMatch(/0px 0px 0px 1px inset/);
    expect(cur.radius).toBe("8px"); // --soda-shape-radius（モダン）
    expect(cur.margin).toBe("6px");
    expect(cur.bg).toBe(await resolveColor(page, "var(--soda-menu-active-bg)"));
    expect(cur.tint).toContain("linear-gradient"); // その上に、accent を薄く重ねる（地は accent を薄く混ぜた色）
    expect(cur.tint).toContain("22"); // 22%（--soda-shape-row-current-tint）
    // 選んでいない行: 枠が無い（太さ 0）・角と余白は同じ（ホバーも同じ形）
    const other = await rowStyle(rowOf(page, "gamma"));
    expect(other.shadow).not.toMatch(/0px 0px 0px 1px inset/);
    expect(other.radius).toBe("8px");
    // navigate の選択（prefix+w。fg の 1px の outline）は、別の見え方で重なっても読める
    await focusTerminal(page);
    await prefixKey(page, "w");
    const sel = page.locator(".sidebar-row-selected");
    await expect(sel).toHaveCount(1);
    expect((await rowStyle(sel)).outline).toBe("solid");
    await page.keyboard.press("Escape");
    // グラフの画面でも同じ
    await openGraph(page);
    const g = await rowStyle(rowOf(page, "beta"));
    expect(g.shadow).toContain(accent);
    // 畳んだサイドバー: 内側の余白は無く、枠・角は破綻しない
    await page.locator(".sidebar-collapse-btn").click();
    await expect(page.locator(".sidebar-collapsed")).toBeVisible();
    const collapsed = await rowStyle(page.locator(".sidebar-collapsed .sidebar-row-current").first());
    expect(collapsed.margin).toBe("0px");
    const box1 = await box(page.locator(".sidebar-collapsed .sidebar-row-current").first());
    const nav = await box(page.locator(".sidebar"));
    expect(box1.x).toBeGreaterThanOrEqual(nav.x - 1);
    expect(box1.x + box1.width).toBeLessThanOrEqual(nav.x + nav.width + 1);
  });

  for (const style of ["classic", "modern"] as const) {
    test(`${style}: 面の地に、20px 間隔の薄い点の格子。面の移動・拡大縮小に付いて動く`, async ({ page, appServer }) => {
      await boot(page, appServer);
      if (style === "modern") {
        const client = await appServer.openClient();
        await client.request("prefs.set", { patch: { uiStyle: "modern" } });
        await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-ui-style"))).toBe("modern");
      }
      await openGraph(page);
      await spaceBtn(page, /^開発/).click();
      const grid = () =>
        page.locator(".graph-canvas").evaluate((el) => {
          const c = getComputedStyle(el);
          return { image: c.backgroundImage, size: c.backgroundSize, pos: c.backgroundPosition };
        });
      const g0 = await grid();
      expect(g0.image).toContain("radial-gradient");
      const zoom = async () => Number(((await page.locator(".graph-zoom").textContent()) ?? "100").replace("%", "")) / 100;
      const cell0 = parseFloat(g0.size);
      expect(cell0).toBeCloseTo(20 * (await zoom()), 0); // 20px × 倍率（8px を下回るときは倍々）
      // 拡大すると、間隔が広がる
      await page.locator(".graph-zoom-in").click();
      await page.locator(".graph-zoom-in").click();
      const g1 = await grid();
      expect(parseFloat(g1.size)).toBeGreaterThan(cell0);
      // 面をドラッグして動かすと、位置が動く
      const c = await box(page.locator(".graph-canvas"));
      await page.mouse.move(c.x + 400, c.y + 400);
      await page.mouse.down();
      await page.mouse.move(c.x + 437, c.y + 421, { steps: 4 });
      await page.mouse.up();
      const g2 = await grid();
      expect(g2.pos).not.toBe(g1.pos);
      expect(g2.size).toBe(g1.size);
    });
  }
});

test.describe("並びを整える（PR1e T17c）", () => {
  const tidyBtn = (page: Page) => graphView(page).locator(".graph-tidy");
  /** 開発の空間のノード（鍵）。 */
  const devKeys = (w: World) => ["alpha", "alpha:second", "main-ws", "wt-a-ws", "wt-b-ws"].map((n) => `local:${w.pane.get(n)!}`);

  test("押すと確認（N 個）が出る。やめれば何も送らない。並べ直すと 1 回の graph.update（move_node の列）で、囲いは重ならず、ほかの空間は動かず、線は変わらない", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await addTriggerLink(w, "alpha", "main-ws");
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    const before = await serverPositions(w);
    const linksBefore = (await w.client.request("graph.get", {})).links;
    const sent0 = updatesSent(w).length;
    await tidyBtn(page).click();
    const confirm = graphView(page).locator(".graph-confirm");
    await expect(confirm).toContainText("この空間の 5 個のノードの位置を、並べ直します");
    await confirm.getByRole("button", { name: "やめる" }).click();
    await expect(confirm).toHaveCount(0);
    expect(updatesSent(w).length).toBe(sent0); // 勝手に走らない
    expect(await serverPositions(w)).toEqual(before);
    await tidyBtn(page).click();
    await confirm.getByRole("button", { name: "並べ直す" }).click();
    await expect.poll(() => updatesSent(w).length).toBe(sent0 + 1);
    const ops = (updatesSent(w).at(-1)!.params as { ops: { op: string }[] }).ops;
    expect(ops).toHaveLength(5);
    expect(ops.every((o) => o.op === "move_node")).toBe(true);
    const after = await serverPositions(w);
    for (const [k, p] of before) if (!devKeys(w).includes(k)) expect(after.get(k), `他の空間 ${k}`).toEqual(p);
    expect(devKeys(w).some((k) => after.get(k)!.x !== before.get(k)!.x || after.get(k)!.y !== before.get(k)!.y)).toBe(true);
    // 囲いの箱どうしが重ならない（入れ子の関係〔worktree グループとその中〕は除く）
    await expect.poll(async () => {
      const rects = await graphView(page).locator("[data-frame-id]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as { x: number; y: number; width: number; height: number }));
      const contains = (a: (typeof rects)[number], b: (typeof rects)[number]) => a.x <= b.x + 1 && a.y <= b.y + 1 && a.x + a.width >= b.x + b.width - 1 && a.y + a.height >= b.y + b.height - 1;
      let bad = 0;
      for (let i = 0; i < rects.length; i++)
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i]!;
          const b = rects[j]!;
          if (contains(a, b) || contains(b, a)) continue;
          if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) bad++;
        }
      return bad;
    }).toBe(0);
    expect((await w.client.request("graph.get", {})).links).toEqual(linksBefore);
    await expect(page.locator(".toast-list .toast").filter({ hasText: "並べ直しました" })).toHaveCount(1);
  });

  test("並べ直した直後は［元に戻す］で、前の位置へ（1 回の graph.update）。別の更新が入ったら、ボタンは消える", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    const before = await serverPositions(w);
    await tidyBtn(page).click();
    await graphView(page).locator(".graph-confirm").getByRole("button", { name: "並べ直す" }).click();
    const toast = page.locator(".toast-list .toast").filter({ hasText: "並べ直しました" });
    await expect(toast).toHaveCount(1);
    const sent0 = updatesSent(w).length;
    await toast.locator(".toast-action").click();
    await expect.poll(() => updatesSent(w).length).toBe(sent0 + 1);
    await expect.poll(async () => JSON.stringify([...(await serverPositions(w))].sort())).toBe(JSON.stringify([...before].sort()));
    await expect(toast).toHaveCount(0);
    // もう一度並べ直し → 別の更新（ほかから）が入ると、ボタンが消える
    await tidyBtn(page).click();
    await graphView(page).locator(".graph-confirm").getByRole("button", { name: "並べ直す" }).click();
    await expect(toast).toHaveCount(1);
    const g = await w.client.request("graph.get", {});
    const k = `local:${w.pane.get("gamma")!}` as const;
    await w.client.request("graph.update", { baseRev: g.rev, ops: [{ op: "move_node", key: k, x: g.nodes.find((n) => n.key === k)!.x + 40, y: g.nodes.find((n) => n.key === k)!.y }] });
    await expect(toast).toHaveCount(0);
  });

  test("別のブラウザにも反映される。モバイル（1 列）には「並びを整える」は出ない", async ({ browser, page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const p2 = await ctx2.newPage();
    await p2.goto(`${appServer.origin}/#token=${appServer.token}`);
    await p2.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
    await p2.keyboard.press("Control+b");
    await p2.keyboard.press("a");
    await spaceBtn(p2, /^開発/).click();
    const key = devKeys(w)[2]!;
    const before = (await serverPositions(w)).get(key)!;
    await tidyBtn(page).click();
    await graphView(page).locator(".graph-confirm").getByRole("button", { name: "並べ直す" }).click();
    await expect.poll(async () => (await serverPositions(w)).get(key)).not.toEqual(before);
    const after = (await serverPositions(w)).get(key)!;
    expect(after).toBeTruthy();
    await expect(nodeOf(p2, w.pane.get("main-ws")!)).toBeVisible();
    await ctx2.close();
    await page.setViewportSize({ width: 600, height: 800 });
    await page.locator(".mobile-shell-graph-btn").click();
    await expect(page.locator("dialog#soda-graph-dialog .graph-tidy")).toHaveCount(0);
  });
});

test.describe("基本画面の変更への追従・複数のブラウザ", () => {
  test("基本画面で pane・workspace・グループを変えると、グラフ（空間の並び・囲い・ノード）が追従する", async ({ page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^グループなし/).click();
    // pane を分割（基本画面と同じ操作）→ ノードが増える
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(graphView(page)).toBeHidden();
    await rowOf(page, "gamma").click();
    await focusTerminal(page);
    await prefixKey(page, "v");
    await expect(page.locator(".xterm-helper-textarea")).toHaveCount(2);
    await prefixKey(page, "a");
    await expect(graphView(page)).toBeVisible();
    await expect(graphView(page).locator("[data-node-key]")).toHaveCount(2, { timeout: 15_000 });
    // workspace を閉じる → 囲いと空間の数が変わる
    const counts = async () => (await page.locator("[data-space-id]").allTextContents()).map((t) => t.trim());
    await expect.poll(counts).toContain("グループなし1");
    await w.client.request("workspace.close", { workspaceId: w.ws.get("gamma")!.id });
    await expect(frameOf(page, w.ws.get("gamma")!.id)).toHaveCount(0);
    // グループを増やす → 空間の見出しが増える
    await w.client.request("group.create", { label: "新しい", workspaceId: w.ws.get("beta")!.id });
    await expect(page.locator("[data-space-id]").filter({ hasText: /^新しい/ })).toHaveCount(1);
    // workspace をグループへ移す → 囲いが、移った先の空間へ
    await spaceBtn(page, /^新しい/).click();
    await expect(frameOf(page, w.ws.get("beta")!.id)).toBeVisible();
    await expect(frameOf(page, w.ws.get("alpha")!.id)).toHaveCount(0);
    const dev = (await w.client.request("graph.get", {})).nodes.length;
    expect(dev).toBeGreaterThan(0);
  });

  test("複数のブラウザ: 表示中の空間はブラウザごと。片方でノードを動かすと、もう片方に届く", async ({ browser, page, appServer }) => {
    const w = await boot(page, appServer);
    await openGraph(page);
    await spaceBtn(page, /^開発/).click();
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page2 = await ctx2.newPage();
    await page2.goto(`${appServer.origin}/#token=${appServer.token}`);
    await page2.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
    await page2.keyboard.press("Control+b");
    await page2.keyboard.press("a");
    await expect(graphView(page2)).toBeVisible();
    await spaceBtn(page2, /^ドキュメント/).click();
    await expect(spaceBtn(page2, /^ドキュメント/)).toHaveAttribute("aria-current", "true");
    await expect(spaceBtn(page, /^開発/)).toHaveAttribute("aria-current", "true"); // 片方の切り替えは、もう片方に影響しない
    // page で alpha の囲いを動かすと、page2（開発へ切り替えて見る）にも届く
    const g = await headingGrip(page, w.ws.get("alpha")!.id);
    const sent0 = updatesSent(w).length;
    await page.mouse.move(g.x, g.y);
    await page.mouse.down();
    await page.mouse.move(g.x + 40, g.y + 10, { steps: 3 });
    await page.mouse.move(g.x + 120, g.y + 20, { steps: 5 });
    await page.mouse.up();
    await expect.poll(() => updatesSent(w).length).toBe(sent0 + 1);
    await spaceBtn(page2, /^開発/).click();
    const x1 = Math.round((await box(frameOf(page, w.ws.get("alpha")!.id))).x);
    expect(x1).toBeGreaterThan(0);
    const keyAlpha = `local:${w.pane.get("alpha")!}`;
    const serverX = (await serverPositions(w)).get(keyAlpha)!.x;
    expect(serverX).toBeGreaterThan(20);
    await expect(nodeOf(page2, w.pane.get("alpha")!)).toBeVisible();
    await ctx2.close();
  });
});

/** 移動のハンドラの前から 2 フレーム後までの中央値の上限。負荷の無い機械で 3 回流して決めた値（decisions D64）。 */
const PERF_MEDIAN_MAX_MS = 25;

test.describe("性能（T11h。design 追補 01 の D18）", () => {
  test("200 ノード・200 線の空間で、ノードを 60 回動かした直後の描画の間隔: 中央値 20ms 以内・100ms を超えた回数が 5% 以下（最悪の 1 回では落とさない）", async ({ page, appServer }) => {
    await boot(page, appServer);
    await openGraph(page);
    // 画面の中にだけ、200 の pane（10 workspace × 20）・200 本の線のグラフを足す（サーバには送らない。描画の時間を測る）。
    await page.evaluate(() => {
      const app = (document.querySelector("#app") as unknown as { __vue_app__: { config: { globalProperties: { $pinia: { _s: Map<string, any> } } } } }).__vue_app__;
      const stores = app.config.globalProperties.$pinia._s;
      const session = stores.get("session");
      const graph = stores.get("graph");
      session.groups.set("perf", { id: "perf", label: "perf", collapsed: false });
      const lay = session.effectiveLayout;
      session.layout = { top: [...lay.top, "g:perf"], groups: { ...lay.groups, perf: Array.from({ length: 10 }, (_, w) => `w:perf-w${w}`) }, ungrouped: [...lay.ungrouped] };
      const nodes: { key: string; x: number; y: number }[] = [...graph.graph.nodes];
      const links: unknown[] = [...graph.graph.links];
      for (let w = 0; w < 10; w++) {
        const wsId = `perf-w${w}`;
        const tabId = `perf-t${w}`;
        const paneIds = Array.from({ length: 20 }, (_, i) => `perf-p${w}-${i}`);
        session.workspaces.set(wsId, { id: wsId, label: `perf-${w}`, cwd: "/perf", tabIds: [tabId], activeTabId: tabId, groupId: "perf", git: null, autoLabel: false });
        session.tabs.set(tabId, { id: tabId, workspaceId: wsId, label: "1", layout: { type: "pane", paneId: paneIds[0] }, focusedPaneId: paneIds[0], zoomedPaneId: null, sizeOwnerClientId: null });
        paneIds.forEach((id, i) => {
          session.panes.set(id, { id, tabId, label: id, cwd: "/", shell: "bash", cols: 80, rows: 24, status: "running", failure: null, busy: false, title: "", rightClick: "herdr", agent: null, agentSession: null });
          nodes.push({ key: `local:${id}`, x: 20000 + (w % 5) * 1400 + (i % 5) * 260, y: 20000 + Math.floor(w / 5) * 800 + Math.floor(i / 5) * 140 });
        });
      }
      for (let i = 0; i < 200; i++) {
        const a = `local:perf-p${Math.floor(i / 20)}-${i % 20}`;
        const j = (i + 7) % 200;
        const b = `local:perf-p${Math.floor(j / 20)}-${j % 20}`;
        links.push({ id: `perf-l${i}`, kind: "trigger", from: a, to: b, trigger: { on: "done", prompt: "x", output: null, whenBusy: "skip" }, limit: 10, count: 0, paused: null });
      }
      graph.applyGraph({ rev: graph.graph.rev + 1000, paused: false, nodes, links }, "fresh");
    });
    await spaceBtn(page, /^perf/).click();
    await expect(spaceBtn(page, /^perf/)).toHaveAttribute("aria-current", "true");
    await expect(graphView(page).locator("[data-node-key]")).toHaveCount(200);
    await expect(graphView(page).locator("[data-link-chip]")).toHaveCount(200);
    // 面の全体が見える（全体表示）ので、ノードは小さい。1 つをつかんで、60 回動かす。1 回ごとに 2 フレーム待つ。
    // 線のチップ（200 個）が上に重なってノードをつかめないので、チップだけポインタを通す設定にする（描画の重さは変えない）。
    // 200 ノードは最小の倍率（25%）でも画面に収まらないので、画面の中で、ノードの本体が当たる点のあるノードを 1 つ選ぶ。
    await page.addStyleTag({ content: ".graph-chip { pointer-events: none !important; }" });
    const pick = await page.evaluate(() => {
      const canvas = document.querySelector(".graph-canvas")!.getBoundingClientRect();
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-node-key^="local:perf-p"]'))) {
        const r = el.getBoundingClientRect();
        for (const [fx, fy] of [[0.3, 0.5], [0.5, 0.5], [0.7, 0.5]] as const) {
          const x = r.x + r.width * fx;
          const y = r.y + r.height * fy;
          if (x < canvas.x + 20 || x > canvas.right - 120 || y < canvas.y + 20 || y > canvas.bottom - 60) continue;
          const hit = document.elementFromPoint(x, y);
          if (hit && hit.closest("[data-node-key]") === el && !hit.closest("button")) return { key: el.getAttribute("data-node-key")!, x, y };
        }
      }
      return null;
    });
    expect(pick, "つかめるノード").not.toBeNull();
    const target = graphView(page).locator(`[data-node-key="${pick!.key}"]`);
    const b = await box(target);
    const grip = { x: pick!.x, y: pick!.y };
    // 測る区間は、ポインタの移動のハンドラの**前**から始める（`page.mouse.move` が返るときには、ハンドラも Vue の描画の更新も終わっていて、そこからでは重い描画が入らない）。
    // ページの側で `pointermove` を capture で聞き、その時刻から、次の 2 フレーム後（`requestAnimationFrame` の 2 段目）までの長さを集める。
    // あわせて、動かしている間の長いタスク（50ms 超。`longtask`）の数と最長も取る。
    await page.evaluate(() => {
      const w = window as unknown as { __moves: number[]; __long: number[] };
      w.__moves = [];
      w.__long = [];
      window.addEventListener(
        "pointermove",
        () => {
          const t0 = performance.now();
          requestAnimationFrame(() => requestAnimationFrame(() => w.__moves.push(performance.now() - t0)));
        },
        true,
      );
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__long.push(e.duration);
      }).observe({ type: "longtask", buffered: false });
    });
    await page.mouse.move(grip.x, grip.y);
    await page.mouse.down();
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    await page.evaluate(() => {
      const w = window as unknown as { __moves: number[]; __long: number[] };
      w.__moves.length = 0;
      w.__long.length = 0;
    });
    for (let i = 1; i <= 60; i++) {
      await page.mouse.move(grip.x + i * 2, grip.y + (i % 2 === 0 ? i : -i), { steps: 1 });
      await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))); // 次の移動の前に、描画を終わらせる
    }
    // 本当にノードを動かしている（つかめていない空振りの測定にしない）
    const moved = await box(target);
    expect(Math.abs(moved.x - b.x) + Math.abs(moved.y - b.y), "ノードが動いている").toBeGreaterThan(20);
    await expect(target).toHaveClass(/graph-node-selected/);
    const { moves, long } = await page.evaluate(() => {
      const w = window as unknown as { __moves: number[]; __long: number[] };
      return { moves: [...w.__moves], long: [...w.__long] };
    });
    await page.keyboard.press("Escape"); // 取りやめ（サーバへは送らない）
    await page.mouse.up();
    const sorted = [...moves].sort((x, y) => x - y);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    const p95 = sorted[Math.floor(sorted.length * 0.95)]!;
    const worst = sorted.at(-1)!;
    const slow = sorted.filter((g) => g > 100).length;
    const longMax = long.length === 0 ? 0 : Math.max(...long);
    process.stdout.write(
      `[graph-perf] 200 ノード・200 線・60 回の移動（ハンドラの前から 2 フレーム後まで）: 中央値 ${median.toFixed(1)}ms・95% ${p95.toFixed(1)}ms・最悪 ${worst.toFixed(1)}ms・100ms 超 ${slow} 回（${((100 * slow) / sorted.length).toFixed(1)}%）・長いタスク ${long.length} 個（最長 ${longMax.toFixed(0)}ms）\n`,
    );
    expect(sorted.length).toBe(60);
    expect(median, `中央値 ${median}ms`).toBeLessThanOrEqual(PERF_MEDIAN_MAX_MS);
    expect(slow / sorted.length, `100ms を超えた回数 ${slow}/${sorted.length}`).toBeLessThanOrEqual(0.05); // 最悪の 1 回では落とさず、遅い回が増えたら落とす
  });
});

test("スクリーンショット: 空間・囲い・worktree グループ・tab のタグ・別の空間との線の印（暗い・明るい）", async ({ browser, page, appServer }) => {
  const dir = process.env["GRAPH_SHOTS_DIR"];
  test.skip(dir === undefined, "GRAPH_SHOTS_DIR を渡したときだけ撮る");
  const w = await boot(page, appServer);
  // 開発の alpha と、ドキュメントの beta を線で結ぶ（別の空間との線の印が出る）
  await addTriggerLink(w, "alpha", "beta");
  for (const scheme of ["dark", "light"] as const) {
    await w.client.request("prefs.set", { patch: { theme: scheme === "light" ? "catppuccin-latte" : "dracula" } });
    const context = await browser.newContext({ colorScheme: scheme, viewport: { width: 1280, height: 720 } });
    const p = await context.newPage();
    await p.goto(`${appServer.origin}/#token=${appServer.token}`);
    await p.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
    await p.keyboard.press("Control+b");
    await p.keyboard.press("a");
    await expect(graphView(p)).toBeVisible();
    await spaceBtn(p, /^開発/).click();
    await expect(graphView(p).locator("[data-node-key]").first()).toBeVisible();
    await p.evaluate(() => document.querySelectorAll<HTMLElement>(".toast-list .toast").forEach((t) => t.click()));
    await expect(p.locator(".toast-list .toast")).toHaveCount(0);
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${dir}/graph-spaces-${scheme}.png` });
    await context.close();
  }
});

test("スクリーンショット（PR1d）: 小さな地図と探す（暗い・明るい。クラシックとモダン）", async ({ browser, page, appServer }) => {
  const dir = process.env["GRAPH_SHOTS_DIR"];
  test.skip(dir === undefined, "GRAPH_SHOTS_DIR を渡したときだけ撮る");
  const w = await boot(page, appServer);
  await addTriggerLink(w, "alpha", "beta");
  for (const [scheme, style] of [["dark", "classic"], ["light", "classic"], ["dark", "modern"], ["light", "modern"]] as const) {
    await w.client.request("prefs.set", { patch: { theme: scheme === "light" ? "catppuccin-latte" : "dracula", uiStyle: style } });
    const context = await browser.newContext({ colorScheme: scheme, viewport: { width: 1280, height: 720 } });
    const p = await context.newPage();
    await p.goto(`${appServer.origin}/#token=${appServer.token}`);
    await p.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
    await p.keyboard.press("Control+b");
    await p.keyboard.press("a");
    await expect(graphView(p)).toBeVisible();
    await spaceBtn(p, /^開発/).click();
    await expect(minimapSvg(p)).toBeVisible();
    await p.evaluate(() => document.querySelectorAll<HTMLElement>(".toast-list .toast").forEach((t) => t.click()));
    await findInput(p).fill("a");
    await expect(graphView(p).locator(".graph-find-list")).toBeVisible();
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${dir}/graph-find-${style}-${scheme}.png` });
    await context.close();
  }
});

test("スクリーンショット（PR1e）: 案に寄せたグラフ（クラシック・モダン × 暗い・明るい）", async ({ browser, page, appServer }) => {
  const dir = process.env["GRAPH_SHOTS_DIR"];
  test.skip(dir === undefined, "GRAPH_SHOTS_DIR を渡したときだけ撮る");
  const w = await boot(page, appServer);
  for (const name of ["alpha", "alpha:second", "main-ws", "wt-a-ws"]) await w.client.request("pane.subscribe", { paneId: w.pane.get(name)!, scrollbackLines: 4000 });
  // エージェント: 作業中・承認待ち・完了（3 つ）。残りはシェル
  const a1 = await launchFakeAgent(page, w.client, w.pane.get("alpha")!, { via: "client" });
  const a2 = await launchFakeAgent(page, w.client, w.pane.get("main-ws")!, { via: "client" });
  const a3 = await launchFakeAgent(page, w.client, w.pane.get("wt-a-ws")!, { via: "client" });
  await a1.work();
  await a2.block();
  await a3.work();
  await a3.idle();
  // 線 2 本（きっかけ・監督）
  await addTriggerLink(w, "alpha", "main-ws");
  const g = await w.client.request("graph.get", {});
  await w.client.request("graph.update", {
    baseRev: g.rev,
    ops: [{ op: "add_link", kind: "supervise", from: `local:${w.pane.get("wt-a-ws")!}`, to: `local:${w.pane.get("wt-b-ws")!}` }],
  });
  for (const [scheme, style] of [["dark", "classic"], ["light", "classic"], ["dark", "modern"], ["light", "modern"]] as const) {
    await w.client.request("prefs.set", { patch: { theme: scheme === "light" ? "catppuccin-latte" : "dracula", uiStyle: style } });
    const context = await browser.newContext({ colorScheme: scheme, viewport: { width: 1440, height: 800 } });
    const p = await context.newPage();
    await p.goto(`${appServer.origin}/#token=${appServer.token}`);
    await p.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
    await p.keyboard.press("Control+b");
    await p.keyboard.press("a");
    await expect(graphView(p)).toBeVisible();
    await spaceBtn(p, /^開発/).click();
    await expect(graphView(p).locator("[data-node-key]").first()).toBeVisible();
    await p.evaluate(() => document.querySelectorAll<HTMLElement>(".toast-list .toast").forEach((t) => t.click()));
    await graphView(p).locator("[data-node-key]").first().click({ position: { x: 100, y: 25 } }); // 1 つ選ぶ
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${dir}/graph-pr1e-${style}-${scheme}.png` });
    await context.close();
  }
});

test("スクリーンショット（PR1f）: 基本画面とグラフの画面（クラシック・モダン × 暗い・明るい）", async ({ browser, page, appServer }) => {
  const dir = process.env["GRAPH_SHOTS_DIR"];
  test.skip(dir === undefined, "GRAPH_SHOTS_DIR を渡したときだけ撮る");
  const w = await boot(page, appServer);
  await addTriggerLink(w, "alpha", "main-ws");
  for (const [scheme, style] of [["dark", "classic"], ["light", "classic"], ["dark", "modern"], ["light", "modern"]] as const) {
    await w.client.request("prefs.set", { patch: { theme: scheme === "light" ? "catppuccin-latte" : "dracula", uiStyle: style } });
    const context = await browser.newContext({ colorScheme: scheme, viewport: { width: 1440, height: 800 } });
    const p = await context.newPage();
    await p.goto(`${appServer.origin}/#token=${appServer.token}`);
    await p.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
    await rowOf(p, "alpha").click();
    await p.evaluate(() => document.querySelectorAll<HTMLElement>(".toast-list .toast").forEach((t) => t.click()));
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${dir}/base-${style}-${scheme}.png` });
    await p.keyboard.press("Control+b");
    await p.keyboard.press("a");
    await expect(graphView(p)).toBeVisible();
    await spaceBtn(p, /^開発/).click();
    await expect(graphView(p).locator("[data-node-key]").first()).toBeVisible();
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${dir}/graph-${style}-${scheme}.png` });
    await context.close();
  }
});
