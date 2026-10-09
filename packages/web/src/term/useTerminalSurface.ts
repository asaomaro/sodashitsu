import { ref, type Ref } from "vue";
import { acceptsDrop, readDropPayload } from "./FileTransfer.js";
import type { FileTransfer } from "./FileTransfer.js";
import { useViewStore } from "../store/view.js";

/**
 * 端末を載せる面（基本画面の `TerminalPane`・グラフの上の窓の本体）が、同じに持つ振る舞い（20261008-graph-first の X9）。同じ処理を 2 か所に書かず、ここから両方が使う。
 * - M1：pane へのクリックは、アプリがマウス報告を求めていてもフォーカスの移動（`view.focusPane`）を先に行う。capture フェーズで受けることで、xterm.js 自身のマウス処理（bubble）より先に走らせる。
 * - ファイル（と文字）のドロップ。ブラウザの既定の動作（そのファイルを開く・ダウンロードする）を止め、ふつうの端末と同じくパスを pane へ貼る（`FileTransfer.drop`）。
 *   `dragenter`/`dragleave` は子の要素をまたぐたびに対で起きるので、数えて重なりの表示を保つ。
 *
 * 引き継がないもの（基本画面だけ）：表示の面・pane の枠・権限が無いときの縮小（窓の pane は直結で、大きさは窓が決める）。
 * リンク・右クリック・検索・コピーのモードは、端末に付く部品（`MouseBridge`・`CopyTarget`）なので、要素がどこにあっても同じに働く。
 */
export function useTerminalSurface(getPaneId: () => string, getFileTransfer: () => FileTransfer | undefined, isDisabled: () => boolean) {
  const view = useViewStore();
  const dragDepth: Ref<number> = ref(0);

  function onMouseDownCapture(): void {
    view.focusPane(getPaneId());
  }
  function canDrop(ev: DragEvent): boolean {
    return getFileTransfer() !== undefined && !isDisabled() && acceptsDrop(ev.dataTransfer);
  }
  function onDragEnter(ev: DragEvent): void {
    if (!canDrop(ev)) return;
    ev.preventDefault();
    dragDepth.value++;
  }
  function onDragOver(ev: DragEvent): void {
    if (!canDrop(ev)) return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
  }
  function onDragLeave(): void {
    dragDepth.value = Math.max(0, dragDepth.value - 1);
  }
  function onDrop(ev: DragEvent): void {
    dragDepth.value = 0;
    if (!canDrop(ev) || !ev.dataTransfer) return;
    ev.preventDefault();
    view.focusPane(getPaneId());
    getFileTransfer()?.drop(getPaneId(), readDropPayload(ev.dataTransfer));
  }

  return { dragDepth, onMouseDownCapture, onDragEnter, onDragOver, onDragLeave, onDrop };
}

/**
 * 端末の入力欄（xterm.js の textarea）を Tab で止まる場所にするのは、選ばれている pane だけ（roving tabindex。D110・独立点検 #2）。
 * `TerminalPane` と窓が同じに使う。
 */
export function syncTerminalTabStop(textarea: HTMLTextAreaElement | undefined | null, selected: boolean): void {
  if (textarea) textarea.tabIndex = selected ? 0 : -1;
}
