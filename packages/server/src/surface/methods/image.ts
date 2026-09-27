import {
  PaneImageBeginParams,
  PaneImageCancelParams,
  PaneImageChunkParams,
  PaneImageCommitParams,
} from "@wtm/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

/**
 * クリップボードの画像の貼り付け（20260927-clipboard-image-paste。herdr の `remote_image_paste`）。画像は分けて送られ（decisions D3）、
 * 置き場所・名前はサーバが決める（方式に path・name は無い）。パスの入力はブラウザが行う（D4）。`deps.images` が無ければ登録しない。
 */
export function registerImageMethods(surface: ControlSurface, deps: MethodDeps): void {
  const images = deps.images;
  if (!images) return;
  surface.register("pane.image.begin", {
    schema: PaneImageBeginParams,
    handler: (ctx, params) => images.begin(ctx.clientId, params),
  });
  surface.register("pane.image.chunk", {
    schema: PaneImageChunkParams,
    handler: (ctx, params) => {
      images.chunk(ctx.clientId, params);
      return {};
    },
  });
  surface.register("pane.image.commit", {
    schema: PaneImageCommitParams,
    handler: (ctx, params) => images.commit(ctx.clientId, params.uploadId),
  });
  surface.register("pane.image.cancel", {
    schema: PaneImageCancelParams,
    handler: (ctx, params) => {
      images.cancel(ctx.clientId, params.uploadId);
      return {};
    },
  });
}
