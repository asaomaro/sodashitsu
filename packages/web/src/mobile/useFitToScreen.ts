import type { Terminal } from "@xterm/xterm";
import { computed, onBeforeUnmount, ref, watch, type Ref } from "vue";
import type { ConnectionPort } from "@sodashitsu/client-core";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";
import { getCellSize } from "../term/measure.js";
import type { TerminalRegistry } from "../term/TerminalRegistry.js";
import type { ViewSync } from "../term/ViewSync.js";

export interface UseFitToScreenOptions {
  conn: ConnectionPort;
  registry: TerminalRegistry;
  /** 新しい接続の最初の `client.view` の直後に `client.fit` を送り直す口（`ViewSync.onViewEstablished`。D107・D108）。 */
  viewSync: Pick<ViewSync, "onViewEstablished">;
  /** 現在表示している pane（`MobileShell.vue` の `currentPaneId`）。 */
  paneId: Ref<string | null>;
  /** 縮小の基準にする、表示領域の要素（`MobileShell.vue` の `paneContainer`）。 */
  container: Ref<HTMLElement | null>;
}

export interface NaturalSize {
  width: number;
  height: number;
}

/**
 * サイズの縮小表示と「この端末に合わせる」の切り替え（04-mobile T6。design「サイズ」）。
 * 既定ではサイズ権限を取らず（`client.fit` を送らない）、pane の pixel サイズ（`cols × cellWidth`）が
 * 表示領域の幅を超える分だけ `transform: scale()` で縮める。有効にすると `client.fit({enabled:true})` を
 * 送ってサイズ権限を取り（design「サイズ」）、等倍（`scale === 1`）で表示する。
 *
 * **`naturalSize` を返す理由**：xterm.js は自分の cols/rows（＝サーバから届く実物のグリッドの大きさ）で
 * 決まる pixel サイズのまま描画する（マウント先の DOM 要素の CSS サイズには自動で合わせない）。
 * `transform: scale()` はレイアウト上の大きさを変えないため、マウント先の要素に `width:100%` のような
 * 相対サイズを与えたままだと「小さい入れ物いっぱいに描いてから縮める」という循環になり縮小の意味が無い。
 * 呼び出し側（`MobileShell.vue`）は `naturalSize` を明示的な px の `width`/`height` として当ててから
 * `transform: scale(scale)` を重ねる。
 *
 * **「この端末に合わせる」は接続をまたいで持ち、新しい接続ごとにサーバへ送り直す**（04-mobile T9・D108。統合 review ラウンド1・
 * D106 の独立点検 #2 で発見）。サーバは接続ごとに新しい clientId を fit:false で登録する（D106）が、以前は `fitEnabled` を
 * 持ち越したまま `client.fit` を送り直さなかった——再接続の後はボタンが押された表示のままサーバでは権限を取らず、別の
 * クライアントが決めた大きさのまま等倍で描いて画面からはみ出した。`ViewSync.onViewEstablished`（新しい接続で最初の
 * `client.view` を送った直後、続く `pane.subscribe` より前。初回の接続でも呼ぶ）で、有効なら `client.fit({enabled:true})` を
 * 送る——サーバには `client.view` → `client.fit` → `pane.subscribe` の順に届き（`ConnectionPort.request` は同期的に送る）、
 * `client.fit` は表示のある接続でしか権限を取らない（D106 の `onFitChanged`）ので、この順でなければならない。SNAPSHOT は
 * fit で決まった大きさで取られる。初回の接続では `fitEnabled` は false なので何も送らない。
 * `toggleFit` は、hello が通った接続がある間（`connectionState === 'open'`）だけ `client.fit` を送る。無い間（切断中・再接続の
 * hello 待ち）は手元の状態だけを替える——hello より前に送らない（D107）。有効にした分は次の接続の `onViewEstablished` で送り、
 * 無効にした分は送らなくてよい（新しい接続は fit:false から始まる）。
 */
export function useFitToScreen(opts: UseFitToScreenOptions): { scale: Ref<number>; fitEnabled: Ref<boolean>; naturalSize: Ref<NaturalSize | null>; toggleFit: () => void } {
  const session = useSessionStore();
  const view = useViewStore();
  const fitEnabled = ref(false);
  const scale = ref(1);
  const naturalSize = ref<NaturalSize | null>(null);

  function cellSizeOf(term: Terminal | undefined) {
    return term ? getCellSize(term) : null;
  }

  function recompute(): void {
    const paneId = opts.paneId.value;
    const pane = paneId ? session.panes.get(paneId) : undefined;
    const cell = cellSizeOf(paneId ? opts.registry.get(paneId)?.term : undefined);
    naturalSize.value = pane && cell ? { width: pane.cols * cell.width, height: pane.rows * cell.height } : null;

    if (fitEnabled.value) {
      scale.value = 1;
      return;
    }
    const el = opts.container.value;
    if (!naturalSize.value || !el || el.clientWidth <= 0 || naturalSize.value.width <= 0) {
      scale.value = 1;
      return;
    }
    scale.value = Math.min(1, el.clientWidth / naturalSize.value.width);
  }

  function sendFit(enabled: boolean): void {
    void opts.conn.request("client.fit", { enabled }).catch(() => undefined);
  }

  function toggleFit(): void {
    fitEnabled.value = !fitEnabled.value;
    // hello の前・切断中は送らない（有効にした分は次の接続の `onViewEstablished` で送る。D107・D108）。
    if (view.connectionState === "open") sendFit(fitEnabled.value);
    recompute();
  }

  // 新しい接続（初回を含む）で最初の `client.view` を送った直後に、有効なら送り直す（D108）。
  const offViewEstablished = opts.viewSync.onViewEstablished(() => {
    if (fitEnabled.value) sendFit(true);
  });
  onBeforeUnmount(offViewEstablished);

  // pane の cols/rows がサーバから届いて変わったとき（`client.fit` 後の実際のリサイズを含む）も再計算する。
  const paneDims = computed(() => {
    const pane = opts.paneId.value ? session.panes.get(opts.paneId.value) : undefined;
    return pane ? `${pane.cols}x${pane.rows}` : null;
  });
  watch([opts.paneId, opts.container, fitEnabled, paneDims], recompute, { flush: "post", immediate: true });

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => recompute());
    watch(
      opts.container,
      (el, oldEl) => {
        if (oldEl) resizeObserver?.unobserve(oldEl);
        if (el) resizeObserver?.observe(el);
      },
      { immediate: true },
    );
  }
  onBeforeUnmount(() => resizeObserver?.disconnect());

  return { scale, fitEnabled, naturalSize, toggleFit };
}
