import { TERMINAL_PALETTES, type TerminalPalette } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import { NodePtyBackend } from "../pty/NodePtyBackend.js";
import { LinuxProcessInspector } from "../platform/LinuxProcessInspector.js";
import { DefaultTerminalManager } from "./TerminalManager.js";

describe.skipIf(process.platform === "win32")("DefaultTerminalManager (integration)", () => {
  it("creates a host reachable via get(), and dispose() removes it", async () => {
    const manager = new DefaultTerminalManager(new NodePtyBackend(), new LinuxProcessInspector(), 1000);
    const host = manager.create("p1", { cwd: process.cwd(), shell: "/bin/sh", cols: 80, rows: 24 });
    expect(manager.get("p1")).toBe(host);
    manager.dispose("p1");
    expect(manager.get("p1")).toBeUndefined();
  });

  it("uses the process inspector's default shell when none is given", () => {
    const manager = new DefaultTerminalManager(new NodePtyBackend(), new LinuxProcessInspector(), 1000);
    const host = manager.create("p1", { cwd: process.cwd(), cols: 80, rows: 24 });
    expect(host.pid).toBeGreaterThan(0);
    manager.dispose("p1");
  });

  it("removes the host automatically when the shell exits on its own", async () => {
    const manager = new DefaultTerminalManager(new NodePtyBackend(), new LinuxProcessInspector(), 1000);
    // CreatePaneOptions には引数を渡す口が無いので、それ自体で即終了するプログラムを使う。
    const host = manager.create("p1", { cwd: process.cwd(), shell: "/bin/true", cols: 80, rows: 24 });
    await new Promise<void>((resolve) => host.onExit(() => resolve()));
    await new Promise((r) => setTimeout(r, 20)); // onExit のリスナーが呼ばれた後、Map から消えるまでの猶予
    expect(manager.get("p1")).toBeUndefined();
  });

  it("paletteFor を pane ごとに Mirror へ渡す（色の問い合わせの答え。20260921-theme-settings の design D6）", async () => {
    const asked: string[] = [];
    const paletteFor = (paneId: string): TerminalPalette => {
      asked.push(paneId);
      return paneId === "p2" ? TERMINAL_PALETTES["gruvbox-light"] : TERMINAL_PALETTES.nord;
    };
    const manager = new DefaultTerminalManager(new NodePtyBackend(), new LinuxProcessInspector(), 1000, paletteFor);
    const host = manager.create("p2", { cwd: process.cwd(), shell: "/bin/sh", cols: 80, rows: 24 });
    expect(asked).toEqual([]); // 作った時点では引かない（問い合わせの瞬間に引く）
    const responses: string[] = [];
    host.mirror.onResponse((d) => responses.push(d));
    await new Promise<void>((resolve) => host.mirror.write("\x1b]11;?\x07", resolve));
    expect(asked).toEqual(["p2"]);
    expect(responses.join("")).toBe("\x1b]11;rgb:fbfb/f1f1/c7c7\x07"); // gruvbox-light の背景 #fbf1c7
    manager.dispose("p2");
  });

  it("resize() forwards to the host", () => {
    const manager = new DefaultTerminalManager(new NodePtyBackend(), new LinuxProcessInspector(), 1000);
    const host = manager.create("p1", { cwd: process.cwd(), shell: "/bin/sh", cols: 80, rows: 24 });
    manager.resize("p1", 100, 30);
    expect(host.mirror.serialize(0)).toMatchObject({ cols: 100, rows: 30 });
    manager.dispose("p1");
  });
});
