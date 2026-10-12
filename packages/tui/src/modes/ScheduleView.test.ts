import { expect, it, vi } from "vitest";
import { ScheduleView } from "./ScheduleView.js";
import { SessionModel } from "../model/SessionModel.js";
import { UiState } from "../model/UiState.js";
import { workspace } from "../testing/fixtures.js";
import { chordToKeyInput } from "@sodashitsu/client-core";
import type { RequestPort } from "../term/PaneRegistry.js";
import { Grid } from "../render/Screen.js";
import { ThemeColors } from "../render/color.js";
it("editing retains workspace identity when another workspace disappears and saves multiline input", async () => {
  const model = new SessionModel();
  model.workspaces.set("a", workspace("a", []));
  model.workspaces.set("b", workspace("b", []));
  model.workspaceId = "b";
  const request = vi.fn(async (method: string) =>
      method === "schedule.list" ? { jobs: [], runs: [] } : {},
    ),
    view = new ScheduleView(
      model,
      new UiState(model),
      { request } as unknown as RequestPort,
      () => {},
    );
  const key = (chord: string) => view.handleKey(chordToKeyInput(chord)!);
  key("n");
  view.handlePaste("name");
  for (let i = 0; i < 7; i++) key("Tab");
  view.handlePaste("line1\nline2");
  model.workspaces.delete("a");
  key("Ctrl+s");
  await vi.waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      "schedule.save",
      expect.objectContaining({
        job: expect.objectContaining({
          action: { type: "command", workspaceId: "b", command: "line1\nline2" },
        }),
      }),
    ),
  );
  view.dispose();
});
it("a removed target cannot silently turn into another target and multiline body is visible", async () => {
  const model = new SessionModel();
  model.workspaces.set("a", workspace("a", []));
  model.workspaces.set("b", workspace("b", []));
  model.workspaceId = "a";
  const request = vi.fn(async () => ({ jobs: [], runs: [] }));
  const view = new ScheduleView(
    model,
    new UiState(model),
    { request } as unknown as RequestPort,
    () => {},
  );
  const key = (chord: string) => view.handleKey(chordToKeyInput(chord)!);
  key("n");
  view.handlePaste("name");
  for (let i = 0; i < 7; i++) key("Tab");
  view.handlePaste("line1\nline2");
  const grid = new Grid(80, 30);
  expect(view.render(grid, { x: 0, y: 0, w: 80, h: 30 }, new ThemeColors("dracula")).visible).toBe(
    true,
  );
  expect(Array.from({ length: 30 }, (_, y) => grid.rowText(y)).join("\n")).toContain("line2");
  model.workspaces.delete("a");
  key("Ctrl+s");
  await new Promise((r) => setTimeout(r, 0));
  expect(request).not.toHaveBeenCalledWith("schedule.save", expect.anything());
  view.dispose();
});
