import type { AccountUsage, AgentUsage, DisplayState, Pane, Tab, UsageTokenBasis, UsageWindow, Workspace } from "@sodashitsu/protocol";
import { DISPLAY_STATES } from "@sodashitsu/client-core";

/**
 * ダッシュボード（20261010-agent-usage PR3）の、画面に出す行と文字の組み立て。**画面の部品から切り離した純粋な関数**（単体で確かめる）。
 * 数字は `AgentUsage`・`AccountUsage`（型に在る項目は在れば出す・無ければ「—」）。基準の印（累計／記録に残る分／文脈内）・古さ・リセットの扱いをここで決める。
 */

/** 更新がこれより前なら「古い」値として薄く出す（`updatedAt`）。 */
export const STALE_AFTER_MS = 60_000;

/** 値が無いときの表示。 */
export const NONE = "—";

export type SortKey = "state" | "cost" | "tokens" | "name";
export const SORT_KEYS: readonly { key: SortKey; label: string }[] = [
  { key: "state", label: "状態" },
  { key: "cost", label: "コスト" },
  { key: "tokens", label: "トークン" },
  { key: "name", label: "名前" },
];

export interface DashboardRow {
  paneId: string;
  workspaceId: string;
  tabId: string;
  /** エージェントの種類（`claude`・`codex`…）。 */
  kind: string;
  /** 利用者が付けた名前、無ければ pane の呼び名。 */
  name: string;
  state: DisplayState;
  /** 状態が変わった時刻（最後の動き）。 */
  since: number;
  workspaceLabel: string;
  tabLabel: string;
  cwd: string;
  branch: string | null;
  /** サブエージェントの数。報告を受けていなければ null（分からない）。 */
  subagents: number | null;
  usage: AgentUsage | null;
}

export interface BuildInput {
  panes: Iterable<Pane>;
  tabs: ReadonlyMap<string, Tab>;
  workspaces: ReadonlyMap<string, Workspace>;
  usage: Readonly<Record<string, AgentUsage>>;
  /** pane の表示状態（`done` を含む。`displayStateFor`）。 */
  stateOf: (pane: Pane) => DisplayState;
  /** pane の呼び名（`paneNameOf`）。 */
  nameOf: (pane: Pane) => string;
}

/** エージェントの居る pane だけを 1 行ずつ。居ない pane は出さない。 */
export function buildRows(input: BuildInput): DashboardRow[] {
  const rows: DashboardRow[] = [];
  for (const pane of input.panes) {
    const agent = pane.agent;
    if (agent === null) continue;
    const tab = input.tabs.get(pane.tabId);
    const ws = tab ? input.workspaces.get(tab.workspaceId) : undefined;
    rows.push({
      paneId: pane.id,
      workspaceId: tab?.workspaceId ?? "",
      tabId: pane.tabId,
      kind: agent.kind,
      name: agent.name ?? input.nameOf(pane),
      state: input.stateOf(pane),
      since: agent.since,
      workspaceLabel: ws?.label ?? "",
      tabLabel: tab?.label ?? "",
      cwd: pane.cwd,
      branch: ws?.git?.branch ?? null,
      subagents: agent.subagents ? agent.subagents.count : null,
      usage: input.usage[pane.id] ?? null,
    });
  }
  return rows;
}

/** 種類の絞り込み（`null`＝全部）。 */
export function filterRows(rows: readonly DashboardRow[], kind: string | null): DashboardRow[] {
  return kind === null ? [...rows] : rows.filter((r) => r.kind === kind);
}

/** 行に出ている種類（絞り込みの候補）。 */
export function kindsOf(rows: readonly DashboardRow[]): string[] {
  return [...new Set(rows.map((r) => r.kind))].sort();
}

const STATE_ORDER = new Map<DisplayState, number>(DISPLAY_STATES.map((s, i) => [s, i]));

/** 値の大きい順（無い行は最後）。同じなら名前順。 */
function byNumberDesc(value: (r: DashboardRow) => number | undefined): (a: DashboardRow, b: DashboardRow) => number {
  return (a, b) => {
    const x = value(a);
    const y = value(b);
    if (x === undefined && y === undefined) return a.name.localeCompare(b.name);
    if (x === undefined) return 1;
    if (y === undefined) return -1;
    return y - x || a.name.localeCompare(b.name);
  };
}

export function sortRows(rows: readonly DashboardRow[], key: SortKey): DashboardRow[] {
  const out = [...rows];
  switch (key) {
    case "state":
      out.sort((a, b) => (STATE_ORDER.get(a.state) ?? 99) - (STATE_ORDER.get(b.state) ?? 99) || a.name.localeCompare(b.name) || a.paneId.localeCompare(b.paneId));
      break;
    case "cost":
      out.sort(byNumberDesc((r) => r.usage?.costUsd));
      break;
    case "tokens":
      out.sort(byNumberDesc((r) => totalTokens(r.usage)));
      break;
    case "name":
      out.sort((a, b) => a.name.localeCompare(b.name) || a.paneId.localeCompare(b.paneId));
      break;
  }
  return out;
}

/** トークンの合計（`total` があればそれ、無ければ入力・出力・キャッシュの和。何も無ければ undefined）。 */
export function totalTokens(u: AgentUsage | null): number | undefined {
  if (u === null) return undefined;
  const t = u.tokens;
  if (t.total !== undefined) return t.total;
  const parts = [t.input, t.output, t.cacheRead, t.cacheWrite].filter((n): n is number => n !== undefined);
  return parts.length === 0 ? undefined : parts.reduce((a, b) => a + b, 0);
}

/** 12345 → 「12.3k」・1234567 → 「1.23M」。 */
export function formatTokens(n: number | undefined): string {
  if (n === undefined) return NONE;
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${trim(n / 1000, n < 10_000 ? 2 : n < 100_000 ? 1 : 0)}k`;
  if (n < 1_000_000_000) return `${trim(n / 1_000_000, n < 10_000_000 ? 2 : n < 100_000_000 ? 1 : 0)}M`;
  return `${trim(n / 1_000_000_000, 2)}G`;
}
function trim(v: number, digits: number): string {
  return v.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

/** コスト（USD）。無ければ「—」。 */
export function formatCost(usd: number | undefined): string {
  if (usd === undefined) return NONE;
  if (usd < 0.01 && usd > 0) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

/** 基準の印の短い語（トークンの隣）。 */
export function basisLabel(basis: UsageTokenBasis): string {
  switch (basis) {
    case "cumulative":
      return "累計";
    case "transcript":
      return "記録分";
    case "context":
      return "文脈内";
  }
}
/** 基準の印の説明（`title`・読み上げ）。「記録に残る分」は確定した累計ではない、と言う。 */
export function basisDescription(basis: UsageTokenBasis): string {
  switch (basis) {
    case "cumulative":
      return "会計の累計（記録の会計の行と、その後の記録の分）";
    case "transcript":
      return "記録に残る分の合計（確定した累計ではありません。記録に残らない呼び出しの分は含みません）";
    case "context":
      return "いま文脈にある分（累計ではありません）";
  }
}

/** 「N 秒前」「N 分前」「N 時間前」「N 日前」。未来（時計のずれ）は「たった今」。 */
export function formatAgo(at: number, now: number): string {
  const sec = Math.floor((now - at) / 1000);
  if (sec < 5) return "たった今";
  if (sec < 60) return `${sec} 秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分前`;
  const hour = Math.floor(min / 60);
  if (hour < 48) return `${hour} 時間前`;
  return `${Math.floor(hour / 24)} 日前`;
}

/** 値が古いか（更新が 1 分より前）。 */
export function isStale(updatedAt: number, now: number): boolean {
  return now - updatedAt > STALE_AFTER_MS;
}

/** コンテキストの表示（率があれば率、無ければトークン数だけ）。 */
export interface ContextDisplay {
  /** 0〜100。窓の大きさが分かるときだけ。 */
  pct: number | null;
  text: string;
}
export function contextDisplay(u: AgentUsage | null): ContextDisplay {
  if (u === null) return { pct: null, text: NONE };
  if (u.contextUsedPct !== undefined) {
    const pct = Math.max(0, Math.min(100, Math.round(u.contextUsedPct)));
    return { pct, text: `${pct}%` };
  }
  if (u.contextTokens !== undefined) {
    // 単位（tok）を添える（率ではなく、いま文脈にあるトークン数だと分かるように）。
    const win = u.contextWindowTokens !== undefined ? ` / ${formatTokens(u.contextWindowTokens)}` : "";
    return { pct: null, text: `${formatTokens(u.contextTokens)}${win} tok` };
  }
  return { pct: null, text: NONE };
}

export interface WindowDisplay {
  label: string;
  /** 0〜100（リセット済みなら null）。 */
  pct: number | null;
  /** 「42%」または「リセット済み」。 */
  text: string;
  /** 「あと 2 時間 10 分でリセット」「リセット済み（次の値を待っています）」。分からなければ null。 */
  reset: string | null;
  /** リセットの時刻を過ぎている・サーバが古いと印を付けた（薄く出す）。 */
  past: boolean;
  /** サーバが「古い」と印を付けた（`UsageWindow.stale`。率は出すが「古い値」と添える）。 */
  stale: boolean;
  /** 組織の枠の、使った額・上限（「$12.50 / $50.00」）。無ければ null。 */
  spend: string | null;
}

/** 制限の枠 1 つ。リセットの時刻を過ぎた枠は、率を出さず「リセット済み」（Claude 自身も、窓が過ぎると落とす）。 */
export function windowDisplay(w: UsageWindow, now: number): WindowDisplay {
  const past = w.resetsAt !== undefined && w.resetsAt <= now;
  const spend = w.usedUsd !== undefined && w.limitUsd !== undefined ? `${formatCost(w.usedUsd)} / ${formatCost(w.limitUsd)}` : w.usedUsd !== undefined ? formatCost(w.usedUsd) : null;
  if (past) return { label: w.label, pct: null, text: "リセット済み", reset: "リセット済み（次の値を待っています）", past: true, stale: true, spend };
  const pct = Math.max(0, Math.min(100, Math.round(w.usedPct)));
  const stale = w.stale === true;
  const reset = w.resetsAt !== undefined ? `あと ${formatDuration(w.resetsAt - now)}でリセット` : null;
  return { label: w.label, pct, text: `${pct}%`, reset: stale ? `古い値${reset ? `（${reset}）` : ""}` : reset, past: stale, stale, spend };
}

/** 「2 時間 10 分」「35 分」「1 分未満」「3 日 4 時間」。 */
export function formatDuration(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 1) return "1 分未満";
  if (min < 60) return `${min} 分`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return min % 60 === 0 ? `${hour} 時間` : `${hour} 時間 ${min % 60} 分`;
  const day = Math.floor(hour / 24);
  return hour % 24 === 0 ? `${day} 日` : `${day} 日 ${hour % 24} 時間`;
}

/** アカウントの枠を、種類ごと（`kind`）に並べる。 */
export function accountsByKind(accounts: readonly AccountUsage[]): { kind: string; accounts: AccountUsage[] }[] {
  const map = new Map<string, AccountUsage[]>();
  for (const a of accounts) {
    const list = map.get(a.kind) ?? [];
    list.push(a);
    map.set(a.kind, list);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([kind, list]) => ({ kind, accounts: list }));
}

/** 種類の呼び名（既知のものは短い名前）。 */
export function kindLabel(kind: string): string {
  switch (kind) {
    case "claude":
      return "Claude Code";
    case "codex":
      return "Codex";
    case "copilot":
      return "Copilot CLI";
    default:
      return kind;
  }
}
