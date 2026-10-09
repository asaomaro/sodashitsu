import { describe, expect, it } from "vitest";
import { FIND_MAX, findCandidates, type FindItem } from "./findCandidates.js";

const item = (label: string, haystack: string[] = [], kind: FindItem["kind"] = "pane"): FindItem => ({
  kind,
  target: label,
  label,
  sub: "空間 · ws",
  haystack: [label, ...haystack],
});

describe("findCandidates", () => {
  const items = [
    item("impl", ["Claude Code", "claude", "alpha", "第二"]),
    item("reviewer", ["Codex", "codex", "alpha"]),
    item("alpha", [], "workspace"),
    item("Implement", ["beta"]),
  ];

  it("空の検索語・空白だけなら候補は無い", () => {
    expect(findCandidates(items, "")).toEqual([]);
    expect(findCandidates(items, "   ")).toEqual([]);
  });

  it("pane の呼び名・エージェントの名前と種類・workspace の名前・tab の名前に、大文字と小文字を区別せず部分一致する", () => {
    expect(findCandidates(items, "REVIEW").map((i) => i.label)).toEqual(["reviewer"]);
    expect(findCandidates(items, "codex").map((i) => i.label)).toEqual(["reviewer"]); // エージェントの種類
    expect(findCandidates(items, "claude code").map((i) => i.label)).toEqual(["impl"]); // エージェントの名前
    expect(findCandidates(items, "第二").map((i) => i.label)).toEqual(["impl"]); // tab の名前
    expect(findCandidates(items, "beta").map((i) => i.label)).toEqual(["Implement"]); // workspace の名前
  });

  it("名前の先頭に一致するものを先に、次に名前に含むもの、最後にほかの文字列。同じ重さは元の並び", () => {
    expect(findCandidates(items, "alpha").map((i) => i.label)).toEqual(["alpha", "impl", "reviewer"]);
    expect(findCandidates(items, "impl").map((i) => i.label)).toEqual(["impl", "Implement"]);
  });

  it("20 件まで", () => {
    const many = Array.from({ length: 50 }, (_, i) => item(`pane-${i}`));
    expect(findCandidates(many, "pane")).toHaveLength(FIND_MAX);
    expect(findCandidates(many, "pane", 5)).toHaveLength(5);
  });
});
