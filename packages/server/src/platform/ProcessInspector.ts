/** 前面プロセスの情報（architecture.md「platform/ProcessInspector」）。 */
export interface ForegroundProcess {
  pid: number;
  exe: string;
  argv: string[];
  cwd: string | null;
  /** 親の pid（取れた環境だけ。Linux）。会話の参照の報告が、前面のエージェント自身のものかを確かめる（20261009-agent-session-attribution）。 */
  ppid?: number;
}

export interface DefaultShell {
  shell: string;
  args: string[];
}

/** シェルの前面プロセスグループの全メンバー（D45・D46。02-agent-detection の `ProcessMatcher` が使う）。
 *  `foreground()`（シェル自身が前面ならシェルの情報を1つだけ返す）とは別の、複数プロセスをまとめて返す口。 */
export interface ForegroundJob {
  /** Linux: 前面プロセスグループの pgid。Windows: 起点にしたシェルの pid（プロセスグループの概念が無いため）。 */
  processGroupId: number;
  processes: ForegroundProcess[];
}

export interface ProcessInspector {
  /** シェル自身が前面ならシェルの情報を返す。取得できなければ null（design.md「前面プロセスの特定」）。 */
  foreground(shellPid: number): Promise<ForegroundProcess | null>;
  /** 前面プロセスグループの全メンバー（D45）。npm/node のラッパーや Windows の cmd/powershell 越しの
   *  起動でも、実際のエージェントのプロセスを見つけられるようにする。取得できなければ null。 */
  foregroundJob(shellPid: number): Promise<ForegroundJob | null>;
  /** 前面プロセスがシェル以外か（design「busy」）。 */
  isBusy(shellPid: number, fg: ForegroundProcess | null): boolean;
  defaultShell(): DefaultShell;
}

/** Unix・Windows で共通の busy 判定（前面プロセスがシェル自身でなければ busy）。 */
export function isBusyFromForeground(shellPid: number, fg: ForegroundProcess | null): boolean {
  return fg !== null && fg.pid !== shellPid;
}
