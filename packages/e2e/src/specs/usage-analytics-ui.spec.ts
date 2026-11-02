import type {
  UsageInsights,
  InsightGroup,
  HistoryGroup,
  UsageHistory,
  HistoryTokens,
} from "@sodashitsu/protocol";
import { expect, test } from "../support/fixtures.js";

/** Browser rendering test with generated numeric RPC responses. Server readers and isolated fake CLI are verified separately by unit tests; no model executes here. */
test("generated usage analytics charts, date selection and explicit report work at desktop and narrow widths", async ({
  page,
  appServer,
}) => {
  test.setTimeout(60000);
  const client = await appServer.openClient();
  await client.request("prefs.set", { patch: { uiStyle: "modern" } });
  const snapshot = (await client.request("client.hello", { protocol: 1, kind: "desktop" }))
    .snapshot;
  const pane = snapshot.panes[0]!;
  const requests: { method: string; params: any }[] = [],
    resources: string[] = [];
  page.on("request", (r) => resources.push(r.url()));
  const usage = {
    panes: {
      [pane.id]: {
        paneId: pane.id,
        kind: "codex",
        model: "gpt-6",
        tokens: { basis: "cumulative", total: 25000 },
        source: "rollout",
        updatedAt: Date.now(),
      },
    },
    accounts: [
      {
        kind: "claude",
        accountKey: "generated",
        label: "Claude（テスト用）",
        windows: [],
        source: "transcript",
        asOf: Date.now(),
      },
    ],
  };
  function history(from: string, to: string): UsageHistory {
    const rows: HistoryGroup[] = [];
    const end = Date.parse(to + "T00:00:00Z");
    for (let i = 0; i < 12; i++) {
      const at = new Date(end - i * 2 * 86400000).toISOString().slice(0, 10);
      if (at < from) continue;
      const input = 100 + i * 40,
        output = 300 + i * 200,
        cacheRead = 500 + i * 100,
        cacheWrite = 50;
      rows.push({
        label: at,
        input,
        output,
        cacheRead,
        cacheWrite,
        total: input + output + cacheRead + cacheWrite,
        calls: 1,
      });
    }
    const totals = rows.reduce(
      (sum, row) => ({
        input: sum.input + row.input,
        output: sum.output + row.output,
        cacheRead: sum.cacheRead + row.cacheRead,
        cacheWrite: sum.cacheWrite + row.cacheWrite,
        total: sum.total + row.total,
      }),
      { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    );
    const group = (label: string, part: HistoryTokens, calls = 1): HistoryGroup => ({
      label,
      ...part,
      calls,
    });
    return {
      from,
      to,
      timezone: "UTC",
      asOf: Date.now(),
      partial: true,
      files: 3,
      excluded: 1,
      calls: rows.length,
      sessions: 3,
      totals,
      byDay: rows.sort((a, b) => a.label.localeCompare(b.label)),
      byKind: [group("claude", totals, rows.length)],
      byModel: [group("claude · sonnet", totals, rows.length)],
      byHour: [group("09", totals, rows.length)],
      bySession: [group("claude · 1234abcd", totals, rows.length)],
      sources: ["生成した主会話の応答使用量"],
    };
  }
  function insights(from: string, to: string, kind?: string): UsageInsights {
    const h = history(from, to),
      group = (key: string, total: number, label = key): InsightGroup => ({
        key,
        label,
        input: total,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total,
        calls: 1,
        tools: 0,
        errors: 0,
        knownResults: 0,
      });
    const total = kind === "codex" ? 1200 : 10000,
      main = group("main", total * 0.38),
      sub = group("sub", total * 0.62);
    return {
      activity: { started: 3, completed: 2, aborted: 1, failed: 0 },
      from,
      to,
      asOf: Date.now(),
      timezone: "UTC",
      partial: true,
      collecting: false,
      retainedFrom: "2025-01-01",
      totals: { ...group("total", total), tools: 10, knownResults: 9, errors: 1 },
      previous: group("previous", 5000),
      byDay: h.byDay.map((r) => group(r.label, r.total)),
      previousByDay: [],
      byDayRole: h.byDay.flatMap((r) => [
        group(r.label + ":main", r.total * 0.38),
        group(r.label + ":sub", r.total * 0.62),
      ]),
      byKind: [group(kind || "claude", total)],
      byModel: [group("sonnet", total)],
      byProject: [group("demo", total, "テストPJ")],
      byAccount: [group("generated", total, "設定A")],
      byRole: [main, sub],
      byHour: [group("09", total)],
      tools: [
        {
          name: "Bash",
          category: "shell",
          basis: "direct",
          calls: 7,
          success: 6,
          failed: 1,
          unknown: 0,
        },
        {
          name: "mcp__github__read",
          category: "mcp",
          basis: "direct",
          calls: 3,
          success: 2,
          failed: 0,
          unknown: 1,
        },
      ],
      sessions: [
        {
          ...main,
          key: "main",
          label: "main0001",
          kind: "claude",
          parent: null,
          role: "main",
          project: "テストPJ",
          account: "設定A",
          firstAt: Date.now(),
          lastAt: Date.now(),
        },
        {
          ...sub,
          key: "sub",
          label: "sub00001",
          kind: "claude",
          parent: "main",
          role: "sub",
          project: "テストPJ",
          account: "設定A",
          firstAt: Date.now(),
          lastAt: Date.now(),
        },
      ],
      coverage: [
        {
          kind: "claude",
          files: 3,
          pending: 0,
          missing: 1,
          invalid: 0,
          oversized: 0,
          firstAt: Date.now(),
          lastAt: Date.now(),
          limited: false,
        },
        {
          kind: "codex",
          files: 1,
          pending: 0,
          missing: 0,
          invalid: 0,
          oversized: 0,
          firstAt: Date.now(),
          lastAt: Date.now(),
          limited: false,
        },
      ],
      options: {
        kinds: ["claude", "codex"],
        models: ["sonnet", "long-model-name-".repeat(6)],
        projects: [{ key: "demo", label: "テストPJ" }],
        accounts: [{ key: "generated", label: "設定A" }],
      },
    };
  }
  await page.routeWebSocket(/\/ws$/, (route) => {
    route.onMessage(async (data) => {
      if (typeof data !== "string") return;
      const request = JSON.parse(data);
      if (!request.method) return;
      requests.push(request);
      try {
        let result: unknown;
        if (request.method === "client.hello") result = { clientId: "generated-browser", snapshot };
        else if (request.method === "agent.usage") result = usage;
        else if (request.method === "agent.usage_watch") result = {};
        else if (request.method === "agent.usage_insights")
          result = insights(request.params.from, request.params.to, request.params.kind);
        else if (request.method === "agent.usage_history")
          result = history(request.params.from, request.params.to);
        else if (request.method === "agent.account_cost")
          result = {
            accountKey: "generated",
            totalUsd: 3,
            sessions: 2,
            unpricedSessions: 1,
            partial: true,
            asOf: Date.now(),
            byModel: [
              { label: "sonnet", usd: 2, sessions: 1 },
              { label: "不明", usd: 1, sessions: 1 },
            ],
            byEffort: [],
          };
        else if (request.method === "agent.usage_report")
          result = {
            document: {
              summary: "利用状況の要点",
              work: [
                {
                  agent: "実装担当" + "LongName".repeat(18),
                  workspace: "操舵室",
                  status: "進行中",
                  description: "分析画面を整備",
                  evidence: "直近の作業指示",
                },
              ],
              patterns: [{ title: "ツール利用", detail: "シェルとMCPを活用" }],
              recommendations: [
                {
                  priority: "high",
                  title: "取得範囲の確認",
                  detail: "改善提案: 欠損の確認を先に行う",
                },
              ],
              limitations: ["部分取得"],
            },
            metrics: { tokens: 1200, toolCalls: 10, subRatio: 62, cacheRatio: 70, costUsd: 3 },
            text: "現在の取り組み: 利用ダッシュボードの整備。生成した数値の説明。改善提案: キャッシュ利用の変化を確認してください。",
            kind: request.params.settings.kind,
            model: request.params.settings.model,
            updatedAt: Date.now(),
          };
        else result = await client.request(request.method as never, request.params as never);
        route.send(JSON.stringify({ id: request.id, ok: true, result }));
      } catch {
        route.send(
          JSON.stringify({
            id: request.id,
            ok: false,
            error: { code: "not_found", message: "generated test fixture" },
          }),
        );
      }
    });
  });
  const separator = appServer.cookie.indexOf("=");
  await page.context().addCookies([
    {
      name: appServer.cookie.slice(0, separator),
      value: appServer.cookie.slice(separator + 1),
      url: appServer.origin,
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
  await page.addInitScript(() =>
    localStorage.setItem("soda.prefs.v1", JSON.stringify({ onboarding: false, uiStyle: "modern" })),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(appServer.origin);
  await expect(page.locator("[data-screen-more]")).toBeVisible();
  expect(resources.some((url) => url.includes("UsageAnalytics-"))).toBe(false);
  await page.locator("[data-screen-more]").click();
  await page.locator("[data-usage-analytics]").click();
  const expanded = page.locator("[data-usage-insights]");
  await expect(expanded.locator(".role-donut")).toContainText("62%");
  await expect(expanded.locator(".parent-branch .child-nodes")).toContainText("sub00001");
  await expect(expanded.locator(".period-bars button")).toHaveCount(30);
  await expanded.getByRole("button", { name: "期間・条件", exact: true }).click();
  await expanded.getByRole("combobox", { name: "種類", exact: true }).selectOption("codex");
  await expanded.getByRole("button", { name: "集計・更新", exact: true }).click();
  await expect(expanded.locator(".insights-metrics article").first()).toContainText("1200");
  await expanded.getByText("取得範囲と欠損を確認", { exact: true }).click();
  await expect(expanded.locator(".coverage")).toContainText("読取不可 1");
  await expanded
    .locator(".insight-card")
    .filter({ has: page.getByRole("heading", { name: "ツール利用の構成", exact: true }) })
    .locator("summary")
    .click();
  await expect(expanded).toContainText("mcp__github__read");
  const download = page.waitForEvent("download");
  await expanded.getByRole("button", { name: "JSON", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^soda-usage-/);
  await page.screenshot({
    path: test.info().outputPath("usage-insights-desktop.png"),
    fullPage: true,
  });
  const panel = page.locator("[data-usage-analytics-panel]"),
    costPanel = panel.locator("[data-account-cost]");
  expect(requests.some((r) => r.method === "agent.usage_history")).toBe(false);
  expect(requests.some((r) => r.method === "agent.usage_report")).toBe(false);
  await expect(panel.locator(".legacy-analysis")).toHaveCount(0);
  await panel.getByRole("button", { name: "比較", exact: true }).click();
  await costPanel.locator("[data-analytics-account]").selectOption("generated");
  await expect(costPanel.locator("[data-analytics-model]")).toHaveCount(2);
  await page.screenshot({
    path: test.info().outputPath("usage-cost-integrated.png"),
    fullPage: true,
  });
  await panel.getByRole("button", { name: "エージェント分析", exact: true }).click();
  await expect(expanded).toBeHidden();
  await expect(costPanel).toBeHidden();
  await expect(
    panel.getByText("現在の作業の抜粋を生成先へ渡します。モデルの利用が発生します。", {
      exact: true,
    }),
  ).toBeVisible();
  for(const kind of ["claude","codex","muse","agy","copilot"]){
    await panel.getByRole("combobox",{name:"分析エージェント",exact:true}).selectOption(kind);
    await panel.locator("[data-generate-usage-report]").click();
    await expect(panel.locator("[data-generate-usage-report]")).toBeEnabled();
  }
  expect(new Set(requests.filter(r=>r.method==="agent.usage_report").map(r=>r.params.settings.kind))).toEqual(new Set(["claude","codex","muse","agy","copilot"]));
  await expect(panel.locator("[data-usage-report] .work-item")).toContainText("分析画面を整備");
  await expect(panel.locator('[data-usage-report] [data-priority="high"]')).toContainText(
    "優先度 高",
  );
  const htmlDownload = page.waitForEvent("download");
  await panel.locator("[data-save-report-html]").click();
  const saved = await htmlDownload;
  expect(saved.suggestedFilename()).toMatch(/\.html$/);
  const { readFile } = await import("node:fs/promises");
  const exported = await readFile((await saved.path())!, "utf8");
  expect(exported).toContain("分析画面を整備");
  expect(exported).toContain("<!doctype html>");
  await page.screenshot({
    path: test.info().outputPath("agent-analysis-rich-report.png"),
    fullPage: true,
  });
  await panel.getByRole("button", { name: "概要", exact: true }).click();
  const report = requests.find((r) => r.method === "agent.usage_report");
  expect(report?.params.history).toEqual({
    from: await expanded.locator('input[type="date"]').first().inputValue(),
    to: await expanded.locator('input[type="date"]').nth(1).inputValue(),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".mobile-shell-title").click();
  await page.locator("[data-picker-dashboard]").click();
  await expect(expanded.locator(".role-donut")).toContainText("62%");
  if (
    (await expanded
      .getByRole("button", { name: "期間・条件", exact: true })
      .getAttribute("aria-expanded")) === "false"
  )
    await expanded.getByRole("button", { name: "期間・条件", exact: true }).click();
  expect(await panel.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(false);
  await panel.getByRole("button", { name: "エージェント分析", exact: true }).click();
  await panel.locator("[data-generate-usage-report]").click();
  await expect(panel.locator("[data-usage-report]")).toBeVisible();
  expect(await panel.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(false);
  await panel.locator("[data-usage-report] .work-item").first().scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath("agent-analysis-rich-report-mobile.png"),
    fullPage: true,
  });
  client.close();
});
