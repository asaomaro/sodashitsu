import { appendFile, chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import type { Page } from "@playwright/test";
import { assertPaneResolvesFake } from "@sodashitsu/server";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { watchReceivedEvents } from "../support/frames.js";
import { prefixKey } from "../support/keys.js";

/**
 * pane の情報（利用状況の窓。20261010-agent-usage の PR4。AC1〜AC5）。判定は利用者が見る場所（DOM・テキスト）と、ブラウザが送った・受けたフレーム（CDP）、サーバの状態
 * （新しい接続のスナップショット）で行う（条項 `e2e-observe-browser`）。**実物の `claude` は動かさない**: PATH の先頭の偽の `claude`（記録の場所と数字を作り、フックの報告
 * 〔`SODA_AGENT_REPORT_SOCKET`〕で会話の id と記録の場所を報告し、入力欄の画面を出す）。pane のシェルは rc を読まない bash（利用者の rc が PATH の先頭へ実物の `claude` を足し直すため）。
 * 記録は、`CLAUDE_CONFIG_DIR` の下へ偽の `claude` が作ったもの（利用者の記録を写さない）。
 */
const dir = await mkdtemp(join(tmpdir(), "soda-e2e-pinfo-"));
const configDir = join(dir, "claude-config");
const projectDir = join(configDir, "projects", "proj-e2e");
await mkdir(join(dir, "bin"), { recursive: true });
await mkdir(projectDir, { recursive: true });
const FAKE = `
import { appendFileSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { randomUUID } from "node:crypto";
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
  if (String(d).includes("\\u0004")) process.exit(0);
});
setInterval(() => {}, 1000);
`;
await writeFile(join(dir, "fake-agent.mjs"), FAKE);
await writeFile(join(dir, "bin", "claude"), `#!/bin/bash\nexec -a claude ${JSON.stringify(process.execPath)} ${JSON.stringify(join(dir, "fake-agent.mjs"))} "$@"\n`);
await chmod(join(dir, "bin", "claude"), 0o755);
// pane のシェルが rc を読んで PATH の先頭へ実物の `claude` を足し直さないことは、共通の道具（`startAppServer` の既定の、rc を読まない bash）に任せる。
// 打ち込みの前に、pane の中で `command -v claude` が偽のものを指すことを `assertPaneResolvesFake` が確かめる（違えば打ち込まずに落ちる）。
const savedEnv = { PATH: process.env["PATH"], CLAUDE_CONFIG_DIR: process.env["CLAUDE_CONFIG_DIR"] };
test.beforeAll(() => {
  process.env["PATH"] = `${join(dir, "bin")}${delimiter}${savedEnv.PATH ?? ""}`;
  process.env["CLAUDE_CONFIG_DIR"] = configDir;
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


const win = (page: Page) => page.locator("[data-pane-info-window]");
const infoBtn = (page: Page) => page.locator('[data-pane-action="info"]');
/** フォーカスが端末の入力欄にある。 */
const focusInTerminal = (page: Page) => expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains("xterm-helper-textarea") === true)).toBe(true);

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

async function open(page: Page, appServer: AppServer, style: "classic" | "modern") {
  const c = await appServer.openClient();
  await c.request("prefs.set", { patch: { uiStyle: style, paneAgentNameVisible: true } });
  c.close();
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-ui-style"))).toBe(style);
}

test.describe("pane の情報（PR4）", () => {
  test.setTimeout(150_000);

  test("モダン: ［情報］を押すと窓が開き、数字（トークン・コスト・モデル・コンテキスト）が出る。同じボタンで閉じる。Esc でも閉じて、フォーカスは端末へ戻る。閉じたら配信は止まる", async ({ page, appServer }) => {
    const client = await appServer.openClient();
    const p0 = client.helloSnapshot()!.panes[0]!.id;
    const record = await startAgent(appServer, client, p0, "lead");
    const sent = await watchSent(page);
    const received = await watchReceivedEvents(page);
    await open(page, appServer, "modern");
    const watches = () => sent().filter((s) => s.method === "agent.usage_watch").map((s) => (s.params as { on: boolean }).on);
    const changes = () => received().filter((e) => e.event === "agent.usage_changed");
    expect(watches()).toEqual([]); // 窓が閉じている間は頼まない
    await expect(infoBtn(page)).toHaveCount(1);
    await expect(infoBtn(page)).toHaveAttribute("aria-label", "利用状況（情報）");
    await infoBtn(page).click();
    await expect(win(page)).toBeVisible();
    await expect(win(page).locator("[data-pane-info-tokens]")).toContainText("1.1k");
    await expect(win(page).locator("[data-pane-info-tokens]")).toContainText("累計"); // cost-state があるので、確定した累計
    await expect(win(page).locator("[data-pane-info-cost]")).toContainText("$2.50");
    await expect(win(page).locator("[data-pane-info-model]")).toHaveText("claude-sonnet-5-5");
    await expect(win(page)).toContainText("lead");
    expect(watches()).toEqual([true]); // ダッシュボードが見えていなくても、窓が開いていれば頼む
    // 記録が増える → 配信（5 秒おき）で、窓の数字が変わる
    await appendFile(record, assistant("m2", 4000));
    await expect(win(page).locator("[data-pane-info-tokens]")).toContainText("5.1k", { timeout: 20_000 });
    expect(changes().length).toBeGreaterThan(0);
    // 窓の位置は pane の中（端末の領域の中。画面からはみ出さない）
    const frame = (await page.locator(".pane-frame").first().boundingBox())!;
    const box = (await win(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(frame.x - 0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width + 0.5);
    // もう一度押すと閉じる（同じボタン）
    await infoBtn(page).click();
    await expect(win(page)).toHaveCount(0);
    await expect.poll(watches).toEqual([true, false]);
    const before = changes().length;
    await appendFile(record, assistant("m3", 5000));
    await page.waitForTimeout(7_500);
    expect(changes().length, "閉じたら配信は届かない").toBe(before);
    // 開き直す → Esc で閉じる → フォーカスは端末へ
    await infoBtn(page).click();
    await expect(win(page)).toBeVisible();
    await expect(win(page).locator("[data-pane-info-tokens]")).toContainText("10.1k", { timeout: 20_000 });
    await page.keyboard.press("Escape");
    await expect(win(page)).toHaveCount(0);
    await focusInTerminal(page);
    await expect.poll(watches).toEqual([true, false, true, false]);
  });

  test("クラシック: 隅のボタンは出ない（配置は今のまま）。右クリックのメニュー「利用状況…」とキー（prefix+shift+u）から開く。窓を閉じると配信が止まる", async ({ page, appServer }) => {
    const client = await appServer.openClient();
    const p0 = client.helloSnapshot()!.panes[0]!.id;
    await startAgent(appServer, client, p0, "lead");
    const sent = await watchSent(page);
    await open(page, appServer, "classic");
    const watches = () => sent().filter((s) => s.method === "agent.usage_watch").map((s) => (s.params as { on: boolean }).on);
    await expect(page.locator("[data-pane-actions]")).toHaveCount(0);
    await expect(infoBtn(page)).toHaveCount(0);
    // 右クリックのメニュー
    await page.locator(".terminal-pane").first().click({ button: "right" });
    const item = page.locator('[role="menuitem"]', { hasText: "利用状況…" });
    await expect(item).toHaveCount(1);
    await item.click();
    await expect(win(page)).toBeVisible();
    await expect(win(page).locator("[data-pane-info-cost]")).toContainText("$2.50");
    expect(watches()).toEqual([true]);
    await page.keyboard.press("Escape");
    await expect(win(page)).toHaveCount(0);
    await focusInTerminal(page);
    await expect.poll(watches).toEqual([true, false]);
    // キー: もう一度で閉じる
    await prefixKey(page, "U");
    await expect(win(page)).toBeVisible();
    await expect.poll(watches).toEqual([true, false, true]);
    await prefixKey(page, "U");
    await expect(win(page)).toHaveCount(0);
    await expect.poll(watches).toEqual([true, false, true, false]);
    await focusInTerminal(page);
  });

  test("エージェントの居ない pane では、ボタン・メニューの項目・キーのどれも働かない（モダン・クラシック）。外を押すと窓は閉じる", async ({ page, appServer }) => {
    const client = await appServer.openClient();
    const p0 = client.helloSnapshot()!.panes[0]!.id;
    const split = await client.request("pane.split", { paneId: p0, direction: "right" });
    await startAgent(appServer, client, p0, "lead");
    const sent = await watchSent(page);
    await open(page, appServer, "modern");
    // 2 つの pane のうち、［情報］が出るのはエージェントの居る 1 つだけ。
    await expect(page.locator("[data-pane-actions]")).toHaveCount(2);
    await expect(infoBtn(page)).toHaveCount(1);
    // エージェントの居ない pane を選んで、キー: 何も開かない。
    await page.locator(`[data-pane-id="${split.pane.id}"] .terminal-pane`).click();
    await prefixKey(page, "U");
    await page.waitForTimeout(300);
    await expect(win(page)).toHaveCount(0);
    expect(sent().filter((s) => s.method === "agent.usage_watch")).toEqual([]);
    // メニューにも出ない
    await page.locator(`[data-pane-id="${split.pane.id}"] .terminal-pane`).click({ button: "right" });
    await expect(page.locator('[role="menu"]')).toBeVisible();
    await expect(page.locator('[role="menuitem"]', { hasText: "利用状況…" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    // エージェントの居る pane の窓は、外（端末）を押すと閉じる
    await infoBtn(page).click();
    await expect(win(page)).toBeVisible();
    await page.locator(`[data-pane-id="${split.pane.id}"] .terminal-pane`).click();
    await expect(win(page)).toHaveCount(0);
    await focusInTerminal(page);
  });
});
