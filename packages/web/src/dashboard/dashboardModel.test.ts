import type { AgentInfo, AgentUsage, Pane, Tab, Workspace } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import {
  accountsByKind,
  basisLabel,
  buildRows,
  contextDisplay,
  filterRows,
  formatAgo,
  formatCost,
  formatDuration,
  formatTokens,
  isStale,
  kindsOf,
  NONE,
  sortRows,
  totalTokens,
  windowDisplay,
  type DashboardRow,
} from "./dashboardModel.js";

const usage = (paneId: string, over: Partial<AgentUsage> = {}): AgentUsage => ({
  paneId,
  kind: "claude",
  model: "claude-sonnet-5-5",
  tokens: { basis: "transcript", input: 10, output: 20 },
  source: "transcript",
  updatedAt: 1000,
  ...over,
});

const pane = (id: string, over: Omit<Partial<Pane>, "agent"> & { agent?: Partial<AgentInfo> | null } = {}): Pane => {
  const { agent, ...rest } = over;
  return {
    id,
    tabId: "t1",
    label: null,
    cwd: "/repo",
    shell: "bash",
    cols: 80,
    rows: 24,
    status: "running",
    failure: null,
    busy: false,
    title: "",
    rightClick: "default",
    agent:
      agent === null
        ? null
        : { instanceId: `i-${id}`, kind: "claude", label: "Claude Code", state: "idle", completionSeq: 0, serverSeenSeq: 0, verified: true, since: 100, ...agent },
    agentSession: null,
    ...rest,
  } as Pane;
};

const tabs = new Map<string, Tab>([["t1", { id: "t1", workspaceId: "w1", label: "main" } as Tab]]);
const workspaces = new Map<string, Workspace>([["w1", { id: "w1", label: "repo", git: { branch: "feat/x" } } as unknown as Workspace]]);

function rows(): DashboardRow[] {
  return buildRows({
    panes: [
      pane("p1", { agent: { name: "worker-b", state: "working" } }),
      pane("p2", { agent: { name: "worker-a", state: "blocked", kind: "codex", subagents: { count: 2, items: [] } } }),
      pane("p3", { agent: null }),
      pane("p4", { label: "plain", agent: { state: "idle" } }),
    ],
    tabs,
    workspaces,
    usage: { p1: usage("p1", { costUsd: 1.5, tokens: { basis: "cumulative", total: 5000 } }), p2: usage("p2", { costUsd: 0.2, tokens: { basis: "transcript", input: 100, output: 900 } }) },
    stateOf: (p) => p.agent!.state,
    nameOf: (p) => p.label ?? p.id,
  });
}

describe("ダッシュボードの行（20261010-agent-usage PR3 の AC1）", () => {
  it("エージェントの居る pane だけ。名前・workspace・tab・ブランチ・サブエージェント数・利用状況を引く。居ない pane は出ない", () => {
    const r = rows();
    expect(r.map((x) => x.paneId)).toEqual(["p1", "p2", "p4"]);
    expect(r[0]).toMatchObject({ name: "worker-b", workspaceLabel: "repo", tabLabel: "main", branch: "feat/x", subagents: null, cwd: "/repo" });
    expect(r[1]).toMatchObject({ kind: "codex", subagents: 2 });
    expect(r[2]).toMatchObject({ name: "plain", usage: null });
  });

  it("並べ替え: 状態（入力待ちが先）・コスト（高い順。無いものは最後）・トークン（多い順）・名前", () => {
    const r = rows();
    expect(sortRows(r, "state").map((x) => x.paneId)).toEqual(["p2", "p1", "p4"]);
    expect(sortRows(r, "cost").map((x) => x.paneId)).toEqual(["p1", "p2", "p4"]);
    expect(sortRows(r, "tokens").map((x) => x.paneId)).toEqual(["p1", "p2", "p4"]);
    expect(sortRows(r, "name").map((x) => x.name)).toEqual(["plain", "worker-a", "worker-b"]);
  });

  it("種類の絞り込みと、候補の種類", () => {
    const r = rows();
    expect(kindsOf(r)).toEqual(["claude", "codex"]);
    expect(filterRows(r, "codex").map((x) => x.paneId)).toEqual(["p2"]);
    expect(filterRows(r, null)).toHaveLength(3);
  });
});

describe("数字の見せ方", () => {
  it("トークン: 合計があればそれ。無ければ入力・出力・キャッシュの和。何も無ければ「—」", () => {
    expect(totalTokens(usage("p", { tokens: { basis: "cumulative", total: 7 } }))).toBe(7);
    expect(totalTokens(usage("p", { tokens: { basis: "transcript", input: 1, output: 2, cacheRead: 3 } }))).toBe(6);
    expect(totalTokens(usage("p", { tokens: { basis: "transcript" } }))).toBeUndefined();
    expect(formatTokens(undefined)).toBe(NONE);
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(1234)).toBe("1.23k");
    expect(formatTokens(12_345)).toBe("12.3k");
    expect(formatTokens(123_456)).toBe("123k");
    expect(formatTokens(1_500_000)).toBe("1.5M");
  });
  it("コスト: 無ければ「—」（0 ではない）。1 セント未満は <$0.01", () => {
    expect(formatCost(undefined)).toBe(NONE);
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(0.004)).toBe("<$0.01");
    expect(formatCost(3.456)).toBe("$3.46");
  });
  it("基準の印: 記録に残る分は「記録分」（累計と言わない）", () => {
    expect(basisLabel("transcript")).toBe("記録分");
    expect(basisLabel("cumulative")).toBe("累計");
  });
  it("経過: N 秒前・N 分前・N 時間前。古さは 1 分で判定", () => {
    const now = 1_000_000;
    expect(formatAgo(now - 2000, now)).toBe("たった今");
    expect(formatAgo(now - 30_000, now)).toBe("30 秒前");
    expect(formatAgo(now - 5 * 60_000, now)).toBe("5 分前");
    expect(formatAgo(now - 3 * 3600_000, now)).toBe("3 時間前");
    expect(isStale(now - 59_000, now)).toBe(false);
    expect(isStale(now - 61_000, now)).toBe(true);
  });
  it("コンテキスト: 率があれば率。窓の大きさが分からなければトークン数だけ。無ければ「—」", () => {
    expect(contextDisplay(usage("p", { contextUsedPct: 41.6 }))).toEqual({ pct: 42, text: "42%" });
    expect(contextDisplay(usage("p", { contextTokens: 12_000 }))).toEqual({ pct: null, text: "12k" });
    expect(contextDisplay(usage("p", { contextTokens: 12_000, contextWindowTokens: 200_000 })).text).toBe("12k / 200k");
    expect(contextDisplay(usage("p"))).toEqual({ pct: null, text: NONE });
    expect(contextDisplay(null).text).toBe(NONE);
  });
  it("枠: リセットを過ぎたら率を出さず「リセット済み」。残り時間は日本語で", () => {
    const now = 10_000_000;
    expect(windowDisplay({ label: "5 時間", usedPct: 42.4, resetsAt: now + 130 * 60_000 }, now)).toMatchObject({ pct: 42, text: "42%", reset: "あと 2 時間 10 分でリセット", past: false });
    expect(windowDisplay({ label: "週", usedPct: 80, resetsAt: now - 1 }, now)).toMatchObject({ pct: null, text: "リセット済み", past: true });
    expect(windowDisplay({ label: "5 時間", usedPct: 130 }, now)).toMatchObject({ pct: 100, reset: null });
    expect(formatDuration(30_000)).toBe("1 分未満");
    expect(formatDuration(26 * 3600_000)).toBe("1 日 2 時間");
  });
  it("アカウントは種類ごとにまとめる", () => {
    const a = (kind: string, key: string) => ({ kind, accountKey: key, label: kind, windows: [], source: "statusline" as const, asOf: 1 });
    expect(accountsByKind([a("codex", "1"), a("claude", "2"), a("claude", "3")]).map((g) => [g.kind, g.accounts.length])).toEqual([
      ["claude", 2],
      ["codex", 1],
    ]);
  });
});
