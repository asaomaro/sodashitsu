/**
 * エージェントの id（`ManifestStore`/`third_party/herdr/agent-detection/index.toml` の `id` と同じ。herdr に無い本製品独自のもの〔Bob Shell〕は
 * `packages/server/assets/agent-detection/index.toml`）と、
 * 実行ファイル名からの別名表（herdr の `da6bcd5:src/detect/mod.rs` の `lookup_agent`・`agent_label` を移植。
 * Apache-2.0・D5・D46）。
 *
 * herdr の `Agent::Omp`・`Agent::Mastracode` は画面マニフェストを持たない（`SCREEN_MANIFEST_AGENTS` に
 * 含まれない。D46）ので、ここには含めない——本製品の `third_party/herdr/agent-detection/` にも
 * 対応する toml が無い。
 */

export interface AgentDescriptor {
  /** `ManifestStore.get(kind)` のキー・`AgentInfo.kind`（design.md）と同じ。 */
  kind: string;
  /** サイドバー表示用の短い名前（design には表記の指定が無いので、実行ファイル名を元に決めた。03-web-desktop で調整可）。 */
  label: string;
  /** design「MVP で検証済み（Claude Code・Codex）」。 */
  verified: boolean;
}

export const AGENTS: readonly AgentDescriptor[] = [
  { kind: "pi", label: "Pi", verified: false },
  { kind: "claude", label: "Claude Code", verified: true },
  { kind: "codex", label: "Codex", verified: true },
  { kind: "gemini", label: "Gemini CLI", verified: false },
  { kind: "cursor", label: "Cursor Agent", verified: false },
  { kind: "devin", label: "Devin CLI", verified: false },
  { kind: "agy", label: "Antigravity CLI", verified: false },
  { kind: "cline", label: "Cline", verified: false },
  { kind: "opencode", label: "OpenCode", verified: false },
  { kind: "copilot", label: "GitHub Copilot CLI", verified: false },
  { kind: "kimi", label: "Kimi Code CLI", verified: false },
  { kind: "kiro", label: "Kiro CLI", verified: false },
  { kind: "droid", label: "Droid", verified: false },
  { kind: "amp", label: "Amp", verified: false },
  { kind: "grok", label: "Grok CLI", verified: false },
  { kind: "hermes", label: "Hermes Agent", verified: false },
  { kind: "kilo", label: "Kilo Code CLI", verified: false },
  { kind: "qodercli", label: "Qoder CLI", verified: false },
  { kind: "qwen", label: "Qwen Code", verified: false },
  { kind: "letta", label: "Letta Code", verified: false },
  { kind: "maki", label: "Maki", verified: false },
  { kind: "muse", label: "Muse", verified: false },
  // 本製品独自（herdr に無い。判定ルールは `packages/server/assets/agent-detection/bob.toml`）。20261016-bob-shell。
  // verified は design の「MVP で検証済み」（Claude Code・Codex）だけの印なので、実機で確かめた Bob も false のまま（docs/bob-shell.md）。
  { kind: "bob", label: "Bob Shell", verified: false },
] as const;

const BY_KIND = new Map(AGENTS.map((a) => [a.kind, a]));

export function agentDescriptor(kind: string): AgentDescriptor | undefined {
  return BY_KIND.get(kind);
}

/** 実行ファイル名の basename（拡張子を除く前）→ kind。herdr の `lookup_agent`。 */
const ALIASES: Record<string, string> = {
  pi: "pi",
  claude: "claude",
  "claude-code": "claude",
  codex: "codex",
  gemini: "gemini",
  cursor: "cursor",
  "cursor-agent": "cursor",
  devin: "devin",
  "devin-cli": "devin",
  "devin cli": "devin",
  agy: "agy",
  antigravity: "agy",
  "antigravity-cli": "agy",
  cline: "cline",
  ".cline": "cline",
  opencode: "opencode",
  opencode2: "opencode",
  "open-code": "opencode",
  copilot: "copilot",
  "github-copilot": "copilot",
  ghcs: "copilot",
  kimi: "kimi",
  "kimi-code": "kimi",
  "kimi code": "kimi",
  kiro: "kiro",
  "kiro-cli": "kiro",
  droid: "droid",
  amp: "amp",
  "amp-local": "amp",
  grok: "grok",
  "grok-build": "grok",
  hermes: "hermes",
  "hermes-agent": "hermes",
  kilo: "kilo",
  "kilo-code": "kilo",
  "kilo code": "kilo",
  qodercli: "qodercli",
  qoderclicn: "qodercli",
  qoder: "qodercli",
  qodercn: "qodercli",
  qwen: "qwen",
  "qwen-code": "qwen",
  "qwen code": "qwen",
  letta: "letta",
  "letta-code": "letta",
  "letta code": "letta",
  maki: "maki",
  muse: "muse",
  "muse-code": "muse",
  "muse-cli": "muse",
  // IBM Bob Shell（npm の `bobshell`。`node <...>/bin/bob` で動く。Windows は `bob.cmd`）。
  bob: "bob",
  "bob-shell": "bob",
  bobshell: "bob",
};

/**
 * Muse のインストーラは `muse-bin-<version>`（例 `muse-bin-0.1.0-R708.1`）を実行する（実際の起動プロセスは
 * `muse`/`muse-bin` という名前を名乗らない）。basename だけを見る（herdr の `is_muse_versioned_binary`）。
 */
function isMuseVersionedBinary(basename: string): boolean {
  const rest = pathBasename(basename).match(/^muse-bin-(.*)$/)?.[1];
  return rest !== undefined && /^[0-9]/.test(rest);
}

/** herdr の `path_basename`：区切り文字で分けた最後の**非空**要素。末尾が区切り文字（`"foo/bar/"`）でも
 *  正しく `"bar"` を返す（review 指摘。nit。全要素が空なら元の文字列をそのまま返す）。 */
export function pathBasename(path: string): string {
  const components = path.split(/[/\\]/);
  for (let i = components.length - 1; i >= 0; i--) {
    if (components[i] !== "") return components[i]!;
  }
  return path;
}

/** 拡張子（.exe/.cmd/.bat/.ps1/.js）を1つだけ落とし、小文字化する（herdr の `normalized_agent_lookup_name`）。 */
export function normalizedAgentLookupName(name: string): string {
  let n = name.trim().toLowerCase();
  for (const suffix of [".exe", ".cmd", ".bat", ".ps1", ".js"]) {
    if (n.endsWith(suffix)) {
      n = n.slice(0, -suffix.length);
      break;
    }
  }
  return n;
}

/** 実行ファイル名（フルパスでも basename でもよい）→ kind。見つからなければ null。 */
export function lookupAgentKind(name: string): string | null {
  const base = normalizedAgentLookupName(pathBasename(name));
  const kind = ALIASES[base];
  if (kind !== undefined) return kind;
  if (isMuseVersionedBinary(base)) return "muse";
  return null;
}
