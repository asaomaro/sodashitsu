import { mount, flushPromises } from "@vue/test-utils";
import { expect, it, vi } from "vitest";
import { ConnectionKey } from "../injection.js";
import PluginPackages from "./PluginPackages.vue";
it("only registers after reviewing the discovered snapshot and transmits its digest", async () => {
  const candidate = {
    key: "a".repeat(64),
    digest: "b".repeat(64),
    id: "demo",
    name: "Demo",
    version: "1.0.0",
    scope: "user",
    root: "/home/test",
    path: "/home/test/demo.sodaplugin",
    allow: ["script-html"],
    description: "test",
    files: 2,
  };
  const request = vi.fn(async (method: string) =>
    method === "plugin.discover" ? { candidates: [candidate] } : {},
  );
  const w = mount(PluginPackages, {
    global: { provide: { [ConnectionKey as symbol]: { request } } },
  });
  await flushPromises();
  expect(request).toHaveBeenCalledTimes(1);
  await w
    .findAll("button")
    .find((b) => b.text() === "確認して登録")!
    .trigger("click");
  expect(request).toHaveBeenCalledTimes(1);
  expect(w.get('[aria-label="パッケージ登録の確認"]').text()).toContain(candidate.digest);
  await w
    .findAll("button")
    .find((b) => b.text() === "許可して登録・有効化")!
    .trigger("click");
  await flushPromises();
  expect(request).toHaveBeenCalledWith("plugin.register", {
    key: candidate.key,
    digest: candidate.digest,
  });
  w.unmount();
});
