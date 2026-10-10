import { readFile, readdir, readlink } from "node:fs/promises";
import type { DefaultShell, ForegroundJob, ForegroundProcess, ProcessInspector } from "./ProcessInspector.js";
import { isBusyFromForeground } from "./ProcessInspector.js";

/**
 * Linux の前面プロセス検出（research.md F8.10・design.md E6）。
 * `/proc/<shellPid>/stat` の tpgid（proc_pid_stat(5) の 8 番目のフィールド）から前面プロセスグループを求め、
 * `/proc/<tpgid>/cmdline`・`/proc/<tpgid>/cwd` を読む。
 */
export class LinuxProcessInspector implements ProcessInspector {
  async foreground(shellPid: number): Promise<ForegroundProcess | null> {
    const tpgid = await readTpgid(shellPid);
    if (tpgid === null) return null;
    return readProcessInfo(tpgid);
  }

  /**
   * herdr は前面プロセスグループの全メンバーを、シェルの子孫とグループリーダーの子孫の両方を起点にした
   * `/proc/<pid>/task/<tid>/children` の探索で集める（D46）。**その仕組みは WSL2 のカーネルには無い**
   * （このセッションの環境で実測：`/proc/self/task/<pid>/children` が ENOENT で存在しない。
   * WSL2 は必須の対象 OS なので、この方式には頼れない）。
   * 代わりに `/proc` 全体を走査し、`pgrp` が一致するプロセスを集める（D46 の簡略化の決定）。
   */
  async foregroundJob(shellPid: number): Promise<ForegroundJob | null> {
    const tpgid = await readTpgid(shellPid);
    if (tpgid === null) return null;
    const members = await scanProcessGroupMembers(tpgid);
    if (members.length === 0) return null;
    const processes = (await Promise.all(members.map((m) => buildForegroundProcess(m.pid, m.comm, m.ppid)))).sort((a, b) => a.pid - b.pid);
    return { processGroupId: tpgid, processes };
  }

  isBusy(shellPid: number, fg: ForegroundProcess | null): boolean {
    return isBusyFromForeground(shellPid, fg);
  }

  defaultShell(): DefaultShell {
    return { shell: process.env["SHELL"] || "/bin/sh", args: [] };
  }
}

/** `/proc/<pid>/stat` を読み、tpgid（フィールド 8）を返す。comm はカッコと空白を含みうるので、最後の ')' を基準に切る。 */
async function readTpgid(pid: number): Promise<number | null> {
  try {
    const raw = await readFile(`/proc/${pid}/stat`, "utf8");
    const closeParen = raw.lastIndexOf(")");
    if (closeParen === -1) return null;
    // ")" の後ろ: state(1) ppid(2) pgrp(3) session(4) tty_nr(5) tpgid(6) …（この配列でのインデックス）
    const rest = raw.slice(closeParen + 2).trim().split(/\s+/);
    const tpgidStr = rest[5];
    if (tpgidStr === undefined) return null;
    const tpgid = Number(tpgidStr);
    return Number.isFinite(tpgid) && tpgid > 0 ? tpgid : null;
  } catch {
    return null;
  }
}

async function readProcessInfo(pid: number): Promise<ForegroundProcess | null> {
  try {
    const cmdlineRaw = await readFile(`/proc/${pid}/cmdline`, "utf8");
    // cmdline は NUL 区切り。末尾の空要素を落とす。
    const argv = cmdlineRaw.split("\0").filter((s) => s.length > 0);
    const exe = argv[0] ?? (await readlink(`/proc/${pid}/exe`).catch(() => null)) ?? "";
    const cwd = await readlink(`/proc/${pid}/cwd`).catch(() => null);
    return { pid, exe, argv, cwd };
  } catch {
    return null;
  }
}

/** `/proc/<pid>/stat` の comm（フィールド1）と pgrp（")" の後ろの3番目）を読む。読めなければ null。 */
async function readCommAndPgrp(pid: number): Promise<{ comm: string; pgrp: number; ppid: number } | null> {
  try {
    const raw = await readFile(`/proc/${pid}/stat`, "utf8");
    const openParen = raw.indexOf("(");
    const closeParen = raw.lastIndexOf(")");
    if (openParen === -1 || closeParen === -1) return null;
    const comm = raw.slice(openParen + 1, closeParen);
    // ")" の後ろ: state(0) ppid(1) pgrp(2) …
    const rest = raw.slice(closeParen + 2).trim().split(/\s+/);
    const pgrpStr = rest[2];
    if (pgrpStr === undefined) return null;
    const pgrp = Number(pgrpStr);
    const ppid = Number(rest[1]);
    return Number.isFinite(pgrp) ? { comm, pgrp, ppid: Number.isFinite(ppid) ? ppid : 0 } : null;
  } catch {
    return null;
  }
}

/** `/proc` 全体を走査し、`pgrp` が `processGroupId` と一致するプロセスを集める（LinuxProcessInspector 参照）。 */
async function scanProcessGroupMembers(processGroupId: number): Promise<{ pid: number; comm: string; ppid: number }[]> {
  let entries: string[];
  try {
    entries = await readdir("/proc");
  } catch {
    return [];
  }
  const results = await Promise.all(
    entries
      .filter((name) => /^[0-9]+$/.test(name))
      .map(async (name) => {
        const pid = Number(name);
        const info = await readCommAndPgrp(pid);
        return info && info.pgrp === processGroupId ? { pid, comm: info.comm, ppid: info.ppid } : null;
      }),
  );
  return results.filter((r): r is { pid: number; comm: string; ppid: number } => r !== null);
}

async function buildForegroundProcess(pid: number, comm: string, ppid: number): Promise<ForegroundProcess> {
  let argv: string[] = [];
  try {
    const cmdlineRaw = await readFile(`/proc/${pid}/cmdline`, "utf8");
    argv = cmdlineRaw.split("\0").filter((s) => s.length > 0);
  } catch {
    // 既に終了した・読めない。argv は空のままにする（comm だけで識別する）。
  }
  const exe = argv[0] ?? comm;
  const cwd = await readlink(`/proc/${pid}/cwd`).catch(() => null);
  return { pid, exe, argv, cwd, ppid };
}
