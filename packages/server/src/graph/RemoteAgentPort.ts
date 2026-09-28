import type { AgentInfo, Pane, PaneId, ServerEvent, SessionSnapshot } from "@sodashitsu/protocol";
import { outputText, paneNameOf, stripControl } from "@sodashitsu/client-core";
import type { Disposable } from "../util/Disposable.js";
import { AgentPortError, type AgentPort, type AgentStatusEvent } from "./AgentPort.js";
import type { RemoteLink } from "./RemoteLinks.js";

/**
 * 別のマシンの pane への口（20260927-agent-graph の 04 T2・architecture「AgentPort」「別のマシン」）。`RemoteLink`（マシン 1 台への接続）の
 * snapshot とイベントから pane とエージェントを持ち、送信はリモートの `agent.prompt`、画面の末尾は `sodactl agent read` と同じく
 * `pane.subscribe` → SNAPSHOT → `pane.unsubscribe`（`packages/cli/src/commands/agent.ts` の `runAgentRead`）。
 *
 * - 使えるのは接続が hello を済ませている間だけ。切れている間の `status` は null（新しく作った線の基準を古い値にしない）、送信・末尾は
 *   `machine_unavailable` で断る。呼び名（`paneName`）は切れている間も最後の値を返す（履歴・知らせの文面）。
 * - 繋がった（繋ぎ直した）ときは、pane を snapshot で置き換えてから `onAvailability(true)` を知らせる。受け手（`GraphEngine`）はその時点の
 *   `status` を「基準」として読む（切れている間の完了で動かない。decisions D1-6）。
 * - 画面の末尾は行数の上限 `REMOTE_TAIL_MAX_LINES`、待つのは `REMOTE_TAIL_TIMEOUT_MS` まで（受け渡しのたびに購読するので重い。architecture の申し送り）。
 *   同じ pane の読み取りは 1 本ずつ（購読を重ねると、先の解除で後の購読が切れる）。
 */
export const REMOTE_TAIL_MAX_LINES = 500;
export const REMOTE_TAIL_TIMEOUT_MS = 5000;

const ALT_SCREEN_ENTER = "\u001B[?1049h";

/** SNAPSHOT（スクロールバック込み）の今の画面の末尾 `n` 行。代替画面なら代替画面の中身から（`sodactl agent read` の `currentScreen`・`lastLines`）。 */
export function tailOfSnapshot(raw: string, n: number): string {
  const i = raw.lastIndexOf(ALT_SCREEN_ENTER);
  const screen = i < 0 ? raw : raw.slice(i + ALT_SCREEN_ENTER.length);
  const lines = screen.split(/\r?\n/);
  while (lines.length > 0 && stripControl(lines[lines.length - 1]!).trim() === "") lines.pop();
  return outputText(lines.slice(-n));
}

export interface RemoteAgentPortOptions {
  /** マシンの呼び名（登録簿の label。名前は変えられるので毎回引く）。 */
  label(): string;
  tailTimeoutMs?: number;
}

export class RemoteAgentPort implements AgentPort {
  readonly machine: string;
  private panes = new Map<PaneId, Pane>();
  private readonly statusCbs = new Set<(e: AgentStatusEvent) => void>();
  private readonly availabilityCbs = new Set<(up: boolean) => void>();
  private readonly subs: Disposable[];
  /** pane ごとの読み取りの列（1 本ずつ）。 */
  private readonly tails = new Map<PaneId, Promise<unknown>>();

  constructor(
    private readonly link: RemoteLink,
    private readonly opts: RemoteAgentPortOptions,
  ) {
    this.machine = link.machine;
    this.subs = [
      link.onOpened((s, beforeReply) => this.onOpened(s, beforeReply)),
      link.onClosed(() => this.emitAvailability(false)),
      link.onEvent((e) => this.onEvent(e)),
    ];
  }

  dispose(): void {
    for (const s of this.subs) s.dispose();
    this.statusCbs.clear();
    this.availabilityCbs.clear();
  }

  available(): boolean {
    return this.link.available();
  }

  machineLabel(): string {
    return this.opts.label();
  }

  onStatus(cb: (e: AgentStatusEvent) => void): Disposable {
    this.statusCbs.add(cb);
    return { dispose: () => this.statusCbs.delete(cb) };
  }

  onAvailability(cb: (up: boolean) => void): Disposable {
    this.availabilityCbs.add(cb);
    return { dispose: () => this.availabilityCbs.delete(cb) };
  }

  status(paneId: PaneId): AgentInfo | null {
    if (!this.link.available()) return null;
    return this.panes.get(paneId)?.agent ?? null;
  }

  paneName(paneId: PaneId): string | null {
    const pane = this.panes.get(paneId);
    return pane === undefined ? null : paneNameOf(pane);
  }

  tail(paneId: PaneId, lines: number): Promise<string> {
    const n = Math.max(1, Math.min(REMOTE_TAIL_MAX_LINES, Math.floor(lines)));
    const before = this.tails.get(paneId) ?? Promise.resolve();
    // 次の読み取りは、前の読み取りの購読を外し終えてから（時間切れの購読へ遅れて届いた SNAPSHOT を次の読み取りに使わない。g04 点検）。
    const read = before.then(() => this.readTail(paneId, n));
    const run = read.then((r) => r.result);
    const tracked = read.then((r) => r.released).catch(() => undefined);
    this.tails.set(paneId, tracked);
    void tracked.then(() => {
      if (this.tails.get(paneId) === tracked) this.tails.delete(paneId);
    });
    return run;
  }

  async prompt(paneId: PaneId, text: string): Promise<void> {
    if (!this.link.available()) throw unavailable(this.machine);
    try {
      await this.link.request("agent.prompt", { paneId, text });
    } catch (err) {
      throw asPortError(err);
    }
  }

  /** 1 回の読み取り。`released` は購読を外し終えた（応答・切断・時間切れ）とき。 */
  private readTail(
    paneId: PaneId,
    n: number,
  ): { result: Promise<string>; released: Promise<void> } {
    if (!this.link.available())
      return { result: Promise.reject(unavailable(this.machine)), released: Promise.resolve() };
    const waitMs = this.opts.tailTimeoutMs ?? REMOTE_TAIL_TIMEOUT_MS;
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    const result = new Promise<string>((resolve, reject) => {
      let done = false;
      const subs: Disposable[] = [];
      const finish = (fn: () => void): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        for (const s of subs) s.dispose();
        // 購読は必ず外す。外し終えたら（応答・切断で失敗・最長 waitMs）次の読み取りへ。
        if (this.link.available()) {
          const t = setTimeout(release, waitMs);
          t.unref?.();
          this.link
            .request("pane.unsubscribe", { paneId })
            .catch(() => undefined)
            .finally(() => {
              clearTimeout(t);
              release();
            });
        } else release();
        fn();
      };
      const timer = setTimeout(
        () =>
          finish(() =>
            reject(
              new AgentPortError(
                "tail_timeout",
                `no screen from machine ${this.opts.label()} within ${this.opts.tailTimeoutMs ?? REMOTE_TAIL_TIMEOUT_MS} ms`,
              ),
            ),
          ),
        waitMs,
      );
      timer.unref?.();
      subs.push(
        this.link.onScreen((p, text) => {
          if (p === paneId) finish(() => resolve(tailOfSnapshot(text, n)));
        }),
        this.link.onClosed(() => finish(() => reject(unavailable(this.machine)))),
      );
      // SNAPSHOT は応答より先に届きうるので、待ち受けを置いてから購読する（`readPaneSnapshot` と同じ）。画面の高さ＋n 行あれば足りる。
      this.link
        .request("pane.subscribe", { paneId, scrollbackLines: n })
        .catch((err: unknown) => finish(() => reject(asPortError(err))));
    });
    return { result, released };
  }

  private onOpened(snapshot: SessionSnapshot, beforeReply: readonly ServerEvent[]): void {
    this.panes = new Map(snapshot.panes.map((p) => [p.id, p]));
    this.emitAvailability(true);
    // hello の応答より前のイベントは snapshot より古いか新しいか分からない（04 レビュー R1）。当てても古い値に戻らないものだけ当てる:
    // - pane.closed: snapshot にある pane が閉じた（pane の id は再利用されないので、snapshot にあるなら snapshot の後に閉じた）。
    // - pane.created: snapshot に無い pane（snapshot の後にできた。前に閉じたものは同じ応答の前の pane.closed で消える）。
    // - agent_status_changed: 同じエージェントで完了の回数が snapshot より多い（完了は増えるだけ。基準の後の完了として動く）。
    // 名前だけの pane.updated・回数の増えない状態の変化は見分けられないので当てない（次の知らせで追いつく。D7-14）。
    for (const e of beforeReply) {
      if (!this.link.available()) return;
      if (e.event === "pane.closed") {
        if (this.panes.has(e.data.paneId)) this.onEvent(e);
      } else if (e.event === "pane.created") {
        if (!this.panes.has(e.data.pane.id)) this.onEvent(e);
      } else if (e.event === "pane.agent_status_changed") {
        const now = this.panes.get(e.data.paneId)?.agent;
        const next = e.data.agent;
        if (
          now != null &&
          next !== null &&
          next.instanceId === now.instanceId &&
          next.completionSeq > now.completionSeq
        )
          this.onEvent(e);
      }
    }
  }

  private onEvent(e: ServerEvent): void {
    switch (e.event) {
      case "pane.created":
      case "pane.updated":
        this.panes.set(e.data.pane.id, e.data.pane);
        return;
      case "pane.agent_status_changed": {
        const pane = this.panes.get(e.data.paneId);
        if (pane !== undefined) this.panes.set(pane.id, { ...pane, agent: e.data.agent });
        this.emitStatus({ paneId: e.data.paneId, agent: e.data.agent });
        return;
      }
      case "pane.closed":
        this.panes.delete(e.data.paneId);
        this.emitStatus({ paneId: e.data.paneId, agent: null });
        return;
      default:
        return;
    }
  }

  private emitStatus(e: AgentStatusEvent): void {
    for (const cb of [...this.statusCbs]) cb(e);
  }

  private emitAvailability(up: boolean): void {
    for (const cb of [...this.availabilityCbs]) cb(up);
  }
}

function unavailable(machine: string): AgentPortError {
  return new AgentPortError("machine_unavailable", `machine ${machine} is not connected`);
}

/** リモートの方式の失敗（`code` つきの Error）を口の失敗へ。切れて応答が来なかったものは `connection_closed`。 */
function asPortError(err: unknown): AgentPortError {
  if (err instanceof AgentPortError) return err;
  const code = (err as { code?: unknown } | null)?.code;
  const message = err instanceof Error ? err.message : String(err);
  if (typeof code === "string") {
    // `Connection` は message を `${code}: ${message}` にする。元の文だけにする。
    const prefix = `${code}: `;
    return new AgentPortError(
      code,
      message.startsWith(prefix) ? message.slice(prefix.length) : message,
    );
  }
  if (message.startsWith("not connected"))
    return new AgentPortError("machine_unavailable", message);
  return new AgentPortError("connection_closed", message);
}
