import { describe, expect, it } from "vitest";
import { PaneAttachParams, TERMINAL_CELLS_MAX, TERMINAL_SIZE_MAX } from "@sodashitsu/protocol";
import { measure } from "./measure.js";

describe("measure", () => {
  it("切り捨てて cols/rows を求める", () => {
    expect(measure(800, 480, { width: 9, height: 18 })).toEqual({ cols: 88, rows: 26 });
  });

  it("割り切れないときは余りを切り捨てる", () => {
    expect(measure(805, 485, { width: 9, height: 18 })).toEqual({ cols: 89, rows: 26 });
  });

  it("枠がセルより小さくても最低 1 を返す", () => {
    expect(measure(1, 1, { width: 9, height: 18 })).toEqual({ cols: 1, rows: 1 });
    expect(measure(0, 0, { width: 9, height: 18 })).toEqual({ cols: 1, rows: 1 });
  });
});

// 20260927-server-size-input-limits の AC4。サーバのスキーマの上限の外を送らない（送ると client.view が要求ごと断られる）。
describe("measure の上限への丸め", () => {
  it("1 辺は 4096 まで（巨大な枠・異常に小さいセル・幅 0 のセル）", () => {
    expect(measure(100000, 180, { width: 9, height: 18 })).toEqual({
      cols: TERMINAL_SIZE_MAX,
      rows: 10,
    });
    expect(measure(900, 100000, { width: 9, height: 18 })).toEqual({
      cols: 100,
      rows: TERMINAL_SIZE_MAX,
    });
    expect(measure(800, 180, { width: 0, height: 18 })).toEqual({
      cols: TERMINAL_SIZE_MAX,
      rows: 10,
    });
  });

  it("面積が 1,000,000 セルを超えれば幅を保って行を減らし、結果はサーバのスキーマを通る", () => {
    const d = measure(40960, 40960, { width: 1, height: 1 });
    expect(d).toEqual({
      cols: TERMINAL_SIZE_MAX,
      rows: Math.floor(TERMINAL_CELLS_MAX / TERMINAL_SIZE_MAX),
    });
    expect(PaneAttachParams.safeParse({ paneId: "p", ...d }).success).toBe(true);
  });

  it("セルの寸法が読めない（NaN）ときは 1", () => {
    expect(measure(800, 480, { width: Number.NaN, height: 18 })).toEqual({ cols: 1, rows: 26 });
  });
});
