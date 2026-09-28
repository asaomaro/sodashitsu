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
 */
export function powerShellPromptScript(): string {
  return [
    "$__sodaPrompt = $function:prompt",
    "function global:prompt {",
    "  $loc = $executionContext.SessionState.Path.CurrentLocation",
    "  if ($loc.Provider.Name -eq 'FileSystem') {",
    `    [Console]::Write([char]27 + ']9;9;"' + $loc.ProviderPath + '"' + [char]27 + '\\')`,
    "  }",
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

function hasPowerShellLaunchParam(args: readonly string[]): boolean {
  return args.some((arg) => {
    const m = /^(?:--?|\/)(.+)$/.exec(arg.trim());
    if (!m) return false;
    const name = m[1]!.toLowerCase().replace(/:.*$/, ""); // `-File:x` の形も名前だけで見る
    if (POWERSHELL_LAUNCH_ALIASES.has(name)) return true;
    return POWERSHELL_LAUNCH_PARAMS.some((p) => p.startsWith(name));
  });
}

/** `-EncodedCommand` の値（UTF-16LE の base64。PowerShell の文書の形）。 */
function encodePowerShell(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

/** 環境変数の名前は Windows では大文字小文字を区別しない——`Prompt` 等で入っていても同じ項目として扱う。 */
function findEnvKey(env: Record<string, string>, name: string): string | undefined {
  const upper = name.toUpperCase();
  return Object.keys(env).find((k) => k.toUpperCase() === upper);
}

export function withShellCwdTracking(
  launch: ShellLaunch,
  ctx: ShellCwdTrackingContext,
): ShellLaunch {
  if (ctx.platform !== "win32" || !ctx.enabled) return launch;
  if (typeof launch.args === "string") return launch;
  const kind = shellKindOf(launch.shell);
  if (kind === "powershell") {
    if (hasPowerShellLaunchParam(launch.args)) return launch;
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
    const key = findEnvKey(launch.env, "PROMPT") ?? "PROMPT";
    const current = launch.env[key];
    const base = current === undefined || current === "" ? CMD_DEFAULT_PROMPT : current;
    return { ...launch, env: { ...launch.env, [key]: CMD_PROMPT_PREFIX + base } };
  }
  return launch;
}
