import { expect, it } from "vitest";
import { startedApp } from "../testing/appHarness.js";
import { agent, leaf, pane, snapshot, tab, workspace } from "../testing/fixtures.js";
import type { SidebarHit } from "../render/chrome/sidebar.js";
const mouse = (button: number, x: number, y: number, up = false) =>
  `\x1b[<${button};${x + 1};${y + 1}${up ? "m" : "M"}`;
it("scrolls Spaces and Agents independently by thumb drag without switching workspace or resizing sidebar", async () => {
  const ids = Array.from({ length: 30 }, (_, i) => `w${i}`);
  const h = await startedApp({
    snapshot: snapshot({
      workspaces: ids.map((id) => workspace(id, [`t-${id}`], { label: `Workspace-${id}` })),
      tabs: ids.map((id) => tab(`t-${id}`, id, leaf(`p-${id}`))),
      panes: ids.map((id) =>
        pane(`p-${id}`, `t-${id}`, { agent: agent({ label: `Agent-${id}` }) }),
      ),
    }),
  });
  try {
    h.app.prefs.setLocal({ sidebarSpacesRows: 9 });
    h.app.renderNow();
    const initialWorkspace = h.app.model.workspaceId,
      initialCols = h.app.prefs.sidebarCols;
    const hits = () => (h.app as unknown as { sidebarHits: SidebarHit[] }).sidebarHits;
    const bar = (section: "spaces" | "agents") =>
      hits().find(
        (hit): hit is Extract<SidebarHit, { kind: "sidebarScrollbar" }> =>
          hit.kind === "sidebarScrollbar" && hit.section === section,
      )!;
    const spaces = bar("spaces");
    expect(spaces).toBeDefined();
    h.io.type(mouse(0, spaces.x, spaces.y));
    h.io.type(mouse(32, spaces.x, spaces.track.y + spaces.track.h - 1));
    h.app.renderNow();
    h.io.type(mouse(0, spaces.x, spaces.track.y + spaces.track.h - 1, true));
    h.app.renderNow();
    expect(await h.screen()).toContain("Workspace-w29");
    const spaceOffset = bar("spaces").metrics.offsetFromBottom;
    const agents = bar("agents");
    expect(agents).toBeDefined();
    h.io.type(mouse(0, agents.x, agents.y));
    h.io.type(mouse(32, agents.x, agents.track.y + agents.track.h - 1));
    h.app.renderNow();
    h.io.type(mouse(0, agents.x, agents.track.y + agents.track.h - 1, true));
    h.app.renderNow();
    expect(await h.screen()).toContain("Agent-w29");
    expect(bar("spaces").metrics.offsetFromBottom).toBe(spaceOffset);
    expect(h.app.model.workspaceId).toBe(initialWorkspace);
    expect(h.app.prefs.sidebarCols).toBe(initialCols);
  } finally {
    await h.close();
  }
});

it.each(["right", "band-top"] as const)(
  "docked %s scrollbar keeps capture outside the view and releases without resizing",
  async (placement) => {
    const view = {
      id: "files",
      extensionKey: "builtin:workspace",
      viewId: "files",
      target: "tab" as const,
      placement,
      paneId: "anchor",
      display: "files",
    };
    const t = tab("t1", "w1", leaf("p1"), { views: [view] });
    const h = await startedApp({
      cols: 120,
      snapshot: snapshot({
        workspaces: [workspace("w1", ["t1"], { projectDir: "/pj" })],
        tabs: [t],
        panes: [pane("p1", "t1"), pane("anchor", "t1", { virtual: true })],
      }),
      respond: {
        "workspace.tools": () => ({
          entries: Array.from({ length: 80 }, (_, i) => ({
            name: `FILE-${i}`,
            path: `FILE-${i}`,
            directory: false,
            link: false,
          })),
        }),
      },
    });
    try {
      const { vi } = await import("vitest");
      await vi.waitFor(async () => {
        h.app.renderNow();
        expect(await h.screen()).toContain("FILE-0");
      });
      const app = h.app as unknown as {
        lastLayout: import("../layout/computeLayout.js").LayoutResult;
        dockedViews: {
          contentRect(
            r: import("../render/Screen.js").Rect,
            v: typeof view,
          ): import("../render/Screen.js").Rect;
          release(): void;
        };
      };
      const frame = { ...app.lastLayout.panes.find((p) => p.paneId === "view:files")!.frame };
      const content = app.dockedViews.contentRect(frame, view);
      const x = content.x + content.w - 1,
        y = content.y + 1;
      h.io.type(mouse(0, x, y));
      h.io.type(mouse(32, 1, 29));
      h.io.type(mouse(0, 1, 29, true));
      h.app.renderNow();
      const bottom = await h.screen();
      expect(bottom).toContain("FILE-79");
      expect(app.lastLayout.panes.find((p) => p.paneId === "view:files")!.frame).toEqual(frame);
      // Release outside the content must end capture; a subsequent move must not scroll.
      h.io.type(mouse(35, x, y));
      h.app.renderNow();
      expect(await h.screen()).toBe(bottom);
      // Cancel while captured through the same path used when another window opens.
      h.io.type(mouse(0, x, content.y + content.h - 2));
      app.dockedViews.release();
      h.io.type(mouse(35, x, y));
      h.app.renderNow();
      expect(await h.screen()).toContain("FILE-79");
    } finally {
      await h.close();
    }
  },
);
