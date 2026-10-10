import type { Action, KeyDecision } from "@sodashitsu/client-core";
import { describe, expect, it } from "vitest";
import { isAllowedOnNonBaseScreen } from "./graphScreenKeys.js";

const act = (action: Action): KeyDecision => ({ kind: "action", action });

describe("isAllowedOnNonBaseScreen（基本画面以外の画面〔グラフ・ダッシュボード〕の間、面の外の prefix の 2 打目）", () => {
  it("ダッシュボードの画面でも同じ絞りが効く: 見えない基本画面の端末へ向かう操作（prefix の二度押し・分割・閉じる）は届かない（20261010-agent-usage PR3）", () => {
    expect(isAllowedOnNonBaseScreen({ kind: "send", bytes: "\x02" })).toBe(false);
    expect(isAllowedOnNonBaseScreen(act({ type: "split", dir: "right" }))).toBe(false);
    expect(isAllowedOnNonBaseScreen(act({ type: "closePane" }))).toBe(false);
    expect(isAllowedOnNonBaseScreen(act({ type: "openGraph" }))).toBe(true); // 基本画面へ戻す
  });

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
      expect(isAllowedOnNonBaseScreen(act(a)), a.type).toBe(true);
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
      expect(isAllowedOnNonBaseScreen(act(a)), a.type).toBe(false);
    }
  });

  it("prefix の二度押し（端末へ送る）は食う。通常のキー・捨てるキーはそのまま", () => {
    expect(isAllowedOnNonBaseScreen({ kind: "send", bytes: "\x02" })).toBe(false);
    expect(isAllowedOnNonBaseScreen({ kind: "pass" })).toBe(true);
    expect(isAllowedOnNonBaseScreen({ kind: "consume" })).toBe(true);
  });
});
