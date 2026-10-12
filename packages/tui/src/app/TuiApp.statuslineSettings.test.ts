import { expect, it, vi } from "vitest";
import { startedApp } from "../testing/appHarness.js";
import { pane, tab, workspace, leaf, snapshot } from "../testing/fixtures.js";
it("opens statusline settings from its view menu and saves a toggle without PTY leakage", async () => {
  const t = tab("t1", "w1", leaf("p1"), {
    views: [
      {
        id: "status",
        extensionKey: "builtin:workspace",
        viewId: "statusline",
        target: "tab",
        placement: "band-bottom",
        paneId: "anchor",
        display: "status",
      },
    ],
  });
  const h = await startedApp({
    snapshot: snapshot({
      workspaces: [workspace("w1", ["t1"])],
      tabs: [t],
      panes: [pane("p1", "t1"), pane("anchor", "t1", { virtual: true })],
    }),
    respond: { "prefs.set": (params: { patch: object }) => ({ prefs: params.patch, rev: 1 }) },
  });
  try {
    h.app.renderNow();
    const views = (
      h.app as unknown as {
        dockedViews: { menuItems(id: string): { label: string; run(): void }[] };
      }
    ).dockedViews;
    const item = views.menuItems("status").find((item) => item.label === "Statuslineの設定…")!;
    expect(item).toBeDefined();
    item.run();
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
