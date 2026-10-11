import { it, expect } from "vitest";
import { parseArgs } from "./cliArgs.js";
it("parses scoped operations and JSON call params", () => {
  expect(parseArgs(["plugin", "operations", "studio", "--tab", "abcd"])).toMatchObject({
    kind: "plugin-app",
    action: "operations",
    ref: "studio",
    tab: "abcd",
  });
  expect(
    parseArgs([
      "plugin",
      "call",
      "studio",
      "create",
      "--workspace",
      "abcd",
      "--params",
      '{"title":"新規"}',
    ]),
  ).toMatchObject({
    kind: "plugin-app",
    action: "call",
    operation: "create",
    params: { title: "新規" },
  });
});
it.each(
  [
    [],
    ["--pane", "a", "--tab", "b"],
    ["--pane", "a", "--params", "[]"],
    ["--pane", "a", "--params", "bad"],
  ].map((flags) => ({ flags })),
)("rejects missing/ambiguous target and malformed params %j", ({ flags }) => {
  expect(() => parseArgs(["plugin", "call", "studio", "create", ...flags])).toThrow();
});
