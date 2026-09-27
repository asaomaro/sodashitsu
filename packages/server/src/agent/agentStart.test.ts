import { AGENT_START_KINDS, agentStartExecutable } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import type { ForegroundJob } from "../platform/ProcessInspector.js";
import {
  buildStartLine,
  checkShell,
  hasControlChar,
  LINE_CLEAR,
  START_INTERRUPT_DELAY_MS,
  quotePosixArg,
  shellNameOf,
  startInput,
} from "./agentStart.js";
import { AGENTS, lookupAgentKind } from "./agents.js";

describe("kind の表と検出", () => {
  it("表の kind は本製品が検出できる種類と同じ集合で、各実行ファイル名はその kind として検出される（AC5）", () => {
    expect([...AGENT_START_KINDS].sort()).toEqual(AGENTS.map((a) => a.kind).sort());
    for (const kind of AGENT_START_KINDS) {
      expect(lookupAgentKind(agentStartExecutable(kind)!), kind).toBe(kind);
    }
  });
});

describe("hasControlChar", () => {
  it("C0・DEL・C1 を見つける（AC6）", () => {
    for (const c of [
      "\n",
      "\r",
      "\t",
      "\u001b",
      "\u0000",
      "\u001f",
      "\u007f",
      "\u0080",
      "\u009b",
      "\u009f",
      "\u0003",
    ]) {
      expect(hasControlChar(`a${c}b`), JSON.stringify(c)).toBe(true);
    }
  });
  it("印字できる文字・空白・非 ASCII は通す", () => {
    for (const s of ["", " ", "a b", "日本", "\u00a0", "'\"\\$`;|&<>*~!%"])
      expect(hasControlChar(s), s).toBe(false);
  });
});

describe("quotePosixArg / buildStartLine", () => {
  it("全部の引数を単一引用符で包み、' は '\\'' にする。実行ファイル名は裸（AC11）", () => {
    expect(quotePosixArg("")).toBe("''");
    expect(quotePosixArg("plain")).toBe("'plain'");
    expect(quotePosixArg("a'b")).toBe("'a'\\''b'");
    expect(quotePosixArg("''")).toBe("''\\'''\\'''");
    expect(buildStartLine("claude", ["--model", "x y", "$(id)"])).toBe(
      "claude '--model' 'x y' '$(id)'",
    );
    expect(buildStartLine("codex", [])).toBe("codex");
  });
});

describe("startInput", () => {
  it("Ctrl-C を別の部分で送り、次に打ちかけの消去・コマンド行・CR。bracketed paste が有効なら貼り付けで包む（AC11）", () => {
    expect(LINE_CLEAR).toBe("\u0005\u0015");
    expect(START_INTERRUPT_DELAY_MS).toBe(200);
    expect(startInput("claude 'x'", false)).toEqual(["\u0003", "\u0005\u0015claude 'x'\r"]);
    expect(startInput("claude 'x'", true)).toEqual([
      "\u0003",
      "\u0005\u0015\u001b[200~claude 'x'\u001b[201~\r",
    ]);
  });
});

describe("shellNameOf / checkShell", () => {
  const job = (pgid: number, ...procs: [number, string][]): ForegroundJob => ({
    processGroupId: pgid,
    processes: procs.map(([pid, exe]) => ({ pid, exe, argv: [exe], cwd: null })),
  });

  it("パス・login シェルの - ・.exe・大文字を正規化する（AC9）", () => {
    expect(shellNameOf("-bash")).toBe("bash");
    expect(shellNameOf("/usr/bin/zsh")).toBe("zsh");
    expect(shellNameOf("/bin/sh")).toBe("sh");
    expect(shellNameOf("--mksh")).toBe("mksh");
    expect(shellNameOf("C:\\Windows\\System32\\cmd.exe")).toBe("cmd");
    expect(shellNameOf("PWSH.EXE")).toBe("pwsh");
  });

  it("前面がシェル自身だけの POSIX 系シェルは available", () => {
    for (const exe of [
      "/bin/bash",
      "-bash",
      "/bin/sh",
      "/usr/bin/dash",
      "zsh",
      "/usr/bin/ksh",
      "mksh",
    ]) {
      expect(checkShell(job(10, [10, exe]), 10), exe).toEqual({
        kind: "available",
        shell: shellNameOf(exe),
      });
    }
  });

  it("POSIX 以外の既知のシェルは unsupported（AC9）", () => {
    for (const exe of [
      "fish",
      "/usr/bin/tcsh",
      "csh",
      "nu",
      "elvish",
      "xonsh",
      "pwsh",
      "powershell.exe",
      "cmd.exe",
    ]) {
      expect(checkShell(job(10, [10, exe]), 10), exe).toEqual({
        kind: "unsupported",
        shell: shellNameOf(exe),
      });
    }
  });

  it("取得できない・前面が別のグループ・シェル以外のメンバー・シェルが居ない・シェルでない名前は busy（AC8）", () => {
    expect(checkShell(null, 10)).toEqual({ kind: "busy" });
    expect(checkShell(job(11, [11, "sleep"]), 10)).toEqual({ kind: "busy" });
    expect(checkShell(job(11, [10, "bash"]), 10)).toEqual({ kind: "busy" }); // シェルが前面のグループの長でない
    expect(checkShell(job(10, [10, "bash"], [12, "cat"]), 10)).toEqual({ kind: "busy" });
    expect(checkShell(job(10), 10)).toEqual({ kind: "busy" });
    expect(checkShell(job(10, [10, "vim"]), 10)).toEqual({ kind: "busy" });
    expect(checkShell(job(10, [10, "claude"]), 10)).toEqual({ kind: "busy" });
  });
});
