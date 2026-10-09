import type { ForegroundJob } from "../platform/ProcessInspector.js";
import { pastePayload } from "./agentInput.js";

/**
 * `agent start` の検査と打ち込む文字列の組み立て（20260926-agent-start design「server `src/agent/agentStart.ts`」）。
 * 対応するのは単一引用符の中を一切解釈しない POSIX 系のシェルだけ（decisions.md D1）。
 */

/** 打ち込む 1 行（クォート後）の上限。端末の行編集の 1 行の上限（4095 バイト）で切り詰められないようにする（D5）。 */
export const MAX_START_LINE_BYTES = 4000;

/**
 * 最初に別の書き込みで送る Ctrl-C。継続行（PS2。引用符が開いたまま）の入力を捨てさせる（decisions.md D9）。
 * 同じ書き込みで続けると SIGINT の処理と行の読み取りが競るので、`START_INTERRUPT_DELAY_MS` 空けてから行を送る。
 */
export const INTERRUPT = "\u0003";
export const START_INTERRUPT_DELAY_MS = 200;

/** 打ちかけの消去：Ctrl-E（行末へ）・Ctrl-U（行の消去）。行編集の無いシェルでは端末の VKILL が行ごと消す（D5）。 */
export const LINE_CLEAR = "\u0005\u0015";

export const POSIX_START_SHELLS: ReadonlySet<string> = new Set([
  "sh",
  "bash",
  "dash",
  "zsh",
  "ksh",
  "mksh",
]);
/** herdr の `is_pane_shell_process_name` のうち、クォートの規則が POSIX と違うシェル。 */
export const OTHER_SHELLS: ReadonlySet<string> = new Set([
  "fish",
  "csh",
  "tcsh",
  "elvish",
  "xonsh",
  "nu",
  "pwsh",
  "powershell",
  "cmd",
]);

// eslint-disable-next-line no-control-regex -- 制御文字を見つけるための正規表現
const CONTROL_CHAR = /[\u0000-\u001f\u007f-\u009f]/;

export function hasControlChar(s: string): boolean {
  return CONTROL_CHAR.test(s);
}

/** 単一引用符で包む（中の `'` は `'\''`）。単一引用符の中はどの POSIX シェルも一切解釈しない。 */
export function quotePosixArg(s: string): string {
  return `'${s.replaceAll("'", "'\\''")}'`;
}

/** 前面のプロセス名（argv[0] 由来）→ シェル名。パス・login シェルの先頭の `-`・`.exe` を落として小文字にする。 */
export function shellNameOf(exe: string): string {
  const base = exe.slice(Math.max(exe.lastIndexOf("/"), exe.lastIndexOf("\\")) + 1);
  return base
    .replace(/^-+/, "")
    .replace(/\.exe$/i, "")
    .toLowerCase();
}

export type ShellCheck =
  { kind: "available"; shell: string } | { kind: "busy" } | { kind: "unsupported"; shell: string };

/** 前面プロセスグループがシェル自身だけか（herdr の `available_pane_shell_from_job`）。確かめられなければ busy。 */
export function checkShell(job: ForegroundJob | null, shellPid: number): ShellCheck {
  if (job === null || job.processGroupId !== shellPid) return { kind: "busy" };
  if (job.processes.some((p) => p.pid !== shellPid)) return { kind: "busy" };
  const shell = job.processes.find((p) => p.pid === shellPid);
  if (shell === undefined) return { kind: "busy" };
  const name = shellNameOf(shell.exe);
  if (POSIX_START_SHELLS.has(name)) return { kind: "available", shell: name };
  if (OTHER_SHELLS.has(name)) return { kind: "unsupported", shell: name };
  return { kind: "busy" };
}

/** 実行ファイル名（固定表の値。英小文字・数字・`-` だけ）は裸で、引数は全部包む。 */
export function buildStartLine(executable: string, args: readonly string[]): string {
  return [executable, ...args.map(quotePosixArg)].join(" ");
}

/** 書き込みの部分（`START_INTERRUPT_DELAY_MS` ずつ空けて順に書く）。 */
export function startInput(line: string, bracketedPaste: boolean, skipInterrupt = false): string[] {
  const body = `${LINE_CLEAR}${pastePayload(line, bracketedPaste)}\r`;
  // 作ったばかりの pane（fork。打ちかけが無い）は、先頭の Ctrl-C を送らない: シェルが入力を受けられる前だと、Ctrl-C が打鍵ごと捨てることがある（20261009-agent-fork の A2）。
  return skipInterrupt ? [body] : [INTERRUPT, body];
}
