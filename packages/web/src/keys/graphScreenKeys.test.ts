import type { Action, KeyDecision } from "@sodashitsu/client-core";
import { describe, expect, it } from "vitest";
import { isAllowedOnGraphScreen } from "./graphScreenKeys.js";

const act = (action: Action): KeyDecision => ({ kind: "action", action });

describe("isAllowedOnGraphScreen（グラフの画面の間、面の外の prefix の 2 打目）", () => {
  it("画面の切り替え・設定・ヘルプ・サイドバーの操作・通知の一覧は通す", () => {
    for (const a of [
      { type: "openGraph" },
      { type: "settings" },
      { type: "help" },
      { type: "toggleSidebar" },
      { type: "toggleSidebarSection", section: "spaces" },
      { type: "openNotificationHistory" },
      { type: "nextNotification" },
      { type: "enterMode", mode: "navigate" },
      { type: "navigate", op: "activate" },
      { type: "navigate", op: "down" },
      { type: "workspaceDelta", delta: 1 },
    ] as Action[]) {
      expect(isAllowedOnGraphScreen(act(a)), a.type).toBe(true);
    }
  });

  it("基本画面の pane・tab・分割を変える操作と、焦点の pane へ向かう操作は食う", () => {
    for (const a of [
      { type: "newTab" },
      { type: "closePane" },
      { type: "closeTab" },
      { type: "split", dir: "right" },
      { type: "zoom" },
      { type: "newWorkspace" },
      { type: "enterMode", mode: "copy" },
      { type: "enterMode", mode: "resize" },
      { type: "navigate", op: "paneDir", dir: "left" },
      { type: "renamePane" },
      { type: "editScrollback" },
      { type: "runCommand", commandId: "x" },
      { type: "showSubagents" },
    ] as Action[]) {
      expect(isAllowedOnGraphScreen(act(a)), a.type).toBe(false);
    }
  });

  it("prefix の二度押し（端末へ送る）は食う。通常のキー・捨てるキーはそのまま", () => {
    expect(isAllowedOnGraphScreen({ kind: "send", bytes: "\x02" })).toBe(false);
    expect(isAllowedOnGraphScreen({ kind: "pass" })).toBe(true);
    expect(isAllowedOnGraphScreen({ kind: "consume" })).toBe(true);
  });
});
