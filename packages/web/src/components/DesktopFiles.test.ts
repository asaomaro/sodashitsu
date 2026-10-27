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

it("ends a saved folder cancelled during hashing and does not silently send to an old peer", async () => {
  const request = vi.fn(async (p) =>
    p.action === "grant"
      ? { enabled: p.enabled, root: "/generated" }
      : p.action === "list"
        ? { entries: [] }
        : {},
  );
  const pick = vi.fn(async () => ({
    kind: "directory",
    name: "generated",
    async *values() {
      yield { kind: "file", name: "a", getFile: async () => new File(["x"], "a") };
    },
  }));
  (window as any).showDirectoryPicker = pick;
  let release!: (v: ArrayBuffer) => void;
  const digest = vi
    .spyOn(crypto.subtle, "digest")
    .mockImplementation(() => new Promise<ArrayBuffer>((r) => (release = r)));
  for (const supported of [false, true]) {
    const wrapper = mount(DesktopFiles, {
      props: {
        client: { request } as unknown as DesktopFileClient,
        canResume: true,
        canFolders: true,
        canResumeFolders: supported,
        machineId: "generated",
      },
    });
    try {
      await wrapper.get("button").trigger("click");
      await flushPromises();
      await wrapper.get('input[type="checkbox"]').setValue(true);
      await wrapper
        .findAll("button")
        .find((b) => b.text() === "フォルダを選んで送信")!
        .trigger("click");
      await flushPromises();
      if (!supported) {
        expect(wrapper.text()).toContain("両端の更新が必要");
        expect(digest).not.toHaveBeenCalled();
      } else {
        expect(digest).toHaveBeenCalled();
        await wrapper
          .findAll("button")
          .find((b) => b.text() === "取り消す")!
          .trigger("click");
        release(new ArrayBuffer(32));
        await flushPromises();
        expect(wrapper.text()).toContain("取消済み");
        expect(wrapper.text()).not.toContain("転送中");
      }
      expect(
        request.mock.calls.some(
          ([p]) => p.action === "folder_resume_start" || p.action === "folder_upload_start",
        ),
      ).toBe(false);
    } finally {
      wrapper.unmount();
    }
  }
  digest.mockRestore();
  delete (window as any).showDirectoryPicker;
});
