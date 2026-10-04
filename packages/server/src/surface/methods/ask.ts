import { AskAnswerParams, AskCancelParams, AskFeaturesParams, AskGetParams, AskMediaParams, AskOpenParams, AskSubscribeParams } from "@sodashitsu/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

/**
 * 質問のフォーム（`sodactl ask`。20261002-sodactl-ask）。`ask.open` は結果が決まるまで応答しない長い要求（pane のプログラムが待つ）。
 * `ask.subscribe`・`ask.get`・`ask.answer`・`ask.cancel` は画面（desktop / mobile）が使う。`deps.asks` が無ければ登録しない。
 */
export function registerAskMethods(surface: ControlSurface, deps: MethodDeps): void {
  const asks = deps.asks;
  if (!asks) return;
  surface.register("ask.open", {
    schema: AskOpenParams,
    handler: (ctx, params) => asks.open(ctx.clientId, params),
  });
  surface.register("ask.subscribe", {
    schema: AskSubscribeParams,
    handler: (ctx) => ({ asks: asks.subscribe(ctx.clientId) }),
  });
  surface.register("ask.get", {
    schema: AskGetParams,
    handler: (ctx, params) => asks.get(ctx.clientId, params.askId),
  });
  surface.register("ask.media", {
    schema: AskMediaParams,
    handler: (ctx, params) => asks.media(ctx.clientId, params.askId, params.id, params.offset),
  });
  // 機能確認（20261004-ask-media-popup）。どの接続でも読める（定義も回答も含まない）。古いサーバは「知らない方式」を返す。
  surface.register("ask.features", {
    schema: AskFeaturesParams,
    handler: () => asks.features(),
  });
  surface.register("ask.answer", {
    schema: AskAnswerParams,
    handler: (ctx, params) => {
      asks.answer(ctx.clientId, params);
      return {};
    },
  });
  surface.register("ask.cancel", {
    schema: AskCancelParams,
    handler: (ctx, params) => {
      asks.cancel(ctx.clientId, params.askId);
      return {};
    },
  });
}
