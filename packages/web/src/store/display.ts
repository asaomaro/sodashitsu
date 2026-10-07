import type { DisplayContent, DisplayInfo } from "@sodashitsu/protocol";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

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
  function setFocused(id: string | null): void {
    if (focusedDisplayId.value !== id) focusedDisplayId.value = id;
  }

  /** 台帳に無くなった面に紐づくものを捨てる。 */
  function prune(): void {
    if ([...contents.value.keys()].some((id) => !infos.value.has(id))) {
      contents.value = new Map([...contents.value].filter(([id]) => infos.value.has(id)));
    }
    if ([...activePanel.value].some(([, id]) => !infos.value.has(id))) {
      activePanel.value = new Map([...activePanel.value].filter(([, id]) => infos.value.has(id)));
    }
    const paneIds = new Set(all.value.map((d) => d.paneId));
    if ([...collapsed.value].some((p) => !paneIds.has(p))) {
      collapsed.value = new Set([...collapsed.value].filter((p) => paneIds.has(p)));
    }
    if (focusedDisplayId.value !== null && !infos.value.has(focusedDisplayId.value)) focusedDisplayId.value = null;
  }

  /** 切断・マシンの切り替えで空にする。 */
  function clear(): void {
    infos.value = new Map();
    contents.value = new Map();
    collapsed.value = new Set();
    activePanel.value = new Map();
    focusedDisplayId.value = null;
  }

  return {
    infos,
    contents,
    collapsed,
    activePanel,
    focusedDisplayId,
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
