import {
  GroupAddMemberParams,
  GroupCreateParams,
  GroupDeleteParams,
  GroupRemoveMemberParams,
  GroupRenameParams,
  GroupToggleCollapsedParams,
} from "@sodashitsu/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

/** 手動グループの CRUD（項目単位。`group.create` の `workspaceId`・`add_member`・`remove_member` はその workspace の項目丸ごと。herdr に前例が無い独自拡張。20260923-workspace-grouping。decisions.md D1）。 */
export function registerGroupMethods(surface: ControlSurface, deps: MethodDeps): void {
  surface.register("group.create", {
    schema: GroupCreateParams,
    handler: (_ctx, params) => {
      const group = deps.session.createGroup(params.label, params.workspaceId);
      return { group };
    },
  });

  surface.register("group.rename", {
    schema: GroupRenameParams,
    handler: (_ctx, params) => {
      deps.session.renameGroup(params.groupId, params.label);
      return {};
    },
  });

  surface.register("group.delete", {
    schema: GroupDeleteParams,
    handler: (_ctx, params) => {
      deps.session.deleteGroup(params.groupId);
      return {};
    },
  });

  surface.register("group.add_member", {
    schema: GroupAddMemberParams,
    handler: (_ctx, params) => {
      deps.session.addToGroup(params.workspaceId, params.groupId);
      return {};
    },
  });

  surface.register("group.remove_member", {
    schema: GroupRemoveMemberParams,
    handler: (_ctx, params) => {
      deps.session.removeFromGroup(params.workspaceId);
      return {};
    },
  });

  surface.register("group.toggle_collapsed", {
    schema: GroupToggleCollapsedParams,
    handler: (_ctx, params) => {
      deps.session.toggleGroupCollapsed(params.groupId);
      return {};
    },
  });
}
