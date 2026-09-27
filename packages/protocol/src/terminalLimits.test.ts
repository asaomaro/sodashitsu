import { describe, expect, it } from "vitest";
import { ClientViewParams, PaneAttachParams, PaneAttachResizeParams } from "./messages.js";
import {
  clampTerminalSize,
  TERMINAL_CELLS_MAX,
  TERMINAL_SIZE_MAX,
  VIEW_VISIBLE_PANES_MAX,
  withinCellLimit,
} from "./terminalLimits.js";

// 20260927-server-size-input-limits：`/ws` から届く端末の大きさの上限（1 辺 4096・面積 1,000,000 セル・visible 4096 件）。

const view = (visible: unknown[]) => ({ workspaceId: "w1", tabId: "t1", visible });

describe("端末の大きさの上限の値", () => {
  it("1 辺 4096・面積 1,000,000・件数 4096（herdr と同じ。decisions D2）", () => {
    expect(TERMINAL_SIZE_MAX).toBe(4096);
    expect(TERMINAL_CELLS_MAX).toBe(1_000_000);
    expect(VIEW_VISIBLE_PANES_MAX).toBe(4096);
  });

  it("withinCellLimit は面積の上限ちょうどを通し、1 セルでも超えれば断る", () => {
    expect(withinCellLimit({ cols: 1000, rows: 1000 })).toBe(true);
    expect(withinCellLimit({ cols: 1000, rows: 1001 })).toBe(false);
  });
});

describe.each([
  [
    "pane.attach",
    (cols: number, rows: number) => PaneAttachParams.safeParse({ paneId: "p1", cols, rows }),
  ],
  [
    "pane.attach_resize",
    (cols: number, rows: number) => PaneAttachResizeParams.safeParse({ paneId: "p1", cols, rows }),
  ],
  [
    "client.view",
    (cols: number, rows: number) =>
      ClientViewParams.safeParse(view([{ paneId: "p1", cols, rows }])),
  ],
] as const)("%s の cols/rows（AC1・AC2）", (_name, parse) => {
  it("1 辺の上限ちょうど（4096×244）と下限（1×1）は通る", () => {
    expect(parse(TERMINAL_SIZE_MAX, 244).success).toBe(true);
    expect(parse(244, TERMINAL_SIZE_MAX).success).toBe(true);
    expect(parse(1, 1).success).toBe(true);
  });

  it("1 辺が上限を 1 超える・0・負・非整数は断る", () => {
    for (const [cols, rows] of [
      [TERMINAL_SIZE_MAX + 1, 24],
      [80, TERMINAL_SIZE_MAX + 1],
      [100000, 100000],
      [0, 24],
      [80, -1],
      [80.5, 24],
    ] as const) {
      expect(parse(cols, rows).success, `${cols}x${rows}`).toBe(false);
    }
  });

  it("1 辺は上限内でも面積が上限を超えれば断る（1000×1000 は通り、1000×1001 は断る）", () => {
    expect(parse(1000, 1000).success).toBe(true);
    expect(parse(1000, 1001).success).toBe(false);
    expect(parse(TERMINAL_SIZE_MAX, TERMINAL_SIZE_MAX).success).toBe(false);
  });
});

describe("client.view の visible の件数（AC3）", () => {
  const entries = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ paneId: `p${i}`, cols: 80, rows: 24 }));

  it("上限ちょうどは通り、1 件でも超えれば断る", () => {
    expect(ClientViewParams.safeParse(view(entries(VIEW_VISIBLE_PANES_MAX))).success).toBe(true);
    expect(ClientViewParams.safeParse(view(entries(VIEW_VISIBLE_PANES_MAX + 1))).success).toBe(
      false,
    );
  });

  it("1 件でも大きさが上限の外なら要求ごと断る", () => {
    const visible = [...entries(2), { paneId: "big", cols: 80, rows: TERMINAL_SIZE_MAX + 1 }];
    expect(ClientViewParams.safeParse(view(visible)).success).toBe(false);
  });
});

describe("clampTerminalSize（AC4）", () => {
  it("範囲の内側はそのまま", () => {
    expect(clampTerminalSize(80, 24)).toEqual({ cols: 80, rows: 24 });
    expect(clampTerminalSize(1000, 1000)).toEqual({ cols: 1000, rows: 1000 });
  });

  it("各辺を 1〜4096 の整数に丸める（切り捨て・NaN は 1・+∞ は上限）", () => {
    expect(clampTerminalSize(0, -5)).toEqual({ cols: 1, rows: 1 });
    expect(clampTerminalSize(80.9, 24.2)).toEqual({ cols: 80, rows: 24 });
    expect(clampTerminalSize(Number.NaN, 24)).toEqual({ cols: 1, rows: 24 });
    expect(clampTerminalSize(Number.POSITIVE_INFINITY, 10)).toEqual({
      cols: TERMINAL_SIZE_MAX,
      rows: 10,
    });
    expect(clampTerminalSize(5000, 100)).toEqual({ cols: TERMINAL_SIZE_MAX, rows: 100 });
  });

  it("面積が上限を超えれば幅を保って行を減らし、結果はスキーマを通る", () => {
    const c = clampTerminalSize(TERMINAL_SIZE_MAX, TERMINAL_SIZE_MAX);
    expect(c).toEqual({
      cols: TERMINAL_SIZE_MAX,
      rows: Math.floor(TERMINAL_CELLS_MAX / TERMINAL_SIZE_MAX),
    });
    expect(clampTerminalSize(1000, 1001)).toEqual({ cols: 1000, rows: 1000 });
    for (const [cols, rows] of [
      [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
      [4096, 4096],
      [2000, 3000],
      [1, 99999],
    ] as const) {
      const r = clampTerminalSize(cols, rows);
      expect(PaneAttachParams.safeParse({ paneId: "p1", ...r }).success, `${cols}x${rows}`).toBe(
        true,
      );
    }
  });
});
