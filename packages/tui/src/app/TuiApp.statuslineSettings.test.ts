import { stringWidth } from "../render/width.js";
import { expect, it, vi } from "vitest";
import { startedApp } from "../testing/appHarness.js";
import { agent, pane, tab, workspace, leaf, snapshot } from "../testing/fixtures.js";
it("opens native statusline settings and saves without PTY leakage", async () => {
  const h = await startedApp({
    snapshot: snapshot({
      workspaces: [workspace("w1", ["t1"])],
      tabs: [tab("t1", "w1", leaf("p1"))],
      panes: [pane("p1", "t1", { agent: agent({ kind: "codex", label: "Codex" }) })],
    }),
    respond: {
      "agent.usage": { panes: {}, accounts: [] },
      "prefs.set": (params: { patch: object }) => ({ prefs: params.patch, rev: 1 }),
    },
  });
  try {
    h.app.renderNow();
    const rows = (await h.screen()).split("\n"), y = rows.findIndex((row) => row.includes("⋮ Codex · codex"));
    expect(y).toBeGreaterThan(0);
    const x = stringWidth(rows[y]!.slice(0, rows[y]!.indexOf("⋮ Codex · codex")));
    h.io.type(`\x1b[<0;${x + 1};${y + 1}M`);
    expect(h.app.ui.dialogContext?.kind).toBe("statuslineSettings");
    h.app.renderNow();
    expect(await h.screen()).toContain("ペイン名");
    h.io.type("\r\r");
    h.app.renderNow();
    await vi.waitFor(() => expect(h.ws.requests("prefs.set").length > 0).toBe(true));
    expect(h.app.prefs.shared.statuslineSettings?.fields.pane).toBe(false);
    expect(h.ws.sent.filter((data) => data instanceof Uint8Array)).toHaveLength(0);
  } finally {
    await h.close();
  }
});
