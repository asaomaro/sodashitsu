/*
 * 外側の端末のタイトルの書式（`{hostname}`・`{workspace}`・`{tab}`・`{pane}`・`{terminal_title}`・`{{`・`}}`）の読み取りと文字の洗いは
 * herdr（https://github.com/herdrdev/herdr、commit da6bcd5969779bfe0396bcf89a8025d4375d611e）の `src/config/window_title.rs`
 * （`WindowTitleTemplate::parse`・`sanitize_window_title_text`・`MAX_WINDOW_TITLE_CHARS`）を TypeScript へ移したもの（Apache-2.0。ルートの `NOTICE`）。
 */

export type WindowTitleToken = "hostname" | "workspace" | "tab" | "pane" | "terminal_title";
const TOKENS: readonly WindowTitleToken[] = [
  "hostname",
  "workspace",
  "tab",
  "pane",
  "terminal_title",
];

export type WindowTitlePart = { literal: string } | { token: WindowTitleToken };

/** 描いたタイトルの最大の文字数。 */
export const MAX_WINDOW_TITLE_CHARS = 200;

/**
 * 書式を読む。空なら null（外側の端末のタイトルに触らない）。読めなければ理由の文字列を投げる（`{` が閉じていない・知らない語・対の無い `}`）。
 */
export function parseWindowTitle(template: string): WindowTitlePart[] | null {
  if (template === "") return null;
  const parts: WindowTitlePart[] = [];
  let literal = "";
  const chars = [...template];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    if (ch === "{" && chars[i + 1] === "{") {
      literal += "{";
      i++;
    } else if (ch === "}" && chars[i + 1] === "}") {
      literal += "}";
      i++;
    } else if (ch === "{") {
      const close = chars.indexOf("}", i + 1);
      if (close < 0) throw new Error("has an unclosed '{'");
      const name = chars
        .slice(i + 1, close)
        .join("")
        .trim();
      if (!(TOKENS as readonly string[]).includes(name))
        throw new Error(`has unknown token '{${name}}'`);
      if (literal !== "") parts.push({ literal });
      literal = "";
      parts.push({ token: name as WindowTitleToken });
      i = close;
    } else if (ch === "}") throw new Error("has an unmatched '}'");
    else literal += ch;
  }
  if (literal !== "") parts.push({ literal });
  return parts.length > 0 ? parts : null;
}

/** タイトルの文字（制御文字を除き、200 文字まで・前後の空白を落とす）。空なら null。 */
export function sanitizeWindowTitle(value: string): string | null {
  let out = "";
  let n = 0;
  for (const ch of value) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) continue;
    out += ch;
    if (++n >= MAX_WINDOW_TITLE_CHARS) break;
  }
  out = out.trim();
  return out === "" ? null : out;
}

/** 書式に値を入れる。 */
export function renderWindowTitle(
  parts: readonly WindowTitlePart[],
  values: Partial<Record<WindowTitleToken, string>>,
): string | null {
  return sanitizeWindowTitle(
    parts.map((p) => ("literal" in p ? p.literal : (values[p.token] ?? ""))).join(""),
  );
}

/** 外側の端末のタイトルを置く列（OSC 2）。 */
export function titleSequence(title: string): string {
  return `\x1b]2;${title}\x07`;
}

/** Claude Code が作業中にタイトルの先頭へ付ける記号（herdr の `CLAUDE_ACTIVITY_GLYPHS`）。 */
const ACTIVITY_GLYPHS = "·✢✳✶✻✽◐◓◑◒";

/** 端末のタイトルから先頭の回る記号（点字の 1 文字・作業中の記号）を除く（herdr の `stripped_terminal_title`）。空なら null。 */
export function strippedTerminalTitle(title: string): string | null {
  const t = title.trim();
  const first = [...t][0];
  if (first === undefined) return null;
  const cp = first.codePointAt(0)!;
  const rest = t.slice(first.length);
  const recognized = (cp >= 0x2800 && cp <= 0x28ff) || ACTIVITY_GLYPHS.includes(first);
  const out = recognized && (rest === "" || /^\s/u.test(rest)) ? rest.trim() : t;
  return out === "" ? null : out;
}

/** 書式の値がすべて空になったときのタイトル（herdr は "herdr"）。 */
export const FALLBACK_WINDOW_TITLE = "soda";

/** 外側の端末のタイトルを退避する列（XTWINOPS 22;0。対応しない端末は無視する）。 */
export const PUSH_TITLE = "\x1b[22;0t";
/** 退避したタイトルへ戻す列（XTWINOPS 23;0）。 */
export const POP_TITLE = "\x1b[23;0t";
