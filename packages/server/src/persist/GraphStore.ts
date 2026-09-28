import { join } from "node:path";
import { GraphSchema, type Graph, type GraphOp } from "@sodashitsu/protocol";
import {
  applyGraphOps,
  emptyGraph,
  isLocalNodeKey,
  validateGraph,
  type GraphDraftState,
  type GraphIssue,
} from "@sodashitsu/client-core";
import { readFileWithBackup, writeFileAtomic } from "./atomicFile.js";

/**
 * 連携のグラフ（20260927-agent-graph の design「server」・research F4.1）。session ごとに 1 枚を状態ディレクトリの `graph.json`（0600・原子的な書き込み）に置く。
 * 形は `PrefsStore` と同じ（書き込みの待ち行列・rev・壊れていれば退避・保存できてから `onChange`）。実行の履歴は置かない（メモリだけ。architecture「履歴はメモリ」）。
 */
export const GRAPH_FILE_NAME = "graph.json";

interface GraphFileData {
  schema: 1;
  rev: number;
  /** 次に振る線の番号（消した線の id を使い回さない）。 */
  nextLinkId: number;
  graph: Omit<Graph, "rev">;
  savedAt: string;
}

/** `graph.update` の `baseRev` が今の rev と違う。方式の側で `rev_conflict` にする。 */
export class GraphRevConflictError extends Error {
  constructor(
    readonly baseRev: number,
    readonly currentRev: number,
  ) {
    super(`graph was changed elsewhere: baseRev ${baseRev}, current rev ${currentRev}`);
    this.name = "GraphRevConflictError";
  }
}

/** 操作を当てられない・当てた結果が検証に落ちる。方式の側で `invalid_params` にする。 */
export class GraphInvalidError extends Error {
  constructor(readonly issues: GraphIssue[]) {
    super(issues.map((i) => i.code).join(", "));
    this.name = "GraphInvalidError";
  }
}

/** 一時停止・再開の対象の線が無い。方式の側で `not_found` にする。 */
export class GraphLinkNotFoundError extends Error {
  constructor(readonly linkId: string) {
    super(`no such link: ${linkId}`);
    this.name = "GraphLinkNotFoundError";
  }
}

/** 閉じた後（サーバの終了でロックを放す前）の書き込み。方式の側で `internal` にする（ロックを放した後に graph.json を書かない）。 */
export class GraphStoreClosedError extends Error {
  constructor() {
    super("graph store is closed (server shutting down)");
    this.name = "GraphStoreClosedError";
  }
}

function linkNumber(id: string): number {
  return Number(id.slice(1));
}

function parseGraphFile(raw: string): GraphDraftState {
  const v: unknown = JSON.parse(raw);
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error("not an object");
  const r = v as Record<string, unknown>;
  if (r["schema"] !== 1) throw new Error("unknown schema");
  const inner = r["graph"];
  if (typeof inner !== "object" || inner === null || Array.isArray(inner))
    throw new Error("bad graph");
  // zod は無い省略可能な項目を作らない（`stale: undefined` にならない）ので、`exactOptionalPropertyTypes` の型へそのまま渡せる。
  const graph = GraphSchema.parse({ ...inner, rev: r["rev"] }) as Graph;
  // 意味の検証にも落ちるなら壊れているとみなす（手で書き換えたファイル等。起動は止めない）。
  if (validateGraph(graph).length > 0) throw new Error("invalid graph");
  const maxId = Math.max(0, ...graph.links.map((l) => linkNumber(l.id)));
  const next = r["nextLinkId"];
  const nextLinkId =
    typeof next === "number" && Number.isSafeInteger(next) && next > maxId ? next : maxId + 1;
  return { graph, nextLinkId };
}

export class GraphStore {
  private readonly filePath: string;
  private readonly backupsDir: string;
  private state: GraphDraftState = { graph: emptyGraph(), nextLinkId: 1 };
  /** 書き込みを 1 本に並べる（rev の確かめと保存の間に別の変更が割り込まない）。 */
  private queue: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<(graph: Graph, byClientId: string | null) => void>();
  private closed = false;

  constructor(
    stateDir: string,
    /** 変更の知らせ（`onChange`）が投げたとき（ログに残す。既定は何もしない）。 */
    private readonly onListenerError?: (err: unknown) => void,
  ) {
    this.filePath = join(stateDir, GRAPH_FILE_NAME);
    this.backupsDir = join(stateDir, "graph-backups");
  }

  /** 読み込む（状態ディレクトリのロックを取った後に 1 回）。無ければ空（rev 0）。壊れていれば退避して空から始める。読めない（権限等）は投げる。 */
  async load(): Promise<"ok" | "missing" | { corrupt: string }> {
    const result = await readFileWithBackup(this.filePath, this.backupsDir, parseGraphFile);
    if (result.kind === "ok") {
      this.state = result.data;
      return "ok";
    }
    this.state = { graph: emptyGraph(), nextLinkId: 1 };
    return result.kind === "missing" ? "missing" : { corrupt: result.backupPath };
  }

  /**
   * 手元のノードをすべて無効（`stale`）にする。`session.json` が読めずに pane の id を 1 から振り直した起動で呼ぶ（research F1.2）——保存した `local:p3` が
   * 別の pane を指さないよう、利用者が選び直すか除くまで線を動かさない。無効にしたノードの数を返す（0 なら保存しない）。
   */
  async markLocalStale(): Promise<number> {
    let marked = 0;
    await this.commit((s) => {
      const nodes = s.graph.nodes.map((n) => {
        if (!isLocalNodeKey(n.key) || n.stale === true) return n;
        marked++;
        return { ...n, stale: true as const };
      });
      return marked === 0 ? null : { ...s, graph: { ...s.graph, nodes } };
    }, null);
    return marked;
  }

  get(): Graph {
    return structuredClone(this.state.graph);
  }

  /** 操作をまとめて当てて保存する（1 rev）。`baseRev` が今の rev と違えば `GraphRevConflictError`、当てられなければ `GraphInvalidError`。 */
  update(baseRev: number, ops: readonly GraphOp[], byClientId: string): Promise<Graph> {
    return this.commit((s) => {
      if (baseRev !== s.graph.rev) throw new GraphRevConflictError(baseRev, s.graph.rev);
      const r = applyGraphOps(s, ops);
      if (!r.ok) throw new GraphInvalidError(r.issues);
      return { graph: r.graph, nextLinkId: r.nextLinkId };
    }, byClientId);
  }

  /** 一時停止（`linkId` 無し＝全体）。線が無ければ `GraphLinkNotFoundError`。 */
  pause(linkId: string | undefined, byClientId: string | null): Promise<Graph> {
    return this.commit((s) => {
      if (linkId === undefined)
        return s.graph.paused ? null : { ...s, graph: { ...s.graph, paused: true } };
      const link = this.findLink(s, linkId);
      // 既に止めている（利用者か上限で）なら変えない（rev を進めると他の編集に要らない rev_conflict を起こす）。
      if (link.paused !== null) return null;
      return {
        ...s,
        graph: {
          ...s.graph,
          links: s.graph.links.map((l) => (l.id === linkId ? { ...l, paused: "user" } : l)),
        },
      };
    }, byClientId);
  }

  /** 再開（`linkId` 無し＝全体。全体の再開は線の状態を変えない）。線の再開は回数を 0 に戻す（D1-4）。既にその状態なら何もしない。 */
  resume(linkId: string | undefined, byClientId: string | null): Promise<Graph> {
    return this.commit((s) => {
      if (linkId === undefined)
        return s.graph.paused ? { ...s, graph: { ...s.graph, paused: false } } : null;
      const link = this.findLink(s, linkId);
      if (link.paused === null && link.count === 0) return null;
      return {
        ...s,
        graph: {
          ...s.graph,
          links: s.graph.links.map((l) => (l.id === linkId ? { ...l, paused: null, count: 0 } : l)),
        },
      };
    }, byClientId);
  }

  /** 待ち行列の書き込みが終わるのを待つ（handoff・終了の前）。 */
  async flush(): Promise<void> {
    await this.queue;
  }

  /**
   * 閉じる（サーバの終了。ロックを放す前に呼ぶ）。待ち行列の書き込みを待ち、以後の書き込み（まだ開いている接続からの `graph.update` 等）は
   * `GraphStoreClosedError` で断る——flush の後に届いた変更をロックを放した後に書かない。読み（`get`）はそのまま。
   */
  async close(): Promise<void> {
    this.closed = true;
    await this.queue;
  }

  /** 保存できた変更を知らせる（`composeServer` が `graph.changed` として全クライアントへ配る）。 */
  onChange(fn: (graph: Graph, byClientId: string | null) => void): { dispose(): void } {
    this.listeners.add(fn);
    return { dispose: () => this.listeners.delete(fn) };
  }

  private findLink(s: GraphDraftState, linkId: string): Graph["links"][number] {
    const link = s.graph.links.find((l) => l.id === linkId);
    if (link === undefined) throw new GraphLinkNotFoundError(linkId);
    return link;
  }

  /**
   * 待ち行列の上で `change` を今の状態に当て、rev を +1 して保存し、保存できてから知らせる。`change` が null を返せば何もしない（保存も知らせも無し）。
   * `change` は投げてよい（何も変えずにその例外で失敗する）。
   */
  private commit(
    change: (s: GraphDraftState) => GraphDraftState | null,
    byClientId: string | null,
  ): Promise<Graph> {
    // 閉じた後に来た書き込みは並べずに断る（閉じる前に並んだものは書き終える）。
    if (this.closed) return Promise.reject(new GraphStoreClosedError());
    const run = async (): Promise<Graph> => {
      const changed = change(this.state);
      if (changed === null) return this.get();
      const next: GraphDraftState = {
        graph: { ...changed.graph, rev: this.state.graph.rev + 1 },
        nextLinkId: changed.nextLinkId,
      };
      const { rev, ...graph } = next.graph;
      const data: GraphFileData = {
        schema: 1,
        rev,
        nextLinkId: next.nextLinkId,
        graph,
        savedAt: new Date().toISOString(),
      };
      await writeFileAtomic(this.filePath, `${JSON.stringify(data, null, 2)}\n`);
      this.state = next;
      // 保存は済んでいる。知らせる先が投げても失敗にしない（保存したのに失敗と答え、同じ変更を送り直させない）。
      for (const fn of [...this.listeners]) {
        try {
          fn(this.get(), byClientId);
        } catch (err) {
          this.onListenerError?.(err);
        }
      }
      return this.get();
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }
}
