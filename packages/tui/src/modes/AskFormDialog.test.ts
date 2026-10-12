import { expect, it, vi } from "vitest";
import { normalizeAskSpec } from "@sodashitsu/protocol";
import { chordToKeyInput } from "@sodashitsu/client-core";
import { AskFormDialog } from "./AskFormDialog.js";
import { Grid } from "../render/Screen.js";
import { ThemeColors } from "../render/color.js";
it("keeps text through resizing, rejects required blanks, and sends the entered answer", async () => {
  const answer = vi.fn(async () => {}),
    close = vi.fn(async () => {});
  const d = new AskFormDialog(
    {
      askId: "a",
      paneId: "p",
      spec: (
        normalizeAskSpec({
          title: "Text",
          questions: [{ id: "q", label: "本文", type: "text", required: true }],
        }) as { ok: true; spec: import("@sodashitsu/protocol").AskSpec }
      ).spec,
      createdAt: 0,
    } as never,
    "pane",
    answer,
    close,
    vi.fn(),
  );
  const render = (w = 80, h = 24) => {
    const grid = new Grid(w, h);
    d.render({ grid, theme: new ThemeColors("dracula") });
    return grid;
  };
  d.handleKey(chordToKeyInput("ctrl+enter"));
  expect(answer).not.toHaveBeenCalled();
  expect(render().rowText(20)).toContain("未回答");
  d.handleKey(chordToKeyInput("tab"));
  d.handleKey(chordToKeyInput("tab"));
  d.handlePaste("日本語\n続き");
  expect(render(50, 20).rowText(4)).toContain("日本語↵続き");
  d.handleKey(chordToKeyInput("ctrl+enter"));
  await Promise.resolve();
  expect(answer).toHaveBeenCalledWith(expect.objectContaining({ answers: { q: "日本語\n続き" } }));
  d.handleKey(chordToKeyInput("esc"));
  await Promise.resolve();
  expect(close).toHaveBeenCalledOnce();
});
it("keeps the editing cursor and tail visible after a narrow resize", () => {
  const checked = normalizeAskSpec({
    title: "Long",
    questions: [{ id: "q", label: "Q", type: "text" }],
  });
  if (!checked.ok) throw new Error(checked.message);
  const d = new AskFormDialog(
    { askId: "a", paneId: "p", spec: checked.spec },
    "pane",
    async () => {},
    async () => {},
    vi.fn(),
  );
  d.handleKey(chordToKeyInput("tab"));
  d.handleKey(chordToKeyInput("tab"));
  d.handlePaste("abcdefghij".repeat(8) + "END");
  const grid = new Grid(30, 18);
  const cursor = d.render({ grid, theme: new ThemeColors("dracula") });
  expect(grid.rowText(cursor!.y)).toContain("END");
  expect(cursor!.x).toBeLessThan(29);
});
it("uses Ctrl+arrows for rank and returns the six normalized question types", async () => {
  const spec = normalizeAskSpec({
    title: "Types",
    note: false,
    comments: false,
    questions: [
      { id: "single", label: "S", options: ["yes", "no"], default: "yes" },
      { id: "multi", label: "M", type: "multi", options: ["u", "v"], default: ["u"] },
      { id: "text", label: "T", type: "text", default: "text" },
      { id: "edit", label: "E", type: "edit", text: "edited" },
      { id: "rank", label: "R", type: "rank", options: ["a", "b"] },
      {
        id: "table",
        label: "B",
        type: "table",
        options: ["x", "y"],
        rows: [{ value: "row", label: "row", default: "y" }],
      },
    ],
  });
  if (!spec.ok) throw new Error(spec.message);
  const answer = vi.fn(async () => {});
  const d = new AskFormDialog(
    { askId: "a", paneId: "p", spec: spec.spec },
    "pane",
    answer,
    async () => {},
    vi.fn(),
  );
  for (let i = 0; i < 12; i++) d.handleKey(chordToKeyInput("tab"));
  d.handleKey(chordToKeyInput("ctrl+down"));
  d.handleKey(chordToKeyInput("ctrl+enter"));
  await Promise.resolve();
  expect(answer).toHaveBeenCalledWith(
    expect.objectContaining({
      answers: {
        single: "yes",
        multi: ["u"],
        text: "text",
        edit: "edited",
        rank: ["b", "a"],
        table: { row: "y" },
      },
    }),
  );
});
it("preserves a custom multi answer when selecting another predefined option", async () => {
  const checked = normalizeAskSpec({
    title: "Multi",
    note: false,
    questions: [{ id: "m", label: "M", type: "multi", options: ["a", "b"], allowOther: true }],
  });
  if (!checked.ok) throw new Error(checked.message);
  const answer = vi.fn(async () => {});
  const d = new AskFormDialog(
    { askId: "a", paneId: "p", spec: checked.spec },
    "pane",
    answer,
    async () => {},
    vi.fn(),
  );
  for (let i = 0; i < 4; i++) d.handleKey(chordToKeyInput("tab"));
  d.handleKey(chordToKeyInput("space"));
  d.handleKey(chordToKeyInput("tab"));
  d.handlePaste("custom");
  d.handleKey(chordToKeyInput("up"));
  d.handleKey(chordToKeyInput("up"));
  d.handleKey(chordToKeyInput("space"));
  d.handleKey(chordToKeyInput("ctrl+enter"));
  await Promise.resolve();
  expect(answer).toHaveBeenCalledWith(
    expect.objectContaining({ answers: { m: ["b", "custom"] }, custom: ["m"] }),
  );
});
