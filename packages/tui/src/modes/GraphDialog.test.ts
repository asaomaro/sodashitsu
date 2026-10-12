import { it, expect, vi } from "vitest";
import { chordToKeyInput } from "@sodashitsu/client-core";
import { RpcError, type Graph } from "@sodashitsu/protocol";
import { GraphDialog } from "./GraphDialog.js";
import { SessionModel } from "../model/SessionModel.js";
import { UiState } from "../model/UiState.js";
import { pane, tab, workspace, leaf } from "../testing/fixtures.js";
import { Grid } from "../render/Screen.js";
import { ThemeColors } from "../render/color.js";
import type { RequestPort } from "../term/PaneRegistry.js";

function setup(mode: "link" | "pane", linkId?: string) {
  const model = new SessionModel(),
    ui = new UiState(model);
  model.workspaces.set("w", workspace("w", ["t"]));
  model.tabs.set("t", tab("t", "w", leaf("a")));
  model.panes.set("a", pane("a", "t", { label: "Worker" }));
  model.panes.set("b", pane("b", "t", { label: "Boss" }));
  const graph: Graph = {
    rev: 4,
    paused: false,
    nodes: [
      { key: "local:a", x: 0, y: 0 },
      { key: "local:b", x: 0, y: 0 },
    ],
    links: [],
  };
  if (linkId)
    graph.links.push({
      id: linkId,
      kind: "supervise",
      from: "local:a",
      to: "local:b",
      count: 0,
      limit: 10,
      paused: null,
    });
  const request = vi.fn(async (method: string, _params?: unknown) => {
    if (method === "graph.get" || method === "graph.update") return graph;
    if (method === "agent.kinds")
      return { kinds: [{ kind: "codex", label: "Codex", available: true }] };
    if (method === "pane.split") {
      graph.nodes.push({ key: "local:new", x: 0, y: 0 });
      model.panes.set("new", pane("new", "t"));
      return { pane: model.panes.get("new") };
    }
    return {};
  });
  const ctx = {
    kind: "graphEdit" as const,
    mode,
    nodeKey: "local:a" as const,
    ...(linkId ? { linkId } : {}),
  };
  ui.openDialogWithContext(ctx);
  const dialog = new GraphDialog(
    ctx,
    model,
    ui,
    { request } as unknown as RequestPort,
    () => {},
    () => ({ policy: "path", path: "/project" }),
  );
  const key = (chord: string) => dialog.handleKey(chordToKeyInput(chord)!);
  const tabs = (n: number) => {
    for (let i = 0; i < n; i++) key("Tab");
  };
  const render = () => {
    const grid = new Grid(100, 30);
    dialog.render({ grid, theme: new ThemeColors("dracula") });
    return Array.from({ length: grid.h }, (_, i) => grid.rowText(i)).join("\n");
  };
  return { model, ui, graph, request, dialog, key, tabs, render };
}
it("saves a trigger with condition, prompt, context, busy mode and limit using the latest revision", async () => {
  const s = setup("link");
  try {
    await vi.waitFor(() => expect(s.render()).toContain("トリガの指示文"));
    s.tabs(3);
    s.key("right");
    s.tabs(1);
    s.dialog.handlePaste("次の工程を実行");
    s.tabs(1);
    s.key("ctrl+u");
    s.dialog.handlePaste("50");
    s.tabs(1);
    s.key("right");
    s.tabs(3);
    s.key("ctrl+u");
    s.dialog.handlePaste("20");
    s.tabs(1);
    s.key("Enter");
    await vi.waitFor(() =>
      expect(s.request).toHaveBeenCalledWith("graph.update", {
        baseRev: 4,
        ops: [
          {
            op: "add_link",
            from: "local:a",
            to: "local:b",
            kind: "trigger",
            limit: 20,
            trigger: {
              on: "blocked",
              prompt: "次の工程を実行",
              output: { lines: 50 },
              whenBusy: "skip",
            },
          },
        ],
      }),
    );
    await vi.waitFor(() => expect(s.ui.dialogContext).toBeNull());
  } finally {
    s.dialog.dispose();
  }
});
it("edits and removes an existing connection without changing its endpoints", async () => {
  const s = setup("link", "link");
  try {
    await vi.waitFor(() => expect(s.render()).toContain("連携を削除"));
    s.tabs(9);
    s.key("ctrl+u");
    s.dialog.handlePaste("30");
    s.tabs(1);
    s.key("Enter");
    await vi.waitFor(() =>
      expect(s.request).toHaveBeenCalledWith("graph.update", {
        baseRev: 4,
        ops: [{ op: "update_link", id: "link", limit: 30 }],
      }),
    );
  } finally {
    s.dialog.dispose();
  }
  const r = setup("link", "link");
  try {
    await vi.waitFor(() => expect(r.render()).toContain("連携を削除"));
    r.tabs(11);
    r.key("Enter");
    await vi.waitFor(() =>
      expect(r.request).toHaveBeenCalledWith("graph.update", {
        baseRev: 4,
        ops: [{ op: "remove_link", id: "link" }],
      }),
    );
  } finally {
    r.dialog.dispose();
  }
});
it("adds an agent pane in the selected tab, retries shell readiness, and reuses it if supervision fails", async () => {
  const s = setup("pane");
  let starts = 0,
    updates = 0;
  const original = s.request.getMockImplementation()!;
  s.request.mockImplementation(async (method, ...args) => {
    if (method === "agent.start" && starts++ === 0)
      throw new RpcError("agent_pane_busy", "shell preparing");
    if (method === "graph.update" && updates++ === 0) throw new RpcError("rev_conflict", "changed");
    return original(method, ...args);
  });
  try {
    await vi.waitFor(() => expect(s.render()).toContain("端末 / エージェント"));
    s.tabs(1);
    s.key("right");
    s.tabs(2);
    s.key("right");
    s.tabs(1);
    s.key("Enter");
    await vi.waitFor(() => expect(s.render()).toContain("ペイン追加済み"));
    s.tabs(2);s.key('right');s.tabs(1);s.dialog.handlePaste('wrong-name');s.tabs(2);
    expect(s.render()).toContain('Codex (固定)');
    expect(s.render()).not.toContain('wrong-name');
    s.key("Enter");
    await vi.waitFor(() => expect(s.ui.dialogContext).toBeNull());
    expect(s.request.mock.calls.filter((c) => c[0] === "pane.split")).toHaveLength(1);
    expect(s.request.mock.calls.filter((c) => c[0] === "agent.start")).toHaveLength(2);
    expect(s.request).toHaveBeenCalledWith("agent.start", {
      paneId: "new",
      kind: "codex",
      name: "codex-1",
      args: [],
    });
    expect(s.request).toHaveBeenCalledWith("graph.update", {
      baseRev: 4,
      ops: [{ op: "add_link", kind: "supervise", from: "local:new", to: "local:a" }],
    });
  } finally {
    s.dialog.dispose();
  }
});
