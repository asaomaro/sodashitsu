import type { DropTarget } from "./moveTarget.js";

/** `moveNodeTo` が使うもの（画面の部品から渡す。単体試験で差し替える）。 */
export interface MoveNodeDeps {
  /** `pane.move_to_tab`（`follow: false`）。通信の失敗は null。 */
  movePaneToTab(paneId: string, tabId: string): Promise<{ ok: boolean; reason?: string } | null>;
  /** サーバの構成が変わって、ノードが `workspaceId` の囲いに入るのを待つ（待ちが切れたら false）。 */
  waitMember(workspaceId: string): Promise<boolean>;
  /** 離した場所に近い空きへ置く（`resolveDrop`）。 */
  placeNode(pos: { x: number; y: number }): Promise<unknown>;
  /** 囲いの中の最初の置き場所（見えていない空間の囲いなら null）。 */
  bodyPosition(frameId: string): { x: number; y: number } | null;
  clearDrag(): void;
  toast(message: string): void;
  announce(message: string): void;
  flash(frameId: string): void;
}

export const MOVE_FAILED = "pane を移せませんでした。元の位置へ戻しました。";
export const MOVE_NOT_SYNCED = "移しました。表示が追いついたら、置き場所は自動で決まります。";

/**
 * pane を別の workspace の tab へ移す進行（20261008-graph-first PR4）。サーバの答えが正（断られたら、元へ戻してトースト）。
 * 成功したら、所属の変化を待ち、**待ちが切れたら位置を書かない**（所属が古いまま位置だけを書くと、見た目と所属がずれる。置き場所は、所属が届いたときの自動の置き方に任せる）。
 */
export async function moveNodeTo(
  deps: MoveNodeDeps,
  args: { paneId: string; name: string; target: Extract<DropTarget, { kind: "move" }>; dropPos: { x: number; y: number } | null },
): Promise<"moved" | "declined" | "not_synced"> {
  const { target } = args;
  const r = await deps.movePaneToTab(args.paneId, target.tabId);
  if (r === null || !r.ok) {
    deps.clearDrag();
    // 理由があるときは、`movePaneToTab` がトーストを出している。
    if (r === null || !r.reason) deps.toast(MOVE_FAILED);
    return "declined";
  }
  const synced = await deps.waitMember(target.workspaceId);
  if (!synced) {
    deps.clearDrag();
    deps.toast(MOVE_NOT_SYNCED);
    return "not_synced";
  }
  deps.flash(target.frameId);
  deps.announce(`${args.name} を ${target.label} へ移しました。`);
  const pos = args.dropPos ?? deps.bodyPosition(target.frameId);
  if (pos !== null) await deps.placeNode(pos);
  deps.clearDrag();
  return "moved";
}
