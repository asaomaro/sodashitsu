import type { Dir, LayoutNode } from "@sodashitsu/protocol";

/**
 * レイアウト木を深さ優先でたどった pane id の並び（`prefix+tab` の巡回順・`GotoPicker`（T24）の
 * tab 内の pane の並び順で共有する。architecture.md「4. tab の切替」）。
 */
export function depthFirstPaneIds(node: LayoutNode): string[] {
  return node.type === "pane" ? [node.paneId] : [...depthFirstPaneIds(node.a), ...depthFirstPaneIds(node.b)];
}

type SplitNode = Extract<LayoutNode, { type: "split" }>;

/**
 * 方向で見た「隣の pane」（`prefix+h/j/k/l`）。サーバの `LayoutTree.neighbor`
 * （`packages/server/src/session/LayoutTree.ts`）と同じ規則——同じ軸の直近の祖先 split を辿り、反対側の
 * 最初の葉に入る。**クライアントで先に求めて即座に焦点を移す**ために持つ（サーバの応答を待つと、その往復の
 * 間に打った文字が移動前の焦点へ届いてしまう。D97）。その方向に pane が無ければ null。
 */
export function neighborPaneId(node: LayoutNode, paneId: string, dir: Dir): string | null {
  const path = findPath(node, paneId);
  if (!path) return null;
  for (let i = path.length - 1; i >= 0; i--) {
    const step = path[i];
    if (!step) continue;
    const { split, cameFromA } = step;
    const axisMatches = (split.dir === "right" && (dir === "left" || dir === "right")) || (split.dir === "down" && (dir === "up" || dir === "down"));
    if (!axisMatches) continue;
    const wantSideA = dir === "left" || dir === "up";
    if (wantSideA === cameFromA) continue; // 既にその側にいるので、この split では動けない
    return firstLeaf(wantSideA ? split.a : split.b);
  }
  return null;
}

function firstLeaf(node: LayoutNode): string {
  return node.type === "pane" ? node.paneId : firstLeaf(node.a);
}

function findPath(node: LayoutNode, paneId: string): { split: SplitNode; cameFromA: boolean }[] | null {
  if (node.type === "pane") return node.paneId === paneId ? [] : null;
  const inA = findPath(node.a, paneId);
  if (inA) return [{ split: node, cameFromA: true }, ...inA];
  const inB = findPath(node.b, paneId);
  if (inB) return [{ split: node, cameFromA: false }, ...inB];
  return null;
}
