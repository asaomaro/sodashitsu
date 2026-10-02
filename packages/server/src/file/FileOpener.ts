import { spawn as nodeSpawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { platform as osPlatform } from "node:os";
import { delimiter, extname, join } from "node:path";
import { RpcError } from "@sodashitsu/protocol";

/** 開くコマンドの終わりを待つ時間。過ぎても動いていれば開けたものとして扱う（アプリが閉じるまで戻らない開き方がある）。 */
export const FILE_OPEN_SETTLE_MS = 2_000;

/**
 * 既定のアプリで「開く」と実行になる種類（拡張子。小文字）。端末の出力は pane のプログラムが自由に書けるので、リンクのクリックで実行まで進めない。
 */
const EXECUTABLE_EXTENSIONS: Record<"win32" | "darwin" | "other", ReadonlySet<string>> = {
  win32: new Set([
    ".exe", ".com", ".bat", ".cmd", ".ps1", ".psm1", ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh", ".msi", ".msp", ".scr", ".pif", ".lnk", ".url", ".hta",
    ".cpl", ".msc", ".jar", ".reg", ".appref-ms", ".application", ".gadget", ".inf", ".scf", ".chm", ".py", ".pyw", ".appinstaller", ".msix", ".appx",
    ".settingcontent-ms", ".library-ms", ".website", ".diagcab", ".ws", ".wsc", ".sct",
  ]),
  darwin: new Set([".app", ".command", ".tool", ".terminal", ".workflow", ".action", ".pkg", ".mpkg", ".scpt", ".scptd", ".applescript", ".jar", ".webloc", ".inetloc"]),
  other: new Set([".desktop", ".appimage", ".run", ".jar"]),
};

interface OpenChild {
  on(event: "error", cb: (err: Error) => void): unknown;
  on(event: "exit", cb: (code: number | null) => void): unknown;
  unref(): void;
}

export interface FileOpenerOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  spawn?: (command: string, args: string[]) => OpenChild;
  /** コマンドが PATH にあるか（テストで差し替える）。 */
  hasCommand?: (command: string) => boolean;
  settleMs?: number;
}

/**
 * サーバのマシンの既定のアプリでファイル・ディレクトリを開く（ブラウザがサーバと同じマシンにあるときの、端末のファイルのリンクのクリック）。
 * Windows は `explorer.exe`、macOS は `open`、ほかは WSL なら `wslview`、画面（`DISPLAY`・`WAYLAND_DISPLAY`）があれば `xdg-open`。
 * どれも無い（画面の無いサーバ・コンテナ）なら `file_open_unavailable`——ブラウザはダウンロードへ切り替える。
 */
export class FileOpener {
  private readonly platform: NodeJS.Platform;
  private readonly env: NodeJS.ProcessEnv;
  private readonly spawn: (command: string, args: string[]) => OpenChild;
  private readonly hasCommand: (command: string) => boolean;
  private readonly settleMs: number;

  constructor(opts: FileOpenerOptions = {}) {
    this.platform = opts.platform ?? osPlatform();
    this.env = opts.env ?? process.env;
    this.spawn = opts.spawn ?? ((command, args) => nodeSpawn(command, args, { detached: true, stdio: "ignore" }));
    this.hasCommand = opts.hasCommand ?? ((command) => onPath(command, this.env));
    this.settleMs = opts.settleMs ?? FILE_OPEN_SETTLE_MS;
  }

  /** 開く手段があるか。 */
  available(): boolean {
    return this.command() !== null;
  }

  private command(): string | null {
    if (this.platform === "win32") return "explorer.exe";
    if (this.platform === "darwin") return "open";
    if (this.env["WSL_DISTRO_NAME"] && this.hasCommand("wslview")) return "wslview";
    if ((this.env["DISPLAY"] || this.env["WAYLAND_DISPLAY"]) && this.hasCommand("xdg-open")) return "xdg-open";
    return null;
  }

  /**
   * 開くと実行になるか。拡張子で見る（`path` はリンクを辿った先を渡す——`notes.txt` という名前のリンクで隠せない）。
   * - Windows は `PATHEXT` の拡張子も、WSL の `wslview` は Windows のシェルに渡すので Windows の一覧も見る。
   * - macOS の `open` は、拡張子の無い実行できるファイルを Terminal で走らせる。
   */
  private wouldExecute(command: string, path: string, file?: { isFile: boolean; mode: number }): boolean {
    const ext = extname(path).toLowerCase();
    if (this.platform === "win32" || command === "wslview") {
      if (EXECUTABLE_EXTENSIONS.win32.has(ext)) return true;
      const pathExt = (this.env["PATHEXT"] ?? "").toLowerCase().split(";");
      if (ext !== "" && pathExt.includes(ext)) return true;
      if (this.platform === "win32") return false;
    }
    if (this.platform === "darwin") {
      if (EXECUTABLE_EXTENSIONS.darwin.has(ext)) return true;
      return ext === "" && file?.isFile === true && (file.mode & 0o111) !== 0;
    }
    return EXECUTABLE_EXTENSIONS.other.has(ext);
  }

  /**
   * `path`（実在する絶対パス。リンクを辿った先）を開く。`file` はその種類と権限（分かるとき）。開けなければ `file_open_*` の `RpcError`。
   */
  async open(path: string, file?: { isFile: boolean; mode: number }): Promise<void> {
    const command = this.command();
    if (command === null) throw new RpcError("file_open_unavailable", "no way to open files on this machine");
    if (this.wouldExecute(command, path, file)) throw new RpcError("file_open_refused", "refusing to open an executable file");
    await new Promise<void>((resolvePromise, rejectPromise) => {
      let child: OpenChild;
      try {
        child = this.spawn(command, [path]);
      } catch {
        rejectPromise(new RpcError("file_open_unavailable", `cannot run ${command}`));
        return;
      }
      const timer = setTimeout(() => resolvePromise(), this.settleMs);
      timer.unref();
      child.on("error", (err) => {
        clearTimeout(timer);
        const missing = (err as NodeJS.ErrnoException).code === "ENOENT";
        rejectPromise(new RpcError(missing ? "file_open_unavailable" : "file_open_failed", `cannot run ${command}`));
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        // explorer.exe は開けても 1 で終わる。
        if (code === 0 || this.platform === "win32") resolvePromise();
        else rejectPromise(new RpcError("file_open_failed", `${command} exited with ${String(code)}`));
      });
      child.unref();
    });
  }
}

function onPath(command: string, env: NodeJS.ProcessEnv): boolean {
  for (const dir of (env["PATH"] ?? "").split(delimiter)) {
    if (dir === "") continue;
    try {
      accessSync(join(dir, command), constants.X_OK);
      return true;
    } catch {
      // 次の場所
    }
  }
  return false;
}
