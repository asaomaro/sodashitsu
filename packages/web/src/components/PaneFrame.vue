<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ActionDispatcherKey, DisplayHostKey, TerminalRegistryKey } from "../injection.js";
import { isScriptFormat } from "../display/framePage.js";
import { resolvePaneDisplays, type LayoutResult } from "../display/paneDisplayLayout.js";
import { NO_NEIGHBORS, resolvePaneChrome, type PaneSide, type PaneSides } from "../layout/paneChrome.js";
import type { Side as PaneSide2 } from "../display/paneDisplayLayout.js";
import { paneNameOf } from "@sodashitsu/client-core";
import { getCellSize } from "../term/measure.js";
import { useDisplayStore } from "../store/display.js";
import { useSessionStore } from "../store/session.js";
import DisplayDropZones from "./DisplayDropZones.vue";
import PaneBands from "./PaneBands.vue";
import PanePanel from "./PanePanel.vue";
import { useSettingsStore } from "../store/settings.js";
import { useViewStore } from "../store/view.js";
import { watchDragInterrupt } from "../store/dragInterrupt.js";
import { zoneAt, type Zone } from "../term/paneDragZone.js";

/**
 * pane の枠（design M7 の後半「pane の枠の右クリックは常にメニューを開く」。D110）。`PaneLayout` が葉（測る要素）の外側を
 * これで包む——枠の太さの分は葉の外なので、`ViewSync` が葉で測る cols/rows に入らない（端末の外の縁になる）。
 *
 * - 枠（`.pane-frame-edge`）の右クリックは、その pane の `rightClick` の設定やアプリのマウスの報告に関わらず、常に pane の
 *   メニューを開く（`MouseBridge` は端末の上の右クリックだけを振り分ける）。「右クリックを pane に送る」にした pane で、
 *   マウスを使うアプリが動いている間も、ここからメニューを開いて戻せる。
 * - 枠の押下は、その pane を選んで端末にフォーカスする（M1。枠そのものにはフォーカスを移さない）。
 * - キーボード：枠は APG の menu button（`role=button`・`aria-haspopup=menu`）で、Enter・Space・↓・Shift+F10・
 *   ContextMenu キーでメニューを開く。メニューを Esc で閉じると枠へ戻る（`ContextMenu`）。**Tab で止まるのは選ばれている
 *   pane（`view.focusedPaneId`）の枠だけ**（roving tabindex。`TerminalPane` の端末の入力欄も同じ。独立点検 #2）——端末は Tab を
 *   そのまま受け取るので、ほかの pane の端末や枠が Tab の順に並んでいると、先頭の pane の端末で止まって 2 つ目以降の pane の枠へ
 *   届かなかった。pane を prefix のキー（`h/j/k/l`・`Tab`）で選び、端末の外（tab バー）から Tab で来る。
 * - 枠の中（枠そのもの・端末）にフォーカスがあるまま枠が消える（pane を閉じた）と、フォーカスは body に落ちる。そのときは選ばれて
 *   いる pane の端末へ移す（独立点検 #4：選ばれていない pane のメニューから「閉じる」を選ぶと、`focusedPaneId` が変わらないので
 *   ほかに移す処理が無かった）。
 * - 枠は端末（葉）の後ろに敷き、葉を `position: relative` で上に重ねる——枠の要素は端末を包まないので、操作できる要素の
 *   入れ子にならない。
 * - エージェント名の可視ラベル（`.pane-frame-name`。20260922-appearance-settings-rest。opt-in・AC11）は、
 *   **`.pane-frame-body`（端末）より後の兄弟**として置く——`z-index:auto` の重なりは DOM 順で後のものが
 *   上に来るため、枠（`.pane-frame-edge`）の中に置くと端末の不透明な内容の下に隠れて見えなくなる
 *   （taskcheck がスクリーンショットで実際に発見した不具合。`pointer-events: none` で端末のクリックは妨げない）。
 *
 * `enabled` が false（モバイルの `MobileShell`・単体テスト）なら枠を描かず、ストアにも触れない（`enabled` は作った後に
 * 変えない前提。モバイルは葉を PTY の大きさの縮小の枠に置くので、縁を足すと端末がはみ出る）。
 *
 * 余白は辺ごとに決める（20260926-pane-frame-auto-mode。`layout/paneChrome.ts`）。`multiPane`（tab が分割されているか）と
 * `neighbors`（どの辺に隣の pane があるか）は `PaneLayout` が渡す。枠を描かない（`framed` が偽）ときは外周の余白・選択の強調・
 * 名前を描かない。tabindex とメニューを開くキーは枠の有無に関わらず同じ。
 */
const props = defineProps<{ paneId: string; enabled?: boolean; multiPane?: boolean; neighbors?: PaneSides }>();

const actions = inject(ActionDispatcherKey, undefined);
const registry = inject(TerminalRegistryKey, undefined);
const session = props.enabled ? useSessionStore() : null;
const view = props.enabled ? useViewStore() : null;
const settings = props.enabled ? useSettingsStore() : null;
const edge = ref<HTMLElement | null>(null);

// --- 表示の面（パネル・帯。20261007-soda-extensions）。`enabled` のときだけ（モバイル・単体テストはストアに触れない）。---------------------------
const displays = props.enabled ? useDisplayStore() : null;
const displayHost = inject(DisplayHostKey, undefined);
/** その pane のどれかの面にフォーカスがある（操作中。端末を薄くする）。 */
const displayEngaged = computed(() => {
  const id = displays?.focusedDisplayId;
  return !!displays && id != null && displays.infos.get(id)?.paneId === props.paneId;
});
const bodyEl = ref<HTMLElement | null>(null);
/** つまみをドラッグしている間の、案内の線（側と、その側のいま指している大きさ px）。無ければ null。 */
const guide = ref<{ side: PaneSide2; px: number } | null>(null);
const bodySize = ref({ w: 0, h: 0 });
let bodyObserver: ResizeObserver | null = null;
onMounted(() => {
  if (!props.enabled || typeof ResizeObserver === "undefined" || !bodyEl.value) return;
  bodyObserver = new ResizeObserver((entries) => {
    const r = entries[0]?.contentRect;
    if (r) bodySize.value = { w: r.width, h: r.height };
  });
  bodyObserver.observe(bodyEl.value);
});
onBeforeUnmount(() => {
  bodyObserver?.disconnect();
  displays?.setLayoutSnapshot(props.paneId, null);
});
/** pane の端末のセルの大きさ（px）。取れなければ 9×18。 */
const cellSize = computed(() => {
  void bodySize.value; // 大きさが変わったら読み直す
  const term = registry?.get(props.paneId)?.term;
  if (!term) return { width: 9, height: 18 };
  const c = getCellSize(term);
  return { width: c.width > 0 ? c.width : 9, height: c.height > 0 ? c.height : 18 };
});

/**
 * 面の割り付け（帯・トレイ・パネル。20261008-display-layout）。**本体の箱が 0×0 の間は、面の部品を 1 つも載せない**（全部が自動でたたまれた形を、いったん描かない）。
 * 計算が例外を投げたら、面なしへ落とす（面は出ないが pane は生きる）。
 */
const layout = computed<LayoutResult | null>(() => {
  if (!displays || bodySize.value.w <= 0 || bodySize.value.h <= 0) return null;
  try {
    const all = displays.all.filter((d) => d.paneId === props.paneId);
    if (all.length === 0) return null;
    const bands: Parameters<typeof resolvePaneDisplays>[0]["bands"] = [];
    const panels: Parameters<typeof resolvePaneDisplays>[0]["panels"] = [];
    all.forEach((d, seq) => {
      const f = displays.effectiveOf(d);
      if (d.kind === "band") bands.push({ id: d.id, seq, size: d.size, edge: f.edge ?? "top", collapsed: f.collapsed, script: isScriptFormat(d.format) && displays.scriptCapable && settings?.displayScriptEnabled === true });
      else panels.push({ id: d.id, seq, size: d.size, dock: f.dock ?? "right", collapsed: f.collapsed });
    });
    const sides = ["right", "left", "top", "bottom"] as const;
    const active: Partial<Record<(typeof sides)[number], string>> = {};
    const sideSizes: Partial<Record<(typeof sides)[number], number>> = {};
    for (const side of sides) {
      const a = displays.activeBySide.get(`${props.paneId}|${side}`);
      if (a) active[side] = a;
      const size = displays.sideSizeOf(props.paneId, side);
      if (size !== undefined) sideSizes[side] = size;
    }
    return resolvePaneDisplays({
      paneW: bodySize.value.w,
      paneH: bodySize.value.h,
      cellW: cellSize.value.width,
      cellH: cellSize.value.height,
      bands,
      panels,
      active,
      sideSizes,
      floatRects: {},
      trayEdgeDefault: settings?.displayBandEdge ?? "top",
    });
  } catch (e) {
    console.error("display layout failed", e instanceof Error ? e.name : "error"); // 中身・題は書かない
    return null;
  }
});
/** 固定の部品の位置が変わる割り付け（帯の上下・たたみ・トレイの行・「ほか N 件」）の署名。 */
const placementOf = (l: LayoutResult): string => JSON.stringify([l.bands, l.tray.edge, l.tray.row, l.tray.hostBandId, l.tray.buttons.length]);
const showEdge = (edge: "top" | "bottom"): boolean => {
  const l = layout.value;
  if (!l) return false;
  const here = edge === "top" ? l.bands.top : l.bands.bottom;
  return here.length > 0 || (l.tray.edge === edge && (l.tray.row === "own" || l.bands.more.length > 0));
};
const docks = computed(() => layout.value?.docks ?? null);
/** この pane の面を D&D している間の、落とせる場所の表示（`DisplayDropZones`）。いまの置き場所は、つかんでいる面の側。 */
const dropZones = computed(() => {
  const d = displays?.dockDrag;
  if (!d || d.paneId !== props.paneId) return null;
  const cur = displays.infos.get(d.id);
  return { zone: d.zone, current: cur ? (displays.effectiveOf(cur).dock ?? null) : null };
});

/**
 * つまみのドラッグの間の案内の線の位置（本体の箱を基準。`.pane-frame-guide`）。左右の側は、端末の領域の高さに沿った縦線（`left`/`right` が側の縁から `px`）、
 * 上下の側は、本体の幅いっぱいの横線（`top`/`bottom` が、その側の外にある帯の行の分と `px`）。右だけのときの見える位置は、今までと同じ。
 */
const guideStyle = computed(() => {
  const g = guide.value;
  const l = layout.value;
  if (!g || !l) return null;
  const t = l.terminal;
  const topRows = t.y - (l.docks.top?.size ?? 0);
  const bottomRows = bodySize.value.h - (t.y + t.h) - (l.docks.bottom?.size ?? 0);
  if (g.side === "right") return { right: `${g.px}px`, top: `${t.y}px`, height: `${t.h}px`, width: "3px", marginRight: "-1.5px" };
  if (g.side === "left") return { left: `${g.px}px`, top: `${t.y}px`, height: `${t.h}px`, width: "3px", marginLeft: "-1.5px" };
  if (g.side === "top") return { top: `${topRows + g.px}px`, left: "0px", right: "0px", height: "3px", marginTop: "-1.5px" };
  return { bottom: `${bottomRows + g.px}px`, left: "0px", right: "0px", height: "3px", marginBottom: "-1.5px" };
});

// --- 割り付けが変わったときの備えと、結果の写し --------------------------------------------------------------------------------
// フォーカスのあった部品（見出し・トレイ・つまみ）が、自動のたたみ・プログラムの close・指定の変更で消えても、フォーカスを `body` に落とさない。
// 描き直しの前（pre）にフォーカスの場所を控え、描き直しの後（post）に、控えが真で、いま `body` か文書に無く、modal のダイアログが開いていなければ、端末へ移す
// （`host.focusTerminal` は pane の選択も変えるので、もともと `body` にあったフォーカスや、modal の下では動かさない）。
let focusWasInChrome = false;
watch(
  layout,
  () => {
    const a = document.activeElement;
    focusWasInChrome = a instanceof Element && bodyEl.value?.contains(a) === true && a.closest("[data-display-chrome], [data-display-tray], [data-pane-panel-resize]") !== null;
  },
  { flush: "pre" },
);
watch(
  layout,
  (l) => {
    if (displays) {
      displays.setLayoutSnapshot(props.paneId, l ? { auto: l.auto, floatArea: null, placement: placementOf(l) } : null);
    }
    const a = document.activeElement;
    if (focusWasInChrome && (a === null || a === document.body || !a.isConnected) && !view?.modalOpen && (view?.screen ?? "base") === "base") displayHost?.focusTerminal(props.paneId);
    focusWasInChrome = false;
  },
  { flush: "post" },
);

/** 利用者が付けた名前 → エージェント名 → 端末のタイトル の順に拾う。どれも無ければ空。 */
const paneName = computed(() => {
  const pane = session?.panes.get(props.paneId);
  // 連鎖の正典は `client-core の workspace/paneName.ts` の `paneNameOf`。ここは**名前が無ければ空**にする
  // （枠のラベルは名前が無ければ付けない）ので、既定値に空文字を渡す。
  return pane ? paneNameOf(pane, "") : "";
});
/** pane そのものの名前。枠の `aria-label` は**メニューボタン**の名前なので流用しない（AC8）。 */
const paneLabel = computed(() => (paneName.value ? `pane「${paneName.value}」` : "pane"));
/** 枠（メニューボタン）の名前。 */
const label = computed(() => (paneName.value ? `pane「${paneName.value}」のメニュー` : "pane のメニュー"));
/** 選ばれている pane の枠だけを Tab で止まる場所にする（roving tabindex。独立点検 #2）。 */
const selected = computed(() => view?.focusedPaneId === props.paneId);
const root = ref<HTMLElement | null>(null);

const chrome = computed(() =>
  settings ? resolvePaneChrome(settings.paneBorders, settings.paneGaps, !!props.multiPane, props.neighbors ?? NO_NEIGHBORS) : null,
);
const framed = computed(() => !!chrome.value?.framed);
/** 余白の無い辺がある：枠のフォーカスの見え方を端末の上に重ねて出す（decisions D4）。 */
const flush = computed(() => !!chrome.value && Object.values(chrome.value.padded).some((p) => !p));

/**
 * legend の分の余白を確保するか（20260923-pane-name-dnd-swap）。**名前が無い pane も含め、設定が
 * 有効な間はすべての pane に同じ余白を入れる**——pane ごとに有無が割れると、隣り合う pane の上端が
 * そろわなくなる（同じ tab 内の分割は上端をそろえる前提のレイアウトのため）。
 */
const reserveNameSpace = computed(() => !!(props.enabled && settings?.paneAgentNameVisible && framed.value));
/**
 * 枠線に埋め込む名前表示を出すか（20260923-pane-name-dnd-swap。herdr の見た目に寄せた。design「4.」）。
 * 名前が無ければ枠も出さない——空の legend は意味が無い（decisions.md D9）。
 */
const showBorder = computed(() => !!(reserveNameSpace.value && paneName.value));

const PANE_GAP = "var(--soda-pane-gap, 4px)";
/** 辺ごとの余白。値そのもの（px）は `App.vue` が `settings.paneFrameThickness` から配る CSS 変数。 */
const padStyle = computed(() => {
  const c = chrome.value;
  if (!c) return undefined;
  const side = (s: PaneSide): string => (c.padded[s] ? PANE_GAP : "0px");
  return {
    paddingTop: reserveNameSpace.value ? (c.padded.top ? `calc(${PANE_GAP} + 1.2em)` : "1.2em") : side("top"),
    paddingRight: side("right"),
    paddingBottom: side("bottom"),
    paddingLeft: side("left"),
  };
});
/** 今このpaneがドラッグのドロップ候補になっているか（別の PaneFrame インスタンスがドラッグ元）。 */
const isDropTarget = computed(() => {
  const drag = view?.paneDrag;
  return !!drag && drag.overPaneId === props.paneId && drag.sourcePaneId !== props.paneId;
});
/**
 * ドロップ候補になっているとき、ホバー中のゾーン（縁/中央。20260924-pane-dnd-split-move）。
 * `isDropTarget` が false のときは無意味なので null。
 */
const overZone = computed<Zone | null>(() => (isDropTarget.value ? (view?.paneDrag?.overZone ?? null) : null));
/** 自分がドラッグ元か（ドラッグ中は自分の名前を薄くする等の見た目に使う）。 */
const isDragSource = computed(() => view?.paneDrag?.sourcePaneId === props.paneId);

const DRAG_THRESHOLD_PX = 6;
let dragStart: { x: number; y: number; pointerId: number } | null = null;

function onEscapeDuringDrag(ev: KeyboardEvent): void {
  if (ev.key !== "Escape") return;
  cancelDrag();
}

function cancelDrag(): void {
  dragStart = null;
  if (view?.paneDrag) view.endPaneDrag();
  window.removeEventListener("keydown", onEscapeDuringDrag);
}

/** ドロップ先の3種（20260924-pane-move-cross-tab。design「クライアント側: ドロップ先の拡張」）。 */
type DropHit = { kind: "pane"; paneId: string; zone: Zone } | { kind: "tab"; tabId: string } | { kind: "workspace"; workspaceId: string };

/**
 * ドロップ先を優先順位付きで探す（`20260924-pane-dnd-split-move` で確立した pane 縁/中央の判定を、
 * `20260924-pane-move-cross-tab` で tab バー・サイドバーの workspace 行にも拡張。design「クライアント側:
 * ドロップ先の拡張」）: `[data-pane-id]`（同一 tab 内の入れ替え/分割/分割解除）→ `[data-tab-id]`
 * （tab バーの tab）→ `[data-drop-workspace-id]`（サイドバーの workspace 行）。`closest` は最も近い
 * 祖先を返すため、実際にドロップした DOM 位置によって自然にどれか1つだけが見つかる（3つが同時に
 * 候補になることは無い——pane の枠と tab バー・サイドバーは別の DOM 領域）。
 */
function dropTargetAt(x: number, y: number): DropHit | null {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const paneEl = el.closest("[data-pane-id]") as HTMLElement | null;
  if (paneEl?.dataset.paneId) {
    return { kind: "pane", paneId: paneEl.dataset.paneId, zone: zoneAt(paneEl.getBoundingClientRect(), x, y) };
  }
  const tabEl = el.closest("[data-tab-id]") as HTMLElement | null;
  if (tabEl?.dataset.tabId) return { kind: "tab", tabId: tabEl.dataset.tabId };
  const wsEl = el.closest("[data-drop-workspace-id]") as HTMLElement | null;
  if (wsEl?.dataset.dropWorkspaceId) return { kind: "workspace", workspaceId: wsEl.dataset.dropWorkspaceId };
  return null;
}

/** 名前ラベルの押し下げ。まだドラッグ扱いにしない（閾値を超えるまでは「ただのクリック」。AC-I1・AC-I5）。 */
function onNamePointerDown(ev: PointerEvent): void {
  dragStart = { x: ev.clientX, y: ev.clientY, pointerId: ev.pointerId };
  (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
}

function onNamePointerMove(ev: PointerEvent): void {
  if (!dragStart || ev.pointerId !== dragStart.pointerId) return;
  if (!view?.paneDrag) {
    const dx = ev.clientX - dragStart.x;
    const dy = ev.clientY - dragStart.y;
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    view?.startPaneDrag(props.paneId);
    window.addEventListener("keydown", onEscapeDuringDrag);
  }
  const hit = dropTargetAt(ev.clientX, ev.clientY);
  // 自分が今いる tab 自身は、ドロップしても何も起きない（サーバ側の自分自身ガード。AC9）ので
  // 候補として光らせない（review round1 の nit 指摘——見た目と実際の挙動を一致させる）。
  const ownTabId = session?.panes.get(props.paneId)?.tabId;
  if (hit?.kind === "tab" && hit.tabId !== ownTabId) view?.setPaneDragOverTab(hit.tabId);
  else if (hit?.kind === "workspace") view?.setPaneDragOverWorkspace(hit.workspaceId);
  else if (hit?.kind === "pane") view?.setPaneDragOver(hit.paneId, hit.zone);
  else view?.setPaneDragOver(null, null);
}

/** 離した：ドラッグ済みならドロップを確定、閾値未満ならクリック（枠を押したのと同じ扱い。AC-I5）。 */
function onNamePointerUp(ev: PointerEvent): void {
  if (!dragStart || ev.pointerId !== dragStart.pointerId) return;
  const wasDragging = !!view?.paneDrag;
  // `view.paneDrag.overZone` は使わない（直前の pointermove 時点のもので、離した瞬間の座標とは
  // 理論上ずれうる。ハイライトと実際に呼ぶ RPC が食い違わないよう、pointerup の実座標からその場で
  // 再計算する（design「クライアント側: ドロップ確定」。20260924-pane-dnd-split-move）。
  const hit = wasDragging ? dropTargetAt(ev.clientX, ev.clientY) : null;
  dragStart = null;
  if (wasDragging) {
    view?.endPaneDrag();
    window.removeEventListener("keydown", onEscapeDuringDrag);
    if (hit?.kind === "pane" && hit.paneId !== props.paneId) {
      if (hit.zone === "center") {
        actions?.replacePaneWithDrag(props.paneId, hit.paneId);
      } else {
        actions?.movePaneToEdge(props.paneId, hit.paneId, hit.zone);
      }
      // ドラッグした pane にフォーカスを残す（AC-I4・AC8）。入れ替え前にフォーカスが別の pane に
      // あった場合、`focusedPaneId` を書き換えないと、そちらの pane が新しい位置にフォーカスを
      // 持ち続けてしまう（`swapPaneWith`/`moveToEdge`/`replacePane` は id の参照を変えないため。
      // design の申し送り）。
      view?.focusPane(props.paneId);
      registry?.focus(props.paneId);
    } else if (hit?.kind === "tab") {
      // view の切り替え・focus は `ActionDispatcher` 側（RPC の応答を待ってから。decisions.md D2）。
      actions?.movePaneToTab(props.paneId, hit.tabId);
    } else if (hit?.kind === "workspace") {
      actions?.movePaneToNewTab(props.paneId, hit.workspaceId);
    }
  } else {
    view?.focusPane(props.paneId);
    registry?.focus(props.paneId);
  }
}

function onNamePointerCancel(ev: PointerEvent): void {
  if (dragStart && ev.pointerId !== dragStart.pointerId) return;
  cancelDrag();
}

/*
 * ドラッグ中にダイアログが開いたら、その時点で取り消す（`Sidebar.vue` の幅ドラッグと同じ precedent。
 * design「依拠する既存の事実」）。`showModal()` で文書が inert になったとき、ポインタの捕捉が外れる
 * のか・捕捉先へ `pointerup`/`pointercancel` が届き続けるのかは確かめた出所が無い。分からない挙動に
 * 頼らない（cross-cutting 独立点検で発見。review.md 参照）。
 */
watchDragInterrupt(view, () => {
  if (isDragSource.value) cancelDrag();
});

onBeforeUnmount(() => {
  // ドラッグ中にこの pane 自身が消えた（別クライアントの close 等）ら、リスナーの残留・宙に浮いた
  // ドラッグ状態を残さない（20260923-pane-name-dnd-swap）。
  if (isDragSource.value) cancelDrag();
  if (!view || !root.value?.contains(document.activeElement)) return;
  // 描き直しで入れ替わる新しい端末が自分でフォーカスする（`TerminalPane`）ので、それでも body に落ちていたときだけ移す。
  void nextTick(() => {
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    if (view.focusedPaneId) registry?.focus(view.focusedPaneId);
  });
});

const menuOpen = computed(() => {
  const target = view?.contextMenu?.target;
  return target?.kind === "pane" && target.paneId === props.paneId;
});

function openMenu(at: { x: number; y: number }): void {
  actions?.openContextMenu({ kind: "pane", paneId: props.paneId }, at);
}

/** M1：枠の押下でも pane を選び、端末にフォーカスする（枠が Tab で止まる要素でも、クリックではフォーカスを奪わない）。 */
function onMouseDown(ev: MouseEvent): void {
  ev.preventDefault();
  view?.focusPane(props.paneId);
  registry?.focus(props.paneId);
}

/** M7：枠の右クリックは常に pane のメニューを開く（D110）。 */
function onContextMenu(ev: MouseEvent): void {
  ev.preventDefault();
  openMenu({ x: ev.clientX, y: ev.clientY });
}

/** APG の menu button：Enter・Space・↓ で開く。文脈メニューの慣習の Shift+F10・ContextMenu キーでも開く。 */
function onKeydown(ev: KeyboardEvent): void {
  const opens = ev.key === "Enter" || ev.key === " " || ev.key === "ArrowDown" || ev.key === "ContextMenu" || (ev.key === "F10" && ev.shiftKey);
  if (!opens || ev.ctrlKey || ev.altKey || ev.metaKey) return;
  ev.preventDefault();
  // `main.ts` の window の keydown（端末の外のキーを `KeyInputController` へ流す）に二重に渡さない。
  ev.stopPropagation();
  const rect = edge.value?.getBoundingClientRect();
  openMenu({ x: rect?.left ?? 0, y: rect?.top ?? 0 });
}
</script>

<template>
  <div
    ref="root"
    class="pane-frame"
    :class="{ 'pane-frame-enabled': enabled, 'pane-frame-enabled-named': reserveNameSpace }"
    :data-pane-id="enabled ? paneId : undefined"
    :role="enabled ? 'group' : undefined"
    :aria-label="enabled ? paneLabel : undefined"
    :aria-current="enabled && selected ? 'true' : undefined"
    :style="padStyle"
  >
    <div
      v-if="enabled"
      ref="edge"
      class="pane-frame-edge"
      :class="{
        'pane-frame-edge-current': selected && framed,
        'pane-frame-edge-named': showBorder,
        'pane-frame-edge-drop-target': isDropTarget,
        'pane-frame-edge-flush': flush,
      }"
      role="button"
      :tabindex="selected ? 0 : -1"
      aria-haspopup="menu"
      :aria-expanded="menuOpen ? 'true' : 'false'"
      :aria-label="label"
      @mousedown="onMouseDown"
      @contextmenu="onContextMenu"
      @keydown="onKeydown"
    />
    <!-- 表示の面（パネル・帯）の有無で `<slot />` の位置を変えない（葉を作り直さない）: `enabled` のときは常に row > main の中に置く。 -->
    <div v-if="enabled" ref="bodyEl" class="pane-frame-body pane-frame-body-displays">
      <PaneBands v-if="layout && showEdge('top')" edge="top" :pane-id="paneId" :layout="layout" />
      <!-- 4 つの側は、別の位置の `v-if`（1 つの `v-for` にしない。枠〔iframe〕を DOM の中で動かさないため）。 -->
      <PanePanel v-if="layout && docks?.top" side="top" :pane-id="paneId" :dock="docks.top" @guide="guide = $event" />
      <div class="pane-frame-row">
        <PanePanel v-if="layout && docks?.left" side="left" :pane-id="paneId" :dock="docks.left" @guide="guide = $event" />
        <div class="pane-frame-center">
          <div class="pane-frame-main" :class="{ 'pane-frame-main-dimmed': displayEngaged }" data-pane-frame-main><slot /></div>
        </div>
        <PanePanel v-if="layout && docks?.right" side="right" :pane-id="paneId" :dock="docks.right" @guide="guide = $event" />
      </div>
      <PanePanel v-if="layout && docks?.bottom" side="bottom" :pane-id="paneId" :dock="docks.bottom" @guide="guide = $event" />
      <PaneBands v-if="layout && showEdge('bottom')" edge="bottom" :pane-id="paneId" :layout="layout" />
      <DisplayDropZones v-if="dropZones" :zone="dropZones.zone" :current="dropZones.current" :float="false" />
      <div v-if="guideStyle" class="pane-frame-guide" :style="guideStyle" aria-hidden="true" data-pane-frame-guide></div>
    </div>
    <div v-else class="pane-frame-body">
      <slot />
    </div>
    <!-- ドロップ先のゾーン（縁/中央）表示（20260924-pane-dnd-split-move。design「振る舞いの詳細 >
         視覚フィードバック」AC4）。`.pane-frame-body`（端末）より後に置く理由は下の `.pane-frame-name`
         と同じ（z-index:auto は DOM 順で決まる）。 -->
    <div v-if="overZone" class="pane-frame-zone" :class="`pane-frame-zone-${overZone}`" aria-hidden="true" />
    <!-- `.pane-frame-body`（端末。DOM 順で後）より後に置く——z-index:auto の重なりは DOM 順で
         後のものが上に来るため、`.pane-frame-edge` の中に置くと端末の不透明な内容の下に隠れて
         見えなくなる（taskcheck が実際のスクリーンショットで発見。review.md 参照）。 -->
    <span
      v-if="showBorder"
      class="pane-frame-name"
      :class="{ 'pane-frame-name-current': selected, 'pane-frame-name-dragging': isDragSource }"
      aria-hidden="true"
      @pointerdown="onNamePointerDown"
      @pointermove="onNamePointerMove"
      @pointerup="onNamePointerUp"
      @pointercancel="onNamePointerCancel"
      @lostpointercapture="onNamePointerCancel"
      @contextmenu="onContextMenu"
      >{{ paneName }}</span
    >
  </div>
</template>

<style scoped>
.pane-frame {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
}
/*
 * 枠の余白（太さは分割の境界〔`Splitter` の --soda-pane-gap〕と同じ。ふだんは背景と同じ色で、端末の外の縁に見える）は、
 * 辺ごとに決まるので script の `padStyle`（inline style）で当てる（20260926-pane-frame-auto-mode）。値そのもの（既定 4px）は
 * `App.vue` が `settings.paneFrameThickness` から配る CSS 変数で、届いていない場所は 4px にフォールバックする。
 *
 * legend（枠に埋め込む名前）のための上の余白（20260923-pane-name-dnd-swap。`padStyle` の paddingTop）。tab が1個で
 * tab バーが自動で隠れている（20260922-appearance-settings-rest）ときは、一番上の pane の外側に
 * 余白が無く、名前が画面の外まではみ出て切れる（screenshot を撮って実際に確認・修正した不具合）。
 * `.pane-frame-name` を `.pane-frame` の外へ一切はみ出させない設計にし、この余白の中に収める。
 * PTY の行数はこの内側の大きさから決まる（`ViewSync` が測る）ので、この余白を足した分だけ実際に
 * 行数が減る——見た目の整合を優先する意図的な副作用（`paneFrameThickness` の変更と同じ扱い）。
 */
.pane-frame-edge {
  position: absolute;
  inset: 0;
  cursor: context-menu;
}
/* 強調はホバーではなく選択で起きる（20260920-ui-selection-visuals の AC4・AC5）。
 * `inset: 0` の絶対配置なので border は内側に収まり、余白（`padStyle`）の大きさは変わらない
 * ——外寸が変わると PTY の行・列が変わってしまう。 */
.pane-frame-edge-current {
  /* 選ばれている pane の枠はテーマごとに背景から 3:1 に寄せた色（20260921-theme-settings の decisions D15。dracula は今と同じ #44475a）。 */
  border: 2px solid var(--soda-pane-current, #44475a);
}
/*
 * 名前を legend 風に表示するときだけ、フォーカスの無い pane にも薄い枠を出す（herdr の見た目に
 * 寄せた。20260923-pane-name-dnd-swap の design D3・AC1・AC3）。**新しいテーマ変数は足さず**、
 * 既存の `--soda-menu-border` を `color-mix` で薄めるだけにする（17テーマぶんの値決め・
 * コントラスト検証を避ける）。フォーカス中は `.pane-frame-edge-current` の 2px の強調色をそのまま使う
 * （下の詳細度: `.pane-frame-edge-current.pane-frame-edge-named` が `.pane-frame-edge-named` 単体より
 * 詳細度が高いので、フォーカス中はこちらが勝つ）。
 */
.pane-frame-edge-named {
  /* 55% だと画面上でほぼ見えなかった（screenshot で確認）ので、視認できる強さまで上げた。 */
  border: 1px solid color-mix(in srgb, var(--soda-menu-border, #44475a) 80%, transparent);
}
.pane-frame-edge-current.pane-frame-edge-named {
  /* `border` の shorthand（`.pane-frame-edge-named`）が幅を 1px に戻してしまうため、幅も明示し直す
   * （screenshot で 1px になっていることを確認して修正）。 */
  border-width: 2px;
  border-color: var(--soda-pane-current, #44475a);
}
/* ドロップ候補（20260923-pane-name-dnd-swap）：ドラッグ中、ポインタの下にある pane を強調する。 */
.pane-frame-edge-drop-target {
  outline: 2px dashed var(--soda-accent, #8be9fd);
  outline-offset: -2px;
}
/*
 * ドロップ先のゾーン表示（20260924-pane-dnd-split-move。design「振る舞いの詳細 > 視覚フィードバック」
 * AC4）。縁は `paneDragZone.ts` の EDGE_RATIO（30%）と同じ割合の帯、中央はそれ以外の全域。
 * **下の `70%`（`.pane-frame-zone-top`等）は `EDGE_RATIO` の値と手動で同期している**——
 * `EDGE_RATIO` を変えたらここも合わせて直すこと（review 指摘 nit）。
 * `pointer-events: none`——このオーバーレイ自体が `elementFromPoint`/ドロップ判定の対象にならない
 * ようにする（`.pane-frame-name` の上に乗っても掴み手を妨げない）。
 * **中央（分割解除）だけ色を変える**（`--soda-error-fg` の赤系）——縁（分割。プロセスは失われない）
 * と違い、中央はドロップ先の pane のプロセスを実際に終了させる破壊的な操作なので、`swap`（常に
 * 安全）から置き換わったこの区別を見た目で伝える（decisions.md D4 の安全面の検討）。
 */
.pane-frame-zone {
  position: absolute;
  inset: 0;
  z-index: 30;
  pointer-events: none;
  background: color-mix(in srgb, var(--soda-accent, #8be9fd) 25%, transparent);
  border: 2px solid var(--soda-accent, #8be9fd);
  box-sizing: border-box;
}
.pane-frame-zone-top {
  bottom: 70%;
}
.pane-frame-zone-bottom {
  top: 70%;
}
.pane-frame-zone-left {
  right: 70%;
}
.pane-frame-zone-right {
  left: 70%;
}
.pane-frame-zone-center {
  background: color-mix(in srgb, var(--soda-error-fg, #ff5555) 25%, transparent);
  border-color: var(--soda-error-fg, #ff5555);
}
.pane-frame-edge:focus-visible {
  outline: 1px solid var(--soda-fg, #f8f8f2);
  outline-offset: -1px;
  background: var(--soda-menu-active-bg, #44475a);
}
/* 余白の無い辺がある pane（20260926-pane-frame-auto-mode。decisions D4）：端末に隠れる辺があるので、キーボードで枠に
 * フォーカスがある間だけ端末の上に内側の線を重ねる。線は疑似要素に描いてクリックを通す——枠そのものに
 * `pointer-events: none` を付けると、残った余白の押下・右クリックまで枠に届かなくなる（taskcheck T3）。 */
.pane-frame-edge-flush:focus-visible::after {
  content: "";
  position: absolute;
  inset: 0;
  /* xterm のスクロールバー（z-index: 11）より上、パネルのつまみ（22）・案内の線（25）より上（design「重なりの値」）。 */
  z-index: 26;
  outline: 2px solid var(--soda-fg, #f8f8f2);
  outline-offset: -2px;
  pointer-events: none;
}
/*
 * pane にエージェント名を表示する opt-in の設定（20260922-appearance-settings-rest。design「US4」・AC11）。
 * 20260923-pane-name-dnd-swap で、枠線に埋め込む legend 風の見た目に変更した（herdr の見た目に寄せた）。
 * `top: 0` ＋ `translateY(-50%)` で `.pane-frame-edge` の境界線の上に重ね、背景色（`--soda-bg`。
 * pane の外側の地色と同じ）で線を隠すことで「線に埋め込まれた」ように見せる。
 * ドラッグの掴み手にするため `pointer-events` は `auto`（以前は `none` だった。AC-I1・AC-I5 は
 * script 側の閾値判定で担保する——名前ラベルの上の単純なクリックは、枠を押したのと同じ
 * 「pane を選ぶ」動作にフォールバックする）。
 */
.pane-frame-name {
  position: absolute;
  /* `.pane-frame` の外へはみ出させない（`padStyle` が名前の分として確保した上の余白の中に収める。
   * tab バーが無く画面の一番上に pane が接しているときでも切れない）。 */
  top: 0.15em;
  left: 0.6em;
  max-width: calc(100% - 1.2em);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  pointer-events: auto;
  cursor: grab;
  touch-action: none;
  /* ドラッグ中にテキストとして選択（ハイライト）されないようにする（review 指摘。
   * 掴み手そのものが文字列なので、`Sidebar.vue` の幅ドラッグの帯とは違い実害がある）。 */
  user-select: none;
  font-size: 0.75em;
  padding: 0 0.4em;
  background: var(--soda-bg, #1e1f29);
  color: color-mix(in srgb, var(--soda-menu-fg, #f8f8f2) 55%, transparent);
}
.pane-frame-name-current {
  /* herdr の見た目（NAME1 が太字の地の色）に合わせる。`--soda-pane-current` は枠線用に
   * 3:1（非テキストの WCAG コントラスト）で選ばれた色なので、文字色（4.5:1 が要る）には使わない。 */
  color: var(--soda-fg, #f8f8f2);
  font-weight: bold;
}
.pane-frame-name-dragging {
  cursor: grabbing;
}
/* 枠（absolute）より後に描くよう relative にして、端末を枠の上に重ねる（中央の押下・右クリックは端末へ届く）。 */
.pane-frame-body {
  position: relative;
  width: 100%;
  height: 100%;
}
/* 表示の面があるとき（20261007-soda-extensions）: 帯（上）と、端末＋パネル（下）の縦の flex。葉（.pane-layout-leaf）の CSS には触らない。 */
.pane-frame-body-displays {
  display: flex;
  flex-direction: column;
}
.pane-frame-row {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
}
/* 端末の領域（20261008-display-layout）。面の有無・置き場所に依らず、いつもある（葉の DOM の位置を変えない）。 */
.pane-frame-center {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  position: relative;
  display: flex;
}
.pane-frame-main {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  position: relative;
}
/* つまみをドラッグしている間の案内の線（幅は離すまで変えない）。位置と太さは `guideStyle`（本体の直下に、本体の箱を基準に置く）。 */
.pane-frame-guide {
  position: absolute;
  background: var(--soda-resize-line, #f8f8f2);
  pointer-events: none;
  z-index: 25;
}
/* 枠（表示）に入力が届いている間は、端末を薄くする（カーソルも薄くなる）。 */
.pane-frame-main-dimmed {
  opacity: 0.55;
}
</style>
