import type { IBuffer, ILink, ILinkProvider, Terminal } from "@xterm/xterm";
import { FILE_RESOLVE_MAX_PATHS, type ResolvedFile } from "@sodashitsu/protocol";

/**
 * 端末の出力の中のファイルのパスをリンクにする（ふつうの端末の「パスを Ctrl+クリックで開く」）。ブラウザはファイルに触れないので、
 * 行の中のパスらしい文字列（{@link findPathCandidates}）を、サーバに確かめてもらい（`file.resolve`。相対パスはその pane の今の場所から解く）、
 * 実在したものだけをリンクにする。開く方法（サーバのマシンのアプリで開く・ダウンロード）は `FileTransfer` が決める。
 */

/** 行の中の、パスらしい文字列。 */
export interface PathCandidate {
  /** 行の文字列での範囲（`end` は含まない）。後ろの行番号・列（`:12:3`・`(12,3)`）を含む。 */
  start: number;
  end: number;
  /** 確かめるパス（先に実在したものを使う）。 */
  paths: string[];
}

/** 1 行から拾う候補の数の上限（1 つの候補は 2 つまでのパスを確かめる。`file.resolve` の 1 回の上限に収める）。 */
const MAX_CANDIDATES = FILE_RESOLVE_MAX_PATHS / 2;

const URL_RE = /[A-Za-z][A-Za-z0-9+.-]*:\/\/\S+/g;
/** パスに含めない文字（空白・引用符・括弧・区切り）。`:` はドライブ（`C:\`）と行番号の区切りにだけ現れる。 */
const SEGMENT = "[^\\s\"'`<>|()\\[\\]{}:;,*?=\\\\/]+";
const TOKEN_RE = new RegExp(`(?:[A-Za-z]:[\\\\/]|~[\\\\/]|\\.{1,2}[\\\\/]|[\\\\/])?${SEGMENT}(?:[\\\\/]${SEGMENT})*[\\\\/]?`, "g");
/** 後ろに続く行番号・列（`:12`・`:12:3`・`(12)`・`(12,3)`）。 */
const POSITION_RE = /^(?::\d+(?::\d+)?|\(\d+(?:,\s*\d+)?\))/;
/** 拡張子らしい終わり（区切りの無い名前——`README.md`・`package.json`——をパスとして拾う条件）。 */
const EXTENSION_RE = /\.[A-Za-z0-9_+-]{1,10}$/;

/**
 * 行の文字列から、パスらしい文字列を拾う。拾うのは「区切り（`/`・`\`）を含む」か「拡張子らしい終わりを持つ」語で、文字を 1 つは含むもの
 * （`1.2.3` のような数は拾わない）。URL の中は拾わない（URL のリンクが扱う）。空白を含むパスは拾えない。実在するかはサーバが確かめるので、
 * ここは広めに拾う。`git diff` の見出しの `a/`・`b/` は、外したパスも候補に加える。
 */
export function findPathCandidates(text: string): PathCandidate[] {
  const urls: [number, number][] = [];
  for (const m of text.matchAll(URL_RE)) urls.push([m.index, m.index + m[0].length]);
  const out: PathCandidate[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    if (out.length >= MAX_CANDIDATES) break;
    const start = m.index;
    let token = m[0];
    if (urls.some(([s, e]) => start < e && start + token.length > s)) continue;
    // 文の終わりの `.`（`see src/a.ts.`）は外す。`.`・`..` だけの区切りは残す。
    const stripped = token.replace(/\.+$/, "");
    const trimmed = stripped !== token && stripped !== "" && !/[\\/]$/.test(stripped);
    if (trimmed) token = stripped;
    if (!/[A-Za-z\u0080-\uffff]/.test(token)) continue;
    if (!/[\\/]/.test(token) && !EXTENSION_RE.test(token)) continue;
    let end = start + token.length;
    if (!trimmed) end += POSITION_RE.exec(text.slice(end))?.[0].length ?? 0;
    const paths = [token];
    if (/^[ab]\/./.test(token)) paths.push(token.slice(2));
    out.push({ start, end, paths });
  }
  return out;
}

/** 折り返しを辿る行数の上限（これより長い 1 行は、途中から読む）。 */
const MAX_WRAPPED_ROWS = 8;

interface LogicalLine {
  text: string;
  /** `text` の位置（UTF-16 の単位）ごとの、セルの位置（0 始まり）と幅。 */
  cells: { x: number; y: number; width: number }[];
}

/** 折り返された行をつないだ 1 行（`y` は 0 始まりのバッファの行）。 */
function readLogicalLine(buffer: IBuffer, y: number): LogicalLine | null {
  let first = y;
  while (first > 0 && y - first < MAX_WRAPPED_ROWS && buffer.getLine(first)?.isWrapped) first--;
  let last = y;
  while (last - y < MAX_WRAPPED_ROWS && buffer.getLine(last + 1)?.isWrapped) last++;
  let text = "";
  const cells: LogicalLine["cells"] = [];
  const cell = buffer.getNullCell();
  for (let row = first; row <= last; row++) {
    const line = buffer.getLine(row);
    if (!line) return null;
    for (let x = 0; x < line.length; x++) {
      line.getCell(x, cell);
      const width = cell.getWidth();
      if (width === 0) continue; // 全角の文字の右半分
      // 全角の文字が行の終わりに収まらないとき、xterm.js は最後のセルを空けて次の行へ送る。その空きは文字として数えない。
      if (cell.getChars() === "" && x === line.length - 1 && row < last) continue;
      const chars = cell.getChars() || " ";
      for (let i = 0; i < chars.length; i++) cells.push({ x, y: row, width });
      text += chars;
    }
  }
  return { text, cells };
}

export interface FileLinkProviderOptions {
  term: Pick<Terminal, "buffer">;
  /** 候補のパスを確かめる（`paths` と同じ並び。無ければ null）。確かめられなければ reject してよい（リンクにしない）。 */
  resolve(paths: string[]): Promise<(ResolvedFile | null)[]>;
  /** リンクが押された（修飾キー・ボタンの確かめは呼ばれる側）。 */
  activate(ev: MouseEvent, file: ResolvedFile): void;
}

/** xterm.js のリンクの提供元。行に重なったときに呼ばれ、実在するパスだけをリンクとして返す（答えは非同期）。 */
export function createFileLinkProvider(opts: FileLinkProviderOptions): ILinkProvider {
  /**
   * 聞かれた回の番号。xterm.js は別の行へ移るたびに聞き直し、答えを「今の行のもの」として受け取る——前の行の遅れた答えを返すと、
   * 今の行の判定に前の行のリンクが混ざる。新しく聞かれた後に届いた古い答えは返さない（xterm.js はもう待っていない）。
   */
  let asked = 0;
  return {
    provideLinks(bufferLineNumber, callback) {
      const seq = ++asked;
      const line = readLogicalLine(opts.term.buffer.active, bufferLineNumber - 1);
      const candidates = line ? findPathCandidates(line.text) : [];
      if (!line || candidates.length === 0) return callback(undefined);
      opts.resolve(candidates.flatMap((c) => c.paths)).then(
        (files) => {
          if (seq !== asked) return;
          const links: ILink[] = [];
          let i = 0;
          for (const c of candidates) {
            const file = files.slice(i, i + c.paths.length).find((f) => f != null);
            i += c.paths.length;
            const from = line.cells[c.start];
            const to = line.cells[c.end - 1];
            if (!file || !from || !to) continue;
            links.push({
              // xterm.js の範囲は 1 始まりで、終わりを含む。
              range: { start: { x: from.x + 1, y: from.y + 1 }, end: { x: to.x + to.width, y: to.y + 1 } },
              text: file.path,
              activate: (ev) => opts.activate(ev, file),
            });
          }
          callback(links.length > 0 ? links : undefined);
        },
        () => {
          if (seq === asked) callback(undefined);
        },
      );
    },
  };
}
