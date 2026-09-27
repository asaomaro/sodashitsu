import type { Dir, LayoutNode, PaneId, SplitDirection, SplitId } from "@sodashitsu/protocol";

/**
 * pane の二分木レイアウトを操作する純関数（architecture.md「LayoutTree」）。
 * `LayoutNode` はイミュータブルに扱う（呼び出し側が返り値で置き換える）。
 */

export function isPaneNode(node: LayoutNode): node is Extract<LayoutNode, { type: "pane" }> {
  return node.type === "pane";
}
export function isSplitNode(node: LayoutNode): node is Extract<LayoutNode, { type: "split" }> {
  return node.type === "split";
}

/** レイアウト木に含まれる pane の id を、深さ優先（左→右）の順で返す。`cyclePane` の巡回順に使う。 */
export function leaves(node: LayoutNode): PaneId[] {
  if (isPaneNode(node)) return [node.paneId];
  return [...leaves(node.a), ...leaves(node.b)];
}

/** 指定した pane を含む split ノードを探す（無ければ null）。 */
export function findSplit(node: LayoutNode, splitId: SplitId): Extract<LayoutNode, { type: "split" }> | null {
  if (isPaneNode(node)) return null;
  if (node.id === splitId) return node;
  return findSplit(node.a, splitId) ?? findSplit(node.b, splitId);
}

/** `targetPaneId` を `direction` へ分割し、`newPaneId` を新しい側に置く。 */
export function split(
  node: LayoutNode,
  targetPaneId: PaneId,
  direction: SplitDirection,
  newPaneId: PaneId,
  newSplitId: SplitId,
  ratio = 0.5,
): LayoutNode {
  if (isPaneNode(node)) {
    if (node.paneId !== targetPaneId) return node;
    return {
      type: "split",
      id: newSplitId,
      dir: direction,
      ratio,
      a: { type: "pane", paneId: targetPaneId },
      b: { type: "pane", paneId: newPaneId },
    };
  }
  return { ...node, a: split(node.a, targetPaneId, direction, newPaneId, newSplitId, ratio), b: split(node.b, targetPaneId, direction, newPaneId, newSplitId, ratio) };
}

/**
 * `paneId` を木から取り除く。取り除いた結果、親の split が 1 枚の pane しか持たなくなったら、
 * その split を消して残った側を親の位置へ引き上げる（tmux の pane 削除と同じたたみ方）。
 * 最後の 1 枚を消そうとした場合は null（tab を閉じる合図。呼び出し側が処理する）。
 */
export function remove(node: LayoutNode, paneId: PaneId): LayoutNode | null {
  if (isPaneNode(node)) {
    return node.paneId === paneId ? null : node;
  }
  const a = remove(node.a, paneId);
  const b = remove(node.b, paneId);
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  return { ...node, a, b };
}

export type Edge = "top" | "bottom" | "left" | "right";

/**
 * `targetPaneId` の葉を、`edge` 側に `newPaneId` を置く形の split に置き換える
 * （20260924-pane-dnd-split-move。design「インターフェース / データ構造」）。`split()` は常に
 * target=a・new=b だが、こちらは `edge` に応じて target/new のどちらを a（左/上）に置くかを決める：
 * "right"|"bottom" は target=a・new=b（`split()` と同じ結果）、"left"|"top" は new=a・target=b
 * （a/b の中身だけが入れ替わる。dir は同じ軸の "right"|"down" のまま）。ratio は常に 0.5 固定
 * （この work の対象。比率調整は既存のリサイズに任せる）。
 */
export function insertAtEdge(node: LayoutNode, targetPaneId: PaneId, edge: Edge, newPaneId: PaneId, newSplitId: SplitId): LayoutNode {
  if (isPaneNode(node)) {
    if (node.paneId !== targetPaneId) return node;
    const dir: SplitDirection = edge === "left" || edge === "right" ? "right" : "down";
    const targetNode: LayoutNode = { type: "pane", paneId: targetPaneId };
    const newNode: LayoutNode = { type: "pane", paneId: newPaneId };
    const [a, b] = edge === "left" || edge === "top" ? [newNode, targetNode] : [targetNode, newNode];
    return { type: "split", id: newSplitId, dir, ratio: 0.5, a, b };
  }
  return { ...node, a: insertAtEdge(node.a, targetPaneId, edge, newPaneId, newSplitId), b: insertAtEdge(node.b, targetPaneId, edge, newPaneId, newSplitId) };
}

/** 2 つの pane の位置を入れ替える（レイアウトの形は変えない）。 */
export function swap(node: LayoutNode, paneIdA: PaneId, paneIdB: PaneId): LayoutNode {
  if (isPaneNode(node)) {
    if (node.paneId === paneIdA) return { type: "pane", paneId: paneIdB };
    if (node.paneId === paneIdB) return { type: "pane", paneId: paneIdA };
    return node;
  }
  return { ...node, a: swap(node.a, paneIdA, paneIdB), b: swap(node.b, paneIdA, paneIdB) };
}

/** split の比率を書き換える。0.05〜0.95 に丸める。 */
export function setRatio(node: LayoutNode, splitId: SplitId, ratio: number): LayoutNode {
  const clamped = Math.min(0.95, Math.max(0.05, ratio));
  if (isPaneNode(node)) return node;
  if (node.id === splitId) return { ...node, ratio: clamped };
  return { ...node, a: setRatio(node.a, splitId, ratio), b: setRatio(node.b, splitId, ratio) };
}

/**
 * resize モード用：フォーカス中の pane を含む split の境界を、方向へ動かす（D23。herdr の正確な意味は未確認なので自前で決める）。
 * 規則：`right`/`down` は a 側の比率を増やし、`left`/`up` は減らす（境界がどちらへ動くかで統一し、
 * pane がどちら側にあるかには依存させない）。軸が split の並び方向と一致しないキーは無視する。
 */
export function resizeBy(node: LayoutNode, focusedPaneId: PaneId, direction: Dir, amount: number): LayoutNode {
  const owner = findOwningSplit(node, focusedPaneId);
  if (!owner) return node;
  const { split: s } = owner;
  const axisMatches =
    (s.dir === "right" && (direction === "left" || direction === "right")) ||
    (s.dir === "down" && (direction === "up" || direction === "down"));
  if (!axisMatches) return node;
  const delta = direction === "right" || direction === "down" ? amount : -amount;
  return setRatio(node, s.id, s.ratio + delta);
}

function findOwningSplit(
  node: LayoutNode,
  paneId: PaneId,
): { split: Extract<LayoutNode, { type: "split" }>; paneIsSideA: boolean } | null {
  if (isPaneNode(node)) return null;
  if (isPaneNode(node.a) && node.a.paneId === paneId) return { split: node, paneIsSideA: true };
  if (isPaneNode(node.b) && node.b.paneId === paneId) return { split: node, paneIsSideA: false };
  return findOwningSplit(node.a, paneId) ?? findOwningSplit(node.b, paneId);
}

/**
 * 方向で見た「隣の pane」を探す（`pane.focus_direction` / `pane.swap` に使う）。
 * 単純な木構造なので、同じ軸の直近の祖先 split を辿って反対側の葉に入る素朴な実装。
 */
export function neighbor(node: LayoutNode, paneId: PaneId, direction: Dir): PaneId | null {
  const path = findPath(node, paneId);
  if (!path) return null;
  for (let i = path.length - 1; i >= 0; i--) {
    const step = path[i];
    if (!step) continue;
    const { split: s, cameFromA } = step;
    const axisMatches =
      (s.dir === "right" && (direction === "left" || direction === "right")) ||
      (s.dir === "down" && (direction === "up" || direction === "down"));
    if (!axisMatches) continue;
    const wantSideA = direction === "left" || direction === "up";
    if (wantSideA === cameFromA) continue; // 既にその側にいるので、この split では動けない
    const target = wantSideA ? s.a : s.b;
    return firstLeaf(target);
  }
  return null;
}

function firstLeaf(node: LayoutNode): PaneId {
  return isPaneNode(node) ? node.paneId : firstLeaf(node.a);
}

function findPath(
  node: LayoutNode,
  paneId: PaneId,
): { split: Extract<LayoutNode, { type: "split" }>; cameFromA: boolean }[] | null {
  if (isPaneNode(node)) return node.paneId === paneId ? [] : null;
  const inA = findPath(node.a, paneId);
  if (inA) return [{ split: node, cameFromA: true }, ...inA];
  const inB = findPath(node.b, paneId);
  if (inB) return [{ split: node, cameFromA: false }, ...inB];
  return null;
}

/** 次 / 前の pane（`prefix+tab` / `prefix+shift+tab`。端では反対側へ回る）。 */
export function cycleOrder(node: LayoutNode, currentPaneId: PaneId, delta: 1 | -1): PaneId {
  const ids = leaves(node);
  const idx = ids.indexOf(currentPaneId);
  if (idx === -1) {
    const first = ids[0];
    if (first === undefined) throw new Error("layout has no panes");
    return first;
  }
  const next = ((idx + delta) % ids.length + ids.length) % ids.length;
  const result = ids[next];
  if (result === undefined) throw new Error("unreachable: cycleOrder index out of range");
  return result;
}
