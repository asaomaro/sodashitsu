import type { Pane, Tab, Workspace } from "@sodashitsu/protocol";
import { paneNameOf } from "../store/paneName.js";

/**
 * 知らせる対象の呼び名を組み立てる（design 振る舞い 4「文言」）。
 *
 * **`AgentInfo.label` を先頭に置かない**——あれは「Claude Code」のような**エージェントの種類名**で
 * （`packages/server/src/agent/agents.ts` の `AGENTS`）、**同じ tab で 2 つ回すと文言が完全に同じになる**。
 * requirements の機能要件は「どの workspace のどの pane か」を求めているので、
 * **既存の呼び名の流儀**（`store/paneName.ts`）に従って pane 自身の名前を先に見る。
 *
 * ストアそのものではなく Map を受け取る——**純粋関数にして単体で総当たりできるようにする**ため。
 */
export interface TargetLookup {
  panes: ReadonlyMap<string, Pane>;
  tabs: ReadonlyMap<string, Tab>;
  workspaces: ReadonlyMap<string, Workspace>;
}

export interface TargetParts {
  /** pane の呼び名。OS 通知の title に使う。 */
  paneName: string;
  /** `<workspace> / <tab>`。OS 通知の body に使う。引けない分は落とすので**空文字になりうる**。 */
  place: string;
}

/** pane が引けなかったときの呼び名（閉じた後の知らせにも文言が要る。AC11）。 */
export const CLOSED_PANE_NAME = "（閉じられた pane）";

/** 呼び名の部品。**引けないものは落とす**（design の表のとおり）。 */
export function describeParts(lookup: TargetLookup, paneId: string): TargetParts {
  const pane = lookup.panes.get(paneId);
  if (!pane) return { paneName: CLOSED_PANE_NAME, place: "" };

  const paneName = paneNameOf(pane);
  const tab = lookup.tabs.get(pane.tabId);
  if (!tab) return { paneName, place: "" };

  const workspace = lookup.workspaces.get(tab.workspaceId);
  return { paneName, place: workspace ? `${workspace.label} / ${tab.label}` : tab.label };
}

/** トーストと待ち行列に載せる 1 行の呼び名。場所が引けなければ pane の名前だけを返す。 */
export function describeTarget(lookup: TargetLookup, paneId: string): string {
  const { paneName, place } = describeParts(lookup, paneId);
  return place ? `${paneName}（${place}）` : paneName;
}
