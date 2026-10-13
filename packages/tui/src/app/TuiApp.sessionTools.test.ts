import { expect, it, vi } from "vitest";
import { startedApp } from "../testing/appHarness.js";
import { pane, tab, workspace, leaf, snapshot, agent } from "../testing/fixtures.js";
it("opens notes from the pane menu, saves multiline text and opens a menu-only read-only todo without PTY input", async () => {
  const data = { kind: "claude", sessionId: "s1", notes: [] };
  const h = await startedApp({
    snapshot: snapshot({
      workspaces: [workspace("w1", ["t1"])],
      tabs: [tab("t1", "w1", leaf("p1"))],
      panes: [
        pane("p1", "t1", {
          agent: agent(),
          agentSession: { kind: "claude", sessionId: "s1", reportedAt: 0 },
        }),
      ],
    }),
    respond: {
      "agent.notes": () => data,
      "agent.note_save": (params: any) => ({
        ...data,
        notes: [{ ...params, id: "n1", revision: 1, createdAt: 0, updatedAt: 0 }],
      }),
      "agent.todos": () => ({
        kind: "claude",
        sessionId: "s1",
        items: [{ id: "1", text: "検証作業", status: "in_progress" }],
        partial: false,
      }),
    },
  });
  try {
    h.app.prefs.shared.agentActionSettings = {
      notes: "display",
      todos: "menu",
      messages: "hidden",
      summary: "hidden",
      compact: "hidden",
      clear: "hidden",
      usage: "hidden",
      permissions: "hidden",
      fork: "hidden",
    };
    const actions = (h.app as any).dispatcher;
    expect(actions.agentActionsFor("p1")).toEqual(["notes"]);
    expect(actions.agentActionsFor("p1", true)).toEqual(["notes", "todos"]);
    actions.agentPaneAction("p1", "notes");
    h.app.renderNow();
    await vi.waitFor(() => expect(h.ws.requests("agent.notes")).toHaveLength(1));
    await vi.waitFor(async () => {
      h.app.renderNow();
      expect(await h.screen()).not.toContain("処理中");
    });
    h.io.type("\x0e");
    h.io.type("title\tgroup\ttag\tbody\rsecond line\x13");
    await vi.waitFor(() => expect(h.ws.requests("agent.note_save")).toHaveLength(1));
    expect(h.ws.requests("agent.note_save")[0]!.params).toMatchObject({
      title: "title",
      group: "group",
      tags: ["tag"],
      body: "body\nsecond line",
      sessionId: "s1",
    });
    await vi.waitFor(() => expect(h.app.ui.dialogContext).not.toBeNull());
    h.io.type("\x1b");
    await vi.waitFor(() => expect(h.app.ui.dialogContext).toBeNull());
    actions.agentPaneAction("p1", "todos");
    h.app.renderNow();
    await vi.waitFor(() => expect(h.ws.requests("agent.todos")).toHaveLength(1));
    h.app.renderNow();
    await vi.waitFor(async () => {
      h.app.renderNow();
      expect(await h.screen()).toContain("検証作業");
    });
    expect(h.ws.sent.filter((d) => d instanceof Uint8Array)).toHaveLength(0);
  } finally {
    await h.close();
  }
});
