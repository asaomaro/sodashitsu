import type { Workspace } from "@sodashitsu/protocol";
import { paneMoveBlock, paneMoveBlockMessage, type DisplayFrame, type FrameInfo } from "@sodashitsu/client-core";

/**
 * ノードを動かしている間の、離したときの行き先（20261008-graph-first PR4。純関数）。
 * - `position`: 位置を変えるだけ（自分の workspace の囲い・自分の worktree グループの囲い・どの囲いの上でもない所）。
 * - `move`: pane を別の workspace の tab へ移す（囲いの上 → その workspace で選んでいる tab・見出しの tab のタグの上 → その tab）。
 * - `blocked`: 落とせない（理由つき）。離すと、つかむ前の位置へ戻る。
 * 落とせるかの判定は、サーバ・サイドバーの D&D と同じ `paneMoveBlock`（同じ worktree の workspace どうしだけ）。サーバが断ったら、離した後に元へ戻す。
 */
export type DropTarget =
  | { kind: "position" }
  | { kind: "move"; workspaceId: string; tabId: string; frameId: string; label: string; viaTag: boolean }
  | { kind: "blocked"; frameId: string; reason: string };

type Ws = Pick<Workspace, "id" | "cwd" | "git" | "activeTabId" | "tabIds">;

export interface DropTargetInput {
  /**
   * つかんでいるノード。手元で開いている pane（`open`）だけが移せる。`remote`: 別のマシンの pane。`closed`: 手元の鍵だが、いま開いていない
   * （閉じた直後・まだ届いていない）。
   */
  node: { state: "open" | "remote" | "closed"; workspaceId: string | undefined; tabId: string | null };
  /** ノードの中心（世界の座標）。 */
  center: { x: number; y: number };
  /** 指の下にある tab のタグ（無ければ null）。 */
  tag: { workspaceId: string; tabId: string } | null;
  frames: readonly Pick<DisplayFrame, "id" | "rect">[];
  infos: ReadonlyMap<string, FrameInfo>;
  workspaces: ReadonlyMap<string, Ws>;
}

export const MACHINE_BLOCK = "別のマシンの囲いへは、pane を移せません（そのマシンで操作してください）";
export const REMOTE_NODE_BLOCK = "別のマシンの pane は移せません";
export const CLOSED_NODE_BLOCK = "この pane は、いま開いていないため、移せません";
export const UNKNOWN_SOURCE_BLOCK = "pane の所属を確かめられないため、移せません";
export const OUTER_BLOCK = "ここには移せません（同じ worktree の workspace の囲いの上へ落としてください）";

function evalWorkspace(input: DropTargetInput, target: Ws, frameId: string, tabId: string, viaTag: boolean): DropTarget {
  const { node } = input;
  if (node.state === "remote") return { kind: "blocked", frameId, reason: REMOTE_NODE_BLOCK };
  if (node.state === "closed") return { kind: "blocked", frameId, reason: CLOSED_NODE_BLOCK };
  // 所属が解けない（同期の途中）ときは、位置だけが変わって pane は移らない、という取り違えを避けて、落とせないことにする。
  const source = node.workspaceId === undefined ? undefined : input.workspaces.get(node.workspaceId);
  if (source === undefined) return { kind: "blocked", frameId, reason: UNKNOWN_SOURCE_BLOCK };
  const block = paneMoveBlock(source, target, { lenient: true });
  if (block !== null) return { kind: "blocked", frameId, reason: paneMoveBlockMessage(block) };
  // 同じ tab（自分の tab のタグ・自分の workspace の囲い）への移動は、何も起きない（位置の変更）。
  if (source.id === target.id && (node.tabId === tabId || !viaTag)) return { kind: "position" };
  return { kind: "move", workspaceId: target.id, tabId, frameId, label: input.infos.get(target.id)?.title ?? target.id, viaTag };
}

export function dropTargetFor(input: DropTargetInput): DropTarget {
  const { tag, node } = input;
  if (tag !== null) {
    const ws = input.workspaces.get(tag.workspaceId);
    if (ws !== undefined) return evalWorkspace(input, ws, tag.workspaceId, tag.tabId, true);
  }
  const own = node.workspaceId;
  const ownParent = own === undefined ? null : (input.infos.get(own)?.parentId ?? null);
  const hit = (f: Pick<DisplayFrame, "rect">): boolean =>
    input.center.x >= f.rect.x &&
    input.center.x <= f.rect.x + f.rect.w &&
    input.center.y >= f.rect.y &&
    input.center.y <= f.rect.y + f.rect.h;
  // 内側の囲い（workspace・別のマシン）を先に。
  for (const f of input.frames) {
    const info = input.infos.get(f.id);
    if (info === undefined || info.kind === "worktree" || f.id === own || !hit(f)) continue;
    if (info.kind === "machine") return { kind: "blocked", frameId: f.id, reason: MACHINE_BLOCK };
    const ws = input.workspaces.get(info.id);
    if (ws === undefined) return { kind: "blocked", frameId: f.id, reason: OUTER_BLOCK };
    return evalWorkspace(input, ws, f.id, ws.activeTabId, false);
  }
  for (const f of input.frames) {
    const info = input.infos.get(f.id);
    if (info === undefined || info.kind !== "worktree" || f.id === ownParent || !hit(f)) continue;
    return { kind: "blocked", frameId: f.id, reason: OUTER_BLOCK };
  }
  return { kind: "position" };
}
