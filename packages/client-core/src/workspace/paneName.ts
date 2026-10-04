import type { Pane } from "@sodashitsu/protocol";
import { shortId } from "@sodashitsu/protocol";

/**
 * pane の呼び名。`title` は未設定なら空文字なので `??` ではなく `||` で繋ぐ
 * （空文字のときも次の候補へ落ちる）。
 *
 * **この連鎖の唯一の置き場**——以前は `GotoPicker.vue` と `PaneFrame.vue` にも同じ式が複製されていて、
 * 候補を 1 つ足す／順を変えると**どれか 1 つだけが黙ってずれる**状態だった。
 * 既定値だけ呼ぶ側が決める（`GotoPicker` は tab 内の順番、通知は pane の id）。
 */
export function paneNameOf(pane: Pane, fallback = `pane ${shortId(pane.id)}`): string {
  return pane.label || pane.agent?.name || pane.agent?.label || pane.title || fallback;
}

