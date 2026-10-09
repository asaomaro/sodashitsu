import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readTuiState, TUI_STATE_FILE, writeTuiState } from "../local/tuiState.js";
import { PrefsModel } from "./PrefsModel.js";

describe("PrefsModel（共有の設定と手元の状態）", () => {
  it("既定：dracula・サイドバー 26・狭い幅 64・マウスあり", () => {
    const p = new PrefsModel();
    expect(p.theme).toBe("dracula");
    expect(p.sidebarCols).toBe(26);
    expect(p.narrowThreshold).toBe(64);
    expect(p.mouseCapture).toBe(true);
    expect(p.sidebarCollapsed).toBe(false);
  });

  it("サイドバーの幅は 手元の今の幅 → tui.sidebarCols → 26。壊れた値は既定へ", () => {
    const p = new PrefsModel();
    p.apply({ tui: { sidebarCols: 30 } }, 1);
    expect(p.sidebarCols).toBe(30);
    p.apply({ tui: { sidebarCols: "wide" as unknown as number } }, 2);
    expect(p.sidebarCols).toBe(26);
    p.setLocal({ sidebarCols: 40 });
    expect(p.sidebarCols).toBe(40);
  });

  it("色の出し方は手元の tui-state.json の colorMode（端末ごと）。共有の設定の tui.colorMode は見ない", () => {
    const p = new PrefsModel();
    expect(p.colorMode).toBe("auto");
    p.apply({ tui: { colorMode: "256" } }, 1);
    expect(p.colorMode).toBe("auto");
    p.setLocal({ colorMode: "256" });
    expect(p.colorMode).toBe("256");
  });

  it("背景の透過は手元の tui-state.json の transparentBg（端末ごと）。既定は無効で、共有の設定は見ない", () => {
    const p = new PrefsModel();
    expect(p.transparentBg).toBe(false);
    p.apply({ tui: { transparentBg: true } } as never, 1);
    expect(p.transparentBg).toBe(false);
    p.setLocal({ transparentBg: true });
    expect(p.transparentBg).toBe(true);
  });

  it("古い rev は捨てる。テーマ・並び・スクロールバックを正規化する", () => {
    const p = new PrefsModel();
    p.apply({ theme: "nord", workspaceSort: "name", agentSort: "priority", scrollback: 200 }, 5);
    p.apply({ theme: "vesper" }, 4);
    expect(p.theme).toBe("nord");
    expect(p.workspaceSort).toBe("name");
    expect(p.agentSort).toBe("priority");
    expect(p.scrollbackLines(1000)).toBe(200);
    expect(p.scrollbackLines(100)).toBe(100);
    p.apply({ theme: "bogus" as never, scrollback: "auto" }, 6);
    expect(p.theme).toBe("dracula");
    expect(p.scrollbackLines(1000)).toBe(1000);
  });
});

describe("tui-state.json", () => {
  it("書いて読める（0600）。壊れていれば空", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tui-state-"));
    try {
      expect(readTuiState(dir)).toEqual({});
      await writeTuiState(dir, { sidebarCols: 33, sidebarCollapsed: true, colorMode: "truecolor" });
      expect(readTuiState(dir)).toEqual({
        sidebarCols: 33,
        sidebarCollapsed: true,
        colorMode: "truecolor",
      });
      if (process.platform !== "win32")
        expect((await stat(join(dir, TUI_STATE_FILE))).mode & 0o777).toBe(0o600);
      expect(JSON.parse(await readFile(join(dir, TUI_STATE_FILE), "utf8"))).toEqual({
        sidebarCols: 33,
        sidebarCollapsed: true,
        colorMode: "truecolor",
      });
      await writeFile(join(dir, TUI_STATE_FILE), "{broken");
      expect(readTuiState(dir)).toEqual({});
      await writeFile(
        join(dir, TUI_STATE_FILE),
        JSON.stringify({ sidebarCols: -3, sidebarCollapsed: "yes" }),
      );
      expect(readTuiState(dir)).toEqual({});
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("tui-state.json の transparentBg（20261008-tui-transparent-bg）", () => {
  it("true だけを採り、書いて読める。壊れた値は無効（既定）", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tui-state-"));
    try {
      await writeTuiState(dir, { transparentBg: true });
      expect(readTuiState(dir)).toEqual({ transparentBg: true });
      for (const bad of [false, "true", 1, null]) {
        await writeFile(join(dir, TUI_STATE_FILE), JSON.stringify({ transparentBg: bad }));
        expect(readTuiState(dir)).toEqual({});
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("区画の折りたたみ（20261004-ui-interaction-polish）", () => {
  it("既定は両方開いている。getter は畳んでいる区画だけ true", () => {
    expect(new PrefsModel().sectionsCollapsed).toEqual({ spaces: false, agents: false });
    expect(new PrefsModel({ sidebarSectionsCollapsed: { agents: true } }).sectionsCollapsed).toEqual({ spaces: false, agents: true });
  });

  it("tui-state.json: 書いて読める。値が true のキーだけを採り、壊れた値は開いた状態", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tui-state-"));
    try {
      await writeTuiState(dir, { sidebarSectionsCollapsed: { spaces: true } });
      expect(readTuiState(dir)).toEqual({ sidebarSectionsCollapsed: { spaces: true } });
      for (const bad of [{ spaces: false, agents: "yes" }, [true], "x", null, {}]) {
        await writeFile(join(dir, TUI_STATE_FILE), JSON.stringify({ sidebarSectionsCollapsed: bad }));
        expect(readTuiState(dir)).toEqual({});
      }
      await writeFile(join(dir, TUI_STATE_FILE), JSON.stringify({ sidebarSectionsCollapsed: { spaces: true, agents: 1, extra: true } }));
      expect(readTuiState(dir)).toEqual({ sidebarSectionsCollapsed: { spaces: true } });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("知らない項目を保つ（20261008-ui-style の uiStyle。端末版は読まない）", () => {
  it("prefs.changed で届いた uiStyle を、知らない項目として保つ。ほかの項目を重ねても・サーバの返事で置き換えても消えない", () => {
    const p = new PrefsModel();
    p.apply({ theme: "nord", uiStyle: "modern" }, 1);
    expect(p.shared.uiStyle).toBe("modern");
    // 端末版が、ほかの項目を（手元で先に）替える。
    const release = p.overlay({ paneGaps: false });
    expect(p.shared.uiStyle).toBe("modern");
    expect(p.shared.paneGaps).toBe(false);
    // サーバの返事（prefs.set の結果。uiStyle を含む全体）で置き換わっても、重ねを外しても保たれる。
    p.apply({ theme: "nord", uiStyle: "modern", paneGaps: false }, 2);
    release();
    expect(p.shared.uiStyle).toBe("modern");
    // 端末版が読む値は、uiStyle に影響されない。
    expect(p.theme).toBe("nord");
    expect(p.paneGaps).toBe(false);
  });
});
