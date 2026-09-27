/**
 * `sodactl pane attach` で手元の端末へ書く前に、pane の出力から端末への問い合わせを取り除く（20260926-pane-direct-connect の decisions D8）。
 * 問い合わせに答えるのはサーバのミラーだけ（D17。ブラウザは `packages/web/src/term/QueryFilter.ts` で握りつぶす）——手元の端末にも
 * 答えさせると、答えが stdin → INPUT で pane に届いてミラーの答えと二重になり、遅れた方が入力行のごみになる。
 * 取り除くのは `QueryFilter.ts` と同じ種類（DA・DSR/CPR・DECRQM・XTVERSION・DECRQSS・色の問い合わせ）に、手元の端末なら答えうる
 * もの（kitty keyboard のフラグ・XTGETTCAP・窓の報告・DECID・クリップボードの読み出し）を足したもの。
 * エスケープ列が出力の区切りをまたいでも同じに扱う（途中までの列は次の出力まで持ち越す）。
 */

/** 持ち越しの上限。閉じない OSC/DCS をいつまでも溜めない（超えたらそのまま書く）。 */
const MAX_PENDING = 64 * 1024;

const ESC = "\x1b";
const BEL = "\x07";
const ST = "\x1b\\";
/** `ESC ( B` のように 1 文字の中間を挟む 3 文字の列の中間。 */
const ESC_INTERMEDIATES = "()*+-./#%";
/** `CSI Ps t` のうち、端末が報告を返すもの（窓の状態・位置・大きさ・タイトル）。 */
const WINDOW_REPORTS = new Set(["11", "13", "14", "15", "16", "18", "19", "20", "21"]);
/** 値を `?` で問い合わせる色の OSC（前景・背景・カーソル・選択の前景・選択の背景）。 */
const COLOR_QUERY_OSC = new Set(["10", "11", "12", "17", "19"]);

export class TerminalQueryFilter {
  private pending = "";

  /** 持ち越しを捨てる（SNAPSHOT で画面を描き直すとき。前の出力の書きかけの列に SNAPSHOT を取り込ませない）。 */
  reset(): void {
    this.pending = "";
  }

  filter(chunk: string): string {
    const s = this.pending + chunk;
    this.pending = "";
    let out = "";
    let i = 0;
    while (i < s.length) {
      const esc = s.indexOf(ESC, i);
      if (esc === -1) {
        out += plain(s.slice(i));
        break;
      }
      out += plain(s.slice(i, esc));
      const end = sequenceEnd(s, esc);
      if (end === -1) {
        const rest = s.slice(esc);
        if (rest.length > MAX_PENDING) out += rest;
        else this.pending = rest;
        break;
      }
      const seq = s.slice(esc, end);
      if (!isQuery(seq)) out += seq;
      i = end;
    }
    return out;
  }
}

/** `s[start]` の ESC から始まる列の終わり（次の位置）。列が途中で切れていれば -1。 */
function sequenceEnd(s: string, start: number): number {
  const kind = s[start + 1];
  if (kind === undefined) return -1;
  if (kind === "[") {
    for (let j = start + 2; j < s.length; j++) {
      const c = s.charCodeAt(j);
      if (c >= 0x40 && c <= 0x7e) return j + 1;
      if (c < 0x20 || c > 0x7e) return j; // 壊れた列：ここで切る（問い合わせではないのでそのまま書く）
    }
    return -1;
  }
  if (kind === "]" || kind === "P" || kind === "_" || kind === "^" || kind === "X") {
    for (let j = start + 2; j < s.length; j++) {
      if (kind === "]" && s[j] === BEL) return j + 1;
      if (s[j] === ESC) {
        if (j + 1 >= s.length) return -1;
        if (s[j + 1] === "\\") return j + 2;
        return j; // `\` 以外が続く ESC は文字列を打ち切り、新しい列を始める（xterm と同じ）
      }
    }
    return -1;
  }
  if (ESC_INTERMEDIATES.includes(kind)) return start + 3 <= s.length ? start + 3 : -1;
  return start + 2;
}

/** 地の文字から ENQ（0x05。端末が answerback を返す）を取り除く。 */
function plain(text: string): string {
  return text.includes("\x05") ? text.replaceAll("\x05", "") : text;
}

function isQuery(seq: string): boolean {
  const kind = seq[1];
  if (kind === "Z") return true; // DECID
  if (kind === "[") return isCsiQuery(seq.slice(2, -1), seq[seq.length - 1]!);
  if (kind === "P") {
    const body = stripStringTerminator(seq.slice(2));
    return body.startsWith("$q") || body.startsWith("+q"); // DECRQSS・XTGETTCAP
  }
  if (kind === "]") return isOscQuery(stripStringTerminator(seq.slice(2)));
  return false;
}

function isCsiQuery(body: string, final: string): boolean {
  const prefix = "<=>?".includes(body[0] ?? "") ? body[0] : "";
  const intermediates = body.replace(/^[\x30-\x3f]*/, "");
  const params = body.slice(prefix ? 1 : 0, body.length - intermediates.length);
  const first = params.split(";")[0] ?? "";
  if (intermediates === "$") {
    if (final === "p") return true; // DECRQM
    if (final === "w") return true; // DECRQPSR
    return false;
  }
  if (intermediates !== "") return false;
  if (final === "c") return prefix !== "?"; // DA1・DA2・DA3
  // DSR・CPR・DECXCPR・明暗の問い合わせ（?996n）。`CSI > Pp n`（XTMODKEYS の無効化）は問い合わせではない。
  if (final === "n") return prefix === "" || prefix === "?";
  if (final === "q") return prefix === ">"; // XTVERSION
  if (final === "u") return prefix === "?"; // kitty keyboard のフラグの問い合わせ
  if (final === "m") return prefix === "?"; // XTQMODKEYS
  if (final === "S") return prefix === "?" && ["1", "4"].includes(params.split(";")[1] ?? ""); // XTSMGRAPHICS の読み出し
  if (final === "t") return prefix === "" && WINDOW_REPORTS.has(first);
  return false;
}

function isOscQuery(body: string): boolean {
  const semi = body.indexOf(";");
  if (semi === -1) return false;
  const num = body.slice(0, semi);
  const rest = body.slice(semi + 1);
  if (COLOR_QUERY_OSC.has(num)) return rest.split(";").includes("?");
  if (num === "4") {
    const parts = rest.split(";");
    for (let k = 1; k < parts.length; k += 2) if (parts[k] === "?") return true;
    return false;
  }
  if (num === "52") return rest.split(";")[1] === "?"; // クリップボードの読み出し
  return false;
}

function stripStringTerminator(body: string): string {
  if (body.endsWith(ST)) return body.slice(0, -2);
  if (body.endsWith(BEL)) return body.slice(0, -1);
  return body;
}
