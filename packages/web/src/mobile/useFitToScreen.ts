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
  /** モバイルの本体では初回から実PTYを表示領域に合わせる。 */
  initialFit?: boolean;
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
 * モバイルの本体はinitialFit:trueで実PTYを表示領域に合わせる。
 * この部品単体の既定は縮小表示（初期fit:false）で、toggleFitで切り替えられる。
 *
 * xtermはサーバのcols/rows×セル寸法の自然サイズで描く。DOMの自然サイズを明示し、
 * 表示領域の幅・高さに収まる倍率を計算する。fit中でも別クライアントがサイズ権限を
 * 取った場合やPTY更新を待つ間は、はみ出さない倍率で表示する。
 *
 * fitはclient.view送信直後・pane.subscribe前に適用する。初回接続と再接続だけでなく、
 * 既存接続でMobileShellをマウントした場合にも次のviewの直後に送る。
 * 切断中は送らず、次のhello後のviewで有効な状態を送り直す。
 */
export function useFitToScreen(opts: UseFitToScreenOptions): {
  scale: Ref<number>;
  fitEnabled: Ref<boolean>;
  naturalSize: Ref<NaturalSize | null>;
  toggleFit: () => void;
} {
  const session = useSessionStore();
  const view = useViewStore();
  const fitEnabled = ref(opts.initialFit ?? false);
  const scale = ref(1);
  const naturalSize = ref<NaturalSize | null>(null);

  function cellSizeOf(term: Terminal | undefined) {
    return term ? getCellSize(term) : null;
  }

  function recompute(): void {
    const paneId = opts.paneId.value;
    const pane = paneId ? session.panes.get(paneId) : undefined;
    const cell = cellSizeOf(paneId ? opts.registry.get(paneId)?.term : undefined);
    naturalSize.value =
      pane && cell ? { width: pane.cols * cell.width, height: pane.rows * cell.height } : null;

    const el = opts.container.value;
    if (!naturalSize.value || !el || el.clientWidth <= 0 || naturalSize.value.width <= 0) {
      scale.value = 1;
      return;
    }
    scale.value = Math.min(
      1,
      el.clientWidth / naturalSize.value.width,
      el.clientHeight > 0 ? el.clientHeight / naturalSize.value.height : 1,
    );
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
  }, true);
  onBeforeUnmount(offViewEstablished);

  // pane の cols/rows がサーバから届いて変わったとき（`client.fit` 後の実際のリサイズを含む）も再計算する。
  const paneDims = computed(() => {
    const pane = opts.paneId.value ? session.panes.get(opts.paneId.value) : undefined;
    return pane ? `${pane.cols}x${pane.rows}` : null;
  });
  watch([opts.paneId, opts.container, fitEnabled, paneDims], recompute, {
    flush: "post",
    immediate: true,
  });

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
