import type { DockSide } from "./displayPrefs.js";

/**
 * 面（パネル）の D&D（20261008-display-layout の design「D&D」）。このファイルの純粋な部分: ポインタの位置から、落とせる場所を決める。
 * つかむ・動かす・離す・取り消すの処理（`DockDragController`）は、同じファイルの下にある。
 */

/** 縁から、この割合（幅・高さに対する）までが、その側の落とせる場所。 */
export const DOCK_ZONE_EDGE_RATIO = 0.22;

export type DockZone = DockSide | "float";
export interface ZoneBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * 箱の中の点から、落とせる場所を決める。箱の外は `null`。箱の中では、4 つの縁までの距離（幅・高さで割った比）のうち最小のものが 0.22 以下なら、その縁の側
 * （同じ距離なら 上・下・左・右 の順）。そうでなければ中央（`opts.float` が真のときだけ `float`。偽なら `null`＝落とせない）。
 */
export function dockZoneAt(box: ZoneBox, x: number, y: number, opts: { float: boolean }): DockZone | null {
  if (!(box.width > 0) || !(box.height > 0)) return null;
  if (x < box.left || x > box.left + box.width || y < box.top || y > box.top + box.height) return null;
  const dist: [DockSide, number][] = [
    ["top", (y - box.top) / box.height],
    ["bottom", (box.top + box.height - y) / box.height],
    ["left", (x - box.left) / box.width],
    ["right", (box.left + box.width - x) / box.width],
  ];
  let best = dist[0]!;
  for (const d of dist) if (d[1] < best[1]) best = d;
  if (best[1] <= DOCK_ZONE_EDGE_RATIO) return best[0];
  return opts.float ? "float" : null;
}

// --- つかむ・動かす・離す・取り消す --------------------------------------------------------------------------------------------------

/** この距離（px）動くまでは、ただの押下（何もしない）。 */
export const DOCK_DRAG_THRESHOLD_PX = 6;
/** ドラッグの間 `<html>` に付けるクラス（面の枠〔iframe〕がポインタを奪わない。`styles/displayDrag.css`）。 */
export const DOCK_DRAGGING_CLASS = "soda-display-dragging";

export interface DockDragState {
  id: string;
  paneId: string;
  /** いまポインタのある場所（箱の外・落とせない場所は null）。 */
  zone: DockZone | null;
}

export interface DockDragOptions {
  id: string;
  paneId: string;
  /** その pane の本体の箱（落とせる場所の基準）。取れなければ null（何も落とせない）。 */
  box(): ZoneBox | null;
  /** 中央（浮いた窓）を落とせる場所にするか。PR-B は偽。 */
  float(): boolean;
  /** 状態をストアへ（`null` で終わり）。 */
  setState(s: DockDragState | null): void;
  /** 離した。`zone` は落とせる場所（今の置き場所と同じかどうかは呼ぶ側が決める）。 */
  drop(zone: DockZone): void;
  /** modal のダイアログが開いているか（開いたらドラッグを取り消す）。 */
  modalOpen?(): boolean;
}

export interface DockDragHandle {
  dragging(): boolean;
  onPointerDown(ev: PointerEvent): void;
  onPointerMove(ev: PointerEvent): void;
  /** `pointerup`。 */
  onPointerUp(ev: PointerEvent): void;
  /** `pointercancel`・`lostpointercapture`。 */
  onPointerCancel(ev: PointerEvent): void;
  /** 外から取り消す（`Esc`・modal・部品が外れた）。 */
  cancel(): void;
}

/**
 * 面の見出し（`[data-display-grip]`）をつかんで、pane の 4 つの側（PR-C から中央も）へ動かす D&D。**`view.paneDrag`（pane の名前の D&D）を立てない**
 * （サイドバーの落とせる行・tab バーを強調しない。つかむ場所も状態も別）。ドラッグの間のキーは、`Esc` で取り消し、そのほかは端末へ流さない。
 */
export function createDockDrag(o: DockDragOptions, win: Window = window): DockDragHandle {
  const root = (): HTMLElement => win.document.documentElement;
  let start: { x: number; y: number; pointerId: number; target: HTMLElement | null } | null = null;
  let active = false;
  let zone: DockZone | null = null;

  function onKeydown(ev: KeyboardEvent): void {
    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      end();
      return;
    }
    if (active) {
      ev.preventDefault();
      ev.stopPropagation(); // ドラッグ中のキーは端末へ流さない
    }
  }

  function end(): void {
    const had = start !== null;
    const target = start?.target ?? null;
    const id = start?.pointerId ?? -1;
    start = null;
    zone = null;
    if (active) {
      active = false;
      root().classList.remove(DOCK_DRAGGING_CLASS);
      o.setState(null);
    }
    if (had) win.removeEventListener("keydown", onKeydown, true);
    try {
      if (target && id >= 0) target.releasePointerCapture?.(id);
    } catch {
      // 捕捉が既に外れている
    }
  }

  function zoneAt(x: number, y: number): DockZone | null {
    const box = o.box();
    return box ? dockZoneAt(box, x, y, { float: o.float() }) : null;
  }

  return {
    dragging: () => active,
    onPointerDown(ev) {
      if (ev.button !== 0 || start !== null) return;
      ev.preventDefault(); // フォーカスを移さない
      const target = (ev.currentTarget as HTMLElement | null) ?? null;
      start = { x: ev.clientX, y: ev.clientY, pointerId: ev.pointerId, target };
      target?.setPointerCapture?.(ev.pointerId);
      win.addEventListener("keydown", onKeydown, true);
    },
    onPointerMove(ev) {
      if (!start || ev.pointerId !== start.pointerId) return;
      if (!active) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DOCK_DRAG_THRESHOLD_PX) return;
        if (o.modalOpen?.()) {
          end();
          return;
        }
        active = true;
        root().classList.add(DOCK_DRAGGING_CLASS);
      }
      zone = zoneAt(ev.clientX, ev.clientY);
      o.setState({ id: o.id, paneId: o.paneId, zone });
    },
    onPointerUp(ev) {
      if (!start || ev.pointerId !== start.pointerId) return;
      const wasActive = active;
      const at = wasActive ? zoneAt(ev.clientX, ev.clientY) : null;
      end();
      if (wasActive && at !== null) o.drop(at);
    },
    onPointerCancel(ev) {
      if (!start || ev.pointerId !== start.pointerId) return;
      end();
    },
    cancel: end,
  };
}
