// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { expect, it, vi } from "vitest";
import DesktopFiles from "./DesktopFiles.vue";
import type { DesktopFileClient } from "../desktop/fileClient.js";
const entry = { name: "same.bin", directory: false, bytes: 1 };
it("keeps displayed entry operations bound to the listed folder even if the input changes", async () => {
  const request = vi.fn(async (p) => {
    if (p.action === "grant") return { enabled: p.enabled, root: "/generated" };
    if (p.action === "list") return { entries: [entry] };
    throw Error("generated stop before file access");
  });
  const wrapper = mount(DesktopFiles, {
    props: { client: { request } as unknown as DesktopFileClient },
  });
  await wrapper.get("button").trigger("click");
  await flushPromises();
  await wrapper.get('input[maxlength="4096"]').setValue("another-folder");
  await wrapper
    .findAll("button")
    .find((b) => b.text() === "ダウンロード")!
    .trigger("click");
  await flushPromises();
  expect(request).toHaveBeenCalledWith({ action: "read_start", path: "same.bin" });
  expect(request).not.toHaveBeenCalledWith({
    action: "read_start",
    path: "another-folder/same.bin",
  });
  wrapper.unmount();
});
it("ignores an older list response after another folder has been listed", async () => {
  let older!: (v: unknown) => void;
  const request = vi.fn(async (p) => {
    if (p.action === "grant") return { enabled: p.enabled, root: "/generated" };
    if (p.action === "list" && p.path === "A")
      return new Promise((resolve) => {
        older = resolve;
      });
    return { entries: [{ ...entry, name: p.path === "B" ? "new.bin" : "initial.bin" }] };
  });
  const wrapper = mount(DesktopFiles, {
    props: { client: { request } as unknown as DesktopFileClient },
  });
  await wrapper.get("button").trigger("click");
  await flushPromises();
  const input = wrapper.get('input[maxlength="4096"]'),
    refresh = wrapper.findAll("button").find((b) => b.text() === "一覧を更新")!;
  await input.setValue("A");
  await refresh.trigger("click");
  await input.setValue("B");
  await refresh.trigger("click");
  await flushPromises();
  expect(wrapper.text()).toContain("new.bin");
  older({ entries: [{ ...entry, name: "stale.bin" }] });
  await flushPromises();
  expect(wrapper.text()).toContain("new.bin");
  expect(wrapper.text()).not.toContain("stale.bin");
  wrapper.unmount();
});
