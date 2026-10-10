import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import type { Page, WebSocketRoute } from "@playwright/test";
import type { ThemeName } from "@sodashitsu/protocol";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";

/**
 * ダッシュボードの絵（20261010-agent-usage の PR3。AC7）。`DASHBOARD_SHOTS_DIR` を渡したときだけ撮る。判定はしない。判定は利用者が見る場所（DOM・テキスト）と、ブラウザが送った・受けたフレーム（CDP）、サーバの状態
 * （新しい接続のスナップショット）で行う（条項 `e2e-observe-browser`）。**実物の `claude` は動かさない**: PATH の先頭の偽の `claude`（記録の場所と数字を作り、フックの報告
 * 〔`SODA_AGENT_REPORT_SOCKET`〕で会話の id と記録の場所を報告し、入力欄の画面を出す）。pane のシェルは rc を読まない bash（利用者の rc が PATH の先頭へ実物の `claude` を足し直すため）。
 * 記録は、`CLAUDE_CONFIG_DIR` の下へ偽の `claude` が作ったもの（利用者の記録を写さない）。
 */
const dir = await mkdtemp(join(tmpdir(), "soda-e2e-dashs-"));
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


const OUT = process.env["DASHBOARD_SHOTS_DIR"];
test.skip(OUT === undefined, "DASHBOARD_SHOTS_DIR を渡したときだけ撮る");

const THEMES: { key: string; theme: ThemeName }[] = [
  { key: "dark", theme: "dracula" },
  { key: "light", theme: "catppuccin-latte" },
];

/** ページが受ける `agent.usage_changed` を、このテストが差し込む（値の見た目を撮るため。サーバの値とは別）。 */
async function routeInjectable(page: Page): Promise<{ send(data: unknown): void }> {
  let route: WebSocketRoute | undefined;
  let frozen = false;
  await page.routeWebSocket(/\/ws$/, (ws) => {
    route = ws;
    const server = ws.connectToServer();
    server.onMessage((m) => {
      // 差し込んだ後は、サーバの本当の配信（この環境の利用者の Codex の枠など）で上書きされないよう、止める。
      if (frozen && typeof m === "string" && m.includes('"agent.usage_changed"')) return;
      ws.send(m);
    });
    ws.onMessage((m) => server.send(m));
  });
  return {
    send: (data) => {
      frozen = true;
      route?.send(JSON.stringify({ event: "agent.usage_changed", data }));
    },
  };
}

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT!, `${name}.png`), animations: "disabled", caret: "hide" });
}

async function startAgent(appServer: AppServer, client: Awaited<ReturnType<AppServer["openClient"]>>, paneId: string, name: string): Promise<void> {
  await client.request("agent.start", { name, kind: "claude", paneId, args: [] });
  await expect
    .poll(async () => {
      const c = await appServer.openClient();
      try {
        return c.helloSnapshot()!.panes.find((p) => p.id === paneId)?.agentSession?.sessionId ?? null;
      } finally {
        c.close();
      }
    }, { timeout: 30_000 })
    .not.toBeNull();
}

const usage = (paneId: string, over: Record<string, unknown>) => ({
  paneId,
  kind: "claude",
  model: "claude-sonnet-5-5",
  tokens: { basis: "transcript", input: 4200, output: 18_300, cacheRead: 910_000 },
  source: "transcript",
  updatedAt: Date.now() - 4000,
  ...over,
});

for (const { key, theme } of THEMES)
  for (const style of ["classic", "modern"] as const)
    test(`dashboard-${style}-${key}`, async ({ page, appServer }) => {
      test.setTimeout(150_000);
      await mkdir(OUT!, { recursive: true });
      const client = await appServer.openClient();
      // 行の「場所」に、この作業フォルダの実パスが写らないよう、短い一時のフォルダの workspace だけにする（最初の workspace は閉じる）。
      const root = await mkdtemp(join(tmpdir(), "shots-"));
      const dirs = await Promise.all(["app", "api", "docs"].map(async (n) => {
        await mkdir(join(root, n), { recursive: true });
        return join(root, n);
      }));
      const initial = client.helloSnapshot()!.workspaces[0]!;
      const w1 = await client.request("workspace.create", { cwd: dirs[0]!, label: "app" });
      await client.request("workspace.close", { workspaceId: initial.id });
      const p0 = w1.pane.id;
      await client.request("prefs.set", { patch: { theme, themeAuto: false, uiStyle: style } });
      await page.setViewportSize({ width: 1400, height: 760 });
      const inject = await routeInjectable(page);
      await page.goto(`${appServer.origin}/#token=${appServer.token}`);
      await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset["uiStyle"])).toBe(style);
      // 値なし（エージェントが居ない）
      await page.locator('[data-screen-id="dashboard"]').click();
      await expect(page.locator("[data-dashboard]")).toBeVisible();
      await shot(page, `${style}-${key}-1-empty`);
      await page.locator('[data-screen-id="base"]').click();
      // エージェントを 3 つ
      const w2 = await client.request("workspace.create", { cwd: dirs[1]!, label: "api-server" });
      const w3 = await client.request("workspace.create", { cwd: dirs[2]!, label: "docs" });
      await startAgent(appServer, client, p0, "lead");
      await startAgent(appServer, client, w2.pane.id, "reviewer");
      await startAgent(appServer, client, w3.pane.id, "writer");
      await page.locator('[data-screen-id="dashboard"]').click();
      await expect(page.locator("[data-dash-row]")).toHaveCount(3, { timeout: 30_000 });
      await expect(page.locator("[data-dash-loading]")).toHaveCount(0); // 最初の応答（agent.usage）が届いてから差し込む
      // 値あり（差し込み）: 報告のコスト・コンテキスト・古い値・Codex の枠・Claude の枠（古い印・組織の額）
      const now = Date.now();
      inject.send({
        panes: {
          [p0]: usage(p0, { costUsd: 4.12, costBasis: "reported", contextUsedPct: 63, tokens: { basis: "cumulative", total: 1_240_000 } }),
          [w2.pane.id]: usage(w2.pane.id, { costUsd: 0.38, costBasis: "cost-state", costAsOf: now - 8 * 60_000, contextTokens: 31_000, partial: true, tokens: { basis: "transcript", total: 84_000 } }),
          [w3.pane.id]: usage(w3.pane.id, { model: "gpt-5-codex", kind: "codex", updatedAt: now - 9 * 60_000, scanning: true, tokens: { basis: "transcript", total: 12_500 } }),
        },
        accounts: [
          { kind: "claude", accountKey: "c1", label: "Claude Code", plan: "Max", source: "statusline", asOf: now - 40_000, windows: [{ label: "5 時間", usedPct: 62, resetsAt: now + 95 * 60_000 }, { label: "週", usedPct: 31, resetsAt: now + 3 * 86_400_000 }, { label: "組織", usedPct: 25, usedUsd: 12.5, limitUsd: 50, stale: true }] },
          { kind: "codex", accountKey: "x1", label: "Codex", source: "rollout", asOf: now - 12 * 60_000, windows: [{ label: "5 時間", usedPct: 12, resetsAt: now + 200 * 60_000 }, { label: "週", usedPct: 54, resetsAt: now - 1000 }] },
        ],
      });
      await expect(page.locator("[data-dash-account]").filter({ hasText: "Max" })).toHaveCount(1);
      await page.mouse.move(700, 700);
      await shot(page, `${style}-${key}-2-values`);
      // 並べ替え: コスト
      await page.locator("[data-dash-sort]").selectOption("cost");
      await shot(page, `${style}-${key}-3-sorted-cost`);
    });

