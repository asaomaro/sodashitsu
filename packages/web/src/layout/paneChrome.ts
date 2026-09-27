import type { SplitDirection } from "@sodashitsu/protocol";

/**
 * pane の枠の描き分け（20260926-pane-frame-auto-mode。herdr の `ui.pane_borders`・`ui.pane_gaps`）。
 * 余白を辺ごとに決める：隣と接する辺は隙間の設定、外周の辺（隣に pane が無い辺）は枠を描くかで決まる。
 */

/** 枠の描画モード。always=常に・auto=分割しているときだけ・off=描かない（herdr の値と同じ綴り）。 */
export type PaneBorders = "always" | "auto" | "off";
export const PANE_BORDERS: readonly PaneBorders[] = ["always", "auto", "off"];

export type PaneSide = "top" | "right" | "bottom" | "left";
export type PaneSides = Readonly<Record<PaneSide, boolean>>;

export const NO_NEIGHBORS: PaneSides = { top: false, right: false, bottom: false, left: false };

/** 分割の子（a/b）の隣。親の隣を引き継ぎ、分割の向きに応じて 1 辺を足す。 */
export function childNeighbors(
  parent: PaneSides,
  dir: SplitDirection,
  child: "a" | "b",
): PaneSides {
  const side: PaneSide =
    dir === "right" ? (child === "a" ? "right" : "left") : child === "a" ? "bottom" : "top";
  return { ...parent, [side]: true };
}

export interface PaneChrome {
  /** 外周の余白・選択の強調・名前のラベルを描くか。 */
  framed: boolean;
  /** 辺ごとに余白（`--soda-pane-gap`）を取るか。 */
  padded: PaneSides;
}

export function resolvePaneChrome(
  borders: PaneBorders,
  gaps: boolean,
  multiPane: boolean,
  neighbors: PaneSides,
): PaneChrome {
  const framed = borders === "always" || (borders === "auto" && multiPane);
  const pad = (side: PaneSide): boolean => (neighbors[side] ? gaps : framed);
  return {
    framed,
    padded: { top: pad("top"), right: pad("right"), bottom: pad("bottom"), left: pad("left") },
  };
}
