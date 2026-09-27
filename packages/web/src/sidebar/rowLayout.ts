/**
 * サイドバーの行の並び（20260927-sidebar-row-tokens。herdr の `[ui.sidebar.agents]`・`[ui.sidebar.spaces]` の `rows`）の**規則の唯一の置き場**:
 * 型・既定・保存値の読み込み・色と名前の検査・条件の当たり方。描画（`resolveRows.ts`）・設定画面（`SidebarRowsSettings.vue`）・store（`settings.ts`）が共有する
 * （片方だけ更新されて「選べるのに描かれない」トークンを作らない。architecture.md「設計判断」）。
 *
 * 規則は herdr の一次資料に合わせる（research F9〜F14）: `herdr/src/config/sidebar.rs`（上限・色・`$名前`）、
 * `herdr/src/config/sidebar/rules.rs`（条件・`matching_style`）、`docs/configuration.mdx`「Sidebar row layouts」。
 * 本製品独自のトークン `git`・`name`・`unverified` は既定の見た目を変えないため（decisions D3）。
 */

export type SidebarArea = "spaces" | "agents";

/** 省略＝その場の既定の見た目。`false` はその場の既定の太字・薄字を外す（herdr と同じ）。 */
export interface TokenStyle {
  fg?: string;
  bold?: boolean;
  dim?: boolean;
}

export type RuleWhen = "equals" | "contains" | "starts_with" | "gt" | "lt";
export type TextRuleWhen = "equals" | "contains" | "starts_with";
export type NumberRuleWhen = "gt" | "lt";

export type TokenRule = TokenStyle & { hide?: boolean } & (
    | { when: TextRuleWhen; value: string; ignoreCase?: boolean }
    | { when: NumberRuleWhen; value: number }
  );

export interface TokenSpec extends TokenStyle {
  /** 組み込みの id か `$名前`。 */
  token: string;
  rules?: TokenRule[];
}

/** 行の並び（各要素が 1 行）。 */
export type RowLayout = TokenSpec[][];

/** null＝既定（保存に項目が無い）。 */
export interface SidebarRowsPrefs {
  spaces: RowLayout | null;
  agents: RowLayout | null;
}

export const SIDEBAR_AREAS: readonly SidebarArea[] = ["spaces", "agents"];
export const MAX_ROWS = 16;
export const MAX_TOKENS_PER_ROW = 16;
export const MAX_RULES = 16;
/** 条件の文字の値の長さの上限（保存値の大きさの抑え。herdr には無い）。 */
export const MAX_RULE_TEXT = 256;
export const MAX_CUSTOM_NAME = 32;

export interface BuiltinToken {
  id: string;
  /** 設定画面の表示名。 */
  label: string;
  /** 文字の値を持つ（条件を付けられる）か。 */
  textValued: boolean;
}

/** 組み込みのトークン（本製品に実在する情報だけ。`machine`・`terminal_title_stripped` は backlog。decisions D6）。 */
export const BUILTIN_TOKENS: Record<SidebarArea, readonly BuiltinToken[]> = {
  spaces: [
    { id: "state_icon", label: "状態の印", textValued: false },
    { id: "state_text", label: "状態の語", textValued: true },
    { id: "workspace", label: "workspace 名", textValued: true },
    { id: "branch", label: "ブランチ", textValued: true },
    { id: "git_status", label: "上流との差（↑↓）", textValued: false },
    { id: "git", label: "ブランチと上流との差（ずれているときだけ）", textValued: false },
  ],
  agents: [
    { id: "state_icon", label: "状態の印", textValued: false },
    { id: "state_text", label: "状態の語", textValued: true },
    { id: "workspace", label: "workspace 名", textValued: true },
    { id: "tab", label: "tab 名", textValued: true },
    { id: "pane", label: "pane の名前", textValued: true },
    { id: "agent", label: "エージェントの表示名", textValued: true },
    { id: "name", label: "付けた名前", textValued: true },
    { id: "unverified", label: "未検証の印", textValued: true },
    { id: "terminal_title", label: "端末のタイトル", textValued: true },
  ],
};

/** 既定の並び（今のサイドバーと同じ描画。decisions D3）。 */
export const DEFAULT_LAYOUTS: Record<SidebarArea, RowLayout> = {
  spaces: [[{ token: "state_icon" }, { token: "workspace" }], [{ token: "git" }]],
  agents: [
    [{ token: "state_icon" }, { token: "workspace" }, { token: "tab" }],
    [{ token: "name" }, { token: "agent" }, { token: "unverified" }],
  ],
};

const COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const CUSTOM_TOKEN_PATTERN = new RegExp(`^\\$[A-Za-z0-9_-]{1,${MAX_CUSTOM_NAME}}$`);
/** Rust の `f64::from_str` が読む 10 進の形（`inf`・`nan` は有限でないので最初から除く）。前後の空白・単位・`_` は読まない。 */
const NUMBER_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const TEXT_WHENS: readonly RuleWhen[] = ["equals", "contains", "starts_with"];

/** 文字の条件（equals・contains・starts_with）か。 */
export function isTextWhen(when: RuleWhen): when is TextRuleWhen {
  return TEXT_WHENS.includes(when);
}
const NUMBER_WHENS: readonly RuleWhen[] = ["gt", "lt"];

/** `#RGB`・`#RRGGBB` だけ（herdr と同じ厳しさ。`style` に入れてよいのはこれを通った値だけ）。 */
export function isValidColor(s: unknown): s is string {
  return typeof s === "string" && COLOR_PATTERN.test(s);
}

/** `$` と `[A-Za-z0-9_-]` の 1〜32 文字。 */
export function isValidCustomToken(s: string): boolean {
  return CUSTOM_TOKEN_PATTERN.test(s);
}

export function builtinToken(area: SidebarArea, id: string): BuiltinToken | undefined {
  return BUILTIN_TOKENS[area].find((t) => t.id === id);
}

export function isTokenAllowed(area: SidebarArea, token: string): boolean {
  return builtinToken(area, token) !== undefined || isValidCustomToken(token);
}

/** 条件を付けられるか（`state_icon`・`git_status`・`git` 以外。独自トークンは文字）。 */
export function isTextValued(area: SidebarArea, token: string): boolean {
  const b = builtinToken(area, token);
  return b ? b.textValued : isValidCustomToken(token);
}

/** 値が全体で有限の数として読めれば数、読めなければ null（herdr の `parse::<f64>().ok().filter(is_finite)`）。 */
export function parseFiniteNumber(s: string): number | null {
  if (!NUMBER_PATTERN.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** ASCII の英大文字だけを小文字に畳む（ASCII 以外は区別したまま。herdr の `eq_ignore_ascii_case`）。 */
function foldAscii(s: string): string {
  return s.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

function ruleMatches(rule: TokenRule, value: string, numeric: { parsed?: number | null }): boolean {
  switch (rule.when) {
    case "equals":
      return rule.ignoreCase ? foldAscii(value) === foldAscii(rule.value) : value === rule.value;
    case "starts_with":
      return rule.ignoreCase
        ? foldAscii(value).startsWith(foldAscii(rule.value))
        : value.startsWith(rule.value);
    case "contains":
      return rule.ignoreCase
        ? foldAscii(value).includes(foldAscii(rule.value))
        : value.includes(rule.value);
    case "gt":
    case "lt": {
      if (numeric.parsed === undefined) numeric.parsed = parseFiniteNumber(value);
      const n = numeric.parsed;
      if (n === null) return false;
      return rule.when === "gt" ? n > rule.value : n < rule.value;
    }
  }
}

/**
 * 条件を先頭から見て、最初に当たったものの見た目を返す（herdr の `matching_style`）。`hide` なら null（そのトークンを消す）。当たった条件の `fg`/`bold`/`dim` のうち
 * 指定したものだけを `base` に重ねる。当たらなければ `base`。比べるのは表示で切り詰める前の値全体。
 */
export function matchingStyle(
  rules: readonly TokenRule[] | undefined,
  base: TokenStyle,
  value: string,
): TokenStyle | null {
  if (!rules) return base;
  const numeric: { parsed?: number | null } = {};
  for (const rule of rules) {
    if (!ruleMatches(rule, value, numeric)) continue;
    if (rule.hide === true) return null;
    const out: TokenStyle = { ...base };
    if (rule.fg !== undefined) out.fg = rule.fg;
    if (rule.bold !== undefined) out.bold = rule.bold;
    if (rule.dim !== undefined) out.dim = rule.dim;
    return out;
  }
  return base;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 見た目の項目を、読めるものだけ写す（読めない `fg` は `fg` だけを捨てる）。 */
function loadStyle(raw: Record<string, unknown>, out: TokenStyle): void {
  if (isValidColor(raw["fg"])) out.fg = raw["fg"];
  if (typeof raw["bold"] === "boolean") out.bold = raw["bold"];
  if (typeof raw["dim"] === "boolean") out.dim = raw["dim"];
}

/** 条件を 1 つ読む。読めなければ null（条件ごと捨てる）。 */
export function loadRule(raw: unknown): TokenRule | null {
  if (!isRecord(raw)) return null;
  const when = raw["when"];
  const value = raw["value"];
  let rule: TokenRule;
  if (typeof when === "string" && TEXT_WHENS.includes(when as RuleWhen)) {
    if (typeof value !== "string" || value.length > MAX_RULE_TEXT) return null;
    rule = { when: when as TextRuleWhen, value };
    if (raw["ignoreCase"] === true) rule.ignoreCase = true;
    else if (raw["ignoreCase"] !== undefined && raw["ignoreCase"] !== false) return null;
  } else if (typeof when === "string" && NUMBER_WHENS.includes(when as RuleWhen)) {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    if (raw["ignoreCase"] !== undefined) return null; // herdr: 数の条件に ignore_case は付けられない
    rule = { when: when as NumberRuleWhen, value };
  } else {
    return null;
  }
  loadStyle(raw, rule);
  if (typeof raw["hide"] === "boolean") rule.hide = raw["hide"];
  return rule;
}

/** トークンを 1 つ読む。その区画で使えなければ null。 */
export function loadTokenSpec(area: SidebarArea, raw: unknown): TokenSpec | null {
  if (!isRecord(raw) || typeof raw["token"] !== "string" || !isTokenAllowed(area, raw["token"]))
    return null;
  const spec: TokenSpec = { token: raw["token"] };
  loadStyle(raw, spec);
  if (isTextValued(area, spec.token) && Array.isArray(raw["rules"])) {
    const rules = raw["rules"]
      .map(loadRule)
      .filter((r): r is TokenRule => r !== null)
      .slice(0, MAX_RULES);
    if (rules.length > 0) spec.rules = rules;
  }
  return spec;
}

/** 区画の並びを読む。配列でなければ null（既定）。行・トークンは読めないものを捨て、数の上限を超えた分は末尾を切り詰める。 */
export function loadRowLayout(area: SidebarArea, raw: unknown): RowLayout | null {
  if (!Array.isArray(raw)) return null;
  return raw
    .filter((row): row is unknown[] => Array.isArray(row))
    .slice(0, MAX_ROWS)
    .map((row) =>
      row
        .map((t) => loadTokenSpec(area, t))
        .filter((t): t is TokenSpec => t !== null)
        .slice(0, MAX_TOKENS_PER_ROW),
    );
}

/** `soda.prefs.v1` の `sidebarRows` を読む（値ごとに落とす）。 */
export function loadSidebarRows(raw: unknown): SidebarRowsPrefs {
  const obj = isRecord(raw) ? raw : {};
  return {
    spaces: loadRowLayout("spaces", obj["spaces"]),
    agents: loadRowLayout("agents", obj["agents"]),
  };
}

/** 保存する形。両方 null（既定）なら undefined（`sidebarRows` の項目ごと消す）。 */
export function serializeSidebarRows(
  p: SidebarRowsPrefs,
): { spaces?: RowLayout; agents?: RowLayout } | undefined {
  const out: { spaces?: RowLayout; agents?: RowLayout } = {};
  if (p.spaces !== null) out.spaces = p.spaces;
  if (p.agents !== null) out.agents = p.agents;
  return out.spaces === undefined && out.agents === undefined ? undefined : out;
}

/** 実際に使う並び（null なら既定）。 */
export function effectiveLayout(p: SidebarRowsPrefs, area: SidebarArea): RowLayout {
  return p[area] ?? DEFAULT_LAYOUTS[area];
}
