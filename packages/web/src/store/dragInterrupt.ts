import { watch } from "vue";
import type { useViewStore } from "./view.js";

/**
 * ドラッグを終える・取り消す契機を見る（AC-I5）。**ダイアログが開いた**とき（`showModal()` で文書が inert になると、ポインタの捕捉がどうなるかは確かめた出所が無い）に加えて、
 * **画面が切り替わった**とき（基本画面の pane が `inert` になる。20261008-graph-first）。サイドバーのドラッグは画面をまたいで続けられてしまうので、切り替えの時点で終える。
 * `view` が無い（試験で注入しない部品）ときは何もしない。
 */
export function watchDragInterrupt(view: Pick<ReturnType<typeof useViewStore>, "modalOpen" | "screen"> | null | undefined, cancel: () => void): void {
  if (!view) return;
  watch(
    [() => view.modalOpen, () => view.screen] as const,
    ([open, screen], [wasOpen, wasScreen]) => {
      if ((open && !wasOpen) || screen !== wasScreen) cancel();
    },
  );
}
