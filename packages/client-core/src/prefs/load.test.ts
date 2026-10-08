import { describe, expect, it } from "vitest";
import {
  buildNewCwd,
  loadAgentSort,
  loadCollapsedAutoGroups,
  loadNewCwdPath,
  loadNewCwdPolicy,
  loadNotifyPrefs,
  loadPaneAgentNameVisible,
  loadPaneBorders,
  loadPaneGaps,
  loadDisplayBandEdge,
  loadDisplayPanelDock,
  loadDisplayPanelInitial,
  loadDisplayScriptEnabled,
  loadShellCwdTracking,
  loadStatusSymbols,
  loadWorkspaceSort,
} from "./load.js";

/** 共有の設定の値ごとの読み込み（web の store の試験から移した。統合の review）。 */

describe("loadStatusSymbols（AC3・AC7）", () => {
  it("boolean はそのまま", () => {
    expect(loadStatusSymbols(true)).toBe(true);
    expect(loadStatusSymbols(false)).toBe(false);
  });

  // 既定は「入」（herdr と逆。decisions D1）。何も保存していない利用者にも記号が出る。
  it("boolean でなければ既定の「入」", () => {
    for (const raw of [undefined, null, "false", 0, 1, {}, []]) {
      expect(loadStatusSymbols(raw), String(raw)).toBe(true);
    }
  });
});

// 新しく開く場所（20260921-new-terminal-cwd）。
describe("loadNewCwdPolicy・loadNewCwdPath（AC4）", () => {
  it("4 つの方針はそのまま", () => {
    for (const p of ["follow", "home", "current", "path"] as const) {
      expect(loadNewCwdPolicy(p)).toBe(p);
    }
  });

  // 何も設定していない利用者は「引き継ぐ」（herdr の既定と同じ）。壊れた値でも起動できる。
  it("4 つのどれかでなければ既定の「引き継ぐ」", () => {
    for (const raw of [undefined, null, "", "Follow", "cwd", 0, true, {}, []]) {
      expect(loadNewCwdPolicy(raw), String(raw)).toBe("follow");
    }
  });

  it("パスは文字列ならそのまま、そうでなければ空", () => {
    expect(loadNewCwdPath("~/work")).toBe("~/work");
    expect(loadNewCwdPath("")).toBe("");
    for (const raw of [undefined, null, 1, {}, ["~/work"]]) {
      expect(loadNewCwdPath(raw), String(raw)).toBe("");
    }
  });
});

// シェルの場所を追う（20260928-windows-pane-cwd の D-6）。
describe("loadShellCwdTracking（AC6）", () => {
  it("boolean はそのまま", () => {
    expect(loadShellCwdTracking(true)).toBe(true);
    expect(loadShellCwdTracking(false)).toBe(false);
  });

  // 何も保存していない利用者にも差し込む（既定は入）。壊れた値でも切にならない。
  it("boolean でなければ既定の「入」", () => {
    for (const raw of [undefined, null, "false", 0, 1, {}, []]) {
      expect(loadShellCwdTracking(raw), String(raw)).toBe(true);
    }
  });
});

describe("buildNewCwd", () => {
  it("引き継ぐは元の pane を載せ、元の pane が無ければ載せない（design D7）", () => {
    expect(buildNewCwd("follow", "", "p3")).toEqual({ policy: "follow", sourcePaneId: "p3" });
    expect(buildNewCwd("follow", "", null)).toEqual({ policy: "follow" });
  });

  // 元の pane を見るのは「引き継ぐ」だけ（ほかの方針に余計な値を載せない）。
  it("ホーム・起動した場所は方針だけ、指定した場所はパスを入れたまま載せる", () => {
    expect(buildNewCwd("home", "/x", "p3")).toEqual({ policy: "home" });
    expect(buildNewCwd("current", "/x", "p3")).toEqual({ policy: "current" });
    expect(buildNewCwd("path", "~/work", "p3")).toEqual({ policy: "path", path: "~/work" });
    expect(buildNewCwd("path", "", null)).toEqual({ policy: "path", path: "" });
  });
});

describe("loadWorkspaceSort（AC3）", () => {
  it("有効な値はそのまま通す", () => {
    expect(loadWorkspaceSort("opened")).toBe("opened");
    expect(loadWorkspaceSort("name")).toBe("name");
  });

  it("壊れた値・無いときは opened", () => {
    for (const raw of [undefined, null, "なにか", 1, {}, true]) {
      expect(loadWorkspaceSort(raw), String(raw)).toBe("opened");
    }
  });
});

describe("loadPaneBorders・loadPaneGaps・loadPaneAgentNameVisible", () => {
  it("有効な値はそのまま、壊れた値は既定（常に・隙間あり・名前なし）", () => {
    for (const v of ["always", "auto", "off"] as const) expect(loadPaneBorders(v)).toBe(v);
    for (const raw of [undefined, null, "Auto", 1, {}]) expect(loadPaneBorders(raw)).toBe("always");
    expect(loadPaneGaps(false)).toBe(false);
    for (const raw of [undefined, "false", 0]) expect(loadPaneGaps(raw)).toBe(true);
    expect(loadPaneAgentNameVisible(true)).toBe(true);
    for (const raw of [undefined, "true", 1]) expect(loadPaneAgentNameVisible(raw)).toBe(false);
  });
});

describe("loadNotifyPrefs", () => {
  it("値ごとに既定へ落とす（toast 入・desktop 切・sound 切）", () => {
    expect(loadNotifyPrefs(undefined)).toEqual({ toast: true, desktop: false, sound: false });
    expect(loadNotifyPrefs([])).toEqual({ toast: true, desktop: false, sound: false });
    // 壊れた値は項目ごとの既定（toast は入）
    expect(loadNotifyPrefs({ toast: "no" })).toEqual({ toast: true, desktop: false, sound: false });
    expect(loadNotifyPrefs({ toast: false, desktop: "yes", sound: true })).toEqual({
      toast: false,
      desktop: false,
      sound: true,
    });
  });
});

describe("loadAgentSort・loadCollapsedAutoGroups", () => {
  it("並び順は grouped・priority 以外を grouped に、折りたたみは文字列の要素だけ", () => {
    expect(loadAgentSort("priority")).toBe("priority");
    for (const raw of [undefined, "Priority", 1]) expect(loadAgentSort(raw)).toBe("grouped");
    expect([...loadCollapsedAutoGroups(["a", 1, "b", null])]).toEqual(["a", "b"]);
    expect(loadCollapsedAutoGroups("a").size).toBe(0);
  });
});

describe("表示の面の配置の設定 3 つ（20261008-display-layout）", () => {
  it("初めの状態は collapsed のときだけ collapsed。知らない値は open", () => {
    expect(loadDisplayPanelInitial("collapsed")).toBe("collapsed");
    for (const v of ["open", "x", undefined, null, 1, true, {}]) expect(loadDisplayPanelInitial(v)).toBe("open");
  });
  it("パネルの既定の置き場所は 5 つの値。知らない値は right", () => {
    for (const v of ["right", "left", "top", "bottom", "float"]) expect(loadDisplayPanelDock(v)).toBe(v);
    for (const v of ["middle", undefined, null, 1, {}]) expect(loadDisplayPanelDock(v)).toBe("right");
  });
  it("帯の既定の場所は top・bottom。知らない値は top", () => {
    expect(loadDisplayBandEdge("bottom")).toBe("bottom");
    for (const v of ["left", "right", undefined, null, 1]) expect(loadDisplayBandEdge(v)).toBe("top");
  });
});

describe("loadDisplayScriptEnabled（既定は無効）", () => {
  it("true のときだけ有効。未設定・壊れた値は無効", () => {
    expect(loadDisplayScriptEnabled(true)).toBe(true);
    for (const v of [false, undefined, null, "true", 1, {}, []]) expect(loadDisplayScriptEnabled(v)).toBe(false);
  });
});
