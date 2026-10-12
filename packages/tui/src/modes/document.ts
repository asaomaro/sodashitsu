import { marked, type Token, type Tokens } from "marked";
import { ATTR } from "../render/color.js";
import { charWidth, stringWidth } from "../render/width.js";
import { mermaidText } from "./mermaidText.js";

export interface TextSpan {
  text: string;
  attrs: number;
  fg?: number;
}
export type DocumentRow = TextSpan[];
/** ANSI/OSCや双方向制御を含む本文は、端末操作として扱わない。 */
export const safeText = (s: string) =>
  // eslint-disable-next-line no-control-regex -- 作者の端末制御文字を意図的に除去する。
  s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, "");
const span = (text: string, attrs = 0): TextSpan => ({ text: safeText(text), attrs });
function inline(tokens: Token[] | undefined, text: string, attrs = 0): TextSpan[] {
  if (!tokens) return [span(text, attrs)];
  return tokens.flatMap((t) => {
    if (t.type === "strong") return inline(t.tokens, t.text, attrs | ATTR.bold);
    if (t.type === "em") return inline(t.tokens, t.text, attrs | ATTR.italic);
    if (t.type === "codespan") return [span(t.text, attrs | ATTR.inverse)];
    if (t.type === "link")
      return [...inline(t.tokens, t.text, attrs), span(" (" + t.href + ")", attrs)];
    if (t.type === "image") return [span("[画像: " + t.text + "]", attrs)];
    if (t.type === "br") return [span("\n", attrs)];
    if (t.type === "html") return [span(t.raw.replace(/<[^>]*>/g, ""), attrs)];
    return [span("text" in t && typeof t.text === "string" ? t.text : t.raw, attrs)];
  });
}
export function wrapSpans(spans: TextSpan[], width: number): DocumentRow[] {
  if (width <= 0) return [];
  const rows: DocumentRow[] = [[]];
  let col = 0;
  for (const s of spans)
    for (const ch of safeText(s.text)) {
      const w = charWidth(ch.codePointAt(0)!);
      if (ch === "\n" || col + w > width) {
        rows.push([]);
        col = 0;
      }
      if (ch === "\n") continue;
      if (w > width) continue;
      const row = rows[rows.length - 1]!;
      const last = row[row.length - 1];
      if (last?.attrs === s.attrs && last.fg === s.fg) last.text += ch;
      else row.push({ ...span(ch, s.attrs), ...(s.fg !== undefined ? { fg: s.fg } : {}) });
      col += w;
    }
  return rows;
}
/** 複雑なHTMLや外部URLの取得を行わない、セル描画用のMarkdown。 */
export function markdownRows(source: string, width: number): DocumentRow[] {
  const rows: DocumentRow[] = [];
  const visit = (tokens: Token[], depth = 0, available = width) => {
    const add = (spans: TextSpan[]) => rows.push(...wrapSpans(spans, available));
    if (depth > 12) return;
    for (const t of tokens) {
      switch (t.type) {
        case "space":
          rows.push([]);
          break;
        case "heading":
          add(inline(t.tokens, t.text, ATTR.bold));
          add([span("─".repeat(Math.min(width, stringWidth(t.text))))]);
          break;
        case "paragraph":
        case "text":
          add(inline(t.tokens, t.text));
          break;
        case "code":
          if (t.lang?.toLowerCase() === "mermaid")
            for (const line of mermaidText(safeText(t.text))) add([span(line)]);
          else {
            add([span("┌─ " + (t.lang ?? "code"), ATTR.bold)]);
            for (const line of t.text.split("\n")) add([span("│ " + line)]);
            add([span("└" + "─".repeat(Math.max(0, width - 1)))]);
          }
          break;
        case "blockquote": {
          const start = rows.length;
          visit(t.tokens ?? [], depth + 1, available > 3 ? available - 2 : available);
          if (available > 3)
            for (let i = start; i < rows.length; i++) rows[i] = [span("│ "), ...rows[i]!];
          break;
        }
        case "list":
          (t as Tokens.List).items.forEach((item, i) => {
            const marker = t.ordered
              ? String(Number(t.start || 1) + i) + ". "
              : item.task
                ? item.checked
                  ? "[x] "
                  : "[ ] "
                : "• ";
            add([
              span(marker),
              ...inline(
                marked.lexer(item.text)[0]?.type === "paragraph"
                  ? (marked.lexer(item.text)[0] as { tokens?: Token[] }).tokens
                  : undefined,
                item.text,
              ),
            ]);
          });
          break;
        case "table": {
          const table = t as Tokens.Table;
          const cells = [table.header, ...table.rows].map((row) =>
            row.map((cell) =>
              inline(cell.tokens, cell.text)
                .map((s) => s.text)
                .join(""),
            ),
          );
          const widths = table.header.map((_, i) =>
            Math.min(40, Math.max(...cells.map((row) => stringWidth(row[i] ?? "")))),
          );
          const border = "+" + widths.map((w) => "-".repeat(w + 2)).join("+") + "+";
          add([span(border)]);
          cells.forEach((row, i) => {
            add([
              span(
                "| " +
                  row
                    .map((v, j) => v + " ".repeat(Math.max(0, widths[j]! - stringWidth(v))))
                    .join(" | ") +
                  " |",
                i === 0 ? ATTR.bold : 0,
              ),
            ]);
            if (i === 0) add([span(border)]);
          });
          add([span(border)]);
          break;
        }
        case "hr":
          add([span("─".repeat(width))]);
          break;
        case "html":
          add([span(t.text.replace(/<[^>]*>/g, ""))]);
          break;
        default:
          add([span(t.raw)]);
      }
    }
  };
  const clipped = source.length > 128_000;
  visit(marked.lexer(safeText(source.slice(0, 128_000))));
  if (clipped) rows.push([{ text: "文書の表示上限に達しました。", attrs: 0 }]);
  return rows;
}

/** 同じ文書の再描画で字句解析を繰り返さない。幅が変わったときだけ再整形する。 */
export class MarkdownView {
  private source = "";
  private width = -1;
  private rows: DocumentRow[] = [];
  render(source: string, width: number) {
    if (this.source !== source || this.width !== width) {
      this.source = source;
      this.width = width;
      this.rows = markdownRows(source, width);
    }
    return this.rows;
  }
}
