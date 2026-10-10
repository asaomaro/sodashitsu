import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import type { Page } from "@playwright/test";
import { assertPaneResolvesFake } from "@sodashitsu/server";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { prefixKey } from "../support/keys.js";

/**
 * エージェントの fork の画面（20261009-agent-fork の PR2。T6・T7）。判定は利用者が見る場所（メニュー・ダイアログ・トースト・グラフの線）と、サーバの状態・偽の `claude` が記録した起動の引数
 * （条項 `e2e-observe-browser`）。**実物の `claude` は動かさない**: PATH の先頭の偽の `claude`（起動の引数を記録し、フックの報告〔`SODA_AGENT_REPORT_SOCKET`〕で会話の id を報告し、
 * 入力欄の画面を出す）。`--fork-session` を付けられたら新しい UUID で報告する。
 */
const exec = promisify(execFile);
const dir = await mkdtemp(join(tmpdir(), "soda-e2e-fork-"));
await mkdir(join(dir, "bin"), { recursive: true });
const FAKE = `
import { appendFileSync } from "node:fs";
import { connect } from "node:net";
import { randomUUID } from "node:crypto";
const args = process.argv.slice(2);
const fork = args.includes("--fork-session");
const pane = process.env.SODA_PANE_ID;
const sessionId = fork ? randomUUID() : randomUUID();
appendFileSync(${JSON.stringify(join(dir, "launches.log"))}, JSON.stringify({ pane, cwd: process.cwd(), args, sessionId }) + "\\n");
process.stdin.setRawMode(true);
process.stdout.write("\\u001b[2J\\u001b[H\\u001b]0;\\u2733 fake\\u0007fake agent ready\\r\\n");
process.stdout.write("\\u2500".repeat(40) + "\\r\\n\\u276f \\r\\n" + "\\u2500".repeat(40) + "\\r\\n  ? for shortcuts\\r\\n");
const sock = process.env.SODA_AGENT_REPORT_SOCKET;
if (sock) {
  const c = connect(sock, () => c.end(JSON.stringify({ paneId: pane, kind: "claude", sessionId }) + "\\n"));
  c.on("error", () => {});
}
process.stdin.on("data", (d) => {
  appendFileSync(${JSON.stringify(join(dir, "input.log"))}, JSON.stringify({ pane, data: String(d) }) + "\\n");
  if (String(d).includes("\\u0004")) process.exit(0);
});
setInterval(() => {}, 1000);
`;
await writeFile(join(dir, "fake-agent.mjs"), FAKE);
await writeFile(join(dir, "bin", "claude"), `#!/bin/bash\nexec -a claude ${JSON.stringify(process.execPath)} ${JSON.stringify(join(dir, "fake-agent.mjs"))} "$@"\n`);
await chmod(join(dir, "bin", "claude"), 0o755);
// pane のシェルが rc を読んで PATH の先頭へ実物の `claude` を足し直さないことは、共通の道具（`startAppServer` の既定の、rc を読まない bash）に任せる。
// 打ち込みの前に、pane の中で `command -v claude` が偽のものを指すことを、`startAgent` が確かめる（違えば打ち込まずに落ちる）。
const savedEnv = { PATH: process.env["PATH"] };
test.beforeAll(() => {
  process.env["PATH"] = `${join(dir, "bin")}${delimiter}${savedEnv.PATH ?? ""}`;
});
test.afterAll(async () => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
});
test.beforeEach(async () => {
  await rm(join(dir, "launches.log"), { force: true });
  await rm(join(dir, "input.log"), { force: true });
});

const launches = async (): Promise<{ pane: string; cwd: string; args: string[]; sessionId: string }[]> => {
  try {
    return (await readFile(join(dir, "launches.log"), "utf8")).split("\n").filter((l) => l !== "").map((l) => JSON.parse(l) as never);
  } catch {
    return [];
  }
};
const menu = (page: Page) => page.locator(".context-menu");
const dlg = (page: Page) => page.locator("dialog.fork-dialog");
const graphView = (page: Page) => page.locator(".graph-view");

async function open(page: Page, appServer: AppServer) {
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
}
/** サーバが持つ pane の記録（新しい接続のスナップショット）。 */
async function snapshot(appServer: AppServer) {
  const c = await appServer.openClient();
  try {
    return c.helloSnapshot()!;
  } finally {
    c.close();
  }
}
/** pane でエージェントを起こし、フックの報告（会話の id）が pane の記録に届くまで待つ。 */
async function startAgent(appServer: AppServer, client: Awaited<ReturnType<AppServer["openClient"]>>, paneId: string, name: string) {
  await assertPaneResolvesFake({ write: (input) => client.sendInput(paneId, input), name: "claude", fakeDir: join(dir, "bin"), scratchDir: dir });
  await client.request("agent.start", { name, kind: "claude", paneId, args: [] });
  await expect
    .poll(async () => (await snapshot(appServer)).panes.find((p) => p.id === paneId)?.agentSession?.sessionId ?? null, { timeout: 30_000 })
    .not.toBeNull();
}

test.describe("メニュー → ダイアログ → fork（T6）", () => {
  test.setTimeout(120_000);
  test("同じフォルダへ fork: ダイアログの進み具合が出て、閉じても完了のトーストが出る。新しい pane に fork の起動が打ち込まれ、グラフに fork の線が出る", async ({ page, appServer }) => {
    const client = await appServer.openClient();
    const p0 = client.helloSnapshot()!.panes[0]!.id;
    await startAgent(appServer, client, p0, "main");
    await open(page, appServer);
    await page.locator(".terminal-pane").first().click({ button: "right" });
    const item = menu(page).getByRole("menuitem", { name: "会話を fork…" });
    await expect(item).toBeVisible();
    await expect(item).not.toHaveClass(/context-menu-disabled/);
    await item.click();
    await expect(dlg(page)).toBeVisible();
    await expect(dlg(page).locator("[data-fork-target='same']")).toBeChecked();
    await expect(dlg(page).locator("[data-fork-notinherited]")).toContainText("権限のモード");
    await dlg(page).locator("[data-fork-submit]").click();
    await expect(dlg(page).locator("[data-fork-run]")).toBeVisible();
    // 閉じても、裏で続く（完了はトースト）。
    await page.keyboard.press("Escape");
    await expect(dlg(page)).toBeHidden();
    await expect(page.locator(".toast-list .toast").filter({ hasText: "fork しました" })).toHaveCount(1, { timeout: 60_000 });
    // 新しい pane で、`claude --resume <会話の id> --fork-session` が起動された。
    await expect.poll(async () => (await launches()).filter((l) => l.args.includes("--fork-session")).length, { timeout: 30_000 }).toBe(1);
    const all = await launches();
    const first = all.find((l) => !l.args.includes("--fork-session"))!;
    const forked = all.find((l) => l.args.includes("--fork-session"))!;
    expect(forked.args).toEqual(["--resume", first.sessionId, "--fork-session"]);
    expect(forked.pane).not.toBe(p0);
    expect((await snapshot(appServer)).panes).toHaveLength(2);
    // グラフに、元から fork した pane への、見るだけの線が出る。
    await prefixKey(page, "a");
    await expect(graphView(page)).toBeVisible();
    const line = graphView(page).locator(".graph-fork-line");
    await expect(line).toHaveCount(1, { timeout: 15_000 });
    await expect(line).toHaveAttribute("data-fork-from", `local:${p0}`);
    await expect(line).toHaveAttribute("data-fork-to", `local:${forked.pane}`);
  });

  test("グラフのノードのメニュー: エージェントのノードは「会話を fork…」が押せる。シェルだけのノードは、押せず理由が出る", async ({ page, appServer }) => {
    const client = await appServer.openClient();
    const p0 = client.helloSnapshot()!.panes[0]!.id;
    await startAgent(appServer, client, p0, "main");
    const split = await client.request("pane.split", { paneId: p0, direction: "right" });
    const shellPane = split.pane.id;
    await open(page, appServer);
    await prefixKey(page, "a");
    await expect(graphView(page)).toBeVisible();
    const node = (id: string) => graphView(page).locator(`[data-node-key="local:${id}"]`);
    await expect(node(shellPane)).toBeVisible();
    await node(shellPane).focus();
    await page.keyboard.press("ContextMenu");
    const shellItem = menu(page).getByRole("menuitem", { name: /会話を fork…/ });
    await expect(shellItem).toHaveAttribute("aria-disabled", "true");
    await expect(shellItem).toContainText("エージェントが検出されていません");
    await page.keyboard.press("Escape");
    await node(p0).focus();
    await page.keyboard.press("ContextMenu");
    const agentItem = menu(page).getByRole("menuitem", { name: "会話を fork…" });
    await expect(agentItem).not.toHaveAttribute("aria-disabled", "true");
    await agentItem.click();
    await expect(dlg(page)).toBeVisible();
    await expect(dlg(page).locator("[data-fork-target='same']")).toBeChecked();
    await page.keyboard.press("Escape");
    await expect(dlg(page)).toBeHidden();
  });

  test("fork できない pane（エージェントが居ない）の項目は、押せない形で理由が出る。押してもダイアログは開かず、理由のトーストが出る", async ({ page, appServer }) => {
    await open(page, appServer);
    await page.locator(".terminal-pane").first().click({ button: "right" });
    const item = menu(page).getByRole("menuitem", { name: /会話を fork…/ });
    await expect(item).toHaveClass(/context-menu-disabled/);
    await expect(item).toHaveAttribute("aria-disabled", "true");
    await expect(item).toContainText("エージェントが検出されていません");
    await item.click({ force: true });
    await expect(page.locator(".toast-list .toast").filter({ hasText: "エージェントが検出されていません" })).toHaveCount(1);
    await expect(dlg(page)).toHaveCount(1); // 部品はあるが、開いていない
    await expect(dlg(page)).toBeHidden();
    expect(await launches()).toHaveLength(0);
  });

  test("新しい worktree: 既にあるブランチ名では確定できない（理由）。コミットしていない変更の件数が出る", async ({ page, appServer }) => {
    const repo = await mkdtemp(join(tmpdir(), "soda-e2e-forkrepo-"));
    const git = (args: string[]) => exec("git", args, { cwd: repo, env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } });
    try {
      await git(["init", "-q", "-b", "main"]);
      await git(["config", "user.email", "e2e@example.com"]);
      await git(["config", "user.name", "soda e2e"]);
      await writeFile(join(repo, "a.txt"), "1\n");
      await git(["add", "."]);
      await git(["commit", "-q", "-m", "init"]);
      await writeFile(join(repo, "a.txt"), "2\n"); // コミットしていない変更が 1 件
      const client = await appServer.openClient();
      const r = await client.request("workspace.create", { cwd: repo, label: "forkrepo" });
      await startAgent(appServer, client, r.pane.id, "repo-agent");
      await open(page, appServer);
      await page.locator(".sidebar-row").filter({ hasText: "forkrepo" }).first().click();
      await page.locator(".terminal-pane").first().click({ button: "right" });
      await menu(page).getByRole("menuitem", { name: "会話を fork…" }).click();
      await expect(dlg(page)).toBeVisible();
      await dlg(page).locator("[data-fork-target='worktree']").check();
      await expect(dlg(page).locator("[data-fork-dirty]")).toContainText("1 件");
      await dlg(page).locator("[data-fork-branch]").fill("main");
      await expect(dlg(page).locator("[data-fork-branch-msg]")).toContainText("既にあります");
      await expect(dlg(page).locator("[data-fork-submit]")).toBeDisabled();
      await dlg(page).locator("[data-fork-branch]").fill("feature-fork-e2e");
      await expect(dlg(page).locator("[data-fork-target-path]")).toContainText("feature-fork-e2e");
      await expect(dlg(page).locator("[data-fork-submit]")).toBeEnabled();
      expect(await launches()).toHaveLength(1); // 元のエージェントだけ（確定していない）
    } finally {
      await rm(repo, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});

test("スクリーンショット（PR2）: メニュー・ダイアログ（2 つの行き先）・進み具合・グラフの線（クラシック・モダン）", async ({ page, appServer }) => {
  test.setTimeout(180_000);
  const out = process.env["FORK_SHOTS_DIR"];
  test.skip(out === undefined, "FORK_SHOTS_DIR を渡したときだけ撮る");
  const repo = await mkdtemp(join(tmpdir(), "soda-e2e-forkshots-"));
  const git = (args: string[]) => exec("git", args, { cwd: repo, env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } });
  try {
    await git(["init", "-q", "-b", "main"]);
    await git(["config", "user.email", "e2e@example.com"]);
    await git(["config", "user.name", "soda e2e"]);
    await writeFile(join(repo, "a.txt"), "1\n");
    await git(["add", "."]);
    await git(["commit", "-q", "-m", "init"]);
    await writeFile(join(repo, "a.txt"), "2\n");
    await writeFile(join(repo, "b.txt"), "x\n");
    const client = await appServer.openClient();
    const r = await client.request("workspace.create", { cwd: repo, label: "my-repo" });
    await startAgent(appServer, client, r.pane.id, "lead");
    await page.setViewportSize({ width: 1280, height: 720 });
    await open(page, appServer);
    await page.locator(".sidebar-row").filter({ hasText: "my-repo" }).first().click();
    const styles = ["classic", "modern"] as const;
    const setStyle = (st: string) => page.evaluate((v) => document.documentElement.setAttribute("data-ui-style", v), st);
    for (const st of styles) {
      await setStyle(st);
      await page.locator(".terminal-pane").first().click({ button: "right" });
      await expect(menu(page)).toBeVisible();
      await page.screenshot({ path: join(out!, `fork-menu-${st}.png`) });
      await menu(page).getByRole("menuitem", { name: "会話を fork…" }).click();
      await expect(dlg(page)).toBeVisible();
      await page.screenshot({ path: join(out!, `fork-dialog-same-${st}.png`) });
      await dlg(page).locator("[data-fork-target='worktree']").check();
      await dlg(page).locator("[data-fork-branch]").fill("main");
      await expect(dlg(page).locator("[data-fork-branch-msg]")).toContainText("既にあります");
      await page.screenshot({ path: join(out!, `fork-dialog-worktree-exists-${st}.png`) });
      await dlg(page).locator("[data-fork-branch]").fill(`try-${st}`);
      await expect(dlg(page).locator("[data-fork-submit]")).toBeEnabled();
      await page.screenshot({ path: join(out!, `fork-dialog-worktree-${st}.png`) });
      await page.keyboard.press("Escape");
    }
    // 進み具合（確定した直後）と、グラフの線。
    await setStyle("classic");
    await page.locator(".terminal-pane").first().click({ button: "right" });
    await menu(page).getByRole("menuitem", { name: "会話を fork…" }).click();
    await dlg(page).locator("[data-fork-target='worktree']").check();
    await dlg(page).locator("[data-fork-branch]").fill("shots-fork");
    await expect(dlg(page).locator("[data-fork-submit]")).toBeEnabled();
    await dlg(page).locator("[data-fork-submit]").click();
    await expect(dlg(page).locator("[data-fork-run]")).toBeVisible();
    await page.screenshot({ path: join(out!, "fork-progress-classic.png") });
    await expect(page.locator(".toast-list .toast").filter({ hasText: "fork しました" })).toHaveCount(1, { timeout: 90_000 });
    await page.keyboard.press("Escape");
    await prefixKey(page, "a");
    await expect(graphView(page).locator(".graph-fork-line")).toHaveCount(1, { timeout: 15_000 });
    for (const st of styles) {
      await setStyle(st);
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(out!, `fork-graph-${st}.png`) });
    }
  } finally {
    await rm(repo, { recursive: true, force: true }).catch(() => undefined);
  }
});
