import { execFile as nodeExecFile, spawn as nodeSpawn } from "node:child_process";
import { chmodSync, closeSync, openSync } from "node:fs";
import { isPidAlive } from "../persist/StateDirLock.js";

/**
 * `soda serve` を裏で切り離して起動する（引数なしの `soda`。20260927-cli-mode の design「裏での起動」・research-startup §3.3）。
 *
 * - 出力: 状態ディレクトリの `serve.out`（0600・追記）を子の stdout/stderr にする。親は準備完了か子の終わりの後に読み、初回の token と失敗の理由を
 *   端末に出してから空にする（`findOrStart`）。
 * - Linux/WSL2/macOS: `detached: true`（POSIX では `setsid()`）で、端末を閉じた SIGHUP・SSH の切断が届かない別のセッションにする。
 * - Windows: 親が kill-on-close の Job（Windows Terminal・VS Code の統合端末）の中にいても抜けるよう、PowerShell から WMI の
 *   `Win32_Process.Create` で `cmd.exe /d /v:off /s /c "<node> <main> serve … >> serve.out 2>&1"` を起動する（herdr と同じ WMI）。WMI の子の環境は
 *   利用者の既定の環境（この端末の環境ではない）。WMI が失敗したら detached の spawn に落とし、「端末を閉じるとサーバも止まることがある」と知らせる。
 */
export const SERVE_OUT_FILE_NAME = "serve.out";

export interface SpawnServeRequest {
  /** Node の実行ファイル（`process.execPath`）。 */
  execPath: string;
  /** Node へ渡す引数（`[...execArgv, main.js, "serve", …]`）。 */
  args: readonly string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  /** `serve.out` の絶対パス。 */
  outPath: string;
  platform: NodeJS.Platform;
}

export interface SpawnedServe {
  method: "detached" | "wmi";
  /** 起動した子の pid（detached は node そのもの、WMI は間の `cmd.exe`）。分からなければ undefined。 */
  pid: number | undefined;
  /** 子が終わったか（WMI は `cmd.exe` の生死で見る）。 */
  hasExited(): boolean;
  /** WMI に失敗して detached に落ちたときの知らせ（端末版の画面に出す）。 */
  notice?: string | undefined;
}

export interface SpawnDeps {
  spawn?: typeof nodeSpawn;
  /** PowerShell の実行（stdout を返す。失敗は reject）。 */
  runPowerShell?: (args: readonly string[]) => Promise<string>;
  isAlive?: (pid: number) => boolean;
}

/** WMI に落ちたときの知らせ（design「起動と終了」）。 */
export const WMI_FALLBACK_NOTICE =
  "soda: サーバを Windows の WMI で起動できなかったため、この端末の子として起動しました。この端末（タブ）を閉じるとサーバも止まることがあります。";

export async function spawnServe(
  req: SpawnServeRequest,
  deps: SpawnDeps = {},
): Promise<SpawnedServe> {
  if (req.platform === "win32") {
    const run = deps.runPowerShell ?? runPowerShell;
    try {
      const commandLine = windowsServeCommandLine(req.execPath, req.args, req.outPath);
      const out = await run(powerShellArgs(wmiCreateScript(commandLine, req.cwd)));
      const pid = Number(out.trim().split(/\r?\n/).pop());
      if (!Number.isSafeInteger(pid) || pid <= 0)
        throw new Error(`unexpected output from Win32_Process.Create: ${out.trim()}`);
      const isAlive = deps.isAlive ?? isPidAlive;
      return { method: "wmi", pid, hasExited: () => !isAlive(pid) };
    } catch {
      return { ...spawnDetachedServe(req, deps.spawn ?? nodeSpawn), notice: WMI_FALLBACK_NOTICE };
    }
  }
  return spawnDetachedServe(req, deps.spawn ?? nodeSpawn);
}

/** 出力のファイルを 0600 の追記で開く（既にあれば権限を絞り直す。Windows では効かない）。 */
function openOut(outPath: string, platform: NodeJS.Platform): number {
  const fd = openSync(outPath, "a", 0o600);
  if (platform !== "win32") {
    try {
      chmodSync(outPath, 0o600);
    } catch {
      // 絞れなくても起動は続ける（状態ディレクトリそのものが同じ利用者のもの）。
    }
  }
  return fd;
}

function spawnDetachedServe(req: SpawnServeRequest, spawn: typeof nodeSpawn): SpawnedServe {
  const fd = openOut(req.outPath, req.platform);
  let exited = false;
  try {
    const child = spawn(req.execPath, [...req.args], {
      cwd: req.cwd,
      env: req.env,
      detached: true,
      stdio: ["ignore", fd, fd],
      windowsHide: true,
    });
    // `on`（`once` でない）：2 度目の error でも受け手が無いまま投げさせない。起動できない（ENOENT 等）も「終わった」として扱う（`findOrStart` が serve.out を見せる）。
    child.on("error", () => {
      exited = true;
    });
    child.once("exit", () => {
      exited = true;
    });
    child.unref();
    return { method: "detached", pid: child.pid, hasExited: () => exited };
  } finally {
    closeSync(fd); // 子が自分の複製を持つ。親は閉じる
  }
}

/**
 * Windows のコマンドラインの 1 つの引数を引用する（`CommandLineToArgvW`・MSVCRT の規則。`"` の前の `\` は倍にし、`"` は `\"`）。
 * 空白・`"` を含まなければそのまま（`force` なら必ず囲む）。
 */
export function quoteWindowsArg(arg: string, force = false): string {
  if (!force && arg !== "" && !/[\s"]/.test(arg)) return arg;
  let out = '"';
  let backslashes = 0;
  for (const ch of arg) {
    if (ch === "\\") {
      backslashes++;
      continue;
    }
    if (ch === '"') {
      out += `${"\\".repeat(backslashes * 2 + 1)}"`;
    } else {
      out += `${"\\".repeat(backslashes)}${ch}`;
    }
    backslashes = 0;
  }
  return `${out}${"\\".repeat(backslashes * 2)}"`;
}

/** `cmd.exe` が `"` の外で特別に扱う文字（つなぐ・つなぐ・向け先・逃がし・かっこ）。 */
const CMD_META = /[&|<>^()]/;

/**
 * WMI で起動するコマンドライン（`cmd.exe` に出力を `serve.out` へ追記させる）。`cmd.exe /s /c "…"` は外側の `"` の対だけを外して中身をそのまま実行する。
 * - `cmd.exe` の特別な文字（`& | < > ^ ( )`）を含む引数は `"` で囲む——`"` の中では文字どおりに渡る（`CommandLineToArgvW` にとっても囲むだけで意味は同じ）。
 * - **`%`・`"`・改行は扱わない**: `cmd.exe` は `"` の中でも `%VAR%` を展開し、引数の中の `"`（`\"`）は `cmd.exe` の引用の数え方をずらして後ろの特別な文字を
 *   生かしてしまう。含まれていれば投げる（呼び出し側は detached の spawn に落とす）。Windows のパスは `"` を含めないので、実際に落ちるのは `%` を含むパスだけ。
 * - 出力先は `>>`。`cmd.exe` の `>>` は末尾へ移ってから書くだけで追記の印（O_APPEND）では開かない——`serve.out` を空にした後の書き込みは元の位置に続き、
 *   手前は NUL で埋まる（`findOrStart` は読むときに NUL を落とす）。
 */
export function windowsServeCommandLine(
  execPath: string,
  args: readonly string[],
  outPath: string,
): string {
  for (const p of [execPath, ...args, outPath]) {
    if (/[%"\r\n]/.test(p)) throw new Error(`cannot pass ${JSON.stringify(p)} through cmd.exe`);
  }
  const node = [execPath, ...args]
    // 特別な文字を含む引数は必ず囲む（`quoteWindowsArg` の規則で。末尾の `\` を倍にして、閉じる `"` を逃がさない）。
    .map((a) => quoteWindowsArg(a, CMD_META.test(a)))
    .join(" ");
  // `/v:off`: 遅延展開（`!VAR!`）を切る（レジストリで既定を入れていても、`!` を含むパスを展開させない）。
  return `cmd.exe /d /v:off /s /c "${node} >> "${outPath}" 2>&1"`;
}

/**
 * PowerShell の単一引用符の文字列。PowerShell は `'` のほか U+2018〜U+201B（‘ ’ ‚ ‛）も単一引用符として扱うので、どれも 2 つ重ねて文字どおりにする。
 */
export function psQuote(s: string): string {
  return `'${s.replace(/['\u2018-\u201B]/g, "$&$&")}'`;
}

/**
 * `Win32_Process.Create` で起動し、pid を標準出力へ書く PowerShell のスクリプト。窓は出さない（`Win32_ProcessStartup.ShowWindow = 0`＝SW_HIDE）。
 * 失敗（戻り値が 0 でない）は終了コード 1。
 */
export function wmiCreateScript(commandLine: string, cwd: string): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$si = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }",
    `$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = ${psQuote(commandLine)}; CurrentDirectory = ${psQuote(cwd)}; ProcessStartupInformation = $si }`,
    'if ($r.ReturnValue -ne 0) { [Console]::Error.WriteLine("Win32_Process.Create returned $($r.ReturnValue)"); exit 1 }',
    "[Console]::Out.WriteLine($r.ProcessId)",
  ].join("\n");
}

/** `powershell.exe` の引数。スクリプトは `-EncodedCommand`（UTF-16LE の base64）で渡す——コマンドラインの引用の規則を 2 重に通さない。 */
export function powerShellArgs(script: string): string[] {
  return [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-EncodedCommand",
    Buffer.from(script, "utf16le").toString("base64"),
  ];
}

function runPowerShell(args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    nodeExecFile(
      "powershell.exe",
      [...args],
      { windowsHide: true, timeout: 15_000 },
      (err, stdout) => {
        if (err) reject(err);
        else resolve(String(stdout));
      },
    );
  });
}
