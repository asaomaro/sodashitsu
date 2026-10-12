import { stringWidth } from "../render/width.js";

const box = (s: string) => {
  const n = stringWidth(s) + 2;
  return ["┌" + "─".repeat(n) + "┐", "│ " + s + " │", "└" + "─".repeat(n) + "┘"];
};
const clean = (s: string) => s.replace(/^["']|["']$/g, "").replace(/<br\s*\/?\s*>/gi, " ");
/** 基本構文だけを描く。解析し切れない図は誤った関係を描かず原文を残す。 */
export function mermaidText(source: string): string[] {
  const fallback = () => ["Mermaid: この構文は文字図に未対応です。", ...source.split("\n")];
  if (source.length > 50_000)
    return ["Mermaid: 図が大きすぎるため原文を表示します。", ...source.split("\n")];
  const lines = source
    .split(/\n|;/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("%%"));
  const head = lines.shift() ?? "";
  if (/^(flowchart|graph)\s+(LR|RL|TD|TB|BT)$/.test(head)) {
    const names = new Map<string, string>();
    const edges: { from: string; to: string; label: string }[] = [];
    const node = /^([A-Za-z_][\w-]*)(?:\[([^\]]*)\]|\(([^)]*)\)|\{([^}]*)\})?/;
    const parseNode = (s: string) => {
      const m = node.exec(s.trim());
      if (!m) return null;
      const label = m[2] ?? m[3] ?? m[4];
      if (label !== undefined) names.set(m[1]!, clean(label));
      else if (!names.has(m[1]!)) names.set(m[1]!, m[1]!);
      return { id: m[1]!, rest: s.trim().slice(m[0].length).trim() };
    };
    for (const line of lines) {
      let a = parseNode(line);
      if (!a) return fallback();
      while (a.rest) {
        const arrow = /^(-->|-.->|==>)(?:\|([^|]*)\|)?\s*/.exec(a.rest);
        if (!arrow) return fallback();
        const b = parseNode(a.rest.slice(arrow[0].length));
        if (!b) return fallback();
        edges.push({ from: a.id, to: b.id, label: arrow[2] ?? "" });
        a = b;
        if (edges.length > 100 || names.size > 32) return fallback();
      }
    }
    const out: string[] = ["Mermaid · 接続ごとの図（" + head.split(/\s+/)[1] + "）"];
    // 分岐や循環も辺を省かず表す。複雑な交差をセル図で偽らない。
    for (const edge of edges) {
      const a = box(names.get(edge.from)!);
      const b = box(names.get(edge.to)!);
      const reverse = /\s(RL|BT)$/.test(head);
      if (/\s(LR|RL)$/.test(head)) {
        const left = reverse ? b : a,
          right = reverse ? a : b;
        const connector = reverse ? " ← " : " → ";
        const gap = connector + (edge.label ? "(" + edge.label + ") " : "");
        out.push(
          left[0]! + " ".repeat(stringWidth(gap)) + right[0]!,
          left[1]! + gap + right[1]!,
          left[2]! + " ".repeat(stringWidth(gap)) + right[2]!,
          "",
        );
      } else
        out.push(
          ...(reverse ? b : a),
          (reverse ? " ↑ " : " ↓ ") + edge.label,
          ...(reverse ? a : b),
          "",
        );
    }
    const connected = new Set(edges.flatMap((e) => [e.from, e.to]));
    for (const [id, label] of names) if (!connected.has(id)) out.push(...box(label), "");
    return out;
  }
  if (head === "sequenceDiagram") {
    const names = new Map<string, string>();
    const messages: { from: string; to: string; label: string; dashed: boolean }[] = [];
    for (const line of lines) {
      const p = /^(?:participant|actor)\s+([\w-]+)(?:\s+as\s+(.+))?$/.exec(line);
      if (p) {
        names.set(p[1]!, p[2] ?? p[1]!);
        continue;
      }
      const m = /^([\w-]+)(--?>>|--?>)([\w-]+)\s*:\s*(.*)$/.exec(line);
      if (!m) return fallback();
      if (!names.has(m[1]!)) names.set(m[1]!, m[1]!);
      if (!names.has(m[3]!)) names.set(m[3]!, m[3]!);
      messages.push({ from: m[1]!, to: m[3]!, label: m[4]!, dashed: m[2]!.startsWith("--") });
      if (names.size > 16 || messages.length > 100) return fallback();
    }
    const ids = [...names.keys()];
    const step = Math.max(12, ...[...names.values()].map((s) => stringWidth(s) + 3));
    const width = Math.max(1, ids.length * step);
    const line = () => {
      const chars = Array<string>(width).fill(" ");
      ids.forEach((_, i) => (chars[i * step + 1] = "│"));
      return chars;
    };
    const out = [
      ids.map((id) => names.get(id)! + " ".repeat(step - stringWidth(names.get(id)!))).join(""),
    ];
    for (const m of messages) {
      const a = ids.indexOf(m.from) * step + 1,
        b = ids.indexOf(m.to) * step + 1;
      out.push(" ".repeat(Math.min(a, b)) + m.label);
      const chars = line();
      if (a === b) {
        chars[a] = "↻";
      } else {
        for (let i = Math.min(a, b) + 1; i < Math.max(a, b); i++) chars[i] = m.dashed ? "┄" : "─";
        chars[b] = a < b ? "▶" : "◀";
      }
      out.push(chars.join(""), line().join(""));
    }
    return out;
  }
  return fallback();
}
