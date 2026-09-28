import type {
  ApprovalConfig,
  GraphLink,
  GraphOp,
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

/** 線の上の短いラベル（design の表: 「完了→」「承認待ち→」「監督」「承認」。承認は「承認・返答」「承認・通知」）。 */
export function linkShortLabel(link: Pick<GraphLink, "kind" | "trigger" | "approval">): string {
  if (link.kind === "trigger") return link.trigger?.on === "blocked" ? "承認待ち→" : "完了→";
  if (link.kind === "supervise") return "監督";
  // 返答まで任せる／知らせるだけを見た目で分ける（g03 点検）。
  return link.approval?.mode === "delegate" ? "承認・返答" : "承認・通知";
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

/** 線の設定（保存の差分の比べる単位）。 */
export type LinkConfig = Pick<GraphLink, "trigger" | "approval" | "limit">;

/** 線の設定の既存の線の値（パネルを開いた時点・「最新を読み込む」の時点）を写し取る（後でストアの値が替わっても変わらない）。 */
export function linkConfigOf(link: LinkConfig): LinkConfig {
  return {
    ...(link.trigger === undefined
      ? {}
      : {
          trigger: {
            ...link.trigger,
            output: link.trigger.output === null ? null : { ...link.trigger.output },
          },
        }),
    ...(link.approval === undefined ? {} : { approval: { ...link.approval } }),
    limit: link.limit,
  };
}

/** パネルの項目（差分と「他で変わりました」の単位）。 */
export type LinkField =
  "on" | "prompt" | "output" | "whenBusy" | "approvalMode" | "approvalLines" | "limit";

type FieldValue = string | number | null;

function fieldValues(c: LinkConfig): Partial<Record<LinkField, FieldValue>> {
  const v: Partial<Record<LinkField, FieldValue>> = { limit: c.limit };
  if (c.trigger) {
    v.on = c.trigger.on;
    v.prompt = c.trigger.prompt;
    v.output = c.trigger.output?.lines ?? null;
    v.whenBusy = c.trigger.whenBusy;
  }
  if (c.approval) {
    v.approvalMode = c.approval.mode;
    v.approvalLines = c.approval.lines;
  }
  return v;
}

const ON_TEXT: Record<TriggerConfig["on"], string> = {
  done: "完了した",
  blocked: "承認待ちになった",
};
const BUSY_TEXT: Record<TriggerConfig["whenBusy"], string> = {
  wait: "手が空くまで待つ",
  skip: "見送る",
};
const MODE_TEXT: Record<ApprovalConfig["mode"], string> = {
  notify: "知らせるだけ",
  delegate: "返答まで任せる",
};

/** 「他で変わりました」に出す、その項目の今の値（「上限（最新: 30 回）」）。 */
export function linkFieldText(field: LinkField, link: LinkConfig): string {
  const v = fieldValues(link)[field] ?? null;
  const short = (t: string): string =>
    [...t].length > 40 ? `${[...t].slice(0, 40).join("")}…` : t;
  switch (field) {
    case "on":
      return `元が〜とき（最新: ${v === null ? "—" : ON_TEXT[v as TriggerConfig["on"]]}）`;
    case "prompt":
      return `送る文面（最新: 「${short(String(v ?? ""))}」）`;
    case "output":
      return `受け渡す行数（最新: ${v === null ? "受け渡さない" : `${v} 行`}）`;
    case "whenBusy":
      return `先が作業中なら（最新: ${v === null ? "—" : BUSY_TEXT[v as TriggerConfig["whenBusy"]]}）`;
    case "approvalMode":
      return `監督役に（最新: ${v === null ? "—" : MODE_TEXT[v as ApprovalConfig["mode"]]}）`;
    case "approvalLines":
      return `渡す画面の末尾（最新: ${v ?? "—"} 行）`;
    case "limit":
      return `上限（最新: ${v ?? "—"} 回）`;
  }
}

export type LinkEditResult =
  /** 送る操作（送るものが無ければ null）。 */
  | { op: Extract<GraphOp, { op: "update_link" }> | null }
  /** パネルで変えた項目が他でも（違う値へ）変わっていた。送らない（黙って上書きしない）。 */
  | { conflict: LinkField[] };

/**
 * 既存の線の設定の保存を、パネルを開いた時点の値（`base`）からの差分として最新の線（`latest`）に重ねる（統合レビュー R1）。
 * パネルで変えた項目だけを送り、変えていない項目（他で変わっていてもよい）は最新のまま。変えた項目が他でも違う値へ変わっていれば
 * `conflict`（同じ値へ変わっていれば送らない）。`rev_conflict` の送り直しでも、先に届いた他の変更でも同じ規則で重ねる。
 */
export function linkEditOp(
  id: string,
  base: LinkConfig,
  edited: LinkConfig,
  latest: LinkConfig,
): LinkEditResult {
  const b = fieldValues(base);
  const e = fieldValues(edited);
  const l = fieldValues(latest);
  const send: LinkField[] = [];
  const conflict: LinkField[] = [];
  for (const f of Object.keys(e) as LinkField[]) {
    if (e[f] === b[f] || e[f] === l[f]) continue;
    // 最新に無い項目（線の種類が変わった）・最新が開いた時点から変わっている項目は重ならない。
    if (!(f in l) || l[f] !== b[f]) conflict.push(f);
    else send.push(f);
  }
  if (conflict.length > 0) return { conflict };
  if (send.length === 0) return { op: null };
  const op: Extract<GraphOp, { op: "update_link" }> = { op: "update_link", id };
  const has = (...fs: LinkField[]): boolean => fs.some((f) => send.includes(f));
  if (has("on", "prompt", "output", "whenBusy")) {
    const t = latest.trigger!;
    const et = edited.trigger!;
    op.trigger = {
      on: send.includes("on") ? et.on : t.on,
      prompt: send.includes("prompt") ? et.prompt : t.prompt,
      output: send.includes("output")
        ? et.output === null
          ? null
          : { ...et.output }
        : t.output === null
          ? null
          : { ...t.output },
      whenBusy: send.includes("whenBusy") ? et.whenBusy : t.whenBusy,
    };
  }
  if (has("approvalMode", "approvalLines")) {
    const a = latest.approval!;
    const ea = edited.approval!;
    op.approval = {
      mode: send.includes("approvalMode") ? ea.mode : a.mode,
      lines: send.includes("approvalLines") ? ea.lines : a.lines,
    };
  }
  if (send.includes("limit")) op.limit = edited.limit;
  return { op };
}

/** 線の設定のパネルが保存するもの（`LinkPanel` → `GraphView`）。 */
export interface LinkPanelSave {
  /** 既存の線なら id。 */
  id?: string;
  /** 既存の線の、パネルを開いた（最新を読み込んだ）時点の設定。保存はここからの差分だけを送る（統合レビュー R1）。 */
  base?: LinkConfig;
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
