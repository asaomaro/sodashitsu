<script setup lang="ts">
import type { LayoutNode } from "@sodashitsu/protocol";
import { computed, inject, nextTick, onBeforeUnmount, onMounted, onUpdated, reactive } from "vue";
import { ViewSyncKey } from "../injection.js";
import { childNeighbors, NO_NEIGHBORS, type PaneSides } from "../layout/paneChrome.js";
import { createTrailingThrottle, RESIZE_COMMIT_INTERVAL_MS } from "../term/resizeThrottle.js";
import type { MeasuredSize } from "../term/ViewSync.js";
import PaneFrame from "./PaneFrame.vue";
import Splitter from "./Splitter.vue";

/**
 * レイアウト木の再帰描画（architecture「4. tab の切替」）。zoom 中は 1 つの pane だけを描く。
 * 実際の pane の中身（xterm.js）は `#pane` スロットへ委ねる（`TerminalPane`。T20。まだ無いのでスロットで
 * 疎結合にした。実装時の判断）。`registerLeaf` を省略した使い方（root）だけが `ViewSync.commit` を呼ぶ。
 *
 * **単一 pane の leaf 要素には `:key="singlePaneId"` を付ける**（04-mobile T8 で発見・修正）。
 * `MobileShell.vue` はこのコンポーネントを `{type:'pane', paneId}` という**変化しうる**単一ノードの
 * レイアウト木で再利用する（表示する pane の切り替えのたびに `paneId` が変わる）。key が無いと、
 * `paneId` prop が変わっても Vue は同じ `TerminalPane` インスタンスを使い回すだけで
 * `onMounted`/`onBeforeUnmount`（＝`TerminalRegistry.acquire`/`release`）が再度発火せず、
 * 古い pane を握ったまま新しい pane を取得し損ねる（`ownLeaves` に両方の paneId が残り続け、
 * `ViewSync.commit` が実際には表示していない pane まで「表示中」として申告してしまう）。
 * デスクトップ側（各 leaf の `paneId` は木の構造上ずっと同じ）には影響しない——key の値が変わらないので
 * 余分な再マウントは起きない。
 *
 * **葉の登録を外すときは、その葉を描いたときの paneId と要素で外す**（D105。親の統合 test ラウンド5 で発見）。
 * 以前は `:ref="(el) => setLeafEl(singlePaneId!, el)"` で、表示する pane が変わって Vue が古い葉の ref を
 * `null` で呼ぶとき、その関数は**その時点の** `singlePaneId`（もう新しい pane）を読んでいた。古い pane の登録が
 * `ownLeaves` に残り、切り離された要素の大きさ 0 から `cols:1, rows:1` が `client.view` に載り続け、サイズ権限を
 * 持つモバイルでは隠れた pane の PTY をサーバが 1×1 に縮めていた（上の key の修正（04-mobile T8・D86）では
 * 直っていなかった）。モバイルの切り替え・zoom の切り替え・デスクトップの tab／workspace の切り替え・分割の中の
 * 子（`registerLeaf` で root へ委ねる子の PaneLayout も同じ葉のテンプレートを使う）のどれでも起きた。
 *
 * **接続が替わったら今の表示で commit し直す**（D107）。root は mount 時に `ViewSync.attachCommitter` へ commit の関数を
 * 付け、新しい接続の `client.hello` が通ると `ViewSync.onConnectionOpened` がそれを呼ぶ。hello の snapshot で描き直した後の
 * 葉を測るため、呼ばれたら `nextTick` まで待ってから commit する。
 *
 * **表示領域の大きさの変化に追従する**（`followResize`。D107。統合 review ラウンド1 で発見）。以前は mount と自身の描き直しの
 * ときしか commit せず（`commitView` は expose していたが誰も呼んでいなかった）、窓の大きさ・サイドバーの幅や折りたたみを
 * 変えても `client.view` を送り直さず、PTY は古い大きさのままだった。root が登録された葉の要素を `ResizeObserver` で見て、
 * 変化があれば `RESIZE_COMMIT_INTERVAL_MS` に 1 回まで（最後の変化の分は必ず。`term/resizeThrottle.ts`。モバイルの
 * `usePaneArea` と共有。D108）commit し直す——窓の端をドラッグしている間、
 * フレームごとに PTY の大きさを変えて SIGWINCH を送り続けない。同じ cols/rows なら `ViewSync` が送らない。
 * デスクトップの本体（`App.vue`）だけが付ける。**モバイル（`MobileShell`）には付けない**：葉を縮小の枠（`naturalSize` ×
 * `scale`。`naturalSize` はサーバの PTY の大きさ × セルの寸法）の中に置くので、葉の大きさは PTY の大きさで決まる。葉を
 * 見て commit すると、fit 中（サイズ権限あり）は「PTY の大きさ → 葉の大きさ → 測った cols/rows → PTY の大きさ」の循環に
 * なり、寸法の端数の切り捨てで縮みうる（iPhone 13 のエミュレーションで付けて実測：fit の後に 53 → 51 列まで縮んで止まった。
 * D107）。モバイルの測り方（縮小の枠ではなく表示領域の大きさを測る）と、その変化への追従は 04-mobile で直した（D108）：
 * `MobileShell` は `measureSinglePane` で表示領域の大きさを渡し、表示領域の変化は自分で見て `commitView` を呼ぶ（`mobile/usePaneArea.ts`）。
 *
 * **pane の枠は葉の外側に置く**（`paneFrames`。D110）。葉を `PaneFrame` で包み、枠（右クリックで常にその pane のメニューを
 * 開く縁。design M7）は葉の外に描く——葉は今までどおり端末を置く要素のままなので、`ViewSync` が葉で測る cols/rows に枠の太さは
 * 入らない（枠を `TerminalPane` の中に置くと、測った大きさより端末の置き場が狭くなり、右端・下端の文字が切れる）。`:key` は
 * 外側の `PaneFrame` に付ける（表示する pane が替わったら枠ごと葉を作り直す。上の D86 と同じ）。葉の ref は D105 のまま。
 *
 * **枠の描き分けに要る構造を `PaneFrame` へ渡す**（20260926-pane-frame-auto-mode。`layout/paneChrome.ts`）。tab が分割されて
 * いるか（`multiPane`。root が自分の `layout` から求めて子へ引き継ぐ）と、どの辺に隣の pane があるか（`neighbors`。分割の
 * 向きと a/b から子ごとに足す）。zoom 中は画面に隣が出ないので辺はすべて外周とする。設定（ストア）は `PaneFrame` が読む——
 * ここで読むと Pinia の無い呼び出しが壊れる（decisions D3）。
 */
const props = defineProps<{
  workspaceId: string;
  tabId: string;
  layout: LayoutNode;
  zoomedPaneId?: string | null;
  /**
   * 葉の登録（`attached`＝true）と解除（false）。子の PaneLayout は root のこれを受け取って委ねる。解除は、
   * 今その paneId に登録されている要素が `el` のときだけ効く（D105。入れ替え等で同じ paneId の新しい葉が
   * 別の子に先に付いた後に、古い葉の解除が届いても消さない）。
   */
  registerLeaf?: (paneId: string, el: HTMLElement, attached: boolean) => void;
  /** 表示領域の大きさの変化に `client.view` を追従させる（root のときだけ効く。デスクトップの本体が付ける。D107）。 */
  followResize?: boolean;
  /**
   * **表示が 1 つの pane だけのとき**、葉の要素の代わりにその枠の大きさを測る関数（root のときだけ効く。`ViewSync.commit` の
   * `measureSinglePane` へそのまま渡す。D108）。モバイルの `MobileShell`（単一 pane の木しか描かない）が、縮小の枠の中の葉では
   * なく表示領域の大きさを申告するために付ける。pane ごとの測り方の口ではない——2 つ以上の pane を表示する commit では
   * `ViewSync` が使わずに葉を測る（開発時は警告する）。省略したら葉を測る。
   */
  measureSinglePane?: (paneId: string, element: HTMLElement) => MeasuredSize;
  /**
   * pane ごとに枠（`PaneFrame`）を描く（D110。デスクトップの本体が付ける。子の PaneLayout へもそのまま渡す）。
   * モバイルの `MobileShell` は付けない（葉を PTY の大きさの縮小の枠に置くので、縁を足すと端末がはみ出る）。
   */
  paneFrames?: boolean;
  /** tab が分割されているか（子だけが受ける。root は自分の `layout` から求める）。 */
  multiPane?: boolean;
  /** この部分木の外側のどの辺に隣の pane があるか（子だけが受ける。root は隣なし）。 */
  neighbors?: PaneSides;
}>();

defineSlots<{ pane(props: { paneId: string }): unknown }>();

const isRoot = props.registerLeaf === undefined;
const ownLeaves = isRoot ? reactive(new Map<string, HTMLElement>()) : null;
const viewSync = isRoot ? inject(ViewSyncKey) : undefined;
/** mount してから unmount するまで（外れた後に `nextTick`・タイマーから commit しない）。 */
let mounted = false;
let detachCommitter: (() => void) | null = null;

// 葉の大きさの変化の見張り（`followResize` の root だけ。D107）。葉の登録は mount より前に来るので、setup の時点で作る。
// 変化は `RESIZE_COMMIT_INTERVAL_MS` に 1 回までにまとめて commit する（`term/resizeThrottle.ts`。D108 でモバイルと共有した）。
const resizeCommit = createTrailingThrottle(() => commitView(), RESIZE_COMMIT_INTERVAL_MS);
const resizeObserver = isRoot && props.followResize && typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resizeCommit.schedule()) : null;
/** 見ている葉の要素（同じ要素の登録は描き直しのたびに届く——`observe` し直すと通知が出直すので 1 回だけにする）。 */
const observedLeaves = new Set<HTMLElement>();

function observeLeaf(el: HTMLElement, attached: boolean): void {
  if (!resizeObserver) return;
  if (attached) {
    if (observedLeaves.has(el)) return;
    observedLeaves.add(el);
    resizeObserver.observe(el);
  } else if (observedLeaves.delete(el)) {
    resizeObserver.unobserve(el);
  }
}

/** zoom 中はそれ、そうでなければ `layout` が pane 単体のときのその id（分割ノードなら null）。 */
const singlePaneId = computed<string | null>(() => props.zoomedPaneId ?? (props.layout.type === "pane" ? props.layout.paneId : null));
const splitLayout = computed(() => (props.layout.type === "split" ? props.layout : null));
const multiPane = computed(() => (isRoot ? props.layout.type === "split" : !!props.multiPane));
/** zoom（`zoomedPaneId`）は root だけが受け、root は隣なし——zoom 中の pane の辺はすべて外周になる。 */
const ownNeighbors = computed(() => props.neighbors ?? NO_NEIGHBORS);
// computed で持つ（テンプレートで直接呼ぶと描き直しのたびに新しいオブジェクトになり、子を無駄に描き直す）。
const neighborsA = computed(() => (splitLayout.value ? childNeighbors(ownNeighbors.value, splitLayout.value.dir, "a") : NO_NEIGHBORS));
const neighborsB = computed(() => (splitLayout.value ? childNeighbors(ownNeighbors.value, splitLayout.value.dir, "b") : NO_NEIGHBORS));

function registerLeaf(paneId: string, el: HTMLElement, attached: boolean): void {
  if (props.registerLeaf) {
    props.registerLeaf(paneId, el, attached);
    return;
  }
  if (!ownLeaves) return;
  // 見張りは要素ごと（外れる要素は、同じ paneId の新しい葉が先に付いていても見張りをやめる）。
  observeLeaf(el, attached);
  if (attached) ownLeaves.set(paneId, el);
  else if (ownLeaves.get(paneId) === el) ownLeaves.delete(paneId);
}

/**
 * 葉の関数 ref を、描いた時点の paneId に結び付けて作る（D105）。Vue は関数 ref を、付けた・描き直したときは
 * その回の描画の関数に要素を、外すときは最後に描いた回の関数に `null` を渡す——引数の `paneId` はその回の描画で
 * 決まった値なので、外すときも「その葉の pane」を外せる。外す要素は覚えておいたもの（`null` には要素が無い）。
 */
function leafRef(paneId: string): (el: unknown) => void {
  let attachedEl: HTMLElement | null = null;
  return (el) => {
    if (el instanceof HTMLElement) {
      attachedEl = el;
      registerLeaf(paneId, el, true);
    } else if (attachedEl) {
      registerLeaf(paneId, attachedEl, false);
      attachedEl = null;
    }
  };
}

function commitView(): void {
  if (!isRoot || !ownLeaves || !viewSync || !mounted) return;
  viewSync.commit({
    workspaceId: props.workspaceId,
    tabId: props.tabId,
    visible: [...ownLeaves.entries()].map(([paneId, element]) => ({ paneId, element })),
    ...(props.measureSinglePane ? { measureSinglePane: props.measureSinglePane } : {}),
  });
}

// `onUpdated` だけでは、初回マウント直後（分割・zoom・tab 切替のような「PaneLayout 自身の props が
// 変わる」再描画が一度も起きていない状態）に `client.view` が一度も送られない不具合があった
// （05-e2e-docs T3 の E2E で発見。D91）。`onMounted` も併用する——`ownLeaves`（テンプレート ref の
// コールバックで詰める）は Vue の仕様上、`onMounted` が発火する時点で既に埋まっている。
onMounted(() => {
  mounted = true;
  commitView();
  // 新しい接続の hello の後に、描き直しを待ってから今の表示で commit し直す（D107）。
  if (isRoot && viewSync) detachCommitter = viewSync.attachCommitter(() => void nextTick(commitView));
});
onUpdated(commitView);
onBeforeUnmount(() => {
  mounted = false;
  detachCommitter?.();
  detachCommitter = null;
  resizeObserver?.disconnect();
  observedLeaves.clear();
  resizeCommit.cancel();
  ownLeaves?.clear();
});

defineExpose({ commitView });
</script>

<template>
  <PaneFrame
    v-if="singlePaneId"
    :key="singlePaneId"
    :pane-id="singlePaneId"
    :enabled="paneFrames"
    :multi-pane="multiPane"
    :neighbors="ownNeighbors"
  >
    <div class="pane-layout-leaf" :class="{ 'pane-layout-zoomed': !!zoomedPaneId }" :ref="leafRef(singlePaneId)">
      <slot name="pane" :pane-id="singlePaneId" />
    </div>
  </PaneFrame>
  <div v-else-if="splitLayout" class="pane-layout-split" :class="splitLayout.dir">
    <div class="pane-layout-side" :style="{ flexBasis: `${splitLayout.ratio * 100}%` }">
      <PaneLayout
        :workspace-id="workspaceId"
        :tab-id="tabId"
        :layout="splitLayout.a"
        :register-leaf="registerLeaf"
        :pane-frames="paneFrames"
        :multi-pane="multiPane"
        :neighbors="neighborsA"
      >
        <template #pane="slotProps"><slot name="pane" :pane-id="slotProps.paneId" /></template>
      </PaneLayout>
    </div>
    <Splitter :split-id="splitLayout.id" :tab-id="tabId" :ratio="splitLayout.ratio" :dir="splitLayout.dir" />
    <div class="pane-layout-side" :style="{ flexBasis: `${(1 - splitLayout.ratio) * 100}%` }">
      <PaneLayout
        :workspace-id="workspaceId"
        :tab-id="tabId"
        :layout="splitLayout.b"
        :register-leaf="registerLeaf"
        :pane-frames="paneFrames"
        :multi-pane="multiPane"
        :neighbors="neighborsB"
      >
        <template #pane="slotProps"><slot name="pane" :pane-id="slotProps.paneId" /></template>
      </PaneLayout>
    </div>
  </div>
</template>

<style scoped>
/*
 * 05-e2e-docs T3 の E2E（実物の Chromium での境界のリサイズ確認）で発見：この component には
 * `<style>` が一度も存在しなかった（Splitter.vue も同様。D92）。`display:flex` が無いため
 * `flexBasis`（インラインスタイル）が効かず、分割した pane が横／縦に並ばず常にブロック要素として
 * 縦に積み重なっていた（`right` 分割でも横に並ばない）——03-web-desktop からずっと入っていた不具合。
 * 構造（DOM の存在・個数）とキーボード操作だけで検証してきたテストでは検出できなかった。
 */
.pane-layout-leaf {
  width: 100%;
  height: 100%;
}
.pane-layout-split {
  display: flex;
  width: 100%;
  height: 100%;
}
.pane-layout-split.right {
  flex-direction: row;
}
.pane-layout-split.down {
  flex-direction: column;
}
.pane-layout-side {
  flex-grow: 1;
  flex-shrink: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
</style>
