import type { z } from "zod";
import { AskFeaturesParams, PANE_OP_ASK_FEATURES, PANE_OP_ASK_OPEN, PaneAskOpenParams, type AskFeatures } from "@sodashitsu/protocol";
import type { AskService } from "../ask/AskService.js";
import type { PaneOpDef } from "./PaneOpRegistry.js";

/**
 * ログイン不要の受け口（`pane.sock`）に載せる `ask.open`（20261003-sodactl-ask-socket の design「サーバ: ask の操作」）。
 * `/ws` の `ask.open` と同じ `AskService` を通すので、総数・「1 つの pane に同時に 1 つ」は `/ws` の質問と合わせて数える。
 *
 * - 対象の pane は受け口の共通の欄（実在を確かめた後の `ctx.paneId`）。引数は `/ws` と同じ schema から `paneId` を除いた `{spec, timeoutMs}`。
 * - 持ち主は接続ごとの名前（`ctx.connId`＝`pane-socket:<連番>`）。接続が終わったら（`ctx.signal` の abort）、ここで
 *   `asks.onClientGone(connId)` を呼んで取り消す（登録の外の配線は要らない。返事を書いた後の abort なら、質問はもう無いので何も起きない）。
 * - `AskService.open` の検査の誤り（`invalid_ask_spec`・`ask_busy` 等）は同期の throw。`PaneOpRegistry.invoke` が `try` の中で呼んで拾う。
 */
export function askOpenOp(
  asks: Pick<AskService, "open" | "onClientGone">,
): PaneOpDef<z.infer<typeof PaneAskOpenParams>> {
  return {
    name: PANE_OP_ASK_OPEN,
    params: PaneAskOpenParams,
    handler: (ctx, p) => {
      // 検査の誤りで投げたら質問は出ていない（取り消すものが無い）ので、listener は `open` の後に付ける。
      const result = asks.open(ctx.connId, {
        paneId: ctx.paneId,
        spec: p.spec,
        timeoutMs: p.timeoutMs,
      });
      // この listener は投げないこと: abort の listener の例外は受け口では捕まえられず、uncaughtException（`soda serve` ごと落ちる）になる。
      // `onClientGone` は投げない（イベントの配信は中で捕まえている）。
      const cancel = (): void => asks.onClientGone(ctx.connId);
      if (ctx.signal.aborted) cancel();
      else ctx.signal.addEventListener("abort", cancel, { once: true });
      return result;
    },
  };
}

/** 機能確認（`ask.features`。20261004-ask-media-popup）。ログイン不要の受け口でも読める（定義も回答も含まない）。 */
export function askFeaturesOp(asks: Pick<AskService, "features">): PaneOpDef<z.infer<typeof AskFeaturesParams>> {
  return {
    name: PANE_OP_ASK_FEATURES,
    params: AskFeaturesParams,
    handler: (): AskFeatures => asks.features(),
  };
}
