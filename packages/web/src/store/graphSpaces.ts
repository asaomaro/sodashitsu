import type { NodeKey } from "@sodashitsu/protocol";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import {
  clampZoom,
  deriveGraphSpaces,
  displayFrames,
  frameInfos,
  nodePositions,
  spaceOfMemberMap,
  spaceOfNodeMap,
  type DisplayFrame,
  type FrameInfo,
  type GraphSpaceView,
  type GraphViewport,
  type LayoutStructure,
} from "@sodashitsu/client-core";
import { useGraphStore } from "./graph.js";
import { useMachinesStore } from "./machines.js";
import { useSessionStore } from "./session.js";
import { useViewStore } from "./view.js";

/**
 * グラフの空間と囲いの、画面の側の状態（20261008-graph-first の PR1c。T11a）。**保存するのはこのブラウザの `localStorage` だけ**（表示中の空間・空間ごとの拡大縮小と位置）。
 * サーバの状態（グループ・workspace・pane・ノードの位置）から、空間の一覧・囲い・見出しを毎回導く。画面の接続が別のマシンを向いているとき（手元のセッションが無い）は
 * 構成を導けないので、空間も囲いも無い 1 枚の面（全部のノード）にする。
 */

/** 表示中の空間の記憶。 */
const SPACE_KEY = "soda.graphSpace.v1";
/** 空間ごとの表示（拡大縮小と位置）の記憶。 */
const VIEWPORTS_KEY = "soda.graphViewports.v1";
/** PR1c より前の版の、1 つだけの表示の記憶。 */
const LEGACY_VIEWPORT_KEY = "soda.graphView.v1";
/** 空間を替えた・移った先の囲いを強く出す時間。 */
export const GRAPH_FLASH_MS = 1500;
/** 空間ごとの表示を覚えておく数の上限（古い空間の分が溜まり続けないように）。 */
const VIEWPORTS_MAX = 64;

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できなくても動く
  }
}

function parseViewport(v: unknown): GraphViewport | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Partial<GraphViewport>;
  if (typeof o.zoom !== "number" || typeof o.panX !== "number" || typeof o.panY !== "number") return null;
  if (![o.zoom, o.panX, o.panY].every(Number.isFinite)) return null;
  return { zoom: clampZoom(o.zoom), panX: o.panX, panY: o.panY };
}

/** 画面が動かす先の指定（サイドバーの行・印から）。 */
export type GraphRevealTarget =
  | { kind: "workspace"; workspaceId: string }
  | { kind: "node"; key: string }
  | { kind: "space"; spaceId: string };

/** 接続が別のマシンを向いているときの、空間の無い 1 枚の面の id。 */
export const GRAPH_ALL_SPACE = "all";

export const useGraphSpacesStore = defineStore("graphSpaces", () => {
  const graph = useGraphStore();
  const session = useSessionStore();
  const machines = useMachinesStore();
  const view = useViewStore();

  const stored = ref<string | null>(null);
  {
    const s = readJson(SPACE_KEY);
    if (typeof s === "string") stored.value = s;
  }

  /** 構成（手元のセッションから導く。別のマシンを向いている・グラフ未取得なら null）。ドラッグ中の位置は構成に関係しない。 */
  const structure = computed<LayoutStructure | null>(() => {
    const g = graph.graph;
    if (!g) return null;
    return graph.layoutStructure(g.nodes.map((n) => n.key));
  });

  const spaces = computed<GraphSpaceView[]>(() => {
    const st = structure.value;
    if (st === null) return [];
    return deriveGraphSpaces(st, (id) => session.groups.get(id)?.label);
  });
  /** 空間の見出しの並びを出すか（グループが 1 つも無い〔「グループなし」だけ〕なら出さない）。 */
  const showBar = computed(() => spaces.value.length > 1);

  /** ノードの鍵 → 属する空間。どの囲いにも属さないノード（pane の無い無効なノードなど）は「グループなし」の空間（無ければ先頭）に置く——消えて外せなくならないように。 */
  const spaceOfNode = computed(() => {
    const st = structure.value;
    if (st === null) return new Map<string, string>();
    const out = spaceOfNodeMap(st);
    const home = st.spaces.find((s) => s.id === "u")?.id ?? st.spaces[0]?.id;
    if (home !== undefined) for (const n of graph.graph?.nodes ?? []) if (!out.has(n.key)) out.set(n.key, home);
    return out;
  });
  const spaceOfMember = computed(() => (structure.value ? spaceOfMemberMap(structure.value) : new Map<string, string>()));

  /** ノードの鍵 → 属する囲い（メンバー: workspace・別のマシン）の id。 */
  const memberOfNode = computed(() => {
    const out = new Map<string, string>();
    for (const sp of structure.value?.spaces ?? [])
      for (const t of sp.tops) for (const m of t.members) for (const k of m.nodes) out.set(k, m.id);
    return out;
  });
  /** 囲い（メンバー）の id → ノードの鍵。 */
  const memberNodes = computed(() => {
    const out = new Map<string, string[]>();
    for (const sp of structure.value?.spaces ?? [])
      for (const t of sp.tops) for (const m of t.members) out.set(m.id, [...m.nodes]);
    return out;
  });
  /** 構成の指紋（囲いのドラッグの途中で構成が変わったかを見る）。 */
  const structureSig = computed(() =>
    (structure.value?.spaces ?? [])
      .map((sp) => `${sp.id}|${sp.tops.map((t) => `${t.id}:${t.members.map((m) => `${m.id}=${m.nodes.join(",")}`).join(";")}`).join("/")}`)
      .join("\n"),
  );

  /** 選んでいる workspace のある空間（既定の表示中の空間）。 */
  const selectedSpaceId = computed<string | null>(() => {
    const ws = view.workspaceId;
    return ws ? (spaceOfMember.value.get(ws) ?? null) : null;
  });

  /** 表示中の空間の id。記憶した空間があればそれ、無い（消えた）ときは選んでいる workspace のある空間、それも無ければ先頭。構成が無いときは `GRAPH_ALL_SPACE`。 */
  const currentId = computed<string>(() => {
    if (structure.value === null) return GRAPH_ALL_SPACE;
    const ids = spaces.value.map((s) => s.id);
    if (stored.value !== null && ids.includes(stored.value)) return stored.value;
    return selectedSpaceId.value ?? ids[0] ?? GRAPH_ALL_SPACE;
  });
  const current = computed<GraphSpaceView | null>(() => spaces.value.find((s) => s.id === currentId.value) ?? null);

  function setCurrent(id: string): void {
    stored.value = id;
    writeJson(SPACE_KEY, id);
  }

  /** 表示中の空間のノードの鍵。構成が無いときは null（すべて出す）。 */
  const shownKeys = computed<ReadonlySet<string> | null>(() => {
    if (structure.value === null) return null;
    const id = currentId.value;
    const out = new Set<string>();
    for (const [key, sp] of spaceOfNode.value) if (sp === id) out.add(key);
    return out;
  });
  function isShown(key: string): boolean {
    const s = shownKeys.value;
    return s === null || s.has(key);
  }

  const infoMap = computed<Map<string, FrameInfo>>(() => {
    const st = structure.value;
    if (st === null) return new Map();
    const label = (machineId: string): string =>
      machines.machines.find((m) => m.id === machineId)?.label ?? "別のマシン";
    return frameInfos(
      st,
      { workspaces: [...session.workspaces.values()], tabs: [...session.tabs.values()] },
      label,
    );
  });

  /** 表示中の空間の囲い（ドラッグ中の位置を含むノードの位置から導く）。 */
  const frames = computed<DisplayFrame[]>(() => {
    const st = structure.value;
    if (st === null || current.value === null) return [];
    return displayFrames(st, nodePositions(graph.nodes), current.value.id);
  });

  // --- tab の強調（ブラウザの中だけ）---------------------------------------------------
  const emphasis = ref<{ workspaceId: string; tabId: string } | null>(null);
  function toggleEmphasis(workspaceId: string, tabId: string): void {
    const e = emphasis.value;
    emphasis.value = e !== null && e.workspaceId === workspaceId && e.tabId === tabId ? null : { workspaceId, tabId };
  }

  // --- 移った先の囲いを強く出す --------------------------------------------------------
  const flashId = ref<string | null>(null);
  let flashTimer: ReturnType<typeof setTimeout> | null = null;
  function flash(frameId: string): void {
    flashId.value = frameId;
    if (flashTimer !== null) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      flashTimer = null;
      flashId.value = null;
    }, GRAPH_FLASH_MS);
  }

  // --- 囲いごと動いたことを知らせる ---------------------------------------------------
  // 置き場所の計算が、pane を足した workspace を囲いごと動かすことがある（空きが無いとき）。ノードの位置がまとめて変わったこと（その囲いのもともとあった
  // ノードが、全部同じ量だけ動いた）から導いて、その囲いを短く強調する。自分の操作（ドラッグ・矢印キーの移動）の結果は知らせない。
  watch(
    () => graph.graph?.nodes,
    (next, prev) => {
      if (!next || !prev) return;
      if (graph.dragPositions.size > 0 || graph.pendingPositions.size > 0) return;
      const before = new Map(prev.map((n) => [n.key, n]));
      const after = new Map(next.map((n) => [n.key, n]));
      for (const [memberId, keys] of memberNodes.value) {
        const old = keys.filter((k) => before.has(k as NodeKey) && after.has(k as NodeKey));
        if (old.length === 0) continue;
        // pane（ノード）が増えた囲いだけ。増えていない移動（他の人の囲いのドラッグ・1 ノードだけの workspace の移動）は、置き場所の計算による移動ではない
        if (!keys.some((k) => after.has(k as NodeKey) && !before.has(k as NodeKey))) continue;
        const d = (k: string) => ({ x: after.get(k as NodeKey)!.x - before.get(k as NodeKey)!.x, y: after.get(k as NodeKey)!.y - before.get(k as NodeKey)!.y });
        const first = d(old[0]!);
        if (first.x === 0 && first.y === 0) continue;
        if (old.every((k) => d(k).x === first.x && d(k).y === first.y)) {
          flash(memberId);
          return;
        }
      }
    },
  );

  // --- サイドバー・印からの動かす先の依頼 ----------------------------------------------
  const revealSeq = ref(0);
  const revealTarget = ref<GraphRevealTarget | null>(null);
  function requestReveal(target: GraphRevealTarget): void {
    revealTarget.value = target;
    revealSeq.value++;
  }

  // --- 空間ごとの表示 ------------------------------------------------------------------
  function loadViewport(spaceId: string): GraphViewport | null {
    const m = readJson(VIEWPORTS_KEY);
    if (typeof m === "object" && m !== null && Object.keys(m).length > 0) {
      return parseViewport((m as Record<string, unknown>)[spaceId]);
    }
    // 空間ごとの記憶がまだ 1 つも無い（PR1c より前の版から更新した）ときだけ、前の版の 1 つの表示を、最初に開く空間に使う。
    return parseViewport(readJson(LEGACY_VIEWPORT_KEY));
  }
  function saveViewport(spaceId: string, vp: GraphViewport): void {
    const m = readJson(VIEWPORTS_KEY);
    const map: Record<string, unknown> = typeof m === "object" && m !== null ? { ...(m as Record<string, unknown>) } : {};
    delete map[spaceId]; // 挿入順を新しい順に保つ
    map[spaceId] = vp;
    const keys = Object.keys(map);
    for (const k of keys.slice(0, Math.max(0, keys.length - VIEWPORTS_MAX))) delete map[k];
    writeJson(VIEWPORTS_KEY, map);
  }

  return {
    structure,
    spaces,
    showBar,
    spaceOfNode,
    spaceOfMember,
    memberOfNode,
    memberNodes,
    structureSig,
    selectedSpaceId,
    currentId,
    current,
    setCurrent,
    shownKeys,
    isShown,
    infoMap,
    frames,
    emphasis,
    toggleEmphasis,
    flashId,
    flash,
    revealSeq,
    revealTarget,
    requestReveal,
    loadViewport,
    saveViewport,
  };
});
