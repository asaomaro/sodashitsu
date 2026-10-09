/**
 * グラフの小さなサブエージェントのノード（20261008-graph-first PR6b）の、置き場所に依らない計算。
 * 出入りの台帳（現れて 2 秒たつまで出さない・終わったら 1 秒かけて消す）と、親子の木を縦に並べる順。画面（`GraphSubagentLayer.vue`）から切り離してあるのは試験のため。
 */

/** 現れてから、この時間たつまでノードにしない（すぐ終わるものを出さない）。 */
export const SUBAGENT_SHOW_DELAY_MS = 2000;
/** 終わってから、この時間かけて消す。 */
export const SUBAGENT_FADE_MS = 1000;
/** 1 つの親につき出す小さなノードの数（残りは「ほか n 件」の 1 枚）。 */
export const SUBAGENT_ROWS_MAX = 6;
/** 字下げする深さの上限（これより深い入れ子も、この深さに揃える）。 */
export const SUBAGENT_INDENT_MAX = 3;

export interface LedgerEntry<T> {
  /** `<親の鍵>\n<サブエージェントの id>`。 */
  key: string;
  parentKey: string;
  item: T;
  /** この画面が初めて見た時刻（epoch ms。サーバとの時計のずれに依らない）。 */
  firstSeen: number;
  /** 一覧から消えた時刻。消える途中のものだけ。 */
  goneAt: number | null;
}

export const ledgerKey = (parentKey: string, id: string): string => `${parentKey}\n${id}`;

/**
 * 台帳を、いまの一覧（`live`: 台帳の鍵 → 項目と親の鍵）に合わせて更新する（新しい Map を返す）。
 * - 初めて見たものは `firstSeen = now`。
 * - 一覧から消えたもの: すでにノードとして出ていた（出してから 2 秒たっていた）ものだけ `goneAt = now` にして残す（1 秒かけて消す）。出ていなかったものは、すぐ捨てる。
 *   `reduced`（動きを減らす設定）のときは、残さず、すぐ捨てる。
 * - 消える途中のものが一覧に戻ったら、戻す。
 * - `goneAt` から 1 秒たったものは捨てる。
 */
export function reconcileLedger<T>(
  prev: ReadonlyMap<string, LedgerEntry<T>>,
  live: ReadonlyMap<string, { parentKey: string; item: T }>,
  now: number,
  reduced: boolean,
): Map<string, LedgerEntry<T>> {
  const next = new Map<string, LedgerEntry<T>>();
  for (const [key, l] of live) {
    const old = prev.get(key);
    next.set(key, { key, parentKey: l.parentKey, item: l.item, firstSeen: old?.firstSeen ?? now, goneAt: null });
  }
  for (const [key, e] of prev) {
    if (live.has(key)) continue;
    if (reduced) continue;
    if (e.goneAt !== null) {
      if (now - e.goneAt < SUBAGENT_FADE_MS) next.set(key, e);
    } else if (now - e.firstSeen >= SUBAGENT_SHOW_DELAY_MS) {
      next.set(key, { ...e, goneAt: now });
    }
  }
  return next;
}

/** ノードとして出してよいか（現れて 2 秒たった。消える途中のものは、出ていたものなので出す）。 */
export function ledgerVisible<T>(e: LedgerEntry<T>, now: number): boolean {
  return e.goneAt !== null || now - e.firstSeen >= SUBAGENT_SHOW_DELAY_MS;
}

export interface FlatRow<T> {
  item: T;
  /** 親の行の番号（親が一覧に無い・親がメインのときは null）。 */
  parentRow: number | null;
  /** 字下げの段（0 から。`SUBAGENT_INDENT_MAX` まで）。 */
  indent: number;
}

/**
 * 項目を親子の木にして、縦に並べる順（親の次に子〔起動した順〕）にする。入力は起動した順。
 * 親の id が一覧に無いもの・親が自分自身・輪になったものは、根として扱う（落とさない）。
 */
export function flattenTree<T extends { id: string; parentId?: string }>(items: readonly T[]): FlatRow<T>[] {
  const byId = new Map<string, T>();
  for (const i of items) if (!byId.has(i.id)) byId.set(i.id, i);
  const children = new Map<string, T[]>();
  const roots: T[] = [];
  for (const i of byId.values()) {
    const p = i.parentId;
    if (p !== undefined && p !== i.id && byId.has(p)) {
      const list = children.get(p);
      if (list) list.push(i);
      else children.set(p, [i]);
    } else roots.push(i);
  }
  const out: FlatRow<T>[] = [];
  const seen = new Set<string>();
  const walk = (i: T, parentRow: number | null, depth: number): void => {
    if (seen.has(i.id)) return;
    seen.add(i.id);
    const row = out.length;
    out.push({ item: i, parentRow, indent: Math.min(depth, SUBAGENT_INDENT_MAX) });
    for (const c of children.get(i.id) ?? []) walk(c, row, depth + 1);
  };
  for (const r of roots) walk(r, null, 0);
  // 輪になっていて、どの根からも辿れなかったもの。
  for (const i of byId.values()) walk(i, null, 0);
  return out;
}
