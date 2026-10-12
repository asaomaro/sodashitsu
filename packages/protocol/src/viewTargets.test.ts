import { expect, it } from "vitest";
import { ExtensionViewsSchema, viewSupportsTarget } from "./extension.js";
import { BUILTIN_VIEWS } from "./workspaceTools.js";
it("information targets are independent of placement, validated and backwards compatible", () => {
  const [pane, tab, legacy] = ExtensionViewsSchema.parse([
    { id: "pane", title: "会話", placements: ["float"], targets: ["pane"] },
    { id: "tab", title: "制作", placements: ["float", "left"], targets: ["tab"] },
    { id: "legacy", title: "旧", placements: ["right"] },
  ]);
  expect(viewSupportsTarget(pane!, "pane")).toBe(true);
  expect(viewSupportsTarget(pane!, "tab")).toBe(true);
  expect(viewSupportsTarget(tab!, "tab")).toBe(true);
  expect(viewSupportsTarget(tab!, "pane")).toBe(false);
  expect(viewSupportsTarget(legacy!, "pane")).toBe(true);
  expect(viewSupportsTarget(legacy!, "tab")).toBe(true);
  for (const targets of [[], ["pane", "pane"], ["workspace"]])
    expect(
      ExtensionViewsSchema.safeParse([{ id: "bad", title: "bad", placements: ["float"], targets }])
        .success,
    ).toBe(false);
  for (const v of BUILTIN_VIEWS) {
    expect(viewSupportsTarget(v, "pane")).toBe(v.id === "statusline");
    expect(viewSupportsTarget(v, "tab")).toBe(true);
  }
});
it("validates native terminal view definitions without enabling Web-only views", () => {
  const [web, native] = ExtensionViewsSchema.parse([
    { id: "web", title: "Web", placements: ["float"] },
    { id: "native", title: "Native", placements: ["left"], terminal: { format: "markdown" } },
  ]);
  expect(web!.terminal).toBeUndefined();
  expect(native!.terminal).toEqual({ format: "markdown" });
  expect(
    ExtensionViewsSchema.safeParse([
      { id: "bad", title: "bad", placements: ["float"], terminal: { format: "script-html" } },
    ]).success,
  ).toBe(false);
});
