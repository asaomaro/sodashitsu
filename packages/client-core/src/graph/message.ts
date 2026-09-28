import type { ApprovalConfig } from "@sodashitsu/protocol";
import { RUN_TEXT_PREVIEW_CHARS } from "./defaults.js";

/**
 * 連携で送る文面の組み立て（20260927-agent-graph の design「GraphEngine」・「ドメイン固有の考慮」）。受け渡す画面の文章は、送る前に
 * 制御文字（ANSI のエスケープ・C0・C1・双方向の上書き）を落とす——先のエージェントの端末を操作する列を混ぜないため。
 */
export const OUTPUT_PLACEHOLDER = "{output}";

/* eslint-disable no-control-regex -- 制御文字を落とすための正規表現 */
// OSC（ESC ] … BEL|ST）・DCS/SOS/PM/APC（ESC P|X|^|_ … ST）・CSI（ESC [ …）・その他の 2 バイトの ESC 列。未終端の列は始まりの 2 文字（ESC ] 等）だけが落ちる。
const OSC_RE = /\u001B\][\s\S]*?(?:\u0007|\u001B\\)/g;
const STRING_SEQ_RE = /\u001B[PX^_][\s\S]*?\u001B\\/g;
const CSI_RE = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const ESC_RE = /\u001B[ -/]*[0-~]/g;
// 8 ビットの C1 の列: CSI（U+009B）は引数と終端の文字まで、OSC（U+009D）は BEL か ST（U+009C・ESC \）まで、DCS/SOS/PM/APC（U+0090・U+0098・U+009E・U+009F）は ST まで。
const C1_STRING_RE = /[\u0090\u0098\u009D\u009E\u009F][\s\S]*?(?:\u0007|\u009C|\u001B\\)/g;
const C1_CSI_RE = /\u009B[0-?]*[ -/]*[@-~]/g;
// C0（改行・タブを除く）・DEL・C1・双方向の上書き（U+202A-202E・U+2066-2069。受け渡す文章で先のエージェントの表示の並びを偽装させない。g05 点検）。
const CONTROL_RE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g;
/* eslint-enable no-control-regex */

/** 制御文字を落とす（改行・タブは残す。CRLF は LF に）。 */
export function stripControl(text: string): string {
  return text
    .replace(OSC_RE, "")
    .replace(STRING_SEQ_RE, "")
    .replace(C1_STRING_RE, "")
    .replace(C1_CSI_RE, "")
    .replace(CSI_RE, "")
    .replace(ESC_RE, "")
    .replace(/\r\n/g, "\n")
    .replace(CONTROL_RE, "");
}

/** 画面の末尾の行を 1 つの文章にする（制御文字を落とし、各行の右端の空白と前後の空行を除く）。 */
export function outputText(lines: readonly string[]): string {
  const cleaned = lines.map((l) => stripControl(l).replace(/[ \t]+$/, ""));
  let start = 0;
  let end = cleaned.length;
  while (start < end && cleaned[start] === "") start++;
  while (end > start && cleaned[end - 1] === "") end--;
  return cleaned.slice(start, end).join("\n");
}

/**
 * トリガで送る文面。`output` が null（受け渡さない）なら prompt の `{output}` は空に。`output` があれば `{output}` の位置（すべて）へ、
 * 無ければ末尾に空行を挟んで足す。
 */
export function buildTriggerText(prompt: string, output: string | null): string {
  if (prompt.includes(OUTPUT_PLACEHOLDER))
    return prompt.split(OUTPUT_PLACEHOLDER).join(output ?? "");
  if (output === null || output === "") return prompt;
  return prompt.trim() === "" ? output : `${prompt}\n\n${output}`;
}

/** 監督の知らせ・承認の代理の文面に出す、配下 1 つの情報。 */
export interface GraphPaneInfo {
  /** 呼び名（`paneNameOf` の結果。無ければ `pane <id>`）。 */
  name: string;
  paneId: string;
  /** エージェントの種類（claude・codex…）。検出されていなければ null。 */
  kind: string | null;
  /** 別のマシンの名前（手元なら null）。 */
  machine: string | null;
}

/**
 * 文面の 1 行の中に埋める名前（pane の呼び名は端末のタイトル〔pane の中のプログラムが OSC で決める〕から来うる）。制御文字・双方向の上書きを落とし、
 * 改行・タブは空白 1 つにする（名前で行を足して文面の指示を偽装させない。05 レビュー R1）。
 */
function inlineName(text: string): string {
  return stripControl(text).replace(/[\n\t]+/g, " ");
}

/** 名前を文面に埋められる形にした pane の情報。 */
function cleanInfo(p: GraphPaneInfo): GraphPaneInfo {
  return {
    ...p,
    name: inlineName(p.name),
    machine: p.machine === null ? null : inlineName(p.machine),
  };
}

function where(p: GraphPaneInfo): string {
  return p.machine === null ? "手元" : `マシン ${p.machine}`;
}

/** 監督役への知らせ（design「監督」）。 */
export function supervisorNotice(subordinates: readonly GraphPaneInfo[]): string {
  const list = subordinates
    .map(cleanInfo)
    .map((p) => `${p.name}（pane ${p.paneId}・${p.kind ?? "エージェント未検出"}・${where(p)}）`)
    .join(", ");
  const head =
    subordinates.length === 0
      ? "あなたは Sodashitsu の監督役でしたが、今は配下がいません。"
      : `あなたは Sodashitsu の監督役です。配下: ${list}。`;
  return (
    `${head}` +
    "`sodactl agent prompt|wait|read|send-keys <pane>`（別のマシンは `sodactl --machine <名前> …` と前に付ける）で指示・待機・読み取りができます。" +
    "詳しくは `sodactl skill`。"
  );
}

/** 承認の代理で監督役へ送る文面（design「承認の代理」）。`tail` は `outputText` を通した画面の末尾。 */
export function approvalNotice(raw: GraphPaneInfo, tail: string, config: ApprovalConfig): string {
  const sub = cleanInfo(raw);
  const machine = sub.machine === null ? "" : `--machine ${sub.machine} `;
  const head = `配下 ${sub.name}（${sub.paneId}${sub.machine === null ? "" : `・マシン ${sub.machine}`}）が承認待ちです。画面の末尾（${config.lines} 行）:\n\n${tail}\n\n`;
  return config.mode === "delegate"
    ? `${head}\`sodactl ${machine}agent send-keys ${sub.paneId} <キー>\` で答えてください。`
    : `${head}返答は利用者が行います（あなたは答えないでください）。`;
}

/** 履歴に残す文面の先頭（design「LinkRun.text」）。 */
export function runTextPreview(text: string): string {
  const chars = [...text];
  return chars.length <= RUN_TEXT_PREVIEW_CHARS
    ? text
    : `${chars.slice(0, RUN_TEXT_PREVIEW_CHARS).join("")}…`;
}
