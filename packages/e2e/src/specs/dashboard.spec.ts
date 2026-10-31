import { appendFile, chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import type { Page } from "@playwright/test";
import { assertPaneResolvesFake } from "@sodashitsu/server";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { watchReceivedEvents } from "../support/frames.js";
import { prefixKey } from "../support/keys.js";

/**
 * ダッシュボード（20261010-agent-usage の PR3。AC1〜AC6）。判定は利用者が見る場所（DOM・テキスト）と、ブラウザが送った・受けたフレーム（CDP）、サーバの状態
 * （新しい接続のスナップショット）で行う（条項 `e2e-observe-browser`）。**実物の `claude` は動かさない**: PATH の先頭の偽の `claude`（記録の場所と数字を作り、フックの報告
 * 〔`SODA_AGENT_REPORT_SOCKET`〕で会話の id と記録の場所を報告し、入力欄の画面を出す）。pane のシェルは rc を読まない bash（利用者の rc が PATH の先頭へ実物の `claude` を足し直すため）。
 * 記録は、`CLAUDE_CONFIG_DIR` の下へ偽の `claude` が作ったもの（利用者の記録を写さない）。
 */
const dir = await mkdtemp(join(tmpdir(), "soda-e2e-dash-"));
const configDir = join(dir, "claude-config");
const projectDir = join(configDir, "projects", "proj-e2e");
await mkdir(join(dir, "bin"), { recursive: true });
await mkdir(projectDir, { recursive: true });
const FAKE = `
import { appendFileSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { randomUUID, createHash } from "node:crypto";
if (process.argv.includes("-p")) {
  let prompt = "";
  process.stdin.on("data", c => prompt += c);
  process.stdin.on("end", () => { writeFileSync(${JSON.stringify(join(dir, "report-prompt.txt"))}, prompt); process.stdout.write(JSON.stringify({ result: "取得した累計トークンを分析しました。改善提案: 記録の範囲を確認してください。", session_id: "report-test" })); });
} else {
const pane = process.env.SODA_PANE_ID;
const sessionId = randomUUID();
const transcript = ${JSON.stringify(projectDir)} + "/" + sessionId + ".jsonl";
const line = (o) => JSON.stringify(o) + "\\n";
writeFileSync(transcript,
  line({ type: "assistant", uuid: "u1", timestamp: new Date().toISOString(), message: { id: "m1", model: "claude-sonnet-5-5", usage: { input_tokens: 100, output_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, content: [{ type: "text", text: "x" }] } }) +
  line({ type: "cost-state", sessionId, totalCostUSD: 2.5, modelUsage: { "claude-sonnet-5-5": { inputTokens: 100, outputTokens: 1000, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 2.5 } } }));
appendFileSync(${JSON.stringify(join(dir, "agents.log"))}, JSON.stringify({ pane, sessionId, transcript }) + "\\n");
process.stdin.setRawMode(true);
process.stdout.write("\\u001b[2J\\u001b[H\\u001b]0;\\u2733 fake\\u0007fake agent ready\\r\\n");
process.stdout.write("\\u2500".repeat(40) + "\\r\\n\\u276f \\r\\n" + "\\u2500".repeat(40) + "\\r\\n  ? for shortcuts\\r\\n");
const sock = process.env.SODA_AGENT_REPORT_SOCKET;
if (sock) {
  const c = connect(sock, () => c.end(JSON.stringify({ paneId: pane, kind: "claude", sessionId, transcriptPath: transcript }) + "\\n"));
  c.on("error", () => {});
}
process.stdin.on("data", (d) => {
  appendFileSync(${JSON.stringify(join(dir, "input.log"))}, JSON.stringify({ pane, data: String(d) }) + "\\n");
  if (String(d).includes("COSTREPORT")) {
    const c=connect(sock,()=>c.end(JSON.stringify({type:"usage",paneId:pane,kind:"claude",sessionId,agentPid:process.pid,configKey:createHash("sha256").update(${JSON.stringify(configDir)}).digest("hex").slice(0,16),costUsd:2.5,fiveHour:{usedPct:12}})+"\\n")); c.on("error",()=>{});
  }
  if (String(d).includes("\\u0004")) process.exit(0);
});
setInterval(() => {}, 1000);
}
`;
await writeFile(join(dir, "fake-agent.mjs"), FAKE);
await writeFile(join(dir, "bin", "claude"), `#!/bin/bash\nexec -a claude ${JSON.stringify(process.execPath)} ${JSON.stringify(join(dir, "fake-agent.mjs"))} "$@"\n`);
await chmod(join(dir, "bin", "claude"), 0o755);
// pane のシェルが rc を読んで PATH の先頭へ実物の `claude` を足し直さないことは、共通の道具（`startAppServer` の既定の、rc を読まない bash）に任せる。
// 打ち込みの前に、pane の中で `command -v claude` が偽のものを指すことを `assertPaneResolvesFake` が確かめる（違えば打ち込まずに落ちる）。
const savedEnv = { PATH: process.env["PATH"], CLAUDE_CONFIG_DIR: process.env["CLAUDE_CONFIG_DIR"], HOME: process.env["HOME"] };
test.beforeAll(() => {
  process.env["PATH"] = `${join(dir, "bin")}${delimiter}${savedEnv.PATH ?? ""}`;
  process.env["CLAUDE_CONFIG_DIR"] = configDir;
  process.env["HOME"] = dir;
});
test.afterAll(async () => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
});
test.beforeEach(async () => {
  await rm(join(dir, "agents.log"), { force: true });
  await rm(join(dir, "input.log"), { force: true });
});

const dash = (page: Page) => page.locator("[data-dashboard]");
const row = (page: Page, paneId: string) => page.locator(`[data-dash-row="${paneId}"]`);

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

async function snapshot(appServer: AppServer) {
  const c = await appServer.openClient();
  try {
    return c.helloSnapshot()!;
  } finally {
    c.close();
  }
}
/** pane でエージェントを起こし、フックの報告（会話の id）が届くまで待つ。記録のファイルの場所を返す。 */
async function startAgent(appServer: AppServer, client: Awaited<ReturnType<AppServer["openClient"]>>, paneId: string, name: string): Promise<string> {
  await assertPaneResolvesFake({ write: (input: string) => client.sendInput(paneId, input), name: "claude", fakeDir: join(dir, "bin"), scratchDir: dir });
  await client.request("agent.start", { name, kind: "claude", paneId, args: [] });
  await expect.poll(async () => (await snapshot(appServer)).panes.find((p) => p.id === paneId)?.agentSession?.sessionId ?? null, { timeout: 30_000 }).not.toBeNull();
  const sid = (await snapshot(appServer)).panes.find((p) => p.id === paneId)!.agentSession!.sessionId;
  return join(projectDir, `${sid}.jsonl`);
}
const assistant = (id: string, out: number): string =>
  JSON.stringify({ type: "assistant", uuid: `u-${id}`, timestamp: new Date().toISOString(), message: { id, model: "claude-sonnet-5-5", usage: { input_tokens: 1, output_tokens: out }, content: [{ type: "text", text: "x" }] } }) + "\n";

async function open(page: Page, appServer: AppServer) {
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
}

test.describe("ダッシュボード（PR3）", () => {
  test.setTimeout(150_000);

  test("利用分析はその他から遅延ロードし、明示操作だけで偽エージェントのレポートを生成する", async ({ page, appServer }) => {
    const client = await appServer.openClient();
    const paneId = client.helloSnapshot()!.panes[0]!.id;
    const record = await startAgent(appServer, client, paneId, "analytics-test");
    const sent = await watchSent(page);
    const resources: string[] = [];
    page.on("request", r => resources.push(r.url()));
    const generated = Array.from({length: 12}, (_, i) => ({ type: "assistant", timestamp: new Date(Date.now() - i * 2 * 86400000).toISOString(), message: { id: `history-${i}`, model: i % 3 ? "claude-sonnet-5-5" : "claude-opus-5", usage: { input_tokens: 100 + i * 10, output_tokens: 600 + i * 60, cache_read_input_tokens: 200 + i * 30, cache_creation_input_tokens: 50 } } }));
    await writeFile(join(projectDir, "generated-history.jsonl"), generated.map(row => JSON.stringify(row)).join("\n") + "\n");
    const separator = appServer.cookie.indexOf("=");
    await page.context().addCookies([{ name: appServer.cookie.slice(0, separator), value: appServer.cookie.slice(separator + 1), url: appServer.origin, httpOnly: true, sameSite: "Strict" }]);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(appServer.origin);
    await expect(page.locator("[data-screen-more]")).toBeVisible();
    expect(resources.some(r => r.includes("UsageAnalytics-"))).toBe(false);
    await page.locator("[data-screen-more]").click();
    await page.locator("[data-usage-analytics]").click();
    const analytics = page.locator("[data-usage-analytics-panel]");
    await expect(analytics).toBeVisible();
    await expect(analytics).toContainText("1,100");
    await expect(analytics.locator("[data-usage-history]")).toContainText("claude-opus-5");
    await expect(analytics).toContainText("100.0%");
    expect(sent().some(r => r.method === "agent.usage_report")).toBe(false);
    await appendFile(record, assistant("analytics-update", 1000));
    await expect(analytics.locator("svg")).toBeVisible({ timeout: 20000 });
    await expect(analytics).toContainText("2,101");
    await analytics.getByRole("combobox", { name: /^エージェント/ }).selectOption("claude");
    await analytics.locator("[data-generate-usage-report]").click();
    await expect(analytics.locator("[data-usage-report]")).toContainText("改善提案", { timeout: 20000 });
    expect(sent().filter(r => r.method === "agent.usage_report")).toHaveLength(1);
    const prompt = await readFile(join(dir, "report-prompt.txt"), "utf8");
    expect(prompt).toContain("cumulative");
    expect(prompt).not.toContain(record);
    expect(prompt).not.toContain('"text":"x"');
    await analytics.locator("[data-usage-history]").scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath("usage-analytics-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(".mobile-shell-title").click();
    await page.locator("[data-picker-dashboard]").click();
    await expect(analytics).toBeVisible();
    await expect(analytics.locator("[data-usage-history]")).toContainText("claude-opus-5");
    const overflow = await analytics.evaluate(element => element.scrollWidth > element.clientWidth + 1);
    expect(overflow).toBe(false);
    await page.screenshot({ path: test.info().outputPath("usage-analytics-narrow.png"), fullPage: true });
    client.close();
  });

  test("切り替えのボタンは 3 つ。一覧にエージェントが出て、数字（トークン・コスト・モデル）が見える。エージェントの居ない pane は出ない。アカウントの枠は「まだ値がありません」", async ({ page, appServer }) => {
    const client = await appServer.openClient();
    const p0 = client.helloSnapshot()!.panes[0]!.id;
    const split = await client.request("pane.split", { paneId: p0, direction: "right" });
    const shellPane = split.pane.id;
    await startAgent(appServer, client, p0, "lead");
    await open(page, appServer);
    await expect(page.locator(".screen-switcher-btn")).toHaveText(["基本画面", "グラフ", "利用状況"]);
    // 正式な名前（読み上げ・title）は両方が分かる形。
    await expect(page.locator('[data-screen-id="dashboard"]')).toHaveAttribute("title", "利用状況（ダッシュボード）");
    await page.locator('[data-screen-id="dashboard"]').click();
    await expect(dash(page)).toBeVisible();
    const r = row(page, p0);
    await expect(r).toBeVisible();
    await expect(r).toContainText("lead");
    await expect(r).toContainText("claude-sonnet-5-5");
    await expect(r.locator("[data-dash-tokens]")).toContainText("累計"); // cost-state があるので、確定した累計
    await expect(r.locator("[data-dash-tokens]")).toContainText("1.1k");
    await expect(r.locator("[data-dash-cost]")).toContainText("$2.50");
    await expect(row(page, shellPane)).toHaveCount(0);
    // アカウントの枠: この環境の記録（空の `CODEX_HOME`・テストの `CLAUDE_CONFIG_DIR`）には、枠の値が無い。
    await expect(page.locator("[data-dash-no-accounts]")).toHaveText("まだ値がありません");
    await expect(page.locator("[data-dash-account]")).toHaveCount(0);
  });

  test("既定の幅（240px）で、3 つの切り替えのボタンのラベルが、どれも切れていない（クラシック・モダン）。畳んだサイドバーでも 3 つ出る", async ({ page, appServer }) => {
    const client = await appServer.openClient();
    await open(page, appServer);
    const clipped = () =>
      page.locator(".screen-switcher-label").evaluateAll((els) => els.map((e) => ({ text: e.textContent, clipped: e.scrollWidth > e.clientWidth })));
    await expect(page.locator(".screen-switcher-label")).toHaveCount(3);
    for (const style of ["classic", "modern"] as const) {
      await client.request("prefs.set", { patch: { uiStyle: style } });
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset["uiStyle"])).toBe(style);
      expect(await page.locator(".sidebar").evaluate((e) => Math.round(e.getBoundingClientRect().width)), "既定の幅").toBeGreaterThanOrEqual(240);
      expect(await clipped(), style).toEqual([
        { text: "基本画面", clipped: false },
        { text: "グラフ", clipped: false },
        { text: "利用状況", clipped: false },
      ]);
    }
    // 畳んだサイドバーでも、3 つ目を出す（短い名前「利」。名前は両方が分かる形のまま）。
    await page.locator(".sidebar-edge-toggle").click();
    await expect(page.locator(".sidebar")).toHaveClass(/sidebar-collapsed/);
    await expect(page.locator(".screen-switcher-btn")).toHaveCount(3);
    await expect(page.locator('[data-screen-id="dashboard"]')).toHaveText("利");
    await expect(page.locator('[data-screen-id="dashboard"]')).toHaveAttribute("aria-label", "利用状況（ダッシュボード）");
  });

  test("見ている間は、記録が増えると画面が更新される（再読み込みなし）。見ていない間は配信が止まる（頼まず・届かず）。戻ると最新になる", async ({ page, appServer }) => {
    const client = await appServer.openClient();
    const p0 = client.helloSnapshot()!.panes[0]!.id;
    const record = await startAgent(appServer, client, p0, "lead");
    const sent = await watchSent(page);
    const received = await watchReceivedEvents(page);
    await open(page, appServer);
    const watches = () => sent().filter((s) => s.method === "agent.usage_watch").map((s) => (s.params as { on: boolean }).on);
    const changes = () => received().filter((e) => e.event === "agent.usage_changed");
    expect(watches()).toEqual([]); // 基本画面の間は頼まない
    await page.locator('[data-screen-id="dashboard"]').click();
    await expect(row(page, p0).locator("[data-dash-tokens]")).toContainText("1.1k");
    expect(watches()).toEqual([true]);
    // 記録が増える → 配信（5 秒おき）で、画面が変わる
    await appendFile(record, assistant("m2", 4000));
    await expect(row(page, p0).locator("[data-dash-tokens]")).toContainText("5.1k", { timeout: 20_000 });
    expect(changes().length).toBeGreaterThan(0);
    // 見えなくなったら止める
    await page.locator('[data-screen-id="base"]').click();
    await expect.poll(watches).toEqual([true, false]);
    const before = changes().length;
    await appendFile(record, assistant("m3", 5000));
    await page.waitForTimeout(7_500);
    expect(changes().length).toBe(before); // 見ていない間は、届かない
    // 戻ると、頼み直して最新になる
    await page.locator('[data-screen-id="dashboard"]').click();
    await expect(row(page, p0).locator("[data-dash-tokens]")).toContainText("10.1k", { timeout: 20_000 });
    expect(watches()).toEqual([true, false, true]);
  });

  test("見ていない別の接続（テストのクライアント）には、配信が届かない", async ({ page, appServer }) => {
    const client = await appServer.openClient();
    const p0 = client.helloSnapshot()!.panes[0]!.id;
    const record = await startAgent(appServer, client, p0, "lead");
    const received = await watchReceivedEvents(page);
    const quiet = await appServer.openClient();
    await open(page, appServer);
    await page.locator('[data-screen-id="dashboard"]').click();
    await expect(row(page, p0)).toBeVisible();
    await appendFile(record, assistant("m2", 4000));
    await expect.poll(() => received().filter((e) => e.event === "agent.usage_changed").length, { timeout: 20_000 }).toBeGreaterThan(0);
    // 見ていない接続（テストのクライアント）には、全クライアントへ配るほかのイベントは届いても、利用状況の配信だけは届かない。
    expect(quiet.lastEvent("agent.usage_changed")).toBeUndefined();
    quiet.close();
  });

  test("行を押すと、その pane の基本画面へ移る（Enter でも）。Esc で基本画面へ戻る。prefix+a でも戻る", async ({ page, appServer }) => {
    const client = await appServer.openClient();
    const p0 = client.helloSnapshot()!.panes[0]!.id;
    await startAgent(appServer, client, p0, "lead");
    const other = await client.request("workspace.create", { cwd: "/tmp", label: "other-ws" });
    await startAgent(appServer, client, other.pane.id, "second");
    await open(page, appServer);
    await page.locator('[data-screen-id="dashboard"]').click();
    await expect(row(page, other.pane.id)).toBeVisible();
    await row(page, other.pane.id).click();
    await expect(dash(page)).toHaveCount(0);
    await expect(page.locator('[data-screen="base"]')).not.toHaveAttribute("inert");
    await expect(page.locator(".sidebar-row-current, .sidebar-row[aria-current]").filter({ hasText: "other-ws" }).first()).toBeVisible();
    // キーボード: 行へフォーカスして Enter
    await page.locator('[data-screen-id="dashboard"]').click();
    await row(page, p0).focus();
    await page.keyboard.press("Enter");
    await expect(dash(page)).toHaveCount(0);
    // Esc・prefix+a
    await page.locator('[data-screen-id="dashboard"]').click();
    await expect(dash(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dash(page)).toHaveCount(0);
    await page.locator('[data-screen-id="dashboard"]').click();
    await expect(dash(page)).toBeVisible();
    await prefixKey(page, "a");
    await expect(dash(page)).toHaveCount(0);
    await expect(page.locator('[data-screen="base"]')).not.toHaveAttribute("inert");
  });

  test("ダッシュボードの画面では、端末へキーが届かない。画面を切り替えても、PTY の大きさ・端末の入力は変わらない", async ({ page, appServer }) => {
    const client = await appServer.openClient();
    const p0 = client.helloSnapshot()!.panes[0]!.id;
    await startAgent(appServer, client, p0, "lead");
    await open(page, appServer);
    await page.locator(".xterm-helper-textarea").first().click();
    await expect.poll(async () => (await snapshot(appServer)).panes.find((p) => p.id === p0)?.cols ?? 0).toBeGreaterThan(20);
    const size = async () => {
      const p = (await snapshot(appServer)).panes.find((x) => x.id === p0)!;
      return { cols: p.cols, rows: p.rows };
    };
    const before = await size();
    await page.locator('[data-screen-id="dashboard"]').click();
    await expect(dash(page)).toBeVisible();
    await row(page, p0).focus();
    await page.keyboard.type("DASH-LEAK-ZZZ");
    await page.keyboard.press("Control+b");
    await page.keyboard.press("Control+b"); // prefix の二度押し（端末へ送る操作）も届かない
    await page.waitForTimeout(500);
    expect(await size()).toEqual(before);
    await page.keyboard.press("Escape");
    await expect(dash(page)).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(await size()).toEqual(before);
    let input = "";
    try {
      input = await readFile(join(dir, "input.log"), "utf8");
    } catch {
      // まだ 1 度も入力が届いていない
    }
    expect(input).not.toContain("DASH-LEAK-ZZZ");
    expect(input).not.toContain("\\u0002");
  });

  test("保存されていない画面（既定）では基本画面から始まる。ダッシュボードの記録の置き場所（パス）は、画面のどこにも出ない", async ({ page, appServer }) => {
    const client = await appServer.openClient();
    const p0 = client.helloSnapshot()!.panes[0]!.id;
    await startAgent(appServer, client, p0, "lead");
    await open(page, appServer);
    await expect(dash(page)).toHaveCount(0);
    await page.locator('[data-screen-id="dashboard"]').click();
    await expect(row(page, p0)).toBeVisible();
    const text = (await dash(page).innerText()) + (await dash(page).innerHTML());
    expect(text).not.toContain(".jsonl");
    expect(text).not.toContain("claude-config");
    expect((await readdir(projectDir)).length).toBeGreaterThan(0);
  });
});

test("account cost opens from the status card with model/effort breakdown and stays usable on mobile", async ({
  page,
  appServer,
}) => {
  test.setTimeout(90_000);
  const client = await appServer.openClient(),
    pane = client.helloSnapshot()!.panes[0]!;
  await startAgent(appServer, client, pane.id, "cost-worker");
  const sessionId = "cost-closed-session";
  await writeFile(
    join(projectDir, `${sessionId}.jsonl`),
    JSON.stringify({
      type: "cost-state",
      sessionId,
      totalCostUSD: 5,
      modelUsage: { "model-closed": { costUSD: 5, effort: "high" } },
    }) + "\n",
  );
  await open(page, appServer);
  await page.locator('[data-screen-id="dashboard"]').click();
  await expect(dash(page)).toBeVisible();
  // Source is a real verified fake agent report, not a client fixture response.
  await expect(async () => {
    client.sendInput(pane.id, "COSTREPORT");
    await expect(page.locator("[data-dash-account]")).toBeVisible({ timeout: 2500 });
  }).toPass({ timeout: 20_000 });
  const card = page.locator("[data-dash-account]");
  await card.click();
  const dialog = page.getByRole("dialog", { name: "アカウントのコスト" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-account-cost-total]")).toHaveText("$7.5000");
  await expect(dialog).toContainText("model-closed");
  await expect(dialog).toContainText("エフォート別");
  await expect(dialog).toContainText("high");
  await expect(dialog).toContainText("不明");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await card.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await page.setViewportSize({ width: 390, height: 700 });
  await expect
    .poll(async () =>
      dialog.evaluate(
        (el) =>
          el.getBoundingClientRect().right <= innerWidth &&
          el.getBoundingClientRect().bottom <= innerHeight,
      ),
    )
    .toBe(true);
  await expect(dialog.getByRole("button", { name: "閉じる" })).toBeVisible();
  await page.screenshot({ path: "/tmp/account-cost-mobile.png" });
  await dialog.getByRole("button", { name: "閉じる" }).click();
  await expect(dialog).toHaveCount(0);
  await page.locator(".mobile-shell-title").click();
  await page.locator("[data-picker-dashboard]").click();
  const mobileDashboard=page.locator(".dashboard-dialog[open]");
  await expect(mobileDashboard).toBeVisible();
  await mobileDashboard.locator("[data-dash-account]").click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-account-cost-total]")).toHaveText("$7.5000");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(mobileDashboard).toBeVisible();
  client.close();
});
