import {
  ExtensionApproveParams,
  ExtensionDenyParams,
  ExtensionListParams,
  ExtensionLogParams,
  ExtensionReloadParams,
  ExtensionRestartParams,
  ExtensionRevokeParams,
  ExtensionSetEnabledParams,
} from "@sodashitsu/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

/**
 * 拡張（20261007-ext-host）。`list`・`reload`・`restart`・`log` はどの接続からでも呼べる（`reload`・`restart` も `startOne` を通るので、
 * 承認していないものは動かない）。`approve`・`deny`・`revoke` は画面だけ。`setEnabled` は画面（`desktop`・`mobile`）だけ（種類の検査は `ExtensionHost` の中）。
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
  // プロジェクトの拡張の承認（20261007-ext-host PR3）。**画面（`desktop`・`mobile`）だけ**（種類の検査は `ExtensionHost` の中）。`sodactl ext` に承認は無く、
  // `pane.sock` にも載せない。中継越し（`viaBridge`）の接続も、画面の種類なら受ける（別のマシンの拡張を、手元の画面から承認できる）。
  surface.register("extension.approve", {
    schema: ExtensionApproveParams,
    handler: async (ctx, p) => {
      await extensions.approve(ctx.clientId, p.key, p.digest);
      return {};
    },
  });
  surface.register("extension.deny", {
    schema: ExtensionDenyParams,
    handler: async (ctx, p) => {
      await extensions.deny(ctx.clientId, p.key, p.digest);
      return {};
    },
  });
  surface.register("extension.revoke", {
    schema: ExtensionRevokeParams,
    handler: async (ctx, p) => {
      await extensions.revoke(ctx.clientId, p.root, p.id);
      return {};
    },
  });
}
