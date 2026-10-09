<script setup lang="ts">
/**
 * 連携のグラフの中身（20260927-agent-graph の design D-6・「web」・「振る舞いの詳細」。20261008-graph-first の PR1b で `GraphView` から分けた）。**入れ物は 2 つ**:
 * - `GraphDialog`（1 列の画面。`kind="dialog"`）: ネイティブの `<dialog>` を `showModal()` で開き、全画面に重ねる。背面が inert になり、Tab・ポインタ・ホイールが背面の端末へ届かない（AC-I5）。
 * - `GraphScreen`（デスクトップ。`kind="screen"`）: 主な領域の画面。`<dialog>` を使わない。サイドバーが残り、グラフの面にフォーカスがある間だけグラフのキーが働く（D12）。
 * `active` の間だけ中身を出す（`active` が偽の間も、この部品自身は mount されたまま——表示の変換・読み込み済みのグラフを保つ）。
 *
 * 描画は DOM のノード＋背面の SVG 1 枚（外部ライブラリなし。D-6）。表示の変換（パン・ズーム）は世界の層 1 つの `transform` だけ。
 * 座標・線の経路・当たり判定は client-core/graph の純関数（geometry）。サーバとのやりとりは `store/graph`。
 */
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { GRAPH_OPS_MAX, type GraphLink, type GraphOp, type NodeKey } from "@sodashitsu/protocol";
import {
  clampZoom,
  displayFrames,
  nodePositions,
  tidySpace,
  edgeGeometry,
  fitGraphView,
  GRAPH_GRID,
  GRAPH_NODE_HEIGHT,
  GRAPH_NODE_WIDTH,
  graphNodeAt,
  graphNodeRect,
  isLocalNodeKey,
  addMissingNodeOps,
  buildNewCwd,
  chordOf,
  keyInputOf,
  parallelOffsets,
  pinchGraphView,
  revealGraphRect,
  screenToGraph,
  snapToGrid,
  validateLink,
  zoomGraphAt,
  type GraphRect,
  type GraphViewport,
} from "@sodashitsu/client-core";
import { ActionDispatcherKey, ConnectionKey, GraphTerminalControllerKey, MachineSwitcherKey, TerminalRegistryKey } from "../../injection.js";
import { useGraphTerminalsStore } from "../../store/graphTerminals.js";
import { isMobileViewport } from "../../mobile/detect.js";
import {
  GRAPH_UNCHANGED,
  useGraphStore,
  type GraphBuild,
  type GraphNodeInfo,
} from "../../store/graph.js";
import { useGraphSpacesStore, type GraphRevealTarget } from "../../store/graphSpaces.js";
import { useMachinesStore } from "../../store/machines.js";
import { useSessionStore } from "../../store/session.js";
import { useSettingsStore } from "../../store/settings.js";
import { useViewStore } from "../../store/view.js";
import GraphAddForm, { type AddFormKind, type AddFormSubmit } from "./GraphAddForm.vue";
import { AddPaneError, addPane, type AddPaneDeps } from "./addPane.js";
import GraphConfirm from "./GraphConfirm.vue";
import GraphEdge from "./GraphEdge.vue";
import GraphFind from "./GraphFind.vue";
import GraphFrameLayer from "./GraphFrameLayer.vue";
import GraphMinimap from "./GraphMinimap.vue";
import type { FindItem } from "./findCandidates.js";
import GraphLinkMark from "./GraphLinkMark.vue";
import GraphSpaceBar from "./GraphSpaceBar.vue";
import GraphNode from "./GraphNode.vue";
import HistoryPanel from "./HistoryPanel.vue";
import SubagentPanel from "./SubagentPanel.vue";
import MobileGraphSheet from "./MobileGraphSheet.vue";
import PaneChecklist from "./PaneChecklist.vue";
import RekeyPicker from "./RekeyPicker.vue";
import LinkPanel from "./LinkPanel.vue";
import { usePointerDrag } from "./usePointerDrag.js";
import {
  LINK_KIND_NAME,
  linkChipText,
  linkDescription,
  pauseMark,
  linkConfigOf,
  linkDraftOf,
  linkEditOp,
  type LinkField,
  type LinkPanelSave,
} from "./linkText.js";

const props = defineProps<{
  /** 入れ物の種類（`dialog` = 1 列の重ねるダイアログ、`screen` = デスクトップの画面）。 */
  kind: "dialog" | "screen";
  /** 見えている（中身を出す）間だけ真。 */
  active: boolean;
}>();

const view = useViewStore();
const graph = useGraphStore();
const spaces = useGraphSpacesStore();
const session = useSessionStore();
const machines = useMachinesStore();
const settings = useSettingsStore();
const registry = inject(TerminalRegistryKey, null);
const conn = inject(ConnectionKey, null);
const actions = inject(ActionDispatcherKey, null);
const switcher = inject(MachineSwitcherKey, null);
const terminalWindow = inject(GraphTerminalControllerKey, null);
const terminalWindows = useGraphTerminalsStore();
const isMobile = isMobileViewport();
/** 根の要素（入れ物の中の `div`）。フォーカスを受け、キーを受ける。 */
const dialogEl = ref<HTMLElement | null>(null);
const canvasEl = ref<HTMLElement | null>(null);

// --- 表示（パン・ズーム）。このブラウザだけのもの（サーバへは保存しない。空間ごとに覚える。research-ui §2.4）-----------------------------

const viewport = ref<GraphViewport>({ zoom: 1, panX: 0, panY: 0 });
/** `viewport` が属する空間（空間を替えるときに、替える前の表示をこの空間として覚える）。まだ決めていなければ null。 */
let viewportSpace: string | null = null;
/** 覚えた表示が無い空間は、最初に中身を描いたときに全体表示にする。 */
let needsFit = false;
/** 表示の保存は間引く（パン・ズームの毎回には書かない。止まって 300ms 後・閉じるときにすぐ。レビュー R10）。 */
const VIEWPORT_SAVE_DELAY_MS = 300;
let viewportTimer: ReturnType<typeof setTimeout> | null = null;
function saveViewport(): void {
  if (viewportTimer !== null) clearTimeout(viewportTimer);
  viewportTimer = null;
  if (viewportSpace !== null) spaces.saveViewport(viewportSpace, viewport.value);
}
function flushViewportSave(): void {
  if (viewportTimer !== null) saveViewport();
}
watch(viewport, () => {
  if (viewportTimer !== null) clearTimeout(viewportTimer);
  viewportTimer = setTimeout(saveViewport, VIEWPORT_SAVE_DELAY_MS);
});
onBeforeUnmount(flushViewportSave);

/**
 * 表示中の空間が替わったら、替える前の表示をその空間として覚え、替えた先の覚えた表示に替える（無ければ、中身が描かれたときに全体表示）。
 * グラフが読み込まれてから。
 */
function syncSpaceViewport(): void {
  if (!graph.graph) return;
  const id = spaces.currentId;
  if (viewportSpace === id) return;
  if (viewportSpace !== null) {
    if (viewportTimer !== null) clearTimeout(viewportTimer);
    viewportTimer = null;
    spaces.saveViewport(viewportSpace, viewport.value);
  }
  viewportSpace = id;
  cancelViewportAnimation();
  const saved = spaces.loadViewport(id);
  if (saved) {
    viewport.value = saved;
    needsFit = false;
  } else {
    needsFit = true;
    if (hasContent()) {
      fitAll();
      needsFit = false;
    }
  }
}
/** 表示中の空間に、描くものがあるか。 */
function hasContent(): boolean {
  return shownNodes.value.length > 0 || spaces.frames.length > 0;
}
/** 表示中の空間を切り替える（記憶・表示の読み替え。選択は、表示に無くなったら外す）。 */
function switchSpace(id: string): void {
  spaces.setCurrent(id);
  syncSpaceViewport();
  const s = selection.value;
  if (s?.kind === "node" && !spaces.isShown(s.key)) selection.value = null;
  if (s?.kind === "link" && !linkVisible(s.id)) selection.value = null;
}
function linkVisible(id: string): boolean {
  const l = graph.links.find((x) => x.id === id);
  return l !== undefined && (spaces.isShown(l.from) || spaces.isShown(l.to));
}
/** ノードのある空間が表示中でなければ、その空間に切り替える。 */
function ensureSpaceOf(key: string): void {
  const sp = spaces.spaceOfNode.get(key);
  if (sp !== undefined && sp !== spaces.currentId) switchSpace(sp);
}

function canvasSize(): { w: number; h: number } {
  const el = canvasEl.value;
  const w = el?.clientWidth ?? 0;
  const h = el?.clientHeight ?? 0;
  // レイアウトの無い環境（試験）・開いた直後の 0 は、ありがちな大きさで代える。
  return { w: w > 0 ? w : 800, h: h > 0 ? h : 600 };
}
/** 全体表示に収める四角（表示中の空間のノードと囲い）。 */
function fitRects(): GraphRect[] {
  return [...shownNodes.value.map((n) => graphNodeRect(n)), ...spaces.frames.map((f) => f.rect)];
}
function fitAll(): void {
  cancelViewportAnimation();
  viewport.value = fitGraphView(fitRects(), canvasSize());
}

// --- 動き（サイドバー・印から動かす。`prefers-reduced-motion` のときは一度に切り替える）-----------------------------------
const MOVE_MS = 260;
let moveFrame: number | null = null;
function cancelViewportAnimation(): void {
  if (moveFrame !== null) cancelAnimationFrame(moveFrame);
  moveFrame = null;
}
function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
function animateViewport(to: GraphViewport): void {
  cancelViewportAnimation();
  if (prefersReducedMotion() || typeof requestAnimationFrame !== "function") {
    viewport.value = to;
    return;
  }
  const from = viewport.value;
  const t0 = performance.now();
  const step = (now: number): void => {
    const t = Math.min(1, (now - t0) / MOVE_MS);
    const e = t * (2 - t); // ease-out
    viewport.value = {
      zoom: from.zoom + (to.zoom - from.zoom) * e,
      panX: from.panX + (to.panX - from.panX) * e,
      panY: from.panY + (to.panY - from.panY) * e,
    };
    moveFrame = t < 1 ? requestAnimationFrame(step) : null;
  };
  moveFrame = requestAnimationFrame(step);
}
onBeforeUnmount(cancelViewportAnimation);
function zoomBy(factor: number, anchor?: { x: number; y: number }): void {
  const size = canvasSize();
  viewport.value = zoomGraphAt(
    viewport.value,
    viewport.value.zoom * factor,
    anchor ?? { x: size.w / 2, y: size.h / 2 },
  );
}
function zoomReset(): void {
  const size = canvasSize();
  viewport.value = zoomGraphAt(viewport.value, 1, { x: size.w / 2, y: size.h / 2 });
}
const zoomPercent = computed(() => `${Math.round(viewport.value.zoom * 100)}%`);
/**
 * 面の地の、点の格子（PR1f。20px 間隔。面の移動・拡大縮小に付いて動く）。縮小して間隔が詰まりすぎる（8px 未満）ときは、間隔を倍々にして読める疎さを保つ。
 * 色は `--soda-fg` を薄く混ぜたもの（新しい色の値は足さない）。
 */
const gridStyle = computed(() => {
  const v = viewport.value;
  let step = GRAPH_GRID * v.zoom;
  while (step < 8) step *= 2;
  const ox = ((v.panX % step) + step) % step;
  const oy = ((v.panY % step) + step) % step;
  return { backgroundSize: `${step}px ${step}px`, backgroundPosition: `${ox}px ${oy}px` };
});
const worldStyle = computed(() => ({
  transform: `translate(${viewport.value.panX}px, ${viewport.value.panY}px) scale(${viewport.value.zoom})`,
}));

// --- 描くもの ------------------------------------------------------------------------------------------------

/** Tab の順＝読み順（上から、同じ高さなら左から）。配置の変更に追従する（research-ui §2.12）。 */
/** 表示中の空間のノード（構成が導けないときは全部）。 */
const shownNodes = computed(() => graph.nodes.filter((n) => spaces.isShown(n.key)));
const orderedNodes = computed(() => [...shownNodes.value].sort((a, b) => a.y - b.y || a.x - b.x));
/**
 * Tab の入口（tabindex=0）のノード: 選んでいるノード、無ければ読み順の先頭。ほかのノードは -1 で、ノードの間の Tab は読み順で自前に動かす。
 * **DOM の順は並べ替えない**（グラフの順のまま）——並べ替えると、ドラッグ・矢印で他のノードを越えた瞬間に要素が付け替わりフォーカスが落ちる（g03 点検）。
 */
const tabEntryKey = computed(() => {
  const s = selection.value;
  if (s?.kind === "node" && shownNodes.value.some((n) => n.key === s.key)) return s.key;
  return orderedNodes.value[0]?.key ?? null;
});
const rects = computed(
  () => new Map<string, GraphRect>(graph.nodes.map((n) => [n.key, graphNodeRect(n)])),
);
/**
 * ノードの中身は位置に依存させない（ドラッグの毎回に作り直さない。レビュー R10）。鍵の並びが変わったときと、サーバのグラフ・pane の
 * 状態（`nodeInfo` が読むもの）が変わったときだけ作り直す。
 */
const nodeKeysText = computed(() => (graph.graph?.nodes ?? []).map((n) => n.key).join("\n"));
const infos = computed(
  () =>
    new Map<string, GraphNodeInfo>(
      nodeKeysText.value
        .split("\n")
        .filter((k) => k !== "")
        .map((k) => [k, graph.nodeInfo(k as NodeKey)]),
    ),
);
const nodeInvalid = (key: string): boolean => {
  const i = infos.value.get(key);
  return !i || i.exists === false;
};

interface EdgeView {
  link: GraphLink;
  start: { x: number; y: number };
  end: { x: number; y: number };
  mid: { x: number; y: number };
  dir: { x: number; y: number };
  invalid: boolean;
  paused: boolean;
}
const edges = computed<EdgeView[]>(() => {
  const offsets = parallelOffsets(graph.links);
  const out: EdgeView[] = [];
  for (const link of graph.links) {
    const a = rects.value.get(link.from);
    const b = rects.value.get(link.to);
    if (!a || !b) continue;
    // 片方が表示中の空間に無い線は、印（`marks`）で出す。両方とも無い線は出ない。
    if (!spaces.isShown(link.from) || !spaces.isShown(link.to)) continue;
    // 監督は監督役→配下の向きで描く（design「線の種類の見た目」）。
    const [src, dst] = link.kind === "supervise" ? [b, a] : [a, b];
    const geo = edgeGeometry(src, dst, offsets.get(link.id) ?? 0);
    out.push({
      link,
      ...geo,
      invalid: nodeInvalid(link.from) || nodeInvalid(link.to),
      paused: graph.graph?.paused === true || link.paused !== null,
    });
  }
  return out;
});

/** 別の空間のノードとの線の印（見えているノードの縁。20261008-graph-first の T11g）。 */
interface MarkView {
  link: GraphLink;
  /** 見えているノードの鍵。 */
  nodeKey: string;
  otherKey: string;
  otherName: string;
  otherSpace: string;
  direction: "out" | "in";
  /** 一時停止・上限・無効（線のチップと同じ語）。無ければ空。 */
  status: string;
  x: number;
  y: number;
}
/** 1 つのノードの印を並べて出す数。残りは「+N」（押すと一覧）。 */
const MARKS_PER_NODE = 3;
const allMarks = computed<MarkView[]>(() => {
  const out: MarkView[] = [];
  const spaceLabel = (key: string): string => {
    const id = spaces.spaceOfNode.get(key);
    return spaces.spaces.find((s) => s.id === id)?.label ?? "別の空間";
  };
  const perNode = new Map<string, number>();
  for (const link of graph.links) {
    const sa = spaces.isShown(link.from);
    const sb = spaces.isShown(link.to);
    if (sa === sb) continue;
    const mine = sa ? link.from : link.to;
    const other = sa ? link.to : link.from;
    const r = rects.value.get(mine);
    if (!r) continue;
    const i = perNode.get(mine) ?? 0;
    perNode.set(mine, i + 1);
    const status = [
      pauseMark(link, graph.graph?.paused === true),
      nodeInvalid(link.from) || nodeInvalid(link.to) ? "⚠" : "",
    ]
      .filter((t) => t !== "")
      .join(" ");
    out.push({
      link,
      nodeKey: mine,
      otherKey: other,
      otherName: graph.nodeInfo(other as NodeKey).name,
      otherSpace: spaceLabel(other),
      direction: sa ? "out" : "in",
      status,
      x: r.x + 12,
      y: r.y + r.h + 2 + Math.min(i, MARKS_PER_NODE) * 20,
    });
  }
  return out;
});
/** 並べて出す印（1 つのノードにつき 3 本まで）。 */
const marks = computed<MarkView[]>(() => {
  const seen = new Map<string, number>();
  return allMarks.value.filter((m) => {
    const n = seen.get(m.nodeKey) ?? 0;
    seen.set(m.nodeKey, n + 1);
    return n < MARKS_PER_NODE;
  });
});
/** 3 本を超えるノードの「+N」。 */
const markMore = computed(() => {
  const counts = new Map<string, number>();
  for (const m of allMarks.value) counts.set(m.nodeKey, (counts.get(m.nodeKey) ?? 0) + 1);
  const out: { nodeKey: string; n: number; x: number; y: number }[] = [];
  for (const [key, c] of counts) {
    if (c <= MARKS_PER_NODE) continue;
    const r = rects.value.get(key);
    if (r) out.push({ nodeKey: key, n: c - MARKS_PER_NODE, x: r.x + 12, y: r.y + r.h + 2 + MARKS_PER_NODE * 20 });
  }
  return out;
});
/** 「+N」を押して開いている、そのノードの印の一覧。 */
const markListKey = ref<string | null>(null);
const markList = computed(() => (markListKey.value === null ? [] : allMarks.value.filter((m) => m.nodeKey === markListKey.value)));
function chooseFromMarkList(m: MarkView): void {
  markListKey.value = null;
  goToMark(m);
}
/** 「+N」: ↑ で最後の印へ・Enter/↓ で一覧を開いて最初の項目へ。 */
function onMoreKeydown(ev: KeyboardEvent, nodeKey: string): void {
  if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing) return;
  if (ev.key === "ArrowUp") {
    const last = [...(dialogEl.value?.querySelectorAll<HTMLElement>(`[data-mark-node="${CSS.escape(nodeKey)}"]`) ?? [])].at(-1);
    ev.preventDefault();
    ev.stopPropagation();
    last?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  } else if (ev.key === "ArrowDown" || ev.key === "Enter" || ev.key === " ") {
    ev.preventDefault();
    ev.stopPropagation();
    markListKey.value = nodeKey;
    void nextTick(() => dialogEl.value?.querySelector<HTMLElement>(".graph-mark-list-item")?.focus({ preventScroll: true }));
  } else if (ev.key === "Escape") {
    ev.preventDefault();
    ev.stopPropagation();
    focusNode(nodeKey);
  }
}
/** 一覧: ↑ ↓ で項目を移り、`Esc` で閉じて「+N」へ戻る。 */
function onMarkListKeydown(ev: KeyboardEvent): void {
  if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing) return;
  const items = [...(dialogEl.value?.querySelectorAll<HTMLElement>(".graph-mark-list-item") ?? [])];
  const i = items.indexOf(document.activeElement as HTMLElement);
  if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
    ev.preventDefault();
    ev.stopPropagation();
    items[ev.key === "ArrowDown" ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1)]?.focus({ preventScroll: true });
  } else if (ev.key === "Escape") {
    ev.preventDefault();
    ev.stopPropagation();
    const key = markListKey.value;
    markListKey.value = null;
    void nextTick(() => dialogEl.value?.querySelector<HTMLElement>(`[data-mark-more="${CSS.escape(key ?? "")}"]`)?.focus({ preventScroll: true }));
  }
}
/** 囲いのタグから `Esc`: 選んでいるノード（無ければ入口のノード）へ戻る。 */
function leaveFrameLayer(): void {
  const s = selection.value;
  const key = s?.kind === "node" && shownNodes.value.some((n) => n.key === s.key) ? s.key : tabEntryKey.value;
  if (key) focusNode(key);
  else dialogEl.value?.focus({ preventScroll: true });
}
/** ノードで `m`: そのノードの最初の印へ入る（印のボタンは Tab の順に入れない）。 */
function enterMarks(key: string): boolean {
  const btn = dialogEl.value?.querySelector<HTMLElement>(`[data-mark-node="${CSS.escape(key)}"] button`);
  if (!btn) return false;
  btn.focus({ preventScroll: true });
  return true;
}
const degree = computed(() => {
  const out = new Map<string, number>();
  const inn = new Map<string, number>();
  for (const l of graph.links) {
    out.set(l.from, (out.get(l.from) ?? 0) + 1);
    inn.set(l.to, (inn.get(l.to) ?? 0) + 1);
  }
  return { out, inn };
});

// --- 選択（単一。フォーカスと一致させる。research-ui §2.6）--------------------------------------------------------

type Selection = { kind: "node"; key: string } | { kind: "link"; id: string } | null;
const selection = ref<Selection>(null);
const isNodeSelected = (key: string): boolean =>
  selection.value?.kind === "node" && selection.value.key === key;
const isLinkSelected = (id: string): boolean =>
  selection.value?.kind === "link" && selection.value.id === id;

function nodeEl(key: string): HTMLElement | null {
  return dialogEl.value?.querySelector<HTMLElement>(`[data-node-key="${CSS.escape(key)}"]`) ?? null;
}
function chipEl(id: string): HTMLElement | null {
  return dialogEl.value?.querySelector<HTMLElement>(`[data-link-chip="${CSS.escape(id)}"]`) ?? null;
}
function focusNode(key: string): void {
  ensureSpaceOf(key);
  selection.value = { kind: "node", key };
  reveal(rects.value.get(key));
  void nextTick(() => nodeEl(key)?.focus({ preventScroll: true }));
}
function focusLink(id: string): void {
  selection.value = { kind: "link", id };
  const e = edges.value.find((x) => x.link.id === id);
  if (e) reveal({ x: e.mid.x - 40, y: e.mid.y - 12, w: 80, h: 24 });
  void nextTick(() => chipEl(id)?.focus({ preventScroll: true }));
}
/** フォーカスしたものが画面の外なら入れる（research-ui §2.12）。 */
function reveal(rect: GraphRect | undefined): void {
  if (rect) viewport.value = revealGraphRect(viewport.value, rect, canvasSize());
}
/**
 * 押したことで来たフォーカスか（押しただけで画面へ入れる移動をすると表示が跳ぶ。g03 点検）。ポインタを押したときに立て、フォーカスか
 * 離したときに下ろす。キー（Tab 等）で来たフォーカスだけ画面へ入れる。
 */
let pointerFocusing = false;
function onPointerFocusEnd(): void {
  pointerFocusing = false;
}
window.addEventListener("pointerup", onPointerFocusEnd, true);
window.addEventListener("pointercancel", onPointerFocusEnd, true);
onBeforeUnmount(() => {
  window.removeEventListener("pointerup", onPointerFocusEnd, true);
  window.removeEventListener("pointercancel", onPointerFocusEnd, true);
});
function onNodeFocus(key: string): void {
  selection.value = { kind: "node", key };
  if (pointerFocusing) pointerFocusing = false;
  else reveal(rects.value.get(key));
}
function onChipFocus(id: string): void {
  selection.value = { kind: "link", id };
  if (pointerFocusing) {
    pointerFocusing = false;
    return;
  }
  const e = edges.value.find((x) => x.link.id === id);
  if (e) reveal({ x: e.mid.x - 40, y: e.mid.y - 12, w: 80, h: 24 });
}

// --- ドラッグ（ノードの移動・背景のパン）-------------------------------------------------------------------------

const drag = usePointerDrag();

function onNodePointerdown(ev: PointerEvent, key: string): void {
  // 押したことで来るフォーカス（ブラウザの mousedown の既定も含む）は、どの経路で戻っても画面へ入れない（レビュー R7）。
  pointerFocusing = true;
  if (isMobile.value || ev.button !== 0) return; // モバイルは閲覧だけ（背景のパンへ流す）
  ev.stopPropagation();
  if (confirmState.value) return;
  if (checklistOpen.value) {
    closeChecklist();
    return;
  }
  if (rekeyKey.value) {
    closeRekey();
    return;
  }
  // 線の設定を開いている間は、外側のクリック＝取り消し（未保存の値と他の操作を混ぜない。research-ui §2.7）。
  if (panel.value) {
    panelRef.value?.requestClose();
    return;
  }
  // 接続モード: 押したノードを先にする。
  if (connectFrom.value) {
    if (key !== connectFrom.value) openNewLink(connectFrom.value as NodeKey, key as NodeKey);
    return;
  }
  const node = graph.nodes.find((n) => n.key === key);
  if (!node) return;
  const target = ev.currentTarget as HTMLElement;
  const x0 = node.x;
  const y0 = node.y;
  const posOf = (e: PointerEvent, dx: number, dy: number) => {
    const rawX = x0 + dx / viewport.value.zoom;
    const rawY = y0 + dy / viewport.value.zoom;
    // Alt で吸着を外す（design「移動」）。
    return e.altKey
      ? { x: Math.round(rawX), y: Math.round(rawY) }
      : { x: snapToGrid(rawX), y: snapToGrid(rawY) };
  };
  selection.value = { kind: "node", key };
  target.focus({ preventScroll: true });
  drag.start(ev, target, {
    threshold: 4,
    onMove: (e, dx, dy) => {
      const p = posOf(e, dx, dy);
      graph.setDragPosition(key, p);
      nodeDrag.value = { key, blockedFrame: blockedFrameFor(key, p) };
    },
    onEnd: (e, dx, dy) => {
      const p = posOf(e, dx, dy);
      const blocked = blockedFrameFor(key, p);
      nodeDrag.value = null;
      if (blocked !== null) {
        // ほかの workspace の囲いの上には置けない（pane を別の workspace へ移すのは PR4）。元の位置へ戻す。
        graph.setDragPosition(key, null);
        view.toast("ほかの workspace の囲いの上には置けません。元の位置へ戻しました。");
        return;
      }
      if (p.x === x0 && p.y === y0) graph.setDragPosition(key, null);
      else void graph.moveNodes([{ key, ...p }]);
    },
    onCancel: () => {
      nodeDrag.value = null;
      graph.setDragPosition(key, null);
    },
    // 動かさずに離した（押しただけ）: 端末の窓を開く。
    onClick: () => openNodeWindow(key, true),
  });
}

/** ノードをドラッグしている間の状態（落とせない囲いの見た目）。 */
const nodeDrag = ref<{ key: string; blockedFrame: string | null } | null>(null);
/**
 * ノード `key` を `pos` に置いたとき、ほかの workspace（や別のマシン）の囲いの上なら、その囲いの id。自分の workspace の囲い・自分の worktree グループの外側の囲いの上は落とせる。
 * 判定はノードの中心。内側の囲い（メンバー）を先に見る。
 */
function blockedFrameFor(key: string, pos: { x: number; y: number }): string | null {
  const own = spaces.memberOfNode.get(key);
  if (own === undefined) return null;
  const ownParent = spaces.infoMap.get(own)?.parentId ?? null;
  const cx = pos.x + GRAPH_NODE_WIDTH / 2;
  const cy = pos.y + GRAPH_NODE_HEIGHT / 2;
  const hit = (f: { rect: GraphRect }): boolean =>
    cx >= f.rect.x && cx <= f.rect.x + f.rect.w && cy >= f.rect.y && cy <= f.rect.y + f.rect.h;
  const frames = spaces.frames.filter((f) => !f.placeholder);
  const inner = frames.find((f) => f.kind !== "worktree" && f.id !== own && hit(f));
  if (inner) return inner.id;
  const outer = frames.find((f) => f.kind === "worktree" && f.id !== ownParent && hit(f));
  return outer ? outer.id : null;
}

// --- 囲いのドラッグ（見出しをつかんで、中のノードをまとめて平行移動。20261008-graph-first の T11f）------------------------

/** つかんで動かしている囲い。 */
const frameDrag = ref<{ frameId: string; sig: string } | null>(null);
function onFrameHeadingPointerdown(ev: PointerEvent, frameId: string): void {
  if (isMobile.value || ev.button !== 0) return;
  ev.stopPropagation(); // 背景のパンへ流さない
  if (confirmState.value || connectFrom.value) return;
  if (checklistOpen.value) {
    closeChecklist();
    return;
  }
  if (rekeyKey.value) {
    closeRekey();
    return;
  }
  if (panel.value) {
    panelRef.value?.requestClose();
    return;
  }
  const info = spaces.infoMap.get(frameId);
  if (!info) return;
  const keys = info.memberIds.flatMap((m) => spaces.memberNodes.get(m) ?? []);
  const start = new Map<string, { x: number; y: number }>();
  for (const n of graph.nodes) if (keys.includes(n.key)) start.set(n.key, { x: n.x, y: n.y });
  if (start.size === 0) return;
  const target = ev.currentTarget as HTMLElement;
  const delta = (e: PointerEvent, dx: number, dy: number) => {
    const rawX = dx / viewport.value.zoom;
    const rawY = dy / viewport.value.zoom;
    return e.altKey
      ? { x: Math.round(rawX), y: Math.round(rawY) }
      : { x: snapToGrid(rawX), y: snapToGrid(rawY) };
  };
  const clear = (): void => {
    for (const k of start.keys()) graph.setDragPosition(k, null);
  };
  drag.start(ev, target, {
    threshold: 4,
    onStart: () => {
      frameDrag.value = { frameId, sig: spaces.structureSig };
    },
    onMove: (e, dx, dy) => {
      const d = delta(e, dx, dy);
      for (const [k, p] of start) graph.setDragPosition(k, { x: p.x + d.x, y: p.y + d.y });
    },
    onEnd: (e, dx, dy) => {
      frameDrag.value = null;
      const d = delta(e, dx, dy);
      if (d.x === 0 && d.y === 0) {
        clear();
        return;
      }
      // 離す前に `resolveDrop` で重ならない位置へ寄せる（`graph.moveNodes`）。1 回の `graph.update`。
      void graph.moveNodes([...start].map(([key, p]) => ({ key, x: p.x + d.x, y: p.y + d.y })));
    },
    onCancel: () => {
      frameDrag.value = null;
      clear();
    },
  });
}
// 囲いの構成が変わった（pane が増えた・workspace が閉じた）ら、動かしているのを取りやめる。
watch(
  () => spaces.structureSig,
  (sig) => {
    if (frameDrag.value !== null && frameDrag.value.sig !== sig) {
      drag.cancel();
      liveMessage.value = "囲いの構成が変わったので、移動を取りやめました。";
    }
  },
);

function onCanvasPointerdown(ev: PointerEvent): void {
  cancelViewportAnimation();
  if (addForm.value) closeAddForm();
  if (ev.button !== 0 && ev.pointerType === "mouse") return;
  if (confirmState.value) return;
  if (checklistOpen.value) {
    closeChecklist();
    return;
  }
  if (rekeyKey.value) {
    closeRekey();
    return;
  }
  if (panel.value) {
    panelRef.value?.requestClose();
    return;
  }
  if (connectFrom.value) {
    endConnectMode(true);
    return;
  }
  startPan(ev, ev.currentTarget as HTMLElement, (e) => {
    // モバイルはノードを押すとシート（編集はしない）。
    const hit = (e.target as Element | null)?.closest?.("[data-node-key]");
    if (isMobile.value && hit) {
      sheet.value = { kind: "node", key: hit.getAttribute("data-node-key")! };
      return;
    }
    // 何も無い所を押した＝選択の解除（research-ui §2.6）。
    selection.value = null;
  });
}

/**
 * 背景・線・チップからのパン（動かずに離したら `onTap`）。2 本目の指が触れたらパンをやめてピンチ（モバイルの閲覧。design「モバイル」）。
 */
function startPan(
  ev: PointerEvent,
  target: HTMLElement | Element,
  onTap: (e: PointerEvent) => void,
  onStart?: () => void,
): void {
  touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (touches.size === 2) {
    drag.cancel();
    startPinch();
    return;
  }
  if (touches.size > 2) return;
  const start = viewport.value;
  drag.start(ev, target, {
    threshold: 3,
    ...(onStart ? { onStart } : {}),
    onMove: (_e, dx, dy) => {
      viewport.value = { zoom: start.zoom, panX: start.panX + dx, panY: start.panY + dy };
    },
    onClick: onTap,
    onCancel: () => {
      viewport.value = start;
    },
  });
}

// --- ピンチ（モバイル）・シート ------------------------------------------------------------------------------------

/** 触れている指（画面の座標）。2 本でピンチ。 */
const touches = new Map<number, { x: number; y: number }>();
let pinch: {
  view: GraphViewport;
  a: { x: number; y: number };
  b: { x: number; y: number };
  ids: [number, number];
} | null = null;
function canvasPoint(x: number, y: number): { x: number; y: number } {
  const r = canvasEl.value?.getBoundingClientRect();
  return { x: x - (r?.left ?? 0), y: y - (r?.top ?? 0) };
}
function startPinch(): void {
  const [[ia, pa], [ib, pb]] = [...touches.entries()] as [
    [number, { x: number; y: number }],
    [number, { x: number; y: number }],
  ];
  pinch = {
    view: viewport.value,
    a: canvasPoint(pa.x, pa.y),
    b: canvasPoint(pb.x, pb.y),
    ids: [ia, ib],
  };
}
function onWindowPointerMove(ev: PointerEvent): void {
  if (!touches.has(ev.pointerId)) return;
  touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (!pinch) return;
  const a = touches.get(pinch.ids[0]);
  const b = touches.get(pinch.ids[1]);
  if (!a || !b) return;
  viewport.value = pinchGraphView(
    pinch.view,
    pinch.a,
    pinch.b,
    canvasPoint(a.x, a.y),
    canvasPoint(b.x, b.y),
  );
}
function onWindowPointerEnd(ev: PointerEvent): void {
  if (!touches.delete(ev.pointerId)) return;
  if (pinch && touches.size < 2) pinch = null;
}
window.addEventListener("pointermove", onWindowPointerMove);
window.addEventListener("pointerup", onWindowPointerEnd);
window.addEventListener("pointercancel", onWindowPointerEnd);
onBeforeUnmount(() => {
  window.removeEventListener("pointermove", onWindowPointerMove);
  window.removeEventListener("pointerup", onWindowPointerEnd);
  window.removeEventListener("pointercancel", onWindowPointerEnd);
});

/** モバイルのシート（押した線・ノードの一時停止・再開）。 */
const sheet = ref<{ kind: "node"; key: string } | { kind: "link"; id: string } | null>(null);
function closeSheet(): void {
  const s = sheet.value;
  sheet.value = null;
  if (s?.kind === "link") focusLink(s.id);
  else if (s) focusNode(s.key);
}

/**
 * 線（当たり）・チップの pointerdown。押した瞬間には選ばず、動かせばパン、動かずに離したら選ぶ（モバイルで線からもパン・ピンチできるように。
 * g03 点検）。チップは離した後の `click` で選ぶ（キーの Enter・Space も同じ `click`）ので、パンになったときだけその `click` を捨てる。
 * パネル・チェックリストを開いている間は何もしない（`click` の側で確認・閉じるを通す）。
 */
let suppressChipClick: string | null = null;
function onLinkPointerdown(ev: PointerEvent, id: string, source: "edge" | "chip"): void {
  ev.stopPropagation();
  if (source === "chip") pointerFocusing = true;
  if (ev.button !== 0 && ev.pointerType === "mouse") return;
  if (confirmState.value) return;
  if (checklistOpen.value || rekeyKey.value || panel.value || connectFrom.value) {
    if (source === "edge") onChipClick(id);
    return;
  }
  suppressChipClick = null;
  const target = ev.currentTarget as Element;
  startPan(
    ev,
    target,
    () => {
      if (source === "edge") onChipClick(id);
    },
    // 動いたら（パン）その後のチップの click を捨てる。
    () => {
      if (source === "chip") suppressChipClick = id;
    },
  );
}
function onChipActivate(id: string): void {
  if (suppressChipClick === id) {
    suppressChipClick = null;
    return;
  }
  onChipClick(id);
}

// --- 線を作る（ハンドルのドラッグ・接続モード。design「線を作る」）---------------------------------------------------

/** ハンドルからドラッグしている線（世界の座標）。 */
const connectDrag = ref<{
  from: string;
  to: { x: number; y: number };
  hover: string | null;
} | null>(null);
/** 接続モード（キーの `c`・ハンドルのクリック）の元。先を Tab・矢印で選び Enter。 */
const connectFrom = ref<string | null>(null);
/** 支援技術への知らせ（接続モード・一時停止など、気づくべき出来事だけ。research-ui §2.10）。 */
const liveMessage = ref("");

function toWorld(e: { clientX: number; clientY: number }): { x: number; y: number } {
  const r = canvasEl.value?.getBoundingClientRect();
  return screenToGraph(viewport.value, {
    x: e.clientX - (r?.left ?? 0),
    y: e.clientY - (r?.top ?? 0),
  });
}
function nodeAtPoint(p: { x: number; y: number }, exclude: string): string | null {
  return graphNodeAt(
    shownNodes.value
      .filter((n) => n.key !== exclude)
      .map((n) => ({ key: n.key, rect: graphNodeRect(n) })),
    p,
  );
}

function onHandlePointerdown(ev: PointerEvent, key: string): void {
  if (isMobile.value || ev.button !== 0) return;
  if (confirmState.value) return;
  if (panel.value) {
    panelRef.value?.requestClose();
    return;
  }
  const target = ev.currentTarget as HTMLElement;
  drag.start(ev, target, {
    threshold: 4,
    onStart: (e) => {
      connectDrag.value = { from: key, to: toWorld(e), hover: null };
    },
    onMove: (e) => {
      const p = toWorld(e);
      connectDrag.value = { from: key, to: p, hover: nodeAtPoint(p, key) };
    },
    onEnd: (e) => {
      // 離した瞬間の座標で決め直す。空白・元のノード自身で離したら何も作らない（AC-I2）。
      const hover = nodeAtPoint(toWorld(e), key);
      connectDrag.value = null;
      if (hover) openNewLink(key as NodeKey, hover as NodeKey);
    },
    // ドラッグしないクリックは接続モード（ドラッグ以外でも結べる。WCAG 2.5.7）。
    onClick: () => startConnectMode(key),
    onCancel: () => {
      connectDrag.value = null;
    },
  });
}

const connectLine = computed(() => {
  const c = connectDrag.value;
  if (!c) return null;
  const n = graph.nodes.find((x) => x.key === c.from);
  if (!n) return null;
  return { x1: n.x + GRAPH_NODE_WIDTH, y1: n.y + GRAPH_NODE_HEIGHT / 2, x2: c.to.x, y2: c.to.y };
});

function connectCandidates(): string[] {
  return orderedNodes.value.map((n) => n.key).filter((k) => k !== connectFrom.value);
}
function startConnectMode(key: string): void {
  if (isMobile.value) return;
  connectFrom.value = key;
  liveMessage.value = `${infos.value.get(key)?.name ?? key} から結ぶ先のノードを選んでください（Tab・矢印で移動、Enter で決定、Esc で取り消し）。`;
  const first = connectCandidates()[0];
  if (first) focusNode(first);
}
function endConnectMode(backToSource: boolean): void {
  const from = connectFrom.value;
  connectFrom.value = null;
  liveMessage.value = "";
  if (backToSource && from) focusNode(from);
}
function moveConnectFocus(step: number): void {
  const c = connectCandidates();
  if (c.length === 0) return;
  const cur = document.activeElement?.getAttribute("data-node-key") ?? null;
  const i = cur === null ? -1 : c.indexOf(cur);
  const next = c[(((i + step) % c.length) + c.length) % c.length]!;
  focusNode(next);
}

// --- 線の設定のパネル --------------------------------------------------------------------------------------------

type PanelState = { mode: "edit"; id: string } | { mode: "new"; from: NodeKey; to: NodeKey };
const panel = ref<PanelState | null>(null);
/** 開くたびに作り直す（前の線の入力を持ち越さない）。 */
const panelKey = ref(0);
/** 保存の応答を待っているパネルの世代（`panelKey`）。保存中の印はそのパネルにだけ出す（レビュー R3）。 */
const savingPanels = ref(new Set<number>());
const panelSaving = computed(() => savingPanels.value.has(panelKey.value));
const panelError = ref<string | null>(null);
const panelRef = ref<InstanceType<typeof LinkPanel> | null>(null);
const panelLink = computed(() => {
  const p = panel.value;
  return p?.mode === "edit" ? (graph.links.find((l) => l.id === p.id) ?? null) : null;
});
const panelNewEnds = computed(() => {
  const p = panel.value;
  return p?.mode === "new" ? { from: p.from, to: p.to } : null;
});
const panelInvalid = computed(() => {
  const l = panelLink.value;
  return l ? nodeInvalid(l.from) || nodeInvalid(l.to) : false;
});

/**
 * 書きかけのパネルを閉じてから `then` を行う（変更があれば「変更を捨てますか」を通す。捨てたら `then`、編集に戻れば何もしない。g03 点検）。
 */
let afterPanelClose: (() => void) | null = null;
function guardPanel(then: () => void): void {
  if (!panel.value) {
    then();
    return;
  }
  afterPanelClose = then;
  panelRef.value?.requestClose();
}
/** 変更があるパネルを閉じる要求。「変更を捨てますか」をグラフ画面全体のモーダルの確認で出す（レビュー R2）。 */
function onPanelDiscardRequest(): void {
  if (confirmState.value) return;
  confirmState.value = {
    message: "変更を捨てますか？",
    confirmLabel: "捨てる",
    cancelLabel: "編集に戻る",
    onConfirm: () => closePanel(),
    onCancel: () => {
      // 編集に戻る: 閉じた後に予定していたこと（別の線を開く等）を取りやめる。
      afterPanelClose = null;
      panelRef.value?.focusFirstField();
    },
  };
}

function openNewLink(from: NodeKey, to: NodeKey): void {
  if (isMobile.value) return; // モバイルは編集しない（AC20）
  if (panel.value) {
    guardPanel(() => openNewLink(from, to));
    return;
  }
  connectFrom.value = null;
  liveMessage.value = "";
  selection.value = null;
  panel.value = { mode: "new", from, to };
  panelError.value = null;
  panelKey.value++;
}
function openLinkPanel(id: string): void {
  if (isMobile.value) return;
  selection.value = { kind: "link", id };
  panel.value = { mode: "edit", id };
  panelError.value = null;
  panelKey.value++;
}
/** 閉じたらフォーカスをその線へ（新しい線を取り消したら元のノードへ。AC-I4）。 */
function closePanel(): void {
  const p = panel.value;
  panel.value = null;
  panelError.value = null;
  const next = afterPanelClose;
  afterPanelClose = null;
  if (next) {
    next();
    return;
  }
  if (p?.mode === "edit") {
    if (graph.links.some((l) => l.id === p.id)) focusLink(p.id);
    else dialogEl.value?.focus();
  } else if (p) focusNode(p.from);
}

function configOps(p: LinkPanelSave): Pick<LinkPanelSave, "trigger" | "approval" | "limit"> {
  return {
    ...(p.trigger === undefined ? {} : { trigger: p.trigger }),
    ...(p.approval === undefined ? {} : { approval: p.approval }),
    limit: p.limit,
  };
}

async function onPanelSave(p: LinkPanelSave): Promise<void> {
  // 送ったときのパネル（世代）。応答はそのパネルが開いたままのときだけ当てる（別の線のパネル・閉じた後に当てない。レビュー R3）。
  const gen = panelKey.value;
  savingPanels.value = new Set(savingPanels.value).add(gen);
  panelError.value = null;
  const before = new Set(graph.links.map((l) => l.id));
  const id = p.id;
  let conflict: LinkField[] = [];
  const result =
    id !== undefined
      ? await graph.update((g): GraphBuild => {
          const latest = g.links.find((l) => l.id === id);
          if (!latest) return null;
          // 開いた時点の値から変えた項目だけを最新に重ねる。同じ項目が他でも変わっていれば送らない（黙って上書きしない。統合レビュー R1）。
          const r = linkEditOp(id, p.base ?? linkConfigOf(latest), p, latest);
          if ("conflict" in r) {
            conflict = r.conflict;
            return { conflict: "ほかの画面・sodactl で同じ項目が変わりました。" };
          }
          return r.op ? [r.op] : GRAPH_UNCHANGED;
        })
      : await graph.update((g): GraphOp[] | null =>
          // 送り直しのときは最新のグラフでもう一度確かめる（ノードが外された・同じ線ができた）。
          validateLink(g, linkDraftOf(p)).length > 0
            ? null
            : [{ op: "add_link", kind: p.kind, from: p.from, to: p.to, ...configOps(p) }],
        );
  const rest = new Set(savingPanels.value);
  rest.delete(gen);
  savingPanels.value = rest;
  if (panelKey.value !== gen || !panel.value) {
    // パネルはもう無い（閉じた・別の線へ移った）。失敗だけはトーストで知らせる（黙って消えない）。
    if (!result.ok)
      view.toast(
        `線の設定を保存できませんでした（${result.reason === "gone" ? "対象がほかの画面・sodactl で消されました" : result.message}）`,
      );
    return;
  }
  if (!result.ok && result.reason === "conflict") {
    // パネルは開いたまま、重なった項目の最新の値を出す（入れた値は残す）。
    panelRef.value?.showConflict(conflict);
    return;
  }
  if (!result.ok) {
    panelError.value =
      result.reason === "gone"
        ? id !== undefined
          ? "この線はほかの画面・sodactl で削除されました。"
          : "ほかの画面・sodactl の変更と合わなくなりました（ノードが外された・同じ線ができた等）。"
        : result.message;
    return;
  }
  panel.value = null;
  const savedId =
    id ??
    result.graph.links.find(
      (l) => !before.has(l.id) && l.kind === p.kind && l.from === p.from && l.to === p.to,
    )?.id;
  if (savedId) focusLink(savedId);
  else dialogEl.value?.focus();
}

// --- 確認（線の削除・ノードを外す）---------------------------------------------------------------------------------

interface ConfirmState {
  message: string;
  detail?: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}
const confirmState = ref<ConfirmState | null>(null);
function onConfirmOk(): void {
  const c = confirmState.value;
  confirmState.value = null;
  c?.onConfirm();
}
function onConfirmCancel(): void {
  const c = confirmState.value;
  confirmState.value = null;
  c?.onCancel();
}

function requestDeleteLink(id: string): void {
  if (isMobile.value) return; // モバイルは編集しない（AC20）
  const link = graph.links.find((l) => l.id === id);
  if (!link) return;
  const fromPanel = panel.value?.mode === "edit" && panel.value.id === id;
  confirmState.value = {
    message: `線（${LINK_KIND_NAME[link.kind]}: ${graph.linkTitle(link)}）を削除しますか？`,
    detail: "実行中・一時停止中でも削除します。送った prompt は取り消せません。",
    confirmLabel: "削除する",
    onConfirm: () => {
      void graph
        .update((g): GraphOp[] | null =>
          g.links.some((l) => l.id === id) ? [{ op: "remove_link", id }] : null,
        )
        .then((r) => {
          if (!r.ok && r.reason === "error") view.toast(`線を削除できませんでした（${r.message}）`);
        });
      if (fromPanel) panel.value = null;
      focusNode(link.from);
    },
    onCancel: () => {
      if (fromPanel)
        void nextTick(() => panelRef.value?.$el?.querySelector?.(".link-panel-delete")?.focus());
      else focusLink(id);
    },
  };
}

// --- 一時停止・再開（全体・線ごと。AC12）-----------------------------------------------------------------------------

async function toggleGraphPaused(): Promise<void> {
  const paused = graph.graph?.paused === true;
  if (await graph.setPaused(!paused))
    liveMessage.value = paused ? "連携の全体を再開しました。" : "連携の全体を一時停止しました。";
}
async function toggleLinkPaused(id: string): Promise<void> {
  const link = graph.links.find((l) => l.id === id);
  if (!link) return;
  const pause = link.paused === null;
  if (await graph.setPaused(pause, id))
    liveMessage.value = pause
      ? `線（${graph.linkTitle(link)}）を一時停止しました。`
      : `線（${graph.linkTitle(link)}）を再開しました（回数を 0 に戻しました）。`;
}

// --- pane を載せる/外す（チェックリスト・ノードの Delete。AC-I2 の確認つき）------------------------------------------

const checklistOpen = ref(false);
function toolbarButton(cls: string): HTMLElement | null {
  // デスクトップの画面のツールバーには個別のボタンが無い（「そのほか」のメニューから開く）ので、戻り先は「そのほか」のボタン。
  return dialogEl.value?.querySelector<HTMLElement>(`.${cls}`) ?? dialogEl.value?.querySelector<HTMLElement>(".graph-more") ?? null;
}
/** 選び直し・チェックリスト・パネルは互いに排他（開くときに他を閉じる。パネルに変更があれば確認。レビュー R4）。 */
function openChecklist(): void {
  if (isMobile.value) return; // モバイルは編集しない（AC20）
  if (panel.value) {
    guardPanel(() => openChecklist());
    return;
  }
  rekeyKey.value = null;
  checklistOpen.value = true;
}
function closeChecklist(): void {
  checklistOpen.value = false;
  void nextTick(() => toolbarButton("graph-add-panes")?.focus());
}

function removeOps(g: { nodes: { key: string }[] }, keys: readonly string[]): GraphOp[] {
  const present = new Set(g.nodes.map((n) => n.key));
  return keys
    .filter((k) => present.has(k))
    .map((key) => ({ op: "remove_node" as const, key: key as NodeKey }));
}

/** 外すときの確認（消える線の本数を書く。design「ノードを載せる」）。 */
function confirmRemove(keys: readonly string[], onConfirm: () => void, onCancel: () => void): void {
  const lines = graph.links.filter((l) => keys.includes(l.from) || keys.includes(l.to)).length;
  confirmState.value = {
    message:
      keys.length === 1
        ? `pane（${graph.nodeInfo(keys[0] as NodeKey).name}）をグラフから外しますか？`
        : `${keys.length} 個の pane をグラフから外しますか？`,
    detail:
      lines > 0
        ? `繋がる線 ${lines} 本も消えます（実行中・一時停止中でも）。pane そのものは閉じません。`
        : "繋がる線はありません。pane そのものは閉じません。",
    confirmLabel: "外す",
    onConfirm,
    onCancel,
  };
}

function applyChecklist(change: { add: NodeKey[]; remove: NodeKey[] }): void {
  if (isMobile.value) return; // モバイルは編集しない（AC20）
  checklistOpen.value = false;
  const run = (): void => {
    // 応答を待つ間・失敗・空の操作でもフォーカスを body に落とさない（まず「pane を載せる」へ。レビュー R8）。
    const home = toolbarButton("graph-add-panes");
    home?.focus({ preventScroll: true });
    const stillHome = (): boolean =>
      document.activeElement === home || document.activeElement === document.body;
    void graph
      .update((g): GraphOp[] | null => {
        const present = new Set(g.nodes.map((n) => n.key));
        const add = change.add.filter((k) => !present.has(k));
        const kept = g.nodes.filter((n) => !change.remove.includes(n.key));
        // 置き場所は、その鍵の囲い（マシンごと）の中の空いた升（手元の囲いに重ならない）。構成を導けないときは右隣に並べる。
        const structure = graph.layoutStructure([...kept.map((n) => n.key), ...add]);
        return [
          ...removeOps(g, change.remove),
          ...addMissingNodeOps({ nodes: kept }, add, structure ?? undefined),
        ];
      })
      .then((r) => {
        if (!r.ok) {
          if (r.reason === "error") view.toast(`グラフを変えられませんでした（${r.message}）`);
          return; // フォーカスは適用のすぐ後に「pane を載せる」へ移してある
        }
        // 待つ間に利用者が別の所へ移っていれば動かさない。
        if (!stillHome()) return;
        const added = change.add.find((k) => r.graph.nodes.some((n) => n.key === k));
        if (added) focusNode(added);
        else home?.focus({ preventScroll: true });
      });
  };
  if (change.remove.length > 0)
    confirmRemove(change.remove, run, () => toolbarButton("graph-add-panes")?.focus());
  else run();
}

/**
 * 外せないノードか（開いている手元の pane のノード。手元のすべての pane のノードはサーバが持ち、pane が閉じたときだけ消える。
 * 20261008-graph-first）。pane が無い（閉じた）ノードと、別のマシンのノードは外せる。
 */
function isRequiredNode(key: string): boolean {
  return isLocalNodeKey(key) && infos.value.get(key)?.exists !== false;
}

function requestRemoveNode(key: string): void {
  if (isMobile.value) return; // モバイルは編集しない（AC20）
  if (isRequiredNode(key)) {
    view.toast("開いている pane のノードは外せません（pane を閉じると、ノードも消えます）。");
    return;
  }
  confirmRemove(
    [key],
    () => {
      void graph
        .update((g) => removeOps(g, [key]))
        .then((r) => {
          if (!r.ok && r.reason === "error")
            view.toast(`グラフから外せませんでした（${r.message}）`);
        });
      const next = orderedNodes.value.find((n) => n.key !== key);
      if (next) focusNode(next.key);
      else dialogEl.value?.focus();
    },
    () => focusNode(key),
  );
}

// --- 無効なノードの選び直し（rekey_node。線はそのまま付け替わる。g03 点検）--------------------------------------------

const rekeyKey = ref<NodeKey | null>(null);
/**
 * 選び直せるノードか（ボタンとキーの r の条件はここ 1 か所。レビュー R5）: 無効なノード（候補は同じマシンの pane。別のマシンのノードを
 * 手元の pane に付け替えない。04 で別のマシンのノードにも広げた）。モバイルは編集しない。
 */
function canRekey(key: string): boolean {
  // 手元のノードは選び直せない（手元のすべての pane のノードはサーバが持つ。20261008-graph-first）。
  return !isMobile.value && nodeInvalid(key) && !isLocalNodeKey(key);
}
function openRekey(key: string): void {
  if (!canRekey(key)) return;
  if (panel.value) {
    guardPanel(() => openRekey(key));
    return;
  }
  checklistOpen.value = false;
  rekeyKey.value = key as NodeKey;
}
function closeRekey(): void {
  const key = rekeyKey.value;
  rekeyKey.value = null;
  if (key) focusNode(key);
}
function applyRekey(newKey: NodeKey): void {
  const key = rekeyKey.value;
  rekeyKey.value = null;
  if (!key) return;
  // 応答を待つ間はそのノードに居る（選び直しの欄が消えてフォーカスが body に落ちない。レビュー R8）。
  focusNode(key);
  const stillThere = (): boolean => {
    const a = document.activeElement;
    return a === document.body || a === dialogEl.value || a?.getAttribute("data-node-key") === key;
  };
  void graph
    .update((g): GraphOp[] | null =>
      g.nodes.some((n) => n.key === key) ? [{ op: "rekey_node", key, newKey }] : null,
    )
    .then((r) => {
      if (!r.ok) {
        view.toast(`選び直せませんでした（${r.message}）`);
        if (!stillThere()) return;
        if (graph.nodes.some((n) => n.key === key)) focusNode(key);
        else dialogEl.value?.focus({ preventScroll: true });
        return;
      }
      if (stillThere()) focusNode(newKey);
    });
}

// --- 履歴 --------------------------------------------------------------------------------------------------------

/** 開いている履歴（`linkId` が null ならすべての線）。 */
const history = ref<{ linkId: string | null } | null>(null);
function toggleHistory(): void {
  history.value = history.value ? null : { linkId: null };
}
function closeHistory(): void {
  history.value = null;
  // パネルから開いた履歴ならパネルの「履歴」へ戻す（g03 点検）。
  void nextTick(() =>
    (
      (panel.value ? dialogEl.value?.querySelector<HTMLElement>(".link-panel-history") : null) ??
      toolbarButton("graph-history")
    )?.focus({ preventScroll: true }),
  );
}

// --- サブエージェントの一覧（20261004-subagent-display）--------------------------------------------------------------

/** 開いているサブエージェントの一覧のノード。グラフの `<dialog>` の中の横のパネル（`view.dialogContext` は使わない——グラフ画面の文脈と戻り先を上書きするため）。 */
const subagentsKey = ref<NodeKey | null>(null);
function subagentCountOf(key: string): number {
  const info = graph.nodeInfo(key as NodeKey);
  // 繋がっているノードだけ（切れたマシンの最後の要約の件数は、ボタンと同じく出さない・開かない）。
  return info.exists === true ? (info.agent?.subagents?.count ?? 0) : 0;
}
/** 開く（件数が 1 以上のノードだけ。読み取りだけのモバイルは開かない）。 */
function openSubagents(key: string): void {
  if (isMobile.value || subagentCountOf(key) < 1) return;
  subagentsKey.value = key as NodeKey;
}
/** 閉じる。そのノードがまだあれば、フォーカスをそのノードへ戻す。 */
function closeSubagents(): void {
  const key = subagentsKey.value;
  subagentsKey.value = null;
  if (key && graph.nodes.some((n) => n.key === key)) focusNode(key);
}

// --- ノードから pane へ（AC2・AC-I4）----------------------------------------------------------------------------------

/**
 * ノードを押した・`Enter`（20261008-graph-first の W8・PR2a）: **グラフの上に、その pane の端末が窓として開く**（基本画面へは移らない）。基本画面へは窓の［基本画面で開く］と、ノードの［pane へ］から。
 * 別のマシンの pane・繋がっていない pane・1 列の画面は、今までどおり（`gotoNode`）。
 */
function openNodeWindow(key: string, fromClick = false): void {
  // 押しただけのとき、窓にできないノードは選ぶだけ（今までどおり。移るのは `Enter` と［pane へ］）。
  const fallback = (): void => {
    if (!fromClick) gotoNode(key);
  };
  if (!terminalWindow || isMobile.value || panel.value) return fallback();
  const info = graph.nodeInfo(key as NodeKey);
  if (info.machine !== machines.selectedId || info.exists !== true || !info.location) return fallback();
  const box = document.querySelector<HTMLElement>(`[data-graph-view] [data-node-key="${key}"]`)?.getBoundingClientRect();
  terminalWindows.setAnchor(box ? { x: box.left, y: box.top, w: box.width, h: box.height } : null);
  void terminalWindow.open(info.paneId);
}
/** 留めた窓を開いているノードか（目印を付ける）。 */
function isWindowPinned(key: string): boolean {
  return terminalWindows.windows.some((w) => w.pinned && key.endsWith(`:${w.paneId}`));
}
/** 窓を開いているノードか（目印を付ける）。 */
function isWindowNode(key: string): boolean {
  return terminalWindows.windows.some((w) => key.endsWith(`:${w.paneId}`));
}

/** グラフ画面を閉じて、そのマシンのその pane へ移る（閉じた後の焦点はその pane。画面を閉じたときの戻り先を上書きする）。 */
function gotoNode(key: string): void {
  if (panel.value) {
    guardPanel(() => gotoNode(key));
    return;
  }
  const info = graph.nodeInfo(key as NodeKey);
  const loc = info.location;
  // 繋がっていないマシン（切り替えられない）は画面を閉じずに知らせる（閉じるだけで何も起きないにしない。g04 点検）。
  if (
    info.exists === null ||
    (info.machine !== machines.selectedId && !machines.isSelectable(info.machine))
  ) {
    view.toast(`${info.machineLabel} に繋がっていません（繋がってから移れます）。`);
    return;
  }
  if (!loc || info.exists === false) {
    view.toast(`${info.name} の pane が見つかりません。`);
    return;
  }
  // 1 列の画面はマシンを切り替えない（グラフ画面を開いている間だけ別のマシンの状態を見せる。閉じるとローカルへ戻る。統合レビュー R1）。
  if (isMobile.value && info.machine !== machines.selectedId) {
    view.toast(
      `1 列の画面では別のマシンの pane へ移れません（${info.machineLabel}。広い画面で開いてください）。`,
    );
    return;
  }
  view.closeGraph();
  if (info.machine === machines.selectedId) {
    view.setView(loc.workspaceId, loc.tabId);
    view.focusPane(info.paneId);
    void conn?.request("pane.focus", { paneId: info.paneId }).catch(() => undefined);
    return;
  }
  // 別のマシン（別のマシンを見ている間の手元を含む）はそのマシンへ切り替えて、その pane のある tab を開き、その pane に焦点を置く（04）。
  void switcher?.switchTo(info.machine, { ...loc, paneId: info.paneId });
}

function onChipClick(id: string): void {
  if (connectFrom.value) return;
  if (confirmState.value) return;
  // チェックリスト・選び直しを開いている間は、外側のクリックとして閉じるだけ（両方を開かない。レビュー R4）。
  if (checklistOpen.value) {
    closeChecklist();
    return;
  }
  if (rekeyKey.value) {
    closeRekey();
    return;
  }
  if (isMobile.value) {
    selection.value = { kind: "link", id };
    sheet.value = { kind: "link", id };
    return;
  }
  const p = panel.value;
  if (p?.mode === "edit" && p.id === id) return; // 開いている線そのもの
  guardPanel(() => openLinkPanel(id));
}

// --- 矢印キーでノードを動かす（1 グリッド、Shift で 5。連打が止まって 300ms 後に送る。research-ui §2.3）---------------

const ARROW_SEND_DELAY_MS = 300;
const arrowTimers = new Map<string, ReturnType<typeof setTimeout>>();
function nudgeNode(key: string, dx: number, dy: number): void {
  if (isMobile.value) return; // モバイルは編集しない（AC20）
  const node = graph.nodes.find((n) => n.key === key);
  if (!node) return;
  const p = { x: snapToGrid(node.x) + dx, y: snapToGrid(node.y) + dy };
  // 送るまではドラッグ中と同じ扱い（サーバの値で上書きしない）。
  graph.setDragPosition(key, p);
  reveal(graphNodeRect(p));
  const old = arrowTimers.get(key);
  if (old !== undefined) clearTimeout(old);
  arrowTimers.set(
    key,
    setTimeout(() => {
      arrowTimers.delete(key);
      const cur = graph.dragPositions.get(key);
      if (cur) void graph.moveNodes([{ key, ...cur }]);
    }, ARROW_SEND_DELAY_MS),
  );
}
/** 閉じる・unmount では待たずに送る（動かした位置を捨てない）。 */
function flushArrowMoves(): void {
  for (const [key, t] of arrowTimers) {
    clearTimeout(t);
    const cur = graph.dragPositions.get(key);
    if (cur) void graph.moveNodes([{ key, ...cur }]);
  }
  arrowTimers.clear();
}
onBeforeUnmount(flushArrowMoves);

/** ノードの間の Tab（読み順）。最後のノードの Tab は先頭のチップへ、先頭のノードの Shift+Tab は既定（ツールバーへ）。 */
function tabFromNode(ev: KeyboardEvent, key: string): void {
  const order: string[] = orderedNodes.value.map((n) => n.key);
  const i = order.indexOf(key);
  const next = order[ev.shiftKey ? i - 1 : i + 1];
  if (next !== undefined) {
    ev.preventDefault();
    focusNode(next);
    return;
  }
  if (!ev.shiftKey) {
    const chip = edges.value[0];
    if (chip) {
      ev.preventDefault();
      focusLink(chip.link.id);
    }
  }
}

function onChipKeydown(ev: KeyboardEvent, id: string): void {
  if (ev.isComposing || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  // 先頭のチップの Shift+Tab は読み順の最後のノードへ（ほかのノードは tabindex=-1 なので既定では入口のノードへ戻ってしまう）。
  if (ev.key === "Tab" && ev.shiftKey && edges.value[0]?.link.id === id) {
    const last = orderedNodes.value.at(-1);
    if (last) {
      ev.preventDefault();
      focusNode(last.key);
    }
    return;
  }
  if (ev.key === "Delete" || ev.key === "Backspace") {
    ev.preventDefault();
    ev.stopPropagation();
    requestDeleteLink(id);
  } else if (ev.key === "p" || ev.key === "P") {
    ev.preventDefault();
    ev.stopPropagation();
    void toggleLinkPaused(id);
  }
}

function onNodeKeydown(ev: KeyboardEvent, key: string): void {
  if (ev.isComposing || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (ev.target !== ev.currentTarget) return;
  if (connectFrom.value) {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      ev.stopPropagation();
      if (key !== connectFrom.value) openNewLink(connectFrom.value as NodeKey, key as NodeKey);
    } else if (ev.key === "Tab" || ev.key.startsWith("Arrow")) {
      ev.preventDefault();
      ev.stopPropagation();
      const back =
        ev.key === "ArrowLeft" || ev.key === "ArrowUp" || (ev.key === "Tab" && ev.shiftKey);
      moveConnectFocus(back ? -1 : 1);
    }
    return;
  }
  if (ev.key === "Tab") {
    tabFromNode(ev, key);
  } else if ((ev.key === "c" || ev.key === "C") && !isMobile.value) {
    ev.preventDefault();
    ev.stopPropagation();
    startConnectMode(key);
  } else if ((ev.key === "m" || ev.key === "M") && enterMarks(key)) {
    ev.preventDefault();
    ev.stopPropagation();
  } else if ((ev.key === "r" || ev.key === "R") && canRekey(key)) {
    ev.preventDefault();
    ev.stopPropagation();
    openRekey(key);
  } else if ((ev.key === "s" || ev.key === "S") && !isMobile.value && subagentCountOf(key) > 0) {
    ev.preventDefault();
    ev.stopPropagation();
    openSubagents(key);
  } else if (ev.key === "Enter") {
    ev.preventDefault();
    ev.stopPropagation();
    openNodeWindow(key);
  } else if ((ev.key === "Delete" || ev.key === "Backspace") && !isMobile.value) {
    ev.preventDefault();
    ev.stopPropagation();
    requestRemoveNode(key);
  } else if (ev.key.startsWith("Arrow") && !isMobile.value) {
    ev.preventDefault();
    ev.stopPropagation();
    const step = GRAPH_GRID * (ev.shiftKey ? 5 : 1);
    const dx = ev.key === "ArrowLeft" ? -step : ev.key === "ArrowRight" ? step : 0;
    const dy = ev.key === "ArrowUp" ? -step : ev.key === "ArrowDown" ? step : 0;
    nudgeNode(key, dx, dy);
  }
}

/** ホイール: 既定はパン、Ctrl/⌘（トラックパッドのピンチ）はポインタの位置を中心にズーム。ページはスクロールさせない（AC-I5）。 */
function onWheel(ev: WheelEvent): void {
  cancelViewportAnimation();
  ev.preventDefault();
  ev.stopPropagation();
  if (ev.ctrlKey || ev.metaKey) {
    const rect = canvasEl.value?.getBoundingClientRect();
    const anchor = { x: ev.clientX - (rect?.left ?? 0), y: ev.clientY - (rect?.top ?? 0) };
    zoomBy(Math.exp(-ev.deltaY * 0.01), anchor);
    return;
  }
  const v = viewport.value;
  viewport.value = { zoom: v.zoom, panX: v.panX - ev.deltaX, panY: v.panY - ev.deltaY };
}
onMounted(() => canvasEl.value?.addEventListener("wheel", onWheel, { passive: false }));
// `canvasEl` は開いている間だけある（v-if）。開くたびに付け直す。
watch(canvasEl, (el, old) => {
  old?.removeEventListener("wheel", onWheel);
  el?.addEventListener("wheel", onWheel, { passive: false });
});
onBeforeUnmount(() => canvasEl.value?.removeEventListener("wheel", onWheel));

// --- 開閉とフォーカス（AC-I4）------------------------------------------------------------------------------------

/** 開いたら直前の pane のノード（載っていなければ先頭のノード）へ。まだグラフが無ければ届いてから。 */
let focusOnLoad = false;
function focusInitial(): void {
  // 開く前に焦点のあった pane（1 列は覚えておいた値、デスクトップは焦点の pane そのもの——画面のあいだにサイドバーで選び直した pane もそのまま使う）
  const pre = props.kind === "screen" ? view.focusedPaneId : view.preGraphFocusPaneId;
  const key = pre ? `${machines.selectedId}:${pre}` : null;
  if (key && graph.nodes.some((n) => n.key === key)) {
    focusNode(key);
    return;
  }
  const first = orderedNodes.value[0];
  if (first) focusNode(first.key);
  else dialogEl.value?.focus();
}

// デスクトップのグラフの画面で、サイドバーの行を押した・navigate で選んだ後、フォーカスをグラフの面へ戻す（`Esc` が効くように。PR1b のレビュー指摘 4）。
// サイドバーで選んだとき（いま選んでいる行を押した場合を含む。`sidebarPickSeq`）と navigate の選びが終わったときだけ。フォーカスが `body` かサイドバーにあるときだけ動かす
// （ダイアログ・設定・入力欄にあるときは動かさない）。同じ作業の中で行うので `body` に落ちない（D45）。
function refocusSurface(onlyBody = false): void {
  const root = dialogEl.value;
  // navigate 中は動かさない（グラフの面が矢印キーを食い、行の選びが止まる）
  if (!root || !props.active || view.modalOpen || view.navigateSelection) return;
  const a = document.activeElement;
  if (root.contains(a)) return;
  if (a && a !== document.body && (onlyBody || !a.closest(".sidebar"))) return;
  const sel = selection.value;
  if (sel?.kind === "link") focusLink(sel.id);
  else if (sel?.kind === "node" && graph.nodes.some((n) => n.key === sel.key)) focusNode(sel.key);
  else root.focus({ preventScroll: true });
}
watch(
  () => [view.workspaceId, view.focusedPaneId, view.navigateSelection, view.sidebarPickSeq] as const,
  () => {
      if (props.kind !== "screen" || !props.active) return;
    void nextTick(() => refocusSurface());
    // 押した行が作り直される（サーバの更新で一覧が描き直される）と、その後で `body` に落ちる——落ちた後にもう一度（`body` に落ちているときだけ。利用者が自分でサイドバーへ移したフォーカスは動かさない）。
    window.setTimeout(() => refocusSurface(true), 150);
  },
);

watch(
  () => props.active,
  (open) => {
    void nextTick(() => {
      const el = dialogEl.value;
      if (open) {
        selection.value = null;
        if (!graph.graph) {
          focusOnLoad = true;
          el?.focus();
          void graph.load();
        } else {
          syncSpaceViewport();
          if (needsFit && hasContent()) {
            fitAll();
            needsFit = false;
          }
          focusInitial();
        }
        return;
      }
      // 画面を閉じたら一時的な状態をすべて初期化する（開き直した後に古い予定・prefix が効かない。レビュー R1）。
      drag.cancel();
      flushArrowMoves();
      afterPanelClose = null;
      disarmPrefix();
      flushViewportSave();
      suppressChipClick = null;
      pointerFocusing = false;
      sheet.value = null;
      touches.clear();
      pinch = null;
      connectFrom.value = null;
      connectDrag.value = null;
      panel.value = null;
      confirmState.value = null;
      checklistOpen.value = false;
      rekeyKey.value = null;
      history.value = null;
      subagentsKey.value = null;
      liveMessage.value = "";
      // ダイアログを閉じるのは入れ物（`GraphDialog`）。ここでは、焦点を端末へ戻す。
      // `closeGraph` は焦点の pane を同じ値に戻すだけで（デスクトップは動かしもしない）、`TerminalPane` の watch が動かない——端末へ明示的に戻す（`CommandPopup` と同じ）。
      // 同じ作業の中で行う（フォーカスが `body` に落ちた状態を、見回り〔`focusDrop`〕に見せない。D45）。
      const back = view.focusedPaneId;
      if (back && !view.modalOpen && view.screen === "base") registry?.focus(back);
    });
  },
  // 開いたまま本体が作り直された（ログインし直し・切り離しからの復帰）ときも開き直す——グラフが見えている状態とキーの dialog モードが残ったまま
  // 画面が見えない状態にしない。
  { immediate: true },
);
watch(
  () => graph.graph,
  (g) => {
    if (!g || !props.active) return;
    syncSpaceViewport();
    if (needsFit && hasContent()) {
      fitAll();
      needsFit = false;
    }
    if (focusOnLoad) {
      focusOnLoad = false;
      void nextTick(focusInitial);
    }
    // 選んでいたものが他で消えたら選択を外す。
    const s = selection.value;
    if (s?.kind === "node" && !g.nodes.some((n) => n.key === s.key)) selection.value = null;
    if (s?.kind === "link" && !g.links.some((l) => l.id === s.id)) selection.value = null;
  },
);

// 表示中の空間が（選んでいる workspace が別の空間へ移った等で）替わったら、表示を読み替える。
watch(
  () => spaces.currentId,
  () => {
    if (props.active) syncSpaceViewport();
  },
);
// 囲いの構成が変わって、まだ全体表示にしていない空間に中身が描かれたら、全体表示にする。
watch(hasContent, (has) => {
  if (props.active && has && needsFit) {
    fitAll();
    needsFit = false;
  }
});

// --- サイドバー・印から動かす（20261008-graph-first の T11e・T11g）-------------------------------------------------------

/** 空間の見出しを押した: その空間の全体が収まる位置と倍率にする。 */
function onSpaceSelect(id: string): void {
  switchSpace(id);
  fitAll();
}
function nodeViewportFor(key: string): GraphViewport | null {
  const r = rects.value.get(key);
  if (!r) return null;
  const size = canvasSize();
  const zoom = clampZoom(Math.max(0.6, Math.min(1, viewport.value.zoom)));
  return { zoom, panX: size.w / 2 - (r.x + r.w / 2) * zoom, panY: size.h / 2 - (r.y + r.h / 2) * zoom };
}
function handleReveal(t: GraphRevealTarget): void {
  const st = spaces.structure;
  if (st === null) return;
  if (t.kind === "space") {
    if (spaces.spaces.some((x) => x.id === t.spaceId)) onSpaceSelect(t.spaceId);
    return;
  }
  if (t.kind === "workspace") {
    const sp = spaces.spaceOfMember.get(t.workspaceId);
    if (sp === undefined) return;
    switchSpace(sp);
    const frame = displayFrames(st, new Map(graph.nodes.map((n) => [n.key, { x: n.x, y: n.y }])), sp).find(
      (f) => f.id === t.workspaceId,
    );
    spaces.flash(t.workspaceId);
    if (frame) animateViewport(fitGraphView([frame.rect], canvasSize(), 60));
    return;
  }
  const sp = spaces.spaceOfNode.get(t.key);
  if (sp === undefined) return;
  switchSpace(sp);
  selection.value = { kind: "node", key: t.key };
  const memberId = spaces.memberOfNode.get(t.key);
  if (memberId) spaces.flash(memberId);
  const vp = nodeViewportFor(t.key);
  if (vp) animateViewport(vp);
  void nextTick(() => nodeEl(t.key)?.focus({ preventScroll: true }));
}
watch(
  () => spaces.revealSeq,
  () => {
    const t = spaces.revealTarget;
    if (props.kind !== "screen" || !props.active || t === null) return;
    // サイドバーの行を押した後の処理（選ぶ・フォーカスを面へ戻す）が先に走ってから動かす。
    void nextTick(() => handleReveal(t));
  },
);

/** 別の空間のノードとの線の印から: 相手のノードへ（相手の空間へ切り替える）。 */
function goToMark(m: { otherKey: string }): void {
  selectLikeSidebar({ kind: "node", key: m.otherKey });
  spaces.requestReveal({ kind: "node", key: m.otherKey });
}
function openMarkSettings(m: { link: GraphLink }): void {
  onChipClick(m.link.id);
}

// --- 小さな地図（PR1d T12a）-----------------------------------------------------------------------------------------
const MINIMAP_KEY = "soda.graphMinimap.v1";
const minimapCollapsed = ref(((): boolean => {
  try {
    return localStorage.getItem(MINIMAP_KEY) === "collapsed";
  } catch {
    return false;
  }
})());
function toggleMinimap(): void {
  minimapCollapsed.value = !minimapCollapsed.value;
  try {
    localStorage.setItem(MINIMAP_KEY, minimapCollapsed.value ? "collapsed" : "open");
  } catch {
    // 覚えられなくても動く
  }
}
/** いま見えている範囲（世界の座標）。 */
const visibleWorld = computed<GraphRect>(() => {
  const size = canvasSizeRef.value;
  const v = viewport.value;
  return { x: -v.panX / v.zoom, y: -v.panY / v.zoom, w: size.w / v.zoom, h: size.h / v.zoom };
});
/** 面の大きさ（描き直しの印。ResizeObserver で追う）。 */
const canvasSizeRef = ref({ w: 800, h: 600 });
let canvasObserver: ResizeObserver | null = null;
onMounted(() => {
  const el = canvasEl.value;
  canvasSizeRef.value = canvasSize();
  if (el && typeof ResizeObserver === "function") {
    canvasObserver = new ResizeObserver(() => (canvasSizeRef.value = canvasSize()));
    canvasObserver.observe(el);
  }
});
watch(canvasEl, (el, old) => {
  if (old) canvasObserver?.unobserve(old);
  if (el) {
    canvasSizeRef.value = canvasSize();
    canvasObserver?.observe(el);
  }
});
onBeforeUnmount(() => canvasObserver?.disconnect());
/** 地図を押した・ドラッグした: その点が面の中央に来る。 */
function centerOn(point: { x: number; y: number }): void {
  cancelViewportAnimation();
  const size = canvasSize();
  const zoom = viewport.value.zoom;
  viewport.value = { zoom, panX: size.w / 2 - point.x * zoom, panY: size.h / 2 - point.y * zoom };
}

// --- 探す（PR1d T12b）--------------------------------------------------------------------------------------------
const findRef = ref<InstanceType<typeof GraphFind> | null>(null);
/** 空間をまたぐ候補（pane・workspace）。名前・エージェント・tab の名前で探せる。 */
const findItems = computed<FindItem[]>(() => {
  const out: FindItem[] = [];
  const spaceName = (id: string | undefined): string => spaces.spaces.find((x) => x.id === id)?.label ?? "";
  for (const n of graph.nodes) {
    const info = infos.value.get(n.key);
    if (!info) continue;
    const loc = info.location;
    const ws = loc ? session.workspaces.get(loc.workspaceId) : undefined;
    const tab = loc ? session.tabs.get(loc.tabId) : undefined;
    const a = info.agent;
    const where = [spaceName(spaces.spaceOfNode.get(n.key)), ws?.label ?? info.machineLabel, ...(ws && ws.tabIds.length > 1 && tab ? [`tab ${tab.label}`] : [])]
      .filter((t) => t !== "")
      .join(" · ");
    out.push({
      kind: "pane",
      target: n.key,
      label: info.name,
      sub: a ? `${where} · ${a.name && a.name !== a.label ? a.name : a.label}` : where,
      haystack: [info.name, a?.name ?? "", a?.label ?? "", a?.kind ?? "", ws?.label ?? "", tab?.label ?? ""],
    });
  }
  for (const sp of spaces.spaces) {
    for (const id of sp.workspaceIds) {
      const ws = session.workspaces.get(id);
      if (ws) out.push({ kind: "workspace", target: id, label: ws.label, sub: sp.label, haystack: [ws.label] });
    }
  }
  return out;
});
/**
 * 探して決めた・線の印を押した、とき: **サイドバーの行を押したのと同じ**に、自分の選んでいる workspace・tab・pane を替え、サーバの「選んでいる workspace・pane」も替える
 * （`workspace.focus`・`pane.focus`。基本画面へ戻ったときその pane にいる。地図の「選んでいる囲い」・サイドバーの選択の見た目も動く）。画面の接続が向いているマシンの pane・workspace だけ
 * （別のマシンの pane は、手元のセッションに無いので、動かすだけ）。
 */
function selectLikeSidebar(target: { kind: "node"; key: string } | { kind: "workspace"; workspaceId: string }): void {
  if (target.kind === "workspace") {
    const ws = session.workspaces.get(target.workspaceId);
    if (!ws) return;
    const tab = session.tabs.get(ws.activeTabId);
    view.setView(ws.id, ws.activeTabId);
    if (tab) view.focusPane(tab.focusedPaneId);
    void conn?.request("workspace.focus", { workspaceId: ws.id }).catch(() => undefined);
    return;
  }
  const info = graph.nodeInfo(target.key as NodeKey);
  const loc = info.location;
  if (!loc || info.machine !== machines.selectedId || info.exists !== true) return;
  view.setView(loc.workspaceId, loc.tabId);
  view.focusPane(info.paneId);
  void conn?.request("pane.focus", { paneId: info.paneId }).catch(() => undefined);
}
function onFindChoose(item: FindItem): void {
  dialogEl.value?.focus({ preventScroll: true });
  if (item.kind === "pane") {
    if (!spaces.spaceOfNode.has(item.target)) {
      view.toast(`${item.label} は、この画面では動かせません（空間に載っていない pane です）。`);
      return;
    }
    selectLikeSidebar({ kind: "node", key: item.target });
    spaces.requestReveal({ kind: "node", key: item.target });
  } else {
    selectLikeSidebar({ kind: "workspace", workspaceId: item.target });
    spaces.requestReveal({ kind: "workspace", workspaceId: item.target });
  }
}
/** 確認・接続の途中・横のパネル・チェックリスト・選び直しが出ている間（グラフの画面全体に対してモーダルな状態）。 */
function modalBusy(): boolean {
  return (
    confirmState.value !== null ||
    connectFrom.value !== null ||
    sheet.value !== null ||
    panel.value !== null ||
    history.value !== null ||
    subagentsKey.value !== null ||
    checklistOpen.value ||
    rekeyKey.value !== null ||
    addForm.value !== null
  );
}
function focusFind(): void {
  findRef.value?.focus();
}
/** 空間を 1 つ隣へ（`[` `]`。端で止まる）。 */
function stepSpace(delta: -1 | 1): void {
  const ids = spaces.spaces.map((x) => x.id);
  const i = ids.indexOf(spaces.currentId);
  const next = ids[i + delta];
  if (i < 0 || next === undefined) return;
  onSpaceSelect(next);
}

// --- pane・workspace を足す（20261008-graph-first の PR3 T14c〜T14e。decisions D84）-------------------------------------
// 足す流れは `addPane.ts`（単体試験あり）。ここは、フォームの開閉・位置・足した後の「選ぶ・窓を開く」だけ。窓を開くのは既存の入口（`openNodeWindow`）。

interface AddFormState {
  workspaceId: string;
  /** 開いた「＋」（閉じたらフォーカスを戻す）。 */
  trigger: HTMLElement | null;
  /** 監督役にできる、選んでいるノード（エージェントのノード）。 */
  supervisorKey: string | null;
  busyText: string | null;
  error: string | null;
  /** 前の試みで足せた pane（やり直しは、そこへ起動するだけ）。 */
  createdPaneId: string | null;
}
const addForm = ref<AddFormState | null>(null);
const addKinds = ref<AddFormKind[] | null>(null);

function openAddForm(workspaceId: string, trigger: HTMLElement | null): void {
  if (isMobile.value || !conn || addForm.value?.busyText) return;
  const s = selection.value;
  const info = s?.kind === "node" ? graph.nodeInfo(s.key as NodeKey) : null;
  addForm.value = {
    workspaceId,
    trigger,
    supervisorKey: info !== null && info.agent !== null && info.exists === true ? info.key : null,
    busyText: null,
    error: null,
    createdPaneId: null,
  };
  addKinds.value = null;
  void conn
    .request("agent.kinds", {})
    .then((r) => (addKinds.value = r.kinds))
    .catch(() => (addKinds.value = []));
}
/** フォームが開いている間、フォームの外（ツールバー・サイドバー・キャンバス・画面の外。どこでも）を押すと閉じる（AC-A1）。足している間は閉じない。 */
function onAddFormOutsidePointerdown(ev: PointerEvent): void {
  const t = ev.target as Element | null;
  if (t?.closest?.("[data-graph-add-form]")) return;
  closeAddForm();
}
watch(
  () => addForm.value !== null,
  (open) => {
    if (open) document.addEventListener("pointerdown", onAddFormOutsidePointerdown, true);
    else document.removeEventListener("pointerdown", onAddFormOutsidePointerdown, true);
  },
);
onBeforeUnmount(() => document.removeEventListener("pointerdown", onAddFormOutsidePointerdown, true));
function closeAddForm(): void {
  const f = addForm.value;
  if (f === null || f.busyText !== null) return;
  addForm.value = null;
  void nextTick(() => (f.trigger?.isConnected ? f.trigger : dialogEl.value)?.focus({ preventScroll: true }));
}
/** 「＋ pane」（ツールバー）: 選んでいる workspace に足す。その workspace の空間へ切り替えて見せる。 */
function openAddFormForSelection(ev?: Event): void {
  const wid = view.workspaceId;
  if (!wid) {
    view.toast("足す先の workspace がありません。");
    return;
  }
  spaces.requestReveal({ kind: "workspace", workspaceId: wid });
  openAddForm(wid, (ev?.currentTarget as HTMLElement | null) ?? null);
}
const addFormSupervisorName = computed(() => {
  const k = addForm.value?.supervisorKey;
  return k ? graph.nodeInfo(k as NodeKey).name : null;
});
const addFormWorkspaceTitle = computed(() => {
  const id = addForm.value?.workspaceId;
  return (id && session.workspaces.get(id)?.label) || "workspace";
});
/** フォームの位置: 囲いの下の左（キャンバスの左上からの px）。キャンバスの中に収める。 */
const addFormPos = computed(() => {
  const f = addForm.value;
  const frame = f ? spaces.frames.find((x) => x.id === f.workspaceId) : undefined;
  const z = viewport.value.zoom;
  const W = 280;
  const H = 300;
  let x = frame ? frame.rect.x * z + viewport.value.panX : 16;
  let y = frame ? (frame.rect.y + frame.rect.h) * z + viewport.value.panY + 6 : 16;
  const cw = canvasEl.value?.clientWidth ?? 0;
  const ch = canvasEl.value?.clientHeight ?? 0;
  if (cw > 0) x = Math.max(8, Math.min(x, cw - W - 8));
  if (ch > 0) y = Math.max(8, Math.min(y, ch - H - 8));
  return { x, y };
});
function addPaneDeps(): AddPaneDeps {
  return {
    conn: conn as unknown as AddPaneDeps["conn"],
    workspaces: session.workspaces,
    tabs: session.tabs,
    panes: session.panes,
    newCwdFor: (id) => buildNewCwd(settings.newCwdPolicy, settings.newCwdPath, id),
    hasNode: (k) => graph.nodes.some((n) => n.key === k),
    updateGraph: async (build) => {
      const r = await graph.update(() => build());
      return r.ok ? { ok: true } : { ok: false, message: r.message };
    },
    agentNames: () => new Set(graph.nodes.map((n) => graph.nodeInfo(n.key).name)),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}
async function submitAddForm(s: AddFormSubmit): Promise<void> {
  const f = addForm.value;
  if (f === null || f.busyText !== null || !conn) return;
  f.error = null;
  f.busyText = "pane を足しています…";
  try {
    const r = await addPane(
      addPaneDeps(),
      { workspaceId: f.workspaceId, kind: s.kind, name: s.name, supervisorKey: s.supervise ? f.supervisorKey : null, existingPaneId: f.createdPaneId },
      { onStep: (t) => (f.busyText = t), onPane: (id) => (f.createdPaneId = id) },
    );
    addForm.value = null;
    // 足した後（T14d）: ノードを選んで見せ、端末の窓を開く（既存の入口）。
    spaces.requestReveal({ kind: "node", key: r.key });
    await nextTick();
    openNodeWindow(r.key, true);
  } catch (err) {
    f.busyText = null;
    if (err instanceof AddPaneError) {
      f.error = err.message;
      if (err.paneId !== null) f.createdPaneId = err.paneId;
    } else f.error = err instanceof Error ? err.message : "足せませんでした。";
  }
}

/**
 * 「＋ workspace」で作った workspace を、いま見ている空間がグループなら、そのグループへ入れる（サーバの決まりは「グループなし」）。
 * **入れるのは、この操作が作った workspace だけ**（`workspace.create` の応答の id。ほかのブラウザ・`sodactl` が同じ時間に作ったものは動かさない）。
 * 空間は、押した時点のもの（作っている間に見ている空間を替えても、押した空間へ入れる）。
 */
function createWorkspaceHere(): void {
  const id = spaces.currentId;
  const groupId = id.startsWith("g:") ? id.slice(2) : null;
  actions?.newWorkspaceThen((workspaceId) => {
    if (groupId === null) return;
    void conn?.request("group.add_member", { groupId, workspaceId }).catch(() => undefined);
  });
}
/** ツールバーの「＋ workspace ▾」。 */
function openAddWorkspaceMenu(ev: MouseEvent | KeyboardEvent): void {
  const el = (ev.currentTarget as HTMLElement | null) ?? toolbarButton("graph-add-workspace");
  const r = el?.getBoundingClientRect();
  view.openContextMenu({ kind: "graphAdd" }, { x: r?.left ?? 0, y: (r?.bottom ?? 0) + 2 });
}
/** ノード・囲いの見出しの右クリックのメニュー。 */
function onNodeContextmenu(ev: MouseEvent, key: string): void {
  if (isMobile.value || props.kind !== "screen") return;
  ev.preventDefault();
  selection.value = { kind: "node", key };
  view.openContextMenu({ kind: "graphNode", key }, { x: ev.clientX, y: ev.clientY });
}
function onFrameContextmenu(ev: MouseEvent, workspaceId: string): void {
  if (isMobile.value || props.kind !== "screen") return;
  view.openContextMenu({ kind: "graphFrame", workspaceId }, { x: ev.clientX, y: ev.clientY });
}

// --- ツールバー（デスクトップの画面。PR1e T17b）------------------------------------------------------------------------
/** 「そのほか」のメニュー（ContextMenu を使う。キー・読み上げ・フォーカスの戻りは、その部品のもの）。 */
function openMoreMenu(ev: MouseEvent | KeyboardEvent): void {
  const el = (ev.currentTarget as HTMLElement | null) ?? toolbarButton("graph-more");
  const r = el?.getBoundingClientRect();
  view.openContextMenu({ kind: "graphMore" }, { x: r?.left ?? 0, y: (r?.bottom ?? 0) + 2 });
}
watch(
  () => spaces.command?.seq,
  () => {
    const c = spaces.command;
    if (c === null || props.kind !== "screen" || !props.active) return;
    if (c.name === "pause") void toggleGraphPaused();
    else if (c.name === "history") toggleHistory();
    else if (c.name === "addPane") {
      if (c.arg) {
        spaces.requestReveal({ kind: "workspace", workspaceId: c.arg });
        openAddForm(c.arg, null);
      }
    } else if (c.name === "newWorkspace") {
      createWorkspaceHere();
    } else guardPanel(() => openChecklist());
  },
);
/** 「線を結ぶ」: 選んでいるノードから接続モードに入る（ノードを選んでいなければ、案内だけ）。 */
function startConnectFromSelection(): void {
  if (isMobile.value) return;
  const s = selection.value;
  if (s?.kind === "node" && shownNodes.value.some((n) => n.key === s.key)) {
    startConnectMode(s.key);
    return;
  }
  liveMessage.value = "線を結ぶ元のノードを選んでから押してください。";
  view.toast("線を結ぶ元のノードを選んでから押してください（ノードのハンドルをドラッグしても結べます）。");
}
const connectDisabledHint = computed(() => (selection.value?.kind === "node" ? "選んでいるノードから、結ぶ先を選びます（c）" : "先にノードを選んでください"));

// --- 並びを整える（PR1e T17c。AC-L3）----------------------------------------------------------------------------------
/** 1 回の `graph.update` で送れる操作の数（`GRAPH_OPS_MAX`）。 */
const TIDY_OPS_MAX = GRAPH_OPS_MAX;
/** 直前の「並べ直し」を戻すための記憶（別の更新が入るまで）。 */
let tidyUndo: { toastId: number; rev: number; before: { key: NodeKey; x: number; y: number }[] } | null = null;
function dropTidyUndo(): void {
  if (tidyUndo) view.dismissToast(tidyUndo.toastId);
  tidyUndo = null;
}
// 別の更新（自分の別の操作・ほかのブラウザ・sodactl）が入ったら、「元に戻す」は消す（その位置へ戻すと、あとの変更を踏む）。
watch(
  () => graph.graph?.rev,
  (rev) => {
    if (tidyUndo !== null && rev !== tidyUndo.rev) dropTidyUndo();
  },
);
onBeforeUnmount(dropTidyUndo);

function requestTidy(): void {
  if (isMobile.value || props.kind !== "screen") return;
  const st = spaces.structure;
  if (st === null || !graph.graph) {
    view.toast("この画面では、並べ直せません（手元のセッションを見ているときだけ）。");
    return;
  }
  const moves = tidySpace(st, nodePositions(graph.nodes), spaces.currentId);
  if (moves === null) {
    view.toast("並べ直せませんでした（座標の範囲に収まりません）。");
    return;
  }
  if (moves.size === 0) {
    view.toast("この空間には、並べ直すノードがありません。");
    return;
  }
  if (moves.size > TIDY_OPS_MAX) {
    view.toast(`ノードが多すぎて、一度には並べ直せません（${moves.size} 個。上限 ${TIDY_OPS_MAX} 個）。`);
    return;
  }
  confirmState.value = {
    message: `この空間の ${moves.size} 個のノードの位置を、並べ直します。`,
    detail: "囲いを詰めて、重ならないように並べ直します。線は変わりません。並べ直した直後なら、元に戻せます。",
    confirmLabel: "並べ直す",
    cancelLabel: "やめる",
    onConfirm: () => void runTidy(),
    onCancel: () => toolbarButton("graph-tidy")?.focus(),
  };
}
async function runTidy(): Promise<void> {
  const spaceId = spaces.currentId;
  let before: { key: NodeKey; x: number; y: number }[] = [];
  // 確認を出している間に、ほかの更新（別のブラウザ・sodactl）が入るかもしれない。`graph.update` は、衝突（`rev_conflict`）のあと取り直した**最新**のグラフで
  // もう一度ここを呼ぶので、計算は、そのつど渡された最新のグラフ `g` の位置・構成で行う（古い位置で計算して、新しいノードと重ねない）。
  const r = await graph.update((g): GraphOp[] | { conflict: string } => {
    const st = graph.layoutStructure(g.nodes.map((n) => n.key));
    if (st === null) return { conflict: "手元のセッションを見ているときだけ、並べ直せます。" };
    const moves = tidySpace(st, nodePositions(g.nodes), spaceId);
    if (moves === null) return { conflict: "座標の範囲に収まりません。" };
    if (moves.size === 0 || moves.size > TIDY_OPS_MAX) return { conflict: "並べ直すノードの数が合いません。" };
    const now = new Map(g.nodes.map((n) => [n.key, n]));
    before = [...moves.keys()].flatMap((k) => (now.has(k) ? [{ key: k, x: now.get(k)!.x, y: now.get(k)!.y }] : []));
    const ops = [...moves].flatMap(([key, p]) => (now.has(key) ? [{ op: "move_node" as const, key, x: p.x, y: p.y }] : []));
    return ops.length === 0 ? { conflict: "並べ直すノードがありません。" } : ops;
  });
  if (!r.ok) {
    view.toast(`並べ直せませんでした（${r.message}）`);
    return;
  }
  dropTidyUndo();
  const rev = r.graph.rev;
  const id = view.toast("並べ直しました。", {
    kind: "sticky",
    actions: [{ label: "元に戻す", run: () => void undoTidy() }],
  });
  tidyUndo = { toastId: id, rev, before };
  liveMessage.value = "並べ直しました。";
  void nextTick(fitAll);
}
async function undoTidy(): Promise<void> {
  const u = tidyUndo;
  if (u === null) return;
  tidyUndo = null;
  view.dismissToast(u.toastId);
  const r = await graph.update((g): GraphOp[] | typeof GRAPH_UNCHANGED | { conflict: string } => {
    // 別の更新が入っていたら戻さない（あとの変更を踏まない）。
    if (g.rev !== u.rev) return { conflict: "別の変更が入ったので、元に戻せません。" };
    const ops = u.before.filter((b) => g.nodes.some((n) => n.key === b.key)).map((b) => ({ op: "move_node" as const, key: b.key, x: b.x, y: b.y }));
    return ops.length === 0 ? GRAPH_UNCHANGED : ops;
  });
  if (!r.ok) view.toast(r.reason === "conflict" ? r.message : `元に戻せませんでした（${r.message}）`);
  else liveMessage.value = "元に戻しました。";
}

// --- tab のタグ・強調（20261008-graph-first の T11d）-------------------------------------------------------------------
/** ノードの右上のタグ（tab が 1 つだけの workspace では出さない）。 */
function tabLabelOf(key: string): string | null {
  const loc = infos.value.get(key)?.location;
  if (!loc) return null;
  const ws = session.workspaces.get(loc.workspaceId);
  if (!ws || ws.tabIds.length < 2) return null;
  return session.tabs.get(loc.tabId)?.label ?? null;
}
/** 見出しのタグで強調した tab のノードは強く、同じ workspace のほかの tab のノードは弱く。 */
function tabEmphasisOf(key: string): "normal" | "strong" | "weak" {
  const e = spaces.emphasis;
  if (e === null) return "normal";
  const loc = infos.value.get(key)?.location;
  if (!loc || loc.workspaceId !== e.workspaceId) return "normal";
  return loc.tabId === e.tabId ? "strong" : "weak";
}

// --- キー -----------------------------------------------------------------------------------------------------

function isTextField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable ||
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT"
  );
}

// --- 開いたのと同じキーで閉じる（AC-I1。dialog モードでは KeyRouter が prefix を扱わないので、ここで割り当ての表を引く）----------

const PREFIX_TIMEOUT_MS = 3000; // KeyRouter の prefix の時間切れと同じ
let prefixArmed = false;
let prefixTimer: ReturnType<typeof setTimeout> | null = null;
function disarmPrefix(): void {
  prefixArmed = false;
  if (prefixTimer !== null) clearTimeout(prefixTimer);
  prefixTimer = null;
}
onBeforeUnmount(disarmPrefix);

/**
 * 子（パネル・確認）より先に見る（capture）。prefix の次のキーが `open_graph` の割り当てなら閉じる（割り当てを変えても追従する）。
 * prefix の次のほかのキーは何もせずに食う（グラフの操作・入力へ渡さない）。直接のキーの `open_graph` もそのまま閉じる。
 */
function onKeydownCapture(ev: KeyboardEvent): void {
  if (ev.isComposing || ev.keyCode === 229) return;
  const chord = chordOf(keyInputOf(ev));
  if (chord === null) return; // 修飾キー単体は prefix を保つ
  const km = settings.keymap;
  const isClose = (a: { type: string } | undefined): boolean => a?.type === "openGraph";
  if (prefixArmed) {
    disarmPrefix();
    ev.preventDefault();
    ev.stopPropagation();
    const next = km.prefixMap.get(chord);
    if (isClose(next)) view.closeGraph();
    // デスクトップの画面では、設定を開くキーも働く（グラフの面の中でだけ、ほかの prefix のキーは食う。20261008-graph-first の D12）。
    else if (props.kind === "screen" && next?.type === "settings") actions?.run(next);
    return;
  }
  if (chord === km.prefix) {
    ev.preventDefault();
    ev.stopPropagation();
    prefixArmed = true;
    prefixTimer = setTimeout(disarmPrefix, PREFIX_TIMEOUT_MS);
    return;
  }
  if (isClose(km.directMap.get(chord))) {
    ev.preventDefault();
    ev.stopPropagation();
    view.closeGraph();
  }
}

/** 確認を出している間は、フォーカスを確認の外へ出さない（グラフ画面全体に対してモーダル。レビュー R2）。 */
function onFocusin(ev: FocusEvent): void {
  if (!confirmState.value) return;
  const t = ev.target as Element | null;
  if (t?.closest?.(".graph-confirm")) return;
  dialogEl.value
    ?.querySelector<HTMLElement>(".graph-confirm-cancel")
    ?.focus({ preventScroll: true });
}

function onKeydown(ev: KeyboardEvent): void {
  if (ev.isComposing) return;
  if (ev.key === "Escape") {
    ev.preventDefault(); // keydown で止めるので cancel は起きない（起きても下で同じく閉じる）
    escape();
    return;
  }
  if (isTextField(ev.target) || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  switch (ev.key) {
    case "1":
      ev.preventDefault();
      fitAll();
      return;
    case "+":
    case "=":
      ev.preventDefault();
      zoomBy(1.2);
      return;
    case "-":
      ev.preventDefault();
      zoomBy(1 / 1.2);
      return;
    case "0":
      ev.preventDefault();
      zoomReset();
      return;
    case "[":
    case "]":
      if (isMobile.value || modalBusy()) return;
      ev.preventDefault();
      stepSpace(ev.key === "[" ? -1 : 1);
      return;
    case "/":
      if (isMobile.value) return;
      ev.preventDefault();
      focusFind();
      return;
    case "n":
    case "N":
      if (isMobile.value || modalBusy()) return;
      ev.preventDefault();
      toggleMinimap();
      return;
  }
}

/** Esc は 1 段ずつ（design「開く」: 接続中の取り消し → パネル → 選択 → 画面）。ドラッグ中の Esc は `usePointerDrag` が先に取る。 */
function escape(): void {
  if (confirmState.value) {
    onConfirmCancel();
    return;
  }
  if (sheet.value) {
    closeSheet();
    return;
  }
  if (connectFrom.value) {
    endConnectMode(true);
    return;
  }
  if (checklistOpen.value) {
    closeChecklist();
    return;
  }
  if (rekeyKey.value) {
    closeRekey();
    return;
  }
  if (subagentsKey.value) {
    closeSubagents();
    return;
  }
  if (panel.value) {
    panelRef.value?.requestClose();
    return;
  }
  if (history.value) {
    closeHistory();
    return;
  }
  if (selection.value) {
    selection.value = null;
    dialogEl.value?.focus();
    return;
  }
  view.closeGraph();
}

function chipLabel(e: EdgeView): string {
  return linkChipText(e.link, {
    invalid: e.invalid,
    graphPaused: graph.graph?.paused === true,
    fired: graph.firing.get(e.link.id) ?? null,
  });
}
function chipAria(e: EdgeView): string {
  return linkDescription(e.link, graph.linkTitle(e.link), {
    invalid: e.invalid,
    graphPaused: graph.graph?.paused === true,
  });
}
</script>

<template>
  <!-- `id` は App.vue の Teleport の行き先（開いている間はトースト・再接続の表示をこの中へ出す。decisions D4）。 -->
  <div
    ref="dialogEl"
    class="graph-view"
    :class="{ 'graph-view-screen': kind === 'screen' }"
    :role="kind === 'screen' ? 'region' : undefined"
    aria-label="連携（グラフ）"
    tabindex="-1"
    data-graph-view
    @keydown.capture="onKeydownCapture"
    @focusin="onFocusin"
    @keydown="onKeydown"
  >
    <template v-if="props.active">
      <header class="graph-toolbar" :class="{ 'graph-toolbar-screen': kind === 'screen' }">
        <template v-if="kind === 'screen'">
          <!-- デスクトップの画面（PR1e T17b）: よく使う操作を前に。「＋ pane」「＋ workspace」は PR3 でここへ（左端の置き場所）。題と「×」は出さない（戻るのは、サイドバーの上の切り替え・prefix+a・Esc） -->
          <button type="button" class="graph-tool graph-add-pane" :disabled="!graph.graph || !view.workspaceId" title="選んでいる workspace に pane を足す" @click="openAddFormForSelection">
            ＋ pane
          </button>
          <button
            type="button"
            class="graph-tool graph-add-workspace"
            aria-haspopup="menu"
            :aria-expanded="view.contextMenu?.target.kind === 'graphAdd'"
            @click="openAddWorkspaceMenu"
          >
            ＋ workspace ▾
          </button>
          <button
            type="button"
            class="graph-tool graph-connect"
            :disabled="!graph.graph"
            :title="connectDisabledHint"
            @click="startConnectFromSelection"
          >
            線を結ぶ
          </button>
          <button type="button" class="graph-tool graph-tidy" :disabled="!graph.graph" title="この空間の囲いとノードを詰めて並べ直します（確認します）" @click="requestTidy">
            並びを整える
          </button>
          <button
            type="button"
            class="graph-tool graph-more"
            aria-haspopup="menu"
            :aria-expanded="view.contextMenu?.target.kind === 'graphMore'"
            :disabled="!graph.graph"
            @click="openMoreMenu"
          >
            そのほか ▾
          </button>
          <span v-if="graph.graph?.paused" class="graph-paused-badge" role="status">⏸ 一時停止中</span>
          <button v-if="graph.graph?.paused" type="button" class="graph-tool graph-resume" @click="toggleGraphPaused">再開</button>
          <span
            v-if="graph.hiddenLocalPaneCount > 0"
            class="graph-hidden-panes"
            role="status"
            data-testid="graph-hidden-panes"
          >
            上限のため、出ていない pane が {{ graph.hiddenLocalPaneCount }} 個あります
          </span>
          <span class="graph-toolbar-spacer"></span>
          <GraphFind ref="findRef" :items="findItems" @choose="onFindChoose" @leave="leaveFrameLayer" />
          <button type="button" class="graph-tool graph-zoom-out" aria-label="縮小" title="縮小（-）" @click="zoomBy(1 / 1.2)">−</button>
          <span class="graph-zoom" aria-live="off">{{ zoomPercent }}</span>
          <button type="button" class="graph-tool graph-zoom-in" aria-label="拡大" title="拡大（+）" @click="zoomBy(1.2)">＋</button>
          <button type="button" class="graph-tool graph-fit" title="全体を表示（1）" @click="fitAll">全体を表示</button>
        </template>
        <template v-else>
        <h2 class="graph-title">連携（グラフ）</h2>
        <span v-if="graph.graph?.paused" class="graph-paused-badge">⏸ 全体が一時停止中</span>
        <button
          type="button"
          class="graph-tool graph-pause-all"
          :aria-pressed="graph.graph?.paused === true"
          :disabled="!graph.graph"
          @click="toggleGraphPaused"
        >
          {{ graph.graph?.paused ? "全体を再開" : "全体を一時停止" }}
        </button>
        <button
          v-if="!isMobile"
          type="button"
          class="graph-tool graph-add-panes"
          aria-haspopup="dialog"
          :aria-expanded="checklistOpen"
          :disabled="!graph.graph"
          @click="openChecklist"
        >
          別のマシンの pane を載せる
        </button>
        <span
          v-if="graph.hiddenLocalPaneCount > 0"
          class="graph-hidden-panes"
          role="status"
          data-testid="graph-hidden-panes"
        >
          上限のため、出ていない pane が {{ graph.hiddenLocalPaneCount }} 個あります
        </span>
        <button
          type="button"
          class="graph-tool graph-history"
          :aria-pressed="history !== null"
          @click="toggleHistory"
        >
          履歴
        </button>
        <button type="button" class="graph-tool graph-fit" title="全体表示（1）" @click="fitAll">
          全体表示
        </button>
        <button
          type="button"
          class="graph-tool graph-zoom-out"
          aria-label="縮小"
          title="縮小（-）"
          @click="zoomBy(1 / 1.2)"
        >
          −
        </button>
        <span class="graph-zoom" aria-live="off">{{ zoomPercent }}</span>
        <button
          type="button"
          class="graph-tool graph-zoom-in"
          aria-label="拡大"
          title="拡大（+）"
          @click="zoomBy(1.2)"
        >
          ＋
        </button>
        <button type="button" class="graph-close" aria-label="閉じる" @click="view.closeGraph()">
          ×
        </button>
        </template>
      </header>
      <GraphSpaceBar
        v-if="spaces.showBar"
        :spaces="spaces.spaces"
        :current-id="spaces.currentId"
        @select="onSpaceSelect"
      />
      <div class="graph-body">
        <div ref="canvasEl" class="graph-canvas" :style="gridStyle" @pointerdown="onCanvasPointerdown">
          <div class="graph-world" :style="worldStyle">
            <!-- 世界の層の外（フォームは拡大縮小しない）は、下の GraphAddForm -->
            <GraphFrameLayer
              :frames="spaces.frames"
              :infos="spaces.infoMap"
              :selected-workspace-id="view.workspaceId"
              :flash-id="spaces.flashId"
              :emphasis="spaces.emphasis"
              :blocked-id="nodeDrag?.blockedFrame ?? null"
              :dragging-id="frameDrag?.frameId ?? null"
              :read-only="isMobile"
              @heading-pointerdown="onFrameHeadingPointerdown"
              @leave="leaveFrameLayer"
              @tag="spaces.toggleEmphasis"
              @add="openAddForm"
              @head-contextmenu="onFrameContextmenu"
            />
            <svg class="graph-edges" width="1" height="1" aria-hidden="true">
              <GraphEdge
                v-for="e in edges"
                :key="e.link.id"
                :link="e.link"
                :start="e.start"
                :end="e.end"
                :dir="e.dir"
                :invalid="e.invalid"
                :selected="isLinkSelected(e.link.id)"
                :paused="e.paused"
                :firing="graph.firing.get(e.link.id) ?? null"
                @select="onLinkPointerdown($event, e.link.id, 'edge')"
              />
              <line
                v-if="connectLine"
                class="graph-connecting"
                :x1="connectLine.x1"
                :y1="connectLine.y1"
                :x2="connectLine.x2"
                :y2="connectLine.y2"
              />
            </svg>
            <GraphNode
              v-for="n in shownNodes"
              :key="n.key"
              :info="infos.get(n.key)!"
              :tab-label="tabLabelOf(n.key)"
              :tab-emphasis="tabEmphasisOf(n.key)"
              :blocked="nodeDrag?.key === n.key && nodeDrag.blockedFrame !== null"
              :x="n.x"
              :y="n.y"
              :selected="isNodeSelected(n.key)"
              :class="{ 'graph-node-window': isWindowNode(n.key), 'graph-node-window-pinned': isWindowPinned(n.key) }"
              :tabbable="tabEntryKey === n.key"
              :rekeyable="canRekey(n.key)"
              :read-only="isMobile"
              :connect-source="connectFrom === n.key || connectDrag?.from === n.key"
              :drop-target="
                connectDrag?.hover === n.key || (connectFrom !== null && connectFrom !== n.key)
              "
              :out-count="degree.out.get(n.key) ?? 0"
              :in-count="degree.inn.get(n.key) ?? 0"
              @focus="onNodeFocus(n.key)"
              @keydown="onNodeKeydown($event, n.key)"
              @contextmenu="onNodeContextmenu($event, n.key)"
              @body-pointerdown="onNodePointerdown($event, n.key)"
              @handle-pointerdown="onHandlePointerdown($event, n.key)"
              @goto="gotoNode(n.key)"
              @rekey="openRekey(n.key)"
              @subagents="openSubagents(n.key)"
            />
            <GraphLinkMark
              v-for="m in marks"
              :key="`mark-${m.link.id}`"
              :link-id="m.link.id"
              :other-name="m.otherName"
              :other-space="m.otherSpace"
              :kind-name="LINK_KIND_NAME[m.link.kind]"
              :direction="m.direction"
              :node-key="m.nodeKey"
              :status="m.status"
              :x="m.x"
              :y="m.y"
              :selected="isLinkSelected(m.link.id)"
              :read-only="isMobile"
              @go="goToMark(m)"
              @settings="openMarkSettings(m)"
              @back="focusNode(m.nodeKey)"
            />
            <button
              v-for="more in markMore"
              :key="`more-${more.nodeKey}`"
              type="button"
              class="graph-mark-more"
              tabindex="-1"
              :data-mark-more="more.nodeKey"
              @keydown="onMoreKeydown($event, more.nodeKey)"
              :style="{ left: `${more.x}px`, top: `${more.y}px` }"
              :aria-label="`別の空間との線があと ${more.n} 本。押すと一覧`"
              @pointerdown.stop
              @click="markListKey = markListKey === more.nodeKey ? null : more.nodeKey"
            >
              +{{ more.n }}
            </button>
            <div
              v-if="markList.length > 0"
              class="graph-mark-list"
              role="menu"
              @keydown="onMarkListKeydown"
              :style="{ left: `${markList[0]!.x}px`, top: `${markList[0]!.y + 4 * 20}px` }"
              @pointerdown.stop
            >
              <button
                v-for="m in markList"
                :key="`list-${m.link.id}`"
                type="button"
                role="menuitem"
                class="graph-mark-list-item"
                @click="chooseFromMarkList(m)"
              >
                {{ m.direction === "out" ? "→" : "←" }} {{ m.otherName }}（{{ m.otherSpace }}・{{ LINK_KIND_NAME[m.link.kind] }}{{ m.status ? `・${m.status}` : "" }}）
              </button>
            </div>
            <button
              v-for="e in edges"
              :key="`chip-${e.link.id}`"
              type="button"
              class="graph-chip"
              :class="{
                'graph-chip-selected': isLinkSelected(e.link.id),
                'graph-chip-paused': e.paused,
                'graph-chip-invalid': e.invalid,
                'graph-chip-fired': graph.firing.has(e.link.id),
              }"
              aria-roledescription="線"
              :aria-label="chipAria(e)"
              :data-link-chip="e.link.id"
              :style="{ left: `${e.mid.x}px`, top: `${e.mid.y}px` }"
              @pointerdown="onLinkPointerdown($event, e.link.id, 'chip')"
              @focus="onChipFocus(e.link.id)"
              @keydown="onChipKeydown($event, e.link.id)"
              @click="onChipActivate(e.link.id)"
            >
              {{ chipLabel(e) }}
            </button>
          </div>
          <GraphAddForm
            v-if="addForm && !isMobile"
            :workspace-title="addFormWorkspaceTitle"
            :kinds="addKinds"
            :supervisor-name="addFormSupervisorName"
            :busy-text="addForm.busyText"
            :error="addForm.error"
            :retrying="addForm.createdPaneId !== null"
            :x="addFormPos.x"
            :y="addFormPos.y"
            @submit="submitAddForm"
            @cancel="closeAddForm"
          />
          <GraphMinimap
            v-if="!isMobile"
            :frames="spaces.frames"
            :nodes="spaces.frames.length === 0 ? shownNodes.map((n) => graphNodeRect(n)) : []"
            :view="visibleWorld"
            :selected-id="view.workspaceId"
            :collapsed="minimapCollapsed"
            @center="centerOn"
            @toggle="toggleMinimap"
          />
          <p v-if="graph.graph && graph.nodes.length === 0" class="graph-empty">
            表示する pane がありません。
          </p>
          <p
            v-else-if="graph.graph && shownNodes.length === 0 && spaces.frames.length === 0"
            class="graph-empty"
          >
            この空間には表示する pane がありません。
          </p>
          <p v-else-if="!graph.graph" class="graph-empty">
            {{ graph.loadError ?? "読み込んでいます…" }}
          </p>
          <p v-if="connectFrom" class="graph-connect-banner">
            線の先のノードを選んでください（Tab・矢印で移動、Enter で決定、Esc で取り消し）
          </p>
        </div>
        <div v-if="(panel && graph.graph) || history || subagentsKey" class="graph-side">
          <LinkPanel
            v-if="panel && graph.graph"
            ref="panelRef"
            :key="panelKey"
            :graph="graph.graph"
            :link="panelLink"
            :new-ends="panelNewEnds"
            :gone="panel.mode === 'edit' && panelLink === null"
            :name-of="(k) => graph.nodeInfo(k).name"
            :invalid="panelInvalid"
            :saving="panelSaving"
            :error="panelError"
            @save="onPanelSave"
            @cancel="closePanel"
            @discard-request="onPanelDiscardRequest"
            @delete="panel.mode === 'edit' && requestDeleteLink(panel.id)"
            @pause="(p) => panel?.mode === 'edit' && graph.setPaused(p, panel.id)"
            @history="panel.mode === 'edit' && (history = { linkId: panel.id })"
          />
          <HistoryPanel
            v-if="history"
            :link-id="history.linkId"
            @close="closeHistory"
            @clear-filter="history = { linkId: null }"
          />
          <SubagentPanel
            v-if="subagentsKey"
            :key="subagentsKey"
            :node-key="subagentsKey"
            @close="closeSubagents"
          />
        </div>
      </div>
      <PaneChecklist v-if="checklistOpen" @apply="applyChecklist" @close="closeChecklist" />
      <RekeyPicker v-if="rekeyKey" :node-key="rekeyKey" @pick="applyRekey" @close="closeRekey" />
      <MobileGraphSheet v-if="sheet" :target="sheet" @close="closeSheet" />
      <GraphConfirm
        v-if="confirmState"
        :message="confirmState.message"
        :detail="confirmState.detail"
        :confirm-label="confirmState.confirmLabel"
        :cancel-label="confirmState.cancelLabel ?? '取り消す'"
        @confirm="onConfirmOk"
        @cancel="onConfirmCancel"
      />
      <div class="graph-live" aria-live="polite">{{ liveMessage }}</div>
    </template>
  </div>
</template>

<style scoped>
/* 端末の窓を開いているノードの目印（親のスコープでも子の根に効く）。色は既存のトークンだけ。 */
.graph-node.graph-node-window {
  outline: 2px solid var(--soda-accent, #6070a1);
  outline-offset: 1px;
}
.graph-node.graph-node-window-pinned {
  outline-style: double;
  outline-width: 4px;
}
.graph-view {
  /* 入れ物（`GraphDialog`・`GraphScreen`）いっぱいに広げる。 */
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--soda-bg, #282a36);
  color: var(--soda-fg, #f8f8f2);
  outline: none;
  overflow: hidden;
}
.graph-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 6px var(--soda-shape-pad-x, 12px);
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
}
.graph-title {
  flex: 1;
  margin: 0;
  font-size: 14px;
  font-weight: normal;
}
.graph-tool {
  min-height: var(--soda-shape-control-h, 0);
  padding: 2px 8px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius);
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  font-size: 12px;
  cursor: pointer;
}
.graph-tool[aria-pressed="true"] {
  background: var(--soda-menu-active-bg, #44475a);
}
.graph-hidden-panes {
  font-size: 12px;
  opacity: 0.85;
}
.graph-zoom {
  min-width: 3.5em;
  text-align: center;
  font-size: 12px;
  opacity: 0.8;
}
.graph-close {
  background: none;
  border: none;
  color: inherit;
  font-size: 18px;
  cursor: pointer;
}
.graph-body {
  position: relative;
  flex: 1;
  display: flex;
  min-height: 0;
}
.graph-side {
  flex: none;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.graph-side > * {
  flex: 1 1 0;
  min-height: 0;
}
.graph-canvas {
  position: relative;
  background-image: radial-gradient(circle, color-mix(in srgb, var(--soda-fg, #f8f8f2) 22%, transparent) 1px, transparent 1.4px);
  flex: 1;
  overflow: hidden;
  touch-action: none;
  cursor: default;
}
.graph-world {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  transform-origin: 0 0;
}
.graph-edges {
  position: absolute;
  left: 0;
  top: 0;
  overflow: visible;
  pointer-events: none;
}
.graph-chip {
  position: absolute;
  transform: translate(-50%, -50%);
  padding: 1px 6px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 10px;
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
}
.graph-chip:focus-visible,
.graph-chip-selected {
  outline: 2px solid var(--soda-accent, #6070a1);
  outline-offset: 1px;
}
.graph-mark-more {
  position: absolute;
  height: 18px;
  padding: 0 8px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 9px;
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  font-size: 10px;
  cursor: pointer;
}
.graph-mark-list {
  position: absolute;
  display: flex;
  flex-direction: column;
  min-width: 200px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius, 4px);
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  font-size: 11px;
  z-index: 3;
}
.graph-mark-list-item {
  padding: 4px 8px;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.graph-mark-list-item:hover {
  background: var(--soda-menu-hover-bg, #343746);
}
.graph-chip-paused {
  color: var(--soda-warn-fg, #ffb86c);
}
.graph-chip-invalid {
  opacity: 0.8;
  border-style: dashed;
}
.graph-chip-fired {
  border-color: var(--soda-state-working, #f1fa8c);
  background: var(--soda-subtle-bg, #343746);
}
.graph-paused-badge {
  color: var(--soda-warn-fg, #ffb86c);
  font-size: 12px;
}
.graph-toolbar-screen .graph-paused-badge {
  padding: 1px 8px;
  border: 1px solid var(--soda-warn-fg, #ffb86c);
  border-radius: 10px;
}
.graph-toolbar-spacer {
  flex: 1;
}
.graph-connecting {
  stroke: var(--soda-state-working, #f1fa8c);
  stroke-width: 2px;
  stroke-dasharray: 6 4;
}
.graph-connect-banner {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  padding: 4px 12px;
  border: 1px solid var(--soda-state-working, #f1fa8c);
  border-radius: var(--soda-shape-radius);
  background: var(--soda-menu-bg, #282a36);
  font-size: 12px;
  pointer-events: none;
}
.graph-live {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.graph-empty {
  position: absolute;
  inset: 40% 16px auto;
  margin: 0;
  text-align: center;
  opacity: 0.8;
  pointer-events: none;
}
</style>
