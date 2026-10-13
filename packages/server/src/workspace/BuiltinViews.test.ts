import { expect, it, vi } from "vitest";
import { BuiltinViews } from "./BuiltinViews.js";
import { EventBus } from "../bus/EventBus.js";
import type { SessionService } from "../session/SessionService.js";
import type { DisplayService } from "../display/DisplayService.js";
import type { WorkspaceTools } from "./WorkspaceTools.js";
import { checkDisplaySet } from "@sodashitsu/protocol";
it("still renders workspace tools after the standard pane statusline no longer uses display surfaces", () => {
  const tab = {
    id: "t",
    workspaceId: "w",
    views: [
      {
        paneId: "anchor",
        display: "files",
        extensionKey: "builtin:workspace",
        viewId: "files",
        target: "tab",
        placement: "left",
      },
    ],
  };
  const session = {
    snapshot: () => ({ tabs: [tab], workspaces: [{ id: "w", projectDir: "/pj" }] }),
    hasPane: () => true,
  } as unknown as SessionService;
  const set = vi.fn(),
    displays = {
      set,
      onOwnedEvent: () => ({ dispose() {} }),
      close: vi.fn(),
    } as unknown as DisplayService;
  const views = new BuiltinViews(session, displays, new EventBus(), {} as WorkspaceTools);
  try {
    views.sync();
    expect(set).toHaveBeenCalledOnce();
    expect(checkDisplaySet(set.mock.calls[0]![1])).toMatchObject({ ok: true });
    expect(set.mock.calls[0]![1]).toMatchObject({ title: "ファイルツリー", dock: "left" });
  } finally {
    views.close();
  }
});
