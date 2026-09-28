import { describe, expect, it } from "vitest";
import type { ProcessInspector } from "../platform/ProcessInspector.js";
import type { PtyBackend, PtyProcess, PtySpawnOptions } from "../pty/PtyBackend.js";
import { DefaultTerminalManager } from "./TerminalManager.js";

class RecordingBackend implements PtyBackend {
  readonly spawned: PtySpawnOptions[] = [];
  spawn(opts: PtySpawnOptions): PtyProcess {
    this.spawned.push(opts);
    const noop = { dispose: () => undefined };
    return {
      pid: 1,
      onData: () => noop,
      onExit: () => noop,
      write: () => undefined,
      resize: () => undefined,
      pause: () => undefined,
      resume: () => undefined,
      kill: () => undefined,
    };
  }
}

const inspector = {
  defaultShell: () => ({ shell: "/bin/default", args: ["-l"] }),
} as unknown as ProcessInspector;

describe("DefaultTerminalManager — 起動の引数（20260926-edit-scrollback）", () => {
  it("shell と args を渡せば、その argv で起動する", () => {
    const backend = new RecordingBackend();
    const manager = new DefaultTerminalManager(backend, inspector, 100);
    manager.create("p1", {
      cwd: "/",
      shell: "/bin/sh",
      args: ["-c", "echo", "x"],
      cols: 80,
      rows: 24,
    });
    expect(backend.spawned.map((o) => [o.shell, o.args])).toEqual([
      ["/bin/sh", ["-c", "echo", "x"]],
    ]);
    manager.dispose("p1");
  });

  it("shell だけなら引数なし、どちらも無ければ OS の既定のシェルとその引数（今までどおり）", () => {
    const backend = new RecordingBackend();
    const manager = new DefaultTerminalManager(backend, inspector, 100);
    manager.create("p1", { cwd: "/", shell: "/bin/zsh", cols: 80, rows: 24 });
    manager.create("p2", { cwd: "/", cols: 80, rows: 24 });
    expect(backend.spawned.map((o) => [o.shell, o.args])).toEqual([
      ["/bin/zsh", []],
      ["/bin/default", ["-l"]],
    ]);
    manager.dispose("p1");
    manager.dispose("p2");
  });
});

// 20260928-windows-pane-cwd の D-1・D-6：`trackCwd` の pane だけ、pane を開くたびに設定を読んで差し込む。
describe("DefaultTerminalManager — シェルの場所の知らせ（trackCwd）", () => {
  const winInspector = {
    defaultShell: () => ({ shell: "powershell.exe", args: [] }),
  } as unknown as ProcessInspector;

  it("trackCwd の pane は、Windows で設定が入なら差し込んだ引数・環境で起動する", () => {
    const backend = new RecordingBackend();
    const manager = new DefaultTerminalManager(backend, winInspector, 100, undefined, undefined, {
      platform: "win32",
      enabled: () => true,
    });
    manager.create("p1", { cwd: "C:\\", cols: 80, rows: 24, env: {}, trackCwd: true });
    manager.create("p2", { cwd: "C:\\", shell: "cmd.exe", cols: 80, rows: 24, env: { PROMPT: "$G" }, trackCwd: true });
    expect(backend.spawned[0]!.shell).toBe("powershell.exe");
    expect((backend.spawned[0]!.args as string[]).slice(0, 2)).toEqual(["-NoExit", "-EncodedCommand"]);
    expect(backend.spawned[1]!.env).toEqual({ PROMPT: '$E]9;9;"$P"$E\\$G' });
    expect(backend.spawned[1]!.cwd).toBe("C:\\");
    manager.dispose("p1");
    manager.dispose("p2");
  });

  it("trackCwd の無い pane（独自コマンド・エディタ）は差し込まない", () => {
    const backend = new RecordingBackend();
    const manager = new DefaultTerminalManager(backend, winInspector, 100, undefined, undefined, {
      platform: "win32",
      enabled: () => true,
    });
    manager.create("p1", { cwd: "C:\\", cols: 80, rows: 24, env: {} });
    manager.create("p2", { cwd: "C:\\", shell: "powershell.exe", args: ["-NoLogo"], cols: 80, rows: 24, env: {}, trackCwd: false });
    expect(backend.spawned.map((o) => o.args)).toEqual([[], ["-NoLogo"]]);
    manager.dispose("p1");
    manager.dispose("p2");
  });

  it("設定は pane を開くたびに読む（切にした後に開く pane から差し込まない）", () => {
    const backend = new RecordingBackend();
    let enabled = true;
    const manager = new DefaultTerminalManager(backend, winInspector, 100, undefined, undefined, {
      platform: "win32",
      enabled: () => enabled,
    });
    manager.create("p1", { cwd: "C:\\", cols: 80, rows: 24, env: {}, trackCwd: true });
    enabled = false;
    manager.create("p2", { cwd: "C:\\", cols: 80, rows: 24, env: {}, trackCwd: true });
    expect((backend.spawned[0]!.args as string[]).length).toBe(3);
    expect(backend.spawned[1]!.args).toEqual([]);
    manager.dispose("p1");
    manager.dispose("p2");
  });

  it("Windows 以外・差し込みの口を渡さないときは、trackCwd でも今までどおり", () => {
    const backend = new RecordingBackend();
    const linux = new DefaultTerminalManager(backend, winInspector, 100, undefined, undefined, {
      platform: "linux",
      enabled: () => true,
    });
    const none = new DefaultTerminalManager(backend, winInspector, 100);
    linux.create("p1", { cwd: "/", cols: 80, rows: 24, env: { A: "1" }, trackCwd: true });
    none.create("p2", { cwd: "/", cols: 80, rows: 24, env: { A: "1" }, trackCwd: true });
    expect(backend.spawned.map((o) => [o.shell, o.args, o.env])).toEqual([
      ["powershell.exe", [], { A: "1" }],
      ["powershell.exe", [], { A: "1" }],
    ]);
    linux.dispose("p1");
    none.dispose("p2");
  });
});
