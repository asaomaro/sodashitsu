import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { devices, type WebSocketRoute } from "@playwright/test";
import type { ThemeName } from "@sodashitsu/protocol";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";

/**
 * ダッシュボードの 1 列の画面（20261010-agent-usage の PR3。AC4）。判定は利用者が見る場所（DOM・テキスト）と、ブラウザが送った・受けたフレーム（CDP）、サーバの状態
 * （新しい接続のスナップショット）で行う（条項 `e2e-observe-browser`）。**実物の `claude` は動かさない**: PATH の先頭の偽の `claude`（記録の場所と数字を作り、フックの報告
 * 〔`SODA_AGENT_REPORT_SOCKET`〕で会話の id と記録の場所を報告し、入力欄の画面を出す）。pane のシェルは rc を読まない bash（利用者の rc が PATH の先頭へ実物の `claude` を足し直すため）。
 * 記録は、`CLAUDE_CONFIG_DIR` の下へ偽の `claude` が作ったもの（利用者の記録を写さない）。
 */
const dir = await mkdtemp(join(tmpdir(), "soda-e2e-dashm-"));
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
await writeFile(join(dir, "bin", "shell"), `#!/bin/bash\nexec /bin/bash --norc --noprofile "$@"\n`);
await chmod(join(dir, "bin", "shell"), 0o755);
const savedEnv = { PATH: process.env["PATH"], SHELL: process.env["SHELL"], CLAUDE_CONFIG_DIR: process.env["CLAUDE_CONFIG_DIR"] };
test.beforeAll(() => {
  process.env["PATH"] = `${join(dir, "bin")}${delimiter}${savedEnv.PATH ?? ""}`;
  process.env["SHELL"] = join(dir, "bin", "shell");
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


test.use({ ...devices["iPhone 13"], defaultBrowserType: "chromium" });

test("1 列の画面: pane のピッカーの［ダッシュボード］から重ねるダイアログが開き、行（44px 以上）を押すとその pane へ移ってダイアログが閉じる。Esc でも閉じる", async ({ page, appServer }) => {
  test.setTimeout(90_000);
  const client = await appServer.openClient("mobile");
  const p0 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("agent.start", { name: "lead", kind: "claude", paneId: p0, args: [] });
  await expect.poll(async () => {
    const c = await appServer.openClient();
    try {
      return c.helloSnapshot()!.panes.find((p) => p.id === p0)?.agentSession?.sessionId ?? null;
    } finally {
      c.close();
    }
  }, { timeout: 30_000 }).not.toBeNull();
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await expect(page.locator(".mobile-shell")).toBeVisible();
  await expect(page.locator(".screen-switcher")).toHaveCount(0); // 1 列には、画面の切り替えは無い
  await page.locator(".mobile-shell-title").click();
  await page.locator("[data-picker-dashboard]").click();
  const d = page.locator("dialog.dashboard-dialog");
  await expect(d).toBeVisible();
  const row = d.locator(`[data-dash-row="${p0}"]`);
  await expect(row).toBeVisible();
  await expect(row).toContainText("lead");
  await expect(row).toContainText("claude-sonnet-5-5");
  expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await d.locator("[data-dash-close]").boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Escape");
  await expect(d).toBeHidden();
  await page.locator(".mobile-shell-title").click();
  await page.locator("[data-picker-dashboard]").click();
  await expect(d).toBeVisible();
  await d.locator(`[data-dash-row="${p0}"]`).click();
  await expect(d).toBeHidden();
  await expect(page.locator(".mobile-shell")).toBeVisible();
});

// 絵（`DASHBOARD_SHOTS_DIR` を渡したときだけ）。値は、ページが受けるイベントとして差し込む（見た目を撮るため）。
const OUT = process.env["DASHBOARD_SHOTS_DIR"];
const THEMES: { key: string; theme: ThemeName }[] = [
  { key: "dark", theme: "dracula" },
  { key: "light", theme: "catppuccin-latte" },
];
for (const { key, theme } of THEMES)
  test(`絵: dashboard-mobile-${key}`, async ({ page, appServer }) => {
    test.skip(OUT === undefined, "DASHBOARD_SHOTS_DIR を渡したときだけ撮る");
    test.setTimeout(120_000);
    await mkdir(OUT!, { recursive: true });
    const client = await appServer.openClient("mobile");
    const p0 = client.helloSnapshot()!.panes[0]!.id;
    await client.request("prefs.set", { patch: { theme, themeAuto: false } });
    let route: WebSocketRoute | undefined;
    let frozen = false;
    await page.routeWebSocket(/\/ws$/, (ws) => {
      route = ws;
      const server = ws.connectToServer();
      server.onMessage((m) => {
        if (frozen && typeof m === "string" && m.includes('"agent.usage_changed"')) return; // 差し込んだ後は、本当の配信で上書きしない
        ws.send(m);
      });
      ws.onMessage((m) => server.send(m));
    });
    await client.request("agent.start", { name: "lead", kind: "claude", paneId: p0, args: [] });
    await expect
      .poll(async () => {
        const c = await appServer.openClient();
        try {
          return c.helloSnapshot()!.panes.find((p) => p.id === p0)?.agentSession?.sessionId ?? null;
        } finally {
          c.close();
        }
      }, { timeout: 30_000 })
      .not.toBeNull();
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
    await page.locator(".mobile-shell-title").click();
    await page.locator("[data-picker-dashboard]").click();
    await expect(page.locator("dialog.dashboard-dialog [data-dash-row]")).toHaveCount(1);
    const now = Date.now();
    frozen = true;
    route?.send(
      JSON.stringify({
        event: "agent.usage_changed",
        data: {
          panes: { [p0]: { paneId: p0, kind: "claude", model: "claude-sonnet-5-5", tokens: { basis: "cumulative", total: 1_240_000 }, costUsd: 4.12, costBasis: "reported", contextUsedPct: 63, source: "statusline", updatedAt: now - 4000 } },
          accounts: [{ kind: "claude", accountKey: "c1", label: "Claude Code", plan: "Max", source: "statusline", asOf: now - 40_000, windows: [{ label: "5 時間", usedPct: 62, resetsAt: now + 95 * 60_000 }, { label: "週", usedPct: 31, resetsAt: now + 3 * 86_400_000 }] }],
        },
      }),
    );
    await expect(page.locator("[data-dash-account]").filter({ hasText: "Max" })).toHaveCount(1);
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT!, `mobile-${key}-values.png`), animations: "disabled", caret: "hide" });
  });
