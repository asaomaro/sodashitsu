import type { HistoryGroup, UsageHistory, HistoryTokens } from "@sodashitsu/protocol";
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
            text: "生成した数値の説明。改善提案: キャッシュ利用の変化を確認してください。",
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
  await page
    .context()
    .addCookies([
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
  const panel = page.locator("[data-usage-analytics-panel]"),
    hist = panel.locator("[data-usage-history]");
  await expect(hist).toContainText("claude · sonnet");
  await expect(hist.locator(".hour-cell")).toHaveCount(24);
  await expect(hist.locator(".column.missing").first()).toHaveAttribute("title", /未取得/);
  expect(requests.some((r) => r.method === "agent.usage_report")).toBe(false);
  await page.screenshot({
    path: test.info().outputPath("usage-analytics-desktop.png"),
    fullPage: true,
  });
  await panel.locator("[data-analytics-account]").selectOption("generated");
  await expect(panel.locator("[data-analytics-model]")).toHaveCount(2);
  await panel.locator("[data-generate-usage-report]").click();
  await expect(panel.locator("[data-usage-report]")).toContainText("改善提案");
  const report = requests.find((r) => r.method === "agent.usage_report");
  expect(report?.params.history).toEqual({
    from: await hist.locator("[data-history-from]").inputValue(),
    to: await hist.locator("[data-history-to]").inputValue(),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".mobile-shell-title").click();
  await page.locator("[data-picker-dashboard]").click();
  await expect(hist).toContainText("claude · sonnet");
  expect(await panel.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(false);
  await page.screenshot({
    path: test.info().outputPath("usage-analytics-narrow.png"),
    fullPage: true,
  });
  client.close();
});
