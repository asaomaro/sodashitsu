import { getCurrentInstance, onBeforeUnmount, ref, type Ref } from "vue";

/**
 * 境目（サイドバーの幅・pane の間・spaces と agents）のドラッグの決まり（20261004-ui-interaction-polish。design「composable」）。
 * 値の意味・保存先は 3 か所で違うので、それは `begin`／`move`／`commit`／`cancel`／`reset` として呼び元が持つ。ここが持つのは、
 * 左ボタンだけで始める・フォーカスを移さない・描画ごとに 1 回にまとめる・`Esc` で取り消す・ダブルクリックで既定へ・
 * 動かさずに離したら確定しない・ドラッグ中のキーを端末へ通さない・`<html>` のクラスの付け外し、まで。
 */
export interface ResizeDragOptions<T> {
  axis: "x" | "y";
  /** ドラッグを始められるか（畳んでいる間は false、など）。 */
  enabled?: () => boolean;
  /** 始めた時点の値を返す（`Esc` で戻すため）。 */
  begin(ev: PointerEvent): T;
  /** ポインタの位置から値を反映する（1 回の描画につき 1 回にまとめて呼ばれる）。 */
  move(ev: PointerEvent, start: T): void;
  /** 確定（離した・ダイアログが開いた）。動かしていないときは呼ばれない。 */
  commit(start: T): void;
  /** 取り消し（`Esc`）。`start` へ戻す。 */
  cancel(start: T): void;
  /** ダブルクリック（350ms 以内の 2 回目の pointerdown）。 */
  reset(): void;
}

export interface ResizeDrag {
  /** ドラッグ中か（境目の要素に `resize-handle-active` を付ける根拠）。 */
  dragging: Ref<boolean>;
  onPointerDown(ev: PointerEvent): void;
  onPointerMove(ev: PointerEvent): void;
  /** `pointerup`／`pointercancel`／`lostpointercapture`。 */
  onPointerEnd(ev: PointerEvent): void;
  /** 外から確定させる（ダイアログが開いたとき）。 */
  finish(): void;
}

const DOUBLE_CLICK_MS = 350;

export function useResizeDrag<T>(o: ResizeDragOptions<T>): ResizeDrag {
  const dragging = ref(false);
  let start: T | undefined;
  let moved = false;
  let pending: PointerEvent | null = null;
  let raf: number | null = null;
  let target: HTMLElement | null = null;
  let pointerId = -1;
  let lastDown = 0;

  const root = (): HTMLElement => document.documentElement;

  function onKeydown(ev: KeyboardEvent): void {
    // ドラッグ中のキーは端末へ通さない。`stopPropagation` だけでは keypress と、フォーカスのある textarea への入力が止まらず、
    // xterm が文字を送る（実測）ので `preventDefault` も要る。
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.key === "Escape") abort(true);
  }

  function attach(): void {
    root().classList.add("soda-resizing", `soda-resizing-${o.axis}`);
    window.addEventListener("keydown", onKeydown, true);
  }

  function detach(): void {
    dragging.value = false; // 先に下ろす（releasePointerCapture が lostpointercapture を同期で起こしても、二重に確定しない）
    root().classList.remove("soda-resizing", "soda-resizing-x", "soda-resizing-y");
    window.removeEventListener("keydown", onKeydown, true);
    if (raf !== null) {
      cancelAnimationFrame(raf);
      raf = null;
    }
    pending = null;
    try {
      if (target && pointerId >= 0) target.releasePointerCapture?.(pointerId);
    } catch {
      // 捕捉が既に外れている
    }
    target = null;
  }

  function flush(): void {
    raf = null;
    const ev = pending;
    pending = null;
    if (ev && dragging.value) o.move(ev, start as T);
  }

  /** `cancelled` なら、ためた移動を捨てて `cancel`。そうでなければ、ためた分を反映してから（動かしていれば）`commit`。 */
  function abort(cancelled: boolean): void {
    if (!dragging.value) return;
    const s = start as T;
    if (cancelled) {
      detach();
      o.cancel(s);
      return;
    }
    if (raf !== null) cancelAnimationFrame(raf);
    flush();
    detach();
    if (moved) o.commit(s);
  }

  function onPointerDown(ev: PointerEvent): void {
    if (ev.button !== 0) return;
    if (o.enabled && !o.enabled()) return;
    // フォーカスを移さない（境目を掴んだだけでは、端末などのフォーカスを奪わない）。互換のマウスイベントは出なくなるが、
    // pointer capture と後続の pointermove・pointerup は届く。
    ev.preventDefault();
    if (dragging.value) return; // ドラッグ中の 2 本目のポインタ（タッチ）では reset も新しいドラッグも始めない
    const now = Date.now();
    if (now - lastDown < DOUBLE_CLICK_MS) {
      lastDown = 0;
      o.reset();
      return;
    }
    lastDown = now;
    target = (ev.currentTarget as HTMLElement | null) ?? null;
    pointerId = ev.pointerId;
    target?.setPointerCapture?.(ev.pointerId);
    start = o.begin(ev);
    moved = false;
    dragging.value = true;
    attach();
  }

  function onPointerMove(ev: PointerEvent): void {
    if (!dragging.value) return;
    moved = true;
    pending = ev; // 最後のイベントだけを使う
    if (raf === null) raf = requestAnimationFrame(flush);
  }

  function onPointerEnd(): void {
    abort(false);
  }

  if (getCurrentInstance()) onBeforeUnmount(() => abort(false));

  return { dragging, onPointerDown, onPointerMove, onPointerEnd, finish: () => abort(false) };
}
