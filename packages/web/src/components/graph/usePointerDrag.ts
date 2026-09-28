import { onBeforeUnmount } from "vue";

/**
 * ドラッグの型（20260927-agent-graph の architecture「web」。PaneFrame・Sidebar の D&D と同じ流儀を 1 か所にまとめたもの）:
 * 閾値（それまではクリック扱い）・`setPointerCapture`・ドラッグ中の Esc で取り消し（Esc はグラフ画面の段階の Esc へ渡さない）・
 * `pointercancel`・`lostpointercapture` で取り消し。ノードの移動・線の作成・背景のパンで使う。
 * 動きは window で受ける（capture が無い環境でも要素の外で追える）。同じ `pointerId` だけを見る。
 */
export interface PointerDragHandlers {
  /** 動き始めとみなす距離（画面の px）。0 なら押した時点でドラッグ。 */
  threshold?: number;
  /** 閾値を超えた（ドラッグが始まった）。 */
  onStart?(ev: PointerEvent): void;
  /** 動いた（押した点からの差。画面の px）。閾値を超えてから。 */
  onMove?(ev: PointerEvent, dx: number, dy: number): void;
  /** 離した（ドラッグの後）。 */
  onEnd?(ev: PointerEvent, dx: number, dy: number): void;
  /** 閾値を超えずに離した（クリック）。 */
  onClick?(ev: PointerEvent): void;
  /** 取り消した（Esc・pointercancel・キャプチャを失った・`cancel()`）。ドラッグが始まる前の取り消しでも呼ぶ。 */
  onCancel?(): void;
}

export interface PointerDragSession {
  cancel(): void;
  readonly dragging: boolean;
}

export function startPointerDrag(
  ev: PointerEvent,
  target: Element,
  h: PointerDragHandlers,
): PointerDragSession {
  const threshold = h.threshold ?? 4;
  const id = ev.pointerId;
  const x0 = ev.clientX;
  const y0 = ev.clientY;
  let dragging = threshold === 0;
  let done = false;
  try {
    (target as Element & { setPointerCapture?: (id: number) => void }).setPointerCapture?.(id);
  } catch {
    // 押した直後に要素が消えた等。window で受けるので続けられる。
  }
  if (dragging) h.onStart?.(ev);

  const finish = (): void => {
    done = true;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancelEv);
    window.removeEventListener("keydown", onKey, true);
    target.removeEventListener("lostpointercapture", onLost);
    try {
      (
        target as Element & { releasePointerCapture?: (id: number) => void }
      ).releasePointerCapture?.(id);
    } catch {
      // 既に離れている
    }
  };
  const cancel = (): void => {
    if (done) return;
    finish();
    h.onCancel?.();
  };
  function onMove(e: PointerEvent): void {
    if (e.pointerId !== id) return;
    const dx = e.clientX - x0;
    const dy = e.clientY - y0;
    if (!dragging) {
      if (Math.hypot(dx, dy) < threshold) return;
      dragging = true;
      h.onStart?.(e);
    }
    h.onMove?.(e, dx, dy);
  }
  function onUp(e: PointerEvent): void {
    if (e.pointerId !== id) return;
    finish();
    const dx = e.clientX - x0;
    const dy = e.clientY - y0;
    if (dragging) h.onEnd?.(e, dx, dy);
    else h.onClick?.(e);
  }
  function onCancelEv(e: PointerEvent): void {
    if (e.pointerId === id) cancel();
  }
  function onLost(e: Event): void {
    // 離した直後にも届く（pointerup の後）。その時点では finish 済み。
    if ((e as PointerEvent).pointerId === id) cancel();
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key !== "Escape") return;
    // グラフ画面の段階の Esc（パネル・選択・画面を閉じる）へ渡さない——このドラッグだけを取り消す。
    e.preventDefault();
    e.stopPropagation();
    cancel();
  }
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancelEv);
  window.addEventListener("keydown", onKey, true);
  target.addEventListener("lostpointercapture", onLost);
  return {
    cancel,
    get dragging() {
      return dragging && !done;
    },
  };
}

/** 部品の中で使う形。unmount で進行中のドラッグを取り消す。 */
export function usePointerDrag(): {
  start(ev: PointerEvent, target: Element, h: PointerDragHandlers): PointerDragSession;
  cancel(): void;
  active(): boolean;
} {
  let session: PointerDragSession | null = null;
  onBeforeUnmount(() => session?.cancel());
  return {
    start(ev, target, h) {
      session?.cancel();
      const s = startPointerDrag(ev, target, {
        ...h,
        onEnd: (e, dx, dy) => {
          session = null;
          h.onEnd?.(e, dx, dy);
        },
        onClick: (e) => {
          session = null;
          h.onClick?.(e);
        },
        onCancel: () => {
          session = null;
          h.onCancel?.();
        },
      });
      session = s;
      return s;
    },
    cancel() {
      session?.cancel();
    },
    active() {
      return session !== null;
    },
  };
}
