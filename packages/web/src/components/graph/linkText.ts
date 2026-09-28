import type {
  ApprovalConfig,
  GraphLink,
  LinkKind,
  LinkRunReason,
  LinkRunResult,
  NodeKey,
  TriggerConfig,
} from "@sodashitsu/protocol";
import type { LinkDraft } from "@sodashitsu/client-core";

/**
 * 線の文言（20260927-agent-graph の design「線の種類の見た目」「エラー処理」）。チップ・読み上げ・パネル・履歴・モバイルのシートが同じ文言を使う。
 */
export const LINK_KIND_NAME: Record<LinkKind, string> = {
  trigger: "トリガ",
  supervise: "監督",
  approval: "承認の代理",
};

/** 線の上の短いラベル（design の表: 「完了→」「承認待ち→」「監督」「承認」）。 */
export function linkShortLabel(link: Pick<GraphLink, "kind" | "trigger">): string {
  if (link.kind === "trigger") return link.trigger?.on === "blocked" ? "承認待ち→" : "完了→";
  return link.kind === "supervise" ? "監督" : "承認";
}

const FIRED_MARK: Record<LinkRunResult, string> = {
  sent: "✓",
  waiting: "…",
  skipped: "⏭",
  failed: "✕",
};

/** 一時停止の印（色に頼らず文字で）。止まっていなければ空。 */
export function pauseMark(link: Pick<GraphLink, "paused">, graphPaused: boolean): string {
  if (link.paused === "limit") return "⏸ 上限";
  if (link.paused === "user") return "⏸";
  if (graphPaused) return "⏸ 全体";
  return "";
}

/** 中点のチップの文字（ラベル・回数/上限・一時停止・無効・直前の結果）。 */
export function linkChipText(
  link: GraphLink,
  o: { invalid: boolean; graphPaused: boolean; fired: LinkRunResult | null },
): string {
  const parts = [linkShortLabel(link), `${link.count}/${link.limit}`];
  const p = pauseMark(link, o.graphPaused);
  if (p) parts.push(p);
  if (o.invalid) parts.push("⚠");
  if (o.fired) parts.push(FIRED_MARK[o.fired]);
  return parts.join(" ");
}

/** 線の状態の言葉（読み上げ・パネル）。 */
export function linkStateText(
  link: Pick<GraphLink, "paused">,
  o: { invalid: boolean; graphPaused: boolean },
): string {
  if (o.invalid) return "無効（pane がありません）";
  if (link.paused === "limit") return "上限に達して一時停止中";
  if (link.paused === "user") return "一時停止中";
  if (o.graphPaused) return "全体が一時停止中";
  return "有効";
}

/** 線の読み上げの名前（research-ui §2.12: 「トリガ: impl → review（完了のとき）・実行 3/10・有効」）。 */
export function linkDescription(
  link: GraphLink,
  title: string,
  o: { invalid: boolean; graphPaused: boolean },
): string {
  const cond =
    link.kind === "trigger"
      ? link.trigger?.on === "blocked"
        ? "（承認待ちになったとき）"
        : "（完了したとき）"
      : link.kind === "approval"
        ? link.approval?.mode === "delegate"
          ? "（返答まで任せる）"
          : "（知らせるだけ）"
        : "";
  return `${LINK_KIND_NAME[link.kind]}: ${title}${cond}・実行 ${link.count}/${link.limit}・${linkStateText(link, o)}`;
}

export const RUN_RESULT_TEXT: Record<LinkRunResult, string> = {
  sent: "送った",
  waiting: "待っている",
  skipped: "見送った",
  failed: "失敗",
};

/** 履歴の理由（decisions D5-1 の busy・resolved を含む）。 */
export const RUN_REASON_TEXT: Record<LinkRunReason, string> = {
  busy: "先が作業中（見送る設定）",
  resolved: "送る前に承認待ちが解けた",
  busy_timeout: "先の手が 30 分空かなかった",
  target_absent: "先のエージェントが居ない",
  blocked: "先が承認待ち",
  paused: "一時停止中",
  machine_unavailable: "マシンに繋がっていない",
  limit: "上限に達した",
  error: "送れなかった",
};

/** 線の設定のパネルが保存するもの（`LinkPanel` → `GraphView`）。 */
export interface LinkPanelSave {
  /** 既存の線なら id。 */
  id?: string;
  kind: LinkKind;
  from: NodeKey;
  to: NodeKey;
  trigger?: TriggerConfig;
  approval?: ApprovalConfig;
  limit: number;
}

/** 検証（client-core の `validateLink`）に渡す形。 */
export function linkDraftOf(p: LinkPanelSave): LinkDraft {
  return {
    ...(p.id === undefined ? {} : { id: p.id }),
    kind: p.kind,
    from: p.from,
    to: p.to,
    ...(p.trigger === undefined ? {} : { trigger: p.trigger }),
    ...(p.approval === undefined ? {} : { approval: p.approval }),
  };
}
