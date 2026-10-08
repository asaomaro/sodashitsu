import { win32 } from "node:path";
import type { ExtensionScope } from "@sodashitsu/protocol";
import { PANE_ENV_DROPPED } from "../session/paneEnv.js";

/**
 * 拡張の起動の引数・止め方・環境変数（20261007-ext-host。純粋）。
 * 拡張のコマンドを `spawn` するのは `ExtensionHost.startOne` の 1 か所だけ（ここは引数を作るだけ）。
 */

/** 環境変数を引く（Windows は大文字小文字を区別しない）。 */
function envValue(env: NodeJS.ProcessEnv, name: string, platform: NodeJS.Platform): string | undefined {
  if (platform !== "win32") return env[name];
  const key = Object.keys(env).find((k) => k.toUpperCase() === name.toUpperCase());
  return key === undefined ? undefined : env[key];
}

function systemRoot(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string {
  const v = envValue(env, "SystemRoot", platform)?.trim() || envValue(env, "windir", platform)?.trim();
  return v ? v : "C:\\Windows";
}

/**
 * POSIX：`/bin/sh -c <command>`（絶対パス。ログインシェルにしない）。
 * Windows：`<シェル> /d /s /c "<command>"`。シェルは `ComSpec`（絶対パスのとき）か、無ければ `<SystemRoot>\System32\cmd.exe`。
 * **Windows の実機では確かめていない**（`commandArgv` と同じ形）。
 */
export function extensionArgv(command: string, platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  if (platform === "win32") {
    const comspec = envValue(env, "ComSpec", platform)?.trim();
    const shell = comspec && win32.isAbsolute(comspec) ? comspec : win32.join(systemRoot(env, platform), "System32", "cmd.exe");
    return [shell, "/d", "/s", "/c", `"${command}"`];
  }
  return ["/bin/sh", "-c", command];
}

/**
 * Windows だけ：木ごと止める `taskkill` の起動（**絶対パス**と、その `System32` を `cwd` にする。名前だけで起動すると、サーバを起動した場所に置かれた
 * 同じ名前のプログラムが動く——承認を通らないもう 1 つの起動の道になる。S25）。POSIX は null（グループへの合図を使う）。
 */
export function killTreeCommand(
  pid: number,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): { file: string; args: string[]; cwd: string } | null {
  if (platform !== "win32") return null;
  const dir = win32.join(systemRoot(env, platform), "System32");
  return { file: win32.join(dir, "taskkill.exe"), args: ["/pid", String(pid), "/T", "/F"], cwd: dir };
}

/** 拡張へ渡さない変数（pane に渡さないものに、拡張の変数を足したもの）。 */
export const EXTENSION_ENV_DROPPED: readonly string[] = [...PANE_ENV_DROPPED];

/**
 * 拡張の環境変数。`base` から落とす一覧を落とし（Windows は大文字小文字を区別せず）、`SODA_EXTENSION_ID`・`SODA_EXTENSION_SCOPE`・
 * `SODA_EXTENSION_RUN_ID` と、プロジェクトなら `SODA_PROJECT_ROOT` を足す。`SODA_PANE_ID`・`SODA_SERVER_URL`・`SODA_PANE_SOCKET`・
 * `SODA_AGENT_REPORT_SOCKET`・`SODACTL_TOKEN`・`SODACTL_URL` は、落としたまま足さない。
 */
export function buildExtensionEnv(
  base: NodeJS.ProcessEnv,
  ext: { id: string; scope: ExtensionScope; root: string | null; runId: string },
  platform: NodeJS.Platform = process.platform,
): Record<string, string> {
  const ci = platform === "win32";
  const dropped = new Set(ci ? EXTENSION_ENV_DROPPED.map((k) => k.toUpperCase()) : EXTENSION_ENV_DROPPED);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) {
    if (value === undefined) continue;
    if (dropped.has(ci ? key.toUpperCase() : key)) continue;
    env[key] = value;
  }
  env["SODA_EXTENSION_ID"] = ext.id;
  env["SODA_EXTENSION_SCOPE"] = ext.scope;
  env["SODA_EXTENSION_RUN_ID"] = ext.runId;
  if (ext.scope === "project" && ext.root !== null) env["SODA_PROJECT_ROOT"] = ext.root;
  return env;
}
