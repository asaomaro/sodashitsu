import { spawn } from "node:child_process";
import { IMAGE_MIME_TYPES, type ImageMimeType } from "@sodashitsu/protocol";

/**
 * クリップボード（20260927-cli-mode の design「clipboard.ts」・AC7）。
 * - 写す：外側の端末へ OSC 52（SSH 越し・VS Code・WSL・tmux の中でも効く唯一の手段）。手元（SSH でない）で OS の道具があれば、それでも写す
 *   （OSC 52 を受けない端末〔GNOME の VTE 等〕のため。両方効いても同じ中身）。
 * - 読む：手元の OS の道具（`pbpaste`・`wl-paste`・`xclip`・PowerShell）。SSH 越しでは手元のクリップボードを読めない（外側の端末の貼り付けを使う）。
 * 道具の呼び出しは差し替えられる（テスト）。
 */

/** 外側の端末のクリップボードへ書く列（OSC 52。一部の端末は BEL 終端しか受けないので BEL で終える。herdr の `selection.rs` と同じ）。 */
export function osc52(text: string): string {
  return `\x1b]52;c;${Buffer.from(text, "utf8").toString("base64")}\x07`;
}

export interface RunResult {
  code: number | null;
  stdout: Buffer;
}

/**
 * 道具を動かす（`input` は標準入力へ書く。`timeoutMs` で打ち切る）。起動できなければ reject。`capture: false` は標準出力を読まない
 * （写す道具。xclip・wl-copy は裏で残ってクリップボードを持ち続けるので、出力をつないだままにすると終わりを待ち続け、端末版も終われない）。
 */
export type Runner = (
  cmd: string,
  args: readonly string[],
  opts?: { input?: string | Buffer; timeoutMs?: number; capture?: boolean },
) => Promise<RunResult>;

export interface ClipboardEnv {
  platform: string;
  env: Readonly<Record<string, string | undefined>>;
  run?: Runner;
}

/** 道具を 1 つ動かす（本物）。 */
export const nodeRunner: Runner = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    const capture = opts.capture !== false;
    const child = spawn(cmd, args as string[], {
      stdio: ["pipe", capture ? "pipe" : "ignore", "ignore"],
      windowsHide: true,
    });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => child.kill(), opts.timeoutMs ?? 2000);
    timer.unref?.();
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.stdout?.on("data", (b: Buffer) => chunks.push(b));
    // 読まない道具は親の終わり（exit）で片付ける（裏に残る子の出力の閉じを待たない）。子はイベントループを引き留めない。
    child.on(capture ? "close" : "exit", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: Buffer.concat(chunks) });
    });
    if (!capture) child.unref();
    child.stdin?.on("error", () => undefined);
    child.stdin?.end(opts.input ?? "");
  });

/** SSH 越し（手元のクリップボードは外側の端末の向こうにある）。 */
export function isRemoteSession(env: ClipboardEnv["env"]): boolean {
  return !!(env["SSH_CONNECTION"] || env["SSH_TTY"] || env["SSH_CLIENT"]);
}

/** WSL（Windows の道具を `.exe` で呼ぶ）。 */
function isWsl(ce: ClipboardEnv): boolean {
  return ce.platform === "linux" && !!(ce.env["WSL_DISTRO_NAME"] || ce.env["WSL_INTEROP"]);
}

const PS_ARGS = ["-NoProfile", "-NonInteractive", "-STA", "-Command"];

/** 文字を写す道具（無ければ null。Windows・WSL は OSC 52〔Windows Terminal が受ける〕に任せる——`clip.exe` は UTF-8 を化かす）。 */
function writeTool(ce: ClipboardEnv): { cmd: string; args: string[] } | null {
  if (isRemoteSession(ce.env)) return null;
  if (ce.platform === "darwin") return { cmd: "pbcopy", args: [] };
  if (ce.platform !== "linux" || isWsl(ce)) return null;
  if (ce.env["WAYLAND_DISPLAY"]) return { cmd: "wl-copy", args: [] };
  if (ce.env["DISPLAY"]) return { cmd: "xclip", args: ["-selection", "clipboard", "-in"] };
  return null;
}

/** 手元の OS の道具で写す（道具が無い・失敗したら false。OSC 52 は呼ぶ側が別に出す）。 */
export async function writeClipboardTool(ce: ClipboardEnv, text: string): Promise<boolean> {
  const tool = writeTool(ce);
  if (!tool) return false;
  try {
    const r = await (ce.run ?? nodeRunner)(tool.cmd, tool.args, { input: text, capture: false });
    return r.code === 0;
  } catch {
    return false;
  }
}

/** 手元のクリップボードの文字（読めない・SSH 越しなら null。空なら ""）。 */
export async function readClipboardText(ce: ClipboardEnv): Promise<string | null> {
  if (isRemoteSession(ce.env)) return null;
  const run = ce.run ?? nodeRunner;
  const attempt = async (cmd: string, args: string[]): Promise<string | null> => {
    try {
      const r = await run(cmd, args);
      return r.code === 0 ? r.stdout.toString("utf8") : null;
    } catch {
      return null;
    }
  };
  if (ce.platform === "darwin") return attempt("pbpaste", []);
  const ps = "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Clipboard -Raw";
  if (ce.platform === "win32") return attempt("powershell", [...PS_ARGS, ps]);
  if (isWsl(ce)) {
    const t = await attempt("powershell.exe", [...PS_ARGS, ps]);
    return t === null ? null : t.replace(/\r\n/g, "\n");
  }
  if (ce.platform !== "linux") return null;
  if (ce.env["WAYLAND_DISPLAY"]) return attempt("wl-paste", ["--no-newline"]);
  if (ce.env["DISPLAY"]) return attempt("xclip", ["-selection", "clipboard", "-out"]);
  return null;
}

export interface ClipboardImage {
  mime: ImageMimeType;
  bytes: Buffer;
}

/** 画像を読む待ちの上限（PowerShell は起動に数秒かかる。web・herdr と同じく読めなければそのキーを端末へ送る）。 */
export function imageReadTimeoutMs(ce: Pick<ClipboardEnv, "platform" | "env">): number {
  return ce.platform === "win32" || isWsl(ce as ClipboardEnv) ? 8000 : 2000;
}

/** 形式の一覧から貼れる画像の形式（PNG を先に）。 */
function pickImageType(types: string[]): ImageMimeType | null {
  for (const m of IMAGE_MIME_TYPES) if (types.includes(m)) return m;
  return null;
}

/**
 * 手元のクリップボードの画像（無い・読めない・SSH 越しなら null）。Linux は `wl-paste`/`xclip` で形式を訊いてから読み、macOS は AppleScript で PNG、
 * Windows・WSL は PowerShell の `Clipboard.GetImage()` を PNG にして読む（herdr の `remote_image_paste` と同じく OS の道具）。
 */
export async function readClipboardImage(ce: ClipboardEnv): Promise<ClipboardImage | null> {
  if (isRemoteSession(ce.env)) return null;
  const run = ce.run ?? nodeRunner;
  const out = async (cmd: string, args: string[]): Promise<Buffer | null> => {
    try {
      const r = await run(cmd, args, { timeoutMs: imageReadTimeoutMs(ce) + 1000 });
      return r.code === 0 && r.stdout.length > 0 ? r.stdout : null;
    } catch {
      return null;
    }
  };
  if (ce.platform === "linux" && !isWsl(ce)) {
    const [list, read] = ce.env["WAYLAND_DISPLAY"]
      ? [["wl-paste", ["--list-types"]], (m: string) => ["wl-paste", ["--type", m]]]
      : ce.env["DISPLAY"]
        ? [
            ["xclip", ["-selection", "clipboard", "-target", "TARGETS", "-out"]],
            (m: string) => ["xclip", ["-selection", "clipboard", "-target", m, "-out"]],
          ]
        : [null, null];
    if (!list || !read) return null;
    const types = await out(list[0] as string, list[1] as string[]);
    const mime = types ? pickImageType(types.toString("utf8").split(/\s+/)) : null;
    if (!mime) return null;
    const [cmd, args] = read(mime) as [string, string[]];
    const bytes = await out(cmd, args);
    return bytes ? { mime, bytes } : null;
  }
  if (ce.platform === "darwin") {
    // `«data PNGf89504E47…»` の 16 進を読む。画像が無ければ osascript が失敗する。
    const r = await out("osascript", ["-e", "the clipboard as «class PNGf»"]);
    const m = r ? /«data PNGf([0-9A-Fa-f]+)»/.exec(r.toString("utf8")) : null;
    return m ? { mime: "image/png", bytes: Buffer.from(m[1]!, "hex") } : null;
  }
  if (ce.platform === "win32" || isWsl(ce)) {
    const script =
      "Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; " +
      "$i=[Windows.Forms.Clipboard]::GetImage(); if ($i) { $m=New-Object IO.MemoryStream; " +
      "$i.Save($m,[Drawing.Imaging.ImageFormat]::Png); [Convert]::ToBase64String($m.ToArray()) }";
    const r = await out(ce.platform === "win32" ? "powershell" : "powershell.exe", [
      ...PS_ARGS,
      script,
    ]);
    const b64 = r?.toString("utf8").trim() ?? "";
    return /^[A-Za-z0-9+/=]+$/.test(b64)
      ? { mime: "image/png", bytes: Buffer.from(b64, "base64") }
      : null;
  }
  return null;
}
