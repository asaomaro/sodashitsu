import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Locator, Page } from "@playwright/test";
import type { Workspace } from "@sodashitsu/protocol";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { focusTerminal, prefixKey } from "../support/keys.js";
import type { SodaTestClient } from "../support/wsClient.js";

/**
 * グループ・worktree グループ・「グループなし」のサイドバー（20261004-group-worktree-items の T20・T28。AC1〜AC21・AC-I1〜AC-I3）。
 *
 * **合否は、ブラウザの DOM（サイドバーの行の並び・字下げ・印・読み上げ用の文言）と、ブラウザが受けた／送ったフレーム
 * （CDP の `Network.webSocketFrameReceived`／`webSocketFrameSent`）で見る**（条項 e2e-observe-browser）。テスト自身の WebSocket
 * クライアント（`client`）は、前提を作る（workspace・グループを用意する）ことと、「別の接続からの操作」を起こすことにだけ使い、
 * そのイベントが届いたことをブラウザの反映の合図にしない——クライアントで操作したら、**ブラウザの DOM が変わるのを待って**から次へ進む。
 * 固定時間の待ち（`waitForTimeout`）は使わない。git の判定（worktree グループになるか）は workspace を作った直後に走る
 * （`pollWorkspaceNow`）ので、DOM が変わるのを `expect.poll` で待つ。
 *
 * 行の読み取り（`rowsOf`）は DOM の属性・クラスだけを使う。行の種類は、キー（`group:`・`ungrouped:`）・折りたたみのボタン
 * （worktree グループの先頭）・木の線のクラス（子）から決める。
 */

const ROW = ".sidebar-spaces .sidebar-row[data-workspace-row-key]";
/** git の判定・サーバの反映を待つ上限（`expect.poll` が返ってくる速さで進む。待ち時間そのものではない）。 */
const SETTLE = 20_000;

const exec = promisify(execFile);
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };

/** この spec が作った一時ディレクトリ（テストが途中で落ちても消す）。worktree はリポジトリの隣（tmp 配下）に作り、利用者の `~/.sodashitsu` を汚さない。 */
const madePaths = new Set<string>();
test.afterEach(async () => {
  for (const p of madePaths) await rm(p, { recursive: true, force: true });
  madePaths.clear();
});

async function makeDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "soda-e2e-grp-"));
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

/** リポジトリの隣に linked worktree を作り、そのパスを返す。 */
async function addWorktree(repo: string, branch: string): Promise<string> {
  const path = `${repo}-${branch}`;
  madePaths.add(path);
  await git(repo, ["worktree", "add", "-q", "-b", branch, path]);
  return path;
}

// --- ブラウザの DOM を読む ---------------------------------------------------------------------------------------

type RowKind = "group" | "ungrouped" | "worktreeHead" | "worktreeChild" | "workspace";
interface Row {
  key: string;
  kind: RowKind;
  label: string;
  /** 字下げの深さ（0〜2。クラス `sidebar-row-indent`・`sidebar-row-depth-2`）。 */
  depth: 0 | 1 | 2;
  /** 折りたたみのボタンがあるとき（見出し・worktree グループの先頭）の、畳んでいるか。 */
  collapsed: boolean | null;
  toggleName: string | null;
  /** 状態の印の `data-state`（`none` はエージェントが居ない）。 */
  state: string | null;
  count: string | null;
  plus: string | null;
  branch: string | null;
  /** 種類の印（`data-kind`）と、その読み上げ用の文言。 */
  kindIcon: string | null;
  kindText: string | null;
  treeLast: boolean;
  current: boolean;
}

async function rowsOf(page: Page): Promise<Row[]> {
  return page.locator(ROW).evaluateAll((els) =>
    els.map((el): Row => {
      const key = (el as HTMLElement).dataset.workspaceRowKey ?? "";
      const toggle = el.querySelector<HTMLElement>(".sidebar-group-toggle");
      const kind: RowKind = key.startsWith("group:")
        ? "group"
        : key.startsWith("ungrouped:")
          ? "ungrouped"
          : el.classList.contains("sidebar-row-tree")
            ? "worktreeChild"
            : toggle
              ? "worktreeHead"
              : "workspace";
      const depth = el.classList.contains("sidebar-row-depth-2")
        ? 2
        : el.classList.contains("sidebar-row-indent")
          ? 1
          : 0;
      const kindIcon = el.querySelector<HTMLElement>(".sidebar-kind-icon");
      return {
        key,
        kind,
        label: el.querySelector(".sidebar-label")?.textContent?.trim() ?? "",
        depth,
        collapsed: toggle ? toggle.getAttribute("aria-expanded") === "false" : null,
        toggleName: toggle?.getAttribute("aria-label") ?? null,
        state: el.querySelector<HTMLElement>(".sidebar-state-icon")?.dataset.state ?? null,
        count: el.querySelector(".sidebar-group-count")?.textContent?.trim() ?? null,
        plus: el.querySelector(".sidebar-wt-plus")?.textContent?.trim() ?? null,
        branch: el.querySelector(".sidebar-wt-branch")?.textContent?.trim() ?? null,
        kindIcon: kindIcon?.dataset.kind ?? null,
        kindText: el.querySelector(".sidebar-kind-text")?.textContent?.trim() ?? null,
        treeLast: el.classList.contains("sidebar-row-tree-last"),
        current: el.getAttribute("aria-current") === "true",
      };
    }),
  );
}

/**
 * 行の並びを 1 行 1 文字列で表す（字下げ 2 桁ずつ）。`[g]` グループ・`[u]` グループなし（`▸` は畳んでいる。`(n)` は数）・`wt*` worktree グループの
 * 先頭・`wt` 子（`+n` は畳んだときの隠れている worktree の数）・何も付かないのが通常の行。
 */
function describeRow(r: Row): string {
  const pad = "  ".repeat(r.depth);
  const fold = r.collapsed ? "▸" : "";
  switch (r.kind) {
    case "group":
      return `${pad}[g${fold}] ${r.label} (${r.count})`;
    case "ungrouped":
      return `${pad}[u${fold}] ${r.label} (${r.count})`;
    case "worktreeHead":
      return `${pad}wt*${fold} ${r.label}${r.plus ? ` ${r.plus}` : ""}`;
    case "worktreeChild":
      return `${pad}wt ${r.label}`;
    case "workspace":
      return `${pad}${r.label}`;
  }
}

async function outline(page: Page): Promise<string[]> {
  return (await rowsOf(page)).map(describeRow);
}

async function expectOutline(page: Page, expected: string[], message?: string): Promise<void> {
  await expect
    .poll(() => outline(page), { timeout: SETTLE, ...(message ? { message } : {}) })
    .toEqual(expected);
}

/** ラベルが完全一致する行（見出しも workspace も `.sidebar-label`）。 */
function rowOf(page: Page, label: string): Locator {
  return page.locator(ROW).filter({
    has: page.locator(".sidebar-label", {
      hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
    }),
  });
}

// --- ブラウザが受けた／送ったフレーム ---------------------------------------------------------------------------

interface BrowserFrames {
  /** ブラウザが送った要求のメソッド名（`item.move` 等。`client.view` などの周期のものも含む）。 */
  sent(): { method: string; params: unknown }[];
  /** ブラウザが受けたイベントの名前（受けた順）。 */
  receivedEvents(): string[];
}

/** **`page.goto()` の前に `await` して呼ぶ**（CDP の `Network.enable` より前のフレームは見えない）。 */
async function watchBrowserFrames(page: Page): Promise<BrowserFrames> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  const sent: { method: string; params: unknown }[] = [];
  const received: string[] = [];
  cdp.on("Network.webSocketFrameSent", (e) => {
    if (e.response.opcode !== 1) return;
    try {
      const msg = JSON.parse(e.response.payloadData) as { method?: string; params?: unknown };
      if (msg.method) sent.push({ method: msg.method, params: msg.params });
    } catch {
      // JSON でないテキストは無い想定。
    }
  });
  cdp.on("Network.webSocketFrameReceived", (e) => {
    if (e.response.opcode !== 1) return;
    try {
      const msg = JSON.parse(e.response.payloadData) as { event?: string };
      if (msg.event) received.push(msg.event);
    } catch {
      // 同上。
    }
  });
  return { sent: () => [...sent], receivedEvents: () => [...received] };
}

// --- 前提を作る -----------------------------------------------------------------------------------------------

interface Env {
  client: SodaTestClient;
  frames: BrowserFrames;
  /** workspace を作る（`label` で区別する。cwd は一時ディレクトリ・リポジトリ・worktree のどれでもよい）。 */
  open(cwd: string, label: string): Promise<Workspace>;
  /** `open` で作った workspace の最初の pane の id。 */
  paneOf: Map<string, string>;
  /** 最初から居る workspace を閉じる（このリポジトリの中の cwd で、サイドバーの並びに混ざるため）。作った workspace が全部揃ってから呼ぶ。 */
  dropInitial(): Promise<void>;
}

/**
 * `opts.prefs` はこのブラウザの設定（`soda.prefs.v1`）。キー割り当ての上書きなどを、開く前に入れておく
 * （既定のキー割り当てが無い操作〔`move_workspace_previous`／`next`〕を試すため）。
 */
async function boot(
  page: Page,
  appServer: AppServer,
  opts: { prefs?: Record<string, unknown> } = {},
): Promise<Env> {
  const client = await appServer.openClient();
  const initialId = client.helloSnapshot()!.workspaces[0]!.id;
  const frames = await watchBrowserFrames(page);
  const paneOf = new Map<string, string>();
  if (opts.prefs) {
    await page.addInitScript(
      (prefs) => localStorage.setItem("soda.prefs.v1", prefs),
      JSON.stringify(opts.prefs),
    );
  }
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  return {
    client,
    frames,
    paneOf,
    async open(cwd, label) {
      const r = await client.request("workspace.create", { cwd, label });
      paneOf.set(r.workspace.id, r.pane.id);
      return r.workspace;
    },
    async dropInitial() {
      await client.request("workspace.close", { workspaceId: initialId });
      await expect(page.locator(`${ROW}[data-workspace-row-key="${initialId}"]`)).toHaveCount(0, {
        timeout: SETTLE,
      });
    },
  };
}

/** git の判定のない（管理外の）workspace を、ラベルの数だけ作る。 */
async function openPlain(env: Env, labels: string[]): Promise<Workspace[]> {
  const out: Workspace[] = [];
  for (const label of labels) out.push(await env.open(await makeDir(), label));
  return out;
}

// --- メニュー・ダイアログ ----------------------------------------------------------------------------------------

async function openMenuOn(page: Page, row: Locator): Promise<void> {
  await row.click({ button: "right" });
  await expect(page.locator(".context-menu")).toBeVisible();
}

/**
 * キーだけで行を選ぶ（navigate モードに入り、`label` の行（見出しも）まで ↑↓ で動く）。終わったあとも navigate モードのまま
 * （抜けるのは `leaveNavigate`）。
 */
async function navigateTo(page: Page, label: string): Promise<void> {
  await focusTerminal(page);
  await prefixKey(page, "w");
  const selected = page.locator(`${ROW}.sidebar-row-selected .sidebar-label`);
  const at = async (): Promise<string> => ((await selected.textContent()) ?? "").trim();
  for (const key of ["ArrowUp", "ArrowDown"]) {
    for (let i = 0; i < 12 && (await at()) !== label; i++) await page.keyboard.press(key);
  }
  await expect(selected).toHaveText(label);
}

async function leaveNavigate(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(page.locator(`${ROW}.sidebar-row-selected`)).toHaveCount(0);
}

/** 選んでいる行のメニューを Space で開く。 */
async function openMenuByKeys(page: Page, label: string): Promise<void> {
  await navigateTo(page, label);
  await page.keyboard.press("Space");
  await expect(page.locator(".context-menu")).toBeVisible();
}

/** 開いているメニューの項目を ↓ で選んで Enter（選んでいる項目は DOM のクラスで見る）。 */
async function chooseMenuByKeys(page: Page, name: string): Promise<void> {
  const active = page.locator(".context-menu-active");
  for (let i = 0; i < 10 && ((await active.textContent()) ?? "").trim() !== name; i++) {
    await page.keyboard.press("ArrowDown");
  }
  await expect(active).toHaveText(name);
  await page.keyboard.press("Enter");
  await expect(page.locator(".context-menu")).toHaveCount(0);
}

/** グループの選択ダイアログで、↓ で `groupName` を選んで Enter。選択肢の一覧を返す。 */
async function pickGroupByKeys(page: Page, groupName: string): Promise<string[]> {
  const dialog = page.locator(".group-picker-dialog");
  await expect(dialog).toBeVisible();
  const options = (await dialog.locator(".group-picker-dialog-item").allTextContents()).map((t) =>
    t.trim(),
  );
  const selected = dialog.locator(".group-picker-dialog-item-selected");
  for (let i = 0; i < 10 && ((await selected.textContent()) ?? "").trim() !== groupName; i++) {
    await page.keyboard.press("ArrowDown");
  }
  await expect(selected).toHaveText(groupName);
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  return options;
}

/** 名前のダイアログに打って Enter で確定する。 */
async function nameByKeys(page: Page, name: string): Promise<void> {
  const dialog = page.locator(".name-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".name-dialog-input")).toBeFocused();
  await page.keyboard.type(name);
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
}

async function menuItems(page: Page): Promise<string[]> {
  return (await page.locator(".context-menu [role=menuitem]").allTextContents()).map((t) =>
    t.trim(),
  );
}

async function chooseMenu(page: Page, name: string): Promise<void> {
  await page.locator(".context-menu").getByRole("menuitem", { name, exact: true }).click();
  await expect(page.locator(".context-menu")).toHaveCount(0);
}

/** 「新しいグループを作る…」で名前を入れて確定する。 */
async function createGroupVia(page: Page, rowLabel: string, groupName: string): Promise<void> {
  await openMenuOn(page, rowOf(page, rowLabel));
  await chooseMenu(page, "新しいグループを作る…");
  const dialog = page.locator(".name-dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator(".name-dialog-input").fill(groupName);
  await dialog.getByRole("button", { name: "OK" }).click();
  await expect(dialog).toBeHidden();
}

/** グループの選択ダイアログ（「グループへ追加…」「別のグループへ移す…」）で 1 つ選ぶ。選択肢の一覧を返す。 */
async function pickGroup(page: Page, groupName: string): Promise<string[]> {
  const dialog = page.locator(".group-picker-dialog");
  await expect(dialog).toBeVisible();
  const options = (await dialog.locator(".group-picker-dialog-item").allTextContents()).map((t) =>
    t.trim(),
  );
  await dialog.locator(".group-picker-dialog-item").filter({ hasText: groupName }).click();
  await expect(dialog).toBeHidden();
  return options;
}

// --- ドラッグ（行のポインタ操作。ブラウザの実際のポインタイベント） ------------------------------------------------

/** `from` の行をつかんで `to` の行の上まで動かす（まだ離さない）。離すのは呼び出し側（`page.mouse.up()`）。 */
async function dragOver(page: Page, from: Locator, to: Locator): Promise<void> {
  const f = (await from.boundingBox())!;
  const t = (await to.boundingBox())!;
  await page.mouse.move(f.x + f.width / 2, f.y + f.height / 2);
  await page.mouse.down();
  await page.mouse.move(f.x + f.width / 2, f.y + f.height / 2 + 12, { steps: 3 });
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 8 });
}

function sentMethods(frames: BrowserFrames, method: string): unknown[] {
  return frames
    .sent()
    .filter((f) => f.method === method)
    .map((f) => f.params);
}

// =====================================================================================================================
// AC2・AC4・AC10・AC20: グループを作る・項目を入れる・外す・別のグループへ移す・削除する
// =====================================================================================================================

test.describe("グループの作成と出入り", () => {
  test("メニューで作る・入れる・外す・別のグループへ移す（AC2・AC4）。見出しは本物のグループができたときだけ出る（AC20）", async ({
    page,
    appServer,
  }) => {
    const env = await boot(page, appServer);
    await openPlain(env, ["alpha", "beta", "gamma"]);
    await env.dropInitial();

    // グループが無い間は「グループなし」の見出しは出ない（今までと同じ見た目）。
    await expectOutline(page, ["alpha", "beta", "gamma"]);

    // 作る：右クリックした workspace が入る。新しいグループは「グループなし」の直前。
    await openMenuOn(page, rowOf(page, "alpha"));
    expect(await menuItems(page)).toEqual(["名前の変更", "閉じる", "新しいグループを作る…"]);
    await chooseMenu(page, "新しいグループを作る…");
    const dialog = page.locator(".name-dialog");
    await dialog.locator(".name-dialog-input").fill("g1");
    await dialog.getByRole("button", { name: "OK" }).click();
    await expectOutline(page, [
      "[g] g1 (1)",
      "  alpha",
      "[u] グループなし (2)",
      "  beta",
      "  gamma",
    ]);

    // 入れる：グループが 1 つできたので「グループへ追加…」が出る。
    await openMenuOn(page, rowOf(page, "beta"));
    expect(await menuItems(page)).toEqual([
      "名前の変更",
      "閉じる",
      "グループへ追加…",
      "新しいグループを作る…",
    ]);
    await chooseMenu(page, "グループへ追加…");
    expect(await pickGroup(page, "g1")).toEqual(["g1"]);
    await expectOutline(page, [
      "[g] g1 (2)",
      "  alpha",
      "  beta",
      "[u] グループなし (1)",
      "  gamma",
    ]);

    // 外す：「グループなし」の末尾へ。移し先が今のグループ 1 つだけのときは「別のグループへ移す…」は出ない。
    await openMenuOn(page, rowOf(page, "beta"));
    expect(await menuItems(page)).toEqual([
      "名前の変更",
      "閉じる",
      "グループから外す",
      "新しいグループを作る…",
    ]);
    await chooseMenu(page, "グループから外す");
    await expectOutline(page, [
      "[g] g1 (1)",
      "  alpha",
      "[u] グループなし (2)",
      "  gamma",
      "  beta",
    ]);

    // 2 つ目のグループ。「グループなし」の直前（g1 の後ろ）にできる。
    await createGroupVia(page, "gamma", "g2");
    await expectOutline(page, [
      "[g] g1 (1)",
      "  alpha",
      "[g] g2 (1)",
      "  gamma",
      "[u] グループなし (1)",
      "  beta",
    ]);

    // 別のグループへ移す：今のグループ以外が選択肢。移すと g2 の末尾。
    await openMenuOn(page, rowOf(page, "alpha"));
    expect(await menuItems(page)).toEqual([
      "名前の変更",
      "閉じる",
      "別のグループへ移す…",
      "グループから外す",
      "新しいグループを作る…",
    ]);
    await chooseMenu(page, "別のグループへ移す…");
    await expect(page.locator(".group-picker-dialog-title")).toHaveText("別のグループへ移す");
    expect(await pickGroup(page, "g2")).toEqual(["g2"]);
    await expectOutline(page, [
      "[g] g1 (0)",
      "[g] g2 (2)",
      "  gamma",
      "  alpha",
      "[u] グループなし (1)",
      "  beta",
    ]);
  });

  test("グループを削除すると中身は「グループなし」の末尾へ出る。グループが無くなると見出しは消える（AC10・AC20）", async ({
    page,
    appServer,
  }) => {
    const env = await boot(page, appServer);
    await openPlain(env, ["alpha", "beta", "gamma"]);
    await env.dropInitial();
    await createGroupVia(page, "alpha", "g1");
    await createGroupVia(page, "beta", "g2");
    await expectOutline(page, [
      "[g] g1 (1)",
      "  alpha",
      "[g] g2 (1)",
      "  beta",
      "[u] グループなし (1)",
      "  gamma",
    ]);

    // 見出しのメニュー：名前の変更・上へ／下へ移動・削除。
    await openMenuOn(page, rowOf(page, "g1"));
    expect(await menuItems(page)).toEqual(["名前の変更", "上へ移動", "下へ移動", "グループを削除"]);
    await chooseMenu(page, "グループを削除");
    await expectOutline(page, [
      "[g] g2 (1)",
      "  beta",
      "[u] グループなし (2)",
      "  gamma",
      "  alpha",
    ]);

    await openMenuOn(page, rowOf(page, "g2"));
    await chooseMenu(page, "グループを削除");
    // 本物のグループが 1 つも無くなったので、見出しは消えて項目が字下げなしで並ぶ。
    await expectOutline(page, ["gamma", "alpha", "beta"]);
  });

  test("見出し・行を右クリックしてもメニューが開くだけで、折りたたみも今いる workspace も変わらない（AC-I1）", async ({
    page,
    appServer,
  }) => {
    const env = await boot(page, appServer);
    await openPlain(env, ["alpha", "beta", "gamma"]);
    await env.dropInitial();
    await createGroupVia(page, "alpha", "g1");
    const outlineBefore = ["[g] g1 (1)", "  alpha", "[u] グループなし (2)", "  beta", "  gamma"];
    await expectOutline(page, outlineBefore);
    await rowOf(page, "beta").click();
    await expect(rowOf(page, "beta")).toHaveAttribute("aria-current", "true");
    const focusSent = sentMethods(env.frames, "workspace.focus").length;
    const toggleSent = sentMethods(env.frames, "group.toggle_collapsed").length;

    // グループの見出し：メニューが開く（右クリックの押した・離したは、行のクリックにならない）。
    await openMenuOn(page, rowOf(page, "g1"));
    expect(await menuItems(page)).toEqual(["名前の変更", "上へ移動", "下へ移動", "グループを削除"]);
    await page.keyboard.press("Escape");
    await expect(page.locator(".context-menu")).toHaveCount(0);
    // 「グループなし」の見出し。
    await openMenuOn(page, rowOf(page, "グループなし"));
    expect(await menuItems(page)).toEqual(["上へ移動", "下へ移動"]);
    await page.keyboard.press("Escape");
    await expect(page.locator(".context-menu")).toHaveCount(0);
    // 通常の行（今いない gamma）：メニューは開くが、workspace は切り替わらない。
    await openMenuOn(page, rowOf(page, "gamma"));
    await page.keyboard.press("Escape");
    await expect(page.locator(".context-menu")).toHaveCount(0);

    // メニューが開いた時点で、押した・離したは処理済み（メニューは contextmenu で開く）。折りたたみは変わらず、要求も送っていない。
    expect(await outline(page)).toEqual(outlineBefore);
    expect(sentMethods(env.frames, "group.toggle_collapsed")).toHaveLength(toggleSent);
    expect(sentMethods(env.frames, "workspace.focus")).toHaveLength(focusSent);
    await expect(rowOf(page, "beta")).toHaveAttribute("aria-current", "true");
    await expect(rowOf(page, "gamma")).not.toHaveAttribute("aria-current", "true");

    // 左クリックは今までどおり：見出しは折りたたみが切り替わり、行は workspace が切り替わる。
    await rowOf(page, "g1").click();
    await expectOutline(page, ["[g▸] g1 (1)", "[u] グループなし (2)", "  beta", "  gamma"]);
    await rowOf(page, "g1").click();
    await expectOutline(page, outlineBefore);
    await rowOf(page, "gamma").click();
    await expect(rowOf(page, "gamma")).toHaveAttribute("aria-current", "true");
  });
});

// =====================================================================================================================
// AC1〜AC4・AC6・AC7・AC12: worktree グループ
// =====================================================================================================================

/** 本体 `main-ws` と worktree 2 つ（`wt-a`・`wt-b`）の workspace。git の判定が付いて worktree グループになるのを待って返す。 */
async function openWorktreeSet(env: Env): Promise<{ repo: string; wts: string[] }> {
  const repo = await makeRepo();
  const wtA = await addWorktree(repo, "wt-a");
  const wtB = await addWorktree(repo, "wt-b");
  await env.open(repo, "main-ws");
  await env.open(wtA, "wt-a-ws");
  await env.open(wtB, "wt-b-ws");
  return { repo, wts: [wtA, wtB] };
}

test.describe("worktree グループ", () => {
  test("グループの中でまとまって並び、子の行のメニューでも全体が動く（AC1・AC2・AC3・AC4・AC12）", async ({
    page,
    appServer,
  }) => {
    const env = await boot(page, appServer);
    await openWorktreeSet(env);
    await openPlain(env, ["solo"]);
    await env.dropInitial();

    // グループに入れる前：worktree グループが 1 つの項目として並ぶ（先頭の行＋子 2 つ。子には木の線）。
    await expectOutline(page, ["wt* main-ws", "  wt wt-a-ws", "  wt wt-b-ws", "solo"]);
    const before = await rowsOf(page);
    expect(before.map((r) => r.treeLast)).toEqual([false, false, true, false]); // 最後の子で木の線が止まる
    expect(before.map((r) => r.branch)).toEqual(["main", "wt-a", "wt-b", null]); // 通常の行にはブランチ名も worktree の印も出ない
    expect(before.map((r) => r.kindIcon)).toEqual([
      "worktreeGroup",
      "worktreeGroup",
      "worktreeGroup",
      null,
    ]);

    // 先頭の行のメニューで新しいグループへ：worktree グループ丸ごと入る。
    await createGroupVia(page, "main-ws", "work");
    await expectOutline(page, [
      "[g] work (1)",
      "  wt* main-ws",
      "    wt wt-a-ws",
      "    wt wt-b-ws",
      "[u] グループなし (1)",
      "  solo",
    ]);

    // 子の行のメニューで「グループから外す」：項目の全体（先頭と子 2 つ）が「グループなし」の末尾へ動く。
    await openMenuOn(page, rowOf(page, "wt-a-ws"));
    expect(await menuItems(page)).toContain("グループから外す");
    await chooseMenu(page, "グループから外す");
    await expectOutline(page, [
      "[g] work (0)",
      "[u] グループなし (2)",
      "  solo",
      "  wt* main-ws",
      "    wt wt-a-ws",
      "    wt wt-b-ws",
    ]);

    // 子の行のメニューで「グループへ追加…」：全体がグループへ戻る。
    await openMenuOn(page, rowOf(page, "wt-b-ws"));
    await chooseMenu(page, "グループへ追加…");
    await pickGroup(page, "work");
    await expectOutline(page, [
      "[g] work (1)",
      "  wt* main-ws",
      "    wt wt-a-ws",
      "    wt wt-b-ws",
      "[u] グループなし (1)",
      "  solo",
    ]);
  });

  test("種類の印と読み上げ用の文言（AC12）。畳んだサイドバーでは印が名前を持つ", async ({
    page,
    appServer,
  }) => {
    const env = await boot(page, appServer);
    await openWorktreeSet(env);
    await openPlain(env, ["solo"]);
    await env.dropInitial();
    await createGroupVia(page, "main-ws", "work");
    await expectOutline(page, [
      "[g] work (1)",
      "  wt* main-ws",
      "    wt wt-a-ws",
      "    wt wt-b-ws",
      "[u] グループなし (1)",
      "  solo",
    ]);

    // 展開：見出しは「グループ」、worktree グループの先頭の行と子は「worktree グループ」を読み上げ用の文字で持つ。「グループなし」・通常の行は印なし。
    const rows = await rowsOf(page);
    expect(rows.map((r) => [r.kindIcon, r.kindText])).toEqual([
      ["group", "グループ"],
      ["worktreeGroup", "worktree グループ"],
      ["worktreeGroup", "worktree グループ"],
      ["worktreeGroup", "worktree グループ"],
      [null, null],
      [null, null],
    ]);
    // 折りたたみのボタンの読み上げ名も、グループと worktree グループで違う。
    expect(rows.map((r) => r.toggleName)).toEqual([
      "グループを折りたたむ",
      "worktree グループを折りたたむ",
      null,
      null,
      "「グループなし」を折りたたむ",
      null,
    ]);

    // 畳んだサイドバー：文字は出せないので、印自身が role=img と名前を持つ（見出し 1・worktree グループの 3 行）。
    await page.getByRole("button", { name: "サイドバーを畳む" }).click();
    await expect(page.locator(".sidebar-collapsed")).toHaveCount(1);
    await expect(
      page.locator(".sidebar-spaces").getByRole("img", { name: "グループ", exact: true }),
    ).toHaveCount(1);
    await expect(
      page.locator(".sidebar-spaces").getByRole("img", { name: "worktree グループ", exact: true }),
    ).toHaveCount(3);
    await expect(page.locator(".sidebar-spaces .sidebar-kind-text")).toHaveCount(0);
  });

  test("畳む：グループと worktree グループ。今いる workspace の行は畳んでも残る（AC6）", async ({
    page,
    appServer,
  }) => {
    const env = await boot(page, appServer);
    await openWorktreeSet(env);
    await openPlain(env, ["solo"]);
    await env.dropInitial();
    await createGroupVia(page, "main-ws", "work");
    await expectOutline(page, [
      "[g] work (1)",
      "  wt* main-ws",
      "    wt wt-a-ws",
      "    wt wt-b-ws",
      "[u] グループなし (1)",
      "  solo",
    ]);
    // 今いる workspace を solo にしておく。
    await rowOf(page, "solo").click();
    await expect(rowOf(page, "solo")).toHaveAttribute("aria-current", "true");

    // worktree グループだけ畳む：先頭の行だけが残り、隠れている worktree の数 +2。
    await rowOf(page, "main-ws")
      .getByRole("button", { name: "worktree グループを折りたたむ" })
      .click();
    await expectOutline(page, [
      "[g] work (1)",
      "  wt*▸ main-ws +2",
      "[u] グループなし (1)",
      "  solo",
    ]);
    expect((await rowsOf(page))[1]!.toggleName).toBe("worktree グループを展開");
    await rowOf(page, "main-ws").getByRole("button", { name: "worktree グループを展開" }).click();
    await expectOutline(page, [
      "[g] work (1)",
      "  wt* main-ws",
      "    wt wt-a-ws",
      "    wt wt-b-ws",
      "[u] グループなし (1)",
      "  solo",
    ]);

    // 今いる workspace を子（wt-b-ws）にして畳むと、その子の行が先頭の行の下に残り、隠れている数は 1 つ減る。
    await rowOf(page, "wt-b-ws").click();
    await expect(rowOf(page, "wt-b-ws")).toHaveAttribute("aria-current", "true");
    await rowOf(page, "main-ws")
      .getByRole("button", { name: "worktree グループを折りたたむ" })
      .click();
    await expectOutline(page, [
      "[g] work (1)",
      "  wt*▸ main-ws +1",
      "    wt wt-b-ws",
      "[u] グループなし (1)",
      "  solo",
    ]);
    await rowOf(page, "main-ws").getByRole("button", { name: "worktree グループを展開" }).click();

    // グループを畳む：中は今いる workspace（wt-b-ws。子）の行だけ。
    await rowOf(page, "work").getByRole("button", { name: "グループを折りたたむ" }).click();
    await expectOutline(page, [
      "[g▸] work (1)",
      "    wt wt-b-ws",
      "[u] グループなし (1)",
      "  solo",
    ]);
    await rowOf(page, "work").getByRole("button", { name: "グループを展開" }).click();
    await expectOutline(page, [
      "[g] work (1)",
      "  wt* main-ws",
      "    wt wt-a-ws",
      "    wt wt-b-ws",
      "[u] グループなし (1)",
      "  solo",
    ]);
  });

  test("本体を閉じるとき、グループの中でも「worktree も一緒に閉じる」が出て全部閉じる（AC7）", async ({
    page,
    appServer,
  }) => {
    const env = await boot(page, appServer);
    await openWorktreeSet(env);
    await openPlain(env, ["solo"]);
    await env.dropInitial();
    await createGroupVia(page, "main-ws", "work");
    await expectOutline(page, [
      "[g] work (1)",
      "  wt* main-ws",
      "    wt wt-a-ws",
      "    wt wt-b-ws",
      "[u] グループなし (1)",
      "  solo",
    ]);

    await openMenuOn(page, rowOf(page, "main-ws"));
    await chooseMenu(page, "閉じる");
    const confirm = page.locator(".confirm-dialog");
    await expect(confirm).toBeVisible();
    // グループの中でも出る。数は代表（worktree）の分。
    const check = confirm.getByLabel("束ねた worktree も一緒に閉じる（2 件）");
    await expect(check).toBeVisible();
    await check.check();
    await confirm.getByRole("button", { name: "閉じる", exact: true }).click();
    await expect(confirm).toBeHidden();
    // 全部閉じる。グループは空で残る。
    await expectOutline(page, ["[g] work (0)", "[u] グループなし (1)", "  solo"]);
  });

  test("子の行には「worktree も一緒に閉じる」は出ない（閉じるのはその 1 つだけ。AC7）", async ({
    page,
    appServer,
  }) => {
    const env = await boot(page, appServer);
    await openWorktreeSet(env);
    await env.dropInitial();
    await expectOutline(page, ["wt* main-ws", "  wt wt-a-ws", "  wt wt-b-ws"]);

    await openMenuOn(page, rowOf(page, "wt-a-ws"));
    await chooseMenu(page, "閉じる");
    const confirm = page.locator(".confirm-dialog");
    await expect(confirm).toBeVisible();
    await expect(confirm.locator(".confirm-dialog-linked-worktrees")).toHaveCount(0);
    await confirm.getByRole("button", { name: "閉じる", exact: true }).click();
    await expectOutline(page, ["wt* main-ws", "  wt wt-b-ws"]);
  });
});

// =====================================================================================================================
// AC8・AC10: 後から worktree を開く・全部閉じて開き直す・サーバの再起動
// =====================================================================================================================

test.describe("後から開く・開き直す・再起動", () => {
  test("後から worktree を開くと、同じ worktree グループ・同じグループに入る（AC8）", async ({
    page,
    appServer,
  }) => {
    const env = await boot(page, appServer);
    const repo = await makeRepo();
    await env.open(repo, "main-ws");
    await openPlain(env, ["solo"]);
    await env.dropInitial();
    await createGroupVia(page, "main-ws", "work");
    await expectOutline(page, ["[g] work (1)", "  main-ws", "[u] グループなし (1)", "  solo"]);

    // 後から worktree を開く：本体と同じグループ・同じ worktree グループに入る（「グループなし」には出ない）。
    const wt = await addWorktree(repo, "wt-late");
    await env.open(wt, "late-ws");
    await expectOutline(page, [
      "[g] work (1)",
      "  wt* main-ws",
      "    wt late-ws",
      "[u] グループなし (1)",
      "  solo",
    ]);
    expect((await rowsOf(page)).map((r) => r.branch)).toEqual([
      null,
      "main",
      "wt-late",
      null,
      null,
    ]);
  });

  test("全部閉じて開き直すと、同じグループに戻る（AC10）", async ({ page, appServer }) => {
    const env = await boot(page, appServer);
    const repo = await makeRepo();
    const wt = await addWorktree(repo, "wt-x");
    const main = await env.open(repo, "main-ws");
    const child = await env.open(wt, "x-ws");
    await openPlain(env, ["solo"]);
    await env.dropInitial();
    await createGroupVia(page, "main-ws", "work");
    await expectOutline(page, [
      "[g] work (1)",
      "  wt* main-ws",
      "    wt x-ws",
      "[u] グループなし (1)",
      "  solo",
    ]);

    await env.client.request("workspace.close", { workspaceId: child.id });
    await env.client.request("workspace.close", { workspaceId: main.id });
    await expectOutline(page, ["[g] work (0)", "[u] グループなし (1)", "  solo"]);

    // 開き直す（本体 → worktree の順）。リポジトリの所属を覚えているので、同じグループへ戻り、worktree グループになる。
    await env.open(repo, "main-ws");
    await expectOutline(page, ["[g] work (1)", "  main-ws", "[u] グループなし (1)", "  solo"]);
    await env.open(wt, "x-ws");
    await expectOutline(page, [
      "[g] work (1)",
      "  wt* main-ws",
      "    wt x-ws",
      "[u] グループなし (1)",
      "  solo",
    ]);
  });

  test("サーバを再起動しても、同じ並び・同じグループ・同じ折りたたみ（AC10）", async ({
    page,
    appServer,
  }) => {
    const env = await boot(page, appServer);
    const repo = await makeRepo();
    const wt = await addWorktree(repo, "wt-r");
    await env.open(repo, "main-ws");
    await env.open(wt, "r-ws");
    await openPlain(env, ["solo", "other"]);
    await env.dropInitial();
    await createGroupVia(page, "main-ws", "work");
    await createGroupVia(page, "other", "second");
    // 並びを変えておく（second を work の前へ。work を畳む）。
    await openMenuOn(page, rowOf(page, "second"));
    await chooseMenu(page, "上へ移動");
    await rowOf(page, "work").getByRole("button", { name: "グループを折りたたむ" }).click();
    // 反映（並べ替え・折りたたみ）を待ってから、再起動の前の並びを取る（1 回読みで途中の状態を取らない）。
    await expect
      .poll(async () => (await outline(page)).slice(0, 3), {
        timeout: SETTLE,
        message: "second が work の前・work は畳んでいる",
      })
      .toEqual(["[g] second (1)", "  other", "[g▸] work (1)"]);
    const before = await outline(page);

    await appServer.restart();
    // ブラウザは自分で繋ぎ直す。繋ぎ直しの表示が消えてから、同じ並びが DOM に出ていることを見る。
    await expect(page.locator(".reconnect-overlay")).toBeHidden({ timeout: 40_000 });
    await expectOutline(page, before, "再起動の前と同じ並び・所属・折りたたみ");
  });
});

// =====================================================================================================================
// AC5・AC20・AC-I2: ドラッグ
// =====================================================================================================================

test.describe("ドラッグ", () => {
  test("グループの中で項目を並べ替える。外と中をまたぐと落とせない（AC5）", async ({
    page,
    appServer,
  }) => {
    const env = await boot(page, appServer);
    await openPlain(env, ["alpha", "beta", "gamma", "delta"]);
    await env.dropInitial();
    await createGroupVia(page, "alpha", "g1");
    for (const label of ["beta", "gamma"]) {
      await openMenuOn(page, rowOf(page, label));
      await chooseMenu(page, "グループへ追加…");
      await pickGroup(page, "g1");
    }
    await expectOutline(page, [
      "[g] g1 (3)",
      "  alpha",
      "  beta",
      "  gamma",
      "[u] グループなし (1)",
      "  delta",
    ]);

    // 同じグループの中：gamma を alpha の前へ。落とせる行には印（drop-target）が付く（離す前の DOM）。
    await dragOver(page, rowOf(page, "gamma"), rowOf(page, "alpha"));
    await expect(rowOf(page, "alpha")).toHaveClass(/sidebar-row-drop-target/);
    await page.mouse.up();
    await expectOutline(page, [
      "[g] g1 (3)",
      "  gamma",
      "  alpha",
      "  beta",
      "[u] グループなし (1)",
      "  delta",
    ]);
    expect(sentMethods(env.frames, "item.move")).toHaveLength(1);

    // グループの外の項目の上は落とせない：印は「落とせない」（drop-invalid）で、離しても何も送らず、理由を知らせる。
    const sentBefore = sentMethods(env.frames, "item.move").length;
    await dragOver(page, rowOf(page, "beta"), rowOf(page, "delta"));
    await expect(rowOf(page, "delta")).toHaveClass(/sidebar-row-drop-invalid/);
    await expect(rowOf(page, "delta")).not.toHaveClass(/sidebar-row-drop-target/);
    await page.mouse.up();
    await expect(
      page.locator(".toast").filter({
        hasText: "同じグループの中、または同じ「グループなし」の中の項目の間でだけ並べ替えできます",
      }),
    ).toHaveCount(1);
    expect(sentMethods(env.frames, "item.move")).toHaveLength(sentBefore);
    await expectOutline(page, [
      "[g] g1 (3)",
      "  gamma",
      "  alpha",
      "  beta",
      "[u] グループなし (1)",
      "  delta",
    ]);

    // まとまり（グループの見出し）の上にも項目は落とせない。前の知らせを消してから離し、**同じ理由の知らせが出るのを待って**
    // （ブラウザが離したことを処理した印）から、送っていないことを数える（何も待たずに数えると、送る前でも通ってしまう）。
    await page.locator(".toast").first().click();
    await expect(page.locator(".toast")).toHaveCount(0);
    await dragOver(page, rowOf(page, "delta"), rowOf(page, "g1"));
    await expect(rowOf(page, "g1")).toHaveClass(/sidebar-row-drop-invalid/);
    await page.mouse.up();
    await expect(
      page
        .locator(".toast")
        .filter({
          hasText:
            "同じグループの中、または同じ「グループなし」の中の項目の間でだけ並べ替えできます",
        }),
    ).toHaveCount(1);
    expect(sentMethods(env.frames, "item.move")).toHaveLength(sentBefore);
    await expectOutline(page, [
      "[g] g1 (3)",
      "  gamma",
      "  alpha",
      "  beta",
      "[u] グループなし (1)",
      "  delta",
    ]);
  });

  test("worktree グループは子の行をつかんでも全体が動く。まとまり（グループ・グループなし）はまとまりどうしで並べ替える（AC5・AC20）", async ({
    page,
    appServer,
  }) => {
    const env = await boot(page, appServer);
    await openWorktreeSet(env);
    await openPlain(env, ["solo", "other"]);
    await env.dropInitial();
    await createGroupVia(page, "solo", "g1");
    // main-ws（worktree グループ）を g1 へ。g1 の中は [solo, main-ws…]。
    await openMenuOn(page, rowOf(page, "main-ws"));
    await chooseMenu(page, "グループへ追加…");
    await pickGroup(page, "g1");
    await expectOutline(page, [
      "[g] g1 (2)",
      "  solo",
      "  wt* main-ws",
      "    wt wt-a-ws",
      "    wt wt-b-ws",
      "[u] グループなし (1)",
      "  other",
    ]);

    // 子の行をつかんで solo の上へ：worktree グループ全体が solo の前へ動く。
    await dragOver(page, rowOf(page, "wt-a-ws"), rowOf(page, "solo"));
    await expect(rowOf(page, "solo")).toHaveClass(/sidebar-row-drop-target/);
    await page.mouse.up();
    await expectOutline(page, [
      "[g] g1 (2)",
      "  wt* main-ws",
      "    wt wt-a-ws",
      "    wt wt-b-ws",
      "  solo",
      "[u] グループなし (1)",
      "  other",
    ]);

    // まとまりの並べ替え：「グループなし」の見出しをつかんで g1 の見出しの上へ → 「グループなし」が先頭になる。
    await dragOver(page, rowOf(page, "グループなし"), rowOf(page, "g1"));
    await expect(rowOf(page, "g1")).toHaveClass(/sidebar-row-drop-target/);
    await page.mouse.up();
    await expectOutline(page, [
      "[u] グループなし (1)",
      "  other",
      "[g] g1 (2)",
      "  wt* main-ws",
      "    wt wt-a-ws",
      "    wt wt-b-ws",
      "  solo",
    ]);
  });

  test("ドラッグは Esc・行の外で離すと取り消され、何も送らず並びも変わらない（AC-I2）", async ({
    page,
    appServer,
  }) => {
    const env = await boot(page, appServer);
    await openPlain(env, ["alpha", "beta", "gamma"]);
    await env.dropInitial();
    await createGroupVia(page, "alpha", "g1");
    for (const label of ["beta", "gamma"]) {
      await openMenuOn(page, rowOf(page, label));
      await chooseMenu(page, "グループへ追加…");
      await pickGroup(page, "g1");
    }
    const initial = ["[g] g1 (3)", "  alpha", "  beta", "  gamma", "[u] グループなし (0)"];
    await expectOutline(page, initial);

    // Esc：落とせる行の上で（印が付いたのを見てから）Esc → 印が消える。そのあとマウスを離しても何も起きない。
    await dragOver(page, rowOf(page, "gamma"), rowOf(page, "alpha"));
    await expect(rowOf(page, "alpha")).toHaveClass(/sidebar-row-drop-target/);
    await page.keyboard.press("Escape");
    await expect(page.locator(".sidebar-row-drop-target")).toHaveCount(0);
    await page.mouse.up();

    // 行の外：落とせる行の上から、サイドバーの外（端末の領域）へ動かして離す → 印が消え、取り消し。
    await dragOver(page, rowOf(page, "gamma"), rowOf(page, "alpha"));
    await expect(rowOf(page, "alpha")).toHaveClass(/sidebar-row-drop-target/);
    const terminal = (await page.locator(".pane-frame").first().boundingBox())!;
    await page.mouse.move(terminal.x + terminal.width / 2, terminal.y + terminal.height / 2, {
      steps: 8,
    });
    await expect(page.locator(".sidebar-row-drop-target")).toHaveCount(0);
    await page.mouse.up();

    // 取り消しの後に本物のドラッグを 1 つ行う。**この 1 回だけが送られ、並びがこれだけ変わる**ことで、前の 2 回が
    // 何も送っていないこと（何も待たずに数えると、送る前でも通ってしまう）を順序で確かめる。
    await dragOver(page, rowOf(page, "gamma"), rowOf(page, "alpha"));
    await expect(rowOf(page, "alpha")).toHaveClass(/sidebar-row-drop-target/);
    await page.mouse.up();
    await expectOutline(page, [
      "[g] g1 (3)",
      "  gamma",
      "  alpha",
      "  beta",
      "[u] グループなし (0)",
    ]);
    expect(sentMethods(env.frames, "item.move")).toHaveLength(1);
  });

  test("グループの見出しをつかんで、別のグループの上へ落とすとグループが並べ替わる（AC5）", async ({
    page,
    appServer,
  }) => {
    const env = await boot(page, appServer);
    await openPlain(env, ["alpha", "beta"]);
    await env.dropInitial();
    await createGroupVia(page, "alpha", "g1");
    await createGroupVia(page, "beta", "g2");
    await expectOutline(page, [
      "[g] g1 (1)",
      "  alpha",
      "[g] g2 (1)",
      "  beta",
      "[u] グループなし (0)",
    ]);
    await dragOver(page, rowOf(page, "g2"), rowOf(page, "g1"));
    await expect(rowOf(page, "g1")).toHaveClass(/sidebar-row-drop-target/);
    await page.mouse.up();
    await expectOutline(page, [
      "[g] g2 (1)",
      "  beta",
      "[g] g1 (1)",
      "  alpha",
      "[u] グループなし (0)",
    ]);
  });
});

// =====================================================================================================================
// AC19: 同じフォルダの 2 つ目の workspace
// =====================================================================================================================

test.describe("同じフォルダの 2 つ目の workspace（追補 01 A・AC19）", () => {
  test("worktree グループには入らず通常の行（worktree の印なし）。代表を閉じると次が worktree グループに入る", async ({
    page,
    appServer,
  }) => {
    const env = await boot(page, appServer);
    const repo = await makeRepo();
    const wt = await addWorktree(repo, "wt-same");
    await env.open(repo, "main-ws");
    const first = await env.open(wt, "same-1");
    await env.dropInitial();
    await expectOutline(page, ["wt* main-ws", "  wt same-1"]);

    // worktree の workspace（same-1）を選んだまま、サイドバーの「＋ 新規」を押す：新しい workspace は選んでいる pane の
    // フォルダで開く（同じフォルダの 2 つ目）。名前は自動で付くので、3 行目に出た行の名前を読む。
    await rowOf(page, "same-1").click();
    await expect(rowOf(page, "same-1")).toHaveAttribute("aria-current", "true");
    await page.getByRole("button", { name: "＋ 新規" }).click();
    await expect.poll(async () => (await outline(page)).length, { timeout: SETTLE }).toBe(3);
    const rows = await rowsOf(page);
    const second = rows[2]!;
    const secondLabel = second.label;
    await expectOutline(page, ["wt* main-ws", "  wt same-1", secondLabel]);
    expect(second.kind).toBe("workspace");
    expect(second.kindIcon, "worktree の印は付かない").toBeNull();
    expect(second.branch, "ブランチ名も出さない").toBeNull();
    expect(second.toggleName).toBeNull();
    // メニューは通常の行のもの（グループへの出入りは項目＝この workspace 単体）。
    await openMenuOn(page, rowOf(page, secondLabel));
    expect(await menuItems(page)).toContain("新しいグループを作る…");
    await page.keyboard.press("Escape");

    // 代表を閉じる：同じフォルダの次の workspace が代表になり、worktree グループの子として並ぶ。
    await env.client.request("workspace.close", { workspaceId: first.id });
    await expectOutline(page, ["wt* main-ws", `  wt ${secondLabel}`]);
    const after = await rowsOf(page);
    expect(after[1]!.kindIcon).toBe("worktreeGroup");
    expect(after[1]!.branch).toBe("wt-same");
  });

  test("T29: 「グループなし」をグループより上に並べ替えてから worktree の workspace を選んで「＋ 新規」しても、新しい workspace は通常の行になり worktree グループは崩れない", async ({
    page,
    appServer,
  }) => {
    const env = await boot(page, appServer);
    const repo = await makeRepo();
    const wt = await addWorktree(repo, "wt-same");
    const mainWs = await env.open(repo, "main-ws");
    const sameWs = await env.open(wt, "same-1");
    await env.dropInitial();
    await createGroupVia(page, "main-ws", "g1");
    await expectOutline(page, ["[g] g1 (1)", "  wt* main-ws", "    wt same-1", "[u] グループなし (0)"]);
    await openMenuOn(page, rowOf(page, "グループなし"));
    await chooseMenu(page, "上へ移動");
    await expectOutline(page, ["[u] グループなし (0)", "[g] g1 (1)", "  wt* main-ws", "    wt same-1"]);

    // worktree の workspace を選んで「＋ 新規」: 新しい workspace は同じフォルダで開き、「グループなし」が上にあるので判定前は
    // 平らな順で same-1 より前に入る。判定が届いても、先にそのフォルダを持っていた same-1 が代表のまま。
    // 判定は pane の作成の後に非同期で届くので、サーバのイベント（新しい workspace の判定の通知）を待ち、続けて名前の変更を 1 つ
    // 送って、その名前が DOM に出るのを待つ（イベントは接続ごとに順序どおりに届くので、判定とそれに伴う並びの更新がブラウザに
    // 反映された後の状態を見られる。判定前も判定後も同じ見た目になりうるので、固定の待ちでは確かめられない）。
    await rowOf(page, "same-1").click();
    await expect(rowOf(page, "same-1")).toHaveAttribute("aria-current", "true");
    const known = new Set([mainWs.id, sameWs.id]);
    const judged = env.client.waitForEvent(
      "workspace.updated",
      (e) => !known.has(e.data.workspace.id) && typeof e.data.workspace.git?.worktreeKey === "string",
      SETTLE,
    );
    await page.getByRole("button", { name: "＋ 新規" }).click();
    const created = (await judged).data.workspace;
    await env.client.request("workspace.rename", { workspaceId: created.id, label: "second-ws" });
    await expect(rowOf(page, "second-ws")).toBeVisible({ timeout: SETTLE });
    await expectOutline(page, [
      "[u] グループなし (1)",
      "  second-ws",
      "[g] g1 (1)",
      "  wt* main-ws",
      "    wt same-1",
    ]);
    const second = (await rowsOf(page)).find((r) => r.label === "second-ws")!;
    expect(second.kind).toBe("workspace");
    expect(second.kindIcon, "worktree の印は付かない").toBeNull();
    expect(second.branch, "ブランチ名も出さない").toBeNull();
  });

  test("同じフォルダの 2 つ目は、worktree グループの所属に引きずられない（グループへ入れても worktree グループは動かない）", async ({
    page,
    appServer,
  }) => {
    const env = await boot(page, appServer);
    const repo = await makeRepo();
    const wt = await addWorktree(repo, "wt-same");
    await env.open(repo, "main-ws");
    await env.open(wt, "same-1");
    await env.open(wt, "same-2");
    await env.dropInitial();
    await expectOutline(page, ["wt* main-ws", "  wt same-1", "same-2"]);
    await createGroupVia(page, "same-2", "g1");
    await expectOutline(page, [
      "[g] g1 (1)",
      "  same-2",
      "[u] グループなし (1)",
      "  wt* main-ws",
      "    wt same-1",
    ]);
  });
});

// =====================================================================================================================
// AC20: 「グループなし」
// =====================================================================================================================

test.describe("「グループなし」（追補 01 B・AC20）", () => {
  test("畳める・グループと並べ替えられる・名前の変更と削除は無い。外すと末尾へ", async ({
    page,
    appServer,
  }) => {
    const env = await boot(page, appServer);
    await openPlain(env, ["alpha", "beta", "gamma"]);
    await env.dropInitial();
    await expectOutline(page, ["alpha", "beta", "gamma"]); // グループが無ければ見出しは無い
    await createGroupVia(page, "alpha", "g1");
    await expectOutline(page, [
      "[g] g1 (1)",
      "  alpha",
      "[u] グループなし (2)",
      "  beta",
      "  gamma",
    ]);

    // 畳む・広げる。畳んだ中は今いる workspace の行だけ（今いるのは beta にしておく）。
    await rowOf(page, "beta").click();
    await expect(rowOf(page, "beta")).toHaveAttribute("aria-current", "true");
    await rowOf(page, "グループなし")
      .getByRole("button", { name: "「グループなし」を折りたたむ" })
      .click();
    await expectOutline(page, ["[g] g1 (1)", "  alpha", "[u▸] グループなし (2)", "  beta"]);
    await rowOf(page, "グループなし")
      .getByRole("button", { name: "「グループなし」を展開" })
      .click();
    await expectOutline(page, [
      "[g] g1 (1)",
      "  alpha",
      "[u] グループなし (2)",
      "  beta",
      "  gamma",
    ]);

    // メニュー（右クリックで開く）は「上へ移動」「下へ移動」だけ（名前の変更・削除は無い）。上へ動かすとグループの前に出る。
    await openMenuOn(page, rowOf(page, "グループなし"));
    expect(await menuItems(page)).toEqual(["上へ移動", "下へ移動"]);
    await chooseMenu(page, "上へ移動");
    await expectOutline(page, [
      "[u] グループなし (2)",
      "  beta",
      "  gamma",
      "[g] g1 (1)",
      "  alpha",
    ]);
    await openMenuOn(page, rowOf(page, "グループなし"));
    await chooseMenu(page, "下へ移動");
    await expectOutline(page, [
      "[g] g1 (1)",
      "  alpha",
      "[u] グループなし (2)",
      "  beta",
      "  gamma",
    ]);

    // グループから外すと「グループなし」の末尾。
    await openMenuOn(page, rowOf(page, "alpha"));
    await chooseMenu(page, "グループから外す");
    await expectOutline(page, [
      "[g] g1 (0)",
      "[u] グループなし (3)",
      "  beta",
      "  gamma",
      "  alpha",
    ]);
  });
});

// =====================================================================================================================
// AC21: 状態のまとめ・畳んだ worktree グループの +n
// =====================================================================================================================

/** blocked の画面を出す偽の claude（agent-detection.spec.ts と同じ画面・同じ起動のしかた）。 */
async function startFakeAgent(env: Env, ws: Workspace): Promise<void> {
  const dir = await makeDir();
  const script = join(dir, "fake-claude.sh");
  const blockedScreen = [
    "────────────────────────────────────────────────────────────────",
    " Bash command",
    "",
    "   curl -sS -o /tmp/probe.html https://example.com",
    "   Download example.com to /tmp/probe.html",
    "",
    " This command requires approval",
    "",
    " Do you want to proceed?",
    " ❯ 1. Yes",
    "   2. Yes, and don't ask again for: curl *",
    "   3. No",
    "",
    " Esc to cancel · Tab to amend · ctrl+e to explain",
  ];
  await writeFile(
    script,
    [
      "clear",
      "echo READY",
      "sleep 4",
      "clear",
      ...blockedScreen.map((l) => `printf '%s\\n' ${JSON.stringify(l)}`),
      "sleep 60",
    ].join("\n"),
  );
  env.client.sendInput(env.paneOf.get(ws.id)!, `exec -a claude bash ${script}\r`);
}

test.describe("状態のまとめと +n（追補 01 C・AC21）", () => {
  test("グループの見出しは中の状態をまとめて常に出す。畳んだ worktree グループの先頭の行は全体をまとめ、+n を添える", async ({
    page,
    appServer,
  }) => {
    test.setTimeout(90_000);
    const env = await boot(page, appServer);
    const repo = await makeRepo();
    const wt = await addWorktree(repo, "wt-s");
    await env.open(repo, "main-ws");
    const child = await env.open(wt, "s-ws");
    await openPlain(env, ["solo"]);
    await env.dropInitial();
    await createGroupVia(page, "main-ws", "work");
    await expectOutline(page, [
      "[g] work (1)",
      "  wt* main-ws",
      "    wt s-ws",
      "[u] グループなし (1)",
      "  solo",
    ]);
    // 今いるのは本体（子ではない）にしておく。
    await rowOf(page, "main-ws").click();
    await expect(rowOf(page, "main-ws")).toHaveAttribute("aria-current", "true");
    expect((await rowsOf(page)).map((r) => r.state)).toEqual([
      "none",
      "none",
      "none",
      "none",
      "none",
    ]);

    // 子の pane でエージェントが「承認待ち（blocked）」になる。
    await startFakeAgent(env, child);
    await expect
      .poll(async () => (await rowsOf(page)).map((r) => r.state), {
        timeout: 60_000,
        message: "子の行・グループの見出しに blocked が出る",
      })
      .toEqual(["blocked", "none", "blocked", "none", "none"]);
    // 広げているときの worktree グループの先頭の行は、本体の状態のまま（none）。見出しは中の全部（子を含む）をまとめて blocked。
    // 「グループなし」の見出しは中（solo）だけなので none。

    // worktree グループを畳むと、先頭の行は本体と worktree の全部のまとめ（blocked）になり、隠れている数 +1 が付く。
    await rowOf(page, "main-ws")
      .getByRole("button", { name: "worktree グループを折りたたむ" })
      .click();
    await expect
      .poll(() => outline(page), { timeout: SETTLE })
      .toEqual(["[g] work (1)", "  wt*▸ main-ws +1", "[u] グループなし (1)", "  solo"]);
    expect((await rowsOf(page)).map((r) => r.state)).toEqual([
      "blocked",
      "blocked",
      "none",
      "none",
    ]);

    // グループを畳んでも、見出しの状態のまとめは出たまま（今いる workspace の行だけが残る）。
    await rowOf(page, "work").getByRole("button", { name: "グループを折りたたむ" }).click();
    await expect
      .poll(() => outline(page), { timeout: SETTLE })
      .toEqual(["[g▸] work (1)", "  wt*▸ main-ws +1", "[u] グループなし (1)", "  solo"]);
    expect((await rowsOf(page))[0]!.state).toBe("blocked");
  });
});

// =====================================================================================================================
// 別の接続からの操作にブラウザの DOM が追従する
// =====================================================================================================================

test.describe("別の接続からの操作", () => {
  test("別の接続（テストのクライアント）の操作に、ブラウザの DOM が追従する", async ({
    page,
    appServer,
  }) => {
    const env = await boot(page, appServer);
    const [alpha, beta, gamma] = await openPlain(env, ["alpha", "beta", "gamma"]);
    await env.dropInitial();
    await expectOutline(page, ["alpha", "beta", "gamma"]);
    const c = env.client;

    // 作る（項目つき）。ブラウザは何も操作していないのに、見出しと字下げが現れる。
    const { group: g1 } = await c.request("group.create", { label: "g1", workspaceId: alpha!.id });
    await expectOutline(page, [
      "[g] g1 (1)",
      "  alpha",
      "[u] グループなし (2)",
      "  beta",
      "  gamma",
    ]);

    // 入れる・グループの名前の変更。
    await c.request("group.add_member", { groupId: g1.id, workspaceId: gamma!.id });
    await c.request("group.rename", { groupId: g1.id, label: "renamed" });
    await expectOutline(page, [
      "[g] renamed (2)",
      "  alpha",
      "  gamma",
      "[u] グループなし (1)",
      "  beta",
    ]);

    // 項目の並べ替え（グループの中）・まとまりの並べ替え（グループなしを上へ）。
    await c.request("item.move_by", {
      item: { kind: "workspace", workspaceId: gamma!.id },
      direction: "previous",
    });
    await expectOutline(page, [
      "[g] renamed (2)",
      "  gamma",
      "  alpha",
      "[u] グループなし (1)",
      "  beta",
    ]);
    await c.request("item.move_by", { item: { kind: "ungrouped" }, direction: "previous" });
    await expectOutline(page, [
      "[u] グループなし (1)",
      "  beta",
      "[g] renamed (2)",
      "  gamma",
      "  alpha",
    ]);
    await c.request("item.move", {
      item: { kind: "group", groupId: g1.id },
      before: { kind: "ungrouped" },
    });
    await expectOutline(page, [
      "[g] renamed (2)",
      "  gamma",
      "  alpha",
      "[u] グループなし (1)",
      "  beta",
    ]);

    // 畳む（グループの折りたたみはサーバが持つ）。今ブラウザが見ている workspace の行だけが残る。
    await c.request("group.toggle_collapsed", { groupId: g1.id });
    await expect
      .poll(async () => (await rowsOf(page))[0]!.collapsed, { timeout: SETTLE })
      .toBe(true);
    await c.request("group.toggle_collapsed", { groupId: g1.id });
    await expectOutline(page, [
      "[g] renamed (2)",
      "  gamma",
      "  alpha",
      "[u] グループなし (1)",
      "  beta",
    ]);

    // 外す・閉じる・グループの削除。
    await c.request("group.remove_member", { workspaceId: alpha!.id });
    await expectOutline(page, [
      "[g] renamed (1)",
      "  gamma",
      "[u] グループなし (2)",
      "  beta",
      "  alpha",
    ]);
    await c.request("workspace.close", { workspaceId: beta!.id });
    await expectOutline(page, ["[g] renamed (1)", "  gamma", "[u] グループなし (1)", "  alpha"]);
    await c.request("group.delete", { groupId: g1.id });
    await expectOutline(page, ["alpha", "gamma"]);

    // ここまでの変化は全部別の接続の操作によるもの：ブラウザ自身は並び・グループを変える要求を 1 つも送っていない一方、
    // 並びのイベントはサーバから受けている（DOM が追従した経路）。
    const mutating = ["group.", "item.", "workspace.move", "workspace.close", "workspace.create"];
    expect(
      env.frames.sent().filter((f) => mutating.some((m) => f.method.startsWith(m))),
      "ブラウザは並びを変える要求を送っていない",
    ).toEqual([]);
    expect(env.frames.receivedEvents()).toContain("sidebar.layout_changed");
  });
});

// =====================================================================================================================
// キーだけで一巡
// =====================================================================================================================

test.describe("キーだけの操作", () => {
  test("navigate の選択・メニュー・折りたたみ・並べ替えがキーだけでできる", async ({
    page,
    appServer,
  }) => {
    const env = await boot(page, appServer);
    const [alpha, beta] = await openPlain(env, ["alpha", "beta", "gamma"]);
    await env.dropInitial();
    // 前提：g1（alpha・beta）と「グループなし」（gamma）。別の接続で作り、ブラウザに出るのを待つ。
    const { group } = await env.client.request("group.create", {
      label: "g1",
      workspaceId: alpha!.id,
    });
    await env.client.request("group.add_member", { groupId: group.id, workspaceId: beta!.id });
    await expectOutline(page, [
      "[g] g1 (2)",
      "  alpha",
      "  beta",
      "[u] グループなし (1)",
      "  gamma",
    ]);
    await rowOf(page, "alpha").click();
    await expect(rowOf(page, "alpha")).toHaveAttribute("aria-current", "true");

    const selected = page.locator(`${ROW}.sidebar-row-selected`);
    await focusTerminal(page);
    await prefixKey(page, "w"); // navigate モード。選択は今いる行（alpha）から始まる
    await expect(selected).toHaveCount(1);
    await expect(selected.locator(".sidebar-label")).toHaveText("alpha");

    // ↑：グループの見出しを選べる。
    await page.keyboard.press("ArrowUp");
    await expect(selected.locator(".sidebar-label")).toHaveText("g1");

    // z：畳む（今いる alpha の行だけが残る）。もう一度 z で開く。
    await page.keyboard.press("z");
    await expectOutline(page, ["[g▸] g1 (2)", "  alpha", "[u] グループなし (1)", "  gamma"]);
    await page.keyboard.press("z");
    await expectOutline(page, [
      "[g] g1 (2)",
      "  alpha",
      "  beta",
      "[u] グループなし (1)",
      "  gamma",
    ]);

    // Space：選択している見出しのメニュー。↓ で「下へ移動」まで選んで Enter（選んでいる項目は DOM のクラスで見る）。
    await page.keyboard.press("Space");
    await expect(page.locator(".context-menu")).toBeVisible();
    for (let i = 0; i < 6; i++) {
      if ((await page.locator(".context-menu-active").textContent())?.trim() === "下へ移動") break;
      await page.keyboard.press("ArrowDown");
    }
    await expect(page.locator(".context-menu-active")).toHaveText("下へ移動");
    await page.keyboard.press("Enter");
    // グループが「グループなし」の後ろへ動く。選択は動いた見出しに残る。
    await expectOutline(page, [
      "[u] グループなし (1)",
      "  gamma",
      "[g] g1 (2)",
      "  alpha",
      "  beta",
    ]);
    await expect(selected.locator(".sidebar-label")).toHaveText("g1");

    // 「グループなし」の見出しへ（↑ 2 回で gamma → 見出し）。z で畳む。
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect(selected.locator(".sidebar-label")).toHaveText("グループなし");
    await page.keyboard.press("z");
    await expectOutline(page, ["[u▸] グループなし (1)", "[g] g1 (2)", "  alpha", "  beta"]);

    await page.keyboard.press("Escape"); // navigate を終える
    await expect(selected).toHaveCount(0);
  });

  test("worktree グループの先頭の行で z を押すと畳み、通常の行・同じフォルダの 2 つ目では何も起きない（AC6）", async ({
    page,
    appServer,
  }) => {
    const env = await boot(page, appServer);
    const repo = await makeRepo();
    const wt = await addWorktree(repo, "wt-k");
    await env.open(repo, "main-ws");
    await env.open(wt, "k-ws");
    await env.open(wt, "k-ws-2");
    await env.dropInitial();
    await expectOutline(page, ["wt* main-ws", "  wt k-ws", "k-ws-2"]);
    await rowOf(page, "main-ws").click();
    await expect(rowOf(page, "main-ws")).toHaveAttribute("aria-current", "true");

    await focusTerminal(page);
    await prefixKey(page, "w");
    const selected = page.locator(`${ROW}.sidebar-row-selected`);
    await expect(selected.locator(".sidebar-label")).toHaveText("main-ws");
    await page.keyboard.press("z");
    await expectOutline(page, ["wt*▸ main-ws +1", "k-ws-2"]);
    await page.keyboard.press("z");
    await expectOutline(page, ["wt* main-ws", "  wt k-ws", "k-ws-2"]);
    // 同じフォルダの 2 つ目（通常の行）では z は何もしない。
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(selected.locator(".sidebar-label")).toHaveText("k-ws-2");
    await page.keyboard.press("z");
    await expectOutline(page, ["wt* main-ws", "  wt k-ws", "k-ws-2"]);
    await page.keyboard.press("Escape");
  });

  test("グループを作る・入れる・外す・別のグループへ移すが、メニューとダイアログをキーだけで操作してできる。Esc で取り消せる（AC-I2・AC-I3）", async ({
    page,
    appServer,
  }) => {
    const env = await boot(page, appServer);
    await openPlain(env, ["alpha", "beta", "gamma", "delta"]);
    await env.dropInitial();
    await expectOutline(page, ["alpha", "beta", "gamma", "delta"]);

    // 作る（名前のダイアログにも打って Enter）。
    await openMenuByKeys(page, "alpha");
    await chooseMenuByKeys(page, "新しいグループを作る…");
    await nameByKeys(page, "g1");
    await expectOutline(page, [
      "[g] g1 (1)",
      "  alpha",
      "[u] グループなし (3)",
      "  beta",
      "  gamma",
      "  delta",
    ]);
    await leaveNavigate(page);
    await openMenuByKeys(page, "beta");
    await chooseMenuByKeys(page, "新しいグループを作る…");
    await nameByKeys(page, "g2");
    await expectOutline(page, [
      "[g] g1 (1)",
      "  alpha",
      "[g] g2 (1)",
      "  beta",
      "[u] グループなし (2)",
      "  gamma",
      "  delta",
    ]);

    // 入れる：選択ダイアログで ↓ で g2 を選んで Enter。
    await leaveNavigate(page);
    await openMenuByKeys(page, "gamma");
    await chooseMenuByKeys(page, "グループへ追加…");
    expect(await pickGroupByKeys(page, "g2")).toEqual(["g1", "g2"]);
    await expectOutline(page, [
      "[g] g1 (1)",
      "  alpha",
      "[g] g2 (2)",
      "  beta",
      "  gamma",
      "[u] グループなし (1)",
      "  delta",
    ]);

    // Esc で取り消す：選択ダイアログを Esc で閉じても、何も変わらない（あとの結果に delta が g1 の末尾にだけ入ることで確かめる）。
    await leaveNavigate(page);
    await openMenuByKeys(page, "delta");
    await chooseMenuByKeys(page, "グループへ追加…");
    await expect(page.locator(".group-picker-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".group-picker-dialog")).toBeHidden();

    // 取り消した後に、改めて delta を g1 へ入れる。
    await leaveNavigate(page);
    await openMenuByKeys(page, "delta");
    await chooseMenuByKeys(page, "グループへ追加…");
    expect(await pickGroupByKeys(page, "g1")).toEqual(["g1", "g2"]);
    await expectOutline(page, [
      "[g] g1 (2)",
      "  alpha",
      "  delta",
      "[g] g2 (2)",
      "  beta",
      "  gamma",
      "[u] グループなし (0)",
    ]);

    // 別のグループへ移す：今いるグループ（g2）以外が選択肢。
    await leaveNavigate(page);
    await openMenuByKeys(page, "gamma");
    await chooseMenuByKeys(page, "別のグループへ移す…");
    expect(await pickGroupByKeys(page, "g1")).toEqual(["g1"]);
    await expectOutline(page, [
      "[g] g1 (3)",
      "  alpha",
      "  delta",
      "  gamma",
      "[g] g2 (1)",
      "  beta",
      "[u] グループなし (0)",
    ]);

    // 外す：「グループなし」の末尾へ。
    await leaveNavigate(page);
    await openMenuByKeys(page, "alpha");
    await chooseMenuByKeys(page, "グループから外す");
    await expectOutline(page, [
      "[g] g1 (2)",
      "  delta",
      "  gamma",
      "[g] g2 (1)",
      "  beta",
      "[u] グループなし (1)",
      "  alpha",
    ]);
    await leaveNavigate(page);
  });

  test("move_workspace_previous／next のキーで workspace の行・worktree グループが動き、端で止まる（AC5）", async ({
    page,
    appServer,
  }) => {
    // 既定のキー割り当てが無い操作なので、このブラウザの設定（soda.prefs.v1）で prefix+u／prefix+i に割り当てておく。
    const env = await boot(page, appServer, {
      prefs: {
        keys: {
          bindings: { move_workspace_previous: ["prefix+u"], move_workspace_next: ["prefix+i"] },
        },
      },
    });
    await openWorktreeSet(env);
    const [alpha, beta] = await openPlain(env, ["alpha", "beta", "solo"]);
    await env.dropInitial();
    const { group } = await env.client.request("group.create", {
      label: "g1",
      workspaceId: alpha!.id,
    });
    await env.client.request("group.add_member", { groupId: group.id, workspaceId: beta!.id });
    const initial = [
      "[g] g1 (2)",
      "  alpha",
      "  beta",
      "[u] グループなし (2)",
      "  wt* main-ws",
      "    wt wt-a-ws",
      "    wt wt-b-ws",
      "  solo",
    ];
    await expectOutline(page, initial);

    const press = async (key: string): Promise<void> => {
      await focusTerminal(page);
      await prefixKey(page, key);
    };

    // グループの中の通常の行：beta を前へ → alpha の前。さらに前へ（端。何も起きない）→ 後ろへ戻すと元の並び。
    await rowOf(page, "beta").click();
    await expect(rowOf(page, "beta")).toHaveAttribute("aria-current", "true");
    await press("u");
    await expectOutline(page, ["[g] g1 (2)", "  beta", "  alpha", ...initial.slice(3)]);
    await press("u"); // 端：先頭からは動かない（回り込まない）
    await press("i"); // 後ろへ：端で止まっていたので、alpha の後ろ（元の並び）。回り込んでいたら別の並びになる
    await expectOutline(page, initial);
    await press("i"); // 端：グループの末尾からは動かない（グループの外へも出ない）
    await press("u");
    await expectOutline(page, ["[g] g1 (2)", "  beta", "  alpha", ...initial.slice(3)]);
    await press("i");
    await expectOutline(page, initial);

    // worktree グループ：子の行にいて後ろへ → 全体が solo の後ろへ動く。端から動かず、前へ戻すと元の並び。
    await rowOf(page, "wt-a-ws").click();
    await expect(rowOf(page, "wt-a-ws")).toHaveAttribute("aria-current", "true");
    await press("i");
    await expectOutline(page, [
      ...initial.slice(0, 4),
      "  solo",
      "  wt* main-ws",
      "    wt wt-a-ws",
      "    wt wt-b-ws",
    ]);
    await press("i"); // 端
    await press("u");
    await expectOutline(page, initial);
    await press("u"); // 端（先頭）
    await press("i");
    await expectOutline(page, [
      ...initial.slice(0, 4),
      "  solo",
      "  wt* main-ws",
      "    wt wt-a-ws",
      "    wt wt-b-ws",
    ]);

    // 全部、ブラウザが 1 打ごとに `item.move_by` を送っている（端でも送る。止めるのはサーバ）。
    expect(sentMethods(env.frames, "item.move_by")).toHaveLength(11);
  });
});

// =====================================================================================================================
// AC11: 先頭の pane が別のリポジトリへ移る
// =====================================================================================================================

test.describe("先頭の pane の移動（AC11）", () => {
  test("pane で別のリポジトリへ cd すると、移った先の項目に従う。リポジトリに所属が無ければグループの外へ出る", async ({
    page,
    appServer,
  }) => {
    test.setTimeout(120_000);
    const env = await boot(page, appServer);
    const repoA = await makeRepo();
    const wtA = await addWorktree(repoA, "wt-a");
    const repoB = await makeRepo();
    await env.open(repoA, "a-ws");
    const mover = await env.open(repoB, "mover");
    await env.dropInitial();
    await createGroupVia(page, "a-ws", "g1");
    await expectOutline(page, ["[g] g1 (1)", "  a-ws", "[u] グループなし (1)", "  mover"]);

    // 判定は 5 秒周期で pane のいる場所を見る。DOM が変わるのを待つ（固定時間の待ちは使わない）。
    const cd = (dir: string): void =>
      env.client.sendInput(env.paneOf.get(mover.id)!, `cd ${dir}\r`);

    // リポジトリ A の worktree へ：A はグループ g1 に入っているので、mover は A の worktree グループの子として g1 の中に入る。
    cd(wtA);
    await expectOutline(page, ["[g] g1 (1)", "  wt* a-ws", "    wt mover", "[u] グループなし (0)"]);

    // 所属の無いリポジトリ B へ：A の worktree グループを出て、B には所属が無いのでグループの外（「グループなし」）。
    cd(repoB);
    await expectOutline(page, ["[g] g1 (1)", "  a-ws", "[u] グループなし (1)", "  mover"]);
  });

  test("git 管理外へ移ると、移る前のグループに通常の workspace として残る。その後リポジトリへ移っても、グループには残ったまま所属が引き継がれる", async ({
    page,
    appServer,
  }) => {
    test.setTimeout(120_000);
    const env = await boot(page, appServer);
    const repoA = await makeRepo();
    const wtA = await addWorktree(repoA, "wt-a");
    const repoB = await makeRepo();
    const repoD = await makeRepo();
    const wtD = await addWorktree(repoD, "wt-d");
    const plain = await makeDir();
    await env.open(repoA, "a-ws");
    const mover = await env.open(repoB, "mover");
    // 所属の無い別のリポジトリ D の linked worktree の workspace。mover が D の本体のフォルダへ移った（判定が反映された）ことを
    // DOM で区別するための目印（別のフォルダなので、mover は代表を奪わず D の worktree グループの本体になる）。
    await env.open(wtD, "d-ws");
    await env.dropInitial();
    await createGroupVia(page, "a-ws", "g1");
    const cd = (dir: string): void =>
      env.client.sendInput(env.paneOf.get(mover.id)!, `cd ${dir}\r`);

    cd(wtA);
    await expectOutline(page, ["[g] g1 (1)", "  wt* a-ws", "    wt mover", "[u] グループなし (1)", "  d-ws"]);
    // git 管理外へ：worktree グループから出て、移る前のグループ（g1）に通常の行として残る。
    cd(plain);
    await expectOutline(page, ["[g] g1 (2)", "  a-ws", "  mover", "[u] グループなし (1)", "  d-ws"]);
    // グループに入っている workspace が所属の無いリポジトリ D へ移っても、グループからは出ない（その所属がリポジトリの所属になる）。
    // cd の前後で並びが変わる場面にしてある（D の項目が「グループなし」から g1 へ付いてくる）。判定の反映前に通ってしまわない。
    cd(repoD);
    await expectOutline(page, ["[g] g1 (2)", "  a-ws", "  wt* mover", "    wt d-ws", "[u] グループなし (0)"]);
  });
});
