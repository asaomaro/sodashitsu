import { describe, expect, it } from "vitest";
import type { KeyInput } from "./actions.js";
import { NavigateMode } from "./NavigateMode.js";
import { resolveNavigateKeymap } from "./navigateKeymap.js";

function key(k: string, partial: Partial<KeyInput> = {}): KeyInput {
  return {
    key: k,
    code: "",
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
    type: "keydown",
    composing: false,
    ...partial,
  };
}

describe("NavigateMode", () => {
  const mode = new NavigateMode();

  it("↑/↓ は workspace の選択（留まる）", () => {
    expect(mode.handle(key("ArrowUp"))).toEqual({ action: { type: "navigate", op: "up" } });
    expect(mode.handle(key("ArrowDown"))).toEqual({ action: { type: "navigate", op: "down" } });
  });

  it("h/j/k/l・←/→ は pane のフォーカス移動（留まる）", () => {
    expect(mode.handle(key("h"))).toEqual({ action: { type: "navigate", op: "paneDir", dir: "left" } });
    expect(mode.handle(key("j"))).toEqual({ action: { type: "navigate", op: "paneDir", dir: "down" } });
    expect(mode.handle(key("k"))).toEqual({ action: { type: "navigate", op: "paneDir", dir: "up" } });
    expect(mode.handle(key("l"))).toEqual({ action: { type: "navigate", op: "paneDir", dir: "right" } });
    expect(mode.handle(key("ArrowLeft"))).toEqual({ action: { type: "navigate", op: "paneDir", dir: "left" } });
    expect(mode.handle(key("ArrowRight"))).toEqual({ action: { type: "navigate", op: "paneDir", dir: "right" } });
  });

  it("Enter で決定して抜ける", () => {
    expect(mode.handle(key("Enter"))).toEqual({ action: { type: "navigate", op: "activate" }, exit: true });
  });

  it("Esc で取り消して抜ける", () => {
    expect(mode.handle(key("Escape"))).toEqual({ action: { type: "navigate", op: "cancel" }, exit: true });
  });

  it("割り当ての無いキーは何もしない（留まる）", () => {
    expect(mode.handle(key("a"))).toEqual({});
  });
});

describe("NavigateMode — カスタム表（20260923-navigate-mode-keys。AC3）", () => {
  it("navigate_pane_left を ctrl+h へ変えると、素の h は無反応、ctrl+h が pane 左移動になる", () => {
    const { keymap } = resolveNavigateKeymap({ navigate_pane_left: ["ctrl+h"] });
    const mode = new NavigateMode(keymap);
    expect(mode.handle(key("h"))).toEqual({});
    expect(mode.handle(key("h", { ctrl: true }))).toEqual({
      action: { type: "navigate", op: "paneDir", dir: "left" },
    });
  });

  it("navigate_workspace_up の割り当てを外すと、↑ は無反応になる（↓ は既定のまま効く）", () => {
    const { keymap } = resolveNavigateKeymap({ navigate_workspace_up: [] });
    const mode = new NavigateMode(keymap);
    expect(mode.handle(key("ArrowUp"))).toEqual({});
    expect(mode.handle(key("ArrowDown"))).toEqual({ action: { type: "navigate", op: "down" } });
  });

  it("表の割り当てをどう変えても、矢印左右は常に pane 左右移動（decisions D3。left/right は予約キーで表に無い）", () => {
    const { keymap } = resolveNavigateKeymap({
      navigate_pane_left: ["ctrl+h"],
      navigate_pane_right: [],
    });
    const mode = new NavigateMode(keymap);
    expect(mode.handle(key("ArrowLeft"))).toEqual({
      action: { type: "navigate", op: "paneDir", dir: "left" },
    });
    expect(mode.handle(key("ArrowRight"))).toEqual({
      action: { type: "navigate", op: "paneDir", dir: "right" },
    });
  });

  it("Enter/Escape は表に関わらず常に固定（this work の対象外）", () => {
    const { keymap } = resolveNavigateKeymap({});
    const mode = new NavigateMode(keymap);
    expect(mode.handle(key("Enter"))).toEqual({ action: { type: "navigate", op: "activate" }, exit: true });
    expect(mode.handle(key("Escape"))).toEqual({ action: { type: "navigate", op: "cancel" }, exit: true });
  });

  it("setKeymap で差し替えると、直後の handle から新しい表を引く", () => {
    const mode = new NavigateMode();
    expect(mode.handle(key("h"))).toEqual({ action: { type: "navigate", op: "paneDir", dir: "left" } });
    mode.setKeymap(resolveNavigateKeymap({ navigate_pane_left: [] }).keymap);
    expect(mode.handle(key("h"))).toEqual({});
  });

  it("修飾付きの矢印（ctrl+left 等）は「予約されていない」ので他の操作へ割り当てられ、実際に押すと表を引く（幽霊バインディングの回帰。60 review ラウンド1）", () => {
    // navigate_workspace_up に ctrl+left を割り当てる（left 自体は予約だが ctrl+left は予約されない）。
    const { keymap } = resolveNavigateKeymap({ navigate_workspace_up: ["ctrl+left"] });
    const mode = new NavigateMode(keymap);
    // 割り当てた ctrl+ArrowLeft を押すと、固定の pane 左移動ではなく workspace 上移動が起きる。
    expect(mode.handle(key("ArrowLeft", { ctrl: true }))).toEqual({
      action: { type: "navigate", op: "up" },
    });
    // bare な ArrowLeft（修飾無し）は引き続き固定で pane 左移動のまま。
    expect(mode.handle(key("ArrowLeft"))).toEqual({
      action: { type: "navigate", op: "paneDir", dir: "left" },
    });
  });

  it("修飾付き矢印に何も割り当てていなければ無反応（表に登録が無いだけで、固定 case が奪わない）", () => {
    const mode = new NavigateMode(); // 既定の表（修飾付き矢印には何も割り当てられていない）
    expect(mode.handle(key("ArrowLeft", { ctrl: true }))).toEqual({});
    expect(mode.handle(key("ArrowRight", { alt: true }))).toEqual({});
  });
});
