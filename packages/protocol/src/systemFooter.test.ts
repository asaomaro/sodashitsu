import { expect, it } from "vitest";
import {
  countSystemAgents,
  loadSystemFooterSettings,
  systemFooterSegments,
  systemFooterPlaceholder,
  type SystemResources,
} from "./systemFooter.js";
it("normalizes the shared settings and preserves an empty selection", () => {
  expect(loadSystemFooterSettings(undefined)).toMatchObject({
    enabled: false,
    fields: ["cpu", "memory"],
  });
  expect(
    loadSystemFooterSettings({ enabled: true, fields: ["cpu", "invalid", "cpu", "memory"] }),
  ).toMatchObject({ enabled: true, fields: ["cpu", "memory"] });
  expect(loadSystemFooterSettings({ fields: [] }).fields).toEqual([]);
});
it("renders selected values and omits unsupported information", () => {
  const data: SystemResources = {
    sampledAt: 1,
    cpuPercent: 25,
    cpuCount: 4,
    memoryTotalBytes: 8 * 1024 ** 3,
    memoryAvailableBytes: 2 * 1024 ** 3,
    serverRssBytes: 512 * 1024 ** 2,
    uptimeSeconds: 90000,
    loadAverage: null,
    hostname: "host\n",
  };
  expect(
    systemFooterSegments(data, ["memory", "cpu", "load", "serverMemory", "uptime", "host"]),
  ).toEqual([
    "メモリ 6.0GiB/8.0GiB 75%",
    "CPU 25% (4核)",
    "Soda 512MiB 6%",
    "稼働 1日 1h 0m",
    "host",
  ]);
  expect(systemFooterSegments({ ...data, cpuPercent: null }, ["cpu", "load"])).toEqual([]);
});

it("distinguishes loaded but unsupported fields from loading and connection failure", () => {
  expect(systemFooterPlaceholder({} as SystemResources, false)).toBe(
    "選択した情報は利用できません",
  );
  expect(systemFooterPlaceholder(undefined, false)).toContain("読み込み中");
  expect(systemFooterPlaceholder(undefined, true)).toContain("取得できません");
});

it("uses statusline patterns independently for percentage metrics and preserves old settings", () => {
  const settings = loadSystemFooterSettings({
    graphs: {
      cpu: { visible: true, pattern: "ascii" },
      memory: { visible: true, pattern: "dots" },
      serverMemory: { visible: false, pattern: "invalid" },
    },
  });
  expect(settings.graphs.serverMemory).toEqual({ visible: false, pattern: "blocks" });
  const data = {
    hostname: "",
    loadAverage: null,
    uptimeSeconds: 0,
    cpuPercent: 50,
    cpuCount: 2,
    memoryTotalBytes: 1024 ** 3,
    memoryAvailableBytes: 512 * 1024 ** 2,
    serverRssBytes: 256 * 1024 ** 2,
  } as SystemResources;
  expect(systemFooterSegments(data, ["cpu", "memory", "serverMemory"], settings.graphs)).toEqual([
    "CPU #####----- 50% (2核)",
    "メモリ 512MiB/1.0GiB ●●●●●○○○○○ 50%",
    "Soda 256MiB 25%",
  ]);
});

it("counts live agent panes across all workspaces, excludes virtual panes and sessions", () => {
  const agent = (state: string, virtual = false) => ({ agent: { state }, virtual });
  const counts = countSystemAgents([
    agent("working"),
    agent("working"),
    agent("blocked"),
    agent("idle"),
    agent("unknown"),
    agent("working", true),
    { agentSession: { sessionId: "past" } },
  ] as unknown as import("./model.js").Pane[]);
  expect(counts).toEqual({ total: 5, states: { working: 2, blocked: 1, idle: 1, unknown: 1 } });
  expect(
    systemFooterSegments({ agents: counts, hostname: "", memoryTotalBytes: 0 } as SystemResources, [
      "agents",
      "working",
      "blocked",
      "idle",
      "unknown",
    ]),
  ).toEqual(["エージェント 5", "作業中 2", "応答待ち 1", "待機 1", "不明 1"]);
});
