import type { ServerEvent, Workspace, WorkspaceId } from "@sodashitsu/protocol";
import type { EventBus } from "../bus/EventBus.js";
import type { Disposable } from "../util/Disposable.js";
import type { GitJudgement } from "../session/SessionModel.js";
import type { FollowedLabel, SessionService } from "../session/SessionService.js";
import type { GitRunner } from "../infra/GitRunner.js";
import { parseAbsoluteGitPath } from "./worktree.js";

const DEFAULT_INTERVAL_MS = 5000;
const GIT_TIMEOUT_MS = 3000;

/** `w<番号>` の番号（作った順）。数字が無い id は末尾。 */
const idNumber = (id: string): number => Number(/\d+/.exec(id)?.[0] ?? Number.MAX_SAFE_INTEGER);

/**
 * 最初の pane が代わる・その場所が変わるイベント（20260926-workspace-label-follow-cwd の design D4）。これを受けたら、見直した場所と
 * いまの場所を比べ、違う workspace だけすぐ見直す。
 */
const FOLLOW_EVENTS: ReadonlySet<ServerEvent["event"]> = new Set(["pane.updated", "pane.closed", "layout.updated", "tab.closed", "workspace.updated"]);

/**
 * `probe` の結果（20261004-group-worktree-items の design D「判定は 3 つの結果」）。
 * - `git`: `repoKey` まで取れた。
 * - `unmanaged`: `rev-parse --abbrev-ref HEAD` の終了コードが 0 でない（git 管理外・コミットが 1 つも無い）と確定。
 * - `unknown`: 時間切れ・git の起動失敗、または HEAD は取れたが `--git-common-dir`・`--git-dir` が失敗した・絶対パス 1 行でなかった（半端な結果は信用しない）。
 */
export type ProbeResult = GitJudgement;

/**
 * workspace のいまの場所（最初の tab の最初の pane の場所）ごとに git 情報と自動の名前を取り、変化したら反映する（architecture.md「GitInfoPoller」。
 * 20260926-workspace-label-follow-cwd で開いた場所から、いまの場所へ）。
 */
export interface GitInfoPoller {
  start(): void;
  stop(): void;
  /** テスト・診断用に、間隔を待たず今すぐ 1 周する。 */
  pollNow(): Promise<void>;
  /**
   * 1つの workspace だけを対象に、間隔を待たず今すぐ probe する（20260925-workspace-git-immediate。
   * design「設計方針」）。`workspace.create` 直後に呼ばれる想定——`pollNow()`（全件）と違い、
   * 他の workspace を巻き込まない。対象が見つからなければ何もしない。
   */
  pollWorkspaceNow(workspaceId: WorkspaceId): Promise<void>;
}

export class DefaultGitInfoPoller implements GitInfoPoller {
  private timer: NodeJS.Timeout | null = null;
  private subscription: Disposable | null = null;
  /** workspace ごとに前回見直した場所（design D4）。 */
  private readonly polledCwd = new Map<WorkspaceId, string>();
  private readonly firstRoundListeners = new Set<() => void>();

  constructor(
    private readonly session: SessionService,
    private readonly git: GitRunner,
    private readonly intervalMs = DEFAULT_INTERVAL_MS,
    private readonly bus?: EventBus,
  ) {}

  start(): void {
    if (this.timer) return;
    this.subscription = this.bus?.subscribe((e) => {
      if (FOLLOW_EVENTS.has(e.event)) this.followMoves();
    }) ?? null;
    this.timer = setInterval(() => {
      this.pollNow().catch(() => undefined);
    }, this.intervalMs);
    this.timer.unref?.();
    // 1 周が失敗しても合図は出す（判定が取れなかった workspace は「取れない」として確定側が扱う）。
    void this.pollNow()
      .catch(() => undefined)
      .then(() => {
        for (const listener of [...this.firstRoundListeners]) {
          try {
            listener();
          } catch {
            // 受け手の失敗で他の受け手と 1 周を止めない
          }
        }
      });
  }

  /**
   * 起動後の最初の 1 周（`start()` が走らせる `pollNow()`）が終わった合図を受ける（T10 が移行の確定に使う。インターフェースには載せない）。
   * `start()` は引き継ぎの一時停止からの再開でも呼ばれるので、**合図は 2 回以上来うる**（受ける側が 1 回だけ扱う）。
   */
  onFirstRoundDone(listener: () => void): Disposable {
    this.firstRoundListeners.add(listener);
    return { dispose: () => void this.firstRoundListeners.delete(listener) };
  }

  /** 動いているか（`start()` の後で `stop()` の前）。一時停止中に届いた 1 周の合図を、受け手が見分けるために使う。 */
  isRunning(): boolean {
    return this.timer !== null;
  }

  stop(): void {
    this.subscription?.dispose();
    this.subscription = null;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async pollNow(): Promise<void> {
    const workspaces = this.session.snapshot().workspaces;
    const alive = new Set(workspaces.map((ws) => ws.id));
    for (const id of this.polledCwd.keys()) if (!alive.has(id)) this.polledCwd.delete(id); // バスを渡さないときの後始末
    // 判定は並べて走らせるが、反映は**作った順（`w<番号>` の小さい順）**に 1 つずつ行う。届いた順に反映すると、同じフォルダの workspace の代表
    // （最初に持ち始めたもの。D42）が判定の速さで決まってしまう（decisions D49）。
    const judged = await Promise.all(workspaces.map((ws) => this.judgeWorkspace(ws)));
    judged.sort((a, b) => idNumber(a.ws.id) - idNumber(b.ws.id));
    for (const j of judged) this.session.applyWorkspaceIdentity(j.ws.id, j.cwd, j.result, j.label);
  }

  async pollWorkspaceNow(workspaceId: WorkspaceId): Promise<void> {
    const ws = this.session.getWorkspace(workspaceId);
    if (!ws) return;
    await this.pollWorkspace(ws);
  }

  /** 見直した場所といまの場所が違う workspace だけ、すぐ見直す（同期でメモリだけを見る。design D4）。 */
  private followMoves(): void {
    for (const [id, polled] of this.polledCwd) {
      const cwd = this.session.identityCwdOf(id);
      if (cwd === undefined) this.polledCwd.delete(id);
      else if (cwd !== polled) void this.pollWorkspaceNow(id).catch(() => undefined);
    }
  }

  /** いまの場所で git と自動の名前を一緒に決め、同じ場所の結果としてまとめて入れる（design D2）。 */
  private async pollWorkspace(ws: Workspace): Promise<void> {
    const j = await this.judgeWorkspace(ws);
    this.session.applyWorkspaceIdentity(ws.id, j.cwd, j.result, j.label);
  }

  /** いまの場所で git と自動の名前を決める（反映はしない。`pollNow` は全部そろえてから作った順に反映する）。 */
  private async judgeWorkspace(ws: Workspace): Promise<{ ws: Workspace; cwd: string; result: ProbeResult; label: FollowedLabel | null }> {
    const cwd = this.session.identityCwdOf(ws.id) ?? ws.cwd;
    this.polledCwd.set(ws.id, cwd); // 待つ前に——同じ変化で見直しを重ねない
    const [result, label] = await Promise.all([this.probe(cwd), this.session.followedLabel(ws.id, cwd).catch(() => null)]);
    return { ws, cwd, result, label };
  }

  async probe(cwd: string): Promise<ProbeResult> {
    try {
      const branchResult = await this.git.run(cwd, ["rev-parse", "--abbrev-ref", "HEAD"], GIT_TIMEOUT_MS);
      if (branchResult.code !== 0) return { kind: "unmanaged" }; // git 管理外（またはコミットが 1 つも無い）。終了コードで確定する
      const branch = branchResult.stdout.trim() || null;

      let ahead = 0;
      let behind = 0;
      const countsResult = await this.git.run(cwd, ["rev-list", "--left-right", "--count", "@{u}...HEAD"], GIT_TIMEOUT_MS);
      if (countsResult.code === 0) {
        const [behindStr, aheadStr] = countsResult.stdout.trim().split(/\s+/);
        behind = Number(behindStr) || 0;
        ahead = Number(aheadStr) || 0;
      } // 上流ブランチが無ければそのまま 0/0（エラーにしない）

      // 判定キー（20260923-workspace-grouping）。
      // `--path-format=absolute` で git に絶対パスを作らせる（git 2.31 以上）。
      // 古い git は知らないオプションをそのまま出力して終了コード 0 を返す（`--path-format=absolute\n.git`）ので、終了コードに加えて出力を検査する（`parseAbsoluteGitPath`。decisions D44・D48）。1 行目がそのまま `--path-format=absolute` なら古い git とみなし、残りの行を cwd から解決して使う（main と同じ決め方）。それ以外の壊れた出力は「取れない」にする。
      // 新しい git では付けないと、symlink 経由の本体の cwd では相対の `.git` が返り、cwd のまま解決した `.../link/.git` が worktree の `.../real/.git` とずれる（decisions D9）。
      // HEAD が取れたのに `--git-common-dir` が失敗したら、半端な結果を作らず「取れない」に寄せる（直前の判定を保つため）。
      const commonResult = await this.git.run(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"], GIT_TIMEOUT_MS);
      if (commonResult.code !== 0) return { kind: "unknown" };
      const repoKey = parseAbsoluteGitPath(commonResult.stdout, cwd);
      if (repoKey === null) return { kind: "unknown" };
      const dirResult = await this.git.run(cwd, ["rev-parse", "--path-format=absolute", "--git-dir"], GIT_TIMEOUT_MS);
      if (dirResult.code !== 0) return { kind: "unknown" };
      const worktreeKey = parseAbsoluteGitPath(dirResult.stdout, cwd);
      if (worktreeKey === null) return { kind: "unknown" };
      // 本体は `--git-dir` と `--git-common-dir` が同じパスを指す。linked worktree は異なる
      // （`--git-dir` が `<common-dir>/worktrees/<name>` を指す標準的な Git の仕組み）。
      // `worktreeKey` は `--git-dir` の絶対パスそのもの（その worktree〔フォルダ〕を一意に示す。同じフォルダの workspace は同じ値。追補 01 A）。
      const isLinkedWorktree = worktreeKey !== repoKey;

      return { kind: "git", git: { branch, ahead, behind, repoKey, isLinkedWorktree, worktreeKey } };
    } catch {
      return { kind: "unknown" }; // 時間切れ・git が無い等
    }
  }
}
