import { LayoutSetSplitRatioParams } from "@sodashitsu/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

export function registerLayoutMethods(surface: ControlSurface, deps: MethodDeps): void {
  surface.register("layout.set_split_ratio", {
    schema: LayoutSetSplitRatioParams,
    handler: (ctx, params) => {
      deps.session.setSplitRatio(params.tabId, params.splitId, params.ratio);
      const tab = deps.session.getTab(params.tabId);
      if (tab) deps.sizeAuthority.noteInteraction(ctx.clientId, tab.focusedPaneId);
      return {};
    },
  });
}
