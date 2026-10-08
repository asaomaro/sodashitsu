import { join } from "node:path";
import { GraphSchema, type Graph, type GraphOp } from "@sodashitsu/protocol";
import {
  applyGraphOps,
  emptyGraph,
  validateGraph,
  type GraphDraftState,
  type GraphIssue,
} from "@sodashitsu/client-core";
import { backupCorruptFile, readFileWithBackup, writeFileAtomic } from "./atomicFile.js";

/**
 * 連携のグラフ（20260927-agent-graph の design「server」・research F4.1）。session ごとに 1 枚を状態ディレクトリの `graph.json`（0600・原子的な書き込み）に置く。
 * 形は `PrefsStore` と同じ（書き込みの待ち行列・rev・壊れていれば退避・保存できてから `onChange`）。実行の履歴は置かない（メモリだけ。architecture「履歴はメモリ」）。
 */
export const GRAPH_FILE_NAME = "graph.json";

/**
 * 保存の `schema`（20261008-graph-first D15）。1 = 以前の版（手元のノード 64 まで・pane を選んで載せる）、2 = 手元のすべての pane のノードを持つ。
 * 古い版は `schema: 1` しか読まない——2 のファイルは、壊れたファイルとして `graph-backups/` へ退避して空のグラフで起動する（今の作りのまま）。
 * 移行の間（`migrationPending`）の保存は 1 のまま書き、`completeMigration` で 2 にする（途中で落ちても、元の形のファイルが残る）。
 */
export const GRAPH_SCHEMA = 2;
const GRAPH_SCHEMA_V1 = 1;

interface GraphFileData {
  schema: 1 | 2;
  rev: number;
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

interface ParsedGraphFile {
  state: GraphDraftState;
  schema: 1 | 2;
  raw: string;
}

function parseGraphFile(raw: string): ParsedGraphFile {
  const v: unknown = JSON.parse(raw);
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error("not an object");
  const r = v as Record<string, unknown>;
  const schema = r["schema"];
  if (schema !== GRAPH_SCHEMA_V1 && schema !== GRAPH_SCHEMA) throw new Error("unknown schema");
  const inner = r["graph"];
  if (typeof inner !== "object" || inner === null || Array.isArray(inner))
    throw new Error("bad graph");
  // zod は無い省略可能な項目を作らない（`stale: undefined` にならない）ので、`exactOptionalPropertyTypes` の型へそのまま渡せる。
  const graph = GraphSchema.parse({ ...inner, rev: r["rev"] }) as Graph;
  // 意味の検証にも落ちるなら壊れているとみなす（手で書き換えたファイル等。起動は止めない）。
  if (validateGraph(graph).length > 0) throw new Error("invalid graph");
  return { state: { graph }, schema, raw };
}

export class GraphStore {
  private readonly filePath: string;
  private readonly backupsDir: string;
  private state: GraphDraftState = { graph: emptyGraph() };
  /** 書き込みを 1 本に並べる（rev の確かめと保存の間に別の変更が割り込まない）。 */
  private queue: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<(graph: Graph, byClientId: string | null) => void>();
  private closed = false;
  /** 以前の版（`schema: 1`）のファイルを読み込み、まだ `schema: 2` で保存していない。 */
  private pendingMigration = false;

  constructor(
    stateDir: string,
    /** 変更の知らせ（`onChange`）が投げたとき（ログに残す。既定は何もしない）。 */
    private readonly onListenerError?: (err: unknown) => void,
    /** 線の id の採番（既定は UUID。テストで決まった値を差し込める）。 */
    private readonly newLinkId?: () => string,
  ) {
    this.filePath = join(stateDir, GRAPH_FILE_NAME);
    this.backupsDir = join(stateDir, "graph-backups");
  }

  /**
   * 以前の版（`schema: 1`）のファイルを読み込んだ後、`schema: 2` で保存し終えるまで true（20261008-graph-first の移行）。この間の保存は `schema: 1` の
   * まま書く。呼び出し側（起動）が、維持（`reconcileGraph` と詰め直し）を済ませてから `completeMigration()` を呼ぶ。
   */
  get migrationPending(): boolean {
    return this.pendingMigration;
  }

  /**
   * 読み込む（状態ディレクトリのロックを取った後に 1 回）。無ければ空（rev 0）。壊れていれば退避して空から始める。読めない（権限等）は投げる。
   * `schema: 1` のファイルは、**読めたら、移行の前に必ず**元のファイルの控えを `graph-backups/` に書く（既存の退避の仕組み）。
   */
  async load(): Promise<"ok" | "missing" | { corrupt: string }> {
    this.pendingMigration = false;
    const result = await readFileWithBackup(this.filePath, this.backupsDir, parseGraphFile);
    if (result.kind === "ok") {
      this.state = result.data.state;
      if (result.data.schema === GRAPH_SCHEMA_V1) {
        await backupCorruptFile(this.filePath, this.backupsDir, result.data.raw);
        this.pendingMigration = true;
      }
      return "ok";
    }
    this.state = { graph: emptyGraph() };
    return result.kind === "missing" ? "missing" : { corrupt: result.backupPath };
  }

  get(): Graph {
    return structuredClone(this.state.graph);
  }

  /** 操作をまとめて当てて保存する（1 rev）。`baseRev` が今の rev と違えば `GraphRevConflictError`、当てられなければ `GraphInvalidError`。 */
  update(baseRev: number, ops: readonly GraphOp[], byClientId: string): Promise<Graph> {
    return this.commit((s) => {
      if (baseRev !== s.graph.rev) throw new GraphRevConflictError(baseRev, s.graph.rev);
      const r = applyGraphOps(s, ops, this.newLinkId);
      if (!r.ok) throw new GraphInvalidError(r.issues);
      return { graph: r.graph };
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

  /**
   * 線が 1 回送ったことを数える（`GraphEngine`。byClientId は null。rev は上げない）。上限に達したら `paused: "limit"` にする（D1-4。既に止まっていれば変えない）。線が消えていれば何もしない
   * （送っている間に削除された）。上限に達したかを返す（線が無ければ null）。
   */
  async recordRun(linkId: string): Promise<{ limitReached: boolean } | null> {
    let result: { limitReached: boolean } | null = null;
    await this.commit(
      (s) => {
        const link = s.graph.links.find((l) => l.id === linkId);
        if (link === undefined) return null;
        const count = link.count + 1;
        const limitReached = count >= link.limit;
        result = { limitReached };
        // 既に止まっている線（送っている途中に利用者が止めた）は、その止め方のまま。
        const next = {
          ...link,
          count,
          ...(limitReached && link.paused === null ? { paused: "limit" as const } : {}),
        };
        return {
          ...s,
          graph: { ...s.graph, links: s.graph.links.map((l) => (l.id === linkId ? next : l)) },
        };
      },
      null,
      { bumpRev: false },
    );
    return result;
  }

  /**
   * 移行を終える: 今の状態を `schema: 2` で保存し直す（rev は進めない。変えた内容は、移行の間の保存〔`schema: 1` のまま〕で済んでいる）。
   * 移行中でなければ何もしない。書けなかったら投げる（`schema: 1` のファイルが残るので、次の起動でもう一度移行する）。
   */
  async completeMigration(): Promise<void> {
    if (!this.pendingMigration) return;
    if (this.closed) throw new GraphStoreClosedError();
    const run = async (): Promise<void> => {
      await this.writeFile(this.state.graph, GRAPH_SCHEMA);
      this.pendingMigration = false;
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    await result;
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

  private async writeFile(full: Graph, schema: 1 | 2): Promise<void> {
    const { rev, ...graph } = full;
    const data: GraphFileData = { schema, rev, graph, savedAt: new Date().toISOString() };
    await writeFileAtomic(this.filePath, `${JSON.stringify(data, null, 2)}\n`);
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
    /** 実行の回数（count と上限の一時停止）だけの変化は rev を上げない——画面は回数を編集しないので、その変化で他の画面の編集を rev_conflict にしない。 */
    opts: { bumpRev: boolean } = { bumpRev: true },
  ): Promise<Graph> {
    // 閉じた後に来た書き込みは並べずに断る（閉じる前に並んだものは書き終える）。
    if (this.closed) return Promise.reject(new GraphStoreClosedError());
    const run = async (): Promise<Graph> => {
      const changed = change(this.state);
      if (changed === null) return this.get();
      const next: GraphDraftState = {
        graph: { ...changed.graph, rev: this.state.graph.rev + (opts.bumpRev ? 1 : 0) },
      };
      await this.writeFile(next.graph, this.pendingMigration ? GRAPH_SCHEMA_V1 : GRAPH_SCHEMA);
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
