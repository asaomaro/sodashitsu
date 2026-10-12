import { expect, it, vi } from "vitest";
import { PluginPackages } from "./PluginPackages.js";
import { UiState } from "../model/UiState.js";
import { SessionModel } from "../model/SessionModel.js";
import { chordToKeyInput } from "@sodashitsu/client-core";
import { Grid } from "../render/Screen.js";
import { ThemeColors } from "../render/color.js";
const candidate = {
  key: "a".repeat(64),
  digest: "b".repeat(64),
  name: "Demo",
  version: "1.0.0",
  id: "demo",
  scope: "user",
  root: "/home/test",
  path: "/home/" + "long/".repeat(35) + "demo.sodaplugin",
  description: "",
  allow: ["script-html"],
  files: 1,
};
it("requires reading wrapped review details before native registration and refuses tiny screens", async () => {
  const request = vi.fn(async (method: string) =>
    method === "plugin.discover" ? { candidates: [candidate] } : {},
  );
  const dialog = new PluginPackages(
    new UiState(new SessionModel()),
    { request } as never,
    () => {},
  );
  await new Promise((r) => setTimeout(r, 0));
  const key = (s: string) => dialog.handleKey(chordToKeyInput(s)!);
  key("Enter");
  const render = (w = 60, h = 18) => {
    const grid = new Grid(w, h);
    dialog.render({ grid, theme: new ThemeColors("dracula") });
    return grid;
  };
  render(30, 8);
  key("Enter");
  expect(request).toHaveBeenCalledTimes(1);
  let grid = render();
  key("Enter");
  expect(request).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 30; i++) {
    key("down");
    grid = render();
  }
  expect(Array.from({ length: grid.h }, (_, y) => grid.rowText(y)).join("\n")).toContain(
    "Enter 許可",
  );
  key("Enter");
  await new Promise((r) => setTimeout(r, 0));
  expect(request).toHaveBeenCalledWith("plugin.register", {
    key: candidate.key,
    digest: candidate.digest,
  });
  dialog.dispose();
});
it("scrollbar returns the candidate list to its first row without opening a review", async () => {
  const request = vi.fn(async () => ({
    candidates: Array.from({ length: 30 }, (_, i) => ({
      ...candidate,
      id: `demo-${i}`,
      name: `Candidate-${i}`,
    })),
  }));
  const dialog = new PluginPackages(new UiState(new SessionModel()), { request } as never, vi.fn());
  const paint = () => {
    const grid = new Grid(60, 12);
    dialog.render({ grid, theme: new ThemeColors("dracula") });
    return grid;
  };
  try {
    await vi.waitFor(() => expect(paint().rowText(4)).toContain("Candidate"));
    let grid = paint();
    const y = Array.from({ length: grid.h }, (_, y) => y).find((y) =>
      Array.from({ length: grid.w }, (_, x) => grid.cell(x, y).ch).includes("█"),
    )!;
    const x = Array.from({ length: grid.w }, (_, x) => x).find((x) => grid.cell(x, y).ch === "█")!;
    dialog.handleMouse({ action: "down", button: 0, x, y });
    dialog.handleMouse({ action: "move", button: 32, x, y: 30 });
    dialog.handleMouse({ action: "up", button: 0, x, y: 30 });
    grid = paint();
    expect(Array.from({ length: grid.h }, (_, y) => grid.rowText(y)).join("\n")).toContain(
      "Candidate-29",
    );
    const thumbY = Array.from({ length: grid.h }, (_, y) => y).find(
      (y) => grid.cell(x, y).ch === "█",
    )!;
    dialog.handleMouse({ action: "down", button: 0, x, y: thumbY });
    dialog.handleMouse({ action: "move", button: 32, x, y: -10 });
    dialog.handleMouse({ action: "up", button: 0, x, y: -10 });
    grid = paint();
    expect(Array.from({ length: grid.h }, (_, y) => grid.rowText(y)).join("\n")).toContain(
      "Candidate-0 ",
    );
    expect(request).toHaveBeenCalledTimes(1);
  } finally {
    dialog.dispose();
  }
});
