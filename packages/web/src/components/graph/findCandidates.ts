/**
 * グラフの「探す」の候補（20261008-graph-first の PR1d T12b）。空間をまたいで、pane の呼び名・エージェントの名前と種類・workspace の名前・tab の名前を、部分一致（大文字と小文字を区別しない）で探す。
 * 純粋な関数（画面の部品は `GraphFind.vue`）。
 */
export interface FindItem {
  /** ノード（pane）か、workspace（囲い）か。 */
  kind: "pane" | "workspace";
  /** 動かす先（`pane` はノードの鍵、`workspace` は workspace の id）。 */
  target: string;
  /** 候補の名前（pane の呼び名・workspace の名前）。 */
  label: string;
  /** 「どの空間の、どの workspace か」などの補足。 */
  sub: string;
  /** 探す文字列（どれかに部分一致すれば候補）。 */
  haystack: readonly string[];
}

/** 候補の上限。 */
export const FIND_MAX = 20;

/** 空白を除いた検索語が空なら候補は無い。名前の先頭に一致するものを先に、同じ重さなら元の並びのまま。 */
export function findCandidates(items: readonly FindItem[], query: string, max = FIND_MAX): FindItem[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [];
  const scored: { item: FindItem; rank: number; index: number }[] = [];
  items.forEach((item, index) => {
    const label = item.label.toLowerCase();
    let rank: number | null = null;
    if (label.startsWith(q)) rank = 0;
    else if (label.includes(q)) rank = 1;
    else if (item.haystack.some((h) => h.toLowerCase().includes(q))) rank = 2;
    if (rank !== null) scored.push({ item, rank, index });
  });
  scored.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return scored.slice(0, max).map((s) => s.item);
}
