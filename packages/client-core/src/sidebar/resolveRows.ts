import type { AgentInfo, DisplayState, Pane, Tab, Workspace } from "@sodashitsu/protocol";
import { stateLabel } from "../agent/stateIndicator.js";
import {
  isValidColor,
  matchingStyle,
  type RowLayout,
  type TokenSpec,
  type TokenStyle,
} from "./rowLayout.js";

/**
 * サイドバーの行の各トークンを、model の値・並び・見た目・条件から解決する（20260927-sidebar-row-tokens）。Vue を知らない純関数で、描き方
 * （DOM・クラス）は `Sidebar.vue` が持つ。値の有無・行の消え方は herdr（`herdr/src/ui/sidebar/tokens.rs` の `agent_rows`・`space_rows`）に合わせ、
 * 本製品独自のトークン（`git`・`name`・`unverified`）は今の描画と同じ条件で現れる（decisions D3）。
 */

export type ResolvedToken =
  | { kind: "state_icon"; style: TokenStyle }
  /** ずれている（ahead か behind が 0 でない）ときだけ現れる。branch は detached なら null（今と同じく空の要素で描く）。 */
  | { kind: "git"; branch: string | null; counts: string; style: TokenStyle }
  | { kind: "git_status"; counts: string; style: TokenStyle }
  | { kind: "text"; token: string; text: string; style: TokenStyle };

export type ResolvedLine = ResolvedToken[];

export interface SpaceTokenContext {
  workspace: Workspace;
  /** workspace の中のエージェントの状態の集約（居なければ null）。 */
  state: DisplayState | null;
}

export interface AgentTokenContext {
  pane: Pane;
  tab: Tab | undefined;
  workspace: Workspace | undefined;
  agent: AgentInfo;
  /** `displayStateFor` の結果（エージェントが居る行なので実際には null にならないが、型は null を含む）。 */
  state: DisplayState | null;
}

/** 「未検証」の語（今の `Sidebar.vue` と同じ）。 */
export const UNVERIFIED_TEXT = "未検証";

/** 行が 1 つも残らなかったときの代わりの行（見た目なし。行を押せなくならないため。AC12）。 */
const FALLBACK: Record<"spaces" | "agents", RowLayout> = {
  spaces: [[{ token: "state_icon" }, { token: "workspace" }]],
  agents: [[{ token: "state_icon" }, { token: "workspace" }, { token: "tab" }]],
};

/** 報告された独自トークンの値。**自前の持ち物だけ**を引く（`constructor` 等の名前がプロトタイプの値を返さないように）。 */
export function customTokenValue(
  tokens: Record<string, string> | undefined,
  token: string,
): string | undefined {
  if (!tokens || !token.startsWith("$")) return undefined;
  const name = token.slice(1);
  if (!Object.hasOwn(tokens, name)) return undefined;
  const v = tokens[name];
  return typeof v === "string" ? v : undefined;
}

function countsOf(git: { ahead: number; behind: number }): string {
  return `↑${git.ahead} ↓${git.behind}`;
}

function baseStyle(spec: TokenSpec): TokenStyle {
  const style: TokenStyle = {};
  if (spec.fg !== undefined) style.fg = spec.fg;
  if (spec.bold !== undefined) style.bold = spec.bold;
  if (spec.dim !== undefined) style.dim = spec.dim;
  return style;
}

/** 文字の値のトークン: 条件を当てる（hide なら null＝消す）。 */
function textToken(spec: TokenSpec, text: string | undefined): ResolvedToken | null {
  if (text === undefined) return null;
  const style = matchingStyle(spec.rules, baseStyle(spec), text);
  return style === null ? null : { kind: "text", token: spec.token, text, style };
}

function resolveSpaceToken(spec: TokenSpec, ctx: SpaceTokenContext): ResolvedToken | null {
  const ws = ctx.workspace;
  const git = ws.git;
  const diverged = !!git && (git.ahead > 0 || git.behind > 0);
  switch (spec.token) {
    case "state_icon":
      return { kind: "state_icon", style: baseStyle(spec) };
    case "state_text":
      return textToken(spec, stateLabel(ctx.state) ?? undefined);
    case "workspace":
      return textToken(spec, ws.label);
    case "branch":
      return textToken(spec, git?.branch ?? undefined);
    case "git_status":
      return diverged
        ? { kind: "git_status", counts: countsOf(git!), style: baseStyle(spec) }
        : null;
    case "git":
      return diverged
        ? { kind: "git", branch: git!.branch, counts: countsOf(git!), style: baseStyle(spec) }
        : null;
    default:
      return textToken(spec, customTokenValue(ws.tokens, spec.token));
  }
}

function resolveAgentToken(spec: TokenSpec, ctx: AgentTokenContext): ResolvedToken | null {
  switch (spec.token) {
    case "state_icon":
      return { kind: "state_icon", style: baseStyle(spec) };
    case "state_text":
      return textToken(spec, stateLabel(ctx.state) ?? undefined);
    case "workspace":
      return textToken(spec, ctx.workspace?.label ?? "");
    case "tab":
      // 常に（無ければ空文字）。herdr は tab があるときだけだが、今の描画は tab が無くても空の要素を描く——既定の見た目を変えない（decisions D3）。
      return textToken(spec, ctx.tab?.label ?? "");
    case "pane":
      return textToken(spec, ctx.pane.label ? ctx.pane.label : undefined);
    case "agent":
      return textToken(spec, ctx.agent.label);
    case "name":
      return textToken(spec, ctx.agent.name ? ctx.agent.name : undefined);
    case "unverified":
      return textToken(spec, ctx.agent.verified ? undefined : UNVERIFIED_TEXT);
    case "terminal_title":
      return textToken(spec, ctx.pane.title ? ctx.pane.title : undefined);
    default:
      return textToken(spec, customTokenValue(ctx.pane.tokens, spec.token));
  }
}

function resolveLines<C>(
  layout: RowLayout,
  ctx: C,
  one: (spec: TokenSpec, ctx: C) => ResolvedToken | null,
): ResolvedLine[] {
  const lines: ResolvedLine[] = [];
  for (const row of layout) {
    const line = row.map((spec) => one(spec, ctx)).filter((t): t is ResolvedToken => t !== null);
    if (line.length > 0) lines.push(line);
  }
  return lines;
}

/** workspace 行（spaces）。行が 1 つも残らなければ代わりの行。 */
export function resolveSpaceLines(layout: RowLayout, ctx: SpaceTokenContext): ResolvedLine[] {
  const lines = resolveLines(layout, ctx, resolveSpaceToken);
  return lines.length > 0 ? lines : resolveLines(FALLBACK.spaces, ctx, resolveSpaceToken);
}

/** エージェント行（agents）。行が 1 つも残らなければ代わりの行。 */
export function resolveAgentLines(layout: RowLayout, ctx: AgentTokenContext): ResolvedLine[] {
  const lines = resolveLines(layout, ctx, resolveAgentToken);
  return lines.length > 0 ? lines : resolveLines(FALLBACK.agents, ctx, resolveAgentToken);
}

/**
 * 見た目を `style` の値にする。色は読み込み・設定画面で `#RGB`/`#RRGGBB` を通したものだけが来るが、ここでも通らないものは入れない（二重の守り）。
 * 見た目が無ければ undefined（`style` 属性を付けない——既定の DOM を変えない）。薄字は今の補足の行と同じ不透明度 0.75。
 */
export function tokenStyleAttr(style: TokenStyle): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  if (isValidColor(style.fg)) out["color"] = style.fg;
  if (style.bold !== undefined) out["font-weight"] = style.bold ? "bold" : "normal";
  if (style.dim !== undefined) out["opacity"] = style.dim ? "0.75" : "1";
  return Object.keys(out).length > 0 ? out : undefined;
}
