import type { z } from "zod";
import {
  PANE_OP_DISPLAY_CLOSE,
  PANE_OP_DISPLAY_FEATURES,
  PANE_OP_DISPLAY_LIST,
  PANE_OP_DISPLAY_SEND,
  PANE_OP_DISPLAY_SET,
  PANE_OP_DISPLAY_WAIT,
  PaneDisplayCloseParams,
  PaneDisplayFeaturesParams,
  PaneDisplayListParams,
  PaneDisplaySendParams,
  PaneDisplaySetParams,
  PaneDisplayWaitParams,
} from "@sodashitsu/protocol";
import type { DisplayService } from "../display/DisplayService.js";
import type { PaneOpDef } from "./PaneOpRegistry.js";

/**
 * ログイン不要の受け口（`pane.sock`）に載せる表示の面の操作（20261007-soda-extensions の design「受け口と `/ws` の登録」）。
 * **どれも対象は `ctx.paneId`（要求が名乗った pane）だけ**——引数に `paneId` を持たない schema（strict）で受け、ほかの pane の面を指せない。
 * `/ws` の handler（`surface/methods/display.ts`）は登録しない。
 */
export function displaySetOp(displays: Pick<DisplayService, "set">): PaneOpDef<z.infer<typeof PaneDisplaySetParams>> {
  return { name: PANE_OP_DISPLAY_SET, params: PaneDisplaySetParams, handler: (ctx, p) => displays.set(ctx.paneId, p) };
}

export function displayCloseOp(displays: Pick<DisplayService, "close">): PaneOpDef<z.infer<typeof PaneDisplayCloseParams>> {
  return { name: PANE_OP_DISPLAY_CLOSE, params: PaneDisplayCloseParams, handler: (ctx, p) => displays.close(ctx.paneId, p) };
}

export function displayListOp(displays: Pick<DisplayService, "list">): PaneOpDef<z.infer<typeof PaneDisplayListParams>> {
  return { name: PANE_OP_DISPLAY_LIST, params: PaneDisplayListParams, handler: (ctx) => displays.list(ctx.paneId) };
}

/** 次の出来事か `timeoutMs` まで応答しない。接続が終わる（`ctx.signal` の abort）と待ちが外れる。 */
export function displayWaitOp(displays: Pick<DisplayService, "wait">): PaneOpDef<z.infer<typeof PaneDisplayWaitParams>> {
  return { name: PANE_OP_DISPLAY_WAIT, params: PaneDisplayWaitParams, handler: (ctx, p) => displays.wait(ctx.paneId, p, { signal: ctx.signal }) };
}

/** 機能確認（引数なし）。ログイン不要の受け口でも読める（面の中身を含まない）。 */
export function displayFeaturesOp(displays: Pick<DisplayService, "features">): PaneOpDef<z.infer<typeof PaneDisplayFeaturesParams>> {
  return { name: PANE_OP_DISPLAY_FEATURES, params: PaneDisplayFeaturesParams, handler: () => displays.features() };
}

/** スクリプトが動く面へデータを送る。対象は `ctx.paneId` の面だけ（引数に `paneId` を載せたら schema が断る）。 */
export function displaySendOp(displays: Pick<DisplayService, "send">): PaneOpDef<z.infer<typeof PaneDisplaySendParams>> {
  return { name: PANE_OP_DISPLAY_SEND, params: PaneDisplaySendParams, handler: (ctx, p) => displays.send(ctx.paneId, p) };
}
