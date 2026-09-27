import xtermUnicode11 from "@xterm/addon-unicode11";

const { Unicode11Addon } = xtermUnicode11;

/**
 * 自前の文字列（サイドバー・tab バー・枠の名前）の桁数。**pane の中と同じ unicode11 の規則**で測る（pane の中は headless が幅を出す。
 * 規則がずれると枠と中身の桁が食い違う。research-rendering §1.5 の「どちらの規則で測るか」）。
 * addon の `activate(terminal)` は `terminal.unicode.register(provider)` を呼ぶだけ（addon-unicode11 0.9.0 の実装）なので、
 * その provider を受け取って `wcwidth` をそのまま使う。
 */
interface WidthProvider {
  wcwidth(codepoint: number): 0 | 1 | 2;
}

let provider: WidthProvider | null = null;
try {
  const fake = {
    unicode: {
      register(p: WidthProvider) {
        provider = p;
      },
    },
  };
  new Unicode11Addon().activate(fake as never);
} catch {
  provider = null;
}

/** 1 文字（コードポイント）の桁数（0・1・2）。 */
export function charWidth(cp: number): 0 | 1 | 2 {
  if (provider) return provider.wcwidth(cp);
  // 予備（addon の形が変わったとき）：制御文字 0、東アジアの全角の主な範囲 2、それ以外 1。
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0;
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0x1f300 && cp <= 0x1faff)
  )
    return 2;
  return 1;
}

export function stringWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += charWidth(ch.codePointAt(0)!);
  return w;
}

/** 桁数 `max` に収まるよう切る。切ったら末尾を `…` にする（`…` の分も含めて `max` 以内）。 */
export function truncate(s: string, max: number): string {
  if (max <= 0) return "";
  if (stringWidth(s) <= max) return s;
  let out = "";
  let w = 0;
  for (const ch of s) {
    const cw = charWidth(ch.codePointAt(0)!);
    if (w + cw > max - 1) break;
    out += ch;
    w += cw;
  }
  return `${out}…`;
}
