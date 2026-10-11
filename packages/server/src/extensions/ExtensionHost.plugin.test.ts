import { afterEach, it, expect } from "vitest";
import { makeHost, ext, type HostHarness } from "./hostHarness.js";
let h: HostHarness | undefined;
afterEach(async () => {
  await h?.cleanup();
  h = undefined;
});
it("routes registered app operations to the correct live extension and correlates its JSON reply", async () => {
  h = await makeHost({ tabPlugins: { w1: { extensionKey: "user:studio", display: "main" } } });
  await h.writeConfig([ext("studio")]);
  await h.host.start();
  const child = h.children[0]!;
  expect(child.lines()[0]?.["methods"]).toContain("app.register");
  child.say({
    id: "register",
    method: "app.register",
    params: {
      operations: [
        { name: "projects-list", description: "list projects", inputSchema: { type: "object" } },
      ],
    },
  });
  await h.until(() => child.lines().some((l) => l["id"] === "register"));
  expect(
    h.host.pluginOperations.list({ key: "user:studio", paneId: "p1" }).operations[0]?.name,
  ).toBe("projects-list");
  const result = h.host.pluginOperations.call({
    key: "user:studio",
    paneId: "p1",
    operation: "projects-list",
    params: {},
  });
  await h.until(() => child.lines().some((l) => l["type"] === "app.call"));
  const event = child.lines().find((l) => l["type"] === "app.call")!;
  child.say({
    method: "app.result",
    params: { callId: event["callId"], ok: true, result: { projects: [{ id: "project-1" }] } },
  });
  await expect(result).resolves.toEqual({ result: { projects: [{ id: "project-1" }] } });
});

it("supplies newly configured mobile view metadata to an existing app tab", async () => {
  h = await makeHost({ tabPlugins: { w1: { extensionKey: "user:studio", display: "main" } } });
  await h.writeConfig([
    ext("studio", { tabView: { title: "Studio", display: "main", mobileDisplay: "main-mobile" } }),
  ]);
  await h.host.start();
  const panes = h.children[0]!.lines().find((l) => l["type"] === "ext.panes")!["panes"] as {
    plugin?: { mobileDisplay?: string };
  }[];
  expect(panes.find((p) => p.plugin)?.plugin?.mobileDisplay).toBe("main-mobile");
});
