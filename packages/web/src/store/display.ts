import type { DisplayContent, DisplayInfo } from "@sodashitsu/protocol";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { readPrefs, writePrefs } from "./view.js";

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

  /** 台帳に無くなった面に紐づくものを捨てる。 */
  function prune(): void {
    if ([...contents.value.keys()].some((id) => !infos.value.has(id))) {
      contents.value = new Map([...contents.value].filter(([id]) => infos.value.has(id)));
    }
    if ([...activePanel.value].some(([, id]) => !infos.value.has(id))) {
      activePanel.value = new Map([...activePanel.value].filter(([, id]) => infos.value.has(id)));
    }
    if ([...contentFailed.value].some((id) => !infos.value.has(id))) contentFailed.value = new Set([...contentFailed.value].filter((id) => infos.value.has(id)));
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
