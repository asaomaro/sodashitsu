import { expect, it } from "vitest";
import {
  loadStatuslineSettings,
  statuslineGauge,
  statuslineLimitKind,
  statuslineSegments,
} from "./statusline.js";
it("keeps defaults for old, partial and invalid settings without accepting arbitrary glyphs", () => {
  const s = loadStatuslineSettings({
    fields: { pane: false, context: "no" },
    graphs: { context: { visible: false, pattern: "script" }, weekly: { pattern: "dots" } },
  });
  expect(s.fields.pane).toBe(false);
  expect(s.fields.context).toBe(true);
  expect(s.graphs.context).toEqual({ visible: false, pattern: "blocks" });
  expect(statuslineGauge(62, s.graphs.context)).toBe("62%");
  expect(statuslineGauge(62, s.graphs.weekly)).toBe("●●●●●●○○○○ 62%");
  expect(statuslineGauge(Infinity, s.graphs.weekly)).toBe("—");
  expect(loadStatuslineSettings(null)).toEqual(loadStatuslineSettings({}));
});
it("separates weekly, five-hour and other windows by duration or label", () => {
  expect(statuslineLimitKind({ label: "枠", windowMinutes: 10080 })).toBe("weekly");
  expect(statuslineLimitKind({ label: "7 days" })).toBe("weekly");
  expect(statuslineLimitKind({ label: "5h" })).toBe("fiveHour");
  expect(statuslineLimitKind({ label: "枠", windowMinutes: 300 })).toBe("fiveHour");
  expect(statuslineLimitKind({ label: "15 hours" })).toBe("otherLimits");
  expect(statuslineLimitKind({ label: "17 days" })).toBe("otherLimits");
  expect(statuslineLimitKind({ label: "5h", windowMinutes: 900 })).toBe("otherLimits");
  expect(statuslineLimitKind({ label: "月" })).toBe("otherLimits");
});
it("normalizes shared ordering, width and token formatting with safe old defaults", () => {
  const s = loadStatuslineSettings({
    order: ["tokens", "tokens", "unknown", "model"],
    rows: Infinity,
    tokenFormat: "k",
  });
  expect(s.order.slice(0, 2)).toEqual(["tokens", "model"]);
  expect(new Set(s.order).size).toBe(s.order.length);
  expect(s.rows).toBe(1);
  expect(s.enabled).toBe(true);
  expect(s.fields.input).toBe(false);
  expect(loadStatuslineSettings({ rows: -100 }).rows).toBe(1);
});

it("formats enabled fields in shared order, omits unknown values, and compactly formats all token counts", () => {
  const pane = {
    id: "p",
    cwd: "/pj",
    label: "Alpha",
    agent: { kind: "codex", label: "Codex", state: "working" },
    agentSession: { kind: "codex", sessionId: "s" },
  } as import("./model.js").Pane;
  const usage = {
    paneId: "p",
    kind: "codex",
    model: null,
    tokens: { basis: "context", total: 1000, input: 10001, output: 0 },
    contextUsedPct: NaN,
  } as import("./usage.js").AgentUsage;
  const s = loadStatuslineSettings({
    order: ["tokens", "output", "input"],
    tokenFormat: "k",
    fields: { input: true, output: true, session: true },
  });
  const result = statuslineSegments(pane, usage, [], s);
  expect(result.slice(0, 3).map((v) => v.text)).toEqual([
    "Context tokens 1k",
    "出力 0",
    "入力 10k",
  ]);
  expect(result.some((v) => ["context", "cost", "model"].includes(v.field))).toBe(false);
  expect(result.find((v) => v.field === "session")?.text).toBe("s");
  expect(statuslineSegments({ ...pane, agent: null }, usage, [], s)).toEqual([]);
  expect(
    statuslineSegments(pane, { ...usage, kind: "claude" }, [], s).some((v) => v.field === "tokens"),
  ).toBe(false);
});

it("uses the configured agent name as the pane name", () => {
  const pane = {
    label: null,
    agent: { kind: "codex", label: "Codex", name: "Writer", state: "idle" },
  } as import("./model.js").Pane;
  expect(statuslineSegments(pane, undefined, [], loadStatuslineSettings(undefined))[0]?.text).toBe(
    "Writer",
  );
});

it("ignores the superseded column width preference", () => {
  expect(loadStatuslineSettings({ columns: 8 }).rows).toBe(1);
});

it("renders five half-step blocks with ten-percent resolution", () => {
  const settings = loadStatuslineSettings({
    graphs: { context: { pattern: "halfBlocks", visible: true } },
  });
  const examples = [
    [0, "░░░░░"],
    [10, "▒░░░░"],
    [20, "█░░░░"],
    [40, "██░░░"],
    [50, "██▒░░"],
    [90, "████▒"],
    [100, "█████"],
    [4, "░░░░░"],
    [5, "▒░░░░"],
    [94, "████▒"],
    [95, "█████"],
    [-10, "░░░░░"],
    [110, "█████"],
  ] as const;
  for (const [percent, bar] of examples) {
    const result = statuslineGauge(percent, settings.graphs.context);
    expect(result).toBe(`${bar} ${percent}%`);
    expect([...result.split(" ")[0]!]).toHaveLength(5);
  }
  expect(statuslineGauge(50, { visible: false, pattern: "halfBlocks" })).toBe("50%");
  expect(statuslineGauge(NaN, settings.graphs.context)).toBe("—");
});

it("switches all statusline text to the ordinary foreground without changing contents", () => {
  const pane = {
    label: "Agent",
    agent: { kind: "codex", label: "Codex", state: "working" },
  } as import("./model.js").Pane;
  const color = statuslineSegments(pane, undefined, [], loadStatuslineSettings(undefined));
  const mono = statuslineSegments(
    pane,
    undefined,
    [],
    loadStatuslineSettings({ colorMode: "mono" }),
  );
  expect(color.some((s) => s.color !== "muted")).toBe(true);
  expect(mono.every((s) => s.color === "muted")).toBe(true);
  expect(mono.map((s) => s.text)).toEqual(color.map((s) => s.text));
  expect(loadStatuslineSettings({ colorMode: "invalid" }).colorMode).toBe("color");
});

it("independently selects cross-session weekly cost and exact rate-limit reset dates", () => {
  const pane = {
    agent: { kind: "claude", label: "Claude", state: "idle" },
  } as import("./model.js").Pane;
  const usage = {
    kind: "claude",
    costUsd: 1,
    weeklyCostUsd: 12.3456,
    tokens: { basis: "context" },
  } as import("./usage.js").AgentUsage;
  const reset = new Date(2026, 9, 16, 3, 4).getTime();
  const accounts = [
    {
      kind: "claude",
      label: "Claude",
      windows: [
        { label: "5h", windowMinutes: 300, usedPct: 60, resetsAt: reset },
        { label: "週", windowMinutes: 10080, usedPct: 90, resetsAt: reset + 3600000, stale: true },
      ],
    },
  ] as import("./usage.js").AccountUsage[];
  const settings = loadStatuslineSettings({
    fields: {
      weeklyCost: true,
      fiveHour: false,
      weekly: false,
      fiveHourReset: true,
      weeklyReset: true,
    },
  });
  const result = statuslineSegments(pane, usage, accounts, settings);
  expect(result.find((s) => s.field === "weeklyCost")?.text).toBe("今週 $12.346");
  expect(result.find((s) => s.field === "cost")?.text).toBe("$1.000");
  expect(result.find((s) => s.field === "fiveHourReset")?.text).toBe(
    "Claude 5h解除 2026/10/16 03:04",
  );
  expect(result.find((s) => s.field === "weeklyReset")?.text).toBe(
    "Claude 週解除 2026/10/16 04:04 *",
  );
  expect(result.some((s) => s.field === "fiveHour" || s.field === "weekly")).toBe(false);
  const missing = { ...usage };
  delete missing.weeklyCostUsd;
  expect(
    statuslineSegments(
      pane,
      missing,
      [{ ...accounts[0]!, windows: [{ label: "5h", usedPct: 0, resetsAt: NaN }] }],
      settings,
    ).some((s) => ["weeklyCost", "fiveHourReset", "weeklyReset"].includes(s.field)),
  ).toBe(false);
});

// 20261016-agent-usage-bob-copilot: USD でないクレジット（Bob Shell・Copilot CLI）は、コストの欄に単位つきで出す（USD に換算しない）。
it("shows non-USD credits in the cost field with their unit, and prefers USD when both exist", () => {
  const pane = { agent: { kind: "copilot", label: "Copilot", state: "idle" } } as import("./model.js").Pane;
  const settings = loadStatuslineSettings({ fields: { premiumRequests: true } });
  const copilot = { kind: "copilot", credits: { amount: 0.166003, unit: "aic" }, premiumRequests: 2, tokens: { basis: "transcript" } } as import("./usage.js").AgentUsage;
  const seg = statuslineSegments(pane, copilot, [], settings);
  expect(seg.find((s) => s.field === "cost")?.text).toBe("0.166 AIC");
  expect(seg.find((s) => s.field === "premiumRequests")?.text).toBe("Premium 2");
  const bobPane = { agent: { kind: "bob", label: "Bob Shell", state: "idle" } } as import("./model.js").Pane;
  const bob = { kind: "bob", credits: { amount: 0.078512, unit: "bobcoin" }, tokens: { basis: "context" } } as import("./usage.js").AgentUsage;
  expect(statuslineSegments(bobPane, bob, [], settings).find((s) => s.field === "cost")?.text).toBe("0.079 Bobcoin");
  const both = { ...bob, costUsd: 1 } as import("./usage.js").AgentUsage;
  expect(statuslineSegments(bobPane, both, [], settings).find((s) => s.field === "cost")?.text).toBe("$1.000");
});

it("shows known context token counts for Bob and agy without requiring a reported total", () => {
  for (const kind of ["bob", "agy"]) {
    const pane = { agent: { kind, label: kind, state: "idle" } } as import("./model.js").Pane;
    const usage = { kind, tokens: { basis: "context", input: 19700 } } as import("./usage.js").AgentUsage;
    expect(statuslineSegments(pane, usage, [], loadStatuslineSettings({})).find(s => s.field === "tokens")?.text).toBe("Context tokens 19700");
    expect(statuslineSegments(pane, { ...usage, tokens: { basis: "context" } }, [], loadStatuslineSettings({})).find(s => s.field === "tokens")).toBeUndefined();
  }
});

it.each(["claude","codex","muse","copilot","agy"])("shows native subagents in %s footer without usage or kind gates",kind=>{
 const pane={agent:{kind,label:kind,state:"idle",subagents:{count:2,items:[]}}} as unknown as import("./model.js").Pane;
 const settings=loadStatuslineSettings({fields:{subagents:true}});
 expect(statuslineSegments(pane,undefined,[],settings).find(s=>s.field==="subagents")).toMatchObject({text:"Subagents 2件"});
 pane.agent!.subagents!.countBasis="alive";
 expect(statuslineSegments(pane,undefined,[],settings).find(s=>s.field==="subagents")).toMatchObject({text:"Subagents 2件",title:expect.stringContaining("作業中の件数ではありません")});
});


it("shows supplied subagent membership by default while respecting explicit hidden and unknown",()=>{
 const pane={agent:{kind:"codex",label:"Codex",state:"idle",subagents:{count:3,countBasis:"alive",items:[]}}} as unknown as import("./model.js").Pane;
 for(const raw of [undefined,{}, {fields:{subagents:true}}]){
  const settings=loadStatuslineSettings(raw);expect(settings.fields.subagents).toBe(true);
  expect(statuslineSegments(pane,undefined,[],settings).find(s=>s.field==="subagents")?.text).toBe("Subagents 3件");
 }
 expect(statuslineSegments(pane,undefined,[],loadStatuslineSettings({fields:{subagents:false}})).some(s=>s.field==="subagents")).toBe(false);
 const unknownAgent={...pane.agent!};delete unknownAgent.subagents;
 expect(statuslineSegments({...pane,agent:unknownAgent},undefined,[],loadStatuslineSettings({})).some(s=>s.field==="subagents")).toBe(false);
});

it("adds optional effort and approval settings without changing saved field order or visibility",()=>{
 const s=loadStatuslineSettings({order:["model","pane"],fields:{state:false},rows:2});
 expect(s.order.slice(0,2)).toEqual(["model","pane"]);expect(s.order.slice(-2)).toEqual(["effort","approval"]);
 expect(s.fields).toMatchObject({state:false,effort:false,approval:false});expect(s.rows).toBe(2);
 expect(loadStatuslineSettings({...s,fields:{...s.fields,effort:true,approval:false}}).fields).toMatchObject({effort:true,approval:false});
});
it("formats observed effort and distinct approval/permission values with source and scope, never sandbox",()=>{
 const pane={agent:{kind:"codex",label:"Codex",state:"idle"}} as unknown as import("./model.js").Pane;
 const usage={paneId:"p",kind:"codex",model:null,tokens:{basis:"context"},source:"rollout",updatedAt:123,reasoningEffort:"stale",
 executionSettings:{reasoningEffort:{value:"high",source:"rollout",basis:"turn",observedAt:1000},approvalPolicy:{value:"on-request",source:"rollout",basis:"turn"},approvalMode:{value:"promptUnmatched",source:"muse-events",basis:"session"},permissionMode:{value:"plan",source:"hook",basis:"hook"},sandboxMode:{value:"workspace-write",source:"rollout",basis:"turn"}}} as import("./usage.js").AgentUsage;
 const settings=loadStatuslineSettings({fields:{effort:true,approval:true},order:["effort","approval"]});
 const result=statuslineSegments(pane,usage,[],settings);
 expect(result.filter(s=>s.field==="effort"||s.field==="approval").map(s=>s.text)).toEqual(["effort high","承認policy on-request","承認mode promptUnmatched","権限mode plan"]);
 expect(result[0]!.title).toContain("ターンの記録 / rollout / 1970-01-01T00:00:01.000Z");expect(result[0]!.title).toContain("現在のCLI設定とは異なる");
 expect(result.some(s=>s.text.includes("workspace-write")||s.text.includes("stale"))).toBe(false);
 expect(statuslineSegments(pane,{...usage,kind:"claude"},[],settings).some(s=>s.field==="effort"||s.field==="approval")).toBe(false);
 const sandboxOnly={...usage,executionSettings:{sandboxMode:usage.executionSettings!.sandboxMode!}};delete sandboxOnly.reasoningEffort;
 expect(statuslineSegments(pane,sandboxOnly,[],settings).some(s=>s.field==="effort"||s.field==="approval")).toBe(false);
 expect(statuslineSegments(pane,undefined,[],settings).some(s=>s.field==="effort"||s.field==="approval")).toBe(false);
 expect(statuslineSegments(pane,usage,[],loadStatuslineSettings({fields:{effort:false,approval:false}})).some(s=>s.field==="effort"||s.field==="approval")).toBe(false);
 const legacyUsage={...usage,reasoningEffort:"medium"};delete legacyUsage.executionSettings;
 const legacy=statuslineSegments(pane,legacyUsage,[],settings).find(s=>s.field==="effort")!;
 expect(legacy.text).toBe("effort medium");expect(legacy.title).toContain("範囲・時点は未取得");
 for(const value of ["", "\u001b[31mhigh", "x".repeat(129)])expect(statuslineSegments(pane,{...usage,executionSettings:{reasoningEffort:{value,source:"rollout",basis:"turn"}}},[],settings).some(s=>s.field==="effort")).toBe(false);
 const session=statuslineSegments(pane,{...usage,executionSettings:{reasoningEffort:{value:"low",source:"muse-events",basis:"session",observedAt:1e30}}},[],settings).find(s=>s.field==="effort")!;
 expect(session.text).toBe("effort low");expect(session.title).toContain("セッション設定の記録（ターンの一時指定は未反映の場合があります） / muse-events");
});
