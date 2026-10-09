import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import type { Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { prefixKey } from "../support/keys.js";
import { watchClientViews } from "../support/panes.js";

/**
 * グラフから pane・workspace を足す・閉じる（20261008-graph-first の PR3。T14a〜T14f）。判定は利用者が見る場所（DOM・フォーカス・サイドバー）と、ブラウザが送ったフレーム（CDP）で行う
 * （条項 `e2e-observe-browser`）。テスト自身のクライアントは、前提とサーバの状態（分割の結果・グラフの線・不正な要求の断り）の確認にだけ使う。
 * エージェントは、PATH の先頭に置いた偽の `claude`（argv[0] が claude のまま、入力待ちの画面を出す）。
 */

// 偽の claude を PATH の先頭に置く（サーバはこのプロセスの中で動く。pane のシェルもここの PATH を引き継ぐ）。
const IDLE = [
  "some earlier conversation turn",
  "────────────────────────────────────────",
  "unrelated older content",
  "────────────────────────────────────────",
  "❯ hello",
  "────────────────────────────────────────",
  "  ? for shortcuts",
];
const binDir = await mkdtemp(join(tmpdir(), "soda-e2e-bin-"));
await mkdir(binDir, { recursive: true });
const inner = ["printf '\\033]0;project\\007'", ...IDLE.map((l) => `printf '%s\\n' ${JSON.stringify(l)}`), "sleep 600"].join("; ");
await writeFile(join(binDir, "claude"), `#!/bin/bash\nexec -a claude bash -c ${JSON.stringify(inner)}\n`);
await chmod(join(binDir, "claude"), 0o755);
process.env["PATH"] = `${binDir}${delimiter}${process.env["PATH"] ?? ""}`;

const graphView = (page: Page) => page.locator(".graph-view");
const nodes = (page: Page) => graphView(page).locator("[data-node-key]");
const nodeOf = (page: Page, paneId: string) => graphView(page).locator(`[data-node-key="local:${paneId}"]`);
const form = (page: Page) => page.locator("[data-graph-add-form]");
const win = (page: Page) => page.locator("[data-graph-terminal-window]");
const frameAdd = (page: Page, workspaceId: string) => graphView(page).locator(`[data-frame-id="${workspaceId}"] [data-frame-add]`);

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

async function boot(page: Page, appServer: AppServer) {
  const client = await appServer.openClient();
  const snap = client.helloSnapshot()!;
  const ws0 = snap.workspaces[0]!;
  const p0 = snap.panes[0]!.id;
  const sent = await watchSent(page);
  const views = await watchClientViews(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  // このブラウザが tab のサイズ権限を取る（分割元の大きさが決まる）。
  await page.locator(".xterm-helper-textarea").first().focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => views.latest()?.visible.length).toBe(1);
  return { client, ws0, p0, sent };
}

async function openGraph(page: Page) {
  await prefixKey(page, "a");
  await expect(graphView(page)).toBeVisible();
}

/** フォームで種類を選び、名前を入れて［足して、端末を開く］。 */
async function fillAndAdd(page: Page, opts: { kind: "shell" | "claude"; name?: string; supervise?: boolean }) {
  await page.locator(`[data-add-kind="${opts.kind}"]`).check();
  if (opts.name !== undefined) await page.locator("[data-add-name]").fill(opts.name);
  if (opts.supervise !== undefined) await page.locator("[data-add-supervise]").setChecked(opts.supervise);
  await page.locator("[data-add-submit]").click();
}

test.describe("pane を足す（囲いの「＋」）", () => {
  test("シェルを足す: フォームが開き、足すとノードが増え、基本画面と同じ tab に分割で入り、端末の窓が開く", async ({ page, appServer }) => {
    const { client, ws0, p0, sent } = await boot(page, appServer);
    const created = client.waitForEvent("pane.created", (e) => e.data.pane.id !== p0);
    await openGraph(page);
    await expect(nodes(page)).toHaveCount(1);
    await frameAdd(page, ws0.id).click();
    await expect(form(page)).toBeVisible();
    await expect(page.locator('[data-add-kind="shell"]')).toBeChecked();
    await fillAndAdd(page, { kind: "shell" });
    const p1 = (await created).data.pane.id;
    // 基本画面と同じ tab に分割で入る（サーバの状態）
    expect((await created).data.pane.tabId).toBe(client.helloSnapshot()!.panes[0]!.tabId);
    await expect(nodes(page)).toHaveCount(2);
    await expect(nodeOf(page, p1)).toBeVisible();
    await expect(win(page)).toBeVisible();
    await expect(form(page)).toHaveCount(0);
    // 送ったのは pane.split で、シェルには agent.start を送らない
    expect(sent().filter((m) => m.method === "pane.split")).toHaveLength(1);
    expect(sent().filter((m) => m.method === "agent.start")).toHaveLength(0);
    // 分割元・向きは基本画面と同じ決まり（元の pane の桁 ≥ 行×2 なら右、そうでなければ下）
    const split = sent().find((m) => m.method === "pane.split")!.params as { paneId: string; direction: string };
    expect(split.paneId).toBe(p0);
    expect(["right", "down"]).toContain(split.direction);
  });

  test("フォームの Esc・取りやめ・外を押す で閉じ、「＋」にフォーカスが戻る。何も足さない", async ({ page, appServer }) => {
    const { ws0, sent } = await boot(page, appServer);
    await openGraph(page);
    const add = frameAdd(page, ws0.id);
    await add.click();
    await expect(form(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(form(page)).toHaveCount(0);
    await expect(graphView(page)).toBeVisible(); // Esc でグラフの画面は閉じない
    await expect(add).toBeFocused();
    await add.click();
    await page.locator(".graph-add-cancel").click();
    await expect(form(page)).toHaveCount(0);
    await add.click();
    // フォームに重ならない所（キャンバスの右上の隅）を押す
    const cv = (await graphView(page).locator(".graph-canvas").boundingBox())!;
    await page.mouse.click(cv.x + cv.width - 20, cv.y + 10);
    await expect(form(page)).toHaveCount(0);
    expect(sent().filter((m) => m.method === "pane.split")).toHaveLength(0);
  });

  test("フォームの外を押すと、どこを押しても閉じる（ツールバー・サイドバー・キャンバス）。足している間でない限り。PR3 レビューの直し", async ({ page, appServer }) => {
    const { ws0, sent } = await boot(page, appServer);
    await openGraph(page);
    const add = frameAdd(page, ws0.id);
    for (const where of ["toolbar", "sidebar", "canvas"] as const) {
      await add.click();
      await expect(form(page)).toBeVisible();
      if (where === "toolbar") await graphView(page).locator(".graph-toolbar .graph-fit").first().click();
      else if (where === "sidebar") await page.locator(".sidebar-row").first().click();
      else {
        const cv = (await graphView(page).locator(".graph-canvas").boundingBox())!;
        await page.mouse.click(cv.x + cv.width - 20, cv.y + 10);
      }
      await expect(form(page), `${where} を押す`).toHaveCount(0);
    }
    // フォームの中を押しても閉じない。
    await add.click();
    await page.locator("[data-graph-add-form] h3, [data-graph-add-form] legend, [data-graph-add-form]").first().click({ position: { x: 4, y: 4 } });
    await expect(form(page)).toBeVisible();
    expect(sent().filter((m) => m.method === "pane.split")).toHaveLength(0);
  });

  test("エージェントを足す: 送るのは種類の id と名前だけ（args は空）。ノードにエージェントの種類が出て、次に足すときは監督の線を結べる", async ({ page, appServer }) => {
    const { client, ws0, sent } = await boot(page, appServer);
    await openGraph(page);
    await frameAdd(page, ws0.id).click();
    await expect(page.locator('[data-add-kind="claude"]')).toBeEnabled(); // agent.kinds が偽の claude を見つけた
    // 選んでいるノードが無いので、監督の項目は出ない
    await page.locator('[data-add-kind="claude"]').check();
    await expect(page.locator("[data-add-supervise]")).toHaveCount(0);
    await fillAndAdd(page, { kind: "claude", name: "lead" });
    await expect(win(page)).toBeVisible();
    const starts = sent().filter((m) => m.method === "agent.start");
    expect(starts).toHaveLength(1);
    const p = starts[0]!.params as Record<string, unknown>;
    expect(Object.keys(p).sort()).toEqual(["args", "kind", "name", "paneId"]);
    expect(p).toMatchObject({ name: "lead", kind: "claude", args: [] });
    const leadPane = p["paneId"] as string;
    await expect(nodeOf(page, leadPane).locator(".graph-node-agent-name")).toHaveText("Claude Code", { timeout: 30_000 });
    await expect(nodeOf(page, leadPane)).toContainText("lead");
    // 窓を閉じて、そのノードを選んだまま、もう一度足す。監督の線の項目が出る
    await page.locator("[data-graph-terminal-close]").click();
    await expect(win(page)).toHaveCount(0);
    await nodeOf(page, leadPane).focus();
    await frameAdd(page, ws0.id).click();
    await page.locator('[data-add-kind="claude"]').check();
    await expect(page.locator("[data-add-supervise]")).toBeChecked();
    await expect(form(page)).toContainText("lead が監督");
    await fillAndAdd(page, { kind: "claude", name: "rev-1" });
    await expect(win(page)).toBeVisible();
    const revPane = sent().filter((m) => m.method === "agent.start").map((m) => m.params as { name: string; paneId: string }).find((x) => x.name === "rev-1")!.paneId;
    // 監督の線: 配下＝新しい pane、監督役＝選んでいたノード
    await expect
      .poll(async () => (await client.request("graph.get", {})).links.some((l) => l.kind === "supervise" && l.from === `local:${revPane}` && l.to === `local:${leadPane}`))
      .toBe(true);
  });

  test("閉じるときの確認に、消える線の本数が出る（0 本なら何も足さない）", async ({ page, appServer }) => {
    const { client, ws0, p0 } = await boot(page, appServer);
    const created = client.waitForEvent("pane.created", (e) => e.data.pane.id !== p0);
    await client.request("pane.split", { paneId: p0, direction: "right" });
    const p1 = (await created).data.pane.id;
    await openGraph(page);
    await expect(nodes(page)).toHaveCount(2);
    // 線 0 本: ノードの右クリック →「pane を閉じる」: 確認なしで閉じる（busy でない shell）
    // 線を 1 本結んでから、確認が出ることを見る
    await expect.poll(async () => (await client.request("graph.get", {})).nodes.length).toBe(2);
    const g = await client.request("graph.get", {});
    await client.request("graph.update", { baseRev: g.rev, ops: [{ op: "add_link", kind: "supervise", from: `local:${p1}`, to: `local:${p0}` }] });
    await expect(graphView(page).locator("[data-link-chip]")).toHaveCount(1);
    await nodeOf(page, p1).click({ button: "right" });
    await page.getByRole("menuitem", { name: "pane を閉じる" }).click();
    const dlg = page.locator("dialog.confirm-dialog");
    await expect(dlg).toBeVisible();
    await expect(dlg.locator("[data-testid=confirm-graph-links]")).toHaveText("グラフの線 1 本も消えます。");
    await dlg.getByRole("button", { name: "閉じる" }).click();
    await expect(nodes(page)).toHaveCount(1);
    await expect(graphView(page).locator("[data-link-chip]")).toHaveCount(0);
    void ws0;
  });
});

test.describe("workspace を足す・閉じる", () => {
  test("ツールバーの「＋ workspace ▾」から新しい workspace ができ、サイドバーとグラフに出る。囲いの見出しの右クリックから閉じる（確認あり）", async ({ page, appServer }) => {
    const { client } = await boot(page, appServer);
    await openGraph(page);
    const before = client.helloSnapshot()!.workspaces.length;
    const wsCreated = client.waitForEvent("workspace.created");
    await graphView(page).locator(".graph-add-workspace").click();
    await expect(page.getByRole("menuitem", { name: "新しい workspace" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "worktree を作る…" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "worktree を開く…" })).toBeVisible();
    await page.getByRole("menuitem", { name: "新しい workspace" }).click();
    const created = await wsCreated;
    await expect(page.locator(".sidebar-row")).toHaveCount(before + 1);
    const newWs = created.data.workspace.id;
    await expect(graphView(page).locator(`[data-frame-id="${newWs}"]`)).toBeVisible();
    // 囲いの見出しの右クリックから閉じる
    const closed = client.waitForEvent("workspace.closed", (e) => e.data.workspaceId === newWs);
    await graphView(page).locator(`[data-frame-id="${newWs}"] .graph-frame-title`).click({ button: "right" });
    await page.getByRole("menuitem", { name: "workspace を閉じる" }).click();
    await page.locator("dialog.confirm-dialog").getByRole("button", { name: "閉じる" }).click();
    await closed;
    await expect(graphView(page).locator(`[data-frame-id="${newWs}"]`)).toHaveCount(0);
  });

  test("「＋ workspace」で作った workspace だけが、表示中のグループへ入る。同じ時間にほかの接続が作った workspace は入らない（PR3 レビューの直し）", async ({ page, appServer }) => {
    const client = await appServer.openClient();
    const ws0 = client.helloSnapshot()!.workspaces[0]!;
    const grp = await client.request("group.create", { label: "開発", workspaceId: ws0.id });
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
    await openGraph(page);
    const mine = client.waitForEvent("workspace.created");
    await graphView(page).locator(".graph-add-workspace").click();
    await page.getByRole("menuitem", { name: "新しい workspace" }).click();
    // ほかの接続（sodactl 相当）が、同じ時間に別の workspace を作る。
    const other = await client.request("workspace.create", {});
    const created = await mine;
    await expect.poll(async () => {
      const snap = (await appServer.openClient()).helloSnapshot()!;
      return snap.workspaces.find((w) => w.id === created.data.workspace.id)?.groupId ?? null;
    }, { timeout: 10_000 }).toBe(grp.group.id);
    // ほかの接続が作ったほうは、グループに入らない（少し待っても）。
    await page.waitForTimeout(1500);
    const snap = (await appServer.openClient()).helloSnapshot()!;
    const otherId = other.workspace.id;
    expect(otherId).not.toBe(created.data.workspace.id);
    expect(snap.workspaces.find((w) => w.id === otherId)?.groupId ?? null).toBeNull();
  });

  test("ツールバーの「＋ pane」: 選んでいる workspace に、同じフォームで足せる", async ({ page, appServer }) => {
    const { client, p0 } = await boot(page, appServer);
    const created = client.waitForEvent("pane.created", (e) => e.data.pane.id !== p0);
    await openGraph(page);
    await graphView(page).locator(".graph-add-pane").click();
    await expect(form(page)).toBeVisible();
    await fillAndAdd(page, { kind: "shell" });
    const p1 = (await created).data.pane.id;
    await expect(nodeOf(page, p1)).toBeVisible();
    await expect(win(page)).toBeVisible();
  });
});

test.describe("安全: ブラウザから任意のコマンドを起動させる口を広げない（D84）", () => {
  test("agent.kinds は表示名と有無だけを返す（実行ファイルの名前・パスは返さない）。表に無い kind・シェルの文字を含む kind は agent.start が断る", async ({ appServer }) => {
    const client = await appServer.openClient();
    const k = await client.request("agent.kinds", {});
    expect(k.kinds.length).toBeGreaterThan(0);
    for (const x of k.kinds) expect(Object.keys(x).sort()).toEqual(["available", "kind", "label"]);
    expect(JSON.stringify(k)).not.toContain(binDir);
    expect(k.kinds.find((x) => x.kind === "claude")?.available).toBe(true);
    const pane = client.helloSnapshot()!.panes[0]!.id;
    for (const kind of ["bash", "claude; touch /tmp/soda-pwn", "$(id)", "../../bin/sh", "__proto__"]) {
      await expect(client.request("agent.start", { name: "x1", kind, paneId: pane, args: [] })).rejects.toThrow(/unsupported_agent_kind/);
    }
  });
});

test.describe("別のブラウザへの反映", () => {
  test("足したノードは、別のブラウザのグラフにも出る", async ({ page, browser, appServer }) => {
    const { client, ws0, p0 } = await boot(page, appServer);
    const created = client.waitForEvent("pane.created", (e) => e.data.pane.id !== p0);
    const other = await browser.newPage();
    try {
      await other.goto(`${appServer.origin}/#token=${appServer.token}`);
      await other.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
      await prefixKey(other, "a");
      await expect(nodes(other)).toHaveCount(1);
      await openGraph(page);
      await frameAdd(page, ws0.id).click();
      await fillAndAdd(page, { kind: "shell" });
      const p1 = (await created).data.pane.id;
      await expect(nodeOf(other, p1)).toBeVisible();
      await expect(nodes(other)).toHaveCount(2);
    } finally {
      await other.close();
    }
  });
});

test("スクリーンショット（PR3）: フォームを開いたところ・足した後（クラシック・モダン）", async ({ page, appServer }) => {
  const dir = process.env["GRAPH_SHOTS_DIR"];
  test.skip(dir === undefined, "GRAPH_SHOTS_DIR を渡したときだけ撮る");
  const { client, ws0, p0 } = await boot(page, appServer);
  await page.setViewportSize({ width: 1280, height: 720 });
  await openGraph(page);
  const styles = ["classic", "modern"] as const;
  for (const style of styles) {
    await page.evaluate((s) => document.documentElement.setAttribute("data-ui-style", s), style);
    await frameAdd(page, ws0.id).click();
    await expect(page.locator('[data-add-kind="claude"]')).toBeEnabled();
    await page.screenshot({ path: join(dir!, `graph-add-form-${style}.png`) });
    await page.keyboard.press("Escape");
  }
  const created = client.waitForEvent("pane.created", (e) => e.data.pane.id !== p0);
  await frameAdd(page, ws0.id).click();
  await fillAndAdd(page, { kind: "shell" });
  await created;
  await expect(win(page)).toBeVisible();
  await page.locator("[data-graph-terminal-close]").click();
  for (const style of styles) {
    await page.evaluate((s) => document.documentElement.setAttribute("data-ui-style", s), style);
    await page.screenshot({ path: join(dir!, `graph-add-after-${style}.png`) });
  }
});
