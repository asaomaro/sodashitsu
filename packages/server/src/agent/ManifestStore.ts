/**
 * 判定ルール（herdr の TOML。`third_party/herdr/agent-detection/*`）の読み込みと検証（architecture.md
 * 「agent/ManifestStore」・design「判定ルールのエンジン」）。herdr のソース（`da6bcd5`。Apache-2.0・D5）の
 * `src/detect/manifest.rs` を移植した（検証の上限・手順は decisions.md D46 を正典とする）。
 *
 * ルールの**評価**（region の切り出し・gate の判定）はここでは行わない（`ManifestEngine`。T4）。
 * ここが持つのは「読み込み → 検証 → コンパイル（正規表現の変換・contains の小文字化）」まで。
 */
import { z } from "zod";
import { parse as parseToml } from "smol-toml";
import type { AgentState } from "@sodashitsu/protocol";
import type { ManifestSource } from "../infra/ManifestSource.js";
import type { Logger } from "../log/Logger.js";
import { convertRustRegex } from "./regexConvert.js";

// --- コンパイル済みの型（ManifestEngine が読む） -----------------------------------------------

export interface CompiledGate {
  /** 小文字化済み（herdr は compile 時に小文字化し、評価時は毎回小文字化しない。D46）。 */
  contains: string[];
  regex: RegExp[];
  lineRegex: RegExp[];
  all: CompiledGate[];
  any: CompiledGate[];
  not: CompiledGate[];
}

export interface CompiledRule {
  id: string;
  state: AgentState;
  priority: number;
  /** 生の region 指定（例 `"bottom_non_empty_lines(12)"`）。評価のたびに ManifestEngine が解釈する（herdr と同じ）。 */
  region: string;
  visibleIdle: boolean;
  visibleBlocker: boolean;
  visibleWorking: boolean;
  skipStateUpdate: boolean;
  gate: CompiledGate;
}

export interface CompiledManifest {
  /** herdr の agent id（`third_party/herdr/agent-detection/index.toml` の `id`）。 */
  kind: string;
  minEngineVersion: number | null;
  rules: CompiledRule[];
}

export interface ManifestLoadSummary {
  kind: string;
  ok: boolean;
  ruleCount: number;
  error: string | null;
}

export interface ManifestStore {
  get(kind: string): CompiledManifest | undefined;
  /** 起動時のログ・smoke 用（design「起動確認」）。 */
  summaries(): ManifestLoadSummary[];
}

// --- 生データの検証（zod。D29） ------------------------------------------------------------

const AgentStateSchema = z.enum(["idle", "working", "blocked", "unknown"]);

interface RawGate {
  all: RawGate[];
  any: RawGate[];
  not: RawGate[];
  contains: string[];
  regex: string[];
  line_regex: string[];
}

const RawGateSchema: z.ZodType<RawGate> = z.lazy(() =>
  z.strictObject({
    all: z.array(RawGateSchema).default([]),
    any: z.array(RawGateSchema).default([]),
    not: z.array(RawGateSchema).default([]),
    contains: z.array(z.string()).default([]),
    regex: z.array(z.string()).default([]),
    line_regex: z.array(z.string()).default([]),
  }),
);

const RawRuleSchema = z.strictObject({
  id: z.string(),
  // herdr の `state: Option<ManifestState>`（`manifest.rs:157`）は本当に省略可能で、省略時は評価結果として
  // 使うときだけ "unknown" に落ちる（`manifest.rs:495-497`）。ここで zod の `.default()` を使って
  // 早期に "unknown" を埋めてしまうと、下の `skip_state_update` の検証（herdr は「明示的に
  // `state = "unknown"` と書かれているか」を見る。`manifest.rs:948`）が「省略」と「明示」を区別できなくなる
  // （review 指摘。should）。検証を通した後、コンパイル時に明示的に `?? "unknown"` で落とす。
  state: AgentStateSchema.optional(),
  // herdr の `priority: i32`（符号あり。負の値も許す。review 指摘。nit：整数であることは検証していなかった）。
  priority: z.number().int().default(0),
  region: z.string().default("whole_recent"),
  visible_idle: z.boolean().default(false),
  visible_blocker: z.boolean().default(false),
  visible_working: z.boolean().default(false),
  skip_state_update: z.boolean().default(false),
  all: z.array(RawGateSchema).default([]),
  any: z.array(RawGateSchema).default([]),
  not: z.array(RawGateSchema).default([]),
  contains: z.array(z.string()).default([]),
  regex: z.array(z.string()).default([]),
  line_regex: z.array(z.string()).default([]),
});
type RawRule = z.infer<typeof RawRuleSchema>;

const RawManifestSchema = z.strictObject({
  id: z.string(),
  version: z.string().optional(),
  // herdr の `min_engine_version: Option<u32>`（符号なし。review 指摘。nit：整数・非負であることは検証していなかった）。
  min_engine_version: z.number().int().nonnegative().optional(),
  updated_at: z.string().optional(),
  aliases: z.array(z.string()).default([]),
  rules: z.array(RawRuleSchema).default([]),
});
type RawManifest = z.infer<typeof RawManifestSchema>;

const IndexSchema = z.strictObject({
  schema_version: z.number(),
  agents: z.array(z.strictObject({ id: z.string(), path: z.string() })),
});

// --- region 名の検証（herdr の `validate_region_name`。D46） ------------------------------------

const FIXED_REGIONS = new Set([
  "whole_recent",
  "after_last_prompt_marker",
  "before_current_prompt_marker",
  "whole_recent_without_current_prompt_marker",
  "current_prompt_block_marker",
  "after_current_prompt_block_marker",
  "prompt_box_body",
  "above_prompt_box",
  "last_non_empty_above_prompt_box",
  "after_last_horizontal_rule",
  "osc_title",
  "osc_progress",
]);
const TOP_NON_EMPTY_LINES_ENGINE_VERSION = 3;

/** `bottom_lines(N)`・`bottom_non_empty_lines(N)` 用（先頭0も許す。herdr の `region_count` と同じ）。
 *  `ManifestEngine`（T4）も同じ判定で region を解釈するので、ここから import して使う（正典を1箇所にする）。 */
export function regionCount(spec: string, name: string): number | null {
  if (!spec.startsWith(`${name}(`) || !spec.endsWith(")")) return null;
  const digits = spec.slice(name.length + 1, -1);
  if (digits.length === 0 || !/^[0-9]+$/.test(digits)) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}

/** `top_non_empty_lines(N)` 専用（先頭0を許さず、u16 の範囲まで。herdr の `top_region_count` と同じ）。 */
export function topRegionCount(spec: string): number | null {
  const prefix = "top_non_empty_lines(";
  if (!spec.startsWith(prefix) || !spec.endsWith(")")) return null;
  const digits = spec.slice(prefix.length, -1);
  if (digits.length === 0 || digits.startsWith("0") || !/^[0-9]+$/.test(digits)) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) && n <= 0xffff ? n : null;
}

function isValidRegionName(spec: string): boolean {
  const trimmed = spec.trim();
  if (FIXED_REGIONS.has(trimmed)) return true;
  return regionCount(trimmed, "bottom_lines") !== null || regionCount(trimmed, "bottom_non_empty_lines") !== null || topRegionCount(trimmed) !== null;
}

// --- gate の検証つきコンパイル（herdr の `validate_gate`/`compile_gate` を1回で行う。D46） ---------------

const MAX_RULES_PER_MANIFEST = 128;
const MAX_GATE_DEPTH = 8;
const MAX_TOTAL_GATES = 512;
const MAX_MATCHERS_PER_GATE = 32;
const MAX_TOTAL_MATCHERS = 1024;
const MAX_MATCHER_CHARS = 512;

interface Complexity {
  totalGates: number;
  totalMatchers: number;
}

type CompileResult = { ok: true; gate: CompiledGate } | { ok: false; reason: string };

function gateHasPositiveMatcher(g: RawGate): boolean {
  return g.contains.length > 0 || g.regex.length > 0 || g.line_regex.length > 0 || g.all.length > 0 || g.any.length > 0;
}
function gateHasAnyMatcher(g: RawGate): boolean {
  return gateHasPositiveMatcher(g) || g.not.length > 0;
}

/** matcher の個数・長さの上限（gate 共通・not gate も同じ規則。herdr の `validate_matcher_limits`）。 */
function checkMatcherLimits(g: RawGate, context: string, c: Complexity): string | null {
  const matcherCount = g.contains.length + g.regex.length + g.line_regex.length;
  if (matcherCount > MAX_MATCHERS_PER_GATE) return `${context} has ${matcherCount} direct matchers, max is ${MAX_MATCHERS_PER_GATE}`;
  c.totalMatchers += matcherCount;
  if (c.totalMatchers > MAX_TOTAL_MATCHERS) return `manifest exceeds max matcher count ${MAX_TOTAL_MATCHERS}`;
  for (const v of [...g.contains, ...g.regex, ...g.line_regex]) {
    if ([...v].length > MAX_MATCHER_CHARS) return `${context} matcher exceeds max length ${MAX_MATCHER_CHARS}`;
  }
  return null;
}

/** `regex`/`line_regex` を変換・コンパイルする。1つでも失敗したらそこで打ち切る。 */
function compilePatterns(patterns: string[], context: string, field: "regex" | "line_regex"): { ok: true; compiled: RegExp[] } | { ok: false; reason: string } {
  const compiled: RegExp[] = [];
  for (const p of patterns) {
    const r = convertRustRegex(p);
    if (!r.ok) return { ok: false, reason: `${context} contains invalid ${field} pattern ${JSON.stringify(p)}: ${r.reason}` };
    compiled.push(r.regex);
  }
  return { ok: true, compiled };
}

function compileGate(raw: RawGate, context: string, depth: number, c: Complexity): CompileResult {
  if (depth > MAX_GATE_DEPTH) return { ok: false, reason: `${context} exceeds max gate depth ${MAX_GATE_DEPTH}` };
  c.totalGates += 1;
  if (c.totalGates > MAX_TOTAL_GATES) return { ok: false, reason: `manifest exceeds max gate count ${MAX_TOTAL_GATES}` };
  const limitErr = checkMatcherLimits(raw, context, c);
  if (limitErr) return { ok: false, reason: limitErr };
  if (!gateHasPositiveMatcher(raw)) return { ok: false, reason: `${context} must contain a positive matcher` };

  const regex = compilePatterns(raw.regex, context, "regex");
  if (!regex.ok) return regex;
  const lineRegex = compilePatterns(raw.line_regex, context, "line_regex");
  if (!lineRegex.ok) return lineRegex;

  const all: CompiledGate[] = [];
  for (const nested of raw.all) {
    const r = compileGate(nested, "all gate", depth + 1, c);
    if (!r.ok) return r;
    all.push(r.gate);
  }
  const any: CompiledGate[] = [];
  for (const nested of raw.any) {
    const r = compileGate(nested, "any gate", depth + 1, c);
    if (!r.ok) return r;
    any.push(r.gate);
  }
  const not: CompiledGate[] = [];
  for (const nested of raw.not) {
    if (!gateHasAnyMatcher(nested)) return { ok: false, reason: `${context} contains an empty not gate` };
    const r = compileNotGate(nested, depth + 1, c);
    if (!r.ok) return r;
    not.push(r.gate);
  }

  return { ok: true, gate: { contains: raw.contains.map((s) => s.toLowerCase()), regex: regex.compiled, lineRegex: lineRegex.compiled, all, any, not } };
}

/** `not` の直下の gate だけ規則が違う：「肯定の matcher」ではなく「何らかの matcher」でよい（herdr の `validate_not_gate`）。 */
function compileNotGate(raw: RawGate, depth: number, c: Complexity): CompileResult {
  if (depth > MAX_GATE_DEPTH) return { ok: false, reason: `not gate exceeds max gate depth ${MAX_GATE_DEPTH}` };
  c.totalGates += 1;
  if (c.totalGates > MAX_TOTAL_GATES) return { ok: false, reason: `manifest exceeds max gate count ${MAX_TOTAL_GATES}` };
  const limitErr = checkMatcherLimits(raw, "not gate", c);
  if (limitErr) return { ok: false, reason: limitErr };
  if (!gateHasAnyMatcher(raw)) return { ok: false, reason: "not gate must contain a matcher" };

  const regex = compilePatterns(raw.regex, "not gate", "regex");
  if (!regex.ok) return regex;
  const lineRegex = compilePatterns(raw.line_regex, "not gate", "line_regex");
  if (!lineRegex.ok) return lineRegex;

  const all: CompiledGate[] = [];
  for (const nested of raw.all) {
    const r = compileGate(nested, "not all gate", depth + 1, c);
    if (!r.ok) return r;
    all.push(r.gate);
  }
  const any: CompiledGate[] = [];
  for (const nested of raw.any) {
    const r = compileGate(nested, "not any gate", depth + 1, c);
    if (!r.ok) return r;
    any.push(r.gate);
  }
  const not: CompiledGate[] = [];
  for (const nested of raw.not) {
    const r = compileNotGate(nested, depth + 1, c);
    if (!r.ok) return r;
    not.push(r.gate);
  }

  return { ok: true, gate: { contains: raw.contains.map((s) => s.toLowerCase()), regex: regex.compiled, lineRegex: lineRegex.compiled, all, any, not } };
}

function ruleAsGate(rule: RawRule): RawGate {
  return { all: rule.all, any: rule.any, not: rule.not, contains: rule.contains, regex: rule.regex, line_regex: rule.line_regex };
}

/** manifest 全体の検証つきコンパイル（herdr の `validate_manifest` + `compile_manifest`）。 */
function compileManifest(raw: RawManifest): { ok: true; rules: CompiledRule[] } | { ok: false; reason: string } {
  if (raw.rules.length === 0) return { ok: false, reason: "manifest must contain at least one rule" };
  if (raw.rules.length > MAX_RULES_PER_MANIFEST) return { ok: false, reason: `manifest contains ${raw.rules.length} rules, max is ${MAX_RULES_PER_MANIFEST}` };

  const complexity: Complexity = { totalGates: 0, totalMatchers: 0 };
  const rules: CompiledRule[] = [];
  for (const rule of raw.rules) {
    if (rule.id.trim() === "") return { ok: false, reason: "manifest rule id must not be empty" };
    if (rule.skip_state_update) {
      if (rule.state !== "unknown") return { ok: false, reason: `rule ${rule.id} uses skip_state_update without state = "unknown"` };
      if (rule.visible_idle || rule.visible_blocker || rule.visible_working) {
        return { ok: false, reason: `rule ${rule.id} uses skip_state_update with visible state evidence` };
      }
    }
    if (!isValidRegionName(rule.region)) return { ok: false, reason: `rule ${rule.id} uses invalid region: ${rule.region.trim()}` };
    if (rule.region.trim().startsWith("top_non_empty_lines(") && raw.min_engine_version !== undefined && raw.min_engine_version < TOP_NON_EMPTY_LINES_ENGINE_VERSION) {
      return { ok: false, reason: `rule ${rule.id} uses top_non_empty_lines but min_engine_version is below ${TOP_NON_EMPTY_LINES_ENGINE_VERSION}` };
    }
    const gate = compileGate(ruleAsGate(rule), "rule", 0, complexity);
    if (!gate.ok) return { ok: false, reason: `rule ${rule.id} has invalid matcher gates: ${gate.reason}` };
    rules.push({
      id: rule.id,
      state: rule.state ?? "unknown", // herdr の `unwrap_or(AgentState::Unknown)`（manifest.rs:495-497）。
      priority: rule.priority,
      region: rule.region,
      visibleIdle: rule.visible_idle,
      visibleBlocker: rule.visible_blocker,
      visibleWorking: rule.visible_working,
      skipStateUpdate: rule.skip_state_update,
      gate: gate.gate,
    });
  }
  return { ok: true, rules };
}

// --- 読み込み（`ManifestSource` 越し） --------------------------------------------------------

const INDEX_FILE = "index.toml";

export class DefaultManifestStore implements ManifestStore {
  private readonly manifests = new Map<string, CompiledManifest>();
  private readonly loadSummaries: ManifestLoadSummary[] = [];

  private constructor() {}

  static async load(source: ManifestSource, logger: Logger): Promise<DefaultManifestStore> {
    const store = new DefaultManifestStore();
    await store.loadAll(source, logger);
    return store;
  }

  get(kind: string): CompiledManifest | undefined {
    return this.manifests.get(kind);
  }

  summaries(): ManifestLoadSummary[] {
    return [...this.loadSummaries];
  }

  private async loadAll(source: ManifestSource, logger: Logger): Promise<void> {
    let indexEntries: { id: string; path: string }[];
    try {
      const indexRaw = await source.read(INDEX_FILE);
      indexEntries = IndexSchema.parse(parseToml(indexRaw)).agents;
    } catch (err) {
      // index.toml 自体が読めない・壊れていたら、判定ルールは1件も使えない（起動は続ける。design のエラー処理）。
      logger.error("failed to load agent-detection index.toml; agent detection is disabled", { error: String(err) });
      return;
    }

    for (const entry of indexEntries) {
      const summary = await this.loadOne(source, entry.id, entry.path);
      this.loadSummaries.push(summary);
      if (!summary.ok) logger.warn("agent manifest disabled", { kind: entry.id, path: entry.path, error: summary.error });
    }
  }

  private async loadOne(source: ManifestSource, kind: string, path: string): Promise<ManifestLoadSummary> {
    let rawText: string;
    try {
      rawText = await source.read(path);
    } catch (err) {
      return { kind, ok: false, ruleCount: 0, error: `could not read ${path}: ${err instanceof Error ? err.message : String(err)}` };
    }
    let parsed: RawManifest;
    try {
      parsed = RawManifestSchema.parse(parseToml(rawText));
    } catch (err) {
      return { kind, ok: false, ruleCount: 0, error: `could not parse ${path}: ${err instanceof Error ? err.message : String(err)}` };
    }
    const compiled = compileManifest(parsed);
    if (!compiled.ok) return { kind, ok: false, ruleCount: 0, error: compiled.reason };

    this.manifests.set(kind, { kind, minEngineVersion: parsed.min_engine_version ?? null, rules: compiled.rules });
    return { kind, ok: true, ruleCount: compiled.rules.length, error: null };
  }
}
