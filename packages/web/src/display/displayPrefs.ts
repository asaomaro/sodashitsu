import { DISPLAY_DOCKS, DISPLAY_KINDS, isDisplayDock, isDisplayEdge, type DisplayDock, type DisplayEdge, type DisplayInfo, type DisplayKind } from "@sodashitsu/protocol";

/**
 * 表示の面の置き場所・たたみ・窓の位置の記憶（`soda.prefs.v1` の `displayLayout`。その画面だけ。共有の設定へ送らない）と、そこから「いまの状態」を導く関数
 * （20261008-display-layout の design「記憶」）。**純粋**（ストアにも DOM にも触れない）。書くのは利用者の操作だけ（`store/display.ts` の `writeFace` が、ここの型で書く）。
 */

/** 面の記憶の上限（超えたら古い順に捨てる）。 */
export const FACE_PREFS_MAX = 256;
export const NAME_PREFS_MAX = 64;
export const SIDE_PREFS_MAX = 128;
/** 側の大きさの記憶の範囲（px）。 */
export const SIDE_SIZE_STORED_MIN = 96;
export const SIDE_SIZE_STORED_MAX = 8192;
const RECT_MAX = 8192;

export type DockSide = "right" | "left" | "top" | "bottom";
export const DOCK_SIDES: readonly DockSide[] = ["right", "left", "top", "bottom"];

export interface FaceRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface FacePref {
  /** パネル（パネルの記憶なら必ずある）。 */
  dock?: DisplayDock;
  /** 帯（帯の記憶なら必ずある）。 */
  edge?: DisplayEdge;
  /** 必ずある。 */
  collapsed: boolean;
  /** 浮いた窓。窓の動ける領域（端末の領域の 4px 内側）の左上からの px。 */
  rect?: FaceRect;
}
export interface DisplayLayoutPrefs {
  v: 1;
  /** 鍵: `${paneId}|${kind}|${name}`。 */
  faces: Record<string, FacePref>;
  /** 鍵: `${kind}|${name}`（同じ名前の面の置き場所の引き継ぎ。たたみ・位置は引き継がない）。 */
  names: Record<string, { dock?: DisplayDock; edge?: DisplayEdge }>;
  /** 鍵: `${paneId}|${side}`。px。 */
  sides: Record<string, number>;
}

/** その版の画面が出せる置き場所（PR-A: 右だけ。PR-B: 4 つの側。PR-C で浮いた窓も）。PR ごとに、この定数だけを変える。 */
export const DISPLAY_DOCK_CAPS: readonly DisplayDock[] = ["right", "left", "top", "bottom"];

export function emptyLayout(): DisplayLayoutPrefs {
  return { v: 1, faces: {}, names: {}, sides: {} };
}

type FaceId = Pick<DisplayInfo, "paneId" | "kind" | "name">;
export const faceKey = (i: FaceId): string => `${i.paneId}|${i.kind}|${i.name}`;
export const nameKey = (i: Pick<DisplayInfo, "kind" | "name">): string => `${i.kind}|${i.name}`;
export const sideKey = (paneId: string, side: DockSide): string => `${paneId}|${side}`;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isKind = (v: string): v is DisplayKind => (DISPLAY_KINDS as readonly string[]).includes(v);

function loadRect(raw: unknown): FaceRect | undefined {
  if (!isRecord(raw)) return undefined;
  const { x, y, w, h } = raw;
  const ok = (v: unknown, min: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= RECT_MAX;
  if (!ok(x, 0) || !ok(y, 0) || !ok(w, 1) || !ok(h, 1)) return undefined;
  return { x, y, w, h };
}

/** 後ろから `max` 件だけ残す（先頭＝古いものを捨てる）。 */
function keepLast<T>(entries: [string, T][], max: number): Record<string, T> {
  return Object.fromEntries(entries.length > max ? entries.slice(entries.length - max) : entries);
}

/**
 * `soda.prefs.v1` の `displayLayout` を読む。形が違えば空。**項目の欠けた記憶（`collapsed` が無い・パネルで `dock` が無い・帯で `edge` が無い）は、鍵ごと捨てる**
 * （欠けた項目を指定へ落とすと、「記憶が決める」が崩れる）。`rect` だけは、合わなければ `rect` だけ捨てる。上限を超えた分は先頭（古いもの）から捨てる。
 */
export function loadDisplayLayout(raw: unknown): DisplayLayoutPrefs {
  const out = emptyLayout();
  if (!isRecord(raw) || raw["v"] !== 1) return out;
  const faces: [string, FacePref][] = [];
  if (isRecord(raw["faces"])) {
    for (const [k, v] of Object.entries(raw["faces"])) {
      const parts = k.split("|");
      if (parts.length !== 3 || parts[0] === "" || parts[2] === "" || !isKind(parts[1]!) || !isRecord(v) || typeof v["collapsed"] !== "boolean") continue;
      const face: FacePref = { collapsed: v["collapsed"] };
      if (parts[1] === "panel") {
        if (!isDisplayDock(v["dock"])) continue;
        face.dock = v["dock"];
        const rect = loadRect(v["rect"]);
        if (rect) face.rect = rect;
      } else {
        if (!isDisplayEdge(v["edge"])) continue;
        face.edge = v["edge"];
      }
      faces.push([k, face]);
    }
  }
  const names: [string, { dock?: DisplayDock; edge?: DisplayEdge }][] = [];
  if (isRecord(raw["names"])) {
    for (const [k, v] of Object.entries(raw["names"])) {
      const parts = k.split("|");
      if (parts.length !== 2 || parts[1] === "" || !isKind(parts[0]!) || !isRecord(v)) continue;
      if (parts[0] === "panel" && isDisplayDock(v["dock"])) names.push([k, { dock: v["dock"] }]);
      else if (parts[0] === "band" && isDisplayEdge(v["edge"])) names.push([k, { edge: v["edge"] }]);
    }
  }
  const sides: [string, number][] = [];
  if (isRecord(raw["sides"])) {
    for (const [k, v] of Object.entries(raw["sides"])) {
      const parts = k.split("|");
      if (parts.length !== 2 || parts[0] === "" || !(DOCK_SIDES as readonly string[]).includes(parts[1]!)) continue;
      if (typeof v === "number" && Number.isFinite(v) && v >= SIDE_SIZE_STORED_MIN && v <= SIDE_SIZE_STORED_MAX) sides.push([k, Math.round(v)]);
    }
  }
  out.faces = keepLast(faces, FACE_PREFS_MAX);
  out.names = keepLast(names, NAME_PREFS_MAX);
  out.sides = keepLast(sides, SIDE_PREFS_MAX);
  return out;
}

/** 書くために、鍵を末尾へ移して（最近使ったものが残る）上限で切った新しいオブジェクトを返す。 */
export function putLast<T>(rec: Record<string, T>, key: string, value: T, max: number): Record<string, T> {
  const entries = Object.entries(rec).filter(([k]) => k !== key);
  entries.push([key, value]);
  return keepLast(entries, max);
}

/** もう無い pane の分（`faces`・`sides`）を捨てる。`names` は pane に依らないので触らない。変わらなければ同じ値を返す。 */
export function pruneLayoutPanes(prefs: DisplayLayoutPrefs, live: ReadonlySet<string>): DisplayLayoutPrefs {
  const keep = (k: string): boolean => live.has(k.slice(0, k.indexOf("|")));
  const faces = Object.entries(prefs.faces);
  const sides = Object.entries(prefs.sides);
  if (faces.every(([k]) => keep(k)) && sides.every(([k]) => keep(k))) return prefs;
  return { ...prefs, faces: Object.fromEntries(faces.filter(([k]) => keep(k))), sides: Object.fromEntries(sides.filter(([k]) => keep(k))) };
}

/** 側の大きさの記憶。右は、無ければ今までの `displayPanelWidths[pane]` を読む（読むだけ）。 */
export function storedSideSize(prefs: DisplayLayoutPrefs, paneId: string, side: DockSide, legacyWidths?: ReadonlyMap<string, number>): number | undefined {
  const own = prefs.sides[sideKey(paneId, side)];
  if (own !== undefined) return own;
  return side === "right" ? legacyWidths?.get(paneId) : undefined;
}

/** プログラムの指定（`info.dock`）。知らない値・型の違う値は「指定なし」。panel のときだけ。 */
export function specDock(info: Pick<DisplayInfo, "kind" | "dock">): DisplayDock | undefined {
  return info.kind === "panel" && isDisplayDock(info.dock) ? info.dock : undefined;
}
export function specEdge(info: Pick<DisplayInfo, "kind" | "edge">): DisplayEdge | undefined {
  return info.kind === "band" && isDisplayEdge(info.edge) ? info.edge : undefined;
}
const specCollapsed = (info: Pick<DisplayInfo, "collapsed">): boolean => info.collapsed === true;

/**
 * パネルの置き場所。優先: 面の記憶（あれば、それで決まり）＞ 同じ名前の記憶 ＞ プログラムの指定 ＞ 設定。
 * 画面が出せない値（`caps` に無い）は飛ばして次を見る。どれも出せなければ `right`。
 */
export function effectiveDock(
  info: Pick<DisplayInfo, "paneId" | "kind" | "name" | "dock">,
  prefs: DisplayLayoutPrefs,
  settings: { dock: DisplayDock },
  caps: readonly DisplayDock[],
): DisplayDock {
  const candidates = [prefs.faces[faceKey(info)]?.dock, prefs.names[nameKey(info)]?.dock, specDock(info), settings.dock];
  for (const c of candidates) if (c !== undefined && caps.includes(c)) return c;
  return "right";
}

/** 帯の場所。優先: 面の記憶 ＞ 同じ名前の記憶 ＞ プログラムの指定 ＞ 設定。 */
export function effectiveEdge(info: Pick<DisplayInfo, "paneId" | "kind" | "name" | "edge">, prefs: DisplayLayoutPrefs, settings: { edge: DisplayEdge }): DisplayEdge {
  return prefs.faces[faceKey(info)]?.edge ?? prefs.names[nameKey(info)]?.edge ?? specEdge(info) ?? settings.edge;
}

/**
 * たたんでいるか。面の記憶があれば、その値（プログラムの指定と設定は効かない）。無ければ、パネルは「置き場所が `float` か、設定が collapsed か、指定が collapsed」、帯は「指定が collapsed」
 * （同じ名前の記憶は、たたみには使わない）。`dock` は、`caps` で丸めた後の `effectiveDock`（帯は null）。
 */
export function effectiveCollapsed(
  info: Pick<DisplayInfo, "paneId" | "kind" | "name" | "collapsed">,
  prefs: DisplayLayoutPrefs,
  settings: { initial: "open" | "collapsed" },
  dock: DisplayDock | null,
): boolean {
  const face = prefs.faces[faceKey(info)];
  if (face) return face.collapsed;
  if (info.kind === "band") return specCollapsed(info);
  return dock === "float" || settings.initial === "collapsed" || specCollapsed(info);
}

/** 「プログラムの指定に戻す」を出すか: 面の記憶がある、または、同じ名前の記憶がいまの置き場所を決めている。 */
export function hasFacePref(info: Pick<DisplayInfo, "paneId" | "kind" | "name">, prefs: DisplayLayoutPrefs): boolean {
  if (prefs.faces[faceKey(info)] !== undefined) return true;
  const n = prefs.names[nameKey(info)];
  return n !== undefined && (info.kind === "panel" ? n.dock !== undefined : n.edge !== undefined);
}

export interface EffectiveFace {
  /** `caps` で丸めた後の置き場所（パネル）。帯は null。 */
  dock: DisplayDock | null;
  edge: DisplayEdge | null;
  collapsed: boolean;
}
export interface LayoutSettings {
  initial: "open" | "collapsed";
  dock: DisplayDock;
  edge: DisplayEdge;
}

/** 面のいまの状態（`caps` で丸めた値）。描画に使う。 */
export function effectiveFace(info: DisplayInfo, prefs: DisplayLayoutPrefs, settings: LayoutSettings, caps: readonly DisplayDock[] = DISPLAY_DOCK_CAPS): EffectiveFace {
  if (info.kind === "band") {
    return { dock: null, edge: effectiveEdge(info, prefs, settings), collapsed: effectiveCollapsed(info, prefs, settings, null) };
  }
  const dock = effectiveDock(info, prefs, settings, caps);
  return { dock, edge: null, collapsed: effectiveCollapsed(info, prefs, settings, dock) };
}

/**
 * 記憶に書く全項目を作る: その時点の導出した値に `patch` を重ねる。**置き場所は、`caps` で丸める前の値**（`--dock bottom` の面を PR-A の画面で 1 回たたんでも、記憶は `bottom`）。
 * ただし丸める前が `float` で、その画面が `float` を出せないときは、丸めた後の値（利用者が窓として見たことの無い面が、窓を出せる版に上げたとたんに開いて出ないように）。
 */
export function composeFacePref(
  info: DisplayInfo,
  prefs: DisplayLayoutPrefs,
  settings: LayoutSettings,
  caps: readonly DisplayDock[],
  patch: { dock?: DisplayDock; edge?: DisplayEdge; collapsed?: boolean; rect?: FaceRect },
): FacePref {
  const current = prefs.faces[faceKey(info)];
  if (info.kind === "band") {
    const edge = patch.edge ?? effectiveEdge(info, prefs, settings);
    return { edge, collapsed: patch.collapsed ?? effectiveCollapsed(info, prefs, settings, null) };
  }
  const rounded = effectiveDock(info, prefs, settings, caps);
  let dock = patch.dock;
  if (dock === undefined) {
    const unrounded = effectiveDock(info, prefs, settings, DISPLAY_DOCKS);
    dock = unrounded === "float" && !caps.includes("float") ? rounded : unrounded;
  }
  const out: FacePref = { dock, collapsed: patch.collapsed ?? effectiveCollapsed(info, prefs, settings, rounded) };
  const rect = patch.rect ?? current?.rect;
  if (rect) out.rect = rect;
  return out;
}
