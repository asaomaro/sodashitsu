import { describe, expect, it } from "vitest";
import { COMMAND_ID_RE, parsePopupDimension } from "./commands.js";
import { CommandPopupCloseParams, CommandRunParams, METHOD_SCHEMAS } from "./messages.js";

describe("独自コマンドの規則（20260927-custom-command-keys）", () => {
  it("id は小文字・数字・-・_ の 1〜64 文字で、先頭は小文字か数字", () => {
    for (const ok of ["a", "0", "lazygit", "my-cmd_2", "a".repeat(64)])
      expect(COMMAND_ID_RE.test(ok)).toBe(true);
    for (const ng of [
      "",
      "A",
      "Lazy",
      "-a",
      "_a",
      "a b",
      "a/b",
      "a.b",
      "a".repeat(65),
      "a\n",
      "ａ",
    ])
      expect(COMMAND_ID_RE.test(ng)).toBe(false);
  });

  it("popup の幅・高さはセル数 1〜1000 の整数か N%（1〜100）", () => {
    expect(parsePopupDimension(1)).toEqual({ kind: "cells", value: 1 });
    expect(parsePopupDimension(1000)).toEqual({ kind: "cells", value: 1000 });
    expect(parsePopupDimension("80%")).toEqual({ kind: "percent", value: 80 });
    expect(parsePopupDimension("1%")).toEqual({ kind: "percent", value: 1 });
    expect(parsePopupDimension("100%")).toEqual({ kind: "percent", value: 100 });
    for (const ng of [
      0,
      -1,
      1001,
      1.5,
      Number.NaN,
      "0%",
      "101%",
      "080%",
      "8.5%",
      " 80%",
      "80",
      "80 %",
      "%",
      null,
      undefined,
      true,
      {},
    ]) {
      expect(parsePopupDimension(ng)).toBeNull();
    }
  });

  it("command.run は id・pane・大きさだけを受け、ほかの値（コマンドの文字列など）は取り除く（AC9）", () => {
    expect(
      CommandRunParams.parse({
        commandId: "lazygit",
        paneId: "p1",
        command: "rm -rf /",
        shell: "/bin/bash",
        env: { X: "1" },
      }),
    ).toEqual({
      commandId: "lazygit",
      paneId: "p1",
    });
    expect(CommandRunParams.parse({ commandId: "g", paneId: "p1", cols: 80, rows: 24 })).toEqual({
      commandId: "g",
      paneId: "p1",
      cols: 80,
      rows: 24,
    });
    // 境界の内側（2・500）は通る
    expect(CommandRunParams.parse({ commandId: "a", paneId: "p1", cols: 2, rows: 500 })).toEqual({
      commandId: "a",
      paneId: "p1",
      cols: 2,
      rows: 500,
    });
    expect(CommandRunParams.parse({ commandId: "a", paneId: "p1", cols: 500, rows: 2 })).toEqual({
      commandId: "a",
      paneId: "p1",
      cols: 500,
      rows: 2,
    });
    expect(() => CommandRunParams.parse({ commandId: "a;b", paneId: "p1" })).toThrow();
    expect(() => CommandRunParams.parse({ commandId: "../x", paneId: "p1" })).toThrow();
    expect(() => CommandRunParams.parse({ commandId: "a", paneId: "" })).toThrow();
    expect(() => CommandRunParams.parse({ commandId: "a", paneId: "p1", cols: 1 })).toThrow();
    expect(() => CommandRunParams.parse({ commandId: "a", paneId: "p1", rows: 501 })).toThrow();
    expect(() => CommandRunParams.parse({ commandId: "a", paneId: "p1", cols: 2.5 })).toThrow();
    expect(METHOD_SCHEMAS["command.run"]).toBe(CommandRunParams);
  });

  it("command.popup_close は popupId だけ。list・reload は空の要求", () => {
    expect(CommandPopupCloseParams.parse({ popupId: "p9", commandId: "x" })).toEqual({
      popupId: "p9",
    });
    expect(() => CommandPopupCloseParams.parse({})).toThrow();
    expect(METHOD_SCHEMAS["command.list"].parse({ x: 1 })).toEqual({});
    expect(METHOD_SCHEMAS["command.reload"].parse({})).toEqual({});
  });
});
