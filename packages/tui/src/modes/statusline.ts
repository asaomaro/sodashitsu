import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import { paletteColor } from "../render/color.js";
import { wrapSpans, type TextSpan } from "./document.js";
type Node = DefaultTreeAdapterMap["node"];
const colors: Record<string, number> = {
  name: 6,
  active: 6,
  model: 5,
  good: 2,
  warning: 3,
  danger: 1,
  muted: 8,
};
/** Only the server-owned statusline marker enables this static colored document. */
export function statuslineRows(html: string, width: number) {
  const spans: TextSpan[] = [];
  const find = (node: Node): Node | undefined => {
    if ("attrs" in node && node.attrs.some((a) => a.name === "data-soda-statusline")) return node;
    if ("childNodes" in node)
      for (const c of node.childNodes) {
        const found = find(c);
        if (found) return found;
      }
    return undefined;
  };
  const root = find(parseFragment(html));
  if (!root) return null;
  const visit = (node: Node, tone: string) => {
    if ("attrs" in node) tone = node.attrs.find((a) => a.name === "data-soda-color")?.value ?? tone;
    const color = colors[tone];
    if (node.nodeName === "#text" && "value" in node)
      spans.push({
        text: node.value,
        attrs: 0,
        ...(color !== undefined ? { fg: paletteColor(color) } : {}),
      });
    if ("childNodes" in node) for (const c of node.childNodes) visit(c, tone);
  };
  visit(root, "");
  return wrapSpans(spans, width);
}
