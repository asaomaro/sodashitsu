import { describe, expect, it } from "vitest";
import {
  formatDatetime,
  loadTabBarPosition,
  loadTabBarRightEntries,
  loadTabBarRightSeparator,
  MAX_TAB_BAR_RIGHT_ENTRIES,
  MAX_TAB_BAR_SEPARATOR_CHARS,
  MAX_TAB_BAR_TEXT_CHARS,
  sanitizeTabBarText,
  type TabBarRightEntry,
} from "./tabBarRight.js";

describe("loadTabBarPosition — tab バーの位置（AC1）", () => {
  it("top・bottom はそのまま読む", () => {
    expect(loadTabBarPosition("top")).toBe("top");
    expect(loadTabBarPosition("bottom")).toBe("bottom");
  });
  it("それ以外・型違いは既定の top", () => {
    expect(loadTabBarPosition("left")).toBe("top");
    expect(loadTabBarPosition(undefined)).toBe("top");
    expect(loadTabBarPosition(null)).toBe("top");
    expect(loadTabBarPosition(1)).toBe("top");
  });
});

describe("sanitizeTabBarText — 固定文字列エントリの整形（AC3）", () => {
  it("制御文字を取り除く", () => {
    expect(sanitizeTabBarText("a\u0000b\u001fc\u007f")).toBe("abc");
  });
  it(`上限（${MAX_TAB_BAR_TEXT_CHARS}文字）で切り詰める`, () => {
    const long = "x".repeat(MAX_TAB_BAR_TEXT_CHARS + 10);
    expect(sanitizeTabBarText(long)).toHaveLength(MAX_TAB_BAR_TEXT_CHARS);
  });
  it("空文字はそのまま空文字（呼び出し側がどう扱うかは design の対象外——このモジュールは切るだけ）", () => {
    expect(sanitizeTabBarText("")).toBe("");
  });
  it("上限ちょうどにサロゲートペア（絵文字）がかかっても、孤立サロゲートを残さず丸ごと含めるか丸ごと落とす（タスク点検で発見）", () => {
    // 79 個の x + 絵文字（コードポイント換算で 80 個目）+ y×10。コードポイント単位で 80 個までを残すので、
    // 絵文字は境界ちょうどで丸ごと入り（.length は UTF-16 単位なので 79+2=81 になる）、y は全て落ちる。
    const long = "x".repeat(MAX_TAB_BAR_TEXT_CHARS - 1) + "😀" + "y".repeat(10);
    const out = sanitizeTabBarText(long);
    expect(out).toBe("x".repeat(MAX_TAB_BAR_TEXT_CHARS - 1) + "😀");
    expect(/[\uD800-\uDFFF]/.test(out)).toBe(true); // 絵文字自体はサロゲートペアを含む（正しい対）
    expect(out).not.toMatch(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u,
    ); // 孤立（対になっていない）サロゲートは無い
  });
});

describe("loadTabBarRightEntries — 右端エントリの読み込み（AC3・AC10）", () => {
  it("4種のエントリをそれぞれ読める", () => {
    const raw = [
      { kind: "zoom" },
      { kind: "hostname" },
      { kind: "datetime", format: "time" },
      { kind: "text", text: "hi" },
    ];
    expect(loadTabBarRightEntries(raw)).toEqual<TabBarRightEntry[]>([
      { kind: "zoom" },
      { kind: "hostname" },
      { kind: "datetime", format: "time" },
      { kind: "text", text: "hi" },
    ]);
  });
  it("不正な要素だけを個別に落とす（残りは生かす）", () => {
    const raw = [
      { kind: "zoom" },
      { kind: "unknown" },
      { kind: "datetime", format: "not-a-format" },
      "not an object",
      null,
      { kind: "text", text: 123 },
      { kind: "hostname" },
    ];
    expect(loadTabBarRightEntries(raw)).toEqual<TabBarRightEntry[]>([
      { kind: "zoom" },
      { kind: "hostname" },
    ]);
  });
  it(`上限（${MAX_TAB_BAR_RIGHT_ENTRIES}件）を超えた分は切り詰める`, () => {
    const raw = Array.from({ length: MAX_TAB_BAR_RIGHT_ENTRIES + 5 }, () => ({ kind: "zoom" }));
    expect(loadTabBarRightEntries(raw)).toHaveLength(MAX_TAB_BAR_RIGHT_ENTRIES);
  });
  it("上限は位置基準——先頭16件より後ろにある有効な要素は拾い直さない（タスク点検で発見）", () => {
    // 先頭10件は不正、後続10件は有効。「先頭16件だけを見る」なら、先頭16件のうち有効な6件だけが残るはず
    // （後ろの4件を走査して拾い直すと10件になってしまう——それが誤りだった実装）。
    const invalid = Array.from({ length: 10 }, () => ({ kind: "unknown" }));
    const valid = Array.from({ length: 10 }, () => ({ kind: "zoom" }));
    expect(loadTabBarRightEntries([...invalid, ...valid])).toHaveLength(6);
  });
  it("配列でなければ空", () => {
    expect(loadTabBarRightEntries("not an array")).toEqual([]);
    expect(loadTabBarRightEntries(undefined)).toEqual([]);
    expect(loadTabBarRightEntries({})).toEqual([]);
  });
  it("text エントリの値は sanitizeTabBarText を通る（制御文字除去）", () => {
    const raw = [{ kind: "text", text: "a\u0000b" }];
    expect(loadTabBarRightEntries(raw)).toEqual<TabBarRightEntry[]>([{ kind: "text", text: "ab" }]);
  });
});

describe("loadTabBarRightSeparator — 区切り文字列（AC4）", () => {
  it("文字列はそのまま（上限内）", () => {
    expect(loadTabBarRightSeparator(" · ")).toBe(" · ");
  });
  it("文字列でなければ既定の半角スペース 1 つ", () => {
    expect(loadTabBarRightSeparator(undefined)).toBe(" ");
    expect(loadTabBarRightSeparator(1)).toBe(" ");
  });
  it(`上限（${MAX_TAB_BAR_SEPARATOR_CHARS}文字）で切り詰める`, () => {
    const long = "-".repeat(MAX_TAB_BAR_SEPARATOR_CHARS + 3);
    expect(loadTabBarRightSeparator(long)).toHaveLength(MAX_TAB_BAR_SEPARATOR_CHARS);
  });
  it("制御文字を取り除く", () => {
    expect(loadTabBarRightSeparator("a\u0000b")).toBe("ab");
  });
});

describe("formatDatetime — 日時エントリの 4 プリセット（AC3）", () => {
  // 固定日時: 2026-09-22 03:04:05 ローカル
  const now = new Date(2026, 8, 22, 3, 4, 5);

  it("time: 時:分", () => {
    expect(formatDatetime("time", now)).toBe("03:04");
  });
  it("time-seconds: 時:分:秒", () => {
    expect(formatDatetime("time-seconds", now)).toBe("03:04:05");
  });
  it("date: 年-月-日", () => {
    expect(formatDatetime("date", now)).toBe("2026/09/22");
  });
  it("date-time: 日付と時刻の両方", () => {
    const out = formatDatetime("date-time", now);
    expect(out).toContain("2026/09/22");
    expect(out).toContain("03:04");
  });
});
