import { it, expect } from "vitest";
import { findMessageLine } from "./findMessageLine.js";
const buffer = (lines: string[]) => ({
  length: lines.length,
  getLine: (i: number) =>
    lines[i] === undefined ? undefined : { translateToString: () => lines[i]! },
});
it("locates wrapped messages and rejects repeats, absent text and short text", () => {
  expect(
    findMessageLine(
      buffer(["old", "> please inspect", " the plugin design", "answer"]),
      "please inspect the plugin design",
    ),
  ).toBe(1);
  expect(findMessageLine(buffer(["same message", "same message"]), "same message")).toBeNull();
  expect(findMessageLine(buffer(["another line"]), "missing message")).toBeNull();
  expect(findMessageLine(buffer(["ok"]), "ok")).toBeNull();
});
