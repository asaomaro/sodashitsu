import {
  ExtensionListParams,
  ExtensionLogParams,
  ExtensionReloadParams,
  ExtensionRestartParams,
  ExtensionSetEnabledParams,
} from "@sodashitsu/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

/**
 * 拡張（20261007-ext-host）。`list`・`reload`・`restart`・`log` はどの接続からでも呼べる（`reload`・`restart` も `startOne` を通るので、
 * 承認していないものは動かない）。`setEnabled` は画面（`desktop`・`mobile`）だけ（種類の検査は `ExtensionHost` の中）。
 * **`pane.sock` には 1 つも載せない**（`paneOps.register` を足さない）。`deps.extensions` が無ければ登録しない（古い組み立てでは `not_found`）。
 * 利用者の拡張のコマンドは、一覧に含めない（`ExtensionInfo` に項目が無い）。
 */
export function registerExtensionMethods(surface: ControlSurface, deps: MethodDeps): void {
  const extensions = deps.extensions;
  if (!extensions) return;
  surface.register("extension.list", {
    schema: ExtensionListParams,
    handler: () => extensions.list(),
  });
  surface.register("extension.reload", {
    schema: ExtensionReloadParams,
    handler: () => extensions.reload(),
  });
  surface.register("extension.restart", {
    schema: ExtensionRestartParams,
    handler: async (_ctx, p) => {
      await extensions.restart(p.key);
      return {};
    },
  });
  surface.register("extension.log", {
    schema: ExtensionLogParams,
    handler: (_ctx, p) => extensions.log(p.key),
  });
  surface.register("extension.setEnabled", {
    schema: ExtensionSetEnabledParams,
    handler: async (ctx, p) => {
      await extensions.setEnabled(ctx.clientId, p.key, p.enabled);
      return {};
    },
  });
}
