import type { ApprovalConfig, Graph, TriggerConfig } from "@sodashitsu/protocol";

/** 既定値（20260927-agent-graph の architecture「client-core/graph」・decisions D1・D2）。 */
export const LINK_LIMIT_DEFAULT = 10;
export const OUTPUT_LINES_DEFAULT = 80;
/** 承認の代理で監督役へ渡す画面の末尾の行数（承認の問いかけは画面の下の数十行に収まる）。 */
export const APPROVAL_LINES_DEFAULT = 40;
/** 先が作業中のときに手が空くのを待つ最長の時間（D1-1）。 */
export const BUSY_WAIT_MAX_MS = 30 * 60 * 1000;
/** 承認待ちとみなすまで blocked が続く時間（D1-2）。 */
export const BLOCKED_HOLD_MS = 1000;
/** 監督役への知らせをまとめる待ち（D1-5）。 */
export const SUPERVISOR_DEBOUNCE_MS = 2000;
/**
 * 受け渡す画面の末尾（トリガの `{output}`・承認の代理の画面の末尾）の 1 か所あたりのバイト数（UTF-8）の上限。超えたら先頭を切って末尾を残す
 * （統合レビュー R1。500 行の長い行で `agent.prompt` の上限〔1MB〕を超えて毎回失敗しないため）。
 */
export const OUTPUT_MAX_BYTES = 256 * 1024;
/** 送った文面を履歴に残す長さ（文字数）。 */
export const RUN_TEXT_PREVIEW_CHARS = 200;

export const DEFAULT_TRIGGER_PROMPT = "次の結果を確認して、続きの作業をしてください。\n\n{output}";

export function defaultTriggerConfig(): TriggerConfig {
  return {
    on: "done",
    prompt: DEFAULT_TRIGGER_PROMPT,
    output: { lines: OUTPUT_LINES_DEFAULT },
    whenBusy: "wait",
  };
}

/** 既定は知らせるだけ（decisions D2。線を引いただけで承認が自動にならない）。 */
export function defaultApprovalConfig(): ApprovalConfig {
  return { mode: "notify", lines: APPROVAL_LINES_DEFAULT };
}

export function emptyGraph(): Graph {
  return { rev: 0, paused: false, nodes: [], links: [] };
}
