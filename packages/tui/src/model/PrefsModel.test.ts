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

  it("tui.colorMode は auto・truecolor・256（壊れた値は auto）", () => {
    const p = new PrefsModel();
    expect(p.colorMode).toBe("auto");
    p.apply({ tui: { colorMode: "256" } }, 1);
    expect(p.colorMode).toBe("256");
    p.apply({ tui: { colorMode: "rgb" as never } }, 2);
    expect(p.colorMode).toBe("auto");
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
      await writeTuiState(dir, { sidebarCols: 33, sidebarCollapsed: true });
      expect(readTuiState(dir)).toEqual({ sidebarCols: 33, sidebarCollapsed: true });
      if (process.platform !== "win32")
        expect((await stat(join(dir, TUI_STATE_FILE))).mode & 0o777).toBe(0o600);
      expect(JSON.parse(await readFile(join(dir, TUI_STATE_FILE), "utf8"))).toEqual({
        sidebarCols: 33,
        sidebarCollapsed: true,
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
