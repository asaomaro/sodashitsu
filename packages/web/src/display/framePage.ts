import type { DisplayInfo } from "@sodashitsu/protocol";

/**
 * 静的な形式（`text`・`markdown`・`html`）の枠の `sandbox`。**`allow-same-origin`・`allow-top-navigation`・`allow-modals`・`allow-downloads` を付けない**
 * （付けると枠の中がアプリの origin になり、隔離が崩れる）。`allow-forms` は、枠の中の `form` の `submit` のイベントを起こすためだけに付ける
 * （`frame.js` が必ず `preventDefault()` する）。テスト・負の対照がこの値を見る。
 */
export const DISPLAY_VIEW_SANDBOX = "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox";
/** 静的な形式の枠の頁（サーバの `/display-view/*`。専用のヘッダ）。 */
export const DISPLAY_VIEW_PAGE = "/display-view/frame.html";
/**
 * スクリプトが動く形式（`script-html`）の枠の `sandbox`。**`allow-scripts` だけ**（`allow-same-origin`・`allow-forms`・`allow-popups`・`allow-modals`・`allow-downloads`・
 * `allow-top-navigation` を付けない）。静的な形式の定数とは**別**（頁・定数・ヘッダを共有しない）。負の対照がこの値を見る。
 */
export const DISPLAY_SCRIPT_VIEW_SANDBOX = "allow-scripts";
/** スクリプトが動く形式の枠の頁（サーバの `/display-view/script.html`。専用のヘッダ）。 */
export const DISPLAY_SCRIPT_VIEW_PAGE = "/display-view/script.html";

export interface FramePage {
  page: string;
  sandbox: string;
  kind: "static" | "script";
}

/**
 * 形式から、開く頁と `sandbox` を決める**唯一の関数**（頁と sandbox を決める場所を増やさない）。知らない形式は `null`
 * （枠を作らず、固定の文言を出す。どちらかの頁へ落とさない）。
 */
export function framePage(format: string): FramePage | null {
  if (format === "text" || format === "markdown" || format === "html") {
    return { page: DISPLAY_VIEW_PAGE, sandbox: DISPLAY_VIEW_SANDBOX, kind: "static" };
  }
  if (format === "script-html") {
    return { page: DISPLAY_SCRIPT_VIEW_PAGE, sandbox: DISPLAY_SCRIPT_VIEW_SANDBOX, kind: "script" };
  }
  return null;
}

/** この形式は、作者のスクリプトが動く枠か（固定の印「スクリプト」・覆い・［操作する］・フォーカスの番は、これで決める。`info.format` から決め、枠の実際の形式と食い違わない）。 */
export function isScriptFormat(format: string): boolean {
  return framePage(format)?.kind === "script";
}

/**
 * 枠の鍵（`:key`）。形式が替わったら部品ごと（iframe・port・覆い・操作中の状態）作り直す。
 * 静的な形式は `<面の id>:<形式>`、スクリプトが動く形式は版も入れて `<面の id>:script-html:<rev>`（版が替わったら枠ごと作り直し、その版の中身を 1 回だけ送る）。
 * 置く側は、必ずこの関数で `:key` を作る。
 */
export function frameKey(info: Pick<DisplayInfo, "id" | "format"> & { rev?: number }): string {
  return isScriptFormat(info.format) ? `${info.id}:${info.format}:${info.rev ?? 0}` : `${info.id}:${info.format}`;
}
