import {
  GRAPH_HISTORY_PER_LINK,
  type AgentInfo,
  type Graph,
  type GraphLink,
  type LinkRun,
  type ServerEvent,
} from "@sodashitsu/protocol";
import { shortId } from "@sodashitsu/protocol";
import {
  approvalNotice,
  buildTriggerText,
  LOCAL_MACHINE,
  parseNodeKey,
  runTextPreview,
  supervisorNotice,
  type GraphPaneInfo,
} from "@sodashitsu/client-core";
import type { Disposable } from "../util/Disposable.js";
import type { Logger } from "../log/Logger.js";
import { AgentPortError, type AgentPort, type AgentStatusEvent } from "./AgentPort.js";
import { TriggerState, type TriggerDecision, type TriggerSettings } from "./TriggerState.js";
import {
  SupervisorNotifier,
  subordinatesSignature,
  type SupervisorDecision,
} from "./SupervisorNotifier.js";

/**
 * 連携の実行（20260927-agent-graph の design「GraphEngine」・architecture）。購読と I/O の配線だけを持ち、「いつ送るか」は `TriggerState`
 * （トリガ・承認の代理の線）と `SupervisorNotifier`（監督役）が決める。
 *
 * - `GraphStore` の変化で対象を作り直す。別のマシンの pane は、載っているマシンの口（`remote`。04 の
 *   `RemoteLinks`）で購読・送信する。端のマシンが繋がっていない間の発火は `machine_unavailable` で見送り、待ちも取り消す。繋がった（繋ぎ直した）
 *   ときの値は「基準」——切れている間の完了・承認待ちでは動かない（decisions D1-6）。監督役のマシンが繋がっていない間は知らせを保留する。
 * - 送ったら回数を数え、上限で `paused: "limit"`（`GraphStore.recordRun`）。監督役への知らせは回数に数えない（decisions D5）。
 * - 履歴は線ごとに直近 `GRAPH_HISTORY_PER_LINK` 件（メモリ）。記録のたびに `graph.fired` を配る。
 * - `stop()` で待ちを黙って取り消し（履歴に残さない）、送っている途中の結果も捨てる（止めた後に graph.json・履歴を書かない）。
 */
export interface GraphEngineDeps {
  store: {
    get(): Graph;
    onChange(fn: (graph: Graph, byClientId: string | null) => void): Disposable;
    recordRun(linkId: string): Promise<{ limitReached: boolean } | null>;
  };
  /** 手元の口。 */
  local: AgentPort;
  /**
   * 別のマシンの口（04 の `RemoteLinks`）。`ensure` は載っているマシンの集合、`port` はそのマシンの口（`ensure` に含めたものだけ）。
   * 無ければ別のマシンの端は口が無い扱い（元なら動かず、先・監督役なら `machine_unavailable`）。
   */
  remote?: {
    ensure(machineIds: Iterable<string>): void;
    port(machineId: string): AgentPort | undefined;
  };
  /** このマシンの呼び名（別のマシンの監督役への知らせで、手元の配下を指す。既定 "local"）。 */
  localLabel?: string;
  publish(event: ServerEvent): void;
  now(): number;
  /** 見回りの間隔のタイマー（試験は `tick()` を直接呼ぶので、既定の setInterval を差し替えない）。 */
  setInterval?(fn: () => void, ms: number): { clear(): void };
  /** 承認待ちの 1 秒が満ちる時刻に 1 回だけ見回るタイマー（試験は差し替えて時刻を進める。既定は setTimeout）。 */
  setTimeout?(fn: () => void, ms: number): { clear(): void };
  logger?: Pick<Logger, "warn">;
}

/** 見回りの間隔（承認待ちの 1 秒・待ちの 30 分・監督の 2 秒のまとめを見る）。 */
export const GRAPH_TICK_MS = 1000;
/**
 * 送った先を「作業中」とみなす時間（ms）。送った直後の先は、エージェントが読み始めて working を公開するまで idle のまま見えるので、その間に
 * 同じ先へ 2 つ目の prompt（監督の知らせと承認の代理が同じ tick に揃った等）を続けて送らない。本物の状態の知らせが来たらそちらを使う。
 * 数えるのは送り終えた（prompt が返った）時点から。送り始めから送り終えるまで（画面の読み取りを含む）は期限なしで作業中とみなす（04 レビュー R1）。
 */
export const ASSUMED_BUSY_MS = 5000;

interface End {
  machine: string;
  paneId: string;
  /** 口（別のマシンの口が無い〔`remote` を渡していない〕なら null）。 */
  port: AgentPort | null;
}

interface BusyEntry {
  end: End;
  /** 期限（送り終えるまでは無限）。 */
  until: number;
  agent: AgentInfo;
  /** 送り始めた時刻。 */
  startedAt: number;
}

interface LinkRuntime {
  link: GraphLink;
  from: End;
  to: End;
  state: TriggerState;
  /** 送っている途中（同じ線の送信を重ねない）。 */
  sending: boolean;
}

interface SupervisorRuntime {
  end: End;
  /** 知らせを送っている途中。 */
  sending: boolean;
  notifier: SupervisorNotifier;
  /** この監督役への監督の線（履歴を残す先）。 */
  links: GraphLink[];
}

export class GraphEngine {
  private readonly links = new Map<string, LinkRuntime>();
  private readonly supervisors = new Map<string, SupervisorRuntime>();
  private readonly history = new Map<string, { run: LinkRun; seq: number }[]>();
  /** 履歴の連番（同じ時刻の記録を新しい順に並べる）。 */
  private seq = 0;
  /** 送った直後で「作業中」とみなしている先（鍵は `<machine>:<paneId>`）。 */
  private readonly assumedBusy = new Map<string, BusyEntry>();
  private subs: Disposable[] = [];
  /** 別のマシンの口の購読（マシンごと）。 */
  private readonly remoteSubs = new Map<string, { port: AgentPort; subs: Disposable[] }>();
  private timer: { clear(): void } | null = null;
  /** 承認待ちの 1 秒の期限のタイマー（一番早い期限の 1 本）とその期限。 */
  private holdTimer: { clear(): void } | null = null;
  private holdAt: number | null = null;
  private graph: Graph | null = null;
  /** stop ごとに増やす。送っている途中の結果は、止めた後なら捨てる。 */
  private generation = 0;
  private running = false;

  constructor(private readonly deps: GraphEngineDeps) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.subs = [
      this.deps.store.onChange((g) => this.guard(() => this.reconcile(g))),
      this.deps.local.onStatus((e) => this.guard(() => this.onStatus(this.deps.local, e))),
    ];
    const every = this.deps.setInterval ?? defaultInterval;
    this.timer = every(() => this.guard(() => this.tick()), GRAPH_TICK_MS);
    this.reconcile(this.deps.store.get());
  }

  /** 止める。待ちは黙って取り消す（履歴に残さない）。送っている途中の結果も記録しない。 */
  stop(): void {
    this.running = false;
    this.generation++; // 送っている途中の結果を捨てる印
    for (const s of this.subs) s.dispose();
    this.subs = [];
    for (const { subs } of this.remoteSubs.values()) for (const s of subs) s.dispose();
    this.remoteSubs.clear();
    this.timer?.clear();
    this.timer = null;
    this.holdTimer?.clear();
    this.holdTimer = null;
    this.holdAt = null;
    // 線・監督役の状態は捨てる（待ちも一緒に消え、履歴には残さない）。次の start は今の値を基準に作り直す。
    this.links.clear();
    this.supervisors.clear();
    this.assumedBusy.clear();
  }

  /** 履歴（新しい順）。`linkId` 無しは全部の線。 */
  getHistory(linkId?: string, limit?: number): LinkRun[] {
    const entries =
      linkId === undefined
        ? [...this.history.values()].flat()
        : [...(this.history.get(linkId) ?? [])];
    entries.sort((a, b) => b.run.at - a.run.at || b.seq - a.seq);
    const runs = entries.map((e) => e.run);
    return limit === undefined ? runs : runs.slice(0, limit);
  }

  /** 見回り（1 秒ごと。試験は直接呼ぶ）。 */
  tick(): void {
    const at = this.deps.now();
    // 「作業中とみなす」の期限が来た先は、今の本当の状態に戻す。
    for (const [key, { end, until }] of [...this.assumedBusy]) {
      if (at < until) continue;
      this.assumedBusy.delete(key);
      this.feedTarget(end, end.port!.status(end.paneId), at);
    }
    for (const rt of [...this.links.values()])
      this.apply(rt, rt.state.handle({ kind: "tick", at }), at);
    for (const sv of [...this.supervisors.values()])
      this.applySupervisor(sv, sv.notifier.handle({ kind: "tick", at }));
    this.armHold();
  }

  /**
   * 承認待ちの 1 秒の期限（線ごとの `holdDeadline` の一番早いもの）にタイマーを張り直す（g05 点検）。1 秒ごとの見回りだけでは、承認待ちに入ってから
   * 発火まで最長 2 秒かかっていた。期限に `tick` を呼ぶ（早く来すぎたら `tick` の後にまた張る）。
   */
  private armHold(): void {
    if (!this.running) return;
    let next: number | null = null;
    for (const rt of this.links.values()) {
      const d = rt.state.holdDeadline();
      if (d !== null && (next === null || d < next)) next = d;
    }
    if (next === this.holdAt) return;
    this.holdTimer?.clear();
    this.holdTimer = null;
    this.holdAt = next;
    if (next === null) return;
    const later = this.deps.setTimeout ?? defaultTimeout;
    this.holdTimer = later(
      () =>
        this.guard(() => {
          this.holdTimer = null;
          this.holdAt = null;
          this.tick();
        }),
      Math.max(0, next - this.deps.now()) + 1,
    );
  }

  // --- 対象の作り直し ---

  /** ノードの鍵は保存・更新の時点で形を確かめている（protocol の `NODE_KEY_RE`）。 */
  private endOf(key: string): End {
    const parsed = parseNodeKey(key)!;
    return {
      machine: parsed.machine,
      paneId: parsed.paneId,
      port:
        parsed.machine === LOCAL_MACHINE
          ? this.deps.local
          : (this.deps.remote?.port(parsed.machine) ?? null),
    };
  }

  /** 載っているマシンの接続をそろえ、その口を購読する（外れたマシンの購読は閉じる前に外す）。 */
  private syncRemote(graph: Graph): void {
    const remote = this.deps.remote;
    if (remote === undefined) return;
    const machines = new Set<string>();
    for (const n of graph.nodes) {
      const m = parseNodeKey(n.key)?.machine;
      if (m !== undefined && m !== LOCAL_MACHINE) machines.add(m);
    }
    for (const [m, entry] of [...this.remoteSubs]) {
      if (machines.has(m)) continue;
      for (const s of entry.subs) s.dispose();
      this.remoteSubs.delete(m);
    }
    remote.ensure(machines);
    for (const m of machines) {
      const port = remote.port(m);
      const existing = this.remoteSubs.get(m);
      if (existing?.port === port) continue;
      if (existing !== undefined) for (const s of existing.subs) s.dispose();
      if (port === undefined) {
        this.remoteSubs.delete(m);
        continue;
      }
      this.remoteSubs.set(m, {
        port,
        subs: [
          port.onStatus((e) => this.guard(() => this.onStatus(port, e))),
          port.onAvailability((up) => this.guard(() => this.onAvailability(port, up))),
        ],
      });
    }
  }

  private reconcile(graph: Graph): void {
    this.graph = graph;
    this.syncRemote(graph);
    const at = this.deps.now();
    const liveLinks = new Set<string>();
    for (const link of graph.links) {
      if (link.kind === "supervise") continue;
      if (this.reconcileLink(link, graph, at)) liveLinks.add(link.id);
    }
    // 消えた・無効になった線は状態ごと捨てる（待ちも黙って消える）。
    for (const id of [...this.links.keys()]) if (!liveLinks.has(id)) this.links.delete(id);
    for (const id of [...this.history.keys()])
      if (!graph.links.some((l) => l.id === id)) this.history.delete(id);
    this.reconcileSupervisors(graph, at);
    this.armHold();
  }

  private reconcileLink(link: GraphLink, graph: Graph, at: number): boolean {
    const from = this.endOf(link.from);
    const to = this.endOf(link.to);
    // 元の口が無ければ（別のマシンの口を渡していない）購読できない。
    if (from.port === null) return false;
    const settings = this.settingsOf(link, graph, from, to);
    const existing = this.links.get(link.id);
    if (
      existing !== undefined &&
      existing.link.from === link.from &&
      existing.link.to === link.to &&
      existing.from.port === from.port &&
      existing.to.port === to.port
    ) {
      existing.link = link;
      this.apply(existing, existing.state.handle({ kind: "config", settings }), at);
      return true;
    }
    // 新しい線・端を選び直した線は、今の値を基準に作り直す（前の状態の待ちは黙って消える）。
    const rt: LinkRuntime = {
      link,
      from,
      to,
      sending: false,
      state: new TriggerState(settings, {
        source: from.port.status(from.paneId),
        target: to.port?.status(to.paneId) ?? null,
        at,
      }),
    };
    this.links.set(link.id, rt);
    return true;
  }

  private settingsOf(link: GraphLink, graph: Graph, from: End, to: End): TriggerSettings {
    const trigger = link.trigger;
    const suppress =
      graph.paused || link.paused === "user"
        ? "paused"
        : link.paused === "limit"
          ? "limit"
          : to.port?.available() !== true || from.port?.available() !== true
            ? "machine_unavailable"
            : null;
    return {
      on: trigger?.on ?? "blocked",
      whenBusy: trigger?.whenBusy ?? "wait",
      suppress,
    };
  }

  private reconcileSupervisors(graph: Graph, at: number): void {
    const bySupervisor = new Map<string, GraphLink[]>();
    for (const link of graph.links) {
      if (link.kind !== "supervise") continue;
      const list = bySupervisor.get(link.to) ?? [];
      list.push(link);
      bySupervisor.set(link.to, list);
    }
    for (const [key, links] of bySupervisor) {
      const end = this.endOf(key);
      // 監督役の口が無いなら知らせない。
      if (end.port === null) {
        this.supervisors.delete(key);
        continue;
      }
      const signature = subordinatesSignature(links.map((l) => l.from));
      const paused = this.supervisorPaused(graph, links, end);
      const existing = this.supervisors.get(key);
      if (existing !== undefined && existing.end.port !== end.port) this.supervisors.delete(key);
      if (existing === undefined || existing.end.port !== end.port) {
        this.supervisors.set(key, {
          end,
          sending: false,
          links,
          notifier: new SupervisorNotifier({
            signature,
            supervisor: end.port.status(end.paneId),
            paused,
            at,
          }),
        });
        continue;
      }
      existing.links = links;
      this.applySupervisor(
        existing,
        existing.notifier.handle({ kind: "subordinates", signature, at }),
      );
      this.applySupervisor(existing, existing.notifier.handle({ kind: "paused", paused, at }));
    }
    for (const key of [...this.supervisors.keys()])
      if (!bySupervisor.has(key)) this.supervisors.delete(key);
  }

  /** 監督役への知らせを保留するか（全体・その監督役への監督の線が全部止まっている・監督役のマシンが繋がっていない）。 */
  private supervisorPaused(graph: Graph, links: GraphLink[], end: End): boolean {
    return graph.paused || links.every((l) => l.paused !== null) || end.port?.available() !== true;
  }

  // --- 状態の変化 ---

  /**
   * 別のマシンの接続が切れた・繋がった（繋ぎ直した）。そのマシンを端に持つ線の抑止を見直し（切れたら待ちを `machine_unavailable` で取り消す）、
   * 元・先・監督役としての今の値を流し直す。切れたときの元は「居ない」（基準を捨てる）、繋がったときの値はその基準になる——切れている間の
   * 完了・承認待ちでは動かない（decisions D1-6）。作業中とみなしていた先も、そのマシンの分は今の本当の値に戻す。
   */
  private onAvailability(port: AgentPort, up: boolean): void {
    const graph = this.graph;
    if (graph === null) return;
    const at = this.deps.now();
    for (const [key, { end }] of [...this.assumedBusy])
      if (end.port === port) this.assumedBusy.delete(key);
    for (const rt of [...this.links.values()]) {
      if (rt.from.port !== port && rt.to.port !== port) continue;
      this.apply(
        rt,
        rt.state.handle({
          kind: "config",
          settings: this.settingsOf(rt.link, graph, rt.from, rt.to),
        }),
        at,
      );
      if (rt.from.port === port)
        this.apply(
          rt,
          rt.state.handle({ kind: "source", agent: port.status(rt.from.paneId), at }),
          at,
        );
      if (rt.to.port === port)
        this.apply(
          rt,
          rt.state.handle({
            kind: "target",
            agent: this.asTarget(`${port.machine}:${rt.to.paneId}`, port.status(rt.to.paneId)),
            at,
          }),
          at,
        );
    }
    for (const sv of [...this.supervisors.values()]) {
      if (sv.end.port !== port) continue;
      const paused = this.supervisorPaused(graph, sv.links, sv.end);
      this.applySupervisor(sv, sv.notifier.handle({ kind: "paused", paused, at }));
      // 繋がったときの監督役の値（同じエージェントなら知らせ直さない。入れ替わっていれば知らせる）。切れている間は前の値のまま保留する。
      if (up)
        this.applySupervisor(
          sv,
          sv.notifier.handle({ kind: "supervisor", agent: port.status(sv.end.paneId), at }),
        );
    }
  }

  private onStatus(port: AgentPort, e: AgentStatusEvent): void {
    const at = this.deps.now();
    const key = `${port.machine}:${e.paneId}`;
    const assumed = this.assumedBusy.get(key);
    // 「作業中とみなす」を外すのは、送った仕事が本当に動いた・終わった知らせのときだけ（idle のままの既読・名前の変更では外さない）。
    if (assumed !== undefined && startedOrReplaced(assumed.agent, e.agent))
      this.assumedBusy.delete(key);
    for (const rt of [...this.links.values()]) {
      if (rt.from.port === port && rt.from.paneId === e.paneId)
        this.apply(rt, rt.state.handle({ kind: "source", agent: e.agent, at }), at);
      // 先・監督役としては、この知らせの処理の中で送り始めた（作業中とみなした）なら、その後の線にも作業中として渡す。
      if (rt.to.port === port && rt.to.paneId === e.paneId)
        this.apply(
          rt,
          rt.state.handle({ kind: "target", agent: this.asTarget(key, e.agent), at }),
          at,
        );
    }
    for (const sv of [...this.supervisors.values()]) {
      if (sv.end.port === port && sv.end.paneId === e.paneId) {
        this.applySupervisor(
          sv,
          sv.notifier.handle({ kind: "supervisor", agent: this.asTarget(key, e.agent), at }),
        );
      }
    }
    this.armHold();
  }

  /** 先としての状態（作業中とみなしている間は working）。 */
  private asTarget(key: string, agent: AgentInfo | null): AgentInfo | null {
    return agent !== null && this.assumedBusy.has(key) ? { ...agent, state: "working" } : agent;
  }

  private apply(rt: LinkRuntime, d: TriggerDecision, at: number): void {
    if (d === null) return;
    if (d.kind === "wait") this.record({ linkId: rt.link.id, at, result: "waiting" });
    else if (d.kind === "skip")
      this.record({ linkId: rt.link.id, at, result: "skipped", reason: d.reason });
    // 同じ線がまだ送っている途中なら重ねない（回数が上限を超えない）。先は作業中とみなしているので busy。
    else if (rt.sending) this.record({ linkId: rt.link.id, at, result: "skipped", reason: "busy" });
    else void this.send(rt);
  }

  private applySupervisor(sv: SupervisorRuntime, d: SupervisorDecision): void {
    if (d === null) return;
    if (sv.sending) {
      sv.notifier.retry(this.deps.now()); // 送っている途中の変化は、次に手が空いたときに知らせ直す
      return;
    }
    void this.notifySupervisor(sv);
  }

  /** 送り始めた先を、しばらく作業中とみなす（同じ先への 2 つ目の prompt を続けて送らない。`ASSUMED_BUSY_MS`）。 */
  private assumeBusy(end: End): BusyEntry | null {
    const agent = end.port!.status(end.paneId);
    if (agent === null) return null;
    const at = this.deps.now();
    // 送り終える（prompt が返る）までは期限なし。送り終えたら `settleBusy` がその時点から数え直す（別のマシンの画面の読み取りは
    // 直列で最長 10 秒ほどかかり、送り始めから数えると送る前に切れて同じ先へ 2 通送る。04 レビュー R1）。
    const entry: BusyEntry = { end, until: Number.POSITIVE_INFINITY, agent, startedAt: at };
    this.assumedBusy.set(`${end.machine}:${end.paneId}`, entry);
    this.feedTarget(end, { ...agent, state: "working" }, at);
    return entry;
  }

  /**
   * 送り終えた（または送らずに終えた）。届いたなら今から `ASSUMED_BUSY_MS`、届いていないなら送り始めから `ASSUMED_BUSY_MS`（今までと同じ）で
   * 期限を切る。その間に本物の状態の知らせで外れていれば（別の entry・無い）何もしない。
   */
  private settleBusy(entry: BusyEntry | null, delivered: boolean): void {
    if (entry === null) return;
    const key = `${entry.end.machine}:${entry.end.paneId}`;
    if (this.assumedBusy.get(key) !== entry) return;
    entry.until = delivered ? this.deps.now() + ASSUMED_BUSY_MS : entry.startedAt + ASSUMED_BUSY_MS;
  }

  /** 先・監督役としての状態だけを流す（元としての完了・承認待ちの判定には流さない）。 */
  private feedTarget(end: End, agent: AgentInfo | null, at: number): void {
    for (const rt of [...this.links.values()]) {
      if (rt.to.port === end.port && rt.to.paneId === end.paneId)
        this.apply(rt, rt.state.handle({ kind: "target", agent, at }), at);
    }
    for (const sv of [...this.supervisors.values()]) {
      if (sv.end.port === end.port && sv.end.paneId === end.paneId)
        this.applySupervisor(sv, sv.notifier.handle({ kind: "supervisor", agent, at }));
    }
  }

  /** 送る直前に、今のグラフで線が残っているか・止まっていないかを確かめる。消えていれば "gone"、止まっていれば見送りの理由。 */
  private recheck(linkId: string): "gone" | "paused" | "limit" | null {
    const link = this.graph?.links.find((l) => l.id === linkId);
    if (link === undefined) return "gone";
    if (this.graph!.paused || link.paused === "user") return "paused";
    if (link.paused === "limit" || link.count >= link.limit) return "limit";
    return null;
  }

  // --- 送信 ---

  private async send(rt: LinkRuntime): Promise<void> {
    const gen = this.generation;
    const { link, from, to } = rt;
    const target = to.port!;
    rt.sending = true;
    const busy = this.assumeBusy(to);
    let delivered = false;
    try {
      let text: string;
      if (!from.port!.available() || !target.available()) {
        // 送ると決めた後に端のマシンが切れた（抑止の見直しより先に送り始めた）。
        this.record({
          linkId: link.id,
          at: this.deps.now(),
          result: "skipped",
          reason: "machine_unavailable",
        });
        return;
      }
      if (link.kind === "approval") {
        // 待つ間に承認待ちが解けていたら送らない（監督役に古い承認を知らせない）。
        if (from.port!.status(from.paneId)?.state !== "blocked") {
          this.record({
            linkId: link.id,
            at: this.deps.now(),
            result: "skipped",
            reason: "resolved",
          });
          return;
        }
        const config = link.approval!;
        const tail = await from.port!.tail(from.paneId, config.lines);
        text = approvalNotice(this.paneInfo(from, to), tail, config);
      } else {
        const trigger = link.trigger!;
        const output =
          trigger.output === null ? null : await from.port!.tail(from.paneId, trigger.output.lines);
        text = buildTriggerText(trigger.prompt, output);
      }
      if (gen !== this.generation) return;
      // 画面を読んでいる間に線が消えた・止められたら送らない（消えた線の履歴は残さない）。
      const now = this.recheck(link.id);
      if (now === "gone") return;
      if (now !== null) {
        this.record({ linkId: link.id, at: this.deps.now(), result: "skipped", reason: now });
        return;
      }
      await target.prompt(to.paneId, text);
      delivered = true;
      // 止めた後（引き継ぎ・終了の途中）に届いた送信は履歴に残さないが、回数は下で数える（届いたので上限を守る）。
      if (gen === this.generation) {
        this.record({
          linkId: link.id,
          at: this.deps.now(),
          result: "sent",
          text: runTextPreview(text),
        });
      }
    } catch (err) {
      if (gen !== this.generation) return;
      this.recordFailure(link.id, err);
      return;
    } finally {
      rt.sending = false;
      this.settleBusy(busy, delivered);
    }
    // 届いた。回数を数える（保存に失敗しても送ったことは変わらないので、履歴は「送った」のまま。閉じた後〔終了の途中〕は保存が断るのでログだけ）。
    try {
      await this.deps.store.recordRun(link.id);
    } catch (err) {
      this.deps.logger?.warn("graph: cannot count a run", {
        linkId: link.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async notifySupervisor(sv: SupervisorRuntime): Promise<void> {
    const gen = this.generation;
    const subs: GraphPaneInfo[] = [];
    for (const l of sv.links) {
      subs.push(this.paneInfo(this.endOf(l.from), sv.end));
    }
    const text = supervisorNotice(subs);
    sv.sending = true;
    const busy = this.assumeBusy(sv.end);
    let delivered = false;
    try {
      await sv.end.port!.prompt(sv.end.paneId, text);
      delivered = true;
      if (gen !== this.generation) return;
      const at = this.deps.now();
      for (const l of sv.links)
        this.record({ linkId: l.id, at, result: "sent", text: runTextPreview(text) });
    } catch (err) {
      if (gen !== this.generation) return;
      // 承認待ち・居ない間に当たった（知らせの直前に変わった）・監督役のマシンが切れていた・送っている途中で切れた（届いたか分からない。
      // 知らせは冪等な案内なので二重に届いても害が小さい。D7-13）なら、次に手が空いたとき（繋がったとき）に送り直す。
      if (
        err instanceof AgentPortError &&
        (err.code === "agent_blocked" ||
          err.code === "agent_not_found" ||
          err.code === "machine_unavailable" ||
          err.code === "connection_closed")
      ) {
        sv.notifier.retry(this.deps.now());
        return;
      }
      for (const l of sv.links) this.recordFailure(l.id, err);
    } finally {
      sv.sending = false;
      this.settleBusy(busy, delivered);
    }
  }

  private recordFailure(linkId: string, err: unknown): void {
    const at = this.deps.now();
    if (err instanceof AgentPortError && err.code === "agent_blocked") {
      this.record({ linkId, at, result: "skipped", reason: "blocked" }); // 送る直前に承認待ちになった（既存の agent_blocked）
    } else if (err instanceof AgentPortError && err.code === "agent_not_found") {
      this.record({ linkId, at, result: "skipped", reason: "target_absent" });
    } else if (err instanceof AgentPortError && err.code === "machine_unavailable") {
      this.record({ linkId, at, result: "skipped", reason: "machine_unavailable" }); // 読む・送る直前に端のマシンが切れた
    } else {
      this.record({
        linkId,
        at,
        result: "failed",
        reason: "error",
        text: runTextPreview(err instanceof Error ? err.message : String(err)),
      });
    }
  }

  /**
   * 知らせの文面に載せる pane の情報。マシンは受け取る側（`viewer`。監督役）から見た呼び名——同じマシンなら null（手元）、別のマシンは登録簿の
   * 呼び名（`sodactl --machine <名前>` に使う）、手元のサーバの pane を別のマシンの監督役へ知らせるときは `localLabel`。
   */
  private paneInfo(end: End, viewer: End): GraphPaneInfo {
    const name = end.port?.paneName(end.paneId) ?? `pane ${shortId(end.paneId)}`;
    const agent = end.port?.status(end.paneId) ?? null;
    const machine =
      end.machine === viewer.machine
        ? null
        : end.machine === LOCAL_MACHINE
          ? (this.deps.localLabel ?? LOCAL_MACHINE)
          : (end.port?.machineLabel() ?? end.machine);
    return { name, paneId: end.paneId, kind: agent?.kind ?? null, machine };
  }

  // --- 履歴 ---

  private record(run: LinkRun): void {
    const list = this.history.get(run.linkId) ?? [];
    list.push({ run, seq: this.seq++ });
    if (list.length > GRAPH_HISTORY_PER_LINK) list.splice(0, list.length - GRAPH_HISTORY_PER_LINK);
    this.history.set(run.linkId, list);
    // 配るのは原因（状態の変化・graph.changed）を配り終えた後（bus は同期なので、ここで配ると原因より先に届く）。
    queueMicrotask(() => this.deps.publish({ event: "graph.fired", data: { run } }));
  }

  /** 購読者の例外を外へ出さない（bus の後続の購読者〔WS への配信〕を止めない。research F3.3）。 */
  private guard(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      this.deps.logger?.warn("graph engine failed", {
        error: err instanceof Error ? (err.stack ?? err.message) : String(err),
      });
    }
  }
}

/** 作業中とみなしていた先の知らせが、送った仕事の開始・完了・入れ替わり（または不在）を表すか。idle のままの既読・名前の変更は false。 */
function startedOrReplaced(assumed: AgentInfo, now: AgentInfo | null): boolean {
  if (now === null || now.instanceId !== assumed.instanceId) return true;
  if (now.state !== "idle") return true;
  return now.completionSeq > assumed.completionSeq;
}

function defaultTimeout(fn: () => void, ms: number): { clear(): void } {
  const t = setTimeout(fn, ms);
  t.unref?.();
  return { clear: () => clearTimeout(t) };
}

function defaultInterval(fn: () => void, ms: number): { clear(): void } {
  const t = setInterval(fn, ms);
  t.unref?.();
  return { clear: () => clearInterval(t) };
}
