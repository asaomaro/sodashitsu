/**
 * 端末の窓の位置・大きさと、留めた窓の記憶（20261008-graph-first の PR2b。W6）。ブラウザごと（`localStorage`）。壊れた値は捨て、件数は上限（200）まで。
 * 位置は、面の領域の「余白に対する割合」（0〜1）で持つ——領域の大きさが変わっても、窓は面の中に収まる。大きさは桁と行。
 */
export interface WindowMemoryEntry {
  /** 窓の左（上）の位置。領域の幅（高さ）から窓の幅（高さ）を引いた余白に対する割合（0〜1）。 */
  fx: number;
  fy: number;
  cols: number;
  rows: number;
}
export interface WindowMemory {
  /** pane の id → 位置と大きさ。挿入の順（古い順）。 */
  geometry: Record<string, WindowMemoryEntry>;
  /** 留めている窓の pane の id（開いた順）。 */
  pinned: string[];
}

export const WINDOW_MEMORY_KEY = "soda.graphTerminalWindows.v1";
export const WINDOW_MEMORY_MAX = 200;
/** 窓の数の上限。 */
export const GRAPH_TERMINAL_MAX_WINDOWS = 3;

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function emptyMemory(): WindowMemory {
  return { geometry: {}, pinned: [] };
}

/** 読んだ値を検めて、使える分だけの記憶にする（壊れた項目は捨てる。件数の上限も守る）。 */
export function sanitizeMemory(raw: unknown): WindowMemory {
  const out = emptyMemory();
  if (typeof raw !== "object" || raw === null) return out;
  const r = raw as { geometry?: unknown; pinned?: unknown };
  if (typeof r.geometry === "object" && r.geometry !== null && !Array.isArray(r.geometry)) {
    for (const [id, v] of Object.entries(r.geometry as Record<string, unknown>)) {
      if (typeof id !== "string" || id === "" || typeof v !== "object" || v === null) continue;
      const e = v as Record<string, unknown>;
      if (!isFiniteNumber(e["fx"]) || !isFiniteNumber(e["fy"]) || !isFiniteNumber(e["cols"]) || !isFiniteNumber(e["rows"])) continue;
      if (e["cols"] < 1 || e["rows"] < 1 || e["cols"] > 1000 || e["rows"] > 1000) continue;
      out.geometry[id] = { fx: clamp01(e["fx"]), fy: clamp01(e["fy"]), cols: Math.round(e["cols"]), rows: Math.round(e["rows"]) };
    }
  }
  if (Array.isArray(r.pinned)) {
    for (const id of r.pinned) if (typeof id === "string" && id !== "" && !out.pinned.includes(id)) out.pinned.push(id);
    out.pinned.length = Math.min(out.pinned.length, GRAPH_TERMINAL_MAX_WINDOWS);
  }
  return trimMemory(out);
}

/** 件数の上限を超えた分を、古いものから捨てる。 */
export function trimMemory(m: WindowMemory): WindowMemory {
  const keys = Object.keys(m.geometry);
  if (keys.length > WINDOW_MEMORY_MAX) for (const k of keys.slice(0, keys.length - WINDOW_MEMORY_MAX)) delete m.geometry[k];
  return m;
}

/** 無くなった pane の分を捨てる（`alive` は、いま在る pane の id かどうか）。 */
export function sweepMemory(m: WindowMemory, alive: (paneId: string) => boolean): WindowMemory {
  for (const id of Object.keys(m.geometry)) if (!alive(id)) delete m.geometry[id];
  m.pinned = m.pinned.filter(alive);
  return m;
}

/** 記録（新しい値は末尾へ。上限を超えれば古いものから捨てる）。 */
export function rememberGeometry(m: WindowMemory, paneId: string, e: WindowMemoryEntry): WindowMemory {
  delete m.geometry[paneId];
  m.geometry[paneId] = { fx: clamp01(e.fx), fy: clamp01(e.fy), cols: Math.round(e.cols), rows: Math.round(e.rows) };
  return trimMemory(m);
}

export function loadMemory(storage: Pick<Storage, "getItem"> | null): WindowMemory {
  try {
    const raw = storage?.getItem(WINDOW_MEMORY_KEY);
    return raw ? sanitizeMemory(JSON.parse(raw)) : emptyMemory();
  } catch {
    return emptyMemory();
  }
}

export function saveMemory(storage: Pick<Storage, "setItem"> | null, m: WindowMemory): void {
  try {
    storage?.setItem(WINDOW_MEMORY_KEY, JSON.stringify(m));
  } catch {
    // 保存できない環境（容量・プライベートモード）では、覚えないだけ
  }
}

/** 位置（割合）→ 領域の中の左上の座標（px）。余白が無ければ 0。 */
export function placeFromMemory(e: WindowMemoryEntry, area: { w: number; h: number }, size: { w: number; h: number }): { x: number; y: number } {
  return { x: Math.round(clamp01(e.fx) * Math.max(0, area.w - size.w)), y: Math.round(clamp01(e.fy) * Math.max(0, area.h - size.h)) };
}

/** 左上の座標（px）→ 割合。 */
export function fractionOf(pos: { x: number; y: number }, area: { w: number; h: number }, size: { w: number; h: number }): { fx: number; fy: number } {
  const fw = area.w - size.w;
  const fh = area.h - size.h;
  return { fx: fw > 0 ? clamp01(pos.x / fw) : 0, fy: fh > 0 ? clamp01(pos.y / fh) : 0 };
}
