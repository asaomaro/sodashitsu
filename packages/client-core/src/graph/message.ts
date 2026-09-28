import { MAX_AGENT_PROMPT_BYTES, type ApprovalConfig } from "@sodashitsu/protocol";
import { OUTPUT_MAX_BYTES, RUN_TEXT_PREVIEW_CHARS } from "./defaults.js";

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

const encoder = new TextEncoder();
function utf8Bytes(s: string): number {
  return encoder.encode(s).byteLength;
}

/** 切ったときに先頭に置く印（`{n}` は省いたバイト数）。 */
function omittedMark(omitted: number): string {
  return `（画面の末尾が長いので、先頭の ${omitted} バイトを省きました）\n`;
}

/**
 * 受け渡す文章を `maxBytes`（UTF-8）以下にする。超えたら先頭を切って末尾を残し、切ったことを先頭の印で示す（印も `maxBytes` に含む）。
 * 文字の途中では切らず、残す部分に改行があればその次の行から始める（行の途中から始めない）。
 */
export function limitOutput(text: string, maxBytes: number = OUTPUT_MAX_BYTES): string {
  const bytes = encoder.encode(text);
  if (bytes.byteLength <= maxBytes) return text;
  // 印の長さは省く数の桁で変わるので、最大の桁（全体のバイト数）で見積もる。
  const room = Math.max(0, maxBytes - utf8Bytes(omittedMark(bytes.byteLength)));
  let start = bytes.byteLength - room;
  // UTF-8 の続きのバイト（10xxxxxx）から始めない。
  while (start < bytes.byteLength && (bytes[start]! & 0xc0) === 0x80) start++;
  const nl = bytes.indexOf(0x0a, start);
  if (nl !== -1 && nl + 1 < bytes.byteLength) start = nl + 1;
  const kept = new TextDecoder().decode(bytes.subarray(start));
  return omittedMark(start) + kept;
}

/**
 * トリガで送る文面。`output` が null（受け渡さない）なら prompt の `{output}` は空に。`output` があれば `{output}` の位置（すべて）へ、
 * 無ければ末尾に空行を挟んで足す。受け渡す文章は 1 か所あたり `OUTPUT_MAX_BYTES` まで、かつ差し込むすべてと文面を合わせて
 * `agent.prompt` の上限（`MAX_AGENT_PROMPT_BYTES`）を超えないよう、差し込む数で割った長さまでに末尾を優先して切る（統合レビュー R1）。
 */
export function buildTriggerText(prompt: string, output: string | null): string {
  const parts = prompt.split(OUTPUT_PLACEHOLDER);
  const slots = parts.length - 1;
  if (slots > 0) {
    if (output === null || output === "") return parts.join("");
    const fixed = utf8Bytes(parts.join(""));
    return parts.join(limitOutput(output, perSlotBytes(fixed, slots)));
  }
  if (output === null || output === "") return prompt;
  if (prompt.trim() === "") return limitOutput(output, perSlotBytes(0, 1));
  return `${prompt}\n\n${limitOutput(output, perSlotBytes(utf8Bytes(prompt) + 2, 1))}`;
}

/** 差し込み 1 か所に使えるバイト数（文面の残りを差し込みの数で割る。`OUTPUT_MAX_BYTES` まで）。 */
function perSlotBytes(fixedBytes: number, slots: number): number {
  return Math.max(
    0,
    Math.min(OUTPUT_MAX_BYTES, Math.floor((MAX_AGENT_PROMPT_BYTES - fixedBytes) / slots)),
  );
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

/** シェルでそのまま 1 語になる文字（英数字・日本語などの文字と数字・`._-@%+=:,/`）。 */
const SHELL_SAFE_RE = /^[\p{L}\p{N}._\-@%+=:,/]+$/u;

/**
 * `sodactl --machine <名前>` に写せる形のマシンの名前（統合レビュー R1）。安全な文字だけならそのまま、空白・引用符・シェルの記号を含むなら
 * POSIX の単一引用符で囲む（中の `'` は `'\''`）。監督役のエージェントが文面のコマンドをそのまま実行しても名前が 1 語として渡る。
 */
export function shellWord(text: string): string {
  if (SHELL_SAFE_RE.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function where(p: GraphPaneInfo): string {
  // 表示も --machine に写せる形（引用した名前）にそろえる。
  return p.machine === null ? "手元" : `マシン ${shellWord(p.machine)}`;
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
  // 画面の末尾は受け渡しと同じ上限で切る（残りの文面は短い。文面全体が agent.prompt の上限を超えない）。
  tail = limitOutput(tail);
  const machine = sub.machine === null ? "" : `--machine ${shellWord(sub.machine)} `;
  const head = `配下 ${sub.name}（${sub.paneId}${sub.machine === null ? "" : `・${where(sub)}`}）が承認待ちです。画面の末尾（${config.lines} 行）:\n\n${tail}\n\n`;
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
