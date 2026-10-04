/**
 * pane の名前ラベルドラッグ中、ホバー中の pane 内のどこ（縁/中央）に反応するかの判定
 * （20260924-pane-dnd-split-move。design「振る舞いの詳細 > クライアント側: ゾーン判定」）。
 * `PaneFrame.vue` から切り出した純関数（decisions.md D2。`agentOrder.ts` 等と同じ
 * 「純関数は切り出して単体テストする」慣習）。
 */
export type Zone = "top" | "bottom" | "left" | "right" | "center";

/** 縁とみなす帯の幅（対象の軸の割合）。design「確立パターンに倣った推定値」（一次資料未検証）。 */
const EDGE_RATIO = 0.3;

/**
 * `rect`（ドロップ先候補の pane 要素の `getBoundingClientRect()`）とポインタ座標 `x`/`y` から
 * ゾーンを決める。**左右を先に判定してから上下**（四隅での tie-break を一貫させるための実装上の
 * 固定順。design「振る舞いの詳細」）。
 */
export function zoneAt(rect: { left: number; top: number; width: number; height: number }, x: number, y: number): Zone {
  const relX = (x - rect.left) / rect.width;
  const relY = (y - rect.top) / rect.height;
  if (relX < EDGE_RATIO) return "left";
  if (relX > 1 - EDGE_RATIO) return "right";
  if (relY < EDGE_RATIO) return "top";
  if (relY > 1 - EDGE_RATIO) return "bottom";
  return "center";
}
