import { IMAGE_CHUNK_BYTES, IMAGE_PATH_MAX, isPastablePath } from "./image.js";

/**
 * 端末のファイルのリンクとドロップ（ブラウザ版はローカルのファイルに直接触れないので、サーバ越しに扱う）でサーバとブラウザが共有する定数と判定。
 * - リンク: ブラウザが出力の中のパスらしい文字列を `file.resolve` で確かめ、クリックで `file.open`（サーバのマシンのアプリで開く）か
 *   `file.read`（分けて受け取ってブラウザのダウンロードにする）。
 * - ドロップ: 元のパスが分かればそのパスを、分からなければ `file.upload.*` でサーバへ送って置いた先のパスを pane へ貼る。
 * 画像の貼り付け（`image.ts`）と同じく `/ws` の 1 通の上限のため分けて送る（中継先のマシンでも同じ経路で通る）。
 */

/** 1 つのファイルの上限（送る・受け取るの両方）。 */
export const FILE_MAX_BYTES = 256 * 1024 * 1024;
/** 1 片の生のバイト数（画像と同じ。base64 で 1 MiB）。 */
export const FILE_CHUNK_BYTES = IMAGE_CHUNK_BYTES;
/** 1 片の base64 の文字数の上限。 */
export const FILE_CHUNK_BASE64_MAX = (FILE_CHUNK_BYTES / 3) * 4;
/** パスの長さの上限。 */
export const FILE_PATH_MAX = IMAGE_PATH_MAX;
/** `file.resolve` で 1 度に確かめるパスの数の上限。 */
export const FILE_RESOLVE_MAX_PATHS = 64;
/** ブラウザが送るファイル名の長さの上限（サーバが `sanitizeFileName` で直す前）。 */
export const FILE_NAME_INPUT_MAX = 1024;
/** 置くファイルの名前の上限（UTF-8 のバイト数。多くのファイルシステムの 255 に余裕を持たせる）。 */
export const FILE_NAME_MAX_BYTES = 200;

/** `file.resolve` が返す、実在するパスの情報。 */
export interface ResolvedFile {
  /** サーバ（pane のマシン）での絶対パス。 */
  path: string;
  kind: "file" | "dir";
  /** バイト数（ディレクトリは 0）。 */
  size: number;
}

const WINDOWS_RESERVED_NAME_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

function utf8Length(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** 先頭から `maxBytes`（UTF-8）に収まるところまで（文字の途中では切らない）。 */
function truncateUtf8(s: string, maxBytes: number): string {
  let out = "";
  let bytes = 0;
  for (const ch of s) {
    const n = utf8Length(ch);
    if (bytes + n > maxBytes) break;
    out += ch;
    bytes += n;
  }
  return out;
}

/**
 * ブラウザから届いたファイル名を、サーバに置く名前にする。ディレクトリの部分を落とし、パスの区切り・制御文字・見た目を偽る文字
 * （`isPastablePath` が断るもの）・Windows で使えない文字を `_` に替える。`.`・`..`・空は `file`。Windows の予約名（`con`・`nul` 等）は
 * 先頭に `_` を付ける。長すぎる名前は拡張子を残して切る。返す名前は必ず `isPastablePath` を通る。
 */
export function sanitizeFileName(name: string): string {
  const base = name.slice(Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\")) + 1);
  let out = "";
  for (const ch of base) {
    out += /[<>:"|?*]/.test(ch) || !isPastablePath(ch) ? "_" : ch;
  }
  out = out.trim().replace(/[. ]+$/, "");
  if (out === "" || out === "." || out === "..") return "file";
  if (WINDOWS_RESERVED_NAME_RE.test(out)) out = `_${out}`;
  if (utf8Length(out) > FILE_NAME_MAX_BYTES) {
    const dot = out.lastIndexOf(".");
    const ext = dot > 0 && utf8Length(out.slice(dot)) <= 20 ? out.slice(dot) : "";
    const stem = ext ? out.slice(0, dot) : out;
    out = truncateUtf8(stem, FILE_NAME_MAX_BYTES - utf8Length(ext)).replace(/[. ]+$/, "") + ext;
    if (out === ext) out = `file${ext}`;
  }
  return out;
}

/** 引用しなくてもシェルが 1 語として読む文字だけか（ASCII の安全な文字と、ASCII の外の文字）。 */
const POSIX_SAFE_RE = /^[A-Za-z0-9_\-.,/:@%+=\u0080-\uffff]+$/;
const WINDOWS_SAFE_RE = /^[A-Za-z0-9_\-.,\\/:@+=~\u0080-\uffff]+$/;

/**
 * パスを、pane のシェルが 1 語として読む形にする（ふつうの端末にファイルをドロップしたときと同じ）。
 * - posix（sh・bash・zsh・fish）: 安全な文字だけならそのまま、そうでなければ単一引用符で包む（中の `'` は `'\''`）。
 * - windows（cmd・PowerShell）: 安全な文字だけならそのまま、そうでなければ二重引用符で包む（Windows のファイル名に `"` は現れない）。
 *   PowerShell では二重引用符の中の `$`・バッククォートが展開される（Windows Terminal と同じ既知の制約）。
 */
export function quotePathForShell(path: string, os: "posix" | "windows"): string {
  if (os === "windows") return WINDOWS_SAFE_RE.test(path) ? path : `"${path}"`;
  return POSIX_SAFE_RE.test(path) ? path : `'${path.replace(/'/g, "'\\''")}'`;
}

/**
 * `file:` の URI をパスにする（OSC 8 のリンク・ドロップの `text/uri-list`）。`file:` でない・解釈できない・貼れない文字を含むなら null。
 * - ホスト名は、空・`localhost`・`hostname`（pane のマシンの名前）だけを通す。OSC 8 はその端末のホスト名を入れるので、pane の中の ssh の先で
 *   出たリンク（`file://remotehost/etc/x`）を、サーバの同じパスのファイルとして開かない。
 * - 区切りが 2 つ続く始まり（`file:////host/share/…`。Windows では UNC になる）は通さない。
 * - Windows のドライブ（`file:///C:/dir/a.txt`）は `C:/dir/a.txt` にする。
 */
export function fileUriToPath(uri: string, hostname?: string): string | null {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return null;
  }
  if (url.protocol !== "file:") return null;
  const host = url.hostname.toLowerCase();
  if (host !== "" && host !== "localhost" && host !== hostname?.toLowerCase()) return null;
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (/^[\\/]{2}/.test(path)) return null;
  if (/^\/[A-Za-z]:[\\/]/.test(path)) path = path.slice(1);
  return isPastablePath(path) ? path : null;
}
