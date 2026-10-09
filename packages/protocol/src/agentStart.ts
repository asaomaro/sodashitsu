/**
 * `agent start` の kind の表と timeout の範囲（20260926-agent-start）。herdr の `interactive_agent_executable`
 * （`src/detect/mod.rs`）・`AGENT_START_SETTLE_DELAY`／`MAX_AGENT_START_TIMEOUT`（`src/app/agents.rs`）に合わせる。
 * 表に無い kind は受け付けない（任意のコマンド行を打ち込む入力を作らない）。`omp`・`mastracode` は本製品が検出できないので含めない。
 */

export const AGENT_START_EXECUTABLES: Readonly<Record<string, string>> = Object.freeze({
  pi: "pi",
  claude: "claude",
  codex: "codex",
  gemini: "gemini",
  cursor: "cursor-agent",
  devin: "devin",
  agy: "agy",
  cline: "cline",
  opencode: "opencode",
  copilot: "copilot",
  kimi: "kimi",
  kiro: "kiro-cli",
  droid: "droid",
  amp: "amp",
  grok: "grok",
  hermes: "hermes",
  kilo: "kilo",
  qodercli: "qodercli",
  qwen: "qwen",
  letta: "letta",
  maki: "maki",
  muse: "muse",
});

/**
 * 表示の名前（グラフのフォームの選択肢。`agent.kinds`）。無い種類は、種類の id をそのまま出す。**実行ファイルの名前は含めない**（表示だけ）。
 */
export const AGENT_START_LABELS: Readonly<Record<string, string>> = Object.freeze({
  claude: "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  cursor: "Cursor Agent",
  copilot: "GitHub Copilot CLI",
  opencode: "opencode",
  droid: "Droid",
  qwen: "Qwen Code",
});

export function agentStartLabel(kind: string): string {
  return Object.hasOwn(AGENT_START_LABELS, kind) ? AGENT_START_LABELS[kind]! : kind;
}

export const AGENT_START_KINDS: readonly string[] = Object.freeze(
  Object.keys(AGENT_START_EXECUTABLES),
);

/** kind → 実行ファイル名。表に無ければ null（`__proto__` 等の継承したキーも null）。 */
export function agentStartExecutable(kind: string): string | null {
  return Object.hasOwn(AGENT_START_EXECUTABLES, kind) ? AGENT_START_EXECUTABLES[kind]! : null;
}

export const AGENT_START_DEFAULT_TIMEOUT_MS = 30_000;
/** timeout はこれより大きくなければならない（この値そのものは不可）。 */
export const AGENT_START_SETTLE_MS = 3_000;
export const AGENT_START_MAX_TIMEOUT_MS = 300_000;

export function isValidAgentStartTimeout(ms: number): boolean {
  return Number.isInteger(ms) && ms > AGENT_START_SETTLE_MS && ms <= AGENT_START_MAX_TIMEOUT_MS;
}

export const INVALID_AGENT_TIMEOUT_MESSAGE = `agent start timeout must be greater than ${AGENT_START_SETTLE_MS}ms and at most ${AGENT_START_MAX_TIMEOUT_MS}ms`;
