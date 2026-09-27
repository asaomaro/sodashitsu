/**
 * 判定ルールの評価（純関数。architecture.md「agent/ManifestEngine」・design「判定ルールのエンジン」）。
 * herdr のソース（`da6bcd5`。Apache-2.0・D5）の `src/detect/manifest.rs` の `region()`・`compiled_gate_matches()`・
 * `evaluate_loaded_manifest()` を移植した（decisions.md D46 を正典とする）。
 */
import type { AgentState } from "@sodashitsu/protocol";
import type { CompiledGate, CompiledManifest, CompiledRule } from "./ManifestStore.js";
import { regionCount, topRegionCount } from "./ManifestStore.js";

/** pane の画面から取り出した、判定に使う材料（architecture.md「agent/ManifestEngine」）。
 *  `lines` は画面下部の行（`Mirror.bottomLines`。design の余白なしで十分な行数を渡す。T9 で決める）。 */
export interface DetectionSnapshot {
  lines: string[];
  oscTitle: string;
  oscProgress: string | null;
}

export interface EvaluatedDetection {
  state: AgentState;
  ruleId: string | null;
  /** D45/D46：一致したルール自身のフラグ×実際の状態が一致するときだけ true。 */
  visibleIdle: boolean;
  visibleBlocker: boolean;
  visibleWorking: boolean;
}

export type EvaluateResult = EvaluatedDetection | "skip";

/** 既知のエージェントでどのルールにも一致しなかったときの既定（herdr の `DEFAULT_KNOWN_AGENT_IDLE_FALLBACK`）。
 *  manifest が読み込めていない（未知の kind）場合の既定は unknown だが、それはこの関数の外side（呼び出し側）
 *  の責務（D46。`evaluate` は常に読み込めた manifest を渡される前提）。 */
const NO_MATCH_STATE: AgentState = "idle";

/**
 * ルールを toml に書かれた順に**全件**評価し、一致したものの中から `priority` が最大のものを採る
 * （同点は最初に出会った方を残す。design の「priorityの高い順に評価」は、この選び方の意味だった。D46）。
 */
export function evaluate(snapshot: DetectionSnapshot, manifest: CompiledManifest): EvaluateResult {
  let matched: CompiledRule | null = null;
  for (const rule of manifest.rules) {
    const regionText = extractRegion(snapshot, rule.region);
    if (!gateMatches(rule.gate, regionText)) continue;
    if (matched === null || matched.priority < rule.priority) matched = rule;
  }

  if (matched === null) {
    return { state: NO_MATCH_STATE, ruleId: null, visibleIdle: false, visibleBlocker: false, visibleWorking: false };
  }
  if (matched.skipStateUpdate) return "skip";
  return {
    state: matched.state,
    ruleId: matched.id,
    visibleIdle: matched.visibleIdle && matched.state === "idle",
    visibleBlocker: matched.visibleBlocker && matched.state === "blocked",
    visibleWorking: matched.visibleWorking && matched.state === "working",
  };
}

// --- gate の評価（herdr の `compiled_gate_matches`） -----------------------------------------

function gateMatches(gate: CompiledGate, text: string): boolean {
  return evalGate(gate, text, text.toLowerCase());
}

function evalGate(gate: CompiledGate, text: string, lowerText: string): boolean {
  if (!gate.contains.every((needle) => lowerText.includes(needle))) return false;
  if (!gate.regex.every((re) => re.test(text))) return false;
  if (gate.lineRegex.length > 0) {
    const lines = text.split("\n");
    if (!gate.lineRegex.every((re) => lines.some((line) => re.test(line)))) return false;
  }
  if (!gate.all.every((nested) => evalGate(nested, text, lowerText))) return false;
  if (gate.any.length > 0 && !gate.any.some((nested) => evalGate(nested, text, lowerText))) return false;
  if (gate.not.some((nested) => evalGate(nested, text, lowerText))) return false;
  return true;
}

// --- region の切り出し（herdr の `region()` とその先の各関数。D46） -----------------------------

function extractRegion(snapshot: DetectionSnapshot, spec: string): string {
  const trimmed = spec.trim();
  if (trimmed === "osc_title") return snapshot.oscTitle;
  if (trimmed === "osc_progress") return snapshot.oscProgress ?? "";

  const lines = snapshot.lines;
  switch (trimmed) {
    case "whole_recent":
      return lines.join("\n");
    case "after_last_prompt_marker":
      return afterLastPromptMarker(lines);
    case "before_current_prompt_marker":
      return beforeCurrentPromptMarker(lines);
    case "whole_recent_without_current_prompt_marker":
      return currentCodexPromptIndex(lines) !== null ? "" : lines.join("\n");
    case "current_prompt_block_marker":
      return currentPromptBlockMarker(lines) ?? "";
    case "after_current_prompt_block_marker":
      return afterCurrentPromptBlockMarker(lines) ?? "";
    case "prompt_box_body":
      return promptBoxBody(lines) ?? "";
    case "above_prompt_box":
      return abovePromptBox(lines);
    case "last_non_empty_above_prompt_box":
      return lastNonEmptyLine(abovePromptBox(lines));
    case "after_last_horizontal_rule":
      return afterLastHorizontalRule(lines);
    default: {
      const bottomN = regionCount(trimmed, "bottom_lines");
      if (bottomN !== null) return bottomLines(lines, bottomN);
      const bottomNonEmptyN = regionCount(trimmed, "bottom_non_empty_lines");
      if (bottomNonEmptyN !== null) return bottomNonEmptyLines(lines, bottomNonEmptyN);
      const topN = topRegionCount(trimmed);
      if (topN !== null) return topNonEmptyLines(lines, topN);
      return ""; // 未知の region 名（ManifestStore の検証を通っていれば起きない）。
    }
  }
}

// -- codex 専用（現在のプロンプト行＝`›`/`› ` で始まる最後の行のうち、後ろにブロックの印が無いもの） --

function isCodexPromptLine(line: string): boolean {
  return line === "›" || line.startsWith("› ");
}
function isCodexBlockMarkerLine(line: string): boolean {
  return line.startsWith("•") || line.startsWith("■") || line.startsWith("✗") || line.startsWith("✓");
}

function currentCodexPromptIndex(lines: string[]): number | null {
  let promptIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (isCodexPromptLine(lines[i]!)) {
      promptIndex = i;
      break;
    }
  }
  if (promptIndex === -1) return null;
  for (let i = promptIndex + 1; i < lines.length; i++) {
    if (isCodexBlockMarkerLine(lines[i]!)) return null;
  }
  return promptIndex;
}

function afterLastPromptMarker(lines: string[]): string {
  let index = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (isCodexPromptLine(lines[i]!)) {
      index = i;
      break;
    }
  }
  if (index === -1) return lines.join("\n");
  return lines.slice(index + 1).join("\n");
}

function beforeCurrentPromptMarker(lines: string[]): string {
  const index = currentCodexPromptIndex(lines);
  if (index === null) return lines.join("\n");
  return lines.slice(0, index).join("\n");
}

function currentPromptBlockMarker(lines: string[]): string | null {
  const promptIndex = currentCodexPromptIndex(lines);
  if (promptIndex === null) return null;
  for (let i = promptIndex - 1; i >= 0; i--) {
    if (isCodexBlockMarkerLine(lines[i]!)) return lines[i]!;
  }
  return null;
}

function afterCurrentPromptBlockMarker(lines: string[]): string | null {
  const promptIndex = currentCodexPromptIndex(lines);
  if (promptIndex === null) return null;
  let blockIndex = -1;
  for (let i = promptIndex - 1; i >= 0; i--) {
    if (isCodexBlockMarkerLine(lines[i]!)) {
      blockIndex = i;
      break;
    }
  }
  if (blockIndex === -1) return null;
  return lines.slice(blockIndex).join("\n");
}

// -- claude 専用（プロンプトの箱＝末尾から2本目の水平線が上端） ------------------------------------

function isHorizontalRule(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === "") return false;
  const chars = [...trimmed];
  let ruleChars = 0;
  for (const ch of chars) {
    if (ch !== "─") break;
    ruleChars++;
  }
  if (ruleChars === 0) return false;
  const suffix = chars.slice(ruleChars).join("").trimStart();
  return suffix === "" || ruleChars >= 3;
}

function promptBoxTopBorderIndex(lines: string[]): number | null {
  let borderCount = 0;
  for (let index = lines.length - 1; index >= 0; index--) {
    if (isHorizontalRule(lines[index]!)) {
      borderCount += 1;
      if (borderCount === 2) return index;
    }
  }
  return null;
}

function promptBoxBody(lines: string[]): string | null {
  const top = promptBoxTopBorderIndex(lines);
  if (top === null) return null;
  let endIndex = lines.length;
  for (let i = top + 1; i < lines.length; i++) {
    if (isHorizontalRule(lines[i]!)) {
      endIndex = i;
      break;
    }
  }
  return lines.slice(top + 1, endIndex).join("\n");
}

function abovePromptBox(lines: string[]): string {
  const top = promptBoxTopBorderIndex(lines);
  if (top === null) return lines.join("\n");
  return lines.slice(0, top).join("\n");
}

function afterLastHorizontalRule(lines: string[]): string {
  let lastRuleIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (isHorizontalRule(lines[i]!)) lastRuleIndex = i;
  }
  if (lastRuleIndex === -1) return lines.join("\n"); // herdr: 一致が無ければ content 全体
  return lines.slice(lastRuleIndex + 1).join("\n");
}

function lastNonEmptyLine(content: string): string {
  const lines = content.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i]!.trim() !== "") return lines[i]!;
  }
  return "";
}

// -- 件数指定の region ------------------------------------------------------------------------

function bottomLines(lines: string[], count: number): string {
  const start = Math.max(0, lines.length - count);
  return lines.slice(start).join("\n");
}

function bottomNonEmptyLines(lines: string[], count: number): string {
  const indices: number[] = [];
  for (let i = lines.length - 1; i >= 0 && indices.length < count; i--) {
    if (lines[i]!.trim() !== "") indices.push(i);
  }
  if (indices.length === 0) return "";
  const startIndex = indices[indices.length - 1]!; // 集めたうち最も古い（小さい）index
  return lines.slice(startIndex).join("\n");
}

function topNonEmptyLines(lines: string[], count: number): string {
  let endIndex = -1;
  let seen = 0;
  for (let i = 0; i < lines.length && seen < count; i++) {
    if (lines[i]!.trim() !== "") {
      endIndex = i;
      seen++;
    }
  }
  if (endIndex === -1) return "";
  return lines.slice(0, endIndex + 1).join("\n");
}
