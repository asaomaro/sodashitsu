import { describe, expect, it } from "vitest";
import { subagentStateLabel, subagentCountLabel, subagentEmptyLabel, formatSubagentElapsed, subagentsHiddenCount, subagentsMoreLabel } from "./subagents.js";

describe("formatSubagentElapsed", () => {
  const at = 1_000_000;
  it("60 秒未満は秒（切り捨て）", () => {
    expect(formatSubagentElapsed(at, at)).toBe("0秒");
    expect(formatSubagentElapsed(at, at + 999)).toBe("0秒");
    expect(formatSubagentElapsed(at, at + 1000)).toBe("1秒");
    expect(formatSubagentElapsed(at, at + 59_999)).toBe("59秒");
  });
  it("60 秒以上 60 分未満は分", () => {
    expect(formatSubagentElapsed(at, at + 60_000)).toBe("1分");
    expect(formatSubagentElapsed(at, at + 3_599_999)).toBe("59分");
  });
  it("60 分以上は時間", () => {
    expect(formatSubagentElapsed(at, at + 3_600_000)).toBe("1時間");
    expect(formatSubagentElapsed(at, at + 26 * 3_600_000)).toBe("26時間");
  });
  it("負（時計のずれ）は 0 秒", () => {
    expect(formatSubagentElapsed(at, at - 5000)).toBe("0秒");
  });
});

describe("ほか n 件", () => {
  const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `a${i}`, startedAt: 0 }));
  it("count が items より多いときだけ出す", () => {
    expect(subagentsHiddenCount({ count: 70, items: items(64) })).toBe(6);
    expect(subagentsMoreLabel({ count: 70, items: items(64) })).toBe("ほか 6 件");
    expect(subagentsMoreLabel({ count: 64, items: items(64) })).toBeNull();
    expect(subagentsMoreLabel({ count: 0, items: [] })).toBeNull();
  });
});

it("distinguishes membership, work and unknown while preserving omitted defaults",()=>{
 expect(subagentStateLabel({})).toBe("実行中");expect(subagentStateLabel({state:"working"})).toBe("実行中");
 expect(subagentStateLabel({state:"idle"})).toBe("待機中");expect(subagentStateLabel({state:"unknown"})).toBe("状態不明");
 expect(subagentCountLabel({count:2,items:[]})).toBe("サブエージェント 2 件");
 expect(subagentCountLabel({count:2,items:[],countBasis:"alive"})).toBe("サブエージェント 所属 2 件");
 expect(subagentEmptyLabel(undefined)).toContain("未取得");expect(subagentEmptyLabel({count:0,items:[],countBasis:"alive"})).toContain("所属");
 expect(subagentEmptyLabel({count:0,items:[]})).toBe("実行中のサブエージェントはありません");
});
