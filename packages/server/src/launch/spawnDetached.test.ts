import { readFileSync } from "node:fs";
import { readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir } from "../persist/atomicFile.js";
import {
  powerShellArgs,
  psQuote,
  quoteWindowsArg,
  spawnServe,
  windowsServeCommandLine,
  WMI_FALLBACK_NOTICE,
  wmiCreateScript,
  type SpawnServeRequest,
} from "./spawnDetached.js";

// 20260927-cli-mode の T5：`soda serve` を裏で起動する。Windows の WMI はこの環境で実機確認できないので、組み立て（コマンドライン・スクリプト）を確かめる。
describe("quoteWindowsArg（CommandLineToArgvW の規則）", () => {
  it("空白・引用符が無ければそのまま", () => {
    expect(quoteWindowsArg("serve")).toBe("serve");
    expect(quoteWindowsArg("C:\\node\\node.exe")).toBe("C:\\node\\node.exe");
  });
  it('空白を含めば " で囲む。末尾の \\ は倍にする（閉じる " を逃がさない）', () => {
    expect(quoteWindowsArg("C:\\Program Files\\nodejs\\node.exe")).toBe(
      '"C:\\Program Files\\nodejs\\node.exe"',
    );
    expect(quoteWindowsArg("C:\\my dir\\")).toBe('"C:\\my dir\\\\"');
    expect(quoteWindowsArg("")).toBe('""');
  });
  it('" は \\" にし、直前の \\ は倍にする', () => {
    expect(quoteWindowsArg('a"b')).toBe('"a\\"b"');
    expect(quoteWindowsArg('a\\"b')).toBe('"a\\\\\\"b"');
  });
});

describe("windowsServeCommandLine", () => {
  it("cmd.exe /d /s /c で node を起動し、出力を serve.out へ追記させる", () => {
    const line = windowsServeCommandLine(
      "C:\\Program Files\\nodejs\\node.exe",
      [
        "C:\\repo\\packages\\server\\dist\\main.js",
        "serve",
        "--state-dir",
        "C:\\Users\\a b\\AppData\\Local\\sodashitsu",
        "--session",
        "work",
      ],
      "C:\\Users\\a b\\AppData\\Local\\sodashitsu\\sessions\\work\\serve.out",
    );
    expect(line).toBe(
      'cmd.exe /d /s /c ""C:\\Program Files\\nodejs\\node.exe" C:\\repo\\packages\\server\\dist\\main.js serve --state-dir "C:\\Users\\a b\\AppData\\Local\\sodashitsu" --session work >> "C:\\Users\\a b\\AppData\\Local\\sodashitsu\\sessions\\work\\serve.out" 2>&1"',
    );
  });
  it('cmd.exe の特別な文字（& | < > ^ ( )）を含む引数は " で囲む（空白があってもなくても）', () => {
    const line = windowsServeCommandLine(
      "C:\\node\\node.exe",
      ["C:\\a&b\\main.js", "serve", "--state-dir", "C:\\x (y)\\s|t", "--session", "a^b<c>"],
      "C:\\o&ut\\serve.out",
    );
    expect(line).toBe(
      'cmd.exe /d /s /c "C:\\node\\node.exe "C:\\a&b\\main.js" serve --state-dir "C:\\x (y)\\s|t" --session "a^b<c>" >> "C:\\o&ut\\serve.out" 2>&1"',
    );
    // 引数の部分（向け先の手前）に、囲まれていない特別な文字が残っていない（外側の対の " を外した中身の、" の外の部分だけを見る）。
    const inner = line.slice('cmd.exe /d /s /c "'.length, line.indexOf(" >> "));
    const outside = inner
      .split('"')
      .filter((_, i) => i % 2 === 0)
      .join("");
    expect(outside).not.toMatch(/[&|<>^()]/);
  });

  it('" を含む引数は cmd.exe の引用の数え方をずらすので投げる', () => {
    expect(() => windowsServeCommandLine("node.exe", ['a"&calc'], "C:\\out")).toThrow(/cmd\.exe/);
  });

  it("% と改行は cmd.exe を通せないので投げる（呼び出し側は detached の spawn に落とす）", () => {
    expect(() => windowsServeCommandLine("node.exe", ["C:\\%TEMP%\\main.js"], "C:\\out")).toThrow(
      /cmd\.exe/,
    );
    expect(() => windowsServeCommandLine("node.exe", ["a\nb"], "C:\\out")).toThrow(/cmd\.exe/);
    expect(() => windowsServeCommandLine("node.exe", ["serve"], "C:\\50%\\out")).toThrow(
      /cmd\.exe/,
    );
  });
});

describe("wmiCreateScript / powerShellArgs", () => {
  it("Win32_Process.Create に単一引用符の文字列で渡し（' は ''）、窓を出さず、pid を出力する", () => {
    const script = wmiCreateScript(`cmd.exe /d /s /c "x" it's`, "C:\\Users\\o'brien");
    expect(script).toContain("Invoke-CimMethod -ClassName Win32_Process -MethodName Create");
    expect(script).toContain(`CommandLine = 'cmd.exe /d /s /c "x" it''s'`);
    expect(script).toContain(`CurrentDirectory = 'C:\\Users\\o''brien'`);
    expect(script).toContain("ShowWindow = [uint16]0");
    expect(script).toContain("ProcessStartupInformation = $si");
    expect(script).toContain("[Console]::Out.WriteLine($r.ProcessId)");
    expect(script).toMatch(/ReturnValue -ne 0\) \{.*exit 1 \}/);
  });
  it("psQuote は ' と U+2018〜U+201B を 2 つ重ねる（PowerShell はどれも単一引用符として扱う）", () => {
    expect(psQuote("a'b")).toBe("'a''b'");
    expect(psQuote("a\u2018b\u2019c\u201Ad\u201Be")).toBe(
      "'a\u2018\u2018b\u2019\u2019c\u201A\u201Ad\u201B\u201Be'",
    );
  });

  it("-EncodedCommand（UTF-16LE の base64）で渡す（引用の規則を 2 重に通さない）", () => {
    const args = powerShellArgs("Write-Output 'é'");
    expect(args.slice(0, 5)).toEqual([
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
    ]);
    expect(Buffer.from(args[5]!, "base64").toString("utf16le")).toBe("Write-Output 'é'");
  });
});

describe("spawnServe", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  });
  async function tempDir(): Promise<string> {
    const d = await makeTempDir("soda-spawn-");
    dirs.push(d);
    return d;
  }
  function req(dir: string, platform: NodeJS.Platform, args: string[]): SpawnServeRequest {
    return {
      execPath: process.execPath,
      args,
      cwd: dir,
      env: process.env,
      outPath: join(dir, "serve.out"),
      platform,
    };
  }

  it("Windows: WMI の pid（cmd.exe）を返し、終わったかは pid の生死で見る", async () => {
    const dir = await tempDir();
    const seen: string[][] = [];
    let alive = true;
    const spawned = await spawnServe(req(dir, "win32", ["main.js", "serve"]), {
      runPowerShell: async (args) => {
        seen.push([...args]);
        return "4321\r\n";
      },
      isAlive: () => alive,
    });
    expect(spawned).toMatchObject({ method: "wmi", pid: 4321 });
    expect(spawned.notice).toBeUndefined();
    expect(Buffer.from(seen[0]![5]!, "base64").toString("utf16le")).toContain(
      join(dir, "serve.out"),
    );
    expect(spawned.hasExited()).toBe(false);
    alive = false;
    expect(spawned.hasExited()).toBe(true);
  });

  it("Windows: WMI に失敗したら detached の spawn に落とし、知らせを付ける", async () => {
    const dir = await tempDir();
    const calls: { file: string; opts: { detached?: boolean; windowsHide?: boolean } }[] = [];
    const fakeSpawn = ((
      file: string,
      _args: string[],
      opts: { detached?: boolean; windowsHide?: boolean },
    ) => {
      calls.push({ file, opts });
      return { pid: 99, on: () => undefined, once: () => undefined, unref: () => undefined };
    }) as unknown as typeof import("node:child_process").spawn;
    const spawned = await spawnServe(req(dir, "win32", ["main.js", "serve"]), {
      runPowerShell: () => Promise.reject(new Error("powershell not found")),
      spawn: fakeSpawn,
    });
    expect(spawned).toMatchObject({ method: "detached", pid: 99, notice: WMI_FALLBACK_NOTICE });
    expect(calls[0]!.opts).toMatchObject({ detached: true, windowsHide: true });
  });

  it.skipIf(process.platform === "win32")(
    "POSIX: 新しいセッション（setsid）で起動し、stdout/stderr を serve.out（0600・追記）へ書く",
    async () => {
      const dir = await tempDir();
      const script =
        "console.log('out-line'); console.error('err-line'); setTimeout(() => {}, 300);";
      const spawned = await spawnServe(req(dir, process.platform, ["-e", script]));
      expect(spawned.method).toBe("detached");
      const pid = spawned.pid!;
      if (process.platform === "linux") {
        // /proc/<pid>/stat の 6 番目はセッション id。setsid なら自分自身の pid。
        const fields = readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1]!.split(" ");
        expect(Number(fields[3])).toBe(pid);
      }
      const deadline = Date.now() + 5000;
      while (!spawned.hasExited() && Date.now() < deadline)
        await new Promise((r) => setTimeout(r, 20));
      expect(spawned.hasExited()).toBe(true);
      const text = await readFile(join(dir, "serve.out"), "utf8");
      expect(text).toContain("out-line");
      expect(text).toContain("err-line");
      expect((await stat(join(dir, "serve.out"))).mode & 0o777).toBe(0o600);
    },
  );
});
