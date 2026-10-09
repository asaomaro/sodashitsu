import { ACTIONS, actionFor, type Action, type KeyDecision } from "@sodashitsu/client-core";
import { describe, expect, it } from "vitest";
import { isAllowedInTerminalWindow } from "./graphTerminalKeys.js";

const act = (action: Action): KeyDecision => ({ kind: "action", action });

describe("isAllowedInTerminalWindow（グラフの上の端末の窓にフォーカスがあるとき。X2）", () => {
  it("通常の入力・prefix の二度押し・捨てるキーは、その pane へ", () => {
    expect(isAllowedInTerminalWindow({ kind: "pass" })).toBe(true);
    expect(isAllowedInTerminalWindow({ kind: "consume" })).toBe(true);
    expect(isAllowedInTerminalWindow({ kind: "send", bytes: "\x02" })).toBe(true);
  });

  it("その pane への操作・全体の操作は通す", () => {
    for (const a of [
      { type: "copy", cmd: { op: "exit" } },
      { type: "enterMode", mode: "copy" },
      { type: "exitMode" },
      { type: "pasteImage" },
      { type: "editScrollback" },
      { type: "showSubagents" },
      { type: "help" },
      { type: "settings" },
      { type: "toggleSidebar" },
      { type: "toggleSidebarSection", section: "agents" },
      { type: "reloadConfig" },
      { type: "detach" },
      { type: "openNotificationHistory" },
    ] as Action[]) {
      expect(isAllowedInTerminalWindow(act(a)), a.type).toBe(true);
    }
  });

  it("基本画面の構成を変える操作は食う", () => {
    for (const a of [
      { type: "split", dir: "right" },
      { type: "closePane" },
      { type: "swap", dir: "left" },
      { type: "zoom" },
      { type: "renamePane" },
      { type: "resizeBy", dir: "left", amount: 1 },
      { type: "enterMode", mode: "resize" },
      { type: "newTab" },
      { type: "closeTab" },
      { type: "newWorkspace" },
      { type: "closeWorkspace" },
      { type: "moveTab", direction: "next" },
      { type: "newWorktree" },
    ] as Action[]) {
      expect(isAllowedInTerminalWindow(act(a)), a.type).toBe(false);
    }
  });

  it("選んでいる pane を別の pane へ動かす操作は食う（窓の pane と選択がずれない）", () => {
    for (const a of [
      { type: "goto" },
      { type: "nextNotification" },
      { type: "workspaceIndex", index: 1 },
      { type: "workspaceDelta", delta: 1 },
      { type: "focusDir", dir: "left" },
      { type: "cyclePane", delta: 1 },
      { type: "lastPane" },
      { type: "tabDelta", delta: 1 },
      { type: "agentDelta", delta: 1 },
      { type: "enterMode", mode: "navigate" },
      { type: "navigate", op: "activate" },
    ] as Action[]) {
      expect(isAllowedInTerminalWindow(act(a)), a.type).toBe(false);
    }
  });

  it("表示の面・独自コマンド・画面の切り替え（openGraph は呼び側が読み替える）は食う", () => {
    for (const a of [{ type: "displayMenu" }, { type: "focusDisplay" }, { type: "runCommand", commandId: "x" }, { type: "openGraph" }] as Action[]) {
      expect(isAllowedInTerminalWindow(act(a)), a.type).toBe(false);
    }
  });

  it("既定の割り当ての全部の操作について、決められる（網羅の確認）", () => {
    for (const def of ACTIONS) {
      expect(typeof isAllowedInTerminalWindow(act(actionFor(def, 1))), def.id).toBe("boolean");
    }
  });
});
