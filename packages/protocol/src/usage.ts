/**
 * エージェントの利用状況（20261010-agent-usage。トークン・コスト・コンテキストの使用率・制限の枠）の、種類によらない共通の形。
 * 種類ごとの取り方（アダプタ。サーバの `usage/`）が、この形に寄せて返す。**無い項目は、無い**（0 ではない）。
 * 配るのは数字・モデル名・時刻・ラベルだけ（会話の中身・記録の場所・利用者が付けたセッションの名前は含まない）。
 */

/** トークン数の、数え方の印。 */
export type UsageTokenBasis =
  /** 公式の会計の累計（`cost-state` の行〔と、その後の記録の分〕）。 */
  | "cumulative"
  /** 記録に残っている分の合計（確定した累計とは言わない。記録に残らない呼び出しの分は含まない。下限）。 */
  | "transcript"
  /** いま文脈にある分（ステータスラインの入力。累計ではない）。 */
  | "context";

export interface UsageTokenCounts {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  reasoning?: number;
  total?: number;
}

export interface AgentUsageTokens extends UsageTokenCounts {
  basis: UsageTokenBasis;
}

/** 記録に残る分の内訳（主のエージェントと、サブエージェント）。 */
export interface AgentUsageBreakdown {
  main: UsageTokenCounts;
  subagents: UsageTokenCounts & { files: number };
}

/** どこから得た値か。 */
export type UsageSource = "statusline" | "transcript" | "cost-state" | "rollout";

/** セッション（pane のエージェント）ごとの利用状況。 */
export interface AgentUsage {
  paneId: string;
  /** エージェントの種類（`claude`・`codex`…）。 */
  kind: string;
  /** モデルの名前（記録に出た最後の主の応答。分からなければ null）。 */
  model: string | null;
  tokens: AgentUsageTokens;
  /** 記録に残る分の内訳。 */
  breakdown?: AgentUsageBreakdown;
  /** コスト（USD）。製品は単価の表を持たない: 報告・`cost-state` の値だけ。無ければ項目ごと無い。 */
  costUsd?: number;
  /** `reported`＝エージェントの報告（見積り）・`cost-state`＝記録の会計の行（`costAsOf` の時点）。 */
  costBasis?: "reported" | "cost-state";
  /** コストの時点（epoch ms。`cost-state` は区切りにだけ書かれるので、その後の分は含まない）。 */
  costAsOf?: number;
  /** いま文脈にあるトークン数（最後の主の応答。入力・キャッシュの読み書き）。 */
  contextTokens?: number;
  /** 窓の大きさが分かるときだけ。 */
  contextWindowTokens?: number;
  /** 0〜100。窓の大きさが分かるときだけ（無ければ、トークン数だけ）。 */
  contextUsedPct?: number;
  premiumRequests?: number;
  source: UsageSource;
  /** 最後に値を得た時刻（epoch ms。記録の最後の応答の時刻）。古ければ、画面がそう出す。 */
  updatedAt: number;
  /** 大きな記録の末尾だけを読んだ（初めの分は含まない）。 */
  partial?: boolean;
  /** まだ記録を読んでいる途中（次に呼ぶと、増える）。 */
  scanning?: boolean;
  /** この会話の記録を読む量の生涯の上限に達したので、**更新を止めた**（数字は止まった時点のもの。`partial` も付く）。 */
  updatesStopped?: boolean;
}

/** アカウント全体の、制限の 1 つの枠。 */
export interface UsageWindow {
  /** 「5 時間」「週」「N 分」など。 */
  label: string;
  usedPct: number;
  /** リセットの時刻（epoch ms）。 */
  resetsAt?: number;
  windowMinutes?: number;
  /** リセットの時刻を過ぎている（次の報告まで、値が古い）。画面は「古い」と出す。 */
  stale?: boolean;
  /** 組織の枠（`spend_limit`）の、使った額・上限（USD）。 */
  usedUsd?: number;
  limitUsd?: number;
}

export interface AccountUsage {
  kind: string;
  /** 設定のフォルダの根（`CLAUDE_CONFIG_DIR`・`CODEX_HOME`）とマシンの id から作った不透明な鍵。 */
  accountKey: string;
  /** 画面に出す名前（既定は種類の名前。同じ種類が複数あるときは、根のフォルダ名を添える）。 */
  label: string;
  windows: UsageWindow[];
  plan?: string;
  source: UsageSource;
  asOf: number;
}

export interface AgentUsageResult {
  /** pane の id → 利用状況。取れない（対応しない種類・エージェントが居ない・会話の id が分からない・記録が読めない）ものは null。 */
  panes: Record<string, AgentUsage | null>;
  accounts: AccountUsage[];
}
