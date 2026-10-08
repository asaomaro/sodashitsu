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
import { useSettingsStore } from "./settings.js";
import { readPrefs, writePrefs } from "./view.js";

/** 割り付けの結果の写し（部品の外が読む。書くのは `PaneFrame`）。 */
export interface PaneLayoutSnapshot {
  /** 自動でたたんだ面（記憶は変えない）。 */
  auto: string[];
  /** 窓の動ける領域の大きさ（無ければ null）。 */
  floatArea: { w: number; h: number } | null;
}

/** 覚えるパネルの幅の件数の上限（超えたら古い順に捨てる）。 */
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
  /** たたんでいるパネルの pane（その画面だけ。保存しない）。 */
  const collapsed = ref(new Set<string>());
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
  /** 利用者が変えたパネルの幅（pane の id → px）。この画面が覚える（`soda.prefs.v1` の `displayPanelWidths`。共有の設定へ送らない）。 */
  const panelWidths = ref(loadPanelWidths(readPrefs()["displayPanelWidths"]));

  /** 面の置き場所・たたみ・窓の位置の記憶（その画面だけ。`soda.prefs.v1` の `displayLayout`。書くのは利用者の操作だけ）。 */
  const layoutPrefs = ref<DisplayLayoutPrefs>(loadDisplayLayout(readPrefs()["displayLayout"]));
  /** 側ごとに選んでいるタブ（`${paneId}|${side}` → 面の id）。デスクトップ用（モバイルは `activePanel`）。 */
  const activeBySide = ref(new Map<string, string>());
  /** pane ごとに最後に操作した面（`prefix+i` の行き先）。 */
  const lastFace = ref(new Map<string, string>());
  /** 割り付けの結果の写し（pane の id → 結果）。 */
  const layoutByPane = ref(new Map<string, PaneLayoutSnapshot>());
  /** 割り付けが変わるたびに 1 増える数（知らせの位置の測り直しの合図）。 */
  const layoutRev = ref(0);

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
  function setCollapsed(paneId: string, on: boolean): void {
    if (collapsed.value.has(paneId) === on) return;
    const next = new Set(collapsed.value);
    if (on) next.add(paneId);
    else next.delete(paneId);
    collapsed.value = next;
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
      if (info) setLastFace(info.paneId, id);
    }
  }

  function savePanelWidths(): void {
    writePrefs({ displayPanelWidths: Object.fromEntries(panelWidths.value) });
  }
  /** 利用者が変えた幅を覚える（確定のたびに 1 回）。64 件を超えたら古い順に捨てる。 */
  function setPanelWidth(paneId: string, px: number): void {
    const next = new Map(panelWidths.value);
    next.delete(paneId); // 最近使ったものを末尾へ
    next.set(paneId, Math.round(px));
    while (next.size > PANEL_WIDTHS_MAX) next.delete(next.keys().next().value as string);
    panelWidths.value = next;
    savePanelWidths();
  }
  /** 覚えた幅を消す（プログラムの指定の幅へ戻る）。 */
  function clearPanelWidth(paneId: string): void {
    if (!panelWidths.value.has(paneId)) return;
    const next = new Map(panelWidths.value);
    next.delete(paneId);
    panelWidths.value = next;
    savePanelWidths();
  }
  /** もう無い pane の分を捨てる（スナップショットを受けたとき）。 */
  function pruneWidths(live: ReadonlySet<string>): void {
    if (![...panelWidths.value.keys()].some((id) => !live.has(id))) return;
    panelWidths.value = new Map([...panelWidths.value].filter(([id]) => live.has(id)));
    savePanelWidths();
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
    saveLayout({ ...layoutPrefs.value, faces: putLast(layoutPrefs.value.faces, faceKey(info), face, FACE_PREFS_MAX) });
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
    writeFace(info, { collapsed: on });
    if (!on) setLastFace(info.paneId, info.id);
  }
  /** パネルの置き場所を変える。移った先で開く（`collapsed: false`）。同じ名前の面も、この置き場所を引き継ぐ。 */
  function setFaceDock(info: DisplayInfo, dock: DisplayDock, rect?: FaceRect): void {
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
    const paneIds = new Set(all.value.map((d) => d.paneId));
    if ([...collapsed.value].some((p) => !paneIds.has(p))) {
      collapsed.value = new Set([...collapsed.value].filter((p) => paneIds.has(p)));
    }
  }

  /** 切断・マシンの切り替えで空にする。 */
  function clear(): void {
    infos.value = new Map();
    contents.value = new Map();
    collapsed.value = new Set();
    activePanel.value = new Map();
    activeBySide.value = new Map();
    lastFace.value = new Map();
    layoutByPane.value = new Map();
    // フォーカスの印は下ろさない（枠の部品が外れるときに自分で下ろして端末へ戻す。ここで下ろすと戻せない）。
    contentFailed.value = new Set();
  }

  return {
    infos,
    contents,
    collapsed,
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
    setPanelWidth,
    clearPanelWidth,
    pruneWidths,
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
    setCollapsed,
    setFocused,
    clear,
  };
});
