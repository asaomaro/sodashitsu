import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function bundledVscodeScript(): string | undefined {
  for (const location of [
    "../../../../scripts/vscode-cdp/",
    "../../../../plugins/vscode-desktop/",
  ]) {
    const base = new URL(location, import.meta.url);
    if (
      ["cdp-launcher.mjs", "cdp-bridge.mjs", "cdp-client.mjs", "resident-bridge.mjs"].every(
        (name) => existsSync(fileURLToPath(new URL(name, base))),
      )
    )
      return fileURLToPath(new URL("cdp-launcher.mjs", base));
  }
}
export function bundledVscodeSupported(): boolean {
  return !!bundledVscodeScript() && (process.platform === "win32" || !!process.env.WSL_DISTRO_NAME);
}
/** Read-only path discovery; never starts VSCode, changes its profile, or changes OS settings. */
export function bundledVscodeCommand(
  origin: string,
  permissions: { allowInput: boolean; allowFit: boolean },
): string[] | undefined {
  let script = bundledVscodeScript();
  if (!script) return;
  if (process.platform !== "win32" && !process.env.WSL_DISTRO_NAME) return;
  const discovery = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$code=@((Join-Path $env:LOCALAPPDATA 'Programs\\Microsoft VS Code\\Code.exe'),(Join-Path $env:ProgramFiles 'Microsoft VS Code\\Code.exe'))|Where-Object {Test-Path -LiteralPath $_}|Select-Object -First 1
$node=(Get-Command node.exe -ErrorAction Stop).Source
@{code=$code;node=$node;profile=(Join-Path $env:LOCALAPPDATA 'Sodashitsu\\vscode-profile')}|ConvertTo-Json -Compress
`,
    ],
    { encoding: "utf8", timeout: 5000, windowsHide: true },
  );
  if (discovery.status !== 0) return;
  let paths: { code: string; node: string; profile: string };
  try {
    paths = JSON.parse(discovery.stdout.replace(/^\uFEFF/, "").trim());
  } catch {
    return;
  }
  if (
    ![paths.code, paths.node, paths.profile].every(
      (p) => typeof p === "string" && !!p && !/[\0\r\n]/.test(p),
    )
  )
    return;
  let node = process.execPath;
  if (process.platform !== "win32") {
    const convertedScript = spawnSync("wslpath", ["-w", script], {
      encoding: "utf8",
      timeout: 3000,
    });
    const convertedNode = spawnSync("wslpath", ["-u", paths.node], {
      encoding: "utf8",
      timeout: 3000,
    });
    if (
      convertedScript.status !== 0 ||
      convertedNode.status !== 0 ||
      !convertedScript.stdout.trim() ||
      !convertedNode.stdout.trim()
    )
      return;
    script = convertedScript.stdout.trim();
    node = convertedNode.stdout.trim();
  }
  return [
    node,
    script,
    "--code",
    paths.code,
    "--user-data-dir",
    paths.profile,
    "--soda",
    origin,
    ...(permissions.allowInput ? ["--allow-input"] : []),
    ...(permissions.allowFit && permissions.allowInput ? ["--allow-fit"] : []),
  ];
}
