import { describe, expect, it } from "vitest";
import {
  CMD_DEFAULT_PROMPT,
  CMD_PROMPT_PREFIX,
  powerShellPromptScript,
  shellKindOf,
  withShellCwdTracking,
  type ShellLaunch,
} from "./shellCwdTracking.js";

// 20260928-windows-pane-cwd の design D-2〜D-4。Windows の実機は無いので、組み立てた引数・環境・スクリプトの文字列をここで固定する。
const WIN = { platform: "win32" as const, enabled: true };

const launch = (
  shell: string,
  args: string[] | string = [],
  env: Record<string, string> = {},
): ShellLaunch => ({
  shell,
  args,
  env,
});

/** 足した `-EncodedCommand` の値を UTF-16LE として読み戻す。 */
function decodedScript(args: string[] | string): string {
  expect(Array.isArray(args)).toBe(true);
  const a = args as string[];
  const i = a.indexOf("-EncodedCommand");
  expect(i).toBeGreaterThanOrEqual(0);
  return Buffer.from(a[i + 1]!, "base64").toString("utf16le");
}

describe("withShellCwdTracking — 差し込まない（今までどおり）", () => {
  it("win32 以外（Linux・WSL2・macOS）は何もしない（AC8）", () => {
    for (const platform of ["linux", "darwin", "freebsd"] as const) {
      for (const l of [
        launch("powershell.exe"),
        launch("pwsh"),
        launch("cmd.exe", [], { PROMPT: "$P$G" }),
        launch("/bin/bash", ["-l"]),
      ]) {
        expect(withShellCwdTracking(l, { platform, enabled: true }), `${platform} ${l.shell}`).toBe(
          l,
        );
      }
    }
  });

  it("設定が切なら、Windows でも引数・環境をそのまま返す（AC6）", () => {
    for (const l of [launch("powershell.exe"), launch("cmd.exe", [], { PROMPT: "$P$G" })]) {
      const out = withShellCwdTracking(l, { platform: "win32", enabled: false });
      expect(out).toBe(l);
      expect(out).toEqual(launch(l.shell, [], l.env));
    }
  });

  it("対象外のシェル（bash・nu・Git Bash 等）は差し込まない", () => {
    for (const shell of [
      "bash.exe",
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "nu",
      "wsl.exe",
      "powershell_ise.exe",
      "cmdx.exe",
      "xpwsh",
    ]) {
      const l = launch(shell, [], { PROMPT: "x" });
      expect(withShellCwdTracking(l, WIN), shell).toBe(l);
    }
  });

  it("引数が文字列（1 本のコマンドライン）なら差し込まない", () => {
    for (const shell of ["powershell.exe", "cmd.exe"]) {
      const l = launch(shell, '/d /s /c "dir"', { PROMPT: "$G" });
      expect(withShellCwdTracking(l, WIN), shell).toBe(l);
    }
  });

  it("PowerShell の引数に起動の仕方を決めるもの（-Command・-c・-File・-f・-EncodedCommand・-e・-ec・-NoExit）があれば差し込まない", () => {
    const flags = [
      "-Command",
      "-c",
      "-File",
      "-f",
      "-EncodedCommand",
      "-e",
      "-ec",
      "-NoExit",
      // 大文字小文字を区別しない
      "-COMMAND",
      "-noexit",
      "-EC",
      "-F",
      // PowerShell の前方一致の省略・ほかの前置き
      "-Comm",
      "-enc",
      "-NoE",
      "/Command",
      "--command",
      "-File:script.ps1",
      "-CommandWithArgs",
      "-cwa",
    ];
    for (const flag of flags) {
      for (const shell of ["powershell.exe", "pwsh"]) {
        const l = launch(shell, ["-NoLogo", flag, "x"]);
        expect(withShellCwdTracking(l, WIN), `${shell} ${flag}`).toBe(l);
      }
    }
  });
});

describe("withShellCwdTracking — PowerShell（design D-3）", () => {
  it("powershell.exe・pwsh.exe・拡張子なし・フルパス・大文字小文字の違いを PowerShell と判定する", () => {
    for (const shell of [
      "powershell.exe",
      "powershell",
      "pwsh.exe",
      "pwsh",
      "PowerShell.EXE",
      "PWSH",
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
      "C:/Program Files/PowerShell/7/PWSH.EXE",
    ]) {
      expect(shellKindOf(shell), shell).toBe("powershell");
    }
  });

  it("末尾に -NoExit -EncodedCommand <UTF-16LE の base64> を足す。既存の引数・環境・シェルはそのまま", () => {
    const env = { PATH: "C:\\bin" };
    const l = launch("pwsh.exe", ["-NoLogo", "-NoProfile"], env);
    const out = withShellCwdTracking(l, WIN);
    expect(out.shell).toBe("pwsh.exe");
    expect(out.env).toBe(env);
    const args = out.args as string[];
    expect(args.slice(0, 4)).toEqual(["-NoLogo", "-NoProfile", "-NoExit", "-EncodedCommand"]);
    expect(args).toHaveLength(5);
    expect(args[4]).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(decodedScript(args)).toBe(powerShellPromptScript());
    expect(l.args, "受け取った引数は書き換えない").toEqual(["-NoLogo", "-NoProfile"]);
  });

  it("既定のシェル（powershell.exe・引数なし）にも差し込む", () => {
    const out = withShellCwdTracking(launch("powershell.exe"), WIN);
    expect((out.args as string[]).slice(0, 2)).toEqual(["-NoExit", "-EncodedCommand"]);
  });

  it("-NoProfile・-ExecutionPolicy・-NoLogo 等は起動の仕方を決めないので差し込む", () => {
    const out = withShellCwdTracking(
      launch("powershell", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-NoLogo",
        "-NonInteractive",
      ]),
      WIN,
    );
    expect(out.args as string[]).toContain("-EncodedCommand");
  });

  it("スクリプトは既存の prompt を包み、FileSystem の場所だけ OSC 9;9 を引用符付きで [Console]::Write する", () => {
    const script = decodedScript(withShellCwdTracking(launch("powershell.exe"), WIN).args);
    expect(script).toBe(
      [
        "$__sodaPrompt = $function:prompt",
        "function global:prompt {",
        "  $loc = $executionContext.SessionState.Path.CurrentLocation",
        "  if ($loc.Provider.Name -eq 'FileSystem') {",
        `    [Console]::Write([char]27 + ']9;9;"' + $loc.ProviderPath + '"' + [char]27 + '\\')`,
        "  }",
        `  if ($__sodaPrompt) { & $__sodaPrompt } else { "PS $($loc)$('>' * ($nestedPromptLevel + 1)) " }`,
        "}",
      ].join("\n"),
    );
    // 5.1 は `e を持たない。ESC は [char]27 で作る（制御文字そのものは入れない）。
    expect(script).not.toContain("`e");
    // eslint-disable-next-line no-control-regex
    expect(script).not.toMatch(/[\x00-\x09\x0b-\x1f]/);
  });
});

describe("withShellCwdTracking — cmd（design D-4）", () => {
  it("cmd.exe・cmd・フルパス・大文字小文字の違いを cmd と判定する", () => {
    for (const shell of [
      "cmd.exe",
      "cmd",
      "CMD.EXE",
      "Cmd",
      "C:\\Windows\\System32\\cmd.exe",
      "C:/Windows/System32/CMD",
    ]) {
      expect(shellKindOf(shell), shell).toBe("cmd");
    }
  });

  it("PROMPT が無ければ既定の $P$G の前に知らせを足す。引数・ほかの環境は変えない", () => {
    const env = { PATH: "C:\\bin", SODA_PANE_ID: "p1" };
    const args = ["/k", "echo hi"];
    const out = withShellCwdTracking(launch("cmd.exe", args, env), WIN);
    expect(out.args).toBe(args);
    expect(out.env).toEqual({ PATH: "C:\\bin", SODA_PANE_ID: "p1", PROMPT: '$E]9;9;"$P"$E\\$P$G' });
    expect(CMD_PROMPT_PREFIX + CMD_DEFAULT_PROMPT).toBe('$E]9;9;"$P"$E\\$P$G');
    expect(env, "受け取った環境は書き換えない").toEqual({ PATH: "C:\\bin", SODA_PANE_ID: "p1" });
  });

  it("PROMPT があればその先頭に足す（利用者のプロンプトの見た目はそのまま）", () => {
    const out = withShellCwdTracking(launch("cmd", [], { PROMPT: "$T $P$_$G " }), WIN);
    expect(out.env["PROMPT"]).toBe('$E]9;9;"$P"$E\\$T $P$_$G ');
  });

  it("PROMPT の名前は大文字小文字を区別しない（入っていた綴りの項目を書き換え、別の項目を増やさない）", () => {
    const out = withShellCwdTracking(launch("cmd.exe", [], { Prompt: "[$P]" }), WIN);
    expect(out.env).toEqual({ Prompt: '$E]9;9;"$P"$E\\[$P]' });
  });

  it("PROMPT が空なら既定の $P$G として扱う", () => {
    const out = withShellCwdTracking(launch("cmd.exe", [], { PROMPT: "" }), WIN);
    expect(out.env["PROMPT"]).toBe('$E]9;9;"$P"$E\\$P$G');
  });
});
