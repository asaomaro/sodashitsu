import type { DisplayContent, DisplayDock, DisplayEdge, DisplayInfo } from "@sodashitsu/protocol";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  DISPLAY_DOCK_CAPS,
  FACE_PREFS_MAX,
  NAME_PREFS_MAX,
  SIDE_PREFS_MAX,
  SIDE_SIZE_STORED_MAX,
  SIDE_SIZE_STORED_MIN,
  composeFacePref,
  effectiveFace,
  faceKey,
  hasFacePref,
  loadDisplayLayout,
  nameKey,
  pruneLayoutPanes,
  putLast,
  sideKey,
  storedSideSize,
  type DisplayLayoutPrefs,
  type DockSide,
  type EffectiveFace,
  type FacePref,
  type FaceRect,
  type LayoutSettings,
} from "../display/displayPrefs.js";
import type { DockDragState } from "../display/dockDrag.js";
import { defaultFloatRect, insertFloat, raiseFloat as raiseOrder } from "../display/floatGeometry.js";
import { useSettingsStore } from "./settings.js";
import { readPrefs, writePrefs } from "./view.js";

/** 割り付けの結果の写し（部品の外が読む。書くのは `PaneFrame`）。 */
export interface PaneLayoutSnapshot {
  /** 自動でたたんだ面（記憶は変えない）。 */
  auto: string[];
  /** 窓の動ける領域の大きさ（無ければ null）。 */
  floatArea: { w: number; h: number } | null;
  /** 帯の上下・トレイの行・「ほか N 件」の署名。変わると知らせなどが測り直す（固定の部品の位置が動くため）。 */
  placement?: string;
}

/** 今までのパネルの幅の記憶の、読む件数の上限。 */
export const PANEL_WIDTHS_MAX = 64;
const PANEL_WIDTH_STORED_MIN = 160;
const PANEL_WIDTH_STORED_MAX = 8192;

/** `soda.prefs.v1` の `displayPanelWidths` を読む。壊れた値（数でない・範囲の外）は捨てる。 */
export function loadPanelWidths(raw: unknown): Map<string, number> {
  const out = new Map<string, number>();
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v) && v >= PANEL_WIDTH_STORED_MIN && v <= PANEL_WIDTH_STORED_MAX && k !== "") out.set(k, Math.round(v));
    if (out.size >= PANEL_WIDTHS_MAX) break;
  }
  return out;
}

/**
 * 表示の面（`sodactl display`。20261007-soda-extensions）の、画面が持つ写し。**サーバが持つ台帳の写し**で、接続のたびに `display.subscribe` の応答で丸ごと置き換える。
 * 見出し（`infos`）は全 pane の分を持ち、中身（`contents`）は描いている面の分だけ（`DisplayController.ensureContent` が取る）。
 * 並びは「最初に出た順」（`updatedAt` ではなく、`id` を受け取った順。`Map` は挿入順を保つ）。
 */
export const useDisplayStore = defineStore("display", () => {
  const infos = ref(new Map<string, DisplayInfo>());
  const contents = ref(new Map<string, DisplayContent>());
  /** pane ごとに選んでいるパネル（面の id）。 */
  const activePanel = ref(new Map<string, string>());
  /** いまフォーカスが枠にある面の id（`DisplayFrame` が `window` の `blur`/`focus`/`focusin` で更新する）。 */
  const focusedDisplayId = ref<string | null>(null);
  /** 中身を取れなかった面（大きさが合わないなど）。固定の文言を出す。取れたら外す。 */
  const contentFailed = ref(new Set<string>());
  /** モバイルの重ね表示（`MobileDisplaySheet`）を開ける画面か（`MobileShell` が載っている間だけ真）。 */
  const sheetAvailable = ref(false);
  /** 重ね表示を開く要求（`prefix+i` がパネルの枠へ移れないモバイルで増える。`MobileShell` が見て開く）。 */
  const sheetRequest = ref(0);
  /** この画面が、スクリプトが動く形式（`script-html`）を出せると名乗ったか（`display.subscribe` の `features`。名乗らなければ、固定の文言を出して動かさない）。 */
  const scriptCapable = ref(true);
  /** ［操作する］ボタンを強調している面の id（覆いや枠を押したとき、1 秒だけ。押しても操作は始まらないので、場所を教える）。 */
  const engageHint = ref<string | null>(null);
  let engageHintTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * 今までの、利用者が変えた右のパネルの幅（pane の id → px。`soda.prefs.v1` の `displayPanelWidths`）。**読むだけ**（新しい値は `layoutPrefs.sides` に書く。消さない・書かない）。
   * 側の大きさの記憶が無いとき、右の側だけがこれを引き継いで読む。
   */
  const panelWidths = ref(loadPanelWidths(readPrefs()["displayPanelWidths"]));

  /** 面の置き場所・たたみ・窓の位置の記憶（その画面だけ。`soda.prefs.v1` の `displayLayout`。書くのは利用者の操作だけ）。 */
  const layoutPrefs = ref<DisplayLayoutPrefs>(loadDisplayLayout(readPrefs()["displayLayout"]));
  /** 側ごとに選んでいるタブ（`${paneId}|${side}` → 面の id）。デスクトップ用（モバイルは `activePanel`）。 */
  const activeBySide = ref(new Map<string, string>());
  /** pane ごとに最後に操作した面（`prefix+i` の行き先）。 */
  const lastFace = ref(new Map<string, string>());
  /** 割り付けの結果の写し（pane の id → 結果）。 */
  const layoutByPane = ref(new Map<string, PaneLayoutSnapshot>());
  /** 面（パネル）の D&D の最中の状態（つかんだ面・pane・いまポインタのある場所）。無ければ null。`view.paneDrag`（pane の名前の D&D）とは別。 */
  const dockDrag = ref<DockDragState | null>(null);
  function setDockDrag(next: DockDragState | null): void {
    const cur = dockDrag.value;
    if (cur === null && next === null) return;
    if (cur && next && cur.id === next.id && cur.paneId === next.paneId && cur.zone === next.zone) return;
    dockDrag.value = next;
  }
  /** 割り付けが変わるたびに 1 増える数（知らせの位置の測り直しの合図）。浮いた窓のドラッグ中にも増える。 */
  const layoutRev = ref(0);
  function bumpLayoutRev(): void {
    layoutRev.value++;
  }
  /** 浮いた窓の重なりの順（pane の id → 面の id の並び。末尾が最前面）。DOM の並びは変えず、`z-index` だけに使う。 */
  const floatOrder = ref(new Map<string, string[]>());
  /** キーで動かす／大きさを変える途中の窓（無ければ null）。 */
  const floatKeyMode = ref<{ id: string; paneId: string; mode: "move" | "resize" } | null>(null);
  function startFloatKeys(info: Pick<DisplayInfo, "id" | "paneId">, mode: "move" | "resize"): void {
    floatKeyMode.value = { id: info.id, paneId: info.paneId, mode };
  }
  function endFloatKeys(id?: string): void {
    if (floatKeyMode.value && (id === undefined || floatKeyMode.value.id === id)) floatKeyMode.value = null;
  }

  const all = computed<DisplayInfo[]>(() => [...infos.value.values()]);

  function panelsOf(paneId: string): DisplayInfo[] {
    return all.value.filter((d) => d.paneId === paneId && d.kind === "panel");
  }
  function bandsOf(paneId: string): DisplayInfo[] {
    return all.value.filter((d) => d.paneId === paneId && d.kind === "band");
  }
  /** pane の、いま見せるパネル（選んでいるものが無ければ最初のもの）。 */
  function activePanelOf(paneId: string): DisplayInfo | null {
    const panels = panelsOf(paneId);
    if (panels.length === 0) return null;
    const id = activePanel.value.get(paneId);
    return panels.find((p) => p.id === id) ?? panels[0] ?? null;
  }
  /** 面があるか（種類を問わない）。 */
  function hasAny(paneId: string): boolean {
    return all.value.some((d) => d.paneId === paneId);
  }

  /** 接続ごとの `display.subscribe` の応答で丸ごと置き換える。消えた面の中身・選択も捨てる。 */
  function replaceAll(list: readonly DisplayInfo[]): void {
    const next = new Map<string, DisplayInfo>();
    for (const d of list) next.set(d.id, d);
    infos.value = next;
    prune();
  }
  /** 出た・更新された面（`display.updated`）。 */
  function upsert(info: DisplayInfo): void {
    const next = new Map(infos.value);
    next.set(info.id, info);
    infos.value = next;
  }
  /** 消えた面（`display.removed`）。知らない id は何もしない。 */
  // フォーカスの印（`focusedDisplayId`）は、面が消えても、その枠の部品が外れるときに自分で下ろす（端末へ戻すため）。ここでは触らない。
  function remove(id: string): void {
    if (!infos.value.has(id)) return;
    const next = new Map(infos.value);
    next.delete(id);
    infos.value = next;
    prune();
  }
  function setContent(c: DisplayContent): void {
    const next = new Map(contents.value);
    next.set(c.id, c);
    contents.value = next;
  }
  function setContentFailed(id: string, on: boolean): void {
    if (contentFailed.value.has(id) === on) return;
    const next = new Set(contentFailed.value);
    if (on) next.add(id);
    else next.delete(id);
    contentFailed.value = next;
  }
  function setActivePanel(paneId: string, id: string): void {
    const next = new Map(activePanel.value);
    next.set(paneId, id);
    activePanel.value = next;
  }
  function setScriptCapable(on: boolean): void {
    scriptCapable.value = on;
  }
  /** ［操作する］ボタンを 1 秒だけ強調する。 */
  function nudgeEngage(id: string, ms = 1000): void {
    engageHint.value = id;
    if (engageHintTimer !== null) clearTimeout(engageHintTimer);
    engageHintTimer = setTimeout(() => {
      engageHintTimer = null;
      if (engageHint.value === id) engageHint.value = null;
    }, ms);
  }
  function setFocused(id: string | null): void {
    if (focusedDisplayId.value !== id) focusedDisplayId.value = id;
    // 面が操作中になったら、その pane の「最後に操作した面」にする（`prefix+i` の行き先）。
    if (id !== null) {
      const info = infos.value.get(id);
      if (info) {
        setLastFace(info.paneId, id);
        // 重なりの決まり 1: 操作中の窓は、いつも最前面。
        if (isOpenFloat(info)) raiseFloat(info.paneId, id);
      }
    }
  }
  /** 開いている浮いた窓か（自動でたたまれた窓も含む。並びの管理だけに使う）。 */
  function isOpenFloat(info: DisplayInfo): boolean {
    if (info.kind !== "panel") return false;
    const f = effectiveOf(info);
    return f.dock === "float" && !f.collapsed;
  }
  /** 押した窓を最前面へ（決まり 2。操作中の id は見ない）。 */
  function raiseFloat(paneId: string, id: string): void {
    const cur = floatOrder.value.get(paneId) ?? [];
    const next = raiseOrder(cur, id);
    if (next.length === cur.length && next.every((x, i) => x === cur[i])) return;
    const m = new Map(floatOrder.value);
    m.set(paneId, next);
    floatOrder.value = m;
  }
  /** 利用者の操作で開いた窓の id（次に並びへ入るとき、最前面へ。プログラムの出し直し・記憶から開いた窓は、最背面）。 */
  const userOpenedFloats = new Set<string>();
  /**
   * 出ている窓の集まり `open` に、並びを合わせる。新しく出た窓は、**利用者の操作で開いた窓だけ**が最前面（操作中の窓があればその後ろ。決まり 3）に入り、
   * プログラムの出し直し（`close` → `set`）・記憶から開いた窓は**最背面**に入る（利用者が前へ出した窓の上へ、プログラムが自分を置き直せない）。
   * `keep` に入っている窓（開いているが、pane が小さくて自動でたたまれている窓）は、並びから外さない（広げ直したとき、利用者の順が戻る）。
   */
  function syncFloatOrder(paneId: string, open: readonly string[], keep: readonly string[] = open): void {
    const cur = floatOrder.value.get(paneId) ?? [];
    const engaged = focusedDisplayId.value !== null && infos.value.get(focusedDisplayId.value)?.paneId === paneId ? focusedDisplayId.value : null;
    const keepSet = new Set([...keep, ...open]);
    let next = cur.filter((id) => keepSet.has(id));
    const fresh = open.filter((id) => !next.includes(id));
    const back = fresh.filter((id) => !userOpenedFloats.has(id));
    const front = fresh.filter((id) => userOpenedFloats.has(id));
    for (const id of fresh) userOpenedFloats.delete(id);
    next = [...back, ...next];
    for (const id of front) next = insertFloat(next, id, engaged);
    if (engaged !== null && open.includes(engaged)) next = raiseOrder(next, engaged);
    if (next.length === cur.length && next.every((x, i) => x === cur[i])) return;
    const m = new Map(floatOrder.value);
    if (next.length === 0) m.delete(paneId);
    else m.set(paneId, next);
    floatOrder.value = m;
  }

  // --- 置き場所・たたみの記憶（20261008-display-layout）。書くのは利用者の操作（部品・メニュー・キー）だけ ------------------------------------------------

  function layoutSettings(): LayoutSettings {
    const st = useSettingsStore();
    return { initial: st.displayPanelInitial, dock: st.displayPanelDock, edge: st.displayBandEdge };
  }
  function saveLayout(next: DisplayLayoutPrefs): void {
    layoutPrefs.value = next;
    writePrefs({ displayLayout: next });
  }
  /** 面のいまの状態（`caps` で丸めた値）。描画が読む。 */
  function effectiveOf(info: DisplayInfo): EffectiveFace {
    return effectiveFace(info, layoutPrefs.value, layoutSettings(), DISPLAY_DOCK_CAPS);
  }
  function hasPref(info: DisplayInfo): boolean {
    return hasFacePref(info, layoutPrefs.value);
  }
  /**
   * 記憶を書く唯一の口。**その時点の導出した値に `patch` を重ねた全項目を書く**（変えた項目だけを書かない。置き場所は `caps` で丸める前の値。`composeFacePref`）。
   * 部品・メニュー・キーは、これを直に呼ばず、下の `setFace*` を呼ぶ。
   */
  function writeFace(info: DisplayInfo, patch: { dock?: DisplayDock; edge?: DisplayEdge; collapsed?: boolean; rect?: FaceRect }): void {
    const face: FacePref = composeFacePref(info, layoutPrefs.value, layoutSettings(), DISPLAY_DOCK_CAPS, patch);
    // 窓を開く操作は、記憶に矩形が無ければ初めの矩形を一緒に書く（開いた窓は、いつも記憶に矩形を持つ。書いた後は、`set --size` の変更・ほかの窓の開閉で動かない）。
    // 窓の動ける領域が分からない間（`floatArea` が null）は書かない（その間、窓を開く操作は受けない）。
    if (face.dock === "float" && !face.collapsed && !face.rect) {
      const area = layoutByPane.value.get(info.paneId)?.floatArea ?? null;
      if (area) face.rect = defaultFloatRect(openFloatCount(info), info.size, area);
    }
    saveLayout({ ...layoutPrefs.value, faces: putLast(layoutPrefs.value.faces, faceKey(info), face, FACE_PREFS_MAX) });
  }
  /** この pane で、いま開いている浮いた窓の数（自動でたたまれた窓と、`except` は数えない）。初めの矩形のずらしに使う。 */
  function openFloatCount(except: DisplayInfo): number {
    const auto = new Set(layoutByPane.value.get(except.paneId)?.auto ?? []);
    return all.value.filter((d) => d.paneId === except.paneId && d.id !== except.id && isOpenFloat(d) && !auto.has(d.id)).length;
  }
  /** 浮いた窓を開く操作を受けられるか（窓の動ける領域が分かっている）。トレイのボタン・面の一覧・メニュー・`prefix+i`・D&D の中央が見る。 */
  function canOpenFloat(paneId: string): boolean {
    return layoutByPane.value.get(paneId)?.floatArea != null;
  }
  /** 記憶の矩形（無ければ undefined）。 */
  function faceRectOf(info: DisplayInfo): FaceRect | undefined {
    return layoutPrefs.value.faces[faceKey(info)]?.rect;
  }
  function writeName(info: DisplayInfo, entry: { dock?: DisplayDock; edge?: DisplayEdge }): void {
    saveLayout({ ...layoutPrefs.value, names: putLast(layoutPrefs.value.names, nameKey(info), entry, NAME_PREFS_MAX) });
  }
  function setLastFace(paneId: string, id: string): void {
    if (lastFace.value.get(paneId) === id) return;
    const next = new Map(lastFace.value);
    next.set(paneId, id);
    lastFace.value = next;
  }
  function setActiveBySide(paneId: string, side: DockSide, id: string): void {
    const k = sideKey(paneId, side);
    if (activeBySide.value.get(k) === id) return;
    const next = new Map(activeBySide.value);
    next.set(k, id);
    activeBySide.value = next;
  }
  /** たたむ／開く。開いたら「最後に操作した面」にする。 */
  function setFaceCollapsed(info: DisplayInfo, on: boolean): void {
    if (!on && info.kind === "panel") userOpenedFloats.add(info.id); // 利用者が開いた窓は最前面（窓でなければ使われない）
    writeFace(info, { collapsed: on });
    if (!on) {
      setLastFace(info.paneId, info.id);
      // 開いた面は、その側の「選んでいるタブ」になる（開いたのに別のタブが出たままにならない）。
      const dock = info.kind === "panel" ? effectiveOf(info).dock : null;
      if (dock !== null && dock !== "float") setActiveBySide(info.paneId, dock, info.id);
    }
  }
  /** パネルの置き場所を変える。移った先で開く（`collapsed: false`）。同じ名前の面も、この置き場所を引き継ぐ。 */
  function setFaceDock(info: DisplayInfo, dock: DisplayDock, rect?: FaceRect): void {
    if (dock === "float") userOpenedFloats.add(info.id);
    writeFace(info, { dock, collapsed: false, ...(rect ? { rect } : {}) });
    writeName(info, { dock });
    setLastFace(info.paneId, info.id);
    if (dock !== "float") setActiveBySide(info.paneId, dock, info.id);
  }
  /** 帯の場所を変える。移った先で開く。 */
  function setFaceEdge(info: DisplayInfo, edge: DisplayEdge): void {
    writeFace(info, { edge, collapsed: false });
    writeName(info, { edge });
    setLastFace(info.paneId, info.id);
  }
  function setFaceRect(info: DisplayInfo, rect: FaceRect): void {
    writeFace(info, { rect });
  }
  /** 利用者が決めた側の大きさを覚える（確定のたびに 1 回）。 */
  function setSideSize(paneId: string, side: DockSide, px: number): void {
    const v = Math.min(SIDE_SIZE_STORED_MAX, Math.max(SIDE_SIZE_STORED_MIN, Math.round(px)));
    saveLayout({ ...layoutPrefs.value, sides: putLast(layoutPrefs.value.sides, sideKey(paneId, side), v, SIDE_PREFS_MAX) });
  }
  function clearSideSize(paneId: string, side: DockSide): void {
    const k = sideKey(paneId, side);
    if (layoutPrefs.value.sides[k] === undefined) return;
    const { [k]: _gone, ...rest } = layoutPrefs.value.sides;
    void _gone;
    saveLayout({ ...layoutPrefs.value, sides: rest });
  }
  /** 側の大きさの記憶（右は、無ければ今までの `displayPanelWidths` を読む）。 */
  function sideSizeOf(paneId: string, side: DockSide): number | undefined {
    return storedSideSize(layoutPrefs.value, paneId, side, panelWidths.value);
  }
  /** 「プログラムの指定に戻す」: 面の記憶と、同じ名前の記憶を消す。 */
  function resetFace(info: DisplayInfo): void {
    const { [faceKey(info)]: _f, ...faces } = layoutPrefs.value.faces;
    const { [nameKey(info)]: _n, ...names } = layoutPrefs.value.names;
    void _f;
    void _n;
    saveLayout({ ...layoutPrefs.value, faces, names });
  }
  /** もう無い pane の分を捨てる（スナップショットを受けたとき）。 */
  function pruneLayout(live: ReadonlySet<string>): void {
    const next = pruneLayoutPanes(layoutPrefs.value, live);
    if (next !== layoutPrefs.value) saveLayout(next);
  }
  /** 割り付けの結果の写しを書く（`PaneFrame`）。変わったら `layoutRev` を 1 増やす。 */
  function setLayoutSnapshot(paneId: string, snap: PaneLayoutSnapshot | null): void {
    const cur = layoutByPane.value.get(paneId);
    if (snap === null) {
      if (cur === undefined) return;
      const next = new Map(layoutByPane.value);
      next.delete(paneId);
      layoutByPane.value = next;
    } else {
      if (cur && JSON.stringify(cur) === JSON.stringify(snap)) return;
      const next = new Map(layoutByPane.value);
      next.set(paneId, snap);
      layoutByPane.value = next;
    }
    layoutRev.value++;
  }

  /** 台帳に無くなった面に紐づくものを捨てる。 */
  function prune(): void {
    if ([...contents.value.keys()].some((id) => !infos.value.has(id))) {
      contents.value = new Map([...contents.value].filter(([id]) => infos.value.has(id)));
    }
    if ([...activePanel.value].some(([, id]) => !infos.value.has(id))) {
      activePanel.value = new Map([...activePanel.value].filter(([, id]) => infos.value.has(id)));
    }
    if ([...contentFailed.value].some((id) => !infos.value.has(id))) contentFailed.value = new Set([...contentFailed.value].filter((id) => infos.value.has(id)));
    if ([...activeBySide.value].some(([, id]) => !infos.value.has(id))) {
      activeBySide.value = new Map([...activeBySide.value].filter(([, id]) => infos.value.has(id)));
    }
    if ([...lastFace.value].some(([, id]) => !infos.value.has(id))) {
      lastFace.value = new Map([...lastFace.value].filter(([, id]) => infos.value.has(id)));
    }
    if ([...floatOrder.value.values()].some((ids) => ids.some((id) => !infos.value.has(id)))) {
      floatOrder.value = new Map([...floatOrder.value].map(([p, ids]) => [p, ids.filter((id) => infos.value.has(id))] as [string, string[]]).filter(([, ids]) => ids.length > 0));
    }
    if (floatKeyMode.value && !infos.value.has(floatKeyMode.value.id)) floatKeyMode.value = null;
  }

  /** 切断・マシンの切り替えで空にする。 */
  function clear(): void {
    infos.value = new Map();
    contents.value = new Map();
    activePanel.value = new Map();
    activeBySide.value = new Map();
    lastFace.value = new Map();
    layoutByPane.value = new Map();
    floatOrder.value = new Map();
    floatKeyMode.value = null;
    // フォーカスの印は下ろさない（枠の部品が外れるときに自分で下ろして端末へ戻す。ここで下ろすと戻せない）。
    contentFailed.value = new Set();
  }

  return {
    infos,
    contents,
    activePanel,
    focusedDisplayId,
    contentFailed,
    setContentFailed,
    scriptCapable,
    setScriptCapable,
    engageHint,
    nudgeEngage,
    sheetAvailable,
    sheetRequest,
    layoutPrefs,
    activeBySide,
    lastFace,
    layoutByPane,
    layoutRev,
    bumpLayoutRev,
    floatOrder,
    floatKeyMode,
    startFloatKeys,
    endFloatKeys,
    raiseFloat,
    syncFloatOrder,
    canOpenFloat,
    faceRectOf,
    dockDrag,
    setDockDrag,
    effectiveOf,
    hasPref,
    writeFace,
    setFaceCollapsed,
    setFaceDock,
    setFaceEdge,
    setFaceRect,
    setSideSize,
    clearSideSize,
    sideSizeOf,
    resetFace,
    pruneLayout,
    setLayoutSnapshot,
    setActiveBySide,
    setLastFace,
    panelWidths,
    all,
    panelsOf,
    bandsOf,
    activePanelOf,
    hasAny,
    replaceAll,
    upsert,
    remove,
    setContent,
    setActivePanel,
    setFocused,
    clear,
  };
});
