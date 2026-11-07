import { expect, it } from "vitest";
import {
  countSystemAgents,
  systemFooterDisplaySegments,
  loadSystemFooterSettings,
  systemFooterSegments,
  systemCpuCoreLabel,
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
    physicalCpuCount: 2,
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
    "CPU 25% (2/4 コア)",
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
    "CPU #####----- 50% (—/2 コア)",
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

it("shares the five-character half-step gauge for all footer percentages", () => {
  const settings = loadSystemFooterSettings({
    graphs: Object.fromEntries(
      ["cpu", "memory", "serverMemory"].map((id) => [id, { visible: true, pattern: "halfBlocks" }]),
    ),
  });
  const data = {
    hostname: "",
    loadAverage: null,
    uptimeSeconds: 0,
    cpuPercent: 50,
    cpuCount: 4,
    physicalCpuCount: 2,
    memoryTotalBytes: 1024 ** 3,
    memoryAvailableBytes: 512 * 1024 ** 2,
    serverRssBytes: 256 * 1024 ** 2,
  } as SystemResources;
  expect(systemFooterSegments(data, ["cpu", "memory", "serverMemory"], settings.graphs)).toEqual([
    "CPU ██▒░░ 50% (2/4 コア)",
    "メモリ 512MiB/1.0GiB ██▒░░ 50%",
    "Soda 256MiB █▒░░░ 25%",
  ]);
});

it("defaults the footer to mono and colors rates and agent states independently", () => {
  const data = {
    hostname: "host",
    loadAverage: null,
    uptimeSeconds: 0,
    cpuPercent: 70,
    cpuCount: 4,
    physicalCpuCount: 2,
    memoryTotalBytes: 1024 ** 3,
    memoryAvailableBytes: 0,
    serverRssBytes: 256 * 1024 ** 2,
    agents: { total: 2, states: { blocked: 1, working: 1, idle: 0, unknown: 0 } },
  } as SystemResources;
  const settings = {
    enabled: true,
    fields: ["cpu", "memory", "serverMemory", "blocked", "host"],
  } as const;
  const mono = systemFooterDisplaySegments(data, { ...settings, fields: [...settings.fields] });
  const color = systemFooterDisplaySegments(data, {
    ...settings,
    fields: [...settings.fields],
    colorMode: "color",
  });
  expect(mono.every((s) => s.color === "muted")).toBe(true);
  expect(color.map((s) => s.color)).toEqual(["warning", "danger", "good", "danger", "model"]);
  expect(color.map((s) => s.text)).toEqual(mono.map((s) => s.text));
  expect(loadSystemFooterSettings({ colorMode: "invalid" }).colorMode).toBe("mono");
});

it("shows unknown topology on old servers without copying logical cores or assuming SMT2", () => {
  expect(systemCpuCoreLabel({cpuCount:24,physicalCpuCount:16})).toBe("16/24 コア");
  expect(systemCpuCoreLabel({cpuCount:24})).toBe("—/24 コア");
  expect(systemCpuCoreLabel({cpuCount:24,physicalCpuCount:null})).toBe("—/24 コア");
  expect(systemCpuCoreLabel({cpuCount:4,physicalCpuCount:8})).toBe("—/4 コア");
  expect(systemCpuCoreLabel({cpuCount:0,physicalCpuCount:0})).toBe("—/— コア");
});

it("keeps WSL VM and Windows host memory distinct with optional host data, independent field/graph and old settings",()=>{
 const old=loadSystemFooterSettings({fields:["memory"],graphs:{memory:{visible:true,pattern:"halfBlocks"}}});expect(old.fields).toEqual(["memory"]);expect(old.graphs.hostMemory.visible).toBe(false);
 const base={sampledAt:1,cpuPercent:null,cpuCount:1,hostname:"fixture",uptimeSeconds:0,serverRssBytes:1,loadAverage:null,memoryTotalBytes:4*1024**3,memoryAvailableBytes:2*1024**3,hostMemoryTotalBytes:16*1024**3,hostMemoryAvailableBytes:4*1024**3} as SystemResources;
 const settings=loadSystemFooterSettings({fields:["memory","hostMemory"],colorMode:"color",graphs:{hostMemory:{visible:true,pattern:"halfBlocks"}}});
 expect(systemFooterSegments(base,settings.fields,settings.graphs)).toEqual(['メモリ 2.0GiB/4.0GiB 50%','ホストメモリ 12.0GiB/16.0GiB ████░ 75%']);expect(systemFooterDisplaySegments(base,settings).find(s=>s.field==='hostMemory')?.color).toBe('warning');
 for(const missing of [{},{hostMemoryTotalBytes:16*1024**3},{hostMemoryTotalBytes:10,hostMemoryAvailableBytes:11},{hostMemoryTotalBytes:10,hostMemoryAvailableBytes:-1}])expect(systemFooterSegments({...base,hostMemoryTotalBytes:undefined,hostMemoryAvailableBytes:undefined,...missing} as unknown as SystemResources,['hostMemory'])).toEqual([]);
});
it("labels WSL CPU/memory independently from interop and formats a real total host CPU including zero",()=>{
 const data={hostname:"fixture",cpuPercent:25,cpuCount:2,memoryTotalBytes:4*1024**3,memoryAvailableBytes:2*1024**3,serverRssBytes:0,uptimeSeconds:0,loadAverage:null,isWsl:true} as SystemResources;
 expect(systemFooterSegments(data,["cpu","memory","hostCpu"])).toEqual(['CPU(WSL) 25% (—/2 コア)','メモリ(WSL) 2.0GiB/4.0GiB 50%']);
 expect(systemFooterSegments({...data,hostCpuPercent:0},['hostCpu'])).toEqual(['ホストCPU 0%']);
 const settings=loadSystemFooterSettings({fields:['hostCpu'],colorMode:'color',graphs:{hostCpu:{visible:true,pattern:'halfBlocks'}}});expect(systemFooterDisplaySegments({...data,hostCpuPercent:90},settings)[0]).toMatchObject({field:'hostCpu',text:'ホストCPU ████▒ 90%',color:'danger'});
 for(const bad of [NaN,-1,101])expect(systemFooterSegments({...data,hostCpuPercent:bad},['hostCpu'])).toEqual([]);
 expect(systemFooterSegments({...data,isWsl:false},['cpu'])[0]).toContain('CPU 25%');
});
