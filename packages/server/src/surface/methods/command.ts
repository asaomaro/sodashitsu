import {
  CommandListParams,
  CommandPopupCloseParams,
  CommandReloadParams,
  CommandRunParams,
  RpcError,
} from "@sodashitsu/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

/**
 * 独自コマンド（20260927-custom-command-keys。herdr の `command.invoke` 相当）。認証済みの WebSocket でだけ届く（`/ws` の upgrade が Cookie と Origin を
 * 検査する）。**コマンドの文字列は要求に無い**——`command.run` は id・pane・popup の大きさだけで、サーバは `commands.json` の定義を引く。
 * 係（`deps.commands`）が無い組み立て（テスト等）では一覧は空・読み直しも空・走らせるのは `command_not_found`。
 */
export function registerCommandMethods(surface: ControlSurface, deps: MethodDeps): void {
  surface.register("command.list", {
    schema: CommandListParams,
    handler: () => deps.commands?.list() ?? { commands: [], problem: null },
  });

  surface.register("command.reload", {
    schema: CommandReloadParams,
    handler: async () =>
      deps.commands ? await deps.commands.reload() : { commands: [], problem: null },
  });

  surface.register("command.run", {
    schema: CommandRunParams,
    handler: async (ctx, params) => {
      if (!deps.commands)
        throw new RpcError("command_not_found", `custom command not found: ${params.commandId}`);
      deps.clients.touch(ctx.clientId); // 起動の猶予より前に（色の問い合わせの答え。pane.split と同じ）
      const result = await deps.commands.run(ctx.clientId, params);
      if (result.type === "pane") deps.sizeAuthority.noteInteraction(ctx.clientId, result.pane.id);
      return result;
    },
  });

  surface.register("command.popup_close", {
    schema: CommandPopupCloseParams,
    handler: (ctx, params) => {
      if (!deps.commands) throw new RpcError("not_found", `popup not found: ${params.popupId}`);
      deps.commands.closePopup(ctx.clientId, params.popupId);
      return {};
    },
  });
}
