import type { AccountUsage, AgentUsage, AgentUsageResult, UsageTokenBasis } from "@sodashitsu/protocol";
import type { Command } from "../cliArgs.js";
import { resolveAgentTarget } from "../agentTarget.js";
import { formatTable, printJson, printLine } from "../output.js";
import type { SessionStore } from "../session.js";
import { withSession } from "../withSession.js";

/**
 * `sodactl agent usage [<target>] [--json]`（20261010-agent-usage の AC6）。エージェントの利用状況（モデル・トークン・コスト・コンテキスト）と、
 * アカウント全体の制限の枠。答えは数字・モデル名・時刻・ラベルだけ（サーバが、会話の中身・記録の場所を答えに入れない）。無い項目は「—」。
 */
type AgentUsageCmd = Extract<Command, { kind: "agent-usage" }>;

const BASIS_LABEL: Record<UsageTokenBasis, string> = {
  cumulative: "累計",
  transcript: "記録に残る分",
  context: "いま文脈にある分",
};

function compact(n: number | undefined): string {
  if (n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function clock(ms: number, now: number): string {
  const d = new Date(ms);
  const pad = (n: number): string => String(n).padStart(2, "0");
  const t = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const ago = Math.max(0, Math.round((now - ms) / 60_000));
  return `${t}（${ago === 0 ? "いま" : `${ago} 分前`}）`;
}

function tokensCell(u: AgentUsage): string {
  const t = u.tokens;
  const parts: string[] = [];
  if (t.input !== undefined || t.cacheRead !== undefined || t.cacheWrite !== undefined) {
    parts.push(`入力 ${compact((t.input ?? 0) + (t.cacheRead ?? 0) + (t.cacheWrite ?? 0))}`);
  }
  if (t.output !== undefined) parts.push(`出力 ${compact(t.output)}`);
  const body = parts.length > 0 ? parts.join(" / ") : "—";
  return `${body}（${BASIS_LABEL[t.basis]}${u.partial ? "・一部" : ""}${u.scanning ? "・読み込み中" : ""}）`;
}

function costCell(u: AgentUsage): string {
  if (u.costUsd === undefined) return "—";
  const asOf = u.costAsOf !== undefined ? `・${new Date(u.costAsOf).toISOString().slice(0, 16).replace("T", " ")} 時点` : "";
  return `$${u.costUsd.toFixed(2)}${asOf}`;
}

function contextCell(u: AgentUsage): string {
  if (u.contextTokens === undefined) return "—";
  return u.contextUsedPct !== undefined ? `${u.contextUsedPct}%（${compact(u.contextTokens)}）` : `${compact(u.contextTokens)}（率は不明）`;
}

export function formatUsageTable(
  result: AgentUsageResult,
  names: ReadonlyMap<string, string | undefined>,
  now: number,
): string {
  const rows: string[][] = [];
  for (const [paneId, u] of Object.entries(result.panes)) {
    if (u === null) {
      rows.push([paneId.slice(0, 8), "—", names.get(paneId) ?? "—", "—", "—", "—", "—", "—"]);
      continue;
    }
    rows.push([paneId.slice(0, 8), u.kind, names.get(paneId) ?? "—", u.model ?? "—", tokensCell(u), costCell(u), contextCell(u), clock(u.updatedAt, now)]);
  }
  const out: string[] = [];
  out.push(formatTable(["pane", "種類", "名前", "モデル", "トークン", "コスト", "コンテキスト", "更新"], rows));
  if (result.accounts.length > 0) {
    out.push("");
    out.push(formatAccounts(result.accounts, now));
  }
  return out.join("\n");
}

function formatAccounts(accounts: readonly AccountUsage[], now: number): string {
  const rows: string[][] = [];
  for (const a of accounts) {
    const name = a.plan !== undefined ? `${a.label}（${a.plan}）` : a.label;
    for (const w of a.windows) {
      const reset = w.resetsAt === undefined ? "—" : w.stale === true ? `${clock(w.resetsAt, now).replace(/（.*）/, "")}（過ぎた。値は古い）` : clock(w.resetsAt, now).replace(/（.*）/, "");
      rows.push([name, w.label, `${w.usedPct}%${w.stale === true ? "（古い）" : ""}`, reset, clock(a.asOf, now)]);
    }
  }
  return formatTable(["アカウント", "枠", "使用率", "リセット", "取得"], rows);
}

export async function runAgentUsage(cmd: AgentUsageCmd, store: SessionStore): Promise<void> {
  const { result, names } = await withSession(cmd.opts, store, async (client) => {
    const hello = await client.hello();
    const paneId = cmd.paneId === undefined ? undefined : resolveAgentTarget(hello.snapshot, cmd.paneId).paneId;
    const result = await client.request("agent.usage", paneId === undefined ? {} : { paneId });
    const names = new Map<string, string | undefined>(hello.snapshot.panes.map((p) => [p.id, p.agent?.name]));
    return { result, names };
  });
  if (cmd.json) printJson(result);
  else printLine(formatUsageTable(result, names, Date.now()));
}
