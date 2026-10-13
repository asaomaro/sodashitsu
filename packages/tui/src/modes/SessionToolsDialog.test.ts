import { chordToKeyInput } from "@sodashitsu/client-core";
import { expect, it, vi } from "vitest";
import type { RequestPort } from "../term/PaneRegistry.js";
import type { UiState } from "../model/UiState.js";
import { Grid } from "../render/Screen.js";
import { ThemeColors } from "../render/color.js";
import { SessionToolsDialog } from "./SessionToolsDialog.js";
const key = (key: string) => chordToKeyInput(key.replace(/^Arrow/, ""))!;
it("keeps the Japanese caret and keyboard-selected notes visible in a small window", async () => {
  const notes = Array.from({ length: 30 }, (_, i) => ({
    id: String(i),
    title: `メモ${String(i).padStart(2, "0")}`,
    body: "日本語".repeat(15) + "終",
    group: "",
    tags: [],
    revision: 1,
    createdAt: 0,
    updatedAt: 30 - i,
  }));
  const redraw = vi.fn(),
    dialog = new SessionToolsDialog(
      "notes",
      "p",
      { toast: vi.fn(), closeDialog: vi.fn() } as unknown as UiState,
      {
        request: async () => ({ kind: "claude", sessionId: "s", notes }),
      } as unknown as RequestPort,
      redraw,
    );
  try {
    await vi.waitFor(() => expect(redraw).toHaveBeenCalled());
    for (let i = 0; i < 5; i++) dialog.handleKey(key("Tab"));
    const grid = new Grid(40, 14),
      theme = new ThemeColors("dracula");
    const cursor = dialog.render({ grid, theme });
    expect(cursor?.visible).toBe(true);
    expect(grid.rowText(cursor!.y)).toContain("終");
    // Shift+Tab back to search then Tab to the sidebar list.
    dialog.handleKey(key("Tab"));
    dialog.handleKey(key("Tab"));
    for (let i = 0; i < 20; i++) dialog.handleKey(key("ArrowDown"));
    dialog.render({ grid, theme });
    expect(Array.from({ length: grid.h }, (_, i) => grid.rowText(i)).join("\n")).toContain(
      "メモ20",
    );
  } finally {
    dialog.dispose();
  }
});
