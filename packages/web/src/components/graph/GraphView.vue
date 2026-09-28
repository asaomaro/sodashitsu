<script setup lang="ts">
/**
 * 連携のグラフ画面（20260927-agent-graph の design D-6・「web」・「振る舞いの詳細」）。`view.graphOpen` の間だけ全画面に重ねる（下の pane は mount されたまま。
 * research-web §1.2）。ネイティブの `<dialog>` を `showModal()` で開く——背面が inert になり、Tab・ポインタ・ホイールが背面の端末へ届かない（AC-I5）。
 *
 * 描画は DOM のノード＋背面の SVG 1 枚（外部ライブラリなし。D-6）。表示の変換（パン・ズーム）は世界の層 1 つの `transform` だけ。
 * 座標・線の経路・当たり判定は client-core/graph の純関数（geometry）。サーバとのやりとりは `store/graph`。
 */
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { GraphLink, GraphOp, NodeKey } from "@sodashitsu/protocol";
import {
  clampZoom,
  edgeGeometry,
  fitGraphView,
  GRAPH_GRID,
  GRAPH_NODE_HEIGHT,
  GRAPH_NODE_WIDTH,
  graphNodeAt,
  graphNodeRect,
  nextFreeGraphPosition,
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
import { ConnectionKey, MachineSwitcherKey, TerminalRegistryKey } from "../../injection.js";
import { isMobileViewport } from "../../mobile/detect.js";
import { useGraphStore, type GraphNodeInfo } from "../../store/graph.js";
import { useMachinesStore } from "../../store/machines.js";
import { useSettingsStore } from "../../store/settings.js";
import { useViewStore } from "../../store/view.js";
import GraphConfirm from "./GraphConfirm.vue";
import GraphEdge from "./GraphEdge.vue";
import GraphNode from "./GraphNode.vue";
import HistoryPanel from "./HistoryPanel.vue";
import MobileGraphSheet from "./MobileGraphSheet.vue";
import PaneChecklist from "./PaneChecklist.vue";
import LinkPanel from "./LinkPanel.vue";
import { usePointerDrag } from "./usePointerDrag.js";
import {
  LINK_KIND_NAME,
  linkChipText,
  linkDescription,
  linkDraftOf,
  type LinkPanelSave,
} from "./linkText.js";

const view = useViewStore();
const graph = useGraphStore();
const machines = useMachinesStore();
const settings = useSettingsStore();
const registry = inject(TerminalRegistryKey, null);
const conn = inject(ConnectionKey, null);
const switcher = inject(MachineSwitcherKey, null);
const isMobile = isMobileViewport();
const dialogEl = ref<HTMLDialogElement | null>(null);
const canvasEl = ref<HTMLElement | null>(null);

// --- 表示（パン・ズーム）。このブラウザだけのもの（サーバへは保存しない。research-ui §2.4）-------------------------------

const VIEWPORT_KEY = "soda.graphView.v1";
function loadViewport(): GraphViewport | null {
  try {
    const raw = localStorage.getItem(VIEWPORT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<GraphViewport>;
    if (typeof v.zoom !== "number" || typeof v.panX !== "number" || typeof v.panY !== "number")
      return null;
    if (![v.zoom, v.panX, v.panY].every(Number.isFinite)) return null;
    return { zoom: clampZoom(v.zoom), panX: v.panX, panY: v.panY };
  } catch {
    return null;
  }
}
const savedViewport = loadViewport();
const viewport = ref<GraphViewport>(savedViewport ?? { zoom: 1, panX: 0, panY: 0 });
/** 保存した表示が無ければ、最初に中身を描いたときに全体表示にする。 */
let needsFit = savedViewport === null;
watch(viewport, (v) => {
  try {
    localStorage.setItem(VIEWPORT_KEY, JSON.stringify(v));
  } catch {
    // 保存できなくても動く
  }
});

function canvasSize(): { w: number; h: number } {
  const el = canvasEl.value;
  const w = el?.clientWidth ?? 0;
  const h = el?.clientHeight ?? 0;
  // レイアウトの無い環境（試験）・開いた直後の 0 は、ありがちな大きさで代える。
  return { w: w > 0 ? w : 800, h: h > 0 ? h : 600 };
}
function fitAll(): void {
  viewport.value = fitGraphView([...rects.value.values()], canvasSize());
}
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
const worldStyle = computed(() => ({
  transform: `translate(${viewport.value.panX}px, ${viewport.value.panY}px) scale(${viewport.value.zoom})`,
}));

// --- 描くもの ------------------------------------------------------------------------------------------------

/** Tab の順＝読み順（上から、同じ高さなら左から）。配置の変更に追従する（research-ui §2.12）。 */
const orderedNodes = computed(() => [...graph.nodes].sort((a, b) => a.y - b.y || a.x - b.x));
const rects = computed(
  () => new Map<string, GraphRect>(graph.nodes.map((n) => [n.key, graphNodeRect(n)])),
);
const infos = computed(
  () => new Map<string, GraphNodeInfo>(graph.nodes.map((n) => [n.key, graph.nodeInfo(n.key)])),
);
const nodeInvalid = (key: string): boolean => {
  const i = infos.value.get(key);
  return !i || i.exists === false || i.stale;
};

interface EdgeView {
  link: GraphLink;
  start: { x: number; y: number };
  end: { x: number; y: number };
  mid: { x: number; y: number };
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
  selection.value = { kind: "node", key };
  reveal(rects.value.get(key));
  void nextTick(() => nodeEl(key)?.focus());
}
function focusLink(id: string): void {
  selection.value = { kind: "link", id };
  const e = edges.value.find((x) => x.link.id === id);
  if (e) reveal({ x: e.mid.x - 40, y: e.mid.y - 12, w: 80, h: 24 });
  void nextTick(() => chipEl(id)?.focus());
}
/** フォーカスしたものが画面の外なら入れる（research-ui §2.12）。 */
function reveal(rect: GraphRect | undefined): void {
  if (rect) viewport.value = revealGraphRect(viewport.value, rect, canvasSize());
}
function onNodeFocus(key: string): void {
  selection.value = { kind: "node", key };
  reveal(rects.value.get(key));
}
function onChipFocus(id: string): void {
  selection.value = { kind: "link", id };
}

// --- ドラッグ（ノードの移動・背景のパン）-------------------------------------------------------------------------

const drag = usePointerDrag();

function onNodePointerdown(ev: PointerEvent, key: string): void {
  if (isMobile.value || ev.button !== 0) return; // モバイルは閲覧だけ（背景のパンへ流す）
  ev.stopPropagation();
  if (confirmState.value) return;
  if (checklistOpen.value) {
    closeChecklist();
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
  target.focus();
  drag.start(ev, target, {
    threshold: 4,
    onMove: (e, dx, dy) => graph.setDragPosition(key, posOf(e, dx, dy)),
    onEnd: (e, dx, dy) => {
      const p = posOf(e, dx, dy);
      if (p.x === x0 && p.y === y0) graph.setDragPosition(key, null);
      else void graph.moveNodes([{ key, ...p }]);
    },
    onCancel: () => graph.setDragPosition(key, null),
  });
}

function onCanvasPointerdown(ev: PointerEvent): void {
  if (ev.button !== 0 && ev.pointerType === "mouse") return;
  if (confirmState.value) return;
  if (checklistOpen.value) {
    closeChecklist();
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
  // 2 本目の指: パンをやめてピンチ（モバイルの閲覧。design「モバイル」）。
  touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (touches.size === 2) {
    drag.cancel();
    startPinch();
    return;
  }
  if (touches.size > 2) return;
  const target = ev.currentTarget as HTMLElement;
  const start = viewport.value;
  drag.start(ev, target, {
    threshold: 3,
    onMove: (_e, dx, dy) => {
      viewport.value = { zoom: start.zoom, panX: start.panX + dx, panY: start.panY + dy };
    },
    onClick: (e) => {
      // モバイルはノードを押すとシート（編集はしない）。
      const hit = (e.target as Element | null)?.closest?.("[data-node-key]");
      if (isMobile.value && hit) {
        sheet.value = { kind: "node", key: hit.getAttribute("data-node-key")! };
        return;
      }
      // 何も無い所を押した＝選択の解除（research-ui §2.6）。
      selection.value = null;
    },
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

function onEdgeSelect(ev: PointerEvent, id: string): void {
  ev.stopPropagation();
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
    graph.nodes
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
const panelSaving = ref(false);
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

function openNewLink(from: NodeKey, to: NodeKey): void {
  connectFrom.value = null;
  liveMessage.value = "";
  selection.value = null;
  panel.value = { mode: "new", from, to };
  panelError.value = null;
  panelKey.value++;
}
function openLinkPanel(id: string): void {
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
  panelSaving.value = true;
  panelError.value = null;
  const before = new Set(graph.links.map((l) => l.id));
  const id = p.id;
  const result =
    id !== undefined
      ? await graph.update((g): GraphOp[] | null =>
          g.links.some((l) => l.id === id) ? [{ op: "update_link", id, ...configOps(p) }] : null,
        )
      : await graph.update((g): GraphOp[] | null =>
          // 送り直しのときは最新のグラフでもう一度確かめる（ノードが外された・同じ線ができた）。
          validateLink(g, linkDraftOf(p)).length > 0
            ? null
            : [{ op: "add_link", kind: p.kind, from: p.from, to: p.to, ...configOps(p) }],
        );
  panelSaving.value = false;
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
  return dialogEl.value?.querySelector<HTMLElement>(`.${cls}`) ?? null;
}
function openChecklist(): void {
  if (panel.value) {
    panelRef.value?.requestClose();
    return;
  }
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
  checklistOpen.value = false;
  const run = (): void => {
    void graph
      .update((g): GraphOp[] | null => {
        const present = new Set(g.nodes.map((n) => n.key));
        const add = change.add.filter((k) => !present.has(k));
        const kept = g.nodes.filter((n) => !change.remove.includes(n.key)).map(graphNodeRect);
        return [
          ...removeOps(g, change.remove),
          ...add.map((key, i) => ({
            op: "add_node" as const,
            key,
            ...nextFreeGraphPosition(kept, i),
          })),
        ];
      })
      .then((r) => {
        if (!r.ok) {
          if (r.reason === "error") view.toast(`グラフを変えられませんでした（${r.message}）`);
          return;
        }
        const added = change.add.find((k) => r.graph.nodes.some((n) => n.key === k));
        if (added) focusNode(added);
        else toolbarButton("graph-add-panes")?.focus();
      });
  };
  if (change.remove.length > 0)
    confirmRemove(change.remove, run, () => toolbarButton("graph-add-panes")?.focus());
  else run();
}

function requestRemoveNode(key: string): void {
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

// --- 履歴 --------------------------------------------------------------------------------------------------------

/** 開いている履歴（`linkId` が null ならすべての線）。 */
const history = ref<{ linkId: string | null } | null>(null);
function toggleHistory(): void {
  history.value = history.value ? null : { linkId: null };
}
function closeHistory(): void {
  history.value = null;
  void nextTick(() => toolbarButton("graph-history")?.focus());
}

// --- ノードから pane へ（AC2・AC-I4）----------------------------------------------------------------------------------

/** グラフ画面を閉じて、そのマシンのその pane へ移る（閉じた後の焦点はその pane。画面を閉じたときの戻り先を上書きする）。 */
function gotoNode(key: string): void {
  const info = graph.nodeInfo(key as NodeKey);
  const loc = info.location;
  if (!loc || info.exists === false) {
    view.toast(`${info.name} の pane が見つかりません。`);
    return;
  }
  view.closeGraph();
  if (info.machine === machines.selectedId) {
    view.setView(loc.workspaceId, loc.tabId);
    view.focusPane(info.paneId);
    void conn?.request("pane.focus", { paneId: info.paneId }).catch(() => undefined);
    return;
  }
  // 別のマシン（別のマシンを見ている間の手元を含む）はそのマシンへ切り替えて、その pane のある tab を開く。
  void switcher?.switchTo(info.machine, loc);
}

function onChipClick(id: string): void {
  if (connectFrom.value) return;
  if (isMobile.value) {
    selection.value = { kind: "link", id };
    sheet.value = { kind: "link", id };
    return;
  }
  openLinkPanel(id);
}

// --- 矢印キーでノードを動かす（1 グリッド、Shift で 5。連打が止まって 300ms 後に送る。research-ui §2.3）---------------

const ARROW_SEND_DELAY_MS = 300;
const arrowTimers = new Map<string, ReturnType<typeof setTimeout>>();
function nudgeNode(key: string, dx: number, dy: number): void {
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

function onChipKeydown(ev: KeyboardEvent, id: string): void {
  if (ev.isComposing || ev.ctrlKey || ev.metaKey || ev.altKey) return;
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
  if ((ev.key === "c" || ev.key === "C") && !isMobile.value) {
    ev.preventDefault();
    ev.stopPropagation();
    startConnectMode(key);
  } else if (ev.key === "Enter") {
    ev.preventDefault();
    ev.stopPropagation();
    gotoNode(key);
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
  const pre = view.preGraphFocusPaneId;
  const key = pre ? `${machines.selectedId}:${pre}` : null;
  if (key && graph.nodes.some((n) => n.key === key)) {
    focusNode(key);
    return;
  }
  const first = orderedNodes.value[0];
  if (first) focusNode(first.key);
  else dialogEl.value?.focus();
}

watch(
  () => view.graphOpen,
  (open) => {
    void nextTick(() => {
      const el = dialogEl.value;
      if (open) {
        if (el && !el.open) el.showModal();
        selection.value = null;
        if (!graph.graph) {
          focusOnLoad = true;
          el?.focus();
          void graph.load();
        } else {
          if (needsFit && graph.nodes.length > 0) {
            fitAll();
            needsFit = false;
          }
          focusInitial();
        }
        return;
      }
      drag.cancel();
      flushArrowMoves();
      sheet.value = null;
      touches.clear();
      pinch = null;
      connectFrom.value = null;
      connectDrag.value = null;
      panel.value = null;
      confirmState.value = null;
      checklistOpen.value = false;
      history.value = null;
      liveMessage.value = "";
      if (el?.open) el.close();
      // `closeGraph` は焦点の pane を同じ値に戻すだけで、`TerminalPane` の watch が動かない——端末へ明示的に戻す（`CommandPopup` と同じ）。
      const back = view.focusedPaneId;
      if (back && !view.modalOpen) registry?.focus(back);
    });
  },
  // 開いたまま本体が作り直された（ログインし直し・切り離しからの復帰）ときも開き直す——`graphOpen` とキーの dialog モードが残ったまま
  // 画面が見えない状態にしない。
  { immediate: true },
);
watch(
  () => graph.graph,
  (g) => {
    if (!g || !view.graphOpen) return;
    if (needsFit && g.nodes.length > 0) {
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
    if (isClose(km.prefixMap.get(chord))) view.closeGraph();
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

/** ブラウザの Esc（`cancel`）。既定の閉じ方は止めて、段階の Esc と同じに扱う（HelpDialog と同じ）。 */
function onCancel(ev: Event): void {
  ev.preventDefault();
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
  <dialog
    id="soda-graph-dialog"
    ref="dialogEl"
    class="graph-view"
    aria-label="連携（グラフ）"
    tabindex="-1"
    @keydown.capture="onKeydownCapture"
    @keydown="onKeydown"
    @cancel="onCancel"
  >
    <template v-if="view.graphOpen">
      <header class="graph-toolbar">
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
          pane を載せる
        </button>
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
      </header>
      <div class="graph-body">
        <div ref="canvasEl" class="graph-canvas" @pointerdown="onCanvasPointerdown">
          <div class="graph-world" :style="worldStyle">
            <svg class="graph-edges" width="1" height="1" aria-hidden="true">
              <GraphEdge
                v-for="e in edges"
                :key="e.link.id"
                :link="e.link"
                :start="e.start"
                :end="e.end"
                :invalid="e.invalid"
                :selected="isLinkSelected(e.link.id)"
                :paused="e.paused"
                :firing="graph.firing.get(e.link.id) ?? null"
                @select="onEdgeSelect($event, e.link.id)"
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
              v-for="n in orderedNodes"
              :key="n.key"
              :info="infos.get(n.key)!"
              :x="n.x"
              :y="n.y"
              :selected="isNodeSelected(n.key)"
              :read-only="isMobile"
              :connect-source="connectFrom === n.key || connectDrag?.from === n.key"
              :drop-target="
                connectDrag?.hover === n.key || (connectFrom !== null && connectFrom !== n.key)
              "
              :out-count="degree.out.get(n.key) ?? 0"
              :in-count="degree.inn.get(n.key) ?? 0"
              @focus="onNodeFocus(n.key)"
              @keydown="onNodeKeydown($event, n.key)"
              @body-pointerdown="onNodePointerdown($event, n.key)"
              @handle-pointerdown="onHandlePointerdown($event, n.key)"
              @goto="gotoNode(n.key)"
            />
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
              @pointerdown.stop
              @focus="onChipFocus(e.link.id)"
              @keydown="onChipKeydown($event, e.link.id)"
              @click="onChipClick(e.link.id)"
            >
              {{ chipLabel(e) }}
            </button>
          </div>
          <p v-if="graph.graph && graph.nodes.length === 0" class="graph-empty">
            まだ pane を載せていません。ツールバーの「pane を載せる」から選んでください。
          </p>
          <p v-else-if="!graph.graph" class="graph-empty">
            {{ graph.loadError ?? "読み込んでいます…" }}
          </p>
          <p v-if="connectFrom" class="graph-connect-banner">
            線の先のノードを選んでください（Tab・矢印で移動、Enter で決定、Esc で取り消し）
          </p>
        </div>
        <div v-if="(panel && graph.graph) || history" class="graph-side">
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
        </div>
      </div>
      <PaneChecklist v-if="checklistOpen" @apply="applyChecklist" @close="closeChecklist" />
      <MobileGraphSheet v-if="sheet" :target="sheet" @close="closeSheet" />
      <GraphConfirm
        v-if="confirmState"
        :message="confirmState.message"
        :detail="confirmState.detail"
        :confirm-label="confirmState.confirmLabel"
        @confirm="onConfirmOk"
        @cancel="onConfirmCancel"
      />
      <div class="graph-live" aria-live="polite">{{ liveMessage }}</div>
    </template>
  </dialog>
</template>

<style scoped>
.graph-view {
  /* 全画面（`<dialog>` の既定の大きさ・余白・枠を外す）。`100vh` でなく `100%`（iOS Safari。SettingsDialog と同じ）。 */
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 0;
  border: none;
  flex-direction: column;
  background: var(--soda-bg, #282a36);
  color: var(--soda-fg, #f8f8f2);
  outline: none;
  overflow: hidden;
}
.graph-view[open] {
  display: flex;
}
.graph-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
}
.graph-title {
  flex: 1;
  margin: 0;
  font-size: 14px;
  font-weight: normal;
}
.graph-tool {
  padding: 2px 8px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 4px;
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  font-size: 12px;
  cursor: pointer;
}
.graph-tool[aria-pressed="true"] {
  background: var(--soda-menu-active-bg, #44475a);
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
  border-radius: 4px;
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
