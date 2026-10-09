import { appendFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ThemeName } from "@sodashitsu/protocol";
import type { Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { expect, test } from "../support/fixtures.js";
import type { AppServer } from "../support/appServer.js";
import { focusTerminal, prefixKey, typeLine } from "../support/keys.js";
import type { SodaTestClient } from "../support/wsClient.js";

/**
 * グラフの小さなサブエージェントのノードの E2E（20261008-graph-first の PR6b・AC-U1〜U3）。**実物の Claude Code は使わない**: 偽の `claude`
 * を pane で動かして検出させ、テストが立てたサーバの `agent-report.sock` だけへ電文（フックのスクリプトが送るものと同じ 1 行の JSON）を送る
 * （`subagents.spec.ts` と同じ）。観測はブラウザの描画（DOM・位置・フォーカス）と、ブラウザが送ったフレーム（CDP の `framesent`）で行う。
 * `SUBAGENT_SHOTS_DIR` を渡したときだけ、絵も撮る（判定はしない）。
 */

const SESSION = "sess-e2e";

async function startFakeClaude(
  page: Page,
  appServer: AppServer,
): Promise<{ client: SodaTestClient; paneId: string }> {
  const client = await appServer.openClient();
  const paneId = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId, scrollbackLines: 4000 });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);
  const dir = await mkdtemp(join(tmpdir(), "soda-e2e-subagents-"));
  const scriptPath = join(dir, "fake-claude.sh");
  const ready = `soda-e2e-subagents-ready-${Date.now()}`;
  await writeFile(scriptPath, [`echo ${ready}`, "sleep 600"].join("\n"));
  const detected = client.waitForEvent(
    "pane.agent_status_changed",
    (e) => e.data.paneId === paneId && e.data.agent !== null,
    25_000,
  );
  // 子プロセスとして動かす（`exec` でシェルを置き換えない）。Ctrl+C で終わらせるとシェルへ戻り、検出が外れる。
  await typeLine(page, `bash -c 'exec -a claude bash ${scriptPath}'`);
  await client.waitForOutput(paneId, ready);
  await detected;
  return { client, paneId };
}

/** 受け口（テストが立てたサーバの `stateDir`）へ、種類つきの電文を 1 接続 1 行で送る（Linux・macOS の Unix socket。Windows の named pipe は対象外）。 */
function report(
  appServer: AppServer,
  paneId: string,
  body: Record<string, unknown>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const c = connect(join(appServer.stateDir, "agent-report.sock"), () =>
      c.end(`${JSON.stringify({ paneId, kind: "claude", sessionId: SESSION, ...body })}\n`),
    );
    c.on("close", () => resolve());
    c.on("error", reject);
  });
}
const startSub = (a: AppServer, p: string, id: string, extra: Record<string, unknown> = {}) =>
  report(a, p, { type: "subagent_start", agentId: id, ...extra });
const stopSub = (a: AppServer, p: string, id: string) =>
  report(a, p, { type: "subagent_stop", agentId: id });
const pending = (
  a: AppServer,
  p: string,
  description: string,
  agentType = "Explore",
  background = false,
) => report(a, p, { type: "subagent_pending", description, agentType, background });


const graphView = (page: Page) => page.locator(".graph-view");
const graphNode = (page: Page, paneId: string) => graphView(page).locator(`[data-node-key="local:${paneId}"]`);
const smallRows = (page: Page) => graphView(page).locator("button[data-subagent-id]");
const SHOTS = process.env["SUBAGENT_SHOTS_DIR"];
const transcriptWin = (page: Page) => graphView(page).locator("[data-subagent-transcript]");
const jl = (type: string, content: unknown) => `${JSON.stringify({ type, timestamp: "2026-10-09T01:02:03.000Z", message: { content } })}\n`;

/** Claude Code の記録の置き場所（`CLAUDE_CONFIG_DIR/projects`）を一時のフォルダへ向ける（実物の `~/.claude` に何も書かない）。 */
async function withConfigDir<T>(body: (cfg: string) => Promise<T>): Promise<T> {
  const cfg = await mkdtemp(join(tmpdir(), "soda-e2e-claudecfg-"));
  const saved = process.env["CLAUDE_CONFIG_DIR"];
  process.env["CLAUDE_CONFIG_DIR"] = cfg;
  try {
    return await body(cfg);
  } finally {
    if (saved === undefined) delete process.env["CLAUDE_CONFIG_DIR"];
    else process.env["CLAUDE_CONFIG_DIR"] = saved;
    await rm(cfg, { recursive: true, force: true });
  }
}
/** 記録（親の `<session>.jsonl` の隣の `<session>/subagents/agent-<id>.jsonl`）を作る。返すのは、フックが報告する親の記録の場所と、サブエージェントの記録のファイル。 */
async function makeTranscript(cfg: string, id: string, lines: string): Promise<{ parent: string; file: string }> {
  const proj = join(cfg, "projects", "-work-proj");
  await mkdir(join(proj, SESSION, "subagents"), { recursive: true });
  const file = join(proj, SESSION, "subagents", `agent-${id}.jsonl`);
  await writeFile(file, lines);
  return { parent: join(proj, `${SESSION}.jsonl`), file };
}

async function openGraph(page: Page, paneId: string): Promise<void> {
  await prefixKey(page, "a");
  await expect(graphView(page)).toBeVisible();
  await expect(graphNode(page, paneId)).toBeVisible();
}

test("小さなノード: 起動から 2 秒たって出る。入れ子は字下げ。6 個まで＋「ほか n 件」。ノードを動かさず、サーバのグラフを書き換えない（AC-U1〜U3）", async ({ page, appServer }) => {
  const { paneId, client } = await startFakeClaude(page, appServer);
  void client;
  await openGraph(page, paneId);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  const sent: string[] = [];
  cdp.on("Network.webSocketFrameSent", (e) => sent.push(e.response.payloadData));
  const parentBox = (await graphNode(page, paneId).boundingBox())!;

  await pending(appServer, paneId, "外側", "Explore", false);
  await startSub(appServer, paneId, "o1", { agentType: "Explore" });
  await report(appServer, paneId, { type: "subagent_pending", description: "内側", agentType: "Plan", parentAgentId: "o1" });
  await startSub(appServer, paneId, "i1", { agentType: "Plan" });
  await expect(graphNode(page, paneId).locator("[data-subagents-button]")).toHaveText("2");
  // 現れて 2 秒たつまでは出さない。
  expect(await smallRows(page).count()).toBe(0);
  await expect(smallRows(page)).toHaveCount(2, { timeout: 6000 });
  const outer = smallRows(page).filter({ hasText: "外側" });
  const inner = smallRows(page).filter({ hasText: "内側" });
  const ob = (await outer.boundingBox())!;
  const ib = (await inner.boundingBox())!;
  expect(ob.x).toBeGreaterThan(parentBox.x + parentBox.width); // 親の右
  expect(ob.y).toBeGreaterThan(parentBox.y + parentBox.height / 2); // 右下
  expect(ib.x).toBeGreaterThan(ob.x); // 入れ子は字下げ
  expect(ib.y).toBeGreaterThan(ob.y);
  await expect(graphView(page).locator("path.graph-subagent-branch")).toHaveCount(2);

  // 多いとき: 合計 9 件 → 6 個＋「ほか 3 件」。
  for (let i = 0; i < 7; i++) await startSub(appServer, paneId, `m${i}`, { agentType: "Explore" });
  await expect(graphView(page).locator("[data-subagent-more]")).toHaveText("ほか 3 件", { timeout: 6000 });
  await expect(smallRows(page)).toHaveCount(6);

  // 終わったものは消える（1 秒かけて）。
  for (let i = 0; i < 7; i++) await stopSub(appServer, paneId, `m${i}`);
  await expect(smallRows(page)).toHaveCount(2, { timeout: 6000 });
  await expect(graphView(page).locator("[data-subagent-more]")).toHaveCount(0);

  // 見るだけ: ノードは動かず、サーバのグラフを書き換える操作は送られていない。
  expect(sent.filter((f) => f.includes('"graph.update"'))).toEqual([]);
  const after = (await graphNode(page, paneId).boundingBox())!;
  expect(Math.abs(after.x - parentBox.x)).toBeLessThan(1);
  expect(Math.abs(after.y - parentBox.y)).toBeLessThan(1);
});

test("小さなノードを押すと一覧のパネルが開く。キー: 親のノードで d → 小さなノード、↓ で次、Esc で親へ戻る", async ({ page, appServer }) => {
  const { paneId } = await startFakeClaude(page, appServer);
  await openGraph(page, paneId);
  await pending(appServer, paneId, "一つ目");
  await startSub(appServer, paneId, "k1");
  await pending(appServer, paneId, "二つ目");
  await startSub(appServer, paneId, "k2");
  await expect(smallRows(page)).toHaveCount(2, { timeout: 6000 });
  await graphNode(page, paneId).focus();
  await page.keyboard.press("d");
  await expect(smallRows(page).first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(smallRows(page).nth(1)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(graphNode(page, paneId)).toBeFocused();
  await expect(graphView(page)).toBeVisible(); // 画面は閉じない
  await smallRows(page).first().click();
  await expect(transcriptWin(page)).toBeVisible(); // 押すと、記録を読むだけの窓（報告に記録の場所が無いので、読めない旨を出す）
  await expect(graphView(page).locator(".subagent-panel")).toHaveCount(0);
});

test("記録を読むだけの窓: 指示・発言・道具・結果が出て、書き足されると下に足される。終わっても読め、× で閉じる。入力はできない（AC-U4）", async ({ page, appServer }) => {
  test.setTimeout(90_000);
  await withConfigDir(async (cfg) => {
    const { paneId } = await startFakeClaude(page, appServer);
    const { parent, file } = await makeTranscript(
      cfg,
      "tr1",
      jl("user", "ログを調べて") + jl("assistant", [{ type: "text", text: "見てみます" }, { type: "tool_use", name: "Bash", input: { command: "grep -r error /var/log", description: "ログを探す" } }]) + jl("user", [{ type: "tool_result", tool_use_id: "t1", content: "3 件見つかりました\n/var/log/a.log" }]),
    );
    await openGraph(page, paneId);
    await report(appServer, paneId, { type: "subagent_pending", description: "ログを調べる", agentType: "Explore" });
    await startSub(appServer, paneId, "tr1", { agentType: "Explore", transcriptPath: parent });
    await expect(smallRows(page)).toHaveCount(1, { timeout: 6000 });
    const sentToPane: string[] = [];
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    cdp.on("Network.webSocketFrameSent", (e) => sentToPane.push(e.response.payloadData));
    await smallRows(page).first().click();
    const win = transcriptWin(page);
    await expect(win).toBeVisible();
    await expect(win.locator('[data-kind="prompt"]')).toContainText("ログを調べて");
    await expect(win.locator('[data-kind="say"]')).toContainText("見てみます");
    await expect(win.locator('[data-kind="tool"]')).toContainText("Bash");
    await expect(win.locator('details[data-kind="result"]')).toContainText("3 件見つかりました");
    await expect(win.locator('details[data-kind="result"]')).not.toHaveAttribute("open", "");
    await expect(win).toContainText("読むだけ。サブエージェントには、入力できません");
    await expect(win.locator("input, textarea, [contenteditable]")).toHaveCount(0);
    await expect(win.locator("[data-subagent-transcript-state]")).toHaveText("実行中");
    // 書き足されると、下に足される（1.5 秒ごとに続きを読む）。
    await appendFile(file, jl("assistant", [{ type: "text", text: "<b>2 件目の発言</b>" }]));
    await expect(win.locator('[data-kind="say"]').nth(1)).toContainText("<b>2 件目の発言</b>", { timeout: 6000 }); // 文字として出る
    await expect(win.locator(".sat-body b")).toHaveCount(0);
    // サブエージェントが終わっても、窓を閉じるまで読める。
    await stopSub(appServer, paneId, "tr1");
    await expect(smallRows(page)).toHaveCount(0, { timeout: 6000 });
    await expect(win.locator("[data-subagent-transcript-state]")).toHaveText("終了", { timeout: 6000 });
    await appendFile(file, jl("assistant", [{ type: "text", text: "終わった後の発言" }]));
    await expect(win).toContainText("終わった後の発言", { timeout: 6000 });
    // 窓の中のキーは、pane へもグラフへも届かない。
    await win.locator(".sat-body").focus();
    await page.keyboard.type("abc");
    await page.waitForTimeout(300);
    expect(sentToPane.filter((f) => f.includes('"abc"') || f.includes('"input"'))).toEqual([]);
    // Esc で閉じる（グラフの画面は閉じない）。
    await win.focus();
    await page.keyboard.press("Escape");
    await expect(win).toHaveCount(0);
    await expect(graphView(page)).toBeVisible();
  });
});

test("偽の報告で記録の場所を根の外へ向けても、窓には中身が出ない（読めない旨だけ）。別の pane・居ない id も読めない（AC-U5）", async ({ page, appServer }) => {
  test.setTimeout(90_000);
  await withConfigDir(async (cfg) => {
    const { paneId } = await startFakeClaude(page, appServer);
    const outside = await mkdtemp(join(tmpdir(), "soda-e2e-outside-"));
    try {
      const { parent } = await makeTranscript(outside, "ev1", jl("user", "TOPSECRET-FILE-CONTENT"));
      await openGraph(page, paneId);
      await startSub(appServer, paneId, "ev1", { agentType: "Explore", transcriptPath: parent });
      await expect(smallRows(page)).toHaveCount(1, { timeout: 6000 });
      await smallRows(page).first().click();
      const win = transcriptWin(page);
      await expect(win).toBeVisible();
      await expect(win.locator("[data-subagent-transcript-note]")).toContainText("置き場所の外", { timeout: 6000 });
      await expect(page.locator("body")).not.toContainText("TOPSECRET-FILE-CONTENT");
      await expect(win).not.toContainText(outside);
      void cfg;
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});

test("60 個の出入りをくり返しても、画面が固まらない（描画のフレームの間隔）", async ({ page, appServer }) => {
  test.setTimeout(90_000);
  const { paneId } = await startFakeClaude(page, appServer);
  await openGraph(page, paneId);
  await page.evaluate(() => {
    const w = window as unknown as { __gaps: number[]; __stop: boolean };
    w.__gaps = [];
    w.__stop = false;
    let last = performance.now();
    const loop = (): void => {
      const n = performance.now();
      w.__gaps.push(n - last);
      last = n;
      if (!w.__stop) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 60; i++) await startSub(appServer, paneId, `c${round}-${i}`, { agentType: "Explore" });
    await page.waitForTimeout(2500);
    for (let i = 0; i < 60; i++) await stopSub(appServer, paneId, `c${round}-${i}`);
    await page.waitForTimeout(1200);
  }
  const gaps = await page.evaluate(() => {
    const w = window as unknown as { __gaps: number[]; __stop: boolean };
    w.__stop = true;
    return w.__gaps.slice(5);
  });
  const sorted = [...gaps].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  process.stdout.write(`[graph-perf] ${JSON.stringify({ case: "e2e-subagent-churn", frames: gaps.length, p95Ms: Math.round(p95), maxMs: Math.round(max) })}\n`);
  expect(gaps.length).toBeGreaterThan(30);
  expect(p95).toBeLessThan(200); // 粗い確かめ（実機のブラウザ・並列の負荷で揺れる）
  await expect(smallRows(page)).toHaveCount(0, { timeout: 5000 }); // 全部終われば、全部消える
});

if (SHOTS !== undefined) {
  const THEMES: { key: string; theme: ThemeName }[] = [
    { key: "dark", theme: "dracula" },
    { key: "light", theme: "catppuccin-latte" },
  ];
  test.describe("絵（判定しない）", () => {
    test.use({ viewport: { width: 1500, height: 800 } });
    for (const { key, theme } of THEMES)
      for (const style of ["classic", "modern"] as const) {
        test(`絵 ${style}-${key}`, async ({ page, appServer }) => {
          test.setTimeout(90_000);
          await mkdir(SHOTS, { recursive: true });
          const c = await appServer.openClient();
          await c.request("prefs.set", { patch: { theme, themeAuto: false, uiStyle: style } });
          const { paneId } = await startFakeClaude(page, appServer);
          await openGraph(page, paneId);
          await pending(appServer, paneId, "テストを直す", "general-purpose", true);
          await startSub(appServer, paneId, "s0", { agentType: "general-purpose" });
          await report(appServer, paneId, { type: "subagent_pending", description: "ログを調べる", agentType: "Explore", parentAgentId: "s0" });
          await startSub(appServer, paneId, "s1", { agentType: "Explore" });
          for (let i = 0; i < 7; i++) {
            await pending(appServer, paneId, `調べもの ${i + 1}`, "Explore", false);
            await startSub(appServer, paneId, `t${i}`, { agentType: "Explore" });
          }
          await expect(graphView(page).locator("[data-subagent-more]")).toBeVisible({ timeout: 8000 });
          await page.evaluate(() => document.fonts.ready.then(() => undefined));
          await page.waitForTimeout(600);
          await page.screenshot({ path: join(SHOTS, `pr6b-${style}-${key}.png`), animations: "disabled", caret: "hide" });
        });
        test(`絵 6c ${style}-${key}`, async ({ page, appServer }) => {
          test.setTimeout(90_000);
          await mkdir(SHOTS, { recursive: true });
          const c = await appServer.openClient();
          await c.request("prefs.set", { patch: { theme, themeAuto: false, uiStyle: style } });
          const { paneId } = await startFakeClaude(page, appServer);
          await openGraph(page, paneId);
          await withConfigDir(async (cfg) => {
            const { parent } = await makeTranscript(
              cfg,
              "t0",
              jl("user", "テストが落ちる理由を調べて、直す方針を提案してください。") +
                jl("assistant", [{ type: "text", text: "まず失敗しているテストを確認します。" }, { type: "tool_use", name: "Bash", input: { command: "pnpm test --reporter=dot", description: "テストを流す" } }]) +
                jl("user", [{ type: "tool_result", tool_use_id: "a", content: "FAIL src/foo.test.ts\n  expected 2 to be 3" }]) +
                jl("assistant", [{ type: "text", text: "foo.test.ts の期待値が古いようです。ソースを読みます。" }, { type: "tool_use", name: "Read", input: { file_path: "/work/src/foo.ts" } }]),
            );
            await pending(appServer, paneId, "テストを直す", "general-purpose", false);
            await startSub(appServer, paneId, "t0", { agentType: "general-purpose", transcriptPath: parent });
            await page.locator('button[data-subagent-id="t0"]').click({ timeout: 8000 });
            await expect(transcriptWin(page).locator('[data-kind="tool"]').nth(1)).toBeVisible({ timeout: 6000 });
            await page.evaluate(() => document.fonts.ready.then(() => undefined));
            await page.waitForTimeout(600);
            await page.screenshot({ path: join(SHOTS, `pr6c-${style}-${key}.png`), animations: "disabled", caret: "hide" });
          });
        });
      }
  });
}
