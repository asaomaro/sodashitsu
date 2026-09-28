import { z } from "zod";

/**
 * エージェントの連携のグラフ（20260927-agent-graph の design「インターフェース / データ構造」）。session（`soda serve`）ごとに 1 枚をサーバが持ち、
 * `graph.json` に保存する。ノードは pane、線は 3 種類（トリガ・監督・承認の代理）。線の意味の検証（自己参照・重複・上限など）は client-core の
 * `graph/validate` が持ち、ここは形と大きさだけを見る。
 */

/** ノードの鍵。手元の pane は `local:<paneId>`、登録したマシンの pane は `<machineId(32 桁の 16 進)>:<paneId>`。 */
export type NodeKey = string;
export const NODE_KEY_RE = /^(local|[0-9a-f]{32}):p[1-9][0-9]*$/;

export const GRAPH_NODES_MAX = 64;
export const GRAPH_LINKS_MAX = 128;
/** トリガの prompt の上限（UTF-8 のバイト数）。 */
export const GRAPH_PROMPT_MAX_BYTES = 8 * 1024;
/** 線ごとの実行回数の上限の範囲（D1-4）。 */
export const LINK_LIMIT_MIN = 1;
export const LINK_LIMIT_MAX = 100;
/** 受け渡す画面の末尾の行数の範囲。 */
export const LINK_LINES_MIN = 1;
export const LINK_LINES_MAX = 500;
/** 1 回の `graph.update` の操作の数の上限（全ノード・全線を作り直しても収まる数）。 */
export const GRAPH_OPS_MAX = 256;
/** 座標の絶対値の上限（ズーム前の画面の px）。 */
export const GRAPH_COORD_MAX = 1_000_000;
/** 履歴は線ごとに直近この件数（サーバのメモリだけ。`graph.json` には保存しない）。 */
export const GRAPH_HISTORY_PER_LINK = 50;

export type LinkKind = "trigger" | "supervise" | "approval";

export interface TriggerConfig {
  on: "done" | "blocked";
  /** `{output}` を含めば、そこへ元の画面の末尾を差し込む（無ければ末尾に足す）。 */
  prompt: string;
  /** null = 受け渡さない。 */
  output: { lines: number } | null;
  whenBusy: "wait" | "skip";
}

/** 監督役に返答まで任せる（delegate）／知らせるだけ（notify。既定。decisions D2）。 */
export interface ApprovalConfig {
  mode: "delegate" | "notify";
  lines: number;
}

export interface GraphNode {
  key: NodeKey;
  /** 位置（ズーム前の px。グリッドへの吸着はクライアントが行う）。 */
  x: number;
  y: number;
  /**
   * 無効（`session.json` が読めずに pane の id を振り直した起動で、手元のノードに付く。research F1.2）。付いたノードの線は動かない。
   * 利用者がノードを選び直す（`rekey_node`）か除くまで残る。無効でなければ項目ごと無い。
   */
  stale?: true;
}

export interface GraphLink {
  /** "l1"…（サーバが採番。消した線の id は使い回さない）。 */
  id: string;
  kind: LinkKind;
  /** trigger: 元 / supervise・approval: 配下。 */
  from: NodeKey;
  /** trigger: 先 / supervise・approval: 監督役。 */
  to: NodeKey;
  /** kind が trigger のときだけ。 */
  trigger?: TriggerConfig;
  /** kind が approval のときだけ。 */
  approval?: ApprovalConfig;
  limit: number;
  /** 今の実行回数（サーバが数える。再開で 0）。 */
  count: number;
  paused: "user" | "limit" | null;
}

export interface Graph {
  /** 保存のたびに +1（0 = 一度も保存していない）。`graph.update` の `baseRev` と比べる。 */
  rev: number;
  /** 全体の一時停止。 */
  paused: boolean;
  nodes: GraphNode[];
  links: GraphLink[];
}

export type LinkRunResult = "sent" | "waiting" | "skipped" | "failed";
export type LinkRunReason =
  | "busy_timeout"
  | "target_absent"
  | "blocked"
  | "paused"
  | "machine_unavailable"
  | "limit"
  | "error";

/** 線の 1 回の実行の記録（履歴）。 */
export interface LinkRun {
  linkId: string;
  at: number;
  result: LinkRunResult;
  reason?: LinkRunReason;
  /** 送った文面の先頭 200 文字（失敗ならエラーの文）。 */
  text?: string;
}

// --- 実行時のスキーマ ---------------------------------------------------

function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).byteLength;
}

const nodeKey = z.string().regex(NODE_KEY_RE);
const coord = z.number().finite().min(-GRAPH_COORD_MAX).max(GRAPH_COORD_MAX);
const linkId = z.string().regex(/^l[1-9][0-9]*$/);
const lines = z.number().int().min(LINK_LINES_MIN).max(LINK_LINES_MAX);
const limit = z.number().int().min(LINK_LIMIT_MIN).max(LINK_LIMIT_MAX);
const linkKind = z.enum(["trigger", "supervise", "approval"]);

export const TriggerConfigSchema = z.object({
  on: z.enum(["done", "blocked"]),
  prompt: z.string().refine((s) => utf8Bytes(s) <= GRAPH_PROMPT_MAX_BYTES, "prompt too large"),
  output: z.object({ lines }).nullable(),
  whenBusy: z.enum(["wait", "skip"]),
});
export const ApprovalConfigSchema = z.object({
  mode: z.enum(["delegate", "notify"]),
  lines,
});

export const GraphNodeSchema = z.object({
  key: nodeKey,
  x: coord,
  y: coord,
  stale: z.literal(true).optional(),
});
export const GraphLinkSchema = z.object({
  id: linkId,
  kind: linkKind,
  from: nodeKey,
  to: nodeKey,
  trigger: TriggerConfigSchema.optional(),
  approval: ApprovalConfigSchema.optional(),
  limit,
  count: z.number().int().min(0),
  paused: z.enum(["user", "limit"]).nullable(),
});
/** 保存したグラフ（`graph.json` の読み込みで形を確かめる）。 */
export const GraphSchema = z.object({
  rev: z.number().int().min(0),
  paused: z.boolean(),
  nodes: z.array(GraphNodeSchema).max(GRAPH_NODES_MAX),
  links: z.array(GraphLinkSchema).max(GRAPH_LINKS_MAX),
});

/**
 * `graph.update` の 1 つの操作。まとめて 1 rev で当てる（途中で 1 つでも不正なら何も変えない）。
 * - `add_node`・`move_node`・`remove_node`（線も一緒に消える）・`rekey_node`（無効なノードを別の pane に選び直す。線はそのまま付け替え、`stale` を外す）
 * - `add_link`（id はサーバが採番。`approval`・`limit` は省けば既定）・`update_link`（設定だけ。`count`・`paused` は変えない）・`remove_link`
 */
export const GraphOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add_node"), key: nodeKey, x: coord, y: coord }),
  z.object({ op: z.literal("move_node"), key: nodeKey, x: coord, y: coord }),
  z.object({ op: z.literal("remove_node"), key: nodeKey }),
  z.object({ op: z.literal("rekey_node"), key: nodeKey, newKey: nodeKey }),
  z.object({
    op: z.literal("add_link"),
    kind: linkKind,
    from: nodeKey,
    to: nodeKey,
    trigger: TriggerConfigSchema.optional(),
    approval: ApprovalConfigSchema.optional(),
    limit: limit.optional(),
  }),
  z.object({
    op: z.literal("update_link"),
    id: linkId,
    trigger: TriggerConfigSchema.optional(),
    approval: ApprovalConfigSchema.optional(),
    limit: limit.optional(),
  }),
  z.object({ op: z.literal("remove_link"), id: linkId }),
]);
export type GraphOp = z.infer<typeof GraphOpSchema>;

export const GraphGetParams = z.object({});
export type GraphGetParams = z.infer<typeof GraphGetParams>;

/** `baseRev` が今の rev と違えば `rev_conflict` で断る（配置のドラッグが他の変更を黙って消さないため）。 */
export const GraphUpdateParams = z.object({
  baseRev: z.number().int().min(0),
  ops: z.array(GraphOpSchema).min(1).max(GRAPH_OPS_MAX),
});
export type GraphUpdateParams = z.infer<typeof GraphUpdateParams>;

/** `linkId` 無し＝全体。線の再開は `count` を 0 に戻す（全体の再開は線の状態を変えない）。 */
export const GraphPauseParams = z.object({ linkId: linkId.optional() });
export type GraphPauseParams = z.infer<typeof GraphPauseParams>;
export const GraphResumeParams = z.object({ linkId: linkId.optional() });
export type GraphResumeParams = z.infer<typeof GraphResumeParams>;

export const GraphHistoryParams = z.object({
  linkId: linkId.optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(GRAPH_HISTORY_PER_LINK * GRAPH_LINKS_MAX)
    .optional(),
});
export type GraphHistoryParams = z.infer<typeof GraphHistoryParams>;
/** 新しい順。 */
export interface GraphHistoryResult {
  runs: LinkRun[];
}
