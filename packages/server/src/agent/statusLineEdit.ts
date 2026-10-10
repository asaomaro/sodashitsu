/**
 * Claude Code の `settings.json` の、トップレベルの `statusLine` の 1 項目だけを、**文字列のまま**（書式・インデント・並び・末尾の改行を保って）
 * 書き換える小さな部品（20261010-agent-usage の PR2）。JSON を読み込んで書き直す（`JSON.stringify`）と、利用者の書式が変わり、導入 → 外す で
 * 1 バイトも違わず戻せない。ここは、値の範囲（開始・終了の位置）を数えて、その範囲だけを差し替える・足す・消す。
 */

export interface TopMember {
  key: string;
  /** キーの文字列の開始（開き引用符）。 */
  keyStart: number;
  /** キーの文字列の終了（閉じ引用符の後）。 */
  keyEnd: number;
  valueStart: number;
  valueEnd: number;
}

export interface TopObject {
  /** `{` の位置。 */
  open: number;
  /** `}` の位置。 */
  close: number;
  members: TopMember[];
}

const WS = /[ \t\r\n]/;

/** トップレベルのオブジェクトの項目の位置を数える。オブジェクトでない・形が壊れているときは null。先頭の BOM は読み飛ばす。 */
export function scanTopObject(text: string): TopObject | null {
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const ws = (): void => {
    while (i < text.length && WS.test(text[i]!)) i++;
  };
  const str = (): string | null => {
    if (text[i] !== '"') return null;
    const start = i;
    i++;
    while (i < text.length) {
      const c = text[i]!;
      if (c === "\\") i += 2;
      else if (c === '"') {
        i++;
        try {
          return JSON.parse(text.slice(start, i)) as string;
        } catch {
          return null;
        }
      } else i++;
    }
    return null;
  };
  /** 値 1 つを読み飛ばす。成功したら true（`i` は値の直後）。 */
  const value = (): boolean => {
    ws();
    const c = text[i];
    if (c === '"') return str() !== null;
    if (c === "{" || c === "[") {
      const stack: string[] = [c === "{" ? "}" : "]"];
      i++;
      while (i < text.length && stack.length > 0) {
        const d = text[i]!;
        if (d === '"') {
          if (str() === null) return false;
          continue;
        }
        if (d === "{") stack.push("}");
        else if (d === "[") stack.push("]");
        else if (d === "}" || d === "]") {
          if (stack.pop() !== d) return false;
        }
        i++;
      }
      return stack.length === 0;
    }
    const m = /^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(text.slice(i, i + 64));
    if (!m) return false;
    i += m[0].length;
    return true;
  };
  ws();
  if (text[i] !== "{") return null;
  const open = i;
  i++;
  const members: TopMember[] = [];
  ws();
  if (text[i] === "}") return { open, close: i, members };
  for (;;) {
    ws();
    const keyStart = i;
    const key = str();
    if (key === null) return null;
    const keyEnd = i;
    ws();
    if (text[i] !== ":") return null;
    i++;
    ws();
    const valueStart = i;
    if (!value()) return null;
    members.push({ key, keyStart, keyEnd, valueStart, valueEnd: i });
    ws();
    if (text[i] === ",") {
      i++;
      continue;
    }
    if (text[i] === "}") {
      const rest = text.slice(i + 1);
      if (rest.trim() !== "") return null;
      return { open, close: i, members };
    }
    return null;
  }
}

/** 最後の同名のキー（JSON の重複キーは、後のものが効く）。 */
export function findMember(obj: TopObject, key: string): TopMember | undefined {
  for (let k = obj.members.length - 1; k >= 0; k--) if (obj.members[k]!.key === key) return obj.members[k];
  return undefined;
}

/** 行頭の空白（その行のインデント）。 */
function lineIndent(text: string, pos: number): string {
  const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
  const m = /^[ \t]*/.exec(text.slice(lineStart, pos));
  return m ? m[0] : "";
}

/** ファイルのインデントの 1 段（最初のインデントのある行から）。無ければ 2 スペース。複数行でなければ null（コンパクト）。 */
export function indentUnitOf(text: string): string | null {
  if (!text.includes("\n")) return null;
  const m = /\n([ \t]+)\S/.exec(text);
  return m ? m[1]! : "  ";
}

/** ファイルの行の終わり（最初の改行が CRLF なら CRLF。それ以外は LF）。足す行の改行を、これに合わせる。 */
export function eolOf(text: string): "\r\n" | "\n" {
  const i = text.indexOf("\n");
  return i > 0 && text[i - 1] === "\r" ? "\r\n" : "\n";
}

/** 値（オブジェクト）を、その項目の位置のインデントで文字列にする。コンパクトなファイルは 1 行。改行はファイルの行の終わりに合わせる。 */
export function renderValue(value: unknown, text: string, memberKeyStart: number | null): string {
  const unit = indentUnitOf(text);
  if (unit === null) return JSON.stringify(value);
  const base = memberKeyStart === null ? unit : lineIndent(text, memberKeyStart);
  return JSON.stringify(value, null, unit)
    .split("\n")
    .map((l, i) => (i === 0 ? l : base + l))
    .join(eolOf(text));
}

/** 値の範囲を差し替える。 */
export function replaceValue(text: string, m: TopMember, valueText: string): string {
  return text.slice(0, m.valueStart) + valueText + text.slice(m.valueEnd);
}

/**
 * 項目を、最後に足す。項目が 1 つ以上あれば、最後の項目の書き方（区切りの空白・`:` の周りの空白）に合わせて、最後の値の直後に `,<空白>"key": <値>` を足す
 * （取り除くときは、直前の値の終わりから、この値の終わりまでの範囲を消せば、足す前の文字列に戻る）。項目が無いときは、複数行なら 1 項目ずつの形、
 * 1 行ならコンパクトに足す（戻すのは、呼び出し側が持つ元の文字列）。
 */
export function appendMember(text: string, obj: TopObject, key: string, value: unknown): string {
  const keyText = JSON.stringify(key);
  const last = obj.members[obj.members.length - 1];
  if (last) {
    const prevEnd = obj.members.length > 1 ? obj.members[obj.members.length - 2]!.valueEnd : obj.open + 1;
    const lead = text.slice(prevEnd, last.keyStart).replace(",", "");
    const colon = text.slice(last.keyEnd, last.valueStart);
    // 値の中の改行のインデントは、最後の項目のキーの行に合わせる。
    const inserted = `,${lead}${keyText}${colon}${renderValue(value, text, last.keyStart)}`;
    return text.slice(0, last.valueEnd) + inserted + text.slice(last.valueEnd);
  }
  const unit = indentUnitOf(text);
  const inner = text.slice(obj.open + 1, obj.close);
  const body = unit === null || !inner.includes("\n") && !text.includes("\n") ? `${keyText}: ${renderValue(value, text, null)}` : null;
  if (body !== null && unit === null) return text.slice(0, obj.open + 1) + body + text.slice(obj.close);
  const u = unit ?? "  ";
  const eol = eolOf(text);
  const rendered = JSON.stringify(value, null, u).split("\n").map((l, i) => (i === 0 ? l : u + l)).join(eol);
  return `${text.slice(0, obj.open + 1)}${eol}${u}${keyText}: ${rendered}${eol}${text.slice(obj.close)}`;
}

/** 項目を、取り除く。 */
export function removeMember(text: string, obj: TopObject, m: TopMember): string {
  const idx = obj.members.indexOf(m);
  if (idx > 0) return text.slice(0, obj.members[idx - 1]!.valueEnd) + text.slice(m.valueEnd);
  if (obj.members.length > 1) return text.slice(0, m.keyStart) + text.slice(obj.members[1]!.keyStart);
  // 唯一の項目: 中身を空にする（`{}`）。
  return text.slice(0, obj.open + 1) + text.slice(obj.close);
}
