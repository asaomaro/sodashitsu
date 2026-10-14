import { expect, it } from "vitest";
import {
  loadSystemFooterSettings,
  systemFooterSegments,
  systemFooterPlaceholder,
  type SystemResources,
} from "./systemFooter.js";
it("normalizes the shared settings and preserves an empty selection", () => {
  expect(loadSystemFooterSettings(undefined)).toEqual({
    enabled: false,
    fields: ["cpu", "memory"],
  });
  expect(
    loadSystemFooterSettings({ enabled: true, fields: ["cpu", "invalid", "cpu", "memory"] }),
  ).toEqual({ enabled: true, fields: ["cpu", "memory"] });
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
  ).toEqual(["メモリ 6.0GiB/8.0GiB 75%", "CPU 25% (4核)", "Soda 512MiB", "稼働 1日 1h 0m", "host"]);
  expect(systemFooterSegments({ ...data, cpuPercent: null }, ["cpu", "load"])).toEqual([]);
});

it("distinguishes loaded but unsupported fields from loading and connection failure", () => {
  expect(systemFooterPlaceholder({} as SystemResources, false)).toBe(
    "選択した情報は利用できません",
  );
  expect(systemFooterPlaceholder(undefined, false)).toContain("読み込み中");
  expect(systemFooterPlaceholder(undefined, true)).toContain("取得できません");
});
