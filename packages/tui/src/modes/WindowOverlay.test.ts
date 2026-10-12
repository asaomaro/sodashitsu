import { expect, it, vi } from "vitest";
import { chordToKeyInput } from "@sodashitsu/client-core";
import { Grid } from "../render/Screen.js";
import { ThemeColors } from "../render/color.js";
import { WindowOverlay } from "./WindowOverlay.js";
import { centeredRect, dialogColors, drawBox, hiddenCursor, type Overlay } from "./overlay.js";
const fixture = () => {
  const mouse = vi.fn(() => true);
  const keys = vi.fn();
  const inner: Overlay = {
    handleKey: keys,
    handleMouse: mouse,
    cancel: vi.fn(),
    render: ({ grid, theme }) => {
      drawBox(grid, centeredRect(grid, grid.w - 2, grid.h - 2), dialogColors(theme), "TEST");
      return hiddenCursor();
    },
  };
  const win = new WindowOverlay(inner, { w: 60, h: 20 });
  const render = (w = 100, h = 40) => {
    const grid = new Grid(w, h);
    win.render({ grid, theme: new ThemeColors("dracula") });
    return grid;
  };
  return { win, render, mouse, keys };
};
it("resizes and moves by keyboard, stays within a shrinking terminal and translates mouse coordinates", () => {
  const f = fixture();
  expect(f.render().rowText(11)).toContain("TEST");
  f.win.handleKey({ ...chordToKeyInput("Right"), alt: true });
  f.win.handleKey({ ...chordToKeyInput("Down"), alt: true, shift: true });
  const grid = f.render();
  expect(grid.rowText(12)).toContain("TEST");
  expect(grid.rowText(29)).toContain("┘");
  f.win.handleMouse({ action: "down", button: 0, x: 25, y: 15 });
  expect(f.mouse).toHaveBeenLastCalledWith(expect.objectContaining({ x: 5, y: 4 }));
  const small = f.render(20, 6);
  expect(Array.from({ length: 6 }, (_, y) => small.rowText(y)).join("\n")).toContain("TEST");
  f.win.handleKey(chordToKeyInput("Enter"));
  expect(f.keys).toHaveBeenCalled();
});
it("drags the lower right corner and top border without passing them to the content", () => {
  const f = fixture();
  f.render();
  f.win.handleMouse({ action: "down", button: 0, x: 78, y: 28 });
  f.win.handleMouse({ action: "move", button: 32, x: 88, y: 32 });
  f.win.handleMouse({ action: "up", button: 0, x: 88, y: 32 });
  expect(f.render().rowText(32)[88]).toBe("┘");
  expect(f.mouse).not.toHaveBeenCalled();
  f.win.handleMouse({ action: "down", button: 0, x: 30, y: 11 });
  f.win.handleMouse({ action: "move", button: 32, x: 25, y: 9 });
  f.win.handleMouse({ action: "up", button: 0, x: 25, y: 9 });
  expect(f.render().rowText(9)).toContain("TEST");
});
it("registered float windows expose fold, close and view menu controls without forwarding their clicks", () => {
  const inner: Overlay = {
    handleKey: vi.fn(),
    handleMouse: vi.fn(() => true),
    cancel: vi.fn(),
    render: () => hiddenCursor(),
  };
  const controls = { fold: vi.fn(), close: vi.fn(), menu: vi.fn(), drop: vi.fn() };
  const win = new WindowOverlay(inner, { w: 60, h: 20 }, controls),
    grid = new Grid(100, 40);
  win.render({ grid, theme: new ThemeColors("dracula") });
  expect(grid.rowText(11)).toContain("[-] [×]");
  win.handleMouse({ action: "down", button: 0, x: 73, y: 11 });
  expect(controls.fold).toHaveBeenCalledOnce();
  win.handleMouse({ action: "down", button: 0, x: 77, y: 11 });
  expect(controls.close).toHaveBeenCalledOnce();
  win.handleMouse({ action: "down", button: 2, x: 30, y: 11 });
  expect(controls.menu).toHaveBeenCalledWith(30, 11);
  expect(inner.handleMouse).not.toHaveBeenCalled();
});
it("only drops moved windows and Escape restores the drag origin", () => {
  const controls = { fold: vi.fn(), close: vi.fn(), menu: vi.fn(), drop: vi.fn() };
  const win = new WindowOverlay(
    { handleKey: vi.fn(), cancel: vi.fn(), render: () => null },
    { w: 60, h: 20 },
    controls,
  );
  const render = () => win.render({ grid: new Grid(100, 40), theme: new ThemeColors("dracula") });
  render();
  win.handleMouse({ action: "down", button: 0, x: 22, y: 11 });
  win.handleMouse({ action: "up", button: 0, x: 22, y: 11 });
  expect(controls.drop).not.toHaveBeenCalled();
  win.handleMouse({ action: "down", button: 0, x: 22, y: 11 });
  win.handleMouse({ action: "move", button: 32, x: 27, y: 15 });
  win.handleKey(chordToKeyInput("Escape"));
  win.handleMouse({ action: "up", button: 0, x: 27, y: 15 });
  expect(controls.drop).not.toHaveBeenCalled();
  render();
  win.handleMouse({ action: "down", button: 0, x: 22, y: 11 });
  win.handleMouse({ action: "move", button: 32, x: 27, y: 15 });
  win.handleMouse({ action: "up", button: 0, x: 27, y: 15 });
  expect(controls.drop).toHaveBeenCalledOnce();
});

it("float grip changes placement, ordinary header only moves, backdrop is consumed, and Esc closes", () => {
  const inner: Overlay = {
    handleKey: vi.fn(),
    handleKeyEvent: vi.fn(),
    handleMouse: vi.fn(() => false),
    cancel: vi.fn(),
    render: ({ grid, theme }) => {
      drawBox(
        grid,
        centeredRect(grid, grid.w - 2, grid.h - 2),
        dialogColors(theme),
        "日本語ビュー",
      );
      return null;
    },
  };
  const controls = {
    fold: vi.fn(),
    close: vi.fn(),
    menu: vi.fn(),
    drop: vi.fn(),
    preview: vi.fn(),
  };
  const win = new WindowOverlay(inner, { w: 60, h: 20 }, controls);
  const render = () => {
    const grid = new Grid(100, 40);
    win.render({ grid, theme: new ThemeColors("dracula") });
    return grid;
  };
  expect(render().rowText(11)).toContain("日本語ビュー");
  expect(win.handleMouse({ action: "down", button: 0, x: 0, y: 0 })).toBe(true);
  expect(inner.handleMouse).not.toHaveBeenCalled();
  win.handleMouse({ action: "down", button: 0, x: 35, y: 11 });
  win.handleMouse({ action: "move", button: 32, x: 40, y: 13 });
  render();
  expect(controls.preview).not.toHaveBeenCalled();
  win.handleMouse({ action: "up", button: 0, x: 40, y: 13 });
  expect(controls.drop).not.toHaveBeenCalled();
  expect(render().rowText(13)).toContain("日本語ビュー");
  win.handleMouse({ action: "down", button: 0, x: 27, y: 13 });
  win.handleMouse({ action: "move", button: 32, x: 32, y: 15 });
  render();
  expect(controls.preview).toHaveBeenCalled();
  win.handleMouse({ action: "up", button: 0, x: 32, y: 15 });
  expect(controls.drop).toHaveBeenCalledOnce();
  win.handleKeyEvent({ key: chordToKeyInput("Escape")!, raw: "\x1b" });
  expect(controls.close).toHaveBeenCalledOnce();
  expect(inner.handleKeyEvent).not.toHaveBeenCalled();
});
it("side and bottom edges resize independently and keep the opposite edge fixed", () => {
  const f = fixture();
  f.render();
  f.win.handleMouse({ action: "down", button: 0, x: 21, y: 15 });
  f.win.handleMouse({ action: "move", button: 32, x: 16, y: 19 });
  f.win.handleMouse({ action: "up", button: 0, x: 16, y: 19 });
  const grid = f.render();
  expect(grid.rowText(11)[16]).toBe("┌");
  expect(grid.rowText(11)[78]).toBe("┐");
  expect(grid.rowText(28)[78]).toBe("┘");
  f.win.handleMouse({ action: "down", button: 0, x: 40, y: 28 });
  f.win.handleMouse({ action: "move", button: 32, x: 50, y: 31 });
  f.win.handleMouse({ action: "up", button: 0, x: 50, y: 31 });
  expect(f.render().rowText(31)[78]).toBe("┘");
});

it("backdrop stays open and Esc honors unsaved content protection", () => {
  let canLeave = false;
  const inner: Overlay = {
    handleKey: vi.fn(),
    handleMouse: vi.fn(() => false),
    cancel: vi.fn(),
    canLeave: () => canLeave,
    render: () => null,
  };
  const controls = { fold: vi.fn(), close: vi.fn(), menu: vi.fn(), drop: vi.fn() };
  const win = new WindowOverlay(inner, { w: 60, h: 20 }, controls);
  win.render({ grid: new Grid(100, 40), theme: new ThemeColors("dracula") });
  expect(win.handleMouse({ action: "down", button: 0, x: 0, y: 0 })).toBe(true);
  expect(inner.handleMouse).not.toHaveBeenCalled();
  expect(win.handleMouse({ action: "down", button: 0, x: 20, y: 10 })).toBe(true);
  win.handleKey(chordToKeyInput("Escape")!);
  expect(controls.close).not.toHaveBeenCalled();
  canLeave = true;
  win.handleKey(chordToKeyInput("Escape")!);
  expect(controls.close).toHaveBeenCalledOnce();
});
it("the visible top corner resizes height while ordinary header remains a move handle", () => {
  const f = fixture();
  f.render();
  f.win.handleMouse({ action: "down", button: 0, x: 21, y: 11 });
  f.win.handleMouse({ action: "move", button: 32, x: 18, y: 8 });
  f.win.handleMouse({ action: "up", button: 0, x: 18, y: 8 });
  const grid = f.render();
  expect(grid.rowText(8)[18]).toBe("┌");
  expect(grid.rowText(28)[78]).toBe("┘");
});

it("a registered float's right upper corner resizes without hitting Close", () => {
  const controls = { fold: vi.fn(), close: vi.fn(), menu: vi.fn(), drop: vi.fn() };
  const win = new WindowOverlay(
    {
      handleKey: vi.fn(),
      cancel: vi.fn(),
      render: ({ grid, theme }) => {
        drawBox(grid, centeredRect(grid, grid.w - 2, grid.h - 2), dialogColors(theme), "窓");
        return null;
      },
    },
    { w: 60, h: 20 },
    controls,
  );
  const render = () => {
    const grid = new Grid(100, 40);
    win.render({ grid, theme: new ThemeColors("dracula") });
    return grid;
  };
  render();
  win.handleMouse({ action: "down", button: 0, x: 78, y: 11 });
  win.handleMouse({ action: "move", button: 32, x: 83, y: 8 });
  win.handleMouse({ action: "up", button: 0, x: 83, y: 8 });
  expect(controls.close).not.toHaveBeenCalled();
  const grid = render();
  expect(grid.cell(83, 8).ch).toBe("┐");
  expect(grid.cell(83, 28).ch).toBe("┘");
});
it("maximizes, follows viewport resize and restores the previous rectangle without forwarding the action", () => {
  const inner: Overlay = {
    handleKey: vi.fn(),
    cancel: vi.fn(),
    render: ({ grid, theme }) => {
      drawBox(grid, centeredRect(grid, grid.w - 2, grid.h - 2), dialogColors(theme), "MAX");
      return hiddenCursor();
    },
  };
  const win = new WindowOverlay(inner, { w: 60, h: 20 }, undefined, { maximize: true });
  const render = (w = 100, h = 40) => {
    const grid = new Grid(w, h);
    win.render({ grid, theme: new ThemeColors("dracula") });
    return grid;
  };
  expect(render().rowText(11)).toContain("MAX");
  win.handleKey(chordToKeyInput("alt+enter"));
  expect(render().rowText(1)).toContain("MAX");
  expect(render(120, 50).rowText(48)).toContain("┘");
  win.handleKey(chordToKeyInput("alt+enter"));
  expect(render().rowText(11)).toContain("MAX");
  expect(inner.handleKey).not.toHaveBeenCalled();
  win.handleMouse({ action: "down", button: 0, x: 75, y: 11 });
  expect(render().rowText(1)).toContain("MAX");
});
it("restores maximized state when a resize drag is cancelled", () => {
  const win = new WindowOverlay(
    {
      handleKey: vi.fn(),
      cancel: vi.fn(),
      render: ({ grid, theme }) => {
        drawBox(grid, centeredRect(grid, grid.w - 2, grid.h - 2), dialogColors(theme), "MAX");
        return hiddenCursor();
      },
    },
    { w: 60, h: 20 },
    undefined,
    { maximize: true },
  );
  const render = (w = 100, h = 40) => {
    const grid = new Grid(w, h);
    win.render({ grid, theme: new ThemeColors("dracula") });
    return grid;
  };
  render();
  win.handleKey(chordToKeyInput("alt+enter"));
  render();
  win.handleMouse({ action: "down", button: 0, x: 98, y: 38 });
  win.handleMouse({ action: "move", button: 32, x: 90, y: 35 });
  win.handleKey(chordToKeyInput("esc"));
  expect(render(120, 50).rowText(1)).toContain("[▣]");
  expect(render(120, 50).rowText(48)).toContain("┘");
});
it("interrupts an active window drag without cancelling the dialog or losing its initial size",()=>{
 const f=fixture();f.render();f.win.handleMouse({action:'down',button:0,x:30,y:11});f.win.handleMouse({action:'move',button:32,x:40,y:15});f.win.cancelInteraction();expect(f.render().rowText(11)).toContain('TEST');f.win.handleMouse({action:'move',button:32,x:50,y:20});expect(f.render().rowText(11)).toContain('TEST');
});
