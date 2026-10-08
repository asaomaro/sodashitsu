import type {
  AgentInfo,
  DisplayState,
  Graph,
  GraphLink,
  GraphNode,
  GraphOp,
  LinkRun,
  MethodName,
  NodeKey,
  ParamsOf,
  ResultOf,
  ServerEvent,
} from "@sodashitsu/protocol";
import { GRAPH_LOCAL_NODES_MAX, shortId } from "@sodashitsu/protocol";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  clientErrorMessage,
  errorCodeOf,
  graphStructureFrom,
  isLocalNodeKey,
  LOCAL_MACHINE_ID,
  nodePositions,
  paneNameOf,
  parseNodeKey,
  resolveDrop,
  GRAPH_FIRST_NODE_RESERVE,
  type LayoutStructure,
} from "@sodashitsu/client-core";
import { summaryPaneName, useMachinesStore } from "./machines.js";
import { displayStateFor, useSeenStore } from "./seen.js";
import { useSessionStore } from "./session.js";
import { useViewStore } from "./view.js";

/**
 * 連携のグラフ（20260927-agent-graph の design「web」の `store/graph.ts`）。サーバのグラフ（`graph.get`・`graph.changed`）・実行の知らせ（`graph.fired`）・
 * 履歴（`graph.history`）・楽観的な配置（ドラッグ中はサーバの値で上書きしない。Splitter と同じ）・`rev_conflict` での作り直しと送り直しを持つ。
 *
 * - **同じ rev の `graph.changed` も当てる**（decisions D5-14。実行の回数だけの保存は rev を上げずに配られる）。rev が古いものだけ捨てる。
 * - 方式の結果（`graph.update` 等の戻り値）は rev が今より新しいときだけ当てる——同じ rev の `graph.changed`（回数の保存）が先に届いていれば、
 *   戻り値で回数を巻き戻さない。
 * - サーバとのやりとりは `bind` した口（画面の接続がローカルを向いていればそれ、別のマシンを向いていればローカルの軽い接続。`main.ts`）。
 */

type GraphMethod = Extract<
  MethodName,
  "graph.get" | "graph.update" | "graph.pause" | "graph.resume" | "graph.history"
>;
export interface GraphPort {
  request<M extends GraphMethod>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>>;
}

/** 線が動いた印（光り・チップの記号）を出しておく時間（design「実行の表示」）。 */
export const GRAPH_FIRE_GLOW_MS = 1500;
/** 画面に持っておく履歴の件数（新しい順）。 */
const RUNS_KEEP = 200;
/** `rev_conflict` で作り直して送り直す回数。 */
const UPDATE_RETRIES = 3;

export interface GraphNodeInfo {
  key: NodeKey;
  machine: string;
  paneId: string;
  local: boolean;
  /** マシンの呼び名（手元は「ローカル」）。 */
  machineLabel: string;
  /** pane の呼び名（手元の pane は `paneNameOf`。要約しか無い別のマシンの pane は `pane <id>`。04 で広げる）。 */
  name: string;
  agent: AgentInfo | null;
  state: DisplayState | null;
  /** pane があるか（無い・閉じた＝false。マシンが繋がっていない・要約がまだ無い＝null〔分からない。未接続の印〕）。 */
  exists: boolean | null;
  /** pane のある workspace・tab（分かれば）。 */
  location: { workspaceId: string; tabId: string } | null;
}

export type GraphUpdateResult =
  | { ok: true; graph: Graph }
  /**
   * `reason: "gone"` は作り直す元（ノード・線）がもう無い。`"conflict"` は作り直すと他の変更と重なった（`build` が `{ conflict }` を返した。
   * 送らない。黙って上書きしない）。
   */
  | { ok: false; reason: "gone" | "error" | "conflict"; message: string };

/** `update` の `build` が返す、送るものが無い（もう最新がその値）の印。送らずに成功とする。 */
export const GRAPH_UNCHANGED = Symbol("graph-unchanged");
/**
 * `update` の `build` の戻り値: 送る操作・`null` か空（元が他で消えた。`gone`）・`GRAPH_UNCHANGED`（送るものが無い）・`{ conflict }`
 * （他の変更と重なるので送らない。`message` が理由）。
 */
export type GraphBuild = GraphOp[] | null | typeof GRAPH_UNCHANGED | { conflict: string };

export const useGraphStore = defineStore("graph", () => {
  let port: GraphPort | null = null;
  const graph = ref<Graph | null>(null);
  /** 取得に失敗した理由（画面に出す）。取れたら null。 */
  const loadError = ref<string | null>(null);
  /** ドラッグ中の位置（サーバの値より優先。離したら `pendingPositions` へ）。 */
  const dragPositions = ref(new Map<string, { x: number; y: number }>());
  /** 送ったが応答をまだ受けていない位置（楽観的な配置）。 */
  const pendingPositions = ref(new Map<string, { x: number; y: number }>());
  /** 履歴（新しい順）。`loadHistory` で読み、以後は `graph.fired` を先頭へ足す。 */
  const runs = ref<LinkRun[]>([]);
  const runsLoaded = ref(false);
  /** 動いたばかりの線（光り）。値は結果。`GRAPH_FIRE_GLOW_MS` で消える。 */
  const firing = ref(new Map<string, LinkRun["result"]>());
  const fireTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let loadSeq = 0;
  /** 送っている途中の `update_link` で上限を変えた線（その結果の上限の一時停止は知らせない）。値は重なった数。 */
  const ownLimitEdits = new Map<string, number>();

  function bind(p: GraphPort | null): void {
    port = p;
  }

  /**
   * 口を差し替えた（マシンの切り替え）・接続し直した。取り直す。読んである履歴も取り直す（切れていた間の実行を取りこぼして、回数と履歴を
   * 食い違わせない）。取れたら true。
   */
  async function load(): Promise<boolean> {
    if (!port) return false;
    const seq = ++loadSeq;
    try {
      const g = await port.request("graph.get", {});
      if (seq !== loadSeq) return false;
      loadError.value = null;
      applyGraph(g, "fresh");
      if (runsLoaded.value) void loadHistory();
      return true;
    } catch (err) {
      if (seq !== loadSeq) return false;
      loadError.value = errorText(errorCodeOf(err), err);
      return false;
    }
  }

  /**
   * グラフを当てる。`source`: `event`＝`graph.changed`（同じ rev も当てる）、`result`＝方式の戻り値（新しい rev だけ）、`fresh`＝取り直し（常に当てる）。
   * 上限で止まった線があれば知らせる（AC11）。
   */
  function applyGraph(next: Graph, source: "event" | "result" | "fresh"): void {
    const prev = graph.value;
    if (prev && source !== "fresh") {
      if (next.rev < prev.rev) return;
      if (source === "result" && next.rev === prev.rev) return;
    }
    graph.value = next;
    if (prev) notifyLimited(prev, next);
  }

  function notifyLimited(prev: Graph, next: Graph): void {
    const before = new Map(prev.links.map((l) => [l.id, l]));
    for (const link of next.links) {
      const old = before.get(link.id);
      if (!old || old.paused === "limit" || link.paused !== "limit") continue;
      // 自分で上限を今の回数以下に下げた保存（D5-13）は、自分の操作の結果なので知らせない。
      if (ownLimitEdits.has(link.id)) continue;
      useViewStore().toast(
        `連携の線（${linkTitle(link)}）が上限の ${link.limit} 回に達したので止めました。グラフ画面の線から再開できます。`,
      );
    }
  }

  function applyEvent(e: ServerEvent): void {
    if (e.event === "graph.changed") applyGraph(e.data.graph, "event");
    else if (e.event === "graph.fired") applyFired(e.data.run);
  }

  function applyFired(run: LinkRun): void {
    if (runsLoaded.value) runs.value = [run, ...runs.value].slice(0, RUNS_KEEP);
    const next = new Map(firing.value);
    next.set(run.linkId, run.result);
    firing.value = next;
    const old = fireTimers.get(run.linkId);
    if (old !== undefined) clearTimeout(old);
    fireTimers.set(
      run.linkId,
      setTimeout(() => {
        fireTimers.delete(run.linkId);
        const m = new Map(firing.value);
        m.delete(run.linkId);
        firing.value = m;
      }, GRAPH_FIRE_GLOW_MS),
    );
  }

  async function loadHistory(): Promise<void> {
    if (!port) return;
    try {
      const r = await port.request("graph.history", {});
      runs.value = r.runs.slice(0, RUNS_KEEP);
      runsLoaded.value = true;
    } catch (err) {
      useViewStore().toast(`履歴を読めませんでした（${errorText(errorCodeOf(err), err)}）`);
    }
  }

  /**
   * `graph.update` を送る。`build` は今のグラフから操作を作る——`rev_conflict` なら取り直した最新でもう一度作って送り直す（design「エラー処理」）。
   * 作り直した結果が null・空なら（元のノード・線が他で消えた）送らずに `gone`。
   */
  async function update(build: (g: Graph) => GraphBuild): Promise<GraphUpdateResult> {
    if (!port) return { ok: false, reason: "error", message: "サーバに繋がっていません。" };
    if (!graph.value) await load();
    for (let attempt = 0; attempt < UPDATE_RETRIES; attempt++) {
      const g = graph.value;
      if (!g)
        return {
          ok: false,
          reason: "error",
          message: loadError.value ?? "グラフを読めませんでした。",
        };
      const ops = build(g);
      if (ops === GRAPH_UNCHANGED) return { ok: true, graph: g };
      if (ops !== null && !Array.isArray(ops))
        return { ok: false, reason: "conflict", message: ops.conflict };
      if (!ops || ops.length === 0)
        return { ok: false, reason: "gone", message: "対象がほかの画面・sodactl で消されました。" };
      // 上限の知らせを抑えるのは、上限を今より下げる保存だけ（下げた結果の一時停止は自分の操作。上げる保存の応答待ちの間に
      // 上限に達したのは知らせる。統合レビュー R1）。
      const limitEdits = ops.flatMap((o) =>
        o.op === "update_link" &&
        o.limit !== undefined &&
        o.limit < (g.links.find((l) => l.id === o.id)?.limit ?? Infinity)
          ? [o.id]
          : [],
      );
      for (const id of limitEdits) ownLimitEdits.set(id, (ownLimitEdits.get(id) ?? 0) + 1);
      try {
        const next = await port.request("graph.update", { baseRev: g.rev, ops });
        applyGraph(next, "result");
        return { ok: true, graph: next };
      } catch (err) {
        const code = errorCodeOf(err);
        if (code === "rev_conflict") {
          // 取り直せなければ古い rev で送り直さない（同じ rev_conflict を繰り返すだけ）。
          if (!(await load()))
            return {
              ok: false,
              reason: "error",
              message: loadError.value ?? "グラフを読めませんでした。",
            };
          continue;
        }
        return { ok: false, reason: "error", message: errorText(code, err) };
      } finally {
        for (const id of limitEdits) {
          const n = (ownLimitEdits.get(id) ?? 1) - 1;
          if (n <= 0) ownLimitEdits.delete(id);
          else ownLimitEdits.set(id, n);
        }
      }
    }
    return { ok: false, reason: "error", message: clientErrorMessage("rev_conflict") };
  }

  /** 全体（`linkId` 無し）か線の一時停止・再開。失敗はトースト。 */
  async function setPaused(paused: boolean, linkId?: string): Promise<boolean> {
    if (!port) return false;
    try {
      const params = linkId === undefined ? {} : { linkId };
      const next = paused
        ? await port.request("graph.pause", params)
        : await port.request("graph.resume", params);
      applyGraph(next, "result");
      return true;
    } catch (err) {
      useViewStore().toast(
        `${paused ? "一時停止" : "再開"}できませんでした（${errorText(errorCodeOf(err), err)}）`,
      );
      return false;
    }
  }

  // --- 配置（ドラッグ中はサーバの値で上書きしない）---------------------------------

  function setDragPosition(key: string, p: { x: number; y: number } | null): void {
    const m = new Map(dragPositions.value);
    if (p) m.set(key, p);
    else m.delete(key);
    dragPositions.value = m;
  }

  /**
   * 動かした結果が、囲い（workspace・worktree グループ）の重なりを新しく作る・広げるなら、重ならない最も近い位置へ寄せる（`resolveDrop`。
   * 離す前に寄せるので、サーバに `frame_overlap` で断られない。20261008-graph-first）。手元のセッションの構成を導けるとき（画面の接続が手元を向いている）だけ。
   */
  /**
   * いまのセッションから導いた空間の構成（`graphStructureFrom`）。別のマシンの囲いは `remoteKeys` の鍵から作る。手元のセッションが無い
   * （画面の接続が別のマシンを向いている）ときは null——構成を導けない。
   */
  function layoutStructure(remoteKeys: readonly string[]): LayoutStructure | null {
    if (useMachinesStore().selectedId !== LOCAL_MACHINE_ID) return null;
    const session = useSessionStore();
    return graphStructureFrom(
      {
        workspaces: [...session.workspaces.values()],
        tabs: [...session.tabs.values()],
        panes: [...session.panes.values()],
        groups: [...session.groups.values()],
        layout: session.effectiveLayout,
      },
      { remoteKeys },
    );
  }

  function resolveMoves(
    moves: readonly { key: string; x: number; y: number }[],
  ): { key: string; x: number; y: number }[] {
    const g = graph.value;
    if (!g || moves.length === 0) return [...moves];
    const structure = layoutStructure(g.nodes.map((n) => n.key));
    if (structure === null) return [...moves];
    const out = resolveDrop(
      structure,
      nodePositions(g.nodes),
      new Map(moves.map((m) => [m.key, { x: m.x, y: m.y }])),
    );
    return moves.map((m) => ({ key: m.key, ...(out.get(m.key) ?? { x: m.x, y: m.y }) }));
  }

  /** ノードを動かし終えた（ドラッグを離した・矢印キーの連打が止まった）。楽観的に置いてから送る。 */
  async function moveNodes(
    requested: readonly { key: string; x: number; y: number }[],
  ): Promise<GraphUpdateResult> {
    const moves = resolveMoves(requested);
    const pend = new Map(pendingPositions.value);
    for (const m of moves) pend.set(m.key, { x: m.x, y: m.y });
    pendingPositions.value = pend;
    const drag = new Map(dragPositions.value);
    for (const m of moves) drag.delete(m.key);
    dragPositions.value = drag;
    const result = await update((g) =>
      moves
        .filter((m) => g.nodes.some((n) => n.key === m.key))
        .map((m) => ({ op: "move_node" as const, key: m.key as NodeKey, x: m.x, y: m.y })),
    );
    const after = new Map(pendingPositions.value);
    for (const m of moves) {
      const cur = after.get(m.key);
      // 応答を待つ間に同じノードをもう一度動かしていれば、そちらを残す。
      if (cur && cur.x === m.x && cur.y === m.y) after.delete(m.key);
    }
    pendingPositions.value = after;
    if (!result.ok && result.reason === "error")
      useViewStore().toast(`配置を保存できませんでした（${result.message}）`);
    return result;
  }

  /** 表示に使うノード（ドラッグ中・送信中の位置を重ねたもの）。 */
  const nodes = computed<GraphNode[]>(() => {
    const g = graph.value;
    if (!g) return [];
    return g.nodes.map((n) => {
      const p = dragPositions.value.get(n.key) ?? pendingPositions.value.get(n.key);
      return p ? { ...n, x: p.x, y: p.y } : n;
    });
  });
  const links = computed<GraphLink[]>(() => graph.value?.links ?? []);

  /**
   * 手元の pane のうち、上限（手元のノード 512。2 つ目以降は予備を残して手前まで）のためにノードが付かず、グラフに出ていない pane の数
   * （20261008-graph-first AC-V3）。上限の手前では 0（ノードの無い pane は、足される途中か、一時的な pane）。画面の接続が手元を向いているときだけ分かる。
   */
  const hiddenLocalPaneCount = computed<number>(() => {
    const g = graph.value;
    if (!g || useMachinesStore().selectedId !== LOCAL_MACHINE_ID) return 0;
    const local = new Set(g.nodes.filter((n) => isLocalNodeKey(n.key)).map((n) => n.key));
    if (local.size < GRAPH_LOCAL_NODES_MAX - GRAPH_FIRST_NODE_RESERVE) return 0;
    let hidden = 0;
    for (const id of useSessionStore().panes.keys()) if (!local.has(`local:${id}`)) hidden++;
    return hidden;
  });

  // --- ノードの中身（pane の要約）--------------------------------------------------

  function nodeInfo(key: NodeKey): GraphNodeInfo {
    const session = useSessionStore();
    const machines = useMachinesStore();
    const seen = useSeenStore();
    const parsed = parseNodeKey(key);
    const machine = parsed?.machine ?? LOCAL_MACHINE_ID;
    const paneId = parsed?.paneId ?? key;
    const local = machine === LOCAL_MACHINE_ID;
    const machineLabel = local
      ? "ローカル"
      : (machines.machines.find((m) => m.id === machine)?.label ?? "別のマシン");
    const base = { key, machine, paneId, local, machineLabel };
    const connected = machineConnected(machine);
    // 画面の接続が向いているマシンの pane は、session の全体（呼び名・場所）がある。
    if (machine === machines.selectedId) {
      const pane = session.panes.get(paneId);
      if (!pane)
        return {
          ...base,
          name: `pane ${shortId(paneId)}`,
          agent: null,
          state: null,
          // 切れている・切り替えの途中（session が空）は「分からない」（無効と出さない。g04 点検）
          exists: connected ? false : null,
          location: null,
        };
      const agent = pane.agent;
      const workspaceId = session.tabs.get(pane.tabId)?.workspaceId;
      return {
        ...base,
        name: paneNameOf(pane),
        agent,
        state:
          agent && connected
            ? displayStateFor(agent, seen.getSeenSeq(agent.instanceId, agent.serverSeenSeq))
            : null,
        exists: connected ? true : null,
        location: workspaceId ? { workspaceId, tabId: pane.tabId } : null,
      };
    }
    // ほかのマシン（手元を含む）は軽い接続の要約から（呼び名の材料も要約に持つ。04）。
    const summary = machines.summaries[machine];
    const entry = summary?.panes[paneId];
    if (!entry) {
      return {
        ...base,
        name: `pane ${shortId(paneId)}`,
        agent: null,
        state: null,
        exists: connected ? false : null,
        location: null,
      };
    }
    const agent = entry.agent;
    const workspaceId = summary.tabWorkspace[entry.tabId];
    return {
      ...base,
      name: summaryPaneName(paneId, entry),
      agent,
      // 切れたマシンの最後の要約の状態は出さない（未接続の印。g04 点検）
      state:
        agent && connected
          ? displayStateFor(
              agent,
              seen.getSeenSeqIn(machine, agent.instanceId, agent.serverSeenSeq),
            )
          : null,
      exists: connected ? true : null,
      location: workspaceId ? { workspaceId, tabId: entry.tabId } : null,
    };
  }

  /**
   * そのマシンの pane の情報が今のものか（g04 点検）。画面の接続が向いているマシンは接続が open（起動・切り替えの直後の connecting でも、
   * session に中身があれば繋がっているとみなす——切り替えの途中は session が空）。ほかのマシンは軽い接続の要約が繋がっているか。
   */
  function machineConnected(machine: string): boolean {
    const machines = useMachinesStore();
    if (machine === machines.selectedId) {
      const state = useViewStore().connectionState;
      const session = useSessionStore();
      const hasContent = session.panes.size > 0 || session.workspaces.size > 0;
      // 切り替えの直後（選んだマシンを替え session を捨てた後、接続の行き先を替える前）は、接続はまだ前のマシンへ open のまま。
      // session に hello の中身（clientId）も中身も無ければ、選んだマシンにはまだ繋がっていない（ノードを一瞬 ⚠ 無効と出さない。04 レビュー R1）。
      if (state === "open") return session.clientId !== null || hasContent;
      if (state !== "connecting") return false;
      return hasContent;
    }
    return machines.summaries[machine]?.connected === true;
  }

  /** 線の呼び名（「impl → reviewer」。監督・承認の代理は配下 → 監督役）。 */
  function linkTitle(link: Pick<GraphLink, "from" | "to">): string {
    return `${nodeInfo(link.from).name} → ${nodeInfo(link.to).name}`;
  }

  return {
    graph,
    loadError,
    nodes,
    links,
    runs,
    runsLoaded,
    firing,
    dragPositions,
    pendingPositions,
    bind,
    load,
    applyGraph,
    applyEvent,
    applyFired,
    loadHistory,
    update,
    setPaused,
    setDragPosition,
    moveNodes,
    resolveMoves,
    layoutStructure,
    hiddenLocalPaneCount,
    nodeInfo,
    linkTitle,
    machineConnected,
  };
});

function errorText(code: string | null, err: unknown): string {
  // 接続が無い・切れた（`graphRouting` がそろえる）。サーバのエラーの文言にしない。
  if (code === "not_connected") return "サーバに繋がっていません（繋ぎ直しを待っています）。";
  if (code === "invalid_params" && err instanceof Error) {
    // サーバの検証（client-core の validate と同じ規則）の文。画面の保存の前にも同じ検証をするので、ここへ来るのは他と競ったときだけ。
    return "内容がほかの変更と合わなくなりました。最新のグラフで確かめてください。";
  }
  return clientErrorMessage(code ?? "internal");
}
