import type { DisplayInfo } from "@sodashitsu/protocol";

/**
 * 静的な形式（`text`・`markdown`・`html`）の枠の `sandbox`。**`allow-same-origin`・`allow-top-navigation`・`allow-modals`・`allow-downloads` を付けない**
 * （付けると枠の中がアプリの origin になり、隔離が崩れる）。`allow-forms` は、枠の中の `form` の `submit` のイベントを起こすためだけに付ける
 * （`frame.js` が必ず `preventDefault()` する）。テスト・負の対照がこの値を見る。
 */
export const DISPLAY_VIEW_SANDBOX = "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox";
/** 静的な形式の枠の頁（サーバの `/display-view/*`。専用のヘッダ）。 */
export const DISPLAY_VIEW_PAGE = "/display-view/frame.html";

export interface FramePage {
  page: string;
  sandbox: string;
  kind: "static";
}

/**
 * 形式から、開く頁と `sandbox` を決める**唯一の関数**。知らない形式は `null`（枠を作らず、固定の文言を出す。どちらかの頁へ落とさない）。
 * 静的な形式の頁は、`text`・`markdown`・`html` のときだけ。
 */
export function framePage(format: string): FramePage | null {
  if (format === "text" || format === "markdown" || format === "html") {
    return { page: DISPLAY_VIEW_PAGE, sandbox: DISPLAY_VIEW_SANDBOX, kind: "static" };
  }
  return null;
}

/**
 * 枠の鍵（`:key`）。形式が替わったら部品ごと（iframe・port・操作中の状態）作り直す。静的な形式は `<面の id>:<形式>`。
 * 置く側は、必ずこの関数で `:key` を作る。
 */
export function frameKey(info: Pick<DisplayInfo, "id" | "format">): string {
  return `${info.id}:${info.format}`;
}
