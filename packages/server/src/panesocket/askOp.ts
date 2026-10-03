import type { z } from "zod";
import { PANE_OP_ASK_OPEN, PaneAskOpenParams } from "@sodashitsu/protocol";
import type { AskService } from "../ask/AskService.js";
import type { PaneOpDef } from "./PaneOpRegistry.js";

/**
 * ログイン不要の受け口（`pane.sock`）に載せる `ask.open`（20261003-sodactl-ask-socket の design「サーバ: ask の操作」）。
 * `/ws` の `ask.open` と同じ `AskService` を通すので、総数・「1 つの pane に同時に 1 つ」は `/ws` の質問と合わせて数える。
 *
 * - 対象の pane は受け口の共通の欄（実在を確かめた後の `ctx.paneId`）。引数は `/ws` と同じ schema から `paneId` を除いた `{spec, timeoutMs}`。
 * - 持ち主は接続ごとの名前（`ctx.connId`＝`pane-socket:<連番>`）。返事の前に接続が切れたら、受け口の `onConnectionGone` から
 *   `asks.onClientGone(connId)` を呼んで取り消す（配線は `composeServer`）。
 * - `AskService.open` の検査の誤り（`invalid_ask_spec`・`ask_busy` 等）は同期の throw。`PaneOpRegistry.invoke` が `try` の中で呼んで拾う。
 */
export function askOpenOp(
  asks: Pick<AskService, "open">,
): PaneOpDef<z.infer<typeof PaneAskOpenParams>> {
  return {
    name: PANE_OP_ASK_OPEN,
    params: PaneAskOpenParams,
    handler: (ctx, p) =>
      asks.open(ctx.connId, { paneId: ctx.paneId, spec: p.spec, timeoutMs: p.timeoutMs }),
  };
}
