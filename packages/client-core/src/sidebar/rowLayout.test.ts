import { describe, expect, it } from "vitest";
import {
  BUILTIN_TOKENS,
  DEFAULT_LAYOUTS,
  effectiveLayout,
  isTextValued,
  isTokenAllowed,
  isValidColor,
  isValidCustomToken,
  loadRule,
  loadSidebarRows,
  matchingStyle,
  MAX_ROWS,
  MAX_RULES,
  MAX_TOKENS_PER_ROW,
  parseFiniteNumber,
  serializeSidebarRows,
  type TokenRule,
} from "./rowLayout.js";

/** 20260927-sidebar-row-tokens の AC9・AC11・AC13・AC14。条件の場面は herdr の `rules.rs` のテストに合わせる。 */

describe("色と名前の検査（AC9・AC11・AC13）", () => {
  it("色は #RGB・#RRGGBB だけ", () => {
    for (const ok of ["#fff", "#FFF", "#51a2da", "#000000"])
      expect(isValidColor(ok), ok).toBe(true);
    for (const bad of [
      "fff",
      "#ffff",
      "#12345",
      "#1234567",
      "#ggg",
      "red",
      "#fff;background:url(x)",
      " #fff",
      "#fff ",
      3,
      null,
    ]) {
      expect(isValidColor(bad), String(bad)).toBe(false);
    }
  });

  it("独自トークンは $ と [A-Za-z0-9_-] の 1〜32 文字", () => {
    expect(isValidCustomToken("$a")).toBe(true);
    expect(isValidCustomToken(`$${"a".repeat(32)}`)).toBe(true);
    expect(isValidCustomToken("$load_1-x")).toBe(true);
    for (const bad of ["$", "a", `$${"a".repeat(33)}`, "$a.b", "$a b", "$名前", "$$a"])
      expect(isValidCustomToken(bad), bad).toBe(false);
  });

  it("区画ごとに使えるトークンと、文字の値を持つか", () => {
    expect(isTokenAllowed("spaces", "git")).toBe(true);
    expect(isTokenAllowed("spaces", "tab")).toBe(false);
    expect(isTokenAllowed("agents", "tab")).toBe(true);
    expect(isTokenAllowed("agents", "git")).toBe(false);
    expect(isTokenAllowed("agents", "machine")).toBe(false); // backlog（decisions D6）
    expect(isTokenAllowed("agents", "$x")).toBe(true);
    expect(isTextValued("spaces", "state_icon")).toBe(false);
    expect(isTextValued("spaces", "git_status")).toBe(false);
    expect(isTextValued("spaces", "git")).toBe(false);
    expect(isTextValued("spaces", "branch")).toBe(true);
    expect(isTextValued("agents", "unverified")).toBe(true);
    expect(isTextValued("agents", "$x")).toBe(true);
  });

  it("既定の並びは今のサイドバーと同じ組み立て（decisions D3）", () => {
    expect(DEFAULT_LAYOUTS.spaces.map((r) => r.map((t) => t.token))).toEqual([
      ["state_icon", "workspace"],
      ["git"],
    ]);
    expect(DEFAULT_LAYOUTS.agents.map((r) => r.map((t) => t.token))).toEqual([
      ["state_icon", "workspace", "tab"],
      ["name", "agent", "unverified"],
    ]);
    for (const area of ["spaces", "agents"] as const)
      for (const row of DEFAULT_LAYOUTS[area])
        for (const t of row) expect(isTokenAllowed(area, t.token)).toBe(true);
    expect(BUILTIN_TOKENS.spaces.map((t) => t.id)).toEqual([
      "state_icon",
      "state_text",
      "workspace",
      "branch",
      "git_status",
      "git",
    ]);
    expect(BUILTIN_TOKENS.agents.map((t) => t.id)).toEqual([
      "state_icon",
      "state_text",
      "workspace",
      "tab",
      "pane",
      "agent",
      "name",
      "unverified",
      "terminal_title",
    ]);
  });
});

describe("parseFiniteNumber（AC14。herdr の f64 の読み方）", () => {
  it("10 進・小数・指数・符号を読む", () => {
    expect(parseFiniteNumber("90")).toBe(90);
    expect(parseFiniteNumber("-1.5")).toBe(-1.5);
    expect(parseFiniteNumber("+2")).toBe(2);
    expect(parseFiniteNumber(".5")).toBe(0.5);
    expect(parseFiniteNumber("5.")).toBe(5);
    expect(parseFiniteNumber("1e3")).toBe(1000);
    expect(parseFiniteNumber("2.5E-1")).toBe(0.25);
  });

  it("空白・単位・無限・NaN・16 進・空は読まない", () => {
    for (const bad of [
      "",
      " 1",
      "1 ",
      "90%",
      "inf",
      "Infinity",
      "NaN",
      "0x10",
      "1_000",
      ".",
      "1e",
      "e3",
      "--1",
      "1e400",
    ]) {
      expect(parseFiniteNumber(bad), bad).toBeNull();
    }
  });
});

describe("matchingStyle（AC14。herdr の matching_style）", () => {
  const base = { fg: "#fff", bold: true, dim: true };

  it("先頭から見て最初に当たった条件だけ。指定した項目だけ重ね、残りは base（herdr の conditional_styles_merge_first_match…）", () => {
    const rules: TokenRule[] = [
      { when: "equals", value: "Local", fg: "#f00", bold: false },
      { when: "contains", value: "Loc", fg: "#0f0", dim: false },
    ];
    expect(matchingStyle(rules, base, "Local")).toEqual({ fg: "#f00", bold: false, dim: true });
    expect(matchingStyle(rules, base, "Locale")).toEqual({ fg: "#0f0", bold: true, dim: false });
    expect(matchingStyle(rules, base, "remote")).toEqual(base);
  });

  it("当たった条件が見た目を持たなくても、そこで止まって base のまま", () => {
    expect(
      matchingStyle(
        [
          { when: "equals", value: "x" },
          { when: "equals", value: "x", fg: "#f00" },
        ],
        base,
        "x",
      ),
    ).toEqual(base);
  });

  it("hide なら null。hide: false は隠さない", () => {
    expect(matchingStyle([{ when: "equals", value: "Local", hide: true }], {}, "Local")).toBeNull();
    expect(
      matchingStyle([{ when: "equals", value: "Local", hide: false, fg: "#abc" }], {}, "Local"),
    ).toEqual({ fg: "#abc" });
  });

  it("文字の条件は大文字小文字を区別し、ignoreCase は ASCII だけ畳む（herdr の string_conditions_use_exact_case_or_ascii_folding）", () => {
    const cases: [TokenRule["when"], string, string, string][] = [
      ["equals", "Local", "Local", "Localhost"],
      ["contains", "Local", "myLocalbox", "remote"],
      ["starts_with", "Local", "Localhost", "myLocal"],
    ];
    for (const [when, expected, yes, no] of cases) {
      const rule = { when, value: expected } as TokenRule;
      expect(matchingStyle([{ ...rule, fg: "#111" }], {}, yes), `${when} ${yes}`).toEqual({
        fg: "#111",
      });
      expect(matchingStyle([{ ...rule, fg: "#111" }], {}, no), `${when} ${no}`).toEqual({});
      expect(matchingStyle([{ ...rule, fg: "#111" }], {}, yes.toLowerCase())).toEqual({});
      expect(
        matchingStyle(
          [{ ...rule, ignoreCase: true, fg: "#111" } as TokenRule],
          {},
          yes.toLowerCase(),
        ),
      ).toEqual({ fg: "#111" });
    }
    for (const when of ["equals", "contains", "starts_with"] as const) {
      const rule = { when, value: "ÉA", ignoreCase: true, fg: "#111" } as TokenRule;
      expect(matchingStyle([rule], {}, "Éa")).toEqual({ fg: "#111" });
      expect(matchingStyle([rule], {}, "éa")).toEqual({});
    }
  });

  it("空の equals は空の値だけ、空の contains・starts_with は何にでも当たる", () => {
    const hit = { fg: "#123" };
    expect(matchingStyle([{ when: "equals", value: "", ...hit }], {}, "")).toEqual(hit);
    expect(matchingStyle([{ when: "equals", value: "", ...hit }], {}, "a")).toEqual({});
    expect(matchingStyle([{ when: "contains", value: "", ...hit }], {}, "a")).toEqual(hit);
    expect(
      matchingStyle([{ when: "contains", value: "", ignoreCase: true, ...hit }], {}, "a"),
    ).toEqual(hit);
    expect(matchingStyle([{ when: "starts_with", value: "", ...hit }], {}, "a")).toEqual(hit);
  });

  it("gt・lt は値が有限の数として読めるときだけ、厳密に比べる（herdr の $load の例: 90→赤, 60→黄, 90%→白）", () => {
    const rules: TokenRule[] = [
      { when: "gt", value: 80, fg: "#f55", bold: true },
      { when: "gt", value: 50, fg: "#fc0" },
    ];
    const white = { fg: "#fff" };
    expect(matchingStyle(rules, white, "90")).toEqual({ fg: "#f55", bold: true });
    expect(matchingStyle(rules, white, "60")).toEqual({ fg: "#fc0" });
    expect(matchingStyle(rules, white, "90%")).toEqual(white);
    expect(matchingStyle(rules, white, "80")).toEqual({ fg: "#fc0" }); // 等しいときは当たらない
    expect(
      matchingStyle(
        [
          { when: "lt", value: 0 },
          { when: "lt", value: 10, fg: "#0f0" },
        ],
        {},
        "-0.5",
      ),
    ).toEqual({});
    expect(matchingStyle([{ when: "lt", value: 10, fg: "#0f0" }], {}, "1e1")).toEqual({});
    expect(matchingStyle([{ when: "lt", value: 10, fg: "#0f0" }], {}, "9.99")).toEqual({
      fg: "#0f0",
    });
  });

  it("条件が無ければ base", () => {
    expect(matchingStyle(undefined, base, "x")).toBe(base);
    expect(matchingStyle([], base, "x")).toEqual(base);
  });
});

describe("読み込み（AC11・AC13・AC14）", () => {
  it("保存が無い・形が違えば、区画ごとに既定（null）", () => {
    expect(loadSidebarRows(undefined)).toEqual({ spaces: null, agents: null });
    expect(loadSidebarRows("x")).toEqual({ spaces: null, agents: null });
    expect(loadSidebarRows({ spaces: "x", agents: [[{ token: "tab" }]] })).toEqual({
      spaces: null,
      agents: [[{ token: "tab" }]],
    });
  });

  it("行でないもの・区画で使えないトークン・形の違うトークンを捨てる。空の行・空の並びは残す", () => {
    const raw = {
      spaces: [
        [
          { token: "workspace" },
          { token: "tab" },
          "branch",
          { token: "$ok" },
          { token: "$bad.name" },
        ],
        "not-a-row",
        [],
        [{ token: 3 }],
      ],
    };
    expect(loadSidebarRows(raw).spaces).toEqual([
      [{ token: "workspace" }, { token: "$ok" }],
      [],
      [],
    ]);
    expect(loadSidebarRows({ agents: [] }).agents).toEqual([]);
  });

  it("見た目は読めるものだけ（読めない fg は fg だけ捨てる）", () => {
    const raw = {
      agents: [
        [
          { token: "agent", fg: "red", bold: true, dim: "yes" },
          { token: "tab", fg: "#abc", dim: false },
        ],
      ],
    };
    expect(loadSidebarRows(raw).agents).toEqual([
      [
        { token: "agent", bold: true },
        { token: "tab", fg: "#abc", dim: false },
      ],
    ]);
  });

  it("行・トークン・条件の数は上限で末尾を切り詰める", () => {
    const rows = Array.from({ length: MAX_ROWS + 3 }, () =>
      Array.from({ length: MAX_TOKENS_PER_ROW + 2 }, () => ({ token: "workspace" })),
    );
    const loaded = loadSidebarRows({ spaces: rows }).spaces!;
    expect(loaded).toHaveLength(MAX_ROWS);
    expect(loaded[0]).toHaveLength(MAX_TOKENS_PER_ROW);
    const rules = Array.from({ length: MAX_RULES + 5 }, (_, i) => ({
      when: "equals",
      value: `${i}`,
    }));
    expect(
      loadSidebarRows({ spaces: [[{ token: "workspace", rules }]] }).spaces![0]![0]!.rules,
    ).toHaveLength(MAX_RULES);
  });

  it("条件は 1 つずつ検査し、読めないものだけ捨てる。文字の値でないトークンの条件はすべて捨てる", () => {
    const rules = [
      { when: "equals", value: "a", ignoreCase: true, fg: "#f00", hide: false },
      { when: "gt", value: 80, bold: true },
      { when: "regex", value: "a" },
      { when: "equals", value: 3 },
      { when: "gt", value: "80" },
      { when: "gt", value: Infinity },
      { when: "lt", value: 1, ignoreCase: false },
      { when: "contains", value: "x".repeat(257) },
      { when: "starts_with", value: "b", ignoreCase: "yes" },
      { when: "contains", value: "c", fg: "nope", hide: true },
    ];
    expect(
      loadSidebarRows({ spaces: [[{ token: "workspace", rules }]] }).spaces![0]![0]!.rules,
    ).toEqual([
      { when: "equals", value: "a", ignoreCase: true, fg: "#f00", hide: false },
      { when: "gt", value: 80, bold: true },
      { when: "contains", value: "c", hide: true },
    ]);
    expect(
      loadSidebarRows({
        spaces: [[{ token: "git_status", rules: [{ when: "equals", value: "a" }] }]],
      }).spaces,
    ).toEqual([[{ token: "git_status" }]]);
    expect(loadSidebarRows({ spaces: [[{ token: "workspace", rules: [] }]] }).spaces).toEqual([
      [{ token: "workspace" }],
    ]);
  });

  it("loadRule: ignoreCase は文字の条件だけ（数の条件に付いていたら捨てる）", () => {
    expect(loadRule({ when: "gt", value: 1, ignoreCase: true })).toBeNull();
    expect(loadRule({ when: "equals", value: "x", ignoreCase: false })).toEqual({
      when: "equals",
      value: "x",
    });
  });
});

describe("保存の形（AC11・AC15）", () => {
  it("両方既定なら undefined（項目ごと消す）、片方だけならその区画だけ", () => {
    expect(serializeSidebarRows({ spaces: null, agents: null })).toBeUndefined();
    expect(serializeSidebarRows({ spaces: [[{ token: "workspace" }]], agents: null })).toEqual({
      spaces: [[{ token: "workspace" }]],
    });
    expect(serializeSidebarRows({ spaces: null, agents: [] })).toEqual({ agents: [] });
  });

  it("読み直すと同じ（往復）", () => {
    const p = {
      spaces: [
        [
          {
            token: "workspace",
            fg: "#abc",
            rules: [{ when: "gt" as const, value: 1, hide: true }],
          },
        ],
      ],
      agents: null,
    };
    expect(loadSidebarRows(serializeSidebarRows(p))).toEqual(p);
  });

  it("effectiveLayout は null なら既定", () => {
    expect(effectiveLayout({ spaces: null, agents: null }, "spaces")).toBe(DEFAULT_LAYOUTS.spaces);
    expect(effectiveLayout({ spaces: [], agents: null }, "spaces")).toEqual([]);
  });
});
