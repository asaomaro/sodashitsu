import { it, expect, vi } from "vitest";
import { chordToKeyInput } from "@sodashitsu/client-core";
import { ConnectionsView } from "./ConnectionsView.js";
import { UiState } from "../model/UiState.js";
import { SessionModel } from "../model/SessionModel.js";
import type { RequestPort } from "../term/PaneRegistry.js";
import { Grid } from "../render/Screen.js";
import { ThemeColors } from "../render/color.js";
function setup() {
  const request = vi.fn(async (method: string) => {
    if (method === "machine.connections")
      return {
        connections: Array.from({ length: 30 }, (_, i) => ({
          id: String(i),
          label: `PC ${i}`,
          enabled: true,
          transport: "ssh",
          state: "online",
          message: null,
        })),
      };
    if (method === "machine.delegations") return { delegations: [] };
    if (method === "machine.pairing_requests") return { requests: [] };
    throw Error("接続先URLが不正です");
  });
  const view = new ConnectionsView(
    new UiState(new SessionModel()),
    { request } as unknown as RequestPort,
    () => {},
  );
  const draw = () => {
    const grid = new Grid(100, 30);
    view.render(grid, { x: 2, y: 3, w: 80, h: 15 }, new ThemeColors("dracula"));
    return grid.ch.join("");
  };
  return { view, request, draw };
}
it("keeps operation failures visible instead of erasing them with an immediate refresh", async () => {
  const { view, draw } = setup();
  try {
    view.handleKey(chordToKeyInput("n")!);
    view.handlePaste("https://bad.example");
    view.handleKey(chordToKeyInput("Tab")!);
    view.handlePaste("office");
    view.handleKey(chordToKeyInput("Enter")!);
    await vi.waitFor(() => expect(draw()).toContain("接続先URLが不正です"));
  } finally {
    view.dispose();
  }
});
it("wheel scrolling changes rendered rows instead of snapping back to the selected row", async () => {
  const { view, draw } = setup();
  try {
    await view.refresh();
    const before = draw();
    view.handleMouse({ action: "wheel", button: 65, x: 5, y: 9 });
    expect(draw()).not.toBe(before);
  } finally {
    view.dispose();
  }
});
