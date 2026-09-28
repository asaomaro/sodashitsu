/**
 * Windows で pane のシェルに「プロンプトのたびに今の場所を知らせる」設定を差し込む（20260928-windows-pane-cwd の design D-2〜D-4）。
 *
 * Windows では Node から他のプロセスの場所を読めず、pane の場所はシェルが知らせた場所だけになる（`AgentMonitor` の `cwdHint`）。
 * 既定の `powershell.exe`・`cmd.exe` は何も知らせないので、起動の引数・環境に知らせを足す。知らせは **OSC 9;9**（Windows Terminal の場所の知らせ。
 * 中身は符号化しない Windows のパス。decisions D3）で、受け取るのは `terminal/Mirror.ts` の `parseOsc9Cwd`。
 *
 * 純粋な関数（プラットフォーム・設定は引数で受ける）。差し込まないときは受け取った `launch` をそのまま返す。
 */

export interface ShellLaunch {
  shell: string;
  /** 文字列は Windows の 1 本のコマンドライン（`PtySpawnOptions.args`）。組み立てた行を壊さないよう、文字列のときは差し込まない。 */
  args: string[] | string;
  env: Record<string, string>;
}

export interface ShellCwdTrackingContext {
  platform: NodeJS.Platform;
  /** 共有の設定 `shellCwdTracking`（切なら差し込まない）。 */
  enabled: boolean;
}

/**
 * PowerShell（5.1・7）に `-EncodedCommand` で渡すスクリプト（design D-3）。プロファイルの読み込みの後に走り、既存の `prompt`（oh-my-posh・starship を含む）を
 * 包んで、その前に目に見えない OSC 9;9 を `[Console]::Write` で出す。5.1 は `` `e `` を持たないので `[char]27`。場所が FileSystem でない（`HKLM:` 等）ときは出さない。
 *
 * **直前のコマンドの成否（`$?`）を保つ**：包んだ側が先に文を実行すると `$?` が常に True になり、oh-my-posh・starship の失敗の色が消える。1 行目で `$?` を
 * 取り、元の `prompt` を呼ぶ直前に失敗なら `Write-Error '' -ErrorAction Ignore` で False に戻す（VS Code・Windows Terminal のシェル連携と同じ作法）。
 * `$LASTEXITCODE` はネイティブのコマンドを走らせないので変わらない。
 * **既知の制約**：セッションの途中で `prompt` が定義し直される（あとから oh-my-posh を初期化する等）と、包みが外れて新しい pane を開くまで追従が止まる。
 */
export function powerShellPromptScript(): string {
  return [
    "$__sodaPrompt = $function:prompt",
    "function global:prompt {",
    "  $__sodaOk = $?",
    "  $loc = $executionContext.SessionState.Path.CurrentLocation",
    "  if ($loc.Provider.Name -eq 'FileSystem') {",
    `    [Console]::Write([char]27 + ']9;9;"' + $loc.ProviderPath + '"' + [char]27 + '\\')`,
    "  }",
    "  if (-not $__sodaOk) { Write-Error '' -ErrorAction Ignore }",
    `  if ($__sodaPrompt) { & $__sodaPrompt } else { "PS $($loc)$('>' * ($nestedPromptLevel + 1)) " }`,
    "}",
  ].join("\n");
}

/** cmd の `PROMPT` の先頭に足す知らせ（design D-4）。`$E` は ESC、`$P` は今の場所（符号化しない）。 */
export const CMD_PROMPT_PREFIX = '$E]9;9;"$P"$E\\';

/** 利用者が `PROMPT` を設定していないときの cmd の既定。 */
export const CMD_DEFAULT_PROMPT = "$P$G";

/**
 * 利用者が起動の仕方を決めている PowerShell の引数（design D-3）。PowerShell は曖昧でない前方一致の省略も受けるので、名前（`-`・`--`・`/` を除いて小文字）が
 * これらの前方一致なら見送る（`-c`・`-f`・`-e`・`-Comm`・`-NoE` 等）。`-ec` は `-EncodedCommand` の別名。
 */
const POWERSHELL_LAUNCH_PARAMS = [
  "command",
  "commandwithargs",
  "file",
  "encodedcommand",
  "noexit",
] as const;
const POWERSHELL_LAUNCH_ALIASES = new Set(["ec", "cwa"]);

type ShellKind = "powershell" | "cmd" | null;

/** ファイル名（パスの区切りは `\`・`/` の両方。拡張子 `.exe` は有っても無くても。大文字小文字を区別しない）で判定する。 */
export function shellKindOf(shell: string): ShellKind {
  const base = (shell.split(/[\\/]/).pop() ?? "").toLowerCase().replace(/\.exe$/, "");
  if (base === "powershell" || base === "pwsh") return "powershell";
  if (base === "cmd") return "cmd";
  return null;
}

/** 値を取らない PowerShell の引数（起動の仕方を変えない）。 */
const POWERSHELL_SWITCHES = [
  "nologo",
  "noprofile",
  "noprofileloadtime",
  "noninteractive",
  "interactive",
  "login",
  "mta",
  "sta",
] as const;
/** 値を 1 つ取る PowerShell の引数（次の引数はその値で、位置引数ではない）。 */
const POWERSHELL_VALUE_PARAMS = [
  "executionpolicy",
  "version",
  "windowstyle",
  "workingdirectory",
  "inputformat",
  "outputformat",
  "psconsolefile",
  "configurationname",
  "configurationfile",
  "custompipename",
  "settingsfile",
] as const;
const POWERSHELL_VALUE_ALIASES = new Set(["ep", "wd", "if", "of", "config"]);

/**
 * 差し込んでよい引数か。起動の仕方を決める引数・**位置引数**（`pwsh script.ps1` は `-File`、5.1 は `-Command` として読む）・知らない引数・どちらとも読める省略が
 * 1 つでもあれば false（差し込まない側に倒す）。値を取る既知の引数の次の引数は、その値として読み飛ばす（`-ExecutionPolicy Bypass`）。
 */
function powerShellArgsAllowInjection(args: readonly string[]): boolean {
  for (let i = 0; i < args.length; i++) {
    const m = /^(?:--?|\/)(.+)$/.exec(args[i]!.trim());
    if (!m) return false; // 位置引数
    const raw = m[1]!.toLowerCase();
    const inlineValue = raw.includes(":"); // `-File:x`・`-ExecutionPolicy:Bypass`
    const name = raw.replace(/:.*$/, "");
    if (POWERSHELL_LAUNCH_ALIASES.has(name)) return false;
    if (POWERSHELL_LAUNCH_PARAMS.some((p) => p.startsWith(name))) return false;
    const isSwitch = POWERSHELL_SWITCHES.some((p) => p.startsWith(name));
    const takesValue =
      POWERSHELL_VALUE_ALIASES.has(name) || POWERSHELL_VALUE_PARAMS.some((p) => p.startsWith(name));
    if (isSwitch === takesValue) return false; // 知らない引数・どちらとも読める省略
    if (takesValue && !inlineValue) i++;
  }
  return true;
}

/** `-EncodedCommand` の値（UTF-16LE の base64。PowerShell の文書の形）。 */
function encodePowerShell(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

/**
 * 環境変数の名前は Windows では大文字小文字を区別しない——`Prompt` 等で入っていても同じ項目として扱う。綴りの違う項目が複数あれば、`PROMPT` があればそれを、
 * 無ければ最初のものを使い、ほかは落とす（どれが効くか分からない重複を子に渡さない）。
 */
function takeEnvKey(
  env: Record<string, string>,
  name: string,
): { key: string; value: string | undefined; rest: Record<string, string> } {
  const upper = name.toUpperCase();
  const keys = Object.keys(env).filter((k) => k.toUpperCase() === upper);
  const key = keys.includes(name) ? name : (keys[0] ?? name);
  const rest = { ...env };
  for (const k of keys) delete rest[k];
  return { key, value: env[key], rest };
}

export function withShellCwdTracking(
  launch: ShellLaunch,
  ctx: ShellCwdTrackingContext,
): ShellLaunch {
  if (ctx.platform !== "win32" || !ctx.enabled) return launch;
  if (typeof launch.args === "string") return launch;
  const kind = shellKindOf(launch.shell);
  if (kind === "powershell") {
    if (!powerShellArgsAllowInjection(launch.args)) return launch;
    return {
      ...launch,
      args: [
        ...launch.args,
        "-NoExit",
        "-EncodedCommand",
        encodePowerShell(powerShellPromptScript()),
      ],
    };
  }
  if (kind === "cmd") {
    const { key, value, rest } = takeEnvKey(launch.env, "PROMPT");
    const base = value === undefined || value === "" ? CMD_DEFAULT_PROMPT : value;
    // 既に知らせが付いている（soda の中から soda を起動した等）なら二重に足さない。
    const prompt = base.startsWith(CMD_PROMPT_PREFIX) ? base : CMD_PROMPT_PREFIX + base;
    return { ...launch, env: { ...rest, [key]: prompt } };
  }
  return launch;
}
