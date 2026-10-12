import { expect, it, vi } from "vitest";
import { BuiltinViews } from "./BuiltinViews.js";
import { EventBus } from "../bus/EventBus.js";
import type { SessionService } from "../session/SessionService.js";
import type { DisplayService } from "../display/DisplayService.js";
import type { WorkspaceTools } from "./WorkspaceTools.js";
import { checkDisplaySet } from "@sodashitsu/protocol";
import type { AgentUsageResult } from "@sodashitsu/protocol";
it("statusline follows the active pane for a tab and keeps a pane-scoped line pinned, using the colored HTML surface", async () => {
  const tab = {
    id: "t",
    workspaceId: "w",
    focusedPaneId: "a",
    views: [
      {
        paneId: "anchor",
        display: "status",
        extensionKey: "builtin:workspace",
        viewId: "statusline",
        target: "tab",
        placement: "band-bottom",
      },
      {
        paneId: "a",
        display: "pinned",
        extensionKey: "builtin:workspace",
        viewId: "statusline",
        target: "pane",
        placement: "band-top",
      },
    ],
  };
  const panes = [
    { id: "a", label: "Alpha", agent: { kind: "codex", label: "Codex", state: "working" } },
    { id: "b", label: "Beta", agent: null },
    { id: "anchor", virtual: true },
  ];
  const session = {
    snapshot: () => ({ tabs: [tab], panes, workspaces: [{ id: "w" }] }),
    hasPane: (id: string) => panes.some((p) => p.id === id),
  } as unknown as SessionService;
  const set = vi.fn((_id, body) => {
      expect(checkDisplaySet(body)).toMatchObject({ ok: true });
    }),
    displays = {
      set,
      onOwnedEvent: () => ({ dispose() {} }),
      close: vi.fn(),
    } as unknown as DisplayService;
  const usage = vi.fn(
    async (id: string) =>
      ({
        panes: {
          [id]: {
            paneId: id,
            kind: "codex",
            model: "test-model",
            tokens: { basis: "context", total: 100 },
            contextUsedPct: 42,
          },
        },
        accounts: [{ kind: "codex", label: "codex", windows: [{ label: "5h", usedPct: 25 }] }],
      }) as AgentUsageResult,
  );
  const bus = new EventBus();
  const views = new BuiltinViews(session, displays, bus, {} as WorkspaceTools, usage);
  try {
    views.sync();
    await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(2));
    expect(set.mock.calls.find((c) => c[1].name === "status")?.[1]).toMatchObject({
      format: "html",
      content: expect.stringContaining("Alpha"),
    });
    for (const call of set.mock.calls) expect(checkDisplaySet(call[1])).toMatchObject({ ok: true });
    expect(set.mock.calls[0]?.[1].content).toContain("test-model");
    expect(set.mock.calls[0]?.[1].content).toContain("42%");
    expect(set.mock.calls[0]?.[1].content).toContain('data-soda-color="good">Context');
    expect(set.mock.calls[0]?.[1].content).toContain('data-soda-color="active">working');
    expect(set.mock.calls[0]?.[1].content).toContain("5h");
    set.mockClear();
    tab.focusedPaneId = "b";
    bus.publish({ event: "session.focus_changed", data: {} } as never);
    await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(2));
    expect(set.mock.calls.find((c) => c[1].name === "status")?.[1].content).toContain("Beta");
    expect(set.mock.calls.find((c) => c[1].name === "pinned")?.[1].content).toContain("Alpha");
  } finally {
    views.close();
  }
});
