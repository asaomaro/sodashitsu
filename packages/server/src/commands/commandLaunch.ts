import { spawn as nodeSpawn } from "node:child_process";
import type { CommandType } from "@wtm/protocol";

/**
 * 独自コマンドの起動の仕方（20260927-custom-command-keys。herdr の `raw_command_argv`〔`src/platform/linux.rs`〕に合わせる）。
 * コマンドの文字列は**設定ファイルに書かれたとおり**に argv の最後の要素として渡す（シェルの構文として解釈させるのは持ち主の意図）。
 * ブラウザから来た値はここへ来ない（`CommandService.run` が一覧の定義からだけ取る）。
 */

/** 環境変数を大文字小文字を区別せずに引く（Windows の `ComSpec`）。 */
function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const key = Object.keys(env).find((k) => k.toUpperCase() === name.toUpperCase());
  return key === undefined ? undefined : env[key];
}

/**
 * Unix：`/bin/sh -c <command>`（`shell` はログインシェルの `-lc`。herdr と同じ）。
 * Windows：`<ComSpec> /d /s /c "<command>"`（`ComSpec` が無い・空なら `cmd.exe`）。Node の `shell: true` と同じ形——`/s` で cmd.exe に外側の `"` だけを
 * 外させ、中の引用符（`"C:\Program Files\x.exe" "arg"`）を壊さない。**Windows の実機では確かめていない**（design「ドメイン固有の考慮」）。
 */
export function commandArgv(
  type: CommandType,
  command: string,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): string[] {
  if (platform === "win32") {
    const comspec = envValue(env, "ComSpec")?.trim();
    return [comspec ? comspec : "cmd.exe", "/d", "/s", "/c", `"${command}"`];
  }
  return ["/bin/sh", type === "shell" ? "-lc" : "-c", command];
}

/**
 * PTY（node-pty）へ渡す引数（popup・pane 種）。Windows では**1 本のコマンドラインの文字列**にする——配列で渡すと node-pty の `argsToCommandLine` が
 * 要素の中の `"` を `\"` に書き換え、`cmd.exe /d /s /c \"lazygit\"` になって起動できない（node-pty 1.2.0-beta.15 の `windowsPtyAgent.js`。review ラウンド 1）。
 * 文字列なら node-pty は `<file> <args>` とそのままつなぐ。Unix は配列のまま。
 */
export function ptyArgs(argv: readonly string[], platform: NodeJS.Platform): string[] | string {
  const rest = argv.slice(1);
  return platform === "win32" ? rest.join(" ") : rest;
}

export interface DetachedSpawnOptions {
  cwd: string;
  env: Record<string, string>;
  platform: NodeJS.Platform;
}

/**
 * 裏で切り離して走らせる（`shell` 種）。入出力は捨て、サーバは終わりを待たない（`unref`）。終わったら `onDone`、起動できなければ
 * （ENOENT 等。`error` は非同期にも来る）`onError` を 1 度だけ呼ぶ。同期に投げた例外はそのまま呼び出し側へ。
 */
export function spawnDetachedCommand(
  argv: readonly string[],
  opts: DetachedSpawnOptions,
  onDone: () => void,
  onError: (err: Error) => void,
  spawn: typeof nodeSpawn = nodeSpawn,
): void {
  const [file, ...args] = argv;
  if (file === undefined) throw new Error("empty argv");
  const child = spawn(file, args, {
    cwd: opts.cwd,
    env: opts.env,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    // cmd.exe の `/s /c "<command>"` は引用し直さずにそのまま渡す（Node の `shell: true` と同じ）。
    windowsVerbatimArguments: opts.platform === "win32",
  });
  let settled = false;
  // `on`（`once` でない）：2 度目の error でも受け手が無いまま投げさせない（サーバを落とさない）。
  child.on("error", (err) => {
    if (settled) return;
    settled = true;
    onError(err);
  });
  child.once("exit", () => {
    if (settled) return;
    settled = true;
    onDone();
  });
  child.unref();
}
