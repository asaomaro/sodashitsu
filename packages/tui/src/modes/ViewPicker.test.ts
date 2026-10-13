import { expect, it, vi } from "vitest";
import { chordToKeyInput } from "@sodashitsu/client-core";
import { ViewPicker } from "./ViewPicker.js";
import { SessionModel } from "../model/SessionModel.js";
import { UiState } from "../model/UiState.js";
import { tab, leaf, workspace } from "../testing/fixtures.js";
import { Grid } from "../render/Screen.js";
import { ThemeColors } from "../render/color.js";
import type { RequestPort } from "../term/PaneRegistry.js";
it("pane picker excludes workspace builtins and tab-only plugins while allowing a pane float", async () => {
  const model = new SessionModel();
  model.tabs.set("t", tab("t", "w", leaf("p")));
  model.workspaces.set("w", workspace("w", ["t"], { projectDir: "/pj" }));
  const request = vi.fn(async (method: string) =>
    method === "extension.list"
      ? {
          extensions: [
            {
              key: "plugin",
              id: "plugin",
              scope: "user",
              state: "running",
              views: [
                {
                  id: "pane",
                  title: "ペインの会話",
                  targets: ["pane"],
                  terminal: { format: "markdown" },
                  placements: ["float"],
                },
                { id: "web", title: "Webのみ", targets: ["pane"], placements: ["float"] },
                { id: "all", title: "タブの制作", targets: ["tab"], placements: ["left"] },
              ],
            },
          ],
        }
      : { id: "instance", placement: "float" },
  );
  const added = vi.fn(),
    picker = new ViewPicker(
      "t",
      "p",
      model,
      new UiState(model),
      { request } as unknown as RequestPort,
      () => {},
      added,
    );
  await new Promise((r) => setTimeout(r, 0));
  const grid = new Grid(80, 24);
  picker.render({ grid, theme: new ThemeColors("dracula") });
  const screen = Array.from({ length: grid.h }, (_, y) => grid.rowText(y)).join("\n");
  expect(screen).toContain("ペインの会話");
  expect(screen).not.toContain("Statusline");
  expect(screen).not.toContain("Webのみ");
  expect(screen).not.toContain("ファイルツリー");
  expect(screen).not.toContain("タブの制作");
  picker.handleKey(chordToKeyInput("Enter")!);
  picker.handleKey(chordToKeyInput("Enter")!);
  await new Promise((r) => setTimeout(r, 0));
  expect(request).toHaveBeenCalledWith(
    "tab.add_view",
    expect.objectContaining({ viewId: "pane", target: "pane", paneId: "p", placement: "float" }),
  );
  expect(added).toHaveBeenCalled();
  picker.dispose();
});
it("clicking a scrolled candidate selects the visible item", async () => {
  const model = new SessionModel();
  model.tabs.set("t", tab("t", "w", leaf("p")));
  const request = vi.fn(async (method: string) =>
    method === "extension.list"
      ? {
          extensions: [
            {
              key: "plugin",
              scope: "user",
              state: "running",
              views: Array.from({ length: 12 }, (_, i) => ({
                id: "v" + i,
                title: "C" + String(i).padStart(2, "0"),
                targets: ["pane"],
                terminal: { format: "markdown" },
                placements: ["float"],
                requiresProject: false,
              })),
            },
          ],
        }
      : {},
  );
  const picker = new ViewPicker(
    "t",
    "p",
    model,
    new UiState(model),
    { request } as unknown as RequestPort,
    () => {},
    () => {},
  );
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < 9; i++) picker.handleKey(chordToKeyInput("Down")!);
  const grid = new Grid(80, 10);
  picker.render({ grid, theme: new ThemeColors("dracula") });
  const row = Array.from({ length: grid.h }, (_, y) => grid.rowText(y)).findIndex((s) =>
    s.includes("C06"),
  );
  expect(row).toBeGreaterThan(0);
  picker.handleMouse({ action: "down", button: 0, x: 12, y: row });
  picker.handleKey(chordToKeyInput("Enter")!);
  await new Promise((r) => setTimeout(r, 0));
  expect(request).toHaveBeenCalledWith("tab.add_view", expect.objectContaining({ viewId: "v6" }));
  picker.dispose();
});
