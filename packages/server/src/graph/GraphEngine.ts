import {
  GRAPH_HISTORY_PER_LINK,
  type AgentInfo,
  type Graph,
  type GraphLink,
  type GraphNode,
  type LinkRun,
  type ServerEvent,
} from "@sodashitsu/protocol";
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
 * - `GraphStore` の変化で対象を作り直す（無効〔stale〕のノードの線は動かさない。元が別のマシンの線は 04 まで購読できないので動かない。
 *   先・監督役が別のマシンなら発火を `machine_unavailable` で見送る）。
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
  /** 手元の口（別のマシンの口は 04 で足す）。 */
  local: AgentPort;
  publish(event: ServerEvent): void;
  now(): number;
  /** 見回りの間隔のタイマー（試験は `tick()` を直接呼ぶので、既定の setInterval を差し替えない）。 */
  setInterval?(fn: () => void, ms: number): { clear(): void };
  logger?: Pick<Logger, "warn">;
}

/** 見回りの間隔（承認待ちの 1 秒・待ちの 30 分・監督の 2 秒のまとめを見る）。 */
export const GRAPH_TICK_MS = 1000;
/**
 * 送った先を「作業中」とみなす時間（ms）。送った直後の先は、エージェントが読み始めて working を公開するまで idle のまま見えるので、その間に
 * 同じ先へ 2 つ目の prompt（監督の知らせと承認の代理が同じ tick に揃った等）を続けて送らない。本物の状態の知らせが来たらそちらを使う。
 */
export const ASSUMED_BUSY_MS = 5000;

interface End {
  machine: string;
  paneId: string;
  /** 手元なら口。別のマシンは 04 まで null。 */
  port: AgentPort | null;
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

/** ノードの鍵は保存・更新の時点で形を確かめている（protocol の `NODE_KEY_RE`）。 */
function endOf(key: string, local: AgentPort): End {
  const parsed = parseNodeKey(key)!;
  return {
    machine: parsed.machine,
    paneId: parsed.paneId,
    port: parsed.machine === LOCAL_MACHINE ? local : null,
  };
}

export class GraphEngine {
  private readonly links = new Map<string, LinkRuntime>();
  private readonly supervisors = new Map<string, SupervisorRuntime>();
  private readonly history = new Map<string, { run: LinkRun; seq: number }[]>();
  /** 履歴の連番（同じ時刻の記録を新しい順に並べる）。 */
  private seq = 0;
  /** 送った直後で「作業中」とみなしている先（鍵は `<machine>:<paneId>`）。 */
  private readonly assumedBusy = new Map<string, { end: End; until: number }>();
  private subs: Disposable[] = [];
  private timer: { clear(): void } | null = null;
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
    this.timer?.clear();
    this.timer = null;
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
  }

  // --- 対象の作り直し ---

  private reconcile(graph: Graph): void {
    this.graph = graph;
    const at = this.deps.now();
    const nodes = new Map<string, GraphNode>(graph.nodes.map((n) => [n.key, n]));
    const liveLinks = new Set<string>();
    for (const link of graph.links) {
      if (link.kind === "supervise") continue;
      if (this.reconcileLink(link, nodes, graph, at)) liveLinks.add(link.id);
    }
    // 消えた・無効になった線は状態ごと捨てる（待ちも黙って消える）。
    for (const id of [...this.links.keys()]) if (!liveLinks.has(id)) this.links.delete(id);
    for (const id of [...this.history.keys()])
      if (!graph.links.some((l) => l.id === id)) this.history.delete(id);
    this.reconcileSupervisors(graph, nodes, at);
  }

  private reconcileLink(
    link: GraphLink,
    nodes: Map<string, GraphNode>,
    graph: Graph,
    at: number,
  ): boolean {
    const from = endOf(link.from, this.deps.local);
    const to = endOf(link.to, this.deps.local);
    // 無効のノードの線は動かさない（選び直すまで）。元が別のマシンなら購読できない（04）。
    if (
      nodes.get(link.from)?.stale === true ||
      nodes.get(link.to)?.stale === true ||
      from.port === null
    )
      return false;
    const settings = this.settingsOf(link, graph, to);
    const existing = this.links.get(link.id);
    if (
      existing !== undefined &&
      existing.link.from === link.from &&
      existing.link.to === link.to
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

  private settingsOf(link: GraphLink, graph: Graph, to: End): TriggerSettings {
    const trigger = link.trigger;
    const suppress =
      graph.paused || link.paused === "user"
        ? "paused"
        : link.paused === "limit"
          ? "limit"
          : to.port === null
            ? "machine_unavailable"
            : null;
    return {
      on: trigger?.on ?? "blocked",
      whenBusy: trigger?.whenBusy ?? "wait",
      suppress,
    };
  }

  private reconcileSupervisors(graph: Graph, nodes: Map<string, GraphNode>, at: number): void {
    const bySupervisor = new Map<string, GraphLink[]>();
    for (const link of graph.links) {
      if (link.kind !== "supervise") continue;
      const list = bySupervisor.get(link.to) ?? [];
      list.push(link);
      bySupervisor.set(link.to, list);
    }
    for (const [key, links] of bySupervisor) {
      const end = endOf(key, this.deps.local);
      // 監督役が無効・別のマシン（04）なら知らせない。
      if (end.port === null || nodes.get(key)?.stale === true) {
        this.supervisors.delete(key);
        continue;
      }
      const signature = subordinatesSignature(
        links.map((l) => ({ key: l.from, stale: nodes.get(l.from)?.stale === true })),
      );
      const paused = graph.paused || links.every((l) => l.paused !== null);
      const existing = this.supervisors.get(key);
      if (existing === undefined) {
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

  // --- 状態の変化 ---

  private onStatus(port: AgentPort, e: AgentStatusEvent): void {
    const at = this.deps.now();
    this.assumedBusy.delete(`${port.machine}:${e.paneId}`); // 本物の知らせが来たらそちらを使う
    for (const rt of [...this.links.values()]) {
      if (rt.from.port === port && rt.from.paneId === e.paneId)
        this.apply(rt, rt.state.handle({ kind: "source", agent: e.agent, at }), at);
      if (rt.to.port === port && rt.to.paneId === e.paneId)
        this.apply(rt, rt.state.handle({ kind: "target", agent: e.agent, at }), at);
    }
    for (const sv of [...this.supervisors.values()]) {
      if (sv.end.port === port && sv.end.paneId === e.paneId) {
        this.applySupervisor(sv, sv.notifier.handle({ kind: "supervisor", agent: e.agent, at }));
      }
    }
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
  private assumeBusy(end: End): void {
    const agent = end.port!.status(end.paneId);
    if (agent === null) return;
    const at = this.deps.now();
    this.assumedBusy.set(`${end.machine}:${end.paneId}`, { end, until: at + ASSUMED_BUSY_MS });
    this.feedTarget(end, { ...agent, state: "working" }, at);
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
    this.assumeBusy(to);
    try {
      let text: string;
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
        text = approvalNotice(this.paneInfo(from), tail, config);
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
      if (gen !== this.generation) return;
      this.record({
        linkId: link.id,
        at: this.deps.now(),
        result: "sent",
        text: runTextPreview(text),
      });
    } catch (err) {
      if (gen !== this.generation) return;
      this.recordFailure(link.id, err);
      return;
    } finally {
      rt.sending = false;
    }
    // 送れた。回数を数える（保存に失敗しても送ったことは変わらないので、履歴は「送った」のまま。閉じた後〔終了の途中〕は数えない）。
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
    const nodes = new Map((this.graph?.nodes ?? []).map((n) => [n.key, n]));
    const subs: GraphPaneInfo[] = [];
    for (const l of sv.links) {
      if (nodes.get(l.from)?.stale === true) continue; // 無効の配下は知らせに載せない
      subs.push(this.paneInfo(endOf(l.from, this.deps.local)));
    }
    const text = supervisorNotice(subs);
    sv.sending = true;
    this.assumeBusy(sv.end);
    try {
      await sv.end.port!.prompt(sv.end.paneId, text);
      if (gen !== this.generation) return;
      const at = this.deps.now();
      for (const l of sv.links)
        this.record({ linkId: l.id, at, result: "sent", text: runTextPreview(text) });
    } catch (err) {
      if (gen !== this.generation) return;
      // 承認待ち・居ない間に当たった（知らせの直前に変わった）なら、次に手が空いたときに送り直す。
      if (
        err instanceof AgentPortError &&
        (err.code === "agent_blocked" || err.code === "agent_not_found")
      ) {
        sv.notifier.retry(this.deps.now());
        return;
      }
      for (const l of sv.links) this.recordFailure(l.id, err);
    } finally {
      sv.sending = false;
    }
  }

  private recordFailure(linkId: string, err: unknown): void {
    const at = this.deps.now();
    if (err instanceof AgentPortError && err.code === "agent_blocked") {
      this.record({ linkId, at, result: "skipped", reason: "blocked" }); // 送る直前に承認待ちになった（既存の agent_blocked）
    } else if (err instanceof AgentPortError && err.code === "agent_not_found") {
      this.record({ linkId, at, result: "skipped", reason: "target_absent" });
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

  private paneInfo(end: End): GraphPaneInfo {
    const name = end.port?.paneName(end.paneId) ?? `pane ${end.paneId}`;
    const agent = end.port?.status(end.paneId) ?? null;
    return {
      name,
      paneId: end.paneId,
      kind: agent?.kind ?? null,
      machine: end.machine === LOCAL_MACHINE ? null : end.machine,
    };
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

function defaultInterval(fn: () => void, ms: number): { clear(): void } {
  const t = setInterval(fn, ms);
  t.unref?.();
  return { clear: () => clearInterval(t) };
}
